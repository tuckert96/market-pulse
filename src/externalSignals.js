import { normalizeTicker, numberFrom } from "./portfolioSchema.js";

export const EXTERNAL_SIGNAL_SOURCE_TYPES = Object.freeze({
  X: "x",
  REDDIT: "reddit",
  FEDERAL_TRADE: "federal-trade"
});

export const EXTERNAL_SIGNAL_SOURCE_MODES = Object.freeze([
  "mock",
  "manual",
  "local-file",
  "api",
  "public-static-dataset",
  "not-configured",
  "blocked"
]);

const SOURCE_TYPE_ALIASES = Object.freeze({
  twitter: EXTERNAL_SIGNAL_SOURCE_TYPES.X,
  "x-twitter": EXTERNAL_SIGNAL_SOURCE_TYPES.X,
  x: EXTERNAL_SIGNAL_SOURCE_TYPES.X,
  reddit: EXTERNAL_SIGNAL_SOURCE_TYPES.REDDIT,
  "reddit-api": EXTERNAL_SIGNAL_SOURCE_TYPES.REDDIT,
  politician: EXTERNAL_SIGNAL_SOURCE_TYPES.FEDERAL_TRADE,
  "politician-trade": EXTERNAL_SIGNAL_SOURCE_TYPES.FEDERAL_TRADE,
  "politician-trades": EXTERNAL_SIGNAL_SOURCE_TYPES.FEDERAL_TRADE,
  "federal-trade": EXTERNAL_SIGNAL_SOURCE_TYPES.FEDERAL_TRADE,
  "federal-trades": EXTERNAL_SIGNAL_SOURCE_TYPES.FEDERAL_TRADE,
  disclosure: EXTERNAL_SIGNAL_SOURCE_TYPES.FEDERAL_TRADE
});

const SENTIMENTS = new Set(["bullish", "bearish", "mixed", "neutral", "unknown"]);

export function buildExternalSignals({
  xUpdates = [],
  redditMentions = [],
  federalTrades = [],
  politicianTrades = [],
  asOf = new Date().toISOString()
} = {}) {
  return [
    ...externalSignalsFromXUpdates(xUpdates, { asOf }),
    ...externalSignalsFromRedditMentions(redditMentions, { asOf }),
    ...externalSignalsFromFederalTrades([...federalTrades, ...politicianTrades], { asOf })
  ].sort(compareExternalSignals);
}

export function externalSignalsFromXUpdates(records = [], options = {}) {
  return normalizeExternalSignals(records, {
    ...options,
    sourceType: EXTERNAL_SIGNAL_SOURCE_TYPES.X
  });
}

export function externalSignalsFromRedditMentions(records = [], options = {}) {
  return normalizeExternalSignals(records, {
    ...options,
    sourceType: EXTERNAL_SIGNAL_SOURCE_TYPES.REDDIT
  });
}

export function externalSignalsFromFederalTrades(records = [], options = {}) {
  return normalizeExternalSignals(records, {
    ...options,
    sourceType: EXTERNAL_SIGNAL_SOURCE_TYPES.FEDERAL_TRADE
  });
}

export function normalizeNewsUpdate(raw = {}, options = {}) {
  return normalizeExternalSignal(raw, options);
}

export function normalizeExternalSignals(records = [], options = {}) {
  return (Array.isArray(records) ? records : [])
    .map((record) => normalizeExternalSignal(record, options))
    .filter((record) => validateExternalSignal(record).ok)
    .sort(compareExternalSignals);
}

export function normalizeExternalSignal(raw = {}, options = {}) {
  const sourceType = normalizeSourceType(options.sourceType || raw.sourceType || raw.source_type || raw.platform || raw.kind || raw.source);
  const sourceMode = normalizeSourceMode(options.sourceMode || raw.sourceMode || raw.source_mode || raw.mode, sourceType);
  const asOf = normalizeTimestamp(options.asOf || raw.detectedAt || raw.retrievedAt || raw.sourceAsOf || raw.fetchedAt || new Date().toISOString());
  const tickers = extractTickers(raw);
  const primaryTicker = normalizeTicker(raw.primaryTicker || raw.primary_ticker || raw.ticker || raw.symbol || tickers[0]);
  const occurredAt = normalizeTimestamp(
    raw.occurredAt ||
    raw.createdAt ||
    raw.created_utc ||
    raw.timestamp ||
    raw.transactionDate ||
    raw.tradedAt ||
    raw.disclosureDate ||
    raw.disclosedAt ||
    asOf
  );
  const sourceLabel = options.sourceLabel || raw.sourceLabel || raw.source_label || inferSourceLabel({ sourceType, sourceMode, raw });
  const signalType = normalizeSignalType(raw.signalType || raw.signal_type, sourceType);
  const signalSubtype = normalizeSignalSubtype(raw, sourceType);
  const sourceUrl = safeUrl(raw.sourceUrl || raw.source_url || raw.permalink || raw.url || raw.filingUrl || raw.ptr_link || "");
  const headline = cleanText(raw.headline || raw.title || defaultHeadline({ sourceType, primaryTicker, raw }));
  const summary = cleanText(raw.summary || raw.text || raw.body || raw.commentText || raw.comment_text || defaultSummary({ sourceType, primaryTicker, raw }));
  const warnings = sourceWarnings({ sourceType, sourceMode, raw, sourceUrl });
  const liveProviderCalls = sourceType === EXTERNAL_SIGNAL_SOURCE_TYPES.X && sourceMode === "blocked"
    ? false
    : Boolean(options.liveProviderCalls || raw.liveProviderCalls || raw.live_provider_calls);

  return pruneEmpty({
    id: stableExternalSignalId({ raw, sourceType, sourceMode, primaryTicker, occurredAt, signalSubtype }),
    modelVersion: "external-signal-v1",
    kind: "news-update",
    sourceType,
    sourceMode,
    sourceLabel,
    providerId: cleanText(options.providerId || raw.providerId || raw.provider_id || providerIdFor(sourceType, sourceMode)),
    providerLabel: cleanText(options.providerLabel || raw.providerLabel || raw.provider_label || sourceLabel),
    liveProviderCalls,
    signalType,
    signalSubtype,
    actionability: "review-context-only",
    trustLevel: trustLevelFor(sourceType, raw),
    primaryTicker,
    tickers,
    headline,
    summary,
    sentiment: normalizeSentiment(raw.sentiment),
    sourceIds: sourceIdsFrom(raw),
    sourceUrl,
    occurredAt,
    detectedAt: asOf,
    staleAfter: raw.staleAfter || staleAfter(occurredAt || asOf, staleDaysFor(sourceType)),
    warnings,
    metadata: metadataFor(raw, sourceType)
  });
}

export function validateExternalSignal(record = {}) {
  const errors = [];
  const warnings = [];
  requireString(record.id, "id", errors);
  requireKnown(record.sourceType, Object.values(EXTERNAL_SIGNAL_SOURCE_TYPES), "sourceType", errors);
  requireKnown(record.sourceMode, EXTERNAL_SIGNAL_SOURCE_MODES, "sourceMode", errors);
  requireString(record.sourceLabel, "sourceLabel", errors);
  requireString(record.primaryTicker, "primaryTicker", errors);
  requireArray(record.tickers, "tickers", errors);
  if (Array.isArray(record.tickers) && !record.tickers.length) errors.push("tickers must include at least one ticker");
  requireString(record.headline, "headline", errors);
  requireString(record.summary, "summary", errors);
  requireString(record.occurredAt, "occurredAt", errors);
  requireString(record.detectedAt, "detectedAt", errors);
  requireString(record.actionability, "actionability", errors);
  if (typeof record.liveProviderCalls !== "boolean") errors.push("liveProviderCalls must be boolean");
  if (record.sourceUrl && !/^https?:\/\//i.test(record.sourceUrl)) warnings.push("sourceUrl should be absolute HTTP(S)");
  return { ok: errors.length === 0, errors, warnings, count: errors.length ? 0 : 1 };
}

function normalizeSourceType(value = "") {
  const key = String(value || "").trim().toLowerCase();
  return SOURCE_TYPE_ALIASES[key] || (Object.values(EXTERNAL_SIGNAL_SOURCE_TYPES).includes(key) ? key : EXTERNAL_SIGNAL_SOURCE_TYPES.X);
}

function normalizeSourceMode(value = "", sourceType = "") {
  const mode = String(value || "").trim().toLowerCase();
  if (sourceType === EXTERNAL_SIGNAL_SOURCE_TYPES.X) {
    if (/scrap|browser|cookie|session|crawler|timeline/.test(mode)) return "blocked";
    if (["api", "live"].includes(mode)) return "api";
    if (["mock", "manual", "local-file", "not-configured", "blocked"].includes(mode)) return mode;
    return "manual";
  }
  if (["api", "live"].includes(mode) && sourceType === EXTERNAL_SIGNAL_SOURCE_TYPES.REDDIT) return "api";
  if (["public-static-dataset", "provider", "live"].includes(mode) && sourceType === EXTERNAL_SIGNAL_SOURCE_TYPES.FEDERAL_TRADE) return "public-static-dataset";
  if (["imported", "local-json", "local-csv", "local-file"].includes(mode)) return "local-file";
  if (EXTERNAL_SIGNAL_SOURCE_MODES.includes(mode)) return mode;
  return "mock";
}

function extractTickers(raw = {}) {
  const rawValues = [
    raw.primaryTicker,
    raw.primary_ticker,
    raw.ticker,
    raw.symbol,
    raw.assetTicker,
    raw.asset_ticker,
    raw.tickers,
    raw.symbols,
    raw.extractedTickers,
    raw.extracted_tickers,
    raw.affectedTickers,
    raw.affected_tickers
  ];
  const flattened = rawValues.flatMap((value) => {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") return value.split(/[,\s]+/);
    return [];
  });
  return unique(flattened.map((ticker) => normalizeTicker(ticker)).filter(Boolean));
}

function defaultHeadline({ sourceType, primaryTicker, raw }) {
  if (sourceType === EXTERNAL_SIGNAL_SOURCE_TYPES.REDDIT) return `${primaryTicker || "Ticker"} Reddit mention`;
  if (sourceType === EXTERNAL_SIGNAL_SOURCE_TYPES.FEDERAL_TRADE) {
    return `${titleCase(raw.transactionType || raw.transaction_type || "Unknown")} disclosure: ${primaryTicker || "ticker"}`;
  }
  return `${primaryTicker || "Ticker"} X update`;
}

function defaultSummary({ sourceType, primaryTicker, raw }) {
  if (sourceType === EXTERNAL_SIGNAL_SOURCE_TYPES.FEDERAL_TRADE) {
    const official = cleanText(raw.politicianName || raw.politician_name || raw.representative || raw.senator || "A federal official");
    const type = cleanText(raw.transactionType || raw.transaction_type || "transaction");
    const asset = cleanText(raw.assetName || raw.asset_name || primaryTicker || "a security");
    return `${official} disclosed a ${type} in ${asset}. This is delayed disclosure context, not a trade instruction.`;
  }
  if (sourceType === EXTERNAL_SIGNAL_SOURCE_TYPES.REDDIT) return cleanText(raw.title || raw.body || raw.commentText || "Reddit mention context.");
  return cleanText(raw.text || raw.note || "Manual or local X update context.");
}

function inferSourceLabel({ sourceType, sourceMode, raw }) {
  if (sourceType === EXTERNAL_SIGNAL_SOURCE_TYPES.X) {
    if (sourceMode === "blocked") return "X/Twitter blocked source";
    if (sourceMode === "api") return raw.providerLabel || "X API";
    if (sourceMode === "local-file") return "Imported X/Twitter file";
    if (sourceMode === "mock") return "Sample X/Twitter update";
    return "Manual X/Twitter note";
  }
  if (sourceType === EXTERNAL_SIGNAL_SOURCE_TYPES.REDDIT) {
    if (raw.providerLabel) return raw.providerLabel;
    if (sourceMode === "api") return "Reddit API";
    if (sourceMode === "local-file") return "Imported Reddit JSON";
    return "Sample Reddit";
  }
  if (sourceType === EXTERNAL_SIGNAL_SOURCE_TYPES.FEDERAL_TRADE) {
    if (raw.providerLabel) return raw.providerLabel;
    if (sourceMode === "public-static-dataset") return "Public federal disclosure dataset";
    if (sourceMode === "local-file") return "Imported federal disclosure file";
    return "Sample federal disclosure";
  }
  return "Local external signal";
}

function normalizeSignalType(value = "", sourceType = "") {
  const text = cleanText(value);
  if (text) return text;
  if (sourceType === EXTERNAL_SIGNAL_SOURCE_TYPES.REDDIT) return "social-mention";
  if (sourceType === EXTERNAL_SIGNAL_SOURCE_TYPES.FEDERAL_TRADE) return "federal-trade-disclosure";
  return "social-update";
}

function normalizeSignalSubtype(raw = {}, sourceType = "") {
  if (raw.signalSubtype || raw.signal_subtype) return cleanText(raw.signalSubtype || raw.signal_subtype);
  if (sourceType === EXTERNAL_SIGNAL_SOURCE_TYPES.FEDERAL_TRADE) {
    const type = String(raw.transactionType || raw.transaction_type || "unknown").trim().toLowerCase() || "unknown";
    return `${type}-disclosure`;
  }
  if (sourceType === EXTERNAL_SIGNAL_SOURCE_TYPES.REDDIT) return raw.apiRecordKind === "comment" ? "reddit-comment" : "reddit-post";
  return "x-update";
}

function sourceWarnings({ sourceType, sourceMode, raw, sourceUrl }) {
  const warnings = [];
  if (sourceType === EXTERNAL_SIGNAL_SOURCE_TYPES.X) {
    warnings.push("X/Twitter rows must come from manual/local imports or a future approved server-side API path. Scraping and browser-cookie capture are not supported.");
    if (sourceMode === "blocked") warnings.push("Requested X/Twitter source mode was blocked and labeled instead of ingested as live data.");
  }
  if (sourceType === EXTERNAL_SIGNAL_SOURCE_TYPES.REDDIT) {
    warnings.push("Reddit is a lower-trust social signal. Do not treat chatter as primary-source evidence.");
  }
  if (sourceType === EXTERNAL_SIGNAL_SOURCE_TYPES.FEDERAL_TRADE) {
    warnings.push("Federal trade disclosures are delayed and informational. Do not infer intent, causation, or trade instructions.");
  }
  if ((raw.sourceUrl || raw.source_url || raw.url) && !sourceUrl) warnings.push("Unsafe or unsupported source URL was dropped.");
  return unique(warnings);
}

function metadataFor(raw = {}, sourceType = "") {
  if (sourceType === EXTERNAL_SIGNAL_SOURCE_TYPES.REDDIT) {
    return pruneEmpty({
      subreddit: cleanText(raw.subreddit),
      score: numberFrom(raw.score, raw.upvotes),
      upvotes: numberFrom(raw.upvotes, raw.score),
      commentCount: numberFrom(raw.commentCount, raw.num_comments, raw.comments),
      engagementScore: numberFrom(raw.engagementScore),
      isRumor: Boolean(raw.isRumor ?? raw.is_rumor),
      citesPrimarySource: Boolean(raw.citesPrimarySource ?? raw.cites_primary_source),
      apiRecordKind: cleanText(raw.apiRecordKind)
    });
  }
  if (sourceType === EXTERNAL_SIGNAL_SOURCE_TYPES.FEDERAL_TRADE) {
    return pruneEmpty({
      politicianName: cleanText(raw.politicianName || raw.politician_name || raw.representative || raw.senator),
      chamber: cleanText(raw.chamber),
      state: cleanText(raw.state),
      transactionType: cleanText(raw.transactionType || raw.transaction_type),
      transactionDate: cleanText(raw.transactionDate || raw.transaction_date || raw.tradedAt),
      disclosureDate: cleanText(raw.disclosureDate || raw.disclosure_date || raw.disclosedAt),
      amountRangeLow: numberFrom(raw.amountRangeLow, raw.amount_low, raw.amountLow),
      amountRangeHigh: numberFrom(raw.amountRangeHigh, raw.amount_high, raw.amountHigh),
      owner: cleanText(raw.owner)
    });
  }
  return pruneEmpty({
    accountLabel: cleanText(raw.accountLabel || raw.sourceAccountLabel || raw.source_account_label),
    importedAt: cleanText(raw.importedAt),
    localOnly: true
  });
}

function trustLevelFor(sourceType = "", raw = {}) {
  if (sourceType === EXTERNAL_SIGNAL_SOURCE_TYPES.FEDERAL_TRADE) return "medium";
  if (sourceType === EXTERNAL_SIGNAL_SOURCE_TYPES.REDDIT && Boolean(raw.citesPrimarySource || raw.cites_primary_source)) return "medium";
  return "low";
}

function providerIdFor(sourceType = "", sourceMode = "") {
  if (sourceType === EXTERNAL_SIGNAL_SOURCE_TYPES.X) return sourceMode === "blocked" ? "x-source-blocked" : "local-x-note";
  if (sourceType === EXTERNAL_SIGNAL_SOURCE_TYPES.REDDIT) return sourceMode === "api" ? "reddit-api" : "local-reddit";
  if (sourceType === EXTERNAL_SIGNAL_SOURCE_TYPES.FEDERAL_TRADE) return sourceMode === "public-static-dataset" ? "public-federal-disclosures" : "local-federal-disclosures";
  return "local-external-signal";
}

function sourceIdsFrom(raw = {}) {
  return unique([
    raw.sourceId,
    raw.source_id,
    raw.providerRecordId,
    raw.provider_record_id,
    raw.redditId,
    raw.id
  ].map(cleanText).filter(Boolean));
}

function stableExternalSignalId({ raw, sourceType, sourceMode, primaryTicker, occurredAt, signalSubtype }) {
  const existing = cleanText(raw.id);
  if (existing && !/^reddit-|^mock-reddit/i.test(existing)) return `external:${sourceType}:${slug(existing)}`;
  const sourceId = sourceIdsFrom(raw)[0] || "";
  return `external:${sourceType}:${slug(sourceMode)}:${slug(primaryTicker || "portfolio")}:${slug(signalSubtype || "update")}:${slug(sourceId || occurredAt)}`;
}

function compareExternalSignals(left = {}, right = {}) {
  return String(right.occurredAt || right.detectedAt || "").localeCompare(String(left.occurredAt || left.detectedAt || "")) ||
    String(left.sourceType || "").localeCompare(String(right.sourceType || "")) ||
    String(left.id || "").localeCompare(String(right.id || ""));
}

function normalizeSentiment(value = "") {
  const text = String(value || "unknown").trim().toLowerCase();
  return SENTIMENTS.has(text) ? text : "unknown";
}

function normalizeTimestamp(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toISOString();
}

function staleAfter(timestamp = "", days = 3) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function staleDaysFor(sourceType = "") {
  if (sourceType === EXTERNAL_SIGNAL_SOURCE_TYPES.FEDERAL_TRADE) return 90;
  return 3;
}

function safeUrl(value = "") {
  const text = cleanText(value);
  return /^https?:\/\//i.test(text) ? text : "";
}

function requireString(value, field, errors) {
  if (!cleanText(value)) errors.push(`${field} is required`);
}

function requireArray(value, field, errors) {
  if (!Array.isArray(value)) errors.push(`${field} must be an array`);
}

function requireKnown(value, allowed, field, errors) {
  if (!allowed.includes(value)) errors.push(`${field} must be one of ${allowed.join(", ")}`);
}

function cleanText(value = "") {
  return String(value ?? "").trim();
}

function titleCase(value = "") {
  return cleanText(value).toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function slug(value = "") {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "unknown";
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function pruneEmpty(record = {}) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => {
    if (value === undefined || value === null || value === "") return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value).length > 0;
    return true;
  }));
}
