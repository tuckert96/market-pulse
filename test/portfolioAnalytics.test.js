import test from "node:test";
import assert from "node:assert/strict";
import {
  HOLDING_RISK_SCORE_WEIGHTS,
  POSITION_CONCENTRATION_THRESHOLDS,
  analyzePortfolio,
  buildConcentrationScoreBreakdown,
  buildDecisionRiskDashboard,
  buildHoldingRiskScoreBreakdown,
  buildLeveragedEtfDrawdownScenarios,
  concentrationThresholdFlags,
  riskStatusForWeight
} from "../src/portfolioAnalytics.js";
import { tuckerDemoHoldings } from "../src/portfolioDemoData.js";
import { normalizeHoldings } from "../src/portfolioSchema.js";

test("portfolio overview includes value, risk, alerts, and breakdowns", () => {
  const analysis = analyzePortfolio(tuckerDemoHoldings());

  assert.ok(analysis.overview.totalValue > 0);
  assert.ok(analysis.overview.semiconductorAiExposure > 0);
  assert.ok(analysis.breakdowns.account.length >= 3);
  assert.ok(analysis.breakdowns.sector.some((row) => row.name === "Semiconductors"));
  assert.ok(analysis.alerts.length > 0);
  assert.ok(analysis.risk.stressTests.length >= 6);
});

test("leveraged ETF exposure is detected", () => {
  const analysis = analyzePortfolio(tuckerDemoHoldings());
  const leveraged = analysis.holdings.filter((holding) => holding.isLeveragedEtf);

  assert.ok(leveraged.some((holding) => holding.ticker === "UPRO"));
  assert.ok(leveraged.some((holding) => holding.ticker === "SOXL"));
  assert.ok(analysis.overview.leveragedNotionalExposure > analysis.overview.leveragedEtfExposure);
});

test("known leveraged ETFs are normalized even from messy symbols or stale flags", () => {
  const rows = normalizeHoldings([
    { ticker: "$upro", name: "ProShares UltraPro S&P500", marketValue: 1000, isLeveragedEtf: false },
    { ticker: "tecl", name: "Direxion Daily Technology Bull 3X", marketValue: 1000 },
    { ticker: "QLD", name: "ProShares Ultra QQQ", marketValue: 1000 },
    { ticker: "VTI", name: "Vanguard Total Stock Market ETF", marketValue: 1000 }
  ]);

  assert.deepEqual(rows.map((row) => [row.ticker, row.isLeveragedEtf, row.leveragedMultiple, row.assetClass]), [
    ["UPRO", true, 3, "ETF"],
    ["TECL", true, 3, "ETF"],
    ["QLD", true, 2, "ETF"],
    ["VTI", false, 1, "ETF"]
  ]);
});

test("inverse leveraged ETFs use absolute leverage for risk and notional exposure", () => {
  const analysis = analyzePortfolio([
    { ticker: "SQQQ", name: "ProShares UltraPro Short QQQ", account: "Taxable", marketValue: 10000, costBasis: 8000, assetClass: "ETF" },
    { ticker: "SPAXX", name: "Money Market", account: "Taxable", marketValue: 90000, assetClass: "Cash", sector: "Cash", strategySleeve: "Cash" }
  ]);
  const sqqq = analysis.holdings.find((holding) => holding.ticker === "SQQQ");

  assert.equal(sqqq.isLeveragedEtf, true);
  assert.equal(sqqq.leveragedMultiple, -3);
  assert.ok(sqqq.riskScore > 20);
  assert.equal(analysis.overview.leveragedNotionalExposure, 30000);
  assert.ok(analysis.alerts.some((alert) => alert.type === "leverage" && alert.detail.includes("$30,000")));
});

test("holding risk score breakdown exposes deterministic factors and missing-data handling", () => {
  const breakdown = buildHoldingRiskScoreBreakdown({
    ticker: "SOXL",
    name: "Direxion Daily Semiconductor Bull 3X",
    marketValue: 15000,
    costBasis: 12000,
    assetClass: "ETF",
    isLeveragedEtf: true,
    leveragedMultiple: 3,
    beta: 2.1,
    quant: 2.2,
    valuationGrade: "D",
    revisionsGrade: "C-"
  }, 100000);

  const expected = breakdown.components.reduce((total, component) => total + component.points, 0);

  assert.equal(HOLDING_RISK_SCORE_WEIGHTS.concentrationRisk, 0.3);
  assert.equal(breakdown.finalScore, Math.round(expected));
  assert.equal(breakdown.generatedBy, "Calculated local risk score. Not an AI explanation.");
  assert.ok(breakdown.components.some((component) => component.key === "leverageRisk" && component.points > 0));
  assert.ok(breakdown.components.every((component) => Number.isFinite(component.points) && Number.isFinite(component.weight)));
  assert.doesNotMatch(JSON.stringify(breakdown), /\b(buy now|sell now|guaranteed|prediction)\b/i);
});

test("holding risk score breakdown records neutral fallbacks when data is missing", () => {
  const breakdown = buildHoldingRiskScoreBreakdown({
    ticker: "XYZ",
    marketValue: 5000,
    assetClass: "Equity"
  }, 0);

  assert.equal(breakdown.inputs.portfolioWeight, 0);
  assert.ok(breakdown.missingData.some((item) => /Portfolio total/i.test(item)));
  assert.ok(breakdown.missingData.some((item) => /rating input/i.test(item)));
  assert.ok(breakdown.missingData.some((item) => /Beta/i.test(item)));
});

test("concentration score breakdown shows portfolio-level formula", () => {
  const breakdown = buildConcentrationScoreBreakdown({
    top5Weight: 0.5,
    top10Weight: 0.7,
    topSectorWeight: 0.4
  });

  assert.equal(breakdown.finalScore, Math.round(0.5 * 60 + 0.7 * 25 + 0.4 * 45));
  assert.match(breakdown.formula, /top 5 weight x 60/i);
  assert.ok(breakdown.components.every((component) => component.detail && Number.isFinite(component.points)));
});

test("persisted false cash classifications are repaired during portfolio analysis", () => {
  const analysis = analyzePortfolio([
    { ticker: "MU", name: "MICRON TECHNOLOGY INC", account: "Taxable", marketValue: 1000, assetClass: "Cash", sector: "Cash", strategySleeve: "Cash", cash: true },
    { ticker: "SPAXX", name: "HELD IN MONEY MARKET", account: "Taxable", marketValue: 250, assetClass: "Cash", sector: "Cash", strategySleeve: "Cash", cash: true }
  ]);
  const mu = analysis.holdings.find((holding) => holding.ticker === "MU");

  assert.equal(analysis.overview.cashBalance, 250);
  assert.equal(mu.assetClass, "Equity");
  assert.equal(mu.sector, "Semiconductors");
});

test("risk status thresholds classify portfolio weights", () => {
  assert.equal(riskStatusForWeight(0.03), "normal");
  assert.equal(riskStatusForWeight(0.09), "elevated");
  assert.equal(riskStatusForWeight(0.13), "high");
  assert.equal(riskStatusForWeight(0.21), "extreme");
});

test("position concentration threshold flags are deterministic", () => {
  assert.deepEqual(concentrationThresholdFlags(0.049).map((row) => row.label), []);
  assert.deepEqual(concentrationThresholdFlags(0.05).map((row) => row.label), ["Above 5%"]);
  assert.deepEqual(concentrationThresholdFlags(0.1).map((row) => row.label), ["Above 5%", "Above 10%"]);
  assert.deepEqual(concentrationThresholdFlags(0.2).map((row) => row.label), ["Above 5%", "Above 10%", "Above 20%"]);
  assert.deepEqual(concentrationThresholdFlags(0.3).map((row) => row.label), ["Above 5%", "Above 10%", "Above 20%", "Above 30%"]);
  assert.equal(POSITION_CONCENTRATION_THRESHOLDS[POSITION_CONCENTRATION_THRESHOLDS.length - 1].interpretation, "single-position outcome risk");
});

test("decision risk dashboard includes decision-grade sections and explanations", () => {
  const analysis = analyzePortfolio(tuckerDemoHoldings());
  const dashboard = analysis.risk.decisionDashboard;

  assert.ok(dashboard.topPositionWeights.length > 0);
  assert.ok(dashboard.topPositionWeights.every((row) => row.status && row.statusLabel && row.explanation));
  assert.ok(dashboard.topPositionWeights.every((row) => row.thresholdLabel && row.securityType));
  assert.ok(dashboard.sectorConcentration.every((row) => row.name !== "Cash"));
  assert.ok(dashboard.accountConcentration.length > 0);
  assert.ok(dashboard.themeExposure.some((row) => row.name === "AI / semiconductor" && row.tickers.includes("MU")));
  assert.ok(dashboard.themeExposure.some((row) => row.name === "Memory cycle" && row.tickers.includes("MU")));
  assert.ok(dashboard.leveragedEtfExposure.rows.some((row) => row.name === "UPRO" || row.name === "SOXL"));
  assert.ok(dashboard.leveragedEtfExposure.notionalValue > dashboard.leveragedEtfExposure.directValue);
  assert.ok(["normal", "elevated", "high", "extreme"].includes(dashboard.leveragedEtfExposure.status));
  assert.ok(dashboard.assetMix.individualStock.explanation.includes("Individual stocks"));
  assert.ok(dashboard.assetMix.normalEtf.explanation.includes("separate from leveraged ETFs"));
  assert.ok(dashboard.assetMix.leveragedEtf.explanation.includes("daily reset leverage"));
  assert.ok(dashboard.securityTypeExposure.some((row) => row.name === "Single stocks"));
  assert.ok(dashboard.securityTypeExposure.some((row) => row.name === "Normal ETFs / funds"));
  assert.ok(dashboard.securityTypeExposure.some((row) => row.name === "Leveraged ETFs"));
  assert.ok(dashboard.concentrationInterpretation.summary.includes("deterministic local read"));
  assert.ok(dashboard.concentrationInterpretation.summary.includes("not an OpenAI-generated recommendation"));
  assert.ok(dashboard.concentrationInterpretation.drivers.some((driver) => driver.includes("Top 5 holdings")));
  assert.ok(dashboard.cashExposure.explanation.includes("not downside risk"));
  assert.equal(dashboard.correlationRisk.label, "Correlation and overlap");
  assert.ok(Array.isArray(dashboard.correlationRisk.groups));
  assert.equal(dashboard.correlationPlaceholder, dashboard.correlationRisk);
});

test("decision risk dashboard separates stock, normal ETF, leveraged ETF, and cash exposure", () => {
  const dashboard = buildDecisionRiskDashboard([
    { ticker: "MU", name: "Micron Technology", account: "Taxable", marketValue: 30000, assetClass: "Equity", sector: "Semiconductors" },
    { ticker: "NVDA", name: "Nvidia", account: "Taxable", marketValue: 10000, assetClass: "Equity", sector: "Semiconductors" },
    { ticker: "QQQ", name: "Invesco QQQ Trust ETF", account: "Taxable", marketValue: 15000, assetClass: "ETF", sector: "Technology" },
    { ticker: "UPRO", name: "ProShares UltraPro S&P500", account: "Taxable", marketValue: 5000, assetClass: "ETF", sector: "Leveraged growth", isLeveragedEtf: true, leveragedMultiple: 3 },
    { ticker: "SPAXX", name: "Fidelity Government Money Market", account: "Taxable", marketValue: 40000, assetClass: "Cash", sector: "Cash", strategySleeve: "Cash" }
  ], 100000);

  assert.equal(dashboard.topPositionWeights[0].name, "MU");
  assert.equal(dashboard.topPositionWeights[0].thresholdLabel, "Above 30%");
  assert.equal(dashboard.topPositionWeights[0].securityType, "Single stocks");
  assert.equal(dashboard.topPositionWeights.some((row) => row.name === "SPAXX"), false);
  assert.equal(dashboard.assetMix.individualStock.weight, 0.4);
  assert.equal(dashboard.assetMix.normalEtf.weight, 0.15);
  assert.equal(dashboard.assetMix.leveragedEtf.weight, 0.05);
  assert.equal(dashboard.cashExposure.weight, 0.4);
  assert.equal(dashboard.leveragedEtfExposure.notionalWeight, 0.15);
  assert.ok(dashboard.securityTypeExposure.some((row) => row.name === "Cash / money market" && row.weight === 0.4));
  assert.ok(dashboard.concentrationInterpretation.drivers.some((driver) => driver.includes("MU is the largest position at 30%")));
  assert.ok(dashboard.concentrationInterpretation.drivers.some((driver) => driver.includes("Leveraged ETFs are 5% direct and 15% estimated notional exposure.")));
});

test("decision risk dashboard calculates measured correlations when history exists", () => {
  const dashboard = buildDecisionRiskDashboard([
    {
      ticker: "MU",
      name: "Micron Technology",
      account: "Taxable",
      marketValue: 12000,
      assetClass: "Equity",
      sector: "Semiconductors",
      marketDataHistoricalPrices: [
        { date: "2026-01-01", close: 100 },
        { date: "2026-01-02", close: 102 },
        { date: "2026-01-03", close: 101 },
        { date: "2026-01-04", close: 104 },
        { date: "2026-01-05", close: 108 },
        { date: "2026-01-06", close: 109 }
      ]
    },
    {
      ticker: "SOXL",
      name: "Direxion Daily Semiconductor Bull 3X",
      account: "Taxable",
      marketValue: 8000,
      assetClass: "ETF",
      sector: "Semiconductors",
      isLeveragedEtf: true,
      leveragedMultiple: 3,
      marketDataHistoricalPrices: [
        { date: "2026-01-01", close: 50 },
        { date: "2026-01-02", close: 53 },
        { date: "2026-01-03", close: 51.5 },
        { date: "2026-01-04", close: 56 },
        { date: "2026-01-05", close: 62 },
        { date: "2026-01-06", close: 63.5 }
      ]
    },
    {
      ticker: "BIL",
      name: "Treasury Bills ETF",
      account: "Taxable",
      marketValue: 80000,
      assetClass: "ETF",
      sector: "Treasury",
      marketDataHistoricalPrices: [
        { date: "2026-01-01", close: 91 },
        { date: "2026-01-02", close: 91.01 },
        { date: "2026-01-03", close: 91.02 },
        { date: "2026-01-04", close: 91.03 },
        { date: "2026-01-05", close: 91.04 },
        { date: "2026-01-06", close: 91.05 }
      ]
    }
  ], 100000);

  const pair = dashboard.correlationRisk.measuredPairs.find((row) => row.tickers.includes("MU") && row.tickers.includes("SOXL"));
  assert.ok(pair);
  assert.ok(pair.correlation > 0.9);
  assert.equal(pair.observations, 5);
  assert.ok(pair.explanation.includes("measured price-return correlation"));
});

test("decision risk dashboard treats inverse leveraged ETFs as exposure magnitude", () => {
  const dashboard = buildDecisionRiskDashboard([
    { ticker: "SQQQ", name: "Inverse Nasdaq 3x", account: "Taxable", marketValue: 1000, assetClass: "ETF", sector: "Leveraged growth", strategySleeve: "Leveraged growth", isLeveragedEtf: true, leveragedMultiple: -3 },
    { ticker: "SPAXX", name: "Money Market", account: "Taxable", marketValue: 9000, assetClass: "Cash", sector: "Cash", strategySleeve: "Cash" }
  ], 10000);

  assert.equal(dashboard.leveragedEtfExposure.directValue, 1000);
  assert.equal(dashboard.leveragedEtfExposure.notionalValue, 3000);
  assert.equal(dashboard.leveragedEtfExposure.rows[0].value, 3000);
  assert.ok(dashboard.leveragedEtfExposure.rows[0].explanation.includes("30% estimated notional"));
});

test("leveraged ETF dashboard includes daily-reset education and drawdown scenarios", () => {
  const dashboard = buildDecisionRiskDashboard([
    { ticker: "UPRO", name: "ProShares UltraPro S&P500", account: "Taxable", marketValue: 10000, assetClass: "ETF", sector: "Leveraged growth", isLeveragedEtf: true, leveragedMultiple: 3 },
    { ticker: "SOXL", name: "Direxion Daily Semiconductor Bull 3X", account: "Roth", marketValue: 5000, assetClass: "ETF", sector: "Semiconductors", isLeveragedEtf: true, leveragedMultiple: 3 },
    { ticker: "VTI", name: "Vanguard Total Stock Market ETF", account: "Taxable", marketValue: 85000, assetClass: "ETF", sector: "Broad market" }
  ], 100000);

  assert.equal(dashboard.leveragedEtfExposure.directWeight, 0.15);
  assert.equal(dashboard.leveragedEtfExposure.notionalWeight, 0.45);
  assert.equal(dashboard.leveragedEtfExposure.scenarios.length, 4);
  assert.deepEqual(dashboard.leveragedEtfExposure.scenarios.map((row) => row.underlyingMoveLabel), ["-10%", "-20%", "-30%", "-50%"]);
  assert.equal(dashboard.leveragedEtfExposure.scenarios[0].estimatedProductMove, -0.3);
  assert.equal(dashboard.leveragedEtfExposure.scenarios[0].estimatedPortfolioImpact, -4500);
  assert.equal(dashboard.leveragedEtfExposure.scenarios[3].estimatedProductMove, -1);
  assert.ok(dashboard.leveragedEtfExposure.dailyResetExplanation.includes("one trading day"));
  assert.ok(dashboard.leveragedEtfExposure.volatilityDragExplanation.includes("Volatility drag"));
});

test("leveraged ETF scenario builder handles missing leveraged holdings safely", () => {
  const scenarios = buildLeveragedEtfDrawdownScenarios([
    { ticker: "VTI", name: "Total market ETF", marketValue: 100000, assetClass: "ETF", leveragedMultiple: 1 }
  ], 100000);

  assert.equal(scenarios.length, 4);
  assert.equal(scenarios[0].estimatedProductMove, 0);
  assert.equal(scenarios[0].estimatedPortfolioImpact, 0);
  assert.ok(scenarios[0].explanation.includes("No leveraged ETFs"));
});

test("cash-heavy portfolios keep cash out of equity concentration risk", () => {
  const analysis = analyzePortfolio([
    { ticker: "SPAXX", name: "Fidelity Government Money Market", account: "Taxable", marketValue: 9000, assetClass: "Cash", sector: "Cash", strategySleeve: "Cash" },
    { ticker: "MU", name: "Micron Technology", account: "Taxable", marketValue: 1000, assetClass: "Equity", sector: "Semiconductors", strategySleeve: "AI infrastructure" }
  ]);

  assert.equal(analysis.overview.cashBalance, 9000);
  assert.equal(analysis.risk.decisionDashboard.cashExposure.status, "extreme");
  assert.equal(analysis.risk.decisionDashboard.topPositionWeights.some((row) => row.name === "SPAXX"), false);
  assert.equal(analysis.risk.decisionDashboard.topPositionWeights[0].name, "MU");
  assert.equal(analysis.risk.topHoldings.some((holding) => holding.ticker === "SPAXX"), false);
});
