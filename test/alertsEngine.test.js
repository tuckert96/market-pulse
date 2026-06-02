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

test("Seeking Alpha AI review alerts stay local, owned-holding scoped, and non-executory", () => {
  const analysis = analyzePortfolio([
    { ticker: "MU", name: "Micron", account: "Taxable", marketValue: 16000, costBasis: 10000, assetClass: "Equity", sector: "Semiconductors", sourceAsOf: asOf },
    { ticker: "CASH", name: "Cash", account: "Taxable", marketValue: 84000, assetClass: "Cash", sector: "Cash", sourceAsOf: asOf }
  ], { skipPortfolioThresholdAlerts: true });
  const alerts = buildLocalAlerts({
    analysis,
    seekingAlphaAiRecords: [
      {
        ticker: "MU",
        tickers: ["MU"],
        sourceType: "virtual_analyst_report",
        sourceMode: "pasted",
        reportDate: "2026-05-20",
        importedAt: asOf,
        responseText: "Virtual Analyst Report for MU. Bearish: memory pricing risk. Bullish: HBM demand.",
        extractedBearishPoints: ["memory pricing risk"],
        extractedBullishPoints: ["HBM demand"],
        freshnessStatus: "current",
        liveProviderCalls: false,
        credentialMaterialStored: false
      },
      {
        ticker: "PLTR",
        tickers: ["PLTR"],
        sourceType: "summary_report",
        sourceMode: "pasted",
        reportDate: "2026-05-20",
        importedAt: asOf,
        responseText: "Summary Report for PLTR. Bullish: software demand.",
        extractedBullishPoints: ["software demand"],
        freshnessStatus: "current",
        liveProviderCalls: false,
        credentialMaterialStored: false
      },
      {
        ticker: "MU",
        tickers: ["MU"],
        sourceType: "summary_report",
        sourceMode: "imported_file",
        reportDate: "2026-01-01",
        importedAt: asOf,
        responseText: "Summary Report for MU. Bearish: old pricing risk.",
        extractedBearishPoints: ["old pricing risk"],
        freshnessStatus: "stale",
        validationWarnings: ["Report is stale based on the imported or detected report date."],
        liveProviderCalls: false,
        credentialMaterialStored: false
      }
    ],
    thresholds: normalizeAlertThresholds({ maxPositionWeight: 1, maxSectorWeight: 1 }),
    marketDataStatus: { status: "connected" },
    asOf
  });
  const saAlerts = alerts.filter((alert) => alert.type.startsWith("seeking-alpha-ai"));

  assert.ok(saAlerts.some((alert) => alert.type === "seeking-alpha-ai-risk-context" && alert.ticker === "MU"));
  assert.equal(saAlerts.some((alert) => alert.ticker === "PLTR"), false);
  assert.ok(saAlerts.every((alert) => alert.sourceMode === "Imported Seeking Alpha AI"));
  assert.ok(saAlerts.every((alert) => alert.metadata?.sourceMode === "imported"));
  assert.ok(saAlerts.every((alert) => ["watch", "warning"].includes(alert.severity)));
  assert.ok(saAlerts.every((alert) => /review|source freshness|not a prediction|not a trade command|not a prediction or trade instruction/i.test(alert.detail)));
  assert.doesNotMatch(JSON.stringify(saAlerts), /\b(email|text|push|buy now|sell now|place order|guaranteed)\b/i);
});

test("target allocation drift alerts cover overweight and underweight rows", () => {
  const analysis = analyzePortfolio([
    { ticker: "MU", name: "Micron", account: "Taxable", marketValue: 1000, assetClass: "Equity", sector: "Semiconductors", sourceAsOf: asOf },
    { ticker: "NVDA", name: "Nvidia", account: "Roth", marketValue: 1000, assetClass: "Equity", sector: "Semiconductors", sourceAsOf: asOf }
  ], { skipPortfolioThresholdAlerts: true });
  const alerts = buildLocalAlerts({
    analysis,
    targetPlan: {
      rows: [
        { scope: "ticker", key: "MU", status: "overweight", currentWeight: 0.5, targetWeight: 0.3, driftWeight: 0.2, driftValue: 400, suggestedAction: "review trim" },
        { scope: "assetClass", key: "Cash", status: "underweight", currentWeight: 0.05, targetWeight: 0.15, driftWeight: -0.1, driftValue: -200, suggestedAction: "review add" },
        { scope: "ticker", key: "NVDA", status: "within range", currentWeight: 0.5, targetWeight: 0.5, driftWeight: 0, driftValue: 0, suggestedAction: "hold" }
      ]
    },
    thresholds: normalizeAlertThresholds({ minActionDrift: 0.05, maxPositionWeight: 1, maxSectorWeight: 1 }),
    marketDataStatus: { status: "connected" },
    asOf
  });
  const driftAlerts = alerts.filter((alert) => alert.type === "target-allocation-drift");

  assert.equal(driftAlerts.length, 2);
  assert.equal(driftAlerts.some((alert) => alert.ticker === "MU"), true);
  assert.equal(driftAlerts.some((alert) => alert.metadata.scope === "assetClass" && !alert.ticker), true);
  assert.ok(driftAlerts.every((alert) => alert.metadata.threshold === 0.05));
  assert.ok(driftAlerts.every((alert) => /Review the target plan/i.test(alert.detail)));
  assert.ok(driftAlerts.every((alert) => !/\b(buy now|sell now|trim now|add now|place order|guaranteed)\b/i.test(alert.detail)));
});

test("target drift threshold is configurable and balanced rows stay quiet", () => {
  const analysis = analyzePortfolio([
    { ticker: "MU", name: "Micron", account: "Taxable", marketValue: 1000, assetClass: "Equity", sector: "Semiconductors", sourceAsOf: asOf }
  ], { skipPortfolioThresholdAlerts: true });
  const targetPlan = {
    rows: [
      { scope: "ticker", key: "MU", status: "overweight", currentWeight: 0.13, targetWeight: 0.1, driftWeight: 0.03, driftValue: 300, suggestedAction: "review trim" },
      { scope: "strategySleeve", key: "Core index", status: "within range", currentWeight: 0.2, targetWeight: 0.2, driftWeight: 0, driftValue: 0, suggestedAction: "hold" }
    ]
  };
  const strictAlerts = buildLocalAlerts({
    analysis,
    targetPlan,
    thresholds: normalizeAlertThresholds({ minActionDrift: 0.05, maxPositionWeight: 1, maxSectorWeight: 1 }),
    marketDataStatus: { status: "connected" },
    asOf
  });
  const sensitiveAlerts = buildLocalAlerts({
    analysis,
    targetPlan,
    thresholds: normalizeAlertThresholds({ minActionDrift: 0.02, maxPositionWeight: 1, maxSectorWeight: 1 }),
    marketDataStatus: { status: "connected" },
    asOf
  });

  assert.equal(strictAlerts.some((alert) => alert.type === "target-allocation-drift"), false);
  assert.equal(sensitiveAlerts.some((alert) => alert.type === "target-allocation-drift"), true);
  assert.equal(sensitiveAlerts.some((alert) => alert.metadata.scope === "strategySleeve"), false);
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
