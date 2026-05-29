import { isLeveragedEtfTicker } from "./portfolioSchema.js";

const TARGET_SCOPES = new Set(["ticker", "assetClass", "strategySleeve", "account"]);

export function defaultTargetAllocations() {
  return [
    target("ticker", "MU", 0.08, 0.05, 0.11, "high", "Memory cycle / HBM conviction holding."),
    target("ticker", "NVDA", 0.06, 0.03, 0.08, "high", "AI accelerator leader; keep sizing tied to valuation and revisions."),
    target("ticker", "AMD", 0.04, 0.02, 0.06, "medium", "AI/CPU optionality with execution risk."),
    target("ticker", "SOXL", 0.05, 0.02, 0.07, "high", "3x semiconductor sleeve; cap tightly because drawdowns compound.", 0.21),
    target("ticker", "UPRO", 0.08, 0.04, 0.1, "high", "3x S&P 500 exposure; review when volatility regime worsens.", 0.3),
    target("ticker", "VGT", 0.1, 0.06, 0.14, "medium", "Core technology ETF exposure."),
    target("ticker", "CRDO", 0.03, 0.01, 0.05, "medium", "Speculative AI infrastructure holding."),
    target("assetClass", "Cash", 0.15, 0.05, 0.25, "high", "Dry powder and volatility buffer."),
    target("strategySleeve", "Core index", 0.25, 0.15, 0.35, "medium", "Broad market anchor."),
    target("strategySleeve", "Leveraged growth", 0.1, 0.04, 0.15, "high", "Amplified equity sleeve; review caps before adding."),
    target("strategySleeve", "AI / semiconductor", 0.2, 0.1, 0.3, "high", "High-growth theme with cyclicality and valuation risk."),
    target("strategySleeve", "Individual stock conviction", 0.15, 0.08, 0.22, "medium", "Single-stock picks sized to thesis strength."),
    target("strategySleeve", "Treasuries / hedge", 0.08, 0.02, 0.15, "medium", "Portfolio stabilizer."),
    target("strategySleeve", "Cash", 0.17, 0.05, 0.25, "high", "Cash sleeve target for deployment planning."),
    target("strategySleeve", "Speculative", 0.05, 0, 0.08, "low", "Small experimental sleeve.")
  ];
}

export function normalizeTargetAllocations(records = []) {
  const input = Array.isArray(records) ? records : [];
  const seen = new Map();

  for (const item of input) {
    const scope = normalizeScope(item.scope);
    const key = normalizeKey(scope, item.key);
    if (!scope || !key) continue;
    const normalized = {
      id: targetId(scope, key),
      scope,
      key,
      targetWeight: normalizeWeight(item.targetWeight ?? item.targetPercent ?? item.target),
      minWeight: normalizeWeight(item.minWeight ?? item.minPercent ?? item.min),
      maxWeight: normalizeWeight(item.maxWeight ?? item.maxPercent ?? item.max),
      priority: normalizePriority(item.priority),
      notes: String(item.notes || "").trim(),
      maxEffectiveExposure: normalizeWeight(item.maxEffectiveExposure ?? item.maxEffectivePercent)
    };
    if (normalized.maxWeight && normalized.minWeight && normalized.minWeight > normalized.maxWeight) {
      const temp = normalized.minWeight;
      normalized.minWeight = normalized.maxWeight;
      normalized.maxWeight = temp;
    }
    if (!normalized.maxWeight && normalized.targetWeight) normalized.maxWeight = normalized.targetWeight * 1.25;
    if (!normalized.minWeight && normalized.targetWeight) normalized.minWeight = Math.max(0, normalized.targetWeight * 0.75);
    seen.set(normalized.id, normalized);
  }

  return [...seen.values()].sort(compareTargets);
}

export function buildTargetAllocationPlan(holdings = [], targetAllocations = defaultTargetAllocations(), options = {}) {
  const targets = normalizeTargetAllocations(targetAllocations);
  const totalValue = totalMarketValue(holdings);
  const rows = buildTargetAllocationRows(holdings, targets, options);
  const cashPlan = buildCashDeploymentPlan(holdings, targets, rows, options);
  const leveragedGuardrails = buildLeveragedGuardrails(holdings, targets, options);
  const mode = normalizeRebalanceMode(options.mode || "new-contribution");
  const suggestions = buildRebalanceSuggestions(rows, cashPlan, leveragedGuardrails, {
    mode,
    totalValue
  });
  const simulator = buildRebalancingSimulator(holdings, targets, rows, cashPlan, {
    ...options,
    mode
  });

  return {
    mode,
    totalValue,
    targetCount: targets.length,
    rows,
    cashPlan,
    leveragedGuardrails,
    suggestions,
    simulator
  };
}

export function buildTargetAllocationRows(holdings = [], targetAllocations = defaultTargetAllocations(), options = {}) {
  const targets = normalizeTargetAllocations(targetAllocations);
  const totalValue = totalMarketValue(holdings);
  const groups = groupHoldingsByScope(holdings);
  const rowsById = new Map();

  for (const allocation of targets) {
    const group = groups.get(allocation.id) || emptyGroup(allocation.scope, allocation.key);
    rowsById.set(allocation.id, rowFromGroup(group, allocation, totalValue, options));
  }

  for (const group of groups.values()) {
    if (rowsById.has(group.id)) continue;
    const fallbackTarget = {
      id: group.id,
      scope: group.scope,
      key: group.key,
      targetWeight: group.scope === "ticker" ? inferCurrentTarget(group.holdings) : 0,
      minWeight: 0,
      maxWeight: 0,
      priority: "medium",
      notes: "No saved target yet."
    };
    rowsById.set(group.id, rowFromGroup(group, fallbackTarget, totalValue, options));
  }

  return [...rowsById.values()].sort((a, b) =>
    scopeRank(a.scope) - scopeRank(b.scope) ||
    Math.abs(b.driftValue) - Math.abs(a.driftValue) ||
    b.currentValue - a.currentValue ||
    a.key.localeCompare(b.key)
  );
}

export function buildCashDeploymentPlan(holdings = [], targetAllocations = defaultTargetAllocations(), rows = [], options = {}) {
  const totalValue = totalMarketValue(holdings);
  const availableCash = holdings
    .filter((holding) => isCashHolding(holding))
    .reduce((sum, holding) => sum + (Number(holding.marketValue) || 0), 0);
  const cashTarget = findCashTarget(normalizeTargetAllocations(targetAllocations));
  const targetCashWeight = cashTarget?.targetWeight ?? 0.15;
  const targetCashValue = totalValue * targetCashWeight;
  const excessCash = Math.max(0, availableCash - targetCashValue);
  const contributionAmount = Number(options.contributionAmount ?? excessCash);
  const deployableCash = Math.max(0, Math.min(availableCash, contributionAmount || excessCash));
  const underweightRows = rows
    .filter((row) => row.scope === "ticker" && row.status === "underweight" && row.driftValue < -25)
    .sort((a, b) => a.driftValue - b.driftValue);
  const totalNeed = underweightRows.reduce((sum, row) => sum + Math.abs(row.driftValue), 0);
  const suggestions = underweightRows
    .map((row) => {
      const allocation = totalNeed ? Math.min(Math.abs(row.driftValue), deployableCash * (Math.abs(row.driftValue) / totalNeed)) : 0;
      return {
        ticker: row.key,
        amount: Math.round(allocation),
        targetWeight: row.targetWeight,
        currentWeight: row.currentWeight,
        rationale: `${row.key} is under target by ${formatPct(Math.abs(row.driftWeight))}; review using new cash before considering sales.`
      };
    })
    .filter((item) => item.amount >= 25)
    .slice(0, 10);

  return {
    availableCash,
    targetCashWeight,
    targetCashValue,
    excessCash,
    deployableCash,
    suggestions
  };
}

export function buildLeveragedGuardrails(holdings = [], targetAllocations = defaultTargetAllocations(), options = {}) {
  const targets = normalizeTargetAllocations(targetAllocations);
  const totalValue = totalMarketValue(holdings);
  const tickerTargets = new Map(targets.filter((target) => target.scope === "ticker").map((target) => [target.key, target]));
  const leveraged = aggregateByTicker(holdings.filter((holding) => isLeveragedHolding(holding)));

  return leveraged.map((row) => {
    const target = tickerTargets.get(row.ticker);
    const currentWeight = totalValue ? row.marketValue / totalValue : 0;
    const targetCap = target?.maxWeight || (row.ticker === "SOXL" ? 0.07 : row.ticker === "UPRO" ? 0.1 : 0.05);
    const leverageMultiple = Number(options.leverageMultipleByTicker?.[row.ticker] || 3);
    const effectiveExposure = currentWeight * leverageMultiple;
    const maxEffectiveExposure = target?.maxEffectiveExposure || targetCap * leverageMultiple;
    const aboveCap = currentWeight > targetCap + 0.002;
    const effectiveAboveCap = effectiveExposure > maxEffectiveExposure + 0.002;
    return {
      ticker: row.ticker,
      marketValue: row.marketValue,
      currentWeight,
      targetCap,
      leverageMultiple,
      effectiveExposure,
      maxEffectiveExposure,
      status: aboveCap || effectiveAboveCap ? "above cap" : "within cap",
      warning: aboveCap || effectiveAboveCap
        ? `${row.ticker} is above its review cap after accounting for leveraged exposure.`
        : `${row.ticker} is within the current leverage cap.`
    };
  }).sort((a, b) => b.effectiveExposure - a.effectiveExposure);
}

export function buildRebalancingSimulator(
  holdings = [],
  targetAllocations = defaultTargetAllocations(),
  rows = buildTargetAllocationRows(holdings, targetAllocations),
  cashPlan = buildCashDeploymentPlan(holdings, targetAllocations, rows),
  options = {}
) {
  const mode = normalizeRebalanceMode(options.mode || "new-contribution");
  const totalValue = totalMarketValue(holdings);
  const tickerRows = rows.filter((row) => row.scope === "ticker" && row.targetWeight > 0 && row.currentValue > 0);
  const categoryRows = rows.filter((row) => row.scope !== "ticker" && row.targetWeight > 0);
  const taxableByTicker = taxableExposureByTicker(holdings);
  const estimatedTrades = mode === "new-contribution"
    ? buildContributionOnlyTrades(tickerRows, cashPlan)
    : buildSellAndRebalanceTrades(tickerRows, cashPlan, taxableByTicker, mode);
  const simulatedTickerValues = new Map(tickerRows.map((row) => [row.key, row.currentValue]));

  for (const trade of estimatedTrades) {
    if (!trade.ticker || trade.type === "note") continue;
    const current = simulatedTickerValues.get(trade.ticker) || 0;
    simulatedTickerValues.set(trade.ticker, Math.max(0, current + trade.valueDelta));
  }

  const totalAfter = mode === "new-contribution" && (options.treatContributionAsExternal === true)
    ? totalValue + estimatedTrades.reduce((sum, trade) => sum + Math.max(0, trade.valueDelta), 0)
    : totalValue;
  const beforeAfterRows = tickerRows
    .map((row) => {
      const simulatedValue = simulatedTickerValues.get(row.key) ?? row.currentValue;
      const afterWeight = totalAfter ? simulatedValue / totalAfter : 0;
      const driftAfter = afterWeight - row.targetWeight;
      return {
        scope: row.scope,
        key: row.key,
        ticker: row.key,
        currentValue: row.currentValue,
        simulatedValue,
        currentWeight: row.currentWeight,
        targetWeight: row.targetWeight,
        afterWeight,
        driftBefore: row.driftWeight,
        driftAfter,
        driftValueBefore: row.driftValue,
        driftValueAfter: simulatedValue - (totalAfter * row.targetWeight),
        statusBefore: row.status,
        statusAfter: classifySimulatedDrift(afterWeight, row)
      };
    })
    .sort((a, b) => Math.abs(b.driftValueBefore) - Math.abs(a.driftValueBefore))
    .slice(0, 16);
  const categoryAdjustments = categoryRows
    .filter((row) => Math.abs(row.driftValue) >= 100 || row.status !== "within range")
    .sort((a, b) => Math.abs(b.driftValue) - Math.abs(a.driftValue))
    .slice(0, 12)
    .map((row) => ({
      scope: row.scope,
      key: row.key,
      status: row.status,
      currentWeight: row.currentWeight,
      targetWeight: row.targetWeight,
      driftWeight: row.driftWeight,
      driftValue: row.driftValue,
      reviewAction: row.suggestedAction,
      rationale: `${row.key} is ${row.status} by ${formatPct(Math.abs(row.driftWeight))}; use this as category context before adjusting individual holdings.`
    }));
  const taxWarnings = estimatedTrades
    .filter((trade) => trade.taxableWarning)
    .map((trade) => trade.taxableWarning);

  return {
    mode,
    readOnly: true,
    totalValue,
    totalAfter,
    deployableCash: cashPlan.deployableCash || 0,
    saleProceedsModeled: estimatedTrades
      .filter((trade) => trade.valueDelta < 0)
      .reduce((sum, trade) => sum + Math.abs(trade.valueDelta), 0),
    estimatedTrades,
    categoryAdjustments,
    beforeAfterRows,
    taxWarnings,
    note: mode === "new-contribution"
      ? "Models target drift using cash/new contribution only; no existing holdings are reduced."
      : "Models review adjustments that could move holdings closer to target weights. It is not an order ticket."
  };
}

export function targetId(scope, key) {
  return `${normalizeScope(scope) || "ticker"}:${normalizeKey(scope, key)}`;
}

export function targetRecordFromFormRow(row = {}) {
  const scope = normalizeScope(row.scope);
  const key = normalizeKey(scope, row.key);
  return {
    id: targetId(scope, key),
    scope,
    key,
    targetWeight: normalizeWeight(row.targetWeight),
    minWeight: normalizeWeight(row.minWeight),
    maxWeight: normalizeWeight(row.maxWeight),
    priority: normalizePriority(row.priority),
    notes: String(row.notes || "").trim(),
    maxEffectiveExposure: normalizeWeight(row.maxEffectiveExposure)
  };
}

function buildRebalanceSuggestions(rows, cashPlan, guardrails, options = {}) {
  const mode = normalizeRebalanceMode(options.mode || "new-contribution");
  const tickerRows = rows.filter((row) => row.scope === "ticker" && row.currentValue > 0);
  const suggestions = [];

  for (const guardrail of guardrails.filter((item) => item.status === "above cap")) {
    suggestions.push({
      action: "Review leverage cap",
      scope: "ticker",
      key: guardrail.ticker,
      amount: Math.round(Math.max(0, guardrail.marketValue - guardrail.targetCap * options.totalValue)),
      rationale: guardrail.warning
    });
  }

  if (mode === "new-contribution") {
    for (const item of cashPlan.suggestions) {
      suggestions.push({
        action: "Review add with cash",
        scope: "ticker",
        key: item.ticker,
        amount: item.amount,
        rationale: item.rationale
      });
    }
    return suggestions.slice(0, 12);
  }

  for (const row of tickerRows.sort((a, b) => Math.abs(b.driftValue) - Math.abs(a.driftValue))) {
    if (row.status === "within range" || row.status === "no target") continue;
    if (mode === "retirement-only" && !row.accounts.some((account) => /ira|roth|401|403|retirement|hsa/i.test(account))) continue;
    if (mode === "taxable-safe" && row.status === "overweight" && row.accounts.some((account) => /taxable|brokerage/i.test(account))) {
      suggestions.push({
        action: "Hold / review taxable impact",
        scope: row.scope,
        key: row.key,
        amount: 0,
        rationale: `${row.key} is overweight, but taxable caution mode avoids unnecessary taxable sales.`
      });
      continue;
    }
    suggestions.push({
      action: row.status === "overweight" ? "Review trim" : "Review add",
      scope: row.scope,
      key: row.key,
      amount: Math.round(Math.abs(row.driftValue)),
      rationale: `${row.key} is ${row.status} by ${formatPct(Math.abs(row.driftWeight))}.`
    });
  }

  return suggestions.slice(0, 12);
}

function buildContributionOnlyTrades(tickerRows, cashPlan) {
  const suggestions = cashPlan.suggestions || [];
  return suggestions.map((item) => {
    const row = tickerRows.find((targetRow) => targetRow.key === item.ticker);
    return simulatorTrade({
      action: "Review add with cash",
      direction: "add",
      row,
      ticker: item.ticker,
      amount: item.amount,
      rationale: item.rationale || `${item.ticker} is under target; model using available cash before considering sales.`
    });
  }).filter((trade) => trade.amount >= 25);
}

function buildSellAndRebalanceTrades(tickerRows, cashPlan, taxableByTicker, mode) {
  const overweight = tickerRows
    .filter((row) => row.status === "overweight" && row.driftValue > 100)
    .sort((a, b) => b.driftValue - a.driftValue);
  const underweight = tickerRows
    .filter((row) => row.status === "underweight" && row.driftValue < -100)
    .sort((a, b) => a.driftValue - b.driftValue);
  const reduceTrades = [];

  for (const row of overweight) {
    const taxable = taxableByTicker.get(row.key);
    if (mode === "taxable-safe" && taxable?.value > 0) {
      reduceTrades.push(simulatorTrade({
        action: "Review taxable impact",
        direction: "hold",
        row,
        ticker: row.key,
        amount: 0,
        rationale: `${row.key} is overweight, but taxable caution mode avoids modeling a sale before tax review.`,
        taxable
      }));
      continue;
    }
    reduceTrades.push(simulatorTrade({
      action: row.isLeveraged ? "Review reduce leveraged exposure" : "Review reduce overweight",
      direction: "reduce",
      row,
      ticker: row.key,
      amount: Math.abs(row.driftValue),
      rationale: `${row.key} is above target by ${formatPct(Math.abs(row.driftWeight))}; model reducing toward target weight before deciding.`,
      taxable
    }));
  }

  const saleProceeds = reduceTrades.reduce((sum, trade) => sum + Math.abs(Math.min(0, trade.valueDelta)), 0);
  const availableForAdds = saleProceeds + (cashPlan.excessCash || 0);
  const totalNeed = underweight.reduce((sum, row) => sum + Math.abs(row.driftValue), 0);
  const addTrades = underweight.map((row) => {
    const amount = totalNeed ? Math.min(Math.abs(row.driftValue), availableForAdds * (Math.abs(row.driftValue) / totalNeed)) : 0;
    return simulatorTrade({
      action: "Review add underweight",
      direction: "add",
      row,
      ticker: row.key,
      amount,
      rationale: `${row.key} is below target by ${formatPct(Math.abs(row.driftWeight))}; model adding only after reviewing funding source.`
    });
  }).filter((trade) => trade.amount >= 25);

  return [...reduceTrades, ...addTrades].slice(0, 18);
}

function simulatorTrade({ action, direction, row = {}, ticker = "", amount = 0, rationale = "", taxable = null }) {
  const valueDelta = direction === "reduce" ? -Math.abs(amount) : direction === "add" ? Math.abs(amount) : 0;
  const taxableWarning = taxable?.value > 0 && direction === "reduce"
    ? `${ticker} has ${formatCurrency(taxable.value)} in taxable accounts (${taxable.accounts.join(", ")}); review tax impact before reducing.`
    : "";
  return {
    type: valueDelta === 0 ? "note" : "review-adjustment",
    action,
    direction,
    ticker,
    scope: row.scope || "ticker",
    key: row.key || ticker,
    amount: Math.round(Math.abs(amount) || 0),
    valueDelta: Math.round(valueDelta || 0),
    currentWeight: row.currentWeight || 0,
    targetWeight: row.targetWeight || 0,
    driftWeight: row.driftWeight || 0,
    driftValue: row.driftValue || 0,
    rationale,
    taxableWarning
  };
}

function taxableExposureByTicker(holdings = []) {
  const rows = new Map();
  for (const holding of holdings) {
    const ticker = normalizeKey("ticker", holding.ticker);
    if (!ticker || !isTaxableHolding(holding)) continue;
    const row = rows.get(ticker) || { ticker, value: 0, accounts: new Set() };
    row.value += Number(holding.marketValue) || 0;
    row.accounts.add(holding.account || "Taxable account");
    rows.set(ticker, row);
  }
  return new Map([...rows.entries()].map(([ticker, row]) => [ticker, {
    ticker,
    value: row.value,
    accounts: [...row.accounts].sort()
  }]));
}

function isTaxableHolding(holding = {}) {
  return /taxable|brokerage|individual|joint/i.test(`${holding.accountType || ""} ${holding.account || ""}`);
}

function classifySimulatedDrift(afterWeight, row = {}) {
  if (!row.targetWeight && !row.minWeight && !row.maxWeight) return "no target";
  if (row.maxWeight && afterWeight > row.maxWeight + 0.002) return "overweight";
  if (row.minWeight && afterWeight < row.minWeight - 0.002) return "underweight";
  if (!row.minWeight && afterWeight < row.targetWeight - 0.005) return "underweight";
  if (!row.maxWeight && afterWeight > row.targetWeight + 0.005) return "overweight";
  return "within range";
}

function normalizeRebalanceMode(mode = "new-contribution") {
  const value = String(mode || "new-contribution").trim().toLowerCase();
  if (["sell-and-rebalance", "full", "full-rebalance", "sell-rebalance"].includes(value)) return "sell-and-rebalance";
  if (["taxable-safe", "tax-aware", "taxable-caution"].includes(value)) return "taxable-safe";
  if (["retirement-only", "retirement", "hsa-only"].includes(value)) return "retirement-only";
  return "new-contribution";
}

function rowFromGroup(group, allocation, totalValue) {
  const currentWeight = totalValue ? group.marketValue / totalValue : 0;
  const targetValue = totalValue * allocation.targetWeight;
  const driftWeight = currentWeight - allocation.targetWeight;
  const driftValue = group.marketValue - targetValue;
  const status = classifyDrift(currentWeight, allocation);
  return {
    id: allocation.id,
    scope: allocation.scope,
    key: allocation.key,
    currentValue: group.marketValue,
    currentWeight,
    targetWeight: allocation.targetWeight,
    minWeight: allocation.minWeight,
    maxWeight: allocation.maxWeight,
    targetValue,
    driftWeight,
    driftValue,
    status,
    suggestedAction: actionForStatus(status),
    priority: allocation.priority,
    notes: allocation.notes,
    accounts: [...group.accounts].sort(),
    holdings: group.holdings.length,
    isLeveraged: group.holdings.some((holding) => isLeveragedHolding(holding)),
    maxEffectiveExposure: allocation.maxEffectiveExposure || 0
  };
}

function classifyDrift(currentWeight, allocation) {
  if (!allocation.targetWeight && !allocation.minWeight && !allocation.maxWeight) return "no target";
  if (allocation.maxWeight && currentWeight > allocation.maxWeight + 0.002) return "overweight";
  if (allocation.minWeight && currentWeight < allocation.minWeight - 0.002) return "underweight";
  if (!allocation.minWeight && currentWeight < allocation.targetWeight - 0.005) return "underweight";
  if (!allocation.maxWeight && currentWeight > allocation.targetWeight + 0.005) return "overweight";
  return "within range";
}

function actionForStatus(status) {
  if (status === "overweight") return "review trim";
  if (status === "underweight") return "review add";
  if (status === "no target") return "set target";
  return "hold";
}

function groupHoldingsByScope(holdings = []) {
  const groups = new Map();
  const scopes = ["ticker", "assetClass", "strategySleeve", "account"];
  for (const holding of holdings) {
    for (const scope of scopes) {
      const key = keyForHolding(holding, scope);
      if (!key) continue;
      const id = targetId(scope, key);
      const group = groups.get(id) || emptyGroup(scope, key);
      group.marketValue += Number(holding.marketValue) || 0;
      group.accounts.add(holding.account || "Unknown account");
      group.holdings.push(holding);
      groups.set(id, group);
    }
  }
  return groups;
}

function keyForHolding(holding, scope) {
  if (scope === "ticker") return normalizeKey(scope, holding.ticker);
  if (scope === "assetClass") return normalizeKey(scope, holding.assetClass || "Unknown");
  if (scope === "strategySleeve") return normalizeKey(scope, holding.strategySleeve || "Unassigned");
  if (scope === "account") return normalizeKey(scope, holding.account || "Unknown account");
  return "";
}

function emptyGroup(scope, key) {
  return {
    id: targetId(scope, key),
    scope,
    key,
    marketValue: 0,
    accounts: new Set(),
    holdings: []
  };
}

function inferCurrentTarget(holdings = []) {
  const targets = holdings.map((holding) => Number(holding.targetWeight) || 0).filter(Boolean);
  if (!targets.length) return 0;
  return targets.reduce((sum, value) => sum + value, 0);
}

function findCashTarget(targets) {
  return targets.find((target) => target.scope === "assetClass" && /^cash$/i.test(target.key)) ||
    targets.find((target) => target.scope === "strategySleeve" && /^cash$/i.test(target.key));
}

function aggregateByTicker(holdings = []) {
  const rows = new Map();
  for (const holding of holdings) {
    const ticker = normalizeKey("ticker", holding.ticker);
    if (!ticker) continue;
    const row = rows.get(ticker) || { ticker, marketValue: 0 };
    row.marketValue += Number(holding.marketValue) || 0;
    rows.set(ticker, row);
  }
  return [...rows.values()];
}

function isLeveragedHolding(holding = {}) {
  const ticker = normalizeKey("ticker", holding.ticker);
  return Boolean(holding.isLeveragedEtf) || isLeveragedEtfTicker(ticker, holding);
}

function isCashHolding(holding = {}) {
  return /cash|money market|core/i.test(`${holding.assetClass} ${holding.sector} ${holding.name} ${holding.ticker}`);
}

function totalMarketValue(holdings = []) {
  return holdings.reduce((sum, holding) => sum + (Number(holding.marketValue) || 0), 0);
}

function normalizeScope(scope) {
  const value = String(scope || "").trim();
  return TARGET_SCOPES.has(value) ? value : null;
}

function normalizeKey(scope, key) {
  const value = String(key || "").trim();
  if (!value) return "";
  return scope === "ticker" ? value.toUpperCase() : value.replace(/\s+/g, " ");
}

function normalizeWeight(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return number > 1 ? number / 100 : number;
}

function normalizePriority(value) {
  const normalized = String(value || "medium").toLowerCase();
  return ["low", "medium", "high"].includes(normalized) ? normalized : "medium";
}

function target(scope, key, targetWeight, minWeight, maxWeight, priority, notes, maxEffectiveExposure = 0) {
  return {
    id: targetId(scope, key),
    scope,
    key,
    targetWeight,
    minWeight,
    maxWeight,
    priority,
    notes,
    maxEffectiveExposure
  };
}

function compareTargets(a, b) {
  return scopeRank(a.scope) - scopeRank(b.scope) || a.key.localeCompare(b.key);
}

function scopeRank(scope) {
  return { ticker: 0, assetClass: 1, strategySleeve: 2, account: 3 }[scope] ?? 9;
}

function formatPct(value) {
  return `${((Number(value) || 0) * 100).toFixed(1)}%`;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
}
