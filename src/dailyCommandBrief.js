import { normalizeTicker } from "./portfolioSchema.js";
import { isRealPortfolioUiState } from "./portfolioState.js";
import { summarizeRedditMentions } from "./redditSignals.js";
import { summarizeXUpdates } from "./xUpdatesProvider.js";
import { eventSourceLabel, eventTypeLabel, upcomingCalendarEvents } from "./eventCalendar.js";
import { DATA_MODES, dataModeLabel, marketDataMode } from "./dataModes.js";
import { buildSeekingAlphaAiCoverageQueue } from "./seekingAlphaAiCoverage.js";

export const DAILY_BRIEF_GROUPS = Object.freeze({
  ACTION: "Action needed",
  WATCH: "Watch closely",
  INFO: "Informational"
});

const GROUP_ORDER = Object.freeze([
  DAILY_BRIEF_GROUPS.ACTION,
  DAILY_BRIEF_GROUPS.WATCH,
  DAILY_BRIEF_GROUPS.INFO
]);

export function buildDailyCommandBrief({
  analysis = {},
  tickerSignals = [],
  marketDrivers = null,
  xUpdates = [],
  redditMentions = [],
  politicianTrades = [],
  seekingAlphaAiRecords = [],
  providerReadiness = {},
  marketDataStatus = {},
  targetPlan = null,
  thesisRows = [],
  eventCalendar = [],
  portfolioDataQuality = {},
  uiState = "SAMPLE_MODE",
  asOf = new Date().toISOString()
} = {}) {
  const calendarItems = eventCalendarItems(eventCalendar, asOf);
  const imported = isImportedState(uiState);
  const baseItems = imported
    ? [
        portfolioValueItem(analysis, marketDataStatus),
        ...alertItems(analysis.alerts || []),
        ...topMoverItems(analysis.holdings || [], marketDataStatus),
        ...dailyMoveCoverageItems(analysis.holdings || [], marketDataStatus),
        ...marketDriverItems(marketDrivers),
        ...targetDriftItems(targetPlan),
        ...tickerSignalItems(tickerSignals, analysis),
        ...xAccelerationItems(xUpdates, analysis, asOf),
        ...redditAccelerationItems(redditMentions, analysis, asOf),
        ...politicianTradeItems(politicianTrades, analysis, tickerSignals),
        ...seekingAlphaAiItems(seekingAlphaAiRecords, analysis, tickerSignals, asOf),
        ...(calendarItems.length ? calendarItems : earningsItems(analysis.holdings || [], thesisRows, asOf)),
        ...dataSourceItems(providerReadiness, marketDataStatus, portfolioDataQuality)
      ]
    : preImportItems(uiState, marketDataStatus);

  const items = dedupeItems(baseItems).sort(compareItems);
  const grouped = groupItems(items);
  const headline = imported ? buildHeadline(grouped, analysis, marketDataStatus) : preImportHeadline(uiState);

  return {
    generatedAt: asOf,
    uiState,
    sourceMode: imported ? dataModeLabel(DATA_MODES.IMPORTED) : uiState === "SAMPLE_MODE" ? dataModeLabel(DATA_MODES.SAMPLE) : dataModeLabel(DATA_MODES.NO_DATA),
    statusLabel: imported ? dataModeLabel(DATA_MODES.IMPORTED) : uiState === "SAMPLE_MODE" ? dataModeLabel(DATA_MODES.SAMPLE) : dataModeLabel(DATA_MODES.NO_DATA),
    headline,
    summary: {
      totalValue: imported ? Number(analysis.overview?.totalValue) || 0 : 0,
      dailyChange: imported ? Number(analysis.overview?.dailyChange) || 0 : 0,
      dailyChangePercent: imported ? Number(analysis.overview?.dailyChangePercent) || 0 : 0,
      actionCount: grouped[DAILY_BRIEF_GROUPS.ACTION].length,
      watchCount: grouped[DAILY_BRIEF_GROUPS.WATCH].length,
      infoCount: grouped[DAILY_BRIEF_GROUPS.INFO].length,
      marketDataLabel: marketDataLabel(marketDataStatus),
      dailyMoveCoverage: imported ? dailyMoveCoverage(analysis.holdings || []) : null
    },
    groups: grouped,
    items
  };
}

function preImportItems(uiState, marketDataStatus) {
  const sample = uiState === "SAMPLE_MODE";
  return [
    briefItem({
      id: "daily:no-real-portfolio",
      group: DAILY_BRIEF_GROUPS.ACTION,
      title: sample ? "Sample data is loaded" : "Import your portfolio to start the daily brief",
      detail: sample
        ? "The app can demonstrate the workflow, but portfolio numbers should not be treated as Tucker's real holdings."
        : "Load a Fidelity CSV or local holdings file before relying on portfolio-specific alerts.",
      reason: "The Daily Command Brief needs real imported holdings before it can prioritize Tucker-specific exposure.",
      href: "#imports",
      actionLabel: "Import portfolio",
      dataStatus: sample ? dataModeLabel(DATA_MODES.SAMPLE) : dataModeLabel(DATA_MODES.NO_DATA)
    }),
    briefItem({
      id: "daily:local-safety",
      group: DAILY_BRIEF_GROUPS.INFO,
      title: "Local-first safety is active",
      detail: "No passwords, scraping, cloud sync, or brokerage credentials are required for this workflow.",
      reason: "This keeps the dashboard useful before live providers are configured.",
      href: "#data-sources",
      actionLabel: "Review sources",
      dataStatus: marketDataLabel(marketDataStatus)
    })
  ];
}

function portfolioValueItem(analysis, marketDataStatus) {
  const overview = analysis.overview || {};
  const totalValue = Number(overview.totalValue) || 0;
  const dailyChange = Number(overview.dailyChange) || 0;
  const dailyChangePercent = Number(overview.dailyChangePercent) || 0;
  return briefItem({
    id: "daily:portfolio-value-change",
    group: DAILY_BRIEF_GROUPS.INFO,
    kind: "portfolio-value",
    title: "Portfolio value change",
    detail: `${formatCurrency(totalValue)} total value; ${formatSignedCurrency(dailyChange)} today (${formatSignedPct(dailyChangePercent)}).`,
    reason: "This is the high-level daily move from current imported holdings and available market-data context.",
    href: "#holdings",
    actionLabel: "Open holdings",
    dataStatus: marketDataLabel(marketDataStatus),
    priority: Math.min(74, 44 + Math.abs(dailyChangePercent) * 500)
  });
}

function alertItems(alerts = []) {
  return alerts
    .filter((alert) => ["critical", "warning", "high"].includes(String(alert.severity || "").toLowerCase()) || /Critical Review|Review/i.test(alert.actionCategory || ""))
    .slice(0, 6)
    .map((alert, index) => {
      const ticker = normalizeTicker(alert.ticker);
      return briefItem({
        id: `daily:alert:${alert.id || index}`,
        group: /critical|warning|review|high/i.test(`${alert.severity} ${alert.actionCategory}`) ? DAILY_BRIEF_GROUPS.ACTION : DAILY_BRIEF_GROUPS.WATCH,
        kind: "alert",
        title: alert.title || "Portfolio alert",
        detail: alert.detail || "Review the alert details before changing position size.",
        reason: "Generated by local in-app alert rules from holdings, thresholds, source health, and signal context.",
        href: ticker && ticker !== "LEVERAGE" ? tickerHref(ticker) : "#alerts",
        ticker,
        actionLabel: alert.actionCategory || "Review",
        dataStatus: alert.sourceMode || "Local rule",
        priority: 92 - index * 2 + severityBonus(alert)
      });
    });
}

function topMoverItems(holdings = [], marketDataStatus = {}) {
  const movers = holdings
    .filter((holding) => Math.abs(Number(holding.dailyChange) || 0) > 0 || Math.abs(Number(holding.dailyChangePercent) || 0) > 0)
    .map((holding) => ({
      holding,
      amount: Number(holding.dailyChange) || 0,
      percent: Number(holding.dailyChangePercent) || 0
    }));
  const gainers = movers.filter((row) => row.amount > 0 || row.percent > 0)
    .sort((a, b) => b.amount - a.amount || b.percent - a.percent)
    .slice(0, 2);
  const losers = movers.filter((row) => row.amount < 0 || row.percent < 0)
    .sort((a, b) => a.amount - b.amount || a.percent - b.percent)
    .slice(0, 2);
  const selectedMovers = [...gainers, ...losers];
  if (!selectedMovers.length && dailyMoveEligibleHoldings(holdings).length) {
    return [briefItem({
      id: "daily:movers:not-loaded",
      group: DAILY_BRIEF_GROUPS.INFO,
      kind: "data-coverage",
      title: "No position-level daily movers loaded",
      detail: "Imported holdings are active, but no holding has a usable daily movement field yet.",
      reason: "Refresh market data or import a CSV with daily gain/loss columns before reading top movers.",
      href: "#data-sources",
      actionLabel: "Check sources",
      dataStatus: marketDataLabel(marketDataStatus),
      priority: 28
    })];
  }
  return selectedMovers.map((row, index) => {
    const ticker = normalizeTicker(row.holding.ticker);
    const direction = row.amount >= 0 ? "gainer" : "decliner";
    return briefItem({
      id: `daily:mover:${ticker}:${direction}`,
      group: Math.abs(row.percent) >= 0.05 ? DAILY_BRIEF_GROUPS.WATCH : DAILY_BRIEF_GROUPS.INFO,
      kind: "top-mover",
      title: `${ticker || row.holding.name} is a top ${direction}`,
      detail: `${formatSignedCurrency(row.amount)} today (${formatSignedPct(row.percent)}).`,
      reason: "Top movers help separate position-level changes from broader portfolio noise.",
      href: ticker ? tickerHref(ticker) : "#holdings",
      ticker,
      actionLabel: "Inspect move",
      dataStatus: holdingDailyMoveDataLabel(row.holding, marketDataStatus),
      priority: 72 - index + Math.abs(row.percent) * 300
    });
  });
}

function dailyMoveCoverageItems(holdings = [], marketDataStatus = {}) {
  const coverage = dailyMoveCoverage(holdings);
  if (!coverage.eligibleCount || !coverage.missingCount) return [];
  const missingTickers = coverage.missingTickers.slice(0, 5).join(", ");
  return [briefItem({
    id: "daily:data-coverage:daily-move",
    group: DAILY_BRIEF_GROUPS.INFO,
    kind: "data-coverage",
    title: `${coverage.missingCount} holding${coverage.missingCount === 1 ? "" : "s"} missing daily move data`,
    detail: `${coverage.coveredCount}/${coverage.eligibleCount} eligible holdings have usable daily movement. Missing: ${missingTickers || "unlabeled holdings"}.`,
    reason: "The brief can still rank risks, but top gainer/loser context is incomplete until market data or daily gain/loss columns are available.",
    href: "#data-sources",
    actionLabel: "Check sources",
    dataStatus: marketDataLabel(marketDataStatus),
    priority: 24
  })];
}

function dailyMoveCoverage(holdings = []) {
  const eligible = dailyMoveEligibleHoldings(holdings);
  const covered = eligible.filter((holding) => hasDailyMovement(holding));
  const missing = eligible.filter((holding) => !hasDailyMovement(holding));
  return {
    eligibleCount: eligible.length,
    coveredCount: covered.length,
    missingCount: missing.length,
    coveragePercent: eligible.length ? covered.length / eligible.length : 0,
    missingTickers: missing.map((holding) => normalizeTicker(holding.ticker) || holding.name || "Holding")
  };
}

function marketDriverItems(marketDrivers = null) {
  if (!marketDrivers?.broadMarket || !marketDrivers?.aiTech) return [];
  return [marketDrivers.broadMarket, marketDrivers.aiTech].map((scope, index) => briefItem({
    id: `daily:market-driver:${scope.id}`,
    group: scope.confidenceScore >= 70 && scope.direction !== "unknown" ? DAILY_BRIEF_GROUPS.WATCH : DAILY_BRIEF_GROUPS.INFO,
    kind: "market-driver",
    title: `${scope.label}: ${scope.directionLabel}`,
    detail: `${scope.summary} Confidence: ${scope.confidenceLabel}.`,
    reason: "Market Drivers is a source-labeled explanation of likely broad-market and AI/tech contributors using market data, social attention, disclosures, and event read-throughs.",
    href: "#market-drivers",
    actionLabel: "Explain move",
    dataStatus: scope.sourceStatus || marketDrivers.sourceStatus || "Source-labeled",
    priority: 70 - index * 2 + Math.min(16, Number(scope.confidenceScore || 0) / 8)
  }));
}

function dailyMoveEligibleHoldings(holdings = []) {
  return (holdings || []).filter((holding) =>
    Number(holding.marketValue) > 0 &&
    !holding.cash &&
    holding.assetClass !== "Cash" &&
    !isCashLikeBriefHolding(holding) &&
    holding.marketDataEligible !== false &&
    !holding.localIdentifier
  );
}

function hasDailyMovement(holding = {}) {
  return Number.isFinite(Number(holding.dailyChange)) ||
    Number.isFinite(Number(holding.dailyChangePercent)) ||
    Boolean(holding.marketDataAppliedToDailyChange || holding.marketDataPrice || holding.lastPrice);
}

function isCashLikeBriefHolding(holding = {}) {
  const text = `${holding.ticker || ""} ${holding.name || ""} ${holding.assetClass || ""}`.toLowerCase();
  return /\bcash\b|money market|treasury|spaxx|fdrxx|core position|settlement/.test(text);
}

function holdingDailyMoveDataLabel(holding = {}, marketDataStatus = {}) {
  const text = `${holding.marketDataStatus || ""} ${holding.dailyChangeSource || ""} ${holding.marketDataMode || ""}`.toLowerCase();
  if (holding.marketDataIsMock || /mock|sample/.test(text)) return `${dataModeLabel(DATA_MODES.SAMPLE)} market data`;
  if (/missing|partial/.test(text)) return `${dataModeLabel(DATA_MODES.PARTIAL)} market data`;
  if (/rate/.test(text)) return `${dataModeLabel(DATA_MODES.RATE_LIMITED)} market data`;
  if (/stale/.test(text)) return `${dataModeLabel(DATA_MODES.STALE)} market data`;
  if (/cached/.test(text)) return `${dataModeLabel(DATA_MODES.CACHED)} market data`;
  if (holding.marketDataAppliedToDailyChange || /provider|live|connected|finnhub|financial modeling prep/.test(text)) return marketDataLabel(marketDataStatus);
  return `${dataModeLabel(DATA_MODES.IMPORTED)} daily move`;
}

function targetDriftItems(targetPlan = null) {
  const rows = (targetPlan?.rows || [])
    .filter((row) => row.scope === "ticker")
    .map((row) => ({
      ...row,
      absDriftValue: Math.abs(Number(row.driftValue) || 0),
      absDriftWeight: Math.abs(Number(row.driftWeight) || 0)
    }))
    .filter((row) => row.absDriftValue > 0 || row.absDriftWeight > 0)
    .sort((a, b) => b.absDriftValue - a.absDriftValue || b.absDriftWeight - a.absDriftWeight)
    .slice(0, 3);
  if (!rows.length) {
    return [briefItem({
      id: "daily:weight-history-missing",
      group: DAILY_BRIEF_GROUPS.INFO,
      kind: "missing-history",
      title: "Position weight change history is not stored yet",
      detail: "The brief uses current target drift and daily moves until prior-day portfolio snapshots are added.",
      reason: "This avoids pretending the app has historical position-weight change data it has not collected.",
      href: "#targets",
      actionLabel: "Review targets",
      dataStatus: "Missing history",
      priority: 22
    })];
  }
  return rows.map((row, index) => {
    const ticker = normalizeTicker(row.key);
    const action = row.suggestedAction || (row.driftWeight > 0 ? "Review trim" : "Review add");
    return briefItem({
      id: `daily:target-drift:${ticker}`,
      group: row.absDriftWeight >= 0.025 ? DAILY_BRIEF_GROUPS.ACTION : DAILY_BRIEF_GROUPS.WATCH,
      kind: "target-drift",
      title: `Largest target drift: ${ticker}`,
      detail: `Current ${formatPct(row.currentWeight)} vs target ${formatPct(row.targetWeight)}; drift ${formatSignedPct(row.driftWeight)} (${formatSignedCurrency(row.driftValue)}).`,
      reason: "This is a review prompt from target weights, not an instruction to trade.",
      href: "#targets",
      ticker,
      actionLabel: action,
      dataStatus: "Imported/local",
      priority: 82 - index + row.absDriftWeight * 250
    });
  });
}

function tickerSignalItems(tickerSignals = [], analysis = {}) {
  const ownedTickers = new Set((analysis.holdings || []).map((holding) => normalizeTicker(holding.ticker)).filter(Boolean));
  return [...tickerSignals]
    .filter((signal) => isOwnedTickerSignal(signal, ownedTickers))
    .sort((a, b) => (Number(b.combinedScore) || 0) - (Number(a.combinedScore) || 0) || String(a.ticker).localeCompare(String(b.ticker)))
    .slice(0, 4)
    .map((signal, index) => {
      const ticker = normalizeTicker(signal.ticker);
      const score = Number(signal.combinedScore) || 0;
      const guardrail = signal.sourceTrustCapReason
        ? ` Source guardrail: ${signal.sourceTrustCapReason}`
        : "";
      return briefItem({
        id: `daily:ticker-signal:${ticker}`,
        group: score >= 80 ? DAILY_BRIEF_GROUPS.WATCH : DAILY_BRIEF_GROUPS.INFO,
        kind: "ticker-signal",
        title: `${ticker} has one of the highest signal scores`,
        detail: `${score}/100 review-priority score, not a prediction. ${signal.explanation || signal.topHeadline || "Score layers are available on the ticker page."}${guardrail}`,
        reason: "The score combines local market context, social/disclosure flow, ownership, concentration, and thesis inputs. Social and federal disclosure flow stays low-trust unless confirmed by market data, primary sources, or thesis evidence.",
        href: tickerHref(ticker),
        ticker,
        actionLabel: score >= 80 ? "Watch closely" : "Log signal",
        dataStatus: signal.sourceLabel || signal.sourceMode || "Sample/local score",
        priority: 70 - index + score / 4
      });
    });
}

function isOwnedTickerSignal(signal = {}, ownedTickers = new Set()) {
  const ticker = normalizeTicker(signal.ticker);
  if (!ticker) return false;
  if (signal.portfolioOwnershipFlag === true) return true;
  if (signal.portfolioOwnershipFlag === false) return false;
  return ownedTickers.has(ticker);
}

function redditAccelerationItems(redditMentions = [], analysis = {}, asOf) {
  const tracked = trackedTickerSet(analysis);
  const sourceByTicker = socialSourceByTicker(redditMentions);
  return summarizeRedditMentions(redditMentions, { asOf })
    .filter((row) => tracked.has(row.ticker) && (Number(row.mentionAcceleration ?? row.mentionGrowth) || 0) > 0)
    .sort((a, b) => (Number(b.mentionAcceleration ?? b.mentionGrowth) || 0) - (Number(a.mentionAcceleration ?? a.mentionGrowth) || 0) || a.ticker.localeCompare(b.ticker))
    .slice(0, 3)
    .map((row, index) => {
      const source = sourceByTicker.get(row.ticker) || socialSourceSummary();
      const realUpdate = !source.sample;
      return briefItem({
        id: `daily:reddit:${row.ticker}`,
        group: realUpdate ? DAILY_BRIEF_GROUPS.WATCH : DAILY_BRIEF_GROUPS.INFO,
        kind: "reddit-acceleration",
        title: `${row.ticker} Reddit mentions accelerated`,
        detail: `${row.oneDayMentions} one-day, ${row.sevenDayMentions} seven-day, ${row.thirtyDayMentions} thirty-day mentions.`,
        reason: realUpdate
          ? "Source-labeled social data can explain attention shifts, but it stays lower trust than filings, company releases, and price action."
          : "Sample social rows demonstrate the pipeline only; do not treat them as real outside chatter.",
        href: tickerHref(row.ticker),
        ticker: row.ticker,
        actionLabel: realUpdate ? "Monitor chatter" : "Log chatter",
        dataStatus: source.label,
        priority: (realUpdate ? 64 : 36) - index + (Number(row.mentionAcceleration ?? row.mentionGrowth) || 0) * (realUpdate ? 15 : 6)
      });
    });
}

function xAccelerationItems(xUpdates = [], analysis = {}, asOf) {
  const tracked = trackedTickerSet(analysis);
  const sourceByTicker = xSourceByTicker(xUpdates);
  return summarizeXUpdates(xUpdates, { asOf })
    .filter((row) => tracked.has(row.ticker) && (Number(row.oneDayMentions) || Number(row.sevenDayMentions) || 0) > 0)
    .sort((a, b) => (Number(b.totalEngagement) || 0) - (Number(a.totalEngagement) || 0) || (Number(b.sevenDayMentions) || 0) - (Number(a.sevenDayMentions) || 0) || a.ticker.localeCompare(b.ticker))
    .slice(0, 3)
    .map((row, index) => {
      const source = sourceByTicker.get(row.ticker) || xSourceSummary();
      const realUpdate = !source.sample;
      return briefItem({
        id: `daily:x:${row.ticker}`,
        group: realUpdate ? DAILY_BRIEF_GROUPS.WATCH : DAILY_BRIEF_GROUPS.INFO,
        kind: "x-social",
        title: `${row.ticker} has X/social attention`,
        detail: `${row.oneDayMentions} one-day, ${row.sevenDayMentions} seven-day, ${row.thirtyDayMentions} thirty-day updates; engagement ${formatNumber(row.totalEngagement)}.`,
        reason: realUpdate
          ? "X/social updates can flag attention shifts, but they are lower-trust than filings, company releases, and price action."
          : "Sample X/social rows demonstrate the pipeline only; do not treat them as real outside chatter.",
        href: tickerHref(row.ticker),
        ticker: row.ticker,
        actionLabel: realUpdate ? "Monitor chatter" : "Log chatter",
        dataStatus: source.label,
        priority: (realUpdate ? 58 : 30) - index + Math.min(10, (Number(row.totalEngagement) || 0) / 20)
      });
    });
}

function politicianTradeItems(politicianTrades = [], analysis = {}, tickerSignals = []) {
  const tracked = trackedTickerSet(analysis, tickerSignals);
  const bestByTicker = new Map();
  politicianTrades.forEach((trade) => {
    const ticker = normalizeTicker(trade.ticker);
    if (!ticker || !tracked.has(ticker)) return;
    const score = (Number(trade.recencyScore) || 0) * 0.55 + (Number(trade.sizeScore) || 0) * 0.35 + (Number(trade.clusterScore) || 0) * 0.1;
    const current = bestByTicker.get(ticker);
    if (!current || score > current.score) bestByTicker.set(ticker, { trade, ticker, score });
  });
  return [...bestByTicker.values()]
    .sort((a, b) => b.score - a.score || a.ticker.localeCompare(b.ticker))
    .slice(0, 3)
    .map(({ trade, ticker, score }, index) => {
      const source = disclosureSourceSummary(trade);
      const realUpdate = !source.sample;
      return briefItem({
        id: `daily:politician:${ticker}`,
        group: realUpdate ? DAILY_BRIEF_GROUPS.WATCH : DAILY_BRIEF_GROUPS.INFO,
        kind: "politician-trade",
        title: `${ticker} matched a disclosure row`,
        detail: `${trade.politicianName || "A politician"} reported a ${trade.transactionType || "transaction"} in ${trade.assetName || ticker}.`,
        reason: realUpdate
          ? "Source-labeled disclosure data can change the review queue, but disclosures are delayed and do not imply intent."
          : "Sample disclosure rows demonstrate the pipeline only; use real imported or public rows for portfolio review.",
        href: tickerHref(ticker),
        ticker,
        actionLabel: realUpdate ? "Review disclosure" : "Log disclosure",
        dataStatus: source.label,
        priority: (realUpdate ? 62 : 34) - index + score * (realUpdate ? 25 : 8)
      });
    });
}

function seekingAlphaAiItems(records = [], analysis = {}, tickerSignals = [], asOf) {
  const queue = buildSeekingAlphaAiCoverageQueue({
    holdings: analysis.holdings || [],
    tickerSignals,
    seekingAlphaAiRecords: records,
    uiState: "IMPORTED_CLEAN",
    asOf
  });
  return queue.rows
    .filter((row) => row.relationshipStatus === "owned" && row.coverageStatus !== "missing")
    .slice(0, 3)
    .map((row, index) => {
      const staleOnly = row.coverageStatus === "stale";
      const changed = !["missing", "new", "unchanged", "insufficient-history"].includes(row.changeStatus);
      const hasRiskContext = row.bearishCount > 0 || row.alignmentStatus === "aligned-risk" || row.alignmentStatus === "conflicting";
      return briefItem({
        id: `daily:seeking-alpha-ai:${row.ticker}`,
        group: staleOnly ? DAILY_BRIEF_GROUPS.INFO : hasRiskContext || changed ? DAILY_BRIEF_GROUPS.WATCH : DAILY_BRIEF_GROUPS.INFO,
        kind: "seeking-alpha-ai",
        title: `${row.ticker} has imported Seeking Alpha AI context`,
        detail: changed ? row.delta.summary : row.reason,
        reason: "This is Tucker-imported Seeking Alpha AI personal research context. It is not live data, not independently verified by the app, and not a trading recommendation.",
        href: tickerHref(row.ticker),
        ticker: row.ticker,
        actionLabel: staleOnly ? "Check freshness" : changed ? "Review change" : "Review context",
        dataStatus: staleOnly ? "Stale Seeking Alpha AI import" : "Imported Seeking Alpha AI",
        priority: (staleOnly ? 38 : hasRiskContext ? 65 : changed ? 61 : 44) - index + (row.priorityScore || 0) / 5
      });
    });
}

function socialSourceByTicker(records = []) {
  const byTicker = new Map();
  records.forEach((record) => {
    const ticker = normalizeTicker(record.ticker);
    if (!ticker) return;
    const current = byTicker.get(ticker);
    const next = socialSourceSummary(record);
    if (!current || sourceRank(next) > sourceRank(current)) byTicker.set(ticker, next);
  });
  return byTicker;
}

function xSourceByTicker(records = []) {
  const byTicker = new Map();
  records.forEach((record) => {
    const ticker = normalizeTicker(record.ticker);
    if (!ticker) return;
    const current = byTicker.get(ticker);
    const next = xSourceSummary(record);
    if (!current || sourceRank(next) > sourceRank(current)) byTicker.set(ticker, next);
  });
  return byTicker;
}

function xSourceSummary(record = {}) {
  const text = `${record.sourceMode || ""} ${record.source || ""} ${record.providerId || ""}`.toLowerCase();
  if (record.liveProviderCalls || /\bx-api\b|\bapi\b/.test(text)) {
    return { label: "Live X API", sample: false, rank: 3 };
  }
  if (/local-file|local-x|import/.test(text)) {
    return { label: "Imported X/social", sample: false, rank: 2 };
  }
  return { label: "Sample X/social", sample: true, rank: 1 };
}

function socialSourceSummary(record = {}) {
  const text = `${record.sourceMode || ""} ${record.source || ""} ${record.providerId || ""}`.toLowerCase();
  if (record.liveProviderCalls || /\bapi\b|reddit-api/.test(text)) {
    return { label: "Live Reddit API", sample: false, rank: 3 };
  }
  if (/local-file|local-reddit|import/.test(text)) {
    return { label: "Imported Reddit", sample: false, rank: 2 };
  }
  return { label: "Sample Reddit", sample: true, rank: 1 };
}

function disclosureSourceSummary(trade = {}) {
  const text = `${trade.sourceMode || ""} ${trade.source || ""} ${trade.providerId || ""}`.toLowerCase();
  if (trade.liveProviderCalls || /public-static-dataset|senate-stock-watcher/.test(text)) {
    return { label: "Public disclosure dataset", sample: false, rank: 3 };
  }
  if (/local-file|local-politician|import/.test(text)) {
    return { label: "Imported disclosure", sample: false, rank: 2 };
  }
  return { label: "Sample disclosure", sample: true, rank: 1 };
}

function sourceRank(source = {}) {
  return Number(source.rank) || 0;
}

function earningsItems(holdings = [], thesisRows = [], asOf) {
  const asOfDate = new Date(asOf);
  if (Number.isNaN(asOfDate.getTime())) return [];
  const candidates = [
    ...holdings.map((holding) => ({ ticker: holding.ticker, date: holding.nextEarnings, source: "Holding data" })),
    ...thesisRows.map((row) => ({ ticker: row.ticker, date: row.earningsDate || row.nextEarnings, source: "Thesis data" }))
  ];
  const byTicker = new Map();
  candidates.forEach((candidate) => {
    const ticker = normalizeTicker(candidate.ticker);
    const days = daysUntil(candidate.date, asOfDate);
    if (!ticker || days === null || days < 0 || days > 30) return;
    const current = byTicker.get(ticker);
    if (!current || days < current.days) byTicker.set(ticker, { ...candidate, ticker, days });
  });
  return [...byTicker.values()]
    .sort((a, b) => a.days - b.days || a.ticker.localeCompare(b.ticker))
    .slice(0, 4)
    .map((event) => briefItem({
      id: `daily:earnings:${event.ticker}`,
      group: event.days <= 7 ? DAILY_BRIEF_GROUPS.WATCH : DAILY_BRIEF_GROUPS.INFO,
      kind: "upcoming-event",
      title: `${event.ticker} has an upcoming earnings date`,
      detail: `${event.days} day${event.days === 1 ? "" : "s"} until ${event.date}.`,
      reason: "Upcoming events can change risk, thesis review timing, and position sizing discussions.",
      href: tickerHref(event.ticker),
      ticker: event.ticker,
      actionLabel: "Check event",
      dataStatus: event.source,
      priority: 68 - event.days
    }));
}

function eventCalendarItems(events = [], asOf) {
  return upcomingCalendarEvents(events, { asOf, daysAhead: 30 })
    .slice(0, 5)
    .map((event, index) => {
      const ticker = normalizeTicker(event.ticker) || normalizeTicker(event.tickers?.[0] || "");
      const days = Number(event.daysUntil);
      const group = event.importance === "high" || days <= 7 ? DAILY_BRIEF_GROUPS.WATCH : DAILY_BRIEF_GROUPS.INFO;
      const titleTicker = ticker || "Portfolio";
      return briefItem({
        id: `daily:calendar:${event.id || index}`,
        group,
        kind: "upcoming-event",
        title: `${titleTicker} ${eventTypeLabel(event.eventType).toLowerCase()} on the calendar`,
        detail: `${event.title || "Upcoming event"} is ${days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`} (${event.date}).`,
        reason: event.summary || "Upcoming events can change risk, thesis review timing, and position sizing discussions.",
        href: ticker ? tickerHref(ticker) : "#calendar",
        ticker,
        actionLabel: event.importance === "high" ? "Watch event" : "Log event",
        dataStatus: eventSourceLabel(event.sourceMode, event.sourceLabel),
        priority: 69 - days + (event.importance === "high" ? 8 : event.importance === "medium" ? 3 : 0)
      });
    });
}

function dataSourceItems(providerReadiness = {}, marketDataStatus = {}, portfolioDataQuality = {}) {
  const items = [];
  const statusText = String(marketDataStatus.status || marketDataStatus.label || "").toLowerCase();
  if (/error|failed/.test(statusText)) {
    items.push(briefItem({
      id: "daily:data-source:market-error",
      group: DAILY_BRIEF_GROUPS.ACTION,
      kind: "data-source",
      title: "Market data provider needs review",
      detail: marketDataStatus.detail || "Market data returned an error. Treat price-sensitive output as unavailable.",
      reason: "The brief should not hide data-source errors that affect daily movement context.",
      href: "#data-sources",
      actionLabel: "Review source",
      dataStatus: "Error",
      priority: 95
    }));
  } else if (/rate limited|rate-limit|quota|429/.test(statusText)) {
    items.push(briefItem({
      id: "daily:data-source:market-rate-limited",
      group: DAILY_BRIEF_GROUPS.ACTION,
      kind: "data-source",
      title: "Market data is rate limited",
      detail: marketDataStatus.detail || "The live market data provider asked the dashboard to slow down. Cached data may still be usable.",
      reason: "Price-sensitive context should stay visible as rate limited instead of silently falling back to Sample data.",
      href: "#data-sources",
      actionLabel: "Review source",
      dataStatus: dataModeLabel(DATA_MODES.RATE_LIMITED),
      priority: 92
    }));
  } else if (/stale/.test(statusText)) {
    items.push(briefItem({
      id: "daily:data-source:market-stale",
      group: DAILY_BRIEF_GROUPS.ACTION,
      kind: "data-source",
      title: "Market data is stale",
      detail: marketDataStatus.detail || "Using stale cached market data.",
      reason: "Stale data can make daily change and signal context less reliable.",
      href: "#data-sources",
      actionLabel: "Review source",
      dataStatus: "Stale",
      priority: 90
    }));
  } else if (/mock|sample|not configured|configured-not-connected/.test(statusText)) {
    items.push(briefItem({
      id: "daily:data-source:market-mock",
      group: DAILY_BRIEF_GROUPS.INFO,
      kind: "data-source",
      title: "Market data not configured",
      detail: marketDataStatus.detail || "Sample or Not configured market data keeps the dashboard testable.",
      reason: "Daily movement context should be interpreted as sample/local unless a provider is connected.",
      href: "#data-sources",
      actionLabel: "Manage sources",
      dataStatus: marketDataLabel(marketDataStatus),
      priority: 34
    }));
  }

  const providerStatuses = Object.values(providerReadiness.providerStatuses || {});
  const disconnected = providerStatuses.filter((status) =>
    !status.liveProviderCalls && !status.configured && !/demo|mock/i.test(`${status.id} ${status.status}`)
  );
  if (disconnected.length) {
    items.push(briefItem({
      id: "daily:data-source:future-providers",
      group: DAILY_BRIEF_GROUPS.INFO,
      kind: "data-source",
      title: "Some provider paths are not configured",
      detail: `${disconnected.length} future provider path${disconnected.length === 1 ? "" : "s"} are available but not configured.`,
      reason: "This is expected for local-first mode and should not be treated as a broken dashboard.",
      href: "#data-sources",
      actionLabel: "Review sources",
      dataStatus: "Not configured",
      priority: 24
    }));
  }

  if (portfolioDataQuality.status && !/clean/i.test(portfolioDataQuality.status)) {
    items.push(briefItem({
      id: "daily:data-quality",
      group: /needs review|failed/i.test(portfolioDataQuality.status) ? DAILY_BRIEF_GROUPS.ACTION : DAILY_BRIEF_GROUPS.WATCH,
      kind: "data-quality",
      title: `Portfolio data quality: ${portfolioDataQuality.status}`,
      detail: portfolioDataQuality.message || "Review import health before relying on all metrics.",
      reason: "Import quality affects every downstream alert, signal, and exposure calculation.",
      href: "#imports",
      actionLabel: "Review import",
      dataStatus: dataModeLabel(DATA_MODES.IMPORTED),
      priority: 78
    }));
  }

  return items;
}

function briefItem({
  id,
  group,
  kind = "brief",
  title,
  detail,
  reason,
  href = "#overview",
  ticker = "",
  actionLabel = "Review",
  dataStatus = dataModeLabel(DATA_MODES.NOT_CONFIGURED),
  priority = 50
}) {
  return {
    id,
    group,
    kind,
    title,
    detail,
    reason,
    href,
    ticker: normalizeTicker(ticker),
    actionLabel,
    dataStatus,
    priority: Number(priority) || 0
  };
}

function groupItems(items = []) {
  const grouped = Object.fromEntries(GROUP_ORDER.map((group) => [group, []]));
  items.forEach((item) => {
    const group = grouped[item.group] ? item.group : DAILY_BRIEF_GROUPS.INFO;
    grouped[group].push(item);
  });
  return grouped;
}

function compareItems(a, b) {
  const groupDelta = GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group);
  if (groupDelta) return groupDelta;
  return b.priority - a.priority || String(a.title).localeCompare(String(b.title)) || String(a.id).localeCompare(String(b.id));
}

function dedupeItems(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.id || `${item.group}:${item.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildHeadline(groups, analysis, marketDataStatus) {
  const actionCount = groups[DAILY_BRIEF_GROUPS.ACTION].length;
  const watchCount = groups[DAILY_BRIEF_GROUPS.WATCH].length;
  const totalValue = Number(analysis.overview?.totalValue) || 0;
  const dailyChange = Number(analysis.overview?.dailyChange) || 0;
  if (actionCount) {
    return `${actionCount} item${actionCount === 1 ? "" : "s"} need review today. Portfolio value is ${formatCurrency(totalValue)} with ${formatSignedCurrency(dailyChange)} daily change (${marketDataLabel(marketDataStatus)}).`;
  }
  if (watchCount) {
    return `${watchCount} item${watchCount === 1 ? "" : "s"} to watch. Portfolio value is ${formatCurrency(totalValue)} with ${formatSignedCurrency(dailyChange)} daily change.`;
  }
  return `No urgent review items. Portfolio value is ${formatCurrency(totalValue)} with ${formatSignedCurrency(dailyChange)} daily change.`;
}

function preImportHeadline(uiState) {
  return uiState === "SAMPLE_MODE"
    ? "Sample data is loaded. Import Tucker's real portfolio before using this as a daily review."
    : "Import a portfolio to generate Tucker's Daily Command Brief.";
}

function trackedTickerSet(analysis = {}, tickerSignals = []) {
  return new Set([
    ...(analysis.holdings || []).map((holding) => holding.ticker),
    ...(tickerSignals || []).filter((signal) => signal.portfolioOwnershipFlag || signal.watchlistFlag).map((signal) => signal.ticker)
  ].map(normalizeTicker).filter(Boolean));
}

function tickerHref(ticker) {
  const normalized = normalizeTicker(ticker);
  return normalized ? `#/ticker/${encodeURIComponent(normalized)}` : "#holdings";
}

function severityBonus(alert = {}) {
  const text = `${alert.severity || ""} ${alert.actionCategory || ""}`.toLowerCase();
  if (/critical/.test(text)) return 8;
  if (/warning|review|high/.test(text)) return 4;
  return 0;
}

function daysUntil(dateValue, asOfDate) {
  if (!dateValue) return null;
  const date = new Date(`${String(dateValue).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const start = new Date(asOfDate);
  start.setHours(12, 0, 0, 0);
  return Math.round((date.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

function isImportedState(uiState = "") {
  return isRealPortfolioUiState(uiState);
}

function marketDataLabel(status = {}) {
  return `${dataModeLabel(marketDataMode(status))} market data`;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function formatSignedCurrency(value) {
  const numeric = Number(value) || 0;
  return `${numeric >= 0 ? "+" : ""}${formatCurrency(numeric)}`;
}

function formatPct(value) {
  return `${((Number(value) || 0) * 100).toFixed(1)}%`;
}

function formatSignedPct(value) {
  const numeric = Number(value) || 0;
  return `${numeric >= 0 ? "+" : ""}${formatPct(numeric)}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(value) || 0);
}
