# Reddit Signal Provider Readiness

Market Pulse keeps Reddit/social data lower-trust than filings, company releases, and reputable financial news. Reddit live ingestion is now available only through the local backend when Tucker explicitly configures credentials and enables it.

## Current Mode

- Default mode is sample/local.
- Local Reddit-like JSON import is still supported for testing real-ish payloads.
- Live Reddit API sync is disabled unless `REDDIT_LIVE_ENABLED=true`.
- Reddit API requests run from the local backend only through `/api/reddit/mentions`.
- No Reddit pages are scraped.
- No Reddit usernames are stored from live API responses.
- No Reddit credentials are exposed to browser JavaScript.

## Environment Placeholders

Reddit API configuration belongs in local `.env` only:

```bash
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
REDDIT_USER_AGENT=
REDDIT_REFRESH_TOKEN=
REDDIT_LIVE_ENABLED=false
REDDIT_SUBREDDITS=stocks,investing,SecurityAnalysis,ValueInvesting,LETFs
REDDIT_POST_LIMIT=25
REDDIT_COMMENT_LIMIT=25
REDDIT_TTL_MINUTES=15
```

`/api/config` reports only whether required values are present and whether live sync is enabled. It does not return secret values, refresh tokens, auth codes, cookies, access tokens, or authorization headers.

The first live path uses Reddit OAuth application-only access. The local backend requests an access token from Reddit, then reads recent subreddit posts and comments from configured subreddits. The browser only receives normalized mention rows and status metadata.

The gated X/Twitter path follows the same local-backend rule. `X_BEARER_TOKEN`, if present in `.env`, is exposed only as a true/false availability flag in `/api/config`; live calls require `X_LIVE_ENABLED=true`, and X usernames, cookies, bearer token values, and authorization headers must not be stored or returned to the browser.

## Provider Interface

`src/redditSignals.js` exposes:

- `createRedditProvider("mock")`
- `createRedditProvider("reddit-api")`
- `buildRedditProviderConfig(env, settings)`
- `redditProviderStatuses(env, settings)`
- `importRedditMentionFile(text, options)`

The API provider remains `configured-not-connected` when credentials are present but `REDDIT_LIVE_ENABLED` is not true. When enabled, it returns live/cache/stale/error status through the local backend while preserving mock and local JSON modes.

## Local JSON Import

The local import accepts:

- JSON arrays of post/comment-like records
- `{ "redditMentions": [...] }`
- `{ "records": [...] }`
- `{ "posts": [...] }`
- `{ "comments": [...] }`
- Reddit-like `{ "data": { "children": [{ "data": {...} }] } }`

Useful fields:

- `id`, `sourceId`, or Reddit-style id
- `subreddit`
- `createdAt` or `created_utc`
- `title`
- `body`, `selftext`, `text`, or `comment_text`
- `score`, `ups`, `upvotes`
- `num_comments` or `commentCount`
- `permalink`, `url`, or `sourceUrl`
- `extractedTickers`, `tickers`, `ticker`, or symbols found in text

Rows with no whitelisted ticker are rejected. False-positive tickers such as `ON`, `BE`, `AI`, `NOW`, `ARE`, `IT`, and `CAN` remain filtered even when supplied by a provider-shaped row.

## Summary Output

Reddit mentions roll up into:

- 1-day mentions
- 7-day mentions
- 30-day mentions
- mention growth
- mention acceleration
- total engagement
- placeholder sentiment

These are social-signal inputs only. They are not treated as confirmed facts or trade commands.

## Provider Status

The Reddit pipeline reports:

- `not configured`: required local `.env` values are missing.
- `configured-not-connected`: credentials exist but `REDDIT_LIVE_ENABLED` is false.
- `connected`: the latest backend sync returned usable mention rows.
- `rate limited`: Reddit returned a provider rate-limit response.
- `error`: token or listing fetch failed.
- `stale`: cached mention rows are shown because refresh failed.
- `mock/sample mode`: browser sample rows are active. UI labels this as Sample.

Live rows include `sourceMode: "api"`, `providerId: "reddit-api"`, `liveProviderCalls: true`, `fetchedAt`, and source URLs. Cached/stale rows are labeled in the UI.

## Safety Limits

- Do not scrape Reddit HTML.
- Do not use user cookies.
- Do not expose OAuth secrets in browser code, logs, exports, or `/api/config`.
- Do not store Reddit usernames from live API responses.
- Do not store X/Twitter usernames, cookies, or bearer token values.
- Do not enable background polling without approval.
- Do not convert social chatter into buy/sell instructions.
- Preserve mock mode as the default fallback.
