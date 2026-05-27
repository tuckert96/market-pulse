import test from "node:test";
import assert from "node:assert/strict";
import {
  actionabilityForEvent,
  buildAlphaSignals,
  buildDecisionBrief,
  compactActionLabel,
  confidenceScoreForEvent,
  demoAlphaEvents,
  demoThesisProfiles,
  evidenceScoreForGrade,
  evidenceGradeForEvent,
  materialityScoreForEvent,
  normalizeAlphaEvent,
  portfolioRelevanceScoreForEvent,
  priorityScoreForEvent,
  signalActionCategory,
  actionCategorySeverity,
  thesisImpactScoreForEvent
} from "../src/alphaEngine.js";
import { analyzePortfolio } from "../src/portfolioAnalytics.js";
import { tuckerDemoHoldings } from "../src/portfolioDemoData.js";

test("Samsung strike maps to MU as a second-order thesis-supporting signal", () => {
  const holdings = analyzePortfolio(tuckerDemoHoldings()).holdings;
  const signals = buildAlphaSignals(demoAlphaEvents(), holdings, demoThesisProfiles());
  const samsung = signals.find((signal) => signal.id === "alpha-samsung-strike-mu");

  assert.ok(samsung);
  assert.equal(samsung.primaryTicker, "MU");
  assert.equal(samsung.impactOrderByTicker.MU, "second-order");
  assert.equal(samsung.thesisImpact, "supports thesis");
  assert.equal(samsung.evidenceGrade, "C");
  assert.match(samsung.businessMechanism, /memory supply/);
  assert.ok(samsung.missingEvidence.includes("Affected facilities"));
  assert.ok(samsung.whatToMonitorNext.includes("DRAM/NAND spot prices"));
  assert.match(samsung.positionSizingCheck, /MU/);
  assert.equal(samsung.affectedWeightLabel.endsWith("%"), true);
  assert.equal(samsung.impactType, "second-order");
  assert.equal(samsung.actionLabel, "Review");
  assert.equal(signalActionCategory(samsung), "Monitor");
  assert.notEqual(signalActionCategory(samsung), "Critical Review");
  assert.match(samsung.whyThisMattersToTucker, /SOXL|semiconductor|current portfolio/i);
  assert.match(samsung.whatChanged, /Samsung employee strike expands/);
  assert.ok(samsung.sourceLinks.some((link) => /Micron|MU|memory|DRAM/i.test(`${link.label} ${link.url}`)));
  assert.ok(samsung.whatCouldProveWrong.some((item) => /short|limited|inventory|demand|priced/i.test(item)));
});

test("demo signal normalization provides canonical fields", () => {
  const events = demoAlphaEvents().map(normalizeAlphaEvent);

  assert.equal(events.length, 5);
  assert.deepEqual(events.map((event) => event.id), [
    "alpha-samsung-strike-mu",
    "alpha-ai-capex-nvda-soxl-vgt",
    "alpha-rates-semi-selloff",
    "alpha-risk-off-upro",
    "alpha-social-rumor-crdo"
  ]);
  for (const event of events) {
    assert.ok(event.id);
    assert.ok(event.timestamp);
    assert.ok(event.sourceType);
    assert.ok(event.headline);
    assert.ok(event.eventType);
    assert.ok(Array.isArray(event.affectedTickers));
    assert.ok(Array.isArray(event.sourceLinks));
    assert.ok(event.sourceLinks.length > 0);
    assert.ok(event.staleAfter);
    assert.ok("priceAction" in event);
  }
});

test("materiality, confidence, and priority produce bounded explainable scores", () => {
  const event = demoAlphaEvents()[0];
  const materiality = materialityScoreForEvent(event, 0.11);
  const confidence = confidenceScoreForEvent(event);
  const relevance = portfolioRelevanceScoreForEvent(event, 0.11, [{ ticker: "MU", riskLevel: "High" }]);
  const priority = priorityScoreForEvent(event, {
    portfolioRelevanceScore: relevance,
    materialityScore: materiality,
    confidenceScore: confidence,
    evidenceGrade: "C",
    actionabilityScore: 0.5
  });

  assert.ok(materiality > 0);
  assert.ok(materiality <= 1);
  assert.ok(confidence > 0);
  assert.ok(confidence <= 1);
  assert.ok(relevance > 0);
  assert.ok(relevance <= 1);
  assert.ok(priority >= 0);
  assert.equal(evidenceGradeForEvent(event), "C");
});

test("evidence grade scoring orders primary-grade evidence above rumor evidence", () => {
  assert.ok(evidenceScoreForGrade("A") > evidenceScoreForGrade("B"));
  assert.ok(evidenceScoreForGrade("B") > evidenceScoreForGrade("C"));
  assert.ok(evidenceScoreForGrade("C") > evidenceScoreForGrade("D"));
  assert.ok(evidenceScoreForGrade("D") > evidenceScoreForGrade("F"));
});

test("actionability avoids reckless buy or sell commands", () => {
  const event = demoAlphaEvents()[0];
  const result = actionabilityForEvent(event, {
    affectedWeight: 0.11,
    materialityScore: 0.7,
    confidenceScore: 0.56,
    thesisImpact: "supports thesis",
    evidenceGrade: "C",
    affectedHoldings: [{ ticker: "MU", riskLevel: "High" }]
  });

  assert.match(result.reason, /review|monitor|Log|Ignore/i);
  assert.doesNotMatch(result.reason, /\bbuy\b|\bsell\b/i);
});

test("thesis impact classification scores thesis-breaking events above noise", () => {
  assert.ok(thesisImpactScoreForEvent("breaks thesis") > thesisImpactScoreForEvent("weakens thesis"));
  assert.ok(thesisImpactScoreForEvent("weakens thesis") > thesisImpactScoreForEvent("supports thesis"));
  assert.ok(thesisImpactScoreForEvent("supports thesis") > thesisImpactScoreForEvent("no thesis impact / noise"));
});

test("low-quality social rumor is downgraded correctly", () => {
  const holdings = analyzePortfolio(tuckerDemoHoldings()).holdings;
  const signals = buildAlphaSignals(demoAlphaEvents(), holdings, demoThesisProfiles());
  const rumor = signals.find((signal) => signal.id === "alpha-social-rumor-crdo");

  assert.ok(rumor);
  assert.equal(rumor.sourceType, "social");
  assert.equal(rumor.evidenceGrade, "D");
  assert.equal(rumor.thesisImpact, "no thesis impact / noise");
  assert.ok(rumor.confidenceScore < 0.3);
  assert.ok(["None", "Low"].includes(rumor.actionabilityLevel));
  assert.equal(rumor.actionLabel, "Ignore");
  assert.equal(signalActionCategory(rumor), "Ignore");
  assert.equal(rumor.noActionRecommendation, true);
  assert.equal(rumor.isLowSignal, true);
  assert.match(rumor.positionSizingCheck, /evidence quality is too low|No direct holding/);
});

test("price-confirmed AI capex signal affects Tucker's AI stack", () => {
  const holdings = analyzePortfolio(tuckerDemoHoldings()).holdings;
  const signals = buildAlphaSignals(demoAlphaEvents(), holdings, demoThesisProfiles());
  const aiCapex = signals.find((signal) => signal.id === "alpha-ai-capex-nvda-soxl-vgt");

  assert.ok(aiCapex);
  assert.equal(aiCapex.priceAction.status, "peer-group confirmed");
  assert.ok(aiCapex.affectedHoldings.some((holding) => holding.ticker === "NVDA"));
  assert.ok(aiCapex.affectedHoldings.some((holding) => holding.ticker === "VGT"));
  assert.ok(aiCapex.materialityScore > 0.5);
  assert.equal(signalActionCategory(aiCapex), "Positive Signal");
  assert.equal(actionCategorySeverity(signalActionCategory(aiCapex)), "positive");
});

test("signal priority ordering puts critical review and review signals before low-quality noise", () => {
  const holdings = analyzePortfolio(tuckerDemoHoldings()).holdings;
  const signals = buildAlphaSignals(demoAlphaEvents(), holdings, demoThesisProfiles());
  const rumor = signals.find((signal) => signal.id === "alpha-social-rumor-crdo");

  assert.ok(signals[0].actionabilityLevel === "Critical" || signals[0].actionabilityLevel === "High");
  assert.equal(signals.at(-1).id, rumor.id);
  assert.equal(compactActionLabel("Critical"), "Critical Review");
  assert.equal(compactActionLabel("Low"), "Log");
});

test("decision brief summarizes what changed, risk, monitors, thesis impact, and ignore items", () => {
  const analysis = analyzePortfolio(tuckerDemoHoldings());
  const signals = buildAlphaSignals(demoAlphaEvents(), analysis.holdings, demoThesisProfiles());
  const brief = buildDecisionBrief(signals, analysis);

  assert.ok(brief.summaryLine);
  assert.ok(brief.topPrioritySignals.length <= 3);
  assert.ok(brief.topPrioritySignals.length > 0);
  assert.ok(brief.topPortfolioRisks.length > 0);
  assert.ok(brief.monitorItems.length > 0);
  assert.ok(brief.thesisImpactEvents.some((event) => event.ticker === "MU"));
  assert.ok(brief.noActionRecommendations.some((item) => item.id === "alpha-social-rumor-crdo"));
  assert.ok(brief.staleDataWarnings.length > 0);
});
