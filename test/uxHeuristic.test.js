import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const appJs = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const portfolioViewJs = readFileSync(new URL("../src/portfolioView.js", import.meta.url), "utf8");

const screens = [...indexHtml.matchAll(/<section class="screen" id="([^"]+)" data-screen="([^"]+)"/g)]
  .map((match) => match[2]);

test("every major screen has a concise what/why/next guide", () => {
  assert.equal((indexHtml.match(/class="screen-guidance"/g) || []).length, screens.length);
  assert.equal((indexHtml.match(/<span>What<\/span>/g) || []).length, screens.length);
  assert.equal((indexHtml.match(/<span>Why<\/span>/g) || []).length, screens.length);
  assert.equal((indexHtml.match(/<span>Next<\/span>/g) || []).length, screens.length);
  assert.equal((indexHtml.match(/aria-label="[^"]+ guide"/g) || []).length, screens.length);
});

test("UX copy avoids dead-end and execution-oriented labels", () => {
  assert.match(indexHtml, /Record decision notes, not trades\./);
  assert.match(indexHtml, /Review \/ entry zone/);
  assert.match(indexHtml, /Check Reddit source/);
  assert.match(indexHtml, /Check disclosure source/);
  assert.match(indexHtml, /Import Fidelity CSV/);
  assert.match(indexHtml, /Connect Fidelity with Plaid/);
  assert.match(indexHtml, /Sync linked holdings/);
  assert.match(indexHtml, /Sample Premium insights/);
  assert.doesNotMatch(`${indexHtml}\n${portfolioViewJs}`, /Recommended action/);
  assert.doesNotMatch(indexHtml, /Target entry zone/);
  assert.doesNotMatch(indexHtml, /Start Fidelity connector/);
  assert.doesNotMatch(indexHtml, /Start SA connector/);
  assert.doesNotMatch(indexHtml, /Sync ratings/);
  assert.doesNotMatch(indexHtml, /Connect SA/);
  assert.doesNotMatch(portfolioViewJs, /Review classifications<\/button>/);
});

test("dense workflows expose calmer hierarchy and contextual fields", () => {
  assert.match(indexHtml, /\.panel\.secondary-panel/);
  assert.match(indexHtml, /<div class="panel secondary-panel">/);
  assert.match(indexHtml, /data-what-if-field="amount"/);
  assert.match(indexHtml, /data-what-if-field="percent"/);
  assert.match(indexHtml, /data-what-if-field="target"/);
  assert.match(indexHtml, /data-what-if-field="funding"/);
  assert.match(appJs, /function updateWhatIfInputVisibility/);
  assert.match(appJs, /field\.hidden = visibility\[key\] === false/);
  assert.match(indexHtml, /#portfolioHoldingsTable\s*\{[\s\S]*min-width: 2100px/s);
  assert.match(indexHtml, /#portfolioHoldingsTable thead th:first-child,[\s\S]*#portfolioHoldingsTable tbody th:first-child,[\s\S]*#portfolioHoldingsTable td:first-child/s);
});

test("mobile holdings table preserves row-level risk labels", () => {
  assert.match(indexHtml, /#portfolioHoldingsTable th:nth-child\(n\+7\):not\(:nth-child\(9\)\):not\(:nth-child\(11\)\):not\(:nth-child\(14\)\):not\(:nth-child\(15\)\)/);
  assert.doesNotMatch(indexHtml, /#portfolioHoldingsTable th:nth-child\(n\+7\):not\(:nth-child\(9\)\):not\(:nth-child\(11\)\):not\(:nth-child\(13\)\):not\(:nth-child\(14\)\)/);
});

test("ticker pages link missing context to the screen that can fix it", () => {
  assert.match(portfolioViewJs, /href="#thesis">Open Thesis/);
  assert.match(portfolioViewJs, /href="#watchlist">Open Watchlist/);
  assert.match(portfolioViewJs, /href="#calendar">Open Calendar/);
  assert.match(portfolioViewJs, /Suggested review:/);
});

test("ticker pages summarize recent social news and disclosure updates honestly", () => {
  assert.match(portfolioViewJs, /Recent Social, News & Disclosure Updates/);
  assert.match(portfolioViewJs, /X: Not configured or no rows/);
  assert.match(portfolioViewJs, /Reddit: Not configured or no rows/);
  assert.match(portfolioViewJs, /News\/read-throughs: none linked/);
  assert.match(portfolioViewJs, /Federal disclosures: none linked/);
  assert.match(portfolioViewJs, /The app will not invent missing external context/);
  assert.match(portfolioViewJs, /safeExternalHref\(mention\.sourceUrl \|\| mention\.url \|\| "#"\)/);
  assert.match(portfolioViewJs, /safeExternalHref\(trade\.sourceUrl \|\| "#"\)/);
});

test("Market Drivers screen answers broad market and AI tech moves without fake causality", () => {
  assert.match(indexHtml, /<section class="screen" id="market-drivers" data-screen="market-drivers" aria-label="Market Drivers" hidden>/);
  assert.match(indexHtml, /Why the broad market and AI\/tech are moving today\./);
  assert.match(indexHtml, /id="marketDriversHeroPanel"/);
  assert.match(indexHtml, /id="marketDriversPanel"/);
  assert.match(indexHtml, /id="marketDriversSourcePanel"/);
  assert.match(indexHtml, /Source-labeled explanation/);
  assert.match(portfolioViewJs, /renderMarketDrivers/);
  assert.match(portfolioViewJs, /renderMarketDriverScopeCard/);
  assert.match(portfolioViewJs, /renderMarketDriverRow/);
  assert.match(portfolioViewJs, /What to inspect/);
  assert.doesNotMatch(`${indexHtml}\n${portfolioViewJs}`, /\bguaranteed causality\b/i);
});

test("keyboard focus styling is visible enough for desktop and mobile review", () => {
  assert.match(indexHtml, /outline: 3px solid rgba\(0, 113, 227, 0\.42\)/);
  assert.match(indexHtml, /box-shadow: 0 0 0 5px rgba\(255, 255, 255, 0\.92\)/);
  assert.match(indexHtml, /@media \(max-width: 720px\)[\s\S]*\.screen-guidance,[\s\S]*grid-template-columns: 1fr/);
});
