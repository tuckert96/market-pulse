import { normalizeTicker } from "./portfolioSchema.js";

export const QUANT_SCORE_HISTORY_VERSION = 1;
const DEFAULT_MAX_HISTORY_PER_TICKER = 30;

export function enrichQuantLensContext(signals = [], options = {}) {
  const asOf = normalizeDate(options.asOf || new Date().toISOString());
  const portfolioMode = quantHistoryPortfolioMode(options.portfolioMode || options.uiState || "unknown");
  const history = normalizeQuantScoreHistory(options.history || []);
  const withPeerGroups = signals.map((signal) => ({
    ...signal,
    institutionalQuantPeerGroup: quantPeerGroup(signal),
    institutionalQuantPeerGroupType: quantPeerGroupType(signal)
  }));
  const peerRows = buildPeerRows(withPeerGroups);

  return withPeerGroups.map((signal) => {
    const ticker = normalizeTicker(signal.ticker);
    const score = Number(signal.institutionalQuantScore);
    const peer = peerRows.get(peerKey(signal));
    const peerPosition = peer?.tickers.findIndex((row) => row.ticker === ticker) ?? -1;
    const peerRank = peerPosition >= 0 ? peerPosition + 1 : null;
    const peerCount = peer?.tickers.length || 0;
    const peerPercentile = peerRank && peerCount > 1
      ? Math.round(((peerCount - peerRank) / (peerCount - 1)) * 100)
      : null;
    const previous = previousQuantScore(history, { ticker, asOf, portfolioMode, modelVersion: signal.institutionalQuantModelVersion });
    const scoreChange = previous && Number.isFinite(score)
      ? Number((score - Number(previous.score || 0)).toFixed(1))
      : null;

    return {
      ...signal,
      institutionalQuantPeerRank: peerRank,
      institutionalQuantPeerCount: peerCount,
      institutionalQuantPeerPercentile: peerPercentile,
      institutionalQuantPeerLabel: peerLabel({ peerRank, peerCount, peerPercentile }),
      institutionalQuantPeerSummary: peerSummary(signal, { peerRank, peerCount, peerPercentile }),
      institutionalQuantPeerWarning: peerCount < 3 ? "Peer group is small; treat relative rank as directional only." : "",
      institutionalQuantPreviousScore: previous ? Number(previous.score) : null,
      institutionalQuantPreviousScoreDate: previous?.date || null,
      institutionalQuantScoreChange: scoreChange,
      institutionalQuantScoreTrend: scoreTrend(scoreChange),
      institutionalQuantScoreTrendLabel: scoreTrendLabel(scoreChange),
      institutionalQuantHistoryPoints: history
        .filter((row) => row.ticker === ticker && row.modelVersion === signal.institutionalQuantModelVersion && row.portfolioMode === portfolioMode)
        .length,
      institutionalQuantScoreHistoryLabel: scoreHistoryLabel({ scoreChange, previous, asOf })
    };
  });
}

export function updateQuantScoreHistory(history = [], signals = [], options = {}) {
  const asOf = normalizeDate(options.asOf || new Date().toISOString());
  const portfolioMode = quantHistoryPortfolioMode(options.portfolioMode || options.uiState || "unknown");
  const maxPerTicker = Math.max(3, Number(options.maxEntriesPerTicker || DEFAULT_MAX_HISTORY_PER_TICKER));
  const date = asOf.slice(0, 10);
  const normalized = normalizeQuantScoreHistory(history);
  const rowMap = new Map(normalized.map((row) => [historyKey(row), row]));

  signals.forEach((signal) => {
    const ticker = normalizeTicker(signal.ticker);
    const score = Number(signal.institutionalQuantScore);
    if (!ticker || !Number.isFinite(score)) return;
    const record = {
      schemaVersion: QUANT_SCORE_HISTORY_VERSION,
      ticker,
      date,
      timestamp: asOf,
      modelVersion: signal.institutionalQuantModelVersion || "unknown",
      scoreKind: signal.institutionalQuantScoreKind || "stock-quality-decision-support",
      securityKind: signal.institutionalQuantSecurityKind || "operating-company",
      portfolioMode,
      score: Math.round(score),
      rawScore: Number.isFinite(Number(signal.institutionalQuantRawScore)) ? Math.round(Number(signal.institutionalQuantRawScore)) : null,
      confidenceScore: Number.isFinite(Number(signal.institutionalQuantConfidenceScore)) ? Math.round(Number(signal.institutionalQuantConfidenceScore)) : null,
      dataCoverageScore: Number.isFinite(Number(signal.institutionalQuantDataCoverageScore)) ? Math.round(Number(signal.institutionalQuantDataCoverageScore)) : null,
      peerGroup: signal.institutionalQuantPeerGroup || quantPeerGroup(signal),
      peerRank: signal.institutionalQuantPeerRank || null,
      peerCount: signal.institutionalQuantPeerCount || null,
      label: signal.institutionalQuantLabel || "",
      sourceFreshness: signal.institutionalQuantSourceFreshness || signal.marketDataSourceLabel || ""
    };
    rowMap.set(historyKey(record), record);
  });

  const rows = [...rowMap.values()].sort((a, b) => timestampMs(b.timestamp || b.date) - timestampMs(a.timestamp || a.date));
  const counts = new Map();
  return rows.filter((row) => {
    const key = `${row.ticker}:${row.modelVersion}:${row.portfolioMode}`;
    const count = counts.get(key) || 0;
    if (count >= maxPerTicker) return false;
    counts.set(key, count + 1);
    return true;
  });
}

export function normalizeQuantScoreHistory(value = []) {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      const ticker = normalizeTicker(row?.ticker);
      const score = Number(row?.score);
      const date = String(row?.date || row?.timestamp || "").slice(0, 10);
      if (!ticker || !Number.isFinite(score) || !date) return null;
      return {
        schemaVersion: Number(row.schemaVersion || QUANT_SCORE_HISTORY_VERSION),
        ticker,
        date,
        timestamp: normalizeDate(row.timestamp || `${date}T12:00:00`),
        modelVersion: String(row.modelVersion || "unknown"),
        scoreKind: String(row.scoreKind || "stock-quality-decision-support"),
        securityKind: String(row.securityKind || "operating-company"),
        portfolioMode: quantHistoryPortfolioMode(row.portfolioMode || row.uiState || "unknown"),
        score: Math.round(clamp(Number(row.score), 0, 100)),
        rawScore: nullableScore(row.rawScore),
        confidenceScore: nullableScore(row.confidenceScore),
        dataCoverageScore: nullableScore(row.dataCoverageScore),
        peerGroup: String(row.peerGroup || ""),
        peerRank: nullableInteger(row.peerRank),
        peerCount: nullableInteger(row.peerCount),
        label: String(row.label || ""),
        sourceFreshness: String(row.sourceFreshness || "")
      };
    })
    .filter(Boolean);
}

export function quantHistoryPortfolioMode(value = "") {
  const text = String(value || "").toLowerCase();
  if (text.includes("sample")) return "sample";
  if (text.includes("imported") || text.includes("repaired") || text.includes("real")) return "imported";
  if (text.includes("no_data") || text.includes("no data")) return "no-data";
  return "local";
}

function buildPeerRows(signals = []) {
  const groups = new Map();
  signals.forEach((signal) => {
    const ticker = normalizeTicker(signal.ticker);
    const score = Number(signal.institutionalQuantScore);
    if (!ticker || !Number.isFinite(score)) return;
    const key = peerKey(signal);
    const current = groups.get(key) || { key, tickers: [] };
    current.tickers.push({ ticker, score });
    groups.set(key, current);
  });
  groups.forEach((group) => {
    group.tickers.sort((a, b) => b.score - a.score || a.ticker.localeCompare(b.ticker));
  });
  return groups;
}

function previousQuantScore(history = [], { ticker, asOf, portfolioMode, modelVersion }) {
  const currentDate = normalizeDate(asOf).slice(0, 10);
  return history
    .filter((row) => row.ticker === ticker && row.modelVersion === modelVersion && row.portfolioMode === portfolioMode && row.date < currentDate)
    .sort((a, b) => timestampMs(b.timestamp || b.date) - timestampMs(a.timestamp || a.date))[0] || null;
}

function quantPeerGroup(signal = {}) {
  const kind = signal.institutionalQuantSecurityKind || "operating-company";
  const assetClass = cleanLabel(signal.assetClass);
  const sector = cleanLabel(signal.sector);
  const industry = cleanLabel(signal.industry || signal.marketDataIndustry);
  if (kind === "fund-or-etf") {
    if (signal.isLeveragedEtf || Number(signal.leveragedMultiple || 0) > 1 || /leveraged|ultra|3x|2x/i.test(`${signal.ticker || ""} ${signal.topHeadline || ""}`)) {
      return "Leveraged ETF exposure";
    }
    return assetClass && assetClass !== "Unknown" ? `${assetClass} exposure` : "Fund / ETF exposure";
  }
  if (sector && sector !== "Unknown") return sector;
  if (industry && industry !== "Unknown") return industry;
  return "Operating companies";
}

function quantPeerGroupType(signal = {}) {
  return signal.institutionalQuantSecurityKind === "fund-or-etf" ? "exposure-peer-group" : "sector-peer-group";
}

function peerKey(signal = {}) {
  return `${quantPeerGroupType(signal)}:${signal.institutionalQuantPeerGroup || quantPeerGroup(signal)}`;
}

function peerLabel({ peerRank, peerCount, peerPercentile }) {
  if (!peerRank || peerCount < 2) return "Peer rank needs more names";
  return `#${peerRank} of ${peerCount} · ${ordinalPercentile(peerPercentile)} percentile`;
}

function peerSummary(signal, { peerRank, peerCount, peerPercentile }) {
  const group = signal.institutionalQuantPeerGroup || quantPeerGroup(signal);
  if (!peerRank || peerCount < 2) return `${group}: not enough comparable names for a meaningful percentile yet.`;
  return `${group}: ranked #${peerRank} of ${peerCount} tracked names by ${signal.institutionalQuantSecurityKind === "fund-or-etf" ? "exposure lens" : "quant lens"} score (${ordinalPercentile(peerPercentile)} percentile).`;
}

function scoreTrend(scoreChange) {
  if (!Number.isFinite(scoreChange)) return "new";
  if (scoreChange >= 5) return "improving";
  if (scoreChange <= -5) return "deteriorating";
  return "stable";
}

function scoreTrendLabel(scoreChange) {
  if (!Number.isFinite(scoreChange)) return "No prior local score";
  const sign = scoreChange > 0 ? "+" : "";
  if (Math.abs(scoreChange) < 0.5) return "Flat vs prior score";
  return `${sign}${scoreChange.toFixed(1)} pts vs prior score`;
}

function scoreHistoryLabel({ scoreChange, previous }) {
  if (!previous) return "First local score for this mode";
  return `${scoreTrendLabel(scoreChange)} from ${previous.date}`;
}

function cleanLabel(value = "") {
  return String(value || "").trim() || "";
}

function historyKey(row = {}) {
  return `${row.ticker}:${row.modelVersion}:${row.portfolioMode}:${row.date}`;
}

function normalizeDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function timestampMs(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function nullableScore(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(clamp(numeric, 0, 100)) : null;
}

function nullableInteger(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function ordinalPercentile(value) {
  if (!Number.isFinite(Number(value))) return "--";
  const numeric = Math.round(Number(value));
  const suffix = numeric % 100 >= 11 && numeric % 100 <= 13
    ? "th"
    : { 1: "st", 2: "nd", 3: "rd" }[numeric % 10] || "th";
  return `${numeric}${suffix}`;
}
