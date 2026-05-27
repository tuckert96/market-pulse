# Market Intelligence Adapter Contracts

## Purpose

This checkpoint defines the adapter contract for market intelligence providers. Every provider must map into the same canonical signal shape before it reaches Tucker's dashboard.

## Current Mode

Current mode is local-first with explicit provider gates.

- No outbound provider calls unless a provider is configured and explicitly enabled in local `.env`.
- No API key values returned to the browser.
- No scraping.
- No passwords.
- No paid API integration.
- Sample events remain available when keys are missing.
- Reddit mentions and federal disclosure rows use their own explicitly gated routes. See `docs/reddit-signal-provider.md` and `docs/politician-trade-ingestion.md`.
- X/Twitter rows use sample/local mode by default. Live sync is available only through the local backend with `X_BEARER_TOKEN` and `X_LIVE_ENABLED=true`; the browser never receives the bearer token.

## Supported Adapter IDs

- `demo`
- `finnhub`
- `alphaVantage`
- `newsApi`
- `polygon`
- `xApi`

These IDs are contract names. `liveEnabled` is false unless the relevant local environment configuration explicitly enables a provider.

## Backend Endpoint

```http
GET /api/market/events
GET /api/market/events?provider=newsApi
```

The response includes:

- `mode`
- `requestedProvider`
- `generatedAt`
- `liveProviderCalls`
- `exposesSecretValues`
- `providerStatuses`
- `warnings`
- `events`
- `message`

`events` are canonical signal-shaped objects normalized through `src/marketEventProviders.js` and `src/alphaEngine.js`.

## Provider Status

Each provider status includes:

- `id`
- `label`
- `configured`
- `liveEnabled`
- `mode`
- `sourceTypes`
- `trustLevel`
- `requiredEnv`
- `missingEnv`
- `warning`

The status reports only whether environment keys exist. It never returns key values.

## Normalization Contract

`normalizeMarketProviderEvent(raw, providerId)` maps provider-shaped records into canonical signal fields:

- headline/title
- source and URL
- timestamp
- tickers and affected tickers
- source type
- event type
- summary/raw text
- evidence grade
- missing evidence
- business mechanism
- affected drivers
- price-action placeholder

Provider-specific fetchers added later should only output raw records into this normalizer. The dashboard should consume normalized signals, not provider-native records.

## Missing-Key Behavior

Missing keys produce warnings, not crashes. Example:

```json
{
  "configured": false,
  "missingEnv": ["NEWSAPI_KEY"],
  "warning": "NewsAPI is not configured. Missing: NEWSAPI_KEY. Sample events remain available."
}
```

## Social Signal Policy

The `xApi` adapter is lower trust by default:

- default evidence grade: `D`
- trust level: `low`
- missing evidence emphasizes primary-source confirmation and price-action confirmation

Social signals must not be treated as factual without stronger corroboration.

## X/Twitter Setup Status

X/Twitter live sync is available only through the local backend X recent-search adapter. `X_BEARER_TOKEN` must stay in local `.env`, `X_LIVE_ENABLED=true` must be set explicitly, and `/api/config` may report only whether a key is present.

Rules for X work:

- use only official or licensed APIs approved by Tucker
- keep bearer tokens server-side in local `.env`
- never scrape X/Twitter pages, timelines, search results, cookies, sessions, or logged-in browser state
- never store X usernames or profile identifiers unless a future feature explicitly needs them and documents retention
- keep Sample/demo events as the fallback when the provider is not configured, disabled, rate limited, stale, or errored
- label X-derived rows as lower-trust social signals, not confirmed news or trade instructions

## Live Adapter Rules

Before enabling any live provider:

- Tucker must approve provider, scopes, credentials, and retention.
- API keys must stay server-side.
- Frontend JavaScript must receive only derived readiness status and normalized events.
- Paywalled sites and X/Twitter must not be scraped.
- Rumors must be labeled as rumors.
- Every event must preserve source, timestamp, evidence grade, confidence, counterarguments, and missing evidence.
