import test from "node:test";
import assert from "node:assert/strict";
import {
  buildXProviderConfig,
  createXUpdatesProvider,
  extractXTickerMentions,
  fetchRawXUpdates,
  fetchXApiUpdates,
  mockXUpdateRows,
  normalizeXUpdates,
  xProviderStatuses
} from "../src/xUpdatesProvider.js";

test("mock X updates never make live calls", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = () => {
    fetchCalled = true;
    throw new Error("network should not be called");
  };

  try {
    const dataset = await fetchRawXUpdates();
    const live = await fetchRawXUpdates({ source: "live" });

    assert.equal(fetchCalled, false);
    assert.equal(dataset.mode, "mock");
    assert.equal(dataset.liveProviderCalls, false);
    assert.ok(dataset.records.length >= 3);
    assert.ok(dataset.records.every((record) => /example\.test/.test(record.sourceUrl)));
    assert.equal(live.mode, "not-configured");
    assert.equal(live.liveProviderCalls, false);
    assert.deepEqual(live.records, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("placeholder X bearer token stays not configured", () => {
  const config = buildXProviderConfig({
    X_BEARER_TOKEN: "your_x_bearer_token_here",
    X_LIVE_ENABLED: "true"
  });

  assert.equal(config.configured, false);
  assert.equal(config.liveProviderCalls, false);
  assert.deepEqual(config.missingEnv, ["X_BEARER_TOKEN"]);
});

test("X API provider stays disabled until live flag is set", async () => {
  let fetchCalls = 0;
  const provider = createXUpdatesProvider("x-api", {
    env: { X_BEARER_TOKEN: "x-bearer-secret" },
    fetchImpl() {
      fetchCalls += 1;
      throw new Error("fetch should not run without X_LIVE_ENABLED");
    }
  });
  const report = await provider.getRawUpdates();
  const statuses = xProviderStatuses({ X_BEARER_TOKEN: "x-bearer-secret" });

  assert.equal(provider.configured, true);
  assert.equal(provider.liveProviderCalls, false);
  assert.equal(report.mode, "configured-not-connected");
  assert.equal(fetchCalls, 0);
  assert.equal(statuses.xApi.status, "configured-not-connected");
  assert.equal(JSON.stringify(statuses).includes("x-bearer-secret"), false);
});

test("X API provider normalizes mocked recent-search rows without storing handles or bearer token", async () => {
  const calls = [];
  const report = await fetchXApiUpdates({
    env: {
      X_BEARER_TOKEN: "x-bearer-secret-value",
      X_LIVE_ENABLED: "true"
    },
    settings: { whitelist: ["MU", "NVDA", "AI", "NOW"], falsePositives: ["AI", "NOW"] },
    apiBaseUrl: "https://x.example/2",
    asOf: "2026-05-24T12:00:00-04:00",
    fetchImpl: xFetchMock(calls)
  });

  assert.equal(report.ok, true);
  assert.equal(report.liveProviderCalls, true);
  assert.equal(report.status, "connected");
  assert.equal(report.rowsParsed, 1);
  assert.equal(report.updatesImported, 2);
  assert.deepEqual(report.tickersDetected, ["MU", "NVDA"]);
  assert.ok(report.records.every((record) => record.sourceMode === "api"));
  assert.ok(report.records.every((record) => record.providerId === "x-api"));
  assert.ok(report.records.every((record) => record.liveProviderCalls === true));
  assert.ok(report.records.every((record) => record.sourceLabel === "X API recent update"));
  assert.ok(report.records.every((record) => !record.text.includes("@actual_user")));
  assert.ok(report.records.every((record) => record.sourceUrl.startsWith("https://x.com/i/web/status/")));
  assert.ok(calls.some((call) => call.url.includes("/tweets/search/recent")));
  assert.ok(calls.every((call) => call.authorization === "Bearer x-bearer-secret-value"));
  assert.equal(JSON.stringify(report).includes("x-bearer-secret-value"), false);
});

test("X API provider honors env query and whitelist settings", async () => {
  let query = "";
  const provider = createXUpdatesProvider("x-api", {
    env: {
      X_BEARER_TOKEN: "x-bearer-secret-value",
      X_LIVE_ENABLED: "true",
      X_QUERY: "$CRDO lang:en -is:retweet",
      X_TICKER_WHITELIST: "CRDO"
    },
    apiBaseUrl: "https://x.example/2",
    fetchImpl: async (url) => {
      query = new URL(url).searchParams.get("query") || "";
      return mockXResponse({
        data: [{
          id: "1794000000000000100",
          text: "$CRDO commentary with $MU nearby should only import the configured whitelist.",
          created_at: "2026-05-24T13:20:00.000Z",
          public_metrics: { like_count: 10, repost_count: 1, reply_count: 1, quote_count: 0 }
        }],
        meta: { result_count: 1 }
      });
    }
  });

  const report = await provider.getRawUpdates();

  assert.equal(query, "$CRDO lang:en -is:retweet");
  assert.deepEqual(report.tickersDetected, ["CRDO"]);
  assert.equal(JSON.stringify(report).includes("x-bearer-secret-value"), false);
});

test("X API provider reports rate limits and errors safely", async () => {
  const report = await fetchXApiUpdates({
    env: {
      X_BEARER_TOKEN: "x-bearer-secret-value",
      X_LIVE_ENABLED: "true"
    },
    apiBaseUrl: "https://x.example/2",
    fetchImpl: async () => mockXResponse({ error: "rate limited Authorization: Bearer x-bearer-secret-value" }, 429)
  });

  assert.equal(report.ok, false);
  assert.equal(report.status, "rate limited");
  assert.equal(report.liveProviderCalls, true);
  assert.equal(report.records.length, 0);
  assert.equal(JSON.stringify(report).includes("x-bearer-secret-value"), false);
});

test("X ticker extraction prefers cashtags and filters common false positives", () => {
  const tickers = extractXTickerMentions("AI is everywhere NOW but $MU, $NVDA, and VGT are the actual allowed names.", {
    whitelist: ["AI", "NOW", "MU", "NVDA", "VGT"],
    falsePositives: ["AI", "NOW"]
  });

  assert.deepEqual(tickers, ["MU", "NVDA", "VGT"]);
});

test("mock X rows normalize into source-labeled records", async () => {
  const provider = createXUpdatesProvider("mock", {
    asOf: "2026-05-24T12:00:00-04:00",
    settings: { whitelist: ["MU", "NVDA", "AMD", "VGT", "QQQ"] }
  });
  const report = await provider.getRawUpdates();

  assert.equal(report.liveProviderCalls, false);
  assert.equal(report.mode, "mock");
  assert.ok(mockXUpdateRows().length >= 3);
  assert.ok(report.records.every((record) => record.sourceMode === "mock"));
  assert.ok(report.records.every((record) => record.sourceLabel === "Sample X update"));
  assert.ok(report.summary.some((row) => row.ticker === "MU"));
});

test("already-normalized live X rows keep source labels after normalization", () => {
  const [record] = normalizeXUpdates([{
    sourceId: "1794000000000000001",
    ticker: "MU",
    text: "$MU live row returned by the local backend.",
    createdAt: "2026-05-24T13:15:00.000Z",
    sourceMode: "api",
    providerId: "x-api",
    providerLabel: "X API",
    sourceLabel: "X API recent update",
    liveProviderCalls: true
  }]);

  assert.equal(record.sourceMode, "api");
  assert.equal(record.sourceLabel, "X API recent update");
  assert.equal(record.liveProviderCalls, true);
});

function xFetchMock(calls) {
  return async function fetchImpl(url, options = {}) {
    calls.push({ url: String(url), authorization: options.headers?.Authorization || "" });
    return mockXResponse({
      data: [{
        id: "1794000000000000001",
        text: "@actual_user Watching $MU and $NVDA. AI and NOW are just words here.",
        created_at: "2026-05-24T13:15:00.000Z",
        public_metrics: {
          like_count: 40,
          repost_count: 6,
          reply_count: 3,
          quote_count: 1
        },
        author_id: "do-not-store-author-id"
      }],
      meta: { result_count: 1 }
    });
  };
}

function mockXResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload)
  };
}
