import test from "node:test";
import assert from "node:assert/strict";
import {
  buildStockPredictionModel,
  STOCK_PREDICTION_MODEL_VERSION,
  STOCK_PREDICTION_WEIGHTS
} from "../src/stockPredictionModel.js";

const asOf = "2026-05-27T09:30:00-04:00";

test("stock prediction model returns bounded transparent decision-support output", () => {
  const prediction = buildStockPredictionModel({
    holding: {
      ticker: "MU",
      marketValue: 12000,
      portfolioWeight: 0.08,
      assetClass: "Equity",
      riskLevel: "Medium",
      thesisStatus: "Active"
    },
    signal: {
      ticker: "MU",
      priceMomentumScore: 0.82,
      relativeStrengthScore: 0.76,
      redditMentionAccelerationScore: 0.52,
      politicianBuyScore: 0.45,
      politicianSellScore: 0,
      institutionalQuantScore: 84,
      institutionalQuantConfidenceScore: 78,
      institutionalQuantDataCoverageScore: 74,
      institutionalQuantAcademicCompositeScore: 81,
      institutionalQuantFactors: [{ key: "revisions", label: "Estimate revisions", score: 77 }],
      marketDataPrice: 132,
      marketDataDailyChangePercent: 0.018,
      sourceMode: "live market input",
      marketDataStatus: "connected"
    },
    uiState: "IMPORTED_CLEAN",
    asOf
  });

  assert.equal(prediction.modelVersion, STOCK_PREDICTION_MODEL_VERSION);
  assert.equal(prediction.horizon, "20 trading days");
  assert.ok(prediction.score >= 0 && prediction.score <= 100);
  assert.ok(prediction.confidence >= 0 && prediction.confidence <= 100);
  assert.ok(["Favorable", "Constructive"].includes(prediction.label));
  assert.ok(prediction.factors.every((factor) => factor.score >= 0 && factor.score <= 100));
  assert.equal(Math.round(prediction.factors.reduce((sum, factor) => sum + factor.weight, 0) * 100), 100);
  assert.ok(prediction.topDrivers.length >= 2);
  assert.match(prediction.guardrail, /not a calibrated probability/i);
  assert.doesNotMatch(JSON.stringify(prediction), /\b(buy now|sell now|guaranteed|will go up|price target|trade instruction)\b/i);
});

test("stock prediction model degrades confidence for sample, stale, or thin data", () => {
  const prediction = buildStockPredictionModel({
    holding: {
      ticker: "SOXL",
      marketValue: 9000,
      portfolioWeight: 0.14,
      assetClass: "ETF",
      riskLevel: "Very high",
      isLeveragedEtf: true,
      leveragedMultiple: 3
    },
    signal: {
      ticker: "SOXL",
      priceMomentumScore: 0.64,
      relativeStrengthScore: 0.58,
      institutionalQuantScore: 38,
      institutionalQuantConfidenceScore: 32,
      institutionalQuantDataCoverageScore: 28,
      institutionalQuantAcademicCompositeScore: 34,
      institutionalQuantMissingData: ["historical price series", "underlying holdings"],
      institutionalQuantAcademicValidationWarnings: ["sample is too thin for validation"],
      institutionalQuantSecurityKind: "fund-or-etf",
      sourceMode: "sample market input",
      marketDataStatus: "mock/sample mode",
      isLeveragedEtf: true,
      leveragedMultiple: 3
    },
    uiState: "SAMPLE_MODE",
    asOf
  });

  assert.ok(prediction.score < 55);
  assert.ok(prediction.confidence < 45);
  assert.equal(prediction.securityKind, "fund-or-etf");
  assert.ok(prediction.caveats.some((item) => /Sample context/i.test(item)));
  assert.ok(prediction.caveats.some((item) => /Fund\/ETF rows/i.test(item)));
  assert.ok(prediction.caveats.some((item) => /Leveraged products/i.test(item)));
});

test("stock prediction score does not change only because portfolio weight changes", () => {
  const signal = {
    ticker: "NVDA",
    priceMomentumScore: 0.75,
    relativeStrengthScore: 0.71,
    institutionalQuantScore: 80,
    institutionalQuantConfidenceScore: 70,
    institutionalQuantDataCoverageScore: 70,
    institutionalQuantAcademicCompositeScore: 75,
    sourceMode: "live market input",
    marketDataPrice: 180,
    marketDataStatus: "connected"
  };
  const small = buildStockPredictionModel({
    holding: { ticker: "NVDA", marketValue: 1000, portfolioWeight: 0.01, assetClass: "Equity", riskLevel: "Medium" },
    signal,
    uiState: "IMPORTED_CLEAN",
    asOf
  });
  const large = buildStockPredictionModel({
    holding: { ticker: "NVDA", marketValue: 40000, portfolioWeight: 0.4, assetClass: "Equity", riskLevel: "Medium" },
    signal,
    uiState: "IMPORTED_CLEAN",
    asOf
  });

  assert.equal(small.rawScore, large.rawScore);
  assert.deepEqual(Object.keys(STOCK_PREDICTION_WEIGHTS).includes("ownershipFit"), false);
  assert.ok(large.recommendations.some((item) => /Position size is review context only/i.test(item)));
});
