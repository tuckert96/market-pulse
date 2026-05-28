import test from "node:test";
import assert from "node:assert/strict";
import { buildAlphaSignals, demoAlphaEvents, demoThesisProfiles } from "../src/alphaEngine.js";
import { analyzePortfolio } from "../src/portfolioAnalytics.js";
import { normalizeHoldings } from "../src/portfolioSchema.js";
import { buildTargetAllocationPlan, defaultTargetAllocations } from "../src/targetAllocations.js";
import { buildThesisAlerts, buildThesisRiskSummary, buildThesisRows, normalizeThesisProfile, thesisSummary } from "../src/thesisTracker.js";
import { tuckerDemoHoldings } from "../src/portfolioDemoData.js";

test("thesis rows aggregate imported holdings by ticker and include target drift", () => {
  const holdings = normalizeHoldings([
    { ticker: "MU", account: "Taxable", marketValue: 1000, targetWeight: 0.2, thesis: "Memory cycle" },
    { ticker: "MU", account: "Roth IRA", marketValue: 500, targetWeight: 0.2, thesis: "Memory cycle" },
    { ticker: "SPAXX", account: "Taxable", marketValue: 500, assetClass: "Cash" }
  ]);
  const analysis = analyzePortfolio(holdings);
  const targetPlan = buildTargetAllocationPlan(analysis.holdings, [
    { scope: "ticker", key: "MU", targetWeight: 0.5, minWeight: 0.35, maxWeight: 0.55 }
  ]);
  const rows = buildThesisRows(analysis.holdings, {
    MU: { whyOwned: "Memory cycle", confidenceLevel: "High", lastReviewedDate: "2026-05-01" }
  }, { targetPlan, asOf: "2026-05-23", totalValue: analysis.overview.totalValue });
  const mu = rows.find((row) => row.ticker === "MU");

  assert.equal(rows.length, 1);
  assert.equal(mu.accounts.length, 2);
  assert.equal(mu.portfolioWeight, 0.75);
  assert.equal(mu.targetWeight, 0.5);
  assert.equal(mu.aboveTarget, true);
});

test("thesis tracker flags missing, stale, above-target weak, and leveraged guardrail gaps", () => {
  const holdings = normalizeHoldings([
    { ticker: "SOXL", account: "Roth IRA", marketValue: 9000, assetClass: "ETF", isLeveragedEtf: true, thesis: "" },
    { ticker: "NVDA", account: "Taxable", marketValue: 1000, assetClass: "Equity", thesis: "AI leader" }
  ]);
  const analysis = analyzePortfolio(holdings);
  const targetPlan = buildTargetAllocationPlan(analysis.holdings, [
    { scope: "ticker", key: "SOXL", targetWeight: 0.2, minWeight: 0.1, maxWeight: 0.25 },
    { scope: "ticker", key: "NVDA", targetWeight: 0.2, minWeight: 0.1, maxWeight: 0.25 }
  ]);
  const rows = buildThesisRows(analysis.holdings, {
    SOXL: { whyOwned: "", confidenceLevel: "Low", lastReviewedDate: "2026-01-01" },
    NVDA: { whyOwned: "AI leader", confidenceLevel: "High", lastReviewedDate: "2026-01-01" }
  }, { targetPlan, asOf: "2026-05-23", totalValue: analysis.overview.totalValue });
  const soxl = rows.find((row) => row.ticker === "SOXL");
  const nvda = rows.find((row) => row.ticker === "NVDA");
  const summary = thesisSummary(rows);
  const alerts = buildThesisAlerts(rows);

  assert.equal(soxl.missing, true);
  assert.equal(soxl.leveragedGuardrailMissing, true);
  assert.equal(soxl.aboveTargetWithWeakOrStale, true);
  assert.equal(nvda.stale, true);
  assert.ok(summary.needsAttention >= 2);
  assert.equal(summary.largeWeakThesis >= 1, true);
  assert.ok(alerts.some((alert) => alert.id === "thesis-missing:SOXL"));
  assert.ok(alerts.some((alert) => alert.id === "thesis-leverage-guardrail:SOXL"));
  assert.ok(alerts.every((alert) => !/\bbuy\b|\bsell\b/i.test(`${alert.title} ${alert.detail}`)));
});

test("thesis risk summary labels deterministic source and exposes review gaps", () => {
  const row = {
    ticker: "SOXL",
    thesisStatus: "Needs review",
    confidenceLevel: "Low",
    whyOwned: "",
    portfolioWeight: 0.12,
    targetWeight: 0.06,
    missing: true,
    stale: true,
    largeWeakThesis: true,
    aboveTargetWithWeakOrStale: true,
    leveragedGuardrailMissing: true,
    keyRisks: [],
    invalidationCriteria: [],
    reviewAction: "Review thesis"
  };
  const summary = buildThesisRiskSummary(row);

  assert.equal(summary.sourceLabel, "Local deterministic");
  assert.equal(summary.status, "Needs review");
  assert.match(summary.summary, /Own thesis is not documented/);
  assert.ok(summary.flags.some((flag) => /No thesis documented/i.test(flag)));
  assert.ok(summary.flags.some((flag) => /Leveraged position/i.test(flag)));
  assert.deepEqual(summary.keyRisks, ["Not documented"]);
  assert.deepEqual(summary.invalidationCriteria, ["Not documented"]);
  assert.equal(/\bbuy\b|\bsell\b/i.test(`${summary.summary} ${summary.flags.join(" ")} ${summary.reviewAction}`), false);
});

test("large low-confidence holding gets thesis alert even when not above target", () => {
  const holdings = normalizeHoldings([
    { ticker: "BIG", account: "Taxable", marketValue: 10000, assetClass: "Equity", thesis: "Needs work" },
    { ticker: "CASH", account: "Taxable", marketValue: 10000, assetClass: "Cash" }
  ]);
  const analysis = analyzePortfolio(holdings);
  const rows = buildThesisRows(analysis.holdings, {
    BIG: { whyOwned: "Needs work", confidenceLevel: "Low", lastReviewedDate: "2026-05-20" }
  }, { asOf: "2026-05-23", totalValue: analysis.overview.totalValue, largeHoldingThreshold: 0.05 });
  const big = rows.find((row) => row.ticker === "BIG");
  const alerts = buildThesisAlerts(rows);

  assert.equal(big.largeWeakThesis, true);
  assert.equal(big.aboveTargetWithWeakOrStale, false);
  assert.ok(alerts.some((alert) => alert.id === "thesis-large-weak:BIG"));
});

test("Alpha signals support, weaken, and break thesis rows", () => {
  const holdings = analyzePortfolio(tuckerDemoHoldings()).holdings;
  const baseSignals = buildAlphaSignals(demoAlphaEvents(), holdings, demoThesisProfiles());
  const breakingSignal = {
    id: "manual-breaking-mu",
    primaryTicker: "MU",
    affectedTickers: ["MU"],
    thesisImpact: "breaks thesis",
    headline: "MU HBM demand slows materially",
    actionabilityLevel: "Critical"
  };
  const rows = buildThesisRows(holdings, demoThesisProfiles(), {
    alphaSignals: [...baseSignals, breakingSignal],
    asOf: "2026-05-23"
  });
  const mu = rows.find((row) => row.ticker === "MU");
  const nvda = rows.find((row) => row.ticker === "NVDA");
  const alerts = buildThesisAlerts(rows);

  assert.equal(mu.thesisStatus, "Thesis-breaking signal");
  assert.ok(mu.alphaImpact.breaking.length);
  assert.ok(alerts.some((alert) => alert.id === "thesis-alpha-breaking:MU" && alert.actionCategory === "Critical Review"));
  assert.ok(nvda.alphaImpact.supporting.length);
  assert.ok(alerts.some((alert) => alert.id === "thesis-alpha-support:NVDA" && alert.actionCategory === "Positive Signal"));
});

test("expanded thesis profile normalizes review fields", () => {
  const profile = normalizeThesisProfile({
    ticker: "MU",
    thesisStatus: "Needs thesis",
    whyOwned: "HBM and memory cycle",
    targetAllocation: "8",
    invalidationCriteria: "HBM demand slows\nDRAM pricing rolls over",
    addConditions: ["Estimate revisions improve"],
    trimConditions: "Above target with weak evidence",
    exitReviewConditions: "Management guides below cycle expectations",
    nextReviewTrigger: "Next earnings call",
    notes: "Watch Samsung/SK Hynix supply."
  });

  assert.equal(profile.thesisStatus, "Missing");
  assert.equal(profile.targetAllocation, 0.08);
  assert.deepEqual(profile.invalidationCriteria, ["HBM demand slows", "DRAM pricing rolls over"]);
  assert.deepEqual(profile.addConditions, ["Estimate revisions improve"]);
  assert.deepEqual(profile.trimConditions, ["Above target with weak evidence"]);
  assert.equal(profile.nextReviewTrigger, "Next earnings call");
  assert.match(profile.notes, /Samsung/);
});
