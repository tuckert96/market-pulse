import test from "node:test";
import assert from "node:assert/strict";
import { buildAlphaSignals, demoAlphaEvents, demoThesisProfiles } from "../src/alphaEngine.js";
import { buildPortfolioDataQualitySummary } from "../src/portfolioDataQuality.js";
import { analyzePortfolio } from "../src/portfolioAnalytics.js";
import { normalizeHoldings } from "../src/portfolioSchema.js";

await import("../src/dataAdapters.js");

const adapters = globalThis.DataAdapters;

test("portfolio data quality summarizes imported CSV health and downstream portfolio data", () => {
  const result = adapters.buildImportResult({
    fidelityFileName: "Portfolio_Positions_May-22-2026.csv",
    fidelityCsv: `Account Number,Account Name,Symbol,Description,Quantity,Last Price,Current Value,Cost Basis Total,Type
1,Taxable,MU,MICRON TECHNOLOGY INC,10,$100.00,$1000.00,$750.00,Cash
1,Taxable,SPAXX**,HELD IN MONEY MARKET,,,$250.00,,Cash
2,Roth IRA,NVDA,NVIDIA CORPORATION COM,2,$950.00,$1900.00,$1200.00,Cash
2,Roth IRA,SOXL,DIREXION DAILY SEMICONDUCTOR BULL 3X,20,$45.00,$900.00,$700.00,Cash
2,Roth IRA,,BROKERAGELINK,100,$1.00,$100.00,$100.00,`
  });
  const holdings = normalizeHoldings(result.records);
  const analysis = analyzePortfolio(holdings);
  const summary = buildPortfolioDataQualitySummary(analysis, result.importReport);
  const signals = buildAlphaSignals(demoAlphaEvents(), analysis.holdings, demoThesisProfiles());
  const samsung = signals.find((signal) => signal.id === "alpha-samsung-strike-mu");

  assert.equal(summary.status, "usable with warnings");
  assert.equal(summary.importedTotalMarketValue, 4050);
  assert.equal(summary.accountCount, 2);
  assert.equal(summary.holdingCount, 4);
  assert.equal(summary.detectedFileDate, "2026-05-22");
  assert.equal(summary.rejectedNonHoldingRows, 1);
  assert.equal(summary.missingCostBasisCount, 0);
  assert.ok(summary.cashPercentage > 0);
  assert.ok(summary.top10HoldingsPercentage > 0.99);
  assert.ok(analysis.overview.totalValue > 0);
  assert.equal(analysis.risk.topHoldings[0].ticker, "NVDA");
  assert.deepEqual(analysis.breakdowns.account.map((account) => account.name).sort(), ["Roth IRA", "Taxable"]);
  assert.ok(analysis.alerts.length > 0);
  assert.ok(samsung.affectedWeight > 0.9);
});

test("portfolio data quality marks failed imports as needing review", () => {
  const summary = buildPortfolioDataQualitySummary(analyzePortfolio([]), {
    health: { status: "Needs manual mapping" },
    totalMarketValue: 0,
    rejectedRows: [{ rowNumber: 2, reasons: ["missing ticker"] }]
  });

  assert.equal(summary.status, "needs review");
  assert.equal(summary.rejectedNonHoldingRows, 0);
  assert.ok(summary.warnings.some((warning) => /missing ticker/i.test(warning)));
});
