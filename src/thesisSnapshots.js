import { normalizeTicker } from "./portfolioSchema.js";
import { normalizeThesisProfile } from "./thesisTracker.js";

export const THESIS_SNAPSHOT_SOURCE_TYPES = Object.freeze(["user-written", "generated"]);

export function thesisSnapshotId({ ticker = "", capturedAt = "" } = {}) {
  const normalized = normalizeTicker(ticker);
  const stamp = normalizeDateTime(capturedAt || new Date().toISOString()).replace(/[^0-9A-Za-z]/g, "").slice(0, 14);
  return normalized ? `thesis-snapshot:${normalized}:${stamp}` : "";
}

export function normalizeThesisSnapshot(input = {}, options = {}) {
  const profileInput = input.profile || input.thesisProfile || input;
  const profile = normalizeThesisProfile(profileInput, { ticker: input.ticker || options.ticker || profileInput.ticker });
  const ticker = normalizeTicker(input.ticker || profile.ticker || options.ticker);
  const capturedAt = normalizeDateTime(input.capturedAt || input.createdAt || input.timestamp || options.capturedAt || new Date().toISOString());
  const sourceType = normalizeSourceType(input.sourceType || options.sourceType || "user-written");
  return pruneEmpty({
    id: input.id || thesisSnapshotId({ ticker, capturedAt }),
    ticker,
    capturedAt,
    sourceType,
    sourceLabel: cleanText(input.sourceLabel || options.sourceLabel || sourceTypeLabel(sourceType)),
    createdFrom: cleanText(input.createdFrom || options.createdFrom || "manual-save"),
    profile,
    riskSummary: normalizeRiskSummary(input.riskSummary || options.riskSummary),
    notes: cleanText(input.notes || "")
  });
}

export function normalizeThesisSnapshots(records = [], options = {}) {
  return (Array.isArray(records) ? records : [])
    .map((record) => normalizeThesisSnapshot(record, options))
    .filter((record) => record.ticker && record.capturedAt && record.profile)
    .sort(compareSnapshots);
}

export function upsertThesisSnapshot(records = [], snapshot = {}) {
  const normalized = normalizeThesisSnapshot(snapshot);
  if (!normalized.ticker || !normalized.id) return normalizeThesisSnapshots(records);
  const rows = normalizeThesisSnapshots(records);
  const index = rows.findIndex((row) => row.id === normalized.id);
  if (index >= 0) {
    rows[index] = { ...rows[index], ...normalized };
  } else {
    rows.push(normalized);
  }
  return rows.sort(compareSnapshots);
}

export function thesisSnapshotsForTicker(records = [], ticker = "") {
  const normalizedTicker = normalizeTicker(ticker);
  return normalizeThesisSnapshots(records)
    .filter((snapshot) => snapshot.ticker === normalizedTicker);
}

export function compareThesisSnapshotToProfile(snapshot = {}, profileInput = {}) {
  const previous = normalizeThesisSnapshot(snapshot).profile || {};
  const current = normalizeThesisProfile(profileInput, { ticker: snapshot.ticker });
  const comparisons = [
    fieldChange("Why owned", previous.whyOwned, current.whyOwned),
    fieldChange("Status", previous.thesisStatus, current.thesisStatus),
    fieldChange("Confidence", previous.confidenceLevel, current.confidenceLevel),
    fieldChange("Target allocation", formatWeight(previous.targetAllocation), formatWeight(current.targetAllocation)),
    listChange("Key risks", previous.keyRisks, current.keyRisks),
    listChange("Invalidation", previous.invalidationCriteria, current.invalidationCriteria),
    listChange("Add conditions", previous.addConditions, current.addConditions),
    listChange("Trim conditions", previous.trimConditions, current.trimConditions),
    listChange("Exit/review conditions", previous.exitReviewConditions, current.exitReviewConditions),
    listChange("Review triggers", previous.reviewTriggers, current.reviewTriggers),
    fieldChange("Next review trigger", previous.nextReviewTrigger, current.nextReviewTrigger),
    fieldChange("Notes", previous.notes, current.notes)
  ].filter(Boolean);

  return {
    changed: comparisons.length > 0,
    changes: comparisons,
    changedCount: comparisons.length,
    summary: comparisons.length
      ? `${comparisons.length} thesis field${comparisons.length === 1 ? "" : "s"} changed since the selected snapshot.`
      : "No material thesis fields changed since the selected snapshot."
  };
}

function fieldChange(label, previous, current) {
  const before = cleanText(previous || "Not documented");
  const after = cleanText(current || "Not documented");
  if (before === after) return null;
  return {
    label,
    previous: before,
    current: after,
    summary: `${label} changed from "${truncate(before)}" to "${truncate(after)}".`
  };
}

function listChange(label, previous = [], current = []) {
  const before = normalizeList(previous);
  const after = normalizeList(current);
  if (before.join(" | ") === after.join(" | ")) return null;
  const added = after.filter((item) => !before.includes(item));
  const removed = before.filter((item) => !after.includes(item));
  return {
    label,
    previous: before.join("; ") || "Not documented",
    current: after.join("; ") || "Not documented",
    added,
    removed,
    summary: `${label} changed${added.length ? `; added ${added.map(truncate).join(", ")}` : ""}${removed.length ? `; removed ${removed.map(truncate).join(", ")}` : ""}.`
  };
}

function normalizeRiskSummary(summary = {}) {
  if (!summary || typeof summary !== "object") return null;
  return pruneEmpty({
    sourceLabel: cleanText(summary.sourceLabel || ""),
    status: cleanText(summary.status || ""),
    confidence: cleanText(summary.confidence || ""),
    summary: cleanText(summary.summary || ""),
    flags: normalizeList(summary.flags),
    reviewAction: cleanText(summary.reviewAction || ""),
    caveat: cleanText(summary.caveat || "")
  });
}

function normalizeSourceType(value = "") {
  const text = String(value || "").toLowerCase().replaceAll("_", "-").trim();
  return THESIS_SNAPSHOT_SOURCE_TYPES.includes(text) ? text : "user-written";
}

function sourceTypeLabel(value = "") {
  return value === "generated" ? "Generated summary" : "User-written thesis";
}

function normalizeDateTime(value = "") {
  const date = new Date(value || new Date().toISOString());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function normalizeList(value = []) {
  if (Array.isArray(value)) return value.map((item) => cleanText(item)).filter(Boolean);
  return String(value || "")
    .split(/\n|;/)
    .map((item) => cleanText(item))
    .filter(Boolean);
}

function formatWeight(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "";
  return `${(numeric * 100).toFixed(1).replace(/\.0$/, "")}%`;
}

function truncate(value = "", max = 80) {
  const text = cleanText(value);
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function compareSnapshots(a, b) {
  return String(b.capturedAt || "").localeCompare(String(a.capturedAt || "")) ||
    String(a.ticker || "").localeCompare(String(b.ticker || ""));
}

function cleanText(value = "") {
  return String(value ?? "").trim();
}

function pruneEmpty(record = {}) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}
