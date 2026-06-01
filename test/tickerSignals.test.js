import test from "node:test";
import assert from "node:assert/strict";
import { buildMarketDataSnapshot, buildMockMarketDataSnapshot } from "../src/marketDataProvider.js";
import {
  buildCombinedTickerSignals,
  scoreConcentrationRisk,
  scoreRedditMentionAcceleration,
  scoreRedditMentions,
  scoreRelativeStrengthPlaceholder,
  summarizePoliticianTrades
} from "../src/tickerSignals.js";

const asOf = "2026-05-23T12:00:00-04:00";

test("combined ticker signal formula weights price, Reddit, politician, and thesis placeholders with source-trust caps", () => {
  const [signal] = buildCombinedTickerSignals({
    holdings: [{
      ticker: "MU",
      marketValue: 1000,
      portfolioWeight: 0.1,
      dailyChange: 50,
      thesisStatus: "Active",
      riskLevel: "Medium",
      quant: 4.5
    }],
    redditMentions: [{
      id: "reddit-mu-1",
      sourceId: "reddit-mu-1",
      ticker: "MU",
      createdAt: asOf,
      detectedAt: asOf,
      engagementScore: 100,
      sentiment: "bullish"
    }],
    politicianTrades: [{
      ticker: "MU",
      transactionType: "purchase",
      recencyScore: 1,
      sizeScore: 0.5
    }],
    watchlist: ["MU"],
    asOf
  });

  assert.equal(signal.ticker, "MU");
  assert.equal(signal.priceMomentumPlaceholder, 0.8);
  assert.equal(signal.redditMentionScore, 0.501);
  assert.equal(signal.politicianBuyScore, 0.8);
  assert.equal(signal.politicianSellScore, 0);
  assert.equal(signal.politicianSignalScore, 0.9);
  assert.equal(signal.thesisRiskFundamentalPlaceholder, 0.72);
  assert.equal(signal.relativeStrengthScore, 0.9);
  assert.equal(signal.redditMentionAccelerationScore, 0.615);
  assert.equal(signal.redditSentimentScore, 0.74);
  assert.equal(signal.politicianActivityScore, 0.803);
  assert.equal(signal.ownershipWatchlistScore, 0.82);
  assert.equal(signal.thesisConvictionRiskScore, 0.368);
  assert.equal(signal.concentrationRiskScore, 0.465);
  assert.equal(signal.rawConfluenceScore, 0.718);
  assert.equal(signal.sourceTrustCap, 0.68);
  assert.match(signal.sourceTrustCapReason, /Social and federal disclosure flow is capped/);
  assert.equal(signal.confluenceScore, 0.68);
  assert.equal(signal.combinedScore, 68);
  assert.equal(signal.reviewPriorityScore, 68);
  assert.equal(signal.reviewPriorityScoreKind, "review-priority-not-quality");
  assert.equal(signal.scoreMeaning.includes("not a quality score"), true);
  assert.equal(signal.holdingQualityScore >= 0 && signal.holdingQualityScore <= 100, true);
  assert.equal(signal.holdingQualityScoreKind, "quality-context-not-review-priority");
  assert.equal(signal.institutionalQuantModelVersion, "institutional-quant-lens-v1.3");
  assert.equal(signal.institutionalQuantScore >= 0 && signal.institutionalQuantScore <= 100, true);
  assert.equal(signal.institutionalQuantEvidenceCapScore <= 100, true);
  assert.ok(Array.isArray(signal.institutionalQuantEvidenceCapReasons));
  assert.equal(signal.institutionalQuantAcademicModelVersion, "academic-factor-discipline-v1");
  assert.equal(signal.institutionalQuantAcademicCompositeScore >= 0 && signal.institutionalQuantAcademicCompositeScore <= 100, true);
  assert.ok(signal.institutionalQuantAcademicFactors.some((factor) => factor.key === "validationDiscipline"));
  assert.ok(signal.institutionalQuantAcademicValidationWarnings.some((warning) => /multiple-testing|skip-period|history/i.test(warning)));
  assert.equal(signal.stockPredictionModelVersion, "transparent-stock-prediction-v1");
  assert.equal(signal.stockPredictionHorizon, "20 trading days");
  assert.ok(signal.stockPredictionScore >= 0 && signal.stockPredictionScore <= 100);
  assert.ok(signal.stockPredictionConfidence >= 0 && signal.stockPredictionConfidence <= 100);
  assert.ok(Array.isArray(signal.stockPredictionFactors));
  assert.match(signal.stockPredictionGuardrail, /not a calibrated probability/i);
  assert.equal(signal.institutionalQuantSecurityKind, "operating-company");
  assert.equal(signal.institutionalQuantFactorCoverage.quality, "thin");
  assert.ok(signal.institutionalQuantExplanation.includes("MU"));
  assert.ok(signal.institutionalQuantMissingData.includes("historical price series"));
  assert.equal(signal.portfolioOwnershipFlag, true);
  assert.equal(signal.watchlistFlag, true);
  assert.equal(signal.actionCategory, "Log Only");
  assert.ok(signal.whyScoreIsHigh.includes("recent politician disclosure activity"));
  assert.ok(signal.missingData.includes("live market quote and history"));
  assert.ok(signal.warnings.some((warning) => /federal disclosure flow is capped/i.test(warning)));
  assert.ok(signal.formulaLabel.includes("Review priority formula"));
  assert.ok(signal.formulaLabel.includes("Quality context is reported separately"));
});

test("politician sale score offsets buy score without becoming a sell command", () => {
  const rows = buildCombinedTickerSignals({
    holdings: [{ ticker: "AMD", marketValue: 1000, portfolioWeight: 0.05, dailyChange: 0, thesisStatus: "Active", riskLevel: "High" }],
    politicianTrades: [{
      ticker: "AMD",
      transactionType: "sale",
      recencyScore: 1,
      sizeScore: 0.5
    }],
    watchlist: ["AMD"],
    asOf
  });
  const amd = rows.find((row) => row.ticker === "AMD");

  assert.equal(amd.politicianBuyScore, 0);
  assert.equal(amd.politicianSellScore, 0.8);
  assert.equal(amd.politicianSignalScore, 0.1);
  assert.match(amd.actionCategory, /Log Only|Ignore|Monitor/);
  assert.doesNotMatch(amd.actionCategory, /buy|sell|trade|enter|exit/i);
  assert.doesNotMatch(amd.nextCheck, /buy|sell|trade|enter|exit/i);
});

test("Reddit and politician helper scores are bounded and transparent", () => {
  const redditScore = scoreRedditMentions({
    ticker: "NVDA",
    oneDayMentions: 10,
    sevenDayMentions: 20,
    totalEngagement: 999,
    sentiment: "bullish"
  });
  const politician = summarizePoliticianTrades([
    { ticker: "NVDA", transactionType: "purchase", recencyScore: 1, sizeScore: 1 },
    { ticker: "NVDA", transactionType: "sale", recencyScore: 0.5, sizeScore: 0.5 }
  ]).get("NVDA");

  assert.equal(redditScore, 0.98);
  assert.equal(scoreRedditMentionAcceleration({
    ticker: "NVDA",
    oneDayMentions: 2,
    sevenDayMentions: 5,
    mentionAcceleration: 1
  }), 0.925);
  assert.equal(politician.buyScore, 1);
  assert.equal(politician.sellScore, 0.5);
});

test("relative strength and concentration risk are bounded review inputs", () => {
  assert.equal(scoreRelativeStrengthPlaceholder({ marketValue: 1000, dailyChange: 20 }, null, 0), 0.66);
  assert.equal(scoreRelativeStrengthPlaceholder(null, { dailyChangePercent: -0.02 }, 0.01), 0.26);
  assert.equal(scoreConcentrationRisk({ marketValue: 1000, portfolioWeight: 0.18, riskLevel: "High" }), 0.726);
  assert.equal(scoreConcentrationRisk({ marketValue: 1000, portfolioWeight: 0.04, riskLevel: "Low", isLeveragedEtf: true }), 0.42);
});

test("score explanation separates high-score reasons, missing data, and mock provenance", () => {
  const [signal] = buildCombinedTickerSignals({
    holdings: [{ ticker: "SOXL", marketValue: 5000, portfolioWeight: 0.18, dailyChange: 100, thesisStatus: "Needs review", riskLevel: "Very High", isLeveragedEtf: true }],
    redditMentions: [{ id: "r-soxl", sourceId: "r-soxl", ticker: "SOXL", createdAt: asOf, detectedAt: asOf, engagementScore: 80, sentiment: "mixed" }],
    politicianTrades: [{ ticker: "SOXL", transactionType: "sale", recencyScore: 1, sizeScore: 0.6 }],
    watchlist: ["SOXL"],
    asOf
  });

  assert.ok(signal.explanation.includes("SOXL"));
  assert.ok(signal.whyScoreIsHigh.some((reason) => /concentration|leverage/i.test(reason)));
  assert.ok(signal.missingData.includes("live market quote and history"));
  assert.ok(signal.dataModeDetails.includes("no live provider calls"));
  assert.doesNotMatch(signal.nextCheck, /buy|sell|trade|enter|exit/i);
});

test("combined ticker signals preserve mock provenance and conservative confidence", () => {
  const [signal] = buildCombinedTickerSignals({
    holdings: [{ ticker: "CRDO", marketValue: 500, portfolioWeight: 0.02, dailyChange: 25, thesisStatus: "Missing thesis", riskLevel: "High" }],
    redditMentions: [{ id: "r-crdo", sourceId: "r-crdo", ticker: "CRDO", createdAt: asOf, detectedAt: asOf, engagementScore: 50, sentiment: "bullish" }],
    watchlist: ["CRDO"],
    asOf
  });

  assert.equal(signal.mockData, true);
  assert.equal(signal.sourceMode, "mock-local-only");
  assert.equal(signal.liveProviderCalls, false);
  assert.equal(signal.evidenceGrade, "D");
  assert.equal(signal.confidenceScore <= 0.45, true);
  assert.ok(signal.warnings.some((warning) => /Market data not configured/i.test(warning)));
});

test("combined ticker signals do not promote Reddit-only false-positive tickers", () => {
  const rows = buildCombinedTickerSignals({
    holdings: [{ ticker: "MU", marketValue: 500, portfolioWeight: 0.02, dailyChange: 0, thesisStatus: "Active", riskLevel: "High" }],
    redditMentions: [
      { id: "r-ai", sourceId: "r-ai", ticker: "AI", createdAt: asOf, detectedAt: asOf, engagementScore: 500, sentiment: "bullish" },
      { id: "r-mu", sourceId: "r-mu", ticker: "MU", createdAt: asOf, detectedAt: asOf, engagementScore: 20, sentiment: "neutral" }
    ],
    watchlist: ["MU"],
    asOf
  });

  assert.equal(rows.some((row) => row.ticker === "AI"), false);
  assert.equal(rows.some((row) => row.ticker === "MU"), true);
});

test("combined ticker signals require Reddit-only tickers to be watchlisted", () => {
  const redditMentions = [{
    id: "r-pltr",
    sourceId: "r-pltr",
    ticker: "PLTR",
    createdAt: asOf,
    detectedAt: asOf,
    engagementScore: 80,
    sentiment: "bullish"
  }];
  const withoutWatchlist = buildCombinedTickerSignals({
    holdings: [{ ticker: "MU", marketValue: 500, portfolioWeight: 0.02, dailyChange: 0, thesisStatus: "Active", riskLevel: "Medium" }],
    redditMentions,
    watchlist: ["MU"],
    asOf
  });
  const withWatchlist = buildCombinedTickerSignals({
    holdings: [{ ticker: "MU", marketValue: 500, portfolioWeight: 0.02, dailyChange: 0, thesisStatus: "Active", riskLevel: "Medium" }],
    redditMentions,
    watchlist: ["MU", "PLTR"],
    asOf
  });
  const pltr = withWatchlist.find((row) => row.ticker === "PLTR");

  assert.equal(withoutWatchlist.some((row) => row.ticker === "PLTR"), false);
  assert.equal(Boolean(pltr), true);
  assert.equal(pltr.watchlistFlag, true);
  assert.equal(pltr.sourceCounts.reddit, 1);
  assert.equal(pltr.sourceTrustCap, 0.58);
  assert.equal(pltr.confluenceScore <= pltr.sourceTrustCap, true);
  assert.equal(pltr.combinedScore <= 58, true);
  assert.equal(pltr.confluenceScore >= 0 && pltr.confluenceScore <= 1, true);
  assert.equal(pltr.liveProviderCalls, false);
});

test("source trust cap lifts when social and federal disclosure flow has confirmed market context", () => {
  const [signal] = buildCombinedTickerSignals({
    holdings: [{
      ticker: "MU",
      marketValue: 1000,
      portfolioWeight: 0.1,
      dailyChange: 50,
      thesisStatus: "Active",
      riskLevel: "Medium"
    }],
    redditMentions: [{
      id: "reddit-mu-1",
      sourceId: "reddit-mu-1",
      ticker: "MU",
      createdAt: asOf,
      detectedAt: asOf,
      engagementScore: 100,
      sentiment: "bullish"
    }],
    politicianTrades: [{
      ticker: "MU",
      transactionType: "purchase",
      recencyScore: 1,
      sizeScore: 0.5
    }],
    marketEvents: [{
      id: "event-mu",
      title: "Company event confirms MU context",
      affectedTickers: ["MU"]
    }],
    watchlist: ["MU"],
    asOf
  });

  assert.equal(signal.ticker, "MU");
  assert.equal(signal.sourceTrustCap, 1);
  assert.equal(signal.sourceTrustCapReason, "");
  assert.equal(signal.confluenceScore, signal.rawConfluenceScore);
  assert.equal(signal.combinedScore, Math.round(signal.rawConfluenceScore * 100));
});

test("combined ticker signals include mock market data context without claiming live data", () => {
  const marketDataSnapshot = buildMockMarketDataSnapshot(["MU"], { asOf });
  const [signal] = buildCombinedTickerSignals({
    holdings: [{ ticker: "MU", marketValue: 1000, portfolioWeight: 0.02, thesisStatus: "Active", riskLevel: "Medium" }],
    marketDataSnapshot,
    watchlist: ["MU"],
    asOf
  });

  assert.equal(signal.ticker, "MU");
  assert.equal(signal.marketDataPrice, 132.1);
  assert.equal(signal.marketDataStatus, "mock/sample mode");
  assert.equal(signal.sourceCounts.marketData, 1);
  assert.equal(signal.liveProviderCalls, false);
  assert.ok(signal.topDrivers.some((driver) => driver.reason.includes("Sample Market Data")));
  assert.ok(signal.dataModeDetails.includes("sample market data"));
  assert.ok(signal.marketDataLabel.includes("Sample market data"));
});

test("combined ticker signals separate local scoring from live market data input", () => {
  const [signal] = buildCombinedTickerSignals({
    holdings: [{ ticker: "MU", marketValue: 1000, portfolioWeight: 0.02, thesisStatus: "Active", riskLevel: "Medium" }],
    marketDataSnapshot: {
      providerId: "financialModelingPrep",
      providerLabel: "Financial Modeling Prep",
      mode: "live",
      status: { status: "connected", label: "Live market data" },
      quotesByTicker: {
        MU: {
          ticker: "MU",
          price: 132,
          dailyChange: 2,
          dailyChangePercent: 0.015,
          volume: 1000,
          providerLabel: "Financial Modeling Prep",
          sourceMode: "live",
          isMock: false,
          liveProviderCalls: true
        }
      }
    },
    watchlist: ["MU"],
    asOf
  });

  assert.equal(signal.mockData, false);
  assert.equal(signal.sourceMode, "local-model-live-market-data");
  assert.equal(signal.sourceLabel, "Local confluence score with provider quote input");
  assert.equal(signal.liveProviderCalls, true);
  assert.ok(signal.dataModeDetails.includes("provider market data input"));
  assert.equal(signal.missingData.includes("live market quote and history"), false);
  assert.ok(signal.warnings.some((warning) => /Market quote input is live/i.test(warning)));
  assert.ok(signal.topDrivers.some((driver) =>
    driver.label === "Provider quote momentum" &&
    /server-side market data input/i.test(driver.reason) &&
    !/not a live price feed/i.test(driver.reason)
  ));
});

test("partial provider coverage lowers ticker signal confidence and names missing fields", () => {
  const fullSnapshot = buildMarketDataSnapshot({
    provider: { id: "finnhub", label: "Finnhub", mode: "live", configured: true, liveProviderCalls: true },
    requestedTickers: ["MU"],
    asOf,
    now: asOf,
    quotes: [{
      ticker: "MU",
      name: "Micron Technology, Inc.",
      price: 132,
      dailyChange: 2,
      dailyChangePercent: 0.015,
      volume: 1000,
      averageVolume: 900,
      marketCap: 150_000_000_000,
      sector: "Semiconductors",
      industry: "Memory",
      fiftyTwoWeekHigh: 150,
      fiftyTwoWeekLow: 80,
      historicalPrices: [{ date: "2026-05-22", close: 130 }, { date: "2026-05-23", close: 132 }],
      providerLabel: "Finnhub",
      sourceMode: "live",
      liveProviderCalls: true,
      resourceFreshness: { quote: "live", profile: "live", metric: "live", history: "live" }
    }]
  });
  const partialSnapshot = buildMarketDataSnapshot({
    provider: { id: "finnhub", label: "Finnhub", mode: "live", configured: true, liveProviderCalls: true },
    requestedTickers: ["MU"],
    asOf,
    now: asOf,
    quotes: [{
      ticker: "MU",
      name: "MU",
      price: 132,
      dailyChange: 2,
      dailyChangePercent: 0.015,
      providerLabel: "Finnhub",
      sourceMode: "live",
      liveProviderCalls: true,
      resourceFreshness: { quote: "live", profile: "missing", metric: "missing", history: "missing" }
    }]
  });
  const [full] = buildCombinedTickerSignals({
    holdings: [{ ticker: "MU", marketValue: 1000, portfolioWeight: 0.02, thesisStatus: "Active", riskLevel: "Medium" }],
    marketDataSnapshot: fullSnapshot,
    watchlist: ["MU"],
    asOf
  });
  const [partial] = buildCombinedTickerSignals({
    holdings: [{ ticker: "MU", marketValue: 1000, portfolioWeight: 0.02, thesisStatus: "Active", riskLevel: "Medium" }],
    marketDataSnapshot: partialSnapshot,
    watchlist: ["MU"],
    asOf
  });

  assert.equal(full.marketDataCoverageScore, 100);
  assert.equal(partial.marketDataCoverageScore < full.marketDataCoverageScore, true);
  assert.equal(partial.confidenceScore < full.confidenceScore, true);
  assert.ok(partial.marketDataCoverageWarnings.some((warning) => /momentum and technical confidence|quality and fundamental confidence/i.test(warning)));
  assert.ok(partial.missingData.some((item) => /historical candles|provider profile\/fundamental fields|quality and fundamental confidence/i.test(item)));
  assert.ok(partial.institutionalQuantMissingData.some((item) => /provider historical candles|provider profile\/fundamental fields|historical price series/i.test(item)));
  assert.ok(partial.warnings.some((warning) => /confidence/i.test(warning)));
});

test("combined ticker signals preserve academic quant inputs from holdings", () => {
  const [signal] = buildCombinedTickerSignals({
    holdings: [{
      ticker: "QUAL",
      name: "Quality Test Co",
      marketValue: 2500,
      portfolioWeight: 0.04,
      dailyChange: 0,
      thesisStatus: "Active",
      riskLevel: "Medium",
      profitabilityGrade: "B",
      growthGrade: "B",
      momentumGrade: "B",
      valuationGrade: "B",
      grossProfit: 400,
      totalAssets: 1000,
      bookToMarket: 0.42,
      earningsYield: 0.06,
      cashFlowYield: 0.05,
      historicalPriceSource: "imported-fixture",
      historicalPriceFrequency: "monthly",
      historicalPrices: Array.from({ length: 13 }, (_, index) => ({
        date: new Date(Date.UTC(2025, index, 1)).toISOString().slice(0, 10),
        close: 50 + index * 2
      }))
    }],
    watchlist: ["QUAL"],
    asOf
  });
  const quality = signal.institutionalQuantFactors.find((factor) => factor.key === "quality");
  const momentum = signal.institutionalQuantFactors.find((factor) => factor.key === "momentum");

  assert.equal(quality.details.grossProfitToAssets, 0.4);
  assert.equal(quality.missingData.includes("gross profits/assets"), false);
  assert.equal(Number.isFinite(momentum.details.skipPeriodReturnPct), true);
  assert.match(momentum.details.momentumLookback, /formation ending/i);
  assert.equal(momentum.missingData.includes("12-1 / skip-period momentum history"), false);
  assert.equal(signal.institutionalQuantAcademicModelVersion, "academic-factor-discipline-v1");
  assert.ok(signal.institutionalQuantAcademicFactors.some((factor) => factor.key === "profitabilityQuality"));
  assert.ok(signal.institutionalQuantAcademicResearchAnchors.some((anchor) => /Novy-Marx/i.test(anchor)));
  assert.ok(Array.isArray(signal.institutionalQuantAcademicValidationWarnings));
});
