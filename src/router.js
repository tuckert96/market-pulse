export const APP_ROUTES = Object.freeze({
  overview: { title: "Overview", description: "What needs attention today." },
  daily: { title: "Daily Brief", description: "Start with the few things that changed." },
  calendar: { title: "Calendar", description: "Upcoming earnings, macro, dividend, product, and custom event review windows." },
  imports: { title: "Imports", description: "Load your portfolio from a local CSV." },
  holdings: { title: "Holdings", description: "Explore positions across accounts." },
  risk: { title: "Risk", description: "What could hurt the portfolio most." },
  "what-if": { title: "What-If", description: "Model hypothetical adds, trims, removals, and target rebalances without changing holdings." },
  targets: { title: "Targets", description: "Compare current allocation to your targets." },
  thesis: { title: "Thesis", description: "Track why you own each major position." },
  watchlist: { title: "Watchlist", description: "Track ideas from research to owned positions." },
  journal: { title: "Decision Journal", description: "Record decision notes, not trades." },
  alerts: { title: "Alerts", description: "Review what needs attention." },
  ticker: { title: "Ticker", description: "Ticker intelligence, ownership, and related signals." },
  alpha: { title: "Alpha Engine", description: "Rank holdings from strongest to weakest with explainable local inputs." },
  "market-drivers": { title: "Market Drivers", description: "Why the broad market and AI/tech are moving today." },
  "market-intelligence": { title: "Market Intelligence", description: "Event read-throughs and portfolio exposure mapping." },
  "signal-review": { title: "Signal Review", description: "Exploratory review of signal scores against available historical prices." },
  "data-sources": { title: "Data Sources", description: "Manage provider readiness and demo connectors." },
  settings: { title: "Settings", description: "Local app settings and backup." }
});

export const ROUTE_ALIASES = Object.freeze({
  brief: "daily",
  "daily-brief": "daily",
  events: "calendar",
  "event-calendar": "calendar",
  earnings: "calendar",
  command: "daily",
  "command-brief": "daily",
  "alpha-engine": "alpha",
  alphaengine: "alpha",
  market: "market-intelligence",
  intelligence: "market-intelligence",
  drivers: "market-drivers",
  "why-market": "market-drivers",
  "market-why": "market-drivers",
  "ai-tech": "market-drivers",
  signals: "signal-review",
  backtest: "signal-review",
  sources: "data-sources",
  simulate: "what-if",
  simulator: "what-if",
  whatif: "what-if",
  rebalance: "targets",
  ideas: "watchlist",
  idea: "watchlist",
  pipeline: "watchlist",
  "decision-journal": "journal",
  decisions: "journal"
});

export function safeDecodeHash(value = "") {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function parseTickerRoute(value = "") {
  const normalized = String(value || "").trim().replace(/^#/, "");
  const match = normalized.match(/^\/?ticker\/([A-Za-z0-9.-]{1,12})$/);
  return match ? match[1].toUpperCase() : "";
}

export function routeFromHashValue(hash = "", routes = APP_ROUTES, routeAliases = ROUTE_ALIASES) {
  const encodedHash = String(hash || "").replace(/^#/, "");
  const decodedHash = safeDecodeHash(encodedHash);
  const decodeFailed = encodedHash.length > 0 && decodedHash === null;
  const rawHash = decodedHash || "";
  const requested = (rawHash || "overview").replace(/^\/+/, "");
  const ticker = parseTickerRoute(requested);
  if (ticker) {
    return {
      route: "ticker",
      ticker,
      canonicalHash: `#/ticker/${encodeURIComponent(ticker)}`,
      shouldReplace: requested !== `ticker/${ticker}`
    };
  }
  const route = routeAliases[requested] || requested;
  if (routes[route]) {
    return {
      route,
      canonicalHash: `#${route}`,
      shouldReplace: decodeFailed || Boolean(rawHash && rawHash !== route)
    };
  }
  return {
    route: "overview",
    canonicalHash: "#overview",
    shouldReplace: decodeFailed || Boolean(rawHash)
  };
}
