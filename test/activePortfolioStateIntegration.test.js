import test from "node:test";
import assert from "node:assert/strict";
import { buildAlphaSignals, demoAlphaEvents, demoThesisProfiles } from "../src/alphaEngine.js";
import { buildLocalAlerts, normalizeAlertThresholds } from "../src/alertsEngine.js";
import { buildDailyCommandBrief } from "../src/dailyCommandBrief.js";
import { buildPortfolioEvents, defaultCalendarEvents } from "../src/eventCalendar.js";
import {
  applyMarketDataToHoldings,
  buildMarketDataSnapshot,
  buildMarketDataStatus,
  buildMockMarketDataSnapshot
} from "../src/marketDataProvider.js";
import { analyzePortfolio } from "../src/portfolioAnalytics.js";
import { buildPortfolioDataQualitySummary } from "../src/portfolioDataQuality.js";
import { tuckerDemoHoldings } from "../src/portfolioDemoData.js";
import { buildPortfolioStatus } from "../src/portfolioState.js";
import { buildRankedAlphaHoldingRows, buildTickerDetailModel, portfolioImportSourceStatus } from "../src/portfolioView.js";
import { buildAlphaRecommendations, filterAlphaRecommendations } from "../src/recommendationEngine.js";
import { demoPoliticianTrades } from "../src/politicianTrades.js";
import { demoRedditMentions } from "../src/redditSignals.js";
import { buildSignalReviewRows } from "../src/signalReview.js";
import { buildTargetAllocationPlan, defaultTargetAllocations } from "../src/targetAllocations.js";
import { buildThesisRows } from "../src/thesisTracker.js";
import { buildCombinedTickerSignals } from "../src/tickerSignals.js";
import { simulateWhatIf } from "../src/whatIfSimulator.js";
import {
  buildWatchlistIdeaRows,
  defaultWatchlistIdeas,
  watchlistIdeaTickers
} from "../src/watchlistIdeas.js";

await import("../src/dataAdapters.js");

const adapters = globalThis.DataAdapters;
const asOf = "2026-05-24T10:00:00-04:00";

function buildWorkflow(records, uiState = "IMPORTED_CLEAN") {
  const tickers = records.map((record) => record.ticker).filter(Boolean);
  const marketDataSnapshot = buildMockMarketDataSnapshot([...new Set([...tickers, "QQQ"])], { asOf });
  const holdings = applyMarketDataToHoldings(records, marketDataSnapshot);
  const baseAnalysis = analyzePortfolio(holdings);
  const marketDataStatus = buildMarketDataStatus(marketDataSnapshot);
  const thesisRows = buildThesisRows(baseAnalysis.holdings, demoThesisProfiles(), { asOf });
  const targetPlan = buildTargetAllocationPlan(baseAnalysis.holdings, defaultTargetAllocations(), { asOf });
  const alphaSignals = buildAlphaSignals(demoAlphaEvents(), baseAnalysis.holdings, demoThesisProfiles());
  const redditMentions = demoRedditMentions({ asOf });
  const politicianTrades = demoPoliticianTrades({ asOf });
  const tickerSignals = buildCombinedTickerSignals({
    holdings: baseAnalysis.holdings,
    redditMentions,
    politicianTrades,
    alphaSignals,
    marketDataSnapshot,
    watchlist: ["MU", "NVDA", "AMD", "SOXL", "UPRO", "VGT", "CRDO", "QQQ"],
    uiState,
    asOf
  });
  const watchlistIdeaRows = buildWatchlistIdeaRows({
    watchlistIdeas: defaultWatchlistIdeas(asOf),
    holdings: baseAnalysis.holdings,
    tickerSignals,
    thesisRows,
    marketDataSnapshot,
    asOf
  });
  const providerReadiness = { providerStatuses: {}, liveProviderCalls: false };
  const localAlerts = buildLocalAlerts({
    analysis: baseAnalysis,
    tickerSignals,
    politicianTrades,
    redditMentions,
    providerReadiness,
    marketDataStatus,
    targetPlan,
    thresholds: normalizeAlertThresholds({}),
    watchlist: watchlistIdeaTickers(watchlistIdeaRows),
    asOf
  });
  const analysis = { ...baseAnalysis, alerts: [...baseAnalysis.alerts, ...localAlerts] };
  const calendarEvents = buildPortfolioEvents({
    calendarEvents: defaultCalendarEvents(asOf),
    holdings: analysis.holdings,
    watchlistIdeas: watchlistIdeaRows,
    thesisRows,
    asOf
  });
  const dailyBrief = buildDailyCommandBrief({
    analysis,
    tickerSignals,
    redditMentions,
    politicianTrades,
    providerReadiness,
    marketDataStatus,
    targetPlan,
    thesisRows,
    eventCalendar: calendarEvents,
    portfolioDataQuality: { status: "clean" },
    uiState,
    asOf
  });
  const signalReviewRows = buildSignalReviewRows({
    tickerSignals,
    marketDataSnapshot,
    holdings: analysis.holdings,
    redditMentions,
    politicianTrades,
    marketEvents: [],
    alphaSignals
  });
  const alphaRecommendations = buildAlphaRecommendations({
    analysis: { ...analysis, alerts: [] },
    alphaSignals,
    tickerSignals,
    alerts: [],
    targetPlan,
    thesisRows,
    watchlistIdeas: watchlistIdeaRows,
    calendarEvents,
    marketDataStatus,
    providerReadiness,
    uiState,
    asOf
  });

  return {
    analysis,
    marketDataSnapshot,
    marketDataStatus,
    thesisRows,
    targetPlan,
    tickerSignals,
    watchlistIdeaRows,
    calendarEvents,
    dailyBrief,
    signalReviewRows,
    alphaRecommendations,
    localAlerts
  };
}

test("imported CSV portfolio powers major derived screens from one active source", () => {
  const csv = `Account,Symbol,Description,Quantity,Last Price,Current Value,Total Cost Basis
Taxable,MU,Micron,10,$100.00,$1000.00,$750.00
Roth IRA,NVDA,Nvidia,5,$900.00,$4500.00,$3000.00
HSA,SPAXX,Fidelity Government Money Market,2000,$1.00,$2000.00,$2000.00
Fidelity footer row,,,,,,`;
  const importResult = adapters.buildImportResult({ fidelityCsv: csv, fidelityFileName: "tucker-import.csv" });
  const importReport = { ...importResult.importReport, realPortfolioImport: true, importedAt: asOf };
  const portfolioStatus = buildPortfolioStatus({
    holdings: importResult.records,
    latestImportReport: importReport,
    fidelityStatus: { mode: "csv-import" },
    asOf
  });
  const workflow = buildWorkflow(importResult.records, portfolioStatus.uiState);
  const muPage = buildTickerDetailModel(workflow.analysis, {
    selectedTicker: "MU",
    marketDataSnapshot: workflow.marketDataSnapshot,
    marketDataStatus: workflow.marketDataStatus,
    thesisRows: workflow.thesisRows,
    tickerSignals: workflow.tickerSignals,
    allWatchlistIdeaRows: workflow.watchlistIdeaRows,
    allCalendarEvents: workflow.calendarEvents,
    uiState: portfolioStatus.uiState,
    asOf
  });
  const whatIf = simulateWhatIf({
    holdings: workflow.analysis.holdings,
    scenario: { type: "trim-dollar", ticker: "MU", amount: 250 },
    targetAllocations: defaultTargetAllocations(),
    thresholds: normalizeAlertThresholds({})
  });
  const sourceStatus = portfolioImportSourceStatus(importReport, portfolioStatus);
  const quality = buildPortfolioDataQualitySummary(workflow.analysis, importReport);

  assert.equal(portfolioStatus.activePortfolio, true);
  assert.equal(portfolioStatus.realPortfolio, true);
  assert.ok(workflow.analysis.holdings.some((holding) => holding.ticker === "MU"));
  assert.ok(workflow.dailyBrief.summary.totalValue > 0);
  assert.ok(workflow.dailyBrief.items.some((item) => item.href === "#/ticker/MU" || item.href === "#holdings"));
  assert.ok(workflow.localAlerts.length > 0);
  assert.ok(workflow.signalReviewRows.some((row) => row.ticker === "MU" && row.portfolioOwnershipFlag));
  assert.equal(muPage.owned, true);
  assert.equal(muPage.accounts[0].account, "Taxable");
  assert.equal(whatIf.status, "ready");
  assert.equal(sourceStatus.label, "Imported");
  assert.ok(quality.holdingCount >= 3);
});

test("legacy single-account Fidelity export becomes the active imported portfolio across derived screens", () => {
  const csv = [
    "Symbol,Description,Qty (Quantity),Mkt Val (Market Value),Day Chng $ (Day Change $),Day Chng % (Day Change %),Cost Basis,Gain $ (Gain/Loss $),Gain % (Gain/Loss %),Ratings,Reinvest?,Reinvest Capital Gains?,% of Acct (% of Account),Div Yld (Dividend Yield),Security Type",
    'MU,Micron Technology Inc,10,"$1,045.00",$12.50,1.21%,$750.00,$295.00,39.33%,--,No,No,20.00%,--,Stock',
    'NVDA,NVIDIA Corp,2,"$1,900.00",$10.00,0.53%,$1,200.00,$700.00,58.33%,--,No,No,36.00%,--,Stock',
    'Cash & Cash Investments,--,--,"$7,811.05",$0.00,0%,--,--,--,--,--,--,44.00%,--,Cash and Money Market',
    'Account Total,--,--,"$10,756.05",$22.50,0.21%,$1,950.00,$995.00,51.03%,--,--,--,--,--,--'
  ].join("\n");
  const importResult = adapters.buildImportResult({
    fidelityCsv: csv,
    fidelityFileName: "Contributory-Positions-2025-10-02-081120.csv"
  });
  const importReport = { ...importResult.importReport, realPortfolioImport: true, importedAt: asOf };
  const portfolioStatus = buildPortfolioStatus({
    holdings: importResult.records,
    latestImportReport: importReport,
    fidelityStatus: { mode: "csv-imported", fileName: "Contributory-Positions-2025-10-02-081120.csv" },
    asOf
  });
  const workflow = buildWorkflow(importResult.records, portfolioStatus.uiState);
  const nvdaPage = buildTickerDetailModel(workflow.analysis, {
    selectedTicker: "NVDA",
    marketDataSnapshot: workflow.marketDataSnapshot,
    marketDataStatus: workflow.marketDataStatus,
    thesisRows: workflow.thesisRows,
    tickerSignals: workflow.tickerSignals,
    allWatchlistIdeaRows: workflow.watchlistIdeaRows,
    allCalendarEvents: workflow.calendarEvents,
    uiState: portfolioStatus.uiState,
    asOf
  });
  const sourceStatus = portfolioImportSourceStatus(importReport, portfolioStatus);

  assert.equal(importResult.validation.ok, true);
  assert.equal(importResult.importReport.health.status, "Imported with skipped non-holding rows");
  assert.equal(portfolioStatus.realPortfolio, true);
  assert.equal(portfolioStatus.uiState, "IMPORTED_WITH_SKIPPED_ROWS");
  assert.deepEqual(importResult.importReport.accountsDetected, ["Contributory"]);
  assert.equal(workflow.analysis.holdings.every((holding) => holding.account === "Contributory"), true);
  assert.equal(workflow.analysis.overview.totalValue > 10000, true);
  assert.equal(workflow.dailyBrief.statusLabel, "Imported");
  assert.ok(workflow.dailyBrief.items.some((item) => item.href === "#/ticker/NVDA" || item.href === "#holdings"));
  assert.ok(workflow.localAlerts.length > 0);
  assert.ok(workflow.alphaRecommendations.some((recommendation) => recommendation.ticker === "NVDA" || recommendation.ticker === "MU"));
  assert.equal(nvdaPage.owned, true);
  assert.equal(nvdaPage.accounts[0].account, "Contributory");
  assert.equal(sourceStatus.status, "Imported with 1 skipped non-holding row");
  assert.equal(sourceStatus.label, "Imported");
  assert.match(sourceStatus.status, /skipped non-holding row/i);
});

test("imported JSON portfolio powers the same workflow without stale CSV assumptions", () => {
  const holdingsJson = JSON.stringify([
    { account: "Brokerage", ticker: "AMD", company: "Advanced Micro Devices", shares: 20, price: 150, marketValue: 3000, costBasis: 2200 },
    { account: "Brokerage", ticker: "CASH", company: "Cash", shares: 1500, price: 1, marketValue: 1500, costBasis: 1500, type: "Cash" }
  ]);
  const importResult = adapters.buildImportResult({ fidelityJson: holdingsJson, fidelityFileName: "holdings.json" });
  const portfolioStatus = buildPortfolioStatus({
    holdings: importResult.records,
    latestImportReport: { ...importResult.importReport, realPortfolioImport: true, importedAt: asOf },
    fidelityStatus: { mode: "json-import" },
    asOf
  });
  const workflow = buildWorkflow(importResult.records, portfolioStatus.uiState);
  const amdPage = buildTickerDetailModel(workflow.analysis, {
    selectedTicker: "AMD",
    marketDataSnapshot: workflow.marketDataSnapshot,
    marketDataStatus: workflow.marketDataStatus,
    tickerSignals: workflow.tickerSignals,
    allWatchlistIdeaRows: workflow.watchlistIdeaRows,
    allCalendarEvents: workflow.calendarEvents,
    uiState: portfolioStatus.uiState,
    asOf
  });

  assert.equal(portfolioStatus.realPortfolio, true);
  assert.equal(workflow.analysis.holdings.some((holding) => holding.ticker === "AMD"), true);
  assert.equal(workflow.dailyBrief.statusLabel, "Imported");
  assert.equal(amdPage.owned, true);
  assert.equal(amdPage.watchlistOnly, false);
});

test("live market data marks imported holdings to market across portfolio views", () => {
  const records = [
    { ticker: "MU", name: "Micron", account: "Taxable", shares: 10, price: 100, marketValue: 1000, sector: "Semiconductors", assetClass: "Equity" }
  ];
  const marketDataSnapshot = buildMarketDataSnapshot({
    provider: { id: "finnhub", label: "Finnhub", mode: "live-ready", configured: true, liveProviderCalls: true },
    requestedTickers: ["MU"],
    asOf,
    now: asOf,
    quotes: [{ ticker: "MU", price: 200, previousClose: 190, dailyChange: 10, dailyChangePercent: 0.0526315789, providerId: "finnhub", providerLabel: "Finnhub", liveProviderCalls: true }]
  });
  const holdings = applyMarketDataToHoldings(records, marketDataSnapshot, { dailyChangeMode: "replace" });
  const analysis = analyzePortfolio(holdings);
  const marketDataStatus = buildMarketDataStatus(marketDataSnapshot);
  const tickerSignals = buildCombinedTickerSignals({ holdings: analysis.holdings, marketDataSnapshot, uiState: "IMPORTED_CLEAN", asOf });
  const alphaRows = buildRankedAlphaHoldingRows(analysis.holdings, [], tickerSignals, "all", "IMPORTED_CLEAN");
  const muPage = buildTickerDetailModel(analysis, {
    selectedTicker: "MU",
    marketDataSnapshot,
    marketDataStatus,
    tickerSignals,
    uiState: "IMPORTED_CLEAN",
    asOf
  });

  assert.equal(analysis.overview.totalValue, 2000);
  assert.equal(analysis.holdings[0].marketValue, 2000);
  assert.equal(alphaRows[0].marketValue, 2000);
  assert.equal(muPage.displayPrice, 200);
  assert.equal(muPage.marketValue, 2000);
});

test("foreign imported portfolio does not promote default sample tickers into portfolio brief or alerts", () => {
  const csv = `Account,Symbol,Description,Quantity,Current Price,Market Value,Cost Basis
Taxable,XYZ,Imported Industrial Holding,10,100,1000,750
Taxable,CASH,Cash,500,1,500,500`;
  const importResult = adapters.buildImportResult({ fidelityCsv: csv, fidelityFileName: "foreign-import.csv" });
  const portfolioStatus = buildPortfolioStatus({
    holdings: importResult.records,
    latestImportReport: { ...importResult.importReport, realPortfolioImport: true, importedAt: asOf },
    fidelityStatus: { mode: "csv-import" },
    asOf
  });
  const workflow = buildWorkflow(importResult.records, portfolioStatus.uiState);
  const defaultTickers = ["MU", "NVDA", "AMD", "SOXL", "UPRO", "VGT", "CRDO"];

  assert.equal(portfolioStatus.realPortfolio, true);
  assert.equal(workflow.analysis.holdings.some((holding) => holding.ticker === "XYZ"), true);
  assert.equal(workflow.dailyBrief.items.some((item) => defaultTickers.includes(item.ticker) && item.kind === "ticker-signal"), false);
  assert.equal(workflow.localAlerts.some((alert) => defaultTickers.includes(alert.ticker) && alert.type === "ticker-signal"), false);
});

test("sample and reset states cannot leak real portfolio metrics or stale ownership", () => {
  const sampleStatus = buildPortfolioStatus({
    holdings: tuckerDemoHoldings(),
    latestImportReport: null,
    fidelityStatus: { mode: "sample-demo" },
    asOf
  });
  const sampleWorkflow = buildWorkflow(tuckerDemoHoldings(), sampleStatus.uiState);
  const sampleTicker = buildTickerDetailModel(sampleWorkflow.analysis, {
    selectedTicker: "MU",
    marketDataSnapshot: sampleWorkflow.marketDataSnapshot,
    marketDataStatus: sampleWorkflow.marketDataStatus,
    tickerSignals: sampleWorkflow.tickerSignals,
    allWatchlistIdeaRows: sampleWorkflow.watchlistIdeaRows,
    allCalendarEvents: sampleWorkflow.calendarEvents,
    uiState: sampleStatus.uiState,
    asOf
  });
  const emptyStatus = buildPortfolioStatus({ holdings: [], latestImportReport: null, fidelityStatus: {}, asOf });
  const emptyWorkflow = buildWorkflow([], emptyStatus.uiState);
  const emptyTicker = buildTickerDetailModel(emptyWorkflow.analysis, {
    selectedTicker: "MU",
    marketDataSnapshot: { quotesByTicker: {}, status: { status: "not configured" } },
    marketDataStatus: { status: "not configured" },
    tickerSignals: [],
    allWatchlistIdeaRows: [],
    allCalendarEvents: [],
    asOf
  });

  assert.equal(sampleStatus.uiState, "SAMPLE_MODE");
  assert.equal(sampleStatus.realPortfolio, false);
  assert.equal(sampleWorkflow.dailyBrief.summary.totalValue, 0);
  assert.equal(sampleWorkflow.dailyBrief.statusLabel, "Sample");
  assert.equal(sampleTicker.owned, false);
  assert.equal(sampleTicker.samplePosition, true);
  assert.equal(sampleTicker.positionSource, "Sample");
  assert.equal(sampleWorkflow.tickerSignals.some((row) => row.samplePortfolioFlag), true);
  assert.equal(sampleWorkflow.tickerSignals.some((row) => row.portfolioOwnershipFlag), false);
  assert.equal(filterAlphaRecommendations(sampleWorkflow.alphaRecommendations, "owned").length, 0);
  assert.equal(sampleWorkflow.alphaRecommendations.some((row) => row.relatedHoldingsStatus === "sample"), true);
  assert.equal(sampleWorkflow.alphaRecommendations.flatMap((row) => row.whyThisRank || []).some((item) => /sample portfolio/i.test(item)), true);
  assert.equal(emptyStatus.uiState, "NO_DATA");
  assert.equal(emptyStatus.activePortfolio, false);
  assert.equal(emptyWorkflow.analysis.holdings.length, 0);
  assert.equal(emptyWorkflow.localAlerts.some((alert) => ["position-weight", "sector-concentration", "leveraged-exposure"].includes(alert.type)), false);
  assert.equal(emptyWorkflow.dailyBrief.summary.totalValue, 0);
  assert.equal(emptyTicker.owned, false);
  assert.equal(emptyTicker.watchlistOnly, false);
  assert.equal(emptyTicker.externallyDiscovered, true);
  assert.equal(emptyTicker.marketValue, 0);
});
