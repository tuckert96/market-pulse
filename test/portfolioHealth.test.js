import test from "node:test";
import assert from "node:assert/strict";
import { buildPortfolioHealth } from "../src/portfolioHealth.js";

const asOf = "2026-05-26T20:00:00-04:00";

const baseAnalysis = {
  overview: {
    totalValue: 100000,
    leveragedNotionalExposure: 8000
  },
  holdings: [
    { ticker: "MU", marketValue: 12000, portfolioWeight: 0.12 },
    { ticker: "VTI", marketValue: 24000, portfolioWeight: 0.24 },
    { ticker: "CASH", marketValue: 30000, portfolioWeight: 0.3 }
  ],
  risk: {
    top10Weight: 0.42,
    top5Weight: 0.31
  },
  alerts: []
};

test("portfolio health stays honest before real portfolio import", () => {
  const health = buildPortfolioHealth({
    analysis: baseAnalysis,
    uiState: "SAMPLE_MODE",
    asOf
  });

  assert.equal(health.score, 0);
  assert.equal(health.label, "Sample only");
  assert.equal(health.tone, "sample");
  assert.equal(health.nextActions[0].href, "#imports");
  assert.match(health.summary, /not Tucker's real portfolio/i);
});

test("portfolio health produces a strong read when imported data is well covered", () => {
  const health = buildPortfolioHealth({
    analysis: baseAnalysis,
    thesisRows: [
      { ticker: "MU", status: "active", whyOwned: "Memory cycle", portfolioWeight: 0.12 },
      { ticker: "VTI", status: "active", whyOwned: "Core index", portfolioWeight: 0.24 },
      { ticker: "CASH", status: "active", whyOwned: "Dry powder", portfolioWeight: 0.3 }
    ],
    targetPlan: {
      rows: [
        { scope: "ticker", key: "MU", driftWeight: 0.005, suggestedAction: "Hold" },
        { scope: "ticker", key: "VTI", driftWeight: 0.01, suggestedAction: "Hold" },
        { scope: "ticker", key: "CASH", driftWeight: 0.015, suggestedAction: "Hold" }
      ]
    },
    alerts: [],
    marketDataStatus: { status: "connected", dataFreshness: "cached", label: "Finnhub cached" },
    portfolioDataQuality: { holdingCount: 3, missingCostBasisCount: 0, rejectedNonHoldingRows: 2 },
    uiState: "IMPORTED_WITH_SKIPPED_ROWS",
    asOf
  });

  assert.ok(health.score >= 80);
  assert.ok(["Strong", "Usable"].includes(health.label));
  assert.ok(health.strengths.some((strength) => /data is usable|freshness is usable|Targets/i.test(strength)));
  assert.ok(health.components.every((component) => component.href.startsWith("#")));
});

test("portfolio health prioritizes weak data, stale sources, and risk review", () => {
  const health = buildPortfolioHealth({
    analysis: {
      ...baseAnalysis,
      overview: { totalValue: 100000, leveragedNotionalExposure: 35000 },
      risk: { top10Weight: 0.82, top5Weight: 0.63 },
      alerts: [
        { severity: "critical", actionCategory: "Critical Review" },
        { severity: "warning", actionCategory: "Review" }
      ]
    },
    thesisRows: [
      { ticker: "MU", status: "missing", portfolioWeight: 0.22 },
      { ticker: "SOXL", status: "stale", portfolioWeight: 0.16 }
    ],
    targetPlan: { rows: [] },
    marketDataStatus: { status: "error", label: "Market data error" },
    portfolioDataQuality: { holdingCount: 3, missingCostBasisCount: 4, failedHoldingRows: 1 },
    uiState: "IMPORTED_PARTIAL_REVIEW",
    asOf
  });

  assert.ok(health.score < 60);
  assert.ok(health.issues.some((issue) => /import|cost basis|holding rows/i.test(issue)));
  assert.ok(health.nextActions.some((action) => action.href === "#imports"));
  assert.ok(health.nextActions.some((action) => action.href === "#thesis" || action.href === "#targets" || action.href === "#data-sources"));
  assert.doesNotMatch(JSON.stringify(health), /\b(buy now|sell now|guaranteed|prediction)\b/i);
});

test("portfolio health routes target drift to the target workflow", () => {
  const health = buildPortfolioHealth({
    analysis: baseAnalysis,
    thesisRows: [
      { ticker: "MU", status: "active", whyOwned: "Memory cycle", portfolioWeight: 0.12 },
      { ticker: "VTI", status: "active", whyOwned: "Core index", portfolioWeight: 0.24 },
      { ticker: "CASH", status: "active", whyOwned: "Dry powder", portfolioWeight: 0.3 }
    ],
    targetPlan: {
      rows: [
        { scope: "ticker", key: "MU", driftWeight: 0.09, suggestedAction: "Review trim" },
        { scope: "ticker", key: "VTI", driftWeight: 0.02, suggestedAction: "Hold" }
      ]
    },
    marketDataStatus: { status: "connected", dataFreshness: "live" },
    portfolioDataQuality: { holdingCount: 3 },
    uiState: "IMPORTED_CLEAN",
    asOf
  });

  const targetComponent = health.components.find((component) => component.key === "targetDiscipline");
  assert.ok(targetComponent.score < 72);
  assert.equal(targetComponent.href, "#targets");
  assert.ok(health.nextActions.some((action) => action.label === "Set targets" && action.href === "#targets"));
});
