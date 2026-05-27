# Market Pulse

Market Pulse is a static, browser-based portfolio command center for comparing short-to-mid-term high-growth equity ideas. It combines imported portfolio positions, Seeking Alpha-style ratings, growth metrics, momentum, valuation pressure, revisions, target allocation, thesis notes, and upcoming catalysts into a transparent decision-support workflow. Ticker pages now include a Seeking Alpha-style factor snapshot and a Buffett-style long-term owner checklist that highlights business quality, valuation discipline, risk, missing owner-earnings data, and margin-of-safety evidence without inventing intrinsic value.

The dashboard is local-first by default. CSV/JSON imports are parsed locally, previewed before portfolio changes are applied, saved to `localStorage`, and can be exported as a ranked CSV for further review. `npm run dev` starts the safe local backend/proxy so API keys stay in local `.env` and never enter browser JavaScript.

## Quick Start

1. Start the safe local server from this folder:

   ```bash
   npm run dev
   ```

2. Open the URL printed by the server, usually `http://127.0.0.1:4174`. If that port is already busy, the local server automatically tries the next available port and prints it.
3. Use **Sample data** to restore the starter watchlist.
4. Start on **Overview** for the one-page command brief: portfolio value, daily move, top movers, concentration warnings, recent alerts, market intelligence snapshot, and data connection status.
5. Import portfolio or ratings files from **Imports**:
   - Fidelity or brokerage positions CSV/JSON
   - Seeking Alpha ratings CSV or XLSX export
6. Adjust the dashboard controls:
   - Search ticker or company
   - Time horizon: Swing, Quarter, or Year
   - Minimum signal score
   - Sector
   - Portfolio lens
7. Use **Alpha Engine** for compact signal cards; expand a card only when you want evidence, counterarguments, missing data, and scoring detail.
8. Click table headers to sort the ranked stock list.
9. Use **Export picks** to download the filtered and ranked table as `growth-signal-picks.csv`.
10. Use the **Research tape** to jump straight from the header into high-signal ticker pages.
11. Use **Risk** to inspect concentration, overlap, stress tests, and data quality.
12. Use **Targets** to compare current holdings against target weights.
13. Use **Thesis Tracker** to edit the reason, risks, triggers, and review date for each major holding.
14. Use **Decision Journal** to record buy, sell, hold, trim, add, watch, and reject decision notes. These notes stay local and do not place trades.
15. Use **Local state backup** to export or restore holdings, events, connector status, thesis profiles, watchlist ideas, and decision journal entries as JSON.

For Fidelity holdings, use the **Fidelity Integration** assistant on **Imports**. The supported paths are local CSV/JSON import, pasted position rows with preview-before-apply, or Plaid Investments linking through the local backend when `PLAID_CLIENT_ID` and `PLAID_SECRET` are configured in `.env`. Direct Fidelity usernames/passwords are never collected by Market Pulse.

For Seeking Alpha Premium, use the **Seeking Alpha Premium** panel. You can import a CSV or a user-exported `.xlsx` workbook. **Sample Premium insights** shows how Quant Ratings, factor grades, revisions, and valuation risk can enrich the dashboard. **Connect SA** and **Sync ratings** are wired to the authorized export/licensed-data contract in `docs/seeking-alpha-connector.md`.

The app uses browser ES modules, so serving it over local HTTP is more reliable than opening `index.html` directly through `file://`.
No build step, package install, or API key is required for the default sample/local mode.

## Local Scripts

```bash
npm run dev
npm run dev:api
npm run lint
npm run validate:data
npm run test
npm run smoke
npm run check
```

These scripts use only built-in local tooling. No global install is required.

Use `npm run dev` for the dashboard and local backend/proxy contract at the same URL. `npm run dev:api` is retained as the same safe local server alias. The local server denies `.env`, `.git`, dotfiles, secret-like filenames, and reports setup status without returning API key values.

Market data uses sample mode unless a server-side provider key is configured. Reddit ticker tracking uses sample/local JSON mode unless `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT`, and `REDDIT_LIVE_ENABLED=true` are set in local `.env`; that optional sync fetches recent subreddit posts/comments through `/api/reddit/mentions`, removes live usernames, and never exposes Reddit secrets to browser JavaScript. Federal disclosure / politician trade data uses sample/local import mode unless `POLITICIAN_TRADES_PROVIDER=senate-stock-watcher` and `POLITICIAN_TRADES_LIVE_ENABLED=true` are set in local `.env`; that optional sync fetches a public static dataset through `/api/politician-trades`, not from browser JavaScript. X/Twitter tracking uses sample/local mode unless `X_BEARER_TOKEN` and `X_LIVE_ENABLED=true` are set in local `.env`; that optional sync fetches official X recent-search rows through `/api/x/updates`, stores no usernames, never exposes bearer tokens to browser JavaScript, and must not scrape X pages, cookies, sessions, or timelines.

### Finnhub Market Data

Finnhub is the first live quote/profile/metric/history provider. It is optional; without a key the app stays in Sample market-data mode and still supports imports, Daily Command Brief, Risk, Alpha Engine, and ticker pages.

1. Create a local `.env` next to `package.json`.
2. Add only local placeholders or your real local key:

   ```bash
   MARKET_DATA_PROVIDER=finnhub
   FINNHUB_API_KEY=your_finnhub_api_key_here
   ```

3. Start with `npm run dev`.
4. Open **Data Sources** and check Market data. It should show Live, Cached, Stale, Error, or Not configured without ever showing the key value.
5. Use **Refresh market data** from the app when available. Provider calls go through the local backend; browser JavaScript never receives the Finnhub key.

Some Finnhub plans restrict historical candle access. When that happens, quote/profile/metric data can still show as Live while price charts or historical-return sections show missing history.

Foundation docs:

- `docs/safety-model.md`
- `docs/schemas.md`
- `docs/market-intelligence-adapters.md`
- `docs/reddit-signal-provider.md`
- `docs/politician-trade-ingestion.md`
- `docs/x-provider-setup.md`
- `PROJECT_PLAN.md`

## Data Storage

Imported portfolio rows are previewed first, then applied only after confirmation. Same-account duplicate ticker rows are merged, while the same ticker in different accounts is preserved. Applied rows are stored in browser `localStorage` under `growthDashboardHoldings`. Data remains on the local machine unless the user exports or shares a CSV or JSON backup.

Portfolio holdings, market events, Alpha Engine events, connector status, alert lifecycle state, thesis profiles, watchlist ideas, and decision journal entries are also stored locally. Thesis profile overrides live under `growthDashboardThesisProfiles` and feed both rebalancing targets and thesis-impact scoring. Decision Journal entries live under `growthDashboardDecisionJournal` and are personal review notes, not brokerage execution records.

The **Export state JSON** action creates a local backup with holdings, market intelligence events, Alpha Engine events, connector status, alert reviewed/hidden state, thesis profiles, watchlist ideas, and decision journal entries. It does not include passwords or API keys, but it should still be treated as sensitive because it contains financial holdings and personal investing notes.

To reset the app, click **Sample data** or clear the site data for the page in the browser.

## Portfolio Import Format

The Fidelity Integration assistant accepts drag-and-drop CSV, file picker CSV/JSON, or pasted position rows. The portfolio importer accepts comma-separated, tab-delimited, or semicolon-delimited CSV with a header row and local holdings JSON files with a top-level array, a `holdings`, `positions`, `records`, `rows`, or `data` array, or `accounts[].positions[]` account-shaped payloads. Header names are normalized by lowercasing and removing punctuation, so `Current Value`, `current_value`, and `currentValue` resolve similarly where supported. After each import, the dashboard shows a preview plus detected columns, row counts, skipped/rejected rows, missing fields, mapping used, duplicate merges, tickers detected, accounts detected, and total imported market value.

Portfolio imports do not overwrite current holdings until you click **Apply import**. **Cancel preview** leaves the dashboard unchanged.

Health states:

- `Success`: all detected holding rows imported.
- `Imported with skipped non-holding rows`: real holdings imported and harmless Fidelity footer, disclaimer, total, or account-container rows were skipped.
- `Import needs row review`: the file contains holding-like rows with validation problems. Harmless Fidelity footer rows can be skipped, but malformed holding rows must be fixed or remapped before the preview can be applied.
- `Failed`: no holdings were imported.
- `Needs manual mapping`: no importable ticker column was detected; use the manual mapping fallback.

### Core Fields

| Field | Accepted headers | Notes |
| --- | --- | --- |
| Ticker | `ticker`, `symbol`, `tickerCusip`, `securitySymbol`, `securityId`, `securityIdCusip`, `CUSIP`, ticker-like `security` | Preferred for live quote matching. Converted to uppercase. If a Fidelity export only provides CUSIP-like identifiers, parenthetical symbols in descriptions such as `MICRON TECHNOLOGY INC (MU)` are preferred. Symbol-less Fidelity rows with real value can still be imported with a local identifier so portfolio totals stay complete. |
| Company | `company`, `name`, `security`, `description`, `securityDescription`, `securityDescriptionIssuer`, `investmentDescription` | Falls back to ticker when missing. |
| Account | `account`, `acct`, `acctName`, `accountName`, `accountNumber`, `registration` | Same ticker in multiple accounts is preserved. Same ticker in the same account is merged. Account-number-only labels are masked to the last four digits. |
| Account type | `accountType`, `acctType`, `registrationType`, `typeOfAccount` | Optional; useful for retirement/taxable review. |
| Sector | `sector`, `sectorName` | Falls back to inferred/unknown. |
| Shares | `shares`, `quantity`, `quantityShares`, `qty`, `units`, `unitsHeld`, `sharesHeld` | Used to identify owned positions and calculate exposure. |
| Price | `price`, `lastPrice`, `currentPrice`, `marketPrice`, `pricePerShare`, `unitPrice`, `unitPriceUSD`, `currentPriceUSD`, `lastClose` | Used with shares to calculate position value. If missing but quantity and current value are present, price is inferred as current value divided by quantity. |
| Market value | `marketValue`, `currentValue`, `currentValueUSD`, `currentMarketValue`, `currentValueDollars`, `totalValue`, `positionValue`, `value`, `valueUSD` | Preferred for account totals and portfolio weights. |
| Cost basis | `costBasis`, `costBasisUSD`, `totalCostBasis`, `costBasisTotal`, `averageCost`, `averageCostBasis`, `costBasisPerShare`, `avgCost`, `basis`, `totalBasis` | Stored for gain/loss and risk analysis. Average-cost and per-share cost-basis fields are converted to total cost basis using quantity. |
| Gain/loss | `gainLoss`, `gain/loss`, `gainLossDollar`, `unrealizedGainLoss`, `totalGainLoss`, `today'sGain/LossDollar` | Optional. |
| % gain/loss | `% Gain/Loss`, `gainLossPercent`, `unrealizedGainLossPercent` | Optional. |
| Next earnings | `nextEarnings`, `earningsDate` | Use `YYYY-MM-DD` when possible. |
| Thesis | `thesis`, `notes` | Displayed on top signal cards. |

### Signal Fields

| Field | Accepted headers | Expected value |
| --- | --- | --- |
| Revenue growth | `revenueGrowth`, `salesGrowth`, `revGrowth` | Percent as number, e.g. `48` or `48%`. |
| EPS growth | `epsGrowth`, `earningsGrowth` | Percent as number. |
| Momentum | `momentum`, `momentumGrade` | 0-100 score. Defaults to `60`. |
| Seeking Alpha quant | `quant`, `quantScore`, `saQuant` | 0-5 score. Defaults to `3.5`. |
| Growth score | `growth`, `growthScore` | 0-5 score. Defaults to `3.5`. |
| Revisions | `revisions`, `revision`, `epsRevisions` | 0-100 score. Defaults to `60`. |
| Forward P/E | `forwardPe`, `fwdPe`, `pe` | Numeric multiple. Defaults to `40`. |

Currency symbols, percent signs, plus signs, quoted thousands separators such as `"$1,045.00"`, common safe unquoted thousands separators, CRLF line endings, BOM-prefixed headers, long preamble/comment blocks before the header row, repeated section headers, section-style account labels, quoted multi-line descriptions, and parenthesized negatives such as `($250.00)` are supported. Rows with ambiguous extra unquoted comma cells are rejected with a column-count warning rather than silently shifting money columns. Negative quantities, prices, or market values are held for review until short-position support is intentionally added. Fidelity account totals, disclaimer/footer rows, and account-container rows are shown as **skipped non-holding rows** when real holdings import successfully. Fidelity plan funds or other valued rows with blank symbols are imported with local identifiers and marked as excluded from live market-data refresh until a ticker is supplied. Rows that look like positions but are missing quantity/value or valid numbers are shown as **rows needing review**. Accepted holdings can still be applied, and unresolved rows remain visible in the import diagnostics until fixed or remapped.

If automatic mapping fails, open **Map columns** in the import report and map the file's columns to ticker, account, shares, price, market value, cost basis, and description. This is the safest way to handle brokerage exports with unusual headers such as `Acct`, `Holding`, `Units`, or `Value`.

### Minimal CSV Example

```csv
ticker,company,sector,shares,price,revenueGrowth,epsGrowth,momentum,quant,growth,revisions,forwardPe,nextEarnings,thesis
NVDA,NVIDIA,Semiconductors,18,1014,126,285,88,4.92,4.98,94,34,2026-05-28,AI infrastructure leader with strong revisions
APP,AppLovin,Software,0,337,48,303,93,4.86,4.73,91,28,2026-08-06,Ad-tech execution and margin expansion
```

### Brokerage CSV Example

```csv
Account,Symbol,Description,Quantity,Current Price,Market Value,Total Cost Basis
Taxable,MU,Micron Technology Inc,12,104.50,1254.00,900.00
Roth IRA,MU,Micron Technology Inc,5,104.50,522.50,500.00
HSA,NVDA,NVIDIA Corp,2,950.00,1900.00,1200.00
```

### Holdings JSON Example

```json
{
  "holdings": [
    {
      "account": { "name": "Taxable Brokerage", "type": "Taxable" },
      "symbol": "AMD",
      "security": { "description": "Advanced Micro Devices" },
      "quantity": "6",
      "currentPrice": "180.00",
      "marketValue": "1080.00",
      "costBasis": "900.00",
      "sector": "Semiconductors"
    }
  ]
}
```

Troubleshooting:

- If holdings imported is zero, check the debug report for missing ticker mapping.
- If total value is zero, map `Market Value` or both `Shares` and `Price`.
- If a row with a value like `$1,045.00` is rejected for a column-count mismatch, export with quoted CSV values or remove thousands separators before import.
- If rows are rejected, the report lists concrete reasons such as missing ticker, missing quantity, missing market value, invalid number format, unsupported/unmapped column, or duplicate/ambiguous mapping.
- If negative quantities appear, review whether the export represents a short position or bad row. Market Pulse does not silently import negative positions yet.
- If duplicate tickers appear in different accounts, keep an account column so the dashboard can preserve both rows.
- If duplicate ticker/account rows appear because a brokerage export lists lots separately, the dashboard merges shares, market value, cost basis, and gain/loss into one account-level holding and reports the merged rows.
- If duplicate ticker rows appear but no account column is mapped, the import report warns that rows may have been merged under `Unassigned`; add an account mapping if those lots came from different accounts.
- Do not commit personal CSV files or screenshots that reveal account holdings.

### Seeking Alpha XLSX Import

The Seeking Alpha ratings input also accepts `.xlsx` workbooks exported by Tucker. The importer reads the first worksheet and normalizes common Premium export columns including ticker, company, Quant Rating, SA Author Rating, Wall Street Rating, Valuation, Growth, Profitability, Momentum, EPS Revisions, dividend yield, earnings date, price target, and rating changes.

## Security Notes

### Fidelity

- Do not enter or store Fidelity usernames, passwords, MFA codes, cookies, session tokens, or account recovery details in this app.
- Use Fidelity CSV exports as the safest fallback.
- Plaid Investments linking is now available through the local backend when `PLAID_CLIENT_ID`, `PLAID_SECRET`, and `PLAID_ENV` are configured in `.env`. Plaid handles Fidelity authorization; Market Pulse exchanges tokens and fetches holdings server-side.
- Plaid access tokens stay out of browser JavaScript and are stored only in the gitignored local backend token file. This is personal local storage, not a production multi-user vault.
- See `docs/fidelity-live-connector.md` for the Plaid flow, endpoints, and retention notes.
- Treat imported position data as sensitive financial data. Do not commit personal CSV files, exported picks, or screenshots that reveal account holdings.
- Any production connector should include explicit consent, least-privilege scopes, token encryption, revocation, audit logging, and a clear data retention policy.

### Seeking Alpha

- Do not scrape, cache, redistribute, or expose premium Seeking Alpha content in ways that violate account terms or licensing.
- Use user-exported ratings/watchlist data for the current MVP.
- Future integrations should use licensed data routes, documented exports, or user-authorized import flows.
- Keep premium metrics behind the user's account entitlements. The dashboard should store only the minimum derived fields needed for ranking.
- See `docs/seeking-alpha-connector.md` for the frontend/backend contract now scaffolded in this prototype.

### Investment Disclaimer

This dashboard is an investment research aid, not financial advice. Scores are heuristic comparisons meant to help prioritize further review. Users remain responsible for validating data, position sizing, taxes, suitability, and trade decisions.

## Product Roadmap

### MVP

- Static single-page dashboard.
- Starter high-growth watchlist.
- Tucker-style portfolio demo data with UPRO, VGT, MU, SOXL, CRDO, NVDA, AMD, retirement accounts, taxable account, HSA, and high AI/semiconductor exposure.
- Portfolio overview with accounts, asset classes, sectors, strategy sleeves, risk analytics, attention alerts, holdings command table, and data quality checks.
- Alpha Engine demo mode for thesis impact, mechanism/materiality, price-action confirmation, evidence quality, and actionability.
- Today's Portfolio Intelligence brief for top signals, top risks, monitor items, thesis impacts, ignore/log recommendations, and stale data warnings.
- Target allocation and rebalance planning with new-contribution, taxable-safe, retirement/HSA-only, and full model modes.
- Strategy sleeve summaries for core index, leveraged growth, AI/semiconductor, conviction, hedge, cash, and speculative exposure.
- Editable local thesis profiles for why Tucker owns a position, assumptions, risks, thesis-breaking conditions, triggers, target allocation, confidence, catalyst, stop-review trigger, and review date.
- Local JSON state export/import for holdings, thesis profiles, demo events, and connector status.
- CSV imports for brokerage positions and Seeking Alpha-style ratings.
- Seeking Alpha `.xlsx` export import for Premium portfolio/ratings workbooks.
- Fidelity Integration assistant with drag-and-drop CSV, holdings JSON, pasted table text, preview-before-apply, row diagnostics, and Plaid Investments account linking through the local backend.
- Plaid/SnapTrade provider normalization for holdings, accounts, cash-like positions, account type, asset class, timestamps, and cost basis.
- Local backend/proxy scaffold with `/api/health`, `/api/config`, Plaid Fidelity Link/exchange/holdings/unlink endpoints, setup-needed responses for unconfigured connectors, and market-event demo fallback.
- Demo-safe market intelligence adapter contracts with provider readiness, missing-key warnings, and canonical signal normalization.
- Finnhub live market data through the local backend only; mock market data remains the fallback when no key is configured. Financial Modeling Prep remains available as an explicit fallback provider.
- Config-gated public static politician-trade disclosure sync through the local backend; local CSV/JSON import and mock rows remain the default fallback.
- Frontend provider-readiness display plus local reviewed/hidden alert persistence.
- Seeking Alpha Premium connector panel with backend-ready link/sync actions, demo Premium ratings, and insight summaries.
- Local ticker-based merge.
- Signal scoring by horizon.
- Search, sector, score, and portfolio-lens filters.
- Ranked table, signal chart, top idea cards, and CSV export.
- Read-only What-If Simulator for modeling adds, trims, removals, and target rebalances against current holdings without mutating the portfolio.
- Ticker-page “Why Is This Moving?” explainer that uses structured price, volume, peer, Reddit, politician-disclosure, event, alert, and journal context without inventing news causation.

### Near-Term Enhancements

- Provide sample downloadable CSV templates.
- Add saved watchlists beyond a single localStorage dataset.
- Add explainable score breakdown per ticker.
- Add portfolio allocation views by sector and conviction.
- Add stale-data warnings for old ratings, prices, and earnings dates.
- Add real event-provider adapters behind a backend/proxy.
- Add hidden/reviewed alert persistence and richer dashboard settings export.

### Connector Phase

- Local backend/proxy for broker connector through an approved aggregation provider.
- Provider-specific live calls after Tucker approves provider credentials, scopes, and data retention.
- Production-grade encrypted token storage and audit logging for Plaid/SnapTrade brokerage connectors.
- Backend implementation for `/api/connectors/seeking-alpha/link` and `/api/connectors/seeking-alpha/ratings`.
- Backend upload flow for user-exported Seeking Alpha workbooks.
- Expand licensed market data and ratings connectors after the first FMP quote/profile/history slice.
- Server-side encrypted token storage.
- User account model with explicit permissions and revocation.
- Background refresh jobs with sync status and error handling.
- Connector health dashboard for expired tokens, missing scopes, and stale feeds.

### Production Phase

- Authenticated multi-device web app.
- Secure backend API and database.
- Audit trail for imports, exports, connector refreshes, and score changes.
- Model versioning for signal weights.
- Future apply/review workflow for simulated portfolio scenarios if Tucker explicitly wants modeled changes promoted into local plans.
- Alerts for catalyst dates, score changes, and position drift.

## Testing Checklist

Use this checklist before handing off a build or changing dashboard behavior.

### Smoke Tests

- Open `index.html` directly in Chrome, Safari, or Firefox.
- Confirm the starter watchlist renders without console errors.
- Confirm the four metric cards populate.
- Confirm the signal chart renders and resizes.
- Confirm table rows appear and top cards match the filtered set.

### Controls

- Search by ticker and company.
- Switch all three horizons and confirm scores/rankings update.
- Move the minimum score slider and confirm label, metrics, table, chart, and cards update.
- Filter by each available sector.
- Test all portfolio lenses: All ideas, Owned in Fidelity, New ideas only, Underweight winners.
- Click each sortable table header and confirm order toggles.

### CSV Import

- Import a minimal valid CSV with `ticker` and a few signal fields.
- Import a Fidelity-style file using `symbol`, `quantity`, `lastPrice`, and `averageCost`.
- Import a messy brokerage CSV with preamble rows, quoted commas, duplicate lots, account totals, cash-like rows, CRLF line endings, and footer/disclaimer rows.
- Import a local holdings JSON file with nested account/security objects.
- Import a Seeking Alpha-style file using `quantScore`, `growthScore`, and `epsRevisions`.
- Import a Seeking Alpha `.xlsx` workbook using Premium-style columns such as `Quant Rating`, `Valuation Grade`, `Growth Grade`, and `EPS Revisions Grade`.
- Confirm imported tickers merge into existing rows by ticker.
- Confirm new tickers appear with sensible defaults.
- Confirm quoted cells with commas parse correctly.
- Confirm import preview appears before portfolio holdings are applied.
- Confirm same-account duplicate lots merge while multi-account positions stay separate.
- Confirm malformed or missing ticker rows do not break rendering.

### Persistence And Export

- Reload the page and confirm imported data persists.
- Click **Sample data** and confirm the starter list replaces imported rows.
- Export picks and confirm the downloaded CSV contains ranked filtered rows.
- Confirm exported fields include rank, ticker, company, sector, score, growth fields, momentum, quant, forward P/E, position value, next earnings, and thesis.

### Security And Privacy

- Confirm no credentials are requested anywhere in the UI.
- Confirm imported data stays in browser `localStorage`.
- Confirm browser code makes no direct provider calls and sends no API keys; optional live-provider calls go through the local backend only.
- Confirm connector buttons surface setup-needed messages when no backend exists.
- Confirm Seeking Alpha Sample Premium insights updates scores, top cards, and insight summary text.
- Confirm Alpha Engine shows Samsung strike -> MU as a second-order thesis-supporting signal with counterarguments and missing evidence.
- Confirm Rebalance mode changes suggestions across new-contribution, taxable-safe, retirement/HSA-only, and full modes.
- Confirm Thesis Tracker can save a thesis profile and mark it reviewed today.
- Confirm Local state backup exports JSON and can restore a previously exported file.
- Run `npm run check` and `npm run smoke`.
- Confirm personal CSV files and exported results are not committed.
- Review connector-related copy for Fidelity and Seeking Alpha compliance before adding live integrations.

## Known Limitations

- Pricing, ratings, and earnings dates are only as current as the imported CSV.
- There is no server-side authentication, encryption, or backup in the static MVP.
- Scoring is heuristic and should be reviewed before any investment use.
- Browser `localStorage` is device- and browser-specific.
