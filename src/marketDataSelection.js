import { normalizeTicker } from "./portfolioSchema.js";
import { watchlistIdeaTickers } from "./watchlistIdeas.js";

export function selectMarketDataTickers({
  holdings = [],
  watchlistIdeas = [],
  redditSettings = {},
  marketEvents = [],
  eventCalendar = [],
  driverTickers = [],
  defaultTickers = [],
  includeDefaultResearchTickers = false,
  maxTickers = Infinity
} = {}) {
  return selectMarketDataTickerPlan({
    holdings,
    watchlistIdeas,
    redditSettings,
    marketEvents,
    eventCalendar,
    driverTickers,
    defaultTickers,
    includeDefaultResearchTickers,
    maxTickers
  }).tickers;
}

export function selectMarketDataTickerPlan({
  holdings = [],
  watchlistIdeas = [],
  redditSettings = {},
  marketEvents = [],
  eventCalendar = [],
  driverTickers = [],
  defaultTickers = [],
  includeDefaultResearchTickers = false,
  maxTickers = Infinity
} = {}) {
  const candidates = [
    ...holdingTickerCandidates(holdings),
    ...tickerCandidates(watchlistIdeaTickers(watchlistIdeas), "watchlist", 70),
    ...tickerCandidates(redditSettings?.whitelist || [], "reddit-whitelist", 60),
    ...tickerCandidates(marketEventTickers(marketEvents), "market-event", 50),
    ...tickerCandidates(calendarTickers(eventCalendar), "calendar-event", 45),
    ...tickerCandidates(driverTickers, "market-driver-proxy", 40),
    ...(includeDefaultResearchTickers ? tickerCandidates(defaultTickers, "default-research", 10) : [])
  ];
  const ranked = dedupeCandidates(candidates).sort((left, right) =>
    right.priority - left.priority ||
    right.marketValue - left.marketValue ||
    left.ticker.localeCompare(right.ticker)
  );
  const safeMax = Number.isFinite(Number(maxTickers)) ? Math.max(0, Number(maxTickers)) : Infinity;
  const selected = ranked.slice(0, safeMax);
  const omitted = ranked.slice(safeMax);

  return {
    tickers: selected.map((row) => row.ticker),
    requestedTickers: ranked.map((row) => row.ticker),
    omittedTickers: omitted.map((row) => row.ticker),
    omittedHoldingTickers: omitted.filter((row) => row.source === "holding").map((row) => row.ticker),
    omittedResearchTickers: omitted.filter((row) => row.source !== "holding").map((row) => row.ticker),
    candidates: ranked
  };
}

function holdingTickerCandidates(holdings = []) {
  return holdings
    .filter((holding) => !holding.cash && holding.assetClass !== "Cash" && holding.marketDataEligible !== false && !holding.localIdentifier)
    .map((holding) => ({
      ticker: normalizeTicker(holding.ticker),
      source: "holding",
      priority: 100,
      marketValue: Number(holding.marketValue ?? holding.positionValue) || 0
    }))
    .filter((row) => row.ticker);
}

function tickerCandidates(tickers = [], source = "research", priority = 0) {
  return (tickers || [])
    .map((ticker) => ({
      ticker: normalizeTicker(ticker),
      source,
      priority,
      marketValue: 0
    }))
    .filter((row) => row.ticker);
}

function marketEventTickers(marketEvents = []) {
  return marketEvents.flatMap((event) => [
    ...(event.affectedTickers || []),
    ...(event.inferredTickersAffected || []),
    ...(event.tickersMentioned || [])
  ]);
}

function calendarTickers(eventCalendar = []) {
  return eventCalendar.flatMap((event) => [
    event.ticker,
    ...(event.tickers || []),
    ...(event.affectedTickers || [])
  ]);
}

function dedupeCandidates(candidates = []) {
  const byTicker = new Map();
  candidates.forEach((candidate) => {
    const existing = byTicker.get(candidate.ticker);
    if (!existing || candidate.priority > existing.priority || (candidate.priority === existing.priority && candidate.marketValue > existing.marketValue)) {
      byTicker.set(candidate.ticker, {
        ...candidate,
        sources: unique([...(existing?.sources || []), candidate.source])
      });
      return;
    }
    byTicker.set(candidate.ticker, {
      ...existing,
      sources: unique([...(existing.sources || []), candidate.source])
    });
  });
  return [...byTicker.values()];
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}
