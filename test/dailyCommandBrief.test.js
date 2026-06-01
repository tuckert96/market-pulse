import test from "node:test";
import assert from "node:assert/strict";
import { buildDailyCommandBrief, DAILY_BRIEF_GROUPS } from "../src/dailyCommandBrief.js";

const asOf = "2026-05-24T09:00:00-04:00";

const analysis = {
  overview: {
    totalValue: 100000,
    dailyChange: 1250,
    dailyChangePercent: 0.0125
  },
  holdings: [
    {
      ticker: "MU",
      name: "Micron",
      account: "Taxable",
      marketValue: 18000,
      portfolioWeight: 0.18,
      dailyChange: 900,
      dailyChangePercent: 0.05,
      nextEarnings: "2026-05-29",
      marketDataIsMock: true
    },
    {
      ticker: "SOXL",
      name: "SOXL",
      account: "Roth",
      marketValue: 14000,
      portfolioWeight: 0.14,
      dailyChange: -700,
      dailyChangePercent: -0.06,
      isLeveragedEtf: true
    },
    {
      ticker: "CASH",
      name: "Cash",
      account: "Brokerage",
      marketValue: 68000,
      portfolioWeight: 0.68,
      dailyChange: 0,
      dailyChangePercent: 0
    }
  ],
  alerts: [
    {
      id: "alert:position-weight:MU",
      severity: "warning",
      actionCategory: "Review",
      title: "MU is above the position weight threshold",
      detail: "MU is 18.0% of the portfolio.",
      ticker: "MU",
      score: 88
    }
  ],
  dataQuality: { issues: [] }
};

test("daily command brief groups imported portfolio items by attention level", () => {
  const brief = buildDailyCommandBrief({
    analysis,
    tickerSignals: [
      {
        ticker: "MU",
        combinedScore: 84,
        explanation: "Momentum and ownership layers are elevated.",
        sourceLabel: "Sample/local confluence score",
        portfolioOwnershipFlag: true,
        sourceTrustCapReason: "Social and federal disclosure flow is capped until confirmed by market data, primary-source events, or thesis evidence."
      },
      { ticker: "NVDA", combinedScore: 72, explanation: "Watchlist signal only.", sourceLabel: "Sample/local confluence score", watchlistFlag: true }
    ],
    redditMentions: [
      { sourceId: "r-mu", ticker: "MU", extractedTickers: ["MU"], createdAt: asOf, detectedAt: asOf, subreddit: "stocks", title: "$MU mention", text: "$MU mention", score: 20, upvotes: 20, commentCount: 4, sentiment: "bullish" }
    ],
    politicianTrades: [
      { politicianName: "Demo Representative", ticker: "MU", assetName: "Micron", transactionType: "Purchase", recencyScore: 1, sizeScore: 0.8, clusterScore: 0.2, sourceMode: "mock" }
    ],
    targetPlan: {
      rows: [
        { scope: "ticker", key: "MU", currentWeight: 0.18, targetWeight: 0.1, driftWeight: 0.08, driftValue: 8000, suggestedAction: "Review trim" }
      ]
    },
    providerReadiness: { providerStatuses: {} },
    marketDataStatus: { status: "mock/sample mode", detail: "Sample market data only." },
    portfolioDataQuality: { status: "clean", message: "Usable import." },
    uiState: "IMPORTED_CLEAN",
    asOf
  });

  assert.equal(brief.statusLabel, "Imported");
  assert.equal(brief.summary.dailyMoveCoverage.eligibleCount, 2);
  assert.equal(brief.summary.dailyMoveCoverage.coveredCount, 2);
  assert.equal(brief.items.some((item) => item.id === "daily:ticker-signal:NVDA"), false);
  assert.ok(brief.groups[DAILY_BRIEF_GROUPS.ACTION].some((item) => item.title.includes("MU is above")));
  assert.ok(brief.groups[DAILY_BRIEF_GROUPS.ACTION].some((item) => item.title.includes("Largest target drift: MU")));
  assert.ok(brief.groups[DAILY_BRIEF_GROUPS.WATCH].some((item) => item.title.includes("SOXL is a top decliner")));
  assert.ok(brief.groups[DAILY_BRIEF_GROUPS.WATCH].some((item) => item.title.includes("upcoming earnings date")));
  assert.ok(brief.groups[DAILY_BRIEF_GROUPS.INFO].some((item) => item.title === "Portfolio value change"));
  assert.ok(brief.groups[DAILY_BRIEF_GROUPS.INFO].some((item) => item.title.includes("MU Reddit mentions accelerated") && item.dataStatus === "Sample Reddit"));
  assert.ok(brief.groups[DAILY_BRIEF_GROUPS.INFO].some((item) => item.title.includes("MU matched a disclosure row") && item.dataStatus === "Sample disclosure"));
  const signalItem = brief.groups[DAILY_BRIEF_GROUPS.WATCH].find((item) => item.id === "daily:ticker-signal:MU");
  assert.ok(signalItem);
  assert.match(signalItem.detail, /review-priority score, not a prediction/i);
  assert.match(signalItem.detail, /Source guardrail: Social and federal disclosure flow is capped/i);
  assert.match(signalItem.reason, /Social and federal disclosure flow stays low-trust/i);
  assert.ok(brief.items.every((item) => item.href.startsWith("#")));
});

test("daily command brief puts real social and disclosure updates in Watch, not Action", () => {
  const brief = buildDailyCommandBrief({
    analysis: { ...analysis, alerts: [] },
    tickerSignals: [],
    redditMentions: [
      {
        sourceId: "reddit-api-mu",
        ticker: "MU",
        extractedTickers: ["MU"],
        createdAt: asOf,
        detectedAt: asOf,
        subreddit: "stocks",
        title: "$MU volume thread",
        text: "$MU volume thread",
        score: 42,
        upvotes: 42,
        commentCount: 12,
        sentiment: "bullish",
        sourceMode: "api",
        providerId: "reddit-api",
        liveProviderCalls: true
      }
    ],
    politicianTrades: [
      {
        politicianName: "Representative Example",
        ticker: "MU",
        assetName: "Micron Technology",
        transactionType: "Purchase",
        recencyScore: 1,
        sizeScore: 0.9,
        clusterScore: 0.5,
        sourceMode: "public-static-dataset",
        providerId: "senate-stock-watcher-public-dataset",
        liveProviderCalls: true
      }
    ],
    targetPlan: { rows: [] },
    providerReadiness: { providerStatuses: {} },
    marketDataStatus: { status: "connected", label: "Live market data" },
    portfolioDataQuality: { status: "clean" },
    uiState: "IMPORTED_CLEAN",
    asOf
  });

  const redditItem = brief.items.find((item) => item.id === "daily:reddit:MU");
  const disclosureItem = brief.items.find((item) => item.id === "daily:politician:MU");
  assert.ok(redditItem);
  assert.ok(disclosureItem);
  assert.equal(redditItem.group, DAILY_BRIEF_GROUPS.WATCH);
  assert.equal(redditItem.dataStatus, "Live Reddit API");
  assert.equal(disclosureItem.group, DAILY_BRIEF_GROUPS.WATCH);
  assert.equal(disclosureItem.dataStatus, "Public disclosure dataset");
  assert.equal(brief.groups[DAILY_BRIEF_GROUPS.ACTION].some((item) => item.id === redditItem.id || item.id === disclosureItem.id), false);
  assert.doesNotMatch(JSON.stringify([redditItem, disclosureItem]), /\b(buy now|sell now|trade command|place order)\b/i);
});

test("daily command brief links source-labeled Market Drivers into the daily workflow", () => {
  const brief = buildDailyCommandBrief({
    analysis: { ...analysis, alerts: [] },
    tickerSignals: [],
    redditMentions: [],
    politicianTrades: [],
    targetPlan: { rows: [] },
    providerReadiness: { providerStatuses: {} },
    marketDataStatus: { status: "connected", label: "Live market data" },
    portfolioDataQuality: { status: "clean" },
    marketDrivers: {
      sourceStatus: "Live",
      broadMarket: {
        id: "broad-market",
        label: "Broader Market",
        direction: "down",
        directionLabel: "Down",
        moveLabel: "-0.72% average move across SPY, QQQ, DIA, IWM",
        summary: "Broad market is down with QQQ lagging SPY. Treat this as a source-labeled explanation, not a confirmed cause.",
        confidenceScore: 76,
        sourceStatus: "Live"
      },
      aiTech: {
        id: "ai-tech",
        label: "AI / Tech",
        direction: "up",
        directionLabel: "Up",
        moveLabel: "+1.42% average move across QQQ, SMH, NVDA, AMD",
        summary: "AI/tech is up as semiconductor proxies lead. Treat this as a source-labeled explanation, not a confirmed cause.",
        confidenceScore: 69,
        sourceStatus: "Cached"
      }
    },
    uiState: "IMPORTED_CLEAN",
    asOf
  });

  const broad = brief.items.find((item) => item.id === "daily:market-driver:broad-market");
  const aiTech = brief.items.find((item) => item.id === "daily:market-driver:ai-tech");
  assert.ok(broad);
  assert.ok(aiTech);
  assert.equal(broad.href, "#market-drivers");
  assert.equal(aiTech.href, "#market-drivers");
  assert.equal(broad.actionLabel, "Explain move");
  assert.equal(aiTech.dataStatus, "Cached");
  assert.equal(broad.group, DAILY_BRIEF_GROUPS.WATCH);
  assert.match(broad.reason, /source-labeled explanation/i);
  assert.doesNotMatch(JSON.stringify([broad, aiTech]), /\b(buy now|sell now|guaranteed|prediction)\b/i);
});

test("daily command brief is honest when history or live data is missing", () => {
  const brief = buildDailyCommandBrief({
    analysis: { ...analysis, alerts: [] },
    tickerSignals: [],
    redditMentions: [],
    politicianTrades: [],
    providerReadiness: { providerStatuses: { futureNews: { id: "future-news", configured: false, status: "not configured" } } },
    marketDataStatus: { status: "mock/sample mode", detail: "No live provider." },
    targetPlan: { rows: [] },
    portfolioDataQuality: { status: "clean" },
    uiState: "IMPORTED_WITH_SKIPPED_ROWS",
    asOf
  });

  const infoTitles = brief.groups[DAILY_BRIEF_GROUPS.INFO].map((item) => item.title);
  assert.ok(infoTitles.includes("Position weight change history is not stored yet"));
  assert.ok(infoTitles.includes("Market data not configured"));
  assert.ok(infoTitles.includes("Some provider paths are not configured"));
  assert.doesNotMatch(JSON.stringify(brief), /\b(buy now|sell now|guaranteed|prediction)\b/i);
});

test("daily command brief surfaces per-ticker market data coverage gaps", () => {
  const brief = buildDailyCommandBrief({
    analysis: { ...analysis, alerts: [] },
    tickerSignals: [],
    redditMentions: [],
    politicianTrades: [],
    targetPlan: { rows: [] },
    providerReadiness: { providerStatuses: {} },
    marketDataStatus: {
      status: "connected",
      label: "Live market data",
      quoteDiagnostics: [{
        ticker: "MU",
        coverageScore: 42,
        coverageQualityStatus: "thin",
        coverageQualityLabel: "Thin coverage 42/100",
        missingHistory: true,
        missingProfileOrMetrics: true,
        unavailableFields: ["historical candles", "company profile", "market cap"],
        confidenceWarnings: ["Missing historical candles; momentum and technical confidence are reduced."]
      }]
    },
    portfolioDataQuality: { status: "clean" },
    uiState: "IMPORTED_CLEAN",
    asOf
  });
  const item = brief.items.find((row) => row.id === "daily:market-coverage:MU");

  assert.ok(item);
  assert.equal(item.group, DAILY_BRIEF_GROUPS.WATCH);
  assert.equal(item.href, "#/ticker/MU");
  assert.match(item.title, /MU market data coverage is thin/i);
  assert.match(item.detail, /Thin coverage 42\/100/);
  assert.match(item.reason, /confidence/i);
});

test("daily command brief explains missing position movement coverage", () => {
  const brief = buildDailyCommandBrief({
    analysis: {
      overview: { totalValue: 42000, dailyChange: 0, dailyChangePercent: 0 },
      holdings: [
        { ticker: "MU", name: "Micron", assetClass: "Equity", marketValue: 20000 },
        { ticker: "VTI", name: "Vanguard Total Market", assetClass: "ETF", marketValue: 22000 },
        { ticker: "SPAXX", name: "Cash", assetClass: "Cash", marketValue: 1000 }
      ],
      alerts: []
    },
    tickerSignals: [],
    redditMentions: [],
    politicianTrades: [],
    providerReadiness: { providerStatuses: {} },
    marketDataStatus: { status: "not configured", label: "Market data not configured" },
    targetPlan: { rows: [] },
    portfolioDataQuality: { status: "clean" },
    uiState: "IMPORTED_CLEAN",
    asOf
  });

  assert.equal(brief.summary.dailyMoveCoverage.eligibleCount, 2);
  assert.equal(brief.summary.dailyMoveCoverage.coveredCount, 0);
  assert.ok(brief.groups[DAILY_BRIEF_GROUPS.INFO].some((item) => item.id === "daily:movers:not-loaded"));
  assert.ok(brief.groups[DAILY_BRIEF_GROUPS.INFO].some((item) => item.id === "daily:data-coverage:daily-move" && item.detail.includes("MU, VTI")));
});

test("daily command brief keeps rate-limited market data visible", () => {
  const brief = buildDailyCommandBrief({
    analysis: { ...analysis, alerts: [] },
    tickerSignals: [],
    redditMentions: [],
    politicianTrades: [],
    providerReadiness: { providerStatuses: {} },
    marketDataStatus: {
      status: "rate limited",
      label: "Market data rate limited",
      detail: "Finnhub rate limit or quota response."
    },
    targetPlan: { rows: [] },
    portfolioDataQuality: { status: "clean" },
    uiState: "IMPORTED_CLEAN",
    asOf
  });

  const item = brief.items.find((row) => row.id === "daily:data-source:market-rate-limited");
  assert.ok(item);
  assert.equal(item.group, DAILY_BRIEF_GROUPS.ACTION);
  assert.equal(item.dataStatus, "Rate limited");
  assert.equal(brief.items.some((row) => row.id === "daily:data-source:market-mock"), false);
});

test("daily command brief pre-import state does not expose sample portfolio metrics as real", () => {
  const brief = buildDailyCommandBrief({
    analysis,
    marketDataStatus: { status: "mock/sample mode" },
    uiState: "SAMPLE_MODE",
    asOf
  });

  assert.equal(brief.statusLabel, "Sample");
  assert.equal(brief.summary.totalValue, 0);
  assert.ok(brief.groups[DAILY_BRIEF_GROUPS.ACTION].some((item) => item.title === "Sample data is loaded"));
  assert.ok(brief.items.every((item) => !item.detail.includes("$100,000")));
});

test("daily command brief treats partial and repaired imports as active local portfolios", () => {
  const partial = buildDailyCommandBrief({
    analysis,
    tickerSignals: [],
    redditMentions: [],
    politicianTrades: [],
    providerReadiness: { providerStatuses: {} },
    marketDataStatus: { status: "mock/sample mode" },
    targetPlan: { rows: [] },
    portfolioDataQuality: { status: "usable with warnings" },
    uiState: "IMPORTED_PARTIAL_REVIEW",
    asOf
  });
  const repaired = buildDailyCommandBrief({
    analysis,
    tickerSignals: [],
    redditMentions: [],
    politicianTrades: [],
    providerReadiness: { providerStatuses: {} },
    marketDataStatus: { status: "mock/sample mode" },
    targetPlan: { rows: [] },
    portfolioDataQuality: { status: "usable with warnings" },
    uiState: "STALE_PERSISTED_REPAIRED",
    asOf
  });

  assert.equal(partial.statusLabel, "Imported");
  assert.equal(partial.summary.totalValue, 100000);
  assert.ok(partial.groups[DAILY_BRIEF_GROUPS.INFO].some((item) => item.title === "Portfolio value change"));
  assert.equal(repaired.statusLabel, "Imported");
  assert.equal(repaired.summary.totalValue, 100000);
  assert.ok(repaired.groups[DAILY_BRIEF_GROUPS.INFO].some((item) => item.title === "Portfolio value change"));
});

test("daily command brief promotes source-labeled calendar events", () => {
  const brief = buildDailyCommandBrief({
    analysis: { ...analysis, alerts: [] },
    tickerSignals: [],
    redditMentions: [],
    politicianTrades: [],
    eventCalendar: [
      {
        id: "calendar:MU:earnings:2026-05-28:imported",
        ticker: "MU",
        tickers: ["MU"],
        eventType: "earnings",
        date: "2026-05-28",
        title: "MU imported earnings review",
        summary: "Imported calendar date, not live event data.",
        importance: "high",
        sourceMode: "imported",
        sourceLabel: "Imported calendar file",
        detectedAt: asOf
      }
    ],
    providerReadiness: { providerStatuses: {} },
    marketDataStatus: { status: "mock/sample mode" },
    targetPlan: { rows: [] },
    portfolioDataQuality: { status: "clean" },
    uiState: "IMPORTED_CLEAN",
    asOf
  });

  const calendarItem = brief.groups[DAILY_BRIEF_GROUPS.WATCH].find((item) => item.id.includes("calendar:MU"));
  assert.ok(calendarItem);
  assert.equal(calendarItem.dataStatus, "Imported calendar file");
  assert.equal(calendarItem.href, "#/ticker/MU");
  assert.doesNotMatch(calendarItem.detail, /live earnings/i);
});
