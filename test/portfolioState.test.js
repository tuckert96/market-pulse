import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPortfolioStatus,
  countHoldingRowsNeedingReview,
  isActivePortfolioUiState,
  isRealPortfolioUiState,
  PORTFOLIO_UI_STATES
} from "../src/portfolioState.js";

test("portfolio status distinguishes empty, sample, imported, repaired, and failed states", () => {
  assert.equal(buildPortfolioStatus({ holdings: [] }).uiState, PORTFOLIO_UI_STATES.NO_DATA);

  const sample = buildPortfolioStatus({
    holdings: [{ ticker: "MU", source: "demo" }],
    fidelityStatus: { mode: "sample-demo" }
  });
  assert.equal(sample.uiState, PORTFOLIO_UI_STATES.SAMPLE_MODE);
  assert.equal(sample.activePortfolio, true);
  assert.equal(sample.realPortfolio, false);

  const sampleWithStaleReport = buildPortfolioStatus({
    holdings: [{ ticker: "MU", source: "demo-fidelity" }],
    latestImportReport: { realPortfolioImport: true, holdingsImported: 1, rejectedRows: [], health: { status: "Success" } },
    fidelityStatus: { mode: "sample-demo" }
  });
  assert.equal(sampleWithStaleReport.uiState, PORTFOLIO_UI_STATES.SAMPLE_MODE);
  assert.equal(sampleWithStaleReport.realPortfolio, false);

  const emptyWithStaleSuccessReport = buildPortfolioStatus({
    holdings: [],
    latestImportReport: { realPortfolioImport: true, holdingsImported: 2, rejectedRows: [], health: { status: "Success" } }
  });
  assert.equal(emptyWithStaleSuccessReport.uiState, PORTFOLIO_UI_STATES.NO_DATA);

  const clean = buildPortfolioStatus({
    holdings: [{ ticker: "MU" }],
    latestImportReport: { realPortfolioImport: true, holdingsImported: 1, rejectedRows: [], health: { status: "Success" } }
  });
  assert.equal(clean.uiState, PORTFOLIO_UI_STATES.IMPORTED_CLEAN);

  const cleanWithOverstatedReport = buildPortfolioStatus({
    holdings: [{ ticker: "MU" }, { ticker: "NVDA" }],
    latestImportReport: { realPortfolioImport: true, holdingsImported: 11, rejectedRows: [], health: { status: "Success" } }
  });
  assert.equal(cleanWithOverstatedReport.uiState, PORTFOLIO_UI_STATES.IMPORTED_CLEAN);
  assert.equal(cleanWithOverstatedReport.holdingCount, 2);
  assert.match(cleanWithOverstatedReport.detail, /2 holdings loaded/);
  assert.equal(clean.realPortfolio, true);

  const skipped = buildPortfolioStatus({
    holdings: [{ ticker: "MU" }],
    latestImportReport: {
      realPortfolioImport: true,
      holdingsImported: 1,
      rejectedRows: [{ classification: "non-holding row" }],
      health: { status: "Partial success" }
    }
  });
  assert.equal(skipped.uiState, PORTFOLIO_UI_STATES.IMPORTED_WITH_SKIPPED_ROWS);
  assert.equal(skipped.skippedRows, 1);

  const partial = buildPortfolioStatus({
    holdings: [{ ticker: "MU" }],
    latestImportReport: {
      realPortfolioImport: true,
      holdingsImported: 1,
      rejectedRows: [{ classification: "needs review" }],
      health: { status: "Partial success" }
    }
  });
  assert.equal(partial.uiState, PORTFOLIO_UI_STATES.IMPORTED_PARTIAL_REVIEW);
  assert.equal(partial.activePortfolio, true);
  assert.equal(partial.realPortfolio, true);
  assert.equal(partial.holdingRowsNeedingReview, 1);

  const failed = buildPortfolioStatus({
    holdings: [],
    latestImportReport: {
      realPortfolioImport: true,
      holdingsImported: 0,
      rejectedRows: [{ classification: "needs review" }],
      health: { status: "Failed" }
    }
  });
  assert.equal(failed.uiState, PORTFOLIO_UI_STATES.IMPORT_FAILED);
  assert.equal(failed.activePortfolio, false);

  const repaired = buildPortfolioStatus({
    holdings: [{ ticker: "MU", source: "fidelity-import" }],
    latestImportReport: null,
    fidelityStatus: { mode: "restored-local-state" }
  });
  assert.equal(repaired.uiState, PORTFOLIO_UI_STATES.STALE_PERSISTED_REPAIRED);
  assert.equal(repaired.realPortfolio, true);
  assert.equal(repaired.activePortfolio, true);
});

test("portfolio state predicates keep sample distinct from real active portfolios", () => {
  assert.equal(isActivePortfolioUiState(PORTFOLIO_UI_STATES.SAMPLE_MODE), true);
  assert.equal(isRealPortfolioUiState(PORTFOLIO_UI_STATES.SAMPLE_MODE), false);
  assert.equal(isRealPortfolioUiState(PORTFOLIO_UI_STATES.IMPORTED_PARTIAL_REVIEW), true);
  assert.equal(isRealPortfolioUiState(PORTFOLIO_UI_STATES.STALE_PERSISTED_REPAIRED), true);
  assert.equal(isActivePortfolioUiState(PORTFOLIO_UI_STATES.NO_DATA), false);
});

test("holding-row review helper ignores harmless non-holding rows", () => {
  assert.equal(countHoldingRowsNeedingReview({
    rejectedRows: [
      { classification: "non-holding row" },
      { classification: "needs review" },
      { classification: "needs review" }
    ]
  }), 2);
  assert.equal(countHoldingRowsNeedingReview({
    rejectedRows: [
      { classification: "non-holding row" },
      { classification: "non-holding row" }
    ]
  }), 0);
});
