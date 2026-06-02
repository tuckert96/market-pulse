import { normalizeTicker } from "./portfolioSchema.js";
import {
  buildSeekingAlphaAiDeltaSummaries,
  buildSeekingAlphaAiTickerSummaries,
  normalizeSeekingAlphaAiRecords
} from "./seekingAlphaAi.js";

export const SEEKING_ALPHA_AI_COVERAGE_FILTERS = Object.freeze([
  "all",
  "owned",
  "watchlist",
  "missing",
  "stale",
  "risk-context",
  "parser-warnings",
  "changed",
  "conflicting",
  "unlinked"
]);

export function buildSeekingAlphaAiCoverageQueue({
  holdings = [],
  watchlistIdeas = [],
  tickerSignals = [],
  seekingAlphaAiRecords = [],
  uiState = "SAMPLE_MODE",
  asOf = new Date().toISOString()
} = {}) {
  const holdingsByTicker = summarizeHoldings(holdings);
  const watchlistByTicker = new Map((watchlistIdeas || []).map((idea) => [normalizeTicker(idea.ticker), idea]).filter(([ticker]) => ticker));
  const signalsByTicker = new Map((tickerSignals || []).map((signal) => [normalizeTicker(signal.ticker), signal]).filter(([ticker]) => ticker));
  const normalizedRecords = normalizeSeekingAlphaAiRecords(seekingAlphaAiRecords, { now: asOf });
  const recordTickers = new Set(normalizedRecords.flatMap((record) => record.tickers || []).map(normalizeTicker).filter(Boolean));
  const tickerSet = new Set([
    ...holdingsByTicker.keys(),
    ...watchlistByTicker.keys(),
    ...signalsByTicker.keys(),
    ...recordTickers
  ]);
  const summaries = buildSeekingAlphaAiTickerSummaries(normalizedRecords, [...tickerSet], { now: asOf });
  const deltas = buildSeekingAlphaAiDeltaSummaries(normalizedRecords, [...tickerSet], { now: asOf });
  const imported = /^IMPORTED|REPAIRED|PARTIAL/.test(String(uiState || ""));
  const rows = [...tickerSet]
    .map((ticker) => {
      const holding = holdingsByTicker.get(ticker);
      const watchlistIdea = watchlistByTicker.get(ticker);
      const signal = signalsByTicker.get(ticker);
      const summary = summaries.get(ticker) || {};
      const delta = deltas.get(ticker) || {};
      return buildCoverageRow({ ticker, holding, watchlistIdea, signal, summary, delta, imported });
    })
    .sort((left, right) =>
      right.priorityScore - left.priorityScore ||
      right.marketValue - left.marketValue ||
      left.ticker.localeCompare(right.ticker)
    );
  return {
    generatedAt: asOf,
    uiState,
    summary: summarizeCoverageRows(rows),
    rows
  };
}

export function filterSeekingAlphaAiCoverageRows(rows = [], filter = "all") {
  const normalized = SEEKING_ALPHA_AI_COVERAGE_FILTERS.includes(filter) ? filter : "all";
  if (normalized === "all") return rows;
  return rows.filter((row) => {
    if (normalized === "owned") return row.relationshipStatus === "owned";
    if (normalized === "watchlist") return row.relationshipStatus === "watchlist";
    if (normalized === "missing") return row.coverageStatus === "missing";
    if (normalized === "stale") return row.freshnessStatus === "stale";
    if (normalized === "risk-context") return row.bearishCount > 0 || row.coverageStatus === "warning";
    if (normalized === "parser-warnings") return row.warningCount > 0;
    if (normalized === "changed") return !["missing", "new", "unchanged", "insufficient-history"].includes(row.changeStatus);
    if (normalized === "conflicting") return row.alignmentStatus === "conflicting";
    if (normalized === "unlinked") return row.relationshipStatus === "unlinked-import";
    return true;
  });
}

export function buildSeekingAlphaAiSourceAlignment({ summary = {}, signal = {}, holding = null } = {}) {
  if (!summary.recordCount) {
    return {
      alignmentStatus: "insufficient-data",
      alignmentLabel: "Needs imported research",
      agreementPoints: [],
      disagreementPoints: [],
      missingSources: ["Seeking Alpha AI personal import"],
      confidenceLabel: "Low",
      reviewPriorityNudge: 0,
      summary: "No imported Seeking Alpha AI context is available to compare against local signals."
    };
  }
  const agreementPoints = [];
  const disagreementPoints = [];
  const missingSources = [];
  const support = Number(summary.supportScore) || 0;
  const risk = Number(summary.riskScore) || 0;
  const quantScore = Number(signal.institutionalQuantScore) || 0;
  const reviewPriority = Number(signal.combinedScore) || 0;
  const concentrationRisk = Number(signal.concentrationRiskScore) || 0;
  const priceMomentum = Number(signal.priceMomentumScore ?? signal.priceMomentumPlaceholder) || 0;
  const saSupportive = support >= 0.58 && support >= risk;
  const saRisky = risk >= 0.5 || (summary.bearishPoints || []).length > 0;
  const localConstructive = quantScore >= 65 || priceMomentum >= 0.62;
  const localRisky = reviewPriority >= 65 || concentrationRisk >= 0.58 || /high|very high/i.test(holding?.riskLevel || "");

  if (saSupportive && localConstructive) agreementPoints.push("Imported SA AI support lines up with constructive local quant or momentum context.");
  if (saRisky && localRisky) agreementPoints.push("Imported SA AI risk notes line up with elevated local review-priority or concentration context.");
  if (saSupportive && localRisky) disagreementPoints.push("Imported SA AI support conflicts with elevated local risk or review-priority context.");
  if (saRisky && localConstructive && !localRisky) disagreementPoints.push("Imported SA AI risk notes conflict with otherwise constructive local quant or momentum context.");
  if (!signal.ticker) missingSources.push("ticker signal context");
  if (!Number.isFinite(quantScore) || quantScore <= 0) missingSources.push("Quant Lens coverage");
  if (summary.freshnessStatus === "stale") missingSources.push("fresh Seeking Alpha AI report");

  const alignmentStatus = summary.freshnessStatus === "stale"
    ? "insufficient-data"
    : disagreementPoints.length
      ? "conflicting"
      : agreementPoints.some((point) => /risk/i.test(point))
        ? "aligned-risk"
        : agreementPoints.length
          ? "aligned-support"
          : saRisky || saSupportive
            ? "mixed"
            : "insufficient-data";
  return {
    alignmentStatus,
    alignmentLabel: sourceAlignmentLabel(alignmentStatus),
    agreementPoints,
    disagreementPoints,
    missingSources,
    confidenceLabel: agreementPoints.length && !disagreementPoints.length ? "Medium" : missingSources.length >= 2 ? "Low" : "Limited",
    reviewPriorityNudge: alignmentStatus === "conflicting" || alignmentStatus === "aligned-risk" ? 0.08 : alignmentStatus === "aligned-support" ? 0.03 : 0,
    summary: sourceAlignmentSummary(alignmentStatus, summary)
  };
}

function buildCoverageRow({ ticker, holding, watchlistIdea, signal, summary, delta, imported }) {
  const relationshipStatus = holding?.marketValue && imported
    ? "owned"
    : watchlistIdea
      ? "watchlist"
      : signal?.ticker
        ? "signal-only"
        : summary.recordCount
          ? "unlinked-import"
          : "untracked";
  const warningCount = (summary.validationWarnings || []).length + (summary.redactionWarnings || []).length;
  const staleOnly = summary.recordCount && summary.staleCount === summary.recordCount;
  const coverageStatus = !summary.recordCount
    ? "missing"
    : staleOnly
      ? "stale"
      : warningCount
        ? "warning"
        : "imported";
  const alignment = buildSeekingAlphaAiSourceAlignment({ summary, signal, holding });
  const priorityScore = coveragePriority({ relationshipStatus, holding, summary, delta, warningCount, coverageStatus, alignment });
  const refreshPrompt = buildSeekingAlphaAiRefreshPrompt(ticker, relationshipStatus);
  return {
    ticker,
    name: holding?.name || watchlistIdea?.thesis || signal?.topHeadline || ticker,
    relationshipStatus,
    relationshipLabel: relationshipLabel(relationshipStatus),
    portfolioWeight: holding?.portfolioWeight || 0,
    marketValue: holding?.marketValue || 0,
    coverageStatus,
    coverageLabel: coverageLabel(coverageStatus),
    freshnessStatus: summary.freshnessStatus || "missing",
    latestReportType: summary.latestRecord?.sourceTypeLabel || "No report",
    latestDate: summary.latestDate || "",
    ageDays: summary.latestAgeDays,
    bullishCount: summary.bullishPoints?.length || 0,
    bearishCount: summary.bearishPoints?.length || 0,
    warningCount,
    priorityScore,
    reason: coverageReason({ relationshipStatus, coverageStatus, summary, delta, alignment }),
    href: `#/ticker/${encodeURIComponent(ticker)}`,
    importHref: "#data-sources",
    alphaHref: "#alpha",
    summary,
    delta,
    alignment,
    alignmentStatus: alignment.alignmentStatus,
    alignmentLabel: alignment.alignmentLabel,
    changeStatus: delta.changeStatus || "missing",
    changeLabel: delta.changeLabel || "Missing research",
    refreshPrompt
  };
}

function summarizeCoverageRows(rows = []) {
  const ownedRows = rows.filter((row) => row.relationshipStatus === "owned");
  const watchlistRows = rows.filter((row) => row.relationshipStatus === "watchlist");
  return {
    totalRows: rows.length,
    ownedCount: ownedRows.length,
    ownedCoveredCount: ownedRows.filter((row) => row.coverageStatus !== "missing").length,
    ownedMissingCount: ownedRows.filter((row) => row.coverageStatus === "missing").length,
    staleCount: rows.filter((row) => row.coverageStatus === "stale").length,
    warningCount: rows.filter((row) => row.warningCount > 0).length,
    watchlistCoveredCount: watchlistRows.filter((row) => row.coverageStatus !== "missing").length,
    unlinkedImportCount: rows.filter((row) => row.relationshipStatus === "unlinked-import").length,
    changedCount: rows.filter((row) => !["missing", "new", "unchanged", "insufficient-history"].includes(row.changeStatus)).length,
    conflictingCount: rows.filter((row) => row.alignmentStatus === "conflicting").length,
    topReviewTicker: rows[0]?.ticker || ""
  };
}

function summarizeHoldings(holdings = []) {
  const map = new Map();
  holdings.forEach((holding) => {
    const ticker = normalizeTicker(holding.ticker);
    if (!ticker || Number(holding.marketValue) <= 0 || /cash/i.test(`${holding.assetClass} ${holding.name}`)) return;
    const current = map.get(ticker) || {
      ...holding,
      ticker,
      marketValue: 0,
      portfolioWeight: 0,
      name: holding.name,
      riskLevel: holding.riskLevel
    };
    current.marketValue += Number(holding.marketValue) || 0;
    current.portfolioWeight += Number(holding.portfolioWeight) || 0;
    if (/very high|high/i.test(holding.riskLevel || "")) current.riskLevel = holding.riskLevel;
    map.set(ticker, current);
  });
  return map;
}

function coveragePriority({ relationshipStatus, holding, summary, delta, warningCount, coverageStatus, alignment }) {
  const relationship = relationshipStatus === "owned" ? 42 : relationshipStatus === "watchlist" ? 28 : relationshipStatus === "unlinked-import" ? 18 : 12;
  const weight = Math.min(18, Number(holding?.portfolioWeight || 0) * 120);
  const stale = coverageStatus === "stale" ? 16 : 0;
  const missing = coverageStatus === "missing" && relationshipStatus === "owned" ? 20 : coverageStatus === "missing" ? 8 : 0;
  const risk = Math.min(16, (summary.bearishPoints?.length || 0) * 4 + Number(summary.riskScore || 0) * 10);
  const warnings = Math.min(8, warningCount * 3);
  const changed = ["deteriorating-context", "mixed-context"].includes(delta.changeStatus) ? 12 : delta.changeStatus === "improving-context" ? 5 : 0;
  const conflict = alignment.alignmentStatus === "conflicting" ? 12 : alignment.alignmentStatus === "aligned-risk" ? 8 : 0;
  return Math.round(Math.max(0, Math.min(100, relationship + weight + stale + missing + risk + warnings + changed + conflict)));
}

function coverageReason({ relationshipStatus, coverageStatus, summary, delta, alignment }) {
  if (coverageStatus === "missing") return relationshipStatus === "owned"
    ? "Owned holding has no saved Seeking Alpha AI personal-import context."
    : "No saved Seeking Alpha AI personal-import context is linked to this ticker.";
  if (coverageStatus === "stale") return "Saved Seeking Alpha AI context is stale; refresh manually before relying on it.";
  if (delta.changeStatus === "deteriorating-context" || delta.changeStatus === "mixed-context") return delta.summary;
  if (alignment.alignmentStatus === "conflicting") return alignment.summary;
  if (summary.bearishPoints?.length) return `${summary.bearishPoints.length} imported risk point${summary.bearishPoints.length === 1 ? "" : "s"} should be reviewed against current thesis.`;
  return summary.summary || "Saved Seeking Alpha AI personal-import context is available.";
}

function relationshipLabel(status = "") {
  return ({
    owned: "Owned",
    watchlist: "Watchlist",
    "signal-only": "Signal-only",
    "unlinked-import": "Unlinked import",
    untracked: "Untracked"
  })[status] || "Untracked";
}

function coverageLabel(status = "") {
  return ({
    missing: "Missing",
    imported: "Imported",
    stale: "Stale",
    warning: "Warning"
  })[status] || "Missing";
}

function sourceAlignmentLabel(status = "") {
  return ({
    "aligned-support": "Aligned support",
    "aligned-risk": "Aligned risk",
    mixed: "Mixed",
    conflicting: "Conflicting",
    "insufficient-data": "Insufficient data"
  })[status] || "Insufficient data";
}

function sourceAlignmentSummary(status = "", summary = {}) {
  if (status === "aligned-support") return "Imported SA AI support is directionally aligned with available local signals.";
  if (status === "aligned-risk") return "Imported SA AI risk notes align with elevated local review-priority context.";
  if (status === "conflicting") return "Imported SA AI context conflicts with at least one local signal; inspect the ticker page before relying on it.";
  if (status === "mixed") return "Imported SA AI context is useful but not clearly aligned with other loaded signals.";
  if (summary.freshnessStatus === "stale") return "Imported SA AI context is stale, so alignment confidence is limited.";
  return "There is not enough imported and local signal context to compare sources.";
}

function buildSeekingAlphaAiRefreshPrompt(ticker = "", relationshipStatus = "untracked") {
  const scope = relationshipStatus === "owned" ? "an owned position" : relationshipStatus === "watchlist" ? "a watchlist idea" : "a tracked ticker";
  return `Ask Seeking Alpha: For ${ticker}, summarize the current bull case, bear case, key valuation/factor-grade context, recent rating changes, and what would invalidate the thesis. Keep it concise for ${scope}.`;
}
