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

The local dashboard accepts Tucker-controlled Seeking Alpha `.csv`, `.json`, and `.xlsx` portfolio/ratings exports. It also supports paste-from-table text for rows copied from a table Tucker is allowed to view. Every file or paste goes through a preview step before rating fields are applied to holdings.

The import flow shows:

- detected columns
- mapped fields
- accepted rating rows
- rejected rows with row-level reasons
- duplicate tickers, with deterministic latest-row replacement
- stale rating dates older than the local freshness threshold
- source mode: `Sample`, `Imported`, `Pasted`, `Stale`, `Error`, or `Not configured`

Imported or pasted Seeking Alpha data is never labeled `Live`. It is local decision-support context until a compliant licensed provider is approved later.

Supported workbook fields include:

- ticker
- company
- Quant Rating
- SA Author Rating
- Wall Street Rating
- SA Analysts Rating
- Valuation Grade
- Growth Grade
- Profitability Grade
- Momentum Grade
- EPS Revisions Grade
- Dividend Grade
- dividend yield
- earnings date
- price target
- rating changes
- rating date / updated at / as of

No Seeking Alpha credentials are requested, stored, or inferred from the workbook.

## Manual Import Instructions

1. Open `Imports`.
2. Choose a Seeking Alpha CSV/JSON/XLSX file, or paste a Premium-visible ratings table into the Seeking Alpha paste box.
3. Review the preview. Check accepted rows, rejected rows, duplicate ticker warnings, and stale rating dates.
4. Choose `Apply ratings` only when the preview looks right.
5. Open `Data Sources` to confirm the status says `Imported`, `Pasted`, or `Stale`, never `Live`.

If the parser cannot map a ticker column, open `Map columns` and manually select the matching Symbol/Ticker field before previewing again.

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
    "saAnalystsRating",
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
      "saAnalystsRating": "Buy",
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

1. Tucker exports/downloads a Seeking Alpha portfolio or ratings workbook, JSON, or table copy.
2. Dashboard accepts `.xlsx`, `.csv`, `.json`, and pasted table text locally today; a backend can accept the same upload later.
3. Parser reads rows and maps export headers into canonical fields.
4. Preview validates rows before applying any changes.
5. Dashboard enriches matching holdings with normalized local Premium fields.

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

## Browser-Assisted Recommendation

The safest practical "browser-assisted" workflow is still copy/paste or saved-file import. Bookmarklets and extensions are possible later, but they increase terms, maintenance, and credential-safety risk. Do not build unattended scraping, cookie reuse, or session-token storage. A future helper should only transform user-provided table text or a user-saved file into the same preview/apply workflow above.
