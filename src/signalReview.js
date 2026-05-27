import { buildTechnicalAnalysisSnapshot } from "./technicalAnalysis.js";

export const SIGNAL_REVIEW_FILTERS = Object.freeze({
  ALL: "all",
  OWNED: "owned",
  WATCHLIST: "watchlist",
  REDDIT: "reddit",
  POLITICIAN: "politician",
  MOMENTUM: "momentum"
});

const DEFAULT_HORIZONS = Object.freeze([1, 5, 20]);

export function calculateForwardReturns(historicalPrices = [], signalDate = "", horizons = DEFAULT_HORIZONS) {
  const prices = normalizeHistoricalPrices(historicalPrices);
  const results = {};
  const warnings = [];
  horizons.forEach((horizon) => {
    results[`${horizon}d`] = null;
  });

  if (prices.length < 2) {
    warnings.push("Historical prices are missing or too short for forward-return review.");
    return { anchor: null, returns: results, warnings };
  }

  let anchorIndex = 0;
  let anchorMode = "first-available";
  if (signalDate) {
    anchorIndex = prices.findIndex((point) => comparableDate(point.date) >= comparableDate(signalDate));
    anchorMode = "signal-date";
    if (anchorIndex === -1) {
      warnings.push("Signal date is after the available historical price series.");
      return { anchor: null, returns: results, warnings };
    }
    if (comparableDate(prices[anchorIndex].date) !== comparableDate(signalDate)) {
      warnings.push("Exact signal-date close is unavailable; using the next available historical point.");
    }
  } else {
    warnings.push("No original signal timestamp is available; using the first historical point as an exploratory anchor.");
  }

  const anchor = prices[anchorIndex];
  horizons.forEach((horizon) => {
    const targetIndex = anchorIndex + horizon;
    const key = `${horizon}d`;
    if (!prices[targetIndex]) {
      warnings.push(`${horizon} trading-day forward return needs ${horizon + 1} price points after the anchor.`);
      return;
    }
    const target = prices[targetIndex];
    results[key] = {
      horizon,
      returnPct: anchor.close ? (target.close - anchor.close) / anchor.close : null,
      startClose: anchor.close,
      endClose: target.close,
      startDate: anchor.date,
      endDate: target.date
    };
  });

  return {
    anchor: {
      date: anchor.date,
      close: anchor.close,
      index: anchorIndex,
      mode: anchorMode
    },
    returns: results,
    warnings: unique(warnings)
  };
}

export function buildSignalReviewRows({
  tickerSignals = [],
  marketDataSnapshot = null,
  holdings = [],
  redditMentions = [],
  politicianTrades = [],
  marketEvents = [],
  alphaSignals = []
} = {}) {
  const quoteMap = quoteMapFromSnapshot(marketDataSnapshot);
  const holdingsByTicker = summarizeHoldings(holdings);
  return tickerSignals.map((signal) => {
    const ticker = normalizeTicker(signal.ticker);
    const quote = quoteMap.get(ticker);
    const holding = holdingsByTicker.get(ticker);
    const history = quote?.historicalPrices || holding?.historicalPrices || [];
    const signalDate = signal.detectedAt || signal.timestamp || latestRelatedDate(ticker, { redditMentions, politicianTrades, marketEvents, alphaSignals });
    const forward = calculateForwardReturns(history, signalDate);
    const quoteLabel = quoteSourceLabel(quote, marketDataSnapshot);
    const technicalAnalysis = buildTechnicalAnalysisSnapshot(history, { ticker, sourceLabel: quoteLabel });
    const sourceDrivers = sourceDriverLabels(signal, technicalAnalysis);
    const portfolioOwnershipFlag = Boolean((signal.portfolioOwnershipFlag || holding?.marketValue) && !signal.samplePortfolioFlag);
    const missingDataWarnings = unique([
      ...(signal.missingData || []),
      ...forward.warnings,
      ...(technicalAnalysis.missingData || []).slice(0, 3),
      ...(history.length ? [] : ["No historical prices available for forward-return review."])
    ]);
    return {
      id: signal.id || `signal-review-${ticker.toLowerCase()}`,
      ticker,
      headline: signal.topHeadline || signal.headline || `${ticker} ticker signal`,
      actionCategory: signal.actionCategory || "Review",
      combinedScore: Number(signal.combinedScore ?? Math.round((Number(signal.confluenceScore) || 0) * 100)),
      confluenceScore: Number(signal.confluenceScore ?? (Number(signal.combinedScore) || 0) / 100),
      portfolioOwnershipFlag,
      watchlistFlag: Boolean(signal.watchlistFlag),
      redditDriven: Number(signal.redditMentionAccelerationScore || 0) >= 0.55 || Number(signal.sourceCounts?.reddit || 0) > 0,
      politicianDriven: Number(signal.politicianActivityScore || 0) >= 0.55 || Number(signal.sourceCounts?.politician || 0) > 0,
      highMomentum: Number(signal.priceMomentumScore ?? signal.priceMomentumPlaceholder ?? 0) >= 0.65 || technicalAnalysis.labels?.macd === "Momentum positive",
      marketValue: portfolioOwnershipFlag ? Number(signal.holdingsValue ?? holding?.marketValue) || 0 : 0,
      portfolioWeight: portfolioOwnershipFlag ? Number(signal.portfolioWeight ?? holding?.portfolioWeight) || 0 : 0,
      signalDate: signalDate || "",
      signalDateLabel: signalDate ? shortDate(signalDate) : "Exploratory anchor",
      quoteSourceLabel: quoteLabel,
      dataMode: signal.dataMode || signal.sourceMode || "sample/local",
      sourceDrivers,
      scoreComponents: buildScoreComponents(signal, technicalAnalysis),
      technicalAnalysis,
      topDrivers: signal.topDrivers || [],
      explanation: signal.explanation || "Review-priority score assembled from sample/local inputs.",
      forward,
      missingDataWarnings
    };
  }).sort((a, b) => b.combinedScore - a.combinedScore || b.marketValue - a.marketValue || a.ticker.localeCompare(b.ticker));
}

export function filterSignalReviewRows(rows = [], filter = SIGNAL_REVIEW_FILTERS.ALL) {
  if (filter === SIGNAL_REVIEW_FILTERS.OWNED) return rows.filter((row) => row.portfolioOwnershipFlag);
  if (filter === SIGNAL_REVIEW_FILTERS.WATCHLIST) return rows.filter((row) => row.watchlistFlag && !row.portfolioOwnershipFlag);
  if (filter === SIGNAL_REVIEW_FILTERS.REDDIT) return rows.filter((row) => row.redditDriven);
  if (filter === SIGNAL_REVIEW_FILTERS.POLITICIAN) return rows.filter((row) => row.politicianDriven);
  if (filter === SIGNAL_REVIEW_FILTERS.MOMENTUM) return rows.filter((row) => row.highMomentum);
  return rows;
}

function buildScoreComponents(signal = {}, technicalAnalysis = {}) {
  return [
    component("Price momentum", signal.priceMomentumScore ?? signal.priceMomentumPlaceholder, "Price move context"),
    component("Technical context", technicalContextScore(technicalAnalysis), technicalAnalysis.status === "available" ? `${technicalAnalysis.labels?.trend || "Trend"} · ${technicalAnalysis.labels?.macd || "MACD"}` : "Historical technical context unavailable"),
    component("Relative strength", signal.relativeStrengthScore, "Versus local benchmark placeholder"),
    component("Reddit acceleration", signal.redditMentionAccelerationScore, "Lower-trust social velocity"),
    component("Reddit sentiment", signal.redditSentimentScore, "Placeholder sentiment"),
    component("Politician activity", signal.politicianActivityScore, "Disclosure activity"),
    component("Thesis/risk", signal.thesisConvictionRiskScore, "Conviction and risk profile"),
    component("Concentration", signal.concentrationRiskScore, "Portfolio exposure context")
  ];
}

function technicalContextScore(technicalAnalysis = {}) {
  if (technicalAnalysis.status !== "available") return 0;
  let score = 0.5;
  if (technicalAnalysis.labels?.trend === "Above trend") score += 0.14;
  if (technicalAnalysis.labels?.trend === "Below trend") score -= 0.14;
  if (technicalAnalysis.labels?.macd === "Momentum positive") score += 0.12;
  if (technicalAnalysis.labels?.macd === "Momentum negative") score -= 0.12;
  if (technicalAnalysis.labels?.rsi === "Constructive") score += 0.08;
  if (technicalAnalysis.labels?.rsi === "Extended") score -= 0.06;
  if (technicalAnalysis.labels?.drawdown === "Deep drawdown") score -= 0.1;
  return clamp(score);
}

function component(label, score, note) {
  return {
    label,
    score: clamp(Number(score) || 0),
    note
  };
}

function sourceDriverLabels(signal = {}, technicalAnalysis = {}) {
  const labels = [];
  if (Number(signal.redditMentionAccelerationScore || 0) >= 0.55 || Number(signal.sourceCounts?.reddit || 0) > 0) labels.push("Reddit-driven");
  if (Number(signal.politicianActivityScore || 0) >= 0.55 || Number(signal.sourceCounts?.politician || 0) > 0) labels.push("Politician-trade-driven");
  if (Number(signal.priceMomentumScore ?? signal.priceMomentumPlaceholder ?? 0) >= 0.65) labels.push("High momentum");
  if (technicalAnalysis.labels?.trend === "Above trend" || technicalAnalysis.labels?.macd === "Momentum positive") labels.push("Technical context");
  if (signal.portfolioOwnershipFlag) labels.push("Owned");
  if (signal.watchlistFlag && !signal.portfolioOwnershipFlag) labels.push("Watchlist");
  return labels.length ? labels : ["Local signal"];
}

function latestRelatedDate(ticker, { redditMentions = [], politicianTrades = [], marketEvents = [], alphaSignals = [] } = {}) {
  const dates = [
    ...redditMentions.filter((row) => mentionTickers(row).includes(ticker)).map((row) => row.createdAt || row.detectedAt || row.sourceAsOf),
    ...politicianTrades.filter((row) => normalizeTicker(row.ticker) === ticker).map((row) => row.disclosureDate || row.disclosedAt || row.transactionDate),
    ...marketEvents.filter((row) => eventTickers(row).includes(ticker)).map((row) => row.timestamp || row.detectedAt),
    ...alphaSignals.filter((row) => eventTickers(row).includes(ticker)).map((row) => row.timestamp || row.detectedAt || row.createdAt)
  ].filter(Boolean);
  return dates.sort((a, b) => comparableDate(b) - comparableDate(a))[0] || "";
}

function quoteMapFromSnapshot(snapshot = null) {
  const rows = snapshot?.quotes || Object.values(snapshot?.quotesByTicker || {});
  return new Map((rows || []).map((quote) => [normalizeTicker(quote.ticker), quote]).filter(([ticker]) => ticker));
}

function summarizeHoldings(holdings = []) {
  const rows = new Map();
  holdings.forEach((holding) => {
    const ticker = normalizeTicker(holding.ticker);
    if (!ticker) return;
    const current = rows.get(ticker) || { ticker, marketValue: 0, portfolioWeight: 0, historicalPrices: [] };
    current.marketValue += Number(holding.marketValue) || 0;
    current.portfolioWeight += Number(holding.portfolioWeight) || 0;
    if (!current.historicalPrices.length && Array.isArray(holding.marketDataHistoricalPrices)) current.historicalPrices = holding.marketDataHistoricalPrices;
    rows.set(ticker, current);
  });
  return rows;
}

function normalizeHistoricalPrices(values = []) {
  if (!Array.isArray(values)) return [];
  return values.map((item, index) => {
    if (typeof item === "number") return { date: `Point ${index + 1}`, close: Number(item) };
    const close = Number(item?.close ?? item?.price ?? item?.adjustedClose ?? item?.adjClose ?? item?.value);
    if (!Number.isFinite(close) || close <= 0) return null;
    return {
      date: item.date || item.timestamp || item.time || `Point ${index + 1}`,
      close
    };
  }).filter(Boolean).sort((a, b) => comparableDate(a.date) - comparableDate(b.date));
}

function mentionTickers(row = {}) {
  return unique([
    normalizeTicker(row.ticker),
    ...(Array.isArray(row.extractedTickers) ? row.extractedTickers.map(normalizeTicker) : [])
  ]);
}

function eventTickers(row = {}) {
  return unique([
    row.ticker,
    row.primaryTicker,
    ...(row.affectedTickers || []),
    ...(row.tickersMentioned || []),
    ...(row.inferredTickersAffected || [])
  ].map(normalizeTicker));
}

function quoteSourceLabel(quote = null, snapshot = null) {
  if (!quote) return "No price history";
  if (quote.dataFreshness === "live" || quote.cacheStatus === "live") return `${quote.providerName || "Provider"} live`;
  if (quote.dataFreshness === "cached" || quote.cacheStatus === "cached") return `${quote.providerName || "Provider"} cached`;
  if (quote.dataFreshness === "stale" || quote.cacheStatus === "stale") return `${quote.providerName || "Provider"} stale`;
  if (quote.isMock || quote.sourceMode === "mock" || snapshot?.status?.status === "mock/sample mode") return "Sample market data";
  return quote.providerLabel || snapshot?.status?.label || "Market data";
}

function comparableDate(value) {
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return date.getTime();
  const point = String(value || "").match(/(\d+)/)?.[1];
  return point ? Number(point) : 0;
}

function shortDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "Unknown");
  return date.toISOString().slice(0, 10);
}

function normalizeTicker(value = "") {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "");
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function clamp(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}
