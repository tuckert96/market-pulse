import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSignalReviewRows,
  calculateForwardReturns,
  filterSignalReviewRows
} from "../src/signalReview.js";

test("forward-return calculations use available trading-day history", () => {
  const history = [
    { date: "2026-05-01", close: 100 },
    { date: "2026-05-02", close: 104 },
    { date: "2026-05-03", close: 106 },
    { date: "2026-05-04", close: 103 },
    { date: "2026-05-05", close: 110 },
    { date: "2026-05-06", close: 120 }
  ];
  const review = calculateForwardReturns(history, "2026-05-01");

  assert.equal(review.anchor.date, "2026-05-01");
  assert.equal(review.returns["1d"].returnPct, 0.04);
  assert.equal(review.returns["5d"].returnPct, 0.2);
  assert.equal(review.returns["20d"], null);
  assert.ok(review.warnings.some((warning) => warning.includes("20 trading-day")));
});

test("forward-return calculations report missing signal-date and history gaps honestly", () => {
  const noHistory = calculateForwardReturns([], "2026-05-01");
  assert.equal(noHistory.anchor, null);
  assert.equal(noHistory.returns["1d"], null);
  assert.match(noHistory.warnings.join(" "), /missing or too short/);

  const noSignalDate = calculateForwardReturns([
    { date: "2026-05-01", close: 100 },
    { date: "2026-05-02", close: 101 }
  ]);
  assert.equal(noSignalDate.anchor.mode, "first-available");
  assert.match(noSignalDate.warnings.join(" "), /No original signal timestamp/);

  const afterHistory = calculateForwardReturns([
    { date: "2026-05-01", close: 100 },
    { date: "2026-05-02", close: 101 }
  ], "2026-05-20");
  assert.equal(afterHistory.anchor, null);
  assert.match(afterHistory.warnings.join(" "), /after the available/);
});

test("signal review rows combine score components, forward returns, and filters", () => {
  const rows = buildSignalReviewRows({
    tickerSignals: [
      {
        id: "ticker-signal-mu",
        ticker: "MU",
        combinedScore: 74,
        confluenceScore: 0.74,
        actionCategory: "Monitor",
        topHeadline: "MU mock context",
        portfolioOwnershipFlag: true,
        watchlistFlag: true,
        holdingsValue: 1000,
        portfolioWeight: 0.1,
        priceMomentumScore: 0.8,
        relativeStrengthScore: 0.7,
        redditMentionAccelerationScore: 0.7,
        redditSentimentScore: 0.6,
        politicianActivityScore: 0.2,
        thesisConvictionRiskScore: 0.6,
        concentrationRiskScore: 0.5,
        sourceCounts: { reddit: 3, politician: 0 },
        missingData: ["live benchmark comparison"]
      },
      {
        id: "ticker-signal-pltr",
        ticker: "PLTR",
        combinedScore: 58,
        actionCategory: "Log Only",
        watchlistFlag: true,
        priceMomentumScore: 0.2,
        politicianActivityScore: 0.8,
        sourceCounts: { politician: 2 }
      }
    ],
    marketDataSnapshot: {
      status: { status: "mock/sample mode", label: "Sample market data" },
      quotesByTicker: {
        MU: {
          ticker: "MU",
          isMock: true,
          historicalPrices: [
            { date: "2026-05-01", close: 100 },
            { date: "2026-05-02", close: 104 },
            { date: "2026-05-06", close: 112 }
          ]
        }
      }
    },
    holdings: [{ ticker: "MU", marketValue: 1000, portfolioWeight: 0.1 }],
    redditMentions: [{ ticker: "MU", extractedTickers: ["MU"], createdAt: "2026-05-01", sentiment: "bullish" }],
    politicianTrades: [{ ticker: "PLTR", disclosureDate: "2026-05-01", transactionType: "purchase" }]
  });

  const mu = rows.find((row) => row.ticker === "MU");
  const pltr = rows.find((row) => row.ticker === "PLTR");

  assert.equal(mu.forward.returns["1d"].returnPct, 0.04);
  assert.equal(mu.scoreComponents.some((component) => component.label === "Technical context"), true);
  assert.equal(mu.technicalAnalysis.status, "available");
  assert.ok(mu.missingDataWarnings.some((warning) => /Only 3 historical price points/.test(warning)));
  assert.equal(mu.scoreComponents.some((component) => component.label === "Reddit acceleration"), true);
  assert.equal(mu.redditDriven, true);
  assert.equal(pltr.politicianDriven, true);
  assert.equal(pltr.forward.returns["1d"], null);
  assert.deepEqual(filterSignalReviewRows(rows, "owned").map((row) => row.ticker), ["MU"]);
  assert.deepEqual(filterSignalReviewRows(rows, "watchlist").map((row) => row.ticker), ["PLTR"]);
  assert.deepEqual(filterSignalReviewRows(rows, "reddit").map((row) => row.ticker), ["MU"]);
  assert.deepEqual(filterSignalReviewRows(rows, "politician").map((row) => row.ticker), ["PLTR"]);
});

test("signal review does not promote sample portfolio rows into owned filters", () => {
  const rows = buildSignalReviewRows({
    tickerSignals: [{
      ticker: "MU",
      combinedScore: 70,
      portfolioOwnershipFlag: true,
      samplePortfolioFlag: true,
      holdingsValue: 1000,
      portfolioWeight: 0.1
    }],
    holdings: [{ ticker: "MU", marketValue: 1000, portfolioWeight: 0.1 }]
  });

  assert.equal(rows[0].portfolioOwnershipFlag, false);
  assert.equal(rows[0].marketValue, 0);
  assert.deepEqual(filterSignalReviewRows(rows, "owned"), []);
});
