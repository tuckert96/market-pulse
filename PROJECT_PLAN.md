# Project Plan

Last updated: 2026-05-25
Lead: Codie
Human owner: Tucker
Team name: Dream Team
Latest checkpoint source: run `git log --oneline -5 -- Documents/Codex/2026-05-20/build-me-an-online-dashboard-that`
Latest completed product checkpoint before this plan: Meta-style product systems polish pass that tightened native navigation semantics, Daily Brief feed priority, source-state honesty, and import interaction flow, plus prior Steve-level command-center polish, Institutional Quant Lens v1.3 academic factor discipline, and real-data workflow repair.

## Resume Protocol

When usage resets or a new session starts:

1. Inspect repo state:

   ```bash
   pwd
   git status --short -- Documents/Codex/2026-05-20/build-me-an-online-dashboard-that
   git log --oneline -5 -- Documents/Codex/2026-05-20/build-me-an-online-dashboard-that
   ```

2. Read current planning and notes:

   ```bash
   sed -n '1,260p' PROJECT_PLAN.md
   test -f memory/2026-05-21.md && sed -n '1,260p' memory/2026-05-21.md || true
   ```

3. Identify completed vs pending work from this file and the latest commits.
4. Before making changes, summarize the intended next 3 steps to Tucker.
5. Continue from the latest checkpoint without redoing completed work.
6. Update `PROJECT_PLAN.md` after each meaningful checkpoint.

## Current Mission

Build Tucker's decision-quality portfolio dashboard that shows what changed, what matters, what is risky, and what actions are worth reviewing.

The product should cut through internet noise by connecting holdings, target allocation, thesis quality, market events, evidence quality, price action, and portfolio positioning. It must never collect brokerage passwords, scrape paywalled Seeking Alpha pages, scrape X/Twitter, hardcode API keys, or present uncertain signals as guaranteed predictions.

## Priority Order

1. P1 Market Drivers explainer for why the broader market and AI/tech are moving today.
2. Fidelity CSV import verification against Tucker's real exports.
3. Finnhub provider diagnostics and coverage visibility.
4. OpenAI-powered portfolio explanation endpoint with backend-only credentials and deterministic fallback.
5. AI thesis/risk summary panel.
6. Dashboard data freshness and source labels.
7. CI checks for import, provider fallback, and Alpha Engine ranking.
8. Broader automated UI/browser smoke coverage once browser automation is available.

## Active Phase

Active phase: Product trust, hierarchy, and real-data usability.

Active priority:

- Keep the dashboard feeling calm and executive: Overview and Daily Brief should show the next useful inspection path, while deeper workflows stay reachable without competing for attention.
- Keep Overview cards as native links with one obvious tap target so mouse, keyboard, and screen-reader behavior stay aligned.
- Keep the Daily Command Brief organized as a ranked attention feed first, with grouped queues available as supporting context.
- Keep primary navigation focused on the daily portfolio workflow, with secondary/advanced tools tucked into a quieter “More tools” area.
- Keep technical/provider details collapsed by default unless Tucker is actively diagnosing a connection or import issue.
- Make imports feel decisive: after accepted holdings apply, refresh market data for the active portfolio and preserve row-level diagnostics for anything that needs review.
- Keep import previews focused on validation; ticker links should activate after holdings are applied, not while Tucker is still deciding whether the file mapped correctly.
- Keep copy honest and source-aware: Imported, Live, Cached, Stale, Sample, Error, and Not configured should remain visually and textually distinct.
- Do not label provider readiness as Live until a successful provider data refresh confirms usable data; “configured” means a key/path exists, not that data has arrived.
- Keep the new Institutional Quant Lens separate from review-priority, recommendation-rank, alert-severity, and confluence scores.
- Use the Quant Lens to answer “does this look like a higher-quality stock setup?” with transparent factor weights, factor drivers, missing-data warnings, and source freshness labels.
- Never frame Quant Lens output as Goldman Sachs proprietary analysis, a return forecast, a price target, or a buy/sell/trade command.
- Continue using the real active portfolio and server-side Finnhub market data when available, while preserving Sample/Imported/Live/Cached/Stale/Error/Not configured labels.
- Keep Fidelity/brokerage CSV and holdings JSON import local-first, preview-before-apply, and safe for messy exports.
- Allow accepted holdings to apply when unresolved holding-like rows are clearly reported for review; never silently hide bad rows.
- Preserve account-level rows so the same ticker in multiple accounts remains visible while same ticker/account lots merge with a duplicate report.
- Make imported holdings the single source of truth for Daily Command Brief, Holdings, Risk, Alpha Engine recommendations, Alerts, ticker pages, What-If, and Data Sources.
- Keep default/sample research tickers and cash-like holdings out of live market-data quote requests when a real imported portfolio is active.
- Make Finnhub status visible enough to diagnose: selected provider, key-present yes/no, requested tickers, successes, missing quotes, cache/stale/error status, and last error.
- Keep no-cost market-data reliability bounded: Finnhub remains primary, optional fallback providers only run when explicitly configured locally and the primary provider returns no usable quotes, and Data Sources must show the provider-attempt chain.
- Preserve Sample mode and reset behavior without stale sample holdings leaking into imported portfolio screens.
- Keep the Portfolio Health Score compact and source-aware: it should summarize import trust, concentration, thesis coverage, target discipline, alert load, and market-data freshness, then route Tucker to the next review screen without becoming a new isolated data island or trade recommendation.
- P1 Market Drivers issue #7 is now the top implementation track: explain broader market and AI/tech moves separately using market-data proxies, source-labeled X/Reddit/news/event context, federal disclosure context, and active portfolio exposure. It must show missing data instead of invented causality and link Tucker to Daily Brief, Risk, Market Intelligence, Data Sources, or ticker pages for the next inspection.

Prior Week 5 stability context retained below for continuity:

- Verify the full daily decision workflow end to end: Daily Command Brief, Alerts, ticker signals, ticker pages, Watchlist / Ideas, Decision Journal, What-If Simulator, and Risk / Concentration should connect without implying brokerage execution or guaranteed recommendations.
- Keep sample/imported/live/cached/stale labels explicit on every workflow touched by Week 5.
- Tighten accessibility and mobile source-level coverage for the Week 5 screens until rendered browser automation is available again.
- Fix confusing or overstated review language found during QA instead of only documenting it.
- Keep ticker detail pages honest about “Why Is This Moving?”: the explainer may summarize observed price moves, volume context, peer/benchmark moves, Reddit acceleration, politician disclosures, upcoming events, alerts, and local journal/thesis notes, but it must not hallucinate news or claim causation from missing sources.
- Movement explanations must be deterministic template output from structured app data, with source/freshness labels and missing-data notes visible.
- If quote, volume, peer, social, disclosure, event, alert, or journal data is missing, the ticker page should say what is missing instead of filling the gap with speculation.
- Movement explainer copy must stay review-oriented: inspect, verify, and compare against thesis. No buy/sell commands, no forecast language, and no exact-price prediction claims.
- Keep the `#what-if` Portfolio What-If Simulator read-only. It can model add, trim-dollar, trim-percent, remove, and rebalance-to-target scenarios, but it must not mutate real holdings, imply brokerage execution, or describe modeled output as a trade recommendation.
- Scenario adds should use cash first by default and label any unfunded amount as outside contribution. Trims/removals should move proceeds to simulated cash.
- What-If output should compare before/after total value, cash, ticker weights, sector weights, top concentration, leveraged ETF notional exposure, concentration score, and local alerts triggered/resolved.
- Keep What-If warnings conservative and practical: insufficient cash, capped trims, missing saved targets, and sample-vs-imported source state should be visible without sounding like trading advice.
- Do not persist scenario controls to `localStorage` unless Tucker explicitly approves a future apply/save workflow.
- Keep the `#calendar` Earnings and Event Calendar workflow local-first: sample, imported CSV/JSON, manual custom, and derived holding/thesis/watchlist dates must be visibly source-labeled.
- Do not fake live earnings dates. Sample dates are workflow examples only, imported dates remain local/imported, and future live provider rows must come through a source-aware provider contract.
- Calendar rows should appear in Daily Command Brief, Market Intelligence, ticker detail pages, and the dedicated Calendar screen without implying trading recommendations.
- Keep event importance calm and practical: low, medium, and high mean review priority, not buy/sell/trim commands.
- Keep the `#journal` Decision Journal workflow local-first: entries should record ticker, date/time, decision type, thesis note, risk note, catalyst, conviction, and optional local signal score snapshot.
- Decision Journal entries are reasoning notes only. They must not imply brokerage execution, trade placement, order routing, or completed transactions.
- Keep ticker pages connected to recent journal entries so Tucker can see the thinking history for owned, watchlist-only, or signal-discovered tickers.
- Keep JSON backup/restore including journal entries without storing credentials, provider tokens, cookies, or brokerage account identifiers.
- Keep the `#risk` Risk / Concentration screen decision-grade: top 10 position weights, sector concentration, account concentration, leveraged ETF direct/notional exposure, AI/semi/memory theme exposure, individual stock vs ETF mix, cash exposure, and correlation/overlap analysis should all show clear status labels and practical review language.
- Keep the `#watchlist` Watchlist / Ideas workflow local-first: statuses should separate researching, watching, candidate, rejected, and owned rows; signal-derived rows should stay suggestions until Tucker saves them; owned rows should link back to holdings/thesis without mutating portfolio holdings.
- Keep ticker-signal promotion review-oriented: “Track idea” can add or update a local idea record, but it must not imply a buy/sell command.
- Keep watchlist filters useful: status, sector, signal source, conviction, and search should make the pipeline easier to scan without becoming another table dump.
- Keep threshold labels calm and useful: normal, elevated, high, extreme mean “review exposure in context,” not automatic buy/sell/trim commands.
- Keep cash separate from operating-sector risk. High cash should be framed as deployment/opportunity-cost review, not downside exposure.
- Keep the `#daily` Daily Command Brief as the first attention-prioritization workflow: portfolio move, top movers, target drift, current alerts, ticker signals, Reddit acceleration, politician disclosure matches, upcoming earnings, and source health grouped into Action needed, Watch closely, and Informational.
- Keep the brief deterministic, linked to ticker/deep screens, and explicit about imported/mock/cached/stale/live status. It must remain attention prioritization, not trading recommendations.
- Keep brokerage CSV/JSON imports preview-first, row-tolerant, and safe for messy Fidelity-style exports.
- Keep torture coverage for missing optional fields, unknown columns, quoted comma currency, percentage strings, blank rows, duplicate lots, lowercase tickers, invalid tickers, negative positions, malformed JSON, large portfolios, and stale persisted holdings.
- Reject unquoted comma currency row overflow with clear column-count mismatch errors instead of silently shifting money fields.
- Treat invalid tickers and negative quantity/price/market-value rows as needs-review holding rows, not harmless non-holding rows.
- Preserve duplicate merge reporting for same-account ticker lots while keeping multi-account positions separate.
- Warn when duplicate ticker rows are merged without an account column mapping.
- Keep the Financial Modeling Prep live quote adapter safe, cached, tested, and backend-only.
- Keep quote/profile/history freshness labels conservative: mixed cached/live resources should show cached, empty provider-error snapshots should show error, and stale fallback should never look live.
- Surface omitted provider tickers through `missingTickers` and warnings instead of fabricating quotes.
- Reuse prior successful stale cached quotes only when a provider omits or fails a refresh for a ticker that already has cache history.
- Keep politician trade disclosure data sample/local by default, with config-gated public static Senate Stock Watcher sync through the local backend only.
- Keep Reddit ticker tracking sample/local by default, with config-gated Reddit API sync through the local backend only when `REDDIT_LIVE_ENABLED=true`.
- Preserve clear sample/imported/live/cached/error/stale status labels.
- Missing credentials, whitespace-only credentials, disabled providers, local imports, sample rows, stale caches, and provider errors must render as distinct states instead of generic connected/ready states.
- Keep all provider credentials server-side and never expose API keys to browser JavaScript.
- Keep keyboard and mobile behavior polished: route changes should focus the active screen heading, repeated controls need contextual accessible names, file imports must remain keyboard-accessible, and mobile navigation/actions should not crowd the active screen.
- Preserve CSV import, Fidelity sample, Seeking Alpha import/sample, Reddit sample/local/API modes, politician trade sample/local/imported/public modes, Market Intelligence, ticker scoring, local alerts, and route accessibility.
- Keep ticker detail pages as context/intelligence pages only: quote/cache status, owned exposure, account exposure, historical chart, Reddit trend, politician activity, thesis/risk notes, alerts, and data-quality coverage. No trading recommendations.
- Keep Signal Review exploratory: current ticker signal scores, score components, available 1/5/20 trading-day forward returns, and missing-data warnings only. No validated-strategy or AI-prediction language.
- Keep local API static serving locked down: dotfiles, `.env`, `.git`, and secret-like filenames must not be served by `npm run dev` or `npm run dev:api`.
- Keep local startup resilient: if the default port is busy, the local server should fall forward to the next available local port and print the actual URL.
- Keep provider errors redacted before they enter response payloads or cache metadata.
- Keep ticker routes re-rendering selected ticker content on hash navigation and browser back/forward.
- Keep all major hash routes covered by the pure router tests and source-level smoke checks until rendered browser automation is available again.
- Keep imported/provider source URLs sanitized before they become clickable links.
- Do not add additional live APIs, scraping, production deployment, external notification delivery, or brokerage connectors beyond the approved local Plaid slice until Tucker approves the next slice.
- Next work should be approved explicitly and scoped to one provider or one local UX/settings improvement at a time.

## Completed Work

Current quantitative engine checkpoint:

- Audited current score stack with subagents: ticker confluence score, Alpha recommendation rank, Alpha event priority, portfolio risk scoring, alert thresholds, and the previously orphaned `src/scoringModel.js`.
- Promoted the existing factor-score spine into `institutional-quant-lens-v1`, a first-class 0-100 stock-quality lens.
- Added transparent factor weights: business quality, price momentum, estimate revisions, valuation discipline, risk control, liquidity/capacity, portfolio fit, and data quality.
- Added factor-level drivers, weighted points, strengths, weak/missing-data notes, confidence score, source freshness, and a caveat that the score is not a forecast or trade instruction.
- Wired the Quant Lens into combined ticker signals, Market Intelligence ticker cards, ticker detail pages, and Alpha recommendation supporting signals.
- Added `docs/quantitative-engine.md` and updated signal/data-contract docs so future work knows which score means “review priority” versus “stock-quality setup.”
- Added tests for bounded factor scoring, missing-data behavior, liquidity/capacity, risk-control penalties, ticker-signal integration, and Alpha recommendation support.
- Completed a four-track review hardening pass and upgraded the lens to `institutional-quant-lens-v1.3`, including the `academic-factor-discipline-v1` overlay for momentum, profitability quality, value discipline, risk control, validation discipline, and ensemble readiness.
- Added factor coverage labels (`covered`, `partial`, `thin`) so score explanations show whether each factor is well-supported or mostly missing-context output.
- Added evidence caps so thin-data tickers show a capped institutional score, cap reasons, and lower confidence instead of fake high precision.
- Refined the evidence-cap flag so the UI only says a score was capped when the raw weighted score was actually reduced, while still preserving cap reasons as data-quality warnings.
- Removed broad Seeking Alpha Quant score from the business-quality factor to reduce same-source double counting across quality, valuation, momentum, and revisions.
- Normalized daily move inputs so `2%`, `2`, and `0.02` all mean a 2% move in momentum scoring.
- Sorted dated historical price rows before return/range/drawdown calculations so descending provider payloads cannot invert trend analysis.
- Added fund/ETF-aware output: funds and leveraged ETFs use an Institutional Exposure Lens and labels such as “Leveraged exposure review” instead of operating-company “High-quality setup” labels.
- Added Quant Lens peer context that ranks operating companies only against comparable sector/industry names and keeps funds/leveraged ETFs in separate exposure groups.
- Added compact local Quant Lens score history so ticker pages and Market Intelligence can show whether a score is new, improving, stable, or deteriorating since the previous local snapshot.
- Scoped Quant Lens history by portfolio mode so sample and imported portfolios do not contaminate each other.
- Added docs, contracts, smoke coverage, and tests for peer ranks, small-peer warnings, compact score-history storage, backup/restore validation, and privacy guardrails.
- Upgraded the lens to `institutional-quant-lens-v1.3` and added `academic-factor-discipline-v1`, anchored to Gu/Kelly/Xiu, Jegadeesh/Titman, Asness/Moskowitz/Pedersen, Novy-Marx, and Harvey/Liu/Zhu.
- Added paper-backed diagnostics for momentum discipline, profitability/quality, value-plus-momentum balance, risk controls, validation discipline, and ML ensemble readiness.
- Added gross profits/assets support to the quality factor and skip-period momentum awareness to the momentum factor, with explicit fallback warnings when the app has only short price history.
- Added a factor-validation score so missing inputs, sample/stale data, weak history, and multiple-testing concerns reduce confidence instead of producing fake precision.
- Surfaced paper-backed factor checks in Alpha Engine holding analysis and ticker detail pages without replacing the existing no-trade-command guardrails.
- Repaired quant/Alpha docs and smoke coverage so academic factor discipline and no-fake-precision rules are explicit: scores are whole-number review aids, source/coverage/confidence warnings stay visible, and no score becomes an expected return, price target, probability, or trade instruction.
- Integrated the Quant Lens directly into Alpha Engine's holding-quality rank: Alpha now weights the capped Institutional Quant Lens plus academic factor discipline before thesis, source quality, support, price context, and risk penalties, while review priority remains a separate urgency score.

Current real-data workflow repair checkpoint:

- Reproduced Tucker's actual Fidelity CSV shape locally without printing sensitive holdings values.
- Confirmed parsing and column mapping were correct, but one symbol-less holding-like row caused the previous apply gate to block all accepted holdings.
- Changed the import preview/apply flow so accepted holdings can be applied while unresolved rows remain visible as rows needing review.
- Import diagnostics now surface accepted rows, rows needing review, skipped non-holding rows, detected columns, mapped fields, row-level reasons, and total imported value.
- Added clearer row-level language for Fidelity rows that look like positions but have no Symbol/ticker.
- Added a tested market-data ticker selector so real imported portfolios drive quote requests while cash-like rows and default sample tickers are filtered out.
- Verified local `.env` reports Finnhub configured through the backend without exposing the key, and tested quote responses for imported-style tickers through the local proxy.
- Data Sources now includes safe Finnhub diagnostics: provider selected, key present yes/no, requested tickers, successful/missing responses, cache status, truncation, and last error.
- Local backend quote responses include request truncation metadata and `.env` loading repairs whitespace shell credentials that would otherwise shadow the local key.
- Added Portfolio Health Score v1 as a compact command-center readout on Overview and Daily Brief. It uses existing local portfolio state, import diagnostics, risk analytics, thesis rows, target drift, visible alerts, and market-data status; sample/no-data states stay unscored and route to Imports.

Current Finnhub market data checkpoint:

- Finnhub is selected as the default live market-data provider path through `MARKET_DATA_PROVIDER=finnhub` and `FINNHUB_API_KEY`.
- The local backend proxy exposes provider readiness through `/api/config` and normalized quote snapshots through `/api/market-data/quotes`.
- The adapter fetches quote, company profile, basic metric, and historical candle data, then normalizes current price, daily move, percent move, open/high/low, previous close, market cap, sector/industry, 52-week high/low, volume, and historical closes.
- Quote/profile/metric/history resources are cached separately, with stale fallback and redacted provider errors.
- Plan-limited Finnhub historical candle access no longer marks the whole quote feed stale when quote/profile/metric calls are live; history/chart sections should show missing history instead.
- Data Sources includes a manual Refresh market data control and market-data status rows for Not configured, Live, Cached, Stale, Error, Rate limited, and Partial data states.
- Tests use mocked Finnhub responses only and assert that API key values are never serialized into browser-facing config or data payloads.
- Current provider decision: Finnhub remains the best free/personal realtime path for this dashboard because it maps cleanly to quote/profile/candle needs and can be safely cached behind the local backend. Twelve Data is the next free/personal backup to evaluate if Finnhub coverage or rate limits become a blocker. Polygon/Massive remains the paid upgrade path for exchange-grade, consolidated realtime market data. Alpha Vantage is not the preferred free realtime default because its U.S. realtime/delayed quote access is documented as premium.
- Future market-data work should add bounded Finnhub WebSocket support only through the local backend, with key redaction, symbol caps, cache/backoff, and Live/Cached/Stale/Error labels preserved. Do not stream directly from browser JavaScript with provider keys.

Current Risk screen layout repair checkpoint:

- Repaired the shared `risk-row` card layout so value/action columns no longer squeeze ticker and company labels into one-character columns.
- Risk rows now reserve a readable label column, keep ticker links and compact actions horizontal, give value/action areas a stable width, and allow row explanations to span the full card.
- Regression tests now guard against generic mini-list selectors, break-anywhere wrapping, and risk rows that can collapse labels beside metric/action columns.
- Desktop screenshot QA verified the Risk route no longer shows narrow-column layout failure in the visible route shell.

Current data-mode clarity checkpoint:

- Added `src/dataModes.js` as the canonical mapper from legacy/internal provider states to user-facing labels.
- Added a persistent app-shell data mode indicator for Portfolio and Market data.
- Standardized major UI copy and Data Sources status output to Sample, Imported, Live, Cached, Stale, Error, Not configured, and No data loaded.
- Removed vague demo/mock wording from primary product surfaces while preserving internal raw provider states for backwards-compatible tests and payload contracts.
- Updated docs, smoke checks, and unit tests to cover no data, sample, imported, live, cached, stale, error, and not-configured transitions.

Current active portfolio consistency checkpoint:

- Added `src/portfolioState.js` with explicit UI/source states: `NO_DATA`, `SAMPLE_MODE`, `IMPORTED_CLEAN`, `IMPORTED_WITH_SKIPPED_ROWS`, `IMPORTED_PARTIAL_REVIEW`, `STALE_PERSISTED_REPAIRED`, and `IMPORT_FAILED`.
- `render()` now builds one active portfolio status and passes it into the command center, Daily Brief, data-source health, and imported/sample gating.
- Partial imports with accepted holdings now remain active local portfolios while still showing row-review warnings.
- Repaired persisted holdings are labeled as local restored portfolios instead of silently falling back to sample-mode assumptions.
- CSV/JSON portfolio replacement and provider sync now clear reviewed/hidden alert state and market-data snapshots so stale alerts or quote context do not leak from a previous portfolio.
- Tokenized Fidelity/provider sync now replaces the active portfolio and writes a source report instead of merging into stale/sample holdings.
- Added a Settings control to clear local portfolio holdings while preserving watchlist, journal, settings, and provider placeholders.
- Ticker detail pages now distinguish owned, watchlist-only, signal-discovered, and not-owned tickers.
- Sample market data snapshots default their freshness clock to their own `asOf` timestamp so sample data does not age into stale/live-looking labels through wall-clock drift.
- Added tests for portfolio status states, imported CSV/JSON workflow propagation, sample/reset behavior, Daily Brief active repaired/partial states, ticker ownership distinctions, and smoke coverage for stale snapshot/alert invalidation.

Current Fidelity Plaid linking checkpoint:

- Added a local-backend Plaid Investments path for Fidelity: Link token creation, public-token exchange, holdings sync, and unlink all run under `/api/connectors/fidelity/*`.
- Plaid client secrets and access tokens stay out of browser JavaScript. The local backend stores the Plaid access token in `local-data/fidelity-plaid-session.json`, which is gitignored and denied by the static server.
- Imported Plaid holdings replace the active portfolio, write a portfolio import/source report, refresh market data, and flow into Daily Brief, Holdings, Risk, Alpha recommendations, alerts, ticker pages, and Data Sources.
- Plaid account labels are sanitized before records can reach UI/export state, so account numbers are masked.
- Data Sources distinguishes Plaid configured, linked Live, cached prior sync, CSV Imported, Sample, and Not configured states without trusting stale browser-only Plaid status.
- Tests cover server-side Link token creation, public-token exchange, holdings sync, unlink, cross-site request blocking, environment allowlisting, provider-error redaction, account-label masking, and static denial of local token files.

Current Dashboard / Daily Command Brief polish checkpoint:

- Promoted the Daily Command Brief into a first-class Overview snapshot with Action, Watch, and Info counts plus the first item Tucker should inspect.
- Reduced the Overview's equal-weight card sprawl by keeping portfolio value, Daily Brief, risk, alerts, market intelligence, and data health in the primary command grid.
- Moved planning and learning workflows such as Targets, What-If, Watchlist, Journal, and Alpha Engine into a quieter shortcut strip.
- Added group summaries and contextual CTA labels to Daily Brief queues so items scan faster than generic “Open” links.
- Kept mobile layout one-column for the command snapshot, Daily Brief counts, and secondary cards.
- Updated smoke/navigation coverage so only clearly useful digest cards are primary clickable cards while workflow routes remain reachable.

Current Week 6 UX heuristic polish checkpoint:

- Added concise What / Why / Next guidance to every major screen so each route explains what Tucker is seeing, why it matters, and where to inspect next.
- Tightened Overview and Daily Brief language so the home screen reads more like a command brief and less like an internal product map.
- Strengthened keyboard focus rings and preserved native link/button semantics for route and ticker navigation.
- Made the holdings table easier to scan by giving the large holdings table its own wider layout and sticky ticker column.
- Softened dense editor sections for Calendar, Journal, and Watchlist with calmer secondary-panel hierarchy.
- Made What-If controls context-aware so irrelevant amount/percent/target/funding inputs are hidden for the selected scenario type.
- Replaced execution-sounding labels such as “Recommended action” with review-oriented language such as “Suggested review.”
- Added explicit route links from ticker-page missing-context states to Thesis, Watchlist, and Calendar.
- Reduced Market Intelligence / Signal Review badge noise and shortened mock/source copy while keeping source labels honest.
- Updated source-action buttons to say “Try configured…” or “Start connector” so unavailable live paths do not look connected.

Current Week 5 QA and workflow pass:

- Added deterministic end-to-end workflow coverage for the local daily review loop: Daily Command Brief → alerts → ticker signals → MU ticker intelligence → watchlist promotion → decision journal entry → read-only What-If scenario → risk deltas.
- Verified generated workflow objects keep source labels explicit and avoid “buy now,” “sell now,” guaranteed, or order/execution language.
- Tightened review-only UI copy by changing several “Action” labels to “Review prompt” or “Next check.”
- Added contextual accessible labels to repeated journal, calendar, watchlist, ticker-page, and signal-promotion controls.
- Improved mobile source coverage for What-If grids so the simulator stacks cleanly on narrow screens.
- Corrected What-If risk delta tone so higher concentration/leverage/risk is not styled as a positive change.
- Made all What-If scenario result messages self-contained: add, trim, remove, and rebalance messages now say real holdings were not changed.
- Guarded empty-portfolio concentration analytics so top-5/top-10 weights are `0`, not `NaN`.

Known limitations after Week 5 QA:

- Rendered browser click-through automation was unavailable in this session, so route focus, mobile behavior, and workflow navigation are covered through deterministic module tests and source-level smoke checks.
- What-If scenarios remain read-only models; there is no apply/save scenario workflow.
- Ticker scores, Reddit, politician-disclosure rows, and mock events remain decision-support inputs, not predictions or recommendations.
- Live provider behavior still depends on local `.env` configuration and remains mocked in tests.

Week 6 recommendations:

- Run a human UX heuristic pass across all Week 5 screens once rendered browser automation is available.
- Do a copy/labeling pass to reduce any remaining internal wording and keep data-source states unmistakable.
- Deep-polish ticker detail pages and the Settings/Data Sources status model for daily use.
- Add browser-driven route and keyboard smoke tests when the in-app Browser is available again.

Current ticker movement explainer checkpoint:

- Added `src/movementExplainer.js` as a pure deterministic explainer for ticker-page movement context.
- Ticker pages now show a “Why Is This Moving?” section that summarizes observed quote/imported daily move, volume confirmation, peer/benchmark context, Reddit acceleration, politician disclosure activity, upcoming events, local alerts, journal notes, and linked read-throughs when those structured inputs exist.
- Missing quote, volume, peer, Reddit, disclosure, event, alert, or journal context is shown explicitly instead of being replaced with invented news.
- The explainer includes a confidence/context label and a limitation statement that it does not infer news causation or forecast future price moves.
- Tests and smoke checks cover deterministic output, missing-data behavior, stale/error data labeling, ticker-page model wiring, and no causal-news/prediction language.

Current What-If Simulator checkpoint:

- Added `src/whatIfSimulator.js` as a pure read-only simulation engine for add, trim-dollar, trim-percent, remove, and rebalance-to-target scenarios.
- Added a dedicated `#what-if` route, sidebar link, overview digest card, scenario builder, before/after summary, ticker/sector deltas, risk-change panel, and alerts-triggered/resolved panel.
- Scenario math reuses canonical holding normalization, portfolio analytics, target allocations, and local alert thresholds instead of creating a parallel portfolio model.
- Adds default to cash-first funding and label any unfunded amount as outside contribution; trims and removals move proceeds to simulated cash.
- Tests and smoke checks cover read-only behavior, cash funding, capped trims, removal, target rebalance, ticker/sector/risk deltas, route wiring, and no What-If localStorage key.

Current Earnings and Event Calendar checkpoint:

- Added `src/eventCalendar.js` with a source-aware `CalendarEvent` model, mock events, CSV/JSON import normalization, row validation, filtering, summaries, ticker lookup, and manual event CRUD helpers.
- Added a dedicated `#calendar` route, sidebar link, overview digest card, import/custom-event workflow, event filters, source labels, and calm low/medium/high importance badges.
- Daily Command Brief now consumes source-labeled calendar events and falls back to existing holding/thesis earnings dates only when a calendar payload is not supplied.
- Ticker detail pages now show upcoming events tied to the selected ticker, with explicit sample/imported/manual labels and “not live calendar data” copy where appropriate.
- Market Intelligence now includes an Earnings & Event Calendar panel so event read-throughs sit alongside ticker signals, Reddit, politician disclosures, and market events.
- Dashboard state JSON export/import and localStorage persistence include Event Calendar rows and the latest event import report.
- Local data contracts, fixture validation, schema docs, smoke checks, and unit tests cover calendar event normalization, import validation, filtering, sorting, summaries, Daily Brief promotion, ticker-page wiring, and route coverage.

Current Decision Journal checkpoint:

- Added `src/decisionJournal.js` with local journal normalization, creation/update/delete helpers, filtering, summaries, ticker lookup, default sample entries, and optional linked signal score snapshots.
- Added a dedicated `#journal` route, sidebar link, overview digest link, filtered global Decision Journal screen, and add/edit/delete form.
- Ticker detail pages now show recent journal entries and a `Log decision` action prefilled for the ticker.
- Dashboard state JSON export/import and localStorage persistence now include Decision Journal entries.
- Decision Journal language is explicitly local and review-oriented: entries do not place trades and are not brokerage execution records.
- Tests, smoke checks, and schema docs cover journal normalization, CRUD behavior, filtering, summary counts, ticker-page display wiring, and local backup shape.

Current Watchlist / Idea Pipeline checkpoint:

- Added `src/watchlistIdeas.js` with normalized idea states, field mapping, signal promotion, owned-holding linking, filtering, summaries, and local default ideas.
- Added a dedicated `#watchlist` route, sidebar navigation, overview digest link, summary metrics, filters, idea cards, and an add/edit form.
- Signal cards in Market Intelligence and Signal Review now expose review-oriented “Track idea” actions that save local idea records.
- Watchlist ideas persist in localStorage and dashboard state JSON exports/imports.
- Ticker detail pages show a watchlist/idea pipeline card when an idea exists or a helpful empty state when one does not.
- Local data contracts, fixtures, tests, and smoke checks now cover the expanded watchlist schema and workflow.

Current Risk / Concentration dashboard checkpoint:

- Added a decision-grade risk dashboard model with threshold-based status labels for top positions, sectors, accounts, themes, leveraged ETFs, asset mix, cash, and correlation/overlap analysis.
- Risk screen now shows top 10 position weights, sector concentration, account exposure, leveraged ETF notional exposure, AI/semiconductor and memory theme exposure, individual stock vs ETF exposure, cash exposure, measured pair correlations when history exists, and theme overlap fallback when it does not.
- Risk rows include calm explanations and route links to ticker pages, holdings, targets, or related detail screens.
- Cash is no longer treated like an operating sector in the risk dashboard; it is framed as a deployment/opportunity-cost decision.
- Leveraged inverse exposure is treated by magnitude for risk purposes so inverse leveraged ETFs do not reduce estimated exposure.
- Tests cover threshold labels, decision-dashboard sections, cash explanation, theme detection, leveraged exposure, and inverse leveraged ETF magnitude.

Current Daily Command Brief checkpoint:

- Added `src/dailyCommandBrief.js` as a pure, deterministic brief builder.
- Added focused `#daily` route, sidebar navigation, overview CTA, and Daily Brief screen.
- Daily Brief groups items into Action needed, Watch closely, and Informational.
- Brief inputs include imported holdings, portfolio daily value change, top movers, target drift, local alerts, ticker signal scores, Reddit mention acceleration, politician disclosure matches, upcoming earnings dates when present, portfolio data quality, and source health.
- Items link to ticker pages or deep screens such as Holdings, Targets, Alerts, Imports, Market Intelligence, and Data Sources.
- Missing history and mock/not-live data are labeled instead of being treated as live facts.
- Tests cover imported brief grouping, pre-import/sample honesty, missing-history/source labels, navigation route coverage, and smoke wiring.

Checkpoint `ecdc776 pre-full-access safety checkpoint`:

- Created safety checkpoint and backup branch before broader work.

Checkpoint `583e686 phase 1 portfolio alpha engine`:

- Canonical holding schema in `src/portfolioSchema.js`.
- Tucker-style sample holdings with UPRO, VGT, MU, SOXL, CRDO, NVDA, AMD, retirement accounts, taxable account, HSA, and high AI/semiconductor exposure.
- Portfolio overview with total value, daily change, unrealized gain/loss, cost basis, cash, account breakdown, asset-class breakdown, sector breakdown, sleeve breakdown, top holdings, risk contributors, leveraged ETF exposure, single-stock exposure, semiconductor/AI/mega-cap tech concentration.
- Holdings command table with allocation, drift, thesis status, risk level, Seeking Alpha-style factors, dividend yield, and next earnings date.
- Alert engine for concentration, leverage, target drift, weak ratings, stale/missing data, and market intelligence.
- Risk analytics with concentration score, top 5/top 10 weights, overlap exposure, beta estimate, and stress tests.
- Alpha Engine demo mode with thesis impact, business mechanism, materiality, confidence, evidence grade, price-action confirmation, actionability, counterarguments, and next review question.
- Samsung strike to MU worked example as second-order impact.
- Package scripts: `dev`, `lint`, `test`, `smoke`, `check`, `build`.
- Tests for Alpha Engine and portfolio analytics.
- Architecture docs including `docs/alpha-engine.md`.

Checkpoint `2917754 phase 2 rebalance and thesis tracker`:

- Rebalance engine in `src/rebalanceEngine.js`.
- Rebalance modes: new-contribution, taxable-safe, retirement/HSA-only, full.
- Leveraged ETF trim logic.
- Strategy sleeve summaries.
- Thesis tracker in `src/thesisTracker.js`.
- Editable local thesis profile UI.
- Thesis profiles feed target allocation and Alpha Engine thesis-impact scoring.
- Tests for rebalance suggestions and sleeve summaries.
- Documentation in `docs/rebalancing-and-thesis.md`.

Checkpoint `0bf6dfd add local dashboard state backup`:

- Local dashboard state JSON export/import.
- Backup includes holdings, market events, Alpha Engine events, connector status, and thesis profiles.
- Backup excludes passwords and API keys.
- README and product spec updated for backup/restore.

Current Phase 3 checkpoint:

- Local Seeking Alpha `.xlsx` workbook parser.
- Seeking Alpha workbook normalization for ticker, company, Quant Rating, SA Author Rating, Wall Street Rating, valuation, growth, profitability, momentum, EPS revisions, dividend yield, earnings date, price target, and rating changes.
- Seeking Alpha ratings input accepts `.csv` and `.xlsx`.
- Tests cover workbook row normalization and first-worksheet `.xlsx` import.

Current provider-normalization checkpoint:

- Plaid holdings normalize accounts, securities, cash-like core positions, account type, asset class, source timestamp, and provider holding id.
- SnapTrade holdings preserve account context and convert average purchase price into total cost basis.
- Provider selector tests cover SnapTrade routing separately from Plaid.

Current local-backend checkpoint:

- `npm run dev` serves the dashboard and local API routes; `npm run dev:api` is retained as the same safe local-server alias.
- `/api/config` reports credential presence without exposing values.
- Fidelity Plaid endpoints create Link tokens, exchange Plaid public tokens, fetch investment holdings, and unlink the local item when Plaid credentials are configured. Seeking Alpha connector endpoints still point to authorized local import unless a licensed provider is approved.
- `/api/market/events` returns demo-mode fallback without external network calls.
- Tests cover config redaction, connector setup-required responses, unsupported providers, and demo fallback.

Current foundation-stabilization checkpoint:

- `package.json` contains local-only scripts for dev, lint, validate:data, test, smoke, check, and build.
- `scripts/smoke.js` verifies entry files, script wiring, connector module loading, CSV import, demo portfolio normalization, Samsung-to-MU signal, and obvious hardcoded-secret patterns.

Current UI cleanup checkpoint:

- Explicit data states prevent sample/sample holdings from appearing as Tucker's real portfolio.
- Import success language uses skipped non-holding rows for harmless Fidelity footer/disclaimer rows.
- Market Intelligence exposure summaries use compact dollar values and deduplicated ticker chips.
- Alerts are grouped by action/severity and supports-thesis signals are not critical by default.
- Overview is structured as a calm command center with key takeaways and next action.

Current target allocation checkpoint:

- Canonical target allocation model in `src/targetAllocations.js`.
- Editable local Target Allocations section with save, reset default template, target JSON export, and target JSON import.
- Current vs target rows by ticker, asset class, strategy sleeve, and account.
- Rebalance review view with new-contribution, taxable-caution, retirement/HSA-only, and full-portfolio modes.
- Cash deployment planner compares available cash against target cash and routes excess cash toward underweight ticker targets.
- Leveraged ETF guardrails flag UPRO, SOXL, TQQQ-style positions above direct or effective exposure caps.
- Tests cover drift math, overweight/underweight classification, cash deployment, leveraged caps, local target normalization, and imported CSV holdings driving target rows.

Current thesis tracker checkpoint:

- Expanded thesis profile model in `src/thesisTracker.js`.
- Thesis rows aggregate holdings by ticker while preserving account context.
- Thesis editor includes status, confidence, why owned, bullish assumptions, risks, invalidation criteria, add/trim/exit conditions, review triggers, next review trigger, notes, and last reviewed date.
- Saving a ticker thesis target syncs into ticker-level Target Allocations.
- Thesis tracker consumes Target Allocation drift, active Alpha Engine signals, and leveraged ETF context.
- Thesis alerts flag missing thesis, stale large thesis, above-target weak/stale thesis, leveraged guardrail gaps, Alpha support, Alpha weakening, and thesis-breaking signals.
- Rebalance review suggestions include thesis review context where relevant.
- Tests cover thesis aggregation, target drift, Alpha support/weakening/breaking, guardrail gaps, and no buy/sell command language.

Current ticker intelligence checkpoint:

- Ticker detail pages now present quote/live-cached-mock status, owned/watchlist/discovered state, portfolio and account exposure, sector/industry, historical price trend chart, Reddit mention trend, politician trade activity, thesis/risk details, alert history, related market read-throughs, and data-quality coverage.
- Pages work for owned holdings, watchlist/sample quote names, and externally discovered signal tickers without implying unavailable live data.
- Empty states call out missing quote history, thesis notes, social data, disclosure records, or alerts.
- Tests and smoke checks cover ticker model enrichment, historical price normalization, source/status sections, route wiring, and no trade-command framing.

Current Signal Review checkpoint:

- Added a focused `#signal-review` screen with filters for all signals, owned tickers, watchlist-only tickers, Reddit-driven signals, politician-trade-driven signals, and high-momentum signals.
- Added `src/signalReview.js` for explainable signal review rows, score component summaries, and simple forward-return calculations over available historical close arrays.
- Forward returns cover 1, 5, and 20 trading-day horizons when history supports them; missing signal timestamps or insufficient future closes are surfaced as warnings.
- UI copy states this is backtesting-lite and exploratory, not a validated strategy, prediction system, or trade recommendation.
- Tests cover return calculations, missing-data behavior, Signal Review row construction, and filters.

Current accessibility/mobile QA checkpoint:

- Route changes now update the screen-reader live region only when the route changes, move focus to active screen headings for deep links, and scroll new screens to the top.
- Holdings sort announcements avoid repeated live-region spam when unrelated renders occur.
- Repeated alert actions and target allocation inputs now have row/item-specific accessible names.
- Time horizon segmented controls expose `aria-pressed` and update it with the active state.
- Reddit and politician-trade file imports use the same keyboard-focusable button-label pattern as other imports.
- Mobile CSS now reduces sidebar/panel/action crowding, stacks panel headers and import/manual-mapping grids, gives workspace nav touch-sized two-column links, and prevents long text from overflowing cards.
- Static accessibility and smoke coverage now guards contextual repeated-control labels, mobile navigation rules, import input labels, route focus behavior, and segmented control ARIA state.
- `scripts/validate-data.js` validates sample Fidelity and Seeking Alpha CSV imports.
- Connector and CSV import unit tests cover Plaid, SnapTrade, Seeking Alpha ratings, sample CSV merge, and portfolio weight math.
- `.gitignore`, `.env.example`, `README.md`, `docs/safety-model.md`, and `docs/schemas.md` define the safety and extension foundation.

Current Alpha / Signal Engine Phase 1 checkpoint:

- Canonical demo `Signal/Event` normalization in `src/alphaEngine.js`.
- Sample signals for Samsung strike -> MU, AI capex optimism, semiconductor rates selloff, broad market risk-off, and weak social-media rumor.
- Five local alpha modules represented through scoring outputs: thesis change, mechanism/materiality, price-action confirmation, evidence quality, and actionability/position sizing.
- Transparent scoring utilities for materiality, confidence, evidence quality, portfolio relevance, thesis impact, actionability, and priority.
- Alpha Engine UI cards show affected holdings, impact type, thesis impact, evidence grade, materiality, confidence, portfolio relevance, mechanism, price-action confirmation, support/contradiction/missing evidence, actionability, position-sizing check, next review question, and monitor list.
- Tests and smoke checks cover demo signal normalization, Samsung-to-MU mapping, rumor downgrade, scoring behavior, and existing CSV/Fidelity/Seeking Alpha sample paths.

Current market-intelligence adapter checkpoint:

- Demo-safe provider adapter contracts live in `src/marketEventProviders.js`.
- `/api/market/events` returns canonical demo events, provider readiness, missing-key warnings, and `liveProviderCalls: false`.
- Supported adapter contract ids: `demo`, `finnhub`, `alphaVantage`, `newsApi`, `polygon`, `xApi`.
- Provider statuses report configured/missing keys without exposing values.
- Unsupported provider ids return `400 unsupported_market_provider`.
- Tests cover provider readiness redaction, canonical provider-event normalization, local API market-event responses, unsupported provider rejection, and smoke coverage.

Current provider-readiness and alert-persistence checkpoint:

- Data Sources includes a provider-readiness panel driven by local backend status when available, or static demo status when the backend is absent.
- Provider readiness shows configured/missing status, source types, trust level, warnings, and demo-only live-provider state.
- Alerts can be marked reviewed or hidden from the What Needs Attention panel.
- Hidden alerts can be restored.
- Alert lifecycle state is stored in `localStorage` and included in exported/imported dashboard state JSON.
- Tests cover alert lifecycle rules and smoke coverage verifies the provider panel and alert persistence wiring.

Current Alpha Engine UX polish checkpoint:

- "Today's Portfolio Intelligence" decision brief summarizes priority signals, top risks, monitor items, thesis-impacting events, ignore/log recommendations, and stale-data warnings.
- Alpha signal cards now show compact action labels, affected portfolio weight, impact type, what changed, why it matters, why it matters to Tucker, what could prove the view wrong, and what to monitor next.
- Low-quality rumor/noise signals are visually muted and explicitly labeled as ignore/log only.
- Reviewed or hidden Alpha Engine alert ids are filtered out of the main Alpha card flow until restored.
- Samsung strike -> MU is the model second-order signal card with mechanism, counterarguments, missing evidence, monitor list, and portfolio-specific read-through.
- Tests and smoke checks cover decision brief generation, priority ordering, Samsung card content, rumor downgrade, affected weight display, and signal lifecycle filtering.

Current CSV import stabilization checkpoint:

- Brokerage CSV imports now preserve account-level rows instead of collapsing duplicate tickers before canonical account+ticker merge.
- Import debug reports show file name, detected columns, parsed row count, imported holdings, rejected rows, missing required fields, mapping used, total imported market value, and detected tickers.
- Fidelity-like and generic brokerage aliases cover Symbol/Ticker/Security, Description, Account, Quantity/Shares, Last/Current Price, Market Value/Current Value, Cost Basis/Total Cost Basis, Gain/Loss, and % Gain/Loss.
- Manual column mapping fallback lets Tucker map unusual CSV headers and retry the import locally.
- CSV imports continue flowing into portfolio overview, holdings table, Alpha Engine affected-weight calculations, alert engine, and local state export/import through canonical holdings.

Current real CSV acceptance-validation checkpoint:

- CSV Import Health now reports Success, Partial success, Failed, or Needs manual mapping.
- Successful imports confirm holdings count, account count, and total imported market value.
- Partial imports report imported and rejected row counts and keep rejected-row reasons visible.
- Rejected brokerage rows identify missing ticker, missing quantity/market value, invalid number formats, unsupported/unmapped columns, and duplicate/ambiguous mappings.
- Tests validate that realistic imported CSV holdings drive overview totals, top holdings, account breakdown, Alpha Engine affected-weight calculations, alert generation, and local state backup shape.

Current UX simplification checkpoint:

- App shell uses a clearer sidebar navigation and a dedicated Imports section.
- Overview starts with a 30-second decision brief, top summary cards, Today’s Portfolio Intelligence, top holdings, alerts, and account/sector breakdowns.
- Imports emphasize a primary "Import Fidelity CSV" action, local-only safety, import health, and harmless non-holding skipped rows.
- Holdings table keeps existing power but improves scanability with sticky headers, right-aligned numeric columns, search/filter controls, and a hide tiny/cash rows toggle.

Current holdings sorting checkpoint:

- Holdings table headers are clickable and keyboard-sortable.
- Sortable columns include ticker, account, shares, price, market value, weight, cost basis, gain/loss, daily change, target, drift, sector, asset class, thesis, risk, Seeking Alpha factors, dividend, and earnings date.
- Active sort column receives visual state, arrow direction, `aria-sort`, and a live status line.
- Sorting is shared by account-level and grouped-by-ticker views.
- Non-sortable table headers no longer inherit a clickable cursor.
- Alpha Engine cards are compact by default and put evidence, counterarguments, missing evidence, and scoring details behind an expand/collapse control.
- Sidebar now stays focused on navigation and the import -> confirm -> review workflow instead of holding every control.
- Fidelity and Seeking Alpha import/status controls live under Data Sources. Fidelity now exposes the approved Plaid local-backend flow, while Seeking Alpha stays on authorized import/sample paths. Local backup lives under Settings.
- Holdings controls live next to the holdings table, including account-level vs grouped-by-ticker view.
- Imports show a persistent summary panel for last status, rows parsed, holdings imported, harmless non-holding rows, imported value, detected accounts, and tickers.

Current Alpha action-card refinement checkpoint:

- Alpha Engine cards now lead with a recommended action and a concrete "what to do now" monitor list instead of a tall metrics-first column.
- Card headings are shorter and ticker/action labels do the scanning work.
- News and research links are attached to each demo signal so Tucker can dive deeper without turning the dashboard into a generic feed.

Current ticker detail checkpoint:

- Added a canonical `#/ticker/TICKER` hash route and focused ticker intelligence screen.
- Ticker symbols now use native links from key app surfaces, including Holdings, Overview movers, Risk/Concentration, Alerts, Alpha/Market Intelligence, Reddit summaries, and politician trade rows.
- Ticker detail pages show sample quote context, ownership and account exposure, portfolio weight, sector/industry, thesis/risk notes, market data status, Reddit placeholder, politician trade placeholder, related read-throughs, and recent alerts.
- Watchlist-only or not-owned tickers display clear empty states instead of pretending there is a current position.
- Tests and smoke checks cover ticker route parsing, native ticker links, ticker detail model data, owned/watchlist separation, and route accessibility.

Current market data provider configuration checkpoint:

- Financial Modeling Prep is the recommended first quote/profile/history provider path.
- `.env.example` now includes `MARKET_DATA_PROVIDER=financialModelingPrep`, `FINANCIAL_MODELING_PREP_API_KEY`, optional `FMP_API_KEY`, and future alternative keys for Alpha Vantage, Polygon, and Twelve Data.
- `/api/config` reports selected provider, missing env names, and key presence without exposing secret values.
- A present Financial Modeling Prep key now enables live quote/profile/history calls through the local backend proxy only.
- Data Sources shows market data as sample, connected, stale, or error based on the normalized market data snapshot.
- Tests and smoke checks cover missing credentials, redaction, mocked live FMP normalization, rate limits, network failures, partial responses, and backend proxy behavior.

Current Reddit live-ingestion checkpoint:

- Reddit API sync is available only through the local backend route `/api/reddit/mentions`.
- Live Reddit calls require server-side `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT`, and explicit `REDDIT_LIVE_ENABLED=true`.
- Sample Reddit rows and local Reddit-like JSON import remain the default fallback paths.
- The Reddit provider fetches recent subreddit posts and comments through official OAuth/API endpoints, normalizes whitelisted ticker mentions, filters common false positives, and calculates 1-day, 7-day, 30-day, and acceleration summaries.
- Live Reddit rows omit usernames and never expose client secrets, refresh tokens, access tokens, cookies, or authorization headers to browser JavaScript.
- Provider status covers not configured, configured-disabled, connected, rate limited, error, stale, cached, and sample states.
- Tests cover missing-key behavior, live-disabled behavior, mocked Reddit API normalization, rate-limit errors, stale cache fallback, endpoint rejection, false-positive filtering, local JSON import, and no hardcoded secret exposure.

Current X/Twitter setup checkpoint:

- X/Twitter sync is available only through the local backend routes `/api/x/updates` and `/api/twitter/updates`.
- Live X calls require server-side `X_BEARER_TOKEN` and explicit `X_LIVE_ENABLED=true`.
- Sample X rows and local import/persistence remain the default fallback paths.
- The X provider uses the official recent-search API path, normalizes whitelisted ticker mentions, stores no usernames/handles, and never exposes bearer tokens, cookies, session values, or authorization headers to browser JavaScript.
- Provider status covers Sample, Not configured, configured-disabled, Live, Cached, Stale, Error, and rate-limited states.
- Tests cover missing-key behavior, live-disabled behavior, mocked X API normalization, endpoint rejection, stale cache fallback, ticker summarization, local export/import, and no hardcoded secret exposure.

Current command-brief checkpoint:

- The app brand is now Market Pulse.
- Overview is a compact command brief with sections for portfolio value/daily move, top movers, concentration warnings, highest-conviction holdings, recent alerts, market intelligence snapshot, and data source health.
- Overview sections route to focused detail screens instead of showing full data tables on the home page.
- Hash routing keeps one major screen visible at a time and updates active navigation state.
- Holdings table sorting remains clickable and keyboard-accessible.

Current deep-dive route checkpoint:

- Risk includes destination panels for top position weights, sector exposure, account exposure, leveraged ETF exposure, existing risk analytics, and data quality.
- Alerts includes the decision brief plus grouped action queue.
- Market Intelligence includes ticker watchlist-style demo signal cards and event cards.
- Data Sources includes a future-source readiness matrix for manual/imported holdings, market data, Reddit, politician trades, Seeking Alpha, and Fidelity.
- Settings includes local configuration placeholders for data refresh, risk thresholds, and watchlist preferences.
- Market Intelligence event cards do not show sample exposure dollars as real imported exposure.
- Evidence, mechanism, counterarguments, missing evidence, and scoring stay behind a "Dive deeper" disclosure.
- Smoke coverage verifies source links, the recommended-action UI, and the collapsed details control.

Current trust-and-clarity UI cleanup checkpoint:

- Dashboard display now distinguishes sample/demo mode from a real imported portfolio.
- Overview hides sample portfolio numbers behind an import-first state and shows real metrics only after a real Fidelity CSV import.
- Fidelity CSV imports replace sample holdings so demo positions do not contaminate real portfolio totals.
- Imports page uses calmer confirmation copy, success cards, skipped non-holding row language, and collapsed technical details.
- Alerts are grouped into Needs review now, Monitor, Positive thesis support, and Log / ignore.
- Market Intelligence and Alpha Engine cards use deduplicated affected-exposure summaries with ticker chips and compact dollar labels.
- Market Intelligence and Alpha Engine demo scenarios are explicitly labeled as demo mode/live-news-not-connected.

Current Apple-inspired UI redesign checkpoint:

- App shell renamed to "Market Pulse" with the approved local-first subtitle.
- CSS design tokens now define an Apple-inspired light theme with off-white background, elevated surfaces, subtle dividers, soft shadows, larger radii, calm status colors, and typography scale.
- Sidebar navigation includes Overview, Imports, Holdings, Risk, Targets, Thesis, Alerts, Alpha Engine, Market Intelligence, Data Sources, and Settings.
- Cards, tables, import confirmation panels, alerts, Alpha/Market Intelligence cards, thesis cards, and empty states are visually softened while preserving existing IDs and JavaScript hooks.
- Market Intelligence remains chip-based through the shared affected-exposure summary helper; raw duplicate ticker arrays are not reintroduced.

Current multi-screen navigation checkpoint:

- The app now uses a lightweight hash router with focused screens for `#overview`, `#imports`, `#holdings`, `#risk`, `#targets`, `#thesis`, `#alerts`, `#alpha`, `#market-intelligence`, `#data-sources`, and `#settings`.
- Only the active `[data-screen]` is visible; sidebar nav receives active/`aria-current` state and browser back/forward works through hash changes.
- Overview is a digest screen with hero/metrics, command brief, top movers, concentration warnings, highest-conviction holdings, recent alerts, top holdings, target snapshot, Market Intelligence snapshot, data connection status, and Alpha summary cards.
- Full tables, import details, alerts, risk analytics, data quality, target editor, rebalance review, thesis editor, Alpha cards, Market Intelligence cards, provider readiness, and settings now live on dedicated screens.
- Overview metric cards and digest CTAs link to detail routes while keeping existing render IDs and event handlers stable.

Current navigation architecture checkpoint:

- Risk / Concentration has a dedicated `#risk` screen instead of living inside Settings.
- Overview cards route to Holdings, Risk, Targets, Thesis, Alerts, Alpha Engine, Market Intelligence, Data Sources, and Imports.
- Overview remains a command brief and avoids full holdings/risk/detail tables.
- The app brand, page title, README, and smoke checks use Market Pulse.

Current command brief refinement checkpoint:

- Overview no longer renders the older crowded metric grid or extra top-holdings/target cards.
- The home page now focuses on seven sections: Portfolio Value & Daily Move, Top Gainers / Losers, Concentration Warnings, Highest Conviction, Recent Alerts, Market Intelligence Snapshot, and Data Source Health.
- Portfolio value and daily move are rendered as a compact command snapshot with status badges and next action.
- Top movers split gainers and losers instead of only showing absolute movers.
- Smoke checks verify the compact command brief sections and guard against reintroducing the older crowded Overview grid.

Current CSV cash classification repair checkpoint:

- Fidelity CSV rows are no longer classified as Cash solely because the `Type` column says `Cash`.
- Cash classification now requires a cash-like ticker or description, while preserving real money-market/core-position rows such as SPAXX/held-in-money-market.
- Canonical normalization repairs already-imported/persisted ordinary securities that were previously tagged as `assetClass: Cash`, `sector: Cash`, or `strategySleeve: Cash`.
- Regression tests cover Fidelity `Type = Cash` ordinary securities, actual money-market cash rows, category cash balance, and persisted false-cash repair.
- Tucker's provided `Portfolio_Positions_May-22-2026.csv` now imports 41 holdings totaling about `$486.4K`, with cash around `$6.1K` / `1.3%` instead of dominating asset/category views.

Current federal disclosure / politician trade ingestion skeleton checkpoint:

- Sample-only politician trade ingestion module lives in `src/politicianTrades.js`.
- Raw mock disclosure rows normalize into the local `PoliticianTrade` contract with politician, chamber, party, state, ticker, asset, transaction, disclosure, amount range, owner, source URL, and scoring placeholder fields.
- Validation enforces required fields, known transaction/source types, amount range consistency, and bounded score values.
- Local storage and export helpers keep disclosure rows local and explicitly exclude credentials/API keys.
- Data Sources surfaces the mock politician trade disclosure watch with neutral language and no investment-command wording.
- Smoke and unit tests guard against direct network clients, live provider URLs, and malformed disclosure rows.

Current federal disclosure / politician trade local-ingestion checkpoint:

- `src/politicianTrades.js` now exposes a provider interface for sample rows, local CSV/JSON imports, future API providers, and future official disclosure parsers.
- Local CSV/JSON import normalizes politician name, chamber, party, state, ticker, asset name, transaction type/date, disclosure date, amount range, owner, and source URL into the canonical `PoliticianTrade` contract.
- Import reports include detected columns, parsed/imported/rejected row counts, missing fields, tickers detected, validation messages, and `liveProviderCalls: false`.
- Data Sources includes a local file input and imported-row status; Market Intelligence and ticker detail pages show imported disclosure rows without implying live data or trading commands.
- Tests cover provider interface shape, CSV import, JSON import, malformed-row rejection, ticker matching, and UI/model integration.
- No scraping or live provider calls were added.

Current Reddit ticker tracking skeleton checkpoint:

- Sample-only Reddit ticker tracking module lives in `src/redditSignals.js`.
- Raw post/comment-like rows normalize into `RedditMention` records with source id, subreddit, created timestamp, title/body/comment text, score/upvotes, comment count, source URL, extracted tickers, sentiment placeholder, credibility, engagement, rumor, and primary-source flags.
- Ticker extraction uses a whitelist and filters common false positives such as `ON`, `BE`, `AI`, `NOW`, `ARE`, `IT`, and `CAN`.
- Mention summaries produce 1-day, 7-day, 30-day, and growth-style outputs by ticker.
- Market Intelligence surfaces mock Reddit ticker mentions as low-trust social signals with explicit mock/no-live-Reddit copy.
- Smoke and unit tests guard against direct fetches, network/scraping clients, live Reddit endpoints, malformed rows, and false-positive ticker extraction.

Current Reddit provider readiness checkpoint:

- Reddit provider interface now supports mock mode and a future Reddit API configuration-only path.
- Safe `.env` placeholders are documented for client id, client secret, user agent, refresh-token/OAuth placeholder, and subreddit watchlist.
- Local Reddit-like JSON import accepts arrays, post/comment bundles, and Reddit-style `data.children` payloads without making live calls.
- Reddit settings persist locally for subreddit watchlist, ticker whitelist, and false-positive filters.
- Provider status remains mock/not configured unless a local backend reports credential presence; live Reddit calls stay disabled.
- Market Intelligence and Data Sources show sample/imported Reddit source status clearly.

Current combined ticker signal scoring MVP checkpoint:

- Combined ticker scoring module lives in `src/tickerSignals.js`.
- `buildCombinedTickerSignals` creates ticker-level rows from holdings, mock Reddit mentions, mock politician trades, market placeholders, Alpha placeholders, and default tracked tickers.
- Score formula is transparent: 22% price momentum, 14% relative strength placeholder, 16% Reddit mention acceleration, 8% Reddit sentiment placeholder, 16% politician disclosure activity, 8% ownership/watchlist status, 10% thesis conviction/risk, and 6% concentration risk.
- Rows include ticker, price momentum, relative strength, Reddit mention acceleration, Reddit sentiment, politician buy/sell/activity scores, ownership/watchlist flags, concentration risk, thesis conviction/risk, confluence score, combined 0-100 score, action category, evidence grade, capped confidence, materiality, source counts, top drivers, warnings, missing data, why-score-is-high reasons, data mode details, and next check.
- Overview Market Intelligence Snapshot now shows top mock confluence rows after a real portfolio import.
- Market Intelligence "Combined Ticker Signals" renders detailed score cards with formula, component scores, capped confidence, and safety wording.
- Tests cover formula math, Reddit/politician helper scores, sale-score offset behavior, mock provenance, confidence caps, and non-command action language.

Current local alerts engine MVP checkpoint:

- `src/alertsEngine.js` generates local in-app alerts from current holdings, sector concentration, leveraged ETF exposure, ticker signal scores, politician disclosures, Reddit mention acceleration, and data-source status.
- Settings now includes locally persisted alert thresholds for position weight, sector/theme weight, leveraged ETF weight, ticker signal score, politician disclosure score, Reddit acceleration, and stale-data hours.
- Runtime render flow passes thresholds into portfolio analytics, merges local alert-engine rows before alert lifecycle filtering, and keeps reviewed/hidden alert behavior intact.
- Alerts use primary severities `info`, `watch`, `warning`, and `critical`, while legacy/demo severities still map into calm action groups.
- No notification channels were added. Alerts remain local in-app review prompts only.
- Tests cover rule generation, threshold boundary behavior, and threshold normalization.

Current Week 1 cleanup and QA checkpoint:

- File import controls remain visually polished while keeping the actual file inputs keyboard accessible and labeled.
- Hash routes now canonicalize unknown/alias hashes, update a polite route live region, and move focus to the active screen heading after screen changes.
- Overview digest cards still route by mouse click, while keyboard users use the visible CTA links without duplicate nested interactive tab stops.
- Holdings table sorting now keeps native table column-header semantics with real buttons inside sortable headers and `aria-sort` on the `th` elements.
- Persisted holdings are normalized on load so older localStorage rows are repaired before analysis.
- Sample mode resets Fidelity and Seeking Alpha statuses to local/sample-only language instead of carrying stale connected labels.
- Politician trade validation now aligns with the shared local contract for `id`, `office`, `disclosedAt`, `confidenceScore`, and `amountRange` consistency.
- Reddit ticker filtering now applies false-positive rules to explicit cashtags and raw provider tickers, not only bare extracted words.
- Reddit contract docs now match runtime and TypeScript optional fields for title/body/comment/permalink/sentiment placeholders.
- Added tests for route/focus accessibility, file input accessibility, sortable table semantics, stricter politician validation, Reddit false-positive edge cases, and watchlist-gated Reddit-only ticker signals.

Current Week 2 market data provider checkpoint:

- Sample-first market data provider abstraction lives in `src/marketDataProvider.js`.
- Provider contract supports quote/current price, daily change, market cap, volume, sector, industry, 52-week high/low, and basic historical prices.
- Provider status handles `not configured`, `sample mode`, `connected`, `error`, and `stale data`.
- Sample quotes enrich holdings with clearly labeled quote and daily-change context without changing imported market value.
- Command brief, Holdings, Risk/Concentration, Market Intelligence, Data Sources, and combined ticker signals consume normalized market data status/quotes.
- Ticker confluence scoring can use mock market quote context while continuing to label scores as local placeholders and not recommendations.
- Local data contracts now include `MarketDataQuote` and fixture validation for sample quote shape.

Current Week 2 QA and integration checkpoint:

- Full Week 2 flows were reviewed across provider readiness, ticker pages, import paths, scoring, local alerts, route accessibility, and status labeling.
- Sample Fidelity sync now replaces holdings and clears real CSV import state so sample holdings cannot masquerade as Tucker's imported portfolio.
- Seeking Alpha CSV/XLSX/demo ratings now enrich existing holdings only; ratings-only tickers remain research/insight data and do not become zero-value portfolio holdings.
- Combined Fidelity + Seeking Alpha imports continue to enrich matching positions while excluding ratings-only rows from canonical holdings.
- Data Sources now treats mock Reddit and mock politician disclosure rows as sample readiness, not configured local data.
- Navigation/accessibility tests were tightened for focused Week 2 routes, overview card routing, mock/configured-not-connected language, and demo/research-only import safety.
- Data validation now distinguishes portfolio holdings from Seeking Alpha rating rows.
- No live APIs, credentials, scraping, production deployment, email/text/push alerts, or external notification channels were added.

Current live market data provider checkpoint:

- Finnhub is the recommended first live market data provider; Financial Modeling Prep remains an explicit fallback provider.
- The browser calls only `/api/market-data/quotes`; Finnhub API keys stay in local `.env` and are never exposed to frontend JavaScript.
- The Finnhub adapter normalizes current price, daily change, percent change, previous close, open/high/low, market cap, volume when available from candles, industry context, and historical candles into `MarketDataQuote`.
- Missing credentials fall back to Sample market data.
- Rate limits, network errors, invalid tickers, cache hits, and partial profile/history/candle responses resolve to normalized `rate limited`, `error`, `partial data`, `cached`, or `stale data` statuses without breaking the dashboard.
- `npm run dev` uses the safe local backend/proxy and remains Sample-first unless provider credentials are configured; `npm run dev:api` is the same local-server alias.

Current market data provider/cache reliability checkpoint:

- FMP invalid-credential, rate-limit, network-failure, partial-response, omitted-ticker, cache-hit, cache-miss, stale-cache, and mixed-freshness paths are covered by mocked tests.
- Live provider tests do not make external network calls and continue to verify key redaction.
- If a provider omits a previously cached quote, the app serves the prior quote as stale cached data with a visible last-error reason.
- If a provider omits an invalid/unknown ticker, the app records `missingTickers` and `warnings` without creating fake quotes.
- Mixed quote/profile/history freshness now labels the snapshot as cached when any visible quote data came from cache.
- Empty configured-provider error snapshots are labeled `error`, not live.
- Data Sources and ticker detail pages now show provider, fetched/as-of timestamps, last success, and last error context when available.

Current portfolio import hardening checkpoint:

- Portfolio imports now support a preview-before-apply workflow so a valid brokerage file does not replace active holdings until Tucker confirms it.
- Fidelity/brokerage import accepts local `.csv` and holdings `.json` payloads with top-level arrays or `holdings`/`positions`/`records`/`rows`/`data` arrays.
- Fidelity/brokerage import also accepts account-shaped JSON such as `accounts[].positions[]`, inheriting account metadata into child positions.
- Field mapping now covers account type plus broader `acct`/`acctName`/`acctType` style brokerage headers.
- Fidelity-style rows now handle longer preambles, tab-delimited exports, blank last-price fields inferred from quantity/current value, and average-cost-basis columns converted to total cost basis.
- Same ticker in the same account is merged as brokerage lots with summed shares, market value, cost basis, and gain/loss; same ticker across accounts remains separate.
- Import reports surface duplicate merges, skipped non-holding rows, missing fields, invalid-number rows, unsupported columns, account detection, ticker detection, and total market value.
- Messy CSV and local holdings JSON fixtures are part of unit, smoke, and data-validation coverage.

Current active portfolio source-of-truth checkpoint:

- Fresh local sessions now start with no active portfolio instead of automatically loading sample holdings. Tucker can still explicitly choose Sample data.
- Sample load, imported CSV/JSON, imported dashboard state, provider sync, and clear/reset paths invalidate stale alert lifecycle state, market-data snapshots, and cached ticker-signal snapshots.
- Watchlist/Ideas rows no longer keep a stale `owned` status when the current active portfolio no longer owns that ticker.
- Imported CSV and JSON workflows, reset/no-data behavior, ticker ownership distinctions, Daily Command Brief, alerts, Signal Review, What-If, and Data Sources are covered by source-level regression tests.

Current Fidelity CSV production-readiness checkpoint:

- Fidelity-style imports now recognize additional real-export headers such as `Current Value (USD)`, `Cost Basis Per Share`, `Quantity Shares`, `Gain/Loss Dollar`, and account-type variants.
- Per-share cost-basis fields are converted into total cost basis using quantity, while blank price fields still infer price from current value when possible.
- Holding-like rows with missing tickers, invalid numbers, negative quantities, or missing value/quantity data are classified as rows needing review instead of harmless footer rows.
- Portfolio previews cannot be applied while any holding row needs review; skipped Fidelity footer/disclaimer rows remain safe and non-scary.
- Data Sources now describes imported holdings as a local portfolio import so JSON imports are not mislabeled as CSV.
- Daily Command Brief and ticker-signal alerts now keep default/sample research tickers out of portfolio action items when a real imported portfolio is active.
- Alpha Engine copy now refers to the current portfolio instead of a demo portfolio when scoring imported holdings.

Current market data cache checkpoint:

- The local backend now keeps an in-memory market data cache for Financial Modeling Prep quote, profile, and historical price resources.
- Cache TTLs are configurable through local `.env`: `MARKET_DATA_QUOTE_TTL_MINUTES`, `MARKET_DATA_PROFILE_TTL_HOURS`, and `MARKET_DATA_HISTORY_TTL_HOURS`.
- Market data snapshots include `fetchedAt`, `dataFreshness`, `cacheStatus`, `lastSuccessfulRefresh`, `lastError`, and cache summary metadata.
- Fresh cache hits return cached market data without calling the live provider again.
- Expired cache entries refresh when possible; if refresh fails and stale data exists, the dashboard returns stale cached data with a clear stale status.
- UI copy now distinguishes live, cached, stale, mock, and error quote states.

Current Week 3 QA, security, and integration checkpoint:

- Dream Team scout review covered security/provider/cache/import behavior and route/accessibility/UI behavior before code changes.
- `npm run dev` / `npm run dev:api` no longer serves dotfiles, `.env`, `.git` files, or secret-like static filenames, and local API JSON request bodies are capped.
- `/api/market-data/quotes` caps oversized ticker requests and clamps history limits to avoid accidental provider fan-out.
- Financial Modeling Prep config now reports `live-ready` when server-side credentials are present and live proxy calls are enabled, reserving `connected` for successful quote snapshots.
- Provider/fetch errors are redacted before being returned or cached, including `apikey`, token, client-secret, bearer-token, and raw FMP key values.
- Partial FMP profile/history failures are surfaced as quote-status warnings instead of silently looking fully complete.

Current security, secrets, and privacy audit checkpoint:

- No real API keys, tokens, passwords, private keys, brokerage credentials, or account-number exports were found in the project scan.
- `npm run dev` now uses the safe local Node server so local `.env`, dotfiles, `.git`, private-key extensions, and secret-like filenames are denied by default.
- Portfolio import reports and SnapTrade fallback account labels mask account-number-only values to the last four digits before display/export.
- Reddit mention contracts, fixtures, live normalization, and local imports avoid storing usernames/author handles.
- Politician trade rejected-row reports redact secret-like fields and sanitize source URLs before they enter import/provider reports.
- Visible app errors and JSON parse reports use redacted, bounded messages instead of raw provider/import error text.
- Ticker hash navigation now re-renders selected ticker detail content; malformed URL hashes fall back safely instead of crashing route parsing.
- Grouped-by-ticker holdings keep one ticker target weight instead of summing the same target once per account row.
- Market Intelligence affected-exposure summaries now match tickers case-insensitively while preserving deduped chips and compact values.
- Dashboard state JSON import rejects unsupported schema versions and resets restored connector statuses so a backup cannot make a provider look freshly connected without local backend revalidation.
- README/docs now clarify the app is local-first by default and served through the safe local backend/proxy for API-key-protected provider experiments.
- Full local verification passed: `npm run lint`, `npm run validate:data`, `npm run test`, `npm run smoke`, `npm run check`, and `git diff --check`.

Current full app smoke/navigation audit checkpoint:

- Local clean-run check completed with `npm install --package-lock=false`; the package has no external dependencies and no package-lock churn was introduced.
- Local backend/proxy smoke served current code at `http://127.0.0.1:4176/`; `/api/health` returned healthy local mode.
- Browser automation was attempted, but the in-app browser backend was unavailable in this session (`agent.browsers.list()` returned empty), so rendered click coverage remains a Week 4 reliability target.
- Added `src/router.js` as a pure route resolver used by the app and tests, covering major routes, aliases, ticker detail hashes, invalid routes, malformed encoded hashes, canonical hash replacement, and responsive/focus source contracts.
- Dashboard summary `data-route` cards and hash links are now audited against known routes, including Overview, Imports, Holdings, Risk, Targets, Thesis, Alerts, Alpha Engine, Market Intelligence, Signal Review, Data Sources, Settings, and ticker detail routes.
- Import-preview ticker cells now use the shared `renderTickerLink()` helper, preventing broken `#/ticker/` links for blank/invalid tickers.
- Decision brief signal/monitor/thesis ticker labels now link to ticker intelligence pages where a valid ticker exists.
- Provider/imported source URLs now pass through `safeExternalHref()`, allowing only `http:`, `https:`, or local `#` anchors before rendering clickable links.
- Affected-exposure ticker chips preserve market-value order after deduplication instead of being alphabetically resorted.
- Added regression coverage for unsafe URL schemes, malformed hash canonicalization, route/card/href resolution, shared ticker-link usage, responsive source contracts, and affected-exposure chip order.

Current data-source status labeling audit checkpoint:

- Data Sources now uses shared source-availability helpers for manual holdings, market data, Reddit, politician trades, Fidelity, and Seeking Alpha so sample, local import, configured-disabled, connected/live, cached, stale, error, and not-configured states use consistent labels and guidance.
- Market provider counts exclude the demo provider; overview wording now says provider keys detected instead of implying providers are connected.
- Market data differentiates live provider data, cached provider data, stale cached data, provider errors, sample fallback, and configured-but-not-connected fallback.
- Backend config parsing treats whitespace-only credentials as missing for market data, Reddit, market events, and politician trades.
- Configured-but-disabled market-data providers return a safe `configured-not-connected` mock fallback rather than looking live.
- Fidelity and Seeking Alpha statuses restored from local backups no longer look freshly connected; imported Seeking Alpha exports render as local/imported data instead of live connector sync.
- Reddit and politician trade local JSON/CSV imports render as imported/local data, while sample rows remain sample and stale/error public disclosure caches render as needs-review states.
- Ticker detail pages now check snapshot-level stale/error state before quote-level state so stale provider snapshots cannot look live.
- Combined ticker signal provenance distinguishes local scoring with provider quote input from pure sample/local confluence scoring.
- Alerts now include explicit review alerts for market-data provider errors, not only stale/missing-provider states.
- Tests cover provider/data-source status helpers, import status states, market-data badge classes, whitespace credential handling, configured-disabled fallback, ticker-signal live quote provenance, and market-data error alerts.

Current portfolio import torture-test checkpoint:

- Added messy CSV and holdings JSON torture fixtures covering missing optional fields, extra unknown columns, quoted comma dollar values, percentage strings, blank/footer rows, duplicate ticker/account lots, lowercase tickers, invalid tickers, negative quantities/values, malformed JSON, and large synthetic portfolios.
- CSV parsing now records row cell counts and rejects row overflow, so unquoted comma currency values produce a clear column-count mismatch review item instead of silently shifting price/market-value fields.
- Holdings JSON parse/schema failures now return structured failed import reports instead of throwing and risking a broken import flow.
- Invalid raw ticker strings and negative quantity/price/market-value rows are classified as needs-review rows rather than harmless non-holding rows.
- Duplicate ticker rows merged without an account column mapping produce a review warning so cross-account lots are not hidden behind `Unassigned` merges.
- Stale persisted holdings are normalized safely on load, including ticker cleanup, parenthesized negative numbers, string percentages, and prior false-cash classification repair.
- README, `validate:data`, smoke checks, and unit tests now cover the torture fixtures and importer edge cases.

Current Week 4 release-candidate checkpoint:

- Release-candidate pass pulled together Week 4 QA/fix work across startup, imports, routing, ticker pages, market intelligence, alerts, settings thresholds, data-source statuses, provider cache/status behavior, accessibility/mobile polish, and security/privacy guardrails.
- `npm run dev` starts the safe local backend/proxy, and if the requested port is already busy it falls forward to the next available local port instead of crashing.
- Clean local HTTP checks verified the app shell serves successfully, `/api/config` reports missing credentials without exposing values, and market-data quotes fall back to sample mode when no provider key is configured.
- Sample data, CSV/JSON import behavior, deep routes, ticker pages, Market Intelligence, alerts, settings thresholds, and data-source status behavior are covered by unit/source smoke tests with mocked provider responses.
- `RELEASE_NOTES.md` now summarizes current capabilities, verification, limitations, and Week 5 readiness.
- Final RC verification gate is: `npm run lint`, `npm run validate:data`, `npm run test`, `npm run smoke`, `npm run check`, and `git diff --check`.

## Pending Work

### Market Intelligence

- Politician trade disclosure live usage remains opt-in and config-gated; do not expand beyond the current public-static-dataset/local-import path without Tucker approving source, retention, and reliability tradeoffs.
- Reddit/social live usage remains opt-in and config-gated through official Reddit API paths; no HTML scraping, cookies, usernames, or PII storage.
- Additional market data live provider adapters remain future work; current FMP implementation is backend-only and must not expose API keys in browser JavaScript.
- Combined ticker signals remain placeholder review scores until live provider data and validation are explicitly approved.
- Add live fetch implementations only after Tucker approves the provider, scopes, credentials, and retention model.
- Preserve signal discipline:
  - What changed?
  - Is it factual?
  - Is it material?
  - Is it already priced in?
  - Does it affect revenue, margins, cash flow, rates, liquidity, or positioning?
  - Does it change Tucker's thesis?
  - What would prove this view wrong?

### Alerts And Settings

- Export/import richer dashboard settings.
- Extend stale-data threshold controls beyond the current alert threshold surface when Tucker wants more configurable freshness policy.

### Known Limitations And Remaining Risks

- Rendered browser click-through testing could not run in this session because the in-app browser backend was unavailable; pure router tests, source smoke checks, and local HTTP checks cover the route/workflow surface until browser automation is available again.
- Live provider behavior is tested with mocked network responses; real provider rate limits, outages, schema drift, and credential errors still require local credential dry-runs before daily use with live data.
- Combined ticker scores and Signal Review remain exploratory review aids, not validated strategy, prediction, or trade recommendations.
- There is no production auth, cloud sync, encrypted multi-user token vault, external notification delivery, or trade execution in this release candidate. The Plaid token store is local-only, gitignored, static-server-blocked, and suitable for personal testing, not production custody.

### Recommended Next Tasks

Week 5 recommendations:

- Add rendered browser smoke tests once Browser automation is available: click Overview cards, ticker links, sortable table headers, Signal Review filters, import controls, settings threshold controls, and provider status cards across desktop/mobile widths.
- Add settings export/import for local thresholds, watchlist preferences, and stale-data configuration.
- Dry-run the Plaid sandbox/development flow with Tucker's actual Plaid app, confirm scopes, review Plaid's institution support for Fidelity investment holdings, and document token-retention expectations before using it daily.
- Add encrypted local token storage or OS keychain integration before treating Plaid as production-grade.
- Keep market-data Live mode cache-aware and opt-in: it should call only the local backend proxy, respect quote/profile/history TTLs, and never expose provider secrets to browser code.
- Add one additional approved live-provider hardening slice only after Tucker chooses provider, scopes, credential handling, rate limits, retention rules, and cache policy.
- Keep Seeking Alpha ratings-only data in a dedicated research/watchlist surface if Tucker wants non-owned names visible later.

## Deferred Ideas

- Trade execution.
- Production auth and cloud sync.
- Multi-user collaboration.
- Production database.
- Full brokerage token storage.
- Social/X sentiment until official/licensed API access exists.
- Options/volatility analytics until reliable data source is approved.
- Browser-based visual regression testing until in-app browser automation is available.
- Multi-agent Dream Team split until import/backend/market-intelligence interfaces are stable.

## Do-Not-Touch Rules

- Work only inside `/Users/tuckerthompson/Documents/Codex/2026-05-20/build-me-an-online-dashboard-that` unless Tucker explicitly approves otherwise.
- The git repo root is `/Users/tuckerthompson`; avoid unscoped home-root git operations.
- Do not use unscoped `git add -A` from `/Users/tuckerthompson`.
- Do not touch unrelated files in `/Users/tuckerthompson`.
- Do not run destructive commands such as `rm`, `git reset --hard`, or checkout/revert operations without explicit approval.
- Do not collect or store Fidelity passwords, MFA codes, cookies, or raw credentials.
- Do not collect or store Seeking Alpha passwords.
- Do not scrape Seeking Alpha premium pages.
- Do not scrape X/Twitter.
- Do not hardcode API keys.
- Do not commit `.env`, secrets, personal CSV exports, exported state JSON, or screenshots revealing Tucker's private holdings.
- Do not install global packages without approval.
- Do not add paid APIs, production credentials, or external network dependencies without approval.
- Keep CSV import functional.
- Keep demo mode functional when API keys or backend services are absent.
- Treat exported state JSON as sensitive because it contains financial holdings.

## Verification Commands

Run after meaningful code changes:

```bash
npm run lint
npm run validate:data
npm run test
npm run smoke
npm run check
```

Useful scoped git checks:

```bash
git status --short -- Documents/Codex/2026-05-20/build-me-an-online-dashboard-that
git diff --stat -- Documents/Codex/2026-05-20/build-me-an-online-dashboard-that
git log --oneline -5 -- Documents/Codex/2026-05-20/build-me-an-online-dashboard-that
```

Secret-like file check:

```bash
find Documents/Codex/2026-05-20/build-me-an-online-dashboard-that -maxdepth 4 -type f \( -name ".env*" -o -name "*secret*" -o -name "*key*" -o -name "*token*" -o -name "*.pem" -o -name "*.p12" \) -print
```

Expected intentional result: `.env.example` only.

## Checkpoint Log

- `ecdc776` - pre-full-access safety checkpoint
- `583e686` - phase 1 portfolio alpha engine
- `2917754` - phase 2 rebalance and thesis tracker
- `0bf6dfd` - add local dashboard state backup
- current planning checkpoint - add project plan and resume protocol; use `git log` for the exact hash
- current Phase 3 checkpoint - Seeking Alpha Excel import; use `git log` for the exact hash
- current provider-normalization checkpoint - Plaid/SnapTrade holdings normalization; use `git log` for the exact hash
- current local-backend checkpoint - setup-safe local API/proxy scaffold; use `git log` for the exact hash
- current foundation-stabilization checkpoint - project scaffold, verification, safety docs, and schemas; use `git log` for the exact hash
- current Alpha / Signal Engine Phase 1 checkpoint - demo-only canonical signal engine; use `git log` for the exact hash
- current market-intelligence adapter checkpoint - demo-safe backend/provider contracts; use `git log` for the exact hash
- current provider-readiness and alert-persistence checkpoint - frontend readiness panel plus alert lifecycle state; use `git log` for the exact hash
- current Alpha Engine UX polish checkpoint - decision brief plus decision-oriented signal cards; use `git log` for the exact hash
- current UI cleanup checkpoint - command-center clarity, import state clarity, calm alerts, and deduped Market Intelligence exposure chips; use `git log` for the exact hash
- current target allocation checkpoint - editable targets, rebalance review prompts, cash planner, and leveraged ETF guardrails; use `git log` for the exact hash
- current thesis tracker checkpoint - expanded thesis profiles, Alpha/target/rebalance integration, and thesis review alerts; use `git log` for the exact hash
- current Apple-inspired UI redesign checkpoint - premium command-center visual system without feature or data-flow changes; use `git log` for the exact hash
- current multi-screen navigation checkpoint - hash-routed app screens and concise Overview digest; use `git log` for the exact hash
- current CSV cash classification repair checkpoint - Fidelity `Type = Cash` no longer inflates cash categories; use `git log` for the exact hash
- current politician trade ingestion skeleton checkpoint - mock-only disclosure normalization, validation, local storage/export, and Data Sources display; use `git log` for the exact hash
- current Reddit ticker tracking skeleton checkpoint - mock-only Reddit mention extraction, false-positive filtering, mention summaries, and Market Intelligence display; use `git log` for the exact hash
- current combined ticker signal scoring MVP checkpoint - transparent local confluence scores across portfolio, Reddit, politician disclosure, and placeholder market inputs; use `git log` for the exact hash
- current Week 2 mock market data checkpoint - normalized sample quote provider, market data status, UI wiring, contract docs, and tests; use `git log` for the exact hash
- current Week 2 QA and integration checkpoint - status-label safety, import contamination fixes, ratings-only import protection, route tests, and full verification; use `git log` for the exact hash
- current politician trade public provider checkpoint - config-gated Senate Stock Watcher static dataset sync through the local backend, source-labeled UI, tests, and docs; use `git log` for the exact hash
- current Week 3 QA/security/integration checkpoint - local-server secret-file protection, provider error redaction, request bounds, route refresh hardening, grouped target-weight fix, exposure case matching, docs/plan updates, and full verification; use `git log` for the exact hash
- current full app smoke/navigation audit checkpoint - pure router module, route/card/ticker-link audits, malformed hash canonicalization, source URL sanitization, decision brief ticker links, exposure chip ordering, and full verification; use `git log` for the exact hash
- current data-source status labeling audit checkpoint - consistent sample/imported/configured/live/cached/stale/error labels, whitespace credential hardening, configured-disabled fallback, and regression tests; use `git log` for the exact hash
- current portfolio import torture-test checkpoint - messy CSV/JSON fixtures, structured failed JSON reports, unquoted-comma row rejection, invalid/negative row review handling, duplicate-without-account warnings, stale holding normalization tests, and full verification; use `git log` for the exact hash
- current market data provider/cache reliability checkpoint - FMP mocked edge cases, stale omitted-quote fallback, missing-ticker warnings, conservative cached/live labels, visible freshness metadata, and full verification; use `git log` for the exact hash
- current security, secrets, and privacy audit checkpoint - safe dev server default, account masking, Reddit username omission, rejected-row redaction, guarded tests, and full verification; use `git log` for the exact hash
- current Week 4 release-candidate checkpoint - startup fallback, release notes, plan update, local HTTP verification, full test gate, and RC commit; use `git log` for the exact hash
- current Fidelity CSV import repair checkpoint - Fidelity rows with trailing empty cells and safe unquoted thousands separators import without requiring manual mapping; zero-holding previews cannot be applied; use `git log` for the exact hash
- current Finnhub market data checkpoint - backend-only Finnhub quote/profile/candle adapter, local `.env` config, cache/stale/error handling, UI contract wiring, docs, and mocked tests; use `git log` for the exact hash
- current Alpha Engine recommendation checkpoint - transparent ranked recommendation model, Alpha Engine filters, source-quality penalties, why-this-rank explanations, docs, smoke coverage, and unit tests; use `git log` for the exact hash
- current Alpha Engine ranking refinement checkpoint - recommendation rank now explicitly includes active portfolio ownership/weight, provider source freshness, alert severity, Finnhub/market price movement, and concentration risk; use `git log` for the exact hash
- current UI regression repair checkpoint - Daily Command Brief and Risk layouts no longer let generic mini-list grids or broad `overflow-wrap:anywhere` collapse labels/tickers/company names into one-character columns; desktop/mobile browser screenshots and full checks passed; use `git log` for the exact hash
- current Real Data Week QA checkpoint - imported holdings and sample holdings now stay clearly separated across Alpha recommendations, ticker signals, ticker pages, and source labels; Finnhub provider/cache tests remain mocked and safe; README now documents the local Finnhub and import workflows; use `git log` for the exact hash
- current Fidelity Plaid linking checkpoint - backend-only Plaid Link token creation, public-token exchange, private local token store, investment holdings sync, unlink, Data Sources status, UI wiring, docs, and mocked/redaction tests; use `git log` for the exact hash
- current transparent prediction model checkpoint - stock prediction v1 adds a bounded 20-trading-day model-implied outlook sidecar with transparent factors, confidence, source labels, ticker-page display, Alpha context, docs, smoke coverage, and no trade-command framing; use `git log` for the exact hash
- current Market Drivers checkpoint - P1 issue #7 adds broad-market and AI/tech movement explanation scaffolding, source-labeled driver rows, Daily Brief/Overview integration, market-driver proxy quote selection, docs, smoke coverage, and no fake-causality/no-trade-command guardrails; use `git log` for the exact hash

Next checkpoint should keep the release-candidate posture: Plaid sandbox/development dry-run with Tucker's approved Plaid app, browser-level smoke tests, and an encrypted local token-storage plan before any additional brokerage/provider expansion.
