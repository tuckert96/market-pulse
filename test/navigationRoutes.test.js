import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { APP_ROUTES, ROUTE_ALIASES, routeFromHashValue } from "../src/router.js";

const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const appJs = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const portfolioViewJs = readFileSync(new URL("../src/portfolioView.js", import.meta.url), "utf8");

const majorRoutes = [
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
  "alpha",
  "market-intelligence",
  "signal-review",
  "data-sources",
  "settings"
];

test("route resolver canonicalizes aliases, ticker pages, invalid hashes, and malformed hashes", () => {
  assert.deepEqual(routeFromHashValue("#overview"), {
    route: "overview",
    canonicalHash: "#overview",
    shouldReplace: false
  });
  assert.deepEqual(routeFromHashValue("#market"), {
    route: "market-intelligence",
    canonicalHash: "#market-intelligence",
    shouldReplace: true
  });
  assert.deepEqual(routeFromHashValue("#ideas"), {
    route: "watchlist",
    canonicalHash: "#watchlist",
    shouldReplace: true
  });
  assert.deepEqual(routeFromHashValue("#alpha-engine"), {
    route: "alpha",
    canonicalHash: "#alpha",
    shouldReplace: true
  });
  assert.deepEqual(routeFromHashValue("/holdings"), {
    route: "holdings",
    canonicalHash: "#holdings",
    shouldReplace: true
  });
  assert.deepEqual(routeFromHashValue("/imports"), {
    route: "imports",
    canonicalHash: "#imports",
    shouldReplace: true
  });
  assert.deepEqual(routeFromHashValue("/data-sources"), {
    route: "data-sources",
    canonicalHash: "#data-sources",
    shouldReplace: true
  });
  assert.deepEqual(routeFromHashValue("#/ticker/mu"), {
    route: "ticker",
    ticker: "MU",
    canonicalHash: "#/ticker/MU",
    shouldReplace: true
  });
  assert.deepEqual(routeFromHashValue("#/ticker/MU"), {
    route: "ticker",
    ticker: "MU",
    canonicalHash: "#/ticker/MU",
    shouldReplace: false
  });
  assert.deepEqual(routeFromHashValue("#ticker/mu"), {
    route: "ticker",
    ticker: "MU",
    canonicalHash: "#/ticker/MU",
    shouldReplace: true
  });
  assert.deepEqual(routeFromHashValue("/ticker/mu"), {
    route: "ticker",
    ticker: "MU",
    canonicalHash: "#/ticker/MU",
    shouldReplace: true
  });
  assert.deepEqual(routeFromHashValue("#does-not-exist"), {
    route: "overview",
    canonicalHash: "#overview",
    shouldReplace: true
  });
  assert.deepEqual(routeFromHashValue("#%E0%A4%A"), {
    route: "overview",
    canonicalHash: "#overview",
    shouldReplace: true
  });
});

test("every major route has one focused screen and a sidebar link", () => {
  for (const route of majorRoutes) {
    assert.ok(APP_ROUTES[route], `${route} should exist in APP_ROUTES`);
    assert.match(indexHtml, new RegExp(`data-screen="${route}"`), `${route} screen should exist`);
    assert.match(indexHtml, new RegExp(`href="#${route}"`), `${route} nav link should exist`);
  }

  assert.match(indexHtml, /<section class="screen" id="overview" data-screen="overview" aria-label="Portfolio overview">/);
  for (const route of majorRoutes.filter((route) => route !== "overview")) {
    assert.match(indexHtml, new RegExp(`<section class="screen" id="${route}" data-screen="${route}"[^>]+ hidden>`), `${route} should be hidden until routed`);
  }
  assert.match(indexHtml, /<section class="screen" id="ticker" data-screen="ticker" aria-label="Ticker intelligence" hidden>/);
});

test("dashboard summary cards route to expected deep screens", () => {
  const dataRoutes = [...indexHtml.matchAll(/data-route="([^"]+)"/g)].map((match) => match[1]);
  const expected = ["#daily", "#calendar", "#holdings", "#risk", "#risk-guardrails", "#thesis", "#alerts", "#market-intelligence", "#data-sources"];
  for (const route of expected) {
    assert.ok(dataRoutes.includes(route), `Overview digest card should route to ${route}`);
  }
  for (const secondaryRoute of ["#what-if", "#journal", "#watchlist"]) {
    assert.ok(!dataRoutes.includes(secondaryRoute), `${secondaryRoute} should be a quieter workflow shortcut, not a primary digest card`);
    assert.match(indexHtml, new RegExp(`class="workflow-chip" href="${secondaryRoute}"`), `${secondaryRoute} should remain available as a workflow shortcut`);
  }
  for (const route of dataRoutes) {
    const routeName = route.replace(/^#/, "");
    assert.ok(APP_ROUTES[routeName] || ROUTE_ALIASES[routeName], `data-route ${route} should resolve to a known route`);
  }
});

test("all non-ticker hash links and route aliases resolve to known screens", () => {
  const hashes = [...indexHtml.matchAll(/href="(#[^"]+)"/g)].map((match) => match[1]);
  assert.ok(hashes.length > 10, "source should include route links");
  for (const hash of hashes.filter((hash) => !hash.startsWith("#/ticker/"))) {
    const resolved = routeFromHashValue(hash);
    assert.ok(APP_ROUTES[resolved.route], `${hash} should resolve to a known route`);
  }
});

test("ticker links use the shared helper and remain native hash anchors", () => {
  assert.match(appJs, /renderTickerLink/);
  assert.match(appJs, /escapeHtml\(record\.ticker \|\| "UNKNOWN"\)/);
  assert.doesNotMatch(appJs, /href="#\/ticker/);
  assert.match(portfolioViewJs, /export function renderTickerLink/);
  assert.match(portfolioViewJs, /href="\$\{tickerDetailHash\(normalized\)\}"/);
  assert.match(portfolioViewJs, /data-ticker-link="\$\{escapeHtml\(normalized\)\}"/);
  assert.doesNotMatch(portfolioViewJs, /data-ticker-link[^\\n]+role="link"/);
  assert.doesNotMatch(portfolioViewJs, /data-ticker-link[^\\n]+tabindex="0"/);
});

test("routing source supports back-forward, route announcements, focus, and responsive layouts", () => {
  assert.match(appJs, /window\.addEventListener\("hashchange", render\)/);
  assert.match(appJs, /history\.replaceState/);
  assert.match(appJs, /routeStatus\.textContent/);
  assert.match(appJs, /focusActiveScreen/);
  assert.match(appJs, /aria-current/);
  assert.match(indexHtml, /id="routeStatus" class="sr-only" aria-live="polite"/);
  assert.match(indexHtml, /id="mainContent" tabindex="-1"/);
  assert.match(indexHtml, /@media \(max-width: 1080px\)/);
  assert.match(indexHtml, /@media \(max-width: 720px\)/);
  assert.match(indexHtml, /\.table-wrap\s*\{[^}]*overflow-x: auto/s);
  assert.match(indexHtml, /@media \(max-width: 720px\)[\s\S]*\.workspace-nav\s*\{[\s\S]*grid-template-columns: 1fr/);
  assert.match(indexHtml, /@media \(max-width: 720px\)[\s\S]*\.import-actions,[\s\S]*\.connector-actions\s*\{[\s\S]*display: grid/);
});
