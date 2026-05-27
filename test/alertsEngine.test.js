import test from "node:test";
import assert from "node:assert/strict";
import { buildLocalAlerts, normalizeAlertThresholds } from "../src/alertsEngine.js";
import { analyzePortfolio } from "../src/portfolioAnalytics.js";

const asOf = "2026-05-24T09:00:00-04:00";

test("local alerts generate position, sector, leverage, signal, disclosure, Reddit, and data-source rules", () => {
  const analysis = analyzePortfolio([
    { ticker: "MU", name: "Micron", account: "Taxable", marketValue: 16000, costBasis: 10000, assetClass: "Equity", sector: "Semiconductors", sourceAsOf: asOf },
    { ticker: "SOXL", name: "SOXL", account: "Roth", marketValue: 18000, costBasis: 12000, assetClass: "ETF", sector: "Semiconductors", isLeveragedEtf: true, leveragedMultiple: 3, sourceAsOf: asOf },
    { ticker: "CASH", name: "Cash", account: "Taxable", marketValue: 66000, assetClass: "Cash", sector: "Cash", sourceAsOf: asOf }
  ], { skipPortfolioThresholdAlerts: true });
  const alerts = buildLocalAlerts({
    analysis,
    tickerSignals: [{ ticker: "MU", combinedScore: 82, explanation: "provider-layer score is elevated" }],
    politicianTrades: [{ ticker: "MU", politicianName: "Rep Local", transactionType: "purchase", assetName: "Micron", recencyScore: 1, sizeScore: 0.7, clusterScore: 0.2 }],
    redditMentions: [{
      id: "r-mu",
      sourceId: "r-mu",
      ticker: "MU",
      subreddit: "stocks",
      createdAt: asOf,
      detectedAt: asOf,
      text: "$MU mention",
      extractedTickers: ["MU"],
      sourceUrl: "https://example.test/r/mu",
      score: 10,
      upvotes: 10,
      commentCount: 1,
      engagementScore: 20,
      sentiment: "bullish",
      credibilityScore: 0.35,
      isRumor: false,
      citesPrimarySource: false
    }],
    marketDataStatus: { status: "mock/sample mode", detail: "Mock market data only." },
    thresholds: {
      maxPositionWeight: 0.12,
      maxSectorWeight: 0.30,
      maxLeveragedWeight: 0.12,
      tickerSignalScore: 75,
      politicianTradeScore: 0.6,
      redditMentionAcceleration: 0.5
    },
    watchlist: ["MU"],
    asOf
  });
  const types = new Set(alerts.map((alert) => alert.type));

  assert.ok(types.has("position-weight"));
  assert.ok(types.has("sector-concentration"));
  assert.ok(types.has("leveraged-etf-exposure"));
  assert.ok(types.has("ticker-signal"));
  assert.ok(types.has("politician-trade-match"));
  assert.ok(types.has("reddit-mention-acceleration"));
  assert.ok(types.has("data-source"));
  assert.match(alerts.find((alert) => alert.type === "ticker-signal")?.detail || "", /review-priority score, not a prediction/i);
  assert.ok(alerts.every((alert) => ["info", "watch", "warning", "critical"].includes(alert.severity)));
  assert.ok(alerts.every((alert) => alert.status === "active"));
  assert.ok(alerts.every((alert) => !/\bemail\b|\btext\b|\bpush\b/i.test(alert.detail)));
});

test("local alert thresholds suppress rules until values cross the configured boundary", () => {
  const analysis = analyzePortfolio([
    { ticker: "MU", name: "Micron", account: "Taxable", marketValue: 12000, costBasis: 10000, assetClass: "Equity", sector: "Semiconductors", sourceAsOf: asOf },
    { ticker: "CASH", name: "Cash", account: "Taxable", marketValue: 88000, assetClass: "Cash", sector: "Cash", sourceAsOf: asOf }
  ], { skipPortfolioThresholdAlerts: true });
  const atThreshold = buildLocalAlerts({
    analysis,
    tickerSignals: [{ ticker: "MU", combinedScore: 70 }],
    thresholds: { maxPositionWeight: 0.12, maxSectorWeight: 0.12, tickerSignalScore: 70 },
    marketDataStatus: { status: "connected" },
    asOf
  });
  const overThreshold = buildLocalAlerts({
    analysis,
    tickerSignals: [{ ticker: "MU", combinedScore: 71 }],
    thresholds: { maxPositionWeight: 0.119, maxSectorWeight: 0.119, tickerSignalScore: 70 },
    marketDataStatus: { status: "connected" },
    asOf
  });

  assert.equal(atThreshold.some((alert) => alert.type === "position-weight"), false);
  assert.equal(atThreshold.some((alert) => alert.type === "sector-concentration"), false);
  assert.equal(atThreshold.some((alert) => alert.type === "ticker-signal"), true);
  assert.equal(overThreshold.some((alert) => alert.type === "position-weight"), true);
  assert.equal(overThreshold.some((alert) => alert.type === "sector-concentration"), true);
});

test("ticker signal alerts stay tied to active owned holdings", () => {
  const analysis = analyzePortfolio([
    { ticker: "XYZ", name: "Imported Holding", account: "Taxable", marketValue: 10000, assetClass: "Equity", sector: "Industrials", sourceAsOf: asOf }
  ], { skipPortfolioThresholdAlerts: true });
  const alerts = buildLocalAlerts({
    analysis,
    tickerSignals: [
      { ticker: "XYZ", combinedScore: 75, portfolioOwnershipFlag: true },
      { ticker: "MU", combinedScore: 95, portfolioOwnershipFlag: false, watchlistFlag: true }
    ],
    thresholds: { tickerSignalScore: 70 },
    marketDataStatus: { status: "connected" },
    asOf
  });

  assert.equal(alerts.some((alert) => alert.type === "ticker-signal" && alert.ticker === "XYZ"), true);
  assert.equal(alerts.some((alert) => alert.type === "ticker-signal" && alert.ticker === "MU"), false);
});

test("ticker signal alert copy reflects live or cached market-data inputs", () => {
  const analysis = analyzePortfolio([
    { ticker: "MU", name: "Imported Holding", account: "Taxable", marketValue: 10000, assetClass: "Equity", sector: "Semiconductors", sourceAsOf: asOf }
  ], { skipPortfolioThresholdAlerts: true });
  const alert = buildLocalAlerts({
    analysis,
    tickerSignals: [{
      ticker: "MU",
      combinedScore: 82,
      portfolioOwnershipFlag: true,
      liveProviderCalls: true,
      marketDataMode: "live",
      marketDataStatus: "connected",
      marketDataSourceLabel: "Finnhub",
      explanation: "Provider-backed movement is included."
    }],
    thresholds: { tickerSignalScore: 70 },
    marketDataStatus: { status: "connected", dataFreshness: "live" },
    asOf
  }).find((row) => row.type === "ticker-signal");

  assert.match(alert.detail, /live market-data-assisted review-priority score, not a prediction/i);
  assert.doesNotMatch(alert.detail, /sample\/local confluence score/i);
});

test("ticker signal alerts surface source-trust guardrails without trading language", () => {
  const analysis = analyzePortfolio([
    { ticker: "MU", name: "Imported Holding", account: "Taxable", marketValue: 10000, assetClass: "Equity", sector: "Semiconductors", sourceAsOf: asOf }
  ], { skipPortfolioThresholdAlerts: true });
  const alert = buildLocalAlerts({
    analysis,
    tickerSignals: [{
      ticker: "MU",
      combinedScore: 71,
      rawConfluenceScore: 0.79,
      sourceTrustCap: 0.68,
      sourceTrustCapReason: "Social and federal disclosure flow is capped until confirmed by market data, primary-source events, or thesis evidence.",
      portfolioOwnershipFlag: true,
      explanation: "Social/disclosure overlap raised review priority."
    }],
    thresholds: { tickerSignalScore: 70 },
    marketDataStatus: { status: "connected" },
    asOf
  }).find((row) => row.type === "ticker-signal");

  assert.ok(alert);
  assert.match(alert.detail, /Source guardrail: Social and federal disclosure flow is capped/i);
  assert.equal(alert.metadata.rawConfluenceScore, 0.79);
  assert.equal(alert.metadata.sourceTrustCap, 0.68);
  assert.match(alert.metadata.sourceTrustCapReason, /primary-source events/);
  assert.doesNotMatch(alert.detail, /\b(buy now|sell now|guaranteed return|place order)\b/i);
});

test("alert threshold normalization accepts UI percentages and keeps safe defaults", () => {
  const normalized = normalizeAlertThresholds({
    maxPositionWeight: "15",
    maxSectorWeight: "not-a-number",
    maxLeveragedWeight: 0.11,
    tickerSignalScore: "80",
    politicianTradeScore: "65",
    redditMentionAcceleration: 0.7,
    staleHours: "48"
  });

  assert.equal(normalized.maxPositionWeight, 0.15);
  assert.equal(normalized.maxSectorWeight, 0.32);
  assert.equal(normalized.maxLeveragedWeight, 0.11);
  assert.equal(normalized.tickerSignalScore, 80);
  assert.equal(normalized.politicianTradeScore, 0.65);
  assert.equal(normalized.redditMentionAcceleration, 0.7);
  assert.equal(normalized.staleHours, 48);
});

test("market data provider errors generate a review alert", () => {
  const analysis = analyzePortfolio([
    { ticker: "MU", name: "Micron", account: "Taxable", marketValue: 12000, assetClass: "Equity", sector: "Semiconductors", sourceAsOf: asOf }
  ], { skipPortfolioThresholdAlerts: true });
  const alerts = buildLocalAlerts({
    analysis,
    marketDataStatus: {
      status: "error",
      detail: "Market data refresh error. Provider returned HTTP 429."
    },
    thresholds: normalizeAlertThresholds({}),
    asOf
  });
  const dataSource = alerts.find((alert) => alert.ruleId === "errored-data-source");

  assert.equal(Boolean(dataSource), true);
  assert.equal(dataSource.actionCategory, "Review");
  assert.match(dataSource.title, /Market data provider needs review/);
});
