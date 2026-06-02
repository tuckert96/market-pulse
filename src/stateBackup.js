import { normalizeAlertState } from "./alertLifecycle.js";
import { normalizeCalendarEvents } from "./eventCalendar.js";
import { normalizeJournalEntries } from "./decisionJournal.js";
import { normalizeHoldings } from "./portfolioSchema.js";
import { normalizeQuantScoreHistory } from "./quantLensContext.js";
import { normalizeTargetAllocations } from "./targetAllocations.js";
import { normalizeThesisSnapshots } from "./thesisSnapshots.js";
import { normalizeWatchlistIdeas } from "./watchlistIdeas.js";
import { sanitizeImportedState, sanitizeStateForBackup } from "./stateSanitizer.js";

export const DASHBOARD_STATE_SCHEMA_VERSION = 1;

const ARRAY_FIELDS = Object.freeze([
  "holdings",
  "marketEvents",
  "alphaEvents",
  "targetAllocations",
  "thesisSnapshots",
  "politicianTrades",
  "redditMentions",
  "xUpdates",
  "watchlistIdeas",
  "decisionJournal",
  "eventCalendar",
  "quantScoreHistory",
  "seekingAlphaAiRecords"
]);

const OBJECT_FIELDS = Object.freeze([
  "fidelityStatus",
  "seekingAlphaStatus",
  "alertState",
  "alertThresholds",
  "thesisProfiles",
  "latestImportReport",
  "politicianTradeImportReport",
  "redditImportReport",
  "redditSettings",
  "xUpdateImportReport",
  "xSettings",
  "eventCalendarImportReport",
  "marketDataLiveMode"
]);

export function buildDashboardStateBackupPayload(stateSlice = {}, exportedAt = new Date().toISOString()) {
  const payload = {
    ...sanitizeStateForBackup({
      schemaVersion: DASHBOARD_STATE_SCHEMA_VERSION,
      exportedAt,
      ...stateSlice
    }),
    safety: {
      includesPasswords: false,
      includesApiKeys: false,
      note: "Local dashboard backup. Review before sharing because holdings are sensitive financial data."
    }
  };
  const validation = validateDashboardStateBackupPayload(payload);
  if (!validation.ok) {
    throw new Error(`Backup export failed validation: ${validation.errors.join(" ")}`);
  }
  return validation.payload;
}

export function parseDashboardStateBackupJson(text = "") {
  try {
    const payload = JSON.parse(String(text || ""));
    return validateDashboardStateBackupPayload(payload);
  } catch {
    return {
      ok: false,
      payload: null,
      errors: ["Backup file is not valid JSON."],
      warnings: []
    };
  }
}

export function validateDashboardStateBackupPayload(input) {
  const errors = [];
  const warnings = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      ok: false,
      payload: null,
      errors: ["File does not contain a dashboard state object."],
      warnings
    };
  }

  const rawSafety = input.safety && typeof input.safety === "object" && !Array.isArray(input.safety)
    ? input.safety
    : {};
  const payload = sanitizeImportedState(input);
  if (input.safety !== undefined) {
    payload.safety = {
      includesPasswords: rawSafety.includesPasswords === true,
      includesApiKeys: rawSafety.includesApiKeys === true,
      note: payload.safety?.note || ""
    };
  }
  if (payload.schemaVersion !== undefined && Number(payload.schemaVersion) !== DASHBOARD_STATE_SCHEMA_VERSION) {
    errors.push(`State file schema version ${payload.schemaVersion} is not supported.`);
  }
  if (!Array.isArray(payload.holdings)) {
    errors.push("State file is missing a holdings array.");
  }
  if (rawSafety.includesPasswords === true || rawSafety.includesApiKeys === true) {
    errors.push("State file says it may include passwords or API keys. Export a safe local backup before restoring.");
  }

  ARRAY_FIELDS.forEach((field) => {
    if (payload[field] !== undefined && !Array.isArray(payload[field])) {
      if (field === "holdings") errors.push("State file holdings must be an array.");
      else warnings.push(`${field} is not an array and will be ignored during restore.`);
    }
  });
  OBJECT_FIELDS.forEach((field) => {
    if (payload[field] !== undefined && (payload[field] === null || typeof payload[field] !== "object" || Array.isArray(payload[field]))) {
      warnings.push(`${field} is not an object and will fall back to the current/default value.`);
    }
  });

  return {
    ok: errors.length === 0,
    payload,
    errors,
    warnings
  };
}

export function buildDashboardStateRestorePreview(input, currentState = {}) {
  const validation = validateDashboardStateBackupPayload(input);
  if (!validation.ok) {
    return {
      ok: false,
      payload: validation.payload,
      errors: validation.errors,
      warnings: validation.warnings,
      changes: []
    };
  }

  const payload = validation.payload;
  const restored = normalizedRestoreCounts(payload);
  const current = normalizedRestoreCounts(currentState);
  const changes = [
    previewRow("Holdings", current.holdings, restored.holdings, "Active portfolio holdings will be replaced by the backup."),
    previewRow("Target allocations", current.targetAllocations, restored.targetAllocations, "Target plan rows will be restored."),
    previewRow("Thesis profiles", current.thesisProfiles, restored.thesisProfiles, "Saved thesis records and notes will be restored."),
    previewRow("Thesis snapshots", current.thesisSnapshots, restored.thesisSnapshots, "Historical thesis snapshots will be restored."),
    previewRow("Alerts", current.alertState, restored.alertState, "Reviewed and hidden alert state will be restored."),
    previewRow("Market / Alpha events", current.events, restored.events, "Local market-intelligence and Alpha Engine rows will be restored."),
    previewRow("External signal rows", current.externalSignals, restored.externalSignals, "Cached disclosure, Reddit, and X/social rows will be restored as local state."),
    previewRow("Watchlist ideas", current.watchlistIdeas, restored.watchlistIdeas, "Watchlist and idea pipeline rows will be restored."),
    previewRow("Decision journal", current.decisionJournal, restored.decisionJournal, "Decision journal entries will be restored."),
    previewRow("Calendar events", current.eventCalendar, restored.eventCalendar, "Local event calendar rows will be restored."),
    previewRow("Quant score history", current.quantScoreHistory, restored.quantScoreHistory, "Compact Quant Lens score history will be restored."),
    previewRow("Seeking Alpha AI records", current.seekingAlphaAiRecords, restored.seekingAlphaAiRecords, "Pasted/imported Seeking Alpha AI report excerpts will be restored as local personal data."),
    previewRow("Local settings", current.localSettings, restored.localSettings, "Account scope and market-data live-mode preferences will be restored.")
  ];

  return {
    ok: true,
    payload,
    schemaVersion: Number(payload.schemaVersion || DASHBOARD_STATE_SCHEMA_VERSION),
    exportedAt: payload.exportedAt || "",
    errors: [],
    warnings: [
      ...validation.warnings,
      "Provider connection statuses restored from backup are marked disconnected until revalidated."
    ],
    changes
  };
}

function normalizedRestoreCounts(source = {}) {
  return {
    holdings: normalizeHoldings(Array.isArray(source.holdings) ? source.holdings : []).length,
    targetAllocations: normalizeTargetAllocations(Array.isArray(source.targetAllocations) ? source.targetAllocations : []).length,
    thesisProfiles: source.thesisProfiles && typeof source.thesisProfiles === "object" && !Array.isArray(source.thesisProfiles)
      ? Object.keys(source.thesisProfiles).length
      : 0,
    thesisSnapshots: normalizeThesisSnapshots(Array.isArray(source.thesisSnapshots) ? source.thesisSnapshots : []).length,
    alertState: alertStateCount(source.alertState),
    events: countArray(source.marketEvents) + countArray(source.alphaEvents),
    externalSignals: countArray(source.politicianTrades) + countArray(source.redditMentions) + countArray(source.xUpdates),
    watchlistIdeas: normalizeWatchlistIdeas(Array.isArray(source.watchlistIdeas) ? source.watchlistIdeas : []).length,
    decisionJournal: normalizeJournalEntries(Array.isArray(source.decisionJournal) ? source.decisionJournal : []).length,
    eventCalendar: normalizeCalendarEvents(Array.isArray(source.eventCalendar) ? source.eventCalendar : []).length,
    quantScoreHistory: normalizeQuantScoreHistory(Array.isArray(source.quantScoreHistory) ? source.quantScoreHistory : []).length,
    seekingAlphaAiRecords: countArray(source.seekingAlphaAiRecords),
    localSettings: [source.accountScope, source.marketDataLiveMode && typeof source.marketDataLiveMode === "object" ? "marketDataLiveMode" : ""]
      .filter(Boolean)
      .length
  };
}

function alertStateCount(alertState = {}) {
  const normalized = normalizeAlertState(alertState || {});
  return Object.keys(normalized.reviewed || {}).length + Object.keys(normalized.hidden || {}).length;
}

function countArray(value) {
  return Array.isArray(value) ? value.length : 0;
}

function previewRow(label, current, restored, detail) {
  return {
    label,
    current,
    restored,
    changes: current !== restored,
    detail
  };
}
