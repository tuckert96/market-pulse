import { isUsableCredentialValue, usableCredentialValue } from "./configValueSafety.js";
import { normalizeTicker, numberFrom } from "./portfolioSchema.js";

export const REDDIT_SIGNAL_STORAGE_KEY = "growthDashboardRedditMentions";
export const REDDIT_IMPORT_REPORT_STORAGE_KEY = "growthDashboardRedditImportReport";
export const REDDIT_SETTINGS_STORAGE_KEY = "growthDashboardRedditSettings";

export const DEFAULT_REDDIT_TICKER_WHITELIST = Object.freeze([
  "MU",
  "NVDA",
  "AMD",
  "SOXL",
  "UPRO",
  "VGT",
  "CRDO",
  "QQQ",
  "TQQQ",
  "AAPL",
  "MSFT",
  "AVGO",
  "TSM",
  "ASML",
  "SMH",
  "SOXX"
]);

export const COMMON_FALSE_POSITIVE_TICKERS = Object.freeze(["ON", "BE", "AI", "NOW", "ARE", "IT", "CAN"]);
export const DEFAULT_REDDIT_SUBREDDITS = Object.freeze(["stocks", "investing", "SecurityAnalysis", "ValueInvesting", "LETFs", "wallstreetbets"]);

export const REDDIT_PROVIDER_IDS = Object.freeze({
  MOCK: "mock",
  REDDIT_API: "reddit-api"
});

export const REDDIT_PROVIDER_CONFIGS = Object.freeze({
  mock: {
    id: REDDIT_PROVIDER_IDS.MOCK,
    label: "Sample Reddit mentions",
    mode: "mock",
    sourceTypes: ["social"],
    requiredEnv: [],
    optionalEnv: [],
    liveEnabled: false,
    capabilities: ["local sample posts", "ticker extraction", "mention summaries"]
  },
  redditApi: {
    id: REDDIT_PROVIDER_IDS.REDDIT_API,
    aliases: ["reddit", "reddit-api", "official-reddit-api"],
    label: "Reddit API",
    mode: "api",
    sourceTypes: ["social"],
    requiredEnv: ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET", "REDDIT_USER_AGENT"],
    optionalEnv: ["REDDIT_REFRESH_TOKEN", "REDDIT_LIVE_ENABLED", "REDDIT_SUBREDDITS", "REDDIT_POST_LIMIT", "REDDIT_COMMENT_LIMIT", "REDDIT_TTL_MINUTES"],
    liveEnabled: true,
    capabilities: ["subreddit posts", "subreddit comments", "ticker extraction", "mention summaries"]
  }
});

const SENTIMENTS = new Set(["bullish", "bearish", "mixed", "neutral", "unknown"]);

export function mockRedditRows() {
  return [
    {
      source_id: "mock-reddit-post-mu-hbm",
      subreddit: "stocks",
      created_utc: "2026-05-23T09:15:00-04:00",
      title: "MU memory bulls are watching HBM demand",
      body: "Some users are connecting MU to AI memory demand, but the thread cites no primary source yet.",
      score: 84,
      upvotes: 84,
      num_comments: 26,
      permalink: "https://example.test/reddit/stocks/mu-hbm",
      sentiment: "bullish",
      is_rumor: true,
      cites_primary_source: false
    },
    {
      source_id: "mock-reddit-comment-soxl-risk",
      subreddit: "LETFs",
      created_utc: "2026-05-22T17:20:00-04:00",
      title: "SOXL sizing after a semiconductor rally",
      comment_text: "SOXL and NVDA momentum look strong, but this is leverage and can reverse fast.",
      score: 42,
      upvotes: 42,
      num_comments: 8,
      permalink: "https://example.test/reddit/letfs/soxl-risk",
      sentiment: "mixed",
      is_rumor: false,
      cites_primary_source: false
    },
    {
      source_id: "mock-reddit-post-false-positive",
      subreddit: "investing",
      created_utc: "2026-05-21T12:05:00-04:00",
      title: "AI is everywhere now, but are we chasing noise?",
      body: "I CAN BE wrong, but IT feels like everyone is ON the same trade. Actual tickers mentioned: AMD and VGT.",
      score: 29,
      upvotes: 29,
      num_comments: 11,
      permalink: "https://example.test/reddit/investing/false-positive-demo",
      sentiment: "neutral",
      is_rumor: false,
      cites_primary_source: false
    },
    {
      source_id: "mock-reddit-post-crdo-watch",
      subreddit: "stocks",
      created_utc: "2026-05-10T10:30:00-04:00",
      title: "CRDO watchlist thread",
      body: "CRDO is being discussed as an AI networking name. Engagement is low and evidence is thin.",
      score: 12,
      upvotes: 12,
      num_comments: 3,
      permalink: "https://example.test/reddit/stocks/crdo-watch",
      sentiment: "bullish",
      is_rumor: true,
      cites_primary_source: false
    }
  ];
}

export async function fetchRawRedditMentions({ source = "mock", ...options } = {}) {
  const provider = createRedditProvider(source === "mock" ? REDDIT_PROVIDER_IDS.MOCK : REDDIT_PROVIDER_IDS.REDDIT_API, options);
  return provider.getRawMentions();
}

export function createRedditProvider(providerId = REDDIT_PROVIDER_IDS.MOCK, options = {}) {
  const id = normalizeRedditProviderId(providerId);
  const settings = normalizeRedditSettings(options.settings || options);
  if (id === REDDIT_PROVIDER_IDS.MOCK) {
    return {
      id: REDDIT_PROVIDER_IDS.MOCK,
      label: "Sample Reddit mentions",
      mode: "mock",
      configured: true,
      liveEnabled: false,
      liveProviderCalls: false,
      settings,
      getRawMentions: async () => ({
        mode: "mock",
        providerId: REDDIT_PROVIDER_IDS.MOCK,
        liveProviderCalls: false,
        warnings: ["Sample Reddit ticker data only. No scraping or live Reddit API calls were made."],
        records: mockRedditRows()
      })
    };
  }

  const config = buildRedditProviderConfig(options.env || {}, settings);
  return {
    id: REDDIT_PROVIDER_IDS.REDDIT_API,
    label: "Reddit API",
    mode: config.liveEnabled ? "api" : "config-only",
    configured: config.configured,
    liveEnabled: config.liveEnabled,
    liveProviderCalls: config.liveProviderCalls,
    settings,
    missingEnv: config.missingEnv,
    getRawMentions: async () => {
      if (!config.liveProviderCalls) {
        return {
          ok: false,
          partial: false,
          mode: config.configured ? "configured-not-connected" : "not-configured",
          providerId: REDDIT_PROVIDER_IDS.REDDIT_API,
          liveProviderCalls: false,
          warnings: [config.detail],
          records: [],
          summary: [],
          status: config.status,
          settings
        };
      }
      return fetchRedditApiMentions({
        ...options,
        settings,
        config
      });
    }
  };
}

export function redditProviderStatuses(env = {}, settings = {}) {
  const config = buildRedditProviderConfig(env, settings);
  return {
    mock: {
      id: REDDIT_PROVIDER_IDS.MOCK,
      label: "Sample Reddit mentions",
      configured: true,
      status: "mock/sample mode",
      liveEnabled: false,
      liveProviderCalls: false,
      sourceTypes: ["social"],
      subreddits: normalizeRedditSettings(settings).subreddits,
      warning: "Sample/local Reddit rows keep the pipeline testable. No live Reddit calls are active."
    },
    redditApi: {
      id: REDDIT_PROVIDER_IDS.REDDIT_API,
      label: "Reddit API",
      configured: config.configured,
      status: config.status,
      liveEnabled: config.liveEnabled,
      liveProviderCalls: config.liveProviderCalls,
      sourceTypes: ["social"],
      requiredEnv: config.requiredEnv,
      optionalEnv: config.optionalEnv,
      missingEnv: config.missingEnv,
      credentialLocation: "server-only .env",
      oauthReady: config.oauthReady,
      subreddits: config.subreddits,
      warning: config.detail
    }
  };
}

export function buildRedditProviderConfig(env = {}, settings = {}) {
  const normalizedSettings = normalizeRedditSettings({
    ...settings,
    subreddits: settings.subreddits || env.REDDIT_SUBREDDITS
  });
  const spec = REDDIT_PROVIDER_CONFIGS.redditApi;
  const missingEnv = spec.requiredEnv.filter((key) => !isUsableCredentialValue(env[key]));
  const configured = missingEnv.length === 0;
  const liveEnabled = configured && parseBoolean(env.REDDIT_LIVE_ENABLED || env.REDDIT_API_LIVE_ENABLED);
  const oauthReady = configured;
  const status = !configured ? "not configured" : liveEnabled ? "configured" : "configured-not-connected";
  const credentialState = !configured ? "missing-required-env" : liveEnabled ? "ready-for-live-sync" : "credentials-present-live-disabled";
  const label = !configured
    ? "Reddit API not configured"
    : liveEnabled
      ? "Reddit API configured for local backend sync"
      : "Reddit API configured, live sync disabled";
  return {
    selectedProvider: REDDIT_PROVIDER_IDS.REDDIT_API,
    selectedLabel: spec.label,
    configured,
    oauthReady,
    credentialState,
    liveEnabled,
    liveProviderCalls: liveEnabled,
    exposesSecretValues: false,
    status,
    label,
    detail: !configured
      ? `Add ${spec.requiredEnv.join(", ")} to local .env later. Sample/local Reddit data remains active.`
      : liveEnabled
        ? "Reddit API credentials are present and live subreddit sync is enabled through the local backend only."
        : "Reddit API credentials are detected on the local backend, but live sync remains disabled until REDDIT_LIVE_ENABLED=true.",
    requiredEnv: [...spec.requiredEnv],
    optionalEnv: [...spec.optionalEnv],
    missingEnv,
    credentialLocation: "server-only .env",
    postLimit: boundedInteger(env.REDDIT_POST_LIMIT, 25, 1, 100),
    commentLimit: boundedInteger(env.REDDIT_COMMENT_LIMIT, 25, 1, 100),
    ttlMinutes: boundedInteger(env.REDDIT_TTL_MINUTES, 15, 1, 240),
    subreddits: normalizedSettings.subreddits,
    whitelist: normalizedSettings.whitelist,
    falsePositives: normalizedSettings.falsePositives,
    capabilities: spec.capabilities
  };
}

export async function fetchRedditApiMentions(options = {}) {
  const env = options.env || {};
  const config = options.config || buildRedditProviderConfig(env, options.settings || {});
  const settings = normalizeRedditSettings({
    ...(options.settings || {}),
    subreddits: options.subreddits || config.subreddits
  });
  const asOf = options.asOf || options.now || new Date().toISOString();
  if (!config.configured || !config.liveProviderCalls) {
    return redditProviderEmptyReport({
      mode: config.configured ? "configured-not-connected" : "not-configured",
      status: config.status,
      warning: config.detail,
      settings,
      asOf
    });
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    return redditProviderEmptyReport({
      mode: "error",
      status: "error",
      warning: "No fetch implementation is available for Reddit API sync.",
      settings,
      asOf,
      liveProviderCalls: true
    });
  }

  const tokenUrl = options.tokenUrl;
  const apiBaseUrl = stripTrailingSlash(options.apiBaseUrl);
  if (!tokenUrl || !apiBaseUrl) {
    return redditProviderEmptyReport({
      mode: "error",
      status: "error",
      warning: "Reddit API endpoint configuration is missing on the local backend.",
      settings,
      asOf,
      liveProviderCalls: true
    });
  }

  const credentialHeaders = redditAuthHeaders({
    clientId: usableCredentialValue(env.REDDIT_CLIENT_ID || options.clientId),
    clientSecret: usableCredentialValue(env.REDDIT_CLIENT_SECRET || options.clientSecret),
    userAgent: usableCredentialValue(env.REDDIT_USER_AGENT || options.userAgent)
  });
  const userAgent = usableCredentialValue(env.REDDIT_USER_AGENT || options.userAgent);
  const refreshToken = usableCredentialValue(env.REDDIT_REFRESH_TOKEN || options.refreshToken);

  try {
    const tokenPayload = await fetchRedditAccessToken({
      fetchImpl,
      tokenUrl,
      credentialHeaders,
      userAgent,
      refreshToken
    });
    if (!tokenPayload.ok) {
      return redditProviderEmptyReport({
        mode: tokenPayload.status === "rate limited" ? "rate-limited" : "error",
        status: tokenPayload.status,
        warning: tokenPayload.warning,
        settings,
        asOf,
        liveProviderCalls: true
      });
    }

    const rawRows = [];
    const warnings = [];
    const listingStatuses = [];
    for (const subreddit of settings.subreddits) {
      const postRows = await fetchRedditListing({
        fetchImpl,
        apiBaseUrl,
        accessToken: tokenPayload.accessToken,
        userAgent,
        sourceUrlBase: options.sourceUrlBase,
        subreddit,
        kind: "post",
        limit: options.postLimit || config.postLimit || 25
      });
      if (postRows.warning) warnings.push(postRows.warning);
      if (postRows.status && postRows.status !== "connected") listingStatuses.push(postRows.status);
      rawRows.push(...postRows.rows);

      const commentRows = await fetchRedditListing({
        fetchImpl,
        apiBaseUrl,
        accessToken: tokenPayload.accessToken,
        userAgent,
        sourceUrlBase: options.sourceUrlBase,
        subreddit,
        kind: "comment",
        limit: options.commentLimit || config.commentLimit || 25
      });
      if (commentRows.warning) warnings.push(commentRows.warning);
      if (commentRows.status && commentRows.status !== "connected") listingStatuses.push(commentRows.status);
      rawRows.push(...commentRows.rows);
    }

    const status = redditListingRefreshStatus(listingStatuses, rawRows.length);
    const report = buildRedditProviderReport(rawRows, {
      asOf,
      settings,
      mode: "reddit-api",
      providerId: REDDIT_PROVIDER_IDS.REDDIT_API,
      providerLabel: "Reddit API",
      status,
      warnings,
      liveProviderCalls: true
    });
    return report;
  } catch (error) {
    return redditProviderEmptyReport({
      mode: "error",
      status: "error",
      warning: `Reddit API sync failed: ${sanitizeProviderMessage(error?.message || "Unknown provider error")}`,
      settings,
      asOf,
      liveProviderCalls: true
    });
  }
}

export function normalizeRedditSettings(settings = {}) {
  const subreddits = parseList(settings.subreddits, DEFAULT_REDDIT_SUBREDDITS).map(normalizeSubreddit).filter(Boolean);
  const whitelist = parseList(settings.whitelist, DEFAULT_REDDIT_TICKER_WHITELIST).map((ticker) => normalizeTicker(ticker)).filter(Boolean);
  const falsePositives = parseList(settings.falsePositives, COMMON_FALSE_POSITIVE_TICKERS).map((ticker) => normalizeTicker(ticker)).filter(Boolean);
  return {
    subreddits: subreddits.length ? unique(subreddits) : [...DEFAULT_REDDIT_SUBREDDITS],
    whitelist: whitelist.length ? unique(whitelist) : [...DEFAULT_REDDIT_TICKER_WHITELIST],
    falsePositives: falsePositives.length ? unique(falsePositives) : [...COMMON_FALSE_POSITIVE_TICKERS]
  };
}

async function fetchRedditAccessToken({ fetchImpl, tokenUrl, credentialHeaders, userAgent, refreshToken }) {
  const body = new URLSearchParams(refreshToken
    ? { grant_type: "refresh_token", refresh_token: refreshToken }
    : { grant_type: "client_credentials" });
  const response = await fetchImpl(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: credentialHeaders.authorization,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": userAgent
    },
    body: body.toString()
  });
  const text = await response.text();
  if (!response.ok) {
    return {
      ok: false,
      status: response.status === 429 ? "rate limited" : "error",
      warning: redditHttpWarning("Reddit OAuth token request", response.status, text)
    };
  }
  const payload = parseJsonPayload(text);
  const accessToken = stringFrom(payload.access_token || payload.accessToken);
  if (!accessToken) {
    return {
      ok: false,
      status: "error",
      warning: "Reddit OAuth token response did not include an access token."
    };
  }
  return {
    ok: true,
    status: "connected",
    accessToken,
    expiresIn: nonNegativeNumber(payload.expires_in, 0),
    tokenType: stringFrom(payload.token_type || "bearer")
  };
}

async function fetchRedditListing({ fetchImpl, apiBaseUrl, accessToken, userAgent, sourceUrlBase, subreddit, kind, limit }) {
  const path = kind === "comment" ? "comments" : "new";
  const url = `${apiBaseUrl}/r/${encodeURIComponent(subreddit)}/${path}?limit=${boundedInteger(limit, 25, 1, 100)}&raw_json=1`;
  const response = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": userAgent
    }
  });
  const text = await response.text();
  if (!response.ok) {
    const status = response.status === 429 ? "rate limited" : "error";
    return {
      rows: [],
      status,
      httpStatus: response.status,
      warning: redditHttpWarning(`Reddit r/${subreddit}/${path}`, response.status, text)
    };
  }
  const payload = parseJsonPayload(text);
  return {
    rows: redditRowsFromPayload(payload).map((row) => normalizeRedditApiThing(row, {
      subreddit,
      kind,
      sourceUrlBase
    })),
    status: "connected",
    warning: ""
  };
}

function redditListingRefreshStatus(statuses = [], rowCount = 0) {
  if (statuses.includes("rate limited")) return "rate limited";
  if (statuses.includes("error")) return rowCount > 0 ? "partial" : "error";
  return "connected";
}

function normalizeRedditApiThing(row = {}, options = {}) {
  const permalink = stringFrom(row.permalink || row.url);
  const absoluteSourceUrl = absoluteUrl(permalink, options.sourceUrlBase);
  const kind = options.kind === "comment" || String(row.name || "").startsWith("t1_") ? "comment" : "post";
  return pruneEmpty({
    source_id: stringFrom(row.name || row.id),
    redditId: stringFrom(row.name || row.id),
    subreddit: normalizeSubreddit(row.subreddit || options.subreddit),
    created_utc: row.created_utc || row.created || row.createdAt,
    title: kind === "comment" ? row.link_title : row.title,
    body: kind === "comment" ? "" : row.selftext || row.body || row.text,
    comment_text: kind === "comment" ? row.body || row.comment || row.text : "",
    score: row.score ?? row.ups,
    upvotes: row.ups ?? row.score,
    num_comments: kind === "comment" ? 0 : row.num_comments,
    permalink: absoluteSourceUrl,
    sourceUrl: absoluteSourceUrl,
    sentiment: "unknown",
    is_rumor: true,
    cites_primary_source: false,
    sourceMode: "api",
    providerId: REDDIT_PROVIDER_IDS.REDDIT_API,
    apiRecordKind: kind,
    liveProviderCalls: true
  });
}

function buildRedditProviderReport(rawRows = [], options = {}) {
  const rejectedRows = [];
  const records = [];
  rawRows.forEach((row, index) => {
    const normalized = normalizeRedditMentionRecord(row, {
      asOf: options.asOf,
      source: "reddit-api",
      sourceMode: "api",
      providerId: options.providerId || REDDIT_PROVIDER_IDS.REDDIT_API,
      liveProviderCalls: true,
      whitelist: options.settings.whitelist,
      falsePositives: options.settings.falsePositives
    });
    if (!normalized.length) {
      rejectedRows.push({
        rowNumber: index + 1,
        reason: "No whitelisted ticker survived extraction or required text fields are missing.",
        missingFields: redditImportMissingFields(row),
        values: redactRedditRow(row)
      });
      return;
    }
    normalized.forEach((record) => {
      const sanitized = {
        ...record,
        authorHandle: undefined,
        source: "reddit-api",
        sourceMode: "api",
        providerId: options.providerId || REDDIT_PROVIDER_IDS.REDDIT_API,
        providerLabel: options.providerLabel || "Reddit API",
        liveProviderCalls: true,
        retrievedAt: options.asOf
      };
      const validation = validateRedditMentionRecord(sanitized);
      if (validation.ok) {
        records.push(pruneEmpty(sanitized));
      } else {
        rejectedRows.push({
          rowNumber: index + 1,
          reason: validation.errors.join("; "),
          missingFields: validation.errors.map((error) => error.split(" ")[0]),
          warnings: validation.warnings,
          values: redactRedditRow(row)
        });
      }
    });
  });
  const validation = validateRedditMentions(records);
  const warnings = unique([
    ...(options.warnings || []),
    "Live Reddit rows are social-signal inputs only. No usernames are stored, and social chatter remains lower trust than primary sources."
  ]);
  return {
    ok: records.length > 0 && rejectedRows.length === 0 && validation.ok,
    partial: records.length > 0 && (rejectedRows.length > 0 || !validation.ok || warnings.length > 0),
    mode: options.mode || "reddit-api",
    providerId: options.providerId || REDDIT_PROVIDER_IDS.REDDIT_API,
    providerLabel: options.providerLabel || "Reddit API",
    sourceMode: "api",
    status: options.status || "connected",
    rowsParsed: rawRows.length,
    mentionsImported: records.length,
    rejectedRows,
    missingFields: unique(rejectedRows.flatMap((row) => row.missingFields || [])),
    tickersDetected: unique(records.map((record) => record.ticker)).sort(),
    subredditsDetected: unique(records.map((record) => record.subreddit)).sort(),
    records,
    validation,
    summary: summarizeRedditMentions(records, { asOf: options.asOf }),
    settings: options.settings,
    warnings,
    fetchedAt: options.asOf,
    dataFreshness: options.status === "connected" ? "fresh" : options.status,
    liveProviderCalls: Boolean(options.liveProviderCalls)
  };
}

function redditProviderEmptyReport({ mode, status, warning, settings, asOf, liveProviderCalls = false }) {
  return {
    ok: false,
    partial: false,
    mode,
    providerId: REDDIT_PROVIDER_IDS.REDDIT_API,
    providerLabel: "Reddit API",
    status,
    rowsParsed: 0,
    mentionsImported: 0,
    rejectedRows: [],
    missingFields: [],
    tickersDetected: [],
    subredditsDetected: [],
    records: [],
    validation: { ok: false, errors: [], warnings: warning ? [warning] : [], count: 0 },
    summary: [],
    settings,
    warnings: warning ? [warning] : [],
    fetchedAt: asOf,
    dataFreshness: status,
    liveProviderCalls
  };
}

export function importRedditMentionFile(text = "", options = {}) {
  const fileName = options.fileName || "reddit-mentions.json";
  const asOf = options.asOf || new Date().toISOString();
  const settings = normalizeRedditSettings(options.settings || options);
  const parsed = parseRedditImportJson(text, fileName);
  if (parsed.error) {
    return {
      ok: false,
      partial: false,
      mode: "local-json",
      fileName,
      fileType: "json",
      rowsParsed: 0,
      mentionsImported: 0,
      rejectedRows: [{ rowNumber: 1, reason: parsed.error, missingFields: ["json"], values: {} }],
      missingFields: ["json"],
      tickersDetected: [],
      subredditsDetected: [],
      records: [],
      validation: { ok: false, errors: [parsed.error], warnings: [], count: 0 },
      summary: [],
      liveProviderCalls: false
    };
  }

  const rejectedRows = [];
  const records = [];
  parsed.rows.forEach((row, index) => {
    const normalized = normalizeRedditMentionRecord(row, {
      asOf,
      source: "local-reddit-json",
      whitelist: settings.whitelist,
      falsePositives: settings.falsePositives
    });
    if (!normalized.length) {
      rejectedRows.push({
        rowNumber: index + 1,
        reason: "No whitelisted ticker survived extraction or required text fields are missing.",
        missingFields: redditImportMissingFields(row),
        values: redactRedditRow(row)
      });
      return;
    }
    normalized.forEach((record) => {
      const validation = validateRedditMentionRecord(record);
      if (validation.ok) {
        records.push({
          ...record,
          source: "local-reddit-json",
          sourceMode: "local-file",
          providerId: "local-json",
          liveProviderCalls: false
        });
      } else {
        rejectedRows.push({
          rowNumber: index + 1,
          reason: validation.errors.join("; "),
          missingFields: validation.errors.map((error) => error.split(" ")[0]),
          warnings: validation.warnings,
          values: redactRedditRow(row)
        });
      }
    });
  });

  const validation = validateRedditMentions(records);
  const summary = summarizeRedditMentions(records, { asOf });
  return {
    ok: records.length > 0 && rejectedRows.length === 0 && validation.ok,
    partial: records.length > 0 && (rejectedRows.length > 0 || !validation.ok),
    mode: "local-json",
    fileName,
    fileType: "json",
    rowsParsed: parsed.rows.length,
    mentionsImported: records.length,
    rejectedRows,
    missingFields: unique(rejectedRows.flatMap((row) => row.missingFields || [])),
    tickersDetected: unique(records.map((record) => record.ticker)).sort(),
    subredditsDetected: unique(records.map((record) => record.subreddit)).sort(),
    records,
    validation,
    summary,
    settings,
    liveProviderCalls: false,
    warnings: ["Local Reddit-like JSON import only. No live Reddit API calls were made."]
  };
}

export function demoRedditMentions(options = {}) {
  return normalizeRedditMentions(mockRedditRows(), {
    asOf: options.asOf || "2026-05-23T12:00:00-04:00",
    source: "mock-reddit"
  });
}

export function ingestRawRedditRecords(rawRows = [], options = {}) {
  const records = normalizeRedditMentions(rawRows, options);
  return {
    mode: options.source || "mock",
    liveProviderCalls: Boolean(options.liveProviderCalls),
    records,
    validation: validateRedditMentions(records),
    summary: summarizeRedditMentions(records, options)
  };
}

export function normalizeRedditMentions(rawRows = [], options = {}) {
  return rawRows.flatMap((row) => normalizeRedditMentionRecord(row, options));
}

export function normalizeRedditMentionRecord(raw = {}, options = {}) {
  const text = combinedText(raw);
  const rawTicker = normalizeTicker(pick(raw, ["ticker", "symbol"]));
  const rawExtracted = pick(raw, ["extractedTickers", "extracted_tickers", "tickers", "symbols"]);
  const preExtracted = Array.isArray(rawExtracted)
    ? unique(rawExtracted.map((ticker) => normalizeTicker(ticker)).filter(Boolean))
    : [];
  const extractedTickers = preExtracted.length ? filterAllowedTickerMentions(preExtracted, options) : extractTickerMentions(text, options);
  const rawTickerMatches = rawTicker ? filterAllowedTickerMentions([rawTicker], options) : [];
  const outputTickers = rawTickerMatches.length ? rawTickerMatches : extractedTickers;
  if (!outputTickers.length) return [];
  const createdAt = normalizeTimestamp(pick(raw, ["createdAt", "created_utc", "createdTimestamp", "timestamp"]));
  const asOf = options.asOf || new Date().toISOString();
  const citesPrimarySource = Boolean(raw.citesPrimarySource ?? raw.cites_primary_source ?? false);
  return outputTickers.map((ticker) => {
    const sourceId = stringFrom(pick(raw, ["sourceId", "source_id", "id", "redditId"])) || stableRedditId({ ticker, text, createdAt });
    const engagementScore = scoreEngagement(raw);
    return pruneEmpty({
      id: `${sourceId}-${ticker.toLowerCase()}`,
      sourceId,
      ticker,
      subreddit: normalizeSubreddit(pick(raw, ["subreddit", "sub"])),
      createdAt,
      title: stringFrom(pick(raw, ["title", "headline"])),
      body: stringFrom(pick(raw, ["body", "selftext", "text"])),
      commentText: stringFrom(pick(raw, ["commentText", "comment_text", "comment"])),
      text,
      score: nonNegativeNumber(pick(raw, ["score", "karma"]), 0),
      upvotes: nonNegativeNumber(pick(raw, ["upvotes", "ups", "score"]), 0),
      commentCount: nonNegativeNumber(pick(raw, ["commentCount", "num_comments", "comments"]), 0),
      permalink: stringFrom(pick(raw, ["permalink", "sourceUrl", "source_url", "url"])),
      sourceUrl: stringFrom(pick(raw, ["sourceUrl", "source_url", "permalink", "url"])),
      extractedTickers,
      sentiment: normalizeSentiment(pick(raw, ["sentiment", "sentimentPlaceholder"])),
      sentimentPlaceholder: "Placeholder only. Live sentiment scoring is not connected.",
      credibilityScore: scoreCredibility(raw),
      engagementScore,
      isRumor: Boolean(raw.isRumor ?? raw.is_rumor ?? !citesPrimarySource),
      citesPrimarySource,
      detectedAt: asOf,
      staleAfter: staleAfter(createdAt || asOf, 1),
      source: options.source || raw.source || "mock-reddit",
      sourceMode: options.sourceMode || raw.sourceMode || raw.source_mode,
      providerId: options.providerId || raw.providerId || raw.provider_id,
      dataFreshness: options.dataFreshness || raw.dataFreshness || raw.data_freshness,
      cacheStatus: options.cacheStatus || raw.cacheStatus || raw.cache_status,
      liveProviderCalls: Boolean(options.liveProviderCalls || raw.liveProviderCalls || raw.live_provider_calls),
      sourceAsOf: asOf
    });
  });
}

export function extractTickerMentions(text = "", options = {}) {
  const candidates = [];
  const cashtagPattern = /\$([A-Za-z]{1,5})(?![A-Za-z])/g;
  const wordPattern = /\b[A-Z]{1,5}\b/g;
  let match;

  while ((match = cashtagPattern.exec(text))) {
    candidates.push({ ticker: normalizeTicker(match[1]), explicit: true });
  }
  while ((match = wordPattern.exec(text))) {
    candidates.push({ ticker: normalizeTicker(match[0]), explicit: false });
  }

  return filterTickerCandidates(candidates, options);
}

function filterAllowedTickerMentions(tickers = [], options = {}) {
  return filterTickerCandidates(tickers.map((ticker) => ({ ticker: normalizeTicker(ticker), explicit: false })), options);
}

function filterTickerCandidates(candidates = [], options = {}) {
  const whitelist = new Set((options.whitelist || DEFAULT_REDDIT_TICKER_WHITELIST).map((ticker) => normalizeTicker(ticker)));
  const falsePositives = new Set((options.falsePositives || COMMON_FALSE_POSITIVE_TICKERS).map((ticker) => normalizeTicker(ticker)));
  const seen = new Set();
  return candidates
    .filter((candidate) => {
      if (!candidate.ticker || !whitelist.has(candidate.ticker)) return false;
      if (falsePositives.has(candidate.ticker)) return false;
      if (seen.has(candidate.ticker)) return false;
      seen.add(candidate.ticker);
      return true;
    })
    .map((candidate) => candidate.ticker);
}

export function summarizeRedditMentions(records = [], options = {}) {
  const asOf = new Date(options.asOf || new Date().toISOString()).getTime();
  const rows = new Map();
  records.forEach((record) => {
    const ticker = normalizeTicker(record.ticker);
    if (!ticker) return;
    const created = new Date(record.createdAt || record.detectedAt || record.sourceAsOf || 0).getTime();
    const ageDays = Number.isFinite(created) ? Math.max(0, (asOf - created) / (24 * 60 * 60 * 1000)) : 999;
    const row = rows.get(ticker) || {
      ticker,
      oneDayMentions: 0,
      sevenDayMentions: 0,
      thirtyDayMentions: 0,
      mentionGrowth: 0,
      totalEngagement: 0,
      sentiment: "unknown",
      sourceIds: []
    };
    if (ageDays <= 1) row.oneDayMentions += 1;
    if (ageDays <= 7) row.sevenDayMentions += 1;
    if (ageDays <= 30) row.thirtyDayMentions += 1;
    row.totalEngagement += Number(record.engagementScore) || 0;
    row.sourceIds.push(record.sourceId || record.id);
    row.sentiment = mergeSentiment(row.sentiment, record.sentiment);
    rows.set(ticker, row);
  });
  return [...rows.values()]
    .map((row) => ({
      ...row,
      mentionGrowth: calculateMentionGrowth(row),
      mentionAcceleration: calculateMentionGrowth(row),
      mentionAccelerationLabel: mentionAccelerationLabel(row),
      mentionAccelerationDetail: mentionAccelerationDetail(row),
      sourceIds: [...new Set(row.sourceIds.filter(Boolean))]
    }))
    .sort((a, b) => b.mentionGrowth - a.mentionGrowth || b.sevenDayMentions - a.sevenDayMentions || a.ticker.localeCompare(b.ticker));
}

export function validateRedditMentionRecord(record = {}) {
  const errors = [];
  const warnings = [];
  requireString(record.id, "id", errors);
  requireString(record.sourceId, "sourceId", errors);
  requireString(record.ticker, "ticker", errors);
  requireString(record.subreddit, "subreddit", errors);
  requireString(record.createdAt, "createdAt", errors);
  requireString(record.sourceUrl, "sourceUrl", errors);
  requireString(record.text, "text", errors);
  requireArray(record.extractedTickers, "extractedTickers", errors);
  requireKnown(record.sentiment, SENTIMENTS, "sentiment", errors);
  requireNonNegative(record.score, "score", errors);
  requireNonNegative(record.upvotes, "upvotes", errors);
  requireNonNegative(record.commentCount, "commentCount", errors);
  requireNonNegative(record.engagementScore, "engagementScore", errors);
  requireScore(record.credibilityScore, "credibilityScore", errors);
  requireBoolean(record.isRumor, "isRumor", errors);
  requireBoolean(record.citesPrimarySource, "citesPrimarySource", errors);
  requireString(record.detectedAt, "detectedAt", errors);
  if (!record.sourceUrl || !/^https?:\/\//i.test(record.sourceUrl)) {
    warnings.push("sourceUrl should be an absolute HTTP(S) URL when live Reddit API data is added.");
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function validateRedditMentions(records = []) {
  const results = records.map(validateRedditMentionRecord);
  return {
    ok: results.every((result) => result.ok),
    errors: results.flatMap((result, index) => result.errors.map((error) => `records[${index}].${error}`)),
    warnings: results.flatMap((result, index) => result.warnings.map((warning) => `records[${index}].${warning}`)),
    count: records.length
  };
}

export function exportRedditMentions(records = []) {
  const cachedRecords = persistRedditMentionCacheRecords(records);
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    redditMentions: cachedRecords,
    safety: {
      includesPasswords: false,
      includesApiKeys: false,
      liveProviderCalls: false,
      note: "Reddit mention export contains normalized local/cache social-signal records. Social data is low trust and not investment advice."
    }
  };
}

export function persistRedditMentionCacheRecords(records = [], fallbackFreshness = "cached") {
  return normalizeRedditMentions(records).map((record) => {
    if (!isProviderBackedRedditRecord(record)) return record;
    const freshness = persistedRedditFreshness(record, fallbackFreshness);
    return pruneEmpty({
      ...record,
      dataFreshness: freshness,
      cacheStatus: freshness,
      liveProviderCalls: false
    });
  });
}

export function saveRedditMentions(storage, records = [], key = REDDIT_SIGNAL_STORAGE_KEY) {
  if (!storage?.setItem) return false;
  try {
    storage.setItem(key, JSON.stringify(persistRedditMentionCacheRecords(records)));
    return true;
  } catch {
    return false;
  }
}

export function loadRedditMentions(storage, key = REDDIT_SIGNAL_STORAGE_KEY) {
  try {
    const stored = storage?.getItem ? JSON.parse(storage.getItem(key) || "null") : null;
    return Array.isArray(stored) && stored.length ? persistRedditMentionCacheRecords(stored) : demoRedditMentions();
  } catch {
    return demoRedditMentions();
  }
}

function isProviderBackedRedditRecord(record = {}) {
  return Boolean(
    record.liveProviderCalls ||
    record.sourceMode === "api" ||
    record.providerId === REDDIT_PROVIDER_IDS.REDDIT_API
  );
}

function persistedRedditFreshness(record = {}, fallbackFreshness = "cached") {
  const statusText = `${record.dataFreshness || ""} ${record.cacheStatus || ""} ${record.status || ""}`.toLowerCase();
  if (/stale|expired|error|failed|rate[-\s]?limited|429/.test(statusText)) return "stale";
  if (/cached|cache/.test(statusText)) return "cached";
  return fallbackFreshness;
}

function combinedText(raw = {}) {
  return [
    pick(raw, ["title", "headline"]),
    pick(raw, ["body", "selftext", "text", "body_html"]),
    pick(raw, ["commentText", "comment_text", "comment", "commentBody"])
  ]
    .filter(Boolean)
    .map((value) => String(value))
    .join("\n")
    .trim();
}

function pick(raw, keys) {
  const lookup = normalizedKeyLookup(raw);
  for (const key of keys) {
    if (raw[key] !== undefined && raw[key] !== null && raw[key] !== "") return raw[key];
    const normalized = normalizeObjectKey(key);
    if (lookup[normalized] !== undefined && lookup[normalized] !== null && lookup[normalized] !== "") return lookup[normalized];
  }
  return "";
}

function parseList(value, fallback = []) {
  if (Array.isArray(value)) return value.map((item) => stringFrom(item)).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
  }
  return [...fallback];
}

function parseBoolean(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function boundedInteger(value, fallback, min, max) {
  const numeric = Math.trunc(Number(value));
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function stringFrom(value) {
  return String(value || "").trim();
}

function normalizeSubreddit(value) {
  return stringFrom(value).replace(/^r\//i, "");
}

function normalizeTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value < 10_000_000_000 ? value * 1000 : value;
    return new Date(milliseconds).toISOString();
  }
  const text = stringFrom(value);
  if (!text) return "";
  if (/^\d+(\.\d+)?$/.test(text)) {
    const numeric = Number(text);
    const milliseconds = numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    return new Date(milliseconds).toISOString();
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toISOString();
}

function normalizeSentiment(value) {
  const sentiment = stringFrom(value).toLowerCase();
  return SENTIMENTS.has(sentiment) ? sentiment : "unknown";
}

function nonNegativeNumber(value, fallback = 0) {
  const numeric = numberFrom(value, fallback);
  return Math.max(0, numeric);
}

function scoreEngagement(raw = {}) {
  const score = nonNegativeNumber(pick(raw, ["score", "upvotes", "ups"]), 0);
  const comments = nonNegativeNumber(pick(raw, ["commentCount", "num_comments", "comments"]), 0);
  return Math.round((score + comments * 2) * 100) / 100;
}

function scoreCredibility(raw = {}) {
  if (raw.citesPrimarySource || raw.cites_primary_source) return 0.55;
  if (raw.isRumor || raw.is_rumor) return 0.2;
  return 0.32;
}

function staleAfter(createdAt, days) {
  const time = new Date(createdAt).getTime();
  if (!Number.isFinite(time)) return "";
  return new Date(time + days * 24 * 60 * 60 * 1000).toISOString();
}

function calculateMentionGrowth(row) {
  const priorDailyRate = Math.max(0, (row.sevenDayMentions - row.oneDayMentions) / 6);
  if (!priorDailyRate && row.oneDayMentions) return 1;
  if (!priorDailyRate) return 0;
  return Math.round(((row.oneDayMentions - priorDailyRate) / priorDailyRate) * 100) / 100;
}

function mentionAccelerationLabel(row = {}) {
  const acceleration = calculateMentionGrowth(row);
  if (row.oneDayMentions > 0 && row.sevenDayMentions === row.oneDayMentions) return "New today";
  if (acceleration >= 1) return "Surging";
  if (acceleration >= 0.25) return "Accelerating";
  if (acceleration <= -0.5) return "Cooling";
  if (row.sevenDayMentions > 0) return "Steady";
  return "Quiet";
}

function mentionAccelerationDetail(row = {}) {
  const acceleration = calculateMentionGrowth(row);
  const formatted = acceleration > 0 ? `+${Math.round(acceleration * 100)}%` : `${Math.round(acceleration * 100)}%`;
  return `${mentionAccelerationLabel(row)}: ${row.oneDayMentions || 0} mention${row.oneDayMentions === 1 ? "" : "s"} in 1d, ${row.sevenDayMentions || 0} in 7d (${formatted} vs prior daily pace).`;
}

function mergeSentiment(existing, next) {
  if (!next || next === "unknown") return existing;
  if (existing === "unknown") return next;
  return existing === next ? existing : "mixed";
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeRedditProviderId(value = "") {
  const normalized = String(value || "").trim();
  if (!normalized || normalized === REDDIT_PROVIDER_IDS.MOCK) return REDDIT_PROVIDER_IDS.MOCK;
  const lowered = normalized.toLowerCase();
  if (lowered === REDDIT_PROVIDER_IDS.REDDIT_API || REDDIT_PROVIDER_CONFIGS.redditApi.aliases.includes(lowered)) return REDDIT_PROVIDER_IDS.REDDIT_API;
  return REDDIT_PROVIDER_IDS.REDDIT_API;
}

function parseRedditImportJson(text = "", fileName = "reddit-mentions.json") {
  try {
    const payload = JSON.parse(String(text || "null"));
    const rows = redditRowsFromPayload(payload);
    if (!rows.length) return { rows: [], error: `${fileName}: JSON did not contain Reddit-like post/comment records.` };
    return { rows, error: "" };
  } catch (error) {
    return { rows: [], error: `${fileName}: invalid JSON - ${sanitizeProviderMessage(error?.message || "Invalid JSON.")}` };
  }
}

function redditRowsFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.redditMentions)) return payload.redditMentions;
  if (Array.isArray(payload.records)) return payload.records;
  if (Array.isArray(payload.posts)) return payload.posts;
  if (Array.isArray(payload.comments)) return payload.comments;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.data?.children)) {
    return payload.data.children.map((child) => child?.data || child).filter(Boolean);
  }
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

function redditImportMissingFields(row = {}) {
  const missing = [];
  if (!normalizeSubreddit(pick(row, ["subreddit", "sub"]))) missing.push("subreddit");
  if (!normalizeTimestamp(pick(row, ["createdAt", "created_utc", "createdTimestamp", "timestamp"]))) missing.push("createdAt");
  if (!stringFrom(pick(row, ["sourceUrl", "source_url", "permalink", "url"]))) missing.push("sourceUrl");
  if (!combinedText(row)) missing.push("text");
  const rawTicker = normalizeTicker(pick(row, ["ticker", "symbol"]));
  const rawExtracted = pick(row, ["extractedTickers", "extracted_tickers", "tickers", "symbols"]);
  const extracted = Array.isArray(rawExtracted) ? rawExtracted : extractTickerMentions(combinedText(row));
  if (!rawTicker && !extracted.length) missing.push("ticker");
  return missing.length ? missing : ["whitelistedTicker"];
}

function normalizedKeyLookup(raw = {}) {
  if (!raw || typeof raw !== "object") return {};
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => [normalizeObjectKey(key), value]));
}

function normalizeObjectKey(key = "") {
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function stableRedditId(parts) {
  return `reddit-${stableToken([parts.ticker, parts.createdAt, parts.text].join("-"))}`;
}

function stableToken(value) {
  return String(value || "mention")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "mention";
}

function redditAuthHeaders({ clientId, clientSecret, userAgent }) {
  const credentials = `${stringFrom(clientId)}:${stringFrom(clientSecret)}`;
  const encoded = globalThis.Buffer?.from
    ? globalThis.Buffer.from(credentials).toString("base64")
    : globalThis.btoa(credentials);
  return {
    authorization: `Basic ${encoded}`,
    userAgent
  };
}

function parseJsonPayload(text = "") {
  try {
    return JSON.parse(text || "{}");
  } catch {
    return {};
  }
}

function redditHttpWarning(context, status, text) {
  const sanitized = sanitizeProviderMessage(text || "");
  if (status === 429) return `${context} was rate limited by the provider.`;
  if (status === 401 || status === 403) return `${context} was not authorized. Check local Reddit API credentials and app permissions.`;
  return `${context} failed with HTTP ${status}${sanitized ? `: ${sanitized}` : ""}`;
}

function sanitizeProviderMessage(message = "") {
  return String(message || "")
    .replace(/[A-Za-z0-9_-]{24,}/g, "[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]")
    .replace(/(access[_-]?token|refresh[_-]?token|client[_-]?secret|api[_-]?key|apikey|password|cookie|authorization|session(?:[_-]?id)?)["':=\s]+[^"',\s]+/gi, "$1 [redacted]")
    .replace(/(accessToken|refreshToken|clientSecret|apiKey)["':=\s]+[^"',\s]+/g, "$1 [redacted]")
    .slice(0, 240);
}

function stripTrailingSlash(value = "") {
  return stringFrom(value).replace(/\/+$/g, "");
}

function absoluteUrl(value = "", base = "") {
  const text = stringFrom(value);
  if (/^https?:\/\//i.test(text)) return text;
  const normalizedBase = stripTrailingSlash(base);
  if (!text || !normalizedBase) return text;
  return `${normalizedBase}${text.startsWith("/") ? "" : "/"}${text}`;
}

function redactRedditRow(row = {}) {
  const secretKeyPattern = /(api[_-]?key|client[_-]?secret|secret|token|refresh[_-]?token|password|cookie|authorization|session)/i;
  const secretValuePattern = /(access[_-]?token|refresh[_-]?token|client[_-]?secret|api[_-]?key|apikey|password|cookie|authorization|session(?:[_-]?id)?)["':=\s]+[^"',\s]+/gi;
  const camelSecretValuePattern = /(accessToken|refreshToken|clientSecret|apiKey)["':=\s]+[^"',\s]+/g;
  const personalKeyPattern = /^(author|authorHandle|user|user_name|username)$/i;
  const copy = {};
  Object.entries(row || {}).forEach(([key, value]) => {
    if (personalKeyPattern.test(key) || secretKeyPattern.test(key)) return;
    copy[key] = typeof value === "string"
      ? value.replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]").replace(secretValuePattern, "$1 [redacted]").replace(camelSecretValuePattern, "$1 [redacted]").slice(0, 240)
      : value;
  });
  return copy;
}

function requireString(value, label, errors) {
  if (!stringFrom(value)) errors.push(`${label} is required`);
}

function requireArray(value, label, errors) {
  if (!Array.isArray(value) || !value.length) errors.push(`${label} must be a non-empty array`);
}

function requireKnown(value, allowed, label, errors) {
  if (!allowed.has(value)) errors.push(`${label} must be one of ${[...allowed].join(", ")}`);
}

function requireScore(value, label, errors) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1) errors.push(`${label} must be a number from 0 to 1`);
}

function requireNonNegative(value, label, errors) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) errors.push(`${label} must be a non-negative number`);
}

function requireBoolean(value, label, errors) {
  if (typeof value !== "boolean") errors.push(`${label} must be boolean`);
}

function pruneEmpty(record) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => {
      if (Array.isArray(value)) return value.length > 0;
      if (value && typeof value === "object") return Object.keys(value).length > 0;
      return value !== undefined && value !== null && value !== "";
    })
  );
}
