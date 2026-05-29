import { normalizeHoldings } from "./portfolioSchema.js";
import { countHoldingRowsNeedingReview } from "./portfolioState.js";

const BLOCKED_IMPORT_STATUSES = new Set(["Failed", "Needs manual mapping"]);

export function isPortfolioImportResult(result = {}) {
  return (result.fidelityRecords || []).length > 0 ||
    (result.importReport?.providerReports || []).some((report) => report.provider === "fidelity" && report.holdingsImported > 0);
}

export function canApplyPortfolioImportResult(result = {}) {
  return Boolean(
    result?.validation?.ok &&
    isPortfolioImportResult(result) &&
    (result.records || []).length > 0 &&
    !BLOCKED_IMPORT_STATUSES.has(result.importReport?.health?.status)
  );
}

export function buildPortfolioImportPreview(result = {}, options = {}) {
  const report = result.importReport || {};
  const records = Array.isArray(result.records) ? result.records : [];
  const holdingRowsNeedingReview = countHoldingRowsNeedingReview(report);
  const skippedNonHoldingRows = (report.rejectedRows || []).filter((row) => row.classification === "non-holding row").length;
  const warnings = [
    ...(report.mappingWarnings || []),
    ...(holdingRowsNeedingReview > 0 ? [`${holdingRowsNeedingReview} holding row${holdingRowsNeedingReview === 1 ? "" : "s"} will stay skipped until reviewed.`] : []),
    ...(skippedNonHoldingRows > 0 ? [`${skippedNonHoldingRows} non-holding row${skippedNonHoldingRows === 1 ? "" : "s"} will be skipped.`] : [])
  ];

  return {
    id: options.id || `portfolio-import-preview:${report.fileName || options.fileName || "local-file"}`,
    provider: options.provider || "fidelity",
    fileName: report.fileName || options.fileName || "Local CSV",
    createdAt: options.createdAt || new Date().toISOString(),
    canApply: canApplyPortfolioImportResult(result),
    records,
    result,
    acceptedRows: records.length,
    rowsParsed: Number(report.rowsParsed || 0),
    holdingsImported: Number(report.holdingsImported || records.length || 0),
    accountsDetected: [...(report.accountsDetected || [])],
    totalMarketValue: Number(report.totalMarketValue || 0),
    holdingRowsNeedingReview,
    skippedNonHoldingRows,
    warnings
  };
}

export function cancelPortfolioImportPreview(preview = null) {
  return {
    changed: false,
    clearPendingPreview: true,
    message: preview?.fileName
      ? `Import preview canceled for ${preview.fileName}. No holdings were changed.`
      : "Import preview canceled. No holdings were changed."
  };
}

export function applyPortfolioImportPreview(preview = null, options = {}) {
  if (!preview?.canApply) {
    return {
      changed: false,
      clearPendingPreview: false,
      reason: "No valid portfolio import preview is waiting to be applied."
    };
  }

  const importedAt = options.importedAt || new Date().toISOString();
  const holdings = normalizeHoldings(preview.records);
  const importReport = {
    ...(preview.result?.importReport || {}),
    realPortfolioImport: true,
    importedAt
  };
  const holdingCount = importReport.holdingsImported || holdings.length;

  return {
    changed: true,
    clearPendingPreview: true,
    holdings,
    importReport,
    fidelityStatus: {
      connected: false,
      provider: "csv-import",
      lastSync: importedAt,
      mode: "csv-imported",
      holdings: holdingCount,
      accounts: importReport.accountsDetected?.length || 0,
      totalMarketValue: importReport.totalMarketValue || 0,
      fileName: importReport.fileName || preview.fileName,
      skippedNonHoldingRows: preview.skippedNonHoldingRows,
      rowsNeedingReview: preview.holdingRowsNeedingReview,
      message: `Fidelity import applied: ${holdingCount} holding${holdingCount === 1 ? "" : "s"} loaded locally.`
    }
  };
}
