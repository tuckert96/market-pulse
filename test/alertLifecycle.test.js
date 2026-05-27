import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAlertState,
  emptyAlertState,
  filterVisibleAlphaSignals,
  hideAlert,
  markAlertReviewed,
  normalizeAlertState,
  restoreHiddenAlerts
} from "../src/alertLifecycle.js";

const alerts = [
  { id: "a:one", title: "One", severity: "high" },
  { id: "a:two", title: "Two", severity: "medium" }
];

test("alert lifecycle starts empty and preserves visible alerts", () => {
  const result = applyAlertState(alerts, emptyAlertState());

  assert.equal(result.visibleAlerts.length, 2);
  assert.equal(result.summary.total, 2);
  assert.equal(result.summary.hidden, 0);
  assert.equal(result.summary.reviewed, 0);
  assert.equal(result.visibleAlerts[0].status, "active");
});

test("reviewed alerts remain visible with reviewed status", () => {
  const state = markAlertReviewed(emptyAlertState(), "a:one", "2026-05-22T10:00:00Z");
  const result = applyAlertState(alerts, state);

  assert.equal(result.visibleAlerts.length, 2);
  assert.equal(result.summary.reviewed, 1);
  assert.equal(result.visibleAlerts.find((alert) => alert.id === "a:one").status, "reviewed");
  assert.equal(result.visibleAlerts.find((alert) => alert.id === "a:one").reviewedAt, "2026-05-22T10:00:00Z");
});

test("hidden alerts are removed until restored", () => {
  const hiddenState = hideAlert(emptyAlertState(), "a:two", "2026-05-22T11:00:00Z");
  const hiddenResult = applyAlertState(alerts, hiddenState);
  const restoredResult = applyAlertState(alerts, restoreHiddenAlerts(hiddenState));

  assert.deepEqual(hiddenResult.visibleAlerts.map((alert) => alert.id), ["a:one"]);
  assert.equal(hiddenResult.summary.hidden, 1);
  assert.equal(restoredResult.visibleAlerts.length, 2);
  assert.equal(restoredResult.summary.hidden, 0);
});

test("alert state normalization rejects malformed persisted values", () => {
  assert.deepEqual(normalizeAlertState({ reviewed: [], hidden: "bad" }), emptyAlertState());
});

test("reviewed and hidden alpha signals stay out of main signal flow", () => {
  const signals = [{ id: "alpha-one" }, { id: "alpha-two" }, { id: "alpha-three" }];
  const state = hideAlert(
    markAlertReviewed(emptyAlertState(), "alpha:alpha-one", "2026-05-22T10:00:00Z"),
    "alpha:alpha-two",
    "2026-05-22T11:00:00Z"
  );

  assert.deepEqual(filterVisibleAlphaSignals(signals, state).map((signal) => signal.id), ["alpha-three"]);
});
