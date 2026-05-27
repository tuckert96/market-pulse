import test from "node:test";
import assert from "node:assert/strict";
import {
  ACADEMIC_FACTOR_MODEL_VERSION,
  buildInstitutionalQuantLens,
  INSTITUTIONAL_QUANT_MODEL_VERSION,
  INSTITUTIONAL_QUANT_WEIGHTS,
  buildAcademicFactorDiagnostics,
  scoreInstitutionalDataQuality,
  scoreInstitutionalFactorValidation,
  scoreInstitutionalLiquidity,
  scoreInstitutionalMomentum,
  scoreInstitutionalQuality,
  scoreInstitutionalRiskControl
} from "../src/scoringModel.js";

const strongStock = {
  ticker: "MU",
  name: "Micron Technology",
  quant: 4.7,
  profitabilityGrade: "A-",
  growthGrade: "A",
  valuationGrade: "B",
  momentumGrade: "A-",
  epsRevisionsGrade: "B+",
  revenueGrowth: 38,
  epsGrowth: 45,
  grossMargin: 48,
  freeCashFlowMargin: 17,
  grossProfitToAssets: 0.42,
  forwardPe: 18,
  priceToSales: 6,
  price: 130,
  marketDataPrice: 130,
  dailyChangePercent: 0.018,
  marketDataDailyChangePercent: 0.018,
  volume: 21_000_000,
  averageVolume: 19_000_000,
  marketCap: 145_000_000_000,
  marketDataMarketCap: 145_000_000_000,
  historicalPrices: Array.from({ length: 22 }, (_, index) => ({
    date: `2026-05-${String(index + 1).padStart(2, "0")}`,
    close: 104 + index * 1.2
  })),
  portfolioWeight: 0.08,
  marketValue: 40_000,
  positionValue: 40_000,
  thesisStatus: "Active",
  riskLevel: "Medium",
  saUpdatedAt: "2026-05-20T12:00:00-04:00",
  liveProviderCalls: true,
  dataFreshness: "live",
  cacheStatus: "live"
};

test("institutional quant lens produces bounded transparent factor output", () => {
  const result = buildInstitutionalQuantLens(strongStock, {
    asOf: "2026-05-24T12:00:00-04:00",
    portfolio: { totalValue: 500_000 }
  });

  assert.equal(result.modelVersion, INSTITUTIONAL_QUANT_MODEL_VERSION);
  assert.equal(result.scoreKind, "stock-quality-decision-support");
  assert.equal(result.scoreScale, "0-100");
  assert.equal(result.compositeScore >= 0 && result.compositeScore <= 100, true);
  assert.equal(result.factors.length, Object.keys(INSTITUTIONAL_QUANT_WEIGHTS).length);
  assert.ok(result.factors.every((factor) => factor.score >= 0 && factor.score <= 100));
  assert.ok(result.topStrengths.length >= 2);
  assert.match(result.explanation, /MU: institutional quant lens scores \d+\/100/);
  assert.equal(result.scoreWasEvidenceCapped, false);
  assert.equal(result.evidenceCapScore, 100);
  assert.equal(result.academicModelVersion, ACADEMIC_FACTOR_MODEL_VERSION);
  assert.equal(result.academicCompositeScore >= 0 && result.academicCompositeScore <= 100, true);
  assert.ok(result.academicFactorDiagnostics.some((factor) => factor.key === "ensembleReadiness"));
  assert.doesNotMatch(result.caveat, /buy now|sell now|place trade|enter now|exit now/i);
});

test("institutional quant lens separates good-stock quality from review-priority scoring", () => {
  const result = buildInstitutionalQuantLens(strongStock, {
    asOf: "2026-05-24T12:00:00-04:00",
    portfolio: { totalValue: 500_000 }
  });

  assert.ok(result.factorScores.quality >= 70);
  assert.ok(result.factorScores.momentum >= 70);
  assert.ok(result.factorScores.liquidity >= 80);
  assert.ok(result.factorScores.dataQuality >= 70);
  assert.ok(["High-quality setup", "Constructive setup", "Mixed setup"].includes(result.ratingLabel));
});

test("missing and stale data lowers confidence without fabricating precision", () => {
  const result = buildInstitutionalQuantLens({
    ticker: "THIN",
    portfolioWeight: 0.02,
    riskLevel: "Unrated"
  }, {
    asOf: "2026-05-24T12:00:00-04:00",
    portfolio: { totalValue: 500_000 }
  });

  assert.ok(result.confidenceScore < 60);
  assert.ok(result.rawCompositeScore >= result.compositeScore);
  assert.ok(result.evidenceCapScore < 70);
  assert.ok(result.evidenceCapReasons.some((reason) => /data coverage|source coverage|quote/i.test(reason)));
  assert.ok(result.missingData.includes("quote/price input"));
  assert.ok(result.missingData.includes("historical price series"));
  assert.ok(result.topWeaknesses.length >= 2);
  assert.equal(result.ratingLabel, "Needs evidence");
});

test("evidence cap prevents thin-data setups from looking institutionally high conviction", () => {
  const result = buildInstitutionalQuantLens({
    ticker: "PROMO",
    quant: 5,
    valuationGrade: "A+",
    momentumGrade: "A+",
    epsRevisionsGrade: "A+",
    portfolioWeight: "3%"
  }, {
    asOf: "2026-05-24T12:00:00-04:00",
    portfolio: { totalValue: 500_000 }
  });

  assert.ok(result.rawCompositeScore > result.compositeScore);
  assert.ok(result.compositeScore <= result.evidenceCapScore);
  assert.ok(result.evidenceCapReasons.includes("missing current quote/price input"));
  assert.ok(result.explanation.includes("Raw score"));
});

test("evidence cap reasons do not imply the score was capped when raw score is already lower", () => {
  const result = buildInstitutionalQuantLens({
    ticker: "LOWQ",
    valuationGrade: "F",
    momentumGrade: "D",
    portfolioWeight: "2%",
    riskLevel: "High"
  }, {
    asOf: "2026-05-24T12:00:00-04:00",
    portfolio: { totalValue: 500_000 }
  });

  assert.ok(result.evidenceCapScore < 100);
  assert.ok(result.rawCompositeScore <= result.evidenceCapScore);
  assert.equal(result.scoreWasEvidenceCapped, false);
  assert.ok(result.evidenceCapReasons.includes("missing current quote/price input"));
  assert.doesNotMatch(result.explanation, /Raw score .* was capped/i);
});

test("quality factor avoids double-counting broad Seeking Alpha quant as business quality", () => {
  const quantOnly = scoreInstitutionalQuality({ ticker: "SAQ", quant: 5 });

  assert.ok(quantOnly.score < 65);
  assert.ok(quantOnly.missingData.includes("profitability grade"));
  assert.equal(quantOnly.missingData.includes("quant score"), false);
});

test("Novy-Marx gross profitability proxy strengthens quality when available", () => {
  const withoutGrossProfitability = scoreInstitutionalQuality({
    ticker: "QUAL",
    profitabilityGrade: "B",
    growthGrade: "B",
    revenueGrowth: 8,
    epsGrowth: 10,
    grossMargin: 34,
    freeCashFlowMargin: 7
  });
  const withGrossProfitability = scoreInstitutionalQuality({
    ticker: "QUAL",
    profitabilityGrade: "B",
    growthGrade: "B",
    grossProfitToAssets: 0.45,
    revenueGrowth: 8,
    epsGrowth: 10,
    grossMargin: 34,
    freeCashFlowMargin: 7
  });

  assert.ok(withGrossProfitability.score > withoutGrossProfitability.score);
  assert.equal(withGrossProfitability.details.grossProfitToAssets, 0.45);
  assert.equal(withGrossProfitability.missingData.includes("gross profits/assets"), false);
});

test("Novy-Marx gross profitability can be computed from gross profit and assets", () => {
  const direct = scoreInstitutionalQuality({
    ticker: "QUAL",
    profitabilityGrade: "B",
    growthGrade: "B",
    grossProfitToAssets: 0.4,
    revenueGrowth: 8,
    epsGrowth: 10,
    grossMargin: 34,
    freeCashFlowMargin: 7
  });
  const computed = scoreInstitutionalQuality({
    ticker: "QUAL",
    profitabilityGrade: "B",
    growthGrade: "B",
    grossProfit: "$40,000",
    totalAssets: "$100,000",
    revenueGrowth: 8,
    epsGrowth: 10,
    grossMargin: 34,
    freeCashFlowMargin: 7
  });

  assert.equal(computed.details.grossProfitToAssets, 0.4);
  assert.equal(computed.score, direct.score);
  assert.equal(computed.missingData.includes("gross profits/assets"), false);
});

test("fundamental percentages normalize decimal and percent-string inputs consistently", () => {
  const percentString = scoreInstitutionalQuality({
    ticker: "MU",
    revenueGrowth: "35%",
    epsGrowth: "40%",
    grossMargin: "48%",
    freeCashFlowMargin: "17%",
    growthGrade: "A",
    profitabilityGrade: "A-"
  });
  const decimal = scoreInstitutionalQuality({
    ticker: "MU",
    revenueGrowth: 0.35,
    epsGrowth: 0.4,
    grossMargin: 0.48,
    freeCashFlowMargin: 0.17,
    growthGrade: "A",
    profitabilityGrade: "A-"
  });
  const wholeNumber = scoreInstitutionalQuality({
    ticker: "MU",
    revenueGrowth: 35,
    epsGrowth: 40,
    grossMargin: 48,
    freeCashFlowMargin: 17,
    growthGrade: "A",
    profitabilityGrade: "A-"
  });

  assert.equal(decimal.details.revenueGrowth, 35);
  assert.equal(decimal.details.grossMargin, 48);
  assert.equal(percentString.score, wholeNumber.score);
  assert.equal(decimal.score, wholeNumber.score);
});

test("risk control penalizes leverage and oversized positions", () => {
  const normal = scoreInstitutionalRiskControl({
    ticker: "VGT",
    portfolioWeight: 0.04,
    riskLevel: "Medium",
    beta: 1.05,
    historicalPrices: [100, 102, 105, 108]
  });
  const leveraged = scoreInstitutionalRiskControl({
    ticker: "SOXL",
    portfolioWeight: 0.18,
    riskLevel: "Very High",
    isLeveragedEtf: true,
    beta: 2.4,
    historicalPrices: [100, 82, 88, 76]
  });
  const leveragedPercentString = scoreInstitutionalRiskControl({
    ticker: "SOXL",
    portfolioWeight: "18%",
    riskLevel: "Very High",
    isLeveragedEtf: true,
    beta: 2.4,
    historicalPrices: [100, 82, 88, 76]
  });

  assert.ok(normal.score > leveraged.score);
  assert.ok(leveraged.driver.includes("risk"));
  assert.equal(leveragedPercentString.details.portfolioWeight, 0.18);
  assert.equal(leveragedPercentString.score, leveraged.score);
});

test("liquidity and data quality expose missing inputs instead of assuming coverage", () => {
  const liquidity = scoreInstitutionalLiquidity({ ticker: "PRIVATE" });
  const dataQuality = scoreInstitutionalDataQuality({ ticker: "PRIVATE" });

  assert.ok(liquidity.score < 60);
  assert.ok(liquidity.missingData.includes("market cap"));
  assert.ok(liquidity.missingData.includes("dollar volume"));
  assert.ok(dataQuality.score < 50);
  assert.ok(dataQuality.missingData.includes("quote/price input"));
  assert.ok(dataQuality.missingData.includes("complete factor ratings"));
});

test("momentum normalizes percent strings and sorts dated history before scoring", () => {
  const percentString = scoreInstitutionalMomentum({
    ticker: "MU",
    dailyChangePercent: "2%",
    momentumGrade: "B",
    historicalPrices: [
      { date: "2026-05-22", close: 130 },
      { date: "2026-05-01", close: 100 },
      { date: "2026-05-15", close: 120 }
    ]
  });
  const decimal = scoreInstitutionalMomentum({
    ticker: "MU",
    dailyChangePercent: 0.02,
    momentumGrade: "B",
    historicalPrices: [
      { date: "2026-05-01", close: 100 },
      { date: "2026-05-15", close: 120 },
      { date: "2026-05-22", close: 130 }
    ]
  });

  assert.equal(percentString.details.dailyChangePercent, 0.02);
  assert.equal(percentString.details.historicalReturnPct, 0.3);
  assert.equal(percentString.score, decimal.score);
});

test("momentum uses skip-period formation when enough history is available", () => {
  const withRecentReversal = scoreInstitutionalMomentum({
    ticker: "MOMO",
    momentumGrade: "B",
    dailyChangePercent: 0,
    relativeStrength: 74,
    historicalPrices: Array.from({ length: 13 }, (_, index) => ({
      date: new Date(Date.UTC(2025, index, 1)).toISOString().slice(0, 10),
      close: index === 12 ? 80 : 100 + index * 5
    }))
  });

  assert.equal(withRecentReversal.details.skipPeriodReturnPct > 0, true);
  assert.match(withRecentReversal.details.momentumLookback, /ending at least 28 days before latest/);
  assert.equal(withRecentReversal.missingData.includes("12-1 / skip-period momentum history"), false);
});

test("momentum does not treat short daily history as canonical 12-1 formation", () => {
  const dailyHistory = scoreInstitutionalMomentum({
    ticker: "MOMO",
    momentumGrade: "B",
    dailyChangePercent: 0,
    relativeStrength: 74,
    historicalPrices: Array.from({ length: 13 }, (_, index) => ({
      date: `2026-05-${String(index + 1).padStart(2, "0")}`,
      close: 100 + index
    }))
  });

  assert.equal(dailyHistory.details.skipPeriodReturnPct, null);
  assert.match(dailyHistory.details.momentumLookback, /short-history fallback/);
  assert.equal(dailyHistory.missingData.includes("12-1 / skip-period momentum history"), true);
});

test("momentum normalizes generated month-overflow dates for monthly fixtures", () => {
  const monthlyHistory = scoreInstitutionalMomentum({
    ticker: "MOMO",
    momentumGrade: "B",
    dailyChangePercent: 0,
    relativeStrength: 74,
    historicalPrices: Array.from({ length: 13 }, (_, index) => ({
      date: `2025-${String(index + 1).padStart(2, "0")}-01`,
      close: 100 + index * 3
    }))
  });

  assert.equal(Number.isFinite(monthlyHistory.details.skipPeriodReturnPct), true);
  assert.match(monthlyHistory.details.momentumLookback, /ending at least 28 days before latest/);
  assert.equal(monthlyHistory.missingData.includes("12-1 / skip-period momentum history"), false);
});

test("academic factor diagnostics expose value/momentum balance and anti-overfit validation", () => {
  const diagnostics = buildAcademicFactorDiagnostics(strongStock, {
    asOf: "2026-05-24T12:00:00-04:00",
    portfolio: { totalValue: 500_000 }
  });

  assert.equal(diagnostics.modelVersion, ACADEMIC_FACTOR_MODEL_VERSION);
  assert.equal(diagnostics.factors.length, Object.keys(diagnostics.factorWeights).length);
  assert.ok(diagnostics.factors.some((factor) => factor.paper === "Asness / Moskowitz / Pedersen"));
  assert.ok(diagnostics.factors.some((factor) => factor.paper === "Harvey / Liu / Zhu"));
  assert.ok(diagnostics.researchAnchors.some((anchor) => /Gu, Kelly & Xiu/i.test(anchor)));
  assert.doesNotMatch(diagnostics.caveat, /predicts returns|buy|sell/i);
});

test("factor validation penalizes thin history and sample data before high-conviction ranking", () => {
  const validation = scoreInstitutionalFactorValidation({
    ticker: "THIN",
    marketDataMode: "mock",
    historicalPrices: [{ date: "2026-05-01", close: 100 }, { date: "2026-05-02", close: 101 }]
  }, [
    scoreInstitutionalQuality({ ticker: "THIN" }),
    scoreInstitutionalMomentum({ ticker: "THIN", historicalPrices: [100, 101] }),
    scoreInstitutionalDataQuality({ ticker: "THIN", marketDataMode: "mock" })
  ]);

  assert.ok(validation.score < 65);
  assert.ok(validation.missingData.some((warning) => /multiple-testing|short-history|sample/i.test(warning)));
  assert.match(validation.driver, /research checklist|out-of-sample/);
});

test("funds and leveraged ETFs use exposure-review language instead of stock-quality labels", () => {
  const result = buildInstitutionalQuantLens({
    ticker: "SOXL",
    name: "Direxion Daily Semiconductor Bull 3X Shares",
    assetClass: "ETF",
    isLeveragedEtf: true,
    leveragedMultiple: 3,
    price: 52,
    marketDataPrice: 52,
    volume: 91_000_000,
    averageVolume: 84_000_000,
    marketCap: 11_300_000_000,
    marketDataMarketCap: 11_300_000_000,
    historicalPrices: [
      { date: "2026-05-01", close: 57 },
      { date: "2026-05-15", close: 54 },
      { date: "2026-05-22", close: 52 }
    ],
    portfolioWeight: 0.13,
    riskLevel: "Very High",
    liveProviderCalls: true,
    dataFreshness: "live",
    cacheStatus: "live"
  }, {
    asOf: "2026-05-24T12:00:00-04:00",
    portfolio: { totalValue: 500_000 }
  });

  assert.equal(result.securityKind, "fund-or-etf");
  assert.equal(result.scoreKind, "fund-exposure-decision-support");
  assert.equal(result.ratingLabel, "Leveraged exposure review");
  assert.match(result.explanation, /institutional exposure lens/);
  assert.ok(result.missingData.includes("operating-company quality factors not applicable to fund/ETF"));
  assert.equal(result.factorCoverage.quality, "partial");
});
