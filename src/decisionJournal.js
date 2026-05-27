import { normalizeTicker } from "./portfolioSchema.js";

export const DECISION_TYPES = Object.freeze(["buy", "sell", "hold", "trim", "add", "watch", "reject"]);
export const JOURNAL_CONVICTIONS = Object.freeze(["High", "Medium-high", "Medium", "Medium-low", "Low", "Unrated"]);

const DECISION_ORDER = Object.freeze({
  buy: 1,
  add: 2,
  trim: 3,
  sell: 4,
  hold: 5,
  watch: 6,
  reject: 7
});

export function journalEntryId({ ticker = "", dateTime = "", decisionType = "" } = {}) {
  const normalized = normalizeTicker(ticker);
  const stamped = String(dateTime || new Date().toISOString()).replace(/[^0-9A-Za-z]/g, "").slice(0, 14);
  const type = normalizeDecisionType(decisionType);
  return normalized ? `journal:${normalized}:${type}:${stamped}` : "";
}

export function normalizeJournalEntry(input = {}, options = {}) {
  const ticker = normalizeTicker(input.ticker || input.symbol);
  const dateTime = normalizeDateTime(input.dateTime || input.createdAt || input.timestamp || options.dateTime || new Date().toISOString());
  const decisionType = normalizeDecisionType(input.decisionType || input.type || "watch");
  const signalSnapshot = normalizeSignalSnapshot(input.signalSnapshot || options.signalSnapshot || null);
  return pruneEmpty({
    ...input,
    id: input.id || journalEntryId({ ticker, dateTime, decisionType }),
    dateTime,
    ticker,
    decisionType,
    thesisNote: cleanText(input.thesisNote || input.thesis || input.note || ""),
    riskNote: cleanText(input.riskNote || input.risk || ""),
    catalyst: cleanText(input.catalyst || ""),
    conviction: normalizeConviction(input.conviction || input.confidence || "Unrated"),
    signalSnapshot,
    source: input.source || "local-decision-journal",
    executionStatus: "not-executed",
    updatedAt: input.updatedAt || options.updatedAt || new Date().toISOString()
  });
}

export function normalizeJournalEntries(records = [], options = {}) {
  return (Array.isArray(records) ? records : [])
    .map((record) => normalizeJournalEntry(record, options))
    .filter((record) => record.ticker && record.dateTime && record.decisionType);
}

export function defaultJournalEntries(asOf = "2026-05-24T09:00:00-04:00") {
  return normalizeJournalEntries([
    {
      ticker: "MU",
      decisionType: "hold",
      dateTime: "2026-05-24T09:00:00-04:00",
      thesisNote: "Hold while AI/HBM and memory-pricing thesis remains intact.",
      riskNote: "Review if DRAM/NAND pricing rolls over or margin recovery stalls.",
      catalyst: "DRAM/NAND spot prices and Samsung/SK Hynix supply commentary.",
      conviction: "High"
    },
    {
      ticker: "SOXL",
      decisionType: "watch",
      dateTime: "2026-05-24T09:05:00-04:00",
      thesisNote: "Watch leveraged semiconductor exposure; useful only with explicit sizing discipline.",
      riskNote: "3x leverage can dominate portfolio drawdowns in negative semi regimes.",
      catalyst: "Semiconductor breadth, rates, and volatility regime.",
      conviction: "Medium"
    }
  ], { dateTime: asOf });
}

export function buildJournalRows({
  entries = [],
  holdings = [],
  tickerSignals = [],
  watchlistIdeas = []
} = {}) {
  const holdingsByTicker = summarizeHoldingsByTicker(holdings);
  const signalsByTicker = new Map((tickerSignals || []).map((signal) => [normalizeTicker(signal.ticker), signal]));
  const ideasByTicker = new Map((watchlistIdeas || []).map((idea) => [normalizeTicker(idea.ticker), idea]));
  return normalizeJournalEntries(entries)
    .map((entry) => {
      const holding = holdingsByTicker.get(entry.ticker);
      const signal = signalsByTicker.get(entry.ticker);
      const idea = ideasByTicker.get(entry.ticker);
      return {
        ...entry,
        owned: Boolean(holding?.marketValue),
        marketValue: holding?.marketValue || 0,
        portfolioWeight: holding?.portfolioWeight || 0,
        sector: holding?.sector || idea?.sector || "Unknown",
        currentSignalScore: signal?.combinedScore || null,
        currentSignalAction: signal?.actionCategory || "",
        watchlistStatus: idea?.status || "",
        sortTime: timestampValue(entry.dateTime)
      };
    })
    .sort((a, b) => b.sortTime - a.sortTime || (DECISION_ORDER[a.decisionType] || 99) - (DECISION_ORDER[b.decisionType] || 99));
}

export function filterJournalRows(rows = [], filters = {}) {
  const ticker = normalizeTicker(filters.ticker || "");
  const decisionType = filters.decisionType || "all";
  const conviction = filters.conviction || "all";
  const fromDate = dateBoundary(filters.fromDate, "start");
  const toDate = dateBoundary(filters.toDate, "end");
  const query = String(filters.query || "").trim().toLowerCase();
  return (rows || []).filter((row) => {
    const rowTime = timestampValue(row.dateTime);
    const matchesTicker = !ticker || row.ticker === ticker;
    const matchesDecision = decisionType === "all" || row.decisionType === decisionType;
    const matchesConviction = conviction === "all" || row.conviction === conviction;
    const matchesFrom = !fromDate || rowTime >= fromDate;
    const matchesTo = !toDate || rowTime <= toDate;
    const text = `${row.ticker} ${row.thesisNote} ${row.riskNote} ${row.catalyst} ${row.decisionType}`.toLowerCase();
    const matchesQuery = !query || text.includes(query);
    return matchesTicker && matchesDecision && matchesConviction && matchesFrom && matchesTo && matchesQuery;
  });
}

export function upsertJournalEntry(entries = [], nextEntry = {}) {
  const normalized = normalizeJournalEntry(nextEntry);
  if (!normalized.ticker) return normalizeJournalEntries(entries);
  const rows = normalizeJournalEntries(entries);
  const index = rows.findIndex((row) => row.id === normalized.id);
  if (index >= 0) {
    rows[index] = { ...rows[index], ...normalized, id: rows[index].id };
  } else {
    rows.push(normalized);
  }
  return rows.sort((a, b) => timestampValue(b.dateTime) - timestampValue(a.dateTime));
}

export function removeJournalEntry(entries = [], id = "") {
  return normalizeJournalEntries(entries).filter((entry) => entry.id !== id);
}

export function journalEntriesForTicker(entries = [], ticker = "") {
  const normalized = normalizeTicker(ticker);
  return buildJournalRows({ entries }).filter((entry) => entry.ticker === normalized);
}

export function summarizeJournal(rows = []) {
  const summary = {
    total: rows.length,
    buys: 0,
    sells: 0,
    holds: 0,
    watches: 0,
    rejects: 0,
    highConviction: 0,
    withSignalSnapshot: 0
  };
  rows.forEach((row) => {
    if (row.decisionType === "buy" || row.decisionType === "add") summary.buys += 1;
    if (row.decisionType === "sell" || row.decisionType === "trim") summary.sells += 1;
    if (row.decisionType === "hold") summary.holds += 1;
    if (row.decisionType === "watch") summary.watches += 1;
    if (row.decisionType === "reject") summary.rejects += 1;
    if (/^high|medium-high$/i.test(row.conviction)) summary.highConviction += 1;
    if (row.signalSnapshot?.combinedScore !== undefined) summary.withSignalSnapshot += 1;
  });
  return summary;
}

export function signalSnapshotForTicker(ticker = "", tickerSignals = [], asOf = new Date().toISOString()) {
  const normalized = normalizeTicker(ticker);
  const signal = (tickerSignals || []).find((row) => normalizeTicker(row.ticker) === normalized);
  if (!signal) return null;
  return normalizeSignalSnapshot({
    ticker: normalized,
    capturedAt: asOf,
    combinedScore: signal.combinedScore,
    actionCategory: signal.actionCategory,
    confidenceScore: signal.confidenceScore,
    materialityScore: signal.materialityScore,
    sourceLabel: signal.sourceLabel,
    topHeadline: signal.topHeadline,
    missingData: signal.missingData,
    warnings: signal.warnings
  });
}

function normalizeSignalSnapshot(snapshot = null) {
  if (!snapshot || typeof snapshot !== "object") return null;
  return pruneEmpty({
    ticker: normalizeTicker(snapshot.ticker),
    capturedAt: snapshot.capturedAt || snapshot.asOf || new Date().toISOString(),
    combinedScore: boundedNumber(snapshot.combinedScore),
    actionCategory: cleanText(snapshot.actionCategory || ""),
    confidenceScore: boundedUnit(snapshot.confidenceScore),
    materialityScore: boundedUnit(snapshot.materialityScore),
    sourceLabel: cleanText(snapshot.sourceLabel || ""),
    topHeadline: cleanText(snapshot.topHeadline || ""),
    missingData: Array.isArray(snapshot.missingData) ? snapshot.missingData.slice(0, 6).map(cleanText).filter(Boolean) : [],
    warnings: Array.isArray(snapshot.warnings) ? snapshot.warnings.slice(0, 6).map(cleanText).filter(Boolean) : []
  });
}

function summarizeHoldingsByTicker(holdings = []) {
  const rows = new Map();
  holdings.forEach((holding) => {
    const ticker = normalizeTicker(holding.ticker);
    if (!ticker) return;
    const current = rows.get(ticker) || { ticker, marketValue: 0, portfolioWeight: 0, sector: holding.sector };
    current.marketValue += Number(holding.marketValue) || 0;
    current.portfolioWeight += Number(holding.portfolioWeight) || 0;
    if (!current.sector || current.sector === "Unknown") current.sector = holding.sector;
    rows.set(ticker, current);
  });
  return rows;
}

function normalizeDecisionType(value = "") {
  const normalized = String(value || "").toLowerCase().trim();
  return DECISION_TYPES.includes(normalized) ? normalized : "watch";
}

function normalizeConviction(value = "") {
  const text = cleanText(value);
  return JOURNAL_CONVICTIONS.find((item) => item.toLowerCase() === text.toLowerCase()) || "Unrated";
}

function normalizeDateTime(value = "") {
  const text = String(value || "").trim();
  if (!text) return new Date().toISOString();
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function timestampValue(value = "") {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function dateBoundary(value = "", mode = "start") {
  const text = String(value || "").trim();
  if (!text) return 0;
  const suffix = mode === "end" ? "T23:59:59.999" : "T00:00:00.000";
  const date = new Date(/T/.test(text) ? text : `${text}${suffix}`);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function boundedNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : undefined;
}

function boundedUnit(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : undefined;
}

function cleanText(value = "") {
  return String(value ?? "").trim();
}

function pruneEmpty(record = {}) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => {
      if (value === undefined || value === null || value === "") return false;
      if (Array.isArray(value) && !value.length) return false;
      return true;
    })
  );
}
