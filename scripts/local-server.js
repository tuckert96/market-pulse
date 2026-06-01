import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  buildDemoMarketEventDataset,
  buildMarketProviderStatuses,
  isSupportedMarketProvider
} from "../src/marketEventProviders.js";
import { isUsableCredentialValue } from "../src/configValueSafety.js";
import {
  buildMarketDataProviderConfig,
  buildMarketDataProviderStatuses,
  buildMockMarketDataSnapshot,
  createMarketDataCache,
  createMarketDataProviderById,
  createMarketDataProviderFromConfig,
  DEFAULT_MARKET_DATA_WATCHLIST,
  fetchMarketDataSnapshot,
  marketDataCacheTtlConfig,
  marketDataFallbackProviderIds,
  marketDataProviderAttemptFromSnapshot,
  normalizeMarketDataProviderAttempts,
  marketDataRequestBudgetConfig
} from "../src/marketDataProvider.js";
import {
  buildRedditProviderConfig,
  createRedditProvider,
  redditProviderStatuses
} from "../src/redditSignals.js";
import {
  buildPoliticianTradeProviderConfig,
  createPoliticianTradeProvider,
  DEFAULT_POLITICIAN_TRADE_SOURCE_URL,
  politicianTradeProviderStatuses
} from "../src/politicianTrades.js";
import {
  buildOpenAIExplanationConfig,
  buildOpenAIResponsesRequest,
  buildPortfolioExplanationFallback,
  extractOpenAIResponseText,
  redactSecretLikeText as redactExplanationSecretLikeText
} from "../src/portfolioExplanation.js";
import {
  buildXProviderConfig,
  createXUpdatesProvider,
  xProviderStatuses
} from "../src/xUpdatesProvider.js";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 4174);
const maxJsonBodyBytes = 1_000_000;
const defaultMaxMarketDataTickers = 50;
const maxHistoryLimit = 260;
const defaultPoliticianTradeSourceUrl = DEFAULT_POLITICIAN_TRADE_SOURCE_URL;
const redditTokenUrl = "https://www.reddit.com/api/v1/access_token";
const redditApiBaseUrl = "https://oauth.reddit.com";
const redditSourceUrlBase = "https://www.reddit.com";
const plaidEnvironmentHosts = Object.freeze({
  sandbox: "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production: "https://production.plaid.com"
});
const fidelityPlaidSessionPath = join(rootDir, "local-data", "fidelity-plaid-session.json");
export const localMarketDataCache = createMarketDataCache();
export const localPoliticianTradeCache = {
  payload: null,
  fetchedAt: null
};
export const localRedditMentionCache = {
  payload: null,
  fetchedAt: null,
  key: ""
};
export const localXUpdateCache = {
  payload: null,
  fetchedAt: null,
  key: ""
};

export function buildConfigStatus(env = process.env, options = {}) {
  const plaidSession = options.fidelityPlaidSession || null;
  const plaidStatus = credentialStatus(env, ["PLAID_CLIENT_ID", "PLAID_SECRET"]);
  return {
    mode: "local",
    exposesSecretValues: false,
    connectors: {
      plaid: {
        ...plaidStatus,
        provider: "plaid",
        label: "Plaid Investments",
        environment: plaidEnvironment(env),
        linked: Boolean(plaidSession?.accessToken),
        itemLinked: Boolean(plaidSession?.itemId),
        linkedAt: plaidSession?.linkedAt || null,
        lastSync: plaidSession?.lastSync || null,
        liveProviderCalls: plaidStatus.configured && Boolean(plaidSession?.accessToken),
        detail: plaidStatus.configured
          ? plaidSession?.accessToken
            ? "Plaid is configured and a local Fidelity item is linked. Access tokens stay server-side."
            : "Plaid credentials are configured. Start Plaid Link to connect Fidelity."
          : "Plaid credentials are not configured in local .env."
      },
      snaptrade: credentialStatus(env, ["SNAPTRADE_CLIENT_ID", "SNAPTRADE_CONSUMER_KEY"])
    },
    marketData: {
      selectedProvider: buildMarketDataProviderConfig(env).selectedProvider,
      financialModelingPrep: hasEnvValue(env, "FINANCIAL_MODELING_PREP_API_KEY") || hasEnvValue(env, "FMP_API_KEY"),
      finnhub: hasEnvValue(env, "FINNHUB_API_KEY"),
      alphaVantage: hasEnvValue(env, "ALPHA_VANTAGE_API_KEY"),
      newsApi: hasEnvValue(env, "NEWSAPI_KEY"),
      xApi: hasEnvValue(env, "X_BEARER_TOKEN"),
      polygon: hasEnvValue(env, "POLYGON_API_KEY"),
      twelveData: hasEnvValue(env, "TWELVE_DATA_API_KEY")
    },
    marketDataProviders: buildMarketProviderStatuses(env),
    marketDataConfig: buildMarketDataProviderConfig(env),
    marketDataQuoteProviders: buildMarketDataProviderStatuses(env),
    redditProviderConfig: buildRedditProviderConfig(env),
    redditProviderStatuses: redditProviderStatuses(env),
    xProviderConfig: buildXProviderConfig(env),
    xProviderStatuses: xProviderStatuses(env),
    aiProviders: {
      openai: buildOpenAIExplanationConfig(env)
    },
    politicianTradeProviderConfig: buildPoliticianTradeProviderConfig(env, {
      defaultSourceUrl: defaultPoliticianTradeSourceUrl
    }),
    politicianTradeProviderStatuses: politicianTradeProviderStatuses(env, {
      defaultSourceUrl: defaultPoliticianTradeSourceUrl
    })
  };
}

export async function apiResponse(method, pathname, searchParams = new URLSearchParams(), body = {}, env = process.env, options = {}) {
  if (pathname.startsWith("/api/") && isCrossSiteRequest(options.headers || {})) {
    return json(403, {
      error: "cross_site_request_blocked",
      message: "Local API requests must come from the local dashboard origin."
    });
  }

  if (method === "GET" && pathname === "/api/health") {
    return ok({ ok: true, service: "tucker-dashboard-local-api", mode: "local" });
  }

  if (method === "GET" && pathname === "/api/config") {
    return ok(buildConfigStatus(env, { fidelityPlaidSession: readFidelityPlaidSession(options) }));
  }

  if (pathname === "/api/portfolio/explanation" && method === "POST") {
    return portfolioExplanationResponse(body, env, options);
  }

  if (pathname === "/api/connectors/fidelity/link" && method === "POST") {
    const provider = body.provider || "plaid";
    if (provider === "plaid") return createFidelityPlaidLinkToken(env, options);
    return connectorSetupResponse("fidelity", provider, env);
  }

  if (pathname === "/api/connectors/fidelity/exchange" && method === "POST") {
    const provider = body.provider || "plaid";
    if (provider !== "plaid") return connectorSetupResponse("fidelity", provider, env);
    return exchangeFidelityPlaidPublicToken(body.public_token || body.publicToken, env, options);
  }

  if (pathname === "/api/connectors/fidelity/holdings" && method === "GET") {
    const provider = searchParams.get("provider") || "plaid";
    if (provider === "plaid") return getFidelityPlaidHoldings(env, options);
    return connectorSetupResponse("fidelity", provider, env);
  }

  if (pathname === "/api/connectors/fidelity/unlink" && method === "POST") {
    const provider = body.provider || "plaid";
    if (provider !== "plaid") return connectorSetupResponse("fidelity", provider, env);
    return unlinkFidelityPlaid(env, options);
  }

  if (pathname === "/api/connectors/seeking-alpha/link" && method === "POST") {
    return notConfigured("seeking-alpha", "Use local CSV/XLSX import today, or add a licensed backend integration later.");
  }

  if (pathname === "/api/connectors/seeking-alpha/ratings" && method === "GET") {
    return notConfigured("seeking-alpha", "No licensed Seeking Alpha ratings API is configured. Import an authorized export instead.");
  }

  if (pathname === "/api/market/events" && method === "GET") {
    const provider = searchParams.get("provider") || "all";
    if (provider !== "all" && !isSupportedMarketProvider(provider)) {
      return json(400, {
        error: "unsupported_market_provider",
        provider,
        message: `${provider} is not a supported market-event provider adapter.`
      });
    }
    return ok(buildDemoMarketEventDataset({ env, requestedProvider: provider }));
  }

  if ((pathname === "/api/market-data/quotes" || pathname === "/api/market/quotes") && method === "GET") {
    const requestedTickers = parseTickerList(searchParams.get("tickers")) || DEFAULT_MARKET_DATA_WATCHLIST;
    const requestBudget = marketDataRequestBudgetConfig(env);
    const maxMarketDataTickers = clampNumber(requestBudget.maxQuoteTickers || defaultMaxMarketDataTickers, 1, defaultMaxMarketDataTickers);
    const tickers = requestedTickers.slice(0, maxMarketDataTickers);
    const truncatedTickers = requestedTickers.slice(maxMarketDataTickers);
    const includeHistory = !["0", "false", "no"].includes(String(searchParams.get("history") || searchParams.get("includeHistory") || "1").toLowerCase());
    const includeProfile = !["0", "false", "no"].includes(String(searchParams.get("profile") || searchParams.get("includeProfile") || "1").toLowerCase());
    const historyLimit = clampNumber(searchParams.get("historyLimit") || 30, 1, maxHistoryLimit);
    const requestTime = options.now || new Date().toISOString();
    const ttlConfig = marketDataCacheTtlConfig(env);
    const cache = options.cache || localMarketDataCache;
    const marketDataConfig = buildMarketDataProviderConfig(env);
    const providerOptions = {
      cache,
      fetchImpl: options.fetchImpl,
      includeHistory,
      includeProfile,
      historyLimit,
      now: requestTime,
      requestBudget,
      ttlConfig
    };
    const provider = createMarketDataProviderFromConfig(env, providerOptions);

    if (marketDataConfig.configured && !marketDataConfig.liveProviderCalls) {
      const fallback = buildMockMarketDataSnapshot(tickers, {
        asOf: requestTime,
        now: requestTime
      });
      const providerAttempts = normalizeMarketDataProviderAttempts([
        {
          providerId: marketDataConfig.selectedProvider,
          providerLabel: marketDataConfig.selectedLabel,
          role: "primary",
          status: "configured-not-connected",
          timestamp: requestTime,
          quoteCount: 0,
          requestedTickerCount: tickers.length,
          missingTickerCount: tickers.length,
          cacheStatus: "not configured",
          dataFreshness: "not configured",
          detail: `${marketDataConfig.selectedLabel} credentials are present, but live quote calls are disabled for this provider.`
        },
        marketDataProviderAttemptFromSnapshot(fallback, { role: "sample", attemptedAt: requestTime })
      ]);
      return ok({
        ...fallback,
        providerAttempts,
        requestedTickerCount: requestedTickers.length,
        truncatedTickers,
        warnings: [
          ...(fallback.warnings || []),
          ...(truncatedTickers.length ? [`Quote request capped at ${maxMarketDataTickers} tickers; ${truncatedTickers.length} ticker${truncatedTickers.length === 1 ? "" : "s"} omitted.`] : [])
        ],
        configured: true,
        fallbackReason: "selected-provider-configured-not-connected",
        status: {
          ...fallback.status,
          requestedTickerCount: requestedTickers.length,
          truncatedTickers,
          providerAttempts,
          status: "configured-not-connected",
          label: "Market data configured, not connected",
          detail: `${marketDataConfig.selectedLabel} credentials are present, but this provider is not enabled for live quote calls. Sample quote data is displayed as fallback.`
        }
      });
    }

    if (!provider.configured) {
      const fallback = buildMockMarketDataSnapshot(tickers, {
        asOf: requestTime,
        now: requestTime
      });
      const providerAttempts = normalizeMarketDataProviderAttempts([
        {
          providerId: marketDataConfig.selectedProvider,
          providerLabel: marketDataConfig.selectedLabel,
          role: "primary",
          status: "not configured",
          timestamp: requestTime,
          quoteCount: 0,
          requestedTickerCount: tickers.length,
          missingTickerCount: tickers.length,
          cacheStatus: "not configured",
          dataFreshness: "not configured",
          detail: "No live market data API key is configured in local .env."
        },
        marketDataProviderAttemptFromSnapshot(fallback, { role: "sample", attemptedAt: requestTime })
      ]);
      return ok({
        ...fallback,
        providerAttempts,
        requestedTickerCount: requestedTickers.length,
        truncatedTickers,
        warnings: [
          ...(fallback.warnings || []),
          ...(truncatedTickers.length ? [`Quote request capped at ${maxMarketDataTickers} tickers; ${truncatedTickers.length} ticker${truncatedTickers.length === 1 ? "" : "s"} omitted.`] : [])
        ],
        fallbackReason: "missing-market-data-credentials",
        status: {
          ...fallback.status,
          requestedTickerCount: requestedTickers.length,
          truncatedTickers,
          providerAttempts,
          detail: "Sample quote data returned because no live market data API key is configured in local .env."
        }
      });
    }

    const primarySnapshot = await fetchMarketDataSnapshot({
      provider,
      tickers,
      asOf: requestTime,
      now: requestTime
    });
    const snapshot = await marketDataSnapshotWithFallback({
      primarySnapshot,
      env,
      providerOptions,
      tickers,
      requestTime
    });
    const warnings = [
      ...(snapshot.warnings || []),
      ...(truncatedTickers.length ? [`Quote request capped at ${maxMarketDataTickers} tickers; ${truncatedTickers.length} ticker${truncatedTickers.length === 1 ? "" : "s"} omitted.`] : [])
    ];
    return ok({
      ...snapshot,
      requestedTickerCount: requestedTickers.length,
      truncatedTickers,
      warnings,
      status: {
        ...snapshot.status,
        requestedTickerCount: requestedTickers.length,
        truncatedTickers,
        warnings
      }
    });
  }

  if ((pathname === "/api/politician-trades" || pathname === "/api/politician/trades") && method === "GET") {
    const providerName = searchParams.get("provider") || env.POLITICIAN_TRADES_PROVIDER || "mock";
    if (!["mock", "senate-stock-watcher", "public-static-dataset"].includes(providerName)) {
      return json(400, {
        error: "unsupported_politician_trade_provider",
        provider: providerName,
        message: `${providerName} is not a supported politician-trade provider adapter.`
      });
    }

    const config = buildPoliticianTradeProviderConfig({ ...env, POLITICIAN_TRADES_PROVIDER: providerName }, {
      defaultSourceUrl: defaultPoliticianTradeSourceUrl
    });
    const requestTime = options.now || new Date().toISOString();
    const ttlMs = ttlMillisecondsFromHours(env.POLITICIAN_TRADES_TTL_HOURS, 12, 5 * 60 * 1000);
    const cache = options.politicianTradeCache || localPoliticianTradeCache;

    if (providerName === "mock" || !config.configured) {
      return ok({
        ...config,
        mode: "mock",
        liveProviderCalls: false,
        records: [],
        warnings: ["Politician trade live provider is not configured. Sample/local disclosure rows remain active in the browser."]
      });
    }

    const cached = cache.payload && cache.fetchedAt && (new Date(requestTime).getTime() - new Date(cache.fetchedAt).getTime()) < ttlMs;
    if (cached) {
      return ok({
        ...cache.payload,
        cacheStatus: "cached",
        fetchedAt: cache.fetchedAt,
        dataFreshness: "cached",
        cacheTtlMs: ttlMs
      });
    }

    const sourceUrl = env.POLITICIAN_TRADES_SOURCE_URL || defaultPoliticianTradeSourceUrl;
    const provider = createPoliticianTradeProvider("senate-stock-watcher", {
      sourceUrl,
      liveEnabled: true,
      fetchImpl: options.fetchImpl,
      providerId: "senate-stock-watcher-public-dataset",
      label: "Senate Stock Watcher public dataset"
    });
    const payload = await provider.fetchRawTrades({
      asOf: requestTime,
      limit: Number(searchParams.get("limit") || env.POLITICIAN_TRADES_LIMIT || 250),
      fetchImpl: options.fetchImpl,
      sourceUrl,
      liveEnabled: true
    });
    const refreshStatus = providerRefreshStatus(payload, payload.ok ? "connected" : "error");
    const responsePayload = {
      ...payload,
      status: refreshStatus,
      refreshStatus,
      cacheStatus: payload.ok || payload.partial ? "fresh" : refreshStatus,
      fetchedAt: requestTime,
      dataFreshness: providerDataFreshness(payload, refreshStatus),
      cacheTtlMs: ttlMs
    };
    if (payload.ok) {
      cache.payload = responsePayload;
      cache.fetchedAt = requestTime;
    } else if (cache.payload) {
      return ok({
        ...cache.payload,
        status: refreshStatus === "rate limited" ? "rate limited" : "stale",
        refreshStatus,
        cacheStatus: "stale",
        dataFreshness: "stale",
        refreshAttemptedAt: requestTime,
        staleSourceFetchedAt: cache.fetchedAt,
        lastSuccessfulRefresh: cache.fetchedAt,
        lastError: payload.warnings?.[0] || "Provider refresh failed.",
        warnings: [
          "Using cached politician trade disclosures because refresh failed.",
          ...(payload.warnings || [])
        ]
      });
    }
    return ok(responsePayload);
  }

  if ((pathname === "/api/reddit/mentions" || pathname === "/api/reddit-signals") && method === "GET") {
    const providerName = searchParams.get("provider") || "reddit-api";
    if (!["reddit-api", "reddit", "official-reddit-api"].includes(providerName)) {
      return json(400, {
        error: "unsupported_reddit_provider",
        provider: providerName,
        message: `${providerName} is not a supported Reddit provider adapter.`
      });
    }

    const requestTime = options.now || new Date().toISOString();
    const config = buildRedditProviderConfig(env, {
      subreddits: searchParams.get("subreddits") || env.REDDIT_SUBREDDITS,
      whitelist: searchParams.get("whitelist"),
      falsePositives: searchParams.get("falsePositives")
    });
    const cache = options.redditMentionCache || localRedditMentionCache;
    const ttlMs = ttlMillisecondsFromMinutes(config.ttlMinutes, 15, 60_000);
    const cacheKey = redditMentionCacheKey(config);
    const cached = cache.payload && cache.fetchedAt && cache.key === cacheKey && (new Date(requestTime).getTime() - new Date(cache.fetchedAt).getTime()) < ttlMs;

    if (!config.liveProviderCalls) {
      return ok({
        ...config,
        mode: config.configured ? "configured-not-connected" : "not-configured",
        liveProviderCalls: false,
        records: [],
        summary: [],
        warnings: [config.detail]
      });
    }

    if (cached) {
      return ok({
        ...cache.payload,
        cacheStatus: "cached",
        dataFreshness: "cached",
        fetchedAt: cache.fetchedAt,
        cacheTtlMs: ttlMs
      });
    }

    const provider = createRedditProvider("reddit-api", {
      env,
      settings: {
        subreddits: searchParams.get("subreddits") || env.REDDIT_SUBREDDITS,
        whitelist: searchParams.get("whitelist") || config.whitelist,
        falsePositives: searchParams.get("falsePositives") || config.falsePositives
      },
      fetchImpl: options.fetchImpl,
      tokenUrl: redditTokenUrl,
      apiBaseUrl: redditApiBaseUrl,
      sourceUrlBase: redditSourceUrlBase,
      asOf: requestTime
    });
    const payload = await provider.getRawMentions();
    const refreshStatus = providerRefreshStatus(payload, payload.ok ? "connected" : "error");
    const responsePayload = {
      ...payload,
      status: refreshStatus,
      refreshStatus,
      cacheStatus: payload.ok || payload.partial ? "fresh" : refreshStatus,
      fetchedAt: requestTime,
      dataFreshness: providerDataFreshness(payload, refreshStatus),
      cacheTtlMs: ttlMs
    };

    if (payload.ok || payload.partial) {
      cache.payload = responsePayload;
      cache.fetchedAt = requestTime;
      cache.key = cacheKey;
    } else if (cache.payload && cache.key === cacheKey) {
      return ok({
        ...cache.payload,
        status: refreshStatus === "rate limited" ? "rate limited" : "stale",
        refreshStatus,
        cacheStatus: "stale",
        dataFreshness: "stale",
        refreshAttemptedAt: requestTime,
        staleSourceFetchedAt: cache.fetchedAt,
        lastSuccessfulRefresh: cache.fetchedAt,
        lastError: payload.warnings?.[0] || "Reddit provider refresh failed.",
        warnings: [
          "Using cached Reddit mention rows because refresh failed.",
          ...(payload.warnings || [])
        ]
      });
    }
    return ok(responsePayload);
  }

  if ((pathname === "/api/x/updates" || pathname === "/api/twitter/updates") && method === "GET") {
    const providerName = searchParams.get("provider") || "x-api";
    if (!["mock", "sample", "x-api", "x", "twitter", "twitter-api"].includes(providerName)) {
      return json(400, {
        error: "unsupported_x_provider",
        provider: providerName,
        message: `${providerName} is not a supported X updates provider adapter.`
      });
    }

    const requestTime = options.now || new Date().toISOString();
    const config = buildXProviderConfig(env, {
      query: searchParams.get("query") || env.X_QUERY,
      whitelist: searchParams.get("whitelist") || env.X_TICKER_WHITELIST
    });
    const cache = options.xUpdateCache || localXUpdateCache;
    const ttlMs = Math.max(60_000, Number(config.ttlMinutes || 15) * 60 * 1000);
    const cacheKey = xUpdateCacheKey(config);
    const cached = cache.payload && cache.fetchedAt && cache.key === cacheKey && (new Date(requestTime).getTime() - new Date(cache.fetchedAt).getTime()) < ttlMs;

    if (providerName === "mock" || providerName === "sample") {
      const provider = createXUpdatesProvider("mock", {
        asOf: requestTime,
        settings: {
          query: searchParams.get("query") || config.query,
          whitelist: searchParams.get("whitelist") || config.whitelist
        }
      });
      const payload = await provider.getRawUpdates();
      return ok({
        ...payload,
        cacheStatus: "mock",
        dataFreshness: "mock",
        fetchedAt: requestTime
      });
    }

    if (!config.liveProviderCalls) {
      return ok({
        ...config,
        mode: config.configured ? "configured-not-connected" : "not-configured",
        liveProviderCalls: false,
        records: [],
        summary: [],
        warnings: [config.detail]
      });
    }

    if (cached) {
      return ok({
        ...cache.payload,
        cacheStatus: "cached",
        dataFreshness: "cached",
        fetchedAt: cache.fetchedAt
      });
    }

    const provider = createXUpdatesProvider("x-api", {
      env,
      settings: {
        query: searchParams.get("query") || config.query,
        whitelist: searchParams.get("whitelist") || config.whitelist
      },
      fetchImpl: options.fetchImpl,
      apiBaseUrl: options.xApiBaseUrl || env.X_API_BASE_URL || "https://api.x.com/2",
      asOf: requestTime
    });
    const payload = await provider.getRawUpdates();
    const responsePayload = {
      ...payload,
      cacheStatus: payload.ok || payload.partial ? "fresh" : payload.status || "error",
      fetchedAt: requestTime,
      dataFreshness: payload.ok || payload.partial ? "fresh" : payload.status || "error"
    };

    if (payload.ok || payload.partial) {
      cache.payload = responsePayload;
      cache.fetchedAt = requestTime;
      cache.key = cacheKey;
    } else if (cache.payload && cache.key === cacheKey) {
      return ok({
        ...cache.payload,
        cacheStatus: "stale",
        dataFreshness: "stale",
        lastError: payload.warnings?.[0] || "X provider refresh failed.",
        warnings: [
          "Using cached X update rows because refresh failed.",
          ...(payload.warnings || [])
        ]
      });
    }
    return ok(responsePayload);
  }

  return json(404, { error: "not_found", message: `No local API route for ${method} ${pathname}.` });
}

async function portfolioExplanationResponse(body = {}, env = process.env, options = {}) {
  const config = buildOpenAIExplanationConfig(env);
  const fallback = buildPortfolioExplanationFallback(body, { status: config.status });

  if (!config.liveProviderCalls) {
    return ok({
      ...fallback,
      provider: "openai",
      openai: config,
      status: config.status,
      fallbackUsed: true,
      warnings: [config.configured
        ? "OpenAI explanation calls are disabled. Returned deterministic local explanation."
        : "OpenAI API key is not configured. Returned deterministic local explanation."]
    });
  }

  const fetchImpl = options.fetchImpl || fetch;
  const model = config.model;
  const requestPayload = buildOpenAIResponsesRequest(body, { model });

  try {
    const response = await fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`
      },
      body: JSON.stringify(requestPayload)
    });
    const text = await response.text();
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { raw: text };
    }
    if (!response.ok) {
      const message = payload.error?.message || payload.message || text || `OpenAI request failed (${response.status})`;
      throw Object.assign(new Error(message), { status: response.status, payload });
    }
    const outputText = extractOpenAIResponseText(payload);
    if (!outputText) throw new Error("OpenAI response did not include usable explanation text.");

    return ok({
      ok: true,
      mode: "AI-assisted",
      sourceMode: "AI-assisted",
      status: "connected",
      provider: "openai",
      model,
      openai: {
        ...config,
        status: "connected"
      },
      dataSources: fallback.dataSources,
      explanation: {
        ...fallback.explanation,
        title: "AI-assisted portfolio explanation",
        narrative: outputText,
        caveats: [
          ...(fallback.explanation.caveats || []),
          "AI-assisted text is grounded in the supplied dashboard data and should be reviewed for accuracy."
        ]
      },
      fallbackUsed: false
    });
  } catch (error) {
    return ok({
      ...fallback,
      provider: "openai",
      openai: {
        ...config,
        status: "error"
      },
      status: "error",
      fallbackUsed: true,
      lastError: redactExplanationSecretLikeText(error?.message || String(error), [env.OPENAI_API_KEY]),
      warnings: ["OpenAI explanation failed safely. Returned deterministic local explanation."]
    });
  }
}

function redditMentionCacheKey(config = {}) {
  return JSON.stringify({
    provider: config.selectedProvider || "reddit-api",
    subreddits: [...(config.subreddits || [])].sort(),
    whitelist: [...(config.whitelist || [])].sort(),
    falsePositives: [...(config.falsePositives || [])].sort()
  });
}

function ttlMillisecondsFromHours(value, fallbackHours, minMs) {
  const hours = Number(value);
  const fallbackMs = fallbackHours * 60 * 60 * 1000;
  if (!Number.isFinite(hours) || hours <= 0) return Math.max(minMs, fallbackMs);
  return Math.max(minMs, hours * 60 * 60 * 1000);
}

function ttlMillisecondsFromMinutes(value, fallbackMinutes, minMs) {
  const minutes = Number(value);
  const fallbackMs = fallbackMinutes * 60 * 1000;
  if (!Number.isFinite(minutes) || minutes <= 0) return Math.max(minMs, fallbackMs);
  return Math.max(minMs, minutes * 60 * 1000);
}

function providerRefreshStatus(payload = {}, fallback = "error") {
  if (payload.status === "rate limited" || Number(payload.status) === 429 || Number(payload.httpStatus) === 429) {
    return "rate limited";
  }
  if (typeof payload.status === "string" && payload.status.trim()) return payload.status;
  const text = `${payload.warnings?.join(" ") || ""} ${payload.lastError || ""}`.toLowerCase();
  if (/rate limit|http 429|\b429\b/.test(text)) return "rate limited";
  return fallback;
}

function providerDataFreshness(payload = {}, refreshStatus = "error") {
  if (payload.ok && refreshStatus === "connected") return "fresh";
  if (payload.ok || payload.partial) return ["partial", "rate limited"].includes(refreshStatus) ? "partial" : "fresh";
  return refreshStatus;
}

function xUpdateCacheKey(config = {}) {
  return JSON.stringify({
    provider: config.selectedProvider || "x-api",
    query: config.query || "",
    whitelist: [...(config.whitelist || [])].sort(),
    falsePositives: [...(config.falsePositives || [])].sort()
  });
}

export function loadLocalEnv(envPath = join(rootDir, ".env"), env = process.env) {
  if (!existsSync(envPath)) return env;
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (!String(env[key] || "").trim()) env[key] = rest.join("=").trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

export function createDashboardServer({ env = process.env, staticRoot = rootDir } = {}) {
  return createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    if (url.pathname.startsWith("/api/")) {
      try {
        const body = await readJsonBody(request);
        sendJson(response, await apiResponse(request.method || "GET", url.pathname, url.searchParams, body, env, { headers: request.headers }));
      } catch (error) {
        const tooLarge = error?.code === "request_body_too_large";
        sendJson(response, json(tooLarge ? 413 : 400, {
          error: tooLarge ? "request_body_too_large" : "invalid_request_body",
          message: tooLarge
            ? `Request body exceeds the ${maxJsonBodyBytes} byte local API limit.`
            : "Request body could not be read by the local API."
        }));
      }
      return;
    }

    serveStatic(response, staticRoot, url.pathname);
  });
}

export function startDashboardServer({
  initialPort = port,
  host = "127.0.0.1",
  maxAttempts = 20,
  env = process.env,
  staticRoot = rootDir,
  log = console.log
} = {}) {
  const startPort = Number(initialPort) || port;

  return new Promise((resolveServer, rejectServer) => {
    function tryListen(candidatePort, attempt) {
      const server = createDashboardServer({ env, staticRoot });
      server.once("error", (error) => {
        if (error?.code === "EADDRINUSE" && attempt < maxAttempts) {
          server.close(() => tryListen(candidatePort + 1, attempt + 1));
          return;
        }
        rejectServer(error);
      });
      server.listen(candidatePort, host, () => {
        const fallbackNote = candidatePort === startPort ? "" : ` (${startPort} was busy)`;
        log(`Dashboard local API server running at http://${host}:${candidatePort}/${fallbackNote}`);
        resolveServer({ server, port: candidatePort, host });
      });
    }

    tryListen(startPort, 1);
  });
}

export function closeDashboardServer(server) {
  return new Promise((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error) rejectClose(error);
      else resolveClose();
    });
  });
}

async function createFidelityPlaidLinkToken(env, options = {}) {
  const status = credentialStatus(env, ["PLAID_CLIENT_ID", "PLAID_SECRET"]);
  if (!status.configured) {
    return json(501, {
      error: "connector_not_configured",
      connector: "fidelity",
      provider: "plaid",
      setupRequired: true,
      missingEnv: status.missing,
      message: "Plaid credentials are not configured on the local backend. Add PLAID_CLIENT_ID and PLAID_SECRET to .env; never enter Fidelity credentials into this dashboard."
    });
  }

  try {
    const payload = await plaidRequest(env, "/link/token/create", {
      client_name: "Market Pulse",
      language: "en",
      country_codes: ["US"],
      products: ["investments"],
      user: {
        client_user_id: String(env.PLAID_CLIENT_USER_ID || "market-pulse-local-user")
      }
    }, options);
    return ok({
      ok: true,
      connector: "fidelity",
      provider: "plaid",
      mode: "plaid-link",
      liveProviderCalls: true,
      linkToken: payload.link_token,
      expiration: payload.expiration || null,
      requestId: payload.request_id || null,
      environment: plaidEnvironment(env),
      message: "Plaid Link token created. Open Link to authorize Fidelity investment holdings."
    });
  } catch (error) {
    return plaidErrorResponse(error, "plaid_link_token_failed", "Unable to create a Plaid Link token.");
  }
}

async function exchangeFidelityPlaidPublicToken(publicToken, env, options = {}) {
  const status = credentialStatus(env, ["PLAID_CLIENT_ID", "PLAID_SECRET"]);
  if (!status.configured) {
    return json(501, {
      error: "connector_not_configured",
      connector: "fidelity",
      provider: "plaid",
      setupRequired: true,
      missingEnv: status.missing,
      message: "Plaid credentials are not configured on the local backend."
    });
  }
  if (!isUsableCredentialValue(publicToken)) {
    return json(400, {
      error: "missing_public_token",
      connector: "fidelity",
      provider: "plaid",
      message: "Plaid Link did not return a usable public token."
    });
  }

  try {
    const payload = await plaidRequest(env, "/item/public_token/exchange", {
      public_token: publicToken
    }, options);
    const now = options.now || new Date().toISOString();
    const session = {
      provider: "plaid",
      accessToken: payload.access_token,
      itemId: payload.item_id || null,
      linkedAt: now,
      lastSync: null,
      environment: plaidEnvironment(env)
    };
    writeFidelityPlaidSession(session, options);
    return ok({
      ok: true,
      connector: "fidelity",
      provider: "plaid",
      connected: true,
      itemId: payload.item_id || null,
      linkedAt: now,
      requestId: payload.request_id || null,
      environment: plaidEnvironment(env),
      message: "Fidelity linked through Plaid. The Plaid access token is stored only by the local backend, never in browser JavaScript."
    });
  } catch (error) {
    return plaidErrorResponse(error, "plaid_public_token_exchange_failed", "Unable to finish Plaid Link token exchange.");
  }
}

async function getFidelityPlaidHoldings(env, options = {}) {
  const status = credentialStatus(env, ["PLAID_CLIENT_ID", "PLAID_SECRET"]);
  if (!status.configured) {
    return json(501, {
      error: "connector_not_configured",
      connector: "fidelity",
      provider: "plaid",
      setupRequired: true,
      missingEnv: status.missing,
      message: "Plaid credentials are not configured on the local backend."
    });
  }
  const session = readFidelityPlaidSession(options);
  if (!session?.accessToken) {
    return json(409, {
      error: "plaid_item_not_linked",
      connector: "fidelity",
      provider: "plaid",
      setupRequired: true,
      message: "Plaid is configured, but Fidelity has not been linked in this local session yet."
    });
  }

  try {
    const fetchedAt = options.now || new Date().toISOString();
    const payload = await plaidRequest(env, "/investments/holdings/get", {
      access_token: session.accessToken
    }, options);
    writeFidelityPlaidSession({ ...session, lastSync: fetchedAt }, options);
    return ok({
      ok: true,
      connector: "fidelity",
      provider: "plaid",
      mode: "live",
      liveProviderCalls: true,
      fetchedAt,
      linkedAt: session.linkedAt || null,
      itemId: payload.item?.item_id || session.itemId || null,
      accounts: Array.isArray(payload.accounts) ? payload.accounts : [],
      holdings: Array.isArray(payload.holdings) ? payload.holdings : [],
      securities: Array.isArray(payload.securities) ? payload.securities : [],
      item: payload.item || {},
      warnings: payload.warnings || [],
      message: "Plaid investment holdings fetched through the local backend."
    });
  } catch (error) {
    return plaidErrorResponse(error, "plaid_holdings_sync_failed", "Unable to sync Plaid investment holdings.");
  }
}

async function unlinkFidelityPlaid(env, options = {}) {
  const session = readFidelityPlaidSession(options);
  let providerMessage = "No active Plaid item was linked locally.";
  if (session?.accessToken && credentialStatus(env, ["PLAID_CLIENT_ID", "PLAID_SECRET"]).configured) {
    try {
      await plaidRequest(env, "/item/remove", { access_token: session.accessToken }, options);
      providerMessage = "Plaid item removed and local token cleared.";
    } catch (error) {
      providerMessage = `${safePlaidErrorMessage(error)} Local token was cleared anyway.`;
    }
  }
  clearFidelityPlaidSession(options);
  return ok({
    ok: true,
    connector: "fidelity",
    provider: "plaid",
    connected: false,
    message: providerMessage
  });
}

async function plaidRequest(env, path, payload = {}, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const apiBaseUrl = plaidBaseUrl(env);
  const response = await fetchImpl(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.PLAID_CLIENT_ID,
      secret: env.PLAID_SECRET,
      ...payload
    })
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    const error = new Error(plaidErrorMessage(data, response.status, env));
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return data;
}

function plaidErrorResponse(error, code, fallback) {
  const status = Number(error?.status) || (/rate|limit/i.test(error?.message || "") ? 429 : 502);
  const normalizedStatus = status === 429 ? 429 : status >= 400 && status < 500 ? 400 : 502;
  return json(normalizedStatus, {
    error: code,
    connector: "fidelity",
    provider: "plaid",
    status: normalizedStatus === 429 ? "rate_limited" : "error",
    message: safePlaidErrorMessage(error, fallback)
  });
}

function plaidErrorMessage(data = {}, status, env = {}) {
  const parts = [
    data.error_code,
    data.error_type,
    data.error_message || data.display_message || data.suggested_action,
    data.request_id ? `request ${data.request_id}` : ""
  ].filter(Boolean);
  const message = parts.length ? parts.join(": ") : `Plaid request failed (${status || "unknown"})`;
  return redactSecretLikeText(message, [env.PLAID_SECRET, env.PLAID_CLIENT_ID]);
}

function safePlaidErrorMessage(error, fallback = "Plaid request failed safely.") {
  return redactSecretLikeText(error?.message || String(error || fallback));
}

function plaidBaseUrl(env = {}) {
  return plaidEnvironmentHosts[plaidEnvironment(env)] || plaidEnvironmentHosts.sandbox;
}

function plaidEnvironment(env = {}) {
  const value = String(env.PLAID_ENV || "sandbox").toLowerCase();
  return plaidEnvironmentHosts[value] ? value : "sandbox";
}

function readFidelityPlaidSession(options = {}) {
  if (options.fidelityPlaidSession !== undefined) return options.fidelityPlaidSession;
  if (options.fidelityPlaidStore?.read) return options.fidelityPlaidStore.read();
  try {
    if (!existsSync(fidelityPlaidSessionPath)) return null;
    const parsed = JSON.parse(readFileSync(fidelityPlaidSessionPath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeFidelityPlaidSession(session, options = {}) {
  const safeSession = {
    provider: "plaid",
    accessToken: session.accessToken,
    itemId: session.itemId || null,
    linkedAt: session.linkedAt || null,
    lastSync: session.lastSync || null,
    environment: session.environment || "sandbox"
  };
  if (options.fidelityPlaidStore?.write) {
    options.fidelityPlaidStore.write(safeSession);
    return;
  }
  mkdirSync(dirname(fidelityPlaidSessionPath), { recursive: true, mode: 0o700 });
  writeFileSync(fidelityPlaidSessionPath, JSON.stringify(safeSession, null, 2), { mode: 0o600 });
}

function clearFidelityPlaidSession(options = {}) {
  if (options.fidelityPlaidStore?.clear) {
    options.fidelityPlaidStore.clear();
    return;
  }
  try {
    if (existsSync(fidelityPlaidSessionPath)) rmSync(fidelityPlaidSessionPath, { force: true });
  } catch {
    // Local unlink should be best-effort; the API response remains safe.
  }
}

function redactSecretLikeText(value = "", extraSecrets = []) {
  let text = String(value || "");
  for (const secret of extraSecrets) {
    if (secret && String(secret).length >= 4) text = text.replaceAll(String(secret), "[redacted]");
  }
  return text
    .replace(/(access_token|public_token|refresh_token|token|client_secret|secret|password|cookie|authorization)=([^&\s"']+)/gi, "$1=[redacted]")
    .replace(/\b(access_token|public_token|refresh_token|client_secret|client_id|secret|password|cookie|authorization)\b\s*:?\s*["']?[A-Za-z0-9._~-]{6,}["']?/gi, "$1 [redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]")
    .replace(/[A-Za-z0-9_-]{32,}/g, "[redacted]");
}

function connectorSetupResponse(connector, provider, env) {
  if (!["plaid", "snaptrade"].includes(provider)) {
    return json(400, { error: "unsupported_provider", message: `${provider} is not a supported ${connector} provider.` });
  }

  const status = buildConfigStatus(env).connectors[provider];
  if (!status.configured) {
    return json(501, {
      error: "connector_not_configured",
      connector,
      provider,
      setupRequired: true,
      missingEnv: status.missing,
      message: `${provider} credentials are not configured on the local backend. No brokerage credentials should be entered into the dashboard.`
    });
  }

  return json(501, {
    error: "connector_provider_not_implemented",
    connector,
    provider,
    setupRequired: true,
    message: `${provider} credentials are present, but live provider calls are intentionally not implemented until Tucker approves production integration details.`
  });
}

function notConfigured(connector, message) {
  return json(501, { error: "connector_not_configured", connector, setupRequired: true, message });
}

function credentialStatus(env, keys) {
  const missing = keys.filter((key) => !hasEnvValue(env, key));
  return {
    configured: missing.length === 0,
    required: keys,
    missing
  };
}

function hasEnvValue(env, key) {
  return isUsableCredentialValue(env[key]);
}

function isCrossSiteRequest(headers = {}) {
  const fetchSite = String(headers["sec-fetch-site"] || "").toLowerCase();
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) return true;
  const origin = String(headers.origin || "");
  if (origin && !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(origin)) return true;
  const referer = String(headers.referer || "");
  if (referer && !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\//i.test(referer)) return true;
  return false;
}

async function marketDataSnapshotWithFallback({ primarySnapshot, env, providerOptions, tickers, requestTime } = {}) {
  const attempts = [marketDataProviderAttempt(primarySnapshot)];
  if (!shouldTryMarketDataFallback(primarySnapshot)) {
    return attachMarketDataAttempts(primarySnapshot, attempts);
  }

  const fallbackIds = marketDataFallbackProviderIds(env);
  for (const providerId of fallbackIds) {
    const fallbackProvider = createMarketDataProviderById(providerId, env, providerOptions);
    if (!fallbackProvider.configured || fallbackProvider.liveProviderCalls === false) {
      attempts.push({
        providerId: fallbackProvider.id || providerId,
        providerLabel: fallbackProvider.label || providerId,
        role: "fallback",
        status: "not configured",
        timestamp: requestTime,
        quoteCount: 0,
        requestedTickerCount: tickers.length,
        missingTickerCount: tickers.length,
        cacheStatus: "not configured",
        dataFreshness: "not configured",
        detail: "Fallback provider key is not configured on the local backend."
      });
      continue;
    }

    const fallbackSnapshot = await fetchMarketDataSnapshot({
      provider: fallbackProvider,
      tickers,
      asOf: requestTime,
      now: requestTime
    });
    attempts.push(marketDataProviderAttemptFromSnapshot(fallbackSnapshot, { role: "fallback", attemptedAt: requestTime }));

    if (hasUsableMarketDataQuotes(fallbackSnapshot)) {
      const warning = `${primarySnapshot.providerLabel || "Primary provider"} returned ${primarySnapshot.status?.status || "no usable quotes"}; using ${fallbackSnapshot.providerLabel || "fallback provider"} fallback quotes.`;
      return attachMarketDataAttempts({
        ...fallbackSnapshot,
        primaryProviderId: primarySnapshot.providerId,
        primaryProviderLabel: primarySnapshot.providerLabel,
        fallbackProviderId: fallbackSnapshot.providerId,
        fallbackProviderLabel: fallbackSnapshot.providerLabel,
        fallbackReason: primarySnapshot.status?.status || primarySnapshot.error || "primary-provider-unavailable",
        warnings: [
          warning,
          ...(primarySnapshot.warnings || []),
          ...(fallbackSnapshot.warnings || [])
        ]
      }, attempts);
    }
  }

  return attachMarketDataAttempts(primarySnapshot, attempts);
}

function shouldTryMarketDataFallback(snapshot = {}) {
  if (hasUsableMarketDataQuotes(snapshot)) return false;
  const status = String(snapshot.status?.status || "").toLowerCase();
  return ["error", "rate limited"].includes(status);
}

function hasUsableMarketDataQuotes(snapshot = {}) {
  return Array.isArray(snapshot.quotes) && snapshot.quotes.length > 0 &&
    !["error", "rate limited", "not configured"].includes(String(snapshot.status?.status || "").toLowerCase());
}

function marketDataProviderAttempt(snapshot = {}) {
  return marketDataProviderAttemptFromSnapshot(snapshot, {
    role: snapshot.fallbackProviderId && snapshot.providerId === snapshot.fallbackProviderId ? "fallback" : "primary"
  });
}

function attachMarketDataAttempts(snapshot = {}, attempts = []) {
  const providerAttempts = normalizeMarketDataProviderAttempts(attempts);
  if (!providerAttempts.length) return snapshot;
  return {
    ...snapshot,
    providerAttempts,
    status: {
      ...snapshot.status,
      providerAttempts,
      primaryProviderId: snapshot.primaryProviderId,
      primaryProviderLabel: snapshot.primaryProviderLabel,
      fallbackProviderId: snapshot.fallbackProviderId,
      fallbackProviderLabel: snapshot.fallbackProviderLabel,
      fallbackReason: snapshot.fallbackReason
    }
  };
}

function parseTickerList(value = "") {
  const tickers = String(value || "")
    .split(/[,\s]+/)
    .map((ticker) => ticker.trim().toUpperCase())
    .filter((ticker) => /^[A-Z0-9.-]{1,12}$/.test(ticker));
  const unique = [...new Set(tickers)];
  return unique.length ? unique : null;
}

function ok(payload) {
  return json(200, payload);
}

function json(status, payload) {
  return { status, payload };
}

function sendJson(response, result) {
  response.writeHead(result.status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(result.payload, null, 2));
}

async function readJsonBody(request) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > maxJsonBodyBytes) {
      const error = new Error("Request body too large.");
      error.code = "request_body_too_large";
      throw error;
    }
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function serveStatic(response, staticRoot, pathname) {
  const target = pathname === "/" ? "/index.html" : pathname;
  const decoded = safeDecodePath(target);
  const resolvedRoot = resolve(staticRoot);
  const resolved = decoded ? resolve(staticRoot, `.${decoded}`) : "";
  if (!decoded || !resolved.startsWith(resolvedRoot) || isDeniedStaticPath(resolvedRoot, resolved) || !existsSync(resolved) || !statSync(resolved).isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, { "Content-Type": mimeType(resolved) });
  createReadStream(resolved).pipe(response);
}

function safeDecodePath(pathname) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return "";
  }
}

function isDeniedStaticPath(root, resolved) {
  const relativePath = relative(root, resolved);
  if (!relativePath || relativePath.startsWith("..") || relativePath.includes(`..${sep}`)) return true;
  const segments = relativePath.split(/[\\/]+/);
  if (segments.includes("local-data")) return true;
  if (segments.some((segment) => segment.startsWith("."))) return true;
  const fileName = basename(resolved);
  return /(^\.|secret|token|credential|credentials|apikey|api-key|api_key|private|private-key|private_key|\bkey\b|\bkeys\b)|\.(pem|p12|key)$/i.test(fileName);
}

function mimeType(filePath) {
  const types = {
    ".css": "text/css; charset=utf-8",
    ".csv": "text/csv; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".svg": "image/svg+xml"
  };
  return types[extname(filePath)] || "application/octet-stream";
}

function clampNumber(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(max, Math.max(min, Math.trunc(numeric)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadLocalEnv();
  startDashboardServer().catch((error) => {
    console.error(`Dashboard local API server failed to start: ${error?.message || String(error)}`);
    process.exitCode = 1;
  });
}
