# Product Spec: Growth Signal Dashboard

## Overview

Growth Signal Dashboard helps self-directed investors compare high-growth stock ideas through a transparent scoring model. The MVP is a local-first dashboard that imports CSV data, merges rows by ticker, and ranks candidates by growth, momentum, valuation, revisions, Seeking Alpha-style ratings, portfolio overlap, and catalyst timing.

The product should feel like a research cockpit: fast to scan, easy to filter, and explicit about why an idea is ranked highly.

## Personas

### Self-Directed Growth Investor

- Maintains a watchlist of high-growth public equities.
- Uses brokerage exports and third-party research sites.
- Wants a repeatable way to compare candidates before doing deeper research.
- Cares about momentum, earnings catalysts, valuation pressure, and whether they already own the position.

### Portfolio Reviewer

- Reviews current holdings against new ideas.
- Wants to spot underweight winners, overexposed names, and candidates with near-term catalysts.
- Needs exports for notes, spreadsheets, or follow-up research.

### Future Power User

- Wants live portfolio sync and licensed research feeds.
- Expects secure connector flows, refresh status, score history, alerts, and explainable model changes.
- Needs confidence that broker credentials and premium research data are never mishandled.

## Core Workflows

### 1. Review Starter Watchlist

1. User opens `index.html`.
2. Dashboard loads sample high-growth stock data.
3. User scans metrics, ranked rows, signal chart, and top cards.
4. User switches horizon to see how swing, quarter, and year scoring differ.

### 2. Import Portfolio Positions

1. User exports positions from Fidelity as CSV.
2. User imports the file through the Fidelity positions input.
3. App normalizes supported headers such as `symbol`, `quantity`, `lastPrice`, and `averageCost`.
4. Rows merge by ticker.
5. Portfolio lens filters reveal owned names, new ideas, and underweight winners.

### 2A. Link Fidelity Holdings

1. User selects a provider such as Plaid Investments or SnapTrade.
2. User starts the Fidelity link flow.
3. Browser receives only a short-lived link token or hosted connection URL from the backend.
4. Provider handles the Fidelity authorization flow.
5. Backend stores encrypted provider tokens and exposes normalized holdings to the dashboard.
6. User syncs holdings and the dashboard merges them by ticker.

### 3. Import Ratings Or Research Data

1. User exports or prepares a Seeking Alpha-style ratings CSV.
2. User imports the file through the ratings input.
3. App normalizes supported headers such as `quantScore`, `growthScore`, `momentum`, and `epsRevisions`.
4. Signal scores update immediately.

### 3A. Use Seeking Alpha Premium Insights

1. User exports Premium portfolio/ratings data as `.xlsx` or `.csv`, or uses a licensed backend connector.
2. Dashboard normalizes Quant Rating, SA Author Rating, Sell-Side Rating, Value, Growth, Profitability, Momentum, and EPS Revisions.
3. Dashboard merges records by ticker.
4. Insight layer surfaces elite quant support, growth leaders, positive revisions, and valuation risks.
5. User reviews ranking changes and factor-driven explanations before making decisions.

### 4. Filter And Rank Ideas

1. User searches by ticker or company.
2. User sets minimum signal score.
3. User filters by sector and portfolio lens.
4. User sorts by signal, growth, momentum, quant, valuation, exposure, or catalyst date.
5. User reviews the top idea cards and score drivers.

### 5. Export Picks

1. User finalizes the filtered view.
2. User clicks **Export picks**.
3. App downloads `growth-signal-picks.csv`.
4. User can continue research in a spreadsheet, note-taking system, or brokerage workflow.

### 6. Review Targets And Theses

1. User reviews the Rebalance panel.
2. User switches between new-contribution, taxable-safe, retirement-only, and full rebalance modes.
3. Dashboard surfaces overweight, underweight, and leveraged ETF review prompts.
4. User opens Thesis Tracker and selects a holding.
5. User edits why the position is owned, bullish assumptions, key risks, invalidation criteria, catalysts, target allocation, confidence, and review date.
6. Saved thesis profiles update local rebalancing targets and Alpha Engine thesis-impact scoring.

### 7. Export Or Restore Local State

1. User opens Data Sources And Safety.
2. User exports local state as JSON.
3. Dashboard writes holdings, market events, Alpha Engine events, thesis profiles, alert lifecycle state, and connector status into a local backup file.
4. User imports a backup and reviews a restore preview before anything is committed.
5. User can apply or cancel that restore without providing brokerage passwords or API keys.

## MVP Scope

The current MVP includes:

- Static browser app served from `index.html` with modular JavaScript in `src/`.
- Browser-only operation with no backend.
- Starter watchlist.
- Local CSV parsing with quoted cell support.
- Header normalization for common Fidelity and Seeking Alpha-style fields.
- Ticker-based merge behavior.
- `localStorage` persistence.
- Horizon-specific signal weighting.
- Search, score, sector, and portfolio-lens filters.
- Sortable ranked table.
- Metrics, signal chart, top idea cards, and connector roadmap notes.
- CSV export of the current filtered ranking.
- Portfolio overview with accounts, asset classes, sectors, strategy sleeves, risk analytics, attention alerts, holdings command table, and data quality checks.
- Alpha Engine demo mode for thesis impact, mechanism/materiality, price-action confirmation, evidence quality, and actionability.
- Rebalance planning with new-contribution, taxable-safe, retirement/HSA-only, and full modes.
- Editable thesis profiles stored locally and connected to target allocation and signal scoring.
- Local JSON export/import for holdings, events, connector state, and thesis profile backups.
- Local Seeking Alpha `.xlsx` workbook import for authorized Premium exports.
- Fidelity live-holdings connector UI with backend-ready link/sync actions and demo synced holdings.
- Plaid and SnapTrade holdings normalization into canonical dashboard holdings.
- Local backend/proxy scaffold for setup-safe connector endpoints and API key presence checks.
- Seeking Alpha Premium connector UI with backend-ready link/sync actions, demo Premium ratings, and insight summaries.
- Provider-readiness UI showing local/demo status, missing-key warnings, and demo-only live-provider state.
- Alert reviewed/hidden state stored locally and included in dashboard state backups.

## Scoring Model

The score is a 0-100 heuristic. It blends:

- Growth quality: revenue growth, EPS growth, and growth rating.
- Price momentum.
- Seeking Alpha-style quant score.
- Estimate revisions.
- Valuation support through forward P/E.
- Catalyst timing through next earnings date.
- Small ownership penalty for already large positions.

Weighting changes by horizon:

- Swing: prioritizes momentum.
- Quarter: balances growth, quant, momentum, and revisions.
- Year: prioritizes growth quality and valuation support.

The model must stay explainable. Any future changes should expose the model version, weight changes, and per-stock score breakdown.

## Future Connector Architecture

### Principles

- Never collect raw brokerage passwords in the app.
- Use OAuth, tokenized access, or aggregator-managed credential flows.
- Store the minimum data required for ranking.
- Encrypt tokens and sensitive financial data at rest.
- Make sync status, stale data, and connector errors visible.
- Support user-controlled disconnect, deletion, and data export.

### Proposed Layers

1. **Client dashboard**
   - Renders rankings, filters, score breakdowns, import status, and connector health.
   - Never handles long-lived secrets directly.

2. **Backend API**
   - Authenticates users.
   - Stores normalized holdings, watchlists, ratings, and score snapshots.
   - Provides import, export, scoring, and connector status endpoints.

3. **Connector service**
   - Integrates with approved brokerage aggregators for Fidelity data.
   - Integrates with licensed data routes or user-authorized exports for Seeking Alpha-style ratings.
   - Runs refresh jobs and emits structured sync events.
   - Provides `/api/connectors/fidelity/link` and `/api/connectors/fidelity/holdings`.
   - Provides `/api/connectors/seeking-alpha/link` and `/api/connectors/seeking-alpha/ratings`.

4. **Data normalization pipeline**
   - Maps provider-specific fields into the dashboard schema.
   - Preserves source timestamps.
   - Flags stale, missing, or conflicting fields.

5. **Security and compliance layer**
   - Token encryption and rotation.
   - Audit logs for imports, exports, syncs, and permission changes.
   - Data retention and deletion controls.
   - Terms and entitlement checks for premium research data.

### Connector Roadmap

- Phase 1: CSV-only import with templates and validation.
- Phase 2: Manual account-aggregator prototype in a test environment using the frontend connector contract.
- Phase 3: Production connector with user auth, encrypted tokens, and sync status.
- Phase 4: Licensed ratings or market-data connector.
- Phase 4A: Seeking Alpha export workbook parser and Premium insight drawer.
- Phase 5: Alerts, score history, and multi-device saved watchlists.

## Rebalance And Thesis Architecture

The rebalancing layer reads canonical holdings and local thesis-profile overrides. It does not place trades. It calculates current weight, target weight, dollar drift, suggested review actions, and sleeve drift.

The thesis layer stores manual profiles in `localStorage`. Profiles include why Tucker owns the holding, bullish assumptions, risks, thesis-breaking conditions, review triggers, target allocation, confidence, catalyst, stop-review trigger, and last reviewed date. These fields support two product goals: better target allocation discipline and cleaner Alpha Engine classification when new events arrive.

The local backup layer serializes dashboard state to JSON. It deliberately excludes passwords and API keys, validates backups before restore, and shows a change preview before writing restored data to localStorage. Backup files still contain holdings and should be treated as sensitive financial records.

Settings mirrors the Data Sources truth model for provider setup. It shows whether market data, OpenAI explanations, Plaid/Fidelity, Reddit, X/social, federal disclosures, and Seeking Alpha imports are Live, Imported, Cached, Stale, Error, or Not configured; it also shows key-presence state, last successful use, last visible error, and setup-document links without exposing secret values.

Canonical schemas are documented in `docs/schemas.md`. Safety rules are documented in `docs/safety-model.md`.

## Non-Goals

- No trade execution.
- No personalized financial advice.
- No tax advice, suitability analysis, or fiduciary workflow.
- No storage of Fidelity credentials.
- No scraping or unauthorized redistribution of Seeking Alpha premium content.
- No promise that scores predict returns.
- No real-time quote system in the static MVP.
- No multi-user collaboration in the MVP.
- No production backend, account system, or cloud sync in the MVP.

## Acceptance Criteria

- A user can run the MVP through a local static server with no build step.
- A user can import supported CSV files without credentials.
- A user can see the Fidelity connector flow and test dashboard behavior with demo synced holdings.
- A user can see the Seeking Alpha connector flow and test Premium-style insights with demo ratings.
- Imported rows merge by ticker and persist after reload.
- Dashboard controls update metrics, table, chart, and cards consistently.
- Exported CSV reflects the current filtered ranking.
- Rebalance mode changes suggested review actions without executing trades.
- Saved thesis profile edits persist after reload and affect target allocations.
- Local state JSON can be exported and imported without credential fields.
- Security copy clearly discourages credential collection and unauthorized premium-content use.
- Documentation explains setup, CSV formats, roadmap, testing, personas, workflows, MVP scope, future architecture, and non-goals.

## Open Product Questions

- Which brokerage aggregator should be preferred for Fidelity account data?
- What licensed route, if any, is acceptable for Seeking Alpha-style ratings?
- Should the product support multiple named portfolios or only one active dataset?
- Should score weights be user-configurable or controlled by model versions?
- What minimum audit and retention requirements are needed before storing financial data server-side?
