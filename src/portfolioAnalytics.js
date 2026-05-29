import { decimalPercent, inferLeveragedEtfMultiple, normalizeHoldings, numericFromGrade } from "./portfolioSchema.js";

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

export const POSITION_CONCENTRATION_THRESHOLDS = Object.freeze([
  { threshold: 0.05, label: "Above 5%", status: "elevated", interpretation: "large enough to monitor" },
  { threshold: 0.1, label: "Above 10%", status: "high", interpretation: "large enough to affect portfolio results" },
  { threshold: 0.2, label: "Above 20%", status: "extreme", interpretation: "dominant position risk" },
  { threshold: 0.3, label: "Above 30%", status: "extreme", interpretation: "single-position outcome risk" }
]);

export const LEVERAGED_ETF_UNDERLYING_DRAWDOWNS = Object.freeze([-0.1, -0.2, -0.3, -0.5]);

export const HOLDING_RISK_SCORE_WEIGHTS = Object.freeze({
  ratingRisk: 0.25,
  concentrationRisk: 0.3,
  leverageRisk: 0.25,
  volatilityRisk: 0.2
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
  const riskScoreBreakdown = buildHoldingRiskScoreBreakdown(holding, totalValue);
  const riskScore = riskScoreBreakdown.finalScore;

  return {
    ...holding,
    portfolioWeight: weight,
    targetWeight,
    drift,
    driftValue: drift * totalValue,
    unrealizedGain: holding.unrealizedGain || gainLoss,
    unrealizedGainPercent: holding.unrealizedGainPercent || gainLossPercent,
    riskScore,
    ratingRisk: riskScoreBreakdown.inputs.ratingRisk,
    riskScoreBreakdown
  };
}

export function buildHoldingRiskScoreBreakdown(holding = {}, totalValue = 0) {
  const weight = totalValue > 0 ? Number(holding.marketValue || 0) / totalValue : Number(holding.portfolioWeight || 0);
  const ratingRisk = ratingRiskScore(holding);
  const concentrationRisk = Math.min(100, weight * 420);
  const leverageMultiple = Math.abs(leverageMultipleFor(holding));
  const leverageRisk = holding.isLeveragedEtf ? Math.min(100, weight * leverageMultiple * 350) : 0;
  const betaInput = Number.isFinite(Number(holding.beta)) ? Number(holding.beta) : 1;
  const volatilityRisk = Math.min(100, betaInput * 22);
  const components = [
    {
      key: "ratingRisk",
      label: "Rating / factor risk",
      score: roundScore(ratingRisk),
      weight: HOLDING_RISK_SCORE_WEIGHTS.ratingRisk,
      points: roundScore(ratingRisk * HOLDING_RISK_SCORE_WEIGHTS.ratingRisk),
      detail: ratingRiskDetail(holding)
    },
    {
      key: "concentrationRisk",
      label: "Position concentration",
      score: roundScore(concentrationRisk),
      weight: HOLDING_RISK_SCORE_WEIGHTS.concentrationRisk,
      points: roundScore(concentrationRisk * HOLDING_RISK_SCORE_WEIGHTS.concentrationRisk),
      detail: `${formatPct(weight)} portfolio weight is converted to a 0-100 concentration input.`
    },
    {
      key: "leverageRisk",
      label: "Leveraged ETF exposure",
      score: roundScore(leverageRisk),
      weight: HOLDING_RISK_SCORE_WEIGHTS.leverageRisk,
      points: roundScore(leverageRisk * HOLDING_RISK_SCORE_WEIGHTS.leverageRisk),
      detail: holding.isLeveragedEtf
        ? `${holding.ticker || "This holding"} uses about ${leverageMultiple}x daily reset leverage.`
        : "No leveraged ETF penalty applied."
    },
    {
      key: "volatilityRisk",
      label: "Volatility / beta",
      score: roundScore(volatilityRisk),
      weight: HOLDING_RISK_SCORE_WEIGHTS.volatilityRisk,
      points: roundScore(volatilityRisk * HOLDING_RISK_SCORE_WEIGHTS.volatilityRisk),
      detail: Number.isFinite(Number(holding.beta))
        ? `Beta input ${roundScore(betaInput)} is converted to a volatility risk input.`
        : "Beta is missing; the local model falls back to 1.0."
    }
  ];
  const rawScore = components.reduce((total, component) => total + component.points, 0);
  const finalScore = Math.round(Math.min(100, Math.max(0, rawScore)));
  const missingData = [];
  if (!totalValue && !holding.portfolioWeight) missingData.push("Portfolio total is unavailable, so concentration risk is treated as zero.");
  if (!holding.quant && holding.assetClass === "Equity") missingData.push("Quant/rating input is missing; the local model applies a small equity-data penalty.");
  if (!Number.isFinite(Number(holding.beta))) missingData.push("Beta is missing; volatility risk uses a neutral 1.0 fallback.");

  return {
    type: "holding-risk",
    finalScore,
    rawScore: roundScore(rawScore),
    formula: "rating risk 25% + concentration 30% + leveraged exposure 25% + volatility/beta 20%",
    generatedBy: "Calculated local risk score. Not an AI explanation.",
    inputs: {
      ratingRisk: roundScore(ratingRisk),
      concentrationRisk: roundScore(concentrationRisk),
      leverageRisk: roundScore(leverageRisk),
      volatilityRisk: roundScore(volatilityRisk),
      portfolioWeight: roundRatio(weight),
      leverageMultiple
    },
    components,
    missingData
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
      alerts.push(alert("leverage", "high", `${label} adds leveraged exposure`, `Notional exposure is about ${formatCurrency(holding.marketValue * Math.abs(leverageMultipleFor(holding)))}.`, holding));
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
    if (isMissingCostBasis(holding)) {
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
    leveragedNotionalExposure: leveraged.reduce((total, holding) => total + holding.marketValue * Math.abs(leverageMultipleFor(holding)), 0),
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
  const concentrationScoreBreakdown = buildConcentrationScoreBreakdown({ top5Weight, top10Weight, topSectorWeight });
  const concentrationScore = concentrationScoreBreakdown.finalScore;
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
    concentrationScoreBreakdown,
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

export function buildConcentrationScoreBreakdown({
  top5Weight = 0,
  top10Weight = 0,
  topSectorWeight = 0
} = {}) {
  const components = [
    {
      key: "top5Weight",
      label: "Top 5 holdings",
      score: roundRatio(top5Weight),
      weight: 0.6,
      points: roundScore(top5Weight * 60),
      detail: `${formatPct(top5Weight)} in the top 5 holdings.`
    },
    {
      key: "top10Weight",
      label: "Top 10 holdings",
      score: roundRatio(top10Weight),
      weight: 0.25,
      points: roundScore(top10Weight * 25),
      detail: `${formatPct(top10Weight)} in the top 10 holdings.`
    },
    {
      key: "topSectorWeight",
      label: "Largest non-cash sector",
      score: roundRatio(topSectorWeight),
      weight: 0.45,
      points: roundScore(topSectorWeight * 45),
      detail: `${formatPct(topSectorWeight)} in the largest non-cash sector.`
    }
  ];
  const rawScore = components.reduce((total, component) => total + component.points, 0);
  return {
    type: "portfolio-concentration",
    finalScore: Math.round(Math.min(100, Math.max(0, rawScore))),
    rawScore: roundScore(rawScore),
    formula: "top 5 weight x 60 + top 10 weight x 25 + largest non-cash sector weight x 45",
    generatedBy: "Calculated local concentration score. Not an AI explanation.",
    components,
    missingData: top5Weight || top10Weight || topSectorWeight ? [] : ["Portfolio concentration needs imported holdings."]
  };
}

export function buildDecisionRiskDashboard(holdings = [], totalValue = 0, breakdowns = {}) {
  const normalizedTotal = Number(totalValue) || sum(holdings, "marketValue") || 0;
  const stockRows = holdings.filter((holding) => holding.assetClass === "Equity");
  const normalEtfRows = holdings.filter((holding) => holding.assetClass === "ETF" && !holding.isLeveragedEtf);
  const cashRows = holdings.filter((holding) => holding.assetClass === "Cash");
  const leveragedRows = holdings.filter((holding) => holding.isLeveragedEtf);
  const leveragedDirectValue = sum(leveragedRows, "marketValue");
  const leveragedNotionalValue = leveragedRows.reduce((total, holding) => total + holding.marketValue * Math.abs(leverageMultipleFor(holding)), 0);
  const cashValue = sum(cashRows, "marketValue");
  const stockValue = sum(stockRows, "marketValue");
  const normalEtfValue = sum(normalEtfRows, "marketValue");
  const themeRows = buildThemeExposureRows(holdings, normalizedTotal);
  const correlationRisk = buildCorrelationRisk(holdings, themeRows, normalizedTotal);
  const topPositionWeights = buildTopPositionWeightRows(holdings, normalizedTotal);
  const securityTypeExposure = buildSecurityTypeExposureRows(holdings, normalizedTotal);
  const top5Weight = divide(sum(topPositionWeights.slice(0, 5), "value"), normalizedTotal);
  const top10Weight = divide(sum(topPositionWeights.slice(0, 10), "value"), normalizedTotal);

  return {
    concentrationInterpretation: buildConcentrationInterpretation({
      topPositionRows: topPositionWeights,
      top5Weight,
      top10Weight,
      leveragedDirectWeight: divide(leveragedDirectValue, normalizedTotal),
      leveragedNotionalWeight: divide(leveragedNotionalValue, normalizedTotal),
      sectorRows: breakdowns.sector || groupBreakdown(holdings, "sector", normalizedTotal)
    }),
    topPositionWeights,
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
    securityTypeExposure,
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
      dailyResetExplanation: "Daily-reset leveraged ETFs target their stated multiple for one trading day. Multi-day returns can diverge from simple index leverage because compounding and volatility drag depend on the path of daily moves.",
      volatilityDragExplanation: "Volatility drag is highest when the underlying index swings up and down without a sustained trend; the fund can lose value even if the index finishes near where it started.",
      scenarios: buildLeveragedEtfDrawdownScenarios(leveragedRows, normalizedTotal),
      rows: leveragedRows
        .sort((a, b) => b.marketValue * Math.abs(leverageMultipleFor(b)) - a.marketValue * Math.abs(leverageMultipleFor(a)))
        .map((holding) => riskRow({
          id: `leveraged:${holding.ticker}`,
          name: holding.ticker,
          label: `${leverageMultipleFor(holding)}x ${holding.name}`,
          value: holding.marketValue * Math.abs(leverageMultipleFor(holding)),
          weight: divide(holding.marketValue * Math.abs(leverageMultipleFor(holding)), normalizedTotal),
          statusType: "leveragedNotional",
          explanation: `${holding.ticker} is ${formatPct(divide(holding.marketValue, normalizedTotal))} direct weight and ${formatPct(divide(holding.marketValue * Math.abs(leverageMultipleFor(holding)), normalizedTotal))} estimated notional exposure.`,
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
      normalEtf: riskRow({
        id: "asset-mix:normal-etf",
        name: "Normal ETFs and funds",
        value: normalEtfValue,
        weight: divide(normalEtfValue, normalizedTotal),
        statusType: "etf",
        explanation: `Normal ETFs and funds are ${formatPct(divide(normalEtfValue, normalizedTotal))} of portfolio value, separate from leveraged ETFs. ETF concentration can still hide overlap inside themes.`,
        href: "#holdings"
      }),
      leveragedEtf: riskRow({
        id: "asset-mix:leveraged-etf",
        name: "Leveraged ETFs",
        value: leveragedDirectValue,
        weight: divide(leveragedDirectValue, normalizedTotal),
        statusType: "leveragedDirect",
        explanation: `Leveraged ETFs are ${formatPct(divide(leveragedDirectValue, normalizedTotal))} direct weight and are tracked separately because daily reset leverage changes drawdown behavior.`,
        href: "#holdings"
      }),
      etf: riskRow({
        id: "asset-mix:etf",
        name: "Normal ETFs and funds",
        value: normalEtfValue,
        weight: divide(normalEtfValue, normalizedTotal),
        statusType: "etf",
        explanation: `Normal ETFs and funds are ${formatPct(divide(normalEtfValue, normalizedTotal))} of portfolio value, separate from leveraged ETFs.`,
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

export function buildLeveragedEtfDrawdownScenarios(holdings = [], totalValue = 0, underlyingDrawdowns = LEVERAGED_ETF_UNDERLYING_DRAWDOWNS) {
  const leveragedRows = holdings.filter((holding) => holding.isLeveragedEtf || Math.abs(leverageMultipleFor(holding)) > 1);
  const directValue = sum(leveragedRows, "marketValue");
  return underlyingDrawdowns.map((underlyingMove) => {
    const scenarioValueChange = roundCurrency(leveragedRows.reduce((total, holding) => {
      const multiple = leverageMultipleFor(holding);
      const estimatedMove = clamp(underlyingMove * multiple, -1, 1);
      return total + (Number(holding.marketValue) || 0) * estimatedMove;
    }, 0));
    const estimatedProductMove = roundRatio(divide(scenarioValueChange, directValue));
    const tickers = leveragedRows.map((holding) => holding.ticker).filter(Boolean);
    return {
      underlyingMove,
      underlyingMoveLabel: formatPct(underlyingMove),
      estimatedProductMove,
      estimatedPortfolioImpact: scenarioValueChange,
      estimatedPortfolioImpactPct: roundRatio(divide(scenarioValueChange, totalValue)),
      tickers: unique(tickers),
      explanation: leveragedRows.length
        ? `${tickers.join(", ")} would have an estimated same-day move of ${formatPct(estimatedProductMove)} across current leveraged ETF exposure before fees, tracking error, and path effects.`
        : "No leveraged ETFs are available for this scenario."
    };
  });
}

function buildTopPositionWeightRows(holdings = [], totalValue = 0) {
  return [...holdings]
    .filter((holding) => !isCashLikeHolding(holding))
    .sort((a, b) => b.marketValue - a.marketValue)
    .slice(0, 10)
    .map((holding) => {
      const weight = divide(holding.marketValue, totalValue);
      const thresholdFlags = concentrationThresholdFlags(weight);
      const thresholdLabel = thresholdFlags[thresholdFlags.length - 1]?.label || "Below 5%";
      const securityType = classifyHoldingExposureType(holding);
      return riskRow({
        id: `position:${holding.ticker}`,
        name: holding.ticker,
        label: holding.name,
        value: holding.marketValue,
        weight,
        statusType: "position",
        explanation: `${holding.ticker} is ${formatPct(weight)} of portfolio value (${thresholdLabel.toLowerCase()}). ${securityType.reviewNote}`,
        tickers: [holding.ticker],
        href: holding.ticker ? `#/ticker/${holding.ticker}` : "#holdings",
        thresholdFlags,
        thresholdLabel,
        securityType: securityType.label
      });
    });
}

export function concentrationThresholdFlags(weight = 0, thresholds = POSITION_CONCENTRATION_THRESHOLDS) {
  const numeric = Number(weight) || 0;
  return thresholds
    .filter((row) => numeric >= row.threshold)
    .map((row) => ({
      ...row,
      thresholdPct: formatPct(row.threshold)
    }));
}

function buildSecurityTypeExposureRows(holdings = [], totalValue = 0) {
  const groups = new Map();
  holdings.forEach((holding) => {
    const type = classifyHoldingExposureType(holding);
    const current = groups.get(type.key) || {
      id: `security-type:${type.key}`,
      name: type.label,
      label: type.description,
      value: 0,
      tickers: [],
      statusType: type.statusType,
      explanationSeed: type.reviewNote
    };
    current.value += Number(holding.marketValue) || 0;
    if (holding.ticker && !isCashLikeHolding(holding)) current.tickers.push(holding.ticker);
    groups.set(type.key, current);
  });

  return Array.from(groups.values())
    .map((row) => riskRow({
      id: row.id,
      name: row.name,
      label: row.label,
      value: row.value,
      weight: divide(row.value, totalValue),
      statusType: row.statusType,
      explanation: `${row.name} are ${formatPct(divide(row.value, totalValue))} of portfolio value. ${row.explanationSeed}`,
      tickers: unique(row.tickers),
      href: "#holdings"
    }))
    .sort((a, b) => b.value - a.value);
}

function classifyHoldingExposureType(holding = {}) {
  if (isCashLikeHolding(holding)) {
    return {
      key: "cash",
      label: "Cash / money market",
      description: "Deployable or defensive liquidity",
      statusType: "cash",
      reviewNote: "Cash is not equity drawdown risk, but high cash creates deployment and opportunity-cost decisions."
    };
  }
  if (holding.isLeveragedEtf || Number(holding.leveragedMultiple || 0) > 1) {
    return {
      key: "leveraged-etf",
      label: "Leveraged ETFs",
      description: "Daily-reset amplified exposure",
      statusType: "leveragedDirect",
      reviewNote: "Leveraged ETF exposure should be reviewed separately from ordinary fund exposure because path dependency and daily reset effects can amplify losses."
    };
  }
  if (holding.assetClass === "ETF" || /ETF|fund/i.test(`${holding.assetClass || ""} ${holding.name || ""}`)) {
    return {
      key: "normal-etf",
      label: "Normal ETFs / funds",
      description: "Diversified fund wrappers",
      statusType: "etf",
      reviewNote: "Normal ETFs can reduce single-company risk, but they can still overlap inside sectors or themes."
    };
  }
  if (holding.assetClass === "Equity") {
    return {
      key: "single-stock",
      label: "Single stocks",
      description: "Company-specific equity exposure",
      statusType: "individualStock",
      reviewNote: "Single-stock concentration can dominate outcome variance and should stay tied to thesis conviction and target sizing."
    };
  }
  return {
    key: "other",
    label: "Other holdings",
    description: "Positions outside stock/fund/cash buckets",
    statusType: "position",
    reviewNote: "Review classification so concentration analysis can place this exposure in the right bucket."
  };
}

function buildConcentrationInterpretation({ topPositionRows = [], top5Weight = 0, top10Weight = 0, leveragedDirectWeight = 0, leveragedNotionalWeight = 0, sectorRows = [] } = {}) {
  const topPosition = topPositionRows[0];
  const topSector = (sectorRows || []).find((row) => row.name !== "Cash");
  const topStatus = topPosition?.status || "normal";
  const top5Status = riskStatusForWeight(top5Weight, { elevated: 0.35, high: 0.5, extreme: 0.65 });
  const top10Status = riskStatusForWeight(top10Weight, { elevated: 0.55, high: 0.7, extreme: 0.85 });
  const leverageStatus = riskStatusForWeight(leveragedNotionalWeight, RISK_STATUS_THRESHOLDS.leveragedNotional);
  const sectorStatus = riskStatusForWeight(topSector?.weight || 0, RISK_STATUS_THRESHOLDS.sector);
  const status = [topStatus, top5Status, top10Status, leverageStatus, sectorStatus].reduce((current, next) => worseStatus(current, next), "normal");
  const headline = {
    normal: "Concentration looks balanced",
    elevated: "Concentration deserves monitoring",
    high: "Concentration needs review",
    extreme: "Concentration is a dominant risk"
  }[status] || "Concentration needs review";
  const drivers = [
    topPosition ? `${topPosition.name} is the largest position at ${formatPct(topPosition.weight)} (${topPosition.thresholdLabel || "below 5%"}).` : "No top position is available yet.",
    `Top 5 holdings are ${formatPct(top5Weight)} of portfolio value.`,
    `Top 10 holdings are ${formatPct(top10Weight)} of portfolio value.`,
    topSector ? `${topSector.name} is the largest sector at ${formatPct(topSector.weight)}.` : "No sector concentration row is available.",
    leveragedDirectWeight > 0 ? `Leveraged ETFs are ${formatPct(leveragedDirectWeight)} direct and ${formatPct(leveragedNotionalWeight)} estimated notional exposure.` : "No leveraged ETF exposure is detected."
  ];
  return {
    status,
    headline,
    summary: `${headline}. This is a deterministic local read from position weights, sector exposure, top-5/top-10 concentration, and leveraged notional exposure. It is not an OpenAI-generated recommendation.`,
    drivers,
    nextStep: status === "normal"
      ? "Use Holdings or What-If only if you are considering a portfolio change."
      : "Open the highest-weight ticker, compare against target allocation, then use What-If before changing exposure."
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

function riskRow({ id, name, label = "", value = 0, weight = 0, statusType = "position", explanation = "", tickers = [], href = "#holdings", thresholdFlags = [], thresholdLabel = "", securityType = "" }) {
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
    href,
    thresholdFlags,
    thresholdLabel,
    securityType
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
    if (isMissingCostBasis(holding)) issues.push(issue("missing-cost-basis", `${holding.ticker} is missing cost basis.`));
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

function ratingRiskDetail(holding = {}) {
  const notes = [];
  if (holding.quant && holding.quant < 3) notes.push(`Quant rating ${holding.quant} adds risk.`);
  if (numericFromGrade(holding.valuationGrade) && numericFromGrade(holding.valuationGrade) <= 2.5) notes.push(`Valuation grade ${holding.valuationGrade} adds risk.`);
  if (numericFromGrade(holding.revisionsGrade) && numericFromGrade(holding.revisionsGrade) <= 3) notes.push(`EPS revisions grade ${holding.revisionsGrade} adds risk.`);
  if (!holding.quant && holding.assetClass === "Equity") notes.push("Missing equity rating data adds a small risk penalty.");
  return notes.length ? notes.join(" ") : "No weak rating, valuation, or revisions input is currently penalizing this holding.";
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

function isMissingCostBasis(holding = {}) {
  return holding.assetClass !== "Cash" && (holding.missingCostBasis || !Number(holding.costBasis));
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

function leverageMultipleFor(holding = {}) {
  return Number(holding.leveragedMultiple) || inferLeveragedEtfMultiple(holding.ticker, holding) || 1;
}

function clamp(value, min, max) {
  const numeric = Number(value) || 0;
  return Math.min(max, Math.max(min, numeric));
}

function roundRatio(value) {
  return Math.round((Number(value) || 0) * 1000000) / 1000000;
}

function roundScore(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

function roundCurrency(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
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
