import { normalizeTicker } from "./portfolioSchema.js";

export const ATTRIBUTION_PERIODS = Object.freeze(["daily", "weekly", "monthly", "total"]);

const PERIOD_LABELS = Object.freeze({
  daily: "Daily",
  weekly: "5 trading days",
  monthly: "20 trading days",
  total: "Since cost basis"
});

const HISTORY_LOOKBACKS = Object.freeze({
  weekly: 5,
  monthly: 20
});

export function buildPortfolioAttribution(holdings = [], options = {}) {
  const totalValue = Number(options.totalValue) || holdings.reduce((sum, holding) => sum + (Number(holding.marketValue) || 0), 0);
  const grouped = groupHoldingsByTicker(holdings);
  const rows = grouped.map((holding) => buildAttributionRow(holding, totalValue));
  const periods = Object.fromEntries(ATTRIBUTION_PERIODS.map((period) => [period, summarizeAttributionPeriod(rows, period, totalValue)]));
  const missingDataCount = rows.filter((row) => row.missingPeriods.length).length;
  const sourceModes = [...new Set(rows.map((row) => row.sourceMode).filter(Boolean))];

  return {
    totalValue,
    rows: rows.sort((left, right) => Math.abs(right.daily.dollar ?? 0) - Math.abs(left.daily.dollar ?? 0) || right.marketValue - left.marketValue),
    periods,
    sourceModes,
    missingDataCount,
    summary: attributionSummary(rows, periods, missingDataCount)
  };
}

function groupHoldingsByTicker(holdings = []) {
  const grouped = new Map();
  holdings.forEach((holding) => {
    const ticker = normalizeTicker(holding.ticker || holding.symbol || "");
    if (!ticker) return;
    const current = grouped.get(ticker) || {
      ticker,
      name: holding.name || ticker,
      accounts: new Set(),
      shares: 0,
      marketValue: 0,
      costBasis: 0,
      dailyChange: 0,
      dailyChangePercentValues: [],
      historicalPrices: [],
      sourceLabels: new Set(),
      sourceModes: new Set()
    };
    current.name = current.name === ticker && holding.name ? holding.name : current.name;
    current.accounts.add(holding.account || "Account");
    current.shares += Number(holding.shares) || 0;
    current.marketValue += Number(holding.marketValue) || 0;
    current.costBasis += Number(holding.costBasis) || 0;
    current.dailyChange += Number(holding.dailyChange) || 0;
    if (Number.isFinite(Number(holding.dailyChangePercent))) current.dailyChangePercentValues.push(Number(holding.dailyChangePercent));
    const history = normalizeHistoricalPrices(holding.marketDataHistoricalPrices || holding.historicalPrices || holding.history || holding.prices || []);
    if (history.length > current.historicalPrices.length) current.historicalPrices = history;
    const sourceLabel = attributionSourceLabel(holding);
    if (sourceLabel) current.sourceLabels.add(sourceLabel);
    const sourceMode = holding.marketDataFreshness || holding.marketDataCacheStatus || holding.marketDataMode || holding.marketDataStatus || holding.dailyChangeSource || holding.source;
    if (sourceMode) current.sourceModes.add(String(sourceMode));
    grouped.set(ticker, current);
  });
  return [...grouped.values()].map((row) => ({
    ...row,
    accounts: [...row.accounts],
    sourceLabels: [...row.sourceLabels],
    sourceModes: [...row.sourceModes]
  }));
}

function buildAttributionRow(holding, totalValue) {
  const daily = dailyAttribution(holding, totalValue);
  const weekly = historicalAttribution(holding, "weekly", totalValue);
  const monthly = historicalAttribution(holding, "monthly", totalValue);
  const total = totalAttribution(holding, totalValue);
  const periods = { daily, weekly, monthly, total };
  return {
    ticker: holding.ticker,
    name: holding.name,
    accounts: holding.accounts,
    marketValue: holding.marketValue,
    portfolioWeight: totalValue ? holding.marketValue / totalValue : 0,
    shares: holding.shares,
    sourceLabel: holding.sourceLabels[0] || "Local portfolio data",
    sourceMode: holding.sourceModes[0] || "local",
    daily,
    weekly,
    monthly,
    total,
    missingPeriods: ATTRIBUTION_PERIODS.filter((period) => periods[period].status === "missing")
  };
}

function dailyAttribution(holding, totalValue) {
  const hasMove = Math.abs(Number(holding.dailyChange) || 0) > 0 ||
    holding.dailyChangePercentValues.some((value) => Math.abs(value) > 0);
  if (!hasMove) {
    return missingContribution("Daily move unavailable", "No imported or provider daily move is available for this ticker.");
  }
  const dollar = Number(holding.dailyChange) || 0;
  const percent = holding.marketValue ? dollar / Math.max(holding.marketValue - dollar, 1) : average(holding.dailyChangePercentValues);
  return contribution("daily", dollar, percent, totalValue, "Daily move from imported/provider data.");
}

function historicalAttribution(holding, period, totalValue) {
  const lookback = HISTORY_LOOKBACKS[period];
  const prices = holding.historicalPrices || [];
  if (!lookback || prices.length <= lookback) {
    return missingContribution(`${PERIOD_LABELS[period]} unavailable`, `${PERIOD_LABELS[period]} attribution needs at least ${lookback + 1} historical closes; ${prices.length} loaded.`);
  }
  const latest = prices[prices.length - 1];
  const prior = prices[prices.length - 1 - lookback];
  if (!latest?.close || !prior?.close) {
    return missingContribution(`${PERIOD_LABELS[period]} unavailable`, "Historical close data is incomplete.");
  }
  const percent = (latest.close - prior.close) / prior.close;
  const dollar = holding.shares > 0 ? holding.shares * (latest.close - prior.close) : holding.marketValue * percent;
  return contribution(period, dollar, percent, totalValue, `${PERIOD_LABELS[period]} estimate from provider historical closes.`);
}

function totalAttribution(holding, totalValue) {
  if (!(holding.costBasis > 0)) {
    return missingContribution("Cost basis unavailable", "Total contribution needs imported cost basis.");
  }
  const dollar = holding.marketValue - holding.costBasis;
  const percent = dollar / holding.costBasis;
  return contribution("total", dollar, percent, totalValue, "Since-cost-basis estimate from imported holdings.");
}

function contribution(period, dollar, percent, totalValue, explanation) {
  return {
    period,
    status: "available",
    dollar,
    returnPct: percent,
    contributionPct: totalValue ? dollar / totalValue : 0,
    explanation
  };
}

function missingContribution(label, explanation) {
  return {
    status: "missing",
    dollar: null,
    returnPct: null,
    contributionPct: null,
    label,
    explanation
  };
}

function summarizeAttributionPeriod(rows, period, totalValue) {
  const available = rows.filter((row) => row[period]?.status === "available");
  const totalDollar = available.reduce((sum, row) => sum + Number(row[period].dollar || 0), 0);
  const sorted = [...available].sort((left, right) => Math.abs(right[period].dollar || 0) - Math.abs(left[period].dollar || 0));
  const gainers = available.filter((row) => Number(row[period].dollar) > 0)
    .sort((left, right) => Number(right[period].dollar) - Number(left[period].dollar));
  const losers = available.filter((row) => Number(row[period].dollar) < 0)
    .sort((left, right) => Number(left[period].dollar) - Number(right[period].dollar));
  return {
    period,
    label: PERIOD_LABELS[period],
    totalDollar,
    totalContributionPct: totalValue ? totalDollar / totalValue : 0,
    availableCount: available.length,
    missingCount: rows.length - available.length,
    sorted,
    gainers,
    losers
  };
}

function attributionSummary(rows, periods, missingDataCount) {
  if (!rows.length) return "Import holdings to calculate contribution-to-return attribution.";
  const daily = periods.daily || {};
  const leader = daily.sorted?.[0];
  const missing = missingDataCount ? ` ${missingDataCount} ticker${missingDataCount === 1 ? "" : "s"} need more history or cost-basis data.` : "";
  if (!leader) return `Attribution is waiting on daily move or historical price data.${missing}`;
  const direction = Number(leader.daily.dollar || 0) >= 0 ? "positive" : "negative";
  return `${leader.ticker} is the largest ${direction} daily contributor by dollar impact.${missing}`;
}

function normalizeHistoricalPrices(values = []) {
  if (!Array.isArray(values)) return [];
  return values.map((value, index) => {
    if (typeof value === "number") return { date: String(index), close: value };
    return {
      date: String(value.date || value.timestamp || value.asOf || index),
      close: Number(value.close ?? value.price ?? value.value)
    };
  })
    .filter((row) => Number.isFinite(row.close) && row.close > 0)
    .sort((left, right) => String(left.date).localeCompare(String(right.date)));
}

function attributionSourceLabel(holding = {}) {
  if (holding.marketDataProvider) return `${holding.marketDataProvider} ${holding.marketDataFreshness || holding.marketDataCacheStatus || "market data"}`;
  if (holding.dailyChangeSource) return holding.dailyChangeSource;
  if (holding.source) return holding.source;
  return "Imported/local holdings";
}

function average(values = []) {
  const usable = values.filter((value) => Number.isFinite(Number(value)));
  return usable.length ? usable.reduce((sum, value) => sum + Number(value), 0) / usable.length : 0;
}
