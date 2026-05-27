import test from "node:test";
import assert from "node:assert/strict";
import {
  enrichQuantLensContext,
  normalizeQuantScoreHistory,
  quantHistoryPortfolioMode,
  updateQuantScoreHistory
} from "../src/quantLensContext.js";

const asOf = "2026-05-24T12:00:00-04:00";

function signal(overrides = {}) {
  return {
    ticker: "MU",
    institutionalQuantScore: 72,
    institutionalQuantRawScore: 74,
    institutionalQuantConfidenceScore: 68,
    institutionalQuantDataCoverageScore: 70,
    institutionalQuantModelVersion: "institutional-quant-lens-v1.3",
    institutionalQuantScoreKind: "stock-quality-decision-support",
    institutionalQuantSecurityKind: "operating-company",
    institutionalQuantLabel: "Constructive setup",
    institutionalQuantSourceFreshness: "Live market data input",
    sector: "Technology",
    assetClass: "Equity",
    ...overrides
  };
}

test("quant lens context ranks tickers within comparable peer groups only", () => {
  const rows = enrichQuantLensContext([
    signal({ ticker: "MU", institutionalQuantScore: 72, sector: "Technology" }),
    signal({ ticker: "NVDA", institutionalQuantScore: 88, sector: "Technology" }),
    signal({ ticker: "AMD", institutionalQuantScore: 64, sector: "Technology" }),
    signal({ ticker: "SOXL", institutionalQuantScore: 55, institutionalQuantSecurityKind: "fund-or-etf", assetClass: "ETF", isLeveragedEtf: true }),
    signal({ ticker: "UPRO", institutionalQuantScore: 61, institutionalQuantSecurityKind: "fund-or-etf", assetClass: "ETF", isLeveragedEtf: true })
  ], { asOf, portfolioMode: "imported" });

  const mu = rows.find((row) => row.ticker === "MU");
  const nvda = rows.find((row) => row.ticker === "NVDA");
  const soxl = rows.find((row) => row.ticker === "SOXL");
  const upro = rows.find((row) => row.ticker === "UPRO");

  assert.equal(nvda.institutionalQuantPeerRank, 1);
  assert.equal(mu.institutionalQuantPeerRank, 2);
  assert.equal(mu.institutionalQuantPeerCount, 3);
  assert.equal(mu.institutionalQuantPeerGroup, "Technology");
  assert.match(mu.institutionalQuantPeerLabel, /#2 of 3/);
  assert.equal(upro.institutionalQuantPeerRank, 1);
  assert.equal(soxl.institutionalQuantPeerRank, 2);
  assert.equal(soxl.institutionalQuantPeerGroup, "Leveraged ETF exposure");
  assert.equal(soxl.institutionalQuantPeerGroupType, "exposure-peer-group");
});

test("quant lens context reports insufficient peer sets without fake precision", () => {
  const [row] = enrichQuantLensContext([
    signal({ ticker: "CRDO", institutionalQuantScore: 67, sector: "Communication Equipment" })
  ], { asOf, portfolioMode: "imported" });

  assert.equal(row.institutionalQuantPeerRank, 1);
  assert.equal(row.institutionalQuantPeerCount, 1);
  assert.equal(row.institutionalQuantPeerPercentile, null);
  assert.equal(row.institutionalQuantPeerLabel, "Peer rank needs more names");
  assert.match(row.institutionalQuantPeerWarning, /small/i);
});

test("quant score history is compact, deduped, and scoped by portfolio mode", () => {
  const history = updateQuantScoreHistory([], [
    signal({ ticker: "MU", institutionalQuantScore: 72 })
  ], { asOf: "2026-05-23T12:00:00-04:00", portfolioMode: "imported" });
  const next = enrichQuantLensContext([
    signal({ ticker: "MU", institutionalQuantScore: 79 })
  ], { asOf, portfolioMode: "imported", history });
  const sampleMode = enrichQuantLensContext([
    signal({ ticker: "MU", institutionalQuantScore: 79 })
  ], { asOf, portfolioMode: "sample", history });
  const updated = updateQuantScoreHistory(history, next, { asOf, portfolioMode: "imported" });
  const repeatSameDay = updateQuantScoreHistory(updated, next, { asOf: "2026-05-24T16:00:00-04:00", portfolioMode: "imported" });

  assert.equal(next[0].institutionalQuantPreviousScore, 72);
  assert.equal(next[0].institutionalQuantScoreChange, 7);
  assert.equal(next[0].institutionalQuantScoreTrend, "improving");
  assert.match(next[0].institutionalQuantScoreTrendLabel, /\+7\.0 pts/);
  assert.equal(sampleMode[0].institutionalQuantPreviousScore, null);
  assert.equal(updated.length, 2);
  assert.equal(repeatSameDay.length, 2);
});

test("quant score history normalization rejects raw payload detail and unsafe shapes", () => {
  const rows = normalizeQuantScoreHistory([
    {
      ticker: "mu",
      date: "2026-05-23",
      timestamp: "2026-05-23T12:00:00-04:00",
      modelVersion: "institutional-quant-lens-v1.3",
      portfolioMode: "IMPORTED_CLEAN",
      score: 72,
      sourceText: "should not persist",
      providerPayload: { secret: "nope" }
    },
    { ticker: "", score: 80, date: "2026-05-23" },
    { ticker: "BAD", score: "not-a-score", date: "2026-05-23" }
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].ticker, "MU");
  assert.equal(rows[0].portfolioMode, "imported");
  assert.equal("sourceText" in rows[0], false);
  assert.equal("providerPayload" in rows[0], false);
});

test("portfolio mode normalization keeps sample and imported history separate", () => {
  assert.equal(quantHistoryPortfolioMode("SAMPLE_MODE"), "sample");
  assert.equal(quantHistoryPortfolioMode("IMPORTED_WITH_SKIPPED_ROWS"), "imported");
  assert.equal(quantHistoryPortfolioMode("STALE_PERSISTED_REPAIRED"), "imported");
  assert.equal(quantHistoryPortfolioMode("NO_DATA"), "no-data");
});
