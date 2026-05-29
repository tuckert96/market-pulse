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

export function buildPortfolioImportChangeSummary({
  previousHoldings = [],
  nextHoldings = [],
  importReport = {},
  preview = null
} = {}) {
  const previous = aggregateHoldingsByTicker(previousHoldings);
  const next = aggregateHoldingsByTicker(nextHoldings);
  const rejectedRows = Array.isArray(importReport.rejectedRows) ? importReport.rejectedRows : [];
  const skippedNonHoldingRows = Number(preview?.skippedNonHoldingRows ?? rejectedRows.filter((row) => row.classification === "non-holding row").length);
  const flaggedRows = Number(preview?.holdingRowsNeedingReview ?? countHoldingRowsNeedingReview(importReport));
  const duplicateRowsMerged = Array.isArray(importReport.duplicateRows) ? importReport.duplicateRows.length : 0;
  const previousTotalValue = roundCurrency(sumAggregateValue(previous));
  const nextTotalValue = roundCurrency(sumAggregateValue(next));
  const sharedTickers = [...next.keys()].filter((ticker) => previous.has(ticker));

  const newPositions = sortByAbsDelta([...next.values()]
    .filter((position) => !previous.has(position.ticker) && position.marketValue > 0)
    .map((position) => changeRow(position, null)));
  const removedPositions = sortByAbsDelta([...previous.values()]
    .filter((position) => {
      const nextPosition = next.get(position.ticker);
      return !nextPosition || nextPosition.marketValue <= 0;
    })
    .map((position) => changeRow(null, position)));
  const changedPositions = sortByAbsDelta(sharedTickers
    .map((ticker) => changeRow(next.get(ticker), previous.get(ticker)))
    .filter((row) => Math.abs(row.valueChange) >= 0.01 || Math.abs(row.sharesChange) >= 0.000001));

  const increasedPositions = changedPositions.filter((row) => row.valueChange > 0 || (row.valueChange === 0 && row.sharesChange > 0));
  const decreasedPositions = changedPositions.filter((row) => row.valueChange < 0 || (row.valueChange === 0 && row.sharesChange < 0));

  return {
    hasPreviousPortfolio: previous.size > 0,
    rowsImported: Number(importReport.holdingsImported || nextHoldings.length || 0),
    rowsSkipped: skippedNonHoldingRows,
    rowsFlagged: flaggedRows,
    duplicateRowsMerged,
    previousTotalValue,
    nextTotalValue,
    valueChange: roundCurrency(nextTotalValue - previousTotalValue),
    newPositions,
    removedPositions,
    increasedPositions,
    decreasedPositions,
    summaryText: buildChangeSummaryText({
      hasPreviousPortfolio: previous.size > 0,
      rowsImported: Number(importReport.holdingsImported || nextHoldings.length || 0),
      newCount: newPositions.length,
      removedCount: removedPositions.length,
      increasedCount: increasedPositions.length,
      decreasedCount: decreasedPositions.length,
      flaggedRows,
      skippedNonHoldingRows,
      duplicateRowsMerged
    })
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
  const previousHoldings = Array.isArray(options.previousHoldings) ? options.previousHoldings : [];
  const holdings = normalizeHoldings(preview.records);
  const importReport = {
    ...(preview.result?.importReport || {}),
    realPortfolioImport: true,
    importedAt
  };
  importReport.changeSummary = buildPortfolioImportChangeSummary({
    previousHoldings,
    nextHoldings: holdings,
    importReport,
    preview
  });
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
      changeSummary: importReport.changeSummary,
      message: `Fidelity import applied: ${holdingCount} holding${holdingCount === 1 ? "" : "s"} loaded locally.`
    }
  };
}

function aggregateHoldingsByTicker(holdings = []) {
  return normalizeHoldings(Array.isArray(holdings) ? holdings : [])
    .reduce((map, holding) => {
      const ticker = String(holding.ticker || "").toUpperCase();
      if (!ticker) return map;
      const current = map.get(ticker) || {
        ticker,
        name: holding.name || holding.company || "",
        shares: 0,
        marketValue: 0,
        accounts: new Set()
      };
      current.name = current.name || holding.name || holding.company || "";
      current.shares += Number(holding.shares || 0);
      current.marketValue += Number(holding.marketValue || 0);
      if (holding.account) current.accounts.add(String(holding.account));
      map.set(ticker, current);
      return map;
    }, new Map());
}

function sumAggregateValue(aggregate = new Map()) {
  return [...aggregate.values()].reduce((sum, holding) => sum + Number(holding.marketValue || 0), 0);
}

function changeRow(next = null, previous = null) {
  const ticker = next?.ticker || previous?.ticker || "";
  const nextValue = Number(next?.marketValue || 0);
  const previousValue = Number(previous?.marketValue || 0);
  const nextShares = Number(next?.shares || 0);
  const previousShares = Number(previous?.shares || 0);
  return {
    ticker,
    name: next?.name || previous?.name || "",
    previousValue: roundCurrency(previousValue),
    nextValue: roundCurrency(nextValue),
    valueChange: roundCurrency(nextValue - previousValue),
    previousShares: roundNumber(previousShares),
    nextShares: roundNumber(nextShares),
    sharesChange: roundNumber(nextShares - previousShares),
    accounts: [...(next?.accounts || previous?.accounts || [])]
  };
}

function sortByAbsDelta(rows = []) {
  return [...rows].sort((a, b) => Math.abs(b.valueChange) - Math.abs(a.valueChange) || a.ticker.localeCompare(b.ticker));
}

function buildChangeSummaryText(summary = {}) {
  if (!summary.hasPreviousPortfolio) {
    return `${summary.rowsImported} holding${summary.rowsImported === 1 ? "" : "s"} loaded as the active imported portfolio.`;
  }
  const parts = [
    `${summary.newCount} new`,
    `${summary.removedCount} removed`,
    `${summary.increasedCount} increased`,
    `${summary.decreasedCount} decreased`
  ];
  if (summary.duplicateRowsMerged) parts.push(`${summary.duplicateRowsMerged} duplicate row${summary.duplicateRowsMerged === 1 ? "" : "s"} merged`);
  if (summary.skippedNonHoldingRows) parts.push(`${summary.skippedNonHoldingRows} non-holding row${summary.skippedNonHoldingRows === 1 ? "" : "s"} skipped`);
  if (summary.flaggedRows) parts.push(`${summary.flaggedRows} row${summary.flaggedRows === 1 ? "" : "s"} flagged`);
  return `Compared with the previous active portfolio: ${parts.join(", ")}.`;
}

function roundCurrency(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function roundNumber(value) {
  return Math.round(Number(value || 0) * 1_000_000) / 1_000_000;
}
