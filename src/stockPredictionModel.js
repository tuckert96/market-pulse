export const STOCK_PREDICTION_MODEL_VERSION = "transparent-stock-prediction-v1";
export const STOCK_PREDICTION_HORIZON = "20 trading days";

export const STOCK_PREDICTION_WEIGHTS = Object.freeze({
  priceTrend: 0.24,
  relativeStrength: 0.16,
  quantQuality: 0.18,
  academicDiscipline: 0.1,
  estimateRevisionProxy: 0.08,
  socialDisclosureFlow: 0.06,
  riskControl: 0.1,
  dataReliability: 0.08
});

export function buildStockPredictionModel({
  holding = {},
  signal = {},
  recommendations = [],
  uiState = "SAMPLE_MODE",
  asOf = new Date().toISOString()
} = {}) {
  const securityKind = signal.institutionalQuantSecurityKind || (holding.isLeveragedEtf || /ETF|Fund/i.test(String(holding.assetClass || "")) ? "fund-or-etf" : "operating-company");
  const realPortfolio = isRealPortfolioState(uiState);
  const factors = [
    factor("priceTrend", "Price trend", scoreFrom01or100(signal.priceMomentumScore ?? signal.priceMomentumPlaceholder), "Momentum from provider/imported price context."),
    factor("relativeStrength", "Relative strength", scoreFrom01or100(signal.relativeStrengthScore ?? signal.relativeStrengthPlaceholder), "Relative move versus benchmark or local peer context."),
    factor("quantQuality", "Quant quality", score100(signal.institutionalQuantScore ?? signal.holdingQualityScore), "Institutional Quant Lens quality input."),
    factor("academicDiscipline", "Academic factor discipline", score100(signal.institutionalQuantAcademicCompositeScore ?? signal.institutionalQuantScore), "Paper-backed factor discipline overlay."),
    factor("estimateRevisionProxy", "Estimate revisions proxy", estimateRevisionProxy(signal), "EPS revision and factor-grade proxy when imported data exists."),
    factor("socialDisclosureFlow", "Social/disclosure flow", socialDisclosureFlow(signal), "Reddit acceleration and politician-disclosure activity, downweighted by design."),
    factor("riskControl", "Risk control", riskControlScore(holding, signal), "Penalizes leverage and high-risk exposure."),
    factor("dataReliability", "Data reliability", dataReliabilityScore(signal, realPortfolio), "Data coverage, source freshness, and market-data availability.")
  ];

  const weightedScore = factors.reduce((sum, row) => sum + row.score * row.weight, 0);
  const caveats = predictionCaveats({ signal, holding, uiState, securityKind });
  const confidence = predictionConfidence({ signal, holding, caveats, realPortfolio });
  const score = clampScore(weightedScore);
  const riskAdjustedScore = clampScore(score * (0.72 + confidence / 350));
  const label = predictionLabel(riskAdjustedScore);
  const direction = predictionDirection(riskAdjustedScore);
  const topDrivers = factors
    .slice()
    .sort((left, right) => right.points - left.points)
    .slice(0, 4)
    .map((row) => `${row.label}: ${Math.round(row.score)}/100`);
  const weakSignals = factors
    .filter((row) => row.score < 45)
    .sort((left, right) => left.score - right.score)
    .slice(0, 4)
    .map((row) => `${row.label}: weak or missing`);

  return {
    modelVersion: STOCK_PREDICTION_MODEL_VERSION,
    ticker: normalizeTicker(signal.ticker || holding.ticker),
    horizon: STOCK_PREDICTION_HORIZON,
    score: riskAdjustedScore,
    rawScore: score,
    label,
    direction,
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    securityKind,
    sourceMode: predictionSourceMode(signal, uiState),
    generatedAt: asOf,
    summary: predictionSummary({ label, direction, confidence, securityKind }),
    factors,
    topDrivers,
    weakSignals,
    caveats,
    recommendations: predictionNextChecks({ label, direction, caveats, recommendations, holding, signal }),
    guardrail: "Decision support only. This is not a calibrated probability, return forecast, valuation target, or order instruction."
  };
}

function factor(key, label, score, detail) {
  const weight = STOCK_PREDICTION_WEIGHTS[key] || 0;
  const normalizedScore = clampScore(score);
  return {
    key,
    label,
    score: normalizedScore,
    weight,
    points: normalizedScore * weight,
    detail
  };
}

function estimateRevisionProxy(signal = {}) {
  const factors = Array.isArray(signal.institutionalQuantFactors) ? signal.institutionalQuantFactors : [];
  const revisionFactor = factors.find((row) => /revision|estimate/i.test(`${row.label} ${row.key}`));
  if (revisionFactor) return score100(revisionFactor.score);
  return score100(signal.revisionsScore ?? signal.epsRevisionsScore ?? signal.institutionalQuantAcademicCompositeScore);
}

function socialDisclosureFlow(signal = {}) {
  const reddit = scoreFrom01or100(signal.redditMentionAccelerationScore ?? signal.redditMentionScore);
  const politicianBuy = scoreFrom01or100(signal.politicianBuyScore ?? signal.politicianActivityScore);
  const politicianSell = scoreFrom01or100(signal.politicianSellScore);
  return clampScore(reddit * 0.45 + politicianBuy * 0.45 - politicianSell * 0.25 + 25);
}

function riskControlScore(holding = {}, signal = {}) {
  let score = 78;
  if (holding.isLeveragedEtf || signal.isLeveragedEtf) score -= 24;
  if (Number(holding.leveragedMultiple || signal.leveragedMultiple || 0) >= 3) score -= 12;
  if (/very high|high/i.test(String(holding.riskLevel || ""))) score -= 8;
  return clampScore(score);
}

function dataReliabilityScore(signal = {}, realPortfolio = false) {
  const confidence = score100(signal.institutionalQuantConfidenceScore ?? signal.confidenceScore);
  const coverage = score100(signal.institutionalQuantDataCoverageScore ?? signal.dataQualityScore);
  const marketData = signal.marketDataPrice || signal.marketDataDailyChangePercent || signal.marketDataAsOf ? 82 : 42;
  const sourcePenalty = /mock|sample|placeholder|not configured|error|stale/i.test(`${signal.sourceMode || ""} ${signal.marketDataStatus || ""}`) ? 18 : 0;
  const portfolioPenalty = realPortfolio ? 0 : 10;
  return clampScore(confidence * 0.34 + coverage * 0.36 + marketData * 0.3 - sourcePenalty - portfolioPenalty);
}

function predictionConfidence({ signal = {}, holding = {}, caveats = [], realPortfolio = false }) {
  const quantConfidence = score100(signal.institutionalQuantConfidenceScore ?? signal.confidenceScore);
  const dataCoverage = score100(signal.institutionalQuantDataCoverageScore ?? signal.dataQualityScore);
  const marketDataAvailable = signal.marketDataPrice || signal.marketDataDailyChangePercent || signal.marketDataAsOf ? 18 : 0;
  const portfolioContext = realPortfolio && Number(holding.marketValue) > 0 ? 12 : 0;
  const caveatPenalty = Math.min(28, caveats.length * 5);
  return clampScore(quantConfidence * 0.36 + dataCoverage * 0.34 + marketDataAvailable + portfolioContext - caveatPenalty);
}

function predictionCaveats({ signal = {}, holding = {}, uiState = "", securityKind = "" }) {
  const caveats = [];
  if (!isRealPortfolioState(uiState)) caveats.push("Sample context: import real holdings before treating this as Tucker-specific.");
  if (!signal.marketDataPrice && !signal.marketDataDailyChangePercent) caveats.push("Market quote context is missing or not connected.");
  if ((signal.institutionalQuantMissingData || []).length) caveats.push(`Missing factor data: ${signal.institutionalQuantMissingData.slice(0, 2).join("; ")}.`);
  if ((signal.institutionalQuantAcademicValidationWarnings || []).length) caveats.push(`Validation warning: ${signal.institutionalQuantAcademicValidationWarnings.slice(0, 2).join("; ")}.`);
  if (/mock|sample|placeholder|not configured|error|stale/i.test(`${signal.sourceMode || ""} ${signal.marketDataStatus || ""}`)) caveats.push("One or more inputs are sample, stale, missing, or local placeholders.");
  if (securityKind === "fund-or-etf") caveats.push("Fund/ETF rows are exposure outlooks, not operating-company stock forecasts.");
  if (holding.isLeveragedEtf || signal.isLeveragedEtf) caveats.push("Leveraged products can move sharply against the model score because leverage path dependency dominates fundamentals.");
  return unique(caveats);
}

function predictionNextChecks({ label, caveats = [], recommendations = [], holding = {}, signal = {} }) {
  const checks = [];
  if (/Favorable|Constructive/i.test(label)) checks.push("Verify that the thesis, valuation, and risk cap still support the position size.");
  if (/Caution|Unfavorable/i.test(label)) checks.push("Review whether weak trend, poor data quality, or risk exposure conflicts with the thesis.");
  if (Number(holding.portfolioWeight || signal.portfolioWeight || 0) >= 0.1) checks.push("Because position weight is material, compare prediction score against target drift and concentration risk.");
  if (Number(holding.portfolioWeight || signal.portfolioWeight || 0) >= 0.1) checks.push("Position size is review context only; it is not part of the stock-return prediction score.");
  if (caveats.length) checks.push("Resolve the top missing/stale data caveat before relying on the score.");
  if ((recommendations || []).some((row) => /stale data|review|risk/i.test(`${row.recommendationType} ${row.title}`))) checks.push("Open the Alpha recommendation details for related risk or data-quality warnings.");
  return unique(checks).slice(0, 4);
}

function predictionLabel(score) {
  if (score >= 72) return "Favorable";
  if (score >= 58) return "Constructive";
  if (score >= 44) return "Neutral";
  if (score >= 30) return "Caution";
  return "Unfavorable";
}

function predictionDirection(score) {
  if (score >= 58) return "Positive skew";
  if (score <= 43) return "Negative skew";
  return "Balanced";
}

function confidenceLabel(score) {
  if (score >= 72) return "Higher confidence";
  if (score >= 52) return "Moderate confidence";
  if (score >= 34) return "Low confidence";
  return "Very low confidence";
}

function predictionSummary({ label, direction, confidence, securityKind }) {
  const subject = securityKind === "fund-or-etf" ? "exposure setup" : "stock setup";
  return `${label} ${STOCK_PREDICTION_HORIZON} ${subject}; ${direction.toLowerCase()} with ${confidenceLabel(confidence).toLowerCase()}.`;
}

function predictionSourceMode(signal = {}, uiState = "") {
  if (!isRealPortfolioState(uiState)) return "Sample";
  if (/live/i.test(`${signal.sourceMode || ""} ${signal.marketDataStatus || ""}`)) return "Live market input";
  if (/cached/i.test(`${signal.sourceMode || ""} ${signal.marketDataStatus || ""}`)) return "Cached market input";
  if (/stale/i.test(`${signal.sourceMode || ""} ${signal.marketDataStatus || ""}`)) return "Stale input";
  return "Imported/local";
}

function scoreFrom01or100(value, fallback = 50) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return numeric <= 1 ? clampScore(numeric * 100) : clampScore(numeric);
}

function score100(value, fallback = 50) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return clampScore(numeric);
}

function clampScore(value) {
  if (!Number.isFinite(Number(value))) return 0;
  return Math.max(0, Math.min(100, Math.round(Number(value))));
}

function normalizeTicker(value = "") {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "");
}

function isRealPortfolioState(uiState = "") {
  return /IMPORTED|STALE_PERSISTED_REPAIRED/i.test(String(uiState || ""));
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}
