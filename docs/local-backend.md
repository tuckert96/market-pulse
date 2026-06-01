# Local Backend And Proxy

`npm run dev` starts a small local Node server that serves the dashboard and exposes backend-shaped API routes under `/api`. `npm run dev:api` remains the same safe local-server alias for older notes and scripts.

## Run

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:4174/
```

If `4174` is already in use, the server tries the next available local port and prints the actual URL. The server uses only Node built-ins. It does not install packages, does not expose secret values to the browser, and refuses to serve `.env`, `.git`, dotfiles, private-key extensions, or secret-like filenames. When Finnhub or Financial Modeling Prep credentials are configured, market-data calls are made server-side through the local proxy.

## Environment

Create a local `.env` file from `.env.example` only when you are ready to test provider setup. Do not commit `.env`.

Supported placeholders:

- `PLAID_CLIENT_ID`
- `PLAID_SECRET`
- `PLAID_ENV` (`sandbox`, `development`, or `production`; defaults to `sandbox`)
- `PLAID_CLIENT_USER_ID` (local pseudonymous user id for Plaid Link)
- `SNAPTRADE_CLIENT_ID`
- `SNAPTRADE_CONSUMER_KEY`
- `MARKET_DATA_PROVIDER` (`finnhub` recommended first)
- `FINNHUB_API_KEY`
- `MARKET_DATA_FALLBACK_PROVIDERS` (comma-separated optional fallbacks, for example `financialModelingPrep`)
- `FINANCIAL_MODELING_PREP_API_KEY`
- `FMP_API_KEY` (optional alias for Financial Modeling Prep)
- `MARKET_DATA_QUOTE_TTL_MINUTES`
- `MARKET_DATA_PROFILE_TTL_HOURS`
- `MARKET_DATA_HISTORY_TTL_HOURS`
- `ALPHA_VANTAGE_API_KEY`
- `NEWSAPI_KEY`
- `X_BEARER_TOKEN` (official X API bearer token; local backend only)
- `X_LIVE_ENABLED` (`false` by default)
- `X_QUERY` (optional recent-search query override)
- `X_TICKER_WHITELIST` (optional comma-separated ticker whitelist)
- `X_MAX_RESULTS`
- `X_TTL_MINUTES`
- `X_API_BASE_URL` (optional test override; defaults to official X API v2 base URL)
- `POLYGON_API_KEY`
- `TWELVE_DATA_API_KEY`
- `REDDIT_CLIENT_ID`
- `REDDIT_CLIENT_SECRET`
- `REDDIT_USER_AGENT`
- `REDDIT_REFRESH_TOKEN` (optional)
- `REDDIT_LIVE_ENABLED` (`false` by default)
- `REDDIT_SUBREDDITS`
- `REDDIT_POST_LIMIT`
- `REDDIT_COMMENT_LIMIT`
- `REDDIT_TTL_MINUTES`
- `POLITICIAN_TRADES_PROVIDER` (`mock` by default; `senate-stock-watcher` for the public static dataset)
- `POLITICIAN_TRADES_LIVE_ENABLED`
- `POLITICIAN_TRADES_SOURCE_URL` (optional override)
- `POLITICIAN_TRADES_TTL_HOURS`
- `POLITICIAN_TRADES_LIMIT`
- `OPENAI_API_KEY` (optional; server-side only)
- `OPENAI_PORTFOLIO_EXPLANATIONS_ENABLED` (`false` by default)
- `OPENAI_PORTFOLIO_MODEL` (defaults to the app's current explanation model)

The `/api/config` endpoint returns only whether each key is present. It never returns the value. Market-data quote credentials are server-side only; browser code receives normalized status and quote data, not API keys.

## Endpoints

```http
GET /api/health
GET /api/config
POST /api/connectors/fidelity/link
POST /api/connectors/fidelity/exchange
GET /api/connectors/fidelity/holdings?provider=plaid
POST /api/connectors/fidelity/unlink
POST /api/connectors/seeking-alpha/link
GET /api/connectors/seeking-alpha/ratings
GET /api/market/events
GET /api/market-data/quotes?tickers=MU,NVDA&history=1
GET /api/reddit/mentions?subreddits=stocks,investing
GET /api/x/updates?query=%24MU%20OR%20%24NVDA
GET /api/politician-trades?provider=senate-stock-watcher
POST /api/portfolio/explanation
```

Current behavior is intentionally conservative:

- Fidelity Plaid endpoints are implemented for local use when `PLAID_CLIENT_ID` and `PLAID_SECRET` are configured. `/api/connectors/fidelity/link` creates a Plaid Link token with the Investments product, `/api/connectors/fidelity/exchange` exchanges the Link public token server-side, `/api/connectors/fidelity/holdings` calls Plaid `/investments/holdings/get`, and `/api/connectors/fidelity/unlink` clears the local token and attempts Plaid `/item/remove`.
- Plaid access tokens are never returned to browser JavaScript. The local backend stores the token in `local-data/fidelity-plaid-session.json`, which is ignored by git and blocked from static serving. Treat this as a personal local token store, not multi-user production storage.
- Plaid account labels are normalized through the same account masking used by CSV imports before they can appear in import reports, holdings rows, exported state, or Data Sources summaries.
- Seeking Alpha endpoints direct Tucker to local CSV/XLSX import unless a licensed backend integration is approved.
- Market events return a demo adapter payload with canonical signal-shaped events, provider readiness, missing-key warnings, and `liveProviderCalls: false`.
- Market data quote provider configuration returns recommended-provider and missing-key status through `/api/config`.
- Market data quote requests use `/api/market-data/quotes`. If the selected provider key is missing, the endpoint returns sample quote data. With `MARKET_DATA_PROVIDER=finnhub` and `FINNHUB_API_KEY` present, the local backend fetches Finnhub quote, profile, basic metric, and historical candle data, caches each resource separately, and normalizes it before sending it to the browser. Financial Modeling Prep remains available by setting `MARKET_DATA_PROVIDER=financialModelingPrep` and adding its local key, or as an explicit fallback via `MARKET_DATA_FALLBACK_PROVIDERS=financialModelingPrep`.
- Fallback quote providers are only attempted after the selected configured live provider returns no usable quotes because of an error or rate limit. Provider attempts are reported in the Data Sources diagnostics, and API keys are still never returned to browser JavaScript.
- The Data Sources **Live mode** control is browser-side scheduling only. It repeats cache-aware calls to `/api/market-data/quotes`, so provider secrets remain server-side and the backend cache controls how often Finnhub is actually called.
- Market data cache metadata includes `fetchedAt`, `dataFreshness`, `cacheStatus`, `lastSuccessfulRefresh`, and `lastError`.
- Expired cached quotes are refreshed when possible. If refresh fails and a stale value exists, the endpoint returns stale cached data with a clear stale status instead of fabricating fresh data.
- Reddit mention requests use `/api/reddit/mentions`. By default the endpoint returns a safe not-configured/configured-disabled payload and makes no network call. When `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT`, and `REDDIT_LIVE_ENABLED=true` are present, the local backend requests a Reddit OAuth token, fetches recent posts and comments for configured subreddits, removes live usernames, normalizes whitelisted ticker mentions, caches the result, and returns source-labeled rows to the browser.
- X update requests use `/api/x/updates`. By default the endpoint returns `not-configured` or `configured-not-connected` and makes no network call. `provider=mock` returns sample source-labeled rows. Live recent-search calls require both `X_BEARER_TOKEN` and `X_LIVE_ENABLED=true`, use the bearer token only in the local backend, redact handles from row text, avoid usernames/cookies/session state, cache successful rows, and return stale cached rows with clear warnings when refresh fails.
- Politician trade disclosure requests use `/api/politician-trades`. By default the endpoint returns a safe not-configured payload and makes no network call. When `POLITICIAN_TRADES_PROVIDER=senate-stock-watcher` and `POLITICIAN_TRADES_LIVE_ENABLED=true`, the local backend fetches the public static Senate Stock Watcher JSON dataset, normalizes disclosure rows, caches the result, and returns source-labeled rows to the browser. A blank `POLITICIAN_TRADES_SOURCE_URL` uses the built-in GitHub-hosted daily summaries URL. This is the recommended automatic path for now: Senate-only, disclosure-derived, backend-only, and no official-site scraping.
- X/Twitter market-event support remains a readiness contract only under `/api/market/events?provider=xApi`. The live row provider is separate at `/api/x/updates`, backend-only, disabled by default, and never scrapes X/Twitter.
- Portfolio explanation requests use `/api/portfolio/explanation`. Without `OPENAI_API_KEY` or without `OPENAI_PORTFOLIO_EXPLANATIONS_ENABLED=true`, the route returns a deterministic local explanation and makes no OpenAI call. When enabled, it sends a capped, redacted, source-labeled dashboard summary to OpenAI's Responses API through the local backend only, strips account identifiers and secret-like fields, redacts generated output before returning it, and falls back to local deterministic text if the provider errors.
- Explanation responses include `reviewMode`, a side-by-side contract with `Deterministic source facts`, `Optional generated summary`, `missingContext`, `sourceLabels`, and safety notes. The Data Sources screen can request this review packet from the local backend; it never displays API keys, prompts, or raw provider payloads.

Market event provider adapters are scaffolded for:

- `demo`
- `finnhub`
- `alphaVantage`
- `newsApi`
- `polygon`
- `xApi`

Use `GET /api/market/events?provider=newsApi` or `provider=xApi` to see a provider-specific readiness warning while still receiving demo events. Unsupported providers return `400 unsupported_market_provider`. The `xApi` adapter reports readiness only; it does not make live X calls even if `X_BEARER_TOKEN` is present.

## Safety Model

- No Fidelity usernames, passwords, MFA codes, cookies, or raw credentials.
- No Seeking Alpha passwords.
- No scraping Seeking Alpha premium pages.
- No scraping X/Twitter.
- No X/Twitter API calls unless `X_BEARER_TOKEN` and `X_LIVE_ENABLED=true` are configured for the local backend.
- No Reddit HTML scraping, cookies, passwords, or stored live usernames.
- No API key values returned to frontend JavaScript.
- External market data calls happen only from the local backend when a market data API key is configured.
- Optional OpenAI explanation calls happen only from the local backend, are disabled by default, and must use redacted structured dashboard context rather than raw brokerage exports.
- No trade execution.

## Next Step

Add provider-specific fetch modules behind this contract only after Tucker approves the provider, scopes, credentials, and data retention model.

See `docs/market-data-provider-config.md` for the first-provider recommendation and setup placeholder details.
