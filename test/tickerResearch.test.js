import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBuffettResearchChecklist,
  buildSeekingAlphaStyleSnapshot,
  buildTickerResearchLens
} from "../src/tickerResearch.js";

test("Seeking Alpha-style snapshot turns factor grades into transparent scores", () => {
  const snapshot = buildSeekingAlphaStyleSnapshot({
    ticker: "MU",
    quant: 4.7,
    valuationGrade: "B",
    growthGrade: "A",
    profitabilityGrade: "A-",
    momentumGrade: "A",
    revisionsGrade: "B+"
  });

  assert.equal(snapshot.ratingLabel, "Strong factor support");
  assert.equal(snapshot.factors.find((factor) => factor.key === "quant").value, "4.70");
  assert.equal(snapshot.factors.find((factor) => factor.key === "valuation").score, 78);
  assert.ok(snapshot.summary.includes("MU factor snapshot"));
  assert.ok(snapshot.strengths.some((item) => /Growth/.test(item)));
});

test("Buffett checklist is honest about missing owner-earnings and balance-sheet evidence", () => {
  const checklist = buildBuffettResearchChecklist({
    ticker: "MU",
    sector: "Semiconductors",
    industry: "Memory",
    profitabilityGrade: "A-",
    growthGrade: "A",
    valuationGrade: "B",
    forwardPe: 18,
    portfolioWeight: 0.08,
    marketCap: 145_000_000_000,
    riskLevel: "Medium"
  });

  assert.equal(checklist.securityKind, "operating-company");
  assert.ok(checklist.score > 60);
  assert.ok(checklist.missingEvidence.some((item) => /debt|cash|free-cash-flow|interest/i.test(item)));
  assert.doesNotMatch(checklist.summary, /intrinsic value|buy now|sell now/i);
});

test("leveraged ETFs use exposure-review language instead of company-quality claims", () => {
  const lens = buildTickerResearchLens({
    ticker: "SOXL",
    name: "Direxion Daily Semiconductor Bull 3X Shares",
    assetClass: "ETF",
    sector: "Semiconductors",
    strategySleeve: "Leveraged growth",
    isLeveragedEtf: true,
    leveragedMultiple: 3,
    portfolioWeight: 0.13,
    momentumGrade: "B",
    valuationGrade: "C",
    volume: 84_000_000
  });

  assert.equal(lens.buffettChecklist.securityKind, "fund-or-etf");
  assert.match(lens.buffettChecklist.summary, /exposure review/i);
  assert.ok(lens.buffettChecklist.watchItems.some((item) => /path-dependency|position cap|volatility/i.test(item)));
  assert.doesNotMatch(lens.buffettChecklist.summary, /moat|owner earnings/i);
});

test("valuation context reports margin-of-safety inputs without inventing intrinsic value", () => {
  const lens = buildTickerResearchLens({
    ticker: "PLTR",
    valuationGrade: "D",
    growthGrade: "A",
    forwardPe: 86,
    priceToSales: 34,
    price: 198,
    fiftyTwoWeekLow: 100,
    fiftyTwoWeekHigh: 220
  });

  assert.equal(lens.valuationContext.label, "Thin margin of safety");
  assert.match(lens.valuationContext.note, /forward P\/E 86/);
  assert.doesNotMatch(lens.valuationContext.note, /intrinsic value|fair value estimate/i);
});
