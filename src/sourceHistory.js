export const SOURCE_HISTORY_STORAGE_LIMIT = 40;

export const SOURCE_HISTORY_EVENT_TYPES = Object.freeze({
  PORTFOLIO_IMPORT: "portfolio_import",
  PROVIDER_SYNC: "provider_sync",
  MARKET_DATA_REFRESH: "market_data_refresh",
  BACKUP_RESTORE: "backup_restore",
  SAMPLE_LOAD: "sample_load",
  PORTFOLIO_RESET: "portfolio_reset"
});

const EVENT_LABELS = Object.freeze({
  [SOURCE_HISTORY_EVENT_TYPES.PORTFOLIO_IMPORT]: "Portfolio import",
  [SOURCE_HISTORY_EVENT_TYPES.PROVIDER_SYNC]: "Provider sync",
  [SOURCE_HISTORY_EVENT_TYPES.MARKET_DATA_REFRESH]: "Market data refresh",
  [SOURCE_HISTORY_EVENT_TYPES.BACKUP_RESTORE]: "Backup restore",
  [SOURCE_HISTORY_EVENT_TYPES.SAMPLE_LOAD]: "Sample portfolio loaded",
  [SOURCE_HISTORY_EVENT_TYPES.PORTFOLIO_RESET]: "Portfolio reset"
});

const SECRET_VALUE_PATTERN = /(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{16,}|xox[baprs]-[A-Za-z0-9-]{16,}|Bearer\s+[A-Za-z0-9._-]{12,}|(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|cookie|authorization)=([^&\s"']+))/gi;
const LONG_OPAQUE_TOKEN_PATTERN = /\b[A-Za-z0-9_-]{48,}\b/g;
const LONG_DIGIT_PATTERN = /\d{5,}/g;

export function buildSourceHistoryEvent(type, input = {}, options = {}) {
  const normalizedType = normalizeEventType(type);
  const timestamp = normalizeTimestamp(input.timestamp || input.importedAt || input.fetchedAt || input.lastSync || options.now || new Date().toISOString());
  const label = safeSourceLabel(input.label || EVENT_LABELS[normalizedType] || "Source event", EVENT_LABELS[normalizedType] || "Source event");
  const sourceType = safeSourceLabel(input.sourceType || input.provider || normalizedType, normalizedType);
  const fileName = input.fileName ? safeFileLabel(input.fileName) : "";
  const provider = input.provider ? safeSourceLabel(input.provider, "") : "";
  const detail = safeDetail(input.detail || input.message || "");
  const status = normalizeEventStatus(input.status || inferStatusFromText(input.providerStatus || input.detail || input.message || ""));

  return normalizeSourceHistoryEvent({
    id: input.id || sourceHistoryEventId({
      type: normalizedType,
      timestamp,
      label: fileName || provider || label
    }),
    type: normalizedType,
    sourceType,
    sourceMode: safeSourceLabel(input.sourceMode || input.mode || input.dataMode || "", ""),
    dataMode: safeSourceLabel(input.dataMode || input.sourceMode || input.mode || "", ""),
    timestamp,
    status,
    label,
    detail,
    provider,
    providerStatus: safeSourceLabel(input.providerStatus || input.statusLabel || input.providerMode || "", ""),
    fileName,
    rowsParsed: safeCount(input.rowsParsed),
    acceptedRows: safeCount(input.acceptedRows),
    reviewRows: safeCount(input.reviewRows),
    skippedRows: safeCount(input.skippedRows),
    holdingsCount: safeCount(input.holdingsCount),
    accountsCount: safeCount(input.accountsCount),
    totalMarketValue: safeMoney(input.totalMarketValue),
    tickersCount: safeCount(input.tickersCount),
    activePortfolioSource: input.activePortfolioSource === true
  });
}

export function sourceHistoryEventFromImportReport(report = {}, input = {}) {
  const rejectedRows = Array.isArray(report?.rejectedRows) ? report.rejectedRows : [];
  const skippedRows = Number.isFinite(Number(report?.skippedRows?.length))
    ? report.skippedRows.length
    : rejectedRows.filter((row) => String(row?.classification || "").toLowerCase() === "non-holding row").length;
  const reviewRows = rejectedRows.filter((row) => String(row?.classification || "").toLowerCase() !== "non-holding row").length;
  const acceptedRows = report?.holdingsImported ?? report?.ratingsImported ?? report?.tradesImported ?? report?.mentionsImported ?? report?.updatesImported ?? input.acceptedRows;
  const status = input.status || (reviewRows ? "warning" : report?.health?.tone || report?.health?.status || "success");

  return buildSourceHistoryEvent(input.type || SOURCE_HISTORY_EVENT_TYPES.PORTFOLIO_IMPORT, {
    ...input,
    label: input.label || "Portfolio import",
    sourceType: input.sourceType || report?.provider || "local-file",
    sourceMode: input.sourceMode || "imported",
    dataMode: input.dataMode || "Imported",
    timestamp: input.timestamp || report?.importedAt || report?.fetchedAt,
    status,
    provider: input.provider || report?.provider || "Local file",
    providerStatus: input.providerStatus || report?.health?.status || status,
    fileName: input.fileName || report?.fileName,
    detail: input.detail || report?.health?.message || "",
    rowsParsed: input.rowsParsed ?? report?.rowsParsed,
    acceptedRows,
    reviewRows,
    skippedRows,
    holdingsCount: input.holdingsCount ?? report?.holdingsImported ?? acceptedRows,
    accountsCount: input.accountsCount ?? (Array.isArray(report?.accountsDetected) ? report.accountsDetected.length : undefined),
    totalMarketValue: input.totalMarketValue ?? report?.totalMarketValue,
    tickersCount: input.tickersCount ?? (Array.isArray(report?.tickersDetected) ? report.tickersDetected.length : undefined),
    activePortfolioSource: input.activePortfolioSource === true
  });
}

export function sourceHistoryEventFromProviderSync(input = {}) {
  return buildSourceHistoryEvent(SOURCE_HISTORY_EVENT_TYPES.PROVIDER_SYNC, {
    label: input.label || "Provider sync",
    sourceType: input.sourceType || input.provider || "provider",
    sourceMode: input.sourceMode || input.mode || "Live",
    dataMode: input.dataMode || input.sourceMode || input.mode || "Live",
    timestamp: input.timestamp || input.fetchedAt || input.lastSync,
    status: input.status || "success",
    provider: input.provider || "Provider",
    providerStatus: input.providerStatus || input.mode || input.statusLabel || "synced",
    detail: input.detail || input.message || "",
    rowsParsed: input.rowsParsed,
    acceptedRows: input.acceptedRows,
    reviewRows: input.reviewRows,
    skippedRows: input.skippedRows,
    holdingsCount: input.holdingsCount,
    accountsCount: input.accountsCount,
    totalMarketValue: input.totalMarketValue,
    tickersCount: input.tickersCount,
    activePortfolioSource: input.activePortfolioSource === true
  });
}

export function sourceHistoryEventFromMarketDataStatus(status = {}, input = {}) {
  const quoteCount = status.quoteCount ?? status.cache?.quoteCount ?? status.coverage?.availableQuotes ?? input.acceptedRows;
  const requestedTickers = status.requestedTickers ?? status.tickers ?? input.tickers;
  const providerStatus = status.label || status.status || input.providerStatus || "";
  const dataMode = status.dataFreshness || status.mode || status.status || input.dataMode || "";
  return buildSourceHistoryEvent(SOURCE_HISTORY_EVENT_TYPES.MARKET_DATA_REFRESH, {
    label: input.label || "Market data refresh",
    sourceType: input.sourceType || "market-data",
    sourceMode: input.sourceMode || dataMode,
    dataMode,
    timestamp: input.timestamp || status.fetchedAt || status.lastSuccessfulRefresh || status.asOf,
    status: input.status || inferStatusFromText(providerStatus || dataMode),
    provider: input.provider || status.providerLabel || status.providerId || "Market data",
    providerStatus,
    detail: input.detail || status.detail || status.lastError?.message || "",
    acceptedRows: quoteCount,
    skippedRows: status.missingQuoteCount ?? status.cache?.missCount,
    tickersCount: Array.isArray(requestedTickers) ? requestedTickers.length : input.tickersCount ?? quoteCount,
    activePortfolioSource: false
  });
}

export function appendSourceHistoryEvent(history = [], event = {}, options = {}) {
  const normalizedEvent = normalizeSourceHistoryEvent(event);
  if (!normalizedEvent) return normalizeSourceHistory(history, options);
  const clearActive = normalizedEvent.activePortfolioSource || normalizedEvent.type === SOURCE_HISTORY_EVENT_TYPES.PORTFOLIO_RESET;
  const base = normalizeSourceHistory(history, { ...options, limit: Number.POSITIVE_INFINITY })
    .filter((item) => item.id !== normalizedEvent.id)
    .map((item) => clearActive ? { ...item, activePortfolioSource: false } : item);
  return normalizeSourceHistory([normalizedEvent, ...base], options);
}

export function normalizeSourceHistory(events = [], options = {}) {
  const limit = Number.isFinite(Number(options.limit)) ? Math.max(1, Number(options.limit)) : SOURCE_HISTORY_STORAGE_LIMIT;
  return (Array.isArray(events) ? events : [])
    .map((event) => normalizeSourceHistoryEvent(event))
    .filter(Boolean)
    .sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")))
    .slice(0, limit);
}

export function normalizeSourceHistoryEvent(event = {}) {
  if (!event || typeof event !== "object" || Array.isArray(event)) return null;
  const type = normalizeEventType(event.type);
  const timestamp = normalizeTimestamp(event.timestamp || event.importedAt || event.fetchedAt || event.lastSync || "");
  const label = safeSourceLabel(event.label || EVENT_LABELS[type] || "Source event", EVENT_LABELS[type] || "Source event");
  const provider = safeSourceLabel(event.provider || "", "");
  const fileName = event.fileName ? safeFileLabel(event.fileName) : "";
  return {
    id: safeEventId(event.id || sourceHistoryEventId({ type, timestamp, label: fileName || provider || label })),
    type,
    label,
    sourceType: safeSourceLabel(event.sourceType || type, type),
    sourceMode: safeSourceLabel(event.sourceMode || "", ""),
    dataMode: safeSourceLabel(event.dataMode || event.sourceMode || "", ""),
    timestamp,
    status: normalizeEventStatus(event.status),
    detail: safeDetail(event.detail || ""),
    provider,
    providerStatus: safeSourceLabel(event.providerStatus || "", ""),
    fileName,
    rowsParsed: safeCount(event.rowsParsed),
    acceptedRows: safeCount(event.acceptedRows),
    reviewRows: safeCount(event.reviewRows),
    skippedRows: safeCount(event.skippedRows),
    holdingsCount: safeCount(event.holdingsCount),
    accountsCount: safeCount(event.accountsCount),
    totalMarketValue: safeMoney(event.totalMarketValue),
    tickersCount: safeCount(event.tickersCount),
    activePortfolioSource: event.activePortfolioSource === true
  };
}

export function sourceHistorySummary(history = []) {
  const normalized = normalizeSourceHistory(history);
  const active = normalized.find((event) => event.activePortfolioSource) || null;
  const latest = normalized[0] || null;
  const reviewCount = normalized.filter((event) => ["warning", "error"].includes(event.status)).length;
  return {
    count: normalized.length,
    active,
    latest,
    reviewCount
  };
}

export function safeSourceLabel(value = "", fallback = "") {
  const raw = String(value ?? "").trim();
  const text = raw || String(fallback || "").trim();
  if (!text) return "";
  return sanitizeSourceText(text).slice(0, 120);
}

function safeFileLabel(value = "") {
  const raw = String(value ?? "").trim() || "Local file";
  const basename = raw
    .split(/[?#]/)[0]
    .split(/[\\/]/)
    .filter(Boolean)
    .pop() || raw;
  return sanitizeSourceText(basename).slice(0, 120) || "Local file";
}

function safeDetail(value = "") {
  return sanitizeSourceText(String(value || "")).slice(0, 240);
}

function sanitizeSourceText(value = "") {
  return String(value || "")
    .replace(SECRET_VALUE_PATTERN, "[redacted]")
    .replace(LONG_OPAQUE_TOKEN_PATTERN, "[redacted]")
    .replace(LONG_DIGIT_PATTERN, (match) => `masked-${match.slice(-4)}`)
    .replace(/\s+/g, " ")
    .trim();
}

function sourceHistoryEventId({ type, timestamp, label }) {
  return `source-history:${type}:${timestamp}:${safeEventId(label || "event")}`;
}

function safeEventId(value = "") {
  const safe = sanitizeSourceText(String(value || "event"))
    .toLowerCase()
    .replace(/[^a-z0-9:._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
  return safe || "source-history-event";
}

function normalizeEventType(type = "") {
  const value = String(type || "").trim().toLowerCase().replace(/[^a-z0-9_:-]+/g, "_");
  return Object.values(SOURCE_HISTORY_EVENT_TYPES).includes(value) ? value : SOURCE_HISTORY_EVENT_TYPES.PROVIDER_SYNC;
}

function normalizeEventStatus(status = "") {
  const value = String(status || "").toLowerCase();
  if (/fail|error|invalid|rejected/.test(value)) return "error";
  if (/partial|warning|stale|rate|review|skipped|cached/.test(value)) return "warning";
  if (/pending|reset|clear|sample|restore|loaded/.test(value)) return "info";
  if (/success|connected|live|imported|synced|refreshed|ok/.test(value)) return "success";
  return "info";
}

function inferStatusFromText(value = "") {
  return normalizeEventStatus(value);
}

function normalizeTimestamp(value = "") {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function safeCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.round(number));
}

function safeMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Number(number.toFixed(2)));
}
