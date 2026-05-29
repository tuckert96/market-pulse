import test from "node:test";
import assert from "node:assert/strict";
import { buildPortfolioAttribution } from "../src/portfolioAttribution.js";

function history(start, step, count = 21) {
  return Array.from({ length: count }, (_, index) => ({
    date: `2026-05-${String(index + 1).padStart(2, "0")}`,
    close: start + step * index
  }));
}

test("portfolio attribution ranks daily, historical, and total contributors", () => {
  const attribution = buildPortfolioAttribution([
    {
      ticker: "MU",
      name: "Micron",
      shares: 10,
      marketValue: 1200,
      costBasis: 1000,
      dailyChange: 30,
      dailyChangePercent: 0.025,
      marketDataHistoricalPrices: history(100, 1),
      marketDataProvider: "Finnhub",
      marketDataFreshness: "cached"
    },
    {
      ticker: "NVDA",
      name: "Nvidia",
      shares: 5,
      marketValue: 900,
      costBasis: 950,
      dailyChange: -45,
      dailyChangePercent: -0.05,
      marketDataHistoricalPrices: history(220, -1),
      marketDataProvider: "Finnhub",
      marketDataFreshness: "cached"
    }
  ], { totalValue: 2100 });

  assert.equal(attribution.rows[0].ticker, "NVDA");
  assert.equal(attribution.periods.daily.totalDollar, -15);
  assert.equal(Number(attribution.periods.daily.totalContributionPct.toFixed(4)), -0.0071);
  assert.equal(attribution.periods.weekly.gainers[0].ticker, "MU");
  assert.equal(attribution.periods.weekly.gainers[0].weekly.dollar, 50);
  assert.equal(attribution.periods.weekly.losers[0].ticker, "NVDA");
  assert.equal(attribution.periods.monthly.gainers[0].monthly.dollar, 200);
  assert.equal(attribution.periods.total.gainers[0].ticker, "MU");
  assert.equal(attribution.periods.total.losers[0].ticker, "NVDA");
  assert.match(attribution.summary, /NVDA.*largest negative daily contributor/);
});

test("portfolio attribution handles missing historical prices and cost basis honestly", () => {
  const attribution = buildPortfolioAttribution([
    {
      ticker: "CRDO",
      name: "Credo",
      shares: 4,
      marketValue: 240,
      dailyChange: 12,
      historicalPrices: [{ date: "2026-05-29", close: 60 }]
    }
  ], { totalValue: 240 });
  const row = attribution.rows[0];

  assert.equal(row.daily.status, "available");
  assert.equal(row.weekly.status, "missing");
  assert.equal(row.monthly.status, "missing");
  assert.equal(row.total.status, "missing");
  assert.deepEqual(row.missingPeriods, ["weekly", "monthly", "total"]);
  assert.equal(attribution.periods.weekly.missingCount, 1);
  assert.match(row.weekly.explanation, /needs at least 6 historical closes/);
  assert.match(row.total.explanation, /cost basis/i);
});

test("portfolio attribution merges same ticker across accounts", () => {
  const attribution = buildPortfolioAttribution([
    { ticker: "AMD", account: "Taxable", shares: 2, marketValue: 300, costBasis: 250, dailyChange: 6, marketDataHistoricalPrices: history(100, 2) },
    { ticker: "AMD", account: "Roth IRA", shares: 3, marketValue: 450, costBasis: 500, dailyChange: 9, marketDataHistoricalPrices: history(100, 2) }
  ], { totalValue: 750 });
  const row = attribution.rows[0];

  assert.equal(row.ticker, "AMD");
  assert.equal(row.marketValue, 750);
  assert.equal(row.shares, 5);
  assert.deepEqual(row.accounts.sort(), ["Roth IRA", "Taxable"]);
  assert.equal(row.daily.dollar, 15);
  assert.equal(row.total.dollar, 0);
});
