import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEquityRiskGuardrails,
  buildPositionRiskMetrics,
  DEFAULT_RISK_GUARDRAILS,
  filterRiskGuardrailRows,
  inferRiskCategory,
  riskActionForScore,
  scorePositionRisk,
  sortRiskGuardrailRows
} from "../src/equityRiskGuardrails.js";
import { normalizeHolding } from "../src/portfolioSchema.js";

function history(length = 220, start = 100, step = 0.2, options = {}) {
  return Array.from({ length }, (_, index) => {
    const close = start + index * step;
    return {
      date: `2026-${String(Math.floor(index / 28) + 1).padStart(2, "0")}-${String((index % 28) + 1).padStart(2, "0")}`,
      close,
      high: close + (options.highBuffer ?? 1)
    };
  });
}

test("default equity risk guardrails match the configured category thresholds", () => {
  assert.equal(DEFAULT_RISK_GUARDRAILS.core_mega_cap.maxTargetWeightPct, 10);
  assert.equal(DEFAULT_RISK_GUARDRAILS.cyclical_high_beta.hardTrimWeightPct, 10);
  assert.equal(DEFAULT_RISK_GUARDRAILS.speculative_growth.maxTargetWeightPct, 5);
  assert.equal(DEFAULT_RISK_GUARDRAILS.leveraged_etf.exitLossFromCostPct, -40);
  assert.equal(DEFAULT_RISK_GUARDRAILS.broad_index.hardTrimWeightPct, 100);
});

test("risk category inference covers leveraged ETFs, broad funds, mega-caps, and high-beta cyclicals", () => {
  assert.equal(inferRiskCategory("UPRO"), "leveraged_etf");
  assert.equal(inferRiskCategory("SOXL"), "leveraged_etf");
  assert.equal(inferRiskCategory("VOO"), "broad_index");
  assert.equal(inferRiskCategory("NVDA"), "core_mega_cap");
  assert.equal(inferRiskCategory("MU"), "cyclical_high_beta");
  assert.equal(inferRiskCategory("AMD"), "cyclical_high_beta");
  assert.equal(inferRiskCategory("CRDO"), "cyclical_high_beta");
  assert.equal(inferRiskCategory("PLTR"), "speculative_growth");
});

test("normalized holdings receive a risk category without breaking import shape", () => {
  assert.equal(normalizeHolding({ ticker: "SOXL", marketValue: 1000 }).riskCategory, "leveraged_etf");
  assert.equal(normalizeHolding({ ticker: "VOO", marketValue: 1000 }).riskCategory, "broad_index");
});

test("risk action mapping is deterministic", () => {
  assert.equal(riskActionForScore(0), "hold");
  assert.equal(riskActionForScore(2), "hold");
  assert.equal(riskActionForScore(3), "review");
  assert.equal(riskActionForScore(5), "trim");
  assert.equal(riskActionForScore(7), "exit");
});

test("position risk scoring explains hold review trim and exit scenarios", () => {
  assert.equal(scorePositionRisk({ portfolioWeightPct: 2, config: DEFAULT_RISK_GUARDRAILS.core_mega_cap }).riskAction, "hold");

  const review = scorePositionRisk({
    symbol: "NVDA",
    portfolioWeightPct: 11,
    gainLossFromCostPct: -11,
    above50DMA: false,
    config: DEFAULT_RISK_GUARDRAILS.core_mega_cap
  });
  assert.equal(review.riskScore, 3);
  assert.equal(review.riskAction, "review");
  assert.ok(review.triggeredRules.some((rule) => rule.id === "position_above_target"));
  assert.ok(review.triggeredRules.some((rule) => rule.id === "loss_from_cost_review"));

  const trim = scorePositionRisk({
    symbol: "MU",
    portfolioWeightPct: 11,
    gainLossFromCostPct: -21,
    above200DMA: false,
    config: DEFAULT_RISK_GUARDRAILS.cyclical_high_beta
  });
  assert.equal(trim.riskScore, 6);
  assert.equal(trim.riskAction, "trim");
  assert.ok(trim.triggeredRules.every((rule) => rule.explanation));

  const exit = scorePositionRisk({
    symbol: "CRDO",
    portfolioWeightPct: 8,
    gainLossFromCostPct: -35,
    drawdownFromRecentHighPct: -30,
    above50DMA: false,
    above200DMA: false,
    twoWeeklyClosesBelow200DMA: true,
    config: DEFAULT_RISK_GUARDRAILS.speculative_growth
  });
  assert.equal(exit.riskAction, "exit");
  assert.ok(exit.riskScore >= 7);
});

test("position risk metrics tolerate missing market data and expose missing fields", () => {
  const metrics = buildPositionRiskMetrics({
    ticker: "XYZ",
    name: "Unknown Growth",
    shares: 10,
    marketValue: 1000
  }, { totalValue: 10000 });

  assert.equal(metrics.riskCategory, "speculative_growth");
  assert.equal(metrics.portfolioWeightPct, 10);
  assert.equal(metrics.currentPrice, 100);
  assert.equal(metrics.fiftyDayMovingAverage, null);
  assert.ok(metrics.missingData.includes("cost basis"));
  assert.ok(metrics.missingData.includes("50DMA"));
});

test("position risk metrics calculate moving averages and drawdown from history", () => {
  const series = history(220, 100, 0.5);
  const metrics = buildPositionRiskMetrics({
    ticker: "MU",
    name: "Micron",
    shares: 100,
    price: 140,
    marketValue: 14000,
    costBasis: 18000,
    marketDataHistoricalPrices: series
  }, { totalValue: 100000 });

  assert.equal(metrics.riskCategory, "cyclical_high_beta");
  assert.ok(metrics.fiftyDayMovingAverage > 0);
  assert.ok(metrics.twoHundredDayMovingAverage > 0);
  assert.ok(metrics.gainLossFromCostPct < -20);
  assert.ok(metrics.drawdownFromRecentHighPct < 0);
  assert.ok(metrics.triggeredRules.some((rule) => rule.id === "loss_from_cost_trim"));
});

test("guardrail summary, filters, and sorting rank imported holdings by risk", () => {
  const result = buildEquityRiskGuardrails([
    { ticker: "MU", name: "Micron", marketValue: 11000, costBasis: 15000, price: 80, shares: 137.5, marketDataHistoricalPrices: history(220, 100, -0.1) },
    { ticker: "SOXL", name: "Leveraged Semis", marketValue: 9000, costBasis: 7000, price: 30, shares: 300, isLeveragedEtf: true, marketDataHistoricalPrices: history(220, 40, -0.05) },
    { ticker: "VOO", name: "S&P 500 ETF", marketValue: 50000, costBasis: 45000, price: 500, shares: 100, marketDataHistoricalPrices: history(220, 400, 0.2) },
    { ticker: "SPAXX", name: "Money Market", marketValue: 30000, assetClass: "Cash" }
  ]);

  assert.equal(result.rows.some((row) => row.symbol === "SPAXX"), false);
  assert.equal(result.summary.total, 3);
  assert.ok(result.summary.highestRiskHolding);
  assert.ok(filterRiskGuardrailRows(result.rows, "below-200dma").length >= 1);
  assert.ok(filterRiskGuardrailRows(result.rows, "missing-data").length >= 0);
  const byWeight = sortRiskGuardrailRows(result.rows, "portfolioWeightPct", -1);
  assert.equal(byWeight[0].symbol, "VOO");
});
