import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSeekingAlphaAiRecord } from "../src/seekingAlphaAi.js";
import {
  buildSeekingAlphaAiCoverageQueue,
  buildSeekingAlphaAiSourceAlignment,
  filterSeekingAlphaAiCoverageRows
} from "../src/seekingAlphaAiCoverage.js";

const asOf = "2026-06-02T12:00:00.000Z";

function saRecord(input) {
  const result = normalizeSeekingAlphaAiRecord(input, { now: asOf, knownTickers: ["MU", "NVDA", "AMD", "PLTR", "AVGO"] });
  assert.equal(result.ok, true, result.errors.join("; "));
  return result.record;
}

test("Seeking Alpha AI coverage queue ranks owned missing stale changed and unlinked rows", () => {
  const records = [
    saRecord({
      ticker: "MU",
      sourceType: "virtual_analyst_report",
      reportDate: "2026-05-01",
      responseText: "Virtual Analyst Report for MU. Bullish: DRAM recovery. Bearish: customer inventory risk. Quant Rating: Hold."
    }),
    saRecord({
      ticker: "MU",
      sourceType: "virtual_analyst_report",
      reportDate: "2026-05-30",
      responseText: "Virtual Analyst Report for MU. Bullish: HBM demand. Bearish: memory pricing risk. Quant Rating: Buy."
    }),
    saRecord({
      ticker: "AMD",
      sourceType: "summary_report",
      reportDate: "2026-01-01",
      responseText: "AI Summary Report for AMD. Bullish: AI accelerator demand. Bearish: margin pressure."
    }),
    saRecord({
      ticker: "AVGO",
      sourceType: "ask_seeking_alpha",
      reportDate: "2026-05-30",
      responseText: "Ask Seeking Alpha. Prompt: Review AVGO. Bullish: AI networking demand. Bearish: valuation risk."
    })
  ];
  const queue = buildSeekingAlphaAiCoverageQueue({
    holdings: [
      { ticker: "MU", name: "Micron", marketValue: 120000, portfolioWeight: 0.24, riskLevel: "High" },
      { ticker: "NVDA", name: "NVIDIA", marketValue: 30000, portfolioWeight: 0.06, riskLevel: "Medium" },
      { ticker: "AMD", name: "AMD", marketValue: 10000, portfolioWeight: 0.02, riskLevel: "High" }
    ],
    watchlistIdeas: [{ ticker: "PLTR", thesis: "AI platform watchlist" }],
    tickerSignals: [
      { ticker: "MU", combinedScore: 68, institutionalQuantScore: 72, concentrationRiskScore: 0.62, priceMomentumScore: 0.55 },
      { ticker: "NVDA", combinedScore: 52, institutionalQuantScore: 78, concentrationRiskScore: 0.2, priceMomentumScore: 0.7 },
      { ticker: "PLTR", combinedScore: 61, institutionalQuantScore: 55, concentrationRiskScore: 0.3, priceMomentumScore: 0.58 }
    ],
    seekingAlphaAiRecords: records,
    uiState: "IMPORTED_CLEAN",
    asOf
  });
  const mu = queue.rows.find((row) => row.ticker === "MU");
  const nvda = queue.rows.find((row) => row.ticker === "NVDA");
  const amd = queue.rows.find((row) => row.ticker === "AMD");
  const avgo = queue.rows.find((row) => row.ticker === "AVGO");

  assert.equal(queue.summary.ownedCount, 3);
  assert.equal(queue.summary.ownedCoveredCount, 2);
  assert.equal(queue.summary.ownedMissingCount, 1);
  assert.equal(queue.summary.staleCount, 1);
  assert.equal(queue.summary.unlinkedImportCount, 1);
  assert.equal(mu.coverageStatus, "warning");
  assert.equal(mu.changeStatus, "mixed-context");
  assert.equal(mu.alignmentStatus, "aligned-risk");
  assert.equal(nvda.coverageStatus, "missing");
  assert.equal(amd.coverageStatus, "stale");
  assert.equal(avgo.relationshipStatus, "unlinked-import");
  assert.equal(filterSeekingAlphaAiCoverageRows(queue.rows, "missing").some((row) => row.ticker === "NVDA"), true);
  assert.equal(filterSeekingAlphaAiCoverageRows(queue.rows, "stale").some((row) => row.ticker === "AMD"), true);
  assert.equal(filterSeekingAlphaAiCoverageRows(queue.rows, "changed").some((row) => row.ticker === "MU"), true);
  assert.equal(filterSeekingAlphaAiCoverageRows(queue.rows, "unlinked").some((row) => row.ticker === "AVGO"), true);
  assert.match(mu.refreshPrompt, /Ask Seeking Alpha/i);
  assert.doesNotMatch(JSON.stringify(queue), /\b(cookie|session token|password|buy now|sell now|guaranteed)\b/i);
});

test("Seeking Alpha AI source alignment distinguishes support risk conflict and insufficient data", () => {
  const supportive = {
    recordCount: 1,
    freshnessStatus: "current",
    supportScore: 0.68,
    riskScore: 0.38,
    bullishPoints: ["HBM demand"],
    bearishPoints: []
  };
  const risky = {
    recordCount: 1,
    freshnessStatus: "current",
    supportScore: 0.5,
    riskScore: 0.62,
    bullishPoints: [],
    bearishPoints: ["pricing risk"]
  };
  const supportiveAlignment = buildSeekingAlphaAiSourceAlignment({
    summary: supportive,
    signal: { ticker: "MU", institutionalQuantScore: 72, priceMomentumScore: 0.7, combinedScore: 48, concentrationRiskScore: 0.2 }
  });
  const conflictAlignment = buildSeekingAlphaAiSourceAlignment({
    summary: supportive,
    signal: { ticker: "MU", institutionalQuantScore: 50, priceMomentumScore: 0.4, combinedScore: 72, concentrationRiskScore: 0.7 }
  });
  const riskAlignment = buildSeekingAlphaAiSourceAlignment({
    summary: risky,
    signal: { ticker: "MU", institutionalQuantScore: 50, priceMomentumScore: 0.4, combinedScore: 74, concentrationRiskScore: 0.7 }
  });
  const missingAlignment = buildSeekingAlphaAiSourceAlignment({ summary: { recordCount: 0 }, signal: {} });

  assert.equal(supportiveAlignment.alignmentStatus, "aligned-support");
  assert.equal(conflictAlignment.alignmentStatus, "conflicting");
  assert.equal(riskAlignment.alignmentStatus, "aligned-risk");
  assert.equal(missingAlignment.alignmentStatus, "insufficient-data");
  assert.doesNotMatch(JSON.stringify([supportiveAlignment, conflictAlignment, riskAlignment]), /\b(predicts|guaranteed|trade order)\b/i);
});
