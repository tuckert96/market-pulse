import test from "node:test";
import assert from "node:assert/strict";
import {
  applyMarketDataToHoldings,
  buildMarketDataProviderConfig,
  buildMarketDataProviderStatuses,
  buildMarketDataSnapshot,
  buildMockMarketDataSnapshot,
  createFinancialModelingPrepProvider,
  createFinnhubProvider,
  createMarketDataCache,
  createMarketDataProviderFromConfig,
  createMockMarketDataProvider,
  createUnconfiguredMarketDataProvider,
  fetchMarketDataSnapshot,
  marketDataCacheTtlConfig,
  marketDataFallbackProviderIds,
  normalizeFinnhubHistory,
  normalizeFinnhubQuote,
  normalizeFinancialModelingPrepHistory,
  normalizeFinancialModelingPrepQuote,
  normalizeMarketQuote,
  marketDataRequestBudgetConfig,
  shouldPreserveMarketDataSnapshot
} from "../src/marketDataProvider.js";

test("mock market data provider exposes quote and history interface without live calls", () => {
  const provider = createMockMarketDataProvider({ asOf: "2026-05-23T12:00:00-04:00" });
  const singleQuote = provider.getQuote("MU");
  const quotes = provider.getQuotes(["MU", "NVDA", "NOTREAL"]);
  const history = provider.getHistoricalPrices("MU");

  assert.equal(provider.id, "mock-market-data");
  assert.equal(provider.mode, "mock");
  assert.equal(provider.liveProviderCalls, false);
  assert.equal(singleQuote.ticker, "MU");
  assert.deepEqual(quotes.map((quote) => quote.ticker), ["MU", "NVDA"]);
  assert.equal(history.length > 0, true);
  assert.equal(history.every((row) => row.date && row.close > 0), true);
});

test("explicit provider trust statuses are preserved even without quotes", () => {
  assert.equal(shouldPreserveMarketDataSnapshot({ quotes: [{ ticker: "MU" }] }), true);
  assert.equal(shouldPreserveMarketDataSnapshot({ quotes: [], status: { status: "rate limited" } }), true);
  assert.equal(shouldPreserveMarketDataSnapshot({ quotes: [], status: { status: "partial data" } }), true);
  assert.equal(shouldPreserveMarketDataSnapshot({ quotes: [], status: { status: "configured-not-connected" } }), true);
  assert.equal(shouldPreserveMarketDataSnapshot({ quotes: [], status: { status: "not configured" } }), true);
  assert.equal(shouldPreserveMarketDataSnapshot({ quotes: [], status: { status: "mock/sample mode" } }), false);
});

test("placeholder market data keys are treated as not configured", () => {
  const env = {
    MARKET_DATA_PROVIDER: "finnhub",
    FINNHUB_API_KEY: "your_finnhub_api_key_here",
    FINANCIAL_MODELING_PREP_API_KEY: "placeholder"
  };
  const config = buildMarketDataProviderConfig(env);
  const statuses = buildMarketDataProviderStatuses(env);
  const provider = createFinnhubProvider({ env, fetchImpl: async () => {
    throw new Error("placeholder key should not fetch");
  } });

  assert.equal(config.configured, false);
  assert.equal(config.liveProviderCalls, false);
  assert.equal(statuses.finnhub.status, "not configured");
  assert.equal(provider.configured, false);
  assert.equal(provider.liveProviderCalls, false);
});

test("quote normalization accepts percent strings without inflating daily move", () => {
  const quote = normalizeMarketQuote({
    ticker: "NVDA",
    price: 1014,
    previousClose: 1000,
    changePercent: "1.40%"
  }, {
    providerId: "mock-market-data",
    providerLabel: "Sample Market Data",
    mode: "mock",
    asOf: "2026-05-23T12:00:00-04:00"
  });

  assert.equal(quote.dailyChange, 14);
  assert.equal(quote.dailyChangePercent, 0.014);
});

test("quote normalization calculates daily change and preserves provider metadata", () => {
  const quote = normalizeMarketQuote({
    symbol: "mu",
    companyName: "Micron",
    currentPrice: "$132.10",
    previousClose: "130.00",
    volume: "42,100,000",
    market_cap: "146200000000",
    sector: "Semiconductors"
  }, {
    providerId: "mock-market-data",
    providerLabel: "Sample Market Data",
    mode: "mock",
    asOf: "2026-05-23T12:00:00-04:00"
  });

  assert.equal(quote.ticker, "MU");
  assert.equal(quote.price, 132.1);
  assert.equal(quote.dailyChange, 2.1);
  assert.equal(Number(quote.dailyChangePercent.toFixed(4)), 0.0162);
  assert.equal(quote.volume, 42100000);
  assert.equal(quote.marketCap, 146200000000);
  assert.equal(quote.providerLabel, "Sample Market Data");
  assert.equal(quote.isMock, true);
});

test("market data status handles mock, stale, error, and not configured states", async () => {
  const mock = buildMockMarketDataSnapshot(["MU"], {
    asOf: "2026-05-23T12:00:00-04:00",
    now: "2026-05-23T12:30:00-04:00"
  });
  const stale = buildMockMarketDataSnapshot(["MU"], {
    asOf: "2026-05-20T12:00:00-04:00",
    now: "2026-05-23T12:30:00-04:00"
  });
  const unconfigured = buildMarketDataSnapshot({
    provider: createUnconfiguredMarketDataProvider(),
    quotes: [],
    asOf: "2026-05-23T12:00:00-04:00"
  });
  const error = await fetchMarketDataSnapshot({
    provider: {
      id: "broken-provider",
      label: "Broken Provider",
      mode: "live",
      configured: true,
      liveProviderCalls: true,
      getQuotes() {
        throw new Error("provider unavailable");
      }
    },
    tickers: ["MU"],
    asOf: "2026-05-23T12:00:00-04:00"
  });

  assert.equal(mock.status.status, "mock/sample mode");
  assert.equal(stale.status.status, "stale data");
  assert.equal(unconfigured.status.status, "not configured");
  assert.equal(error.status.status, "error");
  assert.match(error.status.detail, /provider unavailable/);
});

test("market data status exposes per-ticker quote coverage diagnostics", () => {
  const snapshot = buildMarketDataSnapshot({
    provider: {
      id: "finnhub",
      label: "Finnhub",
      mode: "live",
      configured: true,
      liveProviderCalls: true
    },
    requestedTickers: ["MU", "BAD"],
    asOf: "2026-05-23T16:00:00.000Z",
    now: "2026-05-23T16:00:00.000Z",
    quotes: [{
      ticker: "MU",
      price: 132.1,
      dailyChange: 1.2,
      dailyChangePercent: 0.009,
      providerLabel: "Finnhub",
      cacheStatus: "live",
      dataFreshness: "live",
      resourceFreshness: { quote: "live", profile: "deferred", metric: "deferred", history: "skipped" }
    }]
  });

  assert.equal(snapshot.status.quoteDiagnostics.length, 2);
  const mu = snapshot.status.quoteDiagnostics.find((row) => row.ticker === "MU");
  const bad = snapshot.status.quoteDiagnostics.find((row) => row.ticker === "BAD");
  assert.equal(mu.quote, "live");
  assert.equal(mu.profile, "deferred");
  assert.equal(mu.history, "skipped");
  assert.ok(mu.missingFields.includes("volume"));
  assert.ok(mu.deferredFields.includes("historical candles"));
  assert.ok(mu.unavailableFields.includes("52-week high/low"));
  assert.match(mu.coverageSummary, /1\/8 fields available/);
  assert.equal(bad.dataFreshness, "missing");
  assert.deepEqual(bad.missingFields, [
    "quote/current price",
    "52-week high/low",
    "volume",
    "average volume",
    "market cap",
    "company profile",
    "sector/industry",
    "historical candles"
  ]);
});

test("live provider configuration reports safe missing-key and live-ready configured states", () => {
  const missingConfig = buildMarketDataProviderConfig({});
  const missingStatuses = buildMarketDataProviderStatuses({});
  const configuredConfig = buildMarketDataProviderConfig({
    MARKET_DATA_PROVIDER: "finnhub",
    FINNHUB_API_KEY: "finnhub-secret-value"
  });
  const configuredStatuses = buildMarketDataProviderStatuses({
    MARKET_DATA_PROVIDER: "finnhub",
    FINNHUB_API_KEY: "finnhub-secret-value"
  });

  assert.equal(missingConfig.selectedProvider, "finnhub");
  assert.equal(missingConfig.configured, false);
  assert.equal(missingConfig.status, "not configured");
  assert.deepEqual(missingConfig.missingEnv, ["FINNHUB_API_KEY"]);
  assert.equal(missingStatuses.finnhub.configured, false);
  assert.equal(missingStatuses.finnhub.liveProviderCalls, false);
  assert.match(missingStatuses.finnhub.warning, /FINNHUB_API_KEY/);

  assert.equal(configuredConfig.configured, true);
  assert.equal(configuredConfig.status, "live-ready");
  assert.equal(configuredConfig.liveEnabled, true);
  assert.equal(configuredConfig.liveProviderCalls, true);
  assert.equal(configuredStatuses.finnhub.configured, true);
  assert.equal(configuredStatuses.finnhub.liveEnabled, true);
  assert.equal(configuredStatuses.finnhub.liveProviderCalls, true);
  assert.match(configuredStatuses.finnhub.warning, /local backend/i);
  assert.equal(JSON.stringify(configuredConfig).includes("finnhub-secret-value"), false);
  assert.equal(JSON.stringify(configuredStatuses).includes("finnhub-secret-value"), false);
});

test("Finnhub provider stays safely unconfigured without credentials", async () => {
  let fetchCalls = 0;
  const provider = createFinnhubProvider({
    env: {},
    fetchImpl() {
      fetchCalls += 1;
      throw new Error("should not be called");
    }
  });
  const snapshot = await fetchMarketDataSnapshot({
    provider,
    tickers: ["MU"],
    asOf: "2026-05-23T12:00:00-04:00"
  });

  assert.equal(fetchCalls, 0);
  assert.equal(provider.configured, false);
  assert.equal(provider.liveProviderCalls, false);
  assert.deepEqual(provider.missingEnv, ["FINNHUB_API_KEY"]);
  assert.equal(snapshot.status.status, "not configured");
});

test("Finnhub live provider normalizes quote profile and historical candles", async () => {
  const provider = createFinnhubProvider({
    env: { FINNHUB_API_KEY: "finnhub-secret-value" },
    fetchImpl: finnhubFetchMock({
      quote: {
        c: 132.1,
        d: 2.6,
        dp: 2.0077,
        h: 133,
        l: 128.7,
        o: 129.2,
        pc: 129.5,
        t: 1779552000
      },
      profile: {
        ticker: "MU",
        name: "Micron Technology, Inc.",
        marketCapitalization: 147000,
        finnhubIndustry: "Semiconductors"
      },
      metrics: {
        metric: {
          "52WeekHigh": 157.54,
          "52WeekLow": 84.12,
          "10DayAverageTradingVolume": 19800000
        }
      },
      candles: {
        s: "ok",
        o: [128.8, 130.2],
        h: [130.4, 133],
        l: [127.9, 129.8],
        c: [129.5, 132.1],
        t: [1779465600, 1779552000],
        v: [100, 120]
      }
    })
  });
  const snapshot = await fetchMarketDataSnapshot({
    provider,
    tickers: ["MU"],
    asOf: "2026-05-23T12:00:00-04:00",
    now: "2026-05-23T12:30:00-04:00"
  });
  const quote = snapshot.quotesByTicker.MU;

  assert.equal(snapshot.status.status, "connected");
  assert.equal(snapshot.providerId, "finnhub");
  assert.equal(quote.ticker, "MU");
  assert.equal(quote.price, 132.1);
  assert.equal(quote.dailyChange, 2.6);
  assert.equal(Number(quote.dailyChangePercent.toFixed(4)), 0.0201);
  assert.equal(quote.dayOpen, 129.2);
  assert.equal(quote.dayHigh, 133);
  assert.equal(quote.dayLow, 128.7);
  assert.equal(quote.marketCap, 147000000000);
  assert.equal(quote.averageVolume, 19800000);
  assert.equal(quote.sector, "Semiconductors");
  assert.equal(quote.industry, "Semiconductors");
  assert.equal(quote.fiftyTwoWeekHigh, 157.54);
  assert.equal(quote.fiftyTwoWeekLow, 84.12);
  assert.deepEqual(quote.historicalPrices.map((row) => row.close), [129.5, 132.1]);
  assert.deepEqual(quote.historicalPrices.map((row) => row.open), [128.8, 130.2]);
  assert.deepEqual(quote.historicalPrices.map((row) => row.high), [130.4, 133]);
  assert.deepEqual(quote.historicalPrices.map((row) => row.low), [127.9, 129.8]);
  assert.deepEqual(quote.historicalPrices.map((row) => row.volume), [100, 120]);
  assert.equal(JSON.stringify(snapshot).includes("finnhub-secret-value"), false);
});

test("Finnhub diagnostics expose per-ticker field coverage without secrets", async () => {
  const snapshot = await fetchMarketDataSnapshot({
    provider: createFinnhubProvider({
      env: { FINNHUB_API_KEY: "finnhub-secret-value" },
      fetchImpl: finnhubFetchMock({
        quote: { c: 132.1, d: 2.6, dp: 2.0077, h: 133, l: 128.7, o: 129.2, pc: 129.5, t: 1779552000 },
        profile: { ticker: "MU", name: "Micron Technology, Inc.", marketCapitalization: 147000, finnhubIndustry: "Semiconductors" },
        metrics: { metric: { "52WeekHigh": 157.54, "52WeekLow": 84.12, "10DayAverageTradingVolume": 19800000 } },
        candles: { s: "ok", c: [132.1], t: [1779552000], v: [24600000] }
      })
    }),
    tickers: ["MU"],
    asOf: "2026-05-23T12:00:00-04:00",
    now: "2026-05-23T12:30:00-04:00"
  });
  const row = snapshot.status.quoteDiagnostics.find((item) => item.ticker === "MU");

  assert.equal(row.coverageStatus, "complete");
  assert.equal(row.coverageSummary, "8/8 fields available");
  assert.deepEqual(row.missingFields, []);
  assert.deepEqual(row.unavailableFields, []);
  assert.deepEqual(row.fieldCoverage.map((field) => [field.key, field.status]), [
    ["quote", "live"],
    ["week52Range", "live"],
    ["volume", "live"],
    ["averageVolume", "live"],
    ["marketCap", "live"],
    ["companyProfile", "live"],
    ["sectorIndustry", "live"],
    ["historicalCandles", "live"]
  ]);
  assert.equal(JSON.stringify(row).includes("finnhub-secret-value"), false);
});

test("Finnhub diagnostics list partial missing and deferred fields by ticker", async () => {
  const snapshot = await fetchMarketDataSnapshot({
    provider: createFinnhubProvider({
      env: { FINNHUB_API_KEY: "finnhub-secret-value" },
      requestBudget: { maxQuoteTickers: 50, enrichmentTickerLimit: 1 },
      fetchImpl: finnhubFetchMock({
        quote: { c: 132.1, d: 2.6, dp: 2.0077, h: 133, l: 128.7, o: 129.2, pc: 129.5, t: 1779552000 },
        profile: { ticker: "MU", name: "Micron Technology, Inc.", finnhubIndustry: "Semiconductors" },
        metrics: { metric: { "52WeekHigh": 157.54, "52WeekLow": 84.12 } },
        candles: { s: "ok", c: [132.1], t: [1779552000] }
      })
    }),
    tickers: ["MU", "NVDA"],
    asOf: "2026-05-23T12:00:00-04:00",
    now: "2026-05-23T12:30:00-04:00"
  });
  const mu = snapshot.status.quoteDiagnostics.find((item) => item.ticker === "MU");
  const nvda = snapshot.status.quoteDiagnostics.find((item) => item.ticker === "NVDA");

  assert.equal(mu.coverageStatus, "partial");
  assert.ok(mu.missingFields.includes("volume"));
  assert.ok(mu.missingFields.includes("average volume"));
  assert.ok(mu.missingFields.includes("market cap"));
  assert.match(mu.coverageSummary, /5\/8 fields available/);
  assert.equal(nvda.coverageStatus, "partial");
  assert.ok(nvda.deferredFields.includes("52-week high/low"));
  assert.ok(nvda.deferredFields.includes("company profile"));
  assert.ok(nvda.deferredFields.includes("historical candles"));
  assert.ok(nvda.unavailableFields.includes("average volume"));
});

test("Finnhub blocked candle access does not stale otherwise usable quote data", async () => {
  const snapshot = await fetchMarketDataSnapshot({
    provider: createFinnhubProvider({
      env: { FINNHUB_API_KEY: "finnhub-secret-value" },
      now: "2026-05-23T12:30:00-04:00",
      fetchImpl: finnhubFetchMock({
        quote: { c: 132.1, d: 2.6, dp: 2.0077, h: 133, l: 128.7, o: 129.2, pc: 129.5, t: 1779552000 },
        profile: { ticker: "MU", name: "Micron Technology, Inc.", marketCapitalization: 147000, finnhubIndustry: "Semiconductors" },
        metrics: { metric: { "52WeekHigh": 157.54, "52WeekLow": 84.12 } },
        candlesStatus: 403,
        candlesText: JSON.stringify({ error: "You don't have access to this resource." })
      })
    }),
    tickers: ["MU"],
    asOf: "2026-05-23T12:00:00-04:00",
    now: "2026-05-23T12:30:00-04:00"
  });

  assert.equal(snapshot.status.status, "connected");
  assert.equal(snapshot.status.label, "Live market data");
  assert.equal(snapshot.lastError, null);
  assert.equal(snapshot.quotesByTicker.MU.price, 132.1);
  assert.equal(snapshot.quotesByTicker.MU.fiftyTwoWeekHigh, 157.54);
  assert.deepEqual(snapshot.quotesByTicker.MU.historicalPrices, []);
  assert.equal(JSON.stringify(snapshot).includes("finnhub-secret-value"), false);
});

test("Finnhub quote-only provider mode skips profile, metric, and candle calls", async () => {
  const calls = [];
  const snapshot = await fetchMarketDataSnapshot({
    provider: createFinnhubProvider({
      env: { FINNHUB_API_KEY: "finnhub-secret-value" },
      includeHistory: false,
      includeProfile: false,
      now: "2026-05-23T12:30:00-04:00",
      fetchImpl: countedFetch(calls, finnhubFetchMock({
        quote: { c: 132.1, d: 2.6, dp: 2.0077, h: 133, l: 128.7, o: 129.2, pc: 129.5, t: 1779552000 }
      }))
    }),
    tickers: ["MU"],
    asOf: "2026-05-23T12:00:00-04:00",
    now: "2026-05-23T12:30:00-04:00"
  });

  assert.equal(snapshot.status.status, "connected");
  assert.equal(snapshot.quotesByTicker.MU.price, 132.1);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /\/quote\?/);
  assert.doesNotMatch(calls.join("\n"), /\/stock\/profile2\?|\/stock\/metric\?|\/stock\/candle\?/);
});

test("quote-only market data snapshots expose skipped profile/history freshness separately from live quote freshness", async () => {
  const calls = [];
  const snapshot = await fetchMarketDataSnapshot({
    provider: createFinnhubProvider({
      env: { FINNHUB_API_KEY: "finnhub-secret-value" },
      includeHistory: false,
      includeProfile: false,
      now: "2026-05-23T12:30:00-04:00",
      fetchImpl: countedFetch(calls, finnhubFetchMock({
        quote: { c: 132.1, d: 2.6, dp: 2.0077, h: 133, l: 128.7, o: 129.2, pc: 129.5, t: 1779552000 }
      }))
    }),
    tickers: ["MU"],
    asOf: "2026-05-23T12:00:00-04:00",
    now: "2026-05-23T12:30:00-04:00"
  });

  assert.equal(snapshot.status.status, "connected");
  assert.equal(snapshot.dataFreshness, "live");
  assert.deepEqual(snapshot.quotesByTicker.MU.resourceFreshness, {
    quote: "live",
    profile: "skipped",
    metric: "skipped",
    history: "skipped"
  });
  assert.match(snapshot.status.detail, /Quote refreshed; profile, fundamentals, and history were not refreshed/i);
});

test("Finnhub request budget defers enrichment while keeping broad quote refresh", async () => {
  const calls = [];
  const snapshot = await fetchMarketDataSnapshot({
    provider: createFinnhubProvider({
      env: { FINNHUB_API_KEY: "finnhub-secret-value" },
      requestBudget: { enrichmentTickerLimit: 1, maxQuoteTickers: 3 },
      now: "2026-05-23T12:30:00-04:00",
      fetchImpl: countedFetch(calls, async (url) => {
        const textUrl = String(url);
        const symbol = new URL(textUrl).searchParams.get("symbol");
        if (textUrl.includes("/quote?")) {
          return mockResponse({ c: symbol === "MU" ? 132.1 : 42, d: 1, dp: 1, h: 45, l: 40, o: 41, pc: 41, t: 1779552000 });
        }
        if (textUrl.includes("/stock/profile2?")) return mockResponse({ ticker: symbol, name: symbol, finnhubIndustry: "Semiconductors" });
        if (textUrl.includes("/stock/metric?")) return mockResponse({ metric: { "52WeekHigh": 157.54, "52WeekLow": 84.12 } });
        if (textUrl.includes("/stock/candle?")) return mockResponse({ s: "ok", c: [41, 42], t: [1779465600, 1779552000], v: [100, 120] });
        return mockResponse({ error: "unexpected endpoint" }, 404);
      })
    }),
    tickers: ["MU", "NVDA", "AMD"],
    asOf: "2026-05-23T12:00:00-04:00",
    now: "2026-05-23T12:30:00-04:00"
  });

  assert.equal(snapshot.quotes.length, 3);
  assert.equal(calls.filter((url) => url.includes("/quote?")).length, 3);
  assert.equal(calls.filter((url) => url.includes("/stock/profile2?")).length, 1);
  assert.equal(calls.filter((url) => url.includes("/stock/metric?")).length, 1);
  assert.equal(calls.filter((url) => url.includes("/stock/candle?")).length, 1);
  assert.deepEqual(snapshot.quotesByTicker.NVDA.resourceFreshness, {
    quote: "live",
    profile: "deferred",
    metric: "deferred",
    history: "deferred"
  });
  assert.deepEqual(snapshot.cache.deferredEnrichmentTickers, ["NVDA", "AMD"]);
  assert.match(snapshot.status.detail, /enrichment was deferred/i);
});

test("market data request budget config is env configurable", () => {
  assert.deepEqual(marketDataRequestBudgetConfig({
    MARKET_DATA_MAX_QUOTE_TICKERS: "20",
    MARKET_DATA_ENRICHMENT_TICKER_LIMIT: "4"
  }), {
    maxQuoteTickers: 20,
    enrichmentTickerLimit: 4
  });
});

test("Finnhub live fetch freshness uses server fetch time instead of old quote tick time", async () => {
  const snapshot = await fetchMarketDataSnapshot({
    provider: createFinnhubProvider({
      env: { FINNHUB_API_KEY: "finnhub-secret-value" },
      now: "2026-05-23T12:30:00-04:00",
      fetchImpl: finnhubFetchMock({
        quote: { c: 132.1, d: 2.6, dp: 2.0077, h: 133, l: 128.7, o: 129.2, pc: 129.5, t: 1700000000 },
        profile: { ticker: "MU", name: "Micron Technology, Inc.", marketCapitalization: 147000, finnhubIndustry: "Semiconductors" },
        metrics: { metric: { "52WeekHigh": 157.54, "52WeekLow": 84.12 } },
        candlesStatus: 403,
        candlesText: JSON.stringify({ error: "You don't have access to this resource." })
      })
    }),
    tickers: ["MU"],
    asOf: "2026-05-23T12:00:00-04:00",
    now: "2026-05-23T12:30:00-04:00"
  });

  assert.equal(snapshot.quotesByTicker.MU.asOf, "2023-11-14T22:13:20.000Z");
  assert.equal(snapshot.status.status, "connected");
  assert.equal(snapshot.status.label, "Live market data");
  assert.equal(snapshot.status.fetchedAt, "2026-05-23T16:30:00.000Z");
});

test("Financial Modeling Prep provider stays safely unconfigured without credentials", async () => {
  let fetchCalls = 0;
  const provider = createFinancialModelingPrepProvider({
    env: {},
    fetchImpl() {
      fetchCalls += 1;
      throw new Error("should not be called");
    }
  });
  const snapshot = await fetchMarketDataSnapshot({
    provider,
    tickers: ["MU"],
    asOf: "2026-05-23T12:00:00-04:00"
  });

  assert.equal(fetchCalls, 0);
  assert.equal(provider.configured, false);
  assert.equal(provider.liveProviderCalls, false);
  assert.deepEqual(provider.missingEnv, ["FINANCIAL_MODELING_PREP_API_KEY"]);
  assert.equal(snapshot.status.status, "not configured");
});

test("Financial Modeling Prep live provider normalizes quote profile and history responses", async () => {
  const provider = createFinancialModelingPrepProvider({
    env: { FINANCIAL_MODELING_PREP_API_KEY: "fmp-secret-value" },
    fetchImpl: fmpFetchMock({
      quote: [{
        symbol: "MU",
        name: "Micron Technology, Inc.",
        price: 132.1,
        previousClose: 129.5,
        change: 2.6,
        changesPercentage: 2.0077,
        marketCap: 147000000000,
        volume: 24600000,
        avgVolume: 19800000,
        yearHigh: 157.54,
        yearLow: 84.12,
        timestamp: 1779552000
      }],
      profile: [{
        symbol: "MU",
        companyName: "Micron Technology, Inc.",
        sector: "Technology",
        industry: "Semiconductors",
        mktCap: 147000000000,
        volAvg: 19900000,
        range: "84.12-157.54"
      }],
      history: {
        historical: [
          { date: "2026-05-22", open: 130.2, high: 133, low: 129.8, close: 132.1, volume: 100 },
          { date: "2026-05-21", open: 128.8, high: 130.4, low: 127.9, close: 129.5, volume: 120 }
        ]
      }
    })
  });
  const snapshot = await fetchMarketDataSnapshot({
    provider,
    tickers: ["MU"],
    asOf: "2026-05-23T12:00:00-04:00",
    now: "2026-05-23T12:30:00-04:00"
  });
  const quote = snapshot.quotesByTicker.MU;

  assert.equal(snapshot.status.status, "connected");
  assert.equal(snapshot.liveProviderCalls, true);
  assert.equal(quote.ticker, "MU");
  assert.equal(quote.price, 132.1);
  assert.equal(quote.dailyChange, 2.6);
  assert.equal(Number(quote.dailyChangePercent.toFixed(4)), 0.0201);
  assert.equal(quote.marketCap, 147000000000);
  assert.equal(quote.volume, 24600000);
  assert.equal(quote.averageVolume, 19800000);
  assert.equal(quote.sector, "Technology");
  assert.equal(quote.industry, "Semiconductors");
  assert.equal(quote.fiftyTwoWeekHigh, 157.54);
  assert.equal(quote.fiftyTwoWeekLow, 84.12);
  assert.deepEqual(quote.historicalPrices.map((row) => row.date), ["2026-05-21", "2026-05-22"]);
  assert.deepEqual(quote.historicalPrices.map((row) => row.high), [130.4, 133]);
  assert.deepEqual(quote.historicalPrices.map((row) => row.low), [127.9, 129.8]);
  assert.deepEqual(quote.historicalPrices.map((row) => row.volume), [120, 100]);
  assert.equal(JSON.stringify(snapshot).includes("fmp-secret-value"), false);
});

test("Financial Modeling Prep cache returns fresh cached quote/profile/history without provider calls", async () => {
  const cache = createMarketDataCache();
  const firstCalls = [];
  const firstProvider = createFinancialModelingPrepProvider({
    env: { FINANCIAL_MODELING_PREP_API_KEY: "fmp-secret-value" },
    cache,
    now: "2026-05-23T12:00:00-04:00",
    fetchImpl: countedFetch(firstCalls, fmpFetchMock({
      quote: [{ symbol: "MU", price: 132.1, previousClose: 130, change: 2.1, changesPercentage: 1.6154, volume: 1000 }],
      profile: [{ symbol: "MU", companyName: "Micron", sector: "Technology", industry: "Semiconductors" }],
      history: { historical: [{ date: "2026-05-22", close: 132.1 }] }
    }))
  });
  const first = await fetchMarketDataSnapshot({
    provider: firstProvider,
    tickers: ["MU"],
    asOf: "2026-05-23T12:00:00-04:00",
    now: "2026-05-23T12:00:00-04:00"
  });
  const secondCalls = [];
  const secondProvider = createFinancialModelingPrepProvider({
    env: { FINANCIAL_MODELING_PREP_API_KEY: "fmp-secret-value" },
    cache,
    now: "2026-05-23T12:02:00-04:00",
    fetchImpl: countedFetch(secondCalls, () => {
      throw new Error("cache hit should not call provider");
    })
  });
  const second = await fetchMarketDataSnapshot({
    provider: secondProvider,
    tickers: ["MU"],
    asOf: "2026-05-23T12:02:00-04:00",
    now: "2026-05-23T12:02:00-04:00"
  });

  assert.equal(first.status.label, "Live market data");
  assert.equal(first.quotesByTicker.MU.cacheStatus, "live");
  assert.equal(firstCalls.length, 3);
  assert.equal(second.status.status, "cached");
  assert.equal(second.status.label, "Cached market data");
  assert.equal(second.dataFreshness, "cached");
  assert.equal(second.quotesByTicker.MU.cacheStatus, "cached");
  assert.equal(second.quotesByTicker.MU.price, 132.1);
  assert.equal(secondCalls.length, 0);
});

test("Finnhub cache returns fresh cached quote/profile/history without provider calls", async () => {
  const cache = createMarketDataCache();
  const firstCalls = [];
  const firstProvider = createFinnhubProvider({
    env: { FINNHUB_API_KEY: "finnhub-secret-value" },
    cache,
    now: "2026-05-23T12:00:00-04:00",
    fetchImpl: countedFetch(firstCalls, finnhubFetchMock({
      quote: { c: 132.1, d: 2.1, dp: 1.6154, h: 133, l: 129, o: 130, pc: 130, t: 1779552000 },
      profile: { ticker: "MU", name: "Micron", finnhubIndustry: "Semiconductors" },
      metrics: { metric: { "52WeekHigh": 157.54, "52WeekLow": 84.12 } },
      candles: { s: "ok", c: [132.1], t: [1779552000] }
    }))
  });
  await fetchMarketDataSnapshot({
    provider: firstProvider,
    tickers: ["MU"],
    asOf: "2026-05-23T12:00:00-04:00",
    now: "2026-05-23T12:00:00-04:00"
  });
  const secondCalls = [];
  const secondProvider = createFinnhubProvider({
    env: { FINNHUB_API_KEY: "finnhub-secret-value" },
    cache,
    now: "2026-05-23T12:02:00-04:00",
    fetchImpl: countedFetch(secondCalls, () => {
      throw new Error("cache hit should not call provider");
    })
  });
  const second = await fetchMarketDataSnapshot({
    provider: secondProvider,
    tickers: ["MU"],
    asOf: "2026-05-23T12:02:00-04:00",
    now: "2026-05-23T12:02:00-04:00"
  });

  assert.equal(firstCalls.length, 4);
  assert.equal(secondCalls.length, 0);
  assert.equal(second.status.status, "cached");
  assert.equal(second.status.label, "Cached market data");
  assert.equal(second.quotesByTicker.MU.cacheStatus, "cached");
  assert.equal(second.quotesByTicker.MU.price, 132.1);
});

test("Financial Modeling Prep cache refreshes stale quotes when TTL expires", async () => {
  const cache = createMarketDataCache({ quoteTtlMs: 60_000, profileTtlMs: 60_000, historyTtlMs: 60_000 });
  await fetchMarketDataSnapshot({
    provider: createFinancialModelingPrepProvider({
      env: { FINANCIAL_MODELING_PREP_API_KEY: "fmp-secret-value" },
      cache,
      ttlConfig: cache.defaultTtls,
      now: "2026-05-23T12:00:00-04:00",
      fetchImpl: fmpFetchMock({
        quote: [{ symbol: "MU", price: 132.1, previousClose: 130, change: 2.1, changesPercentage: 1.6154, volume: 1000 }],
        profile: [{ symbol: "MU", sector: "Technology", industry: "Semiconductors" }],
        history: { historical: [{ date: "2026-05-22", close: 132.1 }] }
      })
    }),
    tickers: ["MU"],
    asOf: "2026-05-23T12:00:00-04:00",
    now: "2026-05-23T12:00:00-04:00"
  });
  const calls = [];
  const refreshed = await fetchMarketDataSnapshot({
    provider: createFinancialModelingPrepProvider({
      env: { FINANCIAL_MODELING_PREP_API_KEY: "fmp-secret-value" },
      cache,
      ttlConfig: cache.defaultTtls,
      now: "2026-05-23T12:03:00-04:00",
      fetchImpl: countedFetch(calls, fmpFetchMock({
        quote: [{ symbol: "MU", price: 134.5, previousClose: 132.1, change: 2.4, changesPercentage: 1.8168, volume: 2000 }],
        profile: [{ symbol: "MU", sector: "Technology", industry: "Semiconductors" }],
        history: { historical: [{ date: "2026-05-22", close: 134.5 }] }
      }))
    }),
    tickers: ["MU"],
    asOf: "2026-05-23T12:03:00-04:00",
    now: "2026-05-23T12:03:00-04:00"
  });

  assert.equal(refreshed.status.label, "Live market data");
  assert.equal(refreshed.quotesByTicker.MU.price, 134.5);
  assert.equal(refreshed.quotesByTicker.MU.cacheStatus, "live");
  assert.equal(calls.length, 3);
});

test("Financial Modeling Prep stale cache falls back with stale status when refresh fails", async () => {
  const cache = createMarketDataCache({ quoteTtlMs: 60_000, profileTtlMs: 60_000, historyTtlMs: 60_000 });
  await fetchMarketDataSnapshot({
    provider: createFinancialModelingPrepProvider({
      env: { FINANCIAL_MODELING_PREP_API_KEY: "fmp-secret-value" },
      cache,
      ttlConfig: cache.defaultTtls,
      now: "2026-05-23T12:00:00-04:00",
      fetchImpl: fmpFetchMock({
        quote: [{ symbol: "MU", price: 132.1, previousClose: 130, change: 2.1, changesPercentage: 1.6154, volume: 1000 }],
        profile: [{ symbol: "MU", sector: "Technology", industry: "Semiconductors" }],
        history: { historical: [{ date: "2026-05-22", close: 132.1 }] }
      })
    }),
    tickers: ["MU"],
    asOf: "2026-05-23T12:00:00-04:00",
    now: "2026-05-23T12:00:00-04:00"
  });
  const stale = await fetchMarketDataSnapshot({
    provider: createFinancialModelingPrepProvider({
      env: { FINANCIAL_MODELING_PREP_API_KEY: "fmp-secret-value" },
      cache,
      ttlConfig: cache.defaultTtls,
      now: "2026-05-23T12:03:00-04:00",
      fetchImpl: fmpFetchMock({ quoteStatus: 429, quoteText: "Limit Reach for fmp-secret-value" })
    }),
    tickers: ["MU"],
    asOf: "2026-05-23T12:03:00-04:00",
    now: "2026-05-23T12:03:00-04:00"
  });

  assert.equal(stale.status.status, "stale data");
  assert.equal(stale.dataFreshness, "stale");
  assert.equal(stale.quotesByTicker.MU.cacheStatus, "stale");
  assert.equal(stale.quotesByTicker.MU.price, 132.1);
  assert.match(stale.status.detail, /refresh failed/i);
  assert.equal(JSON.stringify(stale).includes("fmp-secret-value"), false);
});

test("Financial Modeling Prep stale cache falls back when provider omits a previously cached quote", async () => {
  const cache = createMarketDataCache({ quoteTtlMs: 60_000, profileTtlMs: 60_000, historyTtlMs: 60_000 });
  await fetchMarketDataSnapshot({
    provider: createFinancialModelingPrepProvider({
      env: { FINANCIAL_MODELING_PREP_API_KEY: "fmp-secret-value" },
      cache,
      ttlConfig: cache.defaultTtls,
      now: "2026-05-23T12:00:00-04:00",
      fetchImpl: fmpFetchMock({
        quote: [{ symbol: "MU", price: 132.1, previousClose: 130, change: 2.1, changesPercentage: 1.6154, volume: 1000 }],
        profile: [{ symbol: "MU", sector: "Technology", industry: "Semiconductors" }],
        history: { historical: [{ date: "2026-05-22", close: 132.1 }] }
      })
    }),
    tickers: ["MU"],
    asOf: "2026-05-23T12:00:00-04:00",
    now: "2026-05-23T12:00:00-04:00"
  });
  const omitted = await fetchMarketDataSnapshot({
    provider: createFinancialModelingPrepProvider({
      env: { FINANCIAL_MODELING_PREP_API_KEY: "fmp-secret-value" },
      cache,
      ttlConfig: cache.defaultTtls,
      now: "2026-05-23T12:03:00-04:00",
      fetchImpl: fmpFetchMock({ quote: [] })
    }),
    tickers: ["MU"],
    asOf: "2026-05-23T12:03:00-04:00",
    now: "2026-05-23T12:03:00-04:00"
  });

  assert.equal(omitted.status.status, "stale data");
  assert.equal(omitted.quotesByTicker.MU.price, 132.1);
  assert.equal(omitted.quotesByTicker.MU.cacheStatus, "stale");
  assert.match(omitted.status.detail, /no quote/i);
  assert.equal(omitted.status.fetchedAt, "2026-05-23T16:00:00.000Z");
  assert.equal(omitted.status.lastSuccessfulRefresh, "2026-05-23T16:00:00.000Z");
  assert.equal(JSON.stringify(omitted).includes("fmp-secret-value"), false);
});

test("Finnhub stale cache falls back when refresh fails", async () => {
  const cache = createMarketDataCache({ quoteTtlMs: 60_000, profileTtlMs: 60_000, historyTtlMs: 60_000 });
  await fetchMarketDataSnapshot({
    provider: createFinnhubProvider({
      env: { FINNHUB_API_KEY: "finnhub-secret-value" },
      cache,
      ttlConfig: cache.defaultTtls,
      now: "2026-05-23T12:00:00-04:00",
      fetchImpl: finnhubFetchMock({
        quote: { c: 132.1, d: 2.1, dp: 1.6154, h: 133, l: 129, o: 130, pc: 130, t: 1779552000 },
        profile: { ticker: "MU", name: "Micron", finnhubIndustry: "Semiconductors" },
        metrics: { metric: { "52WeekHigh": 157.54, "52WeekLow": 84.12 } },
        candles: { s: "ok", c: [132.1], t: [1779552000] }
      })
    }),
    tickers: ["MU"],
    asOf: "2026-05-23T12:00:00-04:00",
    now: "2026-05-23T12:00:00-04:00"
  });
  const stale = await fetchMarketDataSnapshot({
    provider: createFinnhubProvider({
      env: { FINNHUB_API_KEY: "finnhub-secret-value" },
      cache,
      ttlConfig: cache.defaultTtls,
      now: "2026-05-23T12:03:00-04:00",
      fetchImpl: finnhubFetchMock({ quoteStatus: 429, quoteText: "API limit reached for finnhub-secret-value" })
    }),
    tickers: ["MU"],
    asOf: "2026-05-23T12:03:00-04:00",
    now: "2026-05-23T12:03:00-04:00"
  });

  assert.equal(stale.status.status, "stale data");
  assert.equal(stale.quotesByTicker.MU.price, 132.1);
  assert.equal(stale.quotesByTicker.MU.cacheStatus, "stale");
  assert.match(stale.status.detail, /refresh failed/i);
  const diagnostic = stale.status.quoteDiagnostics.find((item) => item.ticker === "MU");
  assert.equal(diagnostic.coverageStatus, "stale");
  assert.ok(diagnostic.staleFields.includes("Quote"));
  assert.equal(JSON.stringify(stale).includes("finnhub-secret-value"), false);
});

test("Finnhub partial responses return usable rows with partial-data status", async () => {
  const snapshot = await fetchMarketDataSnapshot({
    provider: createFinnhubProvider({
      env: { FINNHUB_API_KEY: "finnhub-secret-value" },
      fetchImpl: async (url) => {
        const textUrl = String(url);
        const symbol = new URL(textUrl).searchParams.get("symbol");
        if (textUrl.includes("/quote?")) {
          return symbol === "MU"
            ? mockResponse({ c: 132.1, d: 2.1, dp: 1.6154, h: 133, l: 129, o: 130, pc: 130, t: 1779552000 })
            : mockResponse({ c: 0, d: 0, dp: 0, h: 0, l: 0, o: 0, pc: 0, t: 1779552000 });
        }
        if (textUrl.includes("/stock/profile2?")) return mockResponse({ ticker: symbol, name: symbol, finnhubIndustry: "Semiconductors" });
        if (textUrl.includes("/stock/metric?")) return mockResponse({ metric: { "52WeekHigh": 157.54, "52WeekLow": 84.12 } });
        if (textUrl.includes("/stock/candle?")) return mockResponse({ s: "ok", c: [132.1], t: [1779552000], v: [24600000] });
        return mockResponse({ error: "unexpected endpoint" }, 404);
      }
    }),
    tickers: ["MU", "BAD"],
    asOf: "2026-05-23T12:00:00-04:00",
    now: "2026-05-23T12:00:00-04:00"
  });

  assert.equal(snapshot.status.status, "partial data");
  assert.equal(snapshot.status.label, "Partial market data");
  assert.deepEqual(snapshot.missingTickers, ["BAD"]);
  assert.equal(snapshot.quotesByTicker.MU.price, 132.1);
  assert.equal(snapshot.quotesByTicker.MU.volume, 24600000);
  assert.equal(JSON.stringify(snapshot).includes("finnhub-secret-value"), false);
});

test("market data cache TTL config is deterministic and env-configurable", () => {
  const ttl = marketDataCacheTtlConfig({
    MARKET_DATA_QUOTE_TTL_MINUTES: "7",
    MARKET_DATA_PROFILE_TTL_HOURS: "6",
    MARKET_DATA_HISTORY_TTL_HOURS: "48"
  });

  assert.equal(ttl.quoteTtlMs, 7 * 60 * 1000);
  assert.equal(ttl.profileTtlMs, 6 * 60 * 60 * 1000);
  assert.equal(ttl.historyTtlMs, 48 * 60 * 60 * 1000);
});

test("Financial Modeling Prep invalid credentials are redacted and do not fabricate provider data", async () => {
  const invalidCredentials = await fetchMarketDataSnapshot({
    provider: createFinancialModelingPrepProvider({
      env: { FINANCIAL_MODELING_PREP_API_KEY: "fmp-secret-value" },
      fetchImpl: fmpFetchMock({
        quoteText: JSON.stringify({ Error: "Invalid API key fmp-secret-value" })
      })
    }),
    tickers: ["MU"],
    asOf: "2026-05-23T12:00:00-04:00"
  });

  assert.equal(invalidCredentials.status.status, "error");
  assert.equal(invalidCredentials.status.dataFreshness, "error");
  assert.equal(invalidCredentials.quotes.length, 0);
  assert.match(invalidCredentials.status.detail, /Invalid API key \[redacted\]/i);
  assert.equal(JSON.stringify(invalidCredentials).includes("fmp-secret-value"), false);
});

test("Finnhub invalid credentials, invalid tickers, and rate limits stay safe", async () => {
  const invalidCredentials = await fetchMarketDataSnapshot({
    provider: createFinnhubProvider({
      env: { FINNHUB_API_KEY: "finnhub-secret-value" },
      fetchImpl: finnhubFetchMock({
        quoteStatus: 401,
        quoteText: JSON.stringify({ error: "Invalid API key finnhub-secret-value" })
      })
    }),
    tickers: ["MU"],
    asOf: "2026-05-23T12:00:00-04:00"
  });
  const invalidTicker = await fetchMarketDataSnapshot({
    provider: createFinnhubProvider({
      env: { FINNHUB_API_KEY: "finnhub-secret-value" },
      fetchImpl: finnhubFetchMock({
        quote: { c: 0, d: 0, dp: 0, h: 0, l: 0, o: 0, pc: 0, t: 1779552000 },
        profile: {}
      })
    }),
    tickers: ["NOTREAL"],
    asOf: "2026-05-23T12:00:00-04:00"
  });
  const rateLimited = await fetchMarketDataSnapshot({
    provider: createFinnhubProvider({
      env: { FINNHUB_API_KEY: "finnhub-secret-value" },
      fetchImpl: finnhubFetchMock({ quoteStatus: 429, quoteText: "API limit reached for finnhub-secret-value" })
    }),
    tickers: ["MU"],
    asOf: "2026-05-23T12:00:00-04:00"
  });

  assert.equal(invalidCredentials.status.status, "error");
  assert.match(invalidCredentials.status.detail, /Invalid API key \[redacted\]/i);
  assert.equal(invalidTicker.status.status, "error");
  assert.match(invalidTicker.status.detail, /no quote/i);
  assert.equal(rateLimited.status.status, "rate limited");
  assert.match(rateLimited.status.detail, /rate limit|quota/i);
  assert.equal(rateLimited.status.quoteDiagnostics[0].coverageStatus, "missing");
  assert.ok(rateLimited.status.quoteDiagnostics[0].missingFields.includes("quote/current price"));
  assert.match(rateLimited.status.quoteDiagnostics[0].lastError, /rate limit|quota/i);
  assert.equal(JSON.stringify(invalidCredentials).includes("finnhub-secret-value"), false);
  assert.equal(JSON.stringify(invalidTicker).includes("finnhub-secret-value"), false);
  assert.equal(JSON.stringify(rateLimited).includes("finnhub-secret-value"), false);
});

test("Financial Modeling Prep rate limits and network failures produce safe error snapshots", async () => {
  const rateLimited = await fetchMarketDataSnapshot({
    provider: createFinancialModelingPrepProvider({
      env: { FINANCIAL_MODELING_PREP_API_KEY: "fmp-secret-value" },
      fetchImpl: fmpFetchMock({ quoteStatus: 429, quoteText: "Limit Reach for fmp-secret-value" })
    }),
    tickers: ["MU"],
    asOf: "2026-05-23T12:00:00-04:00"
  });
  const networkFailure = await fetchMarketDataSnapshot({
    provider: createFinancialModelingPrepProvider({
      env: { FINANCIAL_MODELING_PREP_API_KEY: "fmp-secret-value" },
      fetchImpl() {
        throw new TypeError("network failed");
      }
    }),
    tickers: ["MU"],
    asOf: "2026-05-23T12:00:00-04:00"
  });

  assert.equal(rateLimited.status.status, "rate limited");
  assert.match(rateLimited.status.detail, /rate limit|quota/i);
  assert.equal(JSON.stringify(rateLimited).includes("fmp-secret-value"), false);
  assert.equal(networkFailure.status.status, "error");
  assert.match(networkFailure.status.detail, /network failed/);
  assert.equal(JSON.stringify(networkFailure).includes("fmp-secret-value"), false);
});

test("mixed cached and live market resources are labeled cached instead of fully live", async () => {
  const cache = createMarketDataCache();
  await fetchMarketDataSnapshot({
    provider: createFinancialModelingPrepProvider({
      env: { FINANCIAL_MODELING_PREP_API_KEY: "fmp-secret-value" },
      cache,
      ttlConfig: { quoteTtlMs: 10 * 60_000, profileTtlMs: 10 * 60_000, historyTtlMs: 10 * 60_000 },
      now: "2026-05-23T12:00:00-04:00",
      fetchImpl: fmpFetchMock({
        quote: [{ symbol: "MU", price: 132.1, previousClose: 130, change: 2.1, changesPercentage: 1.6154, volume: 1000 }],
        profile: [{ symbol: "MU", sector: "Technology", industry: "Semiconductors" }],
        history: { historical: [{ date: "2026-05-22", close: 132.1 }] }
      })
    }),
    tickers: ["MU"],
    asOf: "2026-05-23T12:00:00-04:00",
    now: "2026-05-23T12:00:00-04:00"
  });
  const calls = [];
  const mixed = await fetchMarketDataSnapshot({
    provider: createFinancialModelingPrepProvider({
      env: { FINANCIAL_MODELING_PREP_API_KEY: "fmp-secret-value" },
      cache,
      ttlConfig: { quoteTtlMs: 10 * 60_000, profileTtlMs: 60_000, historyTtlMs: 60_000 },
      now: "2026-05-23T12:03:00-04:00",
      fetchImpl: countedFetch(calls, fmpFetchMock({
        profile: [{ symbol: "MU", sector: "Technology", industry: "Semiconductors" }],
        history: { historical: [{ date: "2026-05-23", close: 133.2 }] }
      }))
    }),
    tickers: ["MU"],
    asOf: "2026-05-23T12:03:00-04:00",
    now: "2026-05-23T12:03:00-04:00"
  });

  assert.equal(calls.length, 2);
  assert.equal(mixed.status.status, "cached");
  assert.equal(mixed.status.label, "Cached market data");
  assert.equal(mixed.dataFreshness, "cached");
  assert.equal(mixed.quotesByTicker.MU.cacheStatus, "cached");
  assert.equal(mixed.quotesByTicker.MU.price, 132.1);
});

test("Financial Modeling Prep partial responses and invalid tickers do not fabricate quotes", async () => {
  const provider = createFinancialModelingPrepProvider({
    env: { FINANCIAL_MODELING_PREP_API_KEY: "fmp-secret-value" },
    fetchImpl: fmpFetchMock({
      quote: [{ symbol: "MU", price: 132.1, previousClose: 130, change: 2.1, changesPercentage: 1.6154, volume: 1000 }],
      profileStatus: 404,
      historyStatus: 404
    })
  });
  const snapshot = await fetchMarketDataSnapshot({
    provider,
    tickers: ["MU", "BAD"],
    asOf: "2026-05-23T12:00:00-04:00",
    now: "2026-05-23T12:30:00-04:00"
  });

  assert.equal(snapshot.status.status, "partial data");
  assert.equal(snapshot.status.label, "Partial market data");
  assert.match(snapshot.status.detail, /Partial provider warning/i);
  assert.match(snapshot.status.detail, /Missing quotes: BAD/);
  assert.deepEqual(snapshot.quotes.map((quote) => quote.ticker), ["MU"]);
  assert.deepEqual(snapshot.requestedTickers, ["MU", "BAD"]);
  assert.deepEqual(snapshot.missingTickers, ["BAD"]);
  assert.deepEqual(snapshot.warnings, ["No normalized quote returned for BAD."]);
  assert.equal(snapshot.quotesByTicker.MU.sector, "Unknown");
  assert.equal(snapshot.quotesByTicker.MU.industry, "Unknown");
  assert.deepEqual(snapshot.quotesByTicker.MU.historicalPrices, []);
  assert.equal(snapshot.quotesByTicker.BAD, undefined);
});

test("Financial Modeling Prep helpers normalize direct provider payloads", () => {
  const history = normalizeFinancialModelingPrepHistory({
    historical: [
      { date: "2026-05-22", close: "132.10" },
      { date: "2026-05-20", adjClose: "128.40" }
    ]
  });
  const quote = normalizeFinancialModelingPrepQuote({
    symbol: "MU",
    price: 132.1,
    previousClose: 130,
    change: 2.1,
    changesPercentage: "1.6154%",
    timestamp: 1779552000
  }, {
    companyName: "Micron Technology, Inc.",
    sector: "Technology",
    industry: "Semiconductors",
    range: "84.12-157.54"
  }, history);

  assert.deepEqual(history.map((row) => row.date), ["2026-05-20", "2026-05-22"]);
  assert.equal(quote.ticker, "MU");
  assert.equal(quote.name, "Micron Technology, Inc.");
  assert.equal(quote.fiftyTwoWeekHigh, 157.54);
  assert.equal(quote.fiftyTwoWeekLow, 84.12);
});

test("Finnhub helpers normalize direct provider payloads", () => {
  const history = normalizeFinnhubHistory({
    s: "ok",
    c: [128.4, 132.1],
    t: [1779380000, 1779552000],
    v: [20_000_000, 24_600_000]
  });
  const quote = normalizeFinnhubQuote({
    symbol: "MU",
    c: 132.1,
    pc: 130,
    d: 2.1,
    dp: 1.6154,
    o: 130.2,
    h: 133.4,
    l: 129.1,
    t: 1779552000
  }, {
    name: "Micron Technology, Inc.",
    marketCapitalization: 147000,
    finnhubIndustry: "Semiconductors"
  }, history, {
    metric: {
      "52WeekHigh": 157.54,
      "52WeekLow": 84.12
    }
  });

  assert.equal(history.length, 2);
  assert.equal(quote.ticker, "MU");
  assert.equal(quote.name, "Micron Technology, Inc.");
  assert.equal(quote.dayOpen, 130.2);
  assert.equal(quote.dayHigh, 133.4);
  assert.equal(quote.dayLow, 129.1);
  assert.equal(quote.marketCap, 147000000000);
  assert.equal(quote.volume, 24600000);
  assert.equal(quote.industry, "Semiconductors");
  assert.equal(quote.fiftyTwoWeekHigh, 157.54);
  assert.equal(quote.fiftyTwoWeekLow, 84.12);
});

test("market data provider factory selects FMP when configured", () => {
  const provider = createMarketDataProviderFromConfig({
    MARKET_DATA_PROVIDER: "financialModelingPrep",
    FINANCIAL_MODELING_PREP_API_KEY: "fmp-secret-value"
  }, {
    fetchImpl: fmpFetchMock({ quote: [] })
  });

  assert.equal(provider.id, "financialModelingPrep");
  assert.equal(provider.configured, true);
  assert.equal(provider.liveProviderCalls, true);
});

test("market data provider factory selects Finnhub when configured", () => {
  const provider = createMarketDataProviderFromConfig({
    MARKET_DATA_PROVIDER: "finnhub",
    FINNHUB_API_KEY: "finnhub-secret-value"
  }, {
    fetchImpl: finnhubFetchMock({ quote: {} })
  });

  assert.equal(provider.id, "finnhub");
  assert.equal(provider.configured, true);
  assert.equal(provider.liveProviderCalls, true);
});

test("market data fallback providers are explicit and exclude the selected provider", () => {
  assert.deepEqual(marketDataFallbackProviderIds({
    MARKET_DATA_PROVIDER: "finnhub",
    MARKET_DATA_FALLBACK_PROVIDERS: "financialModelingPrep,finnhub,alphaVantage"
  }), ["financialModelingPrep"]);

  assert.deepEqual(marketDataFallbackProviderIds({
    MARKET_DATA_PROVIDER: "financialModelingPrep",
    MARKET_DATA_FALLBACK_PROVIDER: "finnhub"
  }), ["finnhub"]);
});

test("configured provider does not call getQuotes until live provider calls are enabled", async () => {
  let called = false;
  const snapshot = await fetchMarketDataSnapshot({
    provider: {
      id: "financialModelingPrep",
      label: "Financial Modeling Prep",
      mode: "config-only",
      configured: true,
      liveProviderCalls: false,
      sourceTypes: ["quote", "profile", "historical-prices"],
      getQuotes() {
        called = true;
        throw new Error("should not be called");
      }
    },
    tickers: ["MU"],
    asOf: "2026-05-23T12:00:00-04:00"
  });

  assert.equal(called, false);
  assert.equal(snapshot.liveProviderCalls, false);
  assert.equal(snapshot.status.status, "configured-not-connected");
  assert.equal(snapshot.status.label, "Market data not configured");
  assert.equal(snapshot.status.quoteCount, 0);
});

test("market data enrichment adds mock daily move and metadata without changing market value", () => {
  const snapshot = buildMockMarketDataSnapshot(["MU"], {
    asOf: "2026-05-23T12:00:00-04:00",
    now: "2026-05-23T12:30:00-04:00"
  });
  const [holding] = applyMarketDataToHoldings([{
    ticker: "MU",
    name: "Micron",
    account: "Taxable",
    shares: 10,
    price: 100,
    marketValue: 1000,
    dailyChange: 0,
    sector: "Unknown"
  }], snapshot);

  assert.equal(holding.marketValue, 1000);
  assert.equal(holding.dailyChange, 21.8);
  assert.equal(holding.sector, "Semiconductors");
  assert.equal(holding.marketDataPrice, 132.1);
  assert.equal(holding.marketDataMode, "mock");
  assert.equal(holding.marketDataIsMock, true);
  assert.equal(holding.dailyChangeSource, "mock-market-data");
});

test("live and cached quote data marks imported holdings to market", () => {
  const provider = {
    id: "finnhub",
    label: "Finnhub",
    mode: "live-ready",
    configured: true,
    liveProviderCalls: true,
    sourceTypes: ["quote"]
  };
  const snapshot = buildMarketDataSnapshot({
    provider,
    requestedTickers: ["MU"],
    asOf: "2026-05-23T12:00:00-04:00",
    now: "2026-05-23T12:05:00-04:00",
    quotes: [{
      ticker: "MU",
      price: 200,
      previousClose: 190,
      dailyChange: 10,
      dailyChangePercent: 0.0526315789,
      dataFreshness: "cached",
      cacheStatus: "cached",
      providerId: "finnhub",
      providerLabel: "Finnhub",
      liveProviderCalls: true
    }]
  });
  const [holding] = applyMarketDataToHoldings([{
    ticker: "MU",
    name: "Micron",
    account: "Taxable",
    shares: 10,
    price: 100,
    marketValue: 1000,
    dailyChange: 0,
    sector: "Semiconductors"
  }], snapshot, { dailyChangeMode: "replace" });

  assert.equal(holding.price, 200);
  assert.equal(holding.marketValue, 2000);
  assert.equal(holding.dailyChange, 100);
  assert.equal(Math.round(holding.dailyChangePercent * 10000) / 10000, 0.0526);
  assert.equal(holding.marketDataAppliedToDailyChange, true);
});

test("market data preserves imported daily change unless replacement is requested", () => {
  const snapshot = buildMockMarketDataSnapshot(["MU"], {
    asOf: "2026-05-23T12:00:00-04:00",
    now: "2026-05-23T12:30:00-04:00"
  });
  const importedHolding = {
    ticker: "MU",
    name: "Micron",
    account: "Taxable",
    shares: 10,
    price: 100,
    marketValue: 1000,
    dailyChange: 5,
    dailyChangePercent: 0.005,
    sector: "Semiconductors"
  };
  const [preserved] = applyMarketDataToHoldings([importedHolding], snapshot);
  const [replaced] = applyMarketDataToHoldings([importedHolding], snapshot, { dailyChangeMode: "replace" });

  assert.equal(preserved.dailyChange, 5);
  assert.equal(preserved.dailyChangeSource, "imported-holding");
  assert.equal(preserved.marketDataAppliedToDailyChange, false);
  assert.equal(replaced.dailyChange, 21.8);
  assert.equal(replaced.marketDataAppliedToDailyChange, true);
});

function fmpFetchMock(options = {}) {
  return async function fetchImpl(url) {
    const textUrl = String(url);
    if (textUrl.includes("/quote?")) {
      return mockResponse(options.quote || [], options.quoteStatus || 200, options.quoteText);
    }
    if (textUrl.includes("/profile?")) {
      return mockResponse(options.profile || [], options.profileStatus || 200, options.profileText);
    }
    if (textUrl.includes("/historical-price-eod/full?")) {
      return mockResponse(options.history || { historical: [] }, options.historyStatus || 200, options.historyText);
    }
    return mockResponse({ error: "unexpected endpoint" }, 404);
  };
}

function finnhubFetchMock(options = {}) {
  return async function fetchImpl(url) {
    const textUrl = String(url);
    if (textUrl.includes("/quote?")) {
      return mockResponse(options.quote || {}, options.quoteStatus || 200, options.quoteText);
    }
    if (textUrl.includes("/stock/profile2?")) {
      return mockResponse(options.profile || {}, options.profileStatus || 200, options.profileText);
    }
    if (textUrl.includes("/stock/metric?")) {
      return mockResponse(options.metrics || { metric: {} }, options.metricsStatus || 200, options.metricsText);
    }
    if (textUrl.includes("/stock/candle?")) {
      return mockResponse(options.candles || { s: "no_data" }, options.candlesStatus || 200, options.candlesText);
    }
    return mockResponse({ error: "unexpected endpoint" }, 404);
  };
}

function countedFetch(calls, fetchImpl) {
  return async function counted(url) {
    calls.push(String(url));
    return fetchImpl(url);
  };
}

function mockResponse(payload, status = 200, textOverride = null) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => textOverride ?? JSON.stringify(payload)
  };
}
