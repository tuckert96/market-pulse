# Federal Disclosure / Politician Trade Ingestion

This module is real-ingestion ready for local files and has a config-gated public static dataset provider for congressional trading disclosures. It does not scrape official websites, collect credentials, or imply that delayed disclosures are live trading signals.

Recommended automatic source: keep using the existing `senate-stock-watcher` public static JSON path through the local backend. It is derived from the U.S. Senate eFD public financial disclosure database and avoids browser credentials, cookies, official-site scraping, and brittle HTML parsing. Treat it as Senate PTR coverage only; House disclosures should stay local-file/manual until Tucker approves a separate provider or API.

## Current Providers

- `mock`: local sample disclosure rows for UI and scoring development.
- `local-file`: imports user-provided CSV or JSON files and normalizes them into `PoliticianTrade`.
- `senate-stock-watcher`: optional public static JSON provider for the Senate Stock Watcher open dataset. It is disabled by default and runs only through the local backend.
- `future-api`: placeholder for a future licensed/public API adapter.
- `official-disclosure-parser`: placeholder for a future approved official-disclosure parser.

Sample and local-file providers set `liveProviderCalls: false`. The public static dataset provider sets `liveProviderCalls: true` only when explicitly enabled in `.env`.

Fallback behavior:

- Missing env values keep Data Sources in Sample / Not configured mode.
- Local CSV/JSON import remains available without credentials.
- Public static dataset failures should show Error or Stale if cached data exists; they should not silently fall back to fake live rows.
- Browser JavaScript receives normalized disclosure rows and provider status only, never provider secrets.

## Public Static Dataset Setup

Default mode is safe and local:

```dotenv
POLITICIAN_TRADES_PROVIDER=mock
POLITICIAN_TRADES_LIVE_ENABLED=false
```

To test the public static Senate dataset through the local backend:

```dotenv
POLITICIAN_TRADES_PROVIDER=senate-stock-watcher
POLITICIAN_TRADES_LIVE_ENABLED=true
POLITICIAN_TRADES_TTL_HOURS=12
POLITICIAN_TRADES_LIMIT=250
```

Optional:

```dotenv
POLITICIAN_TRADES_SOURCE_URL=
```

If `POLITICIAN_TRADES_SOURCE_URL` is empty or blank, the local backend uses the GitHub-hosted Senate Stock Watcher daily summaries endpoint. Use `npm run dev:api`, then click **Sync public disclosures** in Data Sources.

Provider safeguards:

- backend-only fetch; browser code calls only `/api/politician-trades`
- no API keys required for the default static dataset
- `/api/config` reports only provider status booleans and setup flags, never source URLs or secret values
- no official-site scraping
- no browser cookies, login sessions, or credential collection
- in-memory TTL cache to avoid repeated provider calls
- rejected rows include reasons instead of silently disappearing
- rejected-row snapshots redact auth, token, cookie, password, and session-shaped fields
- provider warnings redact authorization headers, bearer tokens, cookie/session fields, and token-like query params
- unknown party/state stays labeled `Unknown` when the source omits it
- disclosure rows are informational only, not trade commands

## Privacy Boundary

Politician trade rows represent public official disclosure records. The dashboard may store public official names, office metadata, owner category, ticker, amount range, disclosure date, and redacted source URL for traceability. It must not store private citizen PII, browser cookies, session IDs, authorization headers, API keys, or provider access tokens.

Live disclosure sync runs through the local backend only. Provider payloads are normalized before reaching the browser, local caches stay in memory, and startup logs must not print raw provider responses or credential-bearing URLs.

Known limitations:

- Senate-focused source; House coverage may be missing
- not a full federal-disclosure feed
- public disclosures can be delayed
- static datasets can be stale, partial, or temporarily unavailable
- some rows omit party/state or disclosure metadata

## Local CSV Fields

Common headers are accepted with flexible casing and spaces:

- `Politician Name`
- `Chamber`
- `Party`
- `State`
- `Symbol` or `Ticker`
- `Asset Name`
- `Transaction Type`
- `Transaction Date`
- `Disclosure Date`
- `Amount`, `Amount Range`, `Amount Low`, `Amount High`
- `Owner`
- `Source URL`

Example:

```csv
Politician Name,Chamber,Party,State,Symbol,Asset Name,Transaction Type,Transaction Date,Disclosure Date,Amount,Owner,Source URL
Rep Example,House,D,CA,MU,Micron Technology Inc,Purchase,2026-05-01,2026-05-12,"$1,001 - $15,000",Self,https://example.test/disclosures/mu
```

## Local JSON Shape

The importer accepts either an array of records or an object with `politicianTrades`, `trades`, or `records`.

```json
{
  "politicianTrades": [
    {
      "politicianName": "Rep Example",
      "chamber": "House",
      "party": "D",
      "state": "CA",
      "ticker": "MU",
      "assetName": "Micron Technology Inc",
      "transactionType": "purchase",
      "transactionDate": "2026-05-01",
      "disclosureDate": "2026-05-12",
      "amountRange": { "min": 1001, "max": 15000 },
      "owner": "Self",
      "sourceUrl": "https://example.test/disclosures/mu"
    }
  ]
}
```

## Validation

Rows are rejected when required fields are missing or malformed enough that the dashboard cannot safely connect them to a ticker and source.

The import report includes:

- file name and file type
- detected columns
- rows parsed
- trades imported
- rejected rows with row number and reason
- missing fields
- tickers detected
- validation errors and warnings

## Display

Imported rows appear in:

- Data Sources
- Market Intelligence
- ticker detail pages
- combined ticker signal scoring

Disclosures are informational only. The dashboard does not infer intent, causation, or buy/sell commands from politician trades.

## Future Live Work

Before adding additional live sources, define:

- provider/source terms
- official disclosure parsing boundaries, if any
- rate limits and caching
- source URL retention
- token, cookie, username, and PII redaction tests
- validation behavior for amended filings
- UI labeling for delayed disclosure data

No scraping is implemented in this checkpoint.
