export const PORTFOLIO_UI_STATES = Object.freeze({
  NO_DATA: "NO_DATA",
  SAMPLE_MODE: "SAMPLE_MODE",
  IMPORTED_CLEAN: "IMPORTED_CLEAN",
  IMPORTED_WITH_SKIPPED_ROWS: "IMPORTED_WITH_SKIPPED_ROWS",
  IMPORTED_PARTIAL_REVIEW: "IMPORTED_PARTIAL_REVIEW",
  STALE_PERSISTED_REPAIRED: "STALE_PERSISTED_REPAIRED",
  IMPORT_FAILED: "IMPORT_FAILED"
});

export function buildPortfolioStatus({
  holdings = [],
  latestImportReport = null,
  fidelityStatus = {},
  asOf = new Date().toISOString()
} = {}) {
  const holdingCount = Array.isArray(holdings) ? holdings.length : 0;
  const report = latestImportReport && typeof latestImportReport === "object" ? latestImportReport : null;

  if (!holdingCount) {
    if (report?.realPortfolioImport && ["Failed", "Needs manual mapping"].includes(report.health?.status || "")) {
      return statusFromImportReport(report, holdingCount, asOf);
    }
    return {
      uiState: PORTFOLIO_UI_STATES.NO_DATA,
      sourceMode: "none",
      label: "No portfolio loaded",
      status: "No portfolio loaded",
      detail: "Import a Fidelity CSV/JSON file or load sample data to populate portfolio screens.",
      loadedAt: null,
      holdingCount,
      rejectedRows: 0,
      skippedRows: 0,
      holdingRowsNeedingReview: 0,
      realPortfolio: false,
      samplePortfolio: false,
      activePortfolio: false
    };
  }

  if (isSamplePortfolio(holdings, fidelityStatus)) {
    return {
      uiState: PORTFOLIO_UI_STATES.SAMPLE_MODE,
      sourceMode: "sample",
      label: "Sample portfolio loaded",
      status: "Sample portfolio loaded",
      detail: "Sample holdings are active for workflow testing. Do not treat sample numbers as Tucker's real portfolio.",
      loadedAt: fidelityStatus?.lastSync || null,
      holdingCount,
      rejectedRows: 0,
      skippedRows: 0,
      holdingRowsNeedingReview: 0,
      realPortfolio: false,
      samplePortfolio: true,
      activePortfolio: true
    };
  }

  if (report?.realPortfolioImport) {
    return statusFromImportReport(report, holdingCount, asOf);
  }

  return {
    uiState: PORTFOLIO_UI_STATES.STALE_PERSISTED_REPAIRED,
    sourceMode: "persisted-repaired",
    label: "Persisted local portfolio loaded",
    status: "Persisted local portfolio loaded",
    detail: "Holdings were restored from local storage and normalized, but no matching import report was found. Re-import the source file when possible.",
    loadedAt: null,
    holdingCount,
    rejectedRows: 0,
    skippedRows: 0,
    holdingRowsNeedingReview: 0,
    realPortfolio: true,
    samplePortfolio: false,
    activePortfolio: true
  };
}

export function isRealPortfolioUiState(uiState = "") {
  return [
    PORTFOLIO_UI_STATES.IMPORTED_CLEAN,
    PORTFOLIO_UI_STATES.IMPORTED_WITH_SKIPPED_ROWS,
    PORTFOLIO_UI_STATES.IMPORTED_PARTIAL_REVIEW,
    PORTFOLIO_UI_STATES.STALE_PERSISTED_REPAIRED
  ].includes(uiState);
}

export function isActivePortfolioUiState(uiState = "") {
  return uiState === PORTFOLIO_UI_STATES.SAMPLE_MODE || isRealPortfolioUiState(uiState);
}

export function countHoldingRowsNeedingReview(report = {}) {
  const rejectedRows = Array.isArray(report?.rejectedRows) ? report.rejectedRows : [];
  const skippedRows = rejectedRows.filter((row) => row.classification === "non-holding row").length;
  return Math.max(0, rejectedRows.length - skippedRows);
}

function statusFromImportReport(report, holdingCount, asOf) {
  const healthStatus = report.health?.status || "";
  const rejectedRows = report.rejectedRows || [];
  const skippedRows = rejectedRows.filter((row) => row.classification === "non-holding row").length;
  const holdingRowsNeedingReview = countHoldingRowsNeedingReview(report);
  const importedCount = Number(holdingCount || report.holdingsImported || 0);
  const loadedAt = report.importedAt || report.loadedAt || report.fetchedAt || report.detectedAt || asOf;

  if (["Failed", "Needs manual mapping"].includes(healthStatus) && !importedCount) {
    return {
      uiState: PORTFOLIO_UI_STATES.IMPORT_FAILED,
      sourceMode: "import-error",
      label: "Portfolio import needs review",
      status: "Portfolio import needs review",
      detail: report.health?.message || "Import failed before any holdings could be applied.",
      loadedAt,
      holdingCount,
      rejectedRows: rejectedRows.length,
      skippedRows,
      holdingRowsNeedingReview,
      realPortfolio: false,
      samplePortfolio: false,
      activePortfolio: false
    };
  }

  if (holdingRowsNeedingReview > 0) {
    return {
      uiState: PORTFOLIO_UI_STATES.IMPORTED_PARTIAL_REVIEW,
      sourceMode: "imported-partial",
      label: "Imported with row review",
      status: "Imported with row review",
      detail: `${importedCount} holding${importedCount === 1 ? "" : "s"} loaded; ${holdingRowsNeedingReview} holding row${holdingRowsNeedingReview === 1 ? "" : "s"} need review.`,
      loadedAt,
      holdingCount: importedCount,
      rejectedRows: rejectedRows.length,
      skippedRows,
      holdingRowsNeedingReview,
      realPortfolio: true,
      samplePortfolio: false,
      activePortfolio: true
    };
  }

  if (skippedRows > 0) {
    return {
      uiState: PORTFOLIO_UI_STATES.IMPORTED_WITH_SKIPPED_ROWS,
      sourceMode: "imported",
      label: "Imported with skipped non-holding rows",
      status: "Imported with skipped non-holding rows",
      detail: `${importedCount} holding${importedCount === 1 ? "" : "s"} loaded; ${skippedRows} Fidelity footer/disclaimer row${skippedRows === 1 ? "" : "s"} skipped.`,
      loadedAt,
      holdingCount: importedCount,
      rejectedRows: rejectedRows.length,
      skippedRows,
      holdingRowsNeedingReview,
      realPortfolio: true,
      samplePortfolio: false,
      activePortfolio: true
    };
  }

  return {
    uiState: PORTFOLIO_UI_STATES.IMPORTED_CLEAN,
    sourceMode: "imported",
    label: "Imported portfolio loaded",
    status: "Imported portfolio loaded",
    detail: `${importedCount} holding${importedCount === 1 ? "" : "s"} loaded from local import.`,
    loadedAt,
    holdingCount: importedCount,
    rejectedRows: rejectedRows.length,
    skippedRows,
    holdingRowsNeedingReview,
    realPortfolio: true,
    samplePortfolio: false,
    activePortfolio: true
  };
}

function isSamplePortfolio(holdings = [], fidelityStatus = {}) {
  if (fidelityStatus?.mode === "sample-demo") return true;
  return holdings.some((holding) => /demo|sample/i.test(String(holding.source || "")));
}
