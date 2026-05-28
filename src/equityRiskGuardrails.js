import { normalizeHoldings, normalizeTicker } from "./portfolioSchema.js";

export const RISK_ACTIONS = Object.freeze({
  HOLD: "hold",
  REVIEW: "review",
  TRIM: "trim",
  EXIT: "exit"
});

export const HOLDING_RISK_CATEGORIES = Object.freeze({
  CORE_MEGA_CAP: "core_mega_cap",
  CYCLICAL_HIGH_BETA: "cyclical_high_beta",
  SPECULATIVE_GROWTH: "speculative_growth",
  LEVERAGED_ETF: "leveraged_etf",
  BROAD_INDEX: "broad_index"
});

export const RISK_ACTION_LABELS = Object.freeze({
  hold: "Hold",
  review: "Review",
  trim: "Trim",
  exit: "Exit / Major Cut"
});

export const RISK_CATEGORY_LABELS = Object.freeze({
  core_mega_cap: "Core mega-cap",
  cyclical_high_beta: "Cyclical / high-beta",
  speculative_growth: "Speculative growth",
  leveraged_etf: "Leveraged ETF",
  broad_index: "Broad index / broad fund"
});

export const DEFAULT_RISK_GUARDRAILS = Object.freeze({
  core_mega_cap: Object.freeze({
    category: "core_mega_cap",
    maxTargetWeightPct: 10,
    hardTrimWeightPct: 12,
    reviewLossFromCostPct: -10,
    trimLossFromCostPct: -20,
    exitLossFromCostPct: -30,
    trailingDrawdownAlertPct: -20,
    requireTwoWeeklyClosesBelow200DMA: true
  }),
  cyclical_high_beta: Object.freeze({
    category: "cyclical_high_beta",
    maxTargetWeightPct: 8,
    hardTrimWeightPct: 10,
    reviewLossFromCostPct: -10,
    trimLossFromCostPct: -20,
    exitLossFromCostPct: -30,
    trailingDrawdownAlertPct: -25,
    requireTwoWeeklyClosesBelow200DMA: true
  }),
  speculative_growth: Object.freeze({
    category: "speculative_growth",
    maxTargetWeightPct: 5,
    hardTrimWeightPct: 7,
    reviewLossFromCostPct: -10,
    trimLossFromCostPct: -20,
    exitLossFromCostPct: -30,
    trailingDrawdownAlertPct: -25,
    requireTwoWeeklyClosesBelow200DMA: true
  }),
  leveraged_etf: Object.freeze({
    category: "leveraged_etf",
    maxTargetWeightPct: 10,
    hardTrimWeightPct: 15,
    reviewLossFromCostPct: -15,
    trimLossFromCostPct: -25,
    exitLossFromCostPct: -40,
    trailingDrawdownAlertPct: -30,
    requireTwoWeeklyClosesBelow200DMA: true
  }),
  broad_index: Object.freeze({
    category: "broad_index",
    maxTargetWeightPct: 100,
    hardTrimWeightPct: 100,
    reviewLossFromCostPct: -20,
    trimLossFromCostPct: -35,
    exitLossFromCostPct: -50,
    trailingDrawdownAlertPct: -30,
    requireTwoWeeklyClosesBelow200DMA: false
  })
});

const LEVERAGED_ETFS = new Set(["UPRO", "TQQQ", "SOXL", "SPXL", "TECL", "SQQQ", "FNGU", "LABU", "WEBL", "DFEN", "UDOW"]);
const BROAD_INDEX_ETFS = new Set(["VOO", "VTI", "SPY", "IVV", "QQQ", "SCHB", "SPLG", "VGT", "IWM", "DIA"]);
const CORE_MEGA_CAPS = new Set(["MSFT", "AAPL", "NVDA", "GOOGL", "GOOG", "AMZN", "META", "BRK.B", "BRK.A"]);
const CYCLICAL_HIGH_BETA = new Set(["MU", "AMD", "AVGO", "TSLA", "SMCI", "CRDO"]);
const CASH_LIKE_TICKERS = new Set(["CASH", "FCASH", "FDIC", "SPAXX", "FDRXX", "FZFXX", "FDLXX", "SPRXX", "FTEXX", "FZDXX", "FMPXX"]);

export function inferRiskCategory(symbol = "", holding = {}) {
  const ticker = normalizeTicker(symbol || holding.ticker || holding.symbol);
  if (holding.riskCategory && DEFAULT_RISK_GUARDRAILS[holding.riskCategory]) return holding.riskCategory;
  if (holding.isLeveragedEtf || LEVERAGED_ETFS.has(ticker)) return HOLDING_RISK_CATEGORIES.LEVERAGED_ETF;
  if (BROAD_INDEX_ETFS.has(ticker)) return HOLDING_RISK_CATEGORIES.BROAD_INDEX;
  if (CORE_MEGA_CAPS.has(ticker)) return HOLDING_RISK_CATEGORIES.CORE_MEGA_CAP;
  if (CYCLICAL_HIGH_BETA.has(ticker)) return HOLDING_RISK_CATEGORIES.CYCLICAL_HIGH_BETA;
  if (isCashLikeHolding(holding, ticker)) return HOLDING_RISK_CATEGORIES.BROAD_INDEX;
  return HOLDING_RISK_CATEGORIES.SPECULATIVE_GROWTH;
}

export function riskActionForScore(score = 0) {
  const numeric = Number(score) || 0;
  if (numeric >= 7) return RISK_ACTIONS.EXIT;
  if (numeric >= 5) return RISK_ACTIONS.TRIM;
  if (numeric >= 3) return RISK_ACTIONS.REVIEW;
  return RISK_ACTIONS.HOLD;
}

export function buildEquityRiskGuardrails(holdingsInput = [], options = {}) {
  const holdings = normalizeHoldings(holdingsInput);
  const totalValue = positiveNumber(options.totalValue) || sum(holdings, "marketValue");
  const rows = holdings
    .filter(isRiskEligibleHolding)
    .map((holding) => buildPositionRiskMetrics(holding, {
      totalValue,
      guardrails: options.guardrails,
      portfolioDrawdownTriggerActive: Boolean(options.portfolioDrawdownTriggerActive)
    }))
    .sort((a, b) => b.riskScore - a.riskScore || b.portfolioWeightPct - a.portfolioWeightPct || a.symbol.localeCompare(b.symbol));
  return {
    rows,
    summary: buildRiskGuardrailSummary(rows),
    totalValue
  };
}

export function buildPositionRiskMetrics(holdingInput = {}, options = {}) {
  const holding = normalizeHoldings([holdingInput])[0] || {};
  const symbol = normalizeTicker(holding.ticker || holding.symbol);
  const riskCategory = inferRiskCategory(symbol, holding);
  const config = normalizedGuardrailConfig(riskCategory, options.guardrails);
  const totalValue = positiveNumber(options.totalValue) || positiveNumber(holding.totalValue) || 0;
  const marketValue = positiveNumber(holding.marketValue);
  const portfolioWeightPct = totalValue ? (marketValue / totalValue) * 100 : percentFromWeight(holding.portfolioWeight);
  const costBasis = positiveNumber(holding.costBasis);
  const gainLossFromCostPct = costBasis ? ((marketValue - costBasis) / costBasis) * 100 : null;
  const currentPrice = currentPriceForHolding(holding);
  const history = normalizePriceHistory(holding);
  const fiftyDayMovingAverage = movingAverage(history, 50);
  const twoHundredDayMovingAverage = movingAverage(history, 200);
  const drawdownFromRecentHighPct = drawdownFromRecentHigh(currentPrice, history);
  const above50DMA = currentPrice && fiftyDayMovingAverage ? currentPrice >= fiftyDayMovingAverage : null;
  const above200DMA = currentPrice && twoHundredDayMovingAverage ? currentPrice >= twoHundredDayMovingAverage : null;
  const twoWeeklyClosesBelow200DMA = config.requireTwoWeeklyClosesBelow200DMA
    ? twoWeeklyCloseBreak(history)
    : false;
  const missingData = missingDataForMetrics({
    holding,
    currentPrice,
    costBasis,
    history,
    fiftyDayMovingAverage,
    twoHundredDayMovingAverage
  });
  const scoring = scorePositionRisk({
    symbol,
    name: holding.name,
    portfolioWeightPct,
    gainLossFromCostPct,
    drawdownFromRecentHighPct,
    above50DMA,
    above200DMA,
    twoWeeklyClosesBelow200DMA,
    config,
    portfolioDrawdownTriggerActive: Boolean(options.portfolioDrawdownTriggerActive)
  });

  return {
    symbol,
    name: holding.name || symbol,
    account: holding.account || "",
    marketValue,
    riskCategory,
    riskCategoryLabel: RISK_CATEGORY_LABELS[riskCategory] || "Speculative growth",
    portfolioWeightPct,
    gainLossFromCostPct,
    drawdownFromRecentHighPct,
    currentPrice,
    fiftyDayMovingAverage,
    twoHundredDayMovingAverage,
    above50DMA,
    above200DMA,
    twoWeeklyClosesBelow200DMA,
    riskScore: scoring.riskScore,
    riskAction: scoring.riskAction,
    riskActionLabel: RISK_ACTION_LABELS[scoring.riskAction],
    triggeredRules: scoring.triggeredRules,
    missingData,
    guardrailConfig: config,
    sourceMode: holding.marketDataMode || holding.marketDataStatus || holding.source || "local",
    href: symbol ? `#/ticker/${encodeURIComponent(symbol)}` : "#holdings"
  };
}

export function scorePositionRisk(input = {}) {
  const {
    symbol = "Holding",
    name = symbol,
    portfolioWeightPct = 0,
    gainLossFromCostPct = null,
    drawdownFromRecentHighPct = null,
    above50DMA = null,
    above200DMA = null,
    twoWeeklyClosesBelow200DMA = null,
    config = DEFAULT_RISK_GUARDRAILS.speculative_growth,
    portfolioDrawdownTriggerActive = false
  } = input;
  const triggeredRules = [];
  const label = symbol || name || "Holding";

  if (portfolioWeightPct >= config.hardTrimWeightPct) {
    triggeredRules.push(rule(
      "position_above_hard_trim",
      "Position above hard trim level",
      "high",
      2,
      `${label} is ${formatPctNumber(portfolioWeightPct)} of the portfolio, above the ${formatPctNumber(config.hardTrimWeightPct)} hard trim guardrail.`
    ));
  } else if (portfolioWeightPct >= config.maxTargetWeightPct) {
    triggeredRules.push(rule(
      "position_above_target",
      "Position above target max",
      "medium",
      1,
      `${label} is ${formatPctNumber(portfolioWeightPct)} of the portfolio, above the ${formatPctNumber(config.maxTargetWeightPct)} target max for its risk category.`
    ));
  }

  if (Number.isFinite(gainLossFromCostPct)) {
    if (gainLossFromCostPct <= config.exitLossFromCostPct) {
      triggeredRules.push(rule(
        "loss_from_cost_exit",
        "Loss from cost exceeds exit threshold",
        "critical",
        3,
        `${label} is down ${formatPctNumber(Math.abs(gainLossFromCostPct))} from cost basis, beyond the ${formatPctNumber(Math.abs(config.exitLossFromCostPct))} exit/major-cut review threshold.`
      ));
    } else if (gainLossFromCostPct <= config.trimLossFromCostPct) {
      triggeredRules.push(rule(
        "loss_from_cost_trim",
        "Loss from cost exceeds trim threshold",
        "high",
        2,
        `${label} is down ${formatPctNumber(Math.abs(gainLossFromCostPct))} from cost basis, beyond the ${formatPctNumber(Math.abs(config.trimLossFromCostPct))} trim review threshold.`
      ));
    } else if (gainLossFromCostPct <= config.reviewLossFromCostPct) {
      triggeredRules.push(rule(
        "loss_from_cost_review",
        "Loss from cost exceeds review threshold",
        "medium",
        1,
        `${label} is down ${formatPctNumber(Math.abs(gainLossFromCostPct))} from cost basis, beyond the ${formatPctNumber(Math.abs(config.reviewLossFromCostPct))} thesis review threshold.`
      ));
    }
  }

  if (Number.isFinite(drawdownFromRecentHighPct) && drawdownFromRecentHighPct <= config.trailingDrawdownAlertPct) {
    triggeredRules.push(rule(
      "drawdown_from_high",
      "Drawdown from recent high exceeds guardrail",
      "medium",
      1,
      `${label} is ${formatPctNumber(Math.abs(drawdownFromRecentHighPct))} below its recent high, which exceeds the ${formatPctNumber(Math.abs(config.trailingDrawdownAlertPct))} trailing drawdown alert.`
    ));
  }
  if (above50DMA === false) {
    triggeredRules.push(rule(
      "below_50_dma",
      "Below 50-day moving average",
      "medium",
      1,
      `${label} is trading below its 50-day moving average, a short/intermediate trend warning.`
    ));
  }
  if (above200DMA === false) {
    triggeredRules.push(rule(
      "below_200_dma",
      "Below 200-day moving average",
      "high",
      2,
      `${label} is trading below its 200-day moving average, indicating a possible long-term trend break.`
    ));
  }
  if (twoWeeklyClosesBelow200DMA === true) {
    triggeredRules.push(rule(
      "two_weekly_closes_below_200_dma",
      "Two weekly closes below 200DMA",
      "critical",
      3,
      `${label} has two weekly closes below the 200-day moving average, confirming a deeper trend-break review condition.`
    ));
  }
  if (portfolioDrawdownTriggerActive) {
    triggeredRules.push(rule(
      "portfolio_drawdown_overlay",
      "Portfolio drawdown overlay active",
      "high",
      2,
      "Portfolio-level drawdown is elevated, so individual high-risk positions receive extra review weight."
    ));
  }

  const riskScore = triggeredRules.reduce((total, item) => total + item.points, 0);
  return {
    riskScore,
    riskAction: riskActionForScore(riskScore),
    triggeredRules
  };
}

export function filterRiskGuardrailRows(rows = [], filter = "all") {
  const normalized = String(filter || "all").toLowerCase();
  return rows.filter((row) => {
    if (normalized === "all") return true;
    if (["hold", "review", "trim", "exit"].includes(normalized)) return row.riskAction === normalized;
    if (normalized === "missing-data") return (row.missingData || []).length > 0;
    if (normalized === "above-target") return (row.triggeredRules || []).some((ruleItem) => ruleItem.id === "position_above_target" || ruleItem.id === "position_above_hard_trim");
    if (normalized === "below-200dma") return row.above200DMA === false;
    if (normalized === "down-20") return Number.isFinite(row.gainLossFromCostPct) && row.gainLossFromCostPct <= -20;
    return true;
  });
}

export function sortRiskGuardrailRows(rows = [], key = "riskScore", direction = -1) {
  const multiplier = direction === 1 ? 1 : -1;
  return [...rows].sort((left, right) => {
    const leftValue = riskSortValue(left, key);
    const rightValue = riskSortValue(right, key);
    if (typeof leftValue === "string" || typeof rightValue === "string") {
      return String(leftValue || "").localeCompare(String(rightValue || "")) * multiplier;
    }
    if (leftValue === rightValue) return left.symbol.localeCompare(right.symbol);
    return ((leftValue ?? Number.NEGATIVE_INFINITY) - (rightValue ?? Number.NEGATIVE_INFINITY)) * multiplier;
  });
}

function buildRiskGuardrailSummary(rows = []) {
  const counts = { hold: 0, review: 0, trim: 0, exit: 0 };
  rows.forEach((row) => {
    counts[row.riskAction] = (counts[row.riskAction] || 0) + 1;
  });
  const highestRiskHolding = rows[0] || null;
  const largestConcentration = [...rows].sort((a, b) => b.portfolioWeightPct - a.portfolioWeightPct)[0] || null;
  const biggestDrawdown = rows
    .filter((row) => Number.isFinite(row.drawdownFromRecentHighPct))
    .sort((a, b) => a.drawdownFromRecentHighPct - b.drawdownFromRecentHighPct)[0] || null;
  const below200DMA = rows.filter((row) => row.above200DMA === false).length;
  const missingDataCount = rows.filter((row) => (row.missingData || []).length > 0).length;
  const overallStatus = counts.exit ? "critical" : counts.trim ? "high" : counts.review ? "elevated" : rows.length ? "normal" : "empty";
  const statusLabel = ({
    critical: "Exit review active",
    high: "Elevated",
    elevated: "Review",
    normal: "Calm",
    empty: "No holdings"
  })[overallStatus];
  const suggestedActionSummary = summaryAction({ counts, highestRiskHolding, largestConcentration, below200DMA, missingDataCount });

  return {
    total: rows.length,
    counts,
    overallStatus,
    statusLabel,
    highestRiskHolding,
    largestConcentration,
    biggestDrawdown,
    below200DMA,
    missingDataCount,
    suggestedActionSummary
  };
}

function normalizedGuardrailConfig(category, overrides = {}) {
  const base = DEFAULT_RISK_GUARDRAILS[category] || DEFAULT_RISK_GUARDRAILS.speculative_growth;
  const override = overrides?.[category] || {};
  return {
    ...base,
    ...override,
    category: base.category
  };
}

function currentPriceForHolding(holding = {}) {
  const direct = positiveNumber(holding.marketDataPrice) || positiveNumber(holding.currentPrice) || positiveNumber(holding.price);
  if (direct) return direct;
  const shares = positiveNumber(holding.shares);
  const marketValue = positiveNumber(holding.marketValue);
  return shares ? marketValue / shares : null;
}

function normalizePriceHistory(holding = {}) {
  const points = holding.marketDataHistoricalPrices || holding.historicalPrices || holding.history || holding.prices || [];
  if (!Array.isArray(points)) return [];
  return points
    .map((point, index) => {
      if (typeof point === "number") return { date: `point-${index}`, close: Number(point), high: Number(point) };
      const close = Number(point?.close ?? point?.price ?? point?.adjustedClose ?? point?.adjClose ?? point?.value);
      if (!Number.isFinite(close) || close <= 0) return null;
      const high = Number(point?.high ?? close);
      return {
        date: String(point?.date || point?.timestamp || point?.time || `point-${index}`),
        close,
        high: Number.isFinite(high) && high > 0 ? high : close
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function movingAverage(history = [], window = 50, endIndex = history.length - 1) {
  if (!Array.isArray(history) || endIndex < window - 1) return null;
  const slice = history.slice(endIndex - window + 1, endIndex + 1).map((point) => Number(point.close)).filter(Number.isFinite);
  if (slice.length < window) return null;
  return slice.reduce((total, value) => total + value, 0) / window;
}

function drawdownFromRecentHigh(currentPrice, history = []) {
  const price = positiveNumber(currentPrice);
  if (!price) return null;
  const highs = history.map((point) => positiveNumber(point.high) || positiveNumber(point.close)).filter(Boolean);
  highs.push(price);
  const high = Math.max(...highs);
  return high > 0 ? (price / high - 1) * 100 : null;
}

function twoWeeklyCloseBreak(history = []) {
  if (!Array.isArray(history) || history.length < 210) return null;
  const lastIndex = history.length - 1;
  const previousWeekIndex = Math.max(0, lastIndex - 5);
  const latest200 = movingAverage(history, 200, lastIndex);
  const previous200 = movingAverage(history, 200, previousWeekIndex);
  if (!latest200 || !previous200) return null;
  return Number(history[lastIndex]?.close) < latest200 && Number(history[previousWeekIndex]?.close) < previous200;
}

function missingDataForMetrics({ holding = {}, currentPrice, costBasis, history = [], fiftyDayMovingAverage, twoHundredDayMovingAverage }) {
  const missing = [];
  if (!currentPrice) missing.push("current price");
  if (!costBasis) missing.push("cost basis");
  if (!history.length) missing.push("historical prices");
  if (!fiftyDayMovingAverage) missing.push("50DMA");
  if (!twoHundredDayMovingAverage) missing.push("200DMA");
  if (!holding.marketDataStatus && !holding.marketDataMode && !holding.source) missing.push("source status");
  return missing;
}

function rule(id, label, severity, points, explanation) {
  return { id, label, severity, points, explanation };
}

function isRiskEligibleHolding(holding = {}) {
  const ticker = normalizeTicker(holding.ticker || holding.symbol);
  if (!ticker) return false;
  return !isCashLikeHolding(holding, ticker);
}

function isCashLikeHolding(holding = {}, ticker = normalizeTicker(holding.ticker || holding.symbol)) {
  const text = `${ticker} ${holding.name || ""} ${holding.assetClass || ""} ${holding.sector || ""} ${holding.strategySleeve || ""}`.toLowerCase();
  return CASH_LIKE_TICKERS.has(ticker) || /cash|money market|core position|sweep|treasury bills/.test(text);
}

function positiveNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function percentFromWeight(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return numeric <= 1 ? numeric * 100 : numeric;
}

function riskSortValue(row = {}, key = "") {
  if (key === "symbol") return row.symbol || "";
  if (key === "riskCategory") return row.riskCategoryLabel || "";
  if (key === "riskAction") return actionRank(row.riskAction);
  if (key === "gainLossFromCostPct") return Number.isFinite(row.gainLossFromCostPct) ? row.gainLossFromCostPct : 999;
  if (key === "drawdownFromRecentHighPct") return Number.isFinite(row.drawdownFromRecentHighPct) ? row.drawdownFromRecentHighPct : 999;
  return Number(row[key]) || 0;
}

function actionRank(action = "hold") {
  return ({ hold: 0, review: 1, trim: 2, exit: 3 })[action] ?? 0;
}

function summaryAction({ counts, highestRiskHolding, largestConcentration, below200DMA, missingDataCount }) {
  if (counts.exit) return `Review ${highestRiskHolding?.symbol || "the highest-risk holding"} first; one or more guardrails point to an exit/major-cut review.`;
  if (counts.trim) return `Review trim candidates before adding risk; ${highestRiskHolding?.symbol || "the top row"} has the highest guardrail score.`;
  if (counts.review) return `Re-check thesis and sizing for ${highestRiskHolding?.symbol || "review rows"} before changing exposure.`;
  if (below200DMA) return `${below200DMA} holding${below200DMA === 1 ? "" : "s"} are below 200DMA; confirm whether the trend break matters.`;
  if (missingDataCount) return `Refresh market data or import cost basis for ${missingDataCount} row${missingDataCount === 1 ? "" : "s"} with incomplete risk metrics.`;
  if (largestConcentration) return `${largestConcentration.symbol} is the largest risk-controlled position at ${formatPctNumber(largestConcentration.portfolioWeightPct)}.`;
  return "Import holdings to activate risk guardrails.";
}

function sum(rows = [], key = "") {
  return rows.reduce((total, row) => total + (Number(row?.[key]) || 0), 0);
}

function formatPctNumber(value) {
  if (!Number.isFinite(Number(value))) return "unavailable";
  return `${Number(value).toFixed(Math.abs(Number(value)) >= 10 ? 1 : 2)}%`;
}
