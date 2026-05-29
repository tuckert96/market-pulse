import test from "node:test";
import assert from "node:assert/strict";
import {
  POSITION_CONCENTRATION_THRESHOLDS,
  analyzePortfolio,
  buildDecisionRiskDashboard,
  concentrationThresholdFlags,
  riskStatusForWeight
} from "../src/portfolioAnalytics.js";
import { tuckerDemoHoldings } from "../src/portfolioDemoData.js";

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
