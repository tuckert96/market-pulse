import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  LOCAL_DATA_CONTRACT_VERSION,
  parseLocalDataFixtureJson,
  validateLocalDataBundle
} from "../src/localDataContracts.js";

test("local data fixture validates future integration contracts", () => {
  const { fixture, parseError } = parseLocalDataFixtureJson(readFileSync("data/local-data-fixtures.json", "utf8"));
  const result = validateLocalDataBundle(fixture);

  assert.equal(parseError, null);
  assert.equal(fixture.schemaVersion, LOCAL_DATA_CONTRACT_VERSION);
  assert.equal(result.ok, true, result.errors.join("; "));
  assert.equal(result.counts.accounts >= 2, true);
  assert.equal(result.counts.holdings >= 2, true);
  assert.equal(result.counts.watchlist >= 2, true);
  assert.equal(result.counts.decisionJournal >= 1, true);
  assert.equal(result.counts.eventCalendar >= 1, true);
  assert.equal(result.counts.tickerSignals >= 1, true);
  assert.equal(result.counts.marketDataQuotes >= 1, true);
  assert.equal(result.counts.redditMentions >= 1, true);
  assert.equal(result.counts.politicianTrades >= 1, true);
  assert.equal(result.counts.seekingAlphaAiRecords >= 1, true);
  assert.equal(result.counts.alerts >= 1, true);
  assert.equal(result.counts.dataSources >= 3, true);
});

test("local data contract accepts optional compact quant score history", () => {
  const fixture = JSON.parse(readFileSync("data/local-data-fixtures.json", "utf8"));
  fixture.quantScoreHistory = [{
    schemaVersion: 1,
    ticker: fixture.holdings[0].ticker,
    date: "2026-05-23",
    timestamp: "2026-05-23T12:00:00-04:00",
    modelVersion: "institutional-quant-lens-v1.3",
    scoreKind: "stock-quality-decision-support",
    securityKind: "operating-company",
    portfolioMode: "imported",
    score: 72,
    rawScore: 74,
    confidenceScore: 65,
    dataCoverageScore: 68,
    peerGroup: "Technology",
    peerRank: 2,
    peerCount: 4,
    label: "Constructive setup",
    sourceFreshness: "Cached market data input"
  }];

  const result = validateLocalDataBundle(fixture);

  assert.equal(result.ok, true, result.errors.join("; "));
});

test("TypeScript data contracts name paper-backed quant plumbing fields", () => {
  const contract = readFileSync("src/dataContracts.ts", "utf8");

  [
    "grossProfitToAssets",
    "grossProfit",
    "totalAssets",
    "bookToMarket",
    "earningsYield",
    "cashFlowYield",
    "momentumLookbackMonths",
    "momentumSkipMonths",
    "historicalPriceSource",
    "institutionalQuantAcademicCompositeScore",
    "institutionalQuantAcademicFactors",
    "institutionalQuantAcademicValidationWarnings",
    "institutionalQuantAcademicResearchAnchors",
    "SeekingAlphaAiRecord",
    "SeekingAlphaAiSourceType",
    "extractedBullishPoints",
    "credentialMaterialStored"
  ].forEach((field) => {
    assert.match(contract, new RegExp(field === "SeekingAlphaAiRecord" || field === "SeekingAlphaAiSourceType" ? `\\b${field}\\b` : `\\b${field}\\??:`), `${field} should be part of the local data contract`);
  });
});

test("local data contracts reject malformed provider-shaped rows", () => {
  const result = validateLocalDataBundle({
    schemaVersion: LOCAL_DATA_CONTRACT_VERSION,
    generatedAt: "2026-05-23T12:00:00-04:00",
    accounts: [{ id: "", name: "Missing ID", type: "Taxable", provider: "csv" }],
    holdings: [{ ticker: "", name: "No ticker", account: "Taxable", shares: "bad", marketValue: -5 }],
    watchlist: [{ ticker: "MU", status: "urgent", thesis: "", sourceOfIdea: "", conviction: "Certain" }],
    decisionJournal: [{ ticker: "", decisionType: "execute", thesisNote: "", conviction: "Certain", executionStatus: "executed" }],
    eventCalendar: [{ ticker: "", tickers: [], eventType: "earnings-ish", date: "", title: "", importance: "urgent", sourceMode: "scraped", sourceLabel: "", detectedAt: "" }],
    tickerSignals: [{
      id: "bad-signal",
      ticker: "MU",
      headline: "Bad",
      summary: "Bad",
      sourceType: "news",
      sourceIds: [],
      affectedTickers: ["MU"],
      eventType: "demo",
      thesisImpact: "supports thesis",
      actionCategory: "Monitor",
      evidenceGrade: "Z",
      materialityScore: 1.2,
      confidenceScore: 0.4,
      priorityScore: 0.4
    }],
    marketDataQuotes: [{
      id: "bad-quote",
      ticker: "MU",
      name: "Micron",
      price: "bad",
      previousClose: 130,
      dailyChange: "bad",
      dailyChangePercent: 0.01,
      providerId: "",
      providerLabel: "Mock",
      source: "mock",
      sourceMode: "mock",
      isMock: true,
      liveProviderCalls: false,
      asOf: ""
    }],
    redditMentions: [{
      id: "bad-reddit",
      ticker: "MU",
      subreddit: "stocks",
      sourceUrl: "https://reddit.com/example",
      text: "Bad",
      extractedTickers: [],
      sentiment: "bullish",
      credibilityScore: 0.3,
      score: -1,
      upvotes: -1,
      commentCount: -1,
      engagementScore: 1,
      isRumor: "yes",
      citesPrimarySource: false
    }],
    politicianTrades: [{
      id: "bad-trade",
      ticker: "NVDA",
      politicianName: "Demo",
      office: "U.S. House",
      transactionType: "purchase",
      amountRange: { min: 20000, max: 1000 },
      disclosedAt: "2026-05-21",
      sourceUrl: "https://example.test",
      sourceType: "rumor",
      confidenceScore: 0.5
    }],
    seekingAlphaAiRecords: [{
      id: "",
      ticker: "",
      tickers: "MU",
      sourceType: "scraped_page",
      sourceMode: "cookie_session",
      responseText: "",
      extractedBullishPoints: "bullish",
      extractedBearishPoints: [],
      extractedFinancialMetrics: [],
      citedSourceLabels: [],
      reportDate: "",
      importedAt: "",
      freshnessStatus: "live",
      validationWarnings: [],
      redactionWarnings: [],
      rawTextTruncated: false,
      liveProviderCalls: false,
      credentialMaterialStored: true
    }],
    alerts: [{ id: "bad-alert", type: "risk", severity: "urgent", title: "", detail: "Bad", score: 1, status: "active" }],
    dataSources: [{ id: "bad-source", name: "Bad", type: "api", status: "live", liveEnabled: false, sourceTypes: [], warnings: [] }]
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("accounts[0].id")));
  assert.ok(result.errors.some((error) => error.includes("holdings[0].id")));
  assert.ok(result.errors.some((error) => error.includes("holdings[0].ticker")));
  assert.ok(result.errors.some((error) => error.includes("holdings[0].accountType")));
  assert.ok(result.errors.some((error) => error.includes("holdings[0].price")));
  assert.ok(result.errors.some((error) => error.includes("holdings[0].sector")));
  assert.ok(result.errors.some((error) => error.includes("holdings[0].assetClass")));
  assert.ok(result.errors.some((error) => error.includes("holdings[0].source")));
  assert.ok(result.errors.some((error) => error.includes("holdings[0].sourceAsOf")));
  assert.ok(result.errors.some((error) => error.includes("watchlist[0].id")));
  assert.ok(result.errors.some((error) => error.includes("watchlist[0].status")));
  assert.ok(result.errors.some((error) => error.includes("watchlist[0].thesis")));
  assert.ok(result.errors.some((error) => error.includes("watchlist[0].sourceOfIdea")));
  assert.ok(result.errors.some((error) => error.includes("watchlist[0].dateAdded")));
  assert.ok(result.errors.some((error) => error.includes("watchlist[0].conviction")));
  assert.ok(result.errors.some((error) => error.includes("decisionJournal[0].id")));
  assert.ok(result.errors.some((error) => error.includes("decisionJournal[0].ticker")));
  assert.ok(result.errors.some((error) => error.includes("decisionJournal[0].decisionType")));
  assert.ok(result.errors.some((error) => error.includes("decisionJournal[0].thesisNote")));
  assert.ok(result.errors.some((error) => error.includes("decisionJournal[0].executionStatus")));
  assert.ok(result.errors.some((error) => error.includes("eventCalendar[0].eventType")));
  assert.ok(result.errors.some((error) => error.includes("eventCalendar[0].date")));
  assert.ok(result.errors.some((error) => error.includes("eventCalendar[0].importance")));
  assert.ok(result.errors.some((error) => error.includes("eventCalendar[0].sourceMode")));
  assert.ok(result.errors.some((error) => error.includes("eventCalendar[0] must include ticker")));
  assert.ok(result.errors.some((error) => error.includes("tickerSignals[0].evidenceGrade")));
  assert.ok(result.errors.some((error) => error.includes("tickerSignals[0].detectedAt")));
  assert.ok(result.errors.some((error) => error.includes("marketDataQuotes[0].price")));
  assert.ok(result.errors.some((error) => error.includes("marketDataQuotes[0].dailyChange")));
  assert.ok(result.errors.some((error) => error.includes("marketDataQuotes[0].providerId")));
  assert.ok(result.errors.some((error) => error.includes("marketDataQuotes[0].asOf")));
  assert.ok(result.errors.some((error) => error.includes("redditMentions[0].isRumor")));
  assert.ok(result.errors.some((error) => error.includes("redditMentions[0].detectedAt")));
  assert.ok(result.errors.some((error) => error.includes("redditMentions[0].sourceId")));
  assert.ok(result.errors.some((error) => error.includes("redditMentions[0].createdAt")));
  assert.ok(result.errors.some((error) => error.includes("redditMentions[0].score")));
  assert.ok(result.errors.some((error) => error.includes("amountRange min cannot exceed max")));
  assert.ok(result.errors.some((error) => error.includes("politicianTrades[0].sourceType")));
  assert.ok(result.errors.some((error) => error.includes("seekingAlphaAiRecords[0].id")));
  assert.ok(result.errors.some((error) => error.includes("seekingAlphaAiRecords[0].sourceType")));
  assert.ok(result.errors.some((error) => error.includes("seekingAlphaAiRecords[0].credentialMaterialStored must be false")));
  assert.ok(result.errors.some((error) => error.includes("alerts[0].severity")));
  assert.ok(result.errors.some((error) => error.includes("alerts[0].title")));
  assert.ok(result.errors.some((error) => error.includes("dataSources[0].status")));
  assert.ok(result.errors.some((error) => error.includes("dataSources[0].trustLevel")));
});

test("local data contract rejects malformed quant score history when present", () => {
  const fixture = JSON.parse(readFileSync("data/local-data-fixtures.json", "utf8"));
  fixture.quantScoreHistory = [{
    ticker: "",
    date: "",
    timestamp: "",
    modelVersion: "",
    securityKind: "stock",
    portfolioMode: "live-real-ish",
    score: 140
  }];

  const result = validateLocalDataBundle(fixture);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("quantScoreHistory[0].ticker")));
  assert.ok(result.errors.some((error) => error.includes("quantScoreHistory[0].securityKind")));
  assert.ok(result.errors.some((error) => error.includes("quantScoreHistory[0].portfolioMode")));
  assert.ok(result.errors.some((error) => error.includes("quantScoreHistory[0].score")));
});
