import { normalizeTicker } from "./portfolioSchema.js";
import { sanitizeStateForBackup } from "./stateSanitizer.js";

export const EVENT_TYPES = Object.freeze([
  "earnings",
  "ex-dividend",
  "investor-day",
  "product-event",
  "fed-macro",
  "custom"
]);

export const EVENT_IMPORTANCE = Object.freeze(["low", "medium", "high"]);
export const EVENT_SOURCE_MODES = Object.freeze(["mock", "imported", "manual", "live", "stale", "error"]);

const TYPE_LABELS = Object.freeze({
  earnings: "Earnings",
  "ex-dividend": "Ex-dividend",
  "investor-day": "Investor day",
  "product-event": "Product event",
  "fed-macro": "Fed / macro",
  custom: "Custom event"
});

const SOURCE_LABELS = Object.freeze({
  mock: "Sample event",
  imported: "Imported event",
  manual: "Manual event",
  live: "Live event",
  stale: "Stale event",
  error: "Event error"
});

export function eventTypeLabel(type = "") {
  return TYPE_LABELS[normalizeEventType(type)] || TYPE_LABELS.custom;
}

export function eventSourceLabel(sourceMode = "", sourceLabel = "") {
  return sourceLabel || SOURCE_LABELS[normalizeSourceMode(sourceMode)] || "Local event";
}

export function defaultCalendarEvents(asOf = new Date().toISOString()) {
  const base = validDate(asOf) || new Date();
  const detectedAt = base.toISOString();
  return normalizeCalendarEvents([
    {
      id: "mock-calendar:mu-memory-cycle-earnings",
      ticker: "MU",
      tickers: ["MU", "SOXL"],
      eventType: "earnings",
      date: isoDate(addDays(base, 12)),
      title: "Sample MU earnings review window",
      summary: "Sample calendar event for reviewing Micron memory-cycle assumptions before earnings.",
      importance: "high",
      sourceMode: "mock",
      sourceLabel: "Sample calendar",
      notes: "Sample only. Replace with imported or provider-sourced earnings dates before relying on it.",
      detectedAt
    },
    {
      id: "mock-calendar:nvda-ai-product-event",
      ticker: "NVDA",
      tickers: ["NVDA", "VGT", "SOXL"],
      eventType: "product-event",
      date: isoDate(addDays(base, 5)),
      title: "Sample AI accelerator product catalyst",
      summary: "Sample product-event placeholder for AI-capex names and semiconductor ETFs.",
      importance: "medium",
      sourceMode: "mock",
      sourceLabel: "Sample calendar",
      notes: "Sample scenario showing how a product event can route into ticker pages and Market Intelligence.",
      detectedAt
    },
    {
      id: "mock-calendar:vgt-ex-dividend",
      ticker: "VGT",
      tickers: ["VGT"],
      eventType: "ex-dividend",
      date: isoDate(addDays(base, 20)),
      title: "Sample VGT ex-dividend reminder",
      summary: "Sample ex-dividend date placeholder for calendar workflow testing.",
      importance: "low",
      sourceMode: "mock",
      sourceLabel: "Sample calendar",
      notes: "Not a live dividend date.",
      detectedAt
    },
    {
      id: "mock-calendar:fed-rate-decision",
      ticker: "",
      tickers: ["UPRO", "SOXL", "QQQ"],
      eventType: "fed-macro",
      date: isoDate(addDays(base, 3)),
      title: "Sample Fed / rates risk window",
      summary: "Sample macro placeholder for leveraged ETF and high-duration growth exposure.",
      importance: "high",
      sourceMode: "mock",
      sourceLabel: "Sample macro calendar",
      notes: "Sample only. It does not represent an official Fed calendar import.",
      detectedAt
    },
    {
      id: "mock-calendar:crdo-investor-day",
      ticker: "CRDO",
      tickers: ["CRDO"],
      eventType: "investor-day",
      date: isoDate(addDays(base, 27)),
      title: "Sample CRDO investor-day review",
      summary: "Sample investor-day event for watchlist and thesis-review workflow testing.",
      importance: "medium",
      sourceMode: "mock",
      sourceLabel: "Sample calendar",
      notes: "Sample scenario; import a real company event before relying on timing.",
      detectedAt
    }
  ], { asOf: detectedAt });
}

export function normalizeCalendarEvent(input = {}, options = {}) {
  const asOf = options.asOf || new Date().toISOString();
  const ticker = normalizeTicker(input.ticker || input.symbol || input.primaryTicker || "");
  const tickers = uniqueTickers([
    ticker,
    ...(Array.isArray(input.tickers) ? input.tickers : []),
    ...(Array.isArray(input.affectedTickers) ? input.affectedTickers : []),
    ...(Array.isArray(input.tickersAffected) ? input.tickersAffected : []),
    ...(typeof input.tickers === "string" ? splitList(input.tickers) : []),
    ...(typeof input.affectedTickers === "string" ? splitList(input.affectedTickers) : [])
  ]);
  const eventType = normalizeEventType(input.eventType || input.type || input.category);
  const date = normalizeDate(input.date || input.eventDate || input.earningsDate || input.exDividendDate || input.timestamp);
  const sourceMode = normalizeSourceMode(input.sourceMode || input.mode || options.sourceMode || "manual");
  const sourceLabel = input.sourceLabel || input.sourceName || input.source || SOURCE_LABELS[sourceMode];
  const importance = normalizeImportance(input.importance || input.severity || options.importance || defaultImportance(eventType));
  const title = String(input.title || input.headline || defaultEventTitle({ ticker, tickers, eventType })).trim();
  const id = String(input.id || eventId({ ticker, tickers, eventType, date, title, sourceMode })).trim();

  return {
    id,
    ticker,
    tickers,
    eventType,
    typeLabel: eventTypeLabel(eventType),
    date,
    timestamp: input.timestamp || (date ? `${date}T09:00:00.000Z` : ""),
    title,
    summary: String(input.summary || input.description || input.notes || "").trim(),
    importance,
    sourceMode,
    sourceLabel,
    sourceUrl: safeUrl(input.sourceUrl || input.url || ""),
    notes: String(input.notes || input.detail || "").trim(),
    detectedAt: input.detectedAt || input.importedAt || input.createdAt || asOf,
    importedAt: input.importedAt || (sourceMode === "imported" ? asOf : ""),
    staleAfter: input.staleAfter || staleAfterForMode(sourceMode, asOf),
    custom: Boolean(input.custom || eventType === "custom" || sourceMode === "manual")
  };
}

export function normalizeCalendarEvents(records = [], options = {}) {
  return Array.isArray(records)
    ? records.map((record) => normalizeCalendarEvent(record, options)).filter((event) => event.date && event.title)
    : [];
}

export function validateCalendarEvent(input = {}) {
  const event = normalizeCalendarEvent(input);
  const errors = [];
  if (!event.id) errors.push("missing id");
  if (!event.date) errors.push("missing or invalid event date");
  if (!EVENT_TYPES.includes(event.eventType)) errors.push("unsupported event type");
  if (!EVENT_IMPORTANCE.includes(event.importance)) errors.push("unsupported importance");
  if (!EVENT_SOURCE_MODES.includes(event.sourceMode)) errors.push("unsupported source mode");
  if (!["fed-macro", "custom"].includes(event.eventType) && !event.tickers.length) errors.push("missing ticker");
  return { ok: errors.length === 0, errors, event };
}

export function validateCalendarEvents(records = []) {
  const normalized = [];
  const rejectedRows = [];
  (Array.isArray(records) ? records : []).forEach((record, index) => {
    const result = validateCalendarEvent(record);
    if (result.ok) {
      normalized.push(result.event);
    } else {
      rejectedRows.push({ rowNumber: index + 1, reasons: result.errors, raw: sanitizeStateForBackup(record) });
    }
  });
  return { ok: rejectedRows.length === 0, records: normalized, rejectedRows };
}

export function buildPortfolioEvents({
  calendarEvents = [],
  holdings = [],
  watchlistIdeas = [],
  thesisRows = [],
  asOf = new Date().toISOString()
} = {}) {
  const rows = [
    ...normalizeCalendarEvents(calendarEvents, { asOf }),
    ...eventsFromHoldings(holdings, { asOf }),
    ...eventsFromWatchlist(watchlistIdeas, { asOf }),
    ...eventsFromThesis(thesisRows, { asOf })
  ];
  return dedupeEvents(rows).sort(compareEvents);
}

export function eventsFromHoldings(holdings = [], { asOf = new Date().toISOString() } = {}) {
  return normalizeCalendarEvents(holdings
    .filter((holding) => holding.nextEarnings)
    .map((holding) => ({
      id: `holding-event:${normalizeTicker(holding.ticker)}:earnings:${normalizeDate(holding.nextEarnings)}`,
      ticker: holding.ticker,
      tickers: [holding.ticker],
      eventType: "earnings",
      date: holding.nextEarnings,
      title: `${normalizeTicker(holding.ticker)} earnings date from holdings`,
      summary: "Date came from imported/sample holding fields, not a live calendar provider.",
      importance: "medium",
      sourceMode: isSampleSource(holding.source) ? "mock" : "imported",
      sourceLabel: isSampleSource(holding.source) ? "Sample holding field" : "Imported holding field",
      notes: "Verify against company/provider calendars before relying on this date.",
      detectedAt: holding.sourceAsOf || asOf
    })), { asOf });
}

export function eventsFromWatchlist(watchlistIdeas = [], { asOf = new Date().toISOString() } = {}) {
  return normalizeCalendarEvents(watchlistIdeas
    .filter((idea) => idea.nextEventDate || idea.eventDate)
    .map((idea) => ({
      id: `watchlist-event:${normalizeTicker(idea.ticker)}:custom:${normalizeDate(idea.nextEventDate || idea.eventDate)}`,
      ticker: idea.ticker,
      tickers: [idea.ticker],
      eventType: "custom",
      date: idea.nextEventDate || idea.eventDate,
      title: idea.nextEventTitle || `${normalizeTicker(idea.ticker)} watchlist catalyst`,
      summary: idea.catalyst || idea.thesis || "Watchlist event from local idea notes.",
      importance: idea.eventImportance || "medium",
      sourceMode: "manual",
      sourceLabel: "Watchlist note",
      detectedAt: idea.updatedAt || idea.dateAdded || asOf
    })), { asOf });
}

export function eventsFromThesis(thesisRows = [], { asOf = new Date().toISOString() } = {}) {
  return normalizeCalendarEvents(thesisRows
    .filter((row) => row.earningsDate || row.nextEarnings)
    .map((row) => ({
      id: `thesis-event:${normalizeTicker(row.ticker)}:earnings:${normalizeDate(row.earningsDate || row.nextEarnings)}`,
      ticker: row.ticker,
      tickers: [row.ticker],
      eventType: "earnings",
      date: row.earningsDate || row.nextEarnings,
      title: `${normalizeTicker(row.ticker)} earnings review from thesis`,
      summary: row.nextReviewTrigger || "Thesis tracker earnings/review date.",
      importance: /break|risk|review/i.test(`${row.nextReviewTrigger || ""} ${row.thesisStatus || ""}`) ? "high" : "medium",
      sourceMode: "manual",
      sourceLabel: "Thesis tracker",
      detectedAt: row.lastReviewedDate || asOf
    })), { asOf });
}

export function upcomingCalendarEvents(events = [], { asOf = new Date().toISOString(), daysAhead = 45, includePast = false } = {}) {
  const base = validDate(asOf);
  if (!base) return [];
  return normalizeCalendarEvents(events, { asOf })
    .map((event) => ({ ...event, daysUntil: daysUntil(event.date, base) }))
    .filter((event) => event.daysUntil !== null)
    .filter((event) => includePast || event.daysUntil >= 0)
    .filter((event) => event.daysUntil <= Number(daysAhead || 45))
    .sort(compareEvents);
}

export function filterCalendarEvents(events = [], filters = {}, options = {}) {
  const asOf = options.asOf || new Date().toISOString();
  const windowDays = filters.windowDays === "all" ? null : Number(filters.windowDays || 45);
  const ticker = normalizeTicker(filters.ticker || "");
  const type = filters.eventType || "all";
  const importance = filters.importance || "all";
  const sourceMode = filters.sourceMode || "all";
  return upcomingCalendarEvents(events, { asOf, daysAhead: windowDays ?? 365, includePast: filters.includePast === true })
    .filter((event) => !ticker || event.tickers.includes(ticker))
    .filter((event) => type === "all" || event.eventType === type)
    .filter((event) => importance === "all" || event.importance === importance)
    .filter((event) => sourceMode === "all" || event.sourceMode === sourceMode);
}

export function summarizeCalendarEvents(events = [], { asOf = new Date().toISOString() } = {}) {
  const upcoming = upcomingCalendarEvents(events, { asOf, daysAhead: 45 });
  return {
    total: normalizeCalendarEvents(events, { asOf }).length,
    upcoming45: upcoming.length,
    next7: upcoming.filter((event) => event.daysUntil <= 7).length,
    highImportance: upcoming.filter((event) => event.importance === "high").length,
    mockCount: upcoming.filter((event) => event.sourceMode === "mock").length,
    importedCount: upcoming.filter((event) => event.sourceMode === "imported").length,
    manualCount: upcoming.filter((event) => event.sourceMode === "manual").length,
    nextEvent: upcoming[0] || null
  };
}

export function eventsForTicker(events = [], ticker = "") {
  const normalizedTicker = normalizeTicker(ticker);
  if (!normalizedTicker) return [];
  return normalizeCalendarEvents(events)
    .filter((event) => event.tickers.includes(normalizedTicker))
    .sort(compareEvents);
}

export function upsertCalendarEvent(events = [], input = {}, options = {}) {
  const next = normalizeCalendarEvent(input, { ...options, sourceMode: input.sourceMode || "manual" });
  const existing = normalizeCalendarEvents(events, options).filter((event) => event.id !== next.id);
  return dedupeEvents([...existing, next]).sort(compareEvents);
}

export function removeCalendarEvent(events = [], id = "") {
  return normalizeCalendarEvents(events).filter((event) => event.id !== id);
}

export function importCalendarEventFile(text = "", { fileName = "calendar-events.json", asOf = new Date().toISOString() } = {}) {
  const parsed = parseCalendarInput(text, fileName);
  if (parsed.error) {
    return {
      ok: false,
      partial: false,
      fileName,
      eventsImported: 0,
      records: [],
      rejectedRows: [{ rowNumber: 1, reasons: [parsed.error] }],
      validation: { ok: false, errors: [parsed.error], warnings: [] },
      detectedColumns: [],
      sourceMode: "imported"
    };
  }
  const validation = validateCalendarEvents(parsed.records.map((record) => ({ ...record, sourceMode: "imported", sourceLabel: record.sourceLabel || "Imported calendar file" })));
  return {
    ok: validation.ok && validation.records.length > 0,
    partial: validation.records.length > 0 && validation.rejectedRows.length > 0,
    fileName,
    fileType: /\.csv$/i.test(fileName) ? "csv" : "json",
    detectedColumns: parsed.detectedColumns || [],
    rowsParsed: parsed.records.length,
    eventsImported: validation.records.length,
    records: validation.records.map((event) => ({ ...event, importedAt: event.importedAt || asOf })),
    rejectedRows: validation.rejectedRows,
    validation: {
      ok: validation.ok && validation.records.length > 0,
      errors: validation.records.length ? [] : ["No valid event rows found."],
      warnings: validation.rejectedRows.map((row) => `Row ${row.rowNumber}: ${row.reasons.join(", ")}`)
    },
    sourceMode: "imported"
  };
}

export function eventId({ ticker = "", tickers = [], eventType = "custom", date = "", title = "", sourceMode = "manual" } = {}) {
  const tickerKey = normalizeTicker(ticker) || uniqueTickers(tickers)[0] || "portfolio";
  const slug = String(title || eventType || "event")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `calendar:${tickerKey}:${normalizeEventType(eventType)}:${normalizeDate(date) || "no-date"}:${sourceMode}:${slug || "event"}`;
}

function parseCalendarInput(text, fileName) {
  const body = String(text || "").trim();
  if (!body) return { error: "File is empty.", records: [], detectedColumns: [] };
  if (/\.csv$/i.test(fileName)) return parseCalendarCsv(body);
  try {
    const parsed = JSON.parse(body);
    const records = Array.isArray(parsed) ? parsed : parsed.events || parsed.calendarEvents || [];
    if (!Array.isArray(records)) return { error: "JSON must contain an array or an events/calendarEvents array.", records: [], detectedColumns: [] };
    return { records, detectedColumns: Object.keys(records[0] || {}) };
  } catch (error) {
    return { error: `Invalid JSON: ${String(error?.message || error).slice(0, 120)}`, records: [], detectedColumns: [] };
  }
}

function parseCalendarCsv(text) {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return { error: "CSV must include a header row and at least one event row.", records: [], detectedColumns: rows[0] || [] };
  const headers = rows[0].map((header) => String(header || "").trim());
  const records = rows.slice(1)
    .filter((row) => row.some((cell) => String(cell || "").trim()))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] || ""])))
    .map(mapCalendarColumns);
  return { records, detectedColumns: headers };
}

function mapCalendarColumns(row = {}) {
  const lower = Object.fromEntries(Object.entries(row).map(([key, value]) => [String(key).trim().toLowerCase(), value]));
  return {
    id: pick(lower, ["id", "event id"]),
    ticker: pick(lower, ["ticker", "symbol", "primary ticker"]),
    tickers: pick(lower, ["tickers", "affected tickers", "symbols"]),
    eventType: pick(lower, ["event type", "type", "category"]),
    date: pick(lower, ["date", "event date", "earnings date", "ex-dividend date"]),
    title: pick(lower, ["title", "headline", "event"]),
    summary: pick(lower, ["summary", "description"]),
    importance: pick(lower, ["importance", "severity"]),
    sourceMode: pick(lower, ["source mode", "mode"]) || "imported",
    sourceLabel: pick(lower, ["source label", "source", "source name"]) || "Imported calendar file",
    sourceUrl: pick(lower, ["source url", "url"]),
    notes: pick(lower, ["notes", "detail"])
  };
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

function compareEvents(a, b) {
  const dayDiff = timestampValue(a.date) - timestampValue(b.date);
  if (dayDiff) return dayDiff;
  const importanceDiff = importanceRank(b.importance) - importanceRank(a.importance);
  if (importanceDiff) return importanceDiff;
  return String(a.title || "").localeCompare(String(b.title || ""));
}

function dedupeEvents(events = []) {
  const byId = new Map();
  normalizeCalendarEvents(events).forEach((event) => {
    const key = event.id || eventId(event);
    if (!byId.has(key)) byId.set(key, event);
  });
  return [...byId.values()];
}

function normalizeEventType(type = "") {
  const value = String(type || "").trim().toLowerCase().replaceAll("_", "-").replace(/\s+/g, "-");
  if (["dividend", "ex-dividend-date", "exdividend"].includes(value)) return "ex-dividend";
  if (["investor", "analyst-day", "investor-day"].includes(value)) return "investor-day";
  if (["product", "launch", "product-launch", "product-event"].includes(value)) return "product-event";
  if (["fed", "macro", "rates", "fed-macro", "fomc"].includes(value)) return "fed-macro";
  if (["earnings", "earnings-date", "quarterly-results"].includes(value)) return "earnings";
  return EVENT_TYPES.includes(value) ? value : "custom";
}

function normalizeImportance(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (["critical", "extreme", "high"].includes(normalized)) return "high";
  if (["watch", "medium", "moderate"].includes(normalized)) return "medium";
  if (["info", "low"].includes(normalized)) return "low";
  return "medium";
}

function normalizeSourceMode(value = "") {
  const normalized = String(value || "").trim().toLowerCase().replaceAll("_", "-");
  if (["sample", "demo", "mock"].includes(normalized)) return "mock";
  if (["local-file", "import", "imported", "csv", "json"].includes(normalized)) return "imported";
  if (["user", "manual", "custom"].includes(normalized)) return "manual";
  if (["connected", "provider", "api", "live"].includes(normalized)) return "live";
  if (["stale", "stale-data"].includes(normalized)) return "stale";
  if (["failed", "error"].includes(normalized)) return "error";
  return "manual";
}

function defaultImportance(eventType) {
  if (eventType === "earnings" || eventType === "fed-macro") return "high";
  if (eventType === "investor-day" || eventType === "product-event") return "medium";
  return "low";
}

function defaultEventTitle({ ticker = "", tickers = [], eventType = "custom" } = {}) {
  const label = normalizeTicker(ticker) || uniqueTickers(tickers)[0] || "Portfolio";
  return `${label} ${eventTypeLabel(eventType)}`;
}

function splitList(value = "") {
  return String(value || "").split(/[;,|]/).map((item) => item.trim()).filter(Boolean);
}

function uniqueTickers(values = []) {
  return [...new Set(values.map((ticker) => normalizeTicker(ticker)).filter(Boolean))];
}

function normalizeDate(value = "") {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value).trim())) return String(value).trim();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : isoDate(parsed);
}

function validDate(value = "") {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  return new Date(date.getTime() + Number(days || 0) * 86400000);
}

function daysUntil(dateValue, baseDate) {
  const date = validDate(`${normalizeDate(dateValue)}T00:00:00`);
  if (!date || !baseDate) return null;
  const base = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  return Math.round((date.getTime() - base.getTime()) / 86400000);
}

function timestampValue(value = "") {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? Number.MAX_SAFE_INTEGER : parsed.getTime();
}

function importanceRank(value = "") {
  return { high: 3, medium: 2, low: 1 }[normalizeImportance(value)] || 0;
}

function staleAfterForMode(sourceMode, asOf) {
  if (sourceMode === "live") return addDays(validDate(asOf) || new Date(), 2).toISOString();
  if (sourceMode === "imported") return addDays(validDate(asOf) || new Date(), 14).toISOString();
  if (sourceMode === "manual") return addDays(validDate(asOf) || new Date(), 30).toISOString();
  return "";
}

function isSampleSource(source = "") {
  return /demo|sample|mock/i.test(String(source || ""));
}

function safeUrl(url = "") {
  const text = String(url || "").trim();
  if (!text) return "";
  try {
    const parsed = new URL(text);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
  } catch {
    return "";
  }
}

function pick(object = {}, keys = []) {
  for (const key of keys) {
    const value = object[key];
    if (value !== undefined && String(value).trim()) return String(value).trim();
  }
  return "";
}
