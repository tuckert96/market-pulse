export function buildRebalancePlan(holdings = [], options = {}) {
  const totalValue = holdings.reduce((sum, holding) => sum + (Number(holding.marketValue) || 0), 0);
  const cashAvailable = Number(options.cashAvailable ?? holdings
    .filter((holding) => holding.assetClass === "Cash")
    .reduce((sum, holding) => sum + (Number(holding.marketValue) || 0), 0));
  const contributionAmount = Number(options.contributionAmount ?? Math.min(cashAvailable, totalValue * 0.03));
  const mode = options.mode || "new-contribution";
  const rows = holdings
    .filter((holding) => holding.ticker && holding.assetClass !== "Cash")
    .map((holding) => allocationRow(holding, totalValue))
    .sort((a, b) => Math.abs(b.driftValue) - Math.abs(a.driftValue));

  return {
    totalValue,
    mode,
    cashAvailable,
    contributionAmount,
    rows,
    suggestions: suggestTrades(rows, {
      mode,
      contributionAmount,
      totalValue,
      avoidTaxableSales: mode === "taxable-safe",
      retirementOnly: mode === "retirement-only"
    })
  };
}

export function allocationRow(holding, totalValue) {
  const currentWeight = totalValue ? holding.marketValue / totalValue : 0;
  const targetWeight = Number(holding.targetWeight) || 0;
  const targetValue = targetWeight * totalValue;
  const driftValue = holding.marketValue - targetValue;

  return {
    ticker: holding.ticker,
    name: holding.name,
    account: holding.account,
    accountType: holding.accountType,
    strategySleeve: holding.strategySleeve,
    assetClass: holding.assetClass,
    riskLevel: holding.riskLevel,
    currentValue: holding.marketValue,
    currentWeight,
    targetWeight,
    targetValue,
    driftValue,
    driftWeight: currentWeight - targetWeight,
    price: holding.price,
    isLeveragedEtf: holding.isLeveragedEtf,
    taxable: holding.accountType === "Taxable"
  };
}

export function suggestTrades(rows, options = {}) {
  const underweight = rows.filter((row) => row.driftValue < -100).sort((a, b) => a.driftValue - b.driftValue);
  const overweight = rows.filter((row) => row.driftValue > 100).sort((a, b) => b.driftValue - a.driftValue);
  const suggestions = [];

  if (options.mode === "new-contribution") {
    let remaining = options.contributionAmount || 0;
    const totalNeed = underweight.reduce((sum, row) => sum + Math.abs(row.driftValue), 0);
    underweight.forEach((row) => {
      if (remaining <= 0 || totalNeed <= 0) return;
      const amount = Math.min(Math.abs(row.driftValue), remaining * (Math.abs(row.driftValue) / totalNeed));
      if (amount >= 25) suggestions.push(trade("Buy with new contribution", row, amount));
    });
    return suggestions;
  }

  overweight.forEach((row) => {
    if (options.avoidTaxableSales && row.taxable) {
      suggestions.push(note("Hold / avoid taxable sale", row, "Overweight, but taxable-safe mode avoids unnecessary realized gains."));
      return;
    }
    if (options.retirementOnly && row.accountType !== "Retirement" && row.accountType !== "HSA") return;
    if (row.isLeveragedEtf && Math.abs(row.driftWeight) > 0.01) {
      suggestions.push(trade("Trim leveraged ETF", row, Math.min(row.driftValue, row.currentValue * 0.25)));
    } else if (row.driftValue > 250) {
      suggestions.push(trade("Trim overweight", row, row.driftValue));
    }
  });

  underweight.forEach((row) => {
    if (options.retirementOnly && row.accountType !== "Retirement" && row.accountType !== "HSA") return;
    if (Math.abs(row.driftValue) > 250) suggestions.push(trade("Add underweight", row, Math.abs(row.driftValue)));
  });

  return suggestions.slice(0, 16);
}

export function summarizeSleeves(holdings = []) {
  const totalValue = holdings.reduce((sum, holding) => sum + (Number(holding.marketValue) || 0), 0);
  const sleeves = new Map();
  holdings.forEach((holding) => {
    const key = holding.strategySleeve || "Unassigned";
    const current = sleeves.get(key) || {
      name: key,
      value: 0,
      costBasis: 0,
      dailyChange: 0,
      targetWeight: 0,
      riskScore: 0,
      holdings: 0
    };
    current.value += holding.marketValue || 0;
    current.costBasis += holding.costBasis || 0;
    current.dailyChange += holding.dailyChange || 0;
    current.targetWeight += holding.targetWeight || 0;
    current.riskScore += holding.riskScore || 0;
    current.holdings += 1;
    sleeves.set(key, current);
  });

  return Array.from(sleeves.values())
    .map((sleeve) => ({
      ...sleeve,
      weight: totalValue ? sleeve.value / totalValue : 0,
      drift: totalValue ? sleeve.value / totalValue - sleeve.targetWeight : 0,
      returnPercent: sleeve.costBasis ? (sleeve.value - sleeve.costBasis) / sleeve.costBasis : 0,
      averageRisk: sleeve.holdings ? Math.round(sleeve.riskScore / sleeve.holdings) : 0
    }))
    .sort((a, b) => b.value - a.value);
}

function trade(action, row, amount) {
  return {
    type: "trade",
    action,
    ticker: row.ticker,
    account: row.account,
    amount: Math.round(amount),
    estimatedShares: row.price ? Number((amount / row.price).toFixed(2)) : null,
    rationale: `${row.ticker} is ${row.driftValue > 0 ? "overweight" : "underweight"} by ${formatCurrency(Math.abs(row.driftValue))}.`
  };
}

function note(action, row, rationale) {
  return {
    type: "note",
    action,
    ticker: row.ticker,
    account: row.account,
    amount: 0,
    estimatedShares: null,
    rationale
  };
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value) || 0);
}
