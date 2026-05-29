import test from "node:test";
import assert from "node:assert/strict";

import {
  applyPortfolioImportPreview,
  buildPortfolioImportPreview,
  cancelPortfolioImportPreview,
  canApplyPortfolioImportResult
} from "../src/importPreviewWorkflow.js";

function importResult(overrides = {}) {
  return {
    records: [
      {
        ticker: "MU",
        account: "Taxable",
        shares: 10,
        price: 100,
        marketValue: 1000,
        costBasis: 750,
        sources: ["fidelity"]
      }
    ],
    fidelityRecords: [{ ticker: "MU", marketValue: 1000 }],
    validation: { ok: true, errors: [], warnings: [] },
    importReport: {
      provider: "fidelity",
      fileName: "positions.csv",
      rowsParsed: 1,
      holdingsImported: 1,
      rejectedRows: [],
      accountsDetected: ["Taxable"],
      tickersDetected: ["MU"],
      totalMarketValue: 1000,
      health: { status: "Success", tone: "success", message: "Imported one row." },
      ...(overrides.importReport || {})
    },
    ...overrides
  };
}

test("portfolio upload result becomes an explicit preview without mutating current holdings", () => {
  const currentHoldings = [{ ticker: "NVDA", marketValue: 2000 }];
  const result = importResult();
  const preview = buildPortfolioImportPreview(result, {
    fileName: "positions.csv",
    createdAt: "2026-05-28T12:00:00.000Z"
  });

  assert.equal(canApplyPortfolioImportResult(result), true);
  assert.equal(preview.canApply, true);
  assert.equal(preview.acceptedRows, 1);
  assert.equal(preview.totalMarketValue, 1000);
  assert.deepEqual(currentHoldings, [{ ticker: "NVDA", marketValue: 2000 }]);
});

test("canceling a portfolio import preview clears pending state without changing holdings", () => {
  const currentHoldings = [{ ticker: "NVDA", marketValue: 2000 }];
  const preview = buildPortfolioImportPreview(importResult());
  const canceled = cancelPortfolioImportPreview(preview);

  assert.equal(canceled.changed, false);
  assert.equal(canceled.clearPendingPreview, true);
  assert.match(canceled.message, /No holdings were changed/);
  assert.deepEqual(currentHoldings, [{ ticker: "NVDA", marketValue: 2000 }]);
});

test("confirming a portfolio import preview returns the applied holdings and import status", () => {
  const currentHoldings = [{ ticker: "NVDA", marketValue: 2000 }];
  const preview = buildPortfolioImportPreview(importResult());
  const applied = applyPortfolioImportPreview(preview, {
    importedAt: "2026-05-28T12:30:00.000Z"
  });
  const nextHoldings = applied.changed ? applied.holdings : currentHoldings;

  assert.equal(applied.changed, true);
  assert.equal(applied.clearPendingPreview, true);
  assert.equal(applied.holdings.length, 1);
  assert.equal(applied.holdings[0].ticker, "MU");
  assert.deepEqual(nextHoldings.map((holding) => holding.ticker), ["MU"]);
  assert.equal(applied.importReport.realPortfolioImport, true);
  assert.equal(applied.importReport.importedAt, "2026-05-28T12:30:00.000Z");
  assert.equal(applied.fidelityStatus.mode, "csv-imported");
  assert.equal(applied.fidelityStatus.holdings, 1);
  assert.match(applied.fidelityStatus.message, /Fidelity import applied/);
});

test("partial previews apply accepted holdings while preserving review diagnostics", () => {
  const result = importResult({
    records: [
      {
        ticker: "MU",
        account: "Taxable",
        shares: 10,
        price: 100,
        marketValue: 1000,
        costBasis: 750,
        sources: ["fidelity"]
      },
      {
        ticker: "AMD",
        account: "Roth IRA",
        shares: 3,
        price: 180,
        marketValue: 540,
        sources: ["fidelity"]
      }
    ],
    importReport: {
      rowsParsed: 4,
      holdingsImported: 2,
      totalMarketValue: 1540,
      rejectedRows: [
        {
          rowNumber: 4,
          classification: "holding row needs review",
          reasons: ["Missing ticker"],
          row: {}
        },
        {
          rowNumber: 5,
          classification: "non-holding row",
          reasons: ["Fidelity footer row"],
          row: {}
        }
      ],
      accountsDetected: ["Taxable", "Roth IRA"]
    }
  });
  const preview = buildPortfolioImportPreview(result);
  const applied = applyPortfolioImportPreview(preview);

  assert.equal(preview.canApply, true);
  assert.equal(preview.acceptedRows, 2);
  assert.equal(preview.holdingRowsNeedingReview, 1);
  assert.equal(preview.skippedNonHoldingRows, 1);
  assert(preview.warnings.some((warning) => warning.includes("will stay skipped")));
  assert(preview.warnings.some((warning) => warning.includes("non-holding")));
  assert.equal(applied.holdings.length, 2);
  assert.deepEqual(applied.holdings.map((holding) => holding.ticker), ["MU", "AMD"]);
  assert.equal(applied.fidelityStatus.rowsNeedingReview, 1);
  assert.equal(applied.fidelityStatus.skippedNonHoldingRows, 1);
});

test("blocked or failed imports cannot be applied from preview", () => {
  const result = importResult({
    validation: { ok: false, errors: ["bad file"], warnings: [] },
    importReport: {
      health: { status: "Failed", tone: "error", message: "Failed." }
    }
  });
  const preview = buildPortfolioImportPreview(result);
  const applied = applyPortfolioImportPreview(preview);

  assert.equal(preview.canApply, false);
  assert.equal(applied.changed, false);
  assert.match(applied.reason, /No valid portfolio import preview/);
});
