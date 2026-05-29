import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const appJs = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const portfolioViewJs = readFileSync(new URL("../src/portfolioView.js", import.meta.url), "utf8");
const routerJs = readFileSync(new URL("../src/router.js", import.meta.url), "utf8");

const weekTwoRoutes = [
  "overview",
  "daily",
  "calendar",
  "imports",
  "holdings",
  "risk",
  "risk-guardrails",
  "what-if",
  "targets",
  "thesis",
  "journal",
  "watchlist",
  "alerts",
  "ticker",
  "alpha",
  "market-drivers",
  "market-intelligence",
  "signal-review",
  "data-sources",
  "settings"
];

test("route changes have a live announcement and focus target", () => {
  assert.match(indexHtml, /id="mainContent" tabindex="-1"/);
  assert.match(indexHtml, /class="skip-link" href="#mainContent">Skip to content/);
  assert.match(indexHtml, /id="routeStatus" class="sr-only" aria-live="polite"/);
  assert.match(appJs, /function routeFromHash/);
  assert.match(routerJs, /function safeDecodeHash/);
  assert.match(routerJs, /function parseTickerRoute/);
  assert.match(appJs, /history\.replaceState/);
  assert.match(appJs, /function focusActiveScreen/);
  assert.match(appJs, /previousRoute !== null \|\| route !== "overview"/);
  assert.match(appJs, /window\.scrollTo\(\{ top: 0, left: 0, behavior: "auto" \}\)/);
});

test("Week 2 routes have focused screens and sidebar navigation", () => {
  for (const route of weekTwoRoutes) {
    assert.match(indexHtml, new RegExp(`data-screen="${route}"`), `${route} screen should exist`);
    assert.match(routerJs, new RegExp(`${JSON.stringify(route)}|${route}: \\{ title:`), `${route} route metadata should exist`);
  }

  assert.match(indexHtml, /<section class="screen" id="overview" data-screen="overview" aria-label="Portfolio overview">/);
  assert.match(indexHtml, /<section class="screen" id="holdings" data-screen="holdings" aria-label="Holdings" hidden>/);
  assert.match(indexHtml, /<section class="screen" id="risk" data-screen="risk" aria-label="Risk and concentration" hidden>/);
  assert.match(indexHtml, /<section class="screen" id="risk-guardrails" data-screen="risk-guardrails" aria-label="Equity Risk Guardrails" hidden>/);
  assert.match(indexHtml, /<section class="screen" id="what-if" data-screen="what-if" aria-label="Portfolio What-If Simulator" hidden>/);
  assert.match(indexHtml, /<section class="screen" id="ticker" data-screen="ticker" aria-label="Ticker intelligence" hidden>/);
  assert.match(indexHtml, /<section class="screen" id="signal-review" data-screen="signal-review" aria-label="Signal Review" hidden>/);
  assert.match(appJs, /document\.querySelectorAll\("\[data-screen\]"\)\.forEach/);
  assert.match(appJs, /screen\.hidden = screen\.dataset\.screen !== route/);
  assert.match(appJs, /activeNavRoute = route === "ticker" \? "holdings" : route/);
});

test("overview summary cards route to Week 2 deep-dive screens", () => {
  const expectedCardRoutes = [
    "#holdings",
    "#daily",
    "#calendar",
    "#risk",
    "#risk-guardrails",
    "#what-if",
    "#thesis",
    "#journal",
    "#watchlist",
    "#alerts",
    "#market-drivers",
    "#market-intelligence",
    "#data-sources"
  ];

  for (const route of expectedCardRoutes) {
    assert.match(indexHtml, new RegExp(`data-route="${route}"|href="${route}"`), `Overview should link to ${route}`);
  }

  assert.match(appJs, /function handleDigestRouteClick/);
  assert.match(appJs, /window\.location\.hash = route/);
  assert.match(indexHtml, /<article class="digest-card" data-route="#risk" role="link" tabindex="0"/);
  assert.match(indexHtml, /<a class="button-link" href="#risk">Review risk<\/a>/);
  assert.match(indexHtml, /<article class="digest-card" data-route="#risk-guardrails" role="link" tabindex="0"/);
  assert.match(indexHtml, /<a class="button-link" href="#risk-guardrails">Open guardrails<\/a>/);
  assert.match(indexHtml, /<article class="digest-card" data-route="#market-intelligence" role="link" tabindex="0"/);
  assert.match(indexHtml, /<a class="button-link" href="#market-intelligence">Open Market Intelligence<\/a>/);
  assert.match(indexHtml, /<article class="digest-card" data-route="#market-drivers" role="link" tabindex="0"/);
  assert.match(indexHtml, /<a class="button-link" href="#market-drivers">Explain today’s move<\/a>/);
});

test("ticker detail route keeps native anchor and route announcement behavior", () => {
  assert.match(indexHtml, /data-screen="ticker"/);
  assert.match(indexHtml, /id="tickerDetailPanel"/);
  assert.match(routerJs, /canonicalHash: `#\/ticker\/\$\{encodeURIComponent\(ticker\)\}`/);
  assert.match(appJs, /selectedTicker: routeFromHash\(\)\.ticker/);
  assert.match(appJs, /window\.location\.hash \|\| pathRoute/);
  assert.match(appJs, /window\.addEventListener\("hashchange", render\)/);
  assert.match(portfolioViewJs, /export function renderTickerLink/);
  assert.match(portfolioViewJs, /function renderTickerDetailPage/);
  assert.match(portfolioViewJs, /href="\$\{tickerDetailHash\(normalized\)\}"/);
  assert.match(portfolioViewJs, /function buildTickerContextLinks/);
  assert.match(portfolioViewJs, /href: "#holdings"/);
  assert.match(portfolioViewJs, /href: "#watchlist"/);
  assert.doesNotMatch(portfolioViewJs, /data-ticker-link[^\\n]+role="link"/);
  assert.doesNotMatch(portfolioViewJs, /data-ticker-link[^\\n]+tabindex="0"/);
});

test("sample, imported, live, cached, stale, error, and not-configured provider states are labeled clearly", () => {
  assert.match(indexHtml, /Source-labeled read-throughs showing how events connect to portfolio exposure\./);
  assert.match(indexHtml, /Events stay readable: cards show only compact source-mix badges, with X\/social, Reddit, and federal disclosure details tucked into Details\./);
  assert.match(indexHtml, /Federal disclosures are delayed and source-labeled; no real-time trade alert is implied\./);
  assert.match(indexHtml, /disclosure rows are delayed context, not live trade alerts\./);
  assert.match(indexHtml, /X \/ Twitter source: Sample\/local by default; live API requires a local bearer token and explicit enable flag\./);
  assert.match(indexHtml, /Sample Reddit mode active\. Live API: Not configured\./);
  assert.match(indexHtml, /Sample, Imported, Live, Cached, Stale, Error, and Not configured states\./);
  assert.match(indexHtml, /id="dataModeIndicator"/);
  assert.match(indexHtml, /id="marketDataLiveModeToggle" type="checkbox"/);
  assert.match(indexHtml, /id="marketDataLiveModeInterval"/);
  assert.match(indexHtml, /id="marketDataLiveModeStatus" class="connector-status" aria-live="polite"/);
  assert.match(appJs, /growthDashboardMarketDataLiveMode/);
  assert.match(appJs, /function scheduleMarketDataLiveMode/);
  assert.match(appJs, /function deferMarketDataRefreshDuringBackoff/);
  assert.match(appJs, /manual refresh deferred/);
  assert.match(appJs, /document\.addEventListener\("visibilitychange", scheduleMarketDataLiveMode\)/);
  assert.match(appJs, /window\.addEventListener\("beforeunload", clearMarketDataLiveModeTimer\)/);
  assert.match(appJs, /manualRefreshMarketDataSnapshot\(\)/);
  assert.match(appJs, /refreshMarketDataSnapshot\(\{ renderAfter: true, reason: "live-mode" \}\)/);
  assert.match(portfolioViewJs, /Sample market data/);
  assert.match(portfolioViewJs, /Not configured/);
  assert.match(portfolioViewJs, /dataModeLabel\(DATA_MODES\.LIVE\)/);
  assert.match(portfolioViewJs, /Imported/);
  assert.match(portfolioViewJs, /API keys to browser code/);
  assert.match(portfolioViewJs, /not a recommendation to buy or sell/);
  assert.match(portfolioViewJs, /readiness\.liveProviderCalls \? "Live server proxy enabled" : "Live event\/news: Not configured"/);
  assert.match(portfolioViewJs, /redditSource\.live/);
  assert.match(portfolioViewJs, /configured: \[DATA_MODES\.LIVE, DATA_MODES\.CACHED, DATA_MODES\.IMPORTED\]\.includes\(redditSource\.mode\)/);
  assert.match(portfolioViewJs, /politicianProviderSynced/);
  assert.match(portfolioViewJs, /configured: \[DATA_MODES\.LIVE, DATA_MODES\.CACHED, DATA_MODES\.IMPORTED\]\.includes\(politicianSource\.mode\)/);
  assert.match(portfolioViewJs, /export function dataSourceAvailabilityMode/);
  assert.match(portfolioViewJs, /if \(row\.demoReady\) return DATA_MODES\.SAMPLE/);
  assert.match(portfolioViewJs, /return dataModeLabel\(dataSourceAvailabilityMode\(row\)\)/);
});

test("demo and research-only imports cannot masquerade as real holdings", () => {
  assert.match(appJs, /function loadSampleData\(\) \{/);
  assert.match(appJs, /mode: "sample-demo"/);
  assert.match(appJs, /state\.latestImportReport = null/);
  assert.match(appJs, /function seekingAlphaEnrichmentByTicker/);
  assert.match(appJs, /state\.holdings = normalizeHoldings\(state\.holdings\.map/);
  assert.doesNotMatch(appJs, /function mergeSeekingAlphaRecords\(records, mode\) \{\s*mergeImportedRecords\(records\)/);
});

test("overview route cards avoid nested interactive keyboard traps", () => {
  assert.match(indexHtml, /data-route="#risk"/);
  assert.match(indexHtml, /data-route="#daily" role="link" tabindex="0"/);
  assert.match(indexHtml, /aria-label="Open Risk and Concentration from concentration warnings card"/);
  assert.match(indexHtml, /<article class="digest-card" data-route="#risk" role="link" tabindex="0"/);
  assert.match(indexHtml, /<a class="button-link" href="#risk">Review risk<\/a>/);
  assert.match(indexHtml, /\.digest-card\[data-route\]:hover,\s*\.digest-card\[data-route\]:focus-within/s);
});

test("mobile navigation keeps secondary research routes reachable", () => {
  assert.match(indexHtml, /<details class="nav-more" open>/);
  assert.doesNotMatch(indexHtml, /aside \.nav-more,\s*\.sidebar-card/s);
  assert.match(indexHtml, /@media \(max-width: 720px\)[\s\S]*aside \.nav-more\s*\{\s*display: contents;/);
  assert.match(indexHtml, /@media \(max-width: 720px\)[\s\S]*aside \.nav-more summary\s*\{\s*display: none;/);
  for (const route of ["#calendar", "#what-if", "#targets", "#thesis", "#watchlist", "#journal", "#market-drivers", "#market-intelligence", "#signal-review", "#settings"]) {
    assert.match(indexHtml, new RegExp(`<a href="${route}">`), `${route} should remain present in mobile nav source`);
  }
});

test("file inputs remain keyboard accessible through focusable controls", () => {
  assert.doesNotMatch(indexHtml, /\.button-label input\s*\{\s*display:\s*none/s);
  assert.match(indexHtml, /\.button-label:focus-within/);
  assert.match(indexHtml, /id="fidelityFile" type="file"[^>]+aria-label="Import Fidelity CSV or holdings JSON file"/);
  assert.match(indexHtml, /id="stateFile" type="file"[^>]+aria-label="Import dashboard state JSON file"/);
  assert.match(indexHtml, /id="stateRestorePreview" class="state-restore-preview" hidden/);
  assert.match(appJs, /data-state-restore-action/);
  assert.match(appJs, /Backup preview ready/);
  assert.match(indexHtml, /id="redditJsonFile" type="file"[^>]+aria-label="Import Reddit mention JSON file"/);
  assert.match(indexHtml, /id="politicianTradesFile" type="file"[^>]+aria-label="Import federal disclosure CSV or JSON file"/);
});

test("sortable holdings columns preserve table header semantics", () => {
  assert.doesNotMatch(indexHtml, /<th data-sort-key="[^"]+"[^>]+role="button"/);
  assert.match(indexHtml, /<caption class="sr-only">Portfolio holdings, sortable by column<\/caption>/);
  assert.match(indexHtml, /<th scope="col" data-sort-key="ticker"><button class="sort-button" type="button">Ticker<\/button><\/th>/);
  assert.match(portfolioViewJs, /<th scope="row"><b>\$\{renderTickerLink\(holding\.ticker\)\}<\/b><span>\$\{escapeHtml\(holding\.name\)\}<\/span><\/th>/);
  assert.match(indexHtml, /#portfolioHoldingsTable tbody th:first-child/);
  assert.doesNotMatch(indexHtml, /th\[data-sort-key\]::after/);
  assert.match(indexHtml, /\.sort-button::after\s*\{[\s\S]*content:\s*"[^"]+"/);
  assert.match(indexHtml, /th\[data-sort-key\]\.sort-active \.sort-button::after/);
  assert.match(indexHtml, /th\[data-sort-key\]\s*\{[\s\S]*cursor:\s*default/);
  assert.match(indexHtml, /\.sort-button\s*\{[\s\S]*cursor:\s*pointer/);
  assert.match(indexHtml, /id="holdingSortStatus" class="disclaimer" aria-live="polite"/);
  assert.match(appJs, /aria-sort/);
  assert.match(appJs, /Activate a column heading to sort/);
});

test("Alpha Engine uses a semantic holdings ranking table with native details", () => {
  assert.match(indexHtml, /Evidence Quality Ranking/);
  assert.match(indexHtml, /\.alpha-ranking-table/);
  assert.match(indexHtml, /<option value="all">All holdings<\/option>/);
  assert.match(portfolioViewJs, /<table class="alpha-ranking-table">/);
  assert.match(portfolioViewJs, /<th scope="col">Rank<\/th>/);
  assert.match(portfolioViewJs, /<th scope="col">Holding<\/th>/);
  assert.match(portfolioViewJs, /<th scope="col">Quality score<\/th>/);
  assert.match(portfolioViewJs, /<th scope="col">Review priority<\/th>/);
  assert.match(portfolioViewJs, /<details class="alpha-rank-details">/);
  assert.match(portfolioViewJs, /<summary aria-label="Explain Alpha Engine score for \$\{escapeHtml\(row\.ticker\)\}">Explain score<\/summary>/);
  assert.match(portfolioViewJs, /renderTransparentScoreBreakdown/);
  assert.match(portfolioViewJs, /Calculated local score; not an AI explanation/);
  assert.match(portfolioViewJs, /The Quant Lens is now a first-class Alpha quality input/);
  assert.match(indexHtml, /Quality score = Institutional Quant Lens \+ academic factor discipline \+ thesis \+ source quality/);
  assert.match(indexHtml, /Review priority is a separate urgency read/);
  assert.match(portfolioViewJs, /Open \$\{escapeHtml\(row\.ticker\)\} analysis/);
  assert.doesNotMatch(indexHtml, /Ranked Recommendations/);
});

test("generated repeated controls have contextual accessible names", () => {
  assert.match(portfolioViewJs, /aria-label="Mark reviewed: \$\{actionLabel\}"/);
  assert.match(portfolioViewJs, /aria-label="Hide alert: \$\{actionLabel\}"/);
  assert.match(portfolioViewJs, /aria-label="Target weight for \$\{accessibleLabel\}"/);
  assert.match(portfolioViewJs, /aria-label="Minimum weight for \$\{accessibleLabel\}"/);
  assert.match(portfolioViewJs, /aria-label="Maximum weight for \$\{accessibleLabel\}"/);
  assert.match(portfolioViewJs, /aria-label="Priority for \$\{accessibleLabel\}"/);
  assert.match(portfolioViewJs, /aria-label="Notes for \$\{accessibleLabel\}"/);
});

test("mobile navigation remains responsive and stale advanced filters are removed", () => {
  assert.doesNotMatch(indexHtml, /Advanced dashboard filters/);
  assert.doesNotMatch(indexHtml, /data-horizon="/);
  assert.doesNotMatch(appJs, /document\.querySelectorAll\("\[data-horizon\]"\)/);
  assert.match(indexHtml, /@media \(max-width: 720px\)[\s\S]*\.workspace-nav\s*\{[\s\S]*display: grid;[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(indexHtml, /@media \(max-width: 720px\)[\s\S]*\.nav-group\s*\{[\s\S]*display: contents/);
  assert.match(indexHtml, /@media \(max-width: 720px\)[\s\S]*\.sidebar-card\.account-scope-card\s*\{[\s\S]*display: block/);
  assert.match(indexHtml, /@media \(max-width: 720px\)[\s\S]*\.panel-head\s*\{[\s\S]*flex-direction: column/);
  assert.match(indexHtml, /@media \(max-width: 720px\)[\s\S]*\.import-actions \.live-mode-toggle,[\s\S]*\.import-actions \.live-mode-interval,[\s\S]*\.connector-actions button,[\s\S]*width: 100%/);
  assert.match(indexHtml, /@media \(max-width: 720px\)[\s\S]*\.mini-list > div,[\s\S]*\.stress-row\s*\{[\s\S]*grid-template-columns: 1fr/);
});

test("brief and risk layouts do not collapse labels into one-character columns", () => {
  assert.doesNotMatch(indexHtml, /\.mini-list div\b/, "generic mini-list styles must not target nested risk-row divs");
  assert.match(indexHtml, /\.mini-list > div/);
  assert.match(indexHtml, /\.mini-list > \.empty\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.doesNotMatch(indexHtml, /overflow-wrap:\s*anywhere/);
  assert.match(indexHtml, /\.daily-brief-item-top \.status-badge\s*\{[\s\S]*white-space:\s*nowrap/);
  assert.match(indexHtml, /\.ticker-chips span,[\s\S]*\.ticker-chips a\s*\{[\s\S]*white-space:\s*nowrap/);
  assert.match(indexHtml, /\.risk-row\s*\{[\s\S]*grid-template-columns:\s*minmax\(18rem, 1fr\) max-content/);
  assert.match(indexHtml, /\.risk-row-main\.ranked\s*\{[\s\S]*grid-template-columns:\s*auto minmax\(0, 1fr\)/);
  assert.match(indexHtml, /\.risk-row-main > div\s*\{[\s\S]*min-width:\s*0/);
  assert.match(indexHtml, /\.risk-row-main b,[\s\S]*\.risk-row-main a\s*\{[\s\S]*word-break:\s*keep-all/);
  assert.doesNotMatch(indexHtml, /\.risk-row-main b,\s*[\r\n]+\s*\.risk-row-main span/);
  assert.match(indexHtml, /\.risk-row-value\s*\{[\s\S]*min-width:\s*8\.5rem/);
  assert.match(indexHtml, /\.risk-row-value \.button-link,[\s\S]*\.risk-row \.compact-link\s*\{[\s\S]*white-space:\s*nowrap/);
  assert.match(indexHtml, /\.leveraged-scenario-grid\s*\{[\s\S]*repeat\(auto-fit, minmax\(8rem, 1fr\)\)/);
  assert.match(portfolioViewJs, /<article id="riskLeveragedVolatilityDragModule" class="leveraged-education">/);
  assert.match(indexHtml, /\.market-tape-scroll\s*\{[\s\S]*max-width:\s*100%[\s\S]*overflow-x:\s*auto/);
  assert.match(indexHtml, /@media \(max-width: 720px\)[\s\S]*\.workspace-nav\s*\{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(indexHtml, /\.risk-row > p\s*\{[\s\S]*grid-column:\s*1 \/ -1/);
  assert.match(indexHtml, /\.risk-status\s*\{[\s\S]*white-space:\s*nowrap/);
  assert.match(indexHtml, /\.guardrail-table\s*\{[\s\S]*min-width:\s*1320px/);
  assert.match(indexHtml, /\.guardrail-table th,[\s\S]*\.guardrail-table td\s*\{[\s\S]*white-space:\s*nowrap/);
  assert.match(indexHtml, /\.guardrail-table td:last-child\s*\{[\s\S]*white-space:\s*normal/);
  assert.match(indexHtml, /\.risk-action-pill\s*\{[\s\S]*display:\s*inline-flex/);
  assert.match(indexHtml, /\.market-driver-row\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(180px, 260px\)/);
  assert.match(indexHtml, /@media \(max-width: 1080px\)[\s\S]*\.market-driver-hero-grid,[\s\S]*\.market-driver-row\s*\{[\s\S]*grid-template-columns: 1fr/);
  assert.match(indexHtml, /\.market-driver-card h3,[\s\S]*\.market-driver-row h3\s*\{[\s\S]*word-break:\s*normal/);
});
