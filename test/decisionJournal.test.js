import test from "node:test";
import assert from "node:assert/strict";
import {
  buildJournalRows,
  filterJournalRows,
  journalEntriesForTicker,
  normalizeJournalEntry,
  removeJournalEntry,
  signalSnapshotForTicker,
  summarizeJournal,
  upsertJournalEntry
} from "../src/decisionJournal.js";

test("journal entries normalize decision fields without brokerage execution semantics", () => {
  const entry = normalizeJournalEntry({
    ticker: " mu ",
    type: "BUY",
    confidence: "medium-high",
    thesis: "Bought because memory pricing thesis improved.",
    risk: "Cycle may roll over.",
    catalyst: "HBM demand commentary.",
    dateTime: "2026-05-24T09:30:00-04:00"
  });

  assert.equal(entry.ticker, "MU");
  assert.equal(entry.decisionType, "buy");
  assert.equal(entry.conviction, "Medium-high");
  assert.equal(entry.thesisNote, "Bought because memory pricing thesis improved.");
  assert.equal(entry.riskNote, "Cycle may roll over.");
  assert.equal(entry.catalyst, "HBM demand commentary.");
  assert.equal(entry.executionStatus, "not-executed");
  assert.match(entry.id, /^journal:MU:buy:/);
});

test("journal create, update, delete, and ticker lookup stay deterministic", () => {
  const first = normalizeJournalEntry({
    ticker: "SOXL",
    decisionType: "watch",
    dateTime: "2026-05-24T10:00:00-04:00",
    thesisNote: "Watch leverage exposure.",
    conviction: "Medium"
  });
  const created = upsertJournalEntry([], first);
  assert.equal(created.length, 1);

  const updated = upsertJournalEntry(created, {
    ...first,
    thesisNote: "Watch leverage exposure and volatility regime.",
    conviction: "Low"
  });
  assert.equal(updated.length, 1);
  assert.equal(updated[0].thesisNote, "Watch leverage exposure and volatility regime.");
  assert.equal(updated[0].conviction, "Low");

  assert.equal(journalEntriesForTicker(updated, "soxl").length, 1);
  assert.equal(removeJournalEntry(updated, first.id).length, 0);
});

test("journal rows include portfolio, watchlist, and signal snapshot context", () => {
  const snapshot = signalSnapshotForTicker("MU", [{
    ticker: "MU",
    combinedScore: 74,
    actionCategory: "Monitor",
    confidenceScore: 0.62,
    materialityScore: 0.7,
    sourceLabel: "Sample signal",
    topHeadline: "MU memory signal",
    missingData: ["live quote missing"],
    warnings: ["mock data"]
  }], "2026-05-24T12:00:00-04:00");

  const rows = buildJournalRows({
    entries: [{
      ticker: "MU",
      decisionType: "hold",
      dateTime: "2026-05-24T12:00:00-04:00",
      thesisNote: "Hold while HBM thesis is intact.",
      conviction: "High",
      signalSnapshot: snapshot
    }],
    holdings: [{ ticker: "MU", marketValue: 125000, portfolioWeight: 0.25, sector: "Semiconductors" }],
    tickerSignals: [{ ticker: "MU", combinedScore: 82, actionCategory: "Review" }],
    watchlistIdeas: [{ ticker: "MU", status: "owned" }]
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].owned, true);
  assert.equal(rows[0].marketValue, 125000);
  assert.equal(rows[0].portfolioWeight, 0.25);
  assert.equal(rows[0].currentSignalScore, 82);
  assert.equal(rows[0].currentSignalAction, "Review");
  assert.equal(rows[0].watchlistStatus, "owned");
  assert.equal(rows[0].signalSnapshot.combinedScore, 74);
});

test("journal filtering and summary support ticker, type, conviction, date, and text", () => {
  const rows = buildJournalRows({
    entries: [
      { ticker: "MU", decisionType: "hold", dateTime: "2026-05-24T09:00:00-04:00", thesisNote: "Memory cycle intact.", conviction: "High" },
      { ticker: "NVDA", decisionType: "watch", dateTime: "2026-05-23T09:00:00-04:00", thesisNote: "Watch capex guidance.", conviction: "Medium" },
      { ticker: "SOXL", decisionType: "trim", dateTime: "2026-05-20T09:00:00-04:00", thesisNote: "Trim if leverage exceeds guardrail.", conviction: "Low" }
    ]
  });

  assert.deepEqual(filterJournalRows(rows, { ticker: "mu" }).map((row) => row.ticker), ["MU"]);
  assert.deepEqual(filterJournalRows(rows, { decisionType: "trim" }).map((row) => row.ticker), ["SOXL"]);
  assert.deepEqual(filterJournalRows(rows, { conviction: "Medium" }).map((row) => row.ticker), ["NVDA"]);
  assert.deepEqual(filterJournalRows(rows, { fromDate: "2026-05-23", toDate: "2026-05-24" }).map((row) => row.ticker), ["MU", "NVDA"]);
  assert.deepEqual(filterJournalRows(rows, { query: "guardrail" }).map((row) => row.ticker), ["SOXL"]);

  const summary = summarizeJournal(rows);
  assert.equal(summary.total, 3);
  assert.equal(summary.holds, 1);
  assert.equal(summary.watches, 1);
  assert.equal(summary.sells, 1);
  assert.equal(summary.highConviction, 1);
});
