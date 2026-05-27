import { normalizeTicker } from "./portfolioSchema.js";

export const WATCHLIST_IDEA_STATUSES = Object.freeze(["researching", "watching", "candidate", "rejected", "owned"]);
export const WATCHLIST_CONVICTIONS = Object.freeze(["High", "Medium-high", "Medium", "Medium-low", "Low", "Unrated"]);
export const WATCHLIST_SIGNAL_SOURCES = Object.freeze([
  "manual",
  "ticker-signal",
  "reddit",
  "politician",
  "market-intelligence",
  "owned-holding",
  "sample"
]);

const STATUS_ORDER = Object.freeze({
  candidate: 1,
  researching: 2,
  watching: 3,
  owned: 4,
  rejected: 5
});

export function ideaId(ticker = "") {
  const normalized = normalizeTicker(ticker);
  return normalized ? `watchlist:${normalized}` : "";
}

export function normalizeWatchlistIdea(input = {}, options = {}) {
  const ticker = normalizeTicker(input.ticker || input.symbol);
  const asOfDate = dateOnly(options.asOf || new Date().toISOString());
  const status = normalizeStatus(input.status || (options.owned ? "owned" : "watching"));
  const sourceOfIdea = cleanText(input.sourceOfIdea || input.source || input.ideaSource || "Manual");
  const conviction = normalizeConviction(input.conviction || convictionFromPriority(input.priority));
  const thesis = cleanText(input.thesis || input.reason || input.why || "");
  const dateAdded = dateOnly(input.dateAdded || input.addedAt || input.createdAt || asOfDate);

  return pruneEmpty({
    ...input,
    id: input.id || ideaId(ticker),
    ticker,
    name: cleanText(input.name || input.company || ticker),
    status,
    thesis,
    catalyst: cleanText(input.catalyst || input.nextCatalyst || ""),
    targetEntryZone: cleanText(input.targetEntryZone || input.entryZone || input.targetEntry || ""),
    riskNotes: cleanText(input.riskNotes || input.risk || input.notes || ""),
    timeHorizon: cleanText(input.timeHorizon || input.horizon || ""),
    conviction,
    sourceOfIdea,
    signalSource: normalizeSignalSource(input.signalSource || sourceFromText(sourceOfIdea)),
    sector: cleanText(input.sector || ""),
    dateAdded,
    lastReviewed: dateOnly(input.lastReviewed || input.lastReviewedDate || ""),
    notes: cleanText(input.notes || ""),
    updatedAt: input.updatedAt || options.asOf || new Date().toISOString()
  });
}

export function normalizeWatchlistIdeas(records = [], options = {}) {
  return (Array.isArray(records) ? records : [])
    .map((record) => normalizeWatchlistIdea(record, options))
    .filter((record) => record.ticker);
}

export function defaultWatchlistIdeas(asOf = "2026-05-24T09:00:00-04:00") {
  return normalizeWatchlistIdeas([
    {
      ticker: "ASML",
      name: "ASML Holding",
      status: "researching",
      thesis: "Critical lithography supplier for advanced semiconductors and AI infrastructure capacity.",
      catalyst: "Watch customer capex commentary and China/export-control updates.",
      targetEntryZone: "Needs valuation work before entry zone.",
      riskNotes: "Cyclical semi capex and export controls can pressure orders.",
      timeHorizon: "6-18 months",
      conviction: "Medium",
      sourceOfIdea: "Sample idea pipeline",
      signalSource: "sample",
      sector: "Semiconductors",
      dateAdded: "2026-05-24",
      lastReviewed: ""
    },
    {
      ticker: "AVGO",
      name: "Broadcom",
      status: "watching",
      thesis: "AI networking and custom silicon exposure could complement existing NVDA/MU/SOXL exposure.",
      catalyst: "Track AI accelerator customer demand and VMware integration progress.",
      targetEntryZone: "Review after next earnings reset.",
      riskNotes: "Mega-cap semi/software overlap may increase concentration.",
      timeHorizon: "3-12 months",
      conviction: "Medium-high",
      sourceOfIdea: "Sample idea pipeline",
      signalSource: "sample",
      sector: "Semiconductors",
      dateAdded: "2026-05-24",
      lastReviewed: ""
    },
    {
      ticker: "PLTR",
      name: "Palantir",
      status: "candidate",
      thesis: "Potential AI software operating-system winner, but valuation and narrative risk need discipline.",
      catalyst: "Watch commercial revenue growth, margins, and backlog.",
      targetEntryZone: "Only after valuation/position-size guardrail is set.",
      riskNotes: "High expectations can make drawdowns sharp if growth decelerates.",
      timeHorizon: "6-18 months",
      conviction: "Medium",
      sourceOfIdea: "Sample idea pipeline",
      signalSource: "sample",
      sector: "Software",
      dateAdded: "2026-05-24",
      lastReviewed: ""
    }
  ], { asOf });
}

export function buildWatchlistIdeaRows({
  watchlistIdeas = [],
  holdings = [],
  tickerSignals = [],
  thesisRows = [],
  marketDataSnapshot = null,
  asOf = new Date().toISOString()
} = {}) {
  const rows = new Map();
  const holdingsByTicker = summarizeHoldingsByTicker(holdings);
  const thesisByTicker = new Map((thesisRows || []).map((row) => [normalizeTicker(row.ticker), row]));
  const quoteByTicker = quoteMapFromSnapshot(marketDataSnapshot);

  normalizeWatchlistIdeas(watchlistIdeas, { asOf }).forEach((idea) => {
    rows.set(idea.ticker, enrichIdeaRow(idea, {
      holding: holdingsByTicker.get(idea.ticker),
      thesisRow: thesisByTicker.get(idea.ticker),
      quote: quoteByTicker.get(idea.ticker),
      tickerSignal: findSignal(tickerSignals, idea.ticker),
      saved: true
    }));
  });

  holdingsByTicker.forEach((holding, ticker) => {
    const existing = rows.get(ticker);
    const base = existing || normalizeWatchlistIdea({
      ticker,
      name: holding.name,
      status: "owned",
      thesis: holding.thesis || "Owned position. Add an idea/thesis note to keep the ownership rationale clear.",
      sourceOfIdea: "Owned holding",
      signalSource: "owned-holding",
      sector: holding.sector,
      conviction: holding.confidenceLevel || "Unrated"
    }, { owned: true, asOf });
    rows.set(ticker, enrichIdeaRow({ ...base, status: "owned" }, {
      holding,
      thesisRow: thesisByTicker.get(ticker),
      quote: quoteByTicker.get(ticker),
      tickerSignal: findSignal(tickerSignals, ticker),
      saved: Boolean(existing)
    }));
  });

  (tickerSignals || []).forEach((signal) => {
    const ticker = normalizeTicker(signal.ticker);
    if (!ticker || rows.has(ticker)) return;
    rows.set(ticker, enrichIdeaRow(signalToIdea(signal, { asOf }), {
      holding: holdingsByTicker.get(ticker),
      thesisRow: thesisByTicker.get(ticker),
      quote: quoteByTicker.get(ticker),
      tickerSignal: signal,
      saved: false,
      derived: true
    }));
  });

  return [...rows.values()].sort(compareIdeaRows);
}

export function filterWatchlistIdeaRows(rows = [], filters = {}) {
  const status = filters.status || "all";
  const sector = filters.sector || "all";
  const signalSource = filters.signalSource || "all";
  const conviction = filters.conviction || "all";
  const query = String(filters.query || "").trim().toLowerCase();

  return (rows || []).filter((row) => {
    const matchesStatus = status === "all" || row.status === status;
    const matchesSector = sector === "all" || String(row.sector || "Unknown").toLowerCase() === String(sector).toLowerCase();
    const matchesSource = signalSource === "all" || row.signalSource === signalSource;
    const matchesConviction = conviction === "all" || row.conviction === conviction;
    const text = `${row.ticker} ${row.name} ${row.thesis} ${row.catalyst} ${row.riskNotes} ${row.sourceOfIdea}`.toLowerCase();
    const matchesQuery = !query || text.includes(query);
    return matchesStatus && matchesSector && matchesSource && matchesConviction && matchesQuery;
  });
}

export function summarizeWatchlistIdeas(rows = []) {
  const summary = {
    total: rows.length,
    saved: rows.filter((row) => row.saved).length,
    derived: rows.filter((row) => row.derived).length,
    owned: 0,
    researching: 0,
    watching: 0,
    candidate: 0,
    rejected: 0,
    highConviction: 0,
    stale: 0
  };
  rows.forEach((row) => {
    if (summary[row.status] !== undefined) summary[row.status] += 1;
    if (/^high|medium-high$/i.test(row.conviction)) summary.highConviction += 1;
    if (row.reviewState === "stale") summary.stale += 1;
  });
  return summary;
}

export function promoteTickerSignalToIdea(signal = {}, existingIdeas = [], options = {}) {
  const ticker = normalizeTicker(signal.ticker);
  if (!ticker) return normalizeWatchlistIdeas(existingIdeas, options);
  const ideas = normalizeWatchlistIdeas(existingIdeas, options);
  const promoted = signalToIdea(signal, {
    ...options,
    status: options.status || (Number(signal.combinedScore || 0) >= 70 ? "candidate" : "watching"),
    sourceOfIdea: options.sourceOfIdea || "Ticker signal"
  });
  return upsertWatchlistIdea(ideas, promoted);
}

export function upsertWatchlistIdea(records = [], nextIdea = {}) {
  const normalized = normalizeWatchlistIdea(nextIdea);
  if (!normalized.ticker) return normalizeWatchlistIdeas(records);
  const rows = normalizeWatchlistIdeas(records);
  const index = rows.findIndex((row) => row.ticker === normalized.ticker);
  if (index >= 0) {
    rows[index] = { ...rows[index], ...normalized, id: rows[index].id || normalized.id };
  } else {
    rows.push(normalized);
  }
  return rows.sort((a, b) => a.ticker.localeCompare(b.ticker));
}

export function removeWatchlistIdea(records = [], ticker = "") {
  const normalizedTicker = normalizeTicker(ticker);
  return normalizeWatchlistIdeas(records).filter((row) => row.ticker !== normalizedTicker);
}

export function watchlistIdeaTickers(records = []) {
  return [...new Set(normalizeWatchlistIdeas(records).map((row) => row.ticker).filter(Boolean))].sort();
}

function signalToIdea(signal = {}, options = {}) {
  const ticker = normalizeTicker(signal.ticker);
  const score = Number(signal.combinedScore || 0);
  return normalizeWatchlistIdea({
    ticker,
    name: signal.name || ticker,
    status: options.status || (score >= 70 ? "candidate" : "watching"),
    thesis: signal.explanation || signal.topHeadline || "Signal-driven idea. Add a plain-English thesis before treating it as a candidate.",
    catalyst: signal.topHeadline || signal.headline || "",
    riskNotes: [
      ...(signal.missingData || []).slice(0, 2),
      ...(signal.warnings || []).slice(0, 2)
    ].join("; "),
    timeHorizon: options.timeHorizon || "1-3 months",
    conviction: convictionFromScore(score),
    sourceOfIdea: options.sourceOfIdea || signal.sourceLabel || "Ticker signal",
    signalSource: "ticker-signal",
    sector: signal.sector || signal.industry || "",
    dateAdded: dateOnly(options.asOf || new Date().toISOString()),
    lastReviewed: ""
  }, options);
}

function enrichIdeaRow(idea, { holding, thesisRow, quote, tickerSignal, saved = false, derived = false } = {}) {
  const owned = Boolean(holding?.marketValue);
  const savedStatus = normalizeStatus(idea.status);
  const staleOwnedStatus = !owned && savedStatus === "owned";
  const status = owned ? "owned" : staleOwnedStatus ? "watching" : savedStatus;
  const marketValue = Number(holding?.marketValue || 0);
  const portfolioWeight = Number(holding?.portfolioWeight || 0);
  const sector = idea.sector || holding?.sector || quote?.sector || "Unknown";
  const signalSource = normalizeSignalSource(idea.signalSource || sourceFromText(idea.sourceOfIdea));
  return {
    ...idea,
    status,
    staleOwnedStatus,
    owned,
    saved,
    derived,
    sector,
    signalSource,
    marketValue,
    portfolioWeight,
    quotePrice: quote?.price || null,
    dailyChangePercent: quote?.dailyChangePercent || holding?.dailyChangePercent || 0,
    thesisStatus: thesisRow?.thesisStatus || holding?.thesisStatus || "",
    linkedThesis: Boolean(thesisRow),
    signalScore: Number(tickerSignal?.combinedScore || 0),
    signalAction: tickerSignal?.actionCategory || "",
    signalHeadline: tickerSignal?.topHeadline || "",
    reviewState: reviewStateForIdea(idea),
    sortScore: Number(tickerSignal?.combinedScore || 0) + (owned ? 10 : 0) + (saved ? 4 : 0)
  };
}

function summarizeHoldingsByTicker(holdings = []) {
  const rows = new Map();
  holdings.forEach((holding) => {
    const ticker = normalizeTicker(holding.ticker);
    if (!ticker) return;
    const current = rows.get(ticker) || {
      ticker,
      name: holding.name || ticker,
      sector: holding.sector,
      marketValue: 0,
      portfolioWeight: 0,
      dailyChangePercent: 0,
      thesisStatus: holding.thesisStatus,
      confidenceLevel: holding.confidenceLevel,
      thesis: holding.thesis,
      accounts: new Set()
    };
    current.marketValue += Number(holding.marketValue) || 0;
    current.portfolioWeight += Number(holding.portfolioWeight) || 0;
    current.dailyChangePercent += Number(holding.dailyChangePercent || 0) * (Number(holding.portfolioWeight) || 0);
    current.accounts.add(holding.account || "Unassigned");
    if (!current.sector || current.sector === "Unknown") current.sector = holding.sector;
    if (current.thesisStatus !== holding.thesisStatus) current.thesisStatus = "Mixed";
    rows.set(ticker, current);
  });
  return rows;
}

function quoteMapFromSnapshot(snapshot = {}) {
  const map = new Map();
  if (snapshot?.quotesByTicker) {
    Object.entries(snapshot.quotesByTicker).forEach(([ticker, quote]) => {
      const normalized = normalizeTicker(ticker || quote?.ticker);
      if (normalized) map.set(normalized, quote);
    });
  }
  (snapshot?.quotes || []).forEach((quote) => {
    const ticker = normalizeTicker(quote.ticker);
    if (ticker) map.set(ticker, quote);
  });
  return map;
}

function findSignal(signals = [], ticker = "") {
  const normalized = normalizeTicker(ticker);
  return (signals || []).find((signal) => normalizeTicker(signal.ticker) === normalized) || null;
}

function compareIdeaRows(a, b) {
  return (STATUS_ORDER[a.status] || 99) - (STATUS_ORDER[b.status] || 99) ||
    b.sortScore - a.sortScore ||
    a.ticker.localeCompare(b.ticker);
}

function reviewStateForIdea(idea = {}, asOf = new Date()) {
  if (!idea.lastReviewed) return "needs review";
  const reviewed = new Date(idea.lastReviewed);
  if (Number.isNaN(reviewed.getTime())) return "needs review";
  const ageDays = (asOf.getTime() - reviewed.getTime()) / 86400000;
  return ageDays > 45 ? "stale" : "current";
}

function convictionFromScore(score = 0) {
  if (score >= 80) return "High";
  if (score >= 70) return "Medium-high";
  if (score >= 55) return "Medium";
  if (score >= 40) return "Medium-low";
  return "Low";
}

function convictionFromPriority(priority = "") {
  return ({
    high: "High",
    medium: "Medium",
    low: "Low"
  })[String(priority).toLowerCase()] || "Unrated";
}

function normalizeConviction(value = "") {
  const text = cleanText(value);
  const match = WATCHLIST_CONVICTIONS.find((item) => item.toLowerCase() === text.toLowerCase());
  return match || "Unrated";
}

function normalizeStatus(value = "") {
  const text = String(value || "").toLowerCase().replaceAll("_", "-").trim();
  if (WATCHLIST_IDEA_STATUSES.includes(text)) return text;
  if (text === "research") return "researching";
  if (text === "watch") return "watching";
  return "watching";
}

function normalizeSignalSource(value = "") {
  const text = String(value || "").toLowerCase().replaceAll("_", "-").trim();
  if (WATCHLIST_SIGNAL_SOURCES.includes(text)) return text;
  if (/reddit/.test(text)) return "reddit";
  if (/politician|disclosure|congress/.test(text)) return "politician";
  if (/market|alpha|signal/.test(text)) return "ticker-signal";
  if (/owned|holding/.test(text)) return "owned-holding";
  if (/sample|demo/.test(text)) return "sample";
  return "manual";
}

function sourceFromText(value = "") {
  return normalizeSignalSource(value);
}

function dateOnly(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  const match = text.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : text.slice(0, 10);
}

function cleanText(value = "") {
  return String(value ?? "").trim();
}

function pruneEmpty(record = {}) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}
