import { isUsableCredentialValue, usableCredentialValue } from "./configValueSafety.js";
import { normalizeTicker, numberFrom } from "./portfolioSchema.js";

export const X_UPDATES_PROVIDER_IDS = Object.freeze({
  MOCK: "mock",
  X_API: "x-api"
});

export const X_UPDATES_STORAGE_KEY = "growthDashboardXUpdates";
export const X_UPDATES_IMPORT_REPORT_STORAGE_KEY = "growthDashboardXUpdateImportReport";

export const DEFAULT_X_TICKER_WHITELIST = Object.freeze([
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

export const COMMON_X_FALSE_POSITIVE_TICKERS = Object.freeze(["ON", "BE", "AI", "NOW", "ARE", "IT", "CAN"]);

export const X_UPDATES_PROVIDER_CONFIGS = Object.freeze({
  mock: {
    id: X_UPDATES_PROVIDER_IDS.MOCK,
    label: "Sample X updates",
    mode: "mock",
    sourceTypes: ["social"],
    requiredEnv: [],
    optionalEnv: [],
    liveEnabled: false,
    capabilities: ["local sample posts", "cashtag extraction", "source-labeled social updates"]
  },
  xApi: {
    id: X_UPDATES_PROVIDER_IDS.X_API,
    aliases: ["x", "x-api", "twitter", "twitter-api"],
    label: "X API",
    mode: "api",
    sourceTypes: ["social"],
    requiredEnv: ["X_BEARER_TOKEN"],
    optionalEnv: ["X_LIVE_ENABLED", "X_QUERY", "X_TICKER_WHITELIST", "X_MAX_RESULTS", "X_TTL_MINUTES", "X_API_BASE_URL"],
    liveEnabled: true,
    capabilities: ["recent search", "cashtag extraction", "source-labeled social updates"]
  }
});

export function mockXUpdateRows() {
  return [
    {
      id: "mock-x-mu-hbm",
      text: "Watching $MU HBM demand chatter. Needs primary-source confirmation before it matters.",
      created_at: "2026-05-24T09:25:00-04:00",
      public_metrics: { like_count: 34, repost_count: 6, reply_count: 3, quote_count: 2 },
      url: "https://example.test/x/mu-hbm"
    },
    {
      id: "mock-x-nvda-amd-ai",
      text: "$NVDA and $AMD are moving with AI sentiment, but this sample row is not a live X post.",
      created_at: "2026-05-24T10:40:00-04:00",
      public_metrics: { like_count: 51, repost_count: 8, reply_count: 7, quote_count: 1 },
      url: "https://example.test/x/nvda-amd"
    },
    {
      id: "mock-x-false-positive",
      text: "AI is everywhere NOW, but actual cashtags here are $VGT and $QQQ.",
      created_at: "2026-05-23T16:10:00-04:00",
      public_metrics: { like_count: 12, repost_count: 1, reply_count: 2, quote_count: 0 },
      url: "https://example.test/x/vgt-qqq"
    }
  ];
}

export async function fetchRawXUpdates({ source = "mock", ...options } = {}) {
  const provider = createXUpdatesProvider(source === "mock" ? X_UPDATES_PROVIDER_IDS.MOCK : X_UPDATES_PROVIDER_IDS.X_API, options);
  return provider.getRawUpdates();
}

export function createXUpdatesProvider(providerId = X_UPDATES_PROVIDER_IDS.MOCK, options = {}) {
  const id = normalizeXProviderId(providerId);
  const rawSettings = options.settings || {};
  const settings = normalizeXSettings(rawSettings);
  if (id === X_UPDATES_PROVIDER_IDS.MOCK) {
    return {
      id: X_UPDATES_PROVIDER_IDS.MOCK,
      label: "Sample X updates",
      mode: "mock",
      configured: true,
      liveEnabled: false,
      liveProviderCalls: false,
      settings,
      getRawUpdates: async () => buildXProviderReport(mockXUpdateRows(), {
        asOf: options.asOf || options.now || new Date().toISOString(),
        settings,
        mode: "mock",
        providerId: X_UPDATES_PROVIDER_IDS.MOCK,
        providerLabel: "Sample X updates",
        status: "mock/sample mode",
        warnings: ["Sample X update rows only. No scraping, cookies, or live X API calls were made."],
        liveProviderCalls: false
      })
    };
  }

  const config = buildXProviderConfig(options.env || {}, rawSettings);
  return {
    id: X_UPDATES_PROVIDER_IDS.X_API,
    label: "X API",
    mode: config.liveEnabled ? "api" : "config-only",
    configured: config.configured,
    liveEnabled: config.liveEnabled,
    liveProviderCalls: config.liveProviderCalls,
    settings,
    missingEnv: config.missingEnv,
    getRawUpdates: async () => {
      if (!config.liveProviderCalls) {
        return xProviderEmptyReport({
          mode: config.configured ? "configured-not-connected" : "not-configured",
          status: config.status,
          warning: config.detail,
          settings,
          asOf: options.asOf || options.now || new Date().toISOString()
        });
      }
      return fetchXApiUpdates({
        ...options,
        settings: rawSettings,
        config
      });
    }
  };
}

export function xProviderStatuses(env = {}, settings = {}) {
  const config = buildXProviderConfig(env, settings);
  return {
    mock: {
      id: X_UPDATES_PROVIDER_IDS.MOCK,
      label: "Sample X updates",
      configured: true,
      status: "mock/sample mode",
      liveEnabled: false,
      liveProviderCalls: false,
      sourceTypes: ["social"],
      warning: "Sample X rows keep the pipeline testable. No scraping, cookies, or live X calls are active."
    },
    xApi: {
      id: X_UPDATES_PROVIDER_IDS.X_API,
      label: "X API",
      configured: config.configured,
      status: config.status,
      liveEnabled: config.liveEnabled,
      liveProviderCalls: config.liveProviderCalls,
      sourceTypes: ["social"],
      requiredEnv: config.requiredEnv,
      optionalEnv: config.optionalEnv,
      missingEnv: config.missingEnv,
      credentialLocation: "server-only .env",
      query: config.query,
      warning: config.detail
    }
  };
}

export function buildXProviderConfig(env = {}, settings = {}) {
  const normalizedSettings = normalizeXSettings({
    ...settings,
    query: settings.query || env.X_QUERY,
    whitelist: settings.whitelist || env.X_TICKER_WHITELIST
  });
  const spec = X_UPDATES_PROVIDER_CONFIGS.xApi;
  const missingEnv = spec.requiredEnv.filter((key) => !isUsableCredentialValue(env[key]));
  const configured = missingEnv.length === 0;
  const liveEnabled = configured && parseBoolean(env.X_LIVE_ENABLED || env.TWITTER_LIVE_ENABLED);
  const status = !configured ? "not configured" : liveEnabled ? "configured" : "configured-not-connected";
  const label = !configured
    ? "X API not configured"
    : liveEnabled
      ? "X API configured for local backend sync"
      : "X API configured, live sync disabled";
  return {
    selectedProvider: X_UPDATES_PROVIDER_IDS.X_API,
    selectedLabel: spec.label,
    configured,
    liveEnabled,
    liveProviderCalls: liveEnabled,
    exposesSecretValues: false,
    status,
    label,
    detail: !configured
      ? "Add X_BEARER_TOKEN to local .env later. Sample/local X data remains active."
      : liveEnabled
        ? "X bearer token is present and live recent-search sync is enabled through the local backend only."
        : "X bearer token is detected on the local backend, but live sync remains disabled until X_LIVE_ENABLED=true.",
    requiredEnv: [...spec.requiredEnv],
    optionalEnv: [...spec.optionalEnv],
    missingEnv,
    credentialLocation: "server-only .env",
    query: normalizedSettings.query,
    whitelist: normalizedSettings.whitelist,
    falsePositives: normalizedSettings.falsePositives,
    maxResults: boundedInteger(env.X_MAX_RESULTS, 25, 10, 100),
    ttlMinutes: boundedInteger(env.X_TTL_MINUTES, 15, 1, 240),
    apiBaseUrl: normalizedBaseUrl(env.X_API_BASE_URL || "https://api.x.com/2"),
    capabilities: spec.capabilities
  };
}

export async function fetchXApiUpdates(options = {}) {
  const env = options.env || {};
  const config = options.config || buildXProviderConfig(env, options.settings || {});
  const rawSettings = options.settings || {};
  const settings = normalizeXSettings({
    ...rawSettings,
    query: rawSettings.query || config.query,
    whitelist: rawSettings.whitelist || config.whitelist,
    falsePositives: rawSettings.falsePositives || config.falsePositives
  });
  const asOf = options.asOf || options.now || new Date().toISOString();
  if (!config.configured || !config.liveProviderCalls) {
    return xProviderEmptyReport({
      mode: config.configured ? "configured-not-connected" : "not-configured",
      status: config.status,
      warning: config.detail,
      settings,
      asOf
    });
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    return xProviderEmptyReport({
      mode: "error",
      status: "error",
      warning: "No fetch implementation is available for X API sync.",
      settings,
      asOf,
      liveProviderCalls: true
    });
  }

  const bearerToken = usableCredentialValue(env.X_BEARER_TOKEN || options.bearerToken);
  if (!bearerToken) {
    return xProviderEmptyReport({
      mode: "not-configured",
      status: "not configured",
      warning: "X bearer token is missing from the local backend environment.",
      settings,
      asOf
    });
  }

  const apiBaseUrl = normalizedBaseUrl(options.apiBaseUrl || config.apiBaseUrl);
  const url = new URL(`${apiBaseUrl}/tweets/search/recent`);
  url.searchParams.set("query", settings.query || config.query || buildDefaultXQuery(settings.whitelist));
  url.searchParams.set("max_results", String(boundedInteger(options.maxResults || config.maxResults, 25, 10, 100)));
  url.searchParams.set("tweet.fields", "created_at,public_metrics,entities,lang");

  try {
    const response = await fetchImpl(url.href, {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        Accept: "application/json"
      }
    });
    const text = await response.text();
    if (!response.ok) {
      return xProviderEmptyReport({
        mode: response.status === 429 ? "rate-limited" : "error",
        status: response.status === 429 ? "rate limited" : "error",
        warning: xHttpWarning("X recent search", response.status, text),
        settings,
        asOf,
        liveProviderCalls: true
      });
    }
    const payload = parseJsonPayload(text);
    const rows = Array.isArray(payload.data) ? payload.data : [];
    return buildXProviderReport(rows.map(normalizeXApiTweet), {
      asOf,
      settings,
      mode: "x-api",
      providerId: X_UPDATES_PROVIDER_IDS.X_API,
      providerLabel: "X API",
      status: "connected",
      warnings: [],
      meta: payload.meta || {},
      liveProviderCalls: true
    });
  } catch (error) {
    return xProviderEmptyReport({
      mode: "error",
      status: "error",
      warning: `X API sync failed: ${sanitizeProviderMessage(error?.message || "Unknown provider error")}`,
      settings,
      asOf,
      liveProviderCalls: true
    });
  }
}

export function normalizeXSettings(settings = {}) {
  const whitelist = parseList(settings.whitelist, DEFAULT_X_TICKER_WHITELIST).map((ticker) => normalizeTicker(ticker)).filter(Boolean);
  return {
    query: stringFrom(settings.query) || buildDefaultXQuery(whitelist),
    whitelist,
    falsePositives: parseList(settings.falsePositives, COMMON_X_FALSE_POSITIVE_TICKERS).map((ticker) => normalizeTicker(ticker)).filter(Boolean)
  };
}

export function demoXUpdates(options = {}) {
  return normalizeXUpdates(mockXUpdateRows(), {
    asOf: options.asOf || "2026-05-24T12:00:00-04:00",
    source: "mock-x",
    sourceMode: "mock",
    providerId: X_UPDATES_PROVIDER_IDS.MOCK,
    providerLabel: "Sample X updates",
    liveProviderCalls: false
  });
}

export function normalizeXUpdates(rawRows = [], options = {}) {
  return rawRows.flatMap((row) => normalizeXUpdateRecord(row, options));
}

export function saveXUpdates(storage, records = [], key = X_UPDATES_STORAGE_KEY) {
  if (!storage?.setItem) return false;
  try {
    storage.setItem(key, JSON.stringify(normalizeXUpdates(records)));
    return true;
  } catch {
    return false;
  }
}

export function loadXUpdates(storage, key = X_UPDATES_STORAGE_KEY) {
  try {
    const stored = storage?.getItem ? JSON.parse(storage.getItem(key) || "null") : null;
    return Array.isArray(stored) && stored.length ? normalizeXUpdates(stored) : demoXUpdates();
  } catch {
    return demoXUpdates();
  }
}

export function extractXTickerMentions(text = "", options = {}) {
  const whitelist = new Set(parseList(options.whitelist, DEFAULT_X_TICKER_WHITELIST).map((ticker) => normalizeTicker(ticker)).filter(Boolean));
  const falsePositives = new Set(parseList(options.falsePositives, COMMON_X_FALSE_POSITIVE_TICKERS).map((ticker) => normalizeTicker(ticker)).filter(Boolean));
  const sourceText = String(text || "");
  const cashtags = [...sourceText.matchAll(/\$([A-Z][A-Z0-9.-]{0,9})\b/gi)].map((match) => normalizeTicker(match[1]));
  const whitelistWords = [...whitelist].filter((ticker) => {
    if (falsePositives.has(ticker)) return false;
    return new RegExp(`(^|[^A-Z0-9$])${escapeRegExp(ticker)}([^A-Z0-9]|$)`, "i").test(sourceText);
  });
  return unique([...cashtags, ...whitelistWords])
    .filter((ticker) => ticker && whitelist.has(ticker) && !falsePositives.has(ticker));
}

export function normalizeXUpdateRecord(row = {}, options = {}) {
  const text = sanitizePublicText(row.text || row.body || row.full_text || "");
  const liveProviderCalls = options.liveProviderCalls ?? row.liveProviderCalls ?? false;
  const sourceMode = options.sourceMode || row.sourceMode || (liveProviderCalls ? "api" : "mock");
  const extractedTickers = extractXTickerMentions([
    row.ticker,
    ...(Array.isArray(row.extractedTickers) ? row.extractedTickers : []),
    text
  ].filter(Boolean).join(" "), {
    whitelist: options.whitelist,
    falsePositives: options.falsePositives
  });
  const sourceId = stringFrom(row.id || row.sourceId || row.source_id);
  const createdAt = normalizedTimestamp(row.created_at || row.createdAt || row.timestamp || options.asOf);
  const metrics = row.public_metrics || row.metrics || {};
  const engagementScore = nonNegativeNumber(row.engagementScore, (
    nonNegativeNumber(metrics.like_count ?? row.likeCount, 0) +
    nonNegativeNumber(metrics.repost_count ?? row.repostCount, 0) * 2 +
    nonNegativeNumber(metrics.reply_count ?? row.replyCount, 0) +
    nonNegativeNumber(metrics.quote_count ?? row.quoteCount, 0)
  ));

  return extractedTickers.map((ticker) => pruneEmpty({
    sourceId,
    xPostId: sourceId,
    ticker,
    extractedTickers,
    title: text.slice(0, 140),
    body: text,
    text,
    createdAt,
    detectedAt: options.asOf,
    retrievedAt: options.asOf,
    sourceUrl: sourceUrlForXRow(row, sourceId),
    score: engagementScore,
    engagementScore,
    sentiment: "unknown",
    sentimentPlaceholder: "X sentiment is not classified; treat as low-trust social chatter.",
    isRumor: true,
    citesPrimarySource: false,
    source: options.source || row.source || "x-api",
    sourceMode,
    providerId: options.providerId || row.providerId || X_UPDATES_PROVIDER_IDS.X_API,
    providerLabel: options.providerLabel || row.providerLabel || "X API",
    sourceLabel: options.sourceLabel || row.sourceLabel || (liveProviderCalls ? "X API recent update" : "Sample X update"),
    sourceType: "social",
    trustLevel: "low",
    liveProviderCalls: Boolean(liveProviderCalls)
  }));
}

export function summarizeXUpdates(records = [], options = {}) {
  const now = Date.parse(options.asOf || new Date().toISOString()) || Date.now();
  const grouped = new Map();
  for (const record of records) {
    const ticker = normalizeTicker(record.ticker);
    if (!ticker) continue;
    const current = grouped.get(ticker) || {
      ticker,
      oneDayMentions: 0,
      sevenDayMentions: 0,
      thirtyDayMentions: 0,
      totalEngagement: 0,
      sourceIds: []
    };
    const ageDays = Math.max(0, (now - (Date.parse(record.createdAt || record.detectedAt || 0) || now)) / 864e5);
    if (ageDays <= 1) current.oneDayMentions += 1;
    if (ageDays <= 7) current.sevenDayMentions += 1;
    if (ageDays <= 30) current.thirtyDayMentions += 1;
    current.totalEngagement += Number(record.engagementScore || record.score || 0) || 0;
    current.sourceIds.push(record.sourceId);
    grouped.set(ticker, current);
  }
  return [...grouped.values()].map((row) => ({
    ...row,
    sourceIds: unique(row.sourceIds),
    mentionGrowth: row.sevenDayMentions ? row.oneDayMentions / Math.max(1, row.sevenDayMentions) : 0,
    sentiment: "unknown",
    sourceMode: records.some((record) => record.liveProviderCalls) ? "api" : "mock"
  })).sort((left, right) => right.sevenDayMentions - left.sevenDayMentions || right.totalEngagement - left.totalEngagement || left.ticker.localeCompare(right.ticker));
}

function buildXProviderReport(rawRows = [], options = {}) {
  const rejectedRows = [];
  const records = [];
  rawRows.forEach((row, index) => {
    const normalized = normalizeXUpdateRecord(row, {
      asOf: options.asOf,
      source: options.providerId || X_UPDATES_PROVIDER_IDS.X_API,
      sourceMode: options.mode === "mock" ? "mock" : "api",
      providerId: options.providerId || X_UPDATES_PROVIDER_IDS.X_API,
      providerLabel: options.providerLabel || "X API",
      liveProviderCalls: Boolean(options.liveProviderCalls),
      whitelist: options.settings.whitelist,
      falsePositives: options.settings.falsePositives
    });
    if (!normalized.length) {
      rejectedRows.push({
        rowNumber: index + 1,
        reason: "No whitelisted ticker survived X cashtag/text extraction or required text fields are missing.",
        missingFields: xImportMissingFields(row),
        values: redactXRow(row)
      });
      return;
    }
    normalized.forEach((record) => {
      const validation = validateXUpdateRecord(record);
      if (validation.ok) {
        records.push(pruneEmpty(record));
      } else {
        rejectedRows.push({
          rowNumber: index + 1,
          reason: validation.errors.join("; "),
          missingFields: validation.errors.map((error) => error.split(" ")[0]),
          values: redactXRow(row)
        });
      }
    });
  });
  const warnings = unique([
    ...(options.warnings || []),
    "X updates are lower-trust social inputs. No scraping, cookies, browser credentials, author handles, or API secrets are stored."
  ]);
  return {
    ok: records.length > 0 && rejectedRows.length === 0,
    partial: records.length > 0 && (rejectedRows.length > 0 || warnings.length > 0),
    mode: options.mode || "x-api",
    providerId: options.providerId || X_UPDATES_PROVIDER_IDS.X_API,
    providerLabel: options.providerLabel || "X API",
    sourceMode: options.mode === "mock" ? "mock" : "api",
    status: options.status || "connected",
    rowsParsed: rawRows.length,
    updatesImported: records.length,
    rejectedRows,
    missingFields: unique(rejectedRows.flatMap((row) => row.missingFields || [])),
    tickersDetected: unique(records.map((record) => record.ticker)).sort(),
    records,
    summary: summarizeXUpdates(records, { asOf: options.asOf }),
    settings: options.settings,
    warnings,
    fetchedAt: options.asOf,
    dataFreshness: options.status === "connected" ? "fresh" : options.status,
    liveProviderCalls: Boolean(options.liveProviderCalls),
    meta: options.meta || {}
  };
}

function xProviderEmptyReport({ mode, status, warning, settings, asOf, liveProviderCalls = false }) {
  return {
    ok: false,
    partial: false,
    mode,
    providerId: X_UPDATES_PROVIDER_IDS.X_API,
    providerLabel: "X API",
    status,
    rowsParsed: 0,
    updatesImported: 0,
    rejectedRows: [],
    missingFields: [],
    tickersDetected: [],
    records: [],
    summary: [],
    settings,
    warnings: warning ? [warning] : [],
    fetchedAt: asOf,
    dataFreshness: status,
    liveProviderCalls
  };
}

function normalizeXApiTweet(row = {}) {
  return {
    id: row.id,
    text: row.text,
    created_at: row.created_at,
    public_metrics: row.public_metrics,
    entities: row.entities,
    url: row.url
  };
}

function validateXUpdateRecord(record = {}) {
  const errors = [];
  if (!normalizeTicker(record.ticker)) errors.push("ticker missing");
  if (!record.sourceId) errors.push("sourceId missing");
  if (!record.text) errors.push("text missing");
  if (!record.createdAt) errors.push("createdAt missing");
  return { ok: errors.length === 0, errors };
}

function xImportMissingFields(row = {}) {
  const missing = [];
  if (!row.id && !row.sourceId && !row.source_id) missing.push("sourceId");
  if (!row.text && !row.body && !row.full_text) missing.push("text");
  return missing;
}

function buildDefaultXQuery(whitelist = DEFAULT_X_TICKER_WHITELIST) {
  const cashtags = parseList(whitelist, DEFAULT_X_TICKER_WHITELIST)
    .map((ticker) => normalizeTicker(ticker))
    .filter(Boolean)
    .slice(0, 20)
    .map((ticker) => `$${ticker}`);
  return `(${cashtags.join(" OR ")}) -is:retweet lang:en`;
}

function normalizeXProviderId(providerId = "") {
  const normalized = String(providerId || "").trim().toLowerCase();
  if (normalized === "mock" || normalized === "sample") return X_UPDATES_PROVIDER_IDS.MOCK;
  return X_UPDATES_PROVIDER_CONFIGS.xApi.aliases.includes(normalized) ? X_UPDATES_PROVIDER_IDS.X_API : X_UPDATES_PROVIDER_IDS.MOCK;
}

function xHttpWarning(label, statusCode, text = "") {
  const sanitized = sanitizeProviderMessage(text || "");
  if (Number(statusCode) === 429 || /rate|limit|quota/i.test(sanitized)) {
    return `${label} rate limited (${statusCode || "unknown"}): ${sanitized.slice(0, 180)}`;
  }
  return `${label} request failed (${statusCode || "unknown"}): ${sanitized.slice(0, 180)}`;
}

function sanitizeProviderMessage(message = "") {
  return String(message || "")
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]")
    .replace(/(access[_-]?token|refresh[_-]?token|bearer[_-]?token|api[_-]?key|apikey|password|cookie|authorization|session(?:[_-]?id)?)["':=\s]+[^"',\s]+/gi, "$1 [redacted]")
    .replace(/(accessToken|refreshToken|bearerToken|apiKey)["':=\s]+[^"',\s]+/g, "$1 [redacted]")
    .replace(/[A-Za-z0-9_-]{32,}/g, "[redacted]");
}

function redactXRow(row = {}) {
  const safe = {};
  const blockedKeyPattern = /(author|user(name)?|handle|cookie|authorization|password|secret|token|bearer|session)/i;
  for (const [key, value] of Object.entries(row || {})) {
    if (blockedKeyPattern.test(key)) continue;
    if (value === null || value === undefined) continue;
    if (typeof value === "object") {
      if (key === "public_metrics" || key === "metrics" || key === "entities") safe[key] = value;
      continue;
    }
    safe[key] = typeof value === "string" ? sanitizeProviderMessage(sanitizePublicText(value)).slice(0, 240) : value;
  }
  return safe;
}

function sanitizePublicText(value = "") {
  return String(value || "")
    .replace(/@[A-Za-z0-9_]{1,20}/g, "@[handle]")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceUrlForXRow(row = {}, sourceId = "") {
  const explicit = stringFrom(row.sourceUrl || row.url);
  if (/^https?:\/\//i.test(explicit)) return explicit;
  return sourceId ? `https://x.com/i/web/status/${encodeURIComponent(sourceId)}` : "";
}

function normalizedBaseUrl(value = "") {
  return stripTrailingSlash(stringFrom(value) || "https://api.x.com/2");
}

function normalizedTimestamp(value) {
  if (!value) return "";
  if (typeof value === "number") return new Date(value > 1e12 ? value : value * 1000).toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function parseJsonPayload(text = "") {
  try {
    return JSON.parse(text || "{}");
  } catch {
    return {};
  }
}

function parseList(value, fallback = []) {
  if (Array.isArray(value)) return value.length ? value : [...fallback];
  const values = String(value || "")
    .split(/[,\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return values.length ? values : [...fallback];
}

function parseBoolean(value) {
  return ["1", "true", "yes", "on", "enabled"].includes(String(value || "").trim().toLowerCase());
}

function boundedInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function nonNegativeNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;
  const number = numberFrom(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function stringFrom(value = "") {
  return String(value ?? "").trim();
}

function stripTrailingSlash(value = "") {
  return String(value || "").replace(/\/+$/, "");
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function pruneEmpty(object = {}) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}

function escapeRegExp(value = "") {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
