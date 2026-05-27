import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRedditProviderConfig,
  createRedditProvider,
  demoRedditMentions,
  exportRedditMentions,
  extractTickerMentions,
  fetchRedditApiMentions,
  fetchRawRedditMentions,
  ingestRawRedditRecords,
  importRedditMentionFile,
  loadRedditMentions,
  mockRedditRows,
  normalizeRedditMentionRecord,
  normalizeRedditMentions,
  redditProviderStatuses,
  saveRedditMentions,
  summarizeRedditMentions,
  validateRedditMentionRecord,
  validateRedditMentions
} from "../src/redditSignals.js";

test("mock Reddit fetch never makes live calls", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = () => {
    fetchCalled = true;
    throw new Error("network should not be called");
  };

  try {
    const dataset = await fetchRawRedditMentions();
    const live = await fetchRawRedditMentions({ source: "live" });

    assert.equal(fetchCalled, false);
    assert.equal(dataset.mode, "mock");
    assert.equal(dataset.liveProviderCalls, false);
    assert.ok(dataset.warnings.some((warning) => /Sample Reddit ticker data/i.test(warning)));
    assert.ok(dataset.records.length >= 4);
    assert.ok(dataset.records.every((record) => /example\.test/.test(record.permalink)));
    assert.equal(live.mode, "not-configured");
    assert.equal(live.liveProviderCalls, false);
    assert.deepEqual(live.records, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("placeholder Reddit credentials stay not configured", () => {
  const config = buildRedditProviderConfig({
    REDDIT_CLIENT_ID: "your_reddit_client_id_here",
    REDDIT_CLIENT_SECRET: "client_secret_here",
    REDDIT_USER_AGENT: "placeholder",
    REDDIT_LIVE_ENABLED: "true"
  });

  assert.equal(config.configured, false);
  assert.equal(config.liveProviderCalls, false);
  assert.deepEqual(config.missingEnv, ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET", "REDDIT_USER_AGENT"]);
});

test("Reddit provider interface exposes mock and future API safely", async () => {
  const mockProvider = createRedditProvider("mock");
  const apiProvider = createRedditProvider("reddit-api", { env: {} });
  const configured = buildRedditProviderConfig({
    REDDIT_CLIENT_ID: "client-id",
    REDDIT_CLIENT_SECRET: "client-secret",
    REDDIT_USER_AGENT: "market-pulse-test",
    REDDIT_REFRESH_TOKEN: "refresh-secret"
  }, { subreddits: ["stocks", "LETFs"] });
  const statuses = redditProviderStatuses({});

  assert.equal(mockProvider.liveProviderCalls, false);
  assert.equal(apiProvider.liveProviderCalls, false);
  assert.equal((await mockProvider.getRawMentions()).mode, "mock");
  assert.equal((await apiProvider.getRawMentions()).mode, "not-configured");
  assert.equal(configured.status, "configured-not-connected");
  assert.equal(configured.oauthReady, true);
  assert.equal(configured.credentialState, "credentials-present-live-disabled");
  assert.equal(configured.liveProviderCalls, false);
  assert.equal(JSON.stringify(configured).includes("client-secret"), false);
  assert.equal(JSON.stringify(configured).includes("refresh-secret"), false);
  assert.equal(statuses.redditApi.status, "not configured");
  assert.deepEqual(statuses.redditApi.missingEnv, ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET", "REDDIT_USER_AGENT"]);
});

test("Reddit settings normalize empty subreddit config back to safe defaults", () => {
  const config = buildRedditProviderConfig({
    REDDIT_CLIENT_ID: "client-id",
    REDDIT_CLIENT_SECRET: "client-secret",
    REDDIT_USER_AGENT: "market-pulse-test",
    REDDIT_LIVE_ENABLED: "true",
    REDDIT_SUBREDDITS: "r/, ,"
  });

  assert.equal(config.liveProviderCalls, true);
  assert.equal(config.credentialState, "ready-for-live-sync");
  assert.ok(config.subreddits.includes("stocks"));
  assert.ok(config.subreddits.includes("wallstreetbets"));
});

test("Reddit API provider stays disabled until live flag is set", async () => {
  let fetchCalls = 0;
  const provider = createRedditProvider("reddit-api", {
    env: {
      REDDIT_CLIENT_ID: "client-id",
      REDDIT_CLIENT_SECRET: "client-secret",
      REDDIT_USER_AGENT: "market-pulse-test"
    },
    fetchImpl() {
      fetchCalls += 1;
      throw new Error("fetch should not run without REDDIT_LIVE_ENABLED");
    }
  });
  const report = await provider.getRawMentions();

  assert.equal(provider.configured, true);
  assert.equal(provider.liveProviderCalls, false);
  assert.equal(report.mode, "configured-not-connected");
  assert.equal(fetchCalls, 0);
});

test("Reddit API provider normalizes mocked posts and comments without storing usernames", async () => {
  const calls = [];
  const report = await fetchRedditApiMentions({
    env: {
      REDDIT_CLIENT_ID: "client-id",
      REDDIT_CLIENT_SECRET: "client-secret",
      REDDIT_USER_AGENT: "market-pulse-test",
      REDDIT_LIVE_ENABLED: "true"
    },
    settings: { subreddits: ["stocks"], whitelist: ["MU", "NVDA", "AI", "NOW"], falsePositives: ["AI", "NOW"] },
    tokenUrl: "https://auth.example/token",
    apiBaseUrl: "https://oauth.example",
    sourceUrlBase: "https://reddit.example",
    asOf: "2026-05-24T12:00:00-04:00",
    fetchImpl: redditFetchMock(calls)
  });

  assert.equal(report.ok, true);
  assert.equal(report.liveProviderCalls, true);
  assert.equal(report.status, "connected");
  assert.equal(report.rowsParsed, 2);
  assert.equal(report.mentionsImported, 3);
  assert.deepEqual(report.tickersDetected, ["MU", "NVDA"]);
  assert.ok(report.records.every((record) => record.sourceMode === "api"));
  assert.ok(report.records.every((record) => record.providerId === "reddit-api"));
  assert.ok(report.records.every((record) => record.liveProviderCalls === true));
  assert.ok(report.records.every((record) => !record.authorHandle));
  assert.ok(report.records.every((record) => record.sourceUrl.startsWith("https://reddit.example/")));
  assert.ok(report.summary.some((row) => row.ticker === "MU" && row.oneDayMentions >= 1));
  assert.ok(calls.some((url) => url.includes("/r/stocks/new")));
  assert.ok(calls.some((url) => url.includes("/r/stocks/comments")));
  assert.equal(JSON.stringify(report).includes("client-secret"), false);
});

test("Reddit API provider keeps partial rows while surfacing listing rate limits", async () => {
  const report = await fetchRedditApiMentions({
    env: {
      REDDIT_CLIENT_ID: "client-id",
      REDDIT_CLIENT_SECRET: "client-secret",
      REDDIT_USER_AGENT: "market-pulse-test",
      REDDIT_LIVE_ENABLED: "true"
    },
    settings: { subreddits: ["stocks"], whitelist: ["MU"], falsePositives: [] },
    tokenUrl: "https://auth.example/token",
    apiBaseUrl: "https://oauth.example",
    sourceUrlBase: "https://reddit.example",
    asOf: "2026-05-24T12:00:00-04:00",
    fetchImpl: async (url) => {
      const textUrl = String(url);
      if (textUrl === "https://auth.example/token") {
        return mockRedditResponse({ access_token: "reddit-access-token", token_type: "bearer", expires_in: 3600 });
      }
      if (textUrl.includes("/r/stocks/new")) {
        return mockRedditResponse({
          data: {
            children: [{
              data: {
                name: "t3_mu_partial",
                subreddit: "stocks",
                author: "do-not-store-user",
                created_utc: 1779638400,
                title: "MU partial listing survives",
                selftext: "Watching $MU while comments are unavailable.",
                score: 12,
                ups: 12,
                num_comments: 1,
                permalink: "/r/stocks/comments/mu_partial/"
              }
            }]
          }
        });
      }
      if (textUrl.includes("/r/stocks/comments")) {
        return mockRedditResponse({ error: "rate limited client-secret" }, 429);
      }
      return mockRedditResponse({ error: "unexpected endpoint" }, 404);
    }
  });

  assert.equal(report.status, "rate limited");
  assert.ok(report.records.some((record) => record.ticker === "MU"));
  assert.match(report.warnings.join(" "), /rate limited/i);
  assert.equal(JSON.stringify(report).includes("client-secret"), false);
});

test("Reddit API provider reports rate limits and errors safely", async () => {
  const report = await fetchRedditApiMentions({
    env: {
      REDDIT_CLIENT_ID: "client-id",
      REDDIT_CLIENT_SECRET: "client-secret-value-that-should-not-leak",
      REDDIT_USER_AGENT: "market-pulse-test",
      REDDIT_LIVE_ENABLED: "true"
    },
    settings: { subreddits: ["stocks"] },
    tokenUrl: "https://auth.example/token",
    apiBaseUrl: "https://oauth.example",
    sourceUrlBase: "https://reddit.example",
    fetchImpl: async () => mockRedditResponse({ error: "rate limited client-secret-value-that-should-not-leak" }, 429)
  });

  assert.equal(report.ok, false);
  assert.equal(report.status, "rate limited");
  assert.equal(report.liveProviderCalls, true);
  assert.equal(report.records.length, 0);
  assert.equal(JSON.stringify(report).includes("client-secret-value-that-should-not-leak"), false);
});

test("Reddit API provider redacts thrown live-sync errors", async () => {
  const report = await fetchRedditApiMentions({
    env: {
      REDDIT_CLIENT_ID: "client-id",
      REDDIT_CLIENT_SECRET: "client-secret-value-that-should-not-leak",
      REDDIT_USER_AGENT: "market-pulse-test",
      REDDIT_LIVE_ENABLED: "true"
    },
    settings: { subreddits: ["stocks"] },
    tokenUrl: "https://auth.example/token",
    apiBaseUrl: "https://oauth.example",
    sourceUrlBase: "https://reddit.example",
    fetchImpl: async () => {
      throw new Error("network failed client_secret=client-secret-value-that-should-not-leak Authorization: Bearer reddit-access-token-value-123456789");
    }
  });

  const text = JSON.stringify(report);
  assert.equal(report.ok, false);
  assert.equal(report.status, "error");
  assert.equal(report.liveProviderCalls, true);
  assert.equal(report.records.length, 0);
  assert.equal(text.includes("client-secret-value-that-should-not-leak"), false);
  assert.equal(text.includes("reddit-access-token-value-123456789"), false);
  assert.match(report.warnings[0], /\[redacted\]/);
});

test("ticker extraction filters common Reddit false positives", () => {
  const tickers = extractTickerMentions("I AM IN CASH NOW, CEO says AI, DD inside. I CAN BE wrong, but $MU NVDA and SOXL are actual watch tickers.");

  assert.deepEqual(tickers, ["MU", "NVDA", "SOXL"]);
  assert.equal(tickers.includes("AI"), false);
  assert.equal(tickers.includes("NOW"), false);
  assert.equal(tickers.includes("CAN"), false);
  assert.equal(tickers.includes("BE"), false);
  assert.equal(tickers.includes("ON"), false);
});

test("pre-extracted Reddit tickers still pass through false-positive filtering", () => {
  const rows = normalizeRedditMentionRecord({
    source_id: "mock-reddit-pre-extracted",
    subreddit: "stocks",
    created_utc: "2026-05-23T09:15:00-04:00",
    title: "Pre-extracted ticker list",
    body: "AI and NOW are common words here. MU is the actual ticker.",
    extractedTickers: ["AI", "NOW", "CAN", "MU"],
    score: 1,
    permalink: "https://example.test/reddit/pre-extracted",
    sentiment: "neutral"
  }, { asOf: "2026-05-23T12:00:00-04:00" });

  assert.deepEqual(rows.map((row) => row.ticker), ["MU"]);
});

test("explicit cashtags and raw provider tickers still respect false-positive filtering", () => {
  const cashtags = extractTickerMentions("$AI $NOW $MU", { whitelist: ["AI", "NOW", "MU"] });
  const rawTickerRows = normalizeRedditMentionRecord({
    source_id: "mock-reddit-raw-ai",
    subreddit: "stocks",
    created_utc: "2026-05-23T09:15:00-04:00",
    ticker: "AI",
    title: "AI is a theme here, not a ticker signal",
    body: "No approved ticker appears in this record.",
    score: 4,
    permalink: "https://example.test/reddit/raw-ai",
    sentiment: "neutral"
  }, {
    asOf: "2026-05-23T12:00:00-04:00",
    whitelist: ["AI", "MU"]
  });

  assert.deepEqual(cashtags, ["MU"]);
  assert.deepEqual(rawTickerRows, []);
});

test("Reddit normalization preserves source fields and extracted ticker arrays", () => {
  const rows = normalizeRedditMentionRecord({
    source_id: "mock-reddit-test",
    subreddit: "stocks",
    created_utc: "2026-05-23T09:15:00-04:00",
    title: "MU and NVDA thread",
    body: "Watching $MU and NVDA, but AI and NOW should not become tickers.",
    score: 11,
    upvotes: 11,
    num_comments: 5,
    permalink: "https://example.test/reddit/test",
    sentiment: "bullish",
    is_rumor: true,
    cites_primary_source: false
  }, { asOf: "2026-05-23T12:00:00-04:00" });

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.ticker), ["MU", "NVDA"]);
  assert.ok(rows.every((row) => row.sourceId === "mock-reddit-test"));
  assert.ok(rows.every((row) => row.createdAt === "2026-05-23T13:15:00.000Z"));
  assert.ok(rows.every((row) => row.sourceUrl === "https://example.test/reddit/test"));
  assert.ok(rows.every((row) => row.extractedTickers.includes("MU") && row.extractedTickers.includes("NVDA")));
  assert.ok(rows.every((row) => row.sentimentPlaceholder.includes("Placeholder")));
});

test("Reddit mention summaries produce 1d, 7d, 30d, and growth counts", () => {
  const records = normalizeRedditMentions(mockRedditRows(), { asOf: "2026-05-23T12:00:00-04:00" });
  const summary = summarizeRedditMentions(records, { asOf: "2026-05-23T12:00:00-04:00" });
  const mu = summary.find((row) => row.ticker === "MU");
  const crdo = summary.find((row) => row.ticker === "CRDO");

  assert.equal(mu.oneDayMentions, 1);
  assert.equal(mu.sevenDayMentions, 1);
  assert.equal(mu.thirtyDayMentions, 1);
  assert.equal(mu.mentionGrowth, 1);
  assert.equal(crdo.oneDayMentions, 0);
  assert.equal(crdo.sevenDayMentions, 0);
  assert.equal(crdo.thirtyDayMentions, 1);
  assert.equal(mu.mentionAcceleration, mu.mentionGrowth);
  assert.equal(mu.mentionAccelerationLabel, "New today");
  assert.match(mu.mentionAccelerationDetail, /1 mention in 1d, 1 in 7d/);
  assert.equal(crdo.mentionAccelerationLabel, "Quiet");
});

test("local Reddit-like JSON import normalizes posts and filters false positives", () => {
  const report = importRedditMentionFile(JSON.stringify({
    data: {
      children: [
        {
          data: {
            id: "t3_mu_liveish",
            subreddit: "stocks",
            author: "local_user",
            created_utc: 1779534000,
            title: "MU and NVDA discussed in AI memory thread",
            selftext: "Watching $MU and NVDA. AI and NOW are words here, not ticker signals.",
            ups: 50,
            num_comments: 12,
            permalink: "https://example.test/r/stocks/comments/mu_liveish",
            sentiment: "bullish"
          }
        }
      ]
    }
  }), {
    fileName: "reddit-api-shaped.json",
    asOf: "2026-05-23T12:00:00-04:00",
    settings: { whitelist: ["MU", "NVDA", "AI", "NOW"], falsePositives: ["AI", "NOW"], subreddits: ["stocks"] }
  });

  assert.equal(report.ok, true);
  assert.equal(report.liveProviderCalls, false);
  assert.equal(report.rowsParsed, 1);
  assert.equal(report.mentionsImported, 2);
  assert.deepEqual(report.tickersDetected, ["MU", "NVDA"]);
  assert.deepEqual(report.subredditsDetected, ["stocks"]);
  assert.ok(report.records.every((record) => record.sourceMode === "local-file"));
  assert.ok(report.records.every((record) => !record.authorHandle));
  assert.equal(JSON.stringify(report).includes("local_user"), false);
  assert.ok(report.summary.some((row) => row.ticker === "MU" && row.thirtyDayMentions === 1));
});

test("local Reddit JSON import rejects malformed rows with useful errors", () => {
  const report = importRedditMentionFile(JSON.stringify([
    {
      id: "bad-row",
      subreddit: "",
      created_utc: "",
      title: "AI NOW CAN BE words only",
      permalink: "",
      score: 1
    }
  ]), {
    fileName: "bad-reddit.json",
    asOf: "2026-05-23T12:00:00-04:00"
  });

  assert.equal(report.ok, false);
  assert.equal(report.mentionsImported, 0);
  assert.equal(report.rejectedRows.length, 1);
  assert.ok(report.rejectedRows[0].missingFields.includes("ticker"));
  assert.ok(report.rejectedRows[0].missingFields.includes("subreddit"));
});

test("Reddit ingestion returns normalized records, validation, and summary", () => {
  const result = ingestRawRedditRecords(mockRedditRows(), { asOf: "2026-05-23T12:00:00-04:00" });

  assert.equal(result.liveProviderCalls, false);
  assert.equal(result.validation.ok, true);
  assert.ok(result.records.length >= 5);
  assert.ok(result.summary.some((row) => row.ticker === "MU"));
});

test("Reddit validation rejects malformed rows", () => {
  const result = validateRedditMentionRecord({
    id: "",
    sourceId: "",
    ticker: "",
    subreddit: "",
    createdAt: "",
    sourceUrl: "not-a-url",
    text: "",
    extractedTickers: [],
    sentiment: "hype",
    score: -1,
    upvotes: -1,
    commentCount: -1,
    credibilityScore: 1.2,
    engagementScore: -2,
    isRumor: "yes",
    citesPrimarySource: "no",
    detectedAt: ""
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("sourceId")));
  assert.ok(result.errors.some((error) => error.includes("ticker")));
  assert.ok(result.errors.some((error) => error.includes("extractedTickers")));
  assert.ok(result.errors.some((error) => error.includes("sentiment")));
  assert.ok(result.errors.some((error) => error.includes("score")));
  assert.ok(result.errors.some((error) => error.includes("isRumor")));
  assert.ok(result.warnings.some((warning) => warning.includes("sourceUrl should be an absolute HTTP(S) URL")));
});

test("Reddit export and storage stay local-safe", () => {
  const records = demoRedditMentions();
  const validation = validateRedditMentions(records);
  const exported = exportRedditMentions(records);
  const storage = new Map();
  const localStorageLike = {
    setItem: (key, value) => storage.set(key, value),
    getItem: (key) => storage.get(key)
  };

  assert.equal(validation.ok, true);
  assert.equal(exported.safety.includesPasswords, false);
  assert.equal(exported.safety.includesApiKeys, false);
  assert.equal(exported.safety.liveProviderCalls, false);
  assert.equal(saveRedditMentions(localStorageLike, records), true);
  assert.equal(loadRedditMentions(localStorageLike).length, records.length);
  const liveProviderRecord = {
    ...records[0],
    sourceMode: "api",
    providerId: "reddit-api",
    dataFreshness: "fresh",
    liveProviderCalls: true
  };
  const liveProviderExport = exportRedditMentions([liveProviderRecord]);
  assert.equal(liveProviderExport.safety.liveProviderCalls, false);
  assert.equal(liveProviderExport.redditMentions[0].liveProviderCalls, false);
  assert.equal(liveProviderExport.redditMentions[0].cacheStatus, "cached");
  const providerStorage = new Map();
  const providerStorageLike = {
    setItem: (key, value) => providerStorage.set(key, value),
    getItem: (key) => providerStorage.get(key)
  };
  assert.equal(saveRedditMentions(providerStorageLike, [liveProviderRecord]), true);
  const persistedProviderRows = JSON.parse([...providerStorage.values()][0]);
  assert.equal(persistedProviderRows[0].liveProviderCalls, false);
  assert.equal(persistedProviderRows[0].cacheStatus, "cached");
  const loadedProviderRows = loadRedditMentions(providerStorageLike);
  assert.equal(loadedProviderRows[0].liveProviderCalls, false);
  assert.equal(loadedProviderRows[0].cacheStatus, "cached");
  assert.equal(loadRedditMentions(null).length >= 5, true);
  assert.equal(saveRedditMentions({ setItem() { throw new Error("QuotaExceededError"); } }, records), false);
});

function redditFetchMock(calls) {
  return async function fetchImpl(url) {
    calls.push(String(url));
    const textUrl = String(url);
    if (textUrl === "https://auth.example/token") {
      return mockRedditResponse({ access_token: "reddit-access-token", token_type: "bearer", expires_in: 3600 });
    }
    if (textUrl.includes("/r/stocks/new")) {
      return mockRedditResponse({
        data: {
          children: [{
            data: {
              name: "t3_mu_nvda_post",
              subreddit: "stocks",
              author: "do-not-store-user",
              created_utc: 1779638400,
              title: "MU and NVDA discussed in AI memory thread",
              selftext: "Watching $MU and NVDA. AI and NOW are words here, not tickers.",
              score: 120,
              ups: 120,
              num_comments: 45,
              permalink: "/r/stocks/comments/mu_nvda_post/"
            }
          }]
        }
      });
    }
    if (textUrl.includes("/r/stocks/comments")) {
      return mockRedditResponse({
        data: {
          children: [{
            data: {
              name: "t1_mu_comment",
              subreddit: "stocks",
              author: "also-do-not-store",
              created_utc: 1779639000,
              link_title: "MU commentary",
              body: "MU HBM demand is the actual ticker mention. CAN and BE are false positives.",
              score: 19,
              ups: 19,
              permalink: "/r/stocks/comments/mu_nvda_post/comment/mu_comment/"
            }
          }]
        }
      });
    }
    return mockRedditResponse({ error: "unexpected endpoint" }, 404);
  };
}

function mockRedditResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload)
  };
}
