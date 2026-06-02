# Seeking Alpha Premium Connector

## Goal

Use Tucker's Seeking Alpha Premium data to enrich stock picking with Quant Ratings, author ratings, Wall Street ratings, factor grades, revisions, growth, valuation, and catalyst context.

## Security And Terms Position

- Do not ask for or store Tucker's Seeking Alpha password.
- Do not scrape premium pages or undocumented private endpoints.
- Use data Tucker exports from Seeking Alpha, or use a licensed/authorized backend integration.
- Store only the fields needed for scoring and insight generation.
- Keep Premium content behind Tucker's account entitlements and avoid redistribution.

Seeking Alpha's help center documents portfolio export/download as an Excel file. Their Premium feature list describes Quant Rating, SA Authors rating, Sell-Side rating, and grades for Value, Growth, Profitability, Momentum, and EPS Revisions. Their market-data help states that reproducing content requires permission, so the product should treat full data as authorized-user data, not scrapeable public data.

## Current Frontend Contract

The local dashboard accepts Tucker-controlled Seeking Alpha `.csv` files and `.xlsx` portfolio/ratings exports. The workbook parser reads the first worksheet and normalizes common Premium columns into the same canonical records used by connector data.

Supported workbook fields include:

- ticker
- company
- Quant Rating
- SA Author Rating
- Wall Street Rating
- Valuation Grade
- Growth Grade
- Profitability Grade
- Momentum Grade
- EPS Revisions Grade
- dividend yield
- earnings date
- price target
- rating changes

No Seeking Alpha credentials are requested, stored, or inferred from the workbook.

## Seeking Alpha AI Personal Import

Market Pulse also supports Tucker-provided Seeking Alpha AI output as local personal context. This is separate from structured Premium ratings and does not imply a live Seeking Alpha connection.

Supported user-provided inputs:

- pasted Ask Seeking Alpha answer text
- pasted Virtual Analyst Report text
- AI Summary Report text
- Earnings Call Insight text when Tucker manually provides it later
- local JSON records
- local `.txt`, `.md`, or saved `.html` files that can be parsed without cookies, sessions, or network calls

Normalized fields:

- `ticker` and `tickers`
- `sourceType`: `ask_seeking_alpha`, `virtual_analyst_report`, `summary_report`, `earnings_call_insight`, or `unknown`
- `sourceMode`: `pasted`, `imported_file`, `saved_html`, `sample`, `browser_assisted`, `stale`, or `error`
- optional `promptText`
- capped `responseText` and `normalizedExcerpt`
- extracted bullish points
- extracted bearish points
- extracted financial metrics
- extracted ratings mentioned in the text
- cited source labels
- `reportDate`, `importedAt`, and freshness status
- validation and redaction warnings

Safety behavior:

- The app rejects content that appears to include cookies, session tokens, authorization headers, API keys, passwords, or client secrets.
- Softer identifiers such as emails, auth query parameters, long opaque tokens, and account-like identifiers are redacted.
- Stored text is capped and source-labeled as local personal import data.
- Imported AI text is not treated as verified fact or a trade recommendation. It is decision-support context only.

The first version is intentionally manual. It does not store a Seeking Alpha username/password, browser cookies, hidden page state, or session tokens, and it does not perform unattended scraping.

## Future Backend Contract

The dashboard now calls these endpoints if a backend exists:

```http
POST /api/connectors/seeking-alpha/link
Content-Type: application/json

{
  "requestedFields": [
    "quant",
    "authorRating",
    "wallStreetRating",
    "value",
    "growth",
    "profitability",
    "momentum",
    "revisions",
    "revenueGrowth",
    "epsGrowth",
    "forwardPe",
    "nextEarnings",
    "dividendYield",
    "priceTarget",
    "ratingChanges"
  ]
}
```

Possible response:

```json
{
  "uploadUrl": "https://...",
  "instructions": "Upload your Seeking Alpha export."
}
```

For syncing normalized data:

```http
GET /api/connectors/seeking-alpha/ratings
```

Expected response:

```json
{
  "records": [
    {
      "ticker": "APP",
      "company": "AppLovin",
      "sector": "Software",
      "quant": 4.86,
      "authorRating": "Buy",
      "wallStreetRating": "Buy",
      "value": "B",
      "growth": "A",
      "profitability": "A+",
      "momentum": "A+",
      "revisions": "A",
      "revenueGrowth": 48,
      "epsGrowth": 303,
      "forwardPe": 28,
      "dividendYield": 0.003,
      "priceTarget": 410,
      "ratingChanges": "Quant upgraded",
      "nextEarnings": "2026-08-06",
      "updatedAt": "2026-05-21"
    }
  ]
}
```

The frontend normalizes this through `src/seekingAlphaConnector.js`.

## Implementation Paths

### Path 1: Export Upload

1. Tucker exports/downloads a Seeking Alpha portfolio or ratings workbook.
2. Dashboard accepts `.xlsx` or `.csv` locally today; a backend can accept the same upload later.
3. Parser reads workbook rows and maps export headers into canonical fields.
4. Backend normalizes supported Premium fields.
5. Dashboard syncs normalized rows.

This is the safest near-term path because Tucker controls the export and no credentials are stored.

### Path 2: Licensed Data Integration

1. Confirm Seeking Alpha provides or approves a data integration for the requested fields.
2. Store API credentials server-side only.
3. Refresh data on a schedule.
4. Preserve source timestamps and entitlement boundaries.
5. Surface stale-data and sync-error states in the dashboard.

## Insight Layer

The dashboard now turns imported Premium-style records into:

- Elite Quant support count.
- Strong growth signal count.
- Positive revisions count.
- Valuation risk count.

Next step: add per-ticker detail drawers showing factor grades, rating disagreements, stale-data warnings, and "why this pick" reasoning.

Seeking Alpha AI personal imports are not yet included in Alpha Engine ranking. Future work can use these records as a labeled context source after the score model explains freshness, source mode, and parser confidence.
