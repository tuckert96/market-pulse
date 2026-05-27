import test from "node:test";
import assert from "node:assert/strict";
import { selectMarketDataTickerPlan, selectMarketDataTickers } from "../src/marketDataSelection.js";

test("imported portfolio ticker selection uses active holdings and skips cash-like rows", () => {
  const tickers = selectMarketDataTickers({
    holdings: [
      { ticker: "MU", assetClass: "Equity", marketValue: 1000 },
      { ticker: "NVDA", assetClass: "Equity", marketValue: 2000 },
      { ticker: "SPAXX", assetClass: "Cash", cash: true },
      { ticker: "USEQSP500I", assetClass: "Equity", localIdentifier: true, marketDataEligible: false }
    ],
    watchlistIdeas: [{ ticker: "CRDO", status: "watching" }],
    redditSettings: { whitelist: ["AMD"] },
    marketEvents: [{ affectedTickers: ["MU", "SOXL"] }],
    eventCalendar: [{ ticker: "NVDA", affectedTickers: ["UPRO"] }],
    driverTickers: ["SPY", "QQQ"],
    defaultTickers: ["TSLA", "AAPL"],
    includeDefaultResearchTickers: false
  });

  assert.deepEqual(tickers, ["NVDA", "MU", "CRDO", "AMD", "SOXL", "UPRO", "QQQ", "SPY"]);
  assert.equal(tickers.includes("SPAXX"), false);
  assert.equal(tickers.includes("USEQSP500I"), false);
  assert.equal(tickers.includes("TSLA"), false);
});

test("market data ticker plan prioritizes owned value before research tickers under caps", () => {
  const plan = selectMarketDataTickerPlan({
    maxTickers: 4,
    holdings: [
      { ticker: "SMALL", assetClass: "Equity", marketValue: 1000 },
      { ticker: "LARGE", assetClass: "Equity", marketValue: 50000 },
      { ticker: "MID", assetClass: "Equity", marketValue: 10000 }
    ],
    watchlistIdeas: [{ ticker: "WATCH", status: "watching" }],
    redditSettings: { whitelist: ["BUZZ"] },
    marketEvents: [{ affectedTickers: ["EVENT", "LARGE"] }],
    driverTickers: ["SPY"],
    defaultTickers: ["DEFAULT"],
    includeDefaultResearchTickers: true
  });

  assert.deepEqual(plan.tickers, ["LARGE", "MID", "SMALL", "WATCH"]);
  assert.deepEqual(plan.omittedTickers, ["BUZZ", "EVENT", "SPY", "DEFAULT"]);
  assert.deepEqual(plan.omittedHoldingTickers, []);
  assert.deepEqual(plan.omittedResearchTickers, ["BUZZ", "EVENT", "SPY", "DEFAULT"]);
  assert.deepEqual(plan.candidates.find((row) => row.ticker === "LARGE").sources, ["holding", "market-event"]);
});

test("sample or no-data ticker selection can include default research watchlist", () => {
  const tickers = selectMarketDataTickers({
    holdings: [],
    defaultTickers: ["MU", "NVDA"],
    includeDefaultResearchTickers: true
  });

  assert.deepEqual(tickers, ["MU", "NVDA"]);
});
