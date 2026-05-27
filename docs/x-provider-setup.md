# X/Twitter Provider Setup Status

Market Pulse has a local-backend X update adapter for official API recent-search rows. It is disabled by default, returns sample rows on explicit mock requests, and never uses browser cookies, scraping, or logged-in session state.

## Current Mode

- No live X API calls unless both `X_BEARER_TOKEN` and `X_LIVE_ENABLED=true` are present in local `.env`.
- No X/Twitter scraping.
- No browser-assisted timeline extraction.
- No cookies, session tokens, passwords, or logged-in browser state.
- `GET /api/x/updates` returns `not-configured` or `configured-not-connected` with no network calls by default.
- `GET /api/x/updates?provider=mock` returns source-labeled sample rows.
- The `xApi` market-event adapter under `/api/market/events` is still readiness-only and returns provider status, not live X rows.

## Environment Placeholder

`.env.example` includes:

```dotenv
X_BEARER_TOKEN=
X_LIVE_ENABLED=false
X_QUERY=
X_TICKER_WHITELIST=MU,NVDA,AMD,SOXL,UPRO,VGT,CRDO,QQQ,TQQQ,AAPL,MSFT,AVGO,TSM,ASML,SMH,SOXX
X_MAX_RESULTS=25
X_TTL_MINUTES=15
```

Keep `X_BEARER_TOKEN` blank unless testing the official X API adapter locally. The token must stay in local `.env` and must be used only by the local backend. Browser JavaScript must never receive the token or authorization headers.

## Implemented Backend Path

- `src/xUpdatesProvider.js` owns provider config, not-configured/configured-disabled status, recent-search fetching, row normalization, ticker extraction, source labels, and sample rows.
- `scripts/local-server.js` exposes `/api/x/updates` and `/api/twitter/updates`, caches successful live payloads, and serves stale cached rows with warnings after refresh failure.
- `test/xUpdatesProvider.test.js` and `test/localServer.test.js` verify disabled-by-default behavior, no secret leakage, mock fallback, live-provider normalization with mocked fetch, rate-limit redaction, stale fallback, and unsupported-provider rejection.

The live adapter uses X API v2 recent search:

- Endpoint: `/2/tweets/search/recent`
- Auth: `Authorization: Bearer <X_BEARER_TOKEN>` from the local backend only
- Fields: `created_at`, `public_metrics`, `entities`, `lang`
- Default query: whitelisted cashtags, English language, no retweets
- Default TTL: 15 minutes
- Default result cap: 25 rows

## Provider States

- `not configured`: missing or placeholder `X_BEARER_TOKEN`; no network call.
- `configured-not-connected`: token present but `X_LIVE_ENABLED` is not true; no network call.
- `mock/sample mode`: explicit `provider=mock`; no network call.
- `connected`: live recent-search request succeeded.
- `rate limited` or `error`: live request failed; stale cache is served when available.

## Privacy And Compliance Rules

- Do not scrape X/Twitter pages, search results, timelines, or embedded content.
- Do not use Tucker's logged-in browser session.
- Do not store cookies, bearer tokens, refresh tokens, auth codes, or raw authorization headers.
- Do not store author handles, author IDs, usernames, or profile identifiers.
- Redact handles in public text before rows are returned to the browser.
- Treat X-derived information as lower-trust social signal data.
- Never convert social chatter into buy/sell instructions.

## Fallback Modes

If X is missing, disabled, rate limited, stale, or errored, the app should keep working with:

- imported portfolio data
- Finnhub or sample market data
- Reddit sample/local/API data when separately configured
- federal disclosure sample/local/public-static data when separately configured
- Sample Market Intelligence events clearly labeled as Sample
