import test from "node:test";
import assert from "node:assert/strict";
import { buildLocalAlerts } from "../src/alertsEngine.js";
import { buildAlphaSignals, demoAlphaEvents, demoThesisProfiles } from "../src/alphaEngine.js";
import { buildPortfolioEvents, defaultCalendarEvents } from "../src/eventCalendar.js";
import { buildMockMarketDataSnapshot } from "../src/marketDataProvider.js";
import { analyzePortfolio } from "../src/portfolioAnalytics.js";
import { tuckerDemoHoldings } from "../src/portfolioDemoData.js";
import {
  buildAlphaRecommendations,
  filterAlphaRecommendations,
  recommendationRankBreakdown,
  RECOMMENDATION_RANK_WEIGHTS,
  scoreRecommendationRank
} from "../src/recommendationEngine.js";
import { buildTargetAllocationPlan, defaultTargetAllocations } from "../src/targetAllocations.js";
import { buildThesisRows } from "../src/thesisTracker.js";
import { buildCombinedTickerSignals } from "../src/tickerSignals.js";
import { defaultWatchlistIdeas } from "../src/watchlistIdeas.js";

const asOf = "2026-05-23T12:00:00-04:00";

function recommendationFixture() {
  const holdings = analyzePortfolio(tuckerDemoHoldings()).holdings;
  const marketDataSnapshot = buildMockMarketDataSnapshot(["MU", "NVDA", "AMD", "SOXL", "UPRO", "VGT", "CRDO", "QQQ"], { asOf });
  const analysis = analyzePortfolio(holdings);
  const alphaSignals = buildAlphaSignals(demoAlphaEvents(), analysis.holdings, demoThesisProfiles());
  const targetPlan = buildTargetAllocationPlan(analysis.holdings, defaultTargetAllocations());
  const thesisRows = buildThesisRows(analysis.holdings, demoThesisProfiles(), { targetPlan, alphaSignals, totalValue: analysis.overview.totalValue, asOf });
  const watchlistIdeas = defaultWatchlistIdeas(asOf);
  const calendarEvents = buildPortfolioEvents({
    calendarEvents: defaultCalendarEvents(asOf),
    holdings: analysis.holdings,
    watchlistIdeas,
    thesisRows,
    asOf
  });
  const tickerSignals = buildCombinedTickerSignals({
    holdings: analysis.holdings,
    alphaSignals,
    marketDataSnapshot,
    watchlist: ["MU", "NVDA", "AMD", "SOXL", "UPRO", "VGT", "CRDO", "QQQ"],
    asOf
  });
  const alerts = buildLocalAlerts({
    analysis,
    tickerSignals,
    marketDataStatus: marketDataSnapshot.status,
    asOf
  });
  return { analysis, alphaSignals, tickerSignals, alerts, targetPlan, thesisRows, watchlistIdeas, calendarEvents, marketDataSnapshot };
}

test("recommendation rank formula is weighted, bounded, and transparent", () => {
  assert.equal(RECOMMENDATION_RANK_WEIGHTS.confidenceScore, 0.22);
  assert.equal(RECOMMENDATION_RANK_WEIGHTS.sourceFreshnessScore, 0.04);
  assert.equal(RECOMMENDATION_RANK_WEIGHTS.priceMovementScore, 0.03);
  const score = scoreRecommendationRank({
    confidenceScore: 0.8,
    impactScore: 0.7,
    recencyScore: 0.6,
    urgencyScore: 0.5,
    dataQualityScore: 0.9,
    riskAdjustedFitScore: 0.4,
    sourceFreshness: "recent"
  });
  const breakdown = recommendationRankBreakdown({
    confidenceScore: 0.8,
    impactScore: 0.7,
    recencyScore: 0.6,
    urgencyScore: 0.5,
    dataQualityScore: 0.9,
    riskAdjustedFitScore: 0.4,
    sourceFreshness: "recent"
  });

  assert.equal(score, 63);
  assert.equal(breakdown.finalScore, 63);
  assert.ok(breakdown.components.some((component) => component.key === "confidenceScore" && component.points > 17));
  assert.ok(breakdown.topContributors.length > 0);
  assert.equal(scoreRecommendationRank({
    confidenceScore: 0.8,
    impactScore: 0.7,
    recencyScore: 0.6,
    urgencyScore: 0.5,
    dataQualityScore: 0.2,
    riskAdjustedFitScore: 0.4,
    sourceFreshness: "stale"
  }), 46);
});

test("alpha recommendations generate ranked decision-support rows from existing data", () => {
  const fixture = recommendationFixture();
  const recommendations = buildAlphaRecommendations({
    ...fixture,
    marketDataStatus: fixture.marketDataSnapshot.status,
    uiState: "IMPORTED_WITH_SKIPPED_ROWS",
    asOf
  });

  assert.ok(recommendations.length >= 8);
  assert.equal(recommendations.every((row) => row.compositeRankScore >= 0 && row.compositeRankScore <= 100), true);
  assert.equal([...recommendations].sort((a, b) => b.compositeRankScore - a.compositeRankScore).map((row) => row.id).join("|"), recommendations.map((row) => row.id).join("|"));
  assert.ok(recommendations.some((row) => row.id === "recommendation:alpha:alpha-samsung-strike-mu" && row.ticker === "MU"));
  assert.ok(recommendations.some((row) => row.recommendationType === "review position" || row.recommendationType === "trim risk"));
  assert.ok(recommendations.some((row) => row.recommendationType === "stale data review"));
  assert.ok(recommendations.every((row) => Array.isArray(row.whyThisRank) && row.whyThisRank.length > 0));
  assert.ok(recommendations.every((row) => Number.isFinite(row.ownershipRelevanceScore)));
  assert.ok(recommendations.every((row) => Number.isFinite(row.sourceFreshnessScore)));
  assert.ok(recommendations.every((row) => Number.isFinite(row.priceMovementScore)));
  assert.ok(recommendations.every((row) => Number.isFinite(row.concentrationRiskScore)));
  assert.ok(recommendations.some((row) => (row.supportingSignals || []).some((text) => /Institutional Quant Lens \d+\/100/.test(text))));
});

test("owned, watchlist, risk, opportunity, data issue, recent, and high-confidence filters work", () => {
  const fixture = recommendationFixture();
  const recommendations = buildAlphaRecommendations({
    ...fixture,
    marketDataStatus: fixture.marketDataSnapshot.status,
    uiState: "IMPORTED_CLEAN",
    asOf
  });

  assert.ok(filterAlphaRecommendations(recommendations, "owned").every((row) => row.relatedHoldingsStatus === "owned"));
  assert.ok(filterAlphaRecommendations(recommendations, "watchlist").every((row) => row.relatedHoldingsStatus === "watchlist"));
  assert.ok(filterAlphaRecommendations(recommendations, "risk").every((row) => row.riskScore >= 0.65 || ["trim risk", "possible exit/reduce", "review position", "stale data review"].includes(row.recommendationType)));
  assert.ok(filterAlphaRecommendations(recommendations, "opportunities").every((row) => ["possible add", "add to watchlist", "investigate", "watch"].includes(row.recommendationType)));
  assert.ok(filterAlphaRecommendations(recommendations, "data-issues").every((row) => row.recommendationType === "stale data review" || row.dataQualityScore < 0.45 || row.missingWeakSignals.length >= 2));
  assert.ok(filterAlphaRecommendations(recommendations, "recent").every((row) => row.recencyScore >= 0.72));
  assert.ok(filterAlphaRecommendations(recommendations, "high-confidence").every((row) => row.confidenceScore >= 0.68));
});

test("recommendation filters return exact matching categories instead of passing empty sets", () => {
  const rows = [
    { id: "owned", relatedHoldingsStatus: "owned", recommendationType: "review position", riskScore: 0.4, dataQualityScore: 0.8, missingWeakSignals: [], recencyScore: 0.6, confidenceScore: 0.5 },
    { id: "watchlist", relatedHoldingsStatus: "watchlist", recommendationType: "possible add", riskScore: 0.2, dataQualityScore: 0.8, missingWeakSignals: [], recencyScore: 0.6, confidenceScore: 0.5 },
    { id: "risk", relatedHoldingsStatus: "owned", recommendationType: "trim risk", riskScore: 0.8, dataQualityScore: 0.8, missingWeakSignals: [], recencyScore: 0.6, confidenceScore: 0.5 },
    { id: "data", relatedHoldingsStatus: "portfolio", recommendationType: "stale data review", riskScore: 0.3, dataQualityScore: 0.3, missingWeakSignals: ["missing live quote", "stale cache"], recencyScore: 0.6, confidenceScore: 0.5 },
    { id: "recent", relatedHoldingsStatus: "signal-only", recommendationType: "watch", riskScore: 0.3, dataQualityScore: 0.8, missingWeakSignals: [], recencyScore: 0.9, confidenceScore: 0.5 },
    { id: "confidence", relatedHoldingsStatus: "signal-only", recommendationType: "investigate", riskScore: 0.3, dataQualityScore: 0.8, missingWeakSignals: [], recencyScore: 0.6, confidenceScore: 0.8 }
  ];

  assert.deepEqual(filterAlphaRecommendations(rows, "owned").map((row) => row.id), ["owned", "risk"]);
  assert.deepEqual(filterAlphaRecommendations(rows, "watchlist").map((row) => row.id), ["watchlist"]);
  assert.deepEqual(filterAlphaRecommendations(rows, "risk").map((row) => row.id), ["owned", "risk", "data"]);
  assert.deepEqual(filterAlphaRecommendations(rows, "opportunities").map((row) => row.id), ["watchlist", "recent", "confidence"]);
  assert.deepEqual(filterAlphaRecommendations(rows, "data-issues").map((row) => row.id), ["data"]);
  assert.deepEqual(filterAlphaRecommendations(rows, "recent").map((row) => row.id), ["recent"]);
  assert.deepEqual(filterAlphaRecommendations(rows, "high-confidence").map((row) => row.id), ["confidence"]);
  assert.deepEqual(filterAlphaRecommendations(rows, "not-a-filter").map((row) => row.id), rows.map((row) => row.id));
});

test("weak data cannot rank highly without a visible warning", () => {
  const fixture = recommendationFixture();
  const recommendations = buildAlphaRecommendations({
    ...fixture,
    alphaSignals: fixture.alphaSignals.filter((signal) => signal.id === "alpha-social-rumor-crdo"),
    tickerSignals: [],
    alerts: [],
    targetPlan: {},
    thesisRows: [],
    calendarEvents: [],
    marketDataStatus: { status: "not configured", detail: "No market data key." },
    uiState: "IMPORTED_CLEAN",
    asOf
  });
  const rumor = recommendations.find((row) => row.id === "recommendation:alpha:alpha-social-rumor-crdo");

  assert.ok(rumor);
  assert.equal(rumor.dataQualityScore < 0.45, true);
  assert.ok(rumor.compositeRankScore < 45);
  assert.ok(rumor.missingWeakSignals.some((item) => /Evidence quality|Customer identity|Company confirmation/i.test(item)));
  assert.ok(rumor.whyThisRank.some((item) => /Lower confidence|missing|stale|mock|weak/i.test(item)));
});

test("watchlist-only high signal becomes a watchlist/opportunity recommendation, not owned", () => {
  const recommendations = buildAlphaRecommendations({
    analysis: { holdings: [] },
    alphaSignals: [],
    tickerSignals: [{
      id: "ticker-signal-pltr",
      ticker: "PLTR",
      combinedScore: 76,
      confidenceScore: 0.52,
      materialityScore: 0.45,
      concentrationRiskScore: 0.2,
      marketDataPrice: 20,
      sourceMode: "mock-local-only",
      marketDataMode: "mock",
      mockData: true,
      whyScoreIsHigh: ["accelerating Reddit mentions"],
      missingData: ["live market quote and history"],
      warnings: ["Sample/local score only"],
      topHeadline: "PLTR: mock Reddit attention detected",
      explanation: "Local watchlist signal."
    }],
    watchlistIdeas: [{ ticker: "PLTR", status: "watching" }],
    marketDataStatus: { status: "mock/sample mode" },
    asOf
  });
  const pltr = recommendations.find((row) => row.ticker === "PLTR");

  assert.ok(pltr);
  assert.equal(pltr.relatedHoldingsStatus, "watchlist");
  assert.equal(pltr.recommendationType, "watch");
  assert.ok(pltr.supportingSignals.some((item) => /review-priority score; not a quality score/i.test(item)));
  assert.doesNotMatch(pltr.summary, /\bbuy\b|\bsell\b|guaranteed/i);
});

test("ticker recommendations expose source-trust caps for social and federal disclosure flow", () => {
  const recommendations = buildAlphaRecommendations({
    analysis: { holdings: [] },
    alphaSignals: [],
    tickerSignals: [{
      id: "ticker-signal-pltr",
      ticker: "PLTR",
      combinedScore: 58,
      rawConfluenceScore: 0.79,
      sourceTrustCap: 0.58,
      sourceTrustCapReason: "Social and federal disclosure flow is capped because this ticker is not an owned imported holding.",
      confidenceScore: 0.52,
      materialityScore: 0.45,
      concentrationRiskScore: 0.2,
      marketDataPrice: null,
      sourceCounts: { reddit: 4, politician: 1 },
      sourceMode: "mock-local-only",
      marketDataMode: "mock",
      mockData: true,
      whyScoreIsHigh: ["accelerating social attention", "recent federal disclosure activity"],
      missingData: ["live market quote and history"],
      warnings: ["Sample/local score only", "Social and federal disclosure flow is capped because this ticker is not an owned imported holding."],
      topHeadline: "PLTR: social/disclosure flow detected",
      explanation: "Local watchlist signal."
    }],
    watchlistIdeas: [{ ticker: "PLTR", status: "watching" }],
    marketDataStatus: { status: "mock/sample mode" },
    asOf
  });
  const pltr = recommendations.find((row) => row.ticker === "PLTR");

  assert.ok(pltr);
  assert.equal(pltr.relatedHoldingsStatus, "watchlist");
  assert.ok(pltr.supportingSignals.some((item) => /Source trust guardrail capped raw review-priority score 79\/100 to 58\/100/.test(item)));
  assert.ok(pltr.missingWeakSignals.some((item) => /not an owned imported holding/i.test(item)));
  assert.equal(pltr.dataQualityScore < 0.35, true);
  assert.ok(pltr.whyThisRank.some((item) => /Lower confidence/i.test(item)));
  assert.doesNotMatch(JSON.stringify(pltr), /\b(buy now|sell now|guaranteed|prediction)\b/i);
});

test("ticker quant quality context does not become recommendation rank urgency by itself", () => {
  const baseSignal = {
    id: "ticker-signal-pltr",
    ticker: "PLTR",
    combinedScore: 62,
    confidenceScore: 0.5,
    materialityScore: 0.45,
    concentrationRiskScore: 0.2,
    marketDataPrice: 20,
    marketDataDailyChangePercent: 0.002,
    marketDataStatus: "connected",
    marketDataMode: "live",
    sourceMode: "local-model-live-market-data",
    mockData: false,
    whyScoreIsHigh: ["watchlist relevance"],
    missingData: [],
    warnings: ["Not a recommendation to buy or sell"],
    topHeadline: "PLTR: review-priority baseline",
    explanation: "Local review-priority score."
  };
  const highQuality = buildAlphaRecommendations({
    analysis: { holdings: [] },
    tickerSignals: [{
      ...baseSignal,
      institutionalQuantScore: 96,
      holdingQualityScore: 96,
      holdingQualityLabel: "strong quality context"
    }],
    watchlistIdeas: [{ ticker: "PLTR", status: "watching" }],
    marketDataStatus: { status: "connected" },
    uiState: "IMPORTED_CLEAN",
    asOf
  }).find((row) => row.id === "recommendation:ticker-signal:PLTR");
  const weakQuality = buildAlphaRecommendations({
    analysis: { holdings: [] },
    tickerSignals: [{
      ...baseSignal,
      institutionalQuantScore: 18,
      holdingQualityScore: 18,
      holdingQualityLabel: "weak quality context"
    }],
    watchlistIdeas: [{ ticker: "PLTR", status: "watching" }],
    marketDataStatus: { status: "connected" },
    uiState: "IMPORTED_CLEAN",
    asOf
  }).find((row) => row.id === "recommendation:ticker-signal:PLTR");

  assert.ok(highQuality);
  assert.ok(weakQuality);
  assert.equal(highQuality.compositeRankScore, weakQuality.compositeRankScore);
  assert.equal(highQuality.riskAdjustedFitScore, weakQuality.riskAdjustedFitScore);
  assert.ok(highQuality.supportingSignals.some((item) => /quality context, not rank urgency/i.test(item)));
  assert.doesNotMatch(highQuality.summary, /\bbuy\b|\bsell\b|guaranteed/i);
});

test("provider price movement and active portfolio weight influence rank explanations", () => {
  const recommendations = buildAlphaRecommendations({
    analysis: {
      holdings: [
        { ticker: "MU", marketValue: 12000, portfolioWeight: 0.24, riskLevel: "High" },
        { ticker: "AMD", marketValue: 2000, portfolioWeight: 0.04, riskLevel: "Medium" }
      ]
    },
    tickerSignals: [
      {
        id: "ticker-signal-mu",
        ticker: "MU",
        combinedScore: 62,
        confidenceScore: 0.58,
        materialityScore: 0.64,
        concentrationRiskScore: 0.78,
        marketDataPrice: 132.1,
        marketDataDailyChangePercent: 0.041,
        marketDataSourceLabel: "Finnhub",
        marketDataStatus: "connected",
        marketDataMode: "live",
        sourceMode: "local-model-live-market-data",
        mockData: false,
        whyScoreIsHigh: ["provider-backed price momentum"],
        missingData: [],
        warnings: ["Not a recommendation to buy or sell"],
        topHeadline: "MU: provider-backed price move",
        explanation: "Local score with Finnhub quote context."
      },
      {
        id: "ticker-signal-amd",
        ticker: "AMD",
        combinedScore: 62,
        confidenceScore: 0.58,
        materialityScore: 0.64,
        concentrationRiskScore: 0.2,
        marketDataPrice: 164.5,
        marketDataDailyChangePercent: 0.002,
        marketDataSourceLabel: "Finnhub",
        marketDataStatus: "connected",
        marketDataMode: "live",
        sourceMode: "local-model-live-market-data",
        mockData: false,
        whyScoreIsHigh: ["provider quote available"],
        missingData: [],
        warnings: ["Not a recommendation to buy or sell"],
        topHeadline: "AMD: provider quote baseline",
        explanation: "Local score with Finnhub quote context."
      }
    ],
    marketDataStatus: { status: "connected", providerLabel: "Finnhub" },
    uiState: "IMPORTED_CLEAN",
    asOf
  });
  const mu = recommendations.find((row) => row.id === "recommendation:ticker-signal:MU");
  const amd = recommendations.find((row) => row.id === "recommendation:ticker-signal:AMD");

  assert.ok(mu);
  assert.ok(amd);
  assert.equal(mu.compositeRankScore > amd.compositeRankScore, true);
  assert.equal(mu.priceMovementScore > amd.priceMovementScore, true);
  assert.equal(mu.portfolioWeight, 0.24);
  assert.ok(mu.supportingSignals.some((item) => /Price move: \+4\.10% from Finnhub/.test(item)));
  assert.ok(mu.whyThisRank.some((item) => /24% of the active portfolio/.test(item)));
  assert.ok(mu.whyThisRank.some((item) => /Price movement/.test(item)));
  assert.ok(mu.whyThisRank.some((item) => /Concentration risk/.test(item)));
});

test("stale provider inputs lower source freshness and remain visible in why-this-rank", () => {
  const recommendations = buildAlphaRecommendations({
    analysis: { holdings: [{ ticker: "SOXL", marketValue: 8000, portfolioWeight: 0.16, riskLevel: "Very High", isLeveragedEtf: true }] },
    tickerSignals: [{
      id: "ticker-signal-soxl",
      ticker: "SOXL",
      combinedScore: 70,
      confidenceScore: 0.54,
      materialityScore: 0.8,
      concentrationRiskScore: 0.9,
      marketDataPrice: 52.8,
      marketDataDailyChangePercent: -0.032,
      marketDataSourceLabel: "Finnhub",
      marketDataStatus: "stale data",
      marketDataMode: "cached",
      sourceMode: "local-model-live-market-data",
      mockData: false,
      whyScoreIsHigh: ["leveraged concentration risk"],
      missingData: ["fresh market quote"],
      warnings: ["Stale provider data", "Not a recommendation to buy or sell"],
      topHeadline: "SOXL: stale provider context",
      explanation: "Local score with stale provider quote context."
    }],
    marketDataStatus: { status: "stale data", providerLabel: "Finnhub" },
    uiState: "IMPORTED_CLEAN",
    asOf
  });
  const soxl = recommendations.find((row) => row.id === "recommendation:ticker-signal:SOXL");

  assert.ok(soxl);
  assert.equal(soxl.sourceFreshness, "stale market data");
  assert.equal(soxl.sourceFreshnessScore < 0.45, true);
  assert.ok(soxl.missingWeakSignals.some((item) => /fresh market quote|Stale provider data/i.test(item)));
  assert.ok(soxl.whyThisRank.some((item) => /Lower rank because/i.test(item)));
});

test("partial Finnhub coverage lowers Alpha recommendation data quality and explains missing fields", () => {
  const recommendations = buildAlphaRecommendations({
    analysis: { holdings: [{ ticker: "MU", marketValue: 12000, portfolioWeight: 0.24, riskLevel: "Medium" }] },
    tickerSignals: [{
      id: "ticker-signal-mu",
      ticker: "MU",
      combinedScore: 72,
      confidenceScore: 0.54,
      materialityScore: 0.72,
      concentrationRiskScore: 0.42,
      marketDataPrice: 132.1,
      marketDataDailyChangePercent: 0.025,
      marketDataSourceLabel: "Finnhub",
      marketDataStatus: "connected",
      marketDataMode: "live",
      sourceMode: "local-model-live-market-data",
      mockData: false,
      marketDataCoverageScore: 42,
      marketDataCoverageLabel: "Thin coverage 42/100",
      marketDataCoverageWarnings: [
        "Missing historical candles; momentum and technical confidence are reduced.",
        "Missing company profile, market cap; quality and fundamental confidence are reduced."
      ],
      marketDataMissingFields: ["historical candles", "company profile", "market cap"],
      whyScoreIsHigh: ["provider-backed price momentum"],
      missingData: ["historical candles", "provider profile/fundamental fields"],
      warnings: ["Not a recommendation to buy or sell"],
      topHeadline: "MU: partial Finnhub coverage",
      explanation: "Local score with partial Finnhub context."
    }],
    marketDataStatus: { status: "connected", providerLabel: "Finnhub" },
    uiState: "IMPORTED_CLEAN",
    asOf
  });
  const mu = recommendations.find((row) => row.id === "recommendation:ticker-signal:MU");

  assert.ok(mu);
  assert.ok(mu.dataQualityScore < 0.62);
  assert.ok(mu.supportingSignals.some((item) => /Provider coverage: Thin coverage 42\/100/.test(item)));
  assert.ok(mu.missingWeakSignals.some((item) => /historical candles|Provider missing company profile/i.test(item)));
  assert.ok(mu.whyThisRank.some((item) => /provider coverage is incomplete/i.test(item)));
});

test("ticker-signal recency uses provider timestamps and penalizes missing timestamps", () => {
  const analysis = analyzePortfolio([
    { ticker: "MU", name: "Micron", account: "Taxable", shares: 10, price: 100, marketValue: 1000, assetClass: "Equity", sector: "Semiconductors" }
  ]);
  const baseSignal = {
    id: "ticker-signal-mu",
    ticker: "MU",
    combinedScore: 74,
    confidenceScore: 0.5,
    materialityScore: 0.7,
    portfolioOwnershipFlag: true,
    portfolioWeight: analysis.holdings[0].portfolioWeight,
    confluenceScore: 0.74,
    actionCategory: "Monitor",
    topHeadline: "provider recency test",
    explanation: "Test signal",
    marketDataStatus: "connected",
    marketDataMode: "live",
    sourceMode: "local-model-live-market-data",
    marketDataDailyChangePercent: 0.02,
    whyScoreIsHigh: [],
    missingData: [],
    warnings: []
  };

  const fresh = buildAlphaRecommendations({
    analysis,
    tickerSignals: [{ ...baseSignal, marketDataFetchedAt: "2026-05-23T11:55:00-04:00" }],
    uiState: "IMPORTED_CLEAN",
    asOf
  }).find((row) => row.id === "recommendation:ticker-signal:MU");
  const missing = buildAlphaRecommendations({
    analysis,
    tickerSignals: [baseSignal],
    uiState: "IMPORTED_CLEAN",
    asOf
  }).find((row) => row.id === "recommendation:ticker-signal:MU");

  assert.ok(fresh.recencyScore > 0.9);
  assert.ok(missing.recencyScore < 0.45);
  assert.ok(fresh.compositeRankScore > missing.compositeRankScore);
});
