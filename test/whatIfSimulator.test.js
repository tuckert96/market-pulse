import test from "node:test";
import assert from "node:assert/strict";
import { analyzePortfolio } from "../src/portfolioAnalytics.js";
import { tuckerDemoHoldings } from "../src/portfolioDemoData.js";
import { buildTargetAllocationPlan, defaultTargetAllocations } from "../src/targetAllocations.js";
import { applyWhatIfScenario, normalizeWhatIfScenario, simulateWhatIf } from "../src/whatIfSimulator.js";

const asOf = "2026-05-24T12:00:00-04:00";

test("add scenario increases ticker exposure without mutating original holdings", () => {
  const holdings = tuckerDemoHoldings();
  const beforeMu = tickerValue(holdings, "MU");
  const beforeCash = cashValue(holdings);
  const result = applyWhatIfScenario(holdings, {
    action: "add",
    ticker: "MU",
    amount: 5000,
    fundingMode: "cash-first"
  }, { asOf });

  assert.equal(tickerValue(holdings, "MU"), beforeMu, "original holdings should not mutate");
  assert.equal(tickerValue(result.holdings, "MU"), beforeMu + 5000);
  assert.equal(Math.round(cashValue(result.holdings)), Math.round(beforeCash - 5000));
  assert.ok(result.holdings.some((holding) => holding.account === "What-if model" && holding.ticker === "MU"));
});

test("trim-dollar and trim-percent scenarios cap at current value and move proceeds to cash", () => {
  const holdings = tuckerDemoHoldings();
  const beforeSoxl = tickerValue(holdings, "SOXL");
  const trimmed = applyWhatIfScenario(holdings, { action: "trim-dollar", ticker: "SOXL", amount: 1000000 }, { asOf });

  assert.equal(tickerValue(trimmed.holdings, "SOXL"), 0);
  assert.equal(Math.round(cashValue(trimmed.holdings)), Math.round(cashValue(holdings) + beforeSoxl));
  assert.ok(trimmed.warnings.some((warning) => /capped/i.test(warning)));

  const percentTrimmed = applyWhatIfScenario(holdings, { action: "trim-percent", ticker: "SOXL", percent: 25 }, { asOf });
  assert.equal(Math.round(tickerValue(percentTrimmed.holdings, "SOXL")), Math.round(beforeSoxl * 0.75));
});

test("remove scenario removes owned ticker and keeps total portfolio value through simulated cash", () => {
  const holdings = tuckerDemoHoldings();
  const before = analyzePortfolio(holdings);
  const result = simulateWhatIf({
    holdings,
    scenario: { action: "remove", ticker: "UPRO" },
    asOf
  });

  assert.equal(result.status, "ready");
  assert.equal(tickerValue(result.after.analysis.holdings, "UPRO"), 0);
  assert.equal(Math.round(result.after.analysis.overview.totalValue), Math.round(before.overview.totalValue));
  assert.ok(result.tickerRows.some((row) => row.ticker === "UPRO" && row.afterValue === 0));
});

test("rebalance-target scenario moves ticker toward saved target weight", () => {
  const holdings = tuckerDemoHoldings();
  const analysis = analyzePortfolio(holdings);
  const targetPlan = buildTargetAllocationPlan(analysis.holdings, defaultTargetAllocations());
  const result = simulateWhatIf({
    holdings: analysis.holdings,
    scenario: { action: "rebalance-target", ticker: "MU" },
    targetPlan,
    asOf
  });
  const muRow = result.tickerRows.find((row) => row.ticker === "MU");
  const targetRow = targetPlan.rows.find((row) => row.scope === "ticker" && row.key === "MU");

  assert.equal(result.status, "ready");
  assert.ok(muRow, "MU comparison row should be present");
  assert.ok(Math.abs(muRow.afterWeight - targetRow.targetWeight) < 0.002);
});

test("scenario comparison reports portfolio, sector, leverage, risk, and alert deltas", () => {
  const result = simulateWhatIf({
    holdings: tuckerDemoHoldings(),
    scenario: { action: "add", ticker: "SOXL", amount: 25000, fundingMode: "external" },
    asOf
  });

  assert.equal(result.status, "ready");
  assert.ok(result.deltas.totalValue.after > result.deltas.totalValue.before);
  assert.ok(result.deltas.leveragedNotionalExposure.delta > 0);
  assert.ok(result.sectorRows.some((row) => row.name === "Semiconductors" && row.deltaValue > 0));
  assert.ok(result.riskRows.some((row) => row.id === "top10"));
  assert.ok(Array.isArray(result.alertsTriggered));
  assert.equal(result.readOnly, true);
});

test("invalid scenarios return useful messages", () => {
  const missingTicker = simulateWhatIf({ holdings: tuckerDemoHoldings(), scenario: { action: "add", amount: 1000 }, asOf });
  const missingTarget = simulateWhatIf({ holdings: tuckerDemoHoldings(), scenario: { action: "rebalance-target", ticker: "CRDO", targetWeight: 0 }, targetPlan: { rows: [] }, asOf });

  assert.equal(normalizeWhatIfScenario({ action: "buy", ticker: "$mu", amount: "$1,000" }).action, "add");
  assert.equal(missingTicker.status, "invalid");
  assert.match(missingTicker.message, /ticker/i);
  assert.equal(missingTarget.status, "invalid");
  assert.match(missingTarget.message, /target weight/i);
});

function tickerValue(holdings = [], ticker = "") {
  return holdings
    .filter((holding) => String(holding.ticker).toUpperCase() === ticker.toUpperCase())
    .reduce((sum, holding) => sum + (Number(holding.marketValue) || 0), 0);
}

function cashValue(holdings = []) {
  return holdings
    .filter((holding) => holding.assetClass === "Cash" || /cash|money market|core/i.test(`${holding.ticker} ${holding.name} ${holding.sector}`))
    .reduce((sum, holding) => sum + (Number(holding.marketValue) || 0), 0);
}
