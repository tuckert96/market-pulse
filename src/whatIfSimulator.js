import { buildLocalAlerts, DEFAULT_ALERT_THRESHOLDS, normalizeAlertThresholds } from "./alertsEngine.js";
import { analyzePortfolio } from "./portfolioAnalytics.js";
import { normalizeHolding, normalizeHoldings, normalizeTicker, decimalPercent, numberFrom } from "./portfolioSchema.js";

export const WHAT_IF_ACTIONS = Object.freeze([
  "add",
  "trim-dollar",
  "trim-percent",
  "remove",
  "rebalance-target"
]);

export function normalizeWhatIfScenario(input = {}) {
  const action = normalizeAction(input.action || input.type);
  return {
    action,
    ticker: normalizeTicker(input.ticker),
    amount: positiveNumber(input.amount),
    percent: clampPercent(input.percent),
    targetWeight: clampPercent(input.targetWeight),
    fundingMode: input.fundingMode === "external" ? "external" : "cash-first",
    readOnly: true
  };
}

export function simulateWhatIf({
  holdings = [],
  scenario = {},
  targetPlan = {},
  alertThresholds = DEFAULT_ALERT_THRESHOLDS,
  asOf = new Date().toISOString()
} = {}) {
  const currentHoldings = normalizeHoldings(holdings);
  const normalizedScenario = normalizeWhatIfScenario(scenario);
  const validation = validateScenario(currentHoldings, normalizedScenario, targetPlan);
  const before = buildScenarioModel(currentHoldings, alertThresholds, asOf);

  if (!validation.ok) {
    return {
      status: "invalid",
      message: validation.message,
      scenario: normalizedScenario,
      readOnly: true,
      before,
      after: before,
      deltas: buildDeltaSummary(before.analysis, before.analysis),
      tickerRows: [],
      sectorRows: [],
      riskRows: [],
      alertsTriggered: [],
      alertsResolved: [],
      warnings: validation.warnings || []
    };
  }

  const applied = applyWhatIfScenario(currentHoldings, normalizedScenario, { targetPlan, asOf });
  const simulatedHoldings = normalizeHoldings(applied.holdings);
  const after = buildScenarioModel(simulatedHoldings, alertThresholds, asOf);

  return {
    status: "ready",
    message: describeScenario(normalizedScenario, { ...applied, targetPlan }),
    scenario: normalizedScenario,
    readOnly: true,
    before,
    after,
    deltas: buildDeltaSummary(before.analysis, after.analysis),
    tickerRows: compareTickerWeights(before.analysis.holdings, after.analysis.holdings),
    sectorRows: compareBreakdownRows(before.analysis.breakdowns.sector, after.analysis.breakdowns.sector),
    riskRows: buildRiskRows(before.analysis, after.analysis),
    alertsTriggered: diffAlerts(before.alerts, after.alerts),
    alertsResolved: diffAlerts(after.alerts, before.alerts),
    warnings: applied.warnings || []
  };
}

export function applyWhatIfScenario(rawHoldings = [], rawScenario = {}, options = {}) {
  const scenario = normalizeWhatIfScenario(rawScenario);
  let holdings = cloneHoldings(normalizeHoldings(rawHoldings));
  const warnings = [];

  if (scenario.action === "add") {
    const template = templateForTicker(holdings, scenario.ticker);
    const cashShift = scenario.fundingMode === "external"
      ? { holdings, fundedAmount: 0, unfundedAmount: scenario.amount }
      : shiftCash(holdings, -scenario.amount, options.asOf);
    holdings = cashShift.holdings;
    holdings.push(buildSyntheticPosition(scenario.ticker, scenario.amount, template, options.asOf));
    if (cashShift.unfundedAmount > 0 || scenario.fundingMode === "external") {
      warnings.push(`${formatCurrency(cashShift.unfundedAmount || scenario.amount)} is modeled as outside contribution because it is not offset by current cash.`);
    }
    return { holdings, warnings };
  }

  if (scenario.action === "remove") {
    const reduced = reduceTickerExposure(holdings, scenario.ticker, Number.POSITIVE_INFINITY);
    holdings = reduced.holdings;
    holdings = shiftCash(holdings, reduced.removedValue, options.asOf).holdings;
    if (reduced.removedValue <= 0) warnings.push(`${scenario.ticker} is not currently owned, so the removal scenario has no portfolio effect.`);
    return { holdings, warnings };
  }

  if (scenario.action === "trim-dollar") {
    const reduced = reduceTickerExposure(holdings, scenario.ticker, scenario.amount);
    holdings = reduced.holdings;
    holdings = shiftCash(holdings, reduced.removedValue, options.asOf).holdings;
    if (reduced.capped) warnings.push(`Trim amount was capped at the current ${scenario.ticker} market value.`);
    return { holdings, warnings };
  }

  if (scenario.action === "trim-percent") {
    const currentValue = tickerMarketValue(holdings, scenario.ticker);
    const reduced = reduceTickerExposure(holdings, scenario.ticker, currentValue * scenario.percent);
    holdings = reduced.holdings;
    holdings = shiftCash(holdings, reduced.removedValue, options.asOf).holdings;
    return { holdings, warnings };
  }

  if (scenario.action === "rebalance-target") {
    const totalValue = totalMarketValue(holdings);
    const targetWeight = targetWeightForScenario(scenario, options.targetPlan);
    const currentValue = tickerMarketValue(holdings, scenario.ticker);
    const targetValue = totalValue * targetWeight;
    const delta = targetValue - currentValue;
    if (Math.abs(delta) < 1) {
      warnings.push(`${scenario.ticker} is already near the selected target weight.`);
      return { holdings, warnings };
    }
    if (delta > 0) {
      const template = templateForTicker(holdings, scenario.ticker);
      const cashShift = shiftCash(holdings, -delta, options.asOf);
      holdings = cashShift.holdings;
      holdings.push(buildSyntheticPosition(scenario.ticker, delta, template, options.asOf));
      if (cashShift.unfundedAmount > 0) warnings.push(`${formatCurrency(cashShift.unfundedAmount)} would require outside cash to reach the target.`);
      return { holdings, warnings };
    }
    const reduced = reduceTickerExposure(holdings, scenario.ticker, Math.abs(delta));
    holdings = shiftCash(reduced.holdings, reduced.removedValue, options.asOf).holdings;
    return { holdings, warnings };
  }

  return { holdings, warnings };
}

export function describeScenario(scenario = {}, applied = {}) {
  const normalized = normalizeWhatIfScenario(scenario);
  const ticker = normalized.ticker || "selected ticker";
  if (normalized.action === "add") {
    const funding = normalized.fundingMode === "external" ? "as outside contribution" : "using cash first";
    return `Simulated add of ${formatCurrency(normalized.amount)} to ${ticker}, ${funding}. Real holdings were not changed.`;
  }
  if (normalized.action === "trim-dollar") return `Simulated trim of ${formatCurrency(normalized.amount)} from ${ticker}. Proceeds move to simulated cash. Real holdings were not changed.`;
  if (normalized.action === "trim-percent") return `Simulated trim of ${formatPct(normalized.percent)} from ${ticker}. Proceeds move to simulated cash. Real holdings were not changed.`;
  if (normalized.action === "remove") return `Simulated full removal of ${ticker}. Proceeds move to simulated cash. Real holdings were not changed.`;
  if (normalized.action === "rebalance-target") {
    const target = targetWeightForScenario(normalized, applied.targetPlan);
    return `Simulated rebalance of ${ticker} to ${formatPct(target)} target weight. Real holdings were not changed.`;
  }
  return "Read-only what-if scenario.";
}

function buildScenarioModel(holdings = [], thresholds = DEFAULT_ALERT_THRESHOLDS, asOf = new Date().toISOString()) {
  const alertThresholds = normalizeAlertThresholds(thresholds);
  const analysis = analyzePortfolio(holdings, { ...alertThresholds, skipPortfolioThresholdAlerts: false });
  const localAlerts = buildLocalAlerts({
    analysis,
    thresholds: alertThresholds,
    marketDataStatus: { status: "mock/sample mode", detail: "What-if simulation uses the current local portfolio model." },
    asOf
  }).filter((alert) => alert.type !== "data-source");
  return {
    analysis,
    alerts: dedupeAlerts([...analysis.alerts, ...localAlerts])
  };
}

function validateScenario(holdings = [], scenario = {}, targetPlan = {}) {
  if (!WHAT_IF_ACTIONS.includes(scenario.action)) return { ok: false, message: "Choose a scenario type." };
  if (!scenario.ticker) return { ok: false, message: "Enter a ticker for the scenario." };
  if (["trim-dollar", "trim-percent", "remove", "rebalance-target"].includes(scenario.action) && tickerMarketValue(holdings, scenario.ticker) <= 0) {
    return { ok: false, message: `${scenario.ticker} is not currently owned. Use Add position for new or watchlist tickers.` };
  }
  if (["add", "trim-dollar"].includes(scenario.action) && scenario.amount <= 0) {
    return { ok: false, message: "Enter a dollar amount greater than zero." };
  }
  if (scenario.action === "trim-percent" && scenario.percent <= 0) {
    return { ok: false, message: "Enter a trim percentage greater than zero." };
  }
  if (scenario.action === "rebalance-target" && targetWeightForScenario(scenario, targetPlan) <= 0) {
    return { ok: false, message: `No target weight found for ${scenario.ticker}. Enter a target percentage or save a target allocation first.` };
  }
  return { ok: true };
}

function buildDeltaSummary(before = {}, after = {}) {
  return {
    totalValue: deltaMetric(before.overview?.totalValue, after.overview?.totalValue),
    cashBalance: deltaMetric(before.overview?.cashBalance, after.overview?.cashBalance),
    top10Weight: deltaMetric(before.risk?.top10Weight, after.risk?.top10Weight),
    concentrationScore: deltaMetric(before.risk?.concentrationScore, after.risk?.concentrationScore),
    leveragedDirectExposure: deltaMetric(before.overview?.leveragedEtfExposure, after.overview?.leveragedEtfExposure),
    leveragedNotionalExposure: deltaMetric(before.overview?.leveragedNotionalExposure, after.overview?.leveragedNotionalExposure)
  };
}

function compareTickerWeights(beforeHoldings = [], afterHoldings = []) {
  const before = aggregateByTicker(beforeHoldings);
  const after = aggregateByTicker(afterHoldings);
  return compareMaps(before, after)
    .sort((a, b) => Math.abs(b.deltaValue) - Math.abs(a.deltaValue) || b.afterValue - a.afterValue)
    .slice(0, 12);
}

function compareBreakdownRows(beforeRows = [], afterRows = []) {
  const before = new Map((beforeRows || []).map((row) => [row.name, { value: row.value, weight: row.weight }]));
  const after = new Map((afterRows || []).map((row) => [row.name, { value: row.value, weight: row.weight }]));
  return compareMaps(before, after, "name")
    .sort((a, b) => Math.abs(b.deltaValue) - Math.abs(a.deltaValue) || b.afterValue - a.afterValue)
    .slice(0, 10);
}

function buildRiskRows(before = {}, after = {}) {
  return [
    {
      id: "total-value",
      label: "Total portfolio value",
      before: before.overview?.totalValue || 0,
      after: after.overview?.totalValue || 0,
      delta: (after.overview?.totalValue || 0) - (before.overview?.totalValue || 0),
      format: "currency"
    },
    {
      id: "cash",
      label: "Cash balance",
      before: before.overview?.cashBalance || 0,
      after: after.overview?.cashBalance || 0,
      delta: (after.overview?.cashBalance || 0) - (before.overview?.cashBalance || 0),
      format: "currency"
    },
    {
      id: "top10",
      label: "Top 10 concentration",
      before: before.risk?.top10Weight || 0,
      after: after.risk?.top10Weight || 0,
      delta: (after.risk?.top10Weight || 0) - (before.risk?.top10Weight || 0),
      format: "percent"
    },
    {
      id: "leveraged-notional",
      label: "Leveraged ETF notional exposure",
      before: before.overview?.leveragedNotionalExposure || 0,
      after: after.overview?.leveragedNotionalExposure || 0,
      delta: (after.overview?.leveragedNotionalExposure || 0) - (before.overview?.leveragedNotionalExposure || 0),
      format: "currency"
    },
    {
      id: "concentration-score",
      label: "Concentration score",
      before: before.risk?.concentrationScore || 0,
      after: after.risk?.concentrationScore || 0,
      delta: (after.risk?.concentrationScore || 0) - (before.risk?.concentrationScore || 0),
      format: "number"
    }
  ];
}

function applyDollarScale(holding = {}, ratio = 1) {
  return normalizeHolding({
    ...holding,
    shares: (Number(holding.shares) || 0) * ratio,
    marketValue: (Number(holding.marketValue) || 0) * ratio,
    costBasis: (Number(holding.costBasis) || 0) * ratio,
    unrealizedGain: (Number(holding.unrealizedGain) || 0) * ratio,
    dailyChange: (Number(holding.dailyChange) || 0) * ratio,
    source: "what-if simulation"
  }, { sourceAsOf: holding.sourceAsOf });
}

function reduceTickerExposure(holdings = [], ticker = "", amount = 0) {
  const normalizedTicker = normalizeTicker(ticker);
  const targetRows = holdings.filter((holding) => holding.ticker === normalizedTicker);
  const currentValue = sum(targetRows, "marketValue");
  const removedValue = Math.min(currentValue, Math.max(0, Number(amount) || 0));
  if (!targetRows.length || removedValue <= 0) return { holdings, removedValue: 0, capped: false };
  const reductionRatio = currentValue ? removedValue / currentValue : 0;
  const nextHoldings = holdings.flatMap((holding) => {
    if (holding.ticker !== normalizedTicker) return [holding];
    const remainingRatio = Math.max(0, 1 - reductionRatio);
    if (remainingRatio <= 0.000001) return [];
    return [applyDollarScale(holding, remainingRatio)];
  });
  return {
    holdings: nextHoldings,
    removedValue,
    capped: amount > currentValue
  };
}

function shiftCash(holdings = [], delta = 0, asOf = new Date().toISOString()) {
  if (Math.abs(delta) < 0.01) return { holdings, fundedAmount: 0, unfundedAmount: 0 };
  if (delta > 0) {
    return {
      holdings: [...holdings, buildSyntheticCash(delta, asOf)],
      fundedAmount: 0,
      unfundedAmount: 0
    };
  }

  const required = Math.abs(delta);
  const cashRows = holdings.filter(isCashHolding);
  const cashValue = sum(cashRows, "marketValue");
  const fundedAmount = Math.min(required, cashValue);
  const unfundedAmount = Math.max(0, required - fundedAmount);
  if (fundedAmount <= 0 || cashValue <= 0) return { holdings, fundedAmount, unfundedAmount };
  const reductionRatio = fundedAmount / cashValue;
  const nextHoldings = holdings.flatMap((holding) => {
    if (!isCashHolding(holding)) return [holding];
    const remainingRatio = Math.max(0, 1 - reductionRatio);
    if (remainingRatio <= 0.000001) return [];
    return [applyDollarScale(holding, remainingRatio)];
  });
  return { holdings: nextHoldings, fundedAmount, unfundedAmount };
}

function buildSyntheticPosition(ticker = "", amount = 0, template = {}, asOf = new Date().toISOString()) {
  const price = Number(template?.price) > 0 ? Number(template.price) : 0;
  return normalizeHolding({
    ticker,
    name: template?.name || `${ticker} scenario position`,
    account: "What-if model",
    accountType: "Simulation",
    shares: price ? amount / price : 0,
    price,
    marketValue: amount,
    costBasis: amount,
    sector: template?.sector || "Unknown",
    assetClass: template?.assetClass || "Equity",
    strategySleeve: template?.strategySleeve || "Individual stock conviction",
    thesisStatus: template?.thesisStatus || "Scenario only",
    riskLevel: template?.riskLevel || "Medium",
    leveragedMultiple: template?.leveragedMultiple,
    isLeveragedEtf: template?.isLeveragedEtf,
    isSemiconductor: template?.isSemiconductor,
    isAiTheme: template?.isAiTheme,
    isMegaCapTech: template?.isMegaCapTech,
    beta: template?.beta,
    source: "what-if simulation",
    sourceAsOf: asOf
  });
}

function buildSyntheticCash(amount = 0, asOf = new Date().toISOString()) {
  return normalizeHolding({
    ticker: "CASH",
    name: "What-if cash balance",
    account: "What-if model",
    accountType: "Simulation",
    shares: amount,
    price: 1,
    marketValue: amount,
    costBasis: amount,
    sector: "Cash",
    assetClass: "Cash",
    strategySleeve: "Cash",
    riskLevel: "Low",
    thesisStatus: "Scenario only",
    source: "what-if simulation",
    sourceAsOf: asOf
  });
}

function templateForTicker(holdings = [], ticker = "") {
  return holdings.find((holding) => holding.ticker === normalizeTicker(ticker)) || {};
}

function targetWeightForScenario(scenario = {}, targetPlan = {}) {
  if (scenario.targetWeight > 0) return scenario.targetWeight;
  const ticker = normalizeTicker(scenario.ticker);
  const row = (targetPlan?.rows || []).find((item) => item.scope === "ticker" && normalizeTicker(item.key) === ticker);
  return Number(row?.targetWeight) || 0;
}

function aggregateByTicker(holdings = []) {
  const totalValue = totalMarketValue(holdings);
  const map = new Map();
  holdings.forEach((holding) => {
    const key = holding.ticker || "UNKNOWN";
    const current = map.get(key) || { key, ticker: key, name: holding.name, value: 0, weight: 0 };
    current.value += Number(holding.marketValue) || 0;
    current.name = current.name || holding.name;
    map.set(key, current);
  });
  map.forEach((row) => {
    row.weight = totalValue ? row.value / totalValue : 0;
  });
  return map;
}

function compareMaps(before = new Map(), after = new Map(), keyField = "ticker") {
  const keys = [...new Set([...before.keys(), ...after.keys()])].sort();
  return keys.map((key) => {
    const beforeRow = before.get(key) || { value: 0, weight: 0 };
    const afterRow = after.get(key) || { value: 0, weight: 0 };
    return {
      [keyField]: key,
      key,
      beforeValue: Number(beforeRow.value) || 0,
      afterValue: Number(afterRow.value) || 0,
      deltaValue: (Number(afterRow.value) || 0) - (Number(beforeRow.value) || 0),
      beforeWeight: Number(beforeRow.weight) || 0,
      afterWeight: Number(afterRow.weight) || 0,
      deltaWeight: (Number(afterRow.weight) || 0) - (Number(beforeRow.weight) || 0)
    };
  }).filter((row) => row.beforeValue || row.afterValue || row.deltaValue);
}

function diffAlerts(left = [], right = []) {
  const rightIds = new Set(right.map((alert) => alert.id || alert.title));
  return left.filter((alert) => !rightIds.has(alert.id || alert.title)).slice(0, 8);
}

function dedupeAlerts(alerts = []) {
  const seen = new Set();
  return alerts.filter((alert) => {
    const key = alert.id || alert.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function deltaMetric(before = 0, after = 0) {
  return {
    before: Number(before) || 0,
    after: Number(after) || 0,
    delta: (Number(after) || 0) - (Number(before) || 0)
  };
}

function tickerMarketValue(holdings = [], ticker = "") {
  const normalizedTicker = normalizeTicker(ticker);
  return sum(holdings.filter((holding) => holding.ticker === normalizedTicker), "marketValue");
}

function totalMarketValue(holdings = []) {
  return sum(holdings, "marketValue");
}

function sum(rows = [], field = "marketValue") {
  return rows.reduce((total, row) => total + (Number(row[field]) || 0), 0);
}

function isCashHolding(holding = {}) {
  return /^cash$/i.test(String(holding.assetClass || "")) ||
    /^(CASH|FCASH|SPAXX|FDRXX|FZFXX|FDLXX|SPRXX)$/i.test(String(holding.ticker || "")) ||
    /cash|money market/i.test(`${holding.name} ${holding.sector}`);
}

function cloneHoldings(holdings = []) {
  return holdings.map((holding) => ({ ...holding }));
}

function normalizeAction(value = "") {
  const action = String(value || "add").trim().toLowerCase();
  if (["add", "buy", "increase"].includes(action)) return "add";
  if (["trim", "trim-dollar", "sell-dollar"].includes(action)) return "trim-dollar";
  if (["trim-percent", "sell-percent", "reduce-percent"].includes(action)) return "trim-percent";
  if (["remove", "exit", "sell-all"].includes(action)) return "remove";
  if (["rebalance", "rebalance-target", "target"].includes(action)) return "rebalance-target";
  return "add";
}

function positiveNumber(value = 0) {
  return Math.max(0, numberFrom(value, 0));
}

function clampPercent(value = 0) {
  return Math.max(0, Math.min(1, decimalPercent(value ?? 0)));
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function formatPct(value) {
  return `${((Number(value) || 0) * 100).toFixed(1)}%`;
}
