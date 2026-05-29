import { normalizeTicker } from "./portfolioSchema.js";
import { summarizeRedditMentions } from "./redditSignals.js";

export const DEFAULT_ALERT_THRESHOLDS = Object.freeze({
  maxPositionWeight: 0.12,
  maxSectorWeight: 0.32,
  maxLeveragedWeight: 0.14,
  tickerSignalScore: 70,
  politicianTradeScore: 0.55,
  redditMentionAcceleration: 0.6,
  staleHours: 24,
  minActionDrift: 0.015,
  largeMovePercent: 0.05
});

export function normalizeAlertThresholds(value = {}) {
  return {
    maxPositionWeight: ratioThreshold(value.maxPositionWeight, DEFAULT_ALERT_THRESHOLDS.maxPositionWeight),
    maxSectorWeight: ratioThreshold(value.maxSectorWeight, DEFAULT_ALERT_THRESHOLDS.maxSectorWeight),
    maxLeveragedWeight: ratioThreshold(value.maxLeveragedWeight, DEFAULT_ALERT_THRESHOLDS.maxLeveragedWeight),
    tickerSignalScore: scoreThreshold100(value.tickerSignalScore, DEFAULT_ALERT_THRESHOLDS.tickerSignalScore),
    politicianTradeScore: scoreThreshold(value.politicianTradeScore, DEFAULT_ALERT_THRESHOLDS.politicianTradeScore),
    redditMentionAcceleration: scoreThreshold(value.redditMentionAcceleration, DEFAULT_ALERT_THRESHOLDS.redditMentionAcceleration),
    staleHours: positiveNumber(value.staleHours, DEFAULT_ALERT_THRESHOLDS.staleHours),
    minActionDrift: ratioThreshold(value.minActionDrift, DEFAULT_ALERT_THRESHOLDS.minActionDrift),
    largeMovePercent: ratioThreshold(value.largeMovePercent, DEFAULT_ALERT_THRESHOLDS.largeMovePercent)
  };
}

export function buildLocalAlerts({
  analysis = {},
  tickerSignals = [],
  politicianTrades = [],
  redditMentions = [],
  providerReadiness = {},
  marketDataStatus = {},
  targetPlan = null,
  thresholds = DEFAULT_ALERT_THRESHOLDS,
  watchlist = [],
  asOf = new Date().toISOString()
} = {}) {
  const settings = normalizeAlertThresholds(thresholds);
  const alerts = [
    ...buildPositionWeightAlerts(analysis, settings, asOf),
    ...buildSectorConcentrationAlerts(analysis, settings, asOf),
    ...buildLeveragedExposureAlerts(analysis, settings, asOf),
    ...buildTargetDriftAlerts(targetPlan, settings, asOf),
    ...buildTickerSignalAlerts(tickerSignals, settings, asOf, analysis),
    ...buildPoliticianTradeAlerts(analysis, politicianTrades, watchlist, settings, asOf),
    ...buildRedditAccelerationAlerts(analysis, redditMentions, watchlist, settings, asOf),
    ...buildDataSourceAlerts(providerReadiness, marketDataStatus, settings, asOf)
  ];

  return dedupeAlerts(alerts)
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, 36);
}

function buildTargetDriftAlerts(targetPlan, thresholds, asOf) {
  const rows = Array.isArray(targetPlan?.rows) ? targetPlan.rows : [];
  return rows
    .filter((row) => ["overweight", "underweight"].includes(row.status))
    .filter((row) => Math.abs(Number(row.driftWeight) || 0) >= thresholds.minActionDrift)
    .filter((row) => Math.abs(Number(row.driftValue) || 0) >= 25)
    .sort((a, b) => Math.abs(Number(b.driftWeight) || 0) - Math.abs(Number(a.driftWeight) || 0))
    .slice(0, 10)
    .map((row) => {
      const driftWeight = Number(row.driftWeight) || 0;
      const driftValue = Number(row.driftValue) || 0;
      const absDrift = Math.abs(driftWeight);
      const severity = absDrift >= thresholds.minActionDrift * 2 ? "warning" : "watch";
      const label = targetRowLabel(row);
      const direction = row.status === "overweight" ? "above" : "below";
      const actionCategory = severity === "warning" ? "Review" : "Monitor";
      return alert({
        id: `alert:target-drift:${row.scope}:${slug(row.key)}`,
        type: "target-allocation-drift",
        ruleId: "target-allocation-drift-above-threshold",
        severity,
        actionCategory,
        title: `${label} is ${row.status} versus target`,
        detail: `${label} is ${formatPct(row.currentWeight)} current versus ${formatPct(row.targetWeight)} target, ${direction} target by ${formatPct(absDrift)} (${formatCurrency(Math.abs(driftValue))}). Review the target plan; this is not a trade command.`,
        ticker: row.scope === "ticker" ? normalizeTicker(row.key) : undefined,
        source: "local-alert-engine",
        score: 62 + Math.round(Math.min(30, absDrift * 300)),
        createdAt: asOf,
        metadata: {
          scope: row.scope,
          key: row.key,
          currentWeight: row.currentWeight,
          targetWeight: row.targetWeight,
          driftWeight,
          driftValue,
          threshold: thresholds.minActionDrift,
          suggestedAction: row.suggestedAction
        }
      });
    });
}

function buildPositionWeightAlerts(analysis, thresholds, asOf) {
  const rows = aggregateHoldingsByTicker(analysis.holdings || []);
  return rows
    .filter((row) => row.assetClass !== "Cash" && row.portfolioWeight > thresholds.maxPositionWeight)
    .map((row) => {
      const severity = row.portfolioWeight >= thresholds.maxPositionWeight * 1.5 ? "critical" : "warning";
      return alert({
        id: `alert:position-weight:${row.ticker}`,
        type: "position-weight",
        ruleId: "position-weight-above-threshold",
        severity,
        actionCategory: severity === "critical" ? "Critical Review" : "Review",
        title: `${row.ticker} is above the position weight threshold`,
        detail: `${row.ticker} is ${formatPct(row.portfolioWeight)} of the portfolio. Current threshold: ${formatPct(thresholds.maxPositionWeight)}.`,
        ticker: row.ticker,
        source: "local-alert-engine",
        score: 70 + Math.round(row.portfolioWeight * 100),
        createdAt: asOf,
        metadata: { currentWeight: row.portfolioWeight, threshold: thresholds.maxPositionWeight }
      });
    });
}

function buildSectorConcentrationAlerts(analysis, thresholds, asOf) {
  return (analysis.breakdowns?.sector || [])
    .filter((sector) => sector.name !== "Cash" && sector.weight > thresholds.maxSectorWeight)
    .map((sector) => {
      const severity = sector.weight >= thresholds.maxSectorWeight * 1.35 ? "critical" : "warning";
      return alert({
        id: `alert:sector-concentration:${slug(sector.name)}`,
        type: "sector-concentration",
        ruleId: "sector-concentration-above-threshold",
        severity,
        actionCategory: severity === "critical" ? "Critical Review" : "Review",
        title: `${sector.name} exposure is above threshold`,
        detail: `${sector.name} is ${formatPct(sector.weight)} of the portfolio. Current threshold: ${formatPct(thresholds.maxSectorWeight)}.`,
        source: "local-alert-engine",
        score: 68 + Math.round(sector.weight * 100),
        createdAt: asOf,
        metadata: { currentWeight: sector.weight, threshold: thresholds.maxSectorWeight }
      });
    });
}

function buildLeveragedExposureAlerts(analysis, thresholds, asOf) {
  const totalValue = Number(analysis.overview?.totalValue) || 0;
  const directWeight = totalValue ? (Number(analysis.overview?.leveragedEtfExposure) || 0) / totalValue : 0;
  if (directWeight <= thresholds.maxLeveragedWeight) return [];
  const severity = directWeight >= thresholds.maxLeveragedWeight * 1.35 ? "critical" : "warning";
  return [alert({
    id: "alert:leveraged-etf-exposure",
    type: "leveraged-etf-exposure",
    ruleId: "leveraged-etf-exposure-above-threshold",
    severity,
    actionCategory: severity === "critical" ? "Critical Review" : "Review",
    title: "Leveraged ETF exposure is above threshold",
    detail: `${formatPct(directWeight)} direct leveraged ETF weight before notional exposure. Current threshold: ${formatPct(thresholds.maxLeveragedWeight)}.`,
    ticker: "LEVERAGE",
    source: "local-alert-engine",
    score: 72 + Math.round(directWeight * 100),
    createdAt: asOf,
    metadata: {
      currentWeight: directWeight,
      threshold: thresholds.maxLeveragedWeight,
      notionalExposure: Number(analysis.overview?.leveragedNotionalExposure) || 0
    }
  })];
}

function buildTickerSignalAlerts(tickerSignals, thresholds, asOf, analysis = {}) {
  const ownedTickers = new Set((analysis.holdings || []).map((holding) => normalizeTicker(holding.ticker)).filter(Boolean));
  return (tickerSignals || [])
    .filter((signal) => isOwnedTickerSignal(signal, ownedTickers))
    .filter((signal) => (Number(signal.combinedScore) || 0) >= thresholds.tickerSignalScore)
    .map((signal) => {
      const score = Number(signal.combinedScore) || 0;
      const severity = score >= Math.max(90, thresholds.tickerSignalScore + 15) ? "warning" : "watch";
      return alert({
        id: `alert:ticker-signal:${normalizeTicker(signal.ticker)}`,
        type: "ticker-signal",
        ruleId: "ticker-signal-score-above-threshold",
        severity,
        actionCategory: severity === "warning" ? "Review" : "Monitor",
        title: `${signal.ticker} signal score is elevated`,
        detail: `${signal.ticker} has a ${score}/100 ${tickerSignalSourcePhrase(signal)} review-priority score, not a prediction. ${signal.sourceTrustCapReason ? `Source guardrail: ${signal.sourceTrustCapReason} ` : ""}${signal.explanation || "Review the score layers before acting."}`,
        ticker: normalizeTicker(signal.ticker),
        source: "local-alert-engine",
        score,
        createdAt: asOf,
        metadata: {
          combinedScore: score,
          threshold: thresholds.tickerSignalScore,
          rawConfluenceScore: signal.rawConfluenceScore,
          sourceTrustCap: signal.sourceTrustCap,
          sourceTrustCapReason: signal.sourceTrustCapReason
        }
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

function tickerSignalSourcePhrase(signal = {}) {
  const text = `${signal.sourceMode || ""} ${signal.marketDataMode || ""} ${signal.marketDataStatus || ""} ${signal.marketDataSourceLabel || ""}`.toLowerCase();
  const explicitLive = signal.liveProviderCalls === true || /\b(live|connected)\b/.test(text);
  if (/stale/.test(text)) return "stale market-data-assisted";
  if (/cached/.test(text)) return "cached market-data-assisted";
  if (/partial|missing/.test(text)) return "partial market-data-assisted";
  if (explicitLive) return "live market-data-assisted";
  if (/imported/.test(text)) return "imported-data-assisted";
  return "sample/local";
}

function buildPoliticianTradeAlerts(analysis, politicianTrades, watchlist, thresholds, asOf) {
  const trackedTickers = trackedTickerSet(analysis, watchlist);
  const bestByTicker = new Map();
  (politicianTrades || []).forEach((trade) => {
    const ticker = normalizeTicker(trade.ticker);
    if (!ticker || !trackedTickers.has(ticker)) return;
    const score = tradeScore(trade);
    if (score < thresholds.politicianTradeScore) return;
    const current = bestByTicker.get(ticker);
    if (!current || score > current.score) bestByTicker.set(ticker, { trade, ticker, score });
  });

  return [...bestByTicker.values()].map(({ trade, ticker, score }) => alert({
    id: `alert:politician-trade:${ticker}`,
    type: "politician-trade-match",
    ruleId: "politician-trade-match-owned-watchlist",
    severity: score >= 0.8 ? "warning" : "watch",
    actionCategory: "Monitor",
    title: `${ticker} matched a local politician disclosure`,
    detail: `${trade.politicianName || "A disclosure row"} reported a ${trade.transactionType || "transaction"} in ${trade.assetName || ticker}. Disclosure rows are informational, delayed, and not trade commands.`,
    ticker,
    source: "local-alert-engine",
    score: Math.round(score * 100),
    createdAt: asOf,
    metadata: { disclosureScore: score, threshold: thresholds.politicianTradeScore, sourceMode: trade.sourceMode || trade.source || "local/mock" }
  }));
}

function buildRedditAccelerationAlerts(analysis, redditMentions, watchlist, thresholds, asOf) {
  const trackedTickers = trackedTickerSet(analysis, watchlist);
  return summarizeRedditMentions(redditMentions, { asOf })
    .filter((row) => trackedTickers.has(row.ticker) && (Number(row.mentionAcceleration ?? row.mentionGrowth) || 0) >= thresholds.redditMentionAcceleration)
    .map((row) => alert({
      id: `alert:reddit-acceleration:${row.ticker}`,
      type: "reddit-mention-acceleration",
      ruleId: "reddit-mention-acceleration-above-threshold",
      severity: "watch",
      actionCategory: "Monitor",
      title: `${row.ticker} Reddit mentions accelerated`,
      detail: `${row.oneDayMentions} one-day, ${row.sevenDayMentions} seven-day, ${row.thirtyDayMentions} thirty-day mentions. Social signals stay low trust until confirmed by better sources.`,
      ticker: row.ticker,
      source: "local-alert-engine",
      score: 50 + Math.round(Math.min(40, (Number(row.mentionAcceleration ?? row.mentionGrowth) || 0) * 20)),
      createdAt: asOf,
      metadata: {
        mentionAcceleration: Number(row.mentionAcceleration ?? row.mentionGrowth) || 0,
        threshold: thresholds.redditMentionAcceleration,
        sentiment: row.sentiment || "unknown"
      }
    }));
}

function buildDataSourceAlerts(providerReadiness, marketDataStatus, thresholds, asOf) {
  const alerts = [];
  const statusText = String(marketDataStatus?.status || marketDataStatus?.label || "").toLowerCase();
  if (/error|failed|unavailable/.test(statusText)) {
    alerts.push(alert({
      id: "alert:data-source:market-data-error",
      type: "data-source",
      ruleId: "errored-data-source",
      severity: "warning",
      actionCategory: "Review",
      title: "Market data provider needs review",
      detail: marketDataStatus?.detail || "Market data provider returned an error. Treat price-sensitive output as unavailable until the provider is healthy.",
      source: "local-alert-engine",
      score: 78,
      createdAt: asOf
    }));
  } else if (/stale/.test(statusText)) {
    alerts.push(alert({
      id: "alert:data-source:market-data-stale",
      type: "data-source",
      ruleId: "stale-data-source",
      severity: "warning",
      actionCategory: "Review",
      title: "Market data may be stale",
      detail: `${marketDataStatus.detail || "Market data is stale."} Stale threshold: ${thresholds.staleHours} hours.`,
      source: "local-alert-engine",
      score: 72,
      createdAt: asOf
    }));
  } else if (!marketDataStatus?.status || /not configured|mock|sample/.test(statusText)) {
    alerts.push(alert({
      id: "alert:data-source:market-data-not-configured",
      type: "data-source",
      ruleId: "disconnected-data-source",
      severity: "info",
      actionCategory: "Log Only",
      title: "Market data not configured",
      detail: marketDataStatus?.detail || "Quotes and ticker scores use sample/local data until Tucker approves a live provider.",
      source: "local-alert-engine",
      score: 20,
      createdAt: asOf
    }));
  }

  const statuses = [
    ...Object.values(providerReadiness?.providerStatuses || {}),
    ...Object.values(providerReadiness?.marketDataQuoteProviders || {})
  ];
  const staleProvider = statuses.find((status) => /stale|error/i.test(`${status.status || ""} ${status.warning || ""}`));
  if (staleProvider) {
    alerts.push(alert({
      id: `alert:data-source:${slug(staleProvider.id || staleProvider.label || "provider")}`,
      type: "data-source",
      ruleId: "stale-or-error-provider",
      severity: "warning",
      actionCategory: "Review",
      title: `${staleProvider.label || "Provider"} needs data-source review`,
      detail: staleProvider.warning || staleProvider.detail || "Provider status reported stale or error state.",
      source: "local-alert-engine",
      score: 76,
      createdAt: asOf
    }));
  }

  return alerts;
}

function aggregateHoldingsByTicker(holdings = []) {
  const rows = new Map();
  holdings.forEach((holding) => {
    const ticker = normalizeTicker(holding.ticker);
    if (!ticker) return;
    const current = rows.get(ticker) || {
      ticker,
      marketValue: 0,
      portfolioWeight: 0,
      assetClass: holding.assetClass,
      sector: holding.sector,
      riskLevel: holding.riskLevel
    };
    current.marketValue += Number(holding.marketValue) || 0;
    current.portfolioWeight += Number(holding.portfolioWeight) || 0;
    if (holding.assetClass !== "Cash") current.assetClass = holding.assetClass;
    rows.set(ticker, current);
  });
  return [...rows.values()];
}

function trackedTickerSet(analysis = {}, watchlist = []) {
  return new Set([
    ...(analysis.holdings || []).map((holding) => holding.ticker),
    ...(watchlist || [])
  ].map((ticker) => normalizeTicker(ticker)).filter(Boolean));
}

function tradeScore(trade = {}) {
  const recency = Number(trade.recencyScore) || 0;
  const size = Number(trade.sizeScore) || 0;
  const cluster = Number(trade.clusterScore) || 0;
  return clamp01(recency * 0.5 + size * 0.35 + cluster * 0.15);
}

function alert(payload) {
  return {
    ...payload,
    status: payload.status || "active"
  };
}

function dedupeAlerts(alerts = []) {
  const rows = new Map();
  alerts.forEach((alertItem) => {
    const current = rows.get(alertItem.id);
    if (!current || severityRank(alertItem.severity) > severityRank(current.severity) || alertItem.score > current.score) {
      rows.set(alertItem.id, alertItem);
    }
  });
  return [...rows.values()];
}

function severityRank(severity = "") {
  return {
    info: 1,
    watch: 2,
    low: 2,
    positive: 2,
    warning: 3,
    medium: 3,
    high: 3,
    critical: 4
  }[severity] || 1;
}

function ratioThreshold(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  if (number > 1) return clamp01(number / 100);
  return clamp01(number);
}

function scoreThreshold(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  if (number > 1) return clamp01(number / 100);
  return clamp01(number);
}

function scoreThreshold100(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return Math.max(0, Math.min(100, number > 1 ? number : number * 100));
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function formatPct(value) {
  return `${Math.round((Number(value) || 0) * 1000) / 10}%`;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

function targetRowLabel(row = {}) {
  if (row.scope === "ticker") return normalizeTicker(row.key) || "Ticker";
  if (row.scope === "assetClass") return `${row.key || "Asset class"} allocation`;
  if (row.scope === "strategySleeve") return `${row.key || "Strategy sleeve"} sleeve`;
  if (row.scope === "account") return `${row.key || "Account"} account`;
  return row.key || "Target allocation";
}

function slug(value = "") {
  return String(value || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
}
