# Market Data Provider Configuration

This checkpoint enables Finnhub as the primary live market data provider behind the local backend while preserving Sample mode as the default fallback when credentials are absent.

## Recommendation

Recommended first provider: Finnhub.

Why:

- Finnhub's official quote endpoint maps directly to current price, daily change, percent change, open/high/low, and previous close.
- Finnhub's company profile endpoint can provide company name, market capitalization, and industry/sector context when available.
- Finnhub's candle endpoint can provide basic historical daily prices for charts and movement context.
- It keeps the dashboard local-first: browser code calls only the local backend, and the Finnhub token stays in `.env`.

## Free Real-Time Data Decision

There is no truly free, unlimited, consolidated, institutional-grade U.S. equity feed. Real-time U.S. stock data is exchange-regulated, and provider terms/entitlements matter. The dashboard should therefore treat free real-time data as a bounded personal-use input, not as an execution-grade market-data feed.

Best practical free path for Tucker:

- Use Finnhub first for server-side quote/profile/candle refreshes behind the existing local backend.
- Keep cache TTLs, stale labels, and rate-limit backoff enabled so the app does not spam the provider.
- Label market data as Live, Cached, Stale, Error, Partial data, or Sample based on actual provider status.
- Add WebSocket streaming later only behind the same backend/key-safety layer, and only for a bounded watchlist/owned-ticker set.

Why not switch immediately:

- Alpha Vantage documents that realtime or 15-minute delayed U.S. quote access requires a premium membership for quote and intraday endpoints, so it is not the best free realtime default for this app.
- Polygon/Massive is a strong professional-grade path, including WebSocket feeds and consolidated sources, but it is better treated as a paid upgrade path when Tucker needs pro-grade coverage.
- Twelve Data is the best backup candidate to evaluate next because its current individual pricing/support pages describe realtime U.S. stock access, but it still needs a separate implementation and entitlement review before replacing Finnhub.
- Unofficial Yahoo-style sources should stay out of the trusted provider path because reliability and terms can change without a stable contract.

Provider comparison:

- Finnhub: best first fit for Tucker's live quote layer because quote, profile, and candle data map cleanly into the existing cache-backed market data contract.
- Alpha Vantage: good official quote/history/company-overview path, already represented in the app for news/sentiment readiness, but its own docs place U.S. realtime/delayed quote access behind premium endpoints, making it a poor free realtime default.
- Financial Modeling Prep: supported live fallback with quote/profile/history coverage.
- Polygon: strong professional-grade market-data path, but heavier than the first safe slice and likely better after the app needs richer paid-grade market data.
- Twelve Data: promising backup quote and time-series path; evaluate after Finnhub is stable if Tucker wants another free/personal provider option.
- Yahoo-style unofficial sources: non-primary fallback only. Keep isolated because they are unofficial and not the app's trusted provider path.

## Environment Placeholders

Use local `.env` only. Never commit `.env`.

```bash
MARKET_DATA_PROVIDER=finnhub
FINNHUB_API_KEY=your_finnhub_api_key_here
MARKET_DATA_FALLBACK_PROVIDERS=financialModelingPrep
```

Financial Modeling Prep remains available as a selected provider or as an explicit fallback. It is only called when its own local key is configured; the app does not sign up for services or spend money automatically.

```bash
MARKET_DATA_PROVIDER=financialModelingPrep
FINANCIAL_MODELING_PREP_API_KEY=
FMP_API_KEY=
```

Cache TTLs:

```bash
MARKET_DATA_QUOTE_TTL_MINUTES=5
MARKET_DATA_PROFILE_TTL_HOURS=24
MARKET_DATA_HISTORY_TTL_HOURS=12
MARKET_DATA_MAX_QUOTE_TICKERS=50
MARKET_DATA_ENRICHMENT_TICKER_LIMIT=8
```

## Finnhub Setup

1. Create or open a Finnhub account at [finnhub.io](https://finnhub.io).
2. Copy the API token from Finnhub's dashboard.
3. Create a local `.env` file next to `package.json`. Do not commit this file.
4. Add:

```bash
MARKET_DATA_PROVIDER=finnhub
FINNHUB_API_KEY=your_real_key_here
```

5. Run `npm run dev` and open `/api/config` or the Data Sources screen. The app should show Finnhub as configured/live-ready without showing the key value.

Without `FINNHUB_API_KEY`, Market Pulse stays in Sample market-data mode. That is expected and should not block portfolio imports, alerts, ticker pages, or the Daily Command Brief.

Other future alternatives are represented but inactive:

```bash
ALPHA_VANTAGE_API_KEY=
POLYGON_API_KEY=
TWELVE_DATA_API_KEY=
```

## Current Behavior

- `/api/config` reads local `.env` through the local backend.
- The browser receives only key presence, selected provider, missing env names, and status text.
- API key values are never returned to frontend JavaScript.
- A present Finnhub key enables server-side live quote calls through the local proxy when `MARKET_DATA_PROVIDER=finnhub`.
- Browser code calls only `/api/market-data/quotes`; it never calls Finnhub directly and never receives API key values.
- If no key is configured, `/api/market-data/quotes` returns sample quote data with a fallback reason.
- Quote, profile, metric, and historical price responses are cached separately in the local backend process.
- Cached responses include `fetchedAt`, `dataFreshness`, `cacheStatus`, `lastSuccessfulRefresh`, and `lastError` metadata.
- If the provider returns a rate-limit, invalid response, partial response, or network error, the dashboard receives a normalized status instead of crashing.
- Optional fallback providers are controlled by `MARKET_DATA_FALLBACK_PROVIDERS`. Example: if Finnhub returns no usable quotes because of a rate limit/error and `financialModelingPrep` is configured with its own key, the backend can try FMP and reports the provider-attempt chain in Data Sources diagnostics.
- If Finnhub quote/profile/metric calls work but the plan blocks historical candles, the feed stays Live for quote data and chart/history sections show missing historical data instead of marking the entire provider stale.
- Data Sources includes a local **Live mode** toggle. Live mode is an opt-in browser auto-refresh loop that calls only `/api/market-data/quotes`; it never sends provider keys to browser code and it still respects the backend cache TTLs so Finnhub is not hit on every UI tick.
- Automatic Live mode refreshes request quote-only data (`history=0&profile=0`) to avoid fan-out across profile, metric, and candle endpoints. Manual refresh still loads richer profile/history context.
- Live mode can be set to 1, 2, 5, or 15 minute intervals. The default is 5 minutes, matching the default quote cache TTL.
- Live mode pauses its timer while the dashboard tab is hidden and resumes when the tab becomes visible again.
- Rate-limit responses put Live mode into a short backoff instead of immediately retrying.
- Manual Refresh market data honors the same provider backoff instead of bypassing a recent rate-limit response.
- Finnhub quote refreshes can request a broad ticker set, but profile/fundamental/history enrichment is budgeted by `MARKET_DATA_ENRICHMENT_TICKER_LIMIT` so a free-tier refresh does not multiply every ticker into quote + profile + metric + candle calls.
- If the local backend is not configured for live market data, Live mode stays in a waiting state and Sample mode remains safe.
- `npm run dev` serves the dashboard through the safe local backend/proxy for configuration and live quote testing. `npm run dev:api` is the same local-server alias.

## Local Quote Endpoint

```http
GET /api/market-data/quotes?tickers=MU,NVDA&history=1
```

The endpoint returns a normalized `MarketDataSnapshot`:

- `providerId`
- `providerLabel`
- `mode`
- `configured`
- `liveProviderCalls`
- `quotes`
- `quotesByTicker`
- `requestedTickers`
- `missingTickers`
- `warnings`
- `status`
- `cache.requestBudget`
- `cache.deferredEnrichmentTickers`
- optional `error`

Finnhub is queried for quote, company profile, basic financial metrics, and daily historical candles when credentials are present and selected.

Official Finnhub endpoint shapes used by the adapter:

- `GET /quote?symbol=...`
- `GET /stock/profile2?symbol=...`
- `GET /stock/metric?symbol=...&metric=all`
- `GET /stock/candle?symbol=...&resolution=D&from=...&to=...`

## Error And Fallback Behavior

- Missing credentials: returns sample data and `fallbackReason: missing-market-data-credentials`.
- Fresh cache hit: returns `status.status = "cached"` and `Cached market data` without calling the provider again.
- Cache miss or expired cache with successful refresh: returns `Live market data`.
- Mixed quote/profile/history freshness: labels the snapshot `cached` / `Cached market data` if any displayed quote data came from fresh cache, instead of overstating it as fully live.
- Rate limit/quota: returns `status.status = "rate limited"` with a redacted detail.
- Expired cache with refresh failure: returns stale cached quote data with `status.status = "stale data"` when a prior successful value exists.
- Provider omits a previously cached ticker: returns the last successful quote as stale cached data and records a warning/error message.
- Invalid or omitted ticker: no fake quote is created; valid tickers still normalize when returned, and `status.status = "partial data"`, `missingTickers`, and `warnings` identify requested symbols that did not produce normalized quotes.
- Partial profile/history response: quote data still loads, with unknown sector/industry or empty history as needed; the snapshot stays usable while showing the provider warning.
- Stale data: quote snapshots older than 24 hours report `stale data`.
- Empty live-provider error snapshots are labeled `error`, not live.

## Live Adapter Guardrails

- Use only local `.env` for provider credentials.
- Do not commit `.env`.
- Do not paste API keys into browser JavaScript or local storage.
- Tests must mock provider responses and never call the real provider.
- The dashboard labels Sample data when credentials are absent.
