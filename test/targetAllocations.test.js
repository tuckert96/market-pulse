import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { analyzePortfolio } from "../src/portfolioAnalytics.js";
import { normalizeHoldings } from "../src/portfolioSchema.js";
import {
  buildCashDeploymentPlan,
  buildRebalancingSimulator,
  buildLeveragedGuardrails,
  buildTargetAllocationPlan,
  buildTargetAllocationRows,
  defaultTargetAllocations,
  normalizeTargetAllocations,
  targetRecordFromFormRow
} from "../src/targetAllocations.js";

await import("../src/dataAdapters.js");

const adapters = globalThis.DataAdapters;

test("target allocation rows calculate current weights and drift", () => {
  const holdings = normalizeHoldings([
    { ticker: "MU", account: "Taxable", shares: 1, price: 120, marketValue: 1200, assetClass: "Equity" },
    { ticker: "NVDA", account: "Roth IRA", shares: 1, price: 300, marketValue: 300, assetClass: "Equity" },
    { ticker: "SPAXX", account: "Taxable", marketValue: 500, assetClass: "Cash" }
  ]);
  const targets = normalizeTargetAllocations([
    { scope: "ticker", key: "MU", targetWeight: 0.4, minWeight: 0.3, maxWeight: 0.5 },
    { scope: "ticker", key: "NVDA", targetWeight: 0.25, minWeight: 0.2, maxWeight: 0.3 },
    { scope: "assetClass", key: "Cash", targetWeight: 0.15, minWeight: 0.05, maxWeight: 0.25 }
  ]);
  const rows = buildTargetAllocationRows(holdings, targets);
  const mu = rows.find((row) => row.scope === "ticker" && row.key === "MU");
  const nvda = rows.find((row) => row.scope === "ticker" && row.key === "NVDA");

  assert.equal(Math.round(mu.currentWeight * 100), 60);
  assert.equal(Math.round(mu.driftWeight * 100), 20);
  assert.equal(mu.status, "overweight");
  assert.equal(mu.suggestedAction, "review trim");
  assert.equal(nvda.status, "underweight");
  assert.equal(nvda.suggestedAction, "review add");
});

test("cash deployment planner allocates excess cash toward underweight ticker targets", () => {
  const holdings = normalizeHoldings([
    { ticker: "MU", account: "Taxable", marketValue: 1000, assetClass: "Equity" },
    { ticker: "NVDA", account: "Roth IRA", marketValue: 500, assetClass: "Equity" },
    { ticker: "SPAXX", account: "Taxable", name: "Money Market", marketValue: 8500, assetClass: "Cash" }
  ]);
  const targets = normalizeTargetAllocations([
    { scope: "ticker", key: "MU", targetWeight: 0.2, minWeight: 0.15, maxWeight: 0.25 },
    { scope: "ticker", key: "NVDA", targetWeight: 0.15, minWeight: 0.1, maxWeight: 0.2 },
    { scope: "assetClass", key: "Cash", targetWeight: 0.2, minWeight: 0.1, maxWeight: 0.3 }
  ]);
  const rows = buildTargetAllocationRows(holdings, targets);
  const cashPlan = buildCashDeploymentPlan(holdings, targets, rows);

  assert.equal(cashPlan.availableCash, 8500);
  assert.equal(cashPlan.excessCash, 6500);
  assert.ok(cashPlan.suggestions.length >= 2);
  assert.ok(cashPlan.suggestions.some((item) => item.ticker === "MU" && item.amount > 0));
  assert.ok(cashPlan.suggestions.some((item) => item.ticker === "NVDA" && item.amount > 0));
});

test("rebalance modes produce review suggestions without trade commands", () => {
  const holdings = normalizeHoldings([
    { ticker: "UPRO", account: "Taxable Brokerage", marketValue: 2200, assetClass: "ETF", isLeveragedEtf: true },
    { ticker: "MU", account: "Roth IRA", marketValue: 300, assetClass: "Equity" },
    { ticker: "SPAXX", account: "Taxable Brokerage", marketValue: 500, assetClass: "Cash" }
  ]);
  const targets = normalizeTargetAllocations([
    { scope: "ticker", key: "UPRO", targetWeight: 0.2, minWeight: 0.1, maxWeight: 0.25, maxEffectiveExposure: 0.75 },
    { scope: "ticker", key: "MU", targetWeight: 0.2, minWeight: 0.1, maxWeight: 0.25 },
    { scope: "assetClass", key: "Cash", targetWeight: 0.1, minWeight: 0.05, maxWeight: 0.2 }
  ]);
  const plan = buildTargetAllocationPlan(holdings, targets, { mode: "taxable-safe" });

  assert.ok(plan.suggestions.length > 0);
  assert.ok(plan.suggestions.every((item) => /^Review|^Hold/i.test(item.action)));
  assert.ok(plan.suggestions.some((item) => item.action === "Review leverage cap"));
  assert.ok(plan.suggestions.some((item) => item.action === "Hold / review taxable impact"));
});

test("rebalancing simulator models new-contribution and sell-and-rebalance modes", () => {
  const holdings = normalizeHoldings([
    { ticker: "MU", account: "Taxable Brokerage", accountType: "Taxable", marketValue: 7000, assetClass: "Equity" },
    { ticker: "NVDA", account: "Roth IRA", accountType: "Retirement", marketValue: 1000, assetClass: "Equity" },
    { ticker: "SPAXX", account: "Taxable Brokerage", accountType: "Taxable", name: "Money Market", marketValue: 2000, assetClass: "Cash" }
  ]);
  const targets = normalizeTargetAllocations([
    { scope: "ticker", key: "MU", targetWeight: 0.4, minWeight: 0.3, maxWeight: 0.45 },
    { scope: "ticker", key: "NVDA", targetWeight: 0.3, minWeight: 0.2, maxWeight: 0.35 },
    { scope: "assetClass", key: "Cash", targetWeight: 0.1, minWeight: 0.05, maxWeight: 0.2 }
  ]);
  const contributionPlan = buildTargetAllocationPlan(holdings, targets, { mode: "new-contribution" });
  const sellPlan = buildTargetAllocationPlan(holdings, targets, { mode: "sell-and-rebalance" });
  const directSimulator = buildRebalancingSimulator(holdings, targets, contributionPlan.rows, contributionPlan.cashPlan, { mode: "new-contribution" });

  assert.equal(contributionPlan.simulator.mode, "new-contribution");
  assert.equal(contributionPlan.simulator.readOnly, true);
  assert.ok(contributionPlan.simulator.estimatedTrades.some((trade) => trade.ticker === "NVDA" && trade.direction === "add"));
  assert.equal(contributionPlan.simulator.estimatedTrades.some((trade) => trade.valueDelta < 0), false);
  assert.equal(directSimulator.estimatedTrades.some((trade) => trade.ticker === "NVDA"), true);

  assert.equal(sellPlan.simulator.mode, "sell-and-rebalance");
  assert.ok(sellPlan.simulator.estimatedTrades.some((trade) => trade.ticker === "MU" && trade.direction === "reduce"));
  assert.ok(sellPlan.simulator.estimatedTrades.some((trade) => trade.ticker === "NVDA" && trade.direction === "add"));
  assert.ok(sellPlan.simulator.beforeAfterRows.some((row) => row.ticker === "MU" && row.afterWeight < row.currentWeight));
  assert.ok(sellPlan.simulator.categoryAdjustments.some((row) => row.scope === "assetClass" && row.key === "Cash"));
  assert.equal(sellPlan.simulator.taxWarnings.some((warning) => /taxable accounts/i.test(warning)), true);
  assert.doesNotMatch(JSON.stringify(sellPlan.simulator), /\b(place order|execute|trade ticket|buy now|sell now)\b/i);
});

test("leveraged ETF guardrails flag holdings above target cap", () => {
  const holdings = normalizeHoldings([
    { ticker: "SOXL", account: "Roth IRA", marketValue: 9000, assetClass: "ETF", isLeveragedEtf: true },
    { ticker: "SPAXX", account: "Roth IRA", marketValue: 1000, assetClass: "Cash" }
  ]);
  const targets = normalizeTargetAllocations([
    { scope: "ticker", key: "SOXL", targetWeight: 0.05, minWeight: 0.02, maxWeight: 0.07, maxEffectiveExposure: 0.21 }
  ]);
  const guardrails = buildLeveragedGuardrails(holdings, targets);
  const soxl = guardrails.find((item) => item.ticker === "SOXL");

  assert.equal(soxl.status, "above cap");
  assert.ok(soxl.effectiveExposure > soxl.maxEffectiveExposure);
  assert.match(soxl.warning, /above its review cap/);
});

test("target records normalize for local persistence and JSON backup", () => {
  const record = targetRecordFromFormRow({
    scope: "ticker",
    key: "mu",
    targetWeight: "8",
    minWeight: "5",
    maxWeight: "11",
    priority: "high",
    notes: "Memory cycle"
  });
  const restored = normalizeTargetAllocations(JSON.parse(JSON.stringify([record])));

  assert.equal(record.key, "MU");
  assert.equal(restored.length, 1);
  assert.equal(restored[0].targetWeight, 0.08);
  assert.equal(restored[0].priority, "high");
  assert.equal(restored[0].notes, "Memory cycle");
});

test("imported Fidelity CSV holdings drive target weights and rebalance rows", () => {
  const result = adapters.buildImportResult({
    fidelityCsv: readFileSync("data/sample-fidelity-positions.csv", "utf8")
  });
  const analysis = analyzePortfolio(result.records);
  const plan = buildTargetAllocationPlan(analysis.holdings, defaultTargetAllocations(), { mode: "new-contribution" });
  const nvda = plan.rows.find((row) => row.scope === "ticker" && row.key === "NVDA");

  assert.equal(result.validation.ok, true);
  assert.ok(plan.totalValue > 0);
  assert.ok(nvda.currentValue > 0);
  assert.equal(plan.rows.some((row) => row.scope === "account"), true);
  assert.equal(plan.rows.some((row) => row.scope === "assetClass" && row.key === "Cash"), true);
  assert.ok(plan.cashPlan.availableCash >= 0);
});
