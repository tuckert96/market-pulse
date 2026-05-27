import test from "node:test";
import assert from "node:assert/strict";
import { buildRebalancePlan, summarizeSleeves } from "../src/rebalanceEngine.js";
import { analyzePortfolio } from "../src/portfolioAnalytics.js";
import { tuckerDemoHoldings } from "../src/portfolioDemoData.js";

test("rebalance plan produces contribution suggestions for underweight positions", () => {
  const holdings = analyzePortfolio(tuckerDemoHoldings()).holdings;
  const plan = buildRebalancePlan(holdings, { mode: "new-contribution", contributionAmount: 5000 });

  assert.equal(plan.mode, "new-contribution");
  assert.ok(plan.rows.length > 0);
  assert.ok(plan.suggestions.length > 0);
  assert.ok(plan.suggestions.every((item) => item.action.includes("Buy") || item.type === "note"));
});

test("strategy sleeve summary identifies leveraged growth sleeve", () => {
  const holdings = analyzePortfolio(tuckerDemoHoldings()).holdings;
  const sleeves = summarizeSleeves(holdings);
  const leveraged = sleeves.find((sleeve) => sleeve.name === "Leveraged growth");

  assert.ok(leveraged);
  assert.ok(leveraged.value > 0);
  assert.ok(leveraged.averageRisk > 0);
});
