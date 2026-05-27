export const DATA_MODES = Object.freeze({
  NO_DATA: "no-data",
  SAMPLE: "sample",
  IMPORTED: "imported",
  LIVE: "live",
  CACHED: "cached",
  STALE: "stale",
  PARTIAL: "partial",
  RATE_LIMITED: "rate-limited",
  ERROR: "error",
  NOT_CONFIGURED: "not-configured"
});

export const DATA_MODE_LABELS = Object.freeze({
  [DATA_MODES.NO_DATA]: "No data loaded",
  [DATA_MODES.SAMPLE]: "Sample",
  [DATA_MODES.IMPORTED]: "Imported",
  [DATA_MODES.LIVE]: "Live",
  [DATA_MODES.CACHED]: "Cached",
  [DATA_MODES.STALE]: "Stale",
  [DATA_MODES.PARTIAL]: "Partial data",
  [DATA_MODES.RATE_LIMITED]: "Rate limited",
  [DATA_MODES.ERROR]: "Error",
  [DATA_MODES.NOT_CONFIGURED]: "Not configured"
});

export function dataModeLabel(mode = DATA_MODES.NOT_CONFIGURED) {
  return DATA_MODE_LABELS[normalizeDataMode(mode)] || DATA_MODE_LABELS[DATA_MODES.NOT_CONFIGURED];
}

export function dataModeBadgeClass(mode = DATA_MODES.NOT_CONFIGURED) {
  return ({
    [DATA_MODES.NO_DATA]: "badge-source-empty",
    [DATA_MODES.SAMPLE]: "badge-source-sample",
    [DATA_MODES.IMPORTED]: "badge-source-imported",
    [DATA_MODES.LIVE]: "badge-source-live",
    [DATA_MODES.CACHED]: "badge-source-cached",
    [DATA_MODES.STALE]: "badge-source-stale",
    [DATA_MODES.PARTIAL]: "badge-source-partial",
    [DATA_MODES.RATE_LIMITED]: "badge-source-rate-limited",
    [DATA_MODES.ERROR]: "badge-source-error",
    [DATA_MODES.NOT_CONFIGURED]: "badge-source-not-configured"
  })[normalizeDataMode(mode)] || "badge-source-not-configured";
}

export function normalizeDataMode(value = "") {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return DATA_MODES.NOT_CONFIGURED;
  if (/^no[-\s]?data|no portfolio|not loaded/.test(text)) return DATA_MODES.NO_DATA;
  if (/live[-\s]?ready|configured|configured-not-connected/.test(text)) return DATA_MODES.NOT_CONFIGURED;
  if (/rate[-\s]?limited|rate limit|quota|too many requests|429/.test(text)) return DATA_MODES.RATE_LIMITED;
  if (/partial|missing quote|missing quotes|some requested tickers|quote missing|\bmissing\b/.test(text)) return DATA_MODES.PARTIAL;
  if (/error|failed|failure/.test(text)) return DATA_MODES.ERROR;
  if (/stale|expired/.test(text)) return DATA_MODES.STALE;
  if (/cached|cache/.test(text)) return DATA_MODES.CACHED;
  if (/not configured|not connected|missing key|setup|required|disabled|future source|configurable/.test(text)) return DATA_MODES.NOT_CONFIGURED;
  if (/live|connected|provider data synced|public provider|server-side live/.test(text)) return DATA_MODES.LIVE;
  if (/import|csv|xlsx|manual|local[-\s]?file|local data|persisted local|authorized export/.test(text)) return DATA_MODES.IMPORTED;
  if (/sample|demo|mock/.test(text)) return DATA_MODES.SAMPLE;
  return DATA_MODES.NOT_CONFIGURED;
}

export function portfolioDataMode(portfolioStatus = {}, report = null) {
  const uiState = String(portfolioStatus?.uiState || "");
  if (uiState === "NO_DATA") return DATA_MODES.NO_DATA;
  if (uiState === "SAMPLE_MODE") return DATA_MODES.SAMPLE;
  if (uiState === "IMPORT_FAILED") return DATA_MODES.ERROR;
  if (uiState === "STALE_PERSISTED_REPAIRED") return DATA_MODES.IMPORTED;
  if (/^IMPORTED/.test(uiState) || report?.realPortfolioImport || portfolioStatus?.realPortfolio) return DATA_MODES.IMPORTED;
  if (portfolioStatus?.samplePortfolio) return DATA_MODES.SAMPLE;
  return DATA_MODES.NO_DATA;
}

export function marketDataMode(status = {}, quote = {}) {
  if (status?.status === "rate limited") return DATA_MODES.RATE_LIMITED;
  if (status?.status === "partial data") return DATA_MODES.PARTIAL;
  if (status?.status === "missing" || quote?.status === "missing" || quote?.dataFreshness === "missing" || quote?.cacheStatus === "missing") return DATA_MODES.PARTIAL;
  if (status?.status === "cached") return DATA_MODES.CACHED;
  if (status?.status === "error" || quote?.dataFreshness === "error" || quote?.cacheStatus === "error") return DATA_MODES.ERROR;
  if (status?.status === "stale data" || status?.dataFreshness === "stale" || status?.cacheStatus === "stale" || quote?.dataFreshness === "stale" || quote?.cacheStatus === "stale") return DATA_MODES.STALE;
  if (status?.dataFreshness === "cached" || status?.cacheStatus === "cached" || quote?.dataFreshness === "cached" || quote?.cacheStatus === "cached") return DATA_MODES.CACHED;
  if (status?.dataFreshness === "live" || status?.cacheStatus === "live" || quote?.dataFreshness === "live" || quote?.cacheStatus === "live") return DATA_MODES.LIVE;
  if (status?.status === "connected") return DATA_MODES.LIVE;
  if (status?.status === "mock/sample mode" || quote?.isMock || quote?.sourceMode === "mock") return DATA_MODES.SAMPLE;
  if (status?.status === "configured-not-connected" || status?.status === "not configured") return DATA_MODES.NOT_CONFIGURED;
  return normalizeDataMode(status?.label || status?.status || status?.detail || "");
}

export function sourceDataMode(source = {}) {
  if (source.dataFreshness) return normalizeDataMode(source.dataFreshness);
  if (source.cacheStatus) return normalizeDataMode(source.cacheStatus);
  if (source.status) return normalizeDataMode(source.status);
  if (source.mode) return normalizeDataMode(source.mode);
  if (source.connected || source.live || source.liveProviderCalls) return DATA_MODES.LIVE;
  if (source.imported || source.tradesImported || source.mentionsImported || source.connectedLocal) return DATA_MODES.IMPORTED;
  if (source.demoReady || source.sample || source.mock) return DATA_MODES.SAMPLE;
  if (source.configured || source.configuredPending) return DATA_MODES.NOT_CONFIGURED;
  return DATA_MODES.NOT_CONFIGURED;
}
