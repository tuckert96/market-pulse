import test from "node:test";
import assert from "node:assert/strict";
import {
  compareThesisSnapshotToProfile,
  normalizeThesisSnapshot,
  normalizeThesisSnapshots,
  thesisSnapshotsForTicker,
  upsertThesisSnapshot
} from "../src/thesisSnapshots.js";

test("thesis snapshots normalize ticker, timestamp, source type, and profile fields", () => {
  const snapshot = normalizeThesisSnapshot({
    ticker: " mu ",
    capturedAt: "2026-05-29T10:30:00-04:00",
    sourceType: "generated",
    profile: {
      whyOwned: "HBM cycle thesis.",
      thesisStatus: "Current",
      confidenceLevel: "High",
      targetAllocation: "8",
      keyRisks: "Memory pricing rolls over"
    },
    riskSummary: {
      sourceLabel: "Local deterministic",
      summary: "Current thesis/risk summary.",
      flags: ["Thesis profile is current."]
    }
  });

  assert.equal(snapshot.ticker, "MU");
  assert.equal(snapshot.sourceType, "generated");
  assert.equal(snapshot.sourceLabel, "Generated summary");
  assert.match(snapshot.id, /^thesis-snapshot:MU:/);
  assert.equal(snapshot.profile.targetAllocation, 0.08);
  assert.deepEqual(snapshot.profile.keyRisks, ["Memory pricing rolls over"]);
  assert.equal(snapshot.riskSummary.sourceLabel, "Local deterministic");
});

test("thesis snapshot upsert, sorting, and ticker lookup stay deterministic", () => {
  const first = normalizeThesisSnapshot({
    ticker: "NVDA",
    capturedAt: "2026-05-20T12:00:00Z",
    profile: { whyOwned: "AI platform thesis.", confidenceLevel: "High" }
  });
  const later = normalizeThesisSnapshot({
    ticker: "MU",
    capturedAt: "2026-05-25T12:00:00Z",
    profile: { whyOwned: "Memory cycle thesis.", confidenceLevel: "Medium" }
  });
  const rows = upsertThesisSnapshot(upsertThesisSnapshot([], first), later);
  const updated = upsertThesisSnapshot(rows, { ...later, profile: { ...later.profile, confidenceLevel: "High" } });

  assert.equal(updated.length, 2);
  assert.equal(updated[0].ticker, "MU");
  assert.equal(updated[0].profile.confidenceLevel, "High");
  assert.deepEqual(thesisSnapshotsForTicker(updated, "mu").map((row) => row.ticker), ["MU"]);
});

test("thesis snapshot comparison explains current-vs-prior changes", () => {
  const prior = normalizeThesisSnapshot({
    ticker: "MU",
    capturedAt: "2026-05-20T12:00:00Z",
    sourceType: "user-written",
    profile: {
      whyOwned: "HBM cycle thesis.",
      thesisStatus: "Current",
      confidenceLevel: "Medium",
      keyRisks: ["Memory pricing rolls over"],
      invalidationCriteria: ["HBM demand slows"]
    }
  });
  const comparison = compareThesisSnapshotToProfile(prior, {
    ticker: "MU",
    whyOwned: "HBM and DRAM upcycle thesis.",
    thesisStatus: "Needs review",
    confidenceLevel: "Medium-high",
    keyRisks: ["Memory pricing rolls over", "AI capex pause"],
    invalidationCriteria: ["HBM demand slows"]
  });

  assert.equal(comparison.changed, true);
  assert.ok(comparison.changedCount >= 3);
  assert.ok(comparison.changes.some((change) => change.label === "Why owned"));
  assert.ok(comparison.changes.some((change) => change.label === "Key risks" && change.added.includes("AI capex pause")));
  assert.match(comparison.summary, /thesis fields changed/);
});

test("thesis snapshot normalization rejects blank ticker rows", () => {
  const rows = normalizeThesisSnapshots([
    { ticker: "", capturedAt: "2026-05-20T12:00:00Z", profile: { whyOwned: "Missing ticker." } },
    { ticker: "AMD", capturedAt: "2026-05-20T12:00:00Z", profile: { whyOwned: "AI GPU contender." } }
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].ticker, "AMD");
});
