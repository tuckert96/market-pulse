import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWatchlistIdeaRows,
  filterWatchlistIdeaRows,
  normalizeWatchlistIdea,
  promoteTickerSignalToIdea,
  removeWatchlistIdea,
  summarizeWatchlistIdeas,
  upsertWatchlistIdea
} from "../src/watchlistIdeas.js";
import { analyzePortfolio } from "../src/portfolioAnalytics.js";

test("watchlist ideas normalize the pipeline fields and legacy reason fields", () => {
  const idea = normalizeWatchlistIdea({
    ticker: " asml ",
    status: "research",
    reason: "Lithography bottleneck thesis.",
    catalyst: "Customer capex.",
    entryZone: "Wait for valuation reset.",
    risk: "Export controls.",
    horizon: "6-18 months",
    priority: "high",
    source: "Manual research",
    addedAt: "2026-05-20T12:00:00-04:00"
  }, { asOf: "2026-05-24T09:00:00-04:00" });

  assert.equal(idea.id, "watchlist:ASML");
  assert.equal(idea.ticker, "ASML");
  assert.equal(idea.status, "researching");
  assert.equal(idea.thesis, "Lithography bottleneck thesis.");
  assert.equal(idea.targetEntryZone, "Wait for valuation reset.");
  assert.equal(idea.riskNotes, "Export controls.");
  assert.equal(idea.timeHorizon, "6-18 months");
  assert.equal(idea.conviction, "High");
  assert.equal(idea.dateAdded, "2026-05-20");
});

test("ticker signal promotion creates or updates a saved idea", () => {
  const ideas = promoteTickerSignalToIdea({
    ticker: "pltr",
    combinedScore: 76,
    topHeadline: "PLTR mock signal acceleration",
    explanation: "Signal-driven idea, not a trade recommendation.",
    missingData: ["valuation work missing"],
    warnings: ["sample data only"],
    sector: "Software"
  }, [], { asOf: "2026-05-24T09:00:00-04:00" });

  assert.equal(ideas.length, 1);
  assert.equal(ideas[0].ticker, "PLTR");
  assert.equal(ideas[0].status, "candidate");
  assert.equal(ideas[0].conviction, "Medium-high");
  assert.equal(ideas[0].sourceOfIdea, "Ticker signal");
  assert.match(ideas[0].riskNotes, /valuation work missing/);

  const updated = upsertWatchlistIdea(ideas, { ticker: "PLTR", status: "rejected", thesis: "Rejected after valuation review.", sourceOfIdea: "Manual", dateAdded: "2026-05-24" });
  assert.equal(updated.length, 1);
  assert.equal(updated[0].status, "rejected");
  assert.equal(updated[0].thesis, "Rejected after valuation review.");
});

test("manual watchlist add and remove round trip keeps one normalized ticker row", () => {
  const added = upsertWatchlistIdea([], {
    ticker: " pltr ",
    status: "watching",
    thesis: "Manual research idea.",
    sourceOfIdea: "Manual watchlist",
    dateAdded: "2026-05-24"
  });
  const deduped = upsertWatchlistIdea(added, {
    ticker: "PLTR",
    status: "candidate",
    thesis: "Moved to candidate after review.",
    sourceOfIdea: "Manual watchlist",
    dateAdded: "2026-05-24"
  });

  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].ticker, "PLTR");
  assert.equal(deduped[0].status, "candidate");
  assert.equal(deduped[0].thesis, "Moved to candidate after review.");

  const removed = removeWatchlistIdea(deduped, " pltr ");
  assert.deepEqual(removed, []);
});

test("watchlist rows link owned holdings, thesis rows, and signal suggestions", () => {
  const rows = buildWatchlistIdeaRows({
    watchlistIdeas: [
      { ticker: "AVGO", status: "watching", thesis: "AI networking idea.", sourceOfIdea: "Manual", sector: "Semiconductors", conviction: "Medium", dateAdded: "2026-05-24" }
    ],
    holdings: [
      { ticker: "MU", name: "Micron", sector: "Semiconductors", marketValue: 120000, portfolioWeight: 0.24, thesisStatus: "Current", confidenceLevel: "High", account: "IRA" }
    ],
    thesisRows: [
      { ticker: "MU", thesisStatus: "Current" }
    ],
    tickerSignals: [
      { ticker: "CRDO", combinedScore: 63, actionCategory: "Monitor", topHeadline: "CRDO mock signal", explanation: "Watchlist-only signal." },
      { ticker: "MU", combinedScore: 72, actionCategory: "Review", topHeadline: "MU signal" }
    ],
    asOf: "2026-05-24T09:00:00-04:00"
  });

  const mu = rows.find((row) => row.ticker === "MU");
  const crdo = rows.find((row) => row.ticker === "CRDO");
  const avgo = rows.find((row) => row.ticker === "AVGO");

  assert.equal(mu.status, "owned");
  assert.equal(mu.owned, true);
  assert.equal(mu.linkedThesis, true);
  assert.equal(mu.signalScore, 72);
  assert.equal(crdo.derived, true);
  assert.equal(crdo.status, "watching");
  assert.equal(avgo.saved, true);
  assert.equal(avgo.owned, false);
});

test("watchlist-only tickers can show quote and signal data without becoming holdings", () => {
  const rows = buildWatchlistIdeaRows({
    watchlistIdeas: [
      { ticker: "PLTR", status: "watching", thesis: "Manual watchlist idea.", sourceOfIdea: "Manual", dateAdded: "2026-05-24" }
    ],
    holdings: [
      { ticker: "MU", name: "Micron", sector: "Semiconductors", marketValue: 100000, portfolioWeight: 1 }
    ],
    tickerSignals: [
      { ticker: "PLTR", combinedScore: 67, actionCategory: "Monitor", topHeadline: "PLTR watchlist signal" }
    ],
    marketDataSnapshot: {
      quotesByTicker: {
        PLTR: {
          ticker: "PLTR",
          price: 24.5,
          dailyChangePercent: 0.031,
          sourceLabel: "Finnhub cached"
        }
      }
    },
    asOf: "2026-05-24T09:00:00-04:00"
  });
  const pltr = rows.find((row) => row.ticker === "PLTR");
  const analysis = analyzePortfolio([{ ticker: "MU", marketValue: 100000, shares: 1000, price: 100 }]);

  assert.equal(pltr.owned, false);
  assert.equal(pltr.quotePrice, 24.5);
  assert.equal(pltr.dailyChangePercent, 0.031);
  assert.equal(pltr.quoteSourceLabel, "Finnhub cached");
  assert.equal(pltr.signalScore, 67);
  assert.equal(analysis.overview.totalValue, 100000);
  assert.equal(analysis.holdings.some((holding) => holding.ticker === "PLTR"), false);
});

test("saved owned ideas do not stay owned after the active portfolio changes", () => {
  const rows = buildWatchlistIdeaRows({
    watchlistIdeas: [
      { ticker: "MU", status: "owned", thesis: "Previously owned position.", sourceOfIdea: "Owned holding", dateAdded: "2026-05-20" }
    ],
    holdings: [
      { ticker: "NVDA", name: "NVIDIA", sector: "Semiconductors", marketValue: 2000, portfolioWeight: 0.5 }
    ],
    tickerSignals: [],
    asOf: "2026-05-24T09:00:00-04:00"
  });
  const staleMu = rows.find((row) => row.ticker === "MU");
  const nvda = rows.find((row) => row.ticker === "NVDA");

  assert.equal(staleMu.owned, false);
  assert.equal(staleMu.status, "watching");
  assert.equal(staleMu.staleOwnedStatus, true);
  assert.equal(nvda.owned, true);
  assert.equal(nvda.status, "owned");
});

test("watchlist filters and summary support status, sector, source, and conviction", () => {
  const rows = [
    { ticker: "ASML", status: "researching", sector: "Semiconductors", signalSource: "manual", conviction: "Medium", saved: true },
    { ticker: "PLTR", status: "candidate", sector: "Software", signalSource: "ticker-signal", conviction: "Medium-high", saved: true },
    { ticker: "MU", status: "owned", sector: "Semiconductors", signalSource: "owned-holding", conviction: "High", saved: false, derived: true, reviewState: "stale" }
  ];

  assert.deepEqual(filterWatchlistIdeaRows(rows, { status: "candidate" }).map((row) => row.ticker), ["PLTR"]);
  assert.deepEqual(filterWatchlistIdeaRows(rows, { sector: "Semiconductors" }).map((row) => row.ticker), ["ASML", "MU"]);
  assert.deepEqual(filterWatchlistIdeaRows(rows, { signalSource: "owned-holding" }).map((row) => row.ticker), ["MU"]);
  assert.deepEqual(filterWatchlistIdeaRows(rows, { conviction: "High" }).map((row) => row.ticker), ["MU"]);

  const summary = summarizeWatchlistIdeas(rows);
  assert.equal(summary.total, 3);
  assert.equal(summary.candidate, 1);
  assert.equal(summary.owned, 1);
  assert.equal(summary.highConviction, 2);
  assert.equal(summary.stale, 1);
});
