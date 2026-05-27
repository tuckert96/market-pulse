import { decimalPercent, normalizeHoldings, numericFromGrade } from "./portfolioSchema.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const RISK_STATUS_THRESHOLDS = Object.freeze({
  position: { elevated: 0.08, high: 0.12, extreme: 0.2 },
  sector: { elevated: 0.22, high: 0.35, extreme: 0.5 },
  account: { elevated: 0.35, high: 0.5, extreme: 0.7 },
  theme: { elevated: 0.18, high: 0.32, extreme: 0.48 },
  leveragedDirect: { elevated: 0.04, high: 0.1, extreme: 0.16 },
  leveragedNotional: { elevated: 0.12, high: 0.28, extreme: 0.45 },
  cash: { elevated: 0.25, high: 0.5, extreme: 0.7 },
  individualStock: { elevated: 0.35, high: 0.55, extreme: 0.75 },
  etf: { elevated: 0.55, high: 0.75, extreme: 0.9 }
});

export function analyzePortfolio(rawHoldings = [], options = {}) {
  const holdings = normalizeHoldings(rawHoldings);
  const totalValue = sum(holdings, "marketValue");
  const enriched = holdings.map((holding) => enrichHolding(holding, totalValue));
  const overview = buildOverview(enriched, totalValue);
  const breakdowns = buildBreakdowns(enriched, totalValue);
  const risk = buildRiskAnalytics(enriched, totalValue, breakdowns);
  const alerts = [
    ...buildAttentionAlerts(enriched, totalValue, breakdowns, options),
    ...(options.marketAlerts || [])
  ].sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || b.score - a.score);
  const dataQuality = buildDataQuality(enriched);

  return {
    holdings: enriched,
    overview,
    breakdowns,
    risk,
    alerts,
    dataQuality
  };
}

export function enrichHolding(holding, totalValue = 0) {
  const weight = totalValue > 0 ? holding.marketValue / totalValue : 0;
  const targetWeight = decimalPercent(holding.targetWeight);
  const drift = weight - targetWeight;
  const gainLoss = holding.costBasis > 0 ? holding.marketValue - holding.costBasis : 0;
  const gainLossPercent = holding.costBasis > 0 ? gainLoss / holding.costBasis : 0;
  const ratingRisk = ratingRiskScore(holding);
  const concentrationRisk = Math.min(100, weight * 420);
  const leverageRisk = holding.isLeveragedEtf ? Math.min(100, weight * holding.leveragedMultiple * 350) : 0;
  const volatilityRisk = Math.min(100, (holding.beta || 1) * 22);
  const riskScore = Math.round(Math.min(100, ratingRisk * 0.25 + concentrationRisk * 0.3 + leverageRisk * 0.25 + volatilityRisk * 0.2));

  return {
    ...holding,
    portfolioWeight: weight,
    targetWeight,
    drift,
    driftValue: drift * totalValue,
    unrealizedGain: holding.unrealizedGain || gainLoss,
    unrealizedGainPercent: holding.unrealizedGainPercent || gainLossPercent,
    riskScore,
    ratingRisk
  };
}

export function buildAttentionAlerts(holdings, totalValue, breakdowns, options = {}) {
  const alerts = [];
  const thresholds = {
    maxPositionWeight: options.maxPositionWeight ?? 0.12,
    minActionDrift: options.minActionDrift ?? 0.015,
    maxLeveragedWeight: options.maxLeveragedWeight ?? 0.14,
    maxSectorWeight: options.maxSectorWeight ?? 0.32,
    largeMovePercent: options.largeMovePercent ?? 0.05,
    staleHours: options.staleHours ?? 24
  };

  holdings.forEach((holding) => {
    const label = holding.ticker || holding.name;
    if (!options.skipPortfolioThresholdAlerts && holding.targetWeight && holding.drift > thresholds.minActionDrift) {
      alerts.push(alert("overweight", "high", `${label} is above target`, `${formatPct(holding.portfolioWeight)} current vs ${formatPct(holding.targetWeight)} target.`, holding));
    }
    if (!options.skipPortfolioThresholdAlerts && holding.targetWeight && holding.drift < -thresholds.minActionDrift) {
      alerts.push(alert("underweight", "medium", `${label} is below target`, `${formatPct(holding.portfolioWeight)} current vs ${formatPct(holding.targetWeight)} target.`, holding));
    }
    if (!options.skipPortfolioThresholdAlerts && holding.isLeveragedEtf && holding.portfolioWeight > 0.04) {
      alerts.push(alert("leverage", "high", `${label} adds leveraged exposure`, `Notional exposure is about ${formatCurrency(holding.marketValue * holding.leveragedMultiple)}.`, holding));
    }
    if (!options.skipPortfolioThresholdAlerts && !holding.isLeveragedEtf && holding.assetClass === "Equity" && holding.portfolioWeight > thresholds.maxPositionWeight) {
      alerts.push(alert("single-stock", "high", `${label} is a large single-stock position`, `${formatPct(holding.portfolioWeight)} of portfolio.`, holding));
    }
    if (holding.portfolioWeight > 0.04 && Number(holding.quant || 0) > 0 && Number(holding.quant) < 3) {
      alerts.push(alert("weak-rating", "high", `${label} has weak Quant support`, `Quant rating is ${holding.quant}.`, holding));
    }
    if (holding.revisionsGrade && numericFromGrade(holding.revisionsGrade) <= 3) {
      alerts.push(alert("revisions", "medium", `${label} has weak EPS revisions`, `EPS revisions grade is ${holding.revisionsGrade}.`, holding));
    }
    if (holding.forwardPe >= 60 || numericFromGrade(holding.valuationGrade) <= 2.5) {
      alerts.push(alert("valuation", "medium", `${label} has valuation risk`, `Valuation grade ${holding.valuationGrade || "n/a"} and forward P/E ${holding.forwardPe || "n/a"}.`, holding));
    }
    const days = daysUntil(holding.nextEarnings);
    if (days !== null && days >= 0 && days <= 14) {
      alerts.push(alert("earnings", "medium", `${label} reports earnings soon`, `${days} day${days === 1 ? "" : "s"} until the next listed earnings date.`, holding));
    }
    if (Math.abs(holding.dailyChangePercent || 0) >= thresholds.largeMovePercent) {
      alerts.push(alert("large-move", "medium", `${label} moved sharply today`, `${formatPct(holding.dailyChangePercent)} one-day move.`, holding));
    }
    if (isStale(holding.sourceAsOf, thresholds.staleHours)) {
      alerts.push(alert("stale-data", "medium", `${label} data may be stale`, `Source date is ${holding.sourceAsOf || "missing"}.`, holding));
    }
    if (!holding.costBasis && holding.assetClass !== "Cash") {
      alerts.push(alert("missing-cost", "low", `${label} is missing cost basis`, "Gain/loss and tax-aware decisions may be incomplete.", holding));
    }
    if (!holding.quant && holding.assetClass === "Equity") {
      alerts.push(alert("missing-rating", "low", `${label} is missing rating data`, "Import Seeking Alpha export data for a better signal.", holding));
    }
    if (!holding.thesis || holding.thesisStatus === "Missing thesis" || holding.thesisStatus === "Needs thesis") {
      alerts.push(alert("thesis", "medium", `${label} needs a thesis`, "Add why Tucker owns it, downside risk, and invalidation criteria.", holding));
    }
  });

  if (!options.skipPortfolioThresholdAlerts) {
    breakdowns.sector.forEach((sector) => {
      if (sector.weight > thresholds.maxSectorWeight) {
        alerts.push(alert("sector-concentration", "high", `${sector.name} concentration is high`, `${formatPct(sector.weight)} of the portfolio.`, { ticker: sector.name }));
      }
    });

    const leveragedWeight = sum(holdings.filter((holding) => holding.isLeveragedEtf), "marketValue") / totalValue;
    if (leveragedWeight > thresholds.maxLeveragedWeight) {
      alerts.push(alert("leveraged-total", "high", "Leveraged ETF exposure is above limit", `${formatPct(leveragedWeight)} actual weight before notional leverage.`, { ticker: "LEVERAGE" }));
    }
  }

  return alerts.sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || b.score - a.score).slice(0, 24);
}

function buildOverview(holdings, totalValue) {
  const totalCostBasis = sum(holdings, "costBasis");
  const unrealizedGain = sum(holdings, "unrealizedGain");
  const dailyChange = sum(holdings, "dailyChange");
  const cash = sum(holdings.filter((holding) => holding.assetClass === "Cash"), "marketValue");
  const leveraged = holdings.filter((holding) => holding.isLeveragedEtf);
  const singleStocks = holdings.filter((holding) => holding.assetClass === "Equity");
  const semiAi = holdings.filter((holding) => holding.isSemiconductor || holding.isAiTheme);
  const megaCapTech = holdings.filter((holding) => holding.isMegaCapTech || holding.sector === "Mega-cap tech");

  return {
    totalValue,
    dailyChange,
    dailyChangePercent: totalValue ? dailyChange / totalValue : 0,
    totalCostBasis,
    unrealizedGain,
    unrealizedGainPercent: totalCostBasis ? unrealizedGain / totalCostBasis : 0,
    cashBalance: cash,
    leveragedEtfExposure: sum(leveraged, "marketValue"),
    leveragedNotionalExposure: leveraged.reduce((total, holding) => total + holding.marketValue * Math.abs(holding.leveragedMultiple), 0),
    singleStockExposure: sum(singleStocks, "marketValue"),
    semiconductorAiExposure: sum(semiAi, "marketValue"),
    megaCapTechExposure: sum(megaCapTech, "marketValue")
  };
}

function buildBreakdowns(holdings, totalValue) {
  return {
    account: groupBreakdown(holdings, "account", totalValue),
    assetClass: groupBreakdown(holdings, "assetClass", totalValue),
    sector: groupBreakdown(holdings, "sector", totalValue),
    sleeve: groupBreakdown(holdings, "strategySleeve", totalValue),
    riskLevel: groupBreakdown(holdings, "riskLevel", totalValue)
  };
}

function buildRiskAnalytics(holdings, totalValue, breakdowns) {
  const sorted = [...holdings].sort((a, b) => b.marketValue - a.marketValue);
  const concentrationHoldings = sorted.filter((holding) => !isCashLikeHolding(holding));
  const top5Weight = totalValue ? sum(concentrationHoldings.slice(0, 5), "marketValue") / totalValue : 0;
  const top10Weight = totalValue ? sum(concentrationHoldings.slice(0, 10), "marketValue") / totalValue : 0;
  const topSectorWeight = (breakdowns.sector || []).find((row) => row.name !== "Cash")?.weight || 0;
  const concentrationScore = Math.round(Math.min(100, top5Weight * 60 + top10Weight * 25 + topSectorWeight * 45));
  const betaEstimate = totalValue
    ? holdings.reduce((total, holding) => total + (holding.beta || 1) * holding.marketValue, 0) / totalValue
    : 0;
  const overlap = {
    qqqVgtNvdaStack: sum(holdings.filter((holding) => ["QQQ", "VGT", "NVDA", "TQQQ"].includes(holding.ticker)), "marketValue"),
    semiconductorStack: sum(holdings.filter((holding) => holding.isSemiconductor), "marketValue"),
    leveragedStack: sum(holdings.filter((holding) => holding.isLeveragedEtf), "marketValue")
  };

  return {
    concentrationScore,
    top5Weight,
    top10Weight,
    betaEstimate,
    topHoldings: concentrationHoldings.slice(0, 10),
    topHoldingsIncludingCash: sorted.slice(0, 10),
    riskContributors: [...holdings].sort((a, b) => b.riskScore * b.marketValue - a.riskScore * a.marketValue).slice(0, 10),
    decisionDashboard: buildDecisionRiskDashboard(holdings, totalValue, breakdowns),
    overlap,
    stressTests: buildStressTests(holdings),
    liquidityFlags: holdings.filter((holding) => holding.riskLevel === "Very high" || holding.assetClass === "Speculative")
  };
}

export function buildDecisionRiskDashboard(holdings = [], totalValue = 0, breakdowns = {}) {
  const normalizedTotal = Number(totalValue) || sum(holdings, "marketValue") || 0;
  const stockRows = holdings.filter((holding) => holding.assetClass === "Equity");
  const etfRows = holdings.filter((holding) => holding.assetClass === "ETF");
  const cashRows = holdings.filter((holding) => holding.assetClass === "Cash");
  const leveragedRows = holdings.filter((holding) => holding.isLeveragedEtf);
  const leveragedDirectValue = sum(leveragedRows, "marketValue");
  const leveragedNotionalValue = leveragedRows.reduce((total, holding) => total + holding.marketValue * Math.abs(Number(holding.leveragedMultiple) || 1), 0);
  const cashValue = sum(cashRows, "marketValue");
  const stockValue = sum(stockRows, "marketValue");
  const etfValue = sum(etfRows, "marketValue");
  const themeRows = buildThemeExposureRows(holdings, normalizedTotal);
  const correlationRisk = buildCorrelationRisk(holdings, themeRows, normalizedTotal);

  return {
    topPositionWeights: [...holdings]
      .filter((holding) => !isCashLikeHolding(holding))
      .sort((a, b) => b.marketValue - a.marketValue)
      .slice(0, 10)
      .map((holding) => riskRow({
        id: `position:${holding.ticker}`,
        name: holding.ticker,
        label: holding.name,
        value: holding.marketValue,
        weight: normalizedTotal ? holding.marketValue / normalizedTotal : 0,
        statusType: "position",
        explanation: `${holding.ticker} is ${formatPct(normalizedTotal ? holding.marketValue / normalizedTotal : 0)} of portfolio value. Large single positions can dominate outcome variance.`,
        tickers: [holding.ticker],
        href: holding.ticker ? `#/ticker/${holding.ticker}` : "#holdings"
      })),
    sectorConcentration: (breakdowns.sector || groupBreakdown(holdings, "sector", normalizedTotal))
      .filter((row) => row.name !== "Cash")
      .slice(0, 10)
      .map((row) => riskRow({
        id: `sector:${slug(row.name)}`,
        name: row.name,
        value: row.value,
        weight: row.weight,
        statusType: "sector",
        explanation: `${row.name} exposure is ${formatPct(row.weight)} of the portfolio across ${row.count} holding${row.count === 1 ? "" : "s"}.`,
        href: "#holdings"
      })),
    accountConcentration: (breakdowns.account || groupBreakdown(holdings, "account", normalizedTotal))
      .slice(0, 10)
      .map((row) => riskRow({
        id: `account:${slug(row.name)}`,
        name: row.name,
        value: row.value,
        weight: row.weight,
        statusType: "account",
        explanation: `${row.name} holds ${formatPct(row.weight)} of current portfolio value. Account concentration matters for liquidity, tax treatment, and rebalancing flexibility.`,
        href: "#holdings"
      })),
    themeExposure: themeRows,
    leveragedEtfExposure: {
      directValue: leveragedDirectValue,
      directWeight: divide(leveragedDirectValue, normalizedTotal),
      notionalValue: leveragedNotionalValue,
      notionalWeight: divide(leveragedNotionalValue, normalizedTotal),
      status: worseStatus(
        riskStatusForWeight(divide(leveragedDirectValue, normalizedTotal), RISK_STATUS_THRESHOLDS.leveragedDirect),
        riskStatusForWeight(divide(leveragedNotionalValue, normalizedTotal), RISK_STATUS_THRESHOLDS.leveragedNotional)
      ),
      explanation: leveragedRows.length
        ? `Leveraged ETFs are ${formatPct(divide(leveragedDirectValue, normalizedTotal))} direct weight and about ${formatPct(divide(leveragedNotionalValue, normalizedTotal))} estimated notional exposure.`
        : "No UPRO, SOXL, TQQQ-style leveraged ETFs are detected in current holdings.",
      rows: leveragedRows
        .sort((a, b) => b.marketValue * Math.abs(b.leveragedMultiple || 1) - a.marketValue * Math.abs(a.leveragedMultiple || 1))
        .map((holding) => riskRow({
          id: `leveraged:${holding.ticker}`,
          name: holding.ticker,
          label: `${holding.leveragedMultiple || 1}x ${holding.name}`,
          value: holding.marketValue * Math.abs(holding.leveragedMultiple || 1),
          weight: divide(holding.marketValue * Math.abs(holding.leveragedMultiple || 1), normalizedTotal),
          statusType: "leveragedNotional",
          explanation: `${holding.ticker} is ${formatPct(divide(holding.marketValue, normalizedTotal))} direct weight and ${formatPct(divide(holding.marketValue * Math.abs(holding.leveragedMultiple || 1), normalizedTotal))} estimated notional exposure.`,
          tickers: [holding.ticker],
          href: `#/ticker/${holding.ticker}`
        }))
    },
    assetMix: {
      individualStock: riskRow({
        id: "asset-mix:individual-stock",
        name: "Individual stocks",
        value: stockValue,
        weight: divide(stockValue, normalizedTotal),
        statusType: "individualStock",
        explanation: `Individual stocks are ${formatPct(divide(stockValue, normalizedTotal))} of portfolio value. This measures single-company exposure before ETF overlap.`,
        href: "#holdings"
      }),
      etf: riskRow({
        id: "asset-mix:etf",
        name: "ETFs and funds",
        value: etfValue,
        weight: divide(etfValue, normalizedTotal),
        statusType: "etf",
        explanation: `ETFs and funds are ${formatPct(divide(etfValue, normalizedTotal))} of portfolio value. ETF concentration can still hide overlap inside themes.`,
        href: "#holdings"
      })
    },
    cashExposure: riskRow({
      id: "cash",
      name: "Cash and money market",
      value: cashValue,
      weight: divide(cashValue, normalizedTotal),
      statusType: "cash",
      explanation: `Cash is ${formatPct(divide(cashValue, normalizedTotal))} of the portfolio. This is not downside risk, but high cash can create deployment and opportunity-cost decisions.`,
      href: "#targets"
    }),
    correlationRisk,
    correlationPlaceholder: correlationRisk
  };
}

export function riskStatusForWeight(weight = 0, thresholds = RISK_STATUS_THRESHOLDS.position) {
  const numeric = Number(weight) || 0;
  if (numeric >= thresholds.extreme) return "extreme";
  if (numeric >= thresholds.high) return "high";
  if (numeric >= thresholds.elevated) return "elevated";
  return "normal";
}

function buildThemeExposureRows(holdings = [], totalValue = 0) {
  const themes = [
    {
      id: "theme:ai-semis",
      name: "AI / semiconductor",
      matcher: (holding) => holding.isSemiconductor || holding.isAiTheme || /semiconductor|ai|artificial intelligence/i.test(`${holding.sector} ${holding.strategySleeve} ${holding.name}`)
    },
    {
      id: "theme:memory",
      name: "Memory cycle",
      matcher: (holding) => /^(MU)$/i.test(holding.ticker) || /micron|memory|dram|nand|hbm/i.test(`${holding.name} ${holding.thesis || ""}`)
    },
    {
      id: "theme:mega-cap-tech",
      name: "Mega-cap tech",
      matcher: (holding) => holding.isMegaCapTech || /mega-cap tech/i.test(`${holding.sector} ${holding.strategySleeve}`)
    },
    {
      id: "theme:leveraged-growth",
      name: "Leveraged growth",
      matcher: (holding) => holding.isLeveragedEtf || /leveraged growth/i.test(holding.strategySleeve || "")
    }
  ];

  return themes.map((theme) => {
    const rows = holdings.filter(theme.matcher);
    const value = sum(rows, "marketValue");
    const tickers = unique(rows.map((holding) => holding.ticker));
    return riskRow({
      id: theme.id,
      name: theme.name,
      value,
      weight: divide(value, totalValue),
      statusType: "theme",
      explanation: `${theme.name} is ${formatPct(divide(value, totalValue))} of the portfolio through ${tickers.length ? tickers.join(", ") : "no current holdings"}.`,
      tickers,
      href: "#holdings"
    });
  }).filter((row) => row.value > 0);
}

function isCashLikeHolding(holding = {}) {
  return holding.assetClass === "Cash" ||
    holding.sector === "Cash" ||
    holding.strategySleeve === "Cash" ||
    holding.cash === true ||
    /cash|money market|sweep|held in money market/i.test(`${holding.ticker || ""} ${holding.name || ""}`);
}

function riskRow({ id, name, label = "", value = 0, weight = 0, statusType = "position", explanation = "", tickers = [], href = "#holdings" }) {
  const status = riskStatusForWeight(weight, RISK_STATUS_THRESHOLDS[statusType] || RISK_STATUS_THRESHOLDS.position);
  return {
    id,
    name,
    label,
    value: Number(value) || 0,
    weight: Number(weight) || 0,
    status,
    statusLabel: titleCase(status),
    explanation,
    tickers: unique(tickers),
    href
  };
}

function buildCorrelationRisk(holdings = [], themeRows = [], totalValue = 0) {
  const groups = buildThemeOverlapGroups(themeRows);
  const measuredPairs = buildMeasuredCorrelationPairs(holdings, totalValue);
  const strongestPair = measuredPairs[0];
  const overlapStatus = groups.some((group) => group.weight >= RISK_STATUS_THRESHOLDS.theme.high) ? "high" : groups.length ? "elevated" : "normal";
  const pairStatus = strongestPair?.status || "normal";
  const tickersWithHistory = holdings
    .filter((holding) => normalizeHistoricalSeries(holding).length >= 5)
    .map((holding) => holding.ticker);
  const status = worseStatus(pairStatus, overlapStatus);

  return {
    status,
    label: "Correlation and overlap",
    explanation: measuredPairs.length
      ? `${measuredPairs.length} measured pair${measuredPairs.length === 1 ? "" : "s"} found from available historical prices. Theme overlap is shown underneath when tickers share the same exposure bucket.`
      : groups.length
      ? "Historical price data is not deep enough for measured correlations yet, so this highlights overlapping themes that may move together."
      : "No obvious multi-holding overlap detected. Refresh market data history to calculate measured correlations.",
    measuredPairs,
    groups,
    dataQuality: {
      tickersWithHistory: unique(tickersWithHistory),
      measuredPairCount: measuredPairs.length
    }
  };
}

function buildThemeOverlapGroups(themeRows = []) {
  return themeRows
    .filter((row) => row.tickers.length >= 2)
    .map((row) => ({
      name: row.name,
      tickers: row.tickers,
      weight: row.weight,
      explanation: `${row.tickers.join(", ")} share the ${row.name} theme. This is overlap, not a measured correlation coefficient.`
    }));
}

function buildMeasuredCorrelationPairs(holdings = [], totalValue = 0) {
  const seriesRows = holdings
    .filter((holding) => !isCashLikeHolding(holding))
    .map((holding) => ({
      ticker: holding.ticker,
      name: holding.name || holding.ticker,
      value: Number(holding.marketValue) || 0,
      returns: historicalReturnsByDate(normalizeHistoricalSeries(holding))
    }))
    .filter((row) => row.ticker && row.returns.size >= 4);

  const pairs = [];
  for (let i = 0; i < seriesRows.length; i += 1) {
    for (let j = i + 1; j < seriesRows.length; j += 1) {
      const left = seriesRows[i];
      const right = seriesRows[j];
      const aligned = alignReturnSeries(left.returns, right.returns);
      if (aligned.left.length < 4) continue;
      const coefficient = pearsonCorrelation(aligned.left, aligned.right);
      if (!Number.isFinite(coefficient)) continue;
      const absolute = Math.abs(coefficient);
      if (absolute < 0.45) continue;
      const sharedValue = left.value + right.value;
      const sharedWeight = divide(sharedValue, totalValue);
      const status = correlationStatus(absolute, sharedWeight);
      pairs.push({
        tickers: [left.ticker, right.ticker],
        names: [left.name, right.name],
        correlation: coefficient,
        correlationLabel: `${coefficient >= 0 ? "+" : ""}${coefficient.toFixed(2)}`,
        value: sharedValue,
        weight: sharedWeight,
        status,
        observations: aligned.left.length,
        explanation: `${left.ticker} and ${right.ticker} have ${coefficient >= 0 ? "positive" : "negative"} measured price-return correlation (${coefficient >= 0 ? "+" : ""}${coefficient.toFixed(2)}) across ${aligned.left.length} aligned historical return points.`
      });
    }
  }

  return pairs
    .sort((a, b) => Math.abs(b.correlation) * b.weight - Math.abs(a.correlation) * a.weight)
    .slice(0, 8);
}

function normalizeHistoricalSeries(holding = {}) {
  const values = holding.marketDataHistoricalPrices || holding.historicalPrices || holding.history || holding.prices || [];
  if (!Array.isArray(values)) return [];
  return values
    .map((item, index) => {
      if (typeof item === "number") return { date: `point-${index}`, close: Number(item) };
      const close = Number(item?.close ?? item?.price ?? item?.adjustedClose ?? item?.adjClose ?? item?.value);
      if (!Number.isFinite(close) || close <= 0) return null;
      return {
        date: String(item?.date || item?.timestamp || item?.time || `point-${index}`),
        close
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function historicalReturnsByDate(series = []) {
  const returns = new Map();
  for (let index = 1; index < series.length; index += 1) {
    const previous = Number(series[index - 1].close);
    const current = Number(series[index].close);
    if (!previous || !Number.isFinite(previous) || !Number.isFinite(current)) continue;
    returns.set(series[index].date, current / previous - 1);
  }
  return returns;
}

function alignReturnSeries(left = new Map(), right = new Map()) {
  const leftValues = [];
  const rightValues = [];
  left.forEach((leftReturn, date) => {
    if (!right.has(date)) return;
    leftValues.push(leftReturn);
    rightValues.push(right.get(date));
  });
  return { left: leftValues, right: rightValues };
}

function pearsonCorrelation(left = [], right = []) {
  if (left.length !== right.length || left.length < 2) return 0;
  const leftMean = left.reduce((total, value) => total + value, 0) / left.length;
  const rightMean = right.reduce((total, value) => total + value, 0) / right.length;
  let numerator = 0;
  let leftVariance = 0;
  let rightVariance = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index] - leftMean;
    const rightDelta = right[index] - rightMean;
    numerator += leftDelta * rightDelta;
    leftVariance += leftDelta ** 2;
    rightVariance += rightDelta ** 2;
  }
  const denominator = Math.sqrt(leftVariance * rightVariance);
  return denominator ? numerator / denominator : 0;
}

function correlationStatus(correlationMagnitude = 0, sharedWeight = 0) {
  if (correlationMagnitude >= 0.85 && sharedWeight >= 0.18) return "extreme";
  if (correlationMagnitude >= 0.75 && sharedWeight >= 0.12) return "high";
  if (correlationMagnitude >= 0.6 && sharedWeight >= 0.06) return "elevated";
  return "normal";
}

function buildDataQuality(holdings) {
  const issues = [];
  const keys = new Set();
  holdings.forEach((holding) => {
    const key = `${holding.account}:${holding.ticker || holding.name}`;
    if (keys.has(key)) issues.push(issue("duplicate", `${key} appears more than once.`));
    keys.add(key);
    if (!holding.ticker) issues.push(issue("missing-ticker", `${holding.name} is missing ticker.`));
    if (!holding.marketValue) issues.push(issue("missing-market-value", `${holding.ticker} is missing market value.`));
    if (!holding.costBasis && holding.assetClass !== "Cash") issues.push(issue("missing-cost-basis", `${holding.ticker} is missing cost basis.`));
    if (!holding.assetClass || holding.assetClass === "Unknown") issues.push(issue("unknown-asset-class", `${holding.ticker} has unknown asset class.`));
    if (!holding.sector || holding.sector === "Unknown") issues.push(issue("unknown-sector", `${holding.ticker} has unknown sector.`));
    if (holding.shares < 0 || holding.price < 0 || holding.marketValue < 0) issues.push(issue("impossible-value", `${holding.ticker} has an impossible negative value.`));
    if (isStale(holding.sourceAsOf, 24)) issues.push(issue("stale-data", `${holding.ticker} imported data is older than 24 hours.`));
  });
  return {
    issueCount: issues.length,
    issues
  };
}

function buildStressTests(holdings) {
  const scenarios = [
    { name: "S&P 500 -20%", broad: -0.2, mega: -0.25, semi: -0.3, leveraged: -0.55, treasury: 0.02, cash: 0 },
    { name: "Nasdaq -30%", broad: -0.22, mega: -0.3, semi: -0.38, leveraged: -0.65, treasury: 0.01, cash: 0 },
    { name: "Semiconductors -40%", broad: -0.14, mega: -0.24, semi: -0.4, leveraged: -0.68, treasury: 0.01, cash: 0 },
    { name: "Leveraged ETFs -60%", broad: -0.12, mega: -0.18, semi: -0.28, leveraged: -0.6, treasury: 0.01, cash: 0 },
    { name: "Rates up shock", broad: -0.08, mega: -0.12, semi: -0.16, leveraged: -0.32, treasury: -0.03, cash: 0.01 },
    { name: "AI bubble correction", broad: -0.16, mega: -0.28, semi: -0.42, leveraged: -0.7, treasury: 0.02, cash: 0 }
  ];

  return scenarios.map((scenario) => ({
    name: scenario.name,
    impact: holdings.reduce((total, holding) => total + holding.marketValue * scenarioReturn(holding, scenario), 0)
  }));
}

function scenarioReturn(holding, scenario) {
  if (holding.assetClass === "Cash") return scenario.cash;
  if (holding.assetClass === "Treasuries") return scenario.treasury;
  if (holding.isLeveragedEtf) return scenario.leveraged;
  if (holding.isSemiconductor || holding.isAiTheme) return scenario.semi;
  if (holding.isMegaCapTech || holding.sector === "Mega-cap tech") return scenario.mega;
  return scenario.broad;
}

function groupBreakdown(holdings, field, totalValue) {
  const map = new Map();
  holdings.forEach((holding) => {
    const key = holding[field] || "Unknown";
    const current = map.get(key) || { name: key, value: 0, dailyChange: 0, costBasis: 0, count: 0 };
    current.value += holding.marketValue;
    current.dailyChange += holding.dailyChange || 0;
    current.costBasis += holding.costBasis || 0;
    current.count += 1;
    map.set(key, current);
  });
  return Array.from(map.values())
    .map((item) => ({
      ...item,
      weight: totalValue ? item.value / totalValue : 0,
      gainLoss: item.value - item.costBasis,
      gainLossPercent: item.costBasis ? (item.value - item.costBasis) / item.costBasis : 0
    }))
    .sort((a, b) => b.value - a.value);
}

function alert(type, severity, title, detail, holding) {
  return {
    id: `${type}:${holding.ticker || title}`,
    type,
    severity,
    title,
    detail,
    ticker: holding.ticker,
    score: severityRank(severity) * 20 + Math.round((holding.portfolioWeight || 0) * 100)
  };
}

function issue(type, message) {
  return { type, message };
}

function ratingRiskScore(holding) {
  let risk = 0;
  if (holding.quant && holding.quant < 3) risk += 30;
  if (numericFromGrade(holding.valuationGrade) && numericFromGrade(holding.valuationGrade) <= 2.5) risk += 25;
  if (numericFromGrade(holding.revisionsGrade) && numericFromGrade(holding.revisionsGrade) <= 3) risk += 20;
  if (!holding.quant && holding.assetClass === "Equity") risk += 12;
  return Math.min(100, risk);
}

function daysUntil(dateText) {
  if (!dateText) return null;
  const date = new Date(`${dateText}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - Date.now()) / ONE_DAY_MS);
}

function isStale(dateText, hours) {
  if (!dateText) return true;
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return true;
  return Date.now() - date.getTime() > hours * 60 * 60 * 1000;
}

function severityRank(severity) {
  return { low: 1, medium: 2, high: 3, critical: 4 }[severity] || 1;
}

function sum(rows, field) {
  return rows.reduce((total, row) => total + (Number(row[field]) || 0), 0);
}

function divide(a, b) {
  return b ? a / b : 0;
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
}

function worseStatus(a = "normal", b = "normal") {
  const rank = { normal: 0, elevated: 1, high: 2, extreme: 3 };
  return (rank[a] || 0) >= (rank[b] || 0) ? a : b;
}

function slug(value = "") {
  return String(value || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function titleCase(value = "") {
  return String(value || "").replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatPct(value) {
  return `${Math.round((Number(value) || 0) * 1000) / 10}%`;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value) || 0);
}
