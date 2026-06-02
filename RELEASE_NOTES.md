# Market Pulse Week 6 UX Heuristic Release Candidate

Date: 2026-05-24

## News Engine Update

- Market Intelligence now has a local-first news/signal engine that combines source-labeled X/social rows, Reddit mention summaries, federal disclosure rows, market read-throughs, and calendar context without scraping or storing browser credentials.
- Seeking Alpha AI personal-import context now flows into the broader product: ticker pages show linked report context, Daily Command Brief can surface imported research notes, Market Intelligence can cite matching SA AI source context, Alpha Engine can create capped review/watch/stale-data rows, and local alerts can flag owned-position or stale imported SA AI context. These rows are labeled as Imported/Stale personal research context, not live Seeking Alpha data or trading recommendations.
- Ticker signal explanations now include Seeking Alpha AI evidence counts, freshness labels, bullish/risk point summaries, source-mode labels, and missing-data notes while keeping the core confluence formula unchanged.
- New Market Drivers workflow explains why the broader market and AI/tech are moving today using source-labeled market-data proxies, event read-throughs, X/Reddit attention, federal-disclosure context, and active portfolio exposure. It links to Daily Brief, Risk, Market Intelligence, Data Sources, and ticker pages without claiming confirmed causality or issuing trade commands.
- X/Twitter sync is sample/local by default and can use the official recent-search API only through the local backend when `X_BEARER_TOKEN` and `X_LIVE_ENABLED=true` are set. Bearer tokens, cookies, sessions, usernames, and authorization headers never go to browser JavaScript.
- Daily Command Brief and ticker pages now include lower-trust social/disclosure context with clear Sample, Imported, Live, Cached, Stale, Error, and Not configured labels.
- Data Sources now includes X / Twitter diagnostics alongside Reddit and federal disclosures, including provider selection, key-present yes/no, request timing, loaded rows, and safe fallback status.

## What Is Ready

- GitHub ticket sweep: Fidelity CSV verification, CI checks, provider diagnostics/source labels, and OpenAI/thesis summary work are split into reviewable PRs tied to the open issues.
- Optional OpenAI portfolio explanations are now backend-only, disabled by default, redacted, source-labeled, and fall back to deterministic local explanations when no key is configured or the provider errors.
- Ticker pages now include a clearer local deterministic thesis/risk summary with review flags, source label, key risks, invalidation criteria, add/trim/review conditions, and guardrail gaps.
- Portfolio Health Score: Overview and Daily Command Brief now include a compact 0-100 local workflow score that combines import trust, concentration, thesis coverage, target drift, alert load, and market-data freshness. It links directly to the next screen to inspect and stays disabled/honest when only sample or no portfolio data is loaded.
- Market-data reliability pass: Finnhub remains the preferred free personal-use realtime provider path, with docs now spelling out the boundary between free bounded provider data and paid/exchange-grade market-data entitlements.
- Optional market-data fallback path: if the selected configured live provider returns no usable quotes because of an error/rate limit, the local backend can try configured fallback providers such as Financial Modeling Prep and reports the attempt chain in Data Sources diagnostics without exposing keys.
- Alpha Engine ranking is more transparent: recommendation rank math and holding-quality math now expose component weights, source/freshness penalties, risk penalties, and review-priority separation.
- Score explanations are now first-class: Portfolio Health, concentration risk, holding risk contributors, and Alpha Engine rows expose `Explain score` details with weights, point contributions, missing-data handling, and clear calculated-vs-AI language.
- Local backup restore is safer: dashboard state imports now validate the JSON, show a restore preview with changed sections, and require Apply Restore before local state is overwritten.
- Settings now has a provider configuration status panel for market data, OpenAI, Plaid/Fidelity, Reddit, X/social, federal disclosures, and Seeking Alpha imports, including last success/error metadata and setup links without showing secrets.
- First-run onboarding is clearer: when no real portfolio is loaded, Overview now shows a calm setup guide with Import Fidelity CSV, Try sample data, Data Sources, and Settings paths plus source-status labels. Sample mode is explicitly labeled as not Tucker's real portfolio.
- Dashboard navigation is more forgiving: slash-style local routes and `#alpha-engine` now resolve into the existing focused screens instead of falling back to Overview.
- Market-data status handling is more conservative: stale/error/rate-limited provider states take precedence over generic connected/cached labels, and quote-only refreshes identify skipped profile/history resources instead of overstating freshness.
- Manual market-data refresh now respects provider rate-limit backoff, so a recent Finnhub quota/rate response cannot be immediately bypassed by a full enrichment refresh.
- Finnhub refreshes now budget profile/fundamental/history enrichment separately from quote refreshes, protecting free-tier API usage while still updating prices across the active ticker set.
- Rate-limited market-data refreshes now remain visible as Rate limited in the app and Daily Command Brief instead of being overwritten by Sample fallback.
- Trusted Live/Cached provider quotes now mark imported holdings to market, so portfolio value, weights, ticker pages, Alpha ranking, and alerts use the same price basis.
- Combined Fidelity plus Seeking Alpha imports now keep portfolio holding counts tied to actual applied holdings while preserving ratings counts in provider diagnostics.
- Alpha Engine source/data warnings remain visible even when the holdings table is filtered to opportunities, recent items, or high-confidence rows.
- Mobile Holdings keeps the per-row Risk label visible, preserving the risk review signal on small screens.
- Holdings “Filter value” now matches the default Account filter instead of offering a selectable value that does nothing.
- Local persistence is safer under storage pressure: large import/provider reports are compacted before saving, storage failures do not leak values, and Reddit/politician trade saves fail gracefully when localStorage quota is unavailable.
- Ticker pages are more honest for watchlist/signal-only names: no-quote pages show unavailable quote states instead of fake `$0.00`, and signal-derived ideas are not presented as saved watchlist records.
- Accessibility polish adds better holdings-table row-header semantics, scoped sticky header styling, and route/table regression coverage for mobile and keyboard behavior.
- Privacy hardening: Plaid Link now lazy-loads only after Tucker clicks the Plaid connector flow, and exported backups redact common raw token formats even if they were pasted into notes.
- Alpha Engine Watchlist-linked filtering now means owned holdings with saved watchlist/signal context, instead of exposing a dead-end watchlist-only filter in the holdings ranking table.
- Fidelity import now maps Today gain/loss into daily move fields, keeps Total gain/loss as unrealized gain, and prevents symbol-less plan funds with similar names from silently merging.
- Seeking Alpha-style research pass: a persistent Research tape now routes directly to ticker pages, and each ticker page has a compact factor strip for Quant, Valuation, Growth, Profitability, Momentum, EPS revisions, and Dividend context.
- Fidelity can now be linked through Plaid Investments from the local backend: Link token creation, public-token exchange, holdings sync, and unlink stay server-side, while Plaid access tokens remain out of browser JavaScript.
- Plaid-synced Fidelity holdings now replace the active portfolio with a clear import/source report, refresh market data, and feed Daily Brief, Holdings, Risk, Alpha recommendations, alerts, ticker pages, and Data Sources.
- Plaid account labels are masked before they reach UI/export state, and Data Sources distinguishes Plaid Live, cached prior sync, configured-not-linked, CSV Imported, Sample, and Not configured states.
- Buffett-style owner review: ticker pages now include a Long-Term Owner Lens that separates operating-company quality review from ETF/leveraged-exposure review, calls out missing owner-earnings/balance-sheet evidence, and avoids intrinsic-value or buy/sell claims without source data.
- Seeking Alpha/manual import paths now preserve optional fundamental fields such as gross margin, free-cash-flow margin, price/sales, cash flow, capex, debt, and dividend grade when Tucker provides them.
- Meta-style product systems polish pass: Overview digest cards are now native links, the Daily Brief has a ranked attention feed, data-mode pills use semantic source classes, and data-mode changes are announced politely for assistive tech.
- Import previews now keep tickers as plain text until Tucker applies the import, preventing accidental navigation away from the validation step.
- Source-state handling is more honest: configured provider readiness no longer reads as Live before successful data arrives, missing quote rows map to Partial data, and public disclosure datasets are labeled as imported context instead of real-time live activity.
- Market Intelligence ticker cards show fewer top-row badges and move quant/peer/history details into the existing score details area.
- Daily mover labels now prefer holding-level quote/source status so missing, stale, cached, or imported movement is not mislabeled by the global market-data state.
- Steve-level command-center polish pass: the app shell now has a tighter primary workflow, quieter advanced-tool navigation, a smaller product header, and less repeated guidance on deep screens.
- Daily Command Brief cards now read title-first with distinct Action / Watch / Info badges instead of reusing sample/demo status styling.
- Imports now refresh market-data snapshots after accepted holdings apply, so the imported portfolio has a cleaner path into Finnhub-backed quote context.
- Data Sources now keeps diagnostics and provider readiness in collapsed details, hides unavailable live-sync buttons, and labels imported Fidelity/Seeking Alpha data as Imported instead of Not configured.
- Overview market-intelligence copy now says “Local confluence” with the current market-data mode instead of implying sample data when the market snapshot is live/cached/stale.
- Reduced-motion support and missing design tokens were added so the Apple-style UI behaves more consistently across system preferences.
- Fidelity's former no-op live-connector surface is now replaced with the approved local Plaid flow. Seeking Alpha still emphasizes working local CSV/XLSX/JSON imports and sample workflows until a compliant licensed provider is approved.
- The local server/module-loading path is fixed by renaming a helper that matched the static server’s secret-like filename denylist.
- Risk / Concentration now shows a real correlation/overlap panel: measured return correlations appear when market-data history exists, with theme-overlap fallback when it does not.
- Real-data repair pass: Tucker's May 22 Fidelity CSV shape now imports 41 accepted holdings while keeping unresolved symbol-less holding-like rows visible for review instead of blocking the whole portfolio.
- Import diagnostics now show accepted rows, rows needing review, skipped non-holding rows, detected columns, mapped fields, total imported value, and row-level reasons before apply.
- Finnhub diagnostics on Data Sources now show provider selected, key-present yes/no, last request, requested tickers, successful/missing responses, cache status, truncation, and last error without exposing the API key.
- Market-data ticker selection now uses the active portfolio, skips cash-like holdings before live quote requests, and keeps default research tickers out of real imported portfolio quote refreshes.
- Active portfolio state is now centralized so imported CSV, imported JSON, sample load, provider sync, restored local holdings, and cleared portfolio states flow consistently into portfolio-driven screens.
- Daily Command Brief now treats partial imports with accepted holdings and repaired local holdings as active local portfolios while still warning Tucker to review problem rows or re-import source files.
- CSV/JSON imports and tokenized provider syncs invalidate stale market-data snapshots and reviewed/hidden alert lifecycle state so old portfolio context does not leak into the new portfolio.
- Fidelity/provider holdings sync now replaces the active portfolio and writes a local source report instead of merging into stale/sample holdings.
- Settings now includes a local “Clear portfolio data” control for removing holdings/import state while keeping watchlist, journal, settings, and provider placeholders.
- Ticker pages now distinguish Owned, Watchlist / not owned, Signal / not owned, and Not owned states.
- Sample market data snapshots use deterministic freshness handling so sample quote context stays labeled as Sample rather than drifting into misleading stale/live labels.
- Dashboard polish makes the first screen more action-oriented: portfolio value, Daily Command Brief, risk, alerts, market intelligence, and data health now form the primary command grid.
- The Overview Daily Brief card now shows Action, Watch, and Info counts plus the first item to inspect, with links to the relevant ticker or deep screen.
- Planning workflows such as Targets, What-If, Watchlist, Journal, and Alpha Engine remain available as quieter shortcuts instead of competing with the daily review queue.
- Daily Brief queues now include compact group summaries and contextual CTA labels such as “Open ticker,” “Review alerts,” and “Check sources.”
- Week 6 UX polish adds concise What / Why / Next guidance to every major screen so each route has a clear purpose, reason, and next inspection path.
- Overview and Daily Brief copy now reads more like a calm command brief, with fewer internal labels and less repeated mock/live explanation above the fold.
- Dense editor workflows in Calendar, Watchlist, and Decision Journal are visually softer so the primary review content has stronger hierarchy.
- What-If scenario controls now hide irrelevant fields for the selected scenario type, reducing visual noise without changing simulator math.
- Ticker pages now link missing thesis, watchlist, and calendar context to the exact screen that can fill the gap.
- Holdings table readability is improved with a wider table layout and sticky ticker column for horizontal scanning.
- Keyboard focus treatment is stronger and easier to see on desktop and mobile.
- Source-action labels now say “Try configured…” or “Start connector,” reducing confusion between mock/imported modes and live connections.
- Week 5 workflow QA now verifies the full daily decision loop: Daily Command Brief, Alerts, ticker signals, ticker pages, Watchlist / Ideas, Decision Journal, What-If Simulator, and Risk / Concentration.
- Repeated controls now have more specific accessibility labels, including journal edit/delete, calendar edit/delete, ticker-page decision logging, watchlist state changes, and signal-to-watchlist actions.
- What-If Simulator result messages now explicitly state that real holdings were not changed, and risk increases are no longer styled as positive improvements.
- Empty-portfolio concentration analytics now return safe zero weights instead of `NaN`.
- What-If grids have additional mobile stacking coverage for narrow screens.
- Local-first portfolio command center with focused routes for Overview, Imports, Holdings, Risk, Targets, Thesis, Alerts, Alpha Engine, Market Intelligence, Signal Review, Data Sources, Settings, and ticker detail pages.
- Watchlist / Idea Pipeline workflow for researching, watching, candidate, rejected, and owned tickers, with local idea notes, catalysts, entry zones, risk notes, conviction, source, and review dates.
- Ticker signals can be promoted into local watchlist ideas without changing real holdings or implying a trade.
- Decision Journal workflow for buy, sell, hold, trim, add, watch, and reject decision notes, with local thesis/risk/catalyst notes, conviction, and optional signal score snapshots.
- Ticker detail pages now show recent journal history for that ticker so the reasoning trail is visible next to quote, exposure, alert, and thesis context.
- Earnings and Event Calendar MVP with a dedicated Calendar screen, mock/importable/manual event rows, CSV/JSON import, custom local events, low/medium/high importance, and source labels that distinguish mock, imported, manual, stale, error, and future live rows.
- Daily Command Brief, Market Intelligence, and ticker detail pages now surface upcoming event review windows without pretending mock dates are live earnings data.
- Portfolio What-If Simulator MVP with a dedicated read-only screen for modeling add, trim, remove, and rebalance-to-target scenarios against current holdings. It shows before/after cash, ticker weights, sector weights, concentration, leveraged ETF exposure, and local alerts triggered/resolved without changing real holdings.
- “Why Is This Moving?” ticker-page explainer that uses only structured app data such as quote move, volume, peer/benchmark context, Reddit acceleration, politician disclosures, events, alerts, and journal notes. It labels missing context and does not invent news causation.
- Daily Command Brief screen that groups what changed today into Action needed, Watch closely, and Informational, with links to ticker pages and deep-dive screens.
- Decision-grade Risk / Concentration screen with top position weights, sector/account/theme concentration, leveraged ETF notional exposure, individual stock vs ETF mix, cash exposure, threshold status labels, and practical review explanations.
- Hardened holdings imports for Fidelity-style CSV, generic brokerage CSV, and holdings JSON, including preview-before-apply, duplicate lot reporting, bad-row review, account preservation, stale holding repair, and torture-test fixtures.
- Fidelity CSV imports now tolerate trailing empty cells and safely repair split thousands-formatted numeric values without shifting columns; zero-holding failed imports no longer present an applyable portfolio preview.
- Safer local backend/proxy via `npm run dev`, including `.env`/dotfile/secret-file denial, request-size and ticker fan-out limits, provider error redaction, and automatic fallback to the next available local port when the default port is busy.
- Backend-only Finnhub market data path with mocked live-provider coverage for quote/profile/candle data, cache behavior, stale/error/mock/cached labels, invalid ticker handling, and no browser-exposed API keys. Financial Modeling Prep remains available as an explicit fallback provider.
- Data Sources now has an opt-in Live mode that auto-refreshes market data through the local cache-aware backend proxy without exposing API keys or bypassing provider TTLs.
- Finnhub provider status now distinguishes Rate limited and Partial data states, and candle volume can populate quote volume when Finnhub quote data does not include volume directly.
- Alpha Engine now starts with ranked decision-support recommendations that combine confidence, impact, recency, urgency, data quality, risk-adjusted fit, active portfolio ownership, source freshness, alert severity, price movement, and concentration risk. Cards explain why each item ranks highly, show missing/weak data, and keep trade-command language out of the workflow.
- Institutional Quant Lens v1.3 adds paper-backed academic factor discipline on top of the dedicated stock-quality score. It scores business quality, price momentum, estimate revisions, valuation discipline, risk control, liquidity/capacity, portfolio fit, data quality, and factor-validation discipline, then shows gross-profitability, skip-period momentum, value/momentum balance, overfit-risk warnings, factor coverage labels, evidence caps, and missing-data warnings on ticker pages and Market Intelligence.
- The Quant Lens now caps high-looking raw scores when critical evidence is missing, and it avoids double-counting broad Seeking Alpha Quant inside business quality.
- Evidence-cap reasons can now appear as warnings without falsely saying the displayed score was reduced when the raw score was already below the cap.
- The Quant Lens now handles funds and leveraged ETFs as exposure-review instruments instead of operating-company stock-quality candidates, normalizes percent-style daily moves, and sorts dated historical price rows before momentum/drawdown calculations.
- The Quant Lens now adds peer-context labels and local score-history labels so ticker pages and Market Intelligence can show comparable-rank context and whether a score is new, improving, stable, or deteriorating.
- Quant score history is stored as compact local score metadata only and remains separated between Sample and Imported portfolio modes.
- Alpha recommendations can now cite Institutional Quant Lens support or missing factor data without turning the rank into a black-box buy/sell recommendation.
- Alpha Engine quality ranking now uses the Institutional Quant Lens and academic factor discipline as first-class holding-quality inputs, while keeping review priority separate from quality and preserving no-trade-command guardrails.
- Quant/Alpha documentation now spells out the no-fake-precision display contract: whole-number review scores, coverage/confidence/source labels, evidence-cap warnings, academic validation warnings, and no conversion of factor scores into expected returns, price targets, probabilities, or trade instructions.
- App shell and Data Sources now use one data-mode vocabulary: Sample, Imported, Live, Cached, Stale, Error, and Not configured. The header shows persistent Portfolio and Market data modes so sample data cannot quietly look imported or live.
- Internal provider states still capture implementation detail, but the UI collapses them into Sample, Imported, Live, Cached, Stale, Error, or Not configured.
- Real Data Week QA tightened sample/imported separation across Alpha recommendations, ticker signals, and ticker pages. Sample holdings now render as Sample position/sample portfolio context instead of Owned or active-portfolio context.
- Finnhub setup and Fidelity-style portfolio import docs now explain the local `.env`, server-side proxy, Sample fallback, import preview, skipped non-holding rows, and source-status expectations.
- Risk / Concentration rows now keep ticker symbols, company names, status badges, metrics, and review actions readable instead of collapsing into one-character columns.
- Config-gated Reddit and politician-trade provider paths that default to sample/local mode and avoid scraping, cookies, usernames, or credentials in browser state.
- Ticker intelligence pages with owned/watchlist/discovered states, account exposure, quote status, signal context, Reddit and politician placeholders/imported rows, thesis context, related alerts, and data-quality notes.
- Signal Review / backtesting-lite screen for exploratory signal-score review and available 1/5/20 trading-day forward-return checks without prediction or trading-command language.
- Accessibility and mobile polish for route focus, live-region discipline, contextual repeated-control labels, keyboard-accessible imports, segmented controls, sortable table semantics, and responsive navigation/cards.
- Security/privacy hardening: no detected committed keys, tokens, passwords, private keys, brokerage credentials, or account-number exports; account-number labels are masked; Reddit usernames are omitted; rejected-row reports redact secret-like values.
- Fidelity CSV import hardening now maps additional production-style headers, converts per-share cost basis into total cost basis, blocks applying previews with malformed holding rows, keeps harmless Fidelity footer rows as skipped non-holding rows, and prevents default sample research tickers from appearing as portfolio action items after a real import.
- Transparent Prediction Model v1 adds a bounded 20-trading-day model-implied outlook for ticker pages and Alpha context. It shows factor weights, confidence, top drivers, weak signals, source freshness, and caveats while explicitly avoiding target, guarantee, or trade-order language.
- Seeking Alpha AI personal import lets Tucker paste or locally import Ask Seeking Alpha, Virtual Analyst, AI Summary Report, JSON/text, or saved-HTML report content through a preview-before-save workflow. The app stores only capped/redacted local report context, labels it as personal import data, rejects cookies/session/token-like content, and does not ask for or store Seeking Alpha credentials.

## Verification

Release-candidate gate:

```bash
npm run lint
npm run validate:data
npm run test
npm run smoke
npm run check
git diff --check
```

Provider tests use mocked network responses and do not require live API availability. Local HTTP checks verified the app shell, `/api/config`, and mock market-data fallback through the safe local server.

## Known Limitations

- Rendered browser click-through automation was unavailable in this session, so real DOM clicks/uploads/settings changes are covered by deterministic workflow tests, source-level smoke checks, and unit tests rather than browser-driven end-to-end tests.
- Live provider behavior is still local and credential-gated; real provider rate limits, schema drift, outages, and credential failures should be dry-run locally before regular live use.
- Ticker scores and Signal Review are exploratory decision-support signals, not a validated strategy, AI prediction system, or trading advice.
- Institutional Quant Lens uses available imported/local/live-cached data only. It is not a Goldman Sachs proprietary model, return forecast, price target, or trading recommendation.
- What-If scenarios are read-only models. There is no apply-to-portfolio workflow, no brokerage execution, and no assumption that a modeled add/trim/remove is appropriate for taxes, liquidity, or account constraints.
- No production authentication, cloud sync, encrypted multi-user brokerage token vault, external notifications, or trade execution is included. The Plaid token file is local-only, gitignored, and blocked from static serving, but not a production custody system.

## Suggested Week 5 Focus

- Add rendered browser smoke tests when Browser automation is available.
- Add settings export/import for local thresholds, watchlist preferences, and stale-data configuration.
- Add a provider-credential dry-run checklist for Tucker's local `.env`.
- Harden one approved live-provider path at a time, keeping credentials server-side and behavior clearly labeled.
