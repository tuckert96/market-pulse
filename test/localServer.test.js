import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apiResponse, buildConfigStatus, closeDashboardServer, createDashboardServer, loadLocalEnv, startDashboardServer } from "../scripts/local-server.js";
import { createMarketDataCache } from "../src/marketDataProvider.js";

test("local API config reports only credential presence", () => {
  const status = buildConfigStatus({
    PLAID_CLIENT_ID: "id",
    PLAID_SECRET: "secret",
    FINNHUB_API_KEY: "finnhub-secret",
    MARKET_DATA_PROVIDER: "financialModelingPrep",
    FINANCIAL_MODELING_PREP_API_KEY: "fmp-secret",
    REDDIT_CLIENT_ID: "reddit-client",
    REDDIT_CLIENT_SECRET: "reddit-secret",
    REDDIT_USER_AGENT: "market-pulse-test",
    REDDIT_REFRESH_TOKEN: "reddit-refresh",
    X_BEARER_TOKEN: "x-bearer-secret",
    OPENAI_API_KEY: "openai-secret",
    OPENAI_PORTFOLIO_EXPLANATIONS_ENABLED: "true"
  });

  assert.equal(status.exposesSecretValues, false);
  assert.equal(status.connectors.plaid.configured, true);
  assert.equal(status.connectors.snaptrade.configured, false);
  assert.equal(status.marketData.selectedProvider, "financialModelingPrep");
  assert.equal(status.marketData.financialModelingPrep, true);
  assert.equal(status.marketData.finnhub, true);
  assert.equal(status.marketDataProviders.finnhub.configured, true);
  assert.equal(status.marketDataConfig.status, "live-ready");
  assert.equal(status.marketDataConfig.liveProviderCalls, true);
  assert.equal(status.marketDataQuoteProviders.financialModelingPrep.configured, true);
  assert.equal(status.marketDataQuoteProviders.financialModelingPrep.liveEnabled, true);
  assert.equal(status.marketDataQuoteProviders.financialModelingPrep.liveProviderCalls, true);
  assert.equal(status.marketDataQuoteProviders.finnhub.configured, true);
  assert.equal(status.marketDataQuoteProviders.finnhub.liveProviderCalls, true);
  assert.equal(status.redditProviderConfig.status, "configured-not-connected");
  assert.equal(status.redditProviderConfig.liveProviderCalls, false);
  assert.equal(status.redditProviderConfig.oauthReady, true);
  assert.equal(status.redditProviderStatuses.redditApi.configured, true);
  assert.equal(status.redditProviderStatuses.redditApi.liveProviderCalls, false);
  assert.equal(status.xProviderConfig.status, "configured-not-connected");
  assert.equal(status.xProviderConfig.liveProviderCalls, false);
  assert.equal(status.xProviderStatuses.xApi.configured, true);
  assert.equal(status.aiProviders.openai.configured, true);
  assert.equal(status.aiProviders.openai.liveProviderCalls, true);
  assert.equal(status.politicianTradeProviderConfig.status, "mock/sample mode");
  assert.equal(status.politicianTradeProviderStatuses.senateStockWatcher.configured, false);
  assert.equal(JSON.stringify(status).includes("finnhub-secret"), false);
  assert.equal(JSON.stringify(status).includes("fmp-secret"), false);
  assert.equal(JSON.stringify(status).includes("reddit-secret"), false);
  assert.equal(JSON.stringify(status).includes("reddit-refresh"), false);
  assert.equal(JSON.stringify(status).includes("x-bearer-secret"), false);
  assert.equal(JSON.stringify(status).includes("openai-secret"), false);
});

test("local API config keeps missing market data credentials safely not connected", () => {
  const status = buildConfigStatus({});

  assert.equal(status.marketData.selectedProvider, "finnhub");
  assert.equal(status.marketData.financialModelingPrep, false);
  assert.equal(status.marketData.twelveData, false);
  assert.equal(status.marketDataConfig.status, "not configured");
  assert.equal(status.marketDataConfig.liveProviderCalls, false);
  assert.deepEqual(status.marketDataConfig.missingEnv, ["FINNHUB_API_KEY"]);
  assert.equal(status.marketDataQuoteProviders.finnhub.configured, false);
  assert.deepEqual(status.marketDataQuoteProviders.finnhub.missingEnv, ["FINNHUB_API_KEY"]);
  assert.equal(status.marketDataQuoteProviders.financialModelingPrep.configured, false);
  assert.deepEqual(status.marketDataQuoteProviders.financialModelingPrep.missingEnv, ["FINANCIAL_MODELING_PREP_API_KEY"]);
  assert.equal(status.redditProviderConfig.status, "not configured");
  assert.equal(status.redditProviderConfig.liveProviderCalls, false);
  assert.deepEqual(status.redditProviderConfig.missingEnv, ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET", "REDDIT_USER_AGENT"]);
  assert.equal(status.xProviderConfig.status, "not configured");
  assert.equal(status.xProviderConfig.liveProviderCalls, false);
  assert.deepEqual(status.xProviderConfig.missingEnv, ["X_BEARER_TOKEN"]);
  assert.equal(status.aiProviders.openai.status, "not configured");
  assert.equal(status.aiProviders.openai.liveProviderCalls, false);
  assert.equal(status.politicianTradeProviderConfig.liveProviderCalls, false);
  assert.equal(status.politicianTradeProviderStatuses.senateStockWatcher.liveProviderCalls, false);
});

test("local API config treats whitespace credentials as missing", () => {
  const status = buildConfigStatus({
    PLAID_CLIENT_ID: "   ",
    PLAID_SECRET: "\t",
    FINNHUB_API_KEY: " ",
    FINANCIAL_MODELING_PREP_API_KEY: " ",
    REDDIT_CLIENT_ID: " ",
    REDDIT_CLIENT_SECRET: " ",
    REDDIT_USER_AGENT: " ",
    X_BEARER_TOKEN: " ",
    OPENAI_API_KEY: " ",
    POLITICIAN_TRADES_PROVIDER: "senate-stock-watcher",
    POLITICIAN_TRADES_LIVE_ENABLED: "true",
    POLITICIAN_TRADES_SOURCE_URL: " "
  });

  assert.equal(status.connectors.plaid.configured, false);
  assert.equal(status.marketData.finnhub, false);
  assert.equal(status.marketData.financialModelingPrep, false);
  assert.equal(status.marketDataConfig.status, "not configured");
  assert.equal(status.redditProviderConfig.status, "not configured");
  assert.equal(status.xProviderConfig.status, "not configured");
  assert.equal(status.aiProviders.openai.status, "not configured");
  assert.equal(status.politicianTradeProviderConfig.configured, true);
  assert.equal(status.politicianTradeProviderConfig.usesDefaultSourceUrl, true);
  assert.deepEqual(status.politicianTradeProviderConfig.missingEnv, []);
  assert.match(status.politicianTradeProviderConfig.sourceCoverage, /Senate PTR rows only/);
});

test("local API config treats placeholder credentials as missing", () => {
  const status = buildConfigStatus({
    FINNHUB_API_KEY: "your_finnhub_api_key_here",
    FINANCIAL_MODELING_PREP_API_KEY: "placeholder",
    REDDIT_CLIENT_ID: "your_reddit_client_id_here",
    REDDIT_CLIENT_SECRET: "client_secret_here",
    REDDIT_USER_AGENT: "change_me",
    X_BEARER_TOKEN: "your_x_bearer_token_here",
    OPENAI_API_KEY: "your_openai_api_key_here"
  });

  assert.equal(status.marketData.finnhub, false);
  assert.equal(status.marketData.financialModelingPrep, false);
  assert.equal(status.marketDataConfig.status, "not configured");
  assert.equal(status.redditProviderConfig.status, "not configured");
  assert.equal(status.xProviderConfig.status, "not configured");
  assert.equal(status.aiProviders.openai.status, "not configured");
});

test("portfolio explanation endpoint returns deterministic fallback when OpenAI is missing", async () => {
  let fetchCalls = 0;
  const result = await apiResponse(
    "POST",
    "/api/portfolio/explanation",
    new URLSearchParams(),
    {
      overview: { totalValue: 100000 },
      holdings: [{ ticker: "MU", accountNumber: "123456789", account: "Brokerage 123456789", marketValue: 20000, portfolioWeight: 0.2 }],
      marketDataStatus: { status: "not configured" },
      alerts: [{ title: "MU needs review", detail: "Position size" }]
    },
    {},
    {
      fetchImpl() {
        fetchCalls += 1;
        throw new Error("OpenAI should not be called without config");
      }
    }
  );

  assert.equal(result.status, 200);
  assert.equal(fetchCalls, 0);
  assert.equal(result.payload.fallbackUsed, true);
  assert.equal(result.payload.openai.status, "not configured");
  assert.match(result.payload.explanation.summary, /local explanation/i);
  assert.equal(result.payload.reviewMode.mode, "side-by-side-review");
  assert.equal(result.payload.reviewMode.deterministic.label, "Deterministic source facts");
  assert.equal(result.payload.reviewMode.generated.label, "Optional generated summary");
  assert.equal(result.payload.reviewMode.generated.status, "not configured");
  assert.match(result.payload.reviewMode.generated.unavailableReason, /not configured/i);
  const text = JSON.stringify(result.payload);
  assert.equal(text.includes("123456789"), false);
});

test("portfolio explanation endpoint does not call OpenAI when disabled", async () => {
  let fetchCalls = 0;
  const result = await apiResponse(
    "POST",
    "/api/portfolio/explanation",
    new URLSearchParams(),
    { holdings: [{ ticker: "NVDA", marketValue: 5000, portfolioWeight: 0.05 }] },
    { OPENAI_API_KEY: "openai-secret", OPENAI_PORTFOLIO_EXPLANATIONS_ENABLED: "false" },
    {
      fetchImpl() {
        fetchCalls += 1;
        throw new Error("disabled OpenAI should not fetch");
      }
    }
  );

  assert.equal(result.status, 200);
  assert.equal(fetchCalls, 0);
  assert.equal(result.payload.openai.status, "configured-not-connected");
  assert.equal(result.payload.fallbackUsed, true);
  assert.equal(result.payload.reviewMode.generated.status, "disabled");
  assert.match(result.payload.reviewMode.generated.unavailableReason, /disabled/i);
  assert.equal(JSON.stringify(result.payload).includes("openai-secret"), false);
});

test("portfolio explanation endpoint returns mocked OpenAI response without exposing secrets", async () => {
  const calls = [];
  const result = await apiResponse(
    "POST",
    "/api/portfolio/explanation",
    new URLSearchParams(),
    {
      overview: { totalValue: 100000 },
      holdings: [{ ticker: "MU", accountId: "acct-secret-id-123456789", account: "Brokerage 123456789", marketValue: 20000, portfolioWeight: 0.2 }],
      sourceStatuses: { portfolio: "Imported", marketData: "Live" },
      marketDataStatus: { status: "connected", label: "Live market data" }
    },
    {
      OPENAI_API_KEY: "openai-secret-value",
      OPENAI_PORTFOLIO_EXPLANATIONS_ENABLED: "true",
      OPENAI_PORTFOLIO_MODEL: "gpt-test"
    },
    {
      fetchImpl: async (url, options = {}) => {
        calls.push({ url: String(url), options });
        assert.equal(String(url), "https://api.openai.com/v1/responses");
        assert.equal(options.headers.Authorization, "Bearer openai-secret-value");
        const body = JSON.parse(options.body);
        assert.equal(body.model, "gpt-test");
        assert.equal(body.store, false);
        assert.equal(JSON.stringify(body).includes("acct-secret-id"), false);
        assert.equal(JSON.stringify(body).includes("123456789"), false);
        return mockResponse({ output_text: "Portfolio is concentrated in MU. Review concentration and source freshness before changing position size. api_key=do-not-return-this-fake-key" });
      }
    }
  );

  assert.equal(result.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(result.payload.fallbackUsed, false);
  assert.equal(result.payload.provider, "openai");
  assert.equal(result.payload.model, "gpt-test");
  assert.match(result.payload.explanation.narrative, /Portfolio is concentrated/);
  assert.equal(result.payload.reviewMode.generated.status, "generated");
  assert.match(result.payload.reviewMode.generated.narrative, /Portfolio is concentrated/);
  assert.ok(result.payload.reviewMode.deterministic.bullets.length > 0);
  assert.ok(result.payload.reviewMode.sourceLabels.some((label) => /Market data: Live/.test(label)));
  const text = JSON.stringify(result.payload);
  assert.equal(text.includes("openai-secret-value"), false);
  assert.equal(text.includes("do-not-return-this-fake-key"), false);
  assert.equal(text.includes("acct-secret-id"), false);
  assert.equal(text.includes("123456789"), false);
});

test("portfolio explanation endpoint falls back and redacts provider errors", async () => {
  const result = await apiResponse(
    "POST",
    "/api/portfolio/explanation",
    new URLSearchParams(),
    { holdings: [{ ticker: "MU", marketValue: 20000, portfolioWeight: 0.2 }] },
    {
      OPENAI_API_KEY: "openai-secret-value",
      OPENAI_PORTFOLIO_EXPLANATIONS_ENABLED: "true"
    },
    {
      fetchImpl: async () => mockResponse({ error: { message: "rate limited Bearer openai-secret-value token=another-secret" } }, 429)
    }
  );

  assert.equal(result.status, 200);
  assert.equal(result.payload.fallbackUsed, true);
  assert.equal(result.payload.status, "error");
  assert.equal(JSON.stringify(result.payload).includes("openai-secret-value"), false);
  assert.equal(JSON.stringify(result.payload).includes("another-secret"), false);
  assert.match(result.payload.lastError, /\[redacted\]/);
  assert.equal(result.payload.reviewMode.generated.status, "error");
  assert.match(result.payload.reviewMode.generated.unavailableReason, /failed safely/i);
  assert.ok(result.payload.reviewMode.missingContext.some((item) => /provider returned an error/i.test(item)));
});

test("local API blocks cross-site requests before provider work", async () => {
  const result = await apiResponse(
    "GET",
    "/api/market-data/quotes",
    new URLSearchParams({ tickers: "MU" }),
    {},
    { FINNHUB_API_KEY: "finnhub-secret" },
    {
      headers: {
        origin: "https://evil.example",
        "sec-fetch-site": "cross-site"
      },
      fetchImpl() {
        throw new Error("provider fetch should not run for cross-site requests");
      }
    }
  );

  assert.equal(result.status, 403);
  assert.equal(result.payload.error, "cross_site_request_blocked");
});

test("local env loader replaces whitespace shell credentials with .env values without exposing them", () => {
  const tmp = mkdtempSync(join(tmpdir(), "market-pulse-env-"));
  const envPath = join(tmp, ".env");
  const env = { FINNHUB_API_KEY: "   ", MARKET_DATA_PROVIDER: "" };
  writeFileSync(envPath, "MARKET_DATA_PROVIDER=finnhub\nFINNHUB_API_KEY=local-secret-value\n");

  try {
    loadLocalEnv(envPath, env);
    const status = buildConfigStatus(env);

    assert.equal(env.FINNHUB_API_KEY, "local-secret-value");
    assert.equal(status.marketDataConfig.status, "live-ready");
    assert.equal(status.marketDataConfig.liveProviderCalls, true);
    assert.equal(JSON.stringify(status).includes("local-secret-value"), false);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("fidelity link endpoint returns setup-needed without provider credentials", async () => {
  const result = await apiResponse("POST", "/api/connectors/fidelity/link", new URLSearchParams(), { provider: "plaid" }, {});

  assert.equal(result.status, 501);
  assert.equal(result.payload.error, "connector_not_configured");
  assert.equal(result.payload.setupRequired, true);
  assert.deepEqual(result.payload.missingEnv, ["PLAID_CLIENT_ID", "PLAID_SECRET"]);
});

test("Plaid fidelity endpoints reject cross-site requests before provider or token-store work", async () => {
  const store = memoryPlaidStore();
  const result = await apiResponse(
    "POST",
    "/api/connectors/fidelity/exchange",
    new URLSearchParams(),
    { provider: "plaid", public_token: "public-sandbox-token" },
    { PLAID_CLIENT_ID: "plaid-client", PLAID_SECRET: "plaid-secret" },
    {
      fidelityPlaidStore: store,
      headers: {
        origin: "https://evil.example",
        "sec-fetch-site": "cross-site"
      },
      fetchImpl() {
        throw new Error("Plaid fetch should not run for cross-site requests");
      }
    }
  );

  assert.equal(result.status, 403);
  assert.equal(result.payload.error, "cross_site_request_blocked");
  assert.equal(store.read(), null);
});

test("unsupported fidelity provider is rejected", async () => {
  const result = await apiResponse("POST", "/api/connectors/fidelity/link", new URLSearchParams(), { provider: "unknown" }, {});

  assert.equal(result.status, 400);
  assert.equal(result.payload.error, "unsupported_provider");
});

test("Plaid Fidelity link token is created server-side without exposing credentials", async () => {
  const calls = [];
  const result = await apiResponse(
    "POST",
    "/api/connectors/fidelity/link",
    new URLSearchParams(),
    { provider: "plaid" },
    { PLAID_CLIENT_ID: "plaid-client", PLAID_SECRET: "plaid-secret", PLAID_ENV: "sandbox" },
    {
      fetchImpl: countedFetch(calls, async (url) => {
        assert.equal(String(url), "https://sandbox.plaid.com/link/token/create");
        return mockResponse({ link_token: "link-token-test", expiration: "2026-05-25T20:00:00Z", request_id: "req-link" });
      })
    }
  );

  assert.equal(result.status, 200);
  assert.equal(result.payload.linkToken, "link-token-test");
  assert.equal(result.payload.liveProviderCalls, true);
  assert.equal(JSON.stringify(result.payload).includes("plaid-secret"), false);
  assert.equal(calls.length, 1);
});

test("Plaid environment is allowlisted and falls back to sandbox", async () => {
  const result = await apiResponse(
    "POST",
    "/api/connectors/fidelity/link",
    new URLSearchParams(),
    { provider: "plaid" },
    { PLAID_CLIENT_ID: "plaid-client", PLAID_SECRET: "plaid-secret", PLAID_ENV: "https://evil.example" },
    {
      fetchImpl: async (url) => {
        assert.equal(String(url), "https://sandbox.plaid.com/link/token/create");
        return mockResponse({ link_token: "link-token-test" });
      }
    }
  );

  assert.equal(result.status, 200);
  assert.equal(result.payload.environment, "sandbox");
});

test("Plaid provider errors are redacted before returning to browser code", async () => {
  const result = await apiResponse(
    "POST",
    "/api/connectors/fidelity/link",
    new URLSearchParams(),
    { provider: "plaid" },
    { PLAID_CLIENT_ID: "plaid-client", PLAID_SECRET: "plaid-secret", PLAID_ENV: "sandbox" },
    {
      fetchImpl: async () => mockResponse({
        error_code: "INVALID_CREDENTIALS",
        error_type: "INVALID_INPUT",
        error_message: "PLAID_SECRET=plaid-secret public_token: public-sandbox-token access_token: access-secret-token Bearer bearer-secret-token",
        request_id: "req-secret"
      }, 400)
    }
  );

  const text = JSON.stringify(result.payload);
  assert.equal(result.status, 400);
  assert.equal(text.includes("plaid-secret"), false);
  assert.equal(text.includes("public-sandbox-token"), false);
  assert.equal(text.includes("access-secret-token"), false);
  assert.equal(text.includes("bearer-secret-token"), false);
  assert.match(result.payload.message, /\[redacted\]/);
});

test("Plaid public token exchange stores access token only in local server store", async () => {
  const store = memoryPlaidStore();
  const result = await apiResponse(
    "POST",
    "/api/connectors/fidelity/exchange",
    new URLSearchParams(),
    { provider: "plaid", public_token: "public-sandbox-token" },
    { PLAID_CLIENT_ID: "plaid-client", PLAID_SECRET: "plaid-secret", PLAID_ENV: "sandbox" },
    {
      fidelityPlaidStore: store,
      now: "2026-05-25T12:00:00Z",
      fetchImpl: async (url, options = {}) => {
        assert.equal(String(url), "https://sandbox.plaid.com/item/public_token/exchange");
        assert.equal(JSON.parse(options.body).public_token, "public-sandbox-token");
        return mockResponse({ access_token: "access-secret-token", item_id: "item-123", request_id: "req-exchange" });
      }
    }
  );

  assert.equal(result.status, 200);
  assert.equal(result.payload.connected, true);
  assert.equal(store.read().accessToken, "access-secret-token");
  assert.equal(JSON.stringify(result.payload).includes("access-secret-token"), false);
});

test("Plaid Fidelity holdings require a linked item and then return provider payload", async () => {
  const missing = await apiResponse(
    "GET",
    "/api/connectors/fidelity/holdings",
    new URLSearchParams({ provider: "plaid" }),
    {},
    { PLAID_CLIENT_ID: "plaid-client", PLAID_SECRET: "plaid-secret" },
    { fidelityPlaidStore: memoryPlaidStore() }
  );
  assert.equal(missing.status, 409);
  assert.equal(missing.payload.error, "plaid_item_not_linked");

  const store = memoryPlaidStore({ accessToken: "access-secret-token", itemId: "item-123", linkedAt: "2026-05-25T11:00:00Z" });
  const synced = await apiResponse(
    "GET",
    "/api/connectors/fidelity/holdings",
    new URLSearchParams({ provider: "plaid" }),
    {},
    { PLAID_CLIENT_ID: "plaid-client", PLAID_SECRET: "plaid-secret", PLAID_ENV: "development" },
    {
      fidelityPlaidStore: store,
      now: "2026-05-25T12:00:00Z",
      fetchImpl: async (url, options = {}) => {
        assert.equal(String(url), "https://development.plaid.com/investments/holdings/get");
        assert.equal(JSON.parse(options.body).access_token, "access-secret-token");
        return mockResponse({
          item: { item_id: "item-123" },
          accounts: [{ account_id: "acc-1", name: "Fidelity Brokerage", subtype: "individual" }],
          securities: [{ security_id: "sec-mu", ticker_symbol: "MU", name: "Micron Technology", type: "equity" }],
          holdings: [{ account_id: "acc-1", security_id: "sec-mu", quantity: 10, institution_price: 100, institution_value: 1000 }]
        });
      }
    }
  );

  assert.equal(synced.status, 200);
  assert.equal(synced.payload.holdings.length, 1);
  assert.equal(synced.payload.accounts.length, 1);
  assert.equal(synced.payload.liveProviderCalls, true);
  assert.equal(store.read().lastSync, "2026-05-25T12:00:00Z");
  assert.equal(JSON.stringify(synced.payload).includes("access-secret-token"), false);
});

test("Plaid Fidelity unlink clears local token store", async () => {
  const store = memoryPlaidStore({ accessToken: "access-secret-token", itemId: "item-123" });
  const result = await apiResponse(
    "POST",
    "/api/connectors/fidelity/unlink",
    new URLSearchParams(),
    { provider: "plaid" },
    { PLAID_CLIENT_ID: "plaid-client", PLAID_SECRET: "plaid-secret" },
    {
      fidelityPlaidStore: store,
      fetchImpl: async (url, options = {}) => {
        assert.equal(String(url), "https://sandbox.plaid.com/item/remove");
        assert.equal(JSON.parse(options.body).access_token, "access-secret-token");
        return mockResponse({ removed: true });
      }
    }
  );

  assert.equal(result.status, 200);
  assert.equal(result.payload.connected, false);
  assert.equal(store.read(), null);
});

test("Plaid Fidelity unlink clears local token store even when provider removal fails", async () => {
  const store = memoryPlaidStore({ accessToken: "access-secret-token", itemId: "item-123" });
  const result = await apiResponse(
    "POST",
    "/api/connectors/fidelity/unlink",
    new URLSearchParams(),
    { provider: "plaid" },
    { PLAID_CLIENT_ID: "plaid-client", PLAID_SECRET: "plaid-secret" },
    {
      fidelityPlaidStore: store,
      fetchImpl: async () => mockResponse({
        error_code: "ITEM_REMOVE_FAILED",
        error_message: "Could not remove access_token: access-secret-token"
      }, 500)
    }
  );

  assert.equal(result.status, 200);
  assert.equal(result.payload.connected, false);
  assert.equal(store.read(), null);
  assert.equal(JSON.stringify(result.payload).includes("access-secret-token"), false);
});

test("market events endpoint falls back to demo mode", async () => {
  const result = await apiResponse("GET", "/api/market/events", new URLSearchParams(), {}, {});

  assert.equal(result.status, 200);
  assert.equal(result.payload.mode, "demo");
  assert.equal(result.payload.liveProviderCalls, false);
  assert.ok(result.payload.events.length >= 5);
  assert.ok(result.payload.providerStatuses.newsApi.warning.includes("NEWSAPI_KEY"));
});

test("market events endpoint rejects unsupported providers", async () => {
  const params = new URLSearchParams({ provider: "unknown" });
  const result = await apiResponse("GET", "/api/market/events", params, {}, {});

  assert.equal(result.status, 400);
  assert.equal(result.payload.error, "unsupported_market_provider");
});

test("market events endpoint keeps configured X provider local-only", async () => {
  let fetchCalls = 0;
  const result = await apiResponse(
    "GET",
    "/api/market/events",
    new URLSearchParams({ provider: "xApi" }),
    {},
    { X_BEARER_TOKEN: "x-secret-value-that-should-not-leak" },
    {
      fetchImpl() {
        fetchCalls += 1;
        throw new Error("X provider should not fetch until live adapter exists");
      }
    }
  );

  assert.equal(result.status, 200);
  assert.equal(fetchCalls, 0);
  assert.equal(result.payload.mode, "demo");
  assert.equal(result.payload.liveProviderCalls, false);
  assert.equal(result.payload.providerStatuses.xApi.configured, true);
  assert.equal(result.payload.providerStatuses.xApi.liveEnabled, false);
  assert.match(result.payload.warnings.join(" "), /live calls are disabled/i);
  assert.equal(JSON.stringify(result.payload).includes("x-secret-value-that-should-not-leak"), false);
});

test("market data quotes endpoint safely falls back to mock data without credentials", async () => {
  let fetchCalls = 0;
  const result = await apiResponse(
    "GET",
    "/api/market-data/quotes",
    new URLSearchParams({ tickers: "MU,NVDA" }),
    {},
    {},
    {
      fetchImpl() {
        fetchCalls += 1;
        throw new Error("should not be called");
      }
    }
  );

  assert.equal(result.status, 200);
  assert.equal(fetchCalls, 0);
  assert.equal(result.payload.mode, "mock");
  assert.equal(result.payload.fallbackReason, "missing-market-data-credentials");
  assert.equal(result.payload.status.status, "mock/sample mode");
  assert.deepEqual(result.payload.quotes.map((quote) => quote.ticker), ["MU", "NVDA"]);
});

test("configured but disabled market data provider reports configured-not-connected with mock fallback", async () => {
  let fetchCalls = 0;
  const result = await apiResponse(
    "GET",
    "/api/market-data/quotes",
    new URLSearchParams({ tickers: "MU" }),
    {},
    {
      MARKET_DATA_PROVIDER: "alphaVantage",
      ALPHA_VANTAGE_API_KEY: "alpha-secret"
    },
    {
      fetchImpl() {
        fetchCalls += 1;
        throw new Error("disabled provider should not fetch");
      }
    }
  );

  assert.equal(result.status, 200);
  assert.equal(fetchCalls, 0);
  assert.equal(result.payload.fallbackReason, "selected-provider-configured-not-connected");
  assert.equal(result.payload.status.status, "configured-not-connected");
  assert.match(result.payload.status.detail, /Sample quote data is displayed as fallback/);
  assert.equal(result.payload.quotesByTicker.MU.isMock, true);
  assert.equal(JSON.stringify(result.payload).includes("alpha-secret"), false);
});

test("market data quotes endpoint returns live normalized FMP data with mocked fetch", async () => {
  const result = await apiResponse(
    "GET",
    "/api/market-data/quotes",
    new URLSearchParams({ tickers: "MU", history: "1" }),
    {},
    {
      MARKET_DATA_PROVIDER: "financialModelingPrep",
      FINANCIAL_MODELING_PREP_API_KEY: "fmp-secret-value"
    },
    {
      fetchImpl: fmpFetchMock({
        quote: [{
          symbol: "MU",
          name: "Micron Technology, Inc.",
          price: 132.1,
          previousClose: 130,
          change: 2.1,
          changesPercentage: 1.6154,
          marketCap: 147000000000,
          volume: 24600000,
          yearHigh: 157.54,
          yearLow: 84.12
        }],
        profile: [{ symbol: "MU", companyName: "Micron Technology, Inc.", sector: "Technology", industry: "Semiconductors" }],
        history: { historical: [{ date: "2026-05-22", close: 132.1 }] }
      })
    }
  );

  assert.equal(result.status, 200);
  assert.equal(result.payload.status.status, "connected");
  assert.equal(result.payload.liveProviderCalls, true);
  assert.equal(result.payload.quotesByTicker.MU.price, 132.1);
  assert.equal(result.payload.quotesByTicker.MU.sector, "Technology");
  assert.equal(JSON.stringify(result.payload).includes("fmp-secret-value"), false);
});

test("market data quotes endpoint returns live normalized Finnhub data with mocked fetch", async () => {
  const result = await apiResponse(
    "GET",
    "/api/market-data/quotes",
    new URLSearchParams({ tickers: "MU", history: "1" }),
    {},
    {
      MARKET_DATA_PROVIDER: "finnhub",
      FINNHUB_API_KEY: "finnhub-secret-value"
    },
    {
      cache: createMarketDataCache(),
      now: "2026-05-23T12:30:00-04:00",
      fetchImpl: finnhubFetchMock({
        quote: { c: 132.1, d: 2.1, dp: 1.6154, h: 133, l: 129, o: 130, pc: 130, t: 1779552000 },
        profile: { ticker: "MU", name: "Micron Technology, Inc.", marketCapitalization: 147000, finnhubIndustry: "Semiconductors" },
        metrics: { metric: { "52WeekHigh": 157.54, "52WeekLow": 84.12 } },
        candles: { s: "ok", c: [130, 132.1], t: [1779465600, 1779552000] }
      })
    }
  );

  assert.equal(result.status, 200);
  assert.equal(result.payload.providerId, "finnhub");
  assert.equal(result.payload.status.status, "connected");
  assert.equal(result.payload.liveProviderCalls, true);
  assert.equal(result.payload.quotesByTicker.MU.price, 132.1);
  assert.equal(result.payload.quotesByTicker.MU.dayHigh, 133);
  assert.equal(result.payload.quotesByTicker.MU.marketCap, 147000000000);
  assert.equal(result.payload.quotesByTicker.MU.fiftyTwoWeekHigh, 157.54);
  assert.equal(result.payload.quotesByTicker.MU.fiftyTwoWeekLow, 84.12);
  assert.equal(result.payload.quotesByTicker.MU.industry, "Semiconductors");
  assert.equal(JSON.stringify(result.payload).includes("finnhub-secret-value"), false);
});

test("market data quotes endpoint can fall back from rate-limited Finnhub to configured FMP", async () => {
  const result = await apiResponse(
    "GET",
    "/api/market-data/quotes",
    new URLSearchParams({ tickers: "MU", history: "0", profile: "0" }),
    {},
    {
      MARKET_DATA_PROVIDER: "finnhub",
      FINNHUB_API_KEY: "finnhub-secret-value",
      MARKET_DATA_FALLBACK_PROVIDERS: "financialModelingPrep",
      FINANCIAL_MODELING_PREP_API_KEY: "fmp-secret-value"
    },
    {
      cache: createMarketDataCache(),
      now: "2026-05-23T12:30:00-04:00",
      fetchImpl: async (url) => {
        const textUrl = String(url);
        if (textUrl.includes("finnhub.io")) {
          return mockResponse({ error: "rate limit for finnhub-secret-value" }, 429);
        }
        if (textUrl.includes("financialmodelingprep.com") && textUrl.includes("/quote?")) {
          return mockResponse([{
            symbol: "MU",
            name: "Micron Technology, Inc.",
            price: 133.25,
            previousClose: 130,
            change: 3.25,
            changesPercentage: 2.5,
            marketCap: 148000000000,
            volume: 24600000
          }]);
        }
        return mockResponse({ error: "unexpected endpoint" }, 404);
      }
    }
  );

  assert.equal(result.status, 200);
  assert.equal(result.payload.providerId, "financialModelingPrep");
  assert.equal(result.payload.fallbackProviderId, "financialModelingPrep");
  assert.equal(result.payload.primaryProviderId, "finnhub");
  assert.equal(result.payload.status.status, "connected");
  assert.equal(result.payload.status.providerAttempts.length, 2);
  assert.equal(result.payload.status.providerAttempts[0].status, "rate limited");
  assert.equal(result.payload.quotesByTicker.MU.price, 133.25);
  assert.match(result.payload.warnings.join(" "), /using Financial Modeling Prep fallback quotes/);
  assert.equal(JSON.stringify(result.payload).includes("finnhub-secret-value"), false);
  assert.equal(JSON.stringify(result.payload).includes("fmp-secret-value"), false);
});

test("market data live-mode quote refresh can skip Finnhub profile, metric, and candle calls", async () => {
  const calls = [];
  const result = await apiResponse(
    "GET",
    "/api/market-data/quotes",
    new URLSearchParams({ tickers: "MU", history: "0", profile: "0" }),
    {},
    {
      MARKET_DATA_PROVIDER: "finnhub",
      FINNHUB_API_KEY: "finnhub-secret-value"
    },
    {
      cache: createMarketDataCache(),
      now: "2026-05-23T12:30:00-04:00",
      fetchImpl: async (url) => {
        const textUrl = String(url);
        calls.push(textUrl);
        if (textUrl.includes("/quote?")) {
          return mockResponse({ c: 132.1, d: 2.1, dp: 1.6154, h: 133, l: 129, o: 130, pc: 130, t: 1779552000 });
        }
        return mockResponse({ error: "unexpected endpoint" }, 500);
      }
    }
  );

  assert.equal(result.status, 200);
  assert.equal(result.payload.status.status, "connected");
  assert.equal(result.payload.quotesByTicker.MU.price, 132.1);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /\/quote\?/);
});

test("market data quotes endpoint keeps Finnhub live when only candle history is plan-limited", async () => {
  const result = await apiResponse(
    "GET",
    "/api/market-data/quotes",
    new URLSearchParams({ tickers: "MU", history: "1" }),
    {},
    {
      MARKET_DATA_PROVIDER: "finnhub",
      FINNHUB_API_KEY: "finnhub-secret-value"
    },
    {
      now: "2026-05-23T12:30:00-04:00",
      fetchImpl: finnhubFetchMock({
        quote: { c: 132.1, d: 2.1, dp: 1.6154, h: 133, l: 129, o: 130, pc: 130, t: 1779552000 },
        profile: { ticker: "MU", name: "Micron Technology, Inc.", marketCapitalization: 147000, finnhubIndustry: "Semiconductors" },
        metrics: { metric: { "52WeekHigh": 157.54, "52WeekLow": 84.12 } },
        candlesStatus: 403,
        candlesText: JSON.stringify({ error: "You don't have access to this resource." })
      })
    }
  );

  assert.equal(result.status, 200);
  assert.equal(result.payload.status.status, "connected");
  assert.equal(result.payload.status.label, "Live market data");
  assert.equal(result.payload.lastError, null);
  assert.equal(result.payload.quotesByTicker.MU.price, 132.1);
  assert.deepEqual(result.payload.quotesByTicker.MU.historicalPrices, []);
  assert.equal(JSON.stringify(result.payload).includes("finnhub-secret-value"), false);
});

test("market data quotes endpoint reports provider errors without leaking keys", async () => {
  const result = await apiResponse(
    "GET",
    "/api/market-data/quotes",
    new URLSearchParams({ tickers: "MU" }),
    {},
    {
      MARKET_DATA_PROVIDER: "financialModelingPrep",
      FINANCIAL_MODELING_PREP_API_KEY: "fmp-secret-value"
    },
    {
      cache: createMarketDataCache(),
      fetchImpl: fmpFetchMock({ quoteStatus: 429, quoteText: "Limit Reach for fmp-secret-value" })
    }
  );

  assert.equal(result.status, 200);
  assert.equal(result.payload.status.status, "rate limited");
  assert.match(result.payload.status.detail, /rate limit|quota/i);
  assert.equal(JSON.stringify(result.payload).includes("fmp-secret-value"), false);
});

test("market data quote errors redact secrets from thrown fetch messages", async () => {
  const result = await apiResponse(
    "GET",
    "/api/market-data/quotes",
    new URLSearchParams({ tickers: "MU" }),
    {},
    {
      MARKET_DATA_PROVIDER: "financialModelingPrep",
      FINANCIAL_MODELING_PREP_API_KEY: "fmp-secret-value"
    },
    {
      cache: createMarketDataCache(),
      fetchImpl: async () => {
        throw new Error("network failed https://example.test?apikey=fmp-secret-value&token=another-secret");
      }
    }
  );

  assert.equal(result.status, 200);
  assert.equal(result.payload.status.status, "error");
  assert.equal(JSON.stringify(result.payload).includes("fmp-secret-value"), false);
  assert.equal(JSON.stringify(result.payload).includes("another-secret"), false);
  assert.match(result.payload.status.detail, /apikey=\[redacted\]/);
});

test("market data quote endpoint caps oversized ticker requests", async () => {
  const calls = [];
  const tickers = Array.from({ length: 60 }, (_, index) => `T${index}`).join(",");
  const result = await apiResponse(
    "GET",
    "/api/market-data/quotes",
    new URLSearchParams({ tickers, history: "0" }),
    {},
    {
      MARKET_DATA_PROVIDER: "financialModelingPrep",
      FINANCIAL_MODELING_PREP_API_KEY: "fmp-secret-value"
    },
    {
      fetchImpl: countedFetch(calls, async () => mockResponse([]))
    }
  );

  assert.equal(result.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(result.payload.requestedTickerCount, 60);
  assert.equal(result.payload.truncatedTickers.length, 10);
  assert.equal(result.payload.status.truncatedTickers.length, 10);
  assert.match(result.payload.warnings.join(" "), /capped at 50 tickers/);
  assert.match(calls[0], /symbol=T0%2CT1/);
  assert.match(calls[0], /T49/);
  assert.doesNotMatch(calls[0], /T50/);
});

test("market data quotes endpoint reuses fresh server cache without provider calls", async () => {
  const cache = createMarketDataCache();
  const env = {
    MARKET_DATA_PROVIDER: "financialModelingPrep",
    FINANCIAL_MODELING_PREP_API_KEY: "fmp-secret-value"
  };
  const firstCalls = [];
  await apiResponse(
    "GET",
    "/api/market-data/quotes",
    new URLSearchParams({ tickers: "MU", history: "1" }),
    {},
    env,
    {
      cache,
      now: "2026-05-23T12:00:00-04:00",
      fetchImpl: countedFetch(firstCalls, fmpFetchMock({
        quote: [{ symbol: "MU", price: 132.1, previousClose: 130, change: 2.1, changesPercentage: 1.6154, volume: 1000 }],
        profile: [{ symbol: "MU", sector: "Technology", industry: "Semiconductors" }],
        history: { historical: [{ date: "2026-05-22", close: 132.1 }] }
      }))
    }
  );
  const secondCalls = [];
  const second = await apiResponse(
    "GET",
    "/api/market-data/quotes",
    new URLSearchParams({ tickers: "MU", history: "1" }),
    {},
    env,
    {
      cache,
      now: "2026-05-23T12:02:00-04:00",
      fetchImpl: countedFetch(secondCalls, () => {
        throw new Error("cache hit should not call provider");
      })
    }
  );

  assert.equal(firstCalls.length, 3);
  assert.equal(secondCalls.length, 0);
  assert.equal(second.payload.status.status, "cached");
  assert.equal(second.payload.status.label, "Cached market data");
  assert.equal(second.payload.quotesByTicker.MU.cacheStatus, "cached");
});

test("market data quotes endpoint serves stale cache on refresh failure", async () => {
  const cache = createMarketDataCache({ quoteTtlMs: 60_000, profileTtlMs: 60_000, historyTtlMs: 60_000 });
  const env = {
    MARKET_DATA_PROVIDER: "financialModelingPrep",
    FINANCIAL_MODELING_PREP_API_KEY: "fmp-secret-value",
    MARKET_DATA_QUOTE_TTL_MINUTES: "1",
    MARKET_DATA_PROFILE_TTL_HOURS: String(1 / 60),
    MARKET_DATA_HISTORY_TTL_HOURS: String(1 / 60)
  };
  await apiResponse(
    "GET",
    "/api/market-data/quotes",
    new URLSearchParams({ tickers: "MU", history: "1" }),
    {},
    env,
    {
      cache,
      now: "2026-05-23T12:00:00-04:00",
      fetchImpl: fmpFetchMock({
        quote: [{ symbol: "MU", price: 132.1, previousClose: 130, change: 2.1, changesPercentage: 1.6154, volume: 1000 }],
        profile: [{ symbol: "MU", sector: "Technology", industry: "Semiconductors" }],
        history: { historical: [{ date: "2026-05-22", close: 132.1 }] }
      })
    }
  );
  const stale = await apiResponse(
    "GET",
    "/api/market-data/quotes",
    new URLSearchParams({ tickers: "MU", history: "1" }),
    {},
    env,
    {
      cache,
      now: "2026-05-23T12:03:00-04:00",
      fetchImpl: fmpFetchMock({ quoteStatus: 429, quoteText: "Limit Reach for fmp-secret-value" })
    }
  );

  assert.equal(stale.payload.status.status, "stale data");
  assert.equal(stale.payload.quotesByTicker.MU.price, 132.1);
  assert.equal(stale.payload.quotesByTicker.MU.cacheStatus, "stale");
  assert.match(stale.payload.status.detail, /refresh failed/i);
  assert.equal(JSON.stringify(stale.payload).includes("fmp-secret-value"), false);
});

test("politician trades endpoint stays mock-safe without live provider config", async () => {
  let fetchCalls = 0;
  const result = await apiResponse(
    "GET",
    "/api/politician-trades",
    new URLSearchParams({ provider: "senate-stock-watcher" }),
    {},
    {},
    {
      fetchImpl() {
        fetchCalls += 1;
        throw new Error("should not call provider without config");
      }
    }
  );

  assert.equal(result.status, 200);
  assert.equal(fetchCalls, 0);
  assert.equal(result.payload.liveProviderCalls, false);
  assert.equal(result.payload.records.length, 0);
  assert.match(result.payload.warnings[0], /not configured/i);
});

test("politician trades endpoint returns normalized public dataset rows with mocked fetch", async () => {
  const result = await apiResponse(
    "GET",
    "/api/politician-trades",
    new URLSearchParams({ provider: "senate-stock-watcher", limit: "5" }),
    {},
    {
      POLITICIAN_TRADES_PROVIDER: "senate-stock-watcher",
      POLITICIAN_TRADES_LIVE_ENABLED: "true",
      POLITICIAN_TRADES_SOURCE_URL: "https://example.test/senate-stock-watcher.json?token=politician-secret-token-value"
    },
    {
      now: "2026-05-24T12:00:00-04:00",
      politicianTradeCache: { payload: null, fetchedAt: null },
      fetchImpl: async () => mockResponse([{
        first_name: "Jane",
        last_name: "Doe",
        office: "Doe, Jane (Senator)",
        ptr_link: "https://example.test/ptr/jane-doe",
        date_recieved: "05/20/2026",
        transactions: [{
          transaction_date: "05/01/2026",
          owner: "Self",
          ticker: "NVDA",
          asset_description: "NVIDIA Corporation",
          type: "Purchase",
          amount: "$1,001 - $15,000"
        }]
      }])
    }
  );

  assert.equal(result.status, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.liveProviderCalls, true);
  assert.equal(result.payload.status, "connected");
  assert.equal(result.payload.cacheStatus, "fresh");
  assert.equal(result.payload.dataFreshness, "fresh");
  assert.equal(result.payload.records[0].ticker, "NVDA");
  assert.equal(result.payload.records[0].sourceMode, "public-static-dataset");
  assert.match(result.payload.sourceRecommendation, /Do not scrape/);
  assert.match(result.payload.sourceCoverage, /Senate PTR rows only/);
  assert.equal(JSON.stringify(result.payload).includes("politician-secret-token-value"), false);
});

test("politician trades endpoint serves stale cache with refresh status on rate limit", async () => {
  const cache = { payload: null, fetchedAt: null };
  const env = {
    POLITICIAN_TRADES_PROVIDER: "senate-stock-watcher",
    POLITICIAN_TRADES_LIVE_ENABLED: "true",
    POLITICIAN_TRADES_TTL_HOURS: "0.001",
    POLITICIAN_TRADES_SOURCE_URL: "https://example.test/senate-stock-watcher.json?token=politician-secret-token-value"
  };
  const row = {
    first_name: "Jane",
    last_name: "Doe",
    office: "Doe, Jane (Senator)",
    ptr_link: "https://example.test/ptr/jane-doe",
    date_recieved: "05/20/2026",
    transactions: [{
      transaction_date: "05/01/2026",
      owner: "Self",
      ticker: "NVDA",
      asset_description: "NVIDIA Corporation",
      type: "Purchase",
      amount: "$1,001 - $15,000"
    }]
  };

  await apiResponse(
    "GET",
    "/api/politician-trades",
    new URLSearchParams({ provider: "senate-stock-watcher" }),
    {},
    env,
    {
      now: "2026-05-24T12:00:00-04:00",
      politicianTradeCache: cache,
      fetchImpl: async () => mockResponse([row])
    }
  );
  const stale = await apiResponse(
    "GET",
    "/api/politician-trades",
    new URLSearchParams({ provider: "senate-stock-watcher" }),
    {},
    env,
    {
      now: "2026-05-24T12:06:00-04:00",
      politicianTradeCache: cache,
      fetchImpl: async () => mockResponse({ error: "rate limited politician-secret-token-value" }, 429)
    }
  );

  assert.equal(stale.status, 200);
  assert.equal(stale.payload.status, "rate limited");
  assert.equal(stale.payload.refreshStatus, "rate limited");
  assert.equal(stale.payload.cacheStatus, "stale");
  assert.equal(stale.payload.dataFreshness, "stale");
  assert.equal(stale.payload.refreshAttemptedAt, "2026-05-24T12:06:00-04:00");
  assert.equal(stale.payload.lastSuccessfulRefresh, "2026-05-24T12:00:00-04:00");
  assert.equal(stale.payload.records[0].ticker, "NVDA");
  assert.equal(JSON.stringify(stale.payload).includes("politician-secret-token-value"), false);
});

test("politician trades endpoint rejects unsupported provider", async () => {
  const result = await apiResponse("GET", "/api/politician-trades", new URLSearchParams({ provider: "unknown" }), {}, {});

  assert.equal(result.status, 400);
  assert.equal(result.payload.error, "unsupported_politician_trade_provider");
});

test("reddit mentions endpoint stays mock-safe without live provider config", async () => {
  let fetchCalls = 0;
  const result = await apiResponse(
    "GET",
    "/api/reddit/mentions",
    new URLSearchParams({ subreddits: "stocks" }),
    {},
    {
      REDDIT_CLIENT_ID: "reddit-client",
      REDDIT_CLIENT_SECRET: "reddit-secret",
      REDDIT_USER_AGENT: "market-pulse-test"
    },
    {
      fetchImpl() {
        fetchCalls += 1;
        throw new Error("should not call Reddit without live flag");
      }
    }
  );

  assert.equal(result.status, 200);
  assert.equal(fetchCalls, 0);
  assert.equal(result.payload.liveProviderCalls, false);
  assert.equal(result.payload.mode, "configured-not-connected");
  assert.equal(result.payload.records.length, 0);
  assert.equal(JSON.stringify(result.payload).includes("reddit-secret"), false);
});

test("reddit mentions endpoint returns normalized live rows with mocked Reddit API", async () => {
  const result = await apiResponse(
    "GET",
    "/api/reddit/mentions",
    new URLSearchParams({ subreddits: "stocks", provider: "reddit-api" }),
    {},
    {
      REDDIT_CLIENT_ID: "reddit-client",
      REDDIT_CLIENT_SECRET: "reddit-secret-value",
      REDDIT_USER_AGENT: "market-pulse-test",
      REDDIT_LIVE_ENABLED: "true"
    },
    {
      now: "2026-05-24T12:00:00-04:00",
      redditMentionCache: { payload: null, fetchedAt: null },
      fetchImpl: redditFetchMock()
    }
  );

  assert.equal(result.status, 200);
  assert.equal(result.payload.liveProviderCalls, true);
  assert.equal(result.payload.status, "connected");
  assert.equal(result.payload.cacheStatus, "fresh");
  assert.ok(result.payload.records.length >= 2);
  assert.ok(result.payload.records.every((record) => record.sourceMode === "api"));
  assert.ok(result.payload.records.every((record) => !record.authorHandle));
  assert.ok(result.payload.summary.some((row) => row.ticker === "MU"));
  assert.equal(JSON.stringify(result.payload).includes("reddit-secret-value"), false);
});

test("reddit mentions endpoint serves stale cache on provider refresh failure", async () => {
  const cache = { payload: null, fetchedAt: null };
  const env = {
    REDDIT_CLIENT_ID: "reddit-client",
    REDDIT_CLIENT_SECRET: "reddit-secret-value",
    REDDIT_USER_AGENT: "market-pulse-test",
    REDDIT_LIVE_ENABLED: "true",
    REDDIT_TTL_MINUTES: "1"
  };
  await apiResponse(
    "GET",
    "/api/reddit/mentions",
    new URLSearchParams({ subreddits: "stocks" }),
    {},
    env,
    {
      now: "2026-05-24T12:00:00-04:00",
      redditMentionCache: cache,
      fetchImpl: redditFetchMock()
    }
  );
  const stale = await apiResponse(
    "GET",
    "/api/reddit/mentions",
    new URLSearchParams({ subreddits: "stocks" }),
    {},
    env,
    {
      now: "2026-05-24T12:03:00-04:00",
      redditMentionCache: cache,
      fetchImpl: async () => mockResponse({ error: "rate limited reddit-secret-value" }, 429)
    }
  );

  assert.equal(stale.status, 200);
  assert.equal(stale.payload.status, "rate limited");
  assert.equal(stale.payload.refreshStatus, "rate limited");
  assert.equal(stale.payload.cacheStatus, "stale");
  assert.equal(stale.payload.dataFreshness, "stale");
  assert.equal(stale.payload.refreshAttemptedAt, "2026-05-24T12:03:00-04:00");
  assert.equal(stale.payload.lastSuccessfulRefresh, "2026-05-24T12:00:00-04:00");
  assert.ok(stale.payload.records.length >= 2);
  assert.match(stale.payload.lastError, /rate limited|Reddit/i);
  assert.equal(JSON.stringify(stale.payload).includes("reddit-secret-value"), false);
});

test("reddit mentions endpoint does not reuse cache across subreddit settings", async () => {
  const cache = { payload: null, fetchedAt: null, key: "" };
  const env = {
    REDDIT_CLIENT_ID: "reddit-client",
    REDDIT_CLIENT_SECRET: "reddit-secret-value",
    REDDIT_USER_AGENT: "market-pulse-test",
    REDDIT_LIVE_ENABLED: "true",
    REDDIT_TTL_MINUTES: "30"
  };
  await apiResponse(
    "GET",
    "/api/reddit/mentions",
    new URLSearchParams({ subreddits: "stocks" }),
    {},
    env,
    {
      now: "2026-05-24T12:00:00-04:00",
      redditMentionCache: cache,
      fetchImpl: redditFetchMock()
    }
  );
  const letfs = await apiResponse(
    "GET",
    "/api/reddit/mentions",
    new URLSearchParams({ subreddits: "LETFs" }),
    {},
    env,
    {
      now: "2026-05-24T12:01:00-04:00",
      redditMentionCache: cache,
      fetchImpl: redditFetchMock()
    }
  );

  assert.equal(letfs.status, 200);
  assert.notEqual(letfs.payload.cacheStatus, "cached");
  assert.equal(letfs.payload.records.some((record) => record.subreddit === "stocks"), false);
  assert.match(letfs.payload.warnings.join(" "), /LETFs/);
});

test("reddit mentions endpoint rejects unsupported provider", async () => {
  const result = await apiResponse("GET", "/api/reddit/mentions", new URLSearchParams({ provider: "unknown" }), {}, {});

  assert.equal(result.status, 400);
  assert.equal(result.payload.error, "unsupported_reddit_provider");
});

test("X updates endpoint stays mock-safe without live provider config", async () => {
  let fetchCalls = 0;
  const result = await apiResponse(
    "GET",
    "/api/x/updates",
    new URLSearchParams({ query: "$MU OR $NVDA" }),
    {},
    { X_BEARER_TOKEN: "x-bearer-secret" },
    {
      fetchImpl() {
        fetchCalls += 1;
        throw new Error("should not call X without live flag");
      }
    }
  );

  assert.equal(result.status, 200);
  assert.equal(fetchCalls, 0);
  assert.equal(result.payload.liveProviderCalls, false);
  assert.equal(result.payload.mode, "configured-not-connected");
  assert.equal(result.payload.records.length, 0);
  assert.equal(JSON.stringify(result.payload).includes("x-bearer-secret"), false);
});

test("X updates endpoint returns mocked fallback rows on explicit mock provider", async () => {
  let fetchCalls = 0;
  const result = await apiResponse(
    "GET",
    "/api/x/updates",
    new URLSearchParams({ provider: "mock" }),
    {},
    {},
    {
      now: "2026-05-24T12:00:00-04:00",
      fetchImpl() {
        fetchCalls += 1;
        throw new Error("mock provider should not fetch");
      }
    }
  );

  assert.equal(result.status, 200);
  assert.equal(fetchCalls, 0);
  assert.equal(result.payload.mode, "mock");
  assert.equal(result.payload.liveProviderCalls, false);
  assert.equal(result.payload.cacheStatus, "mock");
  assert.ok(result.payload.records.length >= 3);
});

test("X updates endpoint returns normalized live rows with mocked X API", async () => {
  const result = await apiResponse(
    "GET",
    "/api/x/updates",
    new URLSearchParams({ query: "$MU OR $NVDA", provider: "x-api" }),
    {},
    {
      X_BEARER_TOKEN: "x-bearer-secret-value",
      X_LIVE_ENABLED: "true"
    },
    {
      now: "2026-05-24T12:00:00-04:00",
      xUpdateCache: { payload: null, fetchedAt: null, key: "" },
      xApiBaseUrl: "https://x.example/2",
      fetchImpl: xFetchMock()
    }
  );

  assert.equal(result.status, 200);
  assert.equal(result.payload.liveProviderCalls, true);
  assert.equal(result.payload.status, "connected");
  assert.equal(result.payload.cacheStatus, "fresh");
  assert.ok(result.payload.records.length >= 2);
  assert.ok(result.payload.records.every((record) => record.sourceMode === "api"));
  assert.ok(result.payload.records.every((record) => record.sourceLabel === "X API recent update"));
  assert.ok(result.payload.records.every((record) => !record.text.includes("@actual_user")));
  assert.ok(result.payload.summary.some((row) => row.ticker === "MU"));
  assert.equal(JSON.stringify(result.payload).includes("x-bearer-secret-value"), false);
});

test("X updates endpoint serves stale cache on provider refresh failure", async () => {
  const cache = { payload: null, fetchedAt: null, key: "" };
  const env = {
    X_BEARER_TOKEN: "x-bearer-secret-value",
    X_LIVE_ENABLED: "true",
    X_TTL_MINUTES: "1"
  };
  await apiResponse(
    "GET",
    "/api/x/updates",
    new URLSearchParams({ query: "$MU OR $NVDA" }),
    {},
    env,
    {
      now: "2026-05-24T12:00:00-04:00",
      xUpdateCache: cache,
      xApiBaseUrl: "https://x.example/2",
      fetchImpl: xFetchMock()
    }
  );
  const stale = await apiResponse(
    "GET",
    "/api/x/updates",
    new URLSearchParams({ query: "$MU OR $NVDA" }),
    {},
    env,
    {
      now: "2026-05-24T12:03:00-04:00",
      xUpdateCache: cache,
      xApiBaseUrl: "https://x.example/2",
      fetchImpl: async () => mockResponse({ error: "rate limited Authorization: Bearer x-bearer-secret-value" }, 429)
    }
  );

  assert.equal(stale.status, 200);
  assert.equal(stale.payload.cacheStatus, "stale");
  assert.equal(stale.payload.dataFreshness, "stale");
  assert.ok(stale.payload.records.length >= 2);
  assert.match(stale.payload.lastError, /rate limited|X/i);
  assert.equal(JSON.stringify(stale.payload).includes("x-bearer-secret-value"), false);
});

test("X updates endpoint rejects unsupported provider", async () => {
  const result = await apiResponse("GET", "/api/x/updates", new URLSearchParams({ provider: "unknown" }), {}, {});

  assert.equal(result.status, 400);
  assert.equal(result.payload.error, "unsupported_x_provider");
});

test("local server refuses static dotfiles and secret-like files", async (t) => {
  const staticRoot = mkdtempSync(join(tmpdir(), "market-pulse-static-"));
  mkdirSync(join(staticRoot, ".git"), { recursive: true });
  writeFileSync(join(staticRoot, "index.html"), "<h1>Market Pulse</h1>");
  writeFileSync(join(staticRoot, ".env"), "FINANCIAL_MODELING_PREP_API_KEY=real-looking-secret");
  writeFileSync(join(staticRoot, ".git", "config"), "[remote]\nurl = secret");
  mkdirSync(join(staticRoot, "local-data"), { recursive: true });
  writeFileSync(join(staticRoot, "local-data", "fidelity-plaid-session.json"), "{\"accessToken\":\"secret\"}");
  writeFileSync(join(staticRoot, "api-token.txt"), "token");

  const server = createDashboardServer({ staticRoot, env: {} });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    rmSync(staticRoot, { recursive: true, force: true });
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  assert.equal((await fetch(`${baseUrl}/index.html`)).status, 200);
  assert.equal((await fetch(`${baseUrl}/.env`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/.git/config`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/local-data/fidelity-plaid-session.json`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/api-token.txt`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/%2eenv`)).status, 404);
});

test("local server startup falls forward when the requested port is busy", async () => {
  const occupied = await startDashboardServer({ initialPort: 0, log: () => {} });
  const fallback = await startDashboardServer({
    initialPort: occupied.port,
    maxAttempts: 20,
    log: () => {}
  });

  try {
    assert.notEqual(fallback.port, occupied.port);
    assert.ok(fallback.port > 0);
  } finally {
    await closeDashboardServer(fallback.server);
    await closeDashboardServer(occupied.server);
  }
});

function fmpFetchMock(options = {}) {
  return async function fetchImpl(url) {
    const textUrl = String(url);
    if (textUrl.includes("/quote?")) return mockResponse(options.quote || [], options.quoteStatus || 200, options.quoteText);
    if (textUrl.includes("/profile?")) return mockResponse(options.profile || [], options.profileStatus || 200, options.profileText);
    if (textUrl.includes("/historical-price-eod/full?")) return mockResponse(options.history || { historical: [] }, options.historyStatus || 200, options.historyText);
    return mockResponse({ error: "unexpected endpoint" }, 404);
  };
}

function finnhubFetchMock(options = {}) {
  return async function fetchImpl(url) {
    const textUrl = String(url);
    if (textUrl.includes("/quote?")) return mockResponse(options.quote || {}, options.quoteStatus || 200, options.quoteText);
    if (textUrl.includes("/stock/profile2?")) return mockResponse(options.profile || {}, options.profileStatus || 200, options.profileText);
    if (textUrl.includes("/stock/metric?")) return mockResponse(options.metrics || { metric: {} }, options.metricsStatus || 200, options.metricsText);
    if (textUrl.includes("/stock/candle?")) return mockResponse(options.candles || { s: "no_data" }, options.candlesStatus || 200, options.candlesText);
    return mockResponse({ error: "unexpected endpoint" }, 404);
  };
}

function redditFetchMock() {
  return async function fetchImpl(url) {
    const textUrl = String(url);
    if (textUrl.includes("/api/v1/access_token")) {
      return mockResponse({ access_token: "reddit-token", token_type: "bearer", expires_in: 3600 });
    }
    if (textUrl.includes("/r/stocks/new")) {
      return mockResponse({
        data: {
          children: [{
            data: {
              name: "t3_mu_post",
              subreddit: "stocks",
              author: "do-not-store",
              created_utc: 1779638400,
              title: "MU and NVDA are in a memory discussion",
              selftext: "Watching $MU and NVDA. AI should stay filtered.",
              score: 101,
              ups: 101,
              num_comments: 22,
              permalink: "/r/stocks/comments/mu_post/"
            }
          }]
        }
      });
    }
    if (textUrl.includes("/r/stocks/comments")) {
      return mockResponse({
        data: {
          children: [{
            data: {
              name: "t1_mu_comment",
              subreddit: "stocks",
              author: "do-not-store-either",
              created_utc: 1779639000,
              link_title: "MU follow up",
              body: "MU is the ticker here. NOW and CAN are not.",
              score: 18,
              ups: 18,
              permalink: "/r/stocks/comments/mu_post/comment/mu_comment/"
            }
          }]
        }
      });
    }
    return mockResponse({ error: "unexpected endpoint" }, 404);
  };
}

function xFetchMock() {
  return async function fetchImpl(url, options = {}) {
    const textUrl = String(url);
    assert.equal(textUrl.includes("/tweets/search/recent"), true);
    assert.equal(String(options.headers?.Authorization || "").includes("x-bearer-secret-value"), true);
    return mockResponse({
      data: [
        {
          id: "x-mu-post",
          text: "$MU memory demand update from @actual_user should not retain a handle field.",
          created_at: "2026-05-24T13:00:00.000Z",
          public_metrics: { like_count: 20, repost_count: 3, reply_count: 2, quote_count: 1 }
        },
        {
          id: "x-nvda-post",
          text: "$NVDA and $AMD supply chain discussion. AI should stay filtered unless cashtagged.",
          created_at: "2026-05-24T13:05:00.000Z",
          public_metrics: { like_count: 30, repost_count: 4, reply_count: 3, quote_count: 2 }
        }
      ],
      meta: { result_count: 2 }
    });
  };
}

function countedFetch(calls, fetchImpl) {
  return async function counted(url) {
    calls.push(String(url));
    return fetchImpl(url);
  };
}

function memoryPlaidStore(initial = null) {
  let session = initial;
  return {
    read: () => session,
    write: (next) => { session = next; },
    clear: () => { session = null; }
  };
}

function mockResponse(payload, status = 200, textOverride = null) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => textOverride ?? JSON.stringify(payload)
  };
}
