import { isUsableCredentialValue, usableCredentialValue } from "./configValueSafety.js";
import { normalizeTicker, numberFrom } from "./portfolioSchema.js";

export const MARKET_DATA_PROVIDER_STATUSES = Object.freeze({
  NOT_CONFIGURED: "not configured",
  CONFIGURED_NOT_CONNECTED: "configured-not-connected",
  LIVE_READY: "live-ready",
  MOCK: "mock/sample mode",
  CONNECTED: "connected",
  CACHED: "cached",
  ERROR: "error",
  STALE: "stale data",
  RATE_LIMITED: "rate limited",
  PARTIAL: "partial data"
});

export const DEFAULT_MARKET_DATA_WATCHLIST = Object.freeze(["MU", "NVDA", "AMD", "SOXL", "UPRO", "VGT", "CRDO", "QQQ", "TQQQ"]);
export const RECOMMENDED_MARKET_DATA_PROVIDER_ID = "finnhub";
export const FINNHUB_BASE_URL = "https://finnhub.io/api/v1";
export const FINANCIAL_MODELING_PREP_BASE_URL = "https://financialmodelingprep.com/stable";
export const MARKET_DATA_CACHE_DEFAULTS = Object.freeze({
  quoteTtlMs: 5 * 60 * 1000,
  profileTtlMs: 24 * 60 * 60 * 1000,
  historyTtlMs: 12 * 60 * 60 * 1000
});
export const MARKET_DATA_REQUEST_BUDGET_DEFAULTS = Object.freeze({
  maxQuoteTickers: 50,
  enrichmentTickerLimit: 8
});

export const MARKET_DATA_PROVIDER_CONFIGS = Object.freeze({
  finnhub: {
    id: "finnhub",
    aliases: ["finnhub-io", "finnhub_io"],
    label: "Finnhub",
    recommendation: "Recommended first provider",
    requiredEnv: ["FINNHUB_API_KEY"],
    optionalEnvAliases: [],
    sourceTypes: ["quote", "profile", "historical-prices"],
    capabilities: ["quote/current price", "daily price change", "open/high/low", "previous close", "market cap", "volume", "sector/industry", "historical candles"],
    fit: "Best first fit for Tucker's live quote layer because the official quote, company profile, and candle endpoints map cleanly into the local market data contract.",
    liveEnabled: true
  },
  financialModelingPrep: {
    id: "financialModelingPrep",
    aliases: ["fmp", "financial-modeling-prep", "financial_modeling_prep"],
    label: "Financial Modeling Prep",
    recommendation: "Supported live fallback",
    requiredEnv: ["FINANCIAL_MODELING_PREP_API_KEY"],
    optionalEnvAliases: ["FMP_API_KEY"],
    sourceTypes: ["quote", "profile", "historical-prices"],
    capabilities: ["quote/current price", "daily price change", "market cap", "volume", "sector/industry", "52-week high/low", "historical prices"],
    fit: "Best first fit for this dashboard because quotes, company profile, market cap, sector/industry, and historical prices can map cleanly into one normalized adapter.",
    liveEnabled: true
  },
  alphaVantage: {
    id: "alphaVantage",
    aliases: ["alpha-vantage", "alpha_vantage"],
    label: "Alpha Vantage",
    recommendation: "Good fallback for quote/history; fundamentals require separate endpoint mapping.",
    requiredEnv: ["ALPHA_VANTAGE_API_KEY"],
    optionalEnvAliases: [],
    sourceTypes: ["quote", "historical-prices", "company-overview"],
    capabilities: ["quote/current price", "daily price change", "volume", "company overview", "daily/weekly/monthly historical prices"],
    fit: "Already represented for market events/news; quote data is straightforward but provider limits and endpoint splits make it a second choice for the first quote layer.",
    liveEnabled: false
  },
  polygon: {
    id: "polygon",
    aliases: [],
    label: "Polygon",
    recommendation: "Strong market-data infrastructure; better after the app needs richer paid-grade data.",
    requiredEnv: ["POLYGON_API_KEY"],
    optionalEnvAliases: [],
    sourceTypes: ["quote", "reference", "historical-prices"],
    capabilities: ["quote/current price", "daily price change", "volume", "reference data", "historical prices"],
    fit: "High-quality provider path, but likely more than the first local dashboard slice needs.",
    liveEnabled: false
  },
  twelveData: {
    id: "twelveData",
    aliases: ["twelve-data", "twelve_data"],
    label: "Twelve Data",
    recommendation: "Good quote/time-series fallback; profile/fundamental coverage needs extra validation.",
    requiredEnv: ["TWELVE_DATA_API_KEY"],
    optionalEnvAliases: [],
    sourceTypes: ["quote", "time-series"],
    capabilities: ["quote/current price", "daily price change", "volume", "historical prices"],
    fit: "Useful for quotes and time series, but less direct for the profile fields Tucker wants on holdings.",
    liveEnabled: false
  },
  yahooUnofficial: {
    id: "yahooUnofficial",
    aliases: ["yahoo", "yahoo-style", "yahoo_unofficial"],
    label: "Yahoo-style unofficial sources",
    recommendation: "Non-primary fallback only",
    requiredEnv: [],
    optionalEnvAliases: [],
    sourceTypes: ["quote", "historical-prices"],
    capabilities: ["quote/current price", "historical prices"],
    fit: "Must stay isolated as a non-primary fallback because it is unofficial and not a licensed provider path.",
    liveEnabled: false,
    disabled: true
  }
});

export function supportedMarketDataProviderIds() {
  return Object.keys(MARKET_DATA_PROVIDER_CONFIGS);
}

export function normalizeMarketDataProviderId(value = "") {
  const normalized = String(value || "").trim();
  if (!normalized) return RECOMMENDED_MARKET_DATA_PROVIDER_ID;
  if (MARKET_DATA_PROVIDER_CONFIGS[normalized]) return normalized;
  const lowered = normalized.toLowerCase();
  const match = Object.values(MARKET_DATA_PROVIDER_CONFIGS).find((spec) =>
    spec.id.toLowerCase() === lowered ||
    spec.label.toLowerCase() === lowered ||
    spec.aliases?.some((alias) => alias.toLowerCase() === lowered)
  );
  return match?.id || RECOMMENDED_MARKET_DATA_PROVIDER_ID;
}

export function selectedMarketDataProviderSpec(env = {}) {
  return MARKET_DATA_PROVIDER_CONFIGS[normalizeMarketDataProviderId(env.MARKET_DATA_PROVIDER)];
}

export function buildMarketDataProviderStatuses(env = {}) {
  return Object.fromEntries(Object.values(MARKET_DATA_PROVIDER_CONFIGS).map((spec) => {
    const credential = providerCredentialStatus(env, spec);
    const selected = selectedMarketDataProviderSpec(env).id === spec.id;
    const liveEnabled = Boolean(spec.liveEnabled && !spec.disabled);
    const liveProviderCalls = Boolean(liveEnabled && credential.configured);
    return [spec.id, {
      id: spec.id,
      label: spec.label,
      selected,
      configured: credential.configured,
      disabled: Boolean(spec.disabled),
      liveEnabled,
      liveProviderCalls,
      mode: spec.disabled ? "disabled" : liveProviderCalls ? "live-ready" : "config-only",
      sourceTypes: spec.sourceTypes,
      capabilities: spec.capabilities,
      requiredEnv: spec.requiredEnv,
      optionalEnvAliases: spec.optionalEnvAliases || [],
      missingEnv: credential.missingEnv,
      credentialLocation: "server-only .env",
      recommendation: spec.recommendation,
      fit: spec.fit,
      status: spec.disabled
        ? "disabled"
        : liveProviderCalls
        ? MARKET_DATA_PROVIDER_STATUSES.LIVE_READY
        : credential.configured
        ? MARKET_DATA_PROVIDER_STATUSES.CONFIGURED_NOT_CONNECTED
        : MARKET_DATA_PROVIDER_STATUSES.NOT_CONFIGURED,
      warning: marketDataProviderWarning(spec, credential)
    }];
  }));
}

export function buildMarketDataProviderConfig(env = {}) {
  const selected = selectedMarketDataProviderSpec(env);
  const statuses = buildMarketDataProviderStatuses(env);
  const selectedStatus = statuses[selected.id];
  const unsupportedProvider = Boolean(env.MARKET_DATA_PROVIDER) && !isKnownMarketDataProviderName(env.MARKET_DATA_PROVIDER);
  return {
    selectedProvider: selected.id,
    selectedLabel: selected.label,
    recommendedProvider: RECOMMENDED_MARKET_DATA_PROVIDER_ID,
    recommendedLabel: MARKET_DATA_PROVIDER_CONFIGS[RECOMMENDED_MARKET_DATA_PROVIDER_ID].label,
    configured: selectedStatus.configured,
    disabled: selectedStatus.disabled,
    liveEnabled: Boolean(selectedStatus.liveEnabled),
    liveProviderCalls: Boolean(selectedStatus.liveProviderCalls),
    exposesSecretValues: false,
    status: selectedStatus.status,
    cacheTtls: marketDataCacheTtlConfig(env),
    label: selectedStatus.disabled
      ? "Market data source disabled"
      : selectedStatus.configured
      ? selectedStatus.liveProviderCalls
        ? "Market data configured for live quotes"
        : "Market data not configured"
      : "Market data not configured",
    detail: selectedStatus.disabled
      ? `${selected.label} is isolated as a non-primary fallback. Choose a licensed provider before enabling live market data.`
      : selectedStatus.configured
      ? selectedStatus.liveProviderCalls
        ? `${selected.label} credentials are detected on the local backend. Quotes are fetched only through the local /api/market-data/quotes proxy; API keys are never sent to browser code.`
        : `${selected.label} credentials are detected on the local backend, but live quote calls are disabled for this provider.`
      : `Recommended first provider: ${MARKET_DATA_PROVIDER_CONFIGS[RECOMMENDED_MARKET_DATA_PROVIDER_ID].label}. Add ${selected.requiredEnv.join(" or ")} to local .env later; Sample market data remains active until then.`,
    missingEnv: selectedStatus.missingEnv,
    sourceTypes: selectedStatus.sourceTypes,
    capabilities: selectedStatus.capabilities,
    requestBudget: marketDataRequestBudgetConfig(env),
    fallbackProviderIds: marketDataFallbackProviderIds(env),
    warning: unsupportedProvider
      ? `Unsupported MARKET_DATA_PROVIDER=${env.MARKET_DATA_PROVIDER}; safely using ${selected.label} config defaults.`
      : selectedStatus.warning
  };
}

export function marketDataCacheTtlConfig(env = {}) {
  return normalizeMarketDataCacheTtls({
    quoteTtlMs: minutesToMs(env.MARKET_DATA_QUOTE_TTL_MINUTES ?? env.MARKET_DATA_QUOTES_TTL_MINUTES, MARKET_DATA_CACHE_DEFAULTS.quoteTtlMs),
    profileTtlMs: hoursToMs(env.MARKET_DATA_PROFILE_TTL_HOURS ?? env.MARKET_DATA_PROFILES_TTL_HOURS, MARKET_DATA_CACHE_DEFAULTS.profileTtlMs),
    historyTtlMs: hoursToMs(env.MARKET_DATA_HISTORY_TTL_HOURS ?? env.MARKET_DATA_HISTORICAL_TTL_HOURS, MARKET_DATA_CACHE_DEFAULTS.historyTtlMs)
  });
}

export function normalizeMarketDataCacheTtls(value = {}) {
  return {
    quoteTtlMs: positiveNumber(value.quoteTtlMs, MARKET_DATA_CACHE_DEFAULTS.quoteTtlMs),
    profileTtlMs: positiveNumber(value.profileTtlMs, MARKET_DATA_CACHE_DEFAULTS.profileTtlMs),
    historyTtlMs: positiveNumber(value.historyTtlMs, MARKET_DATA_CACHE_DEFAULTS.historyTtlMs)
  };
}

export function marketDataRequestBudgetConfig(env = {}) {
  return {
    maxQuoteTickers: positiveInteger(env.MARKET_DATA_MAX_QUOTE_TICKERS, MARKET_DATA_REQUEST_BUDGET_DEFAULTS.maxQuoteTickers),
    enrichmentTickerLimit: positiveInteger(env.MARKET_DATA_ENRICHMENT_TICKER_LIMIT, MARKET_DATA_REQUEST_BUDGET_DEFAULTS.enrichmentTickerLimit)
  };
}

export function marketDataFallbackProviderIds(env = {}) {
  const selectedId = selectedMarketDataProviderSpec(env).id;
  const raw = env.MARKET_DATA_FALLBACK_PROVIDERS ?? env.MARKET_DATA_FALLBACK_PROVIDER ?? "";
  const requested = String(raw || "")
    .split(",")
    .map((value) => normalizeMarketDataProviderId(value))
    .filter(Boolean);
  return [...new Set(requested)].filter((id) => {
    const spec = MARKET_DATA_PROVIDER_CONFIGS[id];
    return spec && id !== selectedId && spec.liveEnabled && !spec.disabled;
  });
}

export function createMarketDataCache(options = {}) {
  const entries = new Map();
  const defaultTtls = normalizeMarketDataCacheTtls(options.ttlConfig || options);
  let lastSuccessfulRefresh = null;
  let lastError = null;
  const lastErrorsByProvider = new Map();

  return {
    defaultTtls,
    get(providerId, type, ticker, options = {}) {
      const cacheKey = marketDataCacheKey(providerId, type, ticker);
      const entry = entries.get(cacheKey);
      if (!entry) {
        return { state: "miss", hit: false, stale: false, entry: null, value: null };
      }
      const ttlMs = positiveNumber(options.ttlMs, defaultTtls[`${type}TtlMs`] || MARKET_DATA_CACHE_DEFAULTS.quoteTtlMs);
      const now = new Date(options.now || new Date().toISOString()).getTime();
      const fetchedAt = new Date(entry.fetchedAt || 0).getTime();
      const ageMs = Math.max(0, now - fetchedAt);
      const stale = ageMs > ttlMs;
      return {
        state: stale ? "stale" : "hit",
        hit: !stale,
        stale,
        entry,
        value: cloneCacheValue(entry.value),
        fetchedAt: entry.fetchedAt,
        ageMs,
        ttlMs
      };
    },
    set(providerId, type, ticker, value, options = {}) {
      const fetchedAt = options.fetchedAt || options.now || new Date().toISOString();
      const cacheKey = marketDataCacheKey(providerId, type, ticker);
      const entry = {
        providerId,
        type,
        ticker: normalizeTicker(ticker),
        value: cloneCacheValue(value),
        fetchedAt
      };
      entries.set(cacheKey, entry);
      lastSuccessfulRefresh = fetchedAt;
      return entry;
    },
    recordError(error, options = {}) {
      lastError = {
        message: redactProviderSecret(error?.message || String(error || "market data cache refresh failed")),
        at: options.at || options.now || new Date().toISOString(),
        providerId: options.providerId || "unknown-provider"
      };
      lastErrorsByProvider.set(lastError.providerId, { ...lastError });
      return lastError;
    },
    stats(options = {}) {
      const scopedLastError = options.providerId ? lastErrorsByProvider.get(options.providerId) || null : lastError;
      return {
        size: entries.size,
        lastSuccessfulRefresh,
        lastError: scopedLastError ? { ...scopedLastError } : null,
        ttlConfig: { ...defaultTtls }
      };
    },
    clear() {
      entries.clear();
      lastSuccessfulRefresh = null;
      lastError = null;
      lastErrorsByProvider.clear();
    }
  };
}

function isKnownMarketDataProviderName(value = "") {
  const normalized = String(value || "").trim();
  if (!normalized) return true;
  if (MARKET_DATA_PROVIDER_CONFIGS[normalized]) return true;
  const lowered = normalized.toLowerCase();
  return Object.values(MARKET_DATA_PROVIDER_CONFIGS).some((spec) =>
    spec.id.toLowerCase() === lowered ||
    spec.label.toLowerCase() === lowered ||
    spec.aliases?.some((alias) => alias.toLowerCase() === lowered)
  );
}

export function mockMarketDataRows(options = {}) {
  const asOf = options.asOf || new Date().toISOString();
  return [
    mockQuote("MU", "Micron Technology, Inc.", 132.1, 2.18, {
      marketCap: 147_000_000_000,
      volume: 24_600_000,
      averageVolume: 19_800_000,
      sector: "Semiconductors",
      industry: "Memory semiconductors",
      fiftyTwoWeekHigh: 157.54,
      fiftyTwoWeekLow: 84.12,
      historicalCloses: [121.6, 123.4, 126.8, 127.9, 129.2, 130.6, 132.1],
      asOf
    }),
    mockQuote("NVDA", "NVIDIA Corporation", 1014, 10.42, {
      marketCap: 2_495_000_000_000,
      volume: 37_200_000,
      averageVolume: 44_500_000,
      sector: "Semiconductors",
      industry: "AI accelerators",
      fiftyTwoWeekHigh: 1063.2,
      fiftyTwoWeekLow: 389.1,
      historicalCloses: [946, 958, 977, 984, 1001, 1004, 1014],
      asOf
    }),
    mockQuote("AMD", "Advanced Micro Devices, Inc.", 164.5, -1.31, {
      marketCap: 266_000_000_000,
      volume: 46_800_000,
      averageVolume: 51_400_000,
      sector: "Semiconductors",
      industry: "CPUs and GPUs",
      fiftyTwoWeekHigh: 227.3,
      fiftyTwoWeekLow: 93.4,
      historicalCloses: [169.8, 168.2, 166.7, 167.1, 165.3, 165.8, 164.5],
      asOf
    }),
    mockQuote("SOXL", "Direxion Daily Semiconductor Bull 3X Shares", 52.8, -2.12, {
      marketCap: 11_300_000_000,
      volume: 91_000_000,
      averageVolume: 84_000_000,
      sector: "Semiconductors",
      industry: "Leveraged semiconductor ETF",
      fiftyTwoWeekHigh: 70.08,
      fiftyTwoWeekLow: 18.43,
      historicalCloses: [57.3, 56.8, 55.1, 54.2, 53.7, 54.9, 52.8],
      asOf
    }),
    mockQuote("UPRO", "ProShares UltraPro S&P500", 78.4, -0.52, {
      marketCap: 4_100_000_000,
      volume: 8_400_000,
      averageVolume: 7_900_000,
      sector: "Broad market",
      industry: "Leveraged S&P 500 ETF",
      fiftyTwoWeekHigh: 83.25,
      fiftyTwoWeekLow: 42.17,
      historicalCloses: [79.7, 79.2, 80.1, 79.4, 78.9, 78.92, 78.4],
      asOf
    }),
    mockQuote("SPY", "SPDR S&P 500 ETF Trust", 632.4, 1.86, {
      marketCap: 610_000_000_000,
      volume: 58_000_000,
      averageVolume: 71_000_000,
      sector: "Broad market",
      industry: "S&P 500 ETF",
      fiftyTwoWeekHigh: 636.9,
      fiftyTwoWeekLow: 493.7,
      historicalCloses: [624.1, 625.8, 628.4, 627.9, 630.2, 630.54, 632.4],
      asOf
    }),
    mockQuote("DIA", "SPDR Dow Jones Industrial Average ETF Trust", 426.7, 0.52, {
      marketCap: 37_000_000_000,
      volume: 2_900_000,
      averageVolume: 3_400_000,
      sector: "Broad market",
      industry: "Dow industrials ETF",
      fiftyTwoWeekHigh: 433.4,
      fiftyTwoWeekLow: 363.2,
      historicalCloses: [424.8, 425.1, 426.3, 425.6, 426.1, 426.18, 426.7],
      asOf
    }),
    mockQuote("IWM", "iShares Russell 2000 ETF", 221.9, -0.38, {
      marketCap: 68_000_000_000,
      volume: 27_400_000,
      averageVolume: 31_900_000,
      sector: "Broad market",
      industry: "Small-cap ETF",
      fiftyTwoWeekHigh: 232.1,
      fiftyTwoWeekLow: 187.4,
      historicalCloses: [222.8, 223.4, 222.1, 221.6, 222.4, 222.28, 221.9],
      asOf
    }),
    mockQuote("VGT", "Vanguard Information Technology ETF", 612.3, 1.62, {
      marketCap: 83_000_000_000,
      volume: 420_000,
      averageVolume: 510_000,
      sector: "Mega-cap tech",
      industry: "Technology ETF",
      fiftyTwoWeekHigh: 638.9,
      fiftyTwoWeekLow: 427.4,
      historicalCloses: [600.1, 602.7, 606.3, 608.5, 609.4, 610.7, 612.3],
      asOf
    }),
    mockQuote("CRDO", "Credo Technology Group Holding Ltd", 64.2, 3.45, {
      marketCap: 10_600_000_000,
      volume: 6_700_000,
      averageVolume: 5_900_000,
      sector: "AI networking",
      industry: "High-speed connectivity",
      fiftyTwoWeekHigh: 72.8,
      fiftyTwoWeekLow: 16.82,
      historicalCloses: [56.2, 57.8, 59.1, 61.4, 60.9, 62.1, 64.2],
      asOf
    }),
    mockQuote("QQQ", "Invesco QQQ Trust", 472.9, 0.84, {
      marketCap: 284_000_000_000,
      volume: 28_000_000,
      averageVolume: 32_000_000,
      sector: "Mega-cap tech",
      industry: "Nasdaq 100 ETF",
      fiftyTwoWeekHigh: 489.6,
      fiftyTwoWeekLow: 342.2,
      historicalCloses: [466.7, 468.1, 470.8, 471.2, 470.9, 472.1, 472.9],
      asOf
    }),
    mockQuote("SMH", "VanEck Semiconductor ETF", 284.6, -1.72, {
      marketCap: 26_000_000_000,
      volume: 9_600_000,
      averageVolume: 10_800_000,
      sector: "Semiconductors",
      industry: "Semiconductor ETF",
      fiftyTwoWeekHigh: 292.4,
      fiftyTwoWeekLow: 171.9,
      historicalCloses: [288.4, 287.1, 285.8, 286.7, 284.9, 286.32, 284.6],
      asOf
    }),
    mockQuote("SOXX", "iShares Semiconductor ETF", 246.2, -1.08, {
      marketCap: 14_300_000_000,
      volume: 4_200_000,
      averageVolume: 5_100_000,
      sector: "Semiconductors",
      industry: "Semiconductor ETF",
      fiftyTwoWeekHigh: 253.2,
      fiftyTwoWeekLow: 157.8,
      historicalCloses: [248.7, 247.4, 246.9, 247.8, 246.1, 247.28, 246.2],
      asOf
    }),
    mockQuote("AAPL", "Apple Inc.", 198.4, 0.62, {
      marketCap: 3_040_000_000_000,
      volume: 49_200_000,
      averageVolume: 53_000_000,
      sector: "Mega-cap tech",
      industry: "Consumer technology",
      fiftyTwoWeekHigh: 237.5,
      fiftyTwoWeekLow: 164.1,
      historicalCloses: [195.8, 196.6, 197.1, 196.9, 197.8, 197.78, 198.4],
      asOf
    }),
    mockQuote("MSFT", "Microsoft Corporation", 489.5, 2.14, {
      marketCap: 3_640_000_000_000,
      volume: 21_400_000,
      averageVolume: 24_700_000,
      sector: "Mega-cap tech",
      industry: "Cloud software and AI",
      fiftyTwoWeekHigh: 497.1,
      fiftyTwoWeekLow: 358.9,
      historicalCloses: [481.2, 483.7, 485.1, 486.8, 487.4, 487.36, 489.5],
      asOf
    }),
    mockQuote("AVGO", "Broadcom Inc.", 1782.2, 13.4, {
      marketCap: 830_000_000_000,
      volume: 3_400_000,
      averageVolume: 3_900_000,
      sector: "Semiconductors",
      industry: "AI networking and custom silicon",
      fiftyTwoWeekHigh: 1851.6,
      fiftyTwoWeekLow: 792.3,
      historicalCloses: [1728, 1739.5, 1752.2, 1768.1, 1771.4, 1768.8, 1782.2],
      asOf
    }),
    mockQuote("TSM", "Taiwan Semiconductor Manufacturing Company", 173.6, -0.44, {
      marketCap: 900_000_000_000,
      volume: 12_300_000,
      averageVolume: 13_100_000,
      sector: "Semiconductors",
      industry: "Foundry",
      fiftyTwoWeekHigh: 184.9,
      fiftyTwoWeekLow: 92.2,
      historicalCloses: [174.8, 175.1, 174.2, 173.9, 174.6, 174.04, 173.6],
      asOf
    }),
    mockQuote("ASML", "ASML Holding N.V.", 1018.2, -5.8, {
      marketCap: 400_000_000_000,
      volume: 1_100_000,
      averageVolume: 1_400_000,
      sector: "Semiconductors",
      industry: "Lithography equipment",
      fiftyTwoWeekHigh: 1110.4,
      fiftyTwoWeekLow: 582.7,
      historicalCloses: [1027.4, 1021.8, 1019.3, 1025.1, 1022.7, 1024.0, 1018.2],
      asOf
    })
  ];
}

export function createMockMarketDataProvider(options = {}) {
  const fixtures = new Map(mockMarketDataRows(options).map((quote) => [quote.ticker, quote]));
  return {
    id: "mock-market-data",
    label: "Sample Market Data",
    mode: "mock",
    configured: true,
    liveProviderCalls: false,
    sourceTypes: ["quote", "price", "volume", "history"],
    getQuote(ticker) {
      const quote = fixtures.get(normalizeTicker(ticker));
      return quote ? { ...quote } : null;
    },
    getQuotes(tickers = []) {
      const requested = normalizeTickerList(tickers);
      const rows = requested.length ? requested.map((ticker) => fixtures.get(ticker)).filter(Boolean) : [...fixtures.values()];
      return rows.map((row) => ({ ...row }));
    },
    getHistoricalPrices(ticker) {
      const quote = fixtures.get(normalizeTicker(ticker));
      return quote?.historicalPrices ? [...quote.historicalPrices] : [];
    }
  };
}

export function createUnconfiguredMarketDataProvider() {
  return {
    id: "market-data-unconfigured",
    label: "Market data provider",
    mode: "not-configured",
    configured: false,
    liveProviderCalls: false,
    sourceTypes: ["quote", "price", "volume", "history"],
    getQuote() {
      return null;
    },
    getQuotes() {
      return [];
    },
    getHistoricalPrices() {
      return [];
    }
  };
}

export function createFinancialModelingPrepProvider(options = {}) {
  const env = options.env || {};
  const spec = MARKET_DATA_PROVIDER_CONFIGS.financialModelingPrep;
  const apiKey = usableCredentialValue(options.apiKey || providerCredentialValue(env, spec));
  const configured = Boolean(apiKey);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const baseUrl = String(options.baseUrl || FINANCIAL_MODELING_PREP_BASE_URL).replace(/\/+$/, "");
  const includeHistory = options.includeHistory !== false;
  const includeProfile = options.includeProfile !== false;
  const historyLimit = Number(options.historyLimit || 30);
  const ttlConfig = normalizeMarketDataCacheTtls(options.ttlConfig || marketDataCacheTtlConfig(env));
  const cache = options.cache || null;
  const nowFn = options.nowFn || (() => options.now || new Date().toISOString());

  return {
    id: spec.id,
    label: spec.label,
    mode: configured ? "live" : "not-configured",
    configured,
    liveProviderCalls: configured,
    sourceTypes: spec.sourceTypes,
    capabilities: spec.capabilities,
    requiredEnv: spec.requiredEnv,
    missingEnv: configured ? [] : spec.requiredEnv,
    cache,
    ttlConfig,
    redactError(error) {
      return safeProviderError(error, apiKey);
    },
    async getQuote(ticker) {
      const [quote] = await this.getQuotes([ticker]);
      return quote || null;
    },
    async getQuotes(tickers = []) {
      const requested = normalizeTickerList(tickers);
      if (!configured || requested.length === 0) return [];
      if (typeof fetchImpl !== "function") {
        throw new Error("Financial Modeling Prep fetch implementation is unavailable.");
      }
      return fetchFinancialModelingPrepQuotes({
        apiKey,
        baseUrl,
        fetchImpl,
        historyLimit,
        includeHistory,
        includeProfile,
        tickers: requested,
        cache,
        ttlConfig,
        providerId: spec.id,
        providerLabel: spec.label,
        now: nowFn()
      });
    },
    async getHistoricalPrices(ticker) {
      const normalizedTicker = normalizeTicker(ticker);
      if (!configured || !normalizedTicker) return [];
      if (typeof fetchImpl !== "function") {
        throw new Error("Financial Modeling Prep fetch implementation is unavailable.");
      }
      return fetchFinancialModelingPrepHistory({
        apiKey,
        baseUrl,
        fetchImpl,
        ticker: normalizedTicker,
        limit: historyLimit,
        cache,
        ttlConfig,
        providerId: spec.id,
        now: nowFn()
      });
    }
  };
}

export function createFinnhubProvider(options = {}) {
  const env = options.env || {};
  const spec = MARKET_DATA_PROVIDER_CONFIGS.finnhub;
  const apiKey = usableCredentialValue(options.apiKey || providerCredentialValue(env, spec));
  const configured = Boolean(apiKey);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const baseUrl = String(options.baseUrl || FINNHUB_BASE_URL).replace(/\/+$/, "");
  const includeHistory = options.includeHistory !== false;
  const includeProfile = options.includeProfile !== false;
  const historyLimit = Number(options.historyLimit || 30);
  const ttlConfig = normalizeMarketDataCacheTtls(options.ttlConfig || marketDataCacheTtlConfig(env));
  const requestBudget = {
    ...marketDataRequestBudgetConfig(env),
    ...(options.requestBudget || {})
  };
  const cache = options.cache || null;
  const nowFn = options.nowFn || (() => options.now || new Date().toISOString());

  return {
    id: spec.id,
    label: spec.label,
    mode: configured ? "live" : "not-configured",
    configured,
    liveProviderCalls: configured,
    sourceTypes: spec.sourceTypes,
    capabilities: spec.capabilities,
    requiredEnv: spec.requiredEnv,
    missingEnv: configured ? [] : spec.requiredEnv,
    cache,
    ttlConfig,
    requestBudget,
    redactError(error) {
      return safeProviderError(error, apiKey);
    },
    async getQuote(ticker) {
      const [quote] = await this.getQuotes([ticker]);
      return quote || null;
    },
    async getQuotes(tickers = []) {
      const requested = normalizeTickerList(tickers);
      if (!configured || requested.length === 0) return [];
      if (typeof fetchImpl !== "function") {
        throw new Error("Finnhub fetch implementation is unavailable.");
      }
      return fetchFinnhubQuotes({
        apiKey,
        baseUrl,
        cache,
        fetchImpl,
        historyLimit,
        includeHistory,
        includeProfile,
        now: nowFn(),
        providerId: spec.id,
        providerLabel: spec.label,
        tickers: requested,
        ttlConfig,
        requestBudget
      });
    },
    async getHistoricalPrices(ticker) {
      const normalizedTicker = normalizeTicker(ticker);
      if (!configured || !normalizedTicker) return [];
      if (typeof fetchImpl !== "function") {
        throw new Error("Finnhub fetch implementation is unavailable.");
      }
      return fetchFinnhubHistory({
        apiKey,
        baseUrl,
        cache,
        fetchImpl,
        limit: historyLimit,
        now: nowFn(),
        providerId: spec.id,
        ticker: normalizedTicker,
        ttlConfig
      });
    }
  };
}

export function createMarketDataProviderFromConfig(env = {}, options = {}) {
  const selected = selectedMarketDataProviderSpec(env);
  return createMarketDataProviderById(selected.id, env, options);
}

export function createMarketDataProviderById(providerId, env = {}, options = {}) {
  const selected = MARKET_DATA_PROVIDER_CONFIGS[normalizeMarketDataProviderId(providerId)];
  if (selected.id === "finnhub") {
    return createFinnhubProvider({ env, ...options });
  }
  if (selected.id === "financialModelingPrep") {
    return createFinancialModelingPrepProvider({ env, ...options });
  }
  return createUnconfiguredMarketDataProvider();
}

export function buildMockMarketDataSnapshot(tickers = DEFAULT_MARKET_DATA_WATCHLIST, options = {}) {
  const provider = createMockMarketDataProvider(options);
  const requestedTickers = normalizeTickerList(tickers);
  const quotes = provider.getQuotes(tickers).map((quote) => normalizeMarketQuote(quote, {
    providerId: provider.id,
    providerLabel: provider.label,
    mode: provider.mode,
    asOf: options.asOf,
    source: "mock-market-data"
  }));
  return buildMarketDataSnapshot({ provider, quotes, asOf: options.asOf, now: options.now || options.asOf, requestedTickers });
}

export async function fetchMarketDataSnapshot({ provider = createUnconfiguredMarketDataProvider(), tickers = [], asOf, now } = {}) {
  const requestedTickers = normalizeTickerList(tickers);
  if (provider.configured && provider.liveProviderCalls === false && provider.mode !== "mock") {
    return buildMarketDataSnapshot({ provider, quotes: [], asOf, now, requestedTickers });
  }
  try {
    const rawQuotes = await provider.getQuotes(requestedTickers);
    const quotes = rawQuotes.map((quote) => normalizeMarketQuote(quote, {
      providerId: provider.id,
      providerLabel: provider.label,
      mode: provider.mode || "live",
      asOf,
      source: provider.id
    }));
    return buildMarketDataSnapshot({ provider, quotes, asOf, now, requestedTickers });
  } catch (error) {
    const safeError = provider.redactError?.(error) || safeProviderError(error);
    provider.cache?.recordError?.(safeError, { now, providerId: provider.id });
    return buildMarketDataSnapshot({
      provider,
      quotes: [],
      asOf,
      now,
      requestedTickers,
      error: safeError.message || "market data provider failed"
    });
  }
}

export function normalizeMarketQuote(raw = {}, options = {}) {
  const ticker = normalizeTicker(raw.ticker || raw.symbol);
  const price = numberFrom(raw.price, raw.currentPrice, raw.lastPrice, raw.close);
  const previousClose = numberFrom(raw.previousClose, raw.prevClose, price - numberFrom(raw.dailyChange, raw.change));
  const explicitChange = raw.dailyChange ?? raw.change ?? raw.changeAmount;
  const dailyChange = explicitChange !== undefined ? numberFrom(explicitChange) : roundPrice(price - previousClose);
  const explicitPercent = raw.dailyChangePercent ?? raw.changePercent;
  const dailyChangePercent = explicitPercent !== undefined
    ? decimalPercent(explicitPercent)
    : previousClose ? dailyChange / previousClose : 0;
  const asOf = raw.asOf || raw.timestamp || options.asOf || new Date().toISOString();
  const historicalPrices = normalizeHistoricalPrices(raw.historicalPrices || raw.history || raw.prices, asOf);

  return pruneEmpty({
    id: raw.id || `quote:${ticker}`,
    ticker,
    name: raw.name || raw.companyName || ticker,
    price,
    previousClose,
    dailyChange,
    dailyChangePercent,
    dayOpen: numberFrom(raw.dayOpen, raw.open),
    dayHigh: numberFrom(raw.dayHigh, raw.high),
    dayLow: numberFrom(raw.dayLow, raw.low),
    marketCap: numberFrom(raw.marketCap, raw.market_cap),
    volume: numberFrom(raw.volume),
    averageVolume: numberFrom(raw.averageVolume, raw.avgVolume),
    sector: raw.sector || "Unknown",
    industry: raw.industry || "Unknown",
    fiftyTwoWeekHigh: numberFrom(raw.fiftyTwoWeekHigh, raw.week52High, raw.high52),
    fiftyTwoWeekLow: numberFrom(raw.fiftyTwoWeekLow, raw.week52Low, raw.low52),
    historicalPrices,
    providerId: options.providerId || raw.providerId || "unknown-provider",
    providerLabel: options.providerLabel || raw.providerLabel || "Market data provider",
    source: options.source || raw.source || "market-data",
    sourceMode: options.mode || raw.sourceMode || "unknown",
    dataFreshness: raw.dataFreshness || raw.cacheStatus || (options.mode === "mock" || raw.sourceMode === "mock" ? "mock" : "live"),
    cacheStatus: raw.cacheStatus || (options.mode === "mock" || raw.sourceMode === "mock" ? "mock" : "live"),
    fetchedAt: raw.fetchedAt,
    resourceFreshness: raw.resourceFreshness,
    requestBudget: raw.requestBudget,
    deferredEnrichmentTickers: raw.deferredEnrichmentTickers,
    providerName: raw.providerName || options.providerLabel || raw.providerLabel,
    lastSuccessfulRefresh: raw.lastSuccessfulRefresh,
    lastError: raw.lastError,
    isMock: (options.mode || raw.sourceMode) === "mock" || Boolean(raw.isMock),
    liveProviderCalls: Boolean(raw.liveProviderCalls),
    asOf,
    staleAfter: raw.staleAfter || staleAfter(asOf, 24)
  });
}

export function buildMarketDataSnapshot({ provider = createUnconfiguredMarketDataProvider(), quotes = [], asOf, now, error = "", requestedTickers = [] } = {}) {
  const normalizedQuotes = quotes.map((quote) => normalizeMarketQuote(quote, {
    providerId: provider.id,
    providerLabel: provider.label,
    mode: provider.mode,
    asOf,
    source: provider.id
  }));
  const requested = normalizeTickerList(requestedTickers);
  const received = new Set(normalizedQuotes.map((quote) => normalizeTicker(quote.ticker)).filter(Boolean));
  const missingTickers = requested.filter((ticker) => !received.has(ticker));
  const cacheSummary = summarizeMarketDataCache(provider, normalizedQuotes);
  const snapshot = {
    providerId: provider.id || "unknown-provider",
    providerLabel: provider.label || "Market data provider",
    mode: provider.mode || "not-configured",
    configured: Boolean(provider.configured),
    liveProviderCalls: Boolean(provider.liveProviderCalls),
    asOf: asOf || normalizedQuotes[0]?.asOf || new Date().toISOString(),
    fetchedAt: cacheSummary.fetchedAt || normalizedQuotes[0]?.fetchedAt || asOf || new Date().toISOString(),
    dataFreshness: cacheSummary.freshness,
    cache: cacheSummary,
    lastSuccessfulRefresh: cacheSummary.lastSuccessfulRefresh,
    lastError: cacheSummary.lastError,
    quotes: normalizedQuotes,
    quotesByTicker: Object.fromEntries(normalizedQuotes.map((quote) => [quote.ticker, quote])),
    requestedTickers: requested,
    missingTickers,
    warnings: missingTickers.length ? [`No normalized quote returned for ${missingTickers.join(", ")}.`] : [],
    error,
    sourceTypes: provider.sourceTypes || ["quote", "price"],
    status: null
  };
  snapshot.status = buildMarketDataStatus(snapshot, { now });
  return snapshot;
}

export function buildMarketDataStatus(snapshot = {}, options = {}) {
  const now = new Date(options.now || new Date().toISOString()).getTime();
  const newestAsOf = snapshot.quotes?.reduce((latest, quote) => Math.max(latest, new Date(quote.asOf || 0).getTime()), 0) || 0;
  const newestFetchedAt = newestDate([snapshot.fetchedAt, snapshot.lastSuccessfulRefresh, ...(snapshot.quotes || []).map((quote) => quote.fetchedAt)].filter(Boolean));
  const freshnessTime = snapshot.configured && snapshot.liveProviderCalls
    ? new Date(newestFetchedAt || newestAsOf || 0).getTime()
    : newestAsOf;
  const stale = snapshot.dataFreshness === "stale" || (freshnessTime ? now - freshnessTime > 24 * 60 * 60 * 1000 : false);
  if (snapshot.error) {
    if (isRateLimitMessage(snapshot.error)) {
      return status(MARKET_DATA_PROVIDER_STATUSES.RATE_LIMITED, "Market data rate limited", snapshot.error, snapshot);
    }
    return status("error", "Market data error", snapshot.error, snapshot);
  }
  if (!snapshot.configured && snapshot.mode !== "mock") {
    return status("not configured", "Market data not configured", "No live market data provider has been configured.", snapshot);
  }
  if (snapshot.configured && !snapshot.liveProviderCalls && snapshot.mode !== "mock") {
    return status(
      "configured-not-connected",
      "Market data not configured",
      "Provider credentials are detected on the local backend, but live quote calls are disabled until Tucker approves implementation.",
      snapshot
    );
  }
  if (stale) {
    return status("stale data", "Stale market data", snapshot.lastError?.message
      ? `Using stale cached market data because refresh failed: ${snapshot.lastError.message}`
      : "Market quotes are older than their configured freshness window.", snapshot);
  }
  if (snapshot.mode === "mock") {
    return status("mock/sample mode", "Sample market data", "Sample quote, volume, and price-change data. Live market data is not configured.", snapshot);
  }
  if (snapshot.configured && snapshot.liveProviderCalls && snapshot.quotes?.length > 0) {
    const partial = Boolean(snapshot.missingTickers?.length || snapshot.lastError?.message);
    if (partial) {
      const freshnessLabel = snapshot.dataFreshness === "cached" ? "Cached" : snapshot.dataFreshness === "stale" ? "Stale" : "Live";
      const missingDetail = snapshot.missingTickers?.length
        ? ` Missing quotes: ${snapshot.missingTickers.join(", ")}.`
        : "";
      const warningDetail = snapshot.lastError?.message
        ? ` Partial provider warning: ${snapshot.lastError.message}`
        : "";
      return status(
        MARKET_DATA_PROVIDER_STATUSES.PARTIAL,
        "Partial market data",
        `${freshnessLabel} provider data returned for some requested tickers.${missingDetail}${warningDetail}`,
        snapshot
      );
    }
    const cached = snapshot.dataFreshness === "cached";
    const label = cached ? "Cached market data" : "Live market data";
    const baseDetail = cached
      ? "Fresh cached quote data returned from the local backend cache."
      : "Provider returned normalized quote data through the local backend proxy.";
    const resourceDetail = marketDataResourceFreshnessDetail(snapshot);
    const missingDetail = snapshot.missingTickers?.length
      ? ` Missing quotes: ${snapshot.missingTickers.join(", ")}.`
      : "";
    const detail = snapshot.lastError?.message
      ? `${baseDetail}${resourceDetail}${missingDetail} Partial provider warning: ${snapshot.lastError.message}`
      : `${baseDetail}${resourceDetail}${missingDetail}`;
    return status(cached ? MARKET_DATA_PROVIDER_STATUSES.CACHED : MARKET_DATA_PROVIDER_STATUSES.CONNECTED, label, detail, snapshot);
  }
  if (snapshot.configured && snapshot.liveProviderCalls) {
    return status("error", "Market data unavailable", "Provider returned no normalized quote data for the requested tickers.", snapshot);
  }
  return status("not configured", "Market data not configured", "No live market data provider has been configured.", snapshot);
}

export function shouldPreserveMarketDataSnapshot(snapshot = {}) {
  if (!snapshot || typeof snapshot !== "object") return false;
  if (Array.isArray(snapshot.quotes) && snapshot.quotes.length > 0) return true;
  const status = String(snapshot.status?.status || "").toLowerCase();
  return [
    MARKET_DATA_PROVIDER_STATUSES.ERROR,
    MARKET_DATA_PROVIDER_STATUSES.STALE,
    MARKET_DATA_PROVIDER_STATUSES.RATE_LIMITED,
    MARKET_DATA_PROVIDER_STATUSES.PARTIAL,
    MARKET_DATA_PROVIDER_STATUSES.CONFIGURED_NOT_CONNECTED,
    MARKET_DATA_PROVIDER_STATUSES.NOT_CONFIGURED
  ].includes(status);
}

export function applyMarketDataToHoldings(holdings = [], snapshot = {}, options = {}) {
  const quotesByTicker = snapshot.quotesByTicker || Object.fromEntries((snapshot.quotes || []).map((quote) => [quote.ticker, quote]));
  const dailyChangeMode = options.dailyChangeMode || "fill-missing";
  const fillClassifications = options.fillClassifications !== false;
  return holdings.map((holding) => {
    const ticker = normalizeTicker(holding.ticker);
    const quote = quotesByTicker[ticker];
    if (!quote) {
      return {
        ...holding,
        marketDataStatus: "missing",
        marketDataMode: snapshot.mode || "not-configured"
      };
    }
    const shareMove = Number(holding.shares || 0) * Number(quote.dailyChange || 0);
    const existingDailyChange = Number(holding.dailyChange || 0);
    const existingDailyChangePercent = Number(holding.dailyChangePercent || 0);
    const hasExistingDailyMove = Math.abs(existingDailyChange) > 0 || Math.abs(existingDailyChangePercent) > 0;
    const shares = Number(holding.shares || 0);
    const quotePrice = Number(quote.price || 0);
    const markToMarket = shouldMarkHoldingToMarket(holding, quote, snapshot);
    const marketValue = markToMarket ? roundPrice(shares * quotePrice) : Number(holding.marketValue || 0);
    const useProviderMove = dailyChangeMode === "replace" ||
      (dailyChangeMode === "fill-missing" && !hasExistingDailyMove && holding.assetClass !== "Cash");
    const dailyChange = useProviderMove ? shareMove : existingDailyChange;
    const sector = fillClassifications && (!holding.sector || holding.sector === "Unknown") ? quote.sector : holding.sector;
    return pruneEmpty({
      ...holding,
      price: markToMarket ? quotePrice : holding.price,
      marketValue: markToMarket ? marketValue : holding.marketValue,
      dailyChange,
      dailyChangePercent: useProviderMove
        ? quote.dailyChangePercent || (marketValue ? dailyChange / marketValue : 0)
        : existingDailyChangePercent,
      sector,
      marketDataProvider: quote.providerLabel,
      marketDataProviderId: quote.providerId,
      marketDataMode: quote.sourceMode,
      marketDataStatus: snapshot.status?.status || MARKET_DATA_PROVIDER_STATUSES.MOCK,
      marketDataFreshness: quote.dataFreshness,
      marketDataCacheStatus: quote.cacheStatus,
      marketDataAsOf: quote.asOf,
      marketDataPrice: quote.price,
      marketDataDailyChange: quote.dailyChange,
      marketDataDailyChangePercent: quote.dailyChangePercent,
      marketDataMarketCap: quote.marketCap,
      marketDataVolume: quote.volume,
      marketDataAverageVolume: quote.averageVolume,
      marketDataIndustry: quote.industry,
      marketData52WeekHigh: quote.fiftyTwoWeekHigh,
      marketData52WeekLow: quote.fiftyTwoWeekLow,
      marketDataHistoricalPrices: quote.historicalPrices,
      marketDataIsMock: Boolean(quote.isMock),
      marketDataAppliedToDailyChange: useProviderMove,
      marketDataLastError: quote.lastError?.message || quote.lastError || "",
      dailyChangeSource: useProviderMove ? (quote.isMock ? "mock-market-data" : quote.providerId) : (holding.dailyChangeSource || holding.source || "imported-holding")
    });
  });
}

function shouldMarkHoldingToMarket(holding = {}, quote = {}, snapshot = {}) {
  const statusText = `${snapshot.status?.status || ""} ${snapshot.dataFreshness || ""} ${snapshot.cacheStatus || ""} ${quote.dataFreshness || ""} ${quote.cacheStatus || ""}`.toLowerCase();
  const trustedProviderPrice = Boolean(snapshot.liveProviderCalls || quote.liveProviderCalls || /connected|cached|partial data|live/.test(statusText));
  const staleOrUnavailable = /mock|sample|not configured|error|rate limited|stale/.test(statusText);
  return Boolean(
    trustedProviderPrice &&
    !staleOrUnavailable &&
    !quote.isMock &&
    !/cash/i.test(String(holding.assetClass || "")) &&
    Number(holding.shares || 0) > 0 &&
    Number(quote.price || 0) > 0
  );
}

export function marketDataQuoteForTicker(snapshot = {}, ticker = "") {
  return (snapshot.quotesByTicker || {})[normalizeTicker(ticker)] || null;
}

function mockQuote(ticker, name, price, dailyChange, details = {}) {
  const previousClose = price - dailyChange;
  const asOf = details.asOf || new Date().toISOString();
  return {
    ticker,
    name,
    price,
    previousClose,
    dailyChange,
    dailyChangePercent: previousClose ? dailyChange / previousClose : 0,
    marketCap: details.marketCap,
    volume: details.volume,
    averageVolume: details.averageVolume,
    sector: details.sector,
    industry: details.industry,
    fiftyTwoWeekHigh: details.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: details.fiftyTwoWeekLow,
    historicalPrices: normalizeHistoricalPrices(details.historicalCloses, asOf),
    sourceMode: "mock",
    isMock: true,
    liveProviderCalls: false,
    asOf
  };
}

function normalizeHistoricalPrices(values = [], asOf = new Date().toISOString()) {
  const list = Array.isArray(values) ? values : [];
  const end = new Date(asOf).getTime();
  return list.map((item, index) => {
    if (typeof item === "object" && item !== null) {
      const row = {
        date: item.date || item.timestamp || new Date(end - (list.length - index - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        close: numberFrom(item.close, item.price)
      };
      const open = numberFrom(item.open);
      const high = numberFrom(item.high);
      const low = numberFrom(item.low);
      const volume = numberFrom(item.volume);
      if (open > 0) row.open = open;
      if (high > 0) row.high = high;
      if (low > 0) row.low = low;
      if (volume > 0) row.volume = volume;
      return row;
    }
    return {
      date: new Date(end - (list.length - index - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      close: numberFrom(item)
    };
  }).filter((row) => row.close > 0);
}

export function normalizeFinancialModelingPrepQuote(rawQuote = {}, rawProfile = {}, historicalPrices = []) {
  const profileRange = parseFmpRange(rawProfile.range);
  const timestamp = rawQuote.timestamp
    ? new Date(Number(rawQuote.timestamp) * 1000).toISOString()
    : rawQuote.asOf;
  return {
    ticker: rawQuote.symbol,
    name: rawQuote.name || rawProfile.companyName || rawProfile.companyNameLong || rawQuote.symbol,
    price: rawQuote.price,
    previousClose: rawQuote.previousClose,
    dailyChange: rawQuote.change,
    dailyChangePercent: rawQuote.changesPercentage,
    marketCap: rawQuote.marketCap ?? rawProfile.mktCap,
    volume: rawQuote.volume,
    averageVolume: rawQuote.avgVolume ?? rawProfile.volAvg,
    sector: rawProfile.sector || rawQuote.sector,
    industry: rawProfile.industry || rawQuote.industry,
    fiftyTwoWeekHigh: rawQuote.yearHigh ?? rawQuote.fiftyTwoWeekHigh ?? profileRange.high,
    fiftyTwoWeekLow: rawQuote.yearLow ?? rawQuote.fiftyTwoWeekLow ?? profileRange.low,
    historicalPrices,
    sourceMode: "live",
    liveProviderCalls: true,
    asOf: timestamp || new Date().toISOString()
  };
}

export function normalizeFinancialModelingPrepHistory(payload = {}, limit = 30) {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.historical)
    ? payload.historical
    : Array.isArray(payload.data)
    ? payload.data
    : [];
  return rows
    .map((row) => ({
      date: row.date || row.timestamp,
      open: numberFrom(row.open),
      high: numberFrom(row.high),
      low: numberFrom(row.low),
      close: numberFrom(row.close, row.adjClose, row.price),
      volume: numberFrom(row.volume)
    }))
    .filter((row) => row.date && row.close > 0)
    .map((row) => pruneEmpty(row))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-Math.max(1, Number(limit) || 30));
}

export function normalizeFinnhubQuote(rawQuote = {}, rawProfile = {}, historicalPrices = [], rawMetrics = {}) {
  const timestamp = rawQuote.t
    ? new Date(Number(rawQuote.t) * 1000).toISOString()
    : rawQuote.asOf;
  const marketCap = normalizeFinnhubMarketCap(rawProfile.marketCapitalization);
  const latestHistorical = Array.isArray(historicalPrices) ? historicalPrices[historicalPrices.length - 1] : null;
  const metric = rawMetrics.metric || rawMetrics || {};
  return {
    ticker: rawQuote.symbol || rawProfile.ticker,
    name: rawProfile.name || rawQuote.name || rawQuote.symbol || rawProfile.ticker,
    price: rawQuote.c,
    previousClose: rawQuote.pc,
    dailyChange: rawQuote.d,
    dailyChangePercent: rawQuote.dp,
    dayOpen: rawQuote.o,
    dayHigh: rawQuote.h,
    dayLow: rawQuote.l,
    marketCap,
    volume: rawQuote.v ?? latestHistorical?.volume ?? rawProfile.volume,
    sector: rawProfile.ggroup || rawProfile.gsector || rawProfile.finnhubIndustry,
    industry: rawProfile.finnhubIndustry || rawProfile.industry,
    fiftyTwoWeekHigh: numberFrom(metric["52WeekHigh"], metric.fiftyTwoWeekHigh, metric.week52High),
    fiftyTwoWeekLow: numberFrom(metric["52WeekLow"], metric.fiftyTwoWeekLow, metric.week52Low),
    historicalPrices,
    sourceMode: "live",
    liveProviderCalls: true,
    asOf: timestamp || new Date().toISOString()
  };
}

export function normalizeFinnhubHistory(payload = {}, limit = 30) {
  const status = String(payload?.s || "").toLowerCase();
  if (status && status !== "ok") return [];
  const closes = Array.isArray(payload?.c) ? payload.c : [];
  const opens = Array.isArray(payload?.o) ? payload.o : [];
  const highs = Array.isArray(payload?.h) ? payload.h : [];
  const lows = Array.isArray(payload?.l) ? payload.l : [];
  const timestamps = Array.isArray(payload?.t) ? payload.t : [];
  const volumes = Array.isArray(payload?.v) ? payload.v : [];
  return closes
    .map((close, index) => {
      const row = {
        date: timestamps[index]
        ? new Date(Number(timestamps[index]) * 1000).toISOString().slice(0, 10)
        : "",
        close: numberFrom(close)
      };
      const open = numberFrom(opens[index]);
      const high = numberFrom(highs[index]);
      const low = numberFrom(lows[index]);
      const volume = numberFrom(volumes[index]);
      if (open > 0) row.open = open;
      if (high > 0) row.high = high;
      if (low > 0) row.low = low;
      if (volume > 0) row.volume = volume;
      return row;
    })
    .filter((row) => row.date && row.close > 0)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-Math.max(1, Number(limit) || 30));
}

async function fetchFinnhubQuotes({ apiKey, baseUrl, cache, fetchImpl, historyLimit, includeHistory, includeProfile, now, providerId, providerLabel, tickers, ttlConfig, requestBudget = MARKET_DATA_REQUEST_BUDGET_DEFAULTS }) {
  const enrichmentLimit = Math.max(0, Math.floor(Number(requestBudget.enrichmentTickerLimit ?? MARKET_DATA_REQUEST_BUDGET_DEFAULTS.enrichmentTickerLimit)));
  const enrichedTickers = new Set(tickers.slice(0, enrichmentLimit));
  const deferredEnrichmentTickers = includeProfile || includeHistory ? tickers.filter((ticker) => !enrichedTickers.has(ticker)) : [];
  const results = await Promise.allSettled(tickers.map(async (ticker) => {
    const enrichTicker = enrichedTickers.has(ticker);
    const shouldIncludeProfile = includeProfile && enrichTicker;
    const shouldIncludeHistory = includeHistory && enrichTicker;
    const quoteResult = await getFinnhubQuoteRow({
      apiKey,
      baseUrl,
      cache,
      fetchImpl,
      now,
      providerId,
      providerLabel,
      ticker,
      ttlMs: ttlConfig.quoteTtlMs
    });
    const [profileResult, metricResult, historyResult] = await Promise.all([
      shouldIncludeProfile
        ? getFinnhubProfileRow({ apiKey, baseUrl, cache, fetchImpl, now, providerId, ticker, ttlMs: ttlConfig.profileTtlMs })
        : Promise.resolve({ row: {}, cacheStatus: "disabled", fetchedAt: null, lastError: null }),
      shouldIncludeProfile
        ? getFinnhubMetricRow({ apiKey, baseUrl, cache, fetchImpl, now, providerId, ticker, ttlMs: ttlConfig.profileTtlMs })
        : Promise.resolve({ row: {}, cacheStatus: "disabled", fetchedAt: null, lastError: null }),
      shouldIncludeHistory
        ? getFinnhubHistoryRows({ apiKey, baseUrl, cache, fetchImpl, now, providerId, ticker, ttlMs: ttlConfig.historyTtlMs, limit: historyLimit })
        : Promise.resolve({ rows: [], cacheStatus: "disabled", fetchedAt: null, lastError: null })
    ]);
    const resourceFreshness = {
      quote: quoteResult.cacheStatus,
      profile: includeProfile ? shouldIncludeProfile ? profileResult.cacheStatus : "deferred" : "skipped",
      metric: includeProfile ? shouldIncludeProfile ? metricResult.cacheStatus : "deferred" : "skipped",
      history: includeHistory ? shouldIncludeHistory ? historyResult.cacheStatus : "deferred" : "skipped"
    };
    const freshness = combineFreshness([quoteResult.cacheStatus, shouldIncludeProfile ? profileResult.cacheStatus : "live", shouldIncludeProfile ? metricResult.cacheStatus : "live", shouldIncludeHistory ? historyResult.cacheStatus : "live"]);
    const quoteFetchedAt = quoteResult.cacheStatus === "stale"
      ? quoteResult.fetchedAt
      : newestDate([quoteResult.fetchedAt, profileResult.fetchedAt, metricResult.fetchedAt, historyResult.fetchedAt, now]) || now;
    return {
      ...normalizeFinnhubQuote({ ...quoteResult.row, symbol: ticker }, profileResult.row || {}, historyResult.rows || [], metricResult.row || {}),
      providerName: providerLabel,
      cacheStatus: freshness,
      dataFreshness: freshness,
      resourceFreshness,
      fetchedAt: quoteFetchedAt,
      lastSuccessfulRefresh: quoteResult.cacheStatus === "stale" ? quoteResult.fetchedAt : cache?.stats?.().lastSuccessfulRefresh || quoteResult.fetchedAt || now,
      lastError: quoteResult.lastError || profileResult.lastError || metricResult.lastError || historyResult.lastError || null
    };
  }));
  const rows = results
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value)
    .filter((row) => normalizeTicker(row.ticker) && Number(row.price) > 0);
  const failures = results.filter((result) => result.status === "rejected");
  if (!rows.length && failures.length) {
    throw safeProviderError(failures[0].reason, apiKey);
  }
  rows.forEach((row) => {
    row.requestBudget = {
      maxQuoteTickers: Number(requestBudget.maxQuoteTickers) || MARKET_DATA_REQUEST_BUDGET_DEFAULTS.maxQuoteTickers,
      enrichmentTickerLimit: enrichmentLimit,
      deferredEnrichmentTickers
    };
    row.deferredEnrichmentTickers = deferredEnrichmentTickers;
  });
  return rows;
}

async function fetchFinnhubHistory({ apiKey, baseUrl, cache, fetchImpl, ticker, limit, now, providerId, ttlConfig }) {
  const result = await getFinnhubHistoryRows({
    apiKey,
    baseUrl,
    cache,
    fetchImpl,
    now,
    providerId,
    ticker,
    ttlMs: ttlConfig.historyTtlMs,
    limit
  });
  return result.rows;
}

async function getFinnhubQuoteRow({ apiKey, baseUrl, cache, fetchImpl, now, providerId, providerLabel, ticker, ttlMs }) {
  const cached = cache?.get?.(providerId, "quote", ticker, { ttlMs, now });
  if (cached?.hit) {
    return { row: cached.value, cacheStatus: "cached", fetchedAt: cached.fetchedAt, lastError: null };
  }
  try {
    const payload = await fetchFinnhubJson({
      apiKey,
      baseUrl,
      fetchImpl,
      path: "quote",
      params: { symbol: ticker }
    });
    const row = { ...(payload || {}), symbol: ticker };
    if (!(numberFrom(row.c) > 0)) {
      throw new Error(`Finnhub returned no quote for ${ticker}.`);
    }
    const fetchedAt = now || new Date().toISOString();
    cache?.set?.(providerId, "quote", ticker, row, { fetchedAt });
    return { row, cacheStatus: "live", fetchedAt, lastError: null };
  } catch (error) {
    const safeError = safeProviderError(error, apiKey);
    const lastError = cache?.recordError?.(safeError, { now, providerId }) || { message: safeError.message || "quote refresh failed", at: now, providerId };
    if (cached?.stale && cached.value) {
      return {
        row: cached.value,
        cacheStatus: "stale",
        fetchedAt: cached.fetchedAt,
        lastError,
        providerName: providerLabel
      };
    }
    throw safeError;
  }
}

async function getFinnhubProfileRow({ apiKey, baseUrl, cache, fetchImpl, now, providerId, ticker, ttlMs }) {
  const cached = cache?.get?.(providerId, "profile", ticker, { ttlMs, now });
  if (cached?.hit) {
    return { row: cached.value, cacheStatus: "cached", fetchedAt: cached.fetchedAt, lastError: null };
  }
  try {
    const row = await fetchFinnhubJson({
      apiKey,
      baseUrl,
      fetchImpl,
      path: "stock/profile2",
      params: { symbol: ticker }
    });
    const fetchedAt = now || new Date().toISOString();
    cache?.set?.(providerId, "profile", ticker, row || {}, { fetchedAt });
    return { row: row || {}, cacheStatus: "live", fetchedAt, lastError: null };
  } catch (error) {
    const safeError = safeProviderError(error, apiKey);
    const lastError = cache?.recordError?.(safeError, { now, providerId }) || { message: safeError.message || "profile refresh failed", at: now, providerId };
    if (cached?.stale && cached.value) {
      return { row: cached.value, cacheStatus: "stale", fetchedAt: cached.fetchedAt, lastError };
    }
    return { row: {}, cacheStatus: "missing", fetchedAt: null, lastError };
  }
}

async function getFinnhubMetricRow({ apiKey, baseUrl, cache, fetchImpl, now, providerId, ticker, ttlMs }) {
  const cached = cache?.get?.(providerId, "metric", ticker, { ttlMs, now });
  if (cached?.hit) {
    return { row: cached.value, cacheStatus: "cached", fetchedAt: cached.fetchedAt, lastError: null };
  }
  try {
    const row = await fetchFinnhubJson({
      apiKey,
      baseUrl,
      fetchImpl,
      path: "stock/metric",
      params: { symbol: ticker, metric: "all" }
    });
    const fetchedAt = now || new Date().toISOString();
    cache?.set?.(providerId, "metric", ticker, row || {}, { fetchedAt });
    return { row: row || {}, cacheStatus: "live", fetchedAt, lastError: null };
  } catch (error) {
    const safeError = safeProviderError(error, apiKey);
    const lastError = cache?.recordError?.(safeError, { now, providerId }) || { message: safeError.message || "metric refresh failed", at: now, providerId };
    if (cached?.stale && cached.value) {
      return { row: cached.value, cacheStatus: "stale", fetchedAt: cached.fetchedAt, lastError };
    }
    return { row: {}, cacheStatus: "missing", fetchedAt: null, lastError };
  }
}

async function getFinnhubHistoryRows({ apiKey, baseUrl, cache, fetchImpl, now, providerId, ticker, ttlMs, limit }) {
  const cached = cache?.get?.(providerId, "history", ticker, { ttlMs, now });
  if (cached?.hit) {
    return { rows: cached.value || [], cacheStatus: "cached", fetchedAt: cached.fetchedAt, lastError: null };
  }
  try {
    const to = Math.floor(new Date(now || new Date().toISOString()).getTime() / 1000);
    const days = Math.max(1, Number(limit) || 30) + 10;
    const from = to - days * 24 * 60 * 60;
    const payload = await fetchFinnhubJson({
      apiKey,
      baseUrl,
      fetchImpl,
      path: "stock/candle",
      params: { symbol: ticker, resolution: "D", from, to }
    });
    const rows = normalizeFinnhubHistory(payload || {}, limit);
    const fetchedAt = now || new Date().toISOString();
    cache?.set?.(providerId, "history", ticker, rows, { fetchedAt });
    return { rows, cacheStatus: "live", fetchedAt, lastError: null };
  } catch (error) {
    const safeError = safeProviderError(error, apiKey);
    if (isFinnhubHistoryAccessLimited(safeError)) {
      if (cached?.stale && cached.value) {
        return { rows: cached.value || [], cacheStatus: "cached", fetchedAt: cached.fetchedAt, lastError: null };
      }
      return { rows: [], cacheStatus: "missing", fetchedAt: null, lastError: null };
    }
    const lastError = cache?.recordError?.(safeError, { now, providerId }) || { message: safeError.message || "history refresh failed", at: now, providerId };
    if (cached?.stale && cached.value) {
      return { rows: cached.value || [], cacheStatus: "stale", fetchedAt: cached.fetchedAt, lastError };
    }
    return { rows: [], cacheStatus: "missing", fetchedAt: null, lastError };
  }
}

async function fetchFinancialModelingPrepQuotes({ apiKey, baseUrl, fetchImpl, historyLimit, includeHistory, includeProfile, tickers, cache, ttlConfig, providerId, providerLabel, now }) {
  const quoteRows = await getFmpQuoteRows({
    apiKey,
    baseUrl,
    cache,
    fetchImpl,
    now,
    providerId,
    providerLabel,
    tickers,
    ttlMs: ttlConfig.quoteTtlMs
  });
  return Promise.all(quoteRows.map(async ({ row: quote, cacheStatus, fetchedAt, lastError }) => {
    const ticker = normalizeTicker(quote.symbol);
    const [profileResult, historyResult] = await Promise.all([
      includeProfile
        ? getFmpProfileRow({ apiKey, baseUrl, cache, fetchImpl, now, providerId, ticker, ttlMs: ttlConfig.profileTtlMs })
        : Promise.resolve({ row: {}, cacheStatus: "disabled", fetchedAt: null, lastError: null }),
      includeHistory
        ? getFmpHistoryRows({ apiKey, baseUrl, cache, fetchImpl, now, providerId, ticker, ttlMs: ttlConfig.historyTtlMs, limit: historyLimit })
        : Promise.resolve({ rows: [], cacheStatus: "disabled", fetchedAt: null, lastError: null })
    ]);
    const resourceFreshness = {
      quote: cacheStatus,
      profile: includeProfile ? profileResult.cacheStatus : "skipped",
      history: includeHistory ? historyResult.cacheStatus : "skipped"
    };
    const freshness = combineFreshness([cacheStatus, includeProfile ? profileResult.cacheStatus : "live", includeHistory ? historyResult.cacheStatus : "live"]);
    const quoteFetchedAt = cacheStatus === "stale"
      ? fetchedAt
      : newestDate([fetchedAt, profileResult.fetchedAt, historyResult.fetchedAt, now]) || now;
    return {
      ...normalizeFinancialModelingPrepQuote(quote, profileResult.row || {}, historyResult.rows || []),
      providerName: providerLabel,
      cacheStatus: freshness,
      dataFreshness: freshness,
      resourceFreshness,
      fetchedAt: quoteFetchedAt,
      lastSuccessfulRefresh: cacheStatus === "stale" ? fetchedAt : cache?.stats?.().lastSuccessfulRefresh || fetchedAt || now,
      lastError: lastError || profileResult.lastError || historyResult.lastError || null
    };
  }));
}

async function fetchFinancialModelingPrepHistory({ apiKey, baseUrl, fetchImpl, ticker, limit, cache, ttlConfig, providerId, now }) {
  const result = await getFmpHistoryRows({
    apiKey,
    baseUrl,
    cache,
    fetchImpl,
    now,
    providerId,
    ticker,
    ttlMs: ttlConfig.historyTtlMs,
    limit
  });
  return result.rows;
}

async function getFmpQuoteRows({ apiKey, baseUrl, cache, fetchImpl, now, providerId, providerLabel, tickers, ttlMs }) {
  const rows = [];
  const staleRows = new Map();
  const missing = [];
  for (const ticker of tickers) {
    const cached = cache?.get?.(providerId, "quote", ticker, { ttlMs, now });
    if (cached?.hit) {
      rows.push({ row: cached.value, cacheStatus: "cached", fetchedAt: cached.fetchedAt, lastError: null });
    } else {
      if (cached?.stale && cached.value) staleRows.set(ticker, cached);
      missing.push(ticker);
    }
  }
  if (!missing.length) return rows;

  try {
    const quotePayload = await fetchFmpJson({
      apiKey,
      baseUrl,
      fetchImpl,
      path: "quote",
      params: { symbol: missing.join(",") }
    });
    const fetchedAt = now || new Date().toISOString();
    const fetchedRows = arrayPayload(quotePayload).filter((row) => normalizeTicker(row.symbol));
    for (const row of fetchedRows) {
      const ticker = normalizeTicker(row.symbol);
      cache?.set?.(providerId, "quote", ticker, row, { fetchedAt });
      rows.push({ row, cacheStatus: "live", fetchedAt, lastError: null });
      staleRows.delete(ticker);
    }
    if (staleRows.size) {
      const lastError = cache?.recordError?.(new Error("Provider returned no quote for one or more cached tickers; using previous successful data."), { now: fetchedAt, providerId }) ||
        { message: "Provider returned no quote for one or more cached tickers; using previous successful data.", at: fetchedAt, providerId };
      for (const cached of staleRows.values()) {
        rows.push({
          row: cached.value,
          cacheStatus: "stale",
          fetchedAt: cached.fetchedAt,
          lastError,
          providerName: providerLabel
        });
      }
    }
    return rows;
  } catch (error) {
    const safeError = safeProviderError(error, apiKey);
    const lastError = cache?.recordError?.(safeError, { now, providerId }) || { message: safeError.message || "quote refresh failed", at: now, providerId };
    if (!rows.length && !staleRows.size) throw safeError;
    for (const cached of staleRows.values()) {
      rows.push({ row: cached.value, cacheStatus: "stale", fetchedAt: cached.fetchedAt, lastError });
    }
    return rows.map((row) => ({
      ...row,
      providerName: providerLabel,
      lastError: row.lastError || lastError
    }));
  }
}

async function getFmpProfileRow({ apiKey, baseUrl, cache, fetchImpl, now, providerId, ticker, ttlMs }) {
  const cached = cache?.get?.(providerId, "profile", ticker, { ttlMs, now });
  if (cached?.hit) {
    return { row: cached.value, cacheStatus: "cached", fetchedAt: cached.fetchedAt, lastError: null };
  }
  try {
    const payload = await fetchFmpJson({
      apiKey,
      baseUrl,
      fetchImpl,
      path: "profile",
      params: { symbol: ticker }
    });
    const row = arrayPayload(payload)[0] || {};
    const fetchedAt = now || new Date().toISOString();
    cache?.set?.(providerId, "profile", ticker, row, { fetchedAt });
    return { row, cacheStatus: "live", fetchedAt, lastError: null };
  } catch (error) {
    const safeError = safeProviderError(error, apiKey);
    const lastError = cache?.recordError?.(safeError, { now, providerId }) || { message: safeError.message || "profile refresh failed", at: now, providerId };
    if (cached?.stale && cached.value) {
      return { row: cached.value, cacheStatus: "stale", fetchedAt: cached.fetchedAt, lastError };
    }
    return { row: {}, cacheStatus: "missing", fetchedAt: null, lastError };
  }
}

async function getFmpHistoryRows({ apiKey, baseUrl, cache, fetchImpl, now, providerId, ticker, ttlMs, limit }) {
  const cached = cache?.get?.(providerId, "history", ticker, { ttlMs, now });
  if (cached?.hit) {
    return { rows: cached.value || [], cacheStatus: "cached", fetchedAt: cached.fetchedAt, lastError: null };
  }
  try {
    const payload = await fetchFmpJson({
      apiKey,
      baseUrl,
      fetchImpl,
      path: "historical-price-eod/full",
      params: { symbol: ticker }
    });
    const rows = normalizeFinancialModelingPrepHistory(payload || {}, limit);
    const fetchedAt = now || new Date().toISOString();
    cache?.set?.(providerId, "history", ticker, rows, { fetchedAt });
    return { rows, cacheStatus: "live", fetchedAt, lastError: null };
  } catch (error) {
    const safeError = safeProviderError(error, apiKey);
    const lastError = cache?.recordError?.(safeError, { now, providerId }) || { message: safeError.message || "history refresh failed", at: now, providerId };
    if (cached?.stale && cached.value) {
      return { rows: cached.value || [], cacheStatus: "stale", fetchedAt: cached.fetchedAt, lastError };
    }
    return { rows: [], cacheStatus: "missing", fetchedAt: null, lastError };
  }
}

async function optionalFmpJson(request) {
  try {
    return await fetchFmpJson(request);
  } catch {
    return null;
  }
}

async function fetchFmpJson({ apiKey, baseUrl, fetchImpl, path, params = {} }) {
  const url = new URL(`${baseUrl}/${String(path).replace(/^\/+/, "")}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  }
  url.searchParams.set("apikey", apiKey);
  const response = await fetchImpl(url.toString());
  const text = await responseText(response);
  if (!response?.ok) {
    throw new Error(providerHttpError(response.status, text, apiKey));
  }
  const payload = parseJsonPayload(text);
  const providerError = fmpPayloadError(payload);
  if (providerError) {
    throw new Error(redactProviderSecret(providerError, apiKey));
  }
  return payload;
}

async function fetchFinnhubJson({ apiKey, baseUrl, fetchImpl, path, params = {} }) {
  const url = new URL(`${baseUrl}/${String(path).replace(/^\/+/, "")}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  }
  url.searchParams.set("token", apiKey);
  const response = await fetchImpl(url.toString());
  const text = await responseText(response);
  if (!response?.ok) {
    throw new Error(finnhubHttpError(response.status, text, apiKey));
  }
  const payload = parseJsonPayload(text);
  const providerError = finnhubPayloadError(payload);
  if (providerError) {
    throw new Error(redactProviderSecret(providerError, apiKey));
  }
  return payload;
}

function responseText(response) {
  if (typeof response?.text === "function") return response.text();
  return Promise.resolve("");
}

function parseJsonPayload(text = "") {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function providerHttpError(statusCode, text, apiKey) {
  const redacted = redactProviderSecret(text, apiKey);
  if (Number(statusCode) === 429 || /rate|limit|quota/i.test(redacted)) {
    return `Financial Modeling Prep rate limit or quota response (${statusCode || "unknown"}).`;
  }
  return `Financial Modeling Prep request failed (${statusCode || "unknown"}): ${redacted.slice(0, 180)}`;
}

function finnhubHttpError(statusCode, text, apiKey) {
  const redacted = redactProviderSecret(text, apiKey);
  if (Number(statusCode) === 429 || /rate|limit|quota/i.test(redacted)) {
    return `Finnhub rate limit or quota response (${statusCode || "unknown"}).`;
  }
  if (/invalid api key|api key|token/i.test(redacted)) {
    return `Finnhub credential response (${statusCode || "unknown"}): ${redacted.slice(0, 180)}`;
  }
  return `Finnhub request failed (${statusCode || "unknown"}): ${redacted.slice(0, 180)}`;
}

function fmpPayloadError(payload) {
  if (!payload || typeof payload !== "object") return "";
  const values = Array.isArray(payload) ? payload : Object.values(payload);
  const joined = values.filter((value) => typeof value === "string").join(" ");
  if (/limit|quota|invalid api key|apikey|api key|error|not available/i.test(joined)) {
    return joined;
  }
  return "";
}

function finnhubPayloadError(payload) {
  if (!payload || typeof payload !== "object") return "";
  const message = payload.error || payload.message || payload.detail || "";
  if (/limit|quota|invalid api key|api key|token|error|forbidden|not authorized/i.test(String(message))) {
    return String(message);
  }
  return "";
}

function normalizeFinnhubMarketCap(value) {
  const numeric = numberFrom(value);
  if (!(numeric > 0)) return undefined;
  return numeric < 10_000_000 ? numeric * 1_000_000 : numeric;
}

function arrayPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.quote)) return payload.quote;
    if (Array.isArray(payload.profile)) return payload.profile;
  }
  return [];
}

function parseFmpRange(value = "") {
  const parts = String(value || "").split("-").map((part) => numberFrom(part));
  return {
    low: parts[0] || undefined,
    high: parts[1] || undefined
  };
}

function summarizeMarketDataCache(provider = {}, quotes = []) {
  const stats = provider.cache?.stats?.({ providerId: provider.id }) || {};
  const statuses = quotes.map((quote) => quote.cacheStatus || quote.dataFreshness).filter(Boolean);
  const freshness = combineFreshness(statuses.length ? statuses : [provider.mode === "mock" ? "mock" : provider.configured && provider.liveProviderCalls ? "error" : "live"]);
  const fetchedAt = newestDate(quotes.map((quote) => quote.fetchedAt).filter(Boolean));
  return {
    enabled: Boolean(provider.cache),
    providerName: provider.label || "Market data provider",
    status: freshness,
    freshness,
    fetchedAt,
    quoteCount: quotes.length,
    hitCount: statuses.filter((value) => value === "cached").length,
    liveCount: statuses.filter((value) => value === "live").length,
    staleCount: statuses.filter((value) => value === "stale").length,
    mockCount: statuses.filter((value) => value === "mock").length,
    ttlConfig: provider.ttlConfig || stats.ttlConfig || null,
    lastSuccessfulRefresh: newestDate(quotes.map((quote) => quote.lastSuccessfulRefresh).filter(Boolean)) || stats.lastSuccessfulRefresh || null,
    lastError: stats.lastError || quotes.find((quote) => quote.lastError)?.lastError || null,
    requestBudget: provider.requestBudget || quotes.find((quote) => quote.requestBudget)?.requestBudget || null,
    deferredEnrichmentTickers: [...new Set(quotes.flatMap((quote) => quote.deferredEnrichmentTickers || []))]
  };
}

function marketDataResourceFreshnessDetail(snapshot = {}) {
  const resources = (snapshot.quotes || []).map((quote) => quote.resourceFreshness).filter(Boolean);
  if (!resources.length) return "";
  const skippedProfile = resources.every((resource) => resource.profile === "skipped" || resource.metric === "skipped");
  const skippedHistory = resources.every((resource) => resource.history === "skipped");
  if (skippedProfile && skippedHistory) return " Quote refreshed; profile, fundamentals, and history were not refreshed in this lightweight pass.";
  if (skippedProfile) return " Quote refreshed; profile and fundamentals were not refreshed in this lightweight pass.";
  if (skippedHistory) return " Quote refreshed; history was not refreshed in this lightweight pass.";
  const deferredProfile = resources.some((resource) => resource.profile === "deferred" || resource.metric === "deferred");
  const deferredHistory = resources.some((resource) => resource.history === "deferred");
  if (deferredProfile || deferredHistory) return " Quote refreshed broadly; some profile/fundamental/history enrichment was deferred to protect free-tier limits.";
  return "";
}

function combineFreshness(values = []) {
  const statuses = values.filter((value) => value && value !== "disabled" && value !== "missing");
  if (!statuses.length) return "live";
  if (statuses.includes("stale")) return "stale";
  if (statuses.includes("error")) return "error";
  if (statuses.includes("mock")) return "mock";
  if (statuses.includes("cached")) return "cached";
  return "live";
}

function newestDate(values = []) {
  const newest = values
    .map((value) => new Date(value || 0).getTime())
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => b - a)[0];
  return newest ? new Date(newest).toISOString() : null;
}

function status(statusValue, label, detail, snapshot) {
  return {
    status: statusValue,
    label,
    detail,
    providerId: snapshot.providerId || "unknown-provider",
    providerLabel: snapshot.providerLabel || "Market data provider",
    mode: snapshot.mode || "not-configured",
    configured: Boolean(snapshot.configured),
    liveProviderCalls: Boolean(snapshot.liveProviderCalls),
    quoteCount: snapshot.quotes?.length || 0,
    asOf: snapshot.asOf || null,
    fetchedAt: snapshot.fetchedAt || null,
    dataFreshness: snapshot.dataFreshness || "unknown",
    cacheStatus: snapshot.cache?.status || snapshot.dataFreshness || "unknown",
    lastSuccessfulRefresh: snapshot.lastSuccessfulRefresh || null,
    lastError: snapshot.lastError || null,
    requestedTickers: snapshot.requestedTickers || [],
    requestedTickerCount: snapshot.requestedTickerCount || snapshot.requestedTickers?.length || 0,
    missingTickers: snapshot.missingTickers || [],
    truncatedTickers: snapshot.truncatedTickers || [],
    warnings: snapshot.warnings || [],
    fallbackReason: snapshot.fallbackReason || "",
    cache: snapshot.cache || null,
    quoteDiagnostics: marketDataQuoteDiagnostics(snapshot)
  };
}

function marketDataQuoteDiagnostics(snapshot = {}) {
  const quotesByTicker = snapshot.quotesByTicker || Object.fromEntries((snapshot.quotes || []).map((quote) => [normalizeTicker(quote.ticker), quote]));
  const requested = normalizeTickerList(snapshot.requestedTickers || []);
  const quoteTickers = normalizeTickerList((snapshot.quotes || []).map((quote) => quote.ticker));
  const tickers = [...new Set([...(requested.length ? requested : quoteTickers), ...quoteTickers])];
  return tickers.map((ticker) => {
    const quote = quotesByTicker[ticker];
    if (!quote) {
      return {
        ticker,
        status: MARKET_DATA_PROVIDER_STATUSES.PARTIAL,
        dataFreshness: "missing",
        cacheStatus: "missing",
        quote: "missing",
        profile: "missing",
        metric: "missing",
        history: "missing",
        missingFields: ["quote"],
        fetchedAt: null,
        lastError: "No normalized quote returned."
      };
    }
    const freshness = quote.dataFreshness || quote.cacheStatus || snapshot.dataFreshness || "unknown";
    const resources = quote.resourceFreshness || {};
    const historicalCount = Array.isArray(quote.historicalPrices) ? quote.historicalPrices.length : 0;
    const missingFields = [];
    if (!(numberFrom(quote.price) > 0)) missingFields.push("price");
    if (!quote.sector || quote.sector === "Unknown") missingFields.push("sector");
    if (!quote.industry || quote.industry === "Unknown") missingFields.push("industry");
    if (!(numberFrom(quote.marketCap) > 0)) missingFields.push("market cap");
    if (!historicalCount) missingFields.push("history");
    return {
      ticker,
      status: snapshot.status?.status || snapshot.status || freshness,
      dataFreshness: freshness,
      cacheStatus: quote.cacheStatus || freshness,
      quote: resources.quote || quote.cacheStatus || freshness,
      profile: resources.profile || "unknown",
      metric: resources.metric || "unknown",
      history: resources.history || (historicalCount ? freshness : "missing"),
      missingFields,
      fetchedAt: quote.fetchedAt || snapshot.fetchedAt || null,
      lastError: quote.lastError?.message || quote.lastError || ""
    };
  });
}

function providerCredentialStatus(env, spec) {
  if (spec.disabled) {
    return { configured: false, missingEnv: [] };
  }
  const requiredPresent = spec.requiredEnv.some((key) => hasEnvValue(env, key));
  const aliasPresent = (spec.optionalEnvAliases || []).some((key) => hasEnvValue(env, key));
  return {
    configured: requiredPresent || aliasPresent,
    missingEnv: requiredPresent || aliasPresent ? [] : spec.requiredEnv
  };
}

function providerCredentialValue(env, spec) {
  const keys = [...(spec.requiredEnv || []), ...(spec.optionalEnvAliases || [])];
  return keys.map((key) => usableCredentialValue(env[key])).find(Boolean) || "";
}

function hasEnvValue(env, key) {
  return isUsableCredentialValue(env[key]);
}

function marketDataProviderWarning(spec, credential) {
  if (spec.disabled) {
    return `${spec.label} is disabled as a non-primary source. Use a licensed provider first.`;
  }
  if (!credential.configured) {
    return `Missing: ${credential.missingEnv.join(", ")}. ${spec.label} is configurable later; Sample market data stays active until credentials are added.`;
  }
  if (spec.liveEnabled) {
    return `${spec.label} key is present on the local backend. Live quote calls run only through the local proxy and never expose API key values to browser code.`;
  }
  return `${spec.label} key is present on the local backend, but live quote calls are disabled until Tucker approves the provider implementation.`;
}

function redactProviderSecret(value = "", apiKey = "") {
  let text = String(value || "")
    .replace(/apikey=[^&\s"']+/gi, "apikey=[redacted]")
    .replace(/(access_token|refresh_token|token|client_secret|api_key|apikey)=([^&\s"']+)/gi, "$1=[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]");
  if (apiKey) text = text.replaceAll(apiKey, "[redacted]");
  return text;
}

function isRateLimitMessage(value = "") {
  return /rate|limit|quota|too many requests|429/i.test(String(value || ""));
}

function isFinnhubHistoryAccessLimited(error) {
  return /Finnhub request failed \(403\)|don't have access to this resource|access to this resource|not entitled|permission/i.test(String(error?.message || error || ""));
}

function safeProviderError(error, apiKey = "") {
  const message = redactProviderSecret(error?.message || String(error || "market data provider failed"), apiKey);
  const safe = new Error(message || "market data provider failed");
  safe.name = error?.name || "Error";
  return safe;
}

function marketDataCacheKey(providerId, type, ticker) {
  return [providerId || "provider", type || "quote", normalizeTicker(ticker)].join(":");
}

function cloneCacheValue(value) {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value));
}

function positiveNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function positiveInteger(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : fallback;
}

function minutesToMs(value, fallback) {
  return positiveNumber(value, fallback / 60_000) * 60_000;
}

function hoursToMs(value, fallback) {
  return positiveNumber(value, fallback / 3_600_000) * 3_600_000;
}

function normalizeTickerList(tickers = []) {
  return [...new Set(tickers.map((ticker) => normalizeTicker(ticker)).filter(Boolean))];
}

function decimalPercent(value) {
  const numeric = numberFrom(value);
  return roundRatio(Math.abs(numeric) > 1 ? numeric / 100 : numeric);
}

function staleAfter(asOf, hours = 24) {
  const time = new Date(asOf || new Date().toISOString()).getTime();
  return new Date(time + hours * 60 * 60 * 1000).toISOString();
}

function roundPrice(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function roundRatio(value) {
  return Math.round((Number(value) || 0) * 1_000_000) / 1_000_000;
}

function pruneEmpty(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}
