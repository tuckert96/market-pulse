export function buildPortfolioDataQualitySummary(analysis = {}, importReport = null) {
  const holdings = analysis.holdings || [];
  const overview = analysis.overview || {};
  const dataQuality = analysis.dataQuality || { issues: [], issueCount: 0 };
  const totalValue = Number(overview.totalValue) || 0;
  const cashBalance = Number(overview.cashBalance) || 0;
  const missingCostBasisCount = holdings.filter((holding) => isMissingCostBasis(holding)).length;
  const rejectedRows = importReport?.rejectedRows || [];
  const rejectedNonHoldingRows = rejectedRows.filter((row) => row.classification === "non-holding row").length;
  const seriousIssues = (dataQuality.issues || []).filter((issue) =>
    ["missing-ticker", "missing-market-value", "duplicate", "impossible-value"].includes(issue.type)
  );
  const status = qualityStatus({
    importHealth: importReport?.health?.status,
    rejectedRows: rejectedRows.length,
    missingCostBasisCount,
    seriousIssueCount: seriousIssues.length,
    issueCount: dataQuality.issueCount || 0
  });

  return {
    status,
    importedTotalMarketValue: Number(importReport?.totalMarketValue ?? totalValue) || 0,
    accountCount: uniqueCount(holdings.map((holding) => holding.account)),
    holdingCount: holdings.length,
    cashPercentage: totalValue ? cashBalance / totalValue : 0,
    top10HoldingsPercentage: topHoldingWeight(holdings, totalValue, 10),
    missingCostBasisCount,
    rejectedNonHoldingRows,
    detectedFileDate: importReport?.detectedFileDate || "",
    tickersDetected: importReport?.tickersDetected || unique(holdings.map((holding) => holding.ticker)),
    accountsDetected: importReport?.accountsDetected || unique(holdings.map((holding) => holding.account)),
    importHealth: importReport?.health?.status || "No import report",
    warnings: [
      ...rejectedRows.slice(0, 5).map((row) => row.classification === "non-holding row"
        ? `Skipped non-holding row ${row.rowNumber}: ${row.reasons.join(", ")}`
        : `Row ${row.rowNumber} needs review: ${row.reasons.join(", ")}`
      ),
      ...seriousIssues.slice(0, 5).map((issue) => issue.message)
    ]
  };
}

function isMissingCostBasis(holding = {}) {
  return holding.assetClass !== "Cash" && (holding.missingCostBasis || !Number(holding.costBasis));
}

function qualityStatus(input) {
  if (["Failed", "Needs manual mapping"].includes(input.importHealth)) return "needs review";
  if (input.seriousIssueCount > 0) return "needs review";
  if (input.rejectedRows > 0 || input.missingCostBasisCount > 0 || input.issueCount > 0) {
    return "usable with warnings";
  }
  return "clean";
}

function uniqueCount(values = []) {
  return unique(values).length;
}

function topHoldingWeight(holdings = [], totalValue = 0, count = 10) {
  if (!totalValue) return 0;
  return holdings
    .slice()
    .sort((a, b) => (Number(b.marketValue) || 0) - (Number(a.marketValue) || 0))
    .slice(0, count)
    .reduce((sum, holding) => sum + (Number(holding.marketValue) || 0), 0) / totalValue;
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}
