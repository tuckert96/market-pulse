const DAY_MS = 24 * 60 * 60 * 1000;

export const HORIZONS = Object.freeze({
  SWING: "swing",
  QUARTER: "quarter",
  YEAR: "year"
});

export const FACTOR_LABELS = Object.freeze({
  growthQuality: "Growth quality",
  momentum: "Momentum",
  seekingAlphaQuant: "Seeking Alpha quant",
  revisions: "Estimate revisions",
  valuationDiscipline: "Valuation discipline",
  catalystTiming: "Catalyst timing",
  portfolioFit: "Portfolio fit"
});

export const DEFAULT_WEIGHTS_BY_HORIZON = Object.freeze({
  swing: Object.freeze({
    growthQuality: 0.2,
    momentum: 0.28,
    seekingAlphaQuant: 0.16,
    revisions: 0.15,
    valuationDiscipline: 0.08,
    catalystTiming: 0.08,
    portfolioFit: 0.05
  }),
  quarter: Object.freeze({
    growthQuality: 0.27,
    momentum: 0.2,
    seekingAlphaQuant: 0.18,
    revisions: 0.17,
    valuationDiscipline: 0.08,
    catalystTiming: 0.05,
    portfolioFit: 0.05
  }),
  year: Object.freeze({
    growthQuality: 0.32,
    momentum: 0.12,
    seekingAlphaQuant: 0.2,
    revisions: 0.14,
    valuationDiscipline: 0.13,
    catalystTiming: 0.03,
    portfolioFit: 0.06
  })
});

export const INSTITUTIONAL_QUANT_MODEL_VERSION = "institutional-quant-lens-v1.3";
export const ACADEMIC_FACTOR_MODEL_VERSION = "academic-factor-discipline-v1";
export const INSTITUTIONAL_QUANT_WEIGHTS = Object.freeze({
  quality: 0.20,
  momentum: 0.19,
  revisions: 0.13,
  valuation: 0.14,
  riskControl: 0.12,
  liquidity: 0.07,
  portfolioFit: 0.06,
  dataQuality: 0.04,
  factorValidation: 0.05
});

export const ACADEMIC_FACTOR_WEIGHTS = Object.freeze({
  momentum: 0.24,
  profitabilityQuality: 0.22,
  valueDiscipline: 0.18,
  riskControl: 0.14,
  validationDiscipline: 0.14,
  ensembleReadiness: 0.08
});

const DRIVER_MIN_CONTRIBUTION = 5;
const SCORE_CAP_NONE = 100;
const ROBUST_HISTORY_POINTS = 20;
const ROBUST_MOMENTUM_POINTS = 13;
const MOMENTUM_SKIP_DAYS = 28;
const MOMENTUM_FORMATION_DAYS = 365;
const MIN_CANONICAL_MOMENTUM_SPAN_DAYS = 300;
const MIN_CANONICAL_MOMENTUM_POINTS = 8;

function numberFrom(stock, keys, fallback = 0) {
  for (const key of keys) {
    const value = stock?.[key];
    if (value !== undefined && value !== null && value !== "") {
      const parsed = Number(String(value).replace(/[$,%x]/gi, ""));
      return Number.isFinite(parsed) ? parsed : fallback;
    }
  }
  return fallback;
}

function ratioFrom(stock, keys, fallback = NaN) {
  for (const key of keys) {
    const raw = stock?.[key];
    if (raw === undefined || raw === null || raw === "") continue;
    const text = String(raw).trim();
    const numeric = Number(text.replace(/[$,%x]/gi, ""));
    if (!Number.isFinite(numeric)) continue;
    if (/%/.test(text)) return numeric / 100;
    return Math.abs(numeric) > 1 && Math.abs(numeric) <= 100 ? numeric / 100 : numeric;
  }
  return fallback;
}

function ratioFromPair(stock, numeratorKeys = [], denominatorKeys = [], fallback = NaN) {
  const numerator = numberFrom(stock, numeratorKeys, NaN);
  const denominator = numberFrom(stock, denominatorKeys, NaN);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return fallback;
  return numerator / denominator;
}

function percentPointFrom(stock, keys, fallback = 0) {
  for (const key of keys) {
    const raw = stock?.[key];
    if (raw === undefined || raw === null || raw === "") continue;
    const text = String(raw).trim();
    const numeric = Number(text.replace(/[$,%x]/gi, ""));
    if (!Number.isFinite(numeric)) continue;
    if (/%/.test(text)) return numeric;
    return Math.abs(numeric) <= 1 ? numeric * 100 : numeric;
  }
  return fallback;
}

function textFrom(stock, keys, fallback = "") {
  for (const key of keys) {
    const value = stock?.[key];
    if (value !== undefined && value !== null && value !== "") return String(value);
  }
  return fallback;
}

function boundedScore(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function gradeToScore(value, fallback = 60) {
  if (typeof value === "string") {
    const grade = value.trim().toUpperCase();
    const gradeScores = {
      "A+": 98,
      A: 94,
      "A-": 90,
      "B+": 84,
      B: 78,
      "B-": 72,
      "C+": 66,
      C: 58,
      "C-": 50,
      "D+": 42,
      D: 34,
      "D-": 26,
      F: 10
    };
    if (gradeScores[grade] !== undefined) return gradeScores[grade];
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return numeric <= 5 ? numeric * 20 : numeric;
}

function normalizeWeights(weights) {
  const total = Object.values(weights).reduce((sum, weight) => sum + Number(weight || 0), 0);
  if (total <= 0) return weights;

  return Object.fromEntries(
    Object.entries(weights).map(([key, weight]) => [key, Number(weight || 0) / total])
  );
}

function normalizeHorizon(horizon = HORIZONS.SWING) {
  return DEFAULT_WEIGHTS_BY_HORIZON[horizon] ? horizon : HORIZONS.SWING;
}

export function clampScore(value) {
  return Math.round(boundedScore(Number(value)));
}

export function daysUntil(dateText, asOf = new Date()) {
  if (!dateText) return null;
  const date = dateText instanceof Date ? dateText : new Date(`${dateText}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - asOf.getTime()) / DAY_MS);
}

export function scoreGrowthQuality(stock = {}) {
  const revenueGrowth = percentPointFrom(stock, ["revenueGrowth", "salesGrowth", "revGrowth"]);
  const epsGrowth = percentPointFrom(stock, ["epsGrowth", "earningsGrowth"]);
  const grossMargin = percentPointFrom(stock, ["grossMargin"], 55);
  const freeCashFlowMargin = percentPointFrom(stock, ["freeCashFlowMargin", "fcfMargin"], 10);
  const saGrowth = gradeToScore(textFrom(stock, ["growth", "growthGrade"], ""), 60);

  const growthEngine = Math.min(100, revenueGrowth * 1.15 + Math.max(epsGrowth, 0) * 0.45);
  const marginQuality = boundedScore(grossMargin * 0.75 + freeCashFlowMargin * 1.2);
  const consistencyPenalty = revenueGrowth > 20 && epsGrowth < -10 ? 12 : 0;
  const score = boundedScore(growthEngine * 0.46 + saGrowth * 0.28 + marginQuality * 0.26 - consistencyPenalty);

  return {
    key: "growthQuality",
    label: FACTOR_LABELS.growthQuality,
    score: clampScore(score),
    details: {
      revenueGrowth,
      epsGrowth,
      grossMargin,
      freeCashFlowMargin,
      seekingAlphaGrowthScore: Math.round(saGrowth),
      consistencyPenalty
    },
    driver:
      revenueGrowth >= 35 || epsGrowth >= 45
        ? "Growth is accelerating with earnings leverage"
        : "Growth profile is steady but not dominant"
  };
}

export function scoreMomentum(stock = {}) {
  const explicitMomentum = numberFrom(stock, ["momentum", "momentumScore"], NaN);
  const oneMonthReturn = numberFrom(stock, ["oneMonthReturn", "return1m"], 0);
  const threeMonthReturn = numberFrom(stock, ["threeMonthReturn", "return3m"], 0);
  const relativeStrength = numberFrom(stock, ["relativeStrength", "rsRating"], 50);
  const aboveMovingAverage = numberFrom(stock, ["aboveMovingAverage", "aboveSma"], 0);

  const score = Number.isFinite(explicitMomentum)
    ? explicitMomentum
    : 45 + oneMonthReturn * 0.9 + threeMonthReturn * 0.55 + (relativeStrength - 50) * 0.6 + aboveMovingAverage * 0.18;

  return {
    key: "momentum",
    label: FACTOR_LABELS.momentum,
    score: clampScore(score),
    details: { oneMonthReturn, threeMonthReturn, relativeStrength, aboveMovingAverage },
    driver: score >= 80 ? "Price action confirms the thesis" : "Momentum is mixed or still developing"
  };
}

export function scoreSeekingAlphaQuant(stock = {}) {
  const quant = textFrom(stock, ["quant", "quantScore", "saQuant"], "");
  const quantScore = gradeToScore(quant, 60);

  return {
    key: "seekingAlphaQuant",
    label: FACTOR_LABELS.seekingAlphaQuant,
    score: clampScore(quantScore),
    details: { quant },
    driver: quantScore >= 86 ? "Seeking Alpha quant rating is elite" : "Quant rating is supportive but not a standout"
  };
}

export function scoreRevisions(stock = {}) {
  const revisions = gradeToScore(textFrom(stock, ["revisions", "revisionScore", "epsRevisions"], ""), 60);
  const estimateChange = numberFrom(stock, ["estimateChange", "epsEstimateChange"], 0);
  const upwardRevisions = numberFrom(stock, ["upwardRevisions"], 0);
  const downwardRevisions = numberFrom(stock, ["downwardRevisions"], 0);
  const revisionBreadth = upwardRevisions + downwardRevisions > 0
    ? 50 + ((upwardRevisions - downwardRevisions) / (upwardRevisions + downwardRevisions)) * 50
    : 60;

  const score = revisions * 0.62 + boundedScore(50 + estimateChange * 4) * 0.2 + revisionBreadth * 0.18;

  return {
    key: "revisions",
    label: FACTOR_LABELS.revisions,
    score: clampScore(score),
    details: { revisions: Math.round(revisions), estimateChange, upwardRevisions, downwardRevisions },
    driver: score >= 78 ? "Analyst revisions are moving in the right direction" : "Revision support is modest"
  };
}

export function scoreValuationDiscipline(stock = {}) {
  const forwardPe = numberFrom(stock, ["forwardPe", "fwdPe", "pe"], 40);
  const revenueGrowth = Math.max(percentPointFrom(stock, ["revenueGrowth", "salesGrowth", "revGrowth"]), 1);
  const epsGrowth = Math.max(percentPointFrom(stock, ["epsGrowth", "earningsGrowth"]), 1);
  const priceToSales = numberFrom(stock, ["priceToSales", "psRatio"], 8);
  const peg = forwardPe / Math.max(epsGrowth, 8);

  const peScore = boundedScore(108 - (forwardPe - 18) * 1.35);
  const growthAdjustedScore = boundedScore(100 - Math.max(0, peg - 1) * 28 + Math.min(20, revenueGrowth * 0.18));
  const salesMultipleScore = boundedScore(100 - Math.max(0, priceToSales - 6) * 4.5);
  const score = peScore * 0.42 + growthAdjustedScore * 0.38 + salesMultipleScore * 0.2;

  return {
    key: "valuationDiscipline",
    label: FACTOR_LABELS.valuationDiscipline,
    score: clampScore(score),
    details: { forwardPe, priceToSales, peg: Number(peg.toFixed(2)) },
    driver: score >= 72 ? "Valuation is disciplined relative to growth" : "Valuation requires execution discipline"
  };
}

export function scoreCatalystTiming(stock = {}, options = {}) {
  const catalystDate = textFrom(stock, ["nextEarnings", "catalystDate", "earningsDate"], "");
  const days = daysUntil(catalystDate, options.asOf || new Date());
  const catalystStrength = gradeToScore(textFrom(stock, ["catalystStrength"], ""), 65);
  let timingScore = 70;

  if (days === null) timingScore = 58;
  else if (days < 0) timingScore = 45;
  else if (days <= 7) timingScore = 64;
  else if (days <= 35) timingScore = 88;
  else if (days <= 90) timingScore = 76;

  const score = timingScore * 0.72 + catalystStrength * 0.28;

  return {
    key: "catalystTiming",
    label: FACTOR_LABELS.catalystTiming,
    score: clampScore(score),
    details: { catalystDate, daysUntilCatalyst: days, catalystStrength: Math.round(catalystStrength) },
    driver: days !== null && days >= 8 && days <= 35
      ? "Catalyst is near enough to matter without being immediate event risk"
      : "Catalyst timing is less favorable"
  };
}

export function scorePortfolioFit(stock = {}, portfolio = {}) {
  const price = numberFrom(stock, ["price", "lastPrice", "currentPrice"]);
  const shares = numberFrom(stock, ["shares", "quantity"]);
  const positionValue = numberFrom(stock, ["positionValue"], price * shares);
  const portfolioValue = numberFrom(portfolio, ["totalValue", "portfolioValue"], 0);
  const targetWeight = ratioFrom(stock, ["targetWeight"], ratioFrom(portfolio, ["defaultTargetWeight"], 0.08));
  const currentWeight = portfolioValue > 0 ? positionValue / portfolioValue : 0;
  const sectorExposure = ratioFrom(stock, ["sectorExposure"], ratioFrom(portfolio, ["sectorExposure"], 0));
  const maxPositionWeight = ratioFrom(portfolio, ["maxPositionWeight"], 0.14);
  const maxSectorWeight = ratioFrom(portfolio, ["maxSectorWeight"], 0.32);

  const underweightBoost = positionValue > 0 && currentWeight < targetWeight * 0.6 ? 10 : 0;
  const newIdeaBoost = positionValue === 0 ? 6 : 0;
  const concentrationPenalty = currentWeight > maxPositionWeight ? (currentWeight - maxPositionWeight) * 240 : 0;
  const sectorPenalty = sectorExposure > maxSectorWeight ? (sectorExposure - maxSectorWeight) * 130 : 0;
  const score = 72 + underweightBoost + newIdeaBoost - concentrationPenalty - sectorPenalty;

  return {
    key: "portfolioFit",
    label: FACTOR_LABELS.portfolioFit,
    score: clampScore(score),
    details: {
      positionValue: Math.round(positionValue),
      currentWeight: Number(currentWeight.toFixed(4)),
      targetWeight,
      sectorExposure,
      underweightBoost,
      newIdeaBoost,
      concentrationPenalty: Number(concentrationPenalty.toFixed(1)),
      sectorPenalty: Number(sectorPenalty.toFixed(1))
    },
    driver: score >= 78 ? "Position sizing leaves room to add" : "Existing exposure tempers the ranking"
  };
}

export function getScoreBreakdown(stock = {}, options = {}) {
  const horizon = normalizeHorizon(options.horizon);
  const customWeights = options.weightsByHorizon?.[horizon] || options.weights;
  const weights = normalizeWeights(customWeights || DEFAULT_WEIGHTS_BY_HORIZON[horizon]);
  const scorers = [
    scoreGrowthQuality(stock),
    scoreMomentum(stock),
    scoreSeekingAlphaQuant(stock),
    scoreRevisions(stock),
    scoreValuationDiscipline(stock),
    scoreCatalystTiming(stock, options),
    scorePortfolioFit(stock, options.portfolio || {})
  ];
  const factors = scorers.map((factor) => {
    const weight = weights[factor.key] || 0;
    return {
      ...factor,
      weight,
      weightedPoints: Number((factor.score * weight).toFixed(2))
    };
  });
  const rawScore = factors.reduce((sum, factor) => sum + factor.weightedPoints, 0);

  return {
    ticker: textFrom(stock, ["ticker", "symbol"]),
    company: textFrom(stock, ["company", "name"]),
    horizon,
    score: clampScore(rawScore),
    rawScore: Number(rawScore.toFixed(2)),
    factors,
    topDrivers: getTopDrivers(factors, options.driverLimit)
  };
}

export function getTopDrivers(breakdownOrFactors, limit = 3) {
  const factors = Array.isArray(breakdownOrFactors)
    ? breakdownOrFactors
    : breakdownOrFactors?.factors || [];

  return factors
    .filter((factor) => factor.weightedPoints >= DRIVER_MIN_CONTRIBUTION)
    .sort((a, b) => b.weightedPoints - a.weightedPoints || b.score - a.score)
    .slice(0, limit)
    .map((factor) => ({
      key: factor.key,
      label: factor.label,
      score: factor.score,
      weightedPoints: factor.weightedPoints,
      driver: factor.driver
    }));
}

export function scoreStock(stock = {}, options = {}) {
  return getScoreBreakdown(stock, options).score;
}

export function scoreUniverse(stocks = [], options = {}) {
  return stocks.map((stock) => {
    const breakdown = getScoreBreakdown(stock, options);
    return {
      ...stock,
      score: breakdown.score,
      scoreBreakdown: breakdown,
      topDrivers: breakdown.topDrivers
    };
  });
}

export function rankStocks(stocks = [], options = {}) {
  const direction = options.ascending ? 1 : -1;
  return scoreUniverse(stocks, options).sort((a, b) => {
    const scoreDelta = Number(a.score || 0) - Number(b.score || 0);
    if (scoreDelta !== 0) return direction * scoreDelta;
    return String(a.ticker || "").localeCompare(String(b.ticker || ""));
  });
}

export function buildInstitutionalQuantLens(stock = {}, options = {}) {
  const weights = normalizeWeights(options.weights || INSTITUTIONAL_QUANT_WEIGHTS);
  const securityKind = institutionalSecurityKind(stock);
  const baseFactors = [
    scoreInstitutionalQuality(stock),
    scoreInstitutionalMomentum(stock),
    scoreInstitutionalRevisions(stock, options),
    scoreInstitutionalValuation(stock),
    scoreInstitutionalRiskControl(stock),
    scoreInstitutionalLiquidity(stock),
    scoreInstitutionalPortfolioFit(stock, options.portfolio || {}),
    scoreInstitutionalDataQuality(stock, options)
  ];
  const factors = [
    ...baseFactors,
    scoreInstitutionalFactorValidation(stock, baseFactors, options)
  ].map((factor) => {
    const weight = weights[factor.key] || 0;
    return {
      ...factor,
      weight,
      weightedPoints: Number((factor.score * weight).toFixed(2))
    };
  });
  const rawScore = factors.reduce((sum, factor) => sum + factor.weightedPoints, 0);
  const rawCompositeScore = clampScore(rawScore);
  const dataQualityFactor = factors.find((factor) => factor.key === "dataQuality");
  const missingData = unique(factors.flatMap((factor) => factor.missingData || []));
  const evidenceCap = institutionalEvidenceCap({ stock, factors, missingData, dataQualityScore: dataQualityFactor?.score || 0 });
  const averageCoverageScore = average(factors.map((factor) => factor.coverageScore));
  const stalenessPenalty = institutionalStalenessPenalty(stock);
  const dataCoverageScore = clampScore((dataQualityFactor?.score || 0) * 0.42 + averageCoverageScore * 0.46 + Math.max(0, 100 - missingData.length * 5) * 0.12 - stalenessPenalty);
  const confidenceScore = clampScore((dataQualityFactor?.score || 0) * 0.42 + dataCoverageScore * 0.38 + Math.max(0, 100 - missingData.length * 6) * 0.2 - stalenessPenalty);
  const compositeScore = clampScore(Math.min(rawCompositeScore, evidenceCap.cap));
  const dataSufficiencyWarnings = institutionalDataSufficiencyWarnings({
    factors,
    dataCoverageScore,
    missingData,
    stalenessPenalty,
    securityKind
  });
  const topStrengths = factors
    .filter((factor) => factor.score >= 72 && !(factor.missingData || []).length)
    .sort((a, b) => b.weightedPoints - a.weightedPoints || b.score - a.score)
    .slice(0, 4)
    .map((factor) => `${factor.label}: ${factor.driver}`);
  const topWeaknesses = factors
    .filter((factor) => factor.score < 58 || factor.missingData?.length)
    .sort((a, b) => a.score - b.score || b.weightedPoints - a.weightedPoints)
    .slice(0, 4)
    .map((factor) => factor.score < 58
      ? `${factor.label}: ${factor.driver}`
      : `${factor.label}: missing ${factor.missingData.slice(0, 2).join(", ")}`
    );
  const academicFactorModel = buildAcademicFactorDiagnostics(stock, {
    ...options,
    institutionalFactors: factors,
    securityKind,
    missingData,
    dataCoverageScore,
    confidenceScore
  });

  return {
    ticker: textFrom(stock, ["ticker", "symbol"]),
    company: textFrom(stock, ["company", "name"]),
    securityKind,
    modelVersion: INSTITUTIONAL_QUANT_MODEL_VERSION,
    scoreKind: securityKind === "operating-company" ? "stock-quality-decision-support" : "fund-exposure-decision-support",
    scoreScale: "0-100",
    compositeScore,
    rawCompositeScore,
    evidenceCapScore: evidenceCap.cap,
    evidenceCapReasons: evidenceCap.reasons,
    scoreWasEvidenceCapped: evidenceCap.cap < SCORE_CAP_NONE && compositeScore < rawCompositeScore,
    ratingLabel: institutionalRatingLabel(compositeScore, dataQualityFactor?.score || 0, securityKind, stock),
    confidenceScore,
    dataCoverageScore,
    dataCoverageLabel: dataCoverageLabel(dataCoverageScore),
    factors,
    factorScores: Object.fromEntries(factors.map((factor) => [factor.key, factor.score])),
    factorWeights: weights,
    factorCoverage: Object.fromEntries(factors.map((factor) => [factor.key, factor.coverageStatus])),
    academicFactorModel,
    academicModelVersion: academicFactorModel.modelVersion,
    academicCompositeScore: academicFactorModel.compositeScore,
    academicFactorDiagnostics: academicFactorModel.factors,
    academicValidationWarnings: academicFactorModel.validationWarnings,
    academicResearchAnchors: academicFactorModel.researchAnchors,
    academicCaveat: academicFactorModel.caveat,
    dataSufficiencyWarnings,
    topStrengths,
    topWeaknesses,
    missingData,
    sourceFreshness: institutionalSourceFreshness(stock),
    explanation: buildInstitutionalExplanation({ stock, compositeScore, rawCompositeScore, factors, missingData, evidenceCap }),
    modelGovernance: {
      modelVersion: INSTITUTIONAL_QUANT_MODEL_VERSION,
      academicModelVersion: academicFactorModel.modelVersion,
      scoreKind: securityKind === "operating-company" ? "stock-quality-decision-support" : "fund-exposure-decision-support",
      factorWeights: weights,
      academicFactorWeights: ACADEMIC_FACTOR_WEIGHTS,
      researchAnchors: academicFactorModel.researchAnchors,
      dataCoverageScore,
      evidenceCapScore: evidenceCap.cap,
      caveat: "Transparent weighted factor model. No hidden AI model, price target, return forecast, or brokerage execution."
    },
    caveat: "Decision-support factor score only. It is not a return forecast, price target, buy/sell command, or brokerage instruction."
  };
}

export function scoreInstitutionalQuality(stock = {}) {
  if (isFundLikeSecurity(stock)) {
    return institutionalFactor({
      key: "quality",
      label: "Business quality",
      score: 54,
      missingData: ["operating-company quality factors not applicable to fund/ETF"],
      details: { securityKind: "fund-or-etf" },
      driver: "fund and ETF quality should be reviewed through exposure, cost, liquidity, tracking, and risk rather than company fundamentals"
    });
  }
  const profitability = gradeToScore(textFrom(stock, ["profitabilityGrade", "profitability"], ""), 58);
  const growth = gradeToScore(textFrom(stock, ["growthGrade", "growth"], ""), 58);
  const directGrossProfitToAssets = ratioFrom(stock, ["grossProfitToAssets", "grossProfitsToAssets", "grossProfitability"], NaN);
  const computedGrossProfitToAssets = ratioFromPair(
    stock,
    ["grossProfit", "grossProfits", "grossProfitTTM"],
    ["totalAssets", "assets"]
  );
  const grossProfitToAssets = Number.isFinite(directGrossProfitToAssets)
    ? directGrossProfitToAssets
    : computedGrossProfitToAssets;
  const revenueGrowth = percentPointFrom(stock, ["revenueGrowth", "salesGrowth", "revGrowth"], NaN);
  const epsGrowth = percentPointFrom(stock, ["epsGrowth", "earningsGrowth"], NaN);
  const grossMargin = percentPointFrom(stock, ["grossMargin"], NaN);
  const fcfMargin = percentPointFrom(stock, ["freeCashFlowMargin", "fcfMargin"], NaN);
  const grossProfitabilityScore = Number.isFinite(grossProfitToAssets)
    ? boundedScore(42 + grossProfitToAssets * 120)
    : 58;
  const growthFundamentals = Number.isFinite(revenueGrowth) || Number.isFinite(epsGrowth)
    ? boundedScore(52 + Math.max(0, revenueGrowth || 0) * 0.65 + Math.max(0, epsGrowth || 0) * 0.28)
    : 58;
  const marginScore = Number.isFinite(grossMargin) || Number.isFinite(fcfMargin)
    ? boundedScore(42 + Math.max(0, grossMargin || 0) * 0.45 + Math.max(0, fcfMargin || 0) * 0.9)
    : 58;
  const score = profitability * 0.24 + growth * 0.18 + growthFundamentals * 0.2 + marginScore * 0.18 + grossProfitabilityScore * 0.2;
  const missingData = missingFields(stock, [
    ["profitabilityGrade", "profitability"],
    ["growthGrade", "growth"],
    ["revenueGrowth", "salesGrowth", "revGrowth"],
    ["grossMargin", "freeCashFlowMargin", "fcfMargin"]
  ], ["profitability grade", "growth grade", "growth fundamentals", "margin data"]);
  if (!Number.isFinite(grossProfitToAssets)) missingData.push("gross profits/assets");

  return institutionalFactor({
    key: "quality",
    label: "Business quality",
    score,
    missingData,
    details: { profitability: Math.round(profitability), growth: Math.round(growth), grossProfitToAssets: finiteOrNull(grossProfitToAssets), grossProfitabilityScore: Math.round(grossProfitabilityScore), revenueGrowth: finiteOrNull(revenueGrowth), epsGrowth: finiteOrNull(epsGrowth), grossMargin: finiteOrNull(grossMargin), freeCashFlowMargin: finiteOrNull(fcfMargin) },
    driver: score >= 76 ? "quality inputs show durable growth/profitability support" : score >= 58 ? "quality inputs are mixed or incomplete" : "quality profile needs stronger evidence"
  });
}

export function scoreInstitutionalMomentum(stock = {}) {
  const momentumGrade = gradeToScore(textFrom(stock, ["momentumGrade", "momentum"], ""), 56);
  const dailyChangePercent = percentDecimalFrom(stock, ["dailyChangePercent", "marketDataDailyChangePercent"], NaN);
  const relativeStrength = numberFrom(stock, ["relativeStrength", "relativeStrengthScore", "rsRating"], NaN);
  const history = historicalStats(stock.historicalPrices || stock.marketDataHistoricalPrices || []);
  const academicMomentum = academicMomentumProfile(stock.historicalPrices || stock.marketDataHistoricalPrices || []);
  const dailyScore = Number.isFinite(dailyChangePercent) ? boundedScore(50 + dailyChangePercent * 650) : 54;
  const rawTrendScore = academicMomentum.hasCanonicalMomentum
    ? boundedScore(50 + academicMomentum.skipPeriodReturnPct * 180)
    : history.hasHistory
    ? boundedScore(50 + history.returnPct * 130 + history.rangePosition * 22 - Math.abs(Math.min(0, history.maxDrawdownPct)) * 55)
    : 54;
  const trendReliability = academicMomentum.hasCanonicalMomentum ? academicMomentum.reliability : history.reliability;
  const trendScore = history.hasHistory || academicMomentum.hasCanonicalMomentum
    ? rawTrendScore * trendReliability + 54 * (1 - trendReliability)
    : 54;
  const rsScore = Number.isFinite(relativeStrength)
    ? relativeStrength <= 1 ? relativeStrength * 100 : relativeStrength
    : 54;
  const score = trendScore * 0.38 + momentumGrade * 0.3 + dailyScore * 0.17 + rsScore * 0.15;
  const missingData = [];
  if (!history.hasHistory) missingData.push("historical price series");
  else if (!academicMomentum.hasCanonicalMomentum) missingData.push("12-1 / skip-period momentum history");
  if (!Number.isFinite(dailyChangePercent)) missingData.push("current daily price change");
  if (!hasAny(stock, ["momentumGrade", "momentum"])) missingData.push("momentum grade");
  if (!Number.isFinite(relativeStrength)) missingData.push("relative strength series");

  return institutionalFactor({
    key: "momentum",
    label: "Price momentum",
    score,
    missingData,
    details: { momentumGrade: Math.round(momentumGrade), dailyChangePercent: finiteOrNull(dailyChangePercent), historicalReturnPct: history.hasHistory ? Number(history.returnPct.toFixed(4)) : null, skipPeriodReturnPct: academicMomentum.hasCanonicalMomentum ? Number(academicMomentum.skipPeriodReturnPct.toFixed(4)) : null, momentumLookback: academicMomentum.methodology, historicalPointCount: history.count, historyReliability: Number(trendReliability.toFixed(2)), rangePosition: history.hasHistory ? Number(history.rangePosition.toFixed(3)) : null },
    driver: score >= 76 ? "price action and available trend inputs are supportive" : score >= 58 ? "momentum is mixed or short-term only" : "momentum is weak or insufficiently confirmed"
  });
}

export function scoreInstitutionalRevisions(stock = {}, options = {}) {
  if (isFundLikeSecurity(stock)) {
    const ratingFreshness = freshnessScore(textFrom(stock, ["saUpdatedAt", "ratingDate", "importedAt"], ""), options.asOf || new Date());
    return institutionalFactor({
      key: "revisions",
      label: "Estimate revisions",
      score: ratingFreshness.hasDate ? Math.max(46, Math.min(62, ratingFreshness.score - 18)) : 48,
      missingData: ["operating-company estimate revisions not applicable to fund/ETF"],
      details: { ratingFreshnessDays: ratingFreshness.days, securityKind: "fund-or-etf" },
      driver: "fund and ETF rows do not have operating-company estimate revisions; review underlying exposure instead"
    });
  }
  const revisions = gradeToScore(textFrom(stock, ["epsRevisionsGrade", "revisionsGrade", "revisions", "revisionScore"], ""), 55);
  const estimateChange = numberFrom(stock, ["estimateChange", "epsEstimateChange"], NaN);
  const ratingChanges = Number(String(textFrom(stock, ["ratingChanges"], "0")).replace(/[^\d.-]/g, ""));
  const ratingFreshness = freshnessScore(textFrom(stock, ["saUpdatedAt", "ratingDate", "importedAt"], ""), options.asOf || new Date());
  const estimateScore = Number.isFinite(estimateChange) ? boundedScore(50 + estimateChange * 4) : 55;
  const changeScore = Number.isFinite(ratingChanges) && ratingChanges !== 0 ? boundedScore(58 + ratingChanges * 8) : 55;
  const score = revisions * 0.52 + estimateScore * 0.2 + changeScore * 0.1 + ratingFreshness.score * 0.18;
  const missingData = [];
  if (!hasAny(stock, ["epsRevisionsGrade", "revisionsGrade", "revisions", "revisionScore"])) missingData.push("EPS revisions grade");
  if (!Number.isFinite(estimateChange)) missingData.push("estimate-change magnitude");
  if (!ratingFreshness.hasDate) missingData.push("rating freshness date");

  return institutionalFactor({
    key: "revisions",
    label: "Estimate revisions",
    score,
    missingData,
    details: { revisions: Math.round(revisions), estimateChange: finiteOrNull(estimateChange), ratingFreshnessDays: ratingFreshness.days },
    driver: score >= 76 ? "revision and freshness inputs are supportive" : score >= 58 ? "revision support is present but not decisive" : "revision support is weak, stale, or missing"
  });
}

export function scoreInstitutionalValuation(stock = {}) {
  if (isFundLikeSecurity(stock)) {
    return institutionalFactor({
      key: "valuation",
      label: "Valuation discipline",
      score: 52,
      missingData: ["operating-company valuation multiples not applicable to fund/ETF"],
      details: { securityKind: "fund-or-etf" },
      driver: "fund and ETF valuation should be reviewed through underlying holdings, expense, premium/discount, and exposure fit"
    });
  }
  const valuationGrade = gradeToScore(textFrom(stock, ["valuationGrade", "valueGrade", "value"], ""), 55);
  const forwardPe = numberFrom(stock, ["forwardPe", "fwdPe", "pe"], NaN);
  const priceToSales = numberFrom(stock, ["priceToSales", "psRatio"], NaN);
  const revenueGrowth = Math.max(percentPointFrom(stock, ["revenueGrowth", "salesGrowth", "revGrowth"], 0), 1);
  const epsGrowth = Math.max(percentPointFrom(stock, ["epsGrowth", "earningsGrowth"], 0), 1);
  const peScore = Number.isFinite(forwardPe) ? boundedScore(110 - Math.max(0, forwardPe - 16) * 1.6) : 55;
  const psScore = Number.isFinite(priceToSales) ? boundedScore(96 - Math.max(0, priceToSales - 5) * 4.8) : 55;
  const growthAdjusted = Number.isFinite(forwardPe)
    ? boundedScore(55 + Math.min(35, (revenueGrowth + epsGrowth) * 0.28) - Math.max(0, forwardPe / Math.max(epsGrowth, 8) - 1.2) * 22)
    : 55;
  const score = valuationGrade * 0.42 + peScore * 0.24 + growthAdjusted * 0.22 + psScore * 0.12;
  const missingData = missingFields(stock, [
    ["valuationGrade", "valueGrade", "value"],
    ["forwardPe", "fwdPe", "pe"],
    ["priceToSales", "psRatio"]
  ], ["valuation grade", "forward P/E", "price/sales"]);

  return institutionalFactor({
    key: "valuation",
    label: "Valuation discipline",
    score,
    missingData,
    details: { valuationGrade: Math.round(valuationGrade), forwardPe: finiteOrNull(forwardPe), priceToSales: finiteOrNull(priceToSales), growthAdjusted: Math.round(growthAdjusted) },
    driver: score >= 72 ? "valuation is reasonable relative to available growth inputs" : score >= 55 ? "valuation needs execution support" : "valuation looks demanding or poorly evidenced"
  });
}

export function scoreInstitutionalRiskControl(stock = {}) {
  const weight = ratioFrom(stock, ["portfolioWeight"], 0);
  const beta = numberFrom(stock, ["beta"], NaN);
  const riskText = textFrom(stock, ["riskLevel"], "");
  const history = historicalStats(stock.historicalPrices || stock.marketDataHistoricalPrices || []);
  const concentrationPenalty = Math.max(0, weight - 0.1) * 220;
  const leveragePenalty = stock.isLeveragedEtf || Number(stock.leveragedMultiple || 0) > 1 ? 22 : 0;
  const riskTextPenalty = /very high/i.test(riskText) ? 18 : /high/i.test(riskText) ? 10 : /medium/i.test(riskText) ? 4 : 0;
  const betaPenalty = Number.isFinite(beta) ? Math.max(0, beta - 1.2) * 16 : 0;
  const drawdownPenalty = history.hasHistory ? Math.abs(Math.min(0, history.maxDrawdownPct)) * 75 * history.reliability : 0;
  const score = 82 - concentrationPenalty - leveragePenalty - riskTextPenalty - betaPenalty - drawdownPenalty;
  const missingData = [];
  if (!Number.isFinite(beta)) missingData.push("beta");
  if (!history.hasHistory) missingData.push("drawdown/volatility history");
  else if (history.count < ROBUST_HISTORY_POINTS) missingData.push("longer drawdown/volatility history");
  if (!riskText) missingData.push("risk level");

  return institutionalFactor({
    key: "riskControl",
    label: "Risk control",
    score,
    missingData,
    details: { portfolioWeight: Number(weight.toFixed(4)), beta: finiteOrNull(beta), maxDrawdownPct: history.hasHistory ? Number(history.maxDrawdownPct.toFixed(4)) : null, historicalPointCount: history.count, historyReliability: Number(history.reliability.toFixed(2)), concentrationPenalty: Number(concentrationPenalty.toFixed(1)), leveragePenalty },
    driver: score >= 76 ? "risk and sizing are manageable in the current portfolio context" : score >= 58 ? "risk is acceptable but needs monitoring" : "risk, leverage, concentration, or drawdown need review"
  });
}

export function scoreInstitutionalLiquidity(stock = {}) {
  const price = numberFrom(stock, ["price", "lastPrice", "currentPrice", "marketDataPrice"], NaN);
  const volume = numberFrom(stock, ["volume", "marketDataVolume"], NaN);
  const averageVolume = numberFrom(stock, ["averageVolume", "marketDataAverageVolume"], NaN);
  const marketCap = numberFrom(stock, ["marketCap", "marketDataMarketCap"], NaN);
  const dollarVolume = Number.isFinite(price) ? price * (Number.isFinite(averageVolume) ? averageVolume : volume) : NaN;
  const dollarVolumeScore = liquidityDollarVolumeScore(dollarVolume);
  const marketCapScore = liquidityMarketCapScore(marketCap);
  const score = dollarVolumeScore * 0.58 + marketCapScore * 0.42;
  const missingData = [];
  if (!Number.isFinite(marketCap)) missingData.push("market cap");
  if (!Number.isFinite(dollarVolume)) missingData.push("dollar volume");

  return institutionalFactor({
    key: "liquidity",
    label: "Liquidity / capacity",
    score,
    missingData,
    details: { marketCap: finiteOrNull(marketCap), volume: finiteOrNull(volume), averageVolume: finiteOrNull(averageVolume), dollarVolume: finiteOrNull(dollarVolume) },
    driver: score >= 78 ? "liquidity and market-cap context support efficient review" : score >= 58 ? "liquidity looks usable but not fully verified" : "liquidity/capacity data is thin or potentially constrained"
  });
}

export function scoreInstitutionalPortfolioFit(stock = {}, portfolio = {}) {
  const fit = scorePortfolioFit(stock, portfolio);
  return institutionalFactor({
    key: "portfolioFit",
    label: "Portfolio fit",
    score: fit.score,
    missingData: Number(stock?.positionValue || stock?.marketValue || 0) || Number(portfolio?.totalValue || 0) ? [] : ["portfolio value/position size"],
    details: fit.details,
    driver: fit.driver
  });
}

export function scoreInstitutionalDataQuality(stock = {}, options = {}) {
  const history = historicalStats(stock.historicalPrices || stock.marketDataHistoricalPrices || []);
  const hasQuote = hasAny(stock, ["marketDataPrice", "price", "currentPrice", "lastPrice"]);
  const hasProfile = hasAny(stock, ["sector", "industry", "marketCap", "marketDataMarketCap"]);
  const saFieldCount = ["quant", "quantScore", "valuationGrade", "valueGrade", "growthGrade", "profitabilityGrade", "momentumGrade", "epsRevisionsGrade", "revisionsGrade"].filter((key) => hasAny(stock, [key])).length;
  const liveQuote = Boolean(stock.liveProviderCalls || stock.marketDataMode === "live" || stock.dataFreshness === "live" || stock.cacheStatus === "live");
  const stalePenalty = /stale/i.test(`${stock.marketDataStatus || ""} ${stock.dataFreshness || ""} ${stock.cacheStatus || ""}`) ? 16 : 0;
  const providerCoverageScore = numberFrom(stock, ["marketDataCoverageScore"], NaN);
  const providerCoverageAdjustment = Number.isFinite(providerCoverageScore) ? (providerCoverageScore - 70) * 0.16 : 0;
  const providerMissingQuotePenalty = stock.marketDataMissingQuote ? 10 : 0;
  const providerMissingHistoryPenalty = stock.marketDataMissingHistory ? 5 : 0;
  const providerMissingFundamentalPenalty = stock.marketDataMissingProfileOrMetrics ? 5 : 0;
  const historyCoverage = history.hasHistory ? 14 * history.reliability : 0;
  const score = 20 + (hasQuote ? 16 : 0) + (liveQuote ? 10 : 0) + (hasProfile ? 12 : 0) + historyCoverage + Math.min(18, saFieldCount * 3) + (stock.thesisStatus ? 6 : 0) + (stock.portfolioWeight !== undefined || options.portfolio?.totalValue ? 4 : 0) + providerCoverageAdjustment - stalePenalty - providerMissingQuotePenalty - providerMissingHistoryPenalty - providerMissingFundamentalPenalty;
  const missingData = [];
  if (!hasQuote) missingData.push("quote/price input");
  if (!hasProfile) missingData.push("company profile/sector");
  if (!history.hasHistory) missingData.push("historical price series");
  else if (history.count < ROBUST_HISTORY_POINTS) missingData.push("robust historical price series");
  if (saFieldCount < 4) missingData.push("complete factor ratings");
  if (!stock.thesisStatus) missingData.push("thesis status");
  if (stock.marketDataMissingQuote) missingData.push("provider quote/current price");
  if (stock.marketDataMissingHistory) missingData.push("provider historical candles");
  if (stock.marketDataMissingProfileOrMetrics) missingData.push("provider profile/fundamental fields");
  if (Array.isArray(stock.marketDataCoverageWarnings)) missingData.push(...stock.marketDataCoverageWarnings.slice(0, 3));

  return institutionalFactor({
    key: "dataQuality",
    label: "Data quality",
    score,
    missingData,
    details: { hasQuote, liveQuote, hasProfile, historicalPoints: history.count, historyReliability: Number(history.reliability.toFixed(2)), seekingAlphaFieldCount: saFieldCount, providerCoverageScore: finiteOrNull(providerCoverageScore), stalePenalty, providerCoverageAdjustment: Number(providerCoverageAdjustment.toFixed(1)) },
    driver: score >= 78 ? "source coverage is strong enough for higher-confidence review" : score >= 58 ? "source coverage is usable with gaps" : "source coverage is too thin for high conviction"
  });
}

export function scoreInstitutionalFactorValidation(stock = {}, baseFactors = [], options = {}) {
  const history = historicalStats(stock.historicalPrices || stock.marketDataHistoricalPrices || []);
  const academicMomentum = academicMomentumProfile(stock.historicalPrices || stock.marketDataHistoricalPrices || []);
  const missingData = unique(baseFactors.flatMap((factor) => factor.missingData || []));
  const coveredFactors = baseFactors.filter((factor) => factor.coverageStatus === "covered").length;
  const partialFactors = baseFactors.filter((factor) => factor.coverageStatus === "partial").length;
  const factorCoverage = baseFactors.length ? (coveredFactors + partialFactors * 0.55) / baseFactors.length : 0;
  const stalePenalty = institutionalStalenessPenalty(stock);
  const samplePenalty = stock.isMock || stock.marketDataIsMock || /mock|sample/i.test(`${stock.marketDataStatus || ""} ${stock.marketDataMode || ""}`) ? 8 : 0;
  const historyScore = academicMomentum.hasCanonicalMomentum
    ? 86
    : history.count >= ROBUST_HISTORY_POINTS
      ? 68
      : history.hasHistory
        ? 54
        : 36;
  const score = boundedScore(28 + factorCoverage * 42 + historyScore * 0.22 + Math.max(0, 100 - missingData.length * 5) * 0.08 - stalePenalty - samplePenalty);
  const warnings = [];
  if (!academicMomentum.hasCanonicalMomentum) warnings.push("Momentum is using short-history fallback instead of a 12-1 / skip-period formation window.");
  if (missingData.length >= 6) warnings.push("Too many missing inputs for high-conviction cross-sectional ranking.");
  if (stalePenalty >= 16) warnings.push("Stale or errored market data weakens validation confidence.");
  if (samplePenalty) warnings.push("Sample/mock inputs lower validation confidence.");
  warnings.push("Harvey-Liu-Zhu multiple-testing caution: do not promote new factors without out-of-sample evidence.");

  return institutionalFactor({
    key: "factorValidation",
    label: "Factor validation",
    score,
    missingData: warnings,
    details: {
      coveredFactors,
      partialFactors,
      missingInputCount: missingData.length,
      historicalPointCount: history.count,
      hasSkipPeriodMomentum: academicMomentum.hasCanonicalMomentum,
      stalePenalty,
      samplePenalty
    },
    driver: score >= 76
      ? "factor coverage and history are strong enough for a higher-confidence local rank"
      : score >= 58
        ? "factor coverage is usable but needs out-of-sample discipline"
        : "factor coverage is thin; treat ranking as a research checklist"
  });
}

export function buildAcademicFactorDiagnostics(stock = {}, options = {}) {
  const factors = options.institutionalFactors || [];
  const byKey = new Map(factors.map((factor) => [factor.key, factor]));
  const momentum = byKey.get("momentum") || scoreInstitutionalMomentum(stock);
  const quality = byKey.get("quality") || scoreInstitutionalQuality(stock);
  const valuation = byKey.get("valuation") || scoreInstitutionalValuation(stock);
  const risk = byKey.get("riskControl") || scoreInstitutionalRiskControl(stock);
  const validation = byKey.get("factorValidation") || scoreInstitutionalFactorValidation(stock, factors, options);
  const dataQuality = byKey.get("dataQuality") || scoreInstitutionalDataQuality(stock, options);
  const academicMomentum = academicMomentumProfile(stock.historicalPrices || stock.marketDataHistoricalPrices || []);
  const valueMomentumBalance = Math.min(momentum.score, valuation.score) + Math.abs(momentum.score - valuation.score) * 0.18;
  const ensembleReadinessScore = boundedScore(
    (options.dataCoverageScore ?? dataQuality.score) * 0.34 +
    validation.score * 0.3 +
    Math.min(100, factors.filter((factor) => factor.coverageStatus !== "thin").length * 13) * 0.2 +
    (academicMomentum.hasCanonicalMomentum ? 16 : 4)
  );
  const academicFactors = [
    academicDiagnosticFactor({
      key: "momentum",
      label: "Momentum discipline",
      paper: "Jegadeesh & Titman",
      score: momentum.score,
      driver: academicMomentum.hasCanonicalMomentum
        ? `Uses skip-period momentum formation (${academicMomentum.methodology}).`
        : "Uses shorter available history until a 12-1 / skip-period window is available.",
      missingData: academicMomentum.hasCanonicalMomentum ? [] : ["12-1 / skip-period momentum history"],
      methodology: "Prefer 3/6/12-month relative strength with recent-period skip logic."
    }),
    academicDiagnosticFactor({
      key: "profitabilityQuality",
      label: "Profitability / quality",
      paper: "Novy-Marx",
      score: quality.score,
      driver: hasGrossProfitabilityInput(stock)
        ? "Gross profits/assets is included in the quality score."
        : "Quality uses profitability grades and margins until gross profits/assets is available.",
      missingData: quality.missingData?.filter((item) => /gross|profit|margin|growth/i.test(item)) || [],
      methodology: "Prefer gross profits/assets, then margins, ROIC-like proxies, and earnings quality inputs."
    }),
    academicDiagnosticFactor({
      key: "valueDiscipline",
      label: "Value + momentum balance",
      paper: "Asness / Moskowitz / Pedersen",
      score: valueMomentumBalance,
      driver: valueMomentumBalance >= 72
        ? "Value and momentum are both supportive or complementary."
        : "Value and momentum are imbalanced or weak; inspect the disagreement.",
      missingData: unique([...(valuation.missingData || []), ...(momentum.missingData || [])]).slice(0, 4),
      methodology: "Review value and momentum together instead of letting one factor dominate."
    }),
    academicDiagnosticFactor({
      key: "riskControl",
      label: "Risk / beta controls",
      paper: "Risk-control layer",
      score: risk.score,
      driver: risk.driver,
      missingData: risk.missingData || [],
      methodology: "Penalize leverage, beta, drawdown, concentration, and weak liquidity before ranking."
    }),
    academicDiagnosticFactor({
      key: "validationDiscipline",
      label: "Validation discipline",
      paper: "Harvey / Liu / Zhu",
      score: validation.score,
      driver: validation.driver,
      missingData: validation.missingData || [],
      methodology: "Apply data sufficiency, evidence caps, stale-data warnings, and multiple-testing caution."
    }),
    academicDiagnosticFactor({
      key: "ensembleReadiness",
      label: "ML ensemble readiness",
      paper: "Gu / Kelly / Xiu",
      score: ensembleReadinessScore,
      driver: ensembleReadinessScore >= 72
        ? "Inputs are broad enough for future ensemble comparison."
        : "Keep this as a transparent scorecard until history and coverage improve.",
      missingData: ensembleReadinessScore >= 72 ? [] : ["larger training panel", "walk-forward test history", "feature interaction audit"],
      methodology: "Future ML layer should compare simple regularized/tree ensembles out of sample before promotion."
    })
  ];
  const weights = normalizeWeights(ACADEMIC_FACTOR_WEIGHTS);
  const weightedFactors = academicFactors.map((factor) => ({
    ...factor,
    weight: weights[factor.key] || 0,
    weightedPoints: Number((factor.score * (weights[factor.key] || 0)).toFixed(2))
  }));
  const rawScore = weightedFactors.reduce((sum, factor) => sum + factor.weightedPoints, 0);
  const validationWarnings = unique(weightedFactors.flatMap((factor) => factor.missingData || []).filter((item) => /validation|testing|history|stale|mock|sample|out-of-sample|12-1|skip/i.test(item))).slice(0, 8);

  return {
    modelVersion: ACADEMIC_FACTOR_MODEL_VERSION,
    compositeScore: clampScore(rawScore),
    scoreScale: "0-100",
    factors: weightedFactors,
    factorWeights: weights,
    validationWarnings,
    researchAnchors: [
      "Gu, Kelly & Xiu: ensemble candidates need out-of-sample discipline and interaction checks.",
      "Jegadeesh & Titman: momentum should prefer 3/6/12-month relative strength with a skipped recent period.",
      "Asness, Moskowitz & Pedersen: value and momentum should be reviewed together because they diversify each other.",
      "Novy-Marx: profitability belongs beside value, ideally gross profits/assets.",
      "Harvey, Liu & Zhu: factor results need multiple-testing skepticism before promotion."
    ],
    caveat: "Academic factor diagnostics are decision support only; they are not return predictions, price targets, or trade instructions."
  };
}

function institutionalFactor({ key, label, score, details = {}, driver = "", missingData = [] }) {
  const cleanMissing = unique(missingData.filter(Boolean));
  const coverageScore = factorCoverageScore(cleanMissing);
  return {
    key,
    label,
    score: clampScore(score),
    details,
    driver,
    missingData: cleanMissing,
    coverageStatus: factorCoverageStatus(cleanMissing),
    coverageScore
  };
}

function institutionalEvidenceCap({ stock = {}, factors = [], missingData = [], dataQualityScore = 0 } = {}) {
  const reasons = [];
  let cap = SCORE_CAP_NONE;
  const factorByKey = new Map(factors.map((factor) => [factor.key, factor]));
  const history = historicalStats(stock.historicalPrices || stock.marketDataHistoricalPrices || []);
  const staleInput = stock.dataFreshness === "stale" || stock.cacheStatus === "stale" || /stale/i.test(stock.marketDataStatus || "");
  const hasQuote = hasAny(stock, ["marketDataPrice", "price", "currentPrice", "lastPrice"]);
  const hasProfile = hasAny(stock, ["sector", "industry", "marketCap", "marketDataMarketCap"]);
  const factorRatingCount = [
    "quant",
    "quantScore",
    "valuationGrade",
    "valueGrade",
    "growthGrade",
    "profitabilityGrade",
    "momentumGrade",
    "epsRevisionsGrade",
    "revisionsGrade"
  ].filter((key) => hasAny(stock, [key])).length;

  if (dataQualityScore < 45) {
    cap = Math.min(cap, 58);
    reasons.push("data coverage is too thin for a high-conviction quality score");
  } else if (dataQualityScore < 58) {
    cap = Math.min(cap, 68);
    reasons.push("source coverage has meaningful gaps");
  }
  if (!hasQuote) {
    cap = Math.min(cap, 72);
    reasons.push("missing current quote/price input");
  }
  if (!history.hasHistory) {
    cap = Math.min(cap, 78);
    reasons.push("missing historical price series");
  } else if (history.count < ROBUST_HISTORY_POINTS) {
    cap = Math.min(cap, 84);
    reasons.push("historical price series is too short for robust trend/risk scoring");
  }
  if (factorRatingCount < 3) {
    cap = Math.min(cap, 76);
    reasons.push("missing enough independent factor ratings");
  }
  if (!hasProfile) {
    cap = Math.min(cap, 82);
    reasons.push("missing company profile, sector, or market-cap context");
  }
  if (staleInput) {
    cap = Math.min(cap, 72);
    reasons.push("market data is stale");
  }
  if ((factorByKey.get("liquidity")?.missingData || []).length >= 2) {
    cap = Math.min(cap, 82);
    reasons.push("liquidity/capacity is not verified");
  }
  if (missingData.length >= 10) {
    cap = Math.min(cap, 64);
    reasons.push("too many missing model inputs");
  }

  return { cap, reasons: unique(reasons) };
}

function hasAny(stock = {}, keys = []) {
  return keys.some((key) => stock?.[key] !== undefined && stock?.[key] !== null && stock?.[key] !== "");
}

function missingFields(stock, groups = [], labels = []) {
  return groups
    .map((keys, index) => hasAny(stock, keys) ? null : labels[index])
    .filter(Boolean);
}

function hasGrossProfitabilityInput(stock = {}) {
  return hasAny(stock, ["grossProfitToAssets", "grossProfitsToAssets", "grossProfitability"]) ||
    (
      hasAny(stock, ["grossProfit", "grossProfits", "grossProfitTTM"]) &&
      hasAny(stock, ["totalAssets", "assets"])
    );
}

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function average(values = []) {
  const numeric = values.map(Number).filter(Number.isFinite);
  if (!numeric.length) return 0;
  return numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
}

function historicalStats(values = []) {
  const points = (Array.isArray(values) ? values : [])
    .map((point) => {
      if (typeof point === "number") return { close: Number(point), dateSort: null };
      return {
        close: Number(point?.close ?? point?.price ?? point?.adjustedClose ?? point?.adjClose ?? point?.value),
        dateSort: point?.date || point?.timestamp || point?.asOf || null
      };
    })
    .filter((point) => Number.isFinite(point.close) && point.close > 0)
    .sort((a, b) => {
      if (!a.dateSort || !b.dateSort) return 0;
      return new Date(a.dateSort).getTime() - new Date(b.dateSort).getTime();
    })
    .map((point) => point.close);
  const reliability = Math.min(1, points.length / ROBUST_HISTORY_POINTS);
  if (points.length < 2) {
    return { hasHistory: false, count: points.length, reliability, returnPct: 0, rangePosition: 0.5, maxDrawdownPct: 0 };
  }
  const first = points[0];
  const last = points[points.length - 1];
  const min = Math.min(...points);
  const max = Math.max(...points);
  let peak = points[0];
  let maxDrawdownPct = 0;
  points.forEach((point) => {
    peak = Math.max(peak, point);
    maxDrawdownPct = Math.min(maxDrawdownPct, (point - peak) / peak);
  });
  return {
    hasHistory: true,
    count: points.length,
    reliability,
    returnPct: (last - first) / first,
    rangePosition: max === min ? 0.5 : (last - min) / (max - min),
    maxDrawdownPct
  };
}

function academicMomentumProfile(values = []) {
  const points = normalizedPricePoints(values);
  if (points.length < 2) {
    return {
      hasCanonicalMomentum: false,
      count: points.length,
      reliability: 0,
      skipPeriodReturnPct: 0,
      fullPeriodReturnPct: 0,
      methodology: "insufficient history"
    };
  }
  const datedPoints = points.filter((point) => Number.isFinite(point.dateTime));
  const latestIndex = points.length - 1;
  const first = points[0].close;
  const last = points[latestIndex].close;
  const fullPeriodReturnPct = first > 0 ? (last - first) / first : 0;

  if (datedPoints.length === points.length) {
    const latest = points[latestIndex];
    const skipCutoff = latest.dateTime - MOMENTUM_SKIP_DAYS * DAY_MS;
    const formationStartCutoff = skipCutoff - MOMENTUM_FORMATION_DAYS * DAY_MS;
    const skipIndex = findLastIndex(points, (point) => point.dateTime <= skipCutoff);
    const lookbackIndex = points.findIndex((point, index) =>
      index <= skipIndex && point.dateTime >= formationStartCutoff
    );
    if (skipIndex > 0 && lookbackIndex >= 0 && lookbackIndex < skipIndex) {
      const formationStart = points[lookbackIndex];
      const formationEnd = points[skipIndex];
      const formationSpanDays = (formationEnd.dateTime - formationStart.dateTime) / DAY_MS;
      const skippedRecentDays = (latest.dateTime - formationEnd.dateTime) / DAY_MS;
      const formationPoints = skipIndex - lookbackIndex + 1;
      const hasCanonicalMomentum =
        formationSpanDays >= MIN_CANONICAL_MOMENTUM_SPAN_DAYS &&
        skippedRecentDays >= 20 &&
        formationPoints >= MIN_CANONICAL_MOMENTUM_POINTS;
      const skipPeriodReturnPct = formationStart.close > 0
        ? (formationEnd.close - formationStart.close) / formationStart.close
        : 0;
      const skippedRecentReturnPct = formationEnd.close > 0
        ? (latest.close - formationEnd.close) / formationEnd.close
        : 0;

      return {
        hasCanonicalMomentum,
        count: points.length,
        reliability: hasCanonicalMomentum
          ? Math.min(1, formationSpanDays / MIN_CANONICAL_MOMENTUM_SPAN_DAYS, formationPoints / ROBUST_MOMENTUM_POINTS)
          : Math.min(1, points.length / ROBUST_MOMENTUM_POINTS),
        skipPeriodReturnPct,
        skippedRecentReturnPct,
        fullPeriodReturnPct,
        methodology: hasCanonicalMomentum
          ? `${formationPoints}-point dated formation ending at least ${MOMENTUM_SKIP_DAYS} days before latest`
          : `${points.length}-point dated short-history fallback`
      };
    }
  }
  const skipIndex = Math.max(0, latestIndex - 1);
  const lookbackIndex = Math.max(0, skipIndex - 11);
  const formationStart = points[lookbackIndex].close;
  const formationEnd = points[skipIndex].close;
  const skipPeriodReturnPct = formationStart > 0 ? (formationEnd - formationStart) / formationStart : 0;

  return {
    hasCanonicalMomentum: false,
    count: points.length,
    reliability: Math.min(1, points.length / ROBUST_MOMENTUM_POINTS),
    skipPeriodReturnPct,
    skippedRecentReturnPct: formationEnd > 0 ? (last - formationEnd) / formationEnd : 0,
    fullPeriodReturnPct,
    methodology: `${points.length}-point short-history fallback`
  };
}

function normalizedPricePoints(values = []) {
  return (Array.isArray(values) ? values : [])
    .map((point) => {
      if (typeof point === "number") return { close: Number(point), dateSort: null, dateTime: null };
      const dateSort = point?.date || point?.timestamp || point?.asOf || null;
      const dateTime = parsePointDateTime(dateSort);
      return {
        close: Number(point?.close ?? point?.price ?? point?.adjustedClose ?? point?.adjClose ?? point?.value),
        dateSort,
        dateTime
      };
    })
    .filter((point) => Number.isFinite(point.close) && point.close > 0)
    .sort((a, b) => {
      if (!Number.isFinite(a.dateTime) || !Number.isFinite(b.dateTime)) return 0;
      return a.dateTime - b.dateTime;
    });
}

function parsePointDateTime(value) {
  if (!value) return null;
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }

  const text = String(value).trim();
  const dateOnly = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    if (month >= 1 && month <= 24 && day >= 1 && day <= 31) {
      const time = Date.UTC(year, month - 1, day);
      const parsed = new Date(time);
      const normalizedYear = year + Math.floor((month - 1) / 12);
      const normalizedMonth = (month - 1) % 12;
      if (
        parsed.getUTCFullYear() === normalizedYear &&
        parsed.getUTCMonth() === normalizedMonth &&
        parsed.getUTCDate() === day
      ) {
        return time;
      }
    }
    return null;
  }

  const time = new Date(text).getTime();
  return Number.isFinite(time) ? time : null;
}

function findLastIndex(values = [], predicate = () => false) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (predicate(values[index], index, values)) return index;
  }
  return -1;
}

function academicDiagnosticFactor({ key, label, paper, score, driver = "", missingData = [], methodology = "" }) {
  return {
    key,
    label,
    paper,
    score: clampScore(score),
    driver,
    missingData: unique(missingData),
    methodology
  };
}

function freshnessScore(value, asOf = new Date()) {
  if (!value) return { hasDate: false, score: 55, days: null };
  const date = value instanceof Date ? value : new Date(value);
  const now = asOf instanceof Date ? asOf : new Date(asOf);
  if (Number.isNaN(date.getTime()) || Number.isNaN(now.getTime())) return { hasDate: false, score: 55, days: null };
  const days = Math.max(0, Math.round((now.getTime() - date.getTime()) / DAY_MS));
  const score = days <= 7 ? 94 : days <= 30 ? 82 : days <= 60 ? 68 : days <= 120 ? 54 : 38;
  return { hasDate: true, score, days };
}

function liquidityDollarVolumeScore(value) {
  if (!Number.isFinite(value) || value <= 0) return 48;
  if (value >= 1_000_000_000) return 96;
  if (value >= 250_000_000) return 90;
  if (value >= 75_000_000) return 82;
  if (value >= 20_000_000) return 70;
  if (value >= 5_000_000) return 56;
  return 40;
}

function liquidityMarketCapScore(value) {
  if (!Number.isFinite(value) || value <= 0) return 50;
  if (value >= 200_000_000_000) return 96;
  if (value >= 50_000_000_000) return 88;
  if (value >= 10_000_000_000) return 76;
  if (value >= 2_000_000_000) return 62;
  return 46;
}

function institutionalRatingLabel(score, dataQualityScore, securityKind = "operating-company", stock = {}) {
  if (securityKind !== "operating-company") {
    if (dataQualityScore < 45) return "Fund/ETF needs evidence";
    if (stock.isLeveragedEtf || Number(stock.leveragedMultiple || 0) > 1) return "Leveraged exposure review";
    if (score >= 70) return "Fund/ETF setup review";
    return "Fund/ETF watchlist review";
  }
  if (dataQualityScore < 45) return "Needs evidence";
  if (score >= 82) return "High-quality setup";
  if (score >= 72) return "Constructive setup";
  if (score >= 60) return "Mixed setup";
  if (score >= 48) return "Watchlist only";
  return "Risk review";
}

function institutionalSourceFreshness(stock = {}) {
  if (stock.liveProviderCalls || stock.dataFreshness === "live" || stock.cacheStatus === "live") return "Live market data input";
  if (stock.dataFreshness === "cached" || stock.cacheStatus === "cached") return "Cached market data input";
  if (stock.dataFreshness === "stale" || stock.cacheStatus === "stale" || /stale/i.test(stock.marketDataStatus || "")) return "Stale market data input";
  if (stock.isMock || stock.marketDataIsMock || stock.marketDataMode === "mock") return "Sample market data input";
  return "Local/imported inputs";
}

function buildInstitutionalExplanation({ stock, compositeScore, rawCompositeScore, factors, missingData, evidenceCap }) {
  const ticker = textFrom(stock, ["ticker", "symbol"], "Ticker");
  const securityKind = institutionalSecurityKind(stock);
  const strongest = [...factors].sort((a, b) => b.weightedPoints - a.weightedPoints)[0];
  const weakest = [...factors].sort((a, b) => a.score - b.score)[0];
  const missing = missingData.slice(0, 3).join(", ");
  const lensName = securityKind === "operating-company" ? "institutional quant lens" : "institutional exposure lens";
  const capText = evidenceCap?.cap < SCORE_CAP_NONE && compositeScore < rawCompositeScore
    ? ` Raw score ${rawCompositeScore}/100 was capped at ${evidenceCap.cap}/100 because ${evidenceCap.reasons.slice(0, 2).join(" and ")}.`
    : "";
  return `${ticker}: ${lensName} scores ${compositeScore}/100. Strongest driver: ${strongest?.label || "n/a"} (${strongest?.score ?? "--"}/100). Weakest driver: ${weakest?.label || "n/a"} (${weakest?.score ?? "--"}/100).${missing ? ` Missing context: ${missing}.` : ""}${capText}`;
}

function percentDecimalFrom(stock = {}, keys = [], fallback = NaN) {
  for (const key of keys) {
    const raw = stock?.[key];
    if (raw === undefined || raw === null || raw === "") continue;
    const text = String(raw).trim();
    const numeric = Number(text.replace(/[$,%x]/gi, ""));
    if (!Number.isFinite(numeric)) continue;
    if (/%/.test(text)) return numeric / 100;
    return Math.abs(numeric) > 1 ? numeric / 100 : numeric;
  }
  return fallback;
}

function factorCoverageStatus(missingData = []) {
  if (!missingData.length) return "covered";
  if (missingData.length <= 2) return "partial";
  return "thin";
}

function factorCoverageScore(missingData = []) {
  if (!missingData.length) return 100;
  if (missingData.length <= 2) return 68;
  return 38;
}

function dataCoverageLabel(score) {
  if (score >= 84) return "Broad coverage";
  if (score >= 62) return "Partial coverage";
  return "Thin coverage";
}

function institutionalStalenessPenalty(stock = {}) {
  const sourceText = `${stock.marketDataStatus || ""} ${stock.dataFreshness || ""} ${stock.cacheStatus || ""} ${stock.sourceMode || ""}`.toLowerCase();
  if (/error|failed|invalid/.test(sourceText)) return 22;
  if (/stale/.test(sourceText)) return 16;
  if (/mock|sample/.test(sourceText) || stock.isMock || stock.marketDataIsMock) return 8;
  if (/cached/.test(sourceText)) return 4;
  return 0;
}

function institutionalDataSufficiencyWarnings({ factors = [], dataCoverageScore = 0, missingData = [], stalenessPenalty = 0, securityKind = "operating-company" } = {}) {
  const warnings = [];
  if (dataCoverageScore < 62) warnings.push("Data coverage is thin; treat the score as a research prompt.");
  else if (dataCoverageScore < 84) warnings.push("Some factor inputs are missing; confirm the weak spots before relying on the score.");
  if (stalenessPenalty >= 22) warnings.push("One or more provider inputs are in an error state.");
  else if (stalenessPenalty >= 16) warnings.push("One or more market-data inputs are stale.");
  else if (stalenessPenalty >= 8) warnings.push("Sample or mock market data lowers confidence.");
  else if (stalenessPenalty >= 4) warnings.push("Cached market data lowers price-sensitive confidence slightly.");
  if (missingData.some((item) => /historical|drawdown|volatility/i.test(item))) warnings.push("History coverage is limited; trend and risk-control factors are lower confidence.");
  const thinFactors = factors.filter((factor) => factor.coverageStatus === "thin").map((factor) => factor.label);
  if (thinFactors.length) warnings.push(`Thin factor coverage: ${thinFactors.slice(0, 3).join(", ")}.`);
  if (missingData.length >= 8) warnings.push("Many model inputs are missing, so confidence is capped.");
  if (securityKind !== "operating-company") warnings.push("Fund/ETF rows use exposure-review language rather than operating-company quality factors.");
  return unique(warnings);
}

function institutionalSecurityKind(stock = {}) {
  return isFundLikeSecurity(stock) ? "fund-or-etf" : "operating-company";
}

function isFundLikeSecurity(stock = {}) {
  const text = `${stock.assetClass || ""} ${stock.securityType || ""} ${stock.strategySleeve || ""} ${stock.name || ""} ${stock.company || ""} ${stock.ticker || stock.symbol || ""}`.toLowerCase();
  return Boolean(
    stock.isLeveragedEtf ||
    /(^|\s)(etf|fund|trust|index|proshares|direxion|vanguard|invesco|ishares|ultrapro|3x|2x)(\s|$)/i.test(text)
  );
}
