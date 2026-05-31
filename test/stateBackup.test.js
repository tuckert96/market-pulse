import test from "node:test";
import assert from "node:assert/strict";
import {
  DASHBOARD_STATE_SCHEMA_VERSION,
  buildDashboardStateBackupPayload,
  buildDashboardStateRestorePreview,
  parseDashboardStateBackupJson,
  validateDashboardStateBackupPayload
} from "../src/stateBackup.js";

const exportedAt = "2026-05-29T12:00:00.000Z";

const baseState = {
  holdings: [
    { ticker: "MU", name: "Micron", account: "Taxable", shares: 10, marketValue: 1000, costBasis: 700, accountNumber: "123456789" },
    { ticker: "SPAXX", name: "Money Market", account: "Roth", marketValue: 500, assetClass: "Cash" }
  ],
  targetAllocations: [{ scope: "ticker", key: "MU", targetWeight: 0.08 }],
  thesisProfiles: { MU: { ticker: "MU", whyOwned: "Memory cycle" } },
  thesisSnapshots: [{ ticker: "MU", snapshotAt: exportedAt, sourceType: "user", whyOwned: "Memory cycle" }],
  alertState: { reviewed: { "risk:MU": exportedAt }, hidden: { "alpha:old": exportedAt } },
  alertThresholds: { maxPositionWeight: 0.12 },
  marketEvents: [{ id: "event:1", primaryTicker: "MU" }],
  alphaEvents: [{ id: "alpha:1", primaryTicker: "MU" }],
  politicianTrades: [{ politicianName: "Sample Person", ticker: "MU", transactionType: "Purchase", transactionDate: "2026-05-01", disclosureDate: "2026-05-02", amountRange: { low: 1000, high: 15000 } }],
  redditMentions: [{ sourceId: "reddit:1", subreddit: "stocks", createdAt: exportedAt, text: "MU", extractedTickers: ["MU"] }],
  xUpdates: [{ sourceId: "x:1", createdAt: exportedAt, text: "$MU", extractedTickers: ["MU"] }],
  watchlistIdeas: [{ ticker: "ASML", status: "watching", thesis: "Lithography" }],
  decisionJournal: [{ ticker: "MU", decisionType: "hold", dateTime: exportedAt, thesisNote: "Still valid" }],
  eventCalendar: [{ id: "event-cal:mu", ticker: "MU", eventType: "earnings", date: "2026-06-20", sourceMode: "imported" }],
  quantScoreHistory: [{ ticker: "MU", score: 82, asOf: exportedAt, portfolioMode: "imported" }],
  sourceHistory: [{
    type: "portfolio_import",
    label: "Portfolio import",
    fileName: "Fidelity_Positions_123456789.csv",
    timestamp: exportedAt,
    status: "success",
    rowsParsed: 42,
    acceptedRows: 40,
    holdingsCount: 40,
    detail: "Imported safely. api_key=should-redact",
    rawRows: [{ accountNumber: "123456789" }],
    activePortfolioSource: true
  }],
  latestImportReport: { fileName: "fidelity-positions.csv", apiKey: "should-redact" },
  accountScope: "account:roth",
  marketDataLiveMode: { enabled: true, intervalSeconds: 300, lastError: "Bearer abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" },
  apiKey: `s${"k"}-${"abcdefghijklmnopqrstuvwxyz1234567890"}`
};

test("dashboard backup export creates a valid sanitized JSON-ready payload", () => {
  const payload = buildDashboardStateBackupPayload(baseState, exportedAt);
  const reparsed = JSON.parse(JSON.stringify(payload));
  const validation = validateDashboardStateBackupPayload(reparsed);

  assert.equal(payload.schemaVersion, DASHBOARD_STATE_SCHEMA_VERSION);
  assert.equal(validation.ok, true);
  assert.equal(payload.safety.includesPasswords, false);
  assert.equal(payload.safety.includesApiKeys, false);
  assert.equal(payload.accountScope, "account:roth");
  assert.equal(payload.marketDataLiveMode.enabled, true);
  assert.equal(payload.holdings[0].accountNumber, "masked-6789");
  assert.equal(payload.latestImportReport.apiKey, undefined);
  assert.equal(payload.sourceHistory.length, 1);
  assert.equal(payload.sourceHistory[0].rawRows, undefined);
  assert.equal(payload.sourceHistory[0].fileName, "Fidelity_Positions_masked-6789.csv");
  assert.equal(payload.sourceHistory[0].activePortfolioSource, true);
  assert.equal(payload.apiKey, undefined);
  assert.doesNotMatch(JSON.stringify(payload), /sk-|Bearer abcdefghijklmnopqrstuvwxyz|123456789\b/);
});

test("restore preview summarizes changes before anything is applied", () => {
  const payload = buildDashboardStateBackupPayload(baseState, exportedAt);
  const preview = buildDashboardStateRestorePreview(payload, {
    holdings: [{ ticker: "NVDA", marketValue: 2000 }],
    targetAllocations: [],
    thesisProfiles: {},
    alertState: { reviewed: {}, hidden: {} },
    accountScope: "all"
  });

  assert.equal(preview.ok, true);
  assert.equal(preview.exportedAt, exportedAt);
  assert.ok(preview.warnings.some((warning) => /marked disconnected/i.test(warning)));
  assert.ok(preview.changes.some((row) => row.label === "Holdings" && row.current === 1 && row.restored === 2 && row.changes));
  assert.ok(preview.changes.some((row) => row.label === "Source history" && row.restored === 1));
  assert.ok(preview.changes.some((row) => row.label === "Local settings" && row.restored === 2));
});

test("malformed and unsafe backups are rejected with clear errors", () => {
  assert.equal(parseDashboardStateBackupJson("{bad json").ok, false);
  assert.match(parseDashboardStateBackupJson("{bad json").errors[0], /valid JSON/);

  const missingHoldings = validateDashboardStateBackupPayload({ schemaVersion: 1 });
  assert.equal(missingHoldings.ok, false);
  assert.ok(missingHoldings.errors.some((error) => /holdings array/i.test(error)));

  const wrongSchema = validateDashboardStateBackupPayload({ schemaVersion: 99, holdings: [] });
  assert.equal(wrongSchema.ok, false);
  assert.ok(wrongSchema.errors.some((error) => /not supported/i.test(error)));

  const unsafe = validateDashboardStateBackupPayload({ schemaVersion: 1, holdings: [], safety: { includesApiKeys: true } });
  assert.equal(unsafe.ok, false);
  assert.ok(unsafe.errors.some((error) => /passwords or API keys/i.test(error)));
});

test("optional malformed sections are preview warnings, not silent restores", () => {
  const preview = buildDashboardStateRestorePreview({
    schemaVersion: 1,
    holdings: [],
    redditMentions: { bad: true },
    redditSettings: "invalid"
  }, {});

  assert.equal(preview.ok, true);
  assert.ok(preview.warnings.some((warning) => /redditMentions is not an array/i.test(warning)));
  assert.ok(preview.warnings.some((warning) => /redditSettings is not an object/i.test(warning)));
});
