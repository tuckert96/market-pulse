import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSeekingAlphaAiImportPreview,
  buildSeekingAlphaAiDeltaSummary,
  compareSeekingAlphaAiRecords,
  mergeSeekingAlphaAiRecords,
  normalizeSeekingAlphaAiRecord,
  redactSeekingAlphaAiText,
  seekingAlphaAiRecordsForTicker,
  summarizeSeekingAlphaAiForTicker,
  seekingAlphaAiStatusSummary
} from "../src/seekingAlphaAi.js";

const NOW = "2026-06-02T12:00:00.000Z";

test("Seeking Alpha AI pasted text normalizes Ask output into decision-support fields", () => {
  const text = `
Ask Seeking Alpha
Prompt: Compare MU against NVDA for AI memory exposure.
Report Date: 2026-05-30

Bullish:
- MU has HBM demand and improving DRAM pricing.
- Quant Rating: Buy.

Bearish:
- Memory pricing can reverse if supply expands too quickly.
- Valuation Grade: B.

Sources: Seeking Alpha Quant Rating, Factor Grades
`;
  const result = normalizeSeekingAlphaAiRecord({ responseText: text, sourceMode: "pasted" }, { now: NOW, knownTickers: ["MU", "NVDA"] });

  assert.equal(result.ok, true, result.errors.join("; "));
  assert.deepEqual(result.record.tickers, ["MU", "NVDA"]);
  assert.equal(result.record.sourceType, "ask_seeking_alpha");
  assert.equal(result.record.sourceMode, "pasted");
  assert.equal(result.record.promptText, "Compare MU against NVDA for AI memory exposure.");
  assert.equal(result.record.extractedRatings.quantRating, "Buy");
  assert.ok(result.record.extractedBullishPoints.some((point) => point.includes("HBM demand")));
  assert.ok(result.record.extractedBearishPoints.some((point) => point.includes("Memory pricing")));
  assert.equal(result.record.freshnessStatus, "current");
  assert.equal(result.record.liveProviderCalls, false);
  assert.equal(result.record.credentialMaterialStored, false);
});

test("Seeking Alpha AI normalizer rejects pasted cookies or session tokens", () => {
  const text = "Virtual Analyst Report for MU. cookie: sa_session=abc123secret; Quant Rating: Buy.";
  const result = normalizeSeekingAlphaAiRecord({ responseText: text, ticker: "MU" }, { now: NOW });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /credential material/i.test(error)));
});

test("Seeking Alpha AI redaction masks softer identifiers without storing raw values", () => {
  const result = redactSeekingAlphaAiText("Contact me@example.com and account number 123456789. URL https://example.test/report?token=secretvalue");

  assert.match(result.text, /\[redacted-email\]/);
  assert.match(result.text, /account \[redacted\]/);
  assert.match(result.text, /token=\[redacted\]/);
  assert.ok(result.redactionWarnings.length >= 2);
});

test("Seeking Alpha AI import preview supports partial JSON import and rejected rows", () => {
  const json = JSON.stringify({
    records: [
      {
        ticker: "MU",
        sourceType: "virtual_analyst_report",
        reportDate: "2026-05-29",
        responseText: "Virtual Analyst Report for MU. Bullish: HBM cycle. Bearish: cyclical memory risk. Quant Rating: Buy."
      },
      {
        sourceType: "ask_seeking_alpha",
        responseText: "Question: What is the best setup? No ticker is present."
      }
    ]
  });
  const preview = buildSeekingAlphaAiImportPreview(json, { inputType: "json", now: NOW, knownTickers: ["MU"] });

  assert.equal(preview.records.length, 1);
  assert.equal(preview.importReport.rejectedRows.length, 1);
  assert.equal(preview.importReport.health.status, "Preview ready with rejected rows");
  assert.deepEqual(preview.importReport.tickersDetected, ["MU"]);
});

test("Seeking Alpha AI preview parses saved HTML locally without network or cookies", () => {
  const html = `<html><body><h1>Virtual Analyst Report</h1><p>Report Date: 2026-05-25</p><p>MU Bullish: HBM demand.</p><p>Bearish: memory pricing risk.</p><p>Quant Rating: Buy</p></body></html>`;
  const preview = buildSeekingAlphaAiImportPreview(html, { inputType: "saved_html", now: NOW, knownTickers: ["MU"] });

  assert.equal(preview.validation.ok, true);
  assert.equal(preview.sourceMode, "saved_html");
  assert.equal(preview.records[0].sourceMode, "saved_html");
  assert.equal(preview.records[0].sourceType, "virtual_analyst_report");
});

test("Seeking Alpha AI stale reports are flagged without rejecting the record", () => {
  const preview = buildSeekingAlphaAiImportPreview("Virtual Analyst Report for MU. Report Date: 2026-01-01. Bullish: HBM demand. Bearish: cyclical risk.", {
    inputType: "paste",
    now: NOW,
    knownTickers: ["MU"]
  });

  assert.equal(preview.records.length, 1);
  assert.equal(preview.records[0].freshnessStatus, "stale");
  assert.ok(preview.records[0].validationWarnings.some((warning) => /stale/i.test(warning)));
});

test("Seeking Alpha AI duplicate imports update existing ticker/report records", () => {
  const first = normalizeSeekingAlphaAiRecord({
    ticker: "MU",
    sourceType: "summary_report",
    sourceMode: "pasted",
    reportDate: "2026-05-30",
    promptText: "Why is MU moving?",
    responseText: "AI Summary Report for MU. Bullish: HBM demand. Bearish: memory risk."
  }, { now: NOW }).record;
  const second = {
    ...first,
    responseText: "AI Summary Report for MU. Bullish: stronger HBM demand. Bearish: valuation risk."
  };
  const merged = mergeSeekingAlphaAiRecords([first], [second], { now: NOW });

  assert.equal(merged.records.length, 1);
  assert.equal(merged.updated, 1);
  assert.match(merged.records[0].responseText, /stronger HBM/);
});

test("Seeking Alpha AI status summary reports tickers and stale counts", () => {
  const records = [
    normalizeSeekingAlphaAiRecord({
      ticker: "MU",
      sourceType: "summary_report",
      reportDate: "2026-01-01",
      responseText: "Summary Report for MU. Bullish: HBM. Bearish: cycle."
    }, { now: NOW }).record
  ];
  const summary = seekingAlphaAiStatusSummary(records);

  assert.equal(summary.records, 1);
  assert.deepEqual(summary.tickers, ["MU"]);
  assert.equal(summary.staleCount, 1);
});

test("Seeking Alpha AI ticker summary exposes bounded downstream context without live claims", () => {
  const current = normalizeSeekingAlphaAiRecord({
    ticker: "MU",
    sourceType: "virtual_analyst_report",
    sourceMode: "pasted",
    reportDate: "2026-05-30",
    responseText: "Virtual Analyst Report for MU. Bullish: HBM demand. Bearish: cyclical memory risk. Quant Rating: Buy. Growth Grade: A-."
  }, { now: NOW }).record;
  const stale = normalizeSeekingAlphaAiRecord({
    ticker: "MU",
    sourceType: "summary_report",
    sourceMode: "imported_file",
    reportDate: "2026-01-01",
    responseText: "AI Summary Report for MU. Bullish: memory recovery. Bearish: pricing risk."
  }, { now: NOW }).record;
  const summary = summarizeSeekingAlphaAiForTicker([stale, current], "MU", { now: NOW });

  assert.equal(seekingAlphaAiRecordsForTicker([current], "MU").length, 1);
  assert.equal(summary.recordCount, 2);
  assert.equal(summary.freshCount, 1);
  assert.equal(summary.staleCount, 1);
  assert.equal(summary.dataStatus, "Imported");
  assert.ok(summary.bullishPoints.some((point) => /HBM/i.test(point)));
  assert.ok(summary.bearishPoints.some((point) => /cyclical|pricing/i.test(point)));
  assert.ok(summary.ratingMentions.some((item) => /Quant Rating/i.test(item)));
  assert.ok(summary.reviewPriorityScore > 0 && summary.reviewPriorityScore <= 1);
  assert.ok(summary.supportScore > 0 && summary.supportScore <= 1);
  assert.ok(summary.riskScore > 0 && summary.riskScore <= 1);
  assert.equal(current.liveProviderCalls, false);
  assert.equal(current.credentialMaterialStored, false);
  assert.doesNotMatch(JSON.stringify(summary), /cookie|authorization|access_token|client_secret|password/i);
});

test("Seeking Alpha AI delta detects changed support, risk, and rating mentions", () => {
  const prior = normalizeSeekingAlphaAiRecord({
    ticker: "MU",
    sourceType: "virtual_analyst_report",
    reportDate: "2026-05-01",
    responseText: "Virtual Analyst Report for MU. Bullish: DRAM recovery. Bearish: customer inventory risk. Quant Rating: Hold."
  }, { now: NOW }).record;
  const latest = normalizeSeekingAlphaAiRecord({
    ticker: "MU",
    sourceType: "virtual_analyst_report",
    reportDate: "2026-05-30",
    responseText: "Virtual Analyst Report for MU. Bullish: HBM demand. Bearish: memory pricing risk. Quant Rating: Buy. Growth Grade: A-."
  }, { now: NOW }).record;
  const rawDelta = compareSeekingAlphaAiRecords(prior, latest);
  const summary = buildSeekingAlphaAiDeltaSummary([prior, latest], "MU", { now: NOW });

  assert.ok(rawDelta.addedSupport.some((item) => /HBM/i.test(item)));
  assert.ok(rawDelta.removedSupport.some((item) => /DRAM/i.test(item)));
  assert.ok(rawDelta.addedRisks.some((item) => /pricing/i.test(item)));
  assert.ok(rawDelta.ratingChanges.some((change) => change.label === "Quant Rating" && change.direction === "stronger"));
  assert.equal(summary.changeStatus, "mixed-context");
  assert.match(summary.summary, /changed since/i);
  assert.doesNotMatch(JSON.stringify(summary), /\b(buy now|sell now|guaranteed|predicts)\b/i);
});
