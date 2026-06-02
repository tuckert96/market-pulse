import { normalizeTicker } from "./portfolioSchema.js";

export const SEEKING_ALPHA_AI_SOURCE_TYPES = Object.freeze([
  "ask_seeking_alpha",
  "virtual_analyst_report",
  "summary_report",
  "earnings_call_insight",
  "unknown"
]);

export const SEEKING_ALPHA_AI_SOURCE_MODES = Object.freeze([
  "sample",
  "pasted",
  "imported_file",
  "saved_html",
  "browser_assisted",
  "stale",
  "error"
]);

export const SEEKING_ALPHA_AI_STALE_AFTER_DAYS = 45;
const MAX_RESPONSE_TEXT_LENGTH = 4000;
const MAX_PROMPT_TEXT_LENGTH = 800;
const MAX_THEME_COUNT = 8;

const BLOCKING_SECRET_PATTERNS = Object.freeze([
  { label: "cookie/session value", pattern: /\b(?:cookie|session(?:id)?|sid|sa_session|remember_token)\b\s*[:=]\s*[^;\s]+/i },
  { label: "authorization header", pattern: /\bAuthorization\s*[:=]\s*Bearer\s+[A-Za-z0-9._~-]+/i },
  { label: "access token", pattern: /\b(?:access[_-]?token|refresh[_-]?token|client[_-]?secret|api[_-]?key|apikey|password)\b\s*[:=]\s*[^,\s]+/i }
]);

const REDACTION_PATTERNS = Object.freeze([
  { label: "email address", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, replacement: "[redacted-email]" },
  { label: "auth query parameter", pattern: /([?&](?:token|auth|session|key|secret|apikey|api_key)=)[^&\s"']+/gi, replacement: "$1[redacted]" },
  { label: "bearer token", pattern: /Bearer\s+[A-Za-z0-9._~-]+/gi, replacement: "Bearer [redacted]" },
  { label: "secret-shaped token", pattern: /\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16})\b/g, replacement: "[redacted-secret]" },
  { label: "long opaque token", pattern: /\b[A-Za-z0-9_-]{48,}\b/g, replacement: "[redacted-token]" },
  { label: "account identifier", pattern: /\b(?:account|acct)\s*(?:number|id)?\s*[:#]?\s*\d{5,}\b/gi, replacement: "account [redacted]" }
]);

const FALSE_POSITIVE_TICKERS = new Set([
  "A", "AI", "AND", "ARE", "AS", "ASK", "BE", "BUY", "CAN", "CEO", "CFO", "EPS", "ETF", "F", "FCF", "GDP", "HTML", "IT", "LLC", "M", "MOM",
  "DRAM", "HBM", "NAND", "NOW", "OR", "PE", "PEG", "ROI", "ROE", "SA", "SEC", "SELL", "THE", "TO", "US", "USD", "YOY"
]);

const SOURCE_TYPE_LABELS = Object.freeze({
  ask_seeking_alpha: "Ask Seeking Alpha",
  virtual_analyst_report: "Virtual Analyst Report",
  summary_report: "AI Summary Report",
  earnings_call_insight: "Earnings Call Insight",
  unknown: "Seeking Alpha AI output"
});

const SOURCE_MODE_LABELS = Object.freeze({
  sample: "Sample",
  pasted: "Pasted",
  imported_file: "Imported",
  saved_html: "Saved HTML",
  browser_assisted: "Browser-assisted",
  stale: "Stale",
  error: "Error"
});

export function normalizeSeekingAlphaAiRecords(records = [], options = {}) {
  return records
    .map((record) => normalizeSeekingAlphaAiRecord(record, options))
    .filter((result) => result.ok)
    .map((result) => result.record);
}

export function normalizeSeekingAlphaAiRecord(input = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  const importedAt = normalizeDate(input.importedAt || options.importedAt || now, now);
  const sourceMode = normalizeSourceMode(input.sourceMode || options.sourceMode || "pasted");
  const rawText = sourceMode === "saved_html"
    ? htmlToText(textFrom(input, ["html", "rawHtml", "responseText", "text", "content"]))
    : textFrom(input, ["responseText", "normalizedExcerpt", "text", "content", "body"]);
  const redaction = redactSeekingAlphaAiText(rawText);
  const userTickers = normalizeTickerList(input.tickers || input.ticker || options.tickers);
  const knownTickers = normalizeTickerList(options.knownTickers || []);
  const tickers = dedupe([...userTickers, ...extractTickers(redaction.text, { knownTickers })]);
  const sourceType = normalizeSourceType(input.sourceType || detectSourceType(redaction.text));
  const promptText = capText(redactSeekingAlphaAiText(textFrom(input, ["promptText", "prompt", "query", "question"]) || extractPrompt(redaction.text)).text, MAX_PROMPT_TEXT_LENGTH);
  const reportDate = normalizeDate(input.reportDate || input.ratingDate || detectReportDate(redaction.text) || importedAt, importedAt);
  const extractedBullishPoints = normalizeStringArray(input.extractedBullishPoints || input.bullishPoints || extractThemePoints(redaction.text, "bullish"));
  const extractedBearishPoints = normalizeStringArray(input.extractedBearishPoints || input.bearishPoints || extractThemePoints(redaction.text, "bearish"));
  const extractedFinancialMetrics = normalizeStringArray(input.extractedFinancialMetrics || input.financialMetrics || extractFinancialMetrics(redaction.text));
  const extractedRatings = normalizeRatings(input.extractedRatings || input.ratings || extractRatings(redaction.text));
  const citedSourceLabels = normalizeStringArray(input.citedSourceLabels || input.sources || extractCitedSourceLabels(redaction.text));
  const freshnessStatus = freshnessForDate(reportDate, now, options.staleAfterDays ?? SEEKING_ALPHA_AI_STALE_AFTER_DAYS);
  const validationWarnings = normalizeStringArray(input.validationWarnings || []);
  const errors = [];

  if (!redaction.text) errors.push("Seeking Alpha AI content is empty.");
  if (redaction.blockingWarnings.length) {
    errors.push(`Content appears to include credential material: ${redaction.blockingWarnings.join(", ")}. Paste only visible report text, never cookies, sessions, or tokens.`);
  }
  if (!tickers.length) errors.push("At least one ticker is required or must be detected.");
  if (sourceType === "unknown") validationWarnings.push("Report type could not be classified; saved as Seeking Alpha AI output.");
  if (!promptText) validationWarnings.push("No Ask Seeking Alpha prompt/query was detected.");
  if (!extractedBullishPoints.length && !extractedBearishPoints.length && !extractedFinancialMetrics.length && !Object.keys(extractedRatings).length) {
    validationWarnings.push("Low-confidence extraction: no clear bullish, bearish, metric, or rating section was found.");
  }
  if (freshnessStatus === "stale") validationWarnings.push("Report is stale based on the imported or detected report date.");
  if (redaction.truncated) validationWarnings.push(`Stored excerpt was capped at ${MAX_RESPONSE_TEXT_LENGTH} characters.`);

  const record = {
    schemaVersion: 1,
    id: input.id || seekingAlphaAiRecordId({ tickers, sourceType, sourceMode, promptText, reportDate, text: redaction.text }),
    tickers,
    ticker: tickers[0] || "",
    sourceType,
    sourceTypeLabel: SOURCE_TYPE_LABELS[sourceType],
    sourceMode,
    sourceModeLabel: SOURCE_MODE_LABELS[sourceMode],
    promptText,
    responseText: capText(redaction.text, MAX_RESPONSE_TEXT_LENGTH),
    normalizedExcerpt: buildNormalizedExcerpt(redaction.text, {
      extractedBullishPoints,
      extractedBearishPoints,
      extractedFinancialMetrics,
      extractedRatings
    }),
    extractedBullishPoints,
    extractedBearishPoints,
    extractedFinancialMetrics,
    extractedRatings,
    citedSourceLabels,
    reportDate,
    importedAt,
    freshnessStatus,
    validationWarnings: dedupe(validationWarnings),
    redactionWarnings: dedupe(redaction.redactionWarnings),
    rawTextTruncated: redaction.truncated,
    sourceLabel: "Seeking Alpha AI personal import",
    liveProviderCalls: false,
    credentialMaterialStored: false
  };

  return {
    ok: errors.length === 0,
    record,
    errors,
    warnings: [...record.validationWarnings, ...record.redactionWarnings]
  };
}

export function buildSeekingAlphaAiImportPreview(inputText = "", options = {}) {
  const now = options.now || new Date().toISOString();
  const fileName = options.fileName || (options.inputType === "paste" ? "pasted-seeking-alpha-ai-output" : "seeking-alpha-ai-import");
  const recordsInput = seekingAlphaAiInputRows(inputText, options);
  const acceptedRecords = [];
  const rejectedRows = [];
  const warnings = [];

  recordsInput.rows.forEach((row, index) => {
    const sourceMode = normalizeSourceMode(row.sourceMode || recordsInput.sourceMode || options.sourceMode || "pasted");
    const result = normalizeSeekingAlphaAiRecord(row, {
      now,
      sourceMode,
      knownTickers: options.knownTickers,
      tickers: row.tickers || row.ticker || options.tickers,
      staleAfterDays: options.staleAfterDays
    });
    if (result.ok) {
      acceptedRecords.push(result.record);
      warnings.push(...result.warnings.map((warning) => `Row ${index + 1}: ${warning}`));
    } else {
      rejectedRows.push({
        rowNumber: index + 1,
        reasons: result.errors,
        warnings: result.warnings,
        preview: capText(String(row.responseText || row.text || row.content || ""), 160)
      });
    }
  });

  if (recordsInput.error) {
    rejectedRows.push({ rowNumber: 1, reasons: [recordsInput.error], warnings: [], preview: "" });
  }

  const duplicateGroups = duplicateRecordKeys(acceptedRecords);
  const partial = Boolean(acceptedRecords.length && rejectedRows.length);
  return {
    provider: "seekingAlphaAi",
    fileName,
    sourceMode: normalizeSourceMode(recordsInput.sourceMode || options.sourceMode || "pasted"),
    records: acceptedRecords,
    validation: {
      ok: acceptedRecords.length > 0,
      errors: acceptedRecords.length ? [] : rejectedRows.flatMap((row) => row.reasons),
      warnings: dedupe([...warnings, ...recordsInput.warnings])
    },
    importReport: {
      provider: "seekingAlphaAi",
      fileName,
      importedAt: now,
      rowsParsed: recordsInput.rows.length,
      recordsImported: acceptedRecords.length,
      acceptedRows: acceptedRecords.length,
      rejectedRows,
      duplicateRecords: duplicateGroups,
      tickersDetected: dedupe(acceptedRecords.flatMap((record) => record.tickers)),
      sourceTypesDetected: dedupe(acceptedRecords.map((record) => record.sourceType)),
      sourceMode: normalizeSourceMode(recordsInput.sourceMode || options.sourceMode || "pasted"),
      warnings: dedupe([...warnings, ...recordsInput.warnings]),
      health: {
        status: acceptedRecords.length
          ? partial ? "Preview ready with rejected rows" : "Preview ready"
          : "Import needs a fix",
        tone: acceptedRecords.length ? partial ? "warning" : "success" : "error",
        message: acceptedRecords.length
          ? `${acceptedRecords.length} Seeking Alpha AI record${acceptedRecords.length === 1 ? "" : "s"} can be saved locally. ${rejectedRows.length ? `${rejectedRows.length} row${rejectedRows.length === 1 ? "" : "s"} rejected for review.` : "Nothing changes until you confirm."}`
          : "No usable Seeking Alpha AI records were found."
      }
    },
    summary: {
      message: acceptedRecords.length
        ? `${acceptedRecords.length} Seeking Alpha AI record${acceptedRecords.length === 1 ? "" : "s"} ready to preview.`
        : "Seeking Alpha AI import could not be parsed."
    }
  };
}

export function mergeSeekingAlphaAiRecords(existing = [], incoming = [], options = {}) {
  const now = options.now || new Date().toISOString();
  const map = new Map();
  const normalizedExisting = normalizeSeekingAlphaAiRecords(existing, { now, sourceMode: "imported_file" });
  normalizedExisting.forEach((record) => map.set(recordKey(record), record));
  const normalizedIncoming = normalizeSeekingAlphaAiRecords(incoming, { now });
  let added = 0;
  let updated = 0;
  normalizedIncoming.forEach((record) => {
    const key = recordKey(record);
    if (map.has(key)) updated += 1;
    else added += 1;
    map.set(key, {
      ...map.get(key),
      ...record,
      updatedAt: now
    });
  });
  return {
    records: [...map.values()].sort(compareSeekingAlphaAiRecordsForSort),
    added,
    updated
  };
}

export function seekingAlphaAiStatusSummary(records = []) {
  const rows = normalizeSeekingAlphaAiRecords(records);
  const staleCount = rows.filter((record) => record.freshnessStatus === "stale").length;
  const tickers = dedupe(rows.flatMap((record) => record.tickers));
  return {
    records: rows.length,
    tickers,
    staleCount,
    latestImportedAt: rows.map((record) => record.importedAt).sort().at(-1) || null,
    sourceModes: dedupe(rows.map((record) => record.sourceMode)),
    sourceTypes: dedupe(rows.map((record) => record.sourceType))
  };
}

export function seekingAlphaAiRecordsForTicker(records = [], ticker = "") {
  const normalizedTicker = normalizeTicker(ticker);
  if (!normalizedTicker) return [];
  return normalizeSeekingAlphaAiRecords(records)
    .filter((record) => (record.tickers || []).map(normalizeTicker).includes(normalizedTicker))
    .sort(compareSeekingAlphaAiRecordsForSort);
}

export function summarizeSeekingAlphaAiForTicker(records = [], ticker = "", options = {}) {
  const rows = seekingAlphaAiRecordsForTicker(records, ticker);
  const now = options.now || new Date().toISOString();
  const latest = rows[0] || null;
  const freshRows = rows.filter((record) => record.freshnessStatus !== "stale");
  const staleRows = rows.filter((record) => record.freshnessStatus === "stale");
  const bullishPoints = dedupe(rows.flatMap((record) => record.extractedBullishPoints || [])).slice(0, MAX_THEME_COUNT);
  const bearishPoints = dedupe(rows.flatMap((record) => record.extractedBearishPoints || [])).slice(0, MAX_THEME_COUNT);
  const financialMetrics = dedupe(rows.flatMap((record) => record.extractedFinancialMetrics || [])).slice(0, MAX_THEME_COUNT);
  const ratingMentions = mergeRatingMentions(rows);
  const warningCount = rows.reduce((total, record) => total + (record.validationWarnings || []).length + (record.redactionWarnings || []).length, 0);
  const supportScore = scoreSeekingAlphaAiSupport({ rows, bullishPoints, bearishPoints, ratingMentions });
  const riskScore = scoreSeekingAlphaAiRisk({ rows, bearishPoints, staleRows, warningCount });
  const reviewPriorityScore = scoreSeekingAlphaAiReviewPriority({ rows, freshRows, staleRows, bullishPoints, bearishPoints, financialMetrics, ratingMentions, warningCount });
  const latestDate = latest?.reportDate || latest?.importedAt || "";
  const ageDays = ageInDays(latestDate, now);
  return {
    ticker: normalizeTicker(ticker),
    records: rows,
    recordCount: rows.length,
    freshCount: freshRows.length,
    staleCount: staleRows.length,
    sourceTypes: dedupe(rows.map((record) => record.sourceTypeLabel || SOURCE_TYPE_LABELS[record.sourceType] || record.sourceType)),
    sourceModes: dedupe(rows.map((record) => record.sourceModeLabel || SOURCE_MODE_LABELS[record.sourceMode] || record.sourceMode)),
    latestRecord: latest,
    latestDate,
    latestAgeDays: ageDays,
    freshnessStatus: rows.length ? staleRows.length === rows.length ? "stale" : "current" : "missing",
    freshnessLabel: rows.length ? staleRows.length === rows.length ? "Stale imported Seeking Alpha AI" : "Imported Seeking Alpha AI" : "Missing Seeking Alpha AI",
    dataStatus: rows.length ? "Imported" : "Missing",
    bullishPoints,
    bearishPoints,
    financialMetrics,
    ratingMentions,
    citedSourceLabels: dedupe(rows.flatMap((record) => record.citedSourceLabels || [])).slice(0, 8),
    validationWarnings: dedupe(rows.flatMap((record) => record.validationWarnings || [])).slice(0, 8),
    redactionWarnings: dedupe(rows.flatMap((record) => record.redactionWarnings || [])).slice(0, 8),
    supportScore,
    riskScore,
    reviewPriorityScore,
    summary: summarizeSeekingAlphaAiText({ rows, bullishPoints, bearishPoints, staleRows })
  };
}

export function buildSeekingAlphaAiTickerSummaries(records = [], tickers = [], options = {}) {
  const knownTickers = normalizeTickerList(tickers);
  const tickerSet = new Set([
    ...knownTickers,
    ...normalizeSeekingAlphaAiRecords(records).flatMap((record) => record.tickers || [])
  ].map(normalizeTicker).filter(Boolean));
  return new Map([...tickerSet].map((ticker) => [ticker, summarizeSeekingAlphaAiForTicker(records, ticker, options)]));
}

export function buildSeekingAlphaAiDeltaSummary(records = [], ticker = "", options = {}) {
  const rows = seekingAlphaAiRecordsForTicker(records, ticker);
  const summary = summarizeSeekingAlphaAiForTicker(records, ticker, options);
  if (!rows.length) {
    return {
      ticker: normalizeTicker(ticker),
      latestRecord: null,
      previousRecord: null,
      changeStatus: "missing",
      changeLabel: "Missing research",
      addedSupport: [],
      removedSupport: [],
      addedRisks: [],
      removedRisks: [],
      ratingChanges: [],
      newFinancialMetrics: [],
      warnings: ["No Seeking Alpha AI personal import is saved for this ticker."],
      summary: "No prior Seeking Alpha AI personal import exists for this ticker."
    };
  }
  const latestRecord = rows[0] || null;
  const previousRecord = rows[1] || null;
  const staleOnly = summary.staleCount === summary.recordCount;
  if (!previousRecord) {
    return {
      ticker: summary.ticker,
      latestRecord,
      previousRecord: null,
      changeStatus: staleOnly ? "stale-only" : "new",
      changeLabel: staleOnly ? "Stale only" : "New import",
      addedSupport: summary.bullishPoints,
      removedSupport: [],
      addedRisks: summary.bearishPoints,
      removedRisks: [],
      ratingChanges: [],
      newFinancialMetrics: summary.financialMetrics,
      warnings: summary.validationWarnings,
      summary: staleOnly
        ? "Only stale Seeking Alpha AI personal-import context is saved for this ticker."
        : "First saved Seeking Alpha AI personal-import context for this ticker."
    };
  }
  const delta = compareSeekingAlphaAiRecords(previousRecord, latestRecord);
  const riskDelta = delta.addedRisks.length + delta.removedSupport.length + delta.ratingChanges.filter((change) => change.direction === "weaker").length;
  const supportDelta = delta.addedSupport.length + delta.removedRisks.length + delta.ratingChanges.filter((change) => change.direction === "stronger").length;
  const warningDelta = delta.warnings.length;
  const changeStatus = staleOnly
    ? "stale-only"
    : riskDelta && supportDelta
      ? "mixed-context"
      : riskDelta || warningDelta
        ? "deteriorating-context"
        : supportDelta
          ? "improving-context"
          : "unchanged";
  return {
    ticker: summary.ticker,
    latestRecord,
    previousRecord,
    changeStatus,
    changeLabel: seekingAlphaAiChangeLabel(changeStatus),
    ...delta,
    summary: seekingAlphaAiDeltaText({ ticker: summary.ticker, changeStatus, delta, latestRecord, previousRecord })
  };
}

export function buildSeekingAlphaAiDeltaSummaries(records = [], tickers = [], options = {}) {
  const tickerSet = new Set([
    ...normalizeTickerList(tickers),
    ...normalizeSeekingAlphaAiRecords(records).flatMap((record) => record.tickers || [])
  ].map(normalizeTicker).filter(Boolean));
  return new Map([...tickerSet].map((ticker) => [ticker, buildSeekingAlphaAiDeltaSummary(records, ticker, options)]));
}

export function compareSeekingAlphaAiRecords(previous = {}, latest = {}) {
  const previousRatings = previous.extractedRatings || {};
  const latestRatings = latest.extractedRatings || {};
  const ratingKeys = dedupe([...Object.keys(previousRatings), ...Object.keys(latestRatings)]);
  const ratingChanges = ratingKeys
    .map((key) => {
      const from = String(previousRatings[key] || "").trim();
      const to = String(latestRatings[key] || "").trim();
      if (!from && !to) return null;
      if (from.toLowerCase() === to.toLowerCase()) return null;
      return {
        field: key,
        label: humanizeField(key),
        from: from || "not mentioned",
        to: to || "not mentioned",
        direction: ratingChangeDirection(from, to),
        summary: `${humanizeField(key)} changed from ${from || "not mentioned"} to ${to || "not mentioned"} in the imported text.`
      };
    })
    .filter(Boolean);
  const addedSupport = stringDiff(latest.extractedBullishPoints, previous.extractedBullishPoints);
  const removedSupport = stringDiff(previous.extractedBullishPoints, latest.extractedBullishPoints);
  const addedRisks = stringDiff(latest.extractedBearishPoints, previous.extractedBearishPoints);
  const removedRisks = stringDiff(previous.extractedBearishPoints, latest.extractedBearishPoints);
  const newFinancialMetrics = stringDiff(latest.extractedFinancialMetrics, previous.extractedFinancialMetrics);
  const latestWarnings = [...(latest.validationWarnings || []), ...(latest.redactionWarnings || [])];
  const previousWarnings = [...(previous.validationWarnings || []), ...(previous.redactionWarnings || [])];
  return {
    addedSupport,
    removedSupport,
    addedRisks,
    removedRisks,
    ratingChanges,
    newFinancialMetrics,
    warnings: stringDiff(latestWarnings, previousWarnings)
  };
}

function mergeRatingMentions(records = []) {
  const pairs = [];
  records.forEach((record) => {
    Object.entries(record.extractedRatings || {}).forEach(([label, value]) => {
      if (value) pairs.push(`${humanizeField(label)}: ${value}`);
    });
  });
  return dedupe(pairs).slice(0, MAX_THEME_COUNT);
}

function scoreSeekingAlphaAiReviewPriority({ rows = [], freshRows = [], staleRows = [], bullishPoints = [], bearishPoints = [], financialMetrics = [], ratingMentions = [], warningCount = 0 } = {}) {
  if (!rows.length) return 0;
  const evidenceBreadth = Math.min(1, (bullishPoints.length + bearishPoints.length + financialMetrics.length + ratingMentions.length) / 10);
  const freshComponent = freshRows.length ? 0.16 : 0;
  const staleComponent = staleRows.length ? 0.08 : 0;
  const riskComponent = Math.min(0.12, bearishPoints.length * 0.025);
  const warningPenalty = Math.min(0.08, warningCount * 0.01);
  return roundScore(clamp01(0.42 + evidenceBreadth * 0.22 + freshComponent + staleComponent + riskComponent - warningPenalty));
}

function scoreSeekingAlphaAiSupport({ rows = [], bullishPoints = [], bearishPoints = [], ratingMentions = [] } = {}) {
  if (!rows.length) return 0;
  const bullish = Math.min(0.22, bullishPoints.length * 0.035);
  const ratings = Math.min(0.12, ratingMentions.length * 0.025);
  const riskOffset = Math.min(0.14, bearishPoints.length * 0.025);
  return roundScore(clamp01(0.48 + bullish + ratings - riskOffset));
}

function scoreSeekingAlphaAiRisk({ rows = [], bearishPoints = [], staleRows = [], warningCount = 0 } = {}) {
  if (!rows.length) return 0;
  const risk = Math.min(0.28, bearishPoints.length * 0.045);
  const stale = staleRows.length ? 0.1 : 0;
  const warning = Math.min(0.1, warningCount * 0.012);
  return roundScore(clamp01(0.34 + risk + stale + warning));
}

function seekingAlphaAiChangeLabel(status = "unchanged") {
  return ({
    missing: "Missing research",
    new: "New import",
    "improving-context": "Supportive context changed",
    "deteriorating-context": "Risk context changed",
    "mixed-context": "Mixed context changed",
    "stale-only": "Stale only",
    unchanged: "No major change",
    "insufficient-history": "Needs another import"
  })[status] || "No major change";
}

function seekingAlphaAiDeltaText({ ticker = "", changeStatus = "unchanged", delta = {}, latestRecord = {}, previousRecord = {} } = {}) {
  const label = seekingAlphaAiChangeLabel(changeStatus);
  const latestDate = latestRecord.reportDate || latestRecord.importedAt || "latest import";
  const previousDate = previousRecord.reportDate || previousRecord.importedAt || "prior import";
  if (changeStatus === "unchanged") return `${ticker} has no major Seeking Alpha AI context change between ${previousDate} and ${latestDate}.`;
  const changes = [
    delta.addedSupport?.length ? `${delta.addedSupport.length} new supportive point${delta.addedSupport.length === 1 ? "" : "s"}` : "",
    delta.addedRisks?.length ? `${delta.addedRisks.length} new risk point${delta.addedRisks.length === 1 ? "" : "s"}` : "",
    delta.removedSupport?.length ? `${delta.removedSupport.length} prior support point${delta.removedSupport.length === 1 ? "" : "s"} no longer appears` : "",
    delta.removedRisks?.length ? `${delta.removedRisks.length} prior risk point${delta.removedRisks.length === 1 ? "" : "s"} no longer appears` : "",
    delta.ratingChanges?.length ? `${delta.ratingChanges.length} rating mention change${delta.ratingChanges.length === 1 ? "" : "s"}` : "",
    delta.warnings?.length ? `${delta.warnings.length} new parser warning${delta.warnings.length === 1 ? "" : "s"}` : ""
  ].filter(Boolean);
  return `${ticker} ${label.toLowerCase()} since ${previousDate}: ${changes.join("; ") || "context changed in the imported report text"}.`;
}

function summarizeSeekingAlphaAiText({ rows = [], bullishPoints = [], bearishPoints = [], staleRows = [] } = {}) {
  if (!rows.length) return "No imported Seeking Alpha AI personal output is saved for this ticker.";
  const pieces = [];
  if (bullishPoints.length) pieces.push(`${bullishPoints.length} supportive point${bullishPoints.length === 1 ? "" : "s"}`);
  if (bearishPoints.length) pieces.push(`${bearishPoints.length} risk point${bearishPoints.length === 1 ? "" : "s"}`);
  if (!pieces.length) pieces.push(`${rows.length} imported report${rows.length === 1 ? "" : "s"}`);
  const staleNote = staleRows.length === rows.length ? " All saved reports are stale." : staleRows.length ? ` ${staleRows.length} saved report${staleRows.length === 1 ? "" : "s"} stale.` : "";
  return `${pieces.join(" and ")} from Tucker-imported Seeking Alpha AI output.${staleNote}`;
}

function humanizeField(value = "") {
  return String(value || "")
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function ageInDays(dateValue, nowValue) {
  const date = new Date(dateValue);
  const now = new Date(nowValue);
  if (Number.isNaN(date.getTime()) || Number.isNaN(now.getTime())) return null;
  return Math.max(0, Math.round((now.getTime() - date.getTime()) / 86_400_000));
}

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function roundScore(value) {
  return Math.round(clamp01(value) * 1000) / 1000;
}

function seekingAlphaAiInputRows(inputText, options = {}) {
  const inputType = String(options.inputType || options.sourceMode || "").toLowerCase();
  const text = String(inputText || "").trim();
  if (!text) return { rows: [], sourceMode: normalizeSourceMode(options.sourceMode || "pasted"), warnings: [], error: "Paste or import Seeking Alpha AI content before previewing." };
  if (inputType.includes("json") || /^[\[{]/.test(text)) {
    try {
      const payload = JSON.parse(text);
      const rows = Array.isArray(payload)
        ? payload
        : payload.records || payload.seekingAlphaAiRecords || payload.data || [payload];
      if (!Array.isArray(rows)) return { rows: [], sourceMode: "imported_file", warnings: [], error: "JSON must be an object, array, records array, or seekingAlphaAiRecords array." };
      return { rows, sourceMode: "imported_file", warnings: [], error: "" };
    } catch (error) {
      if (inputType.includes("json")) return { rows: [], sourceMode: "imported_file", warnings: [], error: `JSON could not be parsed: ${safeMessage(error)}.` };
    }
  }
  if (inputType.includes("html") || /<html|<body|<article|<section/i.test(text)) {
    return { rows: [{ responseText: htmlToText(text), sourceMode: "saved_html", reportDate: options.reportDate }], sourceMode: "saved_html", warnings: [], error: "" };
  }
  return { rows: [{ responseText: text, sourceMode: normalizeSourceMode(options.sourceMode || "pasted"), reportDate: options.reportDate }], sourceMode: normalizeSourceMode(options.sourceMode || "pasted"), warnings: [], error: "" };
}

function htmlToText(value = "") {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6]|section|article|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function redactSeekingAlphaAiText(value = "") {
  const blockingWarnings = BLOCKING_SECRET_PATTERNS
    .filter(({ pattern }) => pattern.test(String(value || "")))
    .map(({ label }) => label);
  let text = String(value || "");
  const redactionWarnings = [];
  REDACTION_PATTERNS.forEach(({ label, pattern, replacement }) => {
    if (pattern.test(text)) redactionWarnings.push(`${label} redacted`);
    text = text.replace(pattern, replacement);
  });
  text = text.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const truncated = text.length > MAX_RESPONSE_TEXT_LENGTH;
  return {
    text: capText(text, MAX_RESPONSE_TEXT_LENGTH),
    blockingWarnings: dedupe(blockingWarnings),
    redactionWarnings: dedupe(redactionWarnings),
    truncated
  };
}

function extractTickers(text = "", options = {}) {
  const knownTickers = new Set(normalizeTickerList(options.knownTickers || []));
  const tickerMatches = [...String(text || "").matchAll(/\$([A-Z][A-Z0-9.]{0,5})\b/g)]
    .map((match) => normalizeTicker(match[1]))
    .filter(Boolean);
  const uppercaseMatches = [...String(text || "").matchAll(/\b([A-Z]{2,5}(?:\.[A-Z])?)\b/g)]
    .map((match) => normalizeTicker(match[1]))
    .filter((ticker) => ticker && !FALSE_POSITIVE_TICKERS.has(ticker))
    .filter((ticker) => knownTickers.size ? knownTickers.has(ticker) : true);
  return dedupe([...tickerMatches, ...uppercaseMatches]).slice(0, 12);
}

function detectSourceType(text = "") {
  const value = String(text || "").toLowerCase();
  if (/ask seeking alpha|ask sa|question:|prompt:/.test(value)) return "ask_seeking_alpha";
  if (/virtual analyst|analyst report|investment thesis|factor grades/.test(value)) return "virtual_analyst_report";
  if (/ai summary|summary report|summary ratings? report/.test(value)) return "summary_report";
  if (/earnings call insight|earnings call|transcript|q&a/.test(value)) return "earnings_call_insight";
  return "unknown";
}

function extractPrompt(text = "") {
  const match = String(text || "").match(/(?:prompt|question|query)\s*[:\-]\s*(.+)/i);
  return match ? match[1].trim() : "";
}

function detectReportDate(text = "") {
  const match = String(text || "").match(/(?:report date|published|generated|as of|date)\s*[:\-]\s*([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  return match ? match[1] : "";
}

function extractThemePoints(text = "", direction = "bullish") {
  const heading = direction === "bullish"
    ? "(bullish|positive|pros?|strengths?|what supports|upside)"
    : "(bearish|negative|cons?|risks?|weaknesses?|what weakens|downside)";
  const section = extractSection(text, heading);
  if (section) return bulletLines(section);
  const fallbackPattern = direction === "bullish"
    ? /\b(?:bullish|positive|supportive|upside|strength)\b[^.\n]*[.\n]/gi
    : /\b(?:bearish|negative|risk|downside|weakness|concern)\b[^.\n]*[.\n]/gi;
  return capThemes([...String(text || "").matchAll(fallbackPattern)].map((match) => cleanPoint(match[0])));
}

function extractFinancialMetrics(text = "") {
  const patterns = [
    /\b(?:quant rating|quant score|valuation grade|growth grade|profitability grade|momentum grade|eps revisions grade)\s*[:\-]\s*[A-Za-z0-9.+ -]+/gi,
    /\b(?:revenue|sales|eps|earnings|gross margin|operating margin|free cash flow|fcf|debt|market cap|p\/e|forward pe|price to sales|p\/s)\b[^.\n]*?(?:\d[\d,.]*%?|\b[A-F][+-]?\b)[^.\n]*[.\n]?/gi
  ];
  return capThemes(patterns.flatMap((pattern) => [...String(text || "").matchAll(pattern)].map((match) => cleanPoint(match[0]))));
}

function extractRatings(text = "") {
  const ratings = {};
  const fields = [
    ["quantRating", /(?:quant rating|quant score)\s*[:\-]\s*([A-Za-z ]+|\d(?:\.\d+)?)/i],
    ["valuationGrade", /(?:valuation|value) grade\s*[:\-]\s*([A-F][+-]?)/i],
    ["growthGrade", /growth grade\s*[:\-]\s*([A-F][+-]?)/i],
    ["profitabilityGrade", /profitability grade\s*[:\-]\s*([A-F][+-]?)/i],
    ["momentumGrade", /momentum grade\s*[:\-]\s*([A-F][+-]?)/i],
    ["epsRevisionsGrade", /(?:eps revisions|revisions) grade\s*[:\-]\s*([A-F][+-]?)/i],
    ["wallStreetRating", /(?:wall street|sell-side|analyst) rating\s*[:\-]\s*([A-Za-z ]+)/i],
    ["saAnalystsRating", /(?:sa analysts?|authors?) rating\s*[:\-]\s*([A-Za-z ]+)/i]
  ];
  fields.forEach(([field, pattern]) => {
    const match = String(text || "").match(pattern);
    if (match?.[1]) ratings[field] = match[1].trim().replace(/\s{2,}/g, " ");
  });
  return ratings;
}

function extractCitedSourceLabels(text = "") {
  const labels = [];
  const sourceLine = String(text || "").match(/(?:sources?|cited)\s*[:\-]\s*(.+)/i);
  if (sourceLine?.[1]) {
    labels.push(...sourceLine[1].split(/[,;|]/).map((item) => item.trim()));
  }
  if (/quant rating/i.test(text)) labels.push("Seeking Alpha Quant Rating");
  if (/wall street|sell-side|analyst rating/i.test(text)) labels.push("Seeking Alpha Wall Street Rating");
  if (/author|sa analyst/i.test(text)) labels.push("Seeking Alpha analyst/author rating");
  if (/earnings call|transcript/i.test(text)) labels.push("Earnings call transcript");
  return normalizeStringArray(labels);
}

function extractSection(text = "", headingPattern = "") {
  const lines = String(text || "").split(/\n/);
  const startPattern = new RegExp(`^\\s*${headingPattern}\\b`, "i");
  const stopPattern = /^\s*(?:bullish|positive|pros?|strengths?|bearish|negative|cons?|risks?|weaknesses?|valuation|growth|profitability|summary|conclusion|sources?|cited)\b/i;
  const start = lines.findIndex((line) => startPattern.test(line));
  if (start < 0) return "";
  const collected = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (stopPattern.test(line) && collected.some((item) => item.trim())) break;
    collected.push(line);
  }
  return collected.join("\n").trim();
}

function bulletLines(section = "") {
  return capThemes(String(section || "")
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter((line) => line.length >= 8)
    .map(cleanPoint));
}

function capThemes(items = []) {
  return normalizeStringArray(items).slice(0, MAX_THEME_COUNT);
}

function cleanPoint(value = "") {
  return String(value || "").replace(/\s+/g, " ").replace(/[.。\s]+$/, "").trim();
}

function normalizeRatings(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [key, String(item ?? "").trim()])
      .filter(([, item]) => item)
  );
}

function buildNormalizedExcerpt(text = "", extracted = {}) {
  const pieces = [
    ...((extracted.extractedBullishPoints || []).slice(0, 2).map((item) => `Bullish: ${item}`)),
    ...((extracted.extractedBearishPoints || []).slice(0, 2).map((item) => `Bearish: ${item}`)),
    ...((extracted.extractedFinancialMetrics || []).slice(0, 2).map((item) => `Metric: ${item}`))
  ];
  if (Object.keys(extracted.extractedRatings || {}).length) {
    pieces.push(`Ratings mentioned: ${Object.entries(extracted.extractedRatings).map(([key, value]) => `${key} ${value}`).join("; ")}`);
  }
  return capText(pieces.join(" "), 1000) || capText(text, 1000);
}

function freshnessForDate(dateValue, nowValue, staleAfterDays) {
  const date = new Date(dateValue);
  const now = new Date(nowValue);
  if (Number.isNaN(date.getTime()) || Number.isNaN(now.getTime())) return "unknown";
  const ageDays = (now.getTime() - date.getTime()) / 86_400_000;
  if (ageDays < 0) return "current";
  return ageDays > staleAfterDays ? "stale" : "current";
}

function duplicateRecordKeys(records = []) {
  const counts = new Map();
  records.forEach((record) => counts.set(recordKey(record), (counts.get(recordKey(record)) || 0) + 1));
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key, count]) => ({ key, count }));
}

function recordKey(record = {}) {
  return [
    normalizeTicker(record.ticker || record.tickers?.[0] || ""),
    normalizeSourceType(record.sourceType),
    normalizeDate(record.reportDate || record.importedAt || "", ""),
    stableHash(String(record.promptText || record.normalizedExcerpt || "").slice(0, 300))
  ].join("|");
}

function compareSeekingAlphaAiRecordsForSort(a = {}, b = {}) {
  return String(b.reportDate || b.importedAt || "").localeCompare(String(a.reportDate || a.importedAt || ""))
    || String(a.ticker || "").localeCompare(String(b.ticker || ""));
}

function stringDiff(left = [], right = []) {
  const rightKeys = new Set(normalizeStringArray(right).map(normalizedTextKey));
  return normalizeStringArray(left).filter((item) => !rightKeys.has(normalizedTextKey(item)));
}

function normalizedTextKey(value = "") {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function ratingChangeDirection(from = "", to = "") {
  const fromScore = ratingValueScore(from);
  const toScore = ratingValueScore(to);
  if (fromScore === null || toScore === null || fromScore === toScore) return "changed";
  return toScore > fromScore ? "stronger" : "weaker";
}

function ratingValueScore(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  const numeric = Number(normalized);
  if (Number.isFinite(numeric)) return numeric;
  if (/strong buy|very bullish|outperform/.test(normalized)) return 5;
  if (/\bbuy\b|bullish|positive/.test(normalized)) return 4;
  if (/hold|neutral|mixed/.test(normalized)) return 3;
  if (/\bsell\b|bearish|negative/.test(normalized)) return 2;
  if (/strong sell|very bearish|underperform/.test(normalized)) return 1;
  const grade = normalized.match(/\b([a-f])([+-]?)\b/i);
  if (!grade) return null;
  const base = { a: 5, b: 4, c: 3, d: 2, e: 1, f: 0 }[grade[1].toLowerCase()];
  const adjustment = grade[2] === "+" ? 0.25 : grade[2] === "-" ? -0.25 : 0;
  return base + adjustment;
}

function seekingAlphaAiRecordId(parts = {}) {
  return `sa-ai-${stableHash(`${(parts.tickers || []).join(",")}|${parts.sourceType}|${parts.sourceMode}|${parts.reportDate}|${parts.promptText}|${String(parts.text || "").slice(0, 800)}`)}`;
}

function stableHash(value = "") {
  let hash = 2166136261;
  for (const char of String(value || "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function normalizeSourceType(value = "unknown") {
  const normalized = String(value || "unknown").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return SEEKING_ALPHA_AI_SOURCE_TYPES.includes(normalized) ? normalized : "unknown";
}

function normalizeSourceMode(value = "pasted") {
  const normalized = String(value || "pasted").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return SEEKING_ALPHA_AI_SOURCE_MODES.includes(normalized) ? normalized : "pasted";
}

function normalizeStringArray(value = []) {
  const rows = Array.isArray(value) ? value : String(value || "").split(/\n|;|\|/);
  return dedupe(rows.map((item) => capText(cleanPoint(item), 240)).filter(Boolean));
}

function normalizeTickerList(value = []) {
  const rows = Array.isArray(value) ? value : String(value || "").split(/[,;\s]+/);
  return dedupe(rows.map((ticker) => normalizeTicker(ticker)).filter(Boolean));
}

function normalizeDate(value, fallback = "") {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback || String(value);
  return parsed.toISOString().slice(0, 10);
}

function textFrom(record, keys = [], fallback = "") {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined && value !== null && value !== "") return String(value).trim();
  }
  return fallback;
}

function capText(value = "", length = 4000) {
  const text = String(value || "").trim();
  if (text.length <= length) return text;
  return `${text.slice(0, length - 1).trim()}…`;
}

function safeMessage(error) {
  return String(error?.message || "Invalid input")
    .replace(/[A-Za-z0-9_-]{24,}/g, "[redacted]")
    .slice(0, 160);
}

function dedupe(items = []) {
  return [...new Set(items.filter((item) => item !== undefined && item !== null && String(item).trim() !== ""))];
}
