import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildLocalAlerts, normalizeAlertThresholds } from "../src/alertsEngine.js";
import { applyAlertState, hideAlert, markAlertReviewed } from "../src/alertLifecycle.js";
import { buildAlphaSignals, buildDecisionBrief, demoAlphaEvents, demoThesisProfiles, normalizeAlphaEvent } from "../src/alphaEngine.js";
import { buildDailyCommandBrief } from "../src/dailyCommandBrief.js";
import { buildJournalRows, defaultJournalEntries, filterJournalRows, signalSnapshotForTicker, summarizeJournal } from "../src/decisionJournal.js";
import { buildPortfolioEvents, defaultCalendarEvents, importCalendarEventFile, summarizeCalendarEvents } from "../src/eventCalendar.js";
import { normalizePlaidHoldings, normalizeSnapTradeHoldings } from "../src/fidelityConnector.js";
import { applyMarketDataToHoldings, buildMarketDataProviderConfig, buildMarketDataProviderStatuses, buildMockMarketDataSnapshot, createFinancialModelingPrepProvider, createFinnhubProvider, createMarketDataCache, createMockMarketDataProvider, marketDataCacheTtlConfig, marketDataFallbackProviderIds } from "../src/marketDataProvider.js";
import { buildDemoMarketEventDataset } from "../src/marketEventProviders.js";
import { buildMarketDriverReport, MARKET_DRIVER_DEFAULT_TICKERS } from "../src/marketDrivers.js";
import { applyPortfolioImportPreview, buildPortfolioImportPreview, cancelPortfolioImportPreview } from "../src/importPreviewWorkflow.js";
import { buildTickerMovementExplainer } from "../src/movementExplainer.js";
import { parseLocalDataFixtureJson, validateLocalDataBundle } from "../src/localDataContracts.js";
import { buildPoliticianTradeProviderConfig, createPoliticianTradeProvider, demoPoliticianTrades, importPoliticianTradeFile, politicianTradeProviderStatuses } from "../src/politicianTrades.js";
import { analyzePortfolio } from "../src/portfolioAnalytics.js";
import { buildPortfolioAttribution } from "../src/portfolioAttribution.js";
import { tuckerDemoHoldings } from "../src/portfolioDemoData.js";
import { buildPortfolioHealth } from "../src/portfolioHealth.js";
import { buildAffectedExposureSummary } from "../src/portfolioView.js";
import { buildRedditProviderConfig, createRedditProvider, demoRedditMentions, extractTickerMentions, fetchRedditApiMentions, importRedditMentionFile, redditProviderStatuses, summarizeRedditMentions } from "../src/redditSignals.js";
import { buildAlphaRecommendations, filterAlphaRecommendations } from "../src/recommendationEngine.js";
import { buildInstitutionalQuantLens } from "../src/scoringModel.js";
import { buildSeekingAlphaAiImportPreview } from "../src/seekingAlphaAi.js";
import { buildSeekingAlphaAiCoverageQueue } from "../src/seekingAlphaAiCoverage.js";
import { normalizeSeekingAlphaRecord } from "../src/seekingAlphaConnector.js";
import { buildTargetAllocationPlan, defaultTargetAllocations, normalizeTargetAllocations } from "../src/targetAllocations.js";
import { buildTechnicalAnalysisSnapshot } from "../src/technicalAnalysis.js";
import { buildThesisAlerts, buildThesisRows, thesisSummary } from "../src/thesisTracker.js";
import { compareThesisSnapshotToProfile, normalizeThesisSnapshot } from "../src/thesisSnapshots.js";
import { buildTickerResearchLens } from "../src/tickerResearch.js";
import { buildCombinedTickerSignals } from "../src/tickerSignals.js";
import { buildStockPredictionModel } from "../src/stockPredictionModel.js";
import { enrichQuantLensContext, updateQuantScoreHistory } from "../src/quantLensContext.js";
import { buildWatchlistIdeaRows, defaultWatchlistIdeas, filterWatchlistIdeaRows, promoteTickerSignalToIdea, summarizeWatchlistIdeas } from "../src/watchlistIdeas.js";
import { simulateWhatIf } from "../src/whatIfSimulator.js";

await import("../src/dataAdapters.js");

const holdings = tuckerDemoHoldings();
const analysis = analyzePortfolio(holdings);
const demoSignals = demoAlphaEvents();
const normalizedSignals = demoSignals.map(normalizeAlphaEvent);
const signals = buildAlphaSignals(demoSignals, analysis.holdings, demoThesisProfiles());
const decisionBrief = buildDecisionBrief(signals, analysis);
const marketDataset = buildDemoMarketEventDataset({ env: {}, requestedProvider: "all" });
const newsApiOnlyMarketDataset = buildDemoMarketEventDataset({ env: {}, requestedProvider: "newsApi" });
const newsApiConfiguredMarketDataset = buildDemoMarketEventDataset({ env: { NEWSAPI_KEY: "secret-value" }, requestedProvider: "newsApi" });
const marketDataSnapshot = buildMockMarketDataSnapshot([...new Set([...holdings.map((holding) => holding.ticker), ...MARKET_DRIVER_DEFAULT_TICKERS])], { asOf: "2026-05-23T10:30:00-04:00", now: "2026-05-23T10:45:00-04:00" });
const marketDataConfig = buildMarketDataProviderConfig({});
const configuredMarketDataConfig = buildMarketDataProviderConfig({ MARKET_DATA_PROVIDER: "finnhub", FINNHUB_API_KEY: "secret-value" });
const marketDataProviderStatuses = buildMarketDataProviderStatuses({});
const marketDataCache = createMarketDataCache();
const marketDataTtls = marketDataCacheTtlConfig({ MARKET_DATA_QUOTE_TTL_MINUTES: "5" });
const holdingsWithMarketData = applyMarketDataToHoldings(analysis.holdings, marketDataSnapshot);
const portfolioAttribution = buildPortfolioAttribution(holdingsWithMarketData, { totalValue: analysis.overview.totalValue });
const politicianTrades = demoPoliticianTrades();
const eventCalendar = buildPortfolioEvents({
  calendarEvents: defaultCalendarEvents("2026-05-23T12:00:00-04:00"),
  holdings: analysis.holdings,
  thesisRows: [],
  asOf: "2026-05-23T12:00:00-04:00"
});
const eventCalendarSummary = summarizeCalendarEvents(eventCalendar, { asOf: "2026-05-23T12:00:00-04:00" });
const eventCalendarImport = importCalendarEventFile("ticker,event type,date,title,importance\nMU,earnings,2026-06-26,MU imported earnings,high", {
  fileName: "calendar-events.csv",
  asOf: "2026-05-23T12:00:00-04:00"
});
const politicianCsvImport = importPoliticianTradeFile(`Politician Name,Chamber,Party,State,Symbol,Asset Name,Transaction Type,Transaction Date,Disclosure Date,Amount,Owner,Source URL
Rep Smoke,House,D,CA,MU,Micron Technology Inc,Purchase,2026-05-01,2026-05-12,"$1,001 - $15,000",Self,https://example.test/disclosures/mu-smoke`, { fileName: "smoke-politician-trades.csv", asOf: "2026-05-23T12:00:00-04:00" });
const politicianProviderStatuses = politicianTradeProviderStatuses();
const configuredPoliticianProvider = createPoliticianTradeProvider("senate-stock-watcher", {
  sourceUrl: "https://example.test/senate-stock-watcher.json",
  liveEnabled: true
});
const unconfiguredPoliticianConfig = buildPoliticianTradeProviderConfig({ POLITICIAN_TRADES_PROVIDER: "senate-stock-watcher" }, {
  defaultSourceUrl: "https://example.test/senate-stock-watcher.json"
});
const configuredPoliticianConfig = buildPoliticianTradeProviderConfig({
  POLITICIAN_TRADES_PROVIDER: "senate-stock-watcher",
  POLITICIAN_TRADES_LIVE_ENABLED: "true"
}, {
  defaultSourceUrl: "https://example.test/senate-stock-watcher.json"
});
const redditMentions = demoRedditMentions();
const redditSummary = summarizeRedditMentions(redditMentions, { asOf: "2026-05-23T12:00:00-04:00" });
const redditFalsePositiveCheck = extractTickerMentions("I AM IN CASH NOW, CEO says AI, DD inside. I CAN BE wrong, but $MU NVDA and SOXL are actual watch tickers.");
const redditConfig = buildRedditProviderConfig({});
const configuredRedditConfig = buildRedditProviderConfig({
  REDDIT_CLIENT_ID: "secret-client",
  REDDIT_CLIENT_SECRET: "secret-value",
  REDDIT_USER_AGENT: "market-pulse-smoke",
  REDDIT_REFRESH_TOKEN: "refresh-secret"
});
const liveRedditConfig = buildRedditProviderConfig({
  REDDIT_CLIENT_ID: "secret-client",
  REDDIT_CLIENT_SECRET: "secret-value",
  REDDIT_USER_AGENT: "market-pulse-smoke",
  REDDIT_LIVE_ENABLED: "true"
});
const redditProviderStatus = redditProviderStatuses({});
const redditLiveReport = await fetchRedditApiMentions({
  env: {
    REDDIT_CLIENT_ID: "secret-client",
    REDDIT_CLIENT_SECRET: "secret-value",
    REDDIT_USER_AGENT: "market-pulse-smoke",
    REDDIT_LIVE_ENABLED: "true"
  },
  settings: { subreddits: ["stocks"], whitelist: ["MU", "NVDA", "AI"], falsePositives: ["AI"] },
  tokenUrl: "https://auth.example/token",
  apiBaseUrl: "https://oauth.example",
  sourceUrlBase: "https://reddit.example",
  asOf: "2026-05-24T12:00:00-04:00",
  fetchImpl: async (url) => {
    const textUrl = String(url);
    if (textUrl === "https://auth.example/token") return mockResponse({ access_token: "reddit-token", token_type: "bearer", expires_in: 3600 });
    if (textUrl.includes("/r/stocks/new")) return mockResponse({ data: { children: [{ data: { name: "t3_smoke_mu", subreddit: "stocks", author: "do-not-store", created_utc: 1779638400, title: "MU and NVDA smoke thread", selftext: "Watching $MU and NVDA. AI is filtered.", score: 11, ups: 11, num_comments: 2, permalink: "/r/stocks/comments/smoke_mu/" } }] } });
    if (textUrl.includes("/r/stocks/comments")) return mockResponse({ data: { children: [] } });
    return mockResponse({ error: "unexpected" }, 404);
  }
});
const redditJsonImport = importRedditMentionFile(JSON.stringify([
  {
    id: "smoke-reddit-mu",
    subreddit: "stocks",
    created_utc: "2026-05-23T09:15:00-04:00",
    title: "Smoke test $MU and NVDA mention",
    selftext: "AI and NOW are ignored, but $MU and NVDA should survive.",
    score: 7,
    num_comments: 2,
    permalink: "https://example.test/reddit/smoke-mu"
  }
]), { fileName: "smoke-reddit.json", asOf: "2026-05-23T12:00:00-04:00" });
const smokeSeekingAlphaAiRecords = [{
  ticker: "MU",
  tickers: ["MU"],
  sourceType: "virtual_analyst_report",
  sourceMode: "pasted",
  sourceTypeLabel: "Virtual Analyst Report",
  sourceModeLabel: "Pasted",
  reportDate: "2026-05-22",
  importedAt: "2026-05-23",
  responseText: "Virtual Analyst Report for MU. Bullish: HBM demand. Bearish: memory pricing risk. Quant Rating: Buy.",
  normalizedExcerpt: "Bullish: MU HBM demand. Bearish: Memory pricing risk.",
  extractedBullishPoints: ["MU HBM demand"],
  extractedBearishPoints: ["Memory pricing risk"],
  extractedRatings: { quantRating: "Buy" },
  freshnessStatus: "current",
  sourceLabel: "Seeking Alpha AI personal import",
  liveProviderCalls: false,
  credentialMaterialStored: false
}];
const tickerSignals = buildCombinedTickerSignals({
  holdings: analysis.holdings,
  marketDataSnapshot,
  redditMentions,
  politicianTrades,
  seekingAlphaAiRecords: smokeSeekingAlphaAiRecords,
  marketEvents: marketDataset.events,
  alphaSignals: signals,
  asOf: "2026-05-23T12:00:00-04:00"
});
const predictionSmoke = buildStockPredictionModel({
  holding: analysis.holdings.find((holding) => holding.ticker === "MU"),
  signal: tickerSignals.find((signal) => signal.ticker === "MU"),
  uiState: "IMPORTED_CLEAN",
  asOf: "2026-05-23T12:00:00-04:00"
});
const priorQuantHistory = updateQuantScoreHistory([], tickerSignals, {
  asOf: "2026-05-22T12:00:00-04:00",
  portfolioMode: "imported"
});
const tickerSignalsWithQuantContext = enrichQuantLensContext(tickerSignals, {
  asOf: "2026-05-23T12:00:00-04:00",
  portfolioMode: "imported",
  history: priorQuantHistory
});
const quantLensSmoke = buildInstitutionalQuantLens({
  ticker: "MU",
  quant: 4.7,
  profitabilityGrade: "A-",
  growthGrade: "A",
  momentumGrade: "A-",
  epsRevisionsGrade: "B+",
  valuationGrade: "B",
  revenueGrowth: 36,
  epsGrowth: 40,
  grossProfitToAssets: 0.42,
  grossMargin: 48,
  freeCashFlowMargin: 16,
  analystCount: 28,
  estimateChange: 3,
  saUpdatedAt: "2026-05-20T12:00:00-04:00",
  forwardPe: 18,
  priceToSales: 6,
  beta: 1.2,
  debtToEquity: 0.28,
  maxDrawdownPercent: -18,
  price: 132,
  marketCap: 147_000_000_000,
  volume: 20_000_000,
  averageVolume: 18_000_000,
  dailyChangePercent: 0.018,
  relativeStrength: 76,
  historicalPrices: [84, 88, 90, 94, 99, 104, 108, 112, 116, 121, 126, 128, 132],
  portfolioWeight: 0.08,
  thesisStatus: "Active",
  riskLevel: "Medium",
  liveProviderCalls: true,
  dataFreshness: "live"
}, { asOf: "2026-05-23T12:00:00-04:00", portfolio: { totalValue: analysis.overview.totalValue } });
const researchLensSmoke = buildTickerResearchLens({
  ticker: "MU",
  name: "Micron Technology",
  sector: "Semiconductors",
  industry: "Memory",
  quant: 4.7,
  valuationGrade: "B",
  growthGrade: "A",
  profitabilityGrade: "A-",
  momentumGrade: "A",
  revisionsGrade: "B+",
  forwardPe: 18,
  priceToSales: 6,
  marketCap: 147_000_000_000,
  portfolioWeight: 0.08,
  liveProviderCalls: true,
  sourceMode: "imported"
});
const journalEntries = defaultJournalEntries("2026-05-23T12:00:00-04:00");
const journalRows = buildJournalRows({
  entries: journalEntries,
  holdings: analysis.holdings,
  tickerSignals,
  watchlistIdeas: []
});
const journalSummary = summarizeJournal(journalRows);
const muSignalSnapshot = signalSnapshotForTicker("MU", tickerSignals, "2026-05-23T12:00:00-04:00");
const watchlistIdeas = defaultWatchlistIdeas("2026-05-23T12:00:00-04:00");
const watchlistIdeaRows = buildWatchlistIdeaRows({
  watchlistIdeas,
  holdings: analysis.holdings,
  tickerSignals,
  thesisRows: [],
  marketDataSnapshot,
  asOf: "2026-05-23T12:00:00-04:00"
});
const promotedWatchlist = promoteTickerSignalToIdea(tickerSignals.find((row) => row.ticker === "CRDO"), watchlistIdeas, { asOf: "2026-05-23T12:00:00-04:00" });
const watchlistSummary = summarizeWatchlistIdeas(watchlistIdeaRows);
const alertThresholds = normalizeAlertThresholds({
  maxPositionWeight: 12,
  maxSectorWeight: 30,
  maxLeveragedWeight: 10,
  tickerSignalScore: 60,
  politicianTradeScore: 55,
  redditMentionAcceleration: 50,
  minActionDrift: 1.5,
  staleHours: 24
});
const targetPlan = buildTargetAllocationPlan(analysis.holdings, defaultTargetAllocations(), { mode: "new-contribution" });
const localAlerts = buildLocalAlerts({
  analysis,
  tickerSignals,
  politicianTrades,
  redditMentions,
  seekingAlphaAiRecords: smokeSeekingAlphaAiRecords,
  providerReadiness: {
    providerStatuses: marketDataset.providerStatuses,
    marketDataQuoteProviders: marketDataProviderStatuses
  },
  marketDataStatus: marketDataSnapshot.status,
  targetPlan,
  thresholds: alertThresholds,
  watchlist: ["MU", "NVDA", "AMD", "SOXL", "UPRO", "VGT", "CRDO"],
  asOf: "2026-05-23T12:00:00-04:00"
});
const whatIfResult = simulateWhatIf({
  holdings: analysis.holdings,
  scenario: { action: "add", ticker: "SOXL", amount: 25000, fundingMode: "external" },
  targetPlan,
  alertThresholds,
  asOf: "2026-05-23T12:00:00-04:00"
});
const thesisRows = buildThesisRows(analysis.holdings, demoThesisProfiles(), { targetPlan, alphaSignals: signals, asOf: "2026-05-23", totalValue: analysis.overview.totalValue });
const thesisAlerts = buildThesisAlerts(thesisRows);
const thesisStats = thesisSummary(thesisRows);
const thesisSnapshot = normalizeThesisSnapshot({
  ticker: "MU",
  capturedAt: "2026-05-23T12:00:00-04:00",
  sourceType: "user-written",
  profile: demoThesisProfiles().MU
});
const thesisSnapshotComparison = compareThesisSnapshotToProfile(thesisSnapshot, { ...demoThesisProfiles().MU, confidenceLevel: "Low" });
const muMovementExplainer = buildTickerMovementExplainer({
  ticker: "MU",
  owned: true,
  marketValue: analysis.holdings.find((holding) => holding.ticker === "MU")?.marketValue || 0,
  dailyChange: analysis.holdings.find((holding) => holding.ticker === "MU")?.dailyChange || 0,
  sector: "Semiconductors",
  quote: marketDataSnapshot.quotesByTicker.MU,
  marketDataStatus: marketDataSnapshot.status,
  redditSummary: redditSummary.find((row) => row.ticker === "MU"),
  politicianTrades: politicianTrades.filter((row) => row.ticker === "MU"),
  calendarEvents: eventCalendar.filter((row) => (row.tickers || []).includes("MU")),
  alerts: localAlerts.filter((row) => row.ticker === "MU"),
  journalEntries: journalRows.filter((row) => row.ticker === "MU"),
  alphaSignals: signals.filter((row) => row.primaryTicker === "MU" || (row.affectedTickers || []).includes("MU")),
  marketEvents: marketDataset.events.filter((row) => (row.affectedTickers || []).includes("MU"))
}, {
  marketDataSnapshot,
  asOf: "2026-05-23T12:00:00-04:00"
});
const alertLifecycle = applyAlertState(analysis.alerts, hideAlert(markAlertReviewed({}, analysis.alerts[0]?.id, "2026-05-22T10:00:00Z"), analysis.alerts[1]?.id, "2026-05-22T11:00:00Z"));
const marketDriverReport = buildMarketDriverReport({
  analysis,
  holdings: analysis.holdings,
  marketDataSnapshot,
  marketEvents: marketDataset.events,
  tickerSignals,
  xUpdates: [],
  redditMentions,
  politicianTrades,
  providerReadiness: {
    providerStatuses: marketDataset.providerStatuses,
    marketDataQuoteProviders: marketDataProviderStatuses
  },
  uiState: "IMPORTED_CLEAN",
  asOf: "2026-05-23T12:00:00-04:00"
});
const dailyBrief = buildDailyCommandBrief({
  analysis: { ...analysis, alerts: [...analysis.alerts, ...localAlerts, ...thesisAlerts] },
  tickerSignals,
  redditMentions,
  politicianTrades,
  seekingAlphaAiRecords: smokeSeekingAlphaAiRecords,
  providerReadiness: {
    providerStatuses: marketDataset.providerStatuses,
    marketDataQuoteProviders: marketDataProviderStatuses
  },
  marketDataStatus: marketDataSnapshot.status,
  targetPlan,
  thesisRows,
  eventCalendar,
  marketDrivers: marketDriverReport,
  portfolioDataQuality: { status: "clean", message: "Smoke fixture import usable." },
  uiState: "IMPORTED_CLEAN",
  asOf: "2026-05-23T12:00:00-04:00"
});
const portfolioHealth = buildPortfolioHealth({
  analysis: { ...analysis, alerts: [...analysis.alerts, ...localAlerts, ...thesisAlerts] },
  thesisRows,
  targetPlan,
  alerts: [...analysis.alerts, ...localAlerts, ...thesisAlerts],
  marketDataStatus: marketDataSnapshot.status,
  portfolioDataQuality: { status: "clean", holdingCount: analysis.holdings.length },
  uiState: "IMPORTED_CLEAN",
  asOf: "2026-05-23T12:00:00-04:00"
});
const alphaRecommendations = buildAlphaRecommendations({
  analysis: { ...analysis, alerts: [...analysis.alerts, ...localAlerts, ...thesisAlerts] },
  alphaSignals: signals,
  tickerSignals,
  alerts: [...analysis.alerts, ...localAlerts, ...thesisAlerts],
  targetPlan,
  thesisRows,
  watchlistIdeas,
  calendarEvents: eventCalendar,
  seekingAlphaAiRecords: smokeSeekingAlphaAiRecords,
  marketDataStatus: marketDataSnapshot.status,
  providerReadiness: {
    providerStatuses: marketDataset.providerStatuses,
    marketDataQuoteProviders: marketDataProviderStatuses
  },
  uiState: "IMPORTED_CLEAN",
  asOf: "2026-05-23T12:00:00-04:00"
});
const samsung = signals.find((signal) => signal.id === "alpha-samsung-strike-mu");
const exposureSummary = buildAffectedExposureSummary({
  affectedTickers: ["MU", "SOXL", "NVDA", "AMD"],
  category: "supply-chain"
}, [
  { ticker: "MU", marketValue: 100000, portfolioWeight: 0.2 },
  { ticker: "MU", marketValue: 25000, portfolioWeight: 0.05 },
  { ticker: "SOXL", marketValue: 50000, portfolioWeight: 0.1 },
  { ticker: "NVDA", marketValue: 20000, portfolioWeight: 0.04 },
  { ticker: "AMD", marketValue: 11750, portfolioWeight: 0.02 }
]);
const indexHtml = readFileSync("index.html", "utf8");
const appJs = readFileSync("src/app.js", "utf8");
const portfolioAnalyticsJs = readFileSync("src/portfolioAnalytics.js", "utf8");
const portfolioViewJs = readFileSync("src/portfolioView.js", "utf8");
const fidelityImportBranchStart = appJs.indexOf('if (provider === "fidelity")');
const fidelityImportBranchEnd = appJs.indexOf("if (!result.validation.ok)", fidelityImportBranchStart);
const fidelityImportBranch = fidelityImportBranchStart >= 0 && fidelityImportBranchEnd > fidelityImportBranchStart
  ? appJs.slice(fidelityImportBranchStart, fidelityImportBranchEnd)
  : "";
const cancelImportStart = appJs.indexOf("function cancelPendingPortfolioImport");
const cancelImportEnd = appJs.indexOf("function parsePastedFidelityHoldings", cancelImportStart);
const cancelImportFunction = cancelImportStart >= 0 && cancelImportEnd > cancelImportStart
  ? appJs.slice(cancelImportStart, cancelImportEnd)
  : "";
const accountScopeJs = readFileSync("src/accountScope.js", "utf8");
const routerJs = readFileSync("src/router.js", "utf8");
const politicianTradesJs = readFileSync("src/politicianTrades.js", "utf8");
const redditSignalsJs = readFileSync("src/redditSignals.js", "utf8");
const tickerSignalsJs = readFileSync("src/tickerSignals.js", "utf8");
const tickerResearchJs = readFileSync("src/tickerResearch.js", "utf8");
const quantLensContextJs = readFileSync("src/quantLensContext.js", "utf8");
const scoringModelJs = readFileSync("src/scoringModel.js", "utf8");
const movementExplainerJs = readFileSync("src/movementExplainer.js", "utf8");
const marketDataProviderJs = readFileSync("src/marketDataProvider.js", "utf8");
const marketEventProvidersJs = readFileSync("src/marketEventProviders.js", "utf8");
const marketDriversJs = readFileSync("src/marketDrivers.js", "utf8");
const marketDataSelectionJs = readFileSync("src/marketDataSelection.js", "utf8");
const technicalAnalysisJs = readFileSync("src/technicalAnalysis.js", "utf8");
const localServerJs = readFileSync("scripts/local-server.js", "utf8");
const packageJson = readFileSync("package.json", "utf8");
const gitignore = readFileSync(".gitignore", "utf8");
const dataContractsTs = readFileSync("src/dataContracts.ts", "utf8");
const localDataContractsJs = readFileSync("src/localDataContracts.js", "utf8");
const localDataContractsDoc = readFileSync("docs/local-data-contracts.md", "utf8");
const quantitativeEngineDoc = readFileSync("docs/quantitative-engine.md", "utf8");
const stockPredictionDoc = readFileSync("docs/stock-prediction-model.md", "utf8");
const tickerSignalScoringDoc = readFileSync("docs/ticker-signal-scoring.md", "utf8");
const alphaEngineDoc = readFileSync("docs/alpha-engine.md", "utf8");
const localFixture = parseLocalDataFixtureJson(readFileSync("data/local-data-fixtures.json", "utf8")).fixture;
const localFixtureValidation = validateLocalDataBundle(localFixture);
const adapters = globalThis.DataAdapters;
const csvResult = adapters.buildImportResult({
  fidelityCsv: readFileSync("data/sample-fidelity-positions.csv", "utf8"),
  seekingAlphaCsv: readFileSync("data/sample-seeking-alpha-ratings.csv", "utf8")
});
const messyImportResult = adapters.buildImportResult({
  fidelityFileName: "sample-messy-brokerage-positions.csv",
  fidelityCsv: readFileSync("data/sample-messy-brokerage-positions.csv", "utf8")
});
const jsonHoldingsResult = adapters.buildImportResult({
  fidelityFileName: "sample-holdings-import.json",
  fidelityJson: readFileSync("data/sample-holdings-import.json", "utf8")
});
const tortureCsvResult = adapters.buildImportResult({
  fidelityFileName: "torture-brokerage-positions.csv",
  fidelityCsv: readFileSync("data/torture-brokerage-positions.csv", "utf8")
});
const tortureJsonResult = adapters.buildImportResult({
  fidelityFileName: "torture-holdings-import.json",
  fidelityJson: readFileSync("data/torture-holdings-import.json", "utf8")
});
const malformedJsonResult = adapters.buildImportResult({
  fidelityFileName: "broken-holdings.json",
  fidelityJson: "{ not-json"
});
const unquotedCommaCsv = adapters.buildImportResult({
  fidelityCsv: `Account,Symbol,Description,Quantity,Current Price,Market Value,Cost Basis
Taxable,MU,Micron Technology,10,$104.50,$1,045.00,$750.00`
});
const trailingEmptyCellCsv = adapters.buildImportResult({
  fidelityCsv: `Account Number,Account Name,Symbol,Description,Quantity,Last Price,Last Price Change,Current Value,Today's Gain/Loss Dollar,Today's Gain/Loss Percent,Total Gain/Loss Dollar,Total Gain/Loss Percent,Percent Of Account,Cost Basis Total,Average Cost Basis,Type
12345,Taxable,NVDA,NVIDIA Corp,2,$950.00,+$5.00,$1900.00,+$10.00,+0.53%,+$700.00,+58.33%,15.00%,$1200.00,$600.00,Stock,`
});
const ambiguousCommaCsv = adapters.buildImportResult({
  fidelityCsv: `Account,Symbol,Description,Quantity,Current Price,Market Value,Cost Basis
Taxable,MU,Micron Technology,10,$104.50,$1,45.00,$750.00`
});
const duplicateAccountCsv = adapters.buildImportResult({
  fidelityCsv: `Account,Symbol,Description,Shares,Current Price,Market Value,Cost Basis
Taxable,MU,Micron Technology,3,100,300,240
Roth IRA,MU,Micron Technology,2,100,200,160`
});
const fidelityCusipCsv = adapters.buildImportResult({
  fidelityFileName: "fidelity-cusip-export.csv",
  fidelityCsv: `Account,Security ID / CUSIP,Security Description,Units Held,Current Price USD,Current Value Dollars,Total Basis
Taxable,595112103,MICRON TECHNOLOGY INC (MU),10,$100.00,$1000.00,$750.00`
});
const csvImportPreview = buildPortfolioImportPreview(csvResult, {
  fileName: "sample-fidelity-positions.csv",
  createdAt: "2026-05-28T12:00:00.000Z"
});
const canceledCsvImportPreview = cancelPortfolioImportPreview(csvImportPreview);
const appliedCsvImportPreview = applyPortfolioImportPreview(csvImportPreview, {
  previousHoldings: [{ ticker: "OLD", account: "Taxable", shares: 1, marketValue: 250 }],
  importedAt: "2026-05-28T12:05:00.000Z"
});
const plaidRows = normalizePlaidHoldings({
  accounts: [{ account_id: "a1", name: "Fidelity Brokerage", subtype: "individual" }],
  securities: [{ security_id: "s1", ticker_symbol: "MU", name: "Micron Technology", sector: "Semiconductors" }],
  holdings: [{ account_id: "a1", security_id: "s1", quantity: 1, institution_price: 100 }]
});
const snapRows = normalizeSnapTradeHoldings({
  positions: [{ symbol: "VGT", quantity: 1, price: 600, account_name: "Fidelity Roth IRA", account_type: "ira" }]
});
const alpha = normalizeSeekingAlphaRecord({ ticker: "NVDA", quant: "4.92", growth: "A+" });
const seekingAlphaAiPreview = buildSeekingAlphaAiImportPreview("Ask Seeking Alpha\nPrompt: Review MU.\nReport Date: 2026-05-30\nBullish:\n- MU HBM demand.\nBearish:\n- Memory pricing risk.\nQuant Rating: Buy.", {
  now: "2026-06-02T12:00:00.000Z",
  knownTickers: ["MU"]
});
const seekingAlphaAiSecretPreview = buildSeekingAlphaAiImportPreview("Virtual Analyst Report for MU. cookie: sa_session=secret-value; Quant Rating: Buy.", {
  now: "2026-06-02T12:00:00.000Z",
  knownTickers: ["MU"]
});
const smokeSeekingAlphaAiCoverageQueue = buildSeekingAlphaAiCoverageQueue({
  holdings: analysis.holdings,
  watchlistIdeas: watchlistIdeaRows,
  tickerSignals,
  seekingAlphaAiRecords: [
    {
      ...smokeSeekingAlphaAiRecords[0],
      reportDate: "2026-05-22",
      importedAt: "2026-05-23T12:00:00.000Z",
      extractedBullishPoints: ["MU HBM demand"],
      extractedBearishPoints: ["Memory pricing risk"],
      extractedRatings: { quantRating: "Buy" }
    },
    {
      ...smokeSeekingAlphaAiRecords[0],
      reportDate: "2026-05-10",
      importedAt: "2026-05-10T12:00:00.000Z",
      responseText: "Virtual Analyst Report for MU. Bullish: legacy server demand. Bearish: capex digestion. Quant Rating: Hold.",
      normalizedExcerpt: "Bullish: legacy server demand. Bearish: capex digestion.",
      extractedBullishPoints: ["Legacy server demand"],
      extractedBearishPoints: ["Capex digestion"],
      extractedRatings: { quantRating: "Hold" }
    }
  ],
  uiState: "IMPORTED_CLEAN",
  asOf: "2026-05-23T12:00:00-04:00"
});

assert(existsSync("index.html"), "index.html should exist");
assert(existsSync("src/app.js"), "src/app.js should exist");
assert(existsSync("src/fidelityConnector.js"), "Fidelity connector module should exist");
assert(existsSync("src/seekingAlphaConnector.js"), "Seeking Alpha connector module should exist");
assert(existsSync("src/seekingAlphaAi.js"), "Seeking Alpha AI personal import module should exist");
assert(existsSync("src/seekingAlphaAiCoverage.js"), "Seeking Alpha AI research coverage module should exist");
assert(existsSync("src/dataContracts.ts"), "TypeScript local data contracts should exist");
assert(existsSync("src/localDataContracts.js"), "runtime local data contract validator should exist");
assert(existsSync("src/politicianTrades.js"), "politician trade ingestion skeleton should exist");
assert(existsSync("src/redditSignals.js"), "Reddit ticker tracking skeleton should exist");
assert(existsSync("src/tickerSignals.js"), "combined ticker signal scoring module should exist");
assert(existsSync("src/tickerResearch.js"), "ticker research lens module should exist");
assert(existsSync("src/quantLensContext.js"), "Quant Lens peer/history context module should exist");
assert(existsSync("src/alertsEngine.js"), "local alerts engine should exist");
assert(existsSync("src/dailyCommandBrief.js"), "Daily Command Brief module should exist");
assert(existsSync("src/portfolioAttribution.js"), "portfolio attribution module should exist");
assert(existsSync("src/decisionJournal.js"), "Decision Journal module should exist");
assert(existsSync("src/marketDataProvider.js"), "mock-first market data provider module should exist");
assert(existsSync("src/marketEventProviders.js"), "market event/news provider module should exist");
assert(existsSync("src/marketDrivers.js"), "Market Drivers explainer module should exist");
assert(marketDriversJs.includes("BROAD_MARKET_DRIVER_TICKERS"), "Market Drivers should define broad-market proxy tickers");
assert(marketDriversJs.includes("AI_TECH_DRIVER_TICKERS"), "Market Drivers should define AI/tech proxy tickers");
assert(marketDriversJs.includes("MARKET_REGIME_TICKERS"), "Market Drivers should define market-regime proxy tickers");
assert(marketDriversJs.includes("source-labeled explanation, not a confirmed cause"), "Market Drivers should avoid fake-causality language");
assert(marketDriversJs.includes("socialEvidenceForScope"), "Market Drivers should consume social evidence when available");
assert(marketDriversJs.includes("newsReadThroughDriver"), "Market Drivers should consume news/event read-throughs when available");
assert(marketDataProviderJs.includes("createMockMarketDataProvider"), "market data provider should expose a mock provider");
assert(marketDataProviderJs.includes("createUnconfiguredMarketDataProvider"), "market data provider should expose not-configured provider status path");
assert(/newsApi:\s*{[\s\S]*?requiredEnv:\s*\["NEWSAPI_KEY"\][\s\S]*?sourceTypes:\s*\["news"\][\s\S]*?defaultEvidenceGrade:\s*"B"[\s\S]*?liveEnabled:\s*false/.test(marketEventProvidersJs), "NewsAPI provider spec should stay news-only, NEWSAPI_KEY-gated, B-grade, and disabled by default");
assert(marketEventProvidersJs.includes("Sample events remain available"), "news provider warnings should preserve sample fallback language");
assert(marketEventProvidersJs.includes("normalizeMarketProviderEvent"), "news provider path should normalize provider rows through the shared market-event contract");
assert(marketEventProvidersJs.includes("sourceUrl: raw.sourceUrl || raw.url || \"\""), "news provider normalization should preserve source URLs");
assert(!/from\s+["'](?:node:http|node:https|axios|undici|puppeteer|playwright|cheerio)["']/.test(marketEventProvidersJs), "market event/news browser module should not import network or scraping clients");
assert(existsSync("data/local-data-fixtures.json"), "local data fixture should exist");
assert(existsSync("docs/local-data-contracts.md"), "local data contract documentation should exist");
assert(existsSync("docs/quantitative-engine.md"), "quantitative engine documentation should exist");
assert(existsSync("docs/ticker-signal-scoring.md"), "ticker signal scoring documentation should exist");
assert(existsSync("docs/alpha-engine.md"), "Alpha Engine documentation should exist");
assert(dataContractsTs.includes("export interface Holding"), "dataContracts.ts should define Holding");
assert(dataContractsTs.includes("export interface Account"), "dataContracts.ts should define Account");
assert(dataContractsTs.includes("export interface WatchlistItem"), "dataContracts.ts should define WatchlistItem");
assert(dataContractsTs.includes("export interface DecisionJournalEntry"), "dataContracts.ts should define DecisionJournalEntry");
assert(dataContractsTs.includes("export interface TickerSignal"), "dataContracts.ts should define TickerSignal");
assert(dataContractsTs.includes("export interface MarketDataQuote"), "dataContracts.ts should define MarketDataQuote");
assert(dataContractsTs.includes("export interface MarketDataProviderConfig"), "dataContracts.ts should define MarketDataProviderConfig");
assert(dataContractsTs.includes("export interface SeekingAlphaAiRecord"), "dataContracts.ts should define SeekingAlphaAiRecord");
assert(localDataContractsJs.includes("seekingAlphaAiRecords"), "runtime local data contract should validate Seeking Alpha AI records");
assert(readFileSync("docs/seeking-alpha-connector.md", "utf8").includes("Seeking Alpha AI Personal Import"), "Seeking Alpha docs should describe AI personal import workflow");
assert(readFileSync("docs/seeking-alpha-connector.md", "utf8").includes("rejects content that appears to include cookies"), "Seeking Alpha docs should document credential-content rejection");
assert(readFileSync("docs/seeking-alpha-connector.md", "utf8").includes("Research Coverage"), "Seeking Alpha docs should describe the research coverage queue");
assert(readFileSync("docs/ticker-signal-scoring.md", "utf8").includes("does not directly change the confluence formula"), "ticker scoring docs should keep Seeking Alpha AI coverage out of direct confluence scoring");
assert(dataContractsTs.includes("confluenceScore?: number"), "TickerSignal contract should include confluence score");
assert(dataContractsTs.includes("redditMentionScore?: number"), "TickerSignal contract should include Reddit score");
assert(dataContractsTs.includes("relativeStrengthScore?: number"), "TickerSignal contract should include relative strength score");
assert(dataContractsTs.includes("redditMentionAccelerationScore?: number"), "TickerSignal contract should include Reddit mention acceleration score");
assert(dataContractsTs.includes("concentrationRiskScore?: number"), "TickerSignal contract should include concentration risk score");
assert(dataContractsTs.includes("politicianBuyScore?: number"), "TickerSignal contract should include politician buy score");
assert(dataContractsTs.includes("institutionalQuantScore?: number"), "TickerSignal contract should include institutional quant lens score");
assert(dataContractsTs.includes("institutionalQuantPeerSummary?: string"), "TickerSignal contract should include quant peer context");
assert(dataContractsTs.includes("institutionalQuantAcademicFactors"), "TickerSignal contract should include academic factor diagnostics");
assert(dataContractsTs.includes("seekingAlphaAiEvidenceCount?: number"), "TickerSignal contract should include Seeking Alpha AI context fields");
assert(dataContractsTs.includes("export interface QuantScoreHistoryEntry"), "dataContracts.ts should define compact quant score history");
assert(dataContractsTs.includes("grossMargin?: number"), "Holding contract should include optional gross margin research input");
assert(dataContractsTs.includes("freeCashFlow?: number"), "Holding contract should include optional free-cash-flow research input");
assert(scoringModelJs.includes("INSTITUTIONAL_QUANT_MODEL_VERSION"), "scoring model should expose institutional quant model version");
assert(scoringModelJs.includes("ACADEMIC_FACTOR_MODEL_VERSION"), "scoring model should expose academic factor discipline model version");
assert(scoringModelJs.includes("scoreInstitutionalFactorValidation"), "scoring model should include factor-validation discipline");
assert(scoringModelJs.includes("grossProfitToAssets"), "quality scoring should support gross profits/assets input");
assert(scoringModelJs.includes("skipPeriodReturnPct"), "momentum scoring should expose skip-period momentum context");
assert(tickerResearchJs.includes("buildBuffettResearchChecklist"), "ticker research lens should include a Buffett-style owner checklist");
assert(quantLensContextJs.includes("enrichQuantLensContext"), "quant context module should expose peer/history enrichment");
assert(quantLensContextJs.includes("updateQuantScoreHistory"), "quant context module should expose compact score history updates");
assert(scoringModelJs.includes("scoreInstitutionalLiquidity"), "scoring model should include liquidity/capacity factor");
assert(dataContractsTs.includes("export interface RedditMention"), "dataContracts.ts should define RedditMention");
assert(dataContractsTs.includes("sourceId: string"), "RedditMention contract should include source id");
assert(dataContractsTs.includes("extractedTickers: string[]"), "RedditMention contract should include extracted tickers");
assert(dataContractsTs.includes("export interface PoliticianTrade"), "dataContracts.ts should define PoliticianTrade");
assert(dataContractsTs.includes("chamber:"), "PoliticianTrade contract should include chamber");
assert(dataContractsTs.includes("amountRangeLow: number"), "PoliticianTrade contract should include low amount range");
assert(dataContractsTs.includes("export interface Alert"), "dataContracts.ts should define Alert");
assert(dataContractsTs.includes("\"info\" | \"watch\" | \"warning\" | \"critical\""), "AlertSeverity should include the local alert severity levels");
assert(dataContractsTs.includes("export interface DataSourceStatus"), "dataContracts.ts should define DataSourceStatus");
assert(localDataContractsJs.includes("validateLocalDataBundle"), "local data validator should expose validateLocalDataBundle");
assert(localFixtureValidation.ok, `local data fixture should validate: ${localFixtureValidation.errors.join("; ")}`);
assert(localFixtureValidation.counts.redditMentions >= 1, "local fixture should include a Reddit mention contract example");
assert(localFixtureValidation.counts.politicianTrades >= 1, "local fixture should include a politician trade contract example");
assert(localFixtureValidation.counts.tickerSignals >= 1, "local fixture should include a ticker signal contract example");
assert(localFixtureValidation.counts.marketDataQuotes >= 1, "local fixture should include a market data quote contract example");
assert(localFixtureValidation.counts.decisionJournal >= 1, "local fixture should include a Decision Journal contract example");
assert(indexHtml.includes('id="redditSignalsPanel"'), "Market Intelligence should include Reddit ticker mentions panel");
assert(indexHtml.includes('id="redditJsonFile"'), "Data Sources should include local Reddit JSON import control");
assert(indexHtml.includes('id="redditProviderPanel"'), "Data Sources should include Reddit provider status panel");
assert(indexHtml.includes('id="saveRedditSettingsBtn"'), "Data Sources should include Reddit settings save control");
assert(indexHtml.includes('id="syncRedditMentionsBtn"'), "Data Sources should include config-gated Reddit API sync control");
assert(appJs.includes("redditMentions: state.redditMentions"), "dashboard state export should include Reddit mentions");
assert(appJs.includes("redditImportReport"), "dashboard state should track Reddit import reports");
assert(appJs.includes("redditSettings"), "dashboard state should track Reddit settings");
assert(appJs.includes("persistRedditMentionCacheRecords(payload.redditMentions"), "dashboard state import should normalize and freshness-label Reddit mentions");
assert(appJs.includes("xUpdates: state.xUpdates"), "dashboard state export should include X/social updates");
assert(appJs.includes("normalizeXUpdates(payload.xUpdates)"), "dashboard state import should normalize X/social updates");
assert(appJs.includes("importRedditMentionFile"), "app.js should import local Reddit-like JSON files");
assert(portfolioViewJs.includes("renderRedditSignals"), "Market Intelligence should render mock Reddit signals");
assert(portfolioViewJs.includes("False positives filtered"), "Reddit signal UI should label false-positive filtering");
assert(portfolioViewJs.includes("renderRedditSourceStatus"), "Data Sources should render Reddit provider status");
assert(redditMentions.length >= 5, "mock Reddit mentions should expand into per-ticker rows");
assert(redditMentions.every((mention) => /example\.test/.test(mention.sourceUrl)), "mock Reddit mentions should use example.test source URLs only");
assert(redditSummary.some((row) => row.ticker === "MU" && row.oneDayMentions >= 1 && row.thirtyDayMentions >= 1), "Reddit summary should include 1d/30d mention counts");
assert(redditSummary.some((row) => row.mentionAcceleration !== undefined), "Reddit summary should include mention acceleration");
assert(redditFalsePositiveCheck.join(",") === "MU,NVDA,SOXL", "Reddit extraction should filter common false-positive tickers");
assert(redditConfig.status === "not configured", "missing Reddit credentials should be safely not configured");
assert(redditConfig.liveProviderCalls === false, "missing Reddit credentials should not enable live calls");
assert(configuredRedditConfig.status === "configured-not-connected", "present Reddit credentials should stay configured-not-connected");
assert(configuredRedditConfig.liveProviderCalls === false, "present Reddit credentials should not enable live calls");
assert(liveRedditConfig.status === "configured", "Reddit live flag should mark the provider configured for backend sync");
assert(liveRedditConfig.liveProviderCalls === true, "Reddit live flag should enable server-side live provider calls");
assert(!JSON.stringify(configuredRedditConfig).includes("secret-value"), "Reddit config should never expose client secrets");
assert(!JSON.stringify(configuredRedditConfig).includes("refresh-secret"), "Reddit config should never expose refresh tokens");
assert(redditProviderStatus.redditApi.missingEnv.includes("REDDIT_CLIENT_ID"), "Reddit provider status should show missing client id");
assert(createRedditProvider("reddit-api").liveProviderCalls === false, "future Reddit API provider should be safe and inactive");
assert(redditLiveReport.liveProviderCalls === true && redditLiveReport.records.length >= 2, "Reddit API provider should normalize mocked live records when explicitly enabled");
assert(redditLiveReport.records.every((record) => !record.authorHandle), "Reddit API provider should not store usernames");
assert(!dataContractsTs.includes("authorHandle"), "Reddit data contracts should omit usernames/author handles");
assert(!JSON.stringify(localFixture).includes("authorHandle"), "local fixtures should omit Reddit usernames/author handles");
assert(redditLiveReport.summary.some((row) => row.ticker === "MU" && row.oneDayMentions >= 1), "Reddit API provider should produce mention summaries");
assert(redditJsonImport.ok && redditJsonImport.tickersDetected.includes("MU") && redditJsonImport.tickersDetected.includes("NVDA"), "Reddit JSON import should normalize local mention rows");
assert(redditJsonImport.records.every((record) => record.sourceMode === "local-file" && record.liveProviderCalls === false), "Reddit JSON import should preserve local-safe provenance");
assert(redditSignalsJs.includes("COMMON_FALSE_POSITIVE_TICKERS"), "Reddit skeleton should define false-positive ticker handling");
assert(redditSignalsJs.includes("summarizeRedditMentions"), "Reddit skeleton should expose mention summary output");
assert(redditSignalsJs.includes("createRedditProvider"), "Reddit skeleton should expose provider interface");
assert(redditSignalsJs.includes("buildRedditProviderConfig"), "Reddit skeleton should expose safe provider config");
assert(redditSignalsJs.includes("importRedditMentionFile"), "Reddit skeleton should expose local JSON import");
assert(!/\bfetch\s*\(/.test(redditSignalsJs), "Reddit skeleton should not make direct fetch calls");
assert(!/node:http|node:https|axios|undici|puppeteer|playwright|cheerio/.test(redditSignalsJs), "Reddit skeleton should not import network or scraping clients");
assert(!/oauth\.reddit\.com|www\.reddit\.com|reddit\.com\/\.json/.test(redditSignalsJs), "Reddit skeleton should not include live Reddit endpoint URLs");
assert(localServerJs.includes("/api/reddit/mentions"), "local backend should expose a server-side Reddit mention proxy");
assert(appJs.includes("/api/reddit/mentions"), "browser app should request Reddit data only through the local backend proxy");
assert(!/REDDIT_CLIENT_SECRET|REDDIT_REFRESH_TOKEN|oauth\.reddit\.com|www\.reddit\.com\/api\/v1\/access_token/.test(appJs), "browser app should not contain Reddit secret env names or external Reddit URLs");
assert(tickerSignals.length >= 5, "combined ticker confluence scores should be available");
assert(tickerSignals.every((signal) => signal.mockData && signal.liveProviderCalls === false), "combined ticker signals should be mock/local only");
assert(tickerSignals.some((signal) => signal.ticker === "MU" && signal.marketDataPrice === 132.1), "combined ticker signals should include mock market data context");
assert(tickerSignals.every((signal) => signal.marketDataStatus === "mock/sample mode" || signal.marketDataStatus === "not configured"), "ticker signal market data status should stay mock/not-configured");
assert(tickerSignals.every((signal) => signal.confluenceScore >= 0 && signal.confluenceScore <= 1), "combined ticker signals should stay bounded");
assert(tickerSignals.every((signal) => !/buy|sell|trade|enter|exit/i.test(signal.actionCategory)), "combined ticker signal actions should avoid trade-command language");
assert(tickerSignals.some((signal) => signal.ticker === "MU" && signal.redditMentionScore > 0 && signal.politicianBuyScore > 0), "MU confluence score should combine Reddit and politician mock inputs");
assert(tickerSignals.some((signal) => signal.ticker === "MU" && signal.seekingAlphaAiEvidenceCount === 1 && /Seeking Alpha AI/.test(signal.seekingAlphaAiEvidenceLabel)), "MU ticker signal should expose Seeking Alpha AI personal import context");
assert(tickerSignals.some((signal) => signal.ticker === "MU" && signal.sourceTypes.includes("seeking-alpha-ai-personal-import")), "ticker signal source types should label Seeking Alpha AI as personal import context");
assert(tickerSignals.every((signal) => signal.relativeStrengthScore >= 0 && signal.redditMentionAccelerationScore >= 0 && signal.concentrationRiskScore >= 0), "combined ticker signals should include expanded provider-layer component scores");
assert(tickerSignals.every((signal) => signal.institutionalQuantScore >= 0 && signal.institutionalQuantScore <= 100), "combined ticker signals should include bounded institutional quant scores");
assert(tickerSignals.some((signal) => signal.institutionalQuantFactors?.some((factor) => factor.key === "liquidity")), "institutional quant factors should include liquidity/capacity");
assert(tickerSignals.some((signal) => signal.institutionalQuantFactors?.some((factor) => factor.key === "factorValidation")), "institutional quant factors should include validation discipline");
assert(tickerSignals.every((signal) => signal.institutionalQuantAcademicCompositeScore >= 0 && signal.institutionalQuantAcademicCompositeScore <= 100), "ticker signals should include bounded academic factor diagnostics");
assert(tickerSignals.some((signal) => signal.institutionalQuantAcademicFactors?.some((factor) => factor.key === "validationDiscipline")), "academic factor diagnostics should include validation discipline");
assert(existsSync("src/stockPredictionModel.js"), "transparent stock prediction model module should exist");
assert(existsSync("docs/stock-prediction-model.md"), "transparent stock prediction model docs should exist");
assert(tickerSignals.every((signal) => signal.stockPredictionScore >= 0 && signal.stockPredictionScore <= 100), "ticker signals should include bounded stock prediction scores");
assert(tickerSignals.every((signal) => signal.stockPredictionHorizon === "20 trading days"), "ticker predictions should expose a clear horizon");
assert(tickerSignals.every((signal) => Array.isArray(signal.stockPredictionFactors)), "ticker predictions should expose factor contributions");
assert(predictionSmoke.modelVersion === "transparent-stock-prediction-v1", "prediction smoke model should expose a version");
assert(predictionSmoke.factors.length >= 6 && predictionSmoke.factors.every((factor) => Number.isFinite(factor.weight) && Number.isFinite(factor.score)), "prediction factors should expose weights and bounded scores");
assert(predictionSmoke.confidence >= 0 && predictionSmoke.confidence <= 100, "prediction confidence should be bounded");
assert(!/\b(buy now|sell now|guaranteed|will go up|price target|trade ticket|place order)\b/i.test(JSON.stringify(predictionSmoke)), "prediction output should avoid trade-command and guarantee language");
assert(/Transparent Prediction Model/.test(stockPredictionDoc), "prediction docs should name the feature");
assert(/not a calibrated probability, return forecast, valuation target, or order instruction/i.test(stockPredictionDoc), "prediction docs should state the precision limits");
assert(/academic-factor-discipline-v1/.test(quantitativeEngineDoc), "Quant Engine docs should name the academic factor discipline model");
assert(/Gu, Kelly & Xiu/.test(quantitativeEngineDoc) && /Jegadeesh & Titman/.test(quantitativeEngineDoc) && /Harvey, Liu & Zhu/.test(quantitativeEngineDoc), "Quant Engine docs should cite the academic factor anchors");
assert(/No-Fake-Precision Display Contract/.test(quantitativeEngineDoc), "Quant Engine docs should define the no-fake-precision display contract");
assert(/expected return, probability of outperformance, fair value estimate, price target, or portfolio weight instruction/.test(quantitativeEngineDoc), "Quant Engine docs should forbid precision claims from factor scores");
assert(/Peer percentile and score-history labels are sidecar context/.test(quantitativeEngineDoc), "Quant Engine docs should keep peer/history context out of the model formula");
assert(/No-Fake-Precision Guardrails/.test(tickerSignalScoringDoc), "Ticker scoring docs should define no-fake-precision guardrails");
assert(/not a probability, expected return, price target, volatility forecast, or statistical edge/.test(tickerSignalScoringDoc), "Ticker scoring docs should keep confluence scores from becoming forecast claims");
assert(/academic factor diagnostics stay attached to the Quant Lens/.test(tickerSignalScoringDoc), "Ticker scoring docs should keep academic diagnostics separate from confluence scoring");
assert(/Holdings Ranking And Ranked Review Queue/.test(alphaEngineDoc), "Alpha docs should describe the holdings-first ranking UX");
assert(/Quant And No-Fake-Precision Guardrails/.test(alphaEngineDoc), "Alpha docs should document quant and no-fake-precision guardrails");
assert(/expected returns, price targets, probabilities, or trade instructions/.test(alphaEngineDoc), "Alpha docs should forbid fake precision and trade-command framing");
assert(/Seeking Alpha AI personal imports are treated differently from structured Premium ratings/.test(alphaEngineDoc), "Alpha docs should document Seeking Alpha AI personal-import guardrails");
assert(tickerSignalsWithQuantContext.every((signal) => signal.institutionalQuantPeerSummary), "quant context should add peer summaries to ticker signals");
assert(tickerSignalsWithQuantContext.some((signal) => signal.institutionalQuantScoreHistoryLabel.includes("from 2026-05-22")), "quant context should add local score history labels");
assert(tickerSignalsWithQuantContext.some((signal) => signal.institutionalQuantPeerGroup === "Leveraged ETF exposure"), "quant context should separate leveraged ETF exposure peers");
assert(quantLensSmoke.compositeScore >= 0 && quantLensSmoke.compositeScore <= 100, "institutional quant lens smoke score should stay bounded");
assert(quantLensSmoke.dataCoverageLabel === "Broad coverage", "institutional quant lens should recognize richer factor coverage");
assert(quantLensSmoke.missingData.some((item) => /skip-period momentum|multiple-testing/i.test(item)), "institutional quant lens should surface academic discipline gaps instead of hiding them");
assert(quantLensSmoke.scoreWasEvidenceCapped === false || quantLensSmoke.evidenceCapReasons.length > 0, "evidence-cap state should include reasons when a score is capped");
assert(researchLensSmoke.seekingAlphaSnapshot.averageScore >= 70, "ticker research lens should score imported Seeking Alpha-style factors");
assert(researchLensSmoke.buffettChecklist.checklist.length >= 5, "ticker research lens should produce a long-term owner checklist");
assert(researchLensSmoke.buffettChecklist.missingEvidence.some((item) => /cash|debt|free-cash-flow/i.test(item)), "owner checklist should expose missing fundamental evidence instead of inventing it");
assert(researchLensSmoke.valuationContext.note.includes("Margin-of-safety"), "ticker research lens should provide margin-of-safety context");
assert(tickerSignals.every((signal) => Array.isArray(signal.whyScoreIsHigh) && Array.isArray(signal.missingData)), "combined ticker signals should include explanation fields");
assert(localAlerts.some((alert) => alert.type === "position-weight"), "local alerts should include position weight threshold rules");
assert(localAlerts.some((alert) => alert.type === "target-allocation-drift"), "local alerts should include target allocation drift rules");
assert(localAlerts.filter((alert) => alert.type === "target-allocation-drift").every((alert) => /not a trade command/i.test(alert.detail)), "target drift alerts should use review language");
assert(localAlerts.some((alert) => alert.type === "ticker-signal"), "local alerts should include ticker signal threshold rules");
assert(localAlerts.some((alert) => alert.type === "seeking-alpha-ai-risk-context" && alert.ticker === "MU"), "local alerts should include Seeking Alpha AI owned-holding risk context rules");
assert(localAlerts.some((alert) => alert.type === "politician-trade-match"), "local alerts should include politician disclosure match rules");
assert(localAlerts.some((alert) => alert.type === "reddit-mention-acceleration"), "local alerts should include Reddit acceleration rules");
assert(localAlerts.some((alert) => alert.type === "data-source"), "local alerts should include data source status rules");
assert(localAlerts.every((alert) => ["info", "watch", "warning", "critical"].includes(alert.severity)), "local alert engine should emit local severity levels");
assert(localAlerts.every((alert) => alert.status === "active"), "local alert engine should emit active in-app alerts");
assert(indexHtml.includes("Combined Ticker Signals"), "Market Intelligence should include combined ticker signal heading");
assert(portfolioViewJs.includes("Local confluence"), "combined ticker signals should be labeled as a local confluence model");
assert(portfolioViewJs.includes("marketDataDisplayLabel(marketDataStatus)"), "overview confluence snapshot should reflect market-data source status");
assert(portfolioViewJs.includes("Sample quote"), "holdings table should visibly label sample quote context");
assert(portfolioViewJs.includes("relative strength"), "combined ticker signal UI should explain the expanded formula");
assert(portfolioViewJs.includes("Institutional Quant Lens"), "ticker pages and Market Intelligence should expose the institutional quant lens");
assert(portfolioViewJs.includes("renderAcademicFactorMiniList") && /Paper-backed factor checks/.test(alphaEngineDoc), "Alpha Engine should expose collapsed paper-backed factor checks");
assert(portfolioViewJs.includes("Academic factor discipline"), "ticker pages should expose academic factor discipline");
assert(indexHtml.includes('id="marketTape"'), "app shell should include a persistent market/ticker tape");
assert(indexHtml.includes("sa-factor-strip"), "styles should include Seeking Alpha-style factor strip presentation");
assert(portfolioViewJs.includes("renderMarketTape"), "portfolio view should render a market/ticker tape");
assert(portfolioViewJs.includes("renderTickerResearchOverview"), "ticker pages should render a research snapshot");
assert(portfolioViewJs.includes("Seeking Alpha-style factors"), "ticker research snapshot should clearly label factor-style inputs");
assert(portfolioViewJs.includes("Long-term owner read"), "ticker pages should include a long-term owner-quality read");
assert(portfolioViewJs.includes("Quant Lens"), "Market Intelligence should show compact quant lens labels");
assert(portfolioViewJs.includes("Peer rank"), "Quant Lens UI should show peer rank context");
assert(portfolioViewJs.includes("Score trend"), "Quant Lens UI should show local score trend context");
assert(portfolioViewJs.includes("Sample market data"), "market data should be visibly labeled as sample");
assert(portfolioViewJs.includes("not a recommendation to buy or sell"), "combined ticker signal UI should include safety wording");
assert(appJs.includes("buildCombinedTickerSignals"), "app.js should compute combined ticker signals before rendering");
assert(appJs.includes("tickerSignals,"), "app.js should pass combined ticker signals into the UI");
assert(appJs.includes("buildMockMarketDataSnapshot"), "app.js should build a mock-first market data snapshot");
assert(appJs.includes("applyMarketDataToHoldings"), "app.js should enrich holdings through the market data abstraction");
assert(appJs.includes("buildMarketDataProviderConfig"), "app.js should load market data provider config safely");
assert(portfolioViewJs.includes("dataModeIndicator"), "app shell should include a persistent data mode indicator");
assert(portfolioViewJs.includes("Key detected; live calls disabled"), "Data Sources should distinguish configured-but-disabled providers");
assert(portfolioViewJs.includes("API keys to browser code") || portfolioViewJs.includes("server-side"), "Data Sources should clarify API keys remain server-side");
assert(marketDataConfig.selectedProvider === "finnhub", "Finnhub should be the recommended first market data provider");
assert(marketDataConfig.status === "not configured", "missing market data credentials should be safely not configured");
assert(marketDataConfig.liveProviderCalls === false, "missing market data credentials should not enable live calls");
assert(configuredMarketDataConfig.status === "live-ready", "present market data key should report live-ready without exposing secrets");
assert(configuredMarketDataConfig.liveProviderCalls === true, "present Finnhub key should enable live calls behind the local proxy");
assert(configuredMarketDataConfig.cacheTtls.quoteTtlMs === 5 * 60 * 1000, "market data config should expose quote cache TTLs");
assert(!JSON.stringify(configuredMarketDataConfig).includes("secret-value"), "market data config should never expose API key values");
assert(JSON.stringify(marketDataFallbackProviderIds({ MARKET_DATA_PROVIDER: "finnhub", MARKET_DATA_FALLBACK_PROVIDERS: "financialModelingPrep,finnhub" })) === JSON.stringify(["financialModelingPrep"]), "market data fallback providers should be explicit and should exclude the selected provider");
assert(marketDataProviderStatuses.finnhub.missingEnv.includes("FINNHUB_API_KEY"), "market data provider status should show missing Finnhub key");
assert(marketDataProviderStatuses.financialModelingPrep.missingEnv.includes("FINANCIAL_MODELING_PREP_API_KEY"), "market data provider status should show missing FMP key");
assert(createFinnhubProvider({ env: { FINNHUB_API_KEY: "secret-value" }, fetchImpl: async () => ({ ok: true, status: 200, text: async () => "{}" }) }).liveProviderCalls === true, "Finnhub provider factory should enable live provider calls only server-side");
assert(createFinancialModelingPrepProvider({ env: { FINANCIAL_MODELING_PREP_API_KEY: "secret-value" }, fetchImpl: async () => ({ ok: true, status: 200, text: async () => "[]" }) }).liveProviderCalls === true, "FMP provider factory should enable live provider calls only server-side");
assert(marketDataCache.defaultTtls.quoteTtlMs === 5 * 60 * 1000, "market data cache should default to a 5-minute quote TTL");
assert(marketDataTtls.quoteTtlMs === 5 * 60 * 1000, "market data TTL config should parse quote TTL env values");
assert(marketDataProviderJs.includes("createMarketDataCache"), "market data provider should expose the cache layer");
assert(marketDataProviderJs.includes("lastSuccessfulRefresh"), "market data provider should track last successful refresh");
assert(portfolioViewJs.includes("cached market data"), "UI should label cached market data");
assert(localServerJs.includes("/api/market-data/quotes"), "local backend should expose a server-side market data quote proxy");
assert(localServerJs.includes("/api/connectors/fidelity/exchange"), "local backend should exchange Plaid public tokens server-side");
assert(localServerJs.includes("/investments/holdings/get"), "local backend should call Plaid investment holdings server-side");
assert(localServerJs.includes("fidelity-plaid-session.json"), "local backend should keep Plaid item tokens in a local private token store");
assert(localServerJs.includes("localMarketDataCache"), "local backend should keep a shared in-memory market data cache");
assert(localServerJs.includes("marketDataSnapshotWithFallback"), "local backend should support explicit configured market-data fallback attempts");
assert(portfolioViewJs.includes("Provider attempts"), "Data Sources diagnostics should show market-data provider attempts");
assert(indexHtml.includes('id="refreshMarketDataBtn"'), "Data Sources should include a manual market data refresh control");
assert(indexHtml.includes('id="marketDataLiveModeToggle"'), "Data Sources should include an opt-in market data live mode toggle");
assert(indexHtml.includes('id="marketDataLiveModeInterval"'), "Data Sources should include a market data live mode interval control");
assert(indexHtml.includes('id="marketDataLiveModeStatus"'), "Data Sources should include a market data live mode status line");
assert(indexHtml.includes('id="connectPlaidFidelityBtn"'), "Imports should include a Plaid Fidelity Link action");
assert(indexHtml.includes('id="syncPlaidFidelityBtn"'), "Imports should include a Plaid holdings sync action");
assert(indexHtml.includes('id="unlinkPlaidFidelityBtn"'), "Imports should include a Plaid disconnect action");
assert(indexHtml.includes('id="fidelityPlaidStatus"'), "Imports should show Plaid Link readiness and error status next to the button");
assert(indexHtml.includes('id="accountScopePanel"'), "Sidebar should include a clickable account scope panel");
assert(indexHtml.includes('id="accountAllocationPanel"'), "Holdings should include a dedicated account allocation panel");
assert(appJs.includes("startPlaidFidelityLink"), "app.js should wire Plaid Link startup");
assert(appJs.includes("exchangeFidelityPublicToken"), "app.js should exchange Plaid public token through the local backend");
assert(appJs.includes("syncPlaidFidelityHoldings"), "app.js should sync Plaid holdings into active portfolio state");
assert(appJs.includes('"fidelityConnectionStatus", "fidelityPlaidStatus"'), "Plaid Link errors should render on Imports and Data Sources");
assert(appJs.includes("buildAccountScopeModel") && appJs.includes("filterHoldingsByAccountScope"), "app.js should scope portfolio analytics by selected account");
assert(appJs.includes("handleAccountScopeClick"), "app.js should wire sidebar account scope buttons");
assert(accountScopeJs.includes("selectedSummary") && accountScopeJs.includes("portfolioWeight") && accountScopeJs.includes("cashWeight"), "Account scope model should expose selected value, portfolio weight, and cash weight");
assert(accountScopeJs.includes("dailyChangePercent") && accountScopeJs.includes("missingCostBasisCount") && accountScopeJs.includes("staleHoldingCount"), "Account scope model should expose daily move and data-quality signals");
assert(accountScopeJs.includes("inferTaxBucket") && accountScopeJs.includes("assetMix") && accountScopeJs.includes("topPositions"), "Account scope model should expose tax bucket, asset mix, and top positions");
assert(appJs.includes("data-tax-bucket") && portfolioViewJs.includes("tax-bucket-pill") && indexHtml.includes(".tax-bucket-roth") && indexHtml.includes(".tax-bucket-taxable") && indexHtml.includes(".tax-bucket-hsa"), "Account allocation UI should distinguish Roth, taxable, and HSA buckets");
assert(accountScopeJs.includes("leveragedExposure") && appJs.includes("accountScopeWarning"), "Account scope selector should surface leverage and warning context");
assert(appJs.includes("Portfolio scope") && appJs.includes("formatSignedPercent"), "Account scope UI should use clear scope copy and signed daily move formatting");
assert(portfolioViewJs.includes("accountDetail") && portfolioViewJs.includes("formatCompact(accountSummary.value)"), "Data mode indicator should include selected account value and holding count");
assert(indexHtml.includes('data-route="#daily" role="link" tabindex="0"'), "Overview digest cards should be keyboard-focusable route links");
assert(indexHtml.includes("Export all holdings"), "Header export copy should make clear it exports all active holdings");
assert(indexHtml.includes("Review source status"), "Import workflow should prioritize source status review before overview navigation");
assert(indexHtml.includes("Source-labeled read-throughs showing how events connect to portfolio exposure"), "Market Intelligence header should be source-neutral rather than sample-only");
assert(indexHtml.includes("Example: 12 means 12%"), "Alert threshold settings should explain percentage units");
assert(appJs.includes("confirmLocalChange") && appJs.includes("Clear active portfolio data?") && appJs.includes("Delete this local journal entry?"), "Destructive local actions should ask for confirmation before deleting or clearing data");
assert(portfolioViewJs.includes("Move coverage") && portfolioViewJs.includes("dailyBriefKindLabel") && portfolioViewJs.includes("Why it matters"), "Daily Brief should show coverage, item type, and why-it-matters labels");
assert(portfolioViewJs.includes("riskReviewPrompt") && portfolioViewJs.includes("Open ticker"), "Risk rows should expose review guidance and ticker drill-down links");
assert(portfolioViewJs.includes("alphaHoldingSummaryStats") && portfolioViewJs.includes("Best next click"), "Alpha Engine should summarize useful splits and next review target");
assert(portfolioViewJs.includes("alphaQualityEvidenceCap") && portfolioViewJs.includes("Evidence cap"), "Alpha Engine should cap quality rank when evidence is weak and display the cap");
assert(marketDataSelectionJs.includes("selectMarketDataTickerPlan") && marketDataSelectionJs.includes("omittedHoldingTickers"), "Market data ticker selection should prioritize owned holdings and report omitted ticker classes");
assert(appJs.includes("refreshMarketDataBtn"), "app.js should wire the manual market data refresh control");
assert(appJs.includes("growthDashboardMarketDataLiveMode"), "app.js should persist the local market data live mode setting");
assert(appJs.includes("scheduleMarketDataLiveMode"), "app.js should schedule cache-aware live mode refreshes");
assert(appJs.includes('document.addEventListener("visibilitychange", scheduleMarketDataLiveMode)'), "live mode should pause or resume based on tab visibility");
assert(appJs.includes('window.addEventListener("beforeunload", clearMarketDataLiveModeTimer)'), "live mode should clear its timer before page unload");
assert(appJs.includes('reason: "live-mode"'), "live mode refreshes should be explicitly labeled in app state");
assert(appJs.includes('history: lightweightRefresh ? "0" : "1"'), "live mode should request quote-only refreshes by default");
assert(appJs.includes('params.set("profile", "0")'), "live mode should avoid profile/metric fan-out during automatic refreshes");
assert(appJs.includes("MARKET_DATA_LIVE_MODE_RATE_LIMIT_BACKOFF_SECONDS"), "live mode should back off after provider rate limits");
assert(appJs.includes("/stale|rate limited|rate-limit|quota/.test(statusText)") && appJs.includes('dataFreshness: "stale"'), "Stale/rate-limited market data should not overwrite imported daily moves and should mark quote freshness stale");
assert(appJs.includes("liveProviderCalls"), "live mode should depend on server-side live-provider readiness");
assert(localServerJs.includes("isDeniedStaticPath"), "local backend should deny static dotfiles and secret-like files");
assert(existsSync("src/configValueSafety.js"), "shared config value safety helper should have a static-servable filename");
assert(!/from ["'](?:\.\.?\/)*[^"']*credential[^"']*["']/.test(`${appJs}\n${marketDataProviderJs}\n${marketEventProvidersJs}\n${redditSignalsJs}\n${localServerJs}`), "browser/server imports should not point at secret-like filenames blocked by the local static server");
assert(localServerJs.includes("maxJsonBodyBytes"), "local backend should cap local API JSON request bodies");
assert(packageJson.includes('"dev": "node scripts/local-server.js"'), "npm run dev should use the safe local server");
assert(appJs.includes("/api/market-data/quotes"), "browser app should request live quotes only through the local backend proxy");
assert(!/finnhub\.io|FINNHUB_API_KEY|financialmodelingprep\.com|FINANCIAL_MODELING_PREP_API_KEY|FMP_API_KEY/.test(appJs), "browser app should not contain external provider URLs or API key names");
assert(!/PLAID_SECRET|access-secret-token|access_token["']?\s*:\s*["']/.test(appJs), "browser app should not contain Plaid secrets or access tokens");
assert(!/\bfetch\s*\(/.test(tickerSignalsJs), "combined ticker signal module should not make direct fetch calls");
assert(!/node:http|node:https|axios|undici|oauth\.reddit\.com|www\.reddit\.com/.test(tickerSignalsJs), "combined ticker signal module should not include network clients or live endpoints");
assert(marketDataProviderJs.includes("createFinancialModelingPrepProvider"), "market data provider should expose the FMP live adapter factory");
assert(marketDataProviderJs.includes("createFinnhubProvider"), "market data provider should expose the Finnhub live adapter factory");
assert(!/node:http|node:https|axios|undici/.test(marketDataProviderJs), "market data provider should not import network clients");
assert(createMockMarketDataProvider().getQuote("MU").ticker === "MU", "mock market provider should support quote/current price lookup");
assert(marketDataSnapshot.status.status === "mock/sample mode", "mock market data snapshot should report mock/sample mode");
assert(marketDataSnapshot.liveProviderCalls === false, "mock market data should not claim live provider calls");
assert(holdingsWithMarketData.some((holding) => holding.marketDataPrice > 0 && holding.marketDataIsMock), "holdings should receive mock quote context");
const technicalSnapshot = buildTechnicalAnalysisSnapshot(marketDataSnapshot.quotesByTicker.MU.historicalPrices, { ticker: "MU" });
assert(technicalSnapshot.status === "available", "technical-analysis snapshot should calculate from provider historical prices");
assert(technicalSnapshot.missingData.some((item) => /historical price points/.test(item)), "technical-analysis snapshot should warn when history is short");
assert(technicalAnalysisJs.includes("relativeStrengthIndex"), "technical-analysis module should include RSI support");
assert(technicalAnalysisJs.includes("macd"), "technical-analysis module should include MACD support");
assert(technicalAnalysisJs.includes("rollingSharpe"), "technical-analysis module should include rolling Sharpe support");
assert(technicalAnalysisJs.includes("returnsDistribution"), "technical-analysis module should include return-distribution diagnostics");
assert(technicalAnalysisJs.includes("powerSpectralDensity"), "technical-analysis module should include PSD diagnostics");
assert(technicalAnalysisJs.includes("stftSpectrogram"), "technical-analysis module should include STFT diagnostics");
assert(marketDataProviderJs.includes("open: numberFrom(row.open)") && marketDataProviderJs.includes("high: numberFrom(row.high)") && marketDataProviderJs.includes("low: numberFrom(row.low)"), "market data history normalizers should preserve OHLCV rows for ATR/OBV diagnostics");
assert(indexHtml.includes('id="politicianTradesPanel"'), "Data Sources should include politician trade disclosure panel");
assert(indexHtml.includes('id="politicianTradesFile"'), "Data Sources should include local politician trade CSV/JSON import control");
assert(indexHtml.includes('id="syncPoliticianTradesBtn"'), "Data Sources should include a config-gated politician disclosure sync action");
assert(indexHtml.includes('id="marketPoliticianTradesPanel"'), "Market Intelligence should include politician trade disclosure panel");
assert(appJs.includes("politicianTrades: state.politicianTrades"), "dashboard state export should include politician trades");
assert(appJs.includes("politicianTradeImportReport"), "dashboard state should track politician trade import reports");
assert(appJs.includes("persistPoliticianTradeCacheRecords(payload.politicianTrades"), "dashboard state import should normalize and freshness-label politician trades");
assert(appJs.includes("importPoliticianTradeFile"), "app.js should import local politician trade files");
assert(portfolioViewJs.includes("renderPoliticianTrades"), "Data Sources should render mock politician trade disclosures");
assert(portfolioViewJs.includes("renderMarketPoliticianTrades"), "Market Intelligence should render politician trade disclosures");
assert(portfolioViewJs.includes("Imported local file"), "politician trade UI should distinguish imported rows");
assert(portfolioViewJs.includes("Disclosure rows are informational"), "politician trade UI should use neutral disclosure language");
assert(politicianTrades.length >= 3, "mock politician trade disclosures should be available");
assert(politicianTrades.every((trade) => /example\.test/.test(trade.sourceUrl)), "mock politician trades should use example.test source URLs only");
assert(politicianTrades.every((trade) => trade.liveProviderCalls !== true), "mock politician trade records should not claim live provider calls");
assert(politicianCsvImport.ok && politicianCsvImport.records[0].ticker === "MU", "politician CSV import should normalize a local disclosure row");
assert(politicianCsvImport.records[0].sourceMode === "local-file", "politician CSV import should preserve local-file source mode");
assert(createPoliticianTradeProvider("future-api").liveProviderCalls === false, "future politician trade provider should be safe and inactive");
assert(configuredPoliticianProvider.liveProviderCalls === true, "configured Senate Stock Watcher adapter should declare live provider calls");
assert(unconfiguredPoliticianConfig.liveProviderCalls === false, "unconfigured politician provider config should not claim live calls");
assert(configuredPoliticianConfig.liveProviderCalls === true, "configured politician provider config should be live-call ready");
assert(politicianProviderStatuses.senateStockWatcher.liveProviderCalls === false, "default politician provider status should keep public sync disabled");
assert(politicianProviderStatuses.localFile.status === "ready", "politician trade provider status should expose local file readiness");
assert(politicianTradesJs.includes("validatePoliticianTradeRecord"), "politician trade module should expose record validation");
assert(politicianTradesJs.includes("importPoliticianTradeFile"), "politician trade module should expose local CSV/JSON import");
assert(politicianTradesJs.includes("createPoliticianTradeProvider"), "politician trade module should expose provider interface");
assert(politicianTradesJs.includes("fetchPublicPoliticianTradeDataset"), "politician trade module should expose public dataset provider fetch");
assert(politicianTradesJs.includes("savePoliticianTrades"), "politician trade module should expose local storage helpers");
assert(politicianTradesJs.includes("fetchImpl"), "politician trade provider should use injectable fetch for tests and server proxying");
assert(!/node:http|node:https|axios|undici|puppeteer|playwright|cheerio/.test(politicianTradesJs), "politician trade provider should not import network/scraping clients");
assert(!/senate-stock-watcher-data\.s3|disclosures-clerk\.house\.gov|efdsearch\.senate\.gov\/search\/report/.test(politicianTradesJs), "politician trade browser module should not hardcode brittle official scraping endpoints");
assert(localServerJs.includes("/api/politician-trades"), "local backend should expose the politician trade provider endpoint");
assert(localDataContractsDoc.includes("Minimal Database Path"), "local data contracts doc should describe future database migration path");
assert(indexHtml.includes('<script src="./src/dataAdapters.js"></script>'), "index.html should load dataAdapters.js");
assert(indexHtml.includes('<script type="module" src="./src/app.js"></script>'), "index.html should load app.js as a module");
assert(indexHtml.includes('href="#market-drivers"'), "sidebar and digest should link to the Market Drivers route");
assert(indexHtml.includes('id="marketDriversHeroPanel"'), "Market Drivers route should include broad-market and AI/tech summary target");
assert(indexHtml.includes('id="marketDriversPanel"'), "Market Drivers route should include ranked driver target");
assert(routerJs.includes('"market-drivers"'), "router should include the Market Drivers route");
assert(routerJs.includes('"why-market"'), "router should include Market Drivers aliases");
assert(appJs.includes("buildMarketDriverReport"), "app.js should build the Market Drivers report from active state");
assert(appJs.includes("marketDrivers,"), "app.js should pass Market Drivers into render and Daily Brief");
assert(portfolioViewJs.includes("renderMarketDrivers"), "Portfolio view should render the Market Drivers screen");
assert(portfolioViewJs.includes("renderOverviewMarketDriversSnapshot"), "Overview should show a compact Market Drivers snapshot");
assert(portfolioViewJs.includes("renderMarketRegimeCard"), "Market Drivers screen should render a market regime panel");
assert(marketDataSelectionJs.includes('"market-driver-proxy"'), "market data selection should request market-driver proxies separately from default research tickers");
assert(!indexHtml.includes("https://cdn.plaid.com/link/v2/stable/link-initialize.js"), "Plaid CDN script should lazy-load only after Tucker starts the Plaid connector flow");
assert(appJs.includes("function loadPlaidLinkScript"), "app.js should lazy-load Plaid Link only when the connector flow starts");
assert(indexHtml.includes("<title>Market Pulse</title>"), "index.html should use the Market Pulse title");
assert(indexHtml.includes("<h1>Market Pulse</h1>"), "header should use the Market Pulse brand");
assert(indexHtml.includes("Local-first portfolio intelligence, risk signals, and decision support."), "header should include the approved command-center subtitle");
assert(indexHtml.includes("Export all holdings"), "header export action should use portfolio language, not legacy picks language");
assert(!indexHtml.includes("Export picks"), "header should not use legacy picks language");
assert(!indexHtml.includes('type="password"'), "dashboard should not include password fields");
assert(indexHtml.includes('id="providerReadinessPanel"'), "index.html should include provider readiness panel");
assert(indexHtml.includes("technical-details"), "duplicate provider diagnostics should be collapsed behind technical details");
assert(indexHtml.includes('id="attentionAlerts"'), "index.html should include attention alerts panel");
assert(indexHtml.includes('id="overview"'), "index.html should include Overview section");
assert(indexHtml.includes('href="#journal"'), "sidebar and digest should link to the Decision Journal route");
assert(indexHtml.includes('href="#calendar"'), "sidebar and digest should link to the Calendar route");
assert(indexHtml.includes('id="decisionJournalPanel"'), "Decision Journal screen should include the journal entries panel");
assert(indexHtml.includes('id="journalDecisionType"'), "Decision Journal editor should include decision type selection");
assert(routerJs.includes("journal:"), "router should define Decision Journal metadata");
assert(appJs.includes("growthDashboardDecisionJournal"), "Decision Journal should persist in localStorage");
assert(appJs.includes("decisionJournal: state.decisionJournal"), "dashboard JSON export should include Decision Journal entries");
assert(appJs.includes("normalizeJournalEntries(payload.decisionJournal)"), "dashboard JSON import should normalize Decision Journal entries");
assert(portfolioViewJs.includes("renderDecisionJournal"), "global Decision Journal screen should render journal entries");
assert(portfolioViewJs.includes("renderTickerJournalHistory"), "ticker detail pages should render recent Decision Journal entries");
assert(portfolioViewJs.includes("renderSeekingAlphaAiCoverage"), "Portfolio view should render the Seeking Alpha AI research coverage queue");
assert(portfolioViewJs.includes("Change since prior import") && portfolioViewJs.includes("Source alignment"), "ticker pages should show Seeking Alpha AI delta and source-alignment context");
assert(smokeSeekingAlphaAiCoverageQueue.summary.ownedCount >= 1, "Seeking Alpha AI research coverage queue should include owned tickers");
assert(smokeSeekingAlphaAiCoverageQueue.rows.some((row) => row.ticker === "MU" && row.coverageStatus !== "missing" && row.changeStatus !== "insufficient-history"), "Research Coverage should detect MU imported context and change history");
assert(smokeSeekingAlphaAiCoverageQueue.rows.some((row) => row.relationshipStatus === "owned" && row.coverageStatus === "missing"), "Research Coverage should surface owned tickers missing imported context");
assert(!/\b(buy now|sell now|place trade|guaranteed|predicts returns)\b/i.test(JSON.stringify(smokeSeekingAlphaAiCoverageQueue)), "Research Coverage output should avoid trade commands and predictive claims");
assert(portfolioViewJs.includes("renderTickerMovementExplainer"), "ticker detail pages should render a movement explainer section");
assert(portfolioViewJs.includes("Why Is This Moving?"), "ticker detail page should label the movement explainer plainly");
assert(movementExplainerJs.includes("does not infer news causation"), "movement explainer should avoid hallucinated news causation");
assert(muMovementExplainer.drivers.some((driver) => driver.id === "price-action"), "movement explainer should include observed price action");
assert(muMovementExplainer.drivers.some((driver) => driver.id === "volume-confirmation"), "movement explainer should include volume confirmation when available");
assert(muMovementExplainer.drivers.some((driver) => driver.id === "peer-context"), "movement explainer should include peer/benchmark context when available");
assert(!/\b(news caused|headline drove|guaranteed prediction)\b/i.test(JSON.stringify(muMovementExplainer)), "movement explainer should not invent causal news claims");
assert(journalRows.length >= 2, "sample mode should seed local Decision Journal examples");
assert(journalSummary.total >= 2 && journalSummary.withSignalSnapshot === 0, "Decision Journal summary should count local notes");
assert(muSignalSnapshot?.ticker === "MU" && Number.isFinite(muSignalSnapshot.combinedScore), "Decision Journal should capture ticker signal score snapshots");
assert(filterJournalRows(journalRows, { ticker: "MU" }).some((row) => row.ticker === "MU"), "Decision Journal filters should work by ticker");
assert(indexHtml.includes("not brokerage execution records") && portfolioViewJs.includes("not trade confirmations"), "Decision Journal copy should avoid brokerage execution language");
assert(indexHtml.includes('id="daily"'), "index.html should include Daily Brief section");
assert(indexHtml.includes('id="imports"'), "index.html should include Imports section");
assert(indexHtml.includes('id="alpha"'), "index.html should include Alpha Engine section");
assert(indexHtml.includes('id="research-coverage"'), "index.html should include Research Coverage section");
assert(indexHtml.includes('id="researchCoveragePanel"'), "Research Coverage route should expose the queue panel");
assert(indexHtml.includes('id="researchCoverageFilter"'), "Research Coverage route should include coverage filters");
assert(indexHtml.includes('id="market-intelligence"'), "index.html should include Market Intelligence section anchor");
assert(indexHtml.includes('href="#thesis"'), "sidebar should include Thesis navigation");
assert(indexHtml.includes('href="#watchlist"'), "sidebar should include Watchlist navigation");
assert(indexHtml.includes('href="#risk"'), "sidebar should include Risk navigation");
assert(indexHtml.includes('href="#market-intelligence"'), "sidebar should include Market Intelligence navigation");
assert(indexHtml.includes('href="#research-coverage"'), "sidebar should include Research Coverage navigation");
assert(indexHtml.includes('href="#signal-review"'), "sidebar should include Signal Review navigation");
assert(indexHtml.includes('href="#daily"'), "sidebar should include Daily Brief navigation");
assert(indexHtml.includes('href="#data-sources"'), "sidebar should include Data Sources navigation");
assert(indexHtml.includes('data-screen="overview"'), "index.html should define a focused Overview screen");
assert(indexHtml.includes('data-screen="daily"'), "index.html should define a focused Daily Brief screen");
assert(indexHtml.includes('data-screen="calendar"'), "index.html should define a focused Calendar screen");
assert(indexHtml.includes('data-screen="imports"'), "index.html should define a focused Imports screen");
assert(indexHtml.includes('data-screen="holdings"'), "index.html should define a focused Holdings screen");
assert(indexHtml.includes('data-screen="risk"'), "index.html should define a focused Risk screen");
assert(indexHtml.includes('data-screen="targets"'), "index.html should define a focused Targets screen");
assert(indexHtml.includes('data-screen="thesis"'), "index.html should define a focused Thesis screen");
assert(indexHtml.includes('data-screen="watchlist"'), "index.html should define a focused Watchlist screen");
assert(indexHtml.includes('data-screen="alerts"'), "index.html should define a focused Alerts screen");
assert(indexHtml.includes('data-screen="ticker"'), "index.html should define a focused Ticker detail screen");
assert(indexHtml.includes('id="tickerDetailPanel"'), "Ticker route should expose a detail panel");
assert(indexHtml.includes('data-screen="alpha"'), "index.html should define a focused Alpha Engine screen");
assert(indexHtml.includes('data-screen="market-intelligence"'), "index.html should define a focused Market Intelligence screen");
assert(indexHtml.includes('data-screen="research-coverage"'), "index.html should define a focused Research Coverage screen");
assert(indexHtml.includes('data-screen="signal-review"'), "index.html should define a focused Signal Review screen");
assert(indexHtml.includes('data-screen="data-sources"'), "index.html should define a focused Data Sources screen");
assert(indexHtml.includes('data-screen="settings"'), "index.html should define a focused Settings screen");
assert(routerJs.includes('"alpha-engine": "alpha"'), "router should support the Alpha Engine route alias from dashboard docs");
assert(routerJs.includes('"research-coverage"'), "router should support the Research Coverage route");
assert(routerJs.includes('"research-queue": "research-coverage"'), "router should support Research Coverage aliases");
assert(routerJs.includes('replace(/^\\/+/, "")'), "router should normalize slash-style local routes into focused hash screens");
assert(indexHtml.includes("nav-more"), "secondary research/planning tools should be grouped instead of competing with the main nav");
assert(indexHtml.includes('<details class="nav-more" open>'), "secondary research/planning tools should stay reachable on mobile");
assert(!/aside \.nav-more,\s*\.sidebar-card/s.test(indexHtml), "mobile nav should not hide secondary research routes");
assert(indexHtml.includes('id="riskTopPositionsPanel"'), "Risk route should include top position weights panel");
assert(indexHtml.includes('id="riskSectorExposurePanel"'), "Risk route should include sector exposure panel");
assert(indexHtml.includes('id="riskAccountExposurePanel"'), "Risk route should include account exposure panel");
assert(indexHtml.includes('id="riskLeveragedExposurePanel"'), "Risk route should include leveraged ETF exposure panel");
assert(indexHtml.includes('id="marketTickerSignalsPanel"'), "Market Intelligence route should include ticker signal cards panel");
assert(indexHtml.includes('id="signalReviewPanel"'), "Signal Review route should include signal review panel");
assert(indexHtml.includes('id="signalReviewFilter"'), "Signal Review route should include review filters");
assert(indexHtml.includes('id="dataSourceHealthPanel"'), "Data Sources route should include source readiness matrix panel");
assert(indexHtml.includes('id="settingsConfigurationPanel"'), "Settings route should include configuration placeholders panel");
assert(indexHtml.includes('id="alertThresholdSettings"'), "Settings route should include alert threshold settings");
assert(indexHtml.includes('id="saveAlertThresholdsBtn"'), "Settings route should include alert threshold save control");
assert(indexHtml.includes('id="dailyBriefSummaryPanel"'), "Daily Brief route should include a summary panel");
assert(indexHtml.includes('id="portfolioHealthPanel"'), "Daily Brief route should include the Portfolio Health Score panel");
assert(indexHtml.includes('id="dailyBriefActionNeeded"'), "Daily Brief route should include action-needed group");
assert(indexHtml.includes('id="dailyBriefWatchClosely"'), "Daily Brief route should include watch-closely group");
assert(indexHtml.includes('id="dailyBriefInformational"'), "Daily Brief route should include informational group");
assert(indexHtml.includes('id="calendarEventsPanel"'), "Calendar route should include upcoming event rows panel");
assert(indexHtml.includes('id="calendarEventFile"'), "Calendar route should include CSV/JSON import control");
assert(indexHtml.includes('id="marketCalendarEventsPanel"'), "Market Intelligence route should include calendar read-throughs");
assert(routerJs.includes("calendar: { title: \"Calendar\""), "router should define the Calendar route");
assert(appJs.includes("growthDashboardEventCalendar"), "Event Calendar should persist in localStorage");
assert(appJs.includes("eventCalendar: state.eventCalendar"), "dashboard JSON export should include event calendar rows");
assert(appJs.includes("normalizeCalendarEvents(payload.eventCalendar)"), "dashboard JSON import should normalize event calendar rows");
assert(portfolioViewJs.includes("renderCalendarEvents"), "portfolio view should render the dedicated Calendar screen");
assert(portfolioViewJs.includes("renderTickerEventCalendar"), "ticker pages should render upcoming events");
assert(eventCalendar.length >= 4, "sample mode should include mock event calendar rows");
assert(eventCalendarSummary.next7 >= 1, "event calendar summary should count near-term events");
assert(eventCalendarImport.eventsImported === 1 && eventCalendarImport.records[0].sourceMode === "imported", "calendar CSV import should normalize imported event rows");
assert(indexHtml.includes('id="watchlistIdeasPanel"'), "Watchlist route should include idea rows panel");
assert(indexHtml.includes('id="watchlistSummaryPanel"'), "Watchlist route should include summary panel");
assert(indexHtml.includes('id="watchlistQuickTicker"') && indexHtml.includes('id="quickAddWatchlistBtn"'), "Watchlist route should expose a quick add ticker flow");
assert(indexHtml.includes('id="watchlistStatusFilter"') && indexHtml.includes('id="watchlistSourceFilter"'), "Watchlist route should include status and source filters");
assert(routerJs.includes('watchlist: { title: "Watchlist"'), "router should expose Watchlist route metadata");
assert(appJs.includes("growthDashboardWatchlistIdeas"), "app should persist watchlist ideas locally");
assert(appJs.includes("quickAddWatchlistIdea"), "app should support simple user-managed watchlist add flow");
assert(appJs.includes("promoteTickerSignalToIdea"), "app should let ticker signals promote into the idea pipeline");
assert(indexHtml.includes('class="overview-digest-grid command-brief-grid overview-priority-grid"'), "Overview should use a compact command brief grid");
assert(indexHtml.includes("Portfolio Value & Daily Move"), "Overview should lead with portfolio value and daily move");
assert(indexHtml.includes('id="overviewDailySnapshot"'), "Overview should include a concise Daily Brief snapshot");
assert(indexHtml.includes('id="overviewHealthSnapshot"'), "Overview should include a concise Portfolio Health snapshot");
assert(indexHtml.includes("Top Gainers / Losers"), "Overview should include top gainers and losers");
assert(indexHtml.includes("Concentration Warnings"), "Overview should include concentration risk");
assert(indexHtml.includes("Highest Conviction"), "Overview should include highest-conviction holdings");
assert(indexHtml.includes("Source Health"), "Overview should include source health");
assert(indexHtml.includes(".mini-list > div > span"), "Overview mini-list rows should protect labels from one-letter wrapping");
assert(indexHtml.includes("workflow-shortcuts"), "Overview should move planning workflows into quieter shortcuts");
assert(indexHtml.includes('id="overviewTopMovers"'), "Overview should include a top movers digest card");
assert(indexHtml.includes('id="overviewConcentrationWarnings"'), "Overview should include a concentration warnings digest card");
assert(indexHtml.includes('id="overviewConvictionHoldings"'), "Overview should include a highest-conviction digest card");
assert(indexHtml.includes('id="overviewRecentAlerts"'), "Overview should include a recent alerts digest card");
assert(indexHtml.includes('id="overviewMarketSnapshot"'), "Overview should include a market intelligence snapshot digest card");
assert(indexHtml.includes('id="overviewConnectionStatus"'), "Overview should include a data connection status digest card");
assert(!indexHtml.includes('id="portfolioOverviewCards"'), "Overview should not keep the older crowded metric grid");
assert(!indexHtml.includes('id="overviewTopHoldings"'), "Overview should avoid extra holdings cards beyond the command brief");
assert(indexHtml.includes('data-route="#risk"'), "Overview digest cards should be directly clickable to deep screens");
assert(indexHtml.includes('data-route="#daily"'), "Overview should link to the Daily Command Brief screen");
assert(!indexHtml.includes('data-route="#journal"') && !indexHtml.includes('data-route="#watchlist"') && !indexHtml.includes('data-route="#what-if"'), "Planning workflows should not compete as primary Overview digest cards");
assert(/data-route="#daily" role="link" tabindex="0"/.test(indexHtml), "Overview digest cards should be keyboard-focusable route links");
assert(indexHtml.includes('id="routeStatus" class="sr-only" aria-live="polite"'), "route changes should announce the active screen");
assert(indexHtml.includes('id="mainContent" tabindex="-1"'), "main content should be focusable for route changes");
assert(indexHtml.includes('href="#alerts"'), "Overview digest should link to Alerts");
assert(indexHtml.includes('href="#alpha"'), "Overview digest should link to Alpha Engine");
assert(indexHtml.includes('href="#targets"'), "Overview digest should link to Targets");
assert(indexHtml.includes('href="#risk"'), "Overview digest should link to Risk");
assert(appJs.includes("function currentRoute"), "app.js should define hash route handling");
assert(appJs.includes("function routeFromHash"), "router should normalize and canonicalize hash routes");
assert(routerJs.includes("function parseTickerRoute"), "router module should parse ticker detail routes");
assert(routerJs.includes("routeFromHashValue"), "router module should expose pure hash route resolution");
assert(routerJs.includes("canonicalHash: `#/ticker/${encodeURIComponent(ticker)}`"), "ticker routes should canonicalize to #/ticker/TICKER");
assert(appJs.includes("selectedTicker: routeFromHash().ticker"), "render should pass selected ticker to portfolio view");
assert(appJs.includes("history.replaceState"), "router should replace invalid/alias hashes with canonical routes");
assert(appJs.includes("function focusActiveScreen"), "router should move focus when screens change");
assert(appJs.includes('window.scrollTo({ top: 0, left: 0, behavior: "auto" })'), "route focus should scroll new screens to the top");
assert(appJs.includes("window.addEventListener(\"hashchange\", render)"), "browser back/forward hash routing should re-render focused routes");
assert(appJs.includes("document.querySelectorAll(\"[data-screen]\")"), "router should toggle focused screens");
assert(appJs.includes("aria-current"), "router should mark active sidebar navigation");
assert(routerJs.includes("risk: { title: \"Risk\""), "router module should define the Risk route");
assert(routerJs.includes("daily: { title: \"Daily Brief\""), "router module should define the Daily Brief route");
assert(routerJs.includes("\"signal-review\": { title: \"Signal Review\""), "router module should define the Signal Review route");
assert(appJs.includes("buildSignalReviewRows"), "app.js should build Signal Review rows");
assert(appJs.includes("buildDailyCommandBrief"), "app.js should build the Daily Command Brief before rendering");
assert(appJs.includes("buildPortfolioHealth"), "app.js should build the Portfolio Health Score before rendering");
assert(portfolioViewJs.includes("function renderDailyCommandBrief"), "portfolio view should render the Daily Brief screen");
assert(portfolioViewJs.includes("function renderPortfolioHealthPanel"), "portfolio view should render the Portfolio Health Score panel");
assert(portfolioHealth.score > 0 && portfolioHealth.components.length === 6, "Portfolio Health Score should evaluate six local workflow components");
assert(portfolioHealth.nextActions.every((action) => action.href.startsWith("#")), "Portfolio Health Score actions should route inside the app");
assert(dailyBrief.groups["Action needed"].length >= 1, "Daily Brief should produce action-needed items from local alerts and drift");
assert(dailyBrief.groups["Watch closely"].length >= 1, "Daily Brief should produce watch-closely items from movers, signals, disclosures, or social summaries");
assert(dailyBrief.groups.Informational.length >= 1, "Daily Brief should produce informational source/context items");
assert(dailyBrief.items.some((row) => row.id === "daily:seeking-alpha-ai:MU" && row.dataStatus === "Imported Seeking Alpha AI"), "Daily Brief should include source-labeled Seeking Alpha AI personal import context");
assert(indexHtml.includes(".daily-brief-item-top .status-badge"), "Daily Brief badges should have a responsive wrapping rule");
assert(portfolioViewJs.includes("brief-action") && portfolioViewJs.includes("brief-watch"), "Daily Brief urgency badges should not reuse sample/demo data-mode classes");
assert(indexHtml.includes(".ticker-section-list > div"), "Ticker movement context rows should override the generic mini-list three-column grid");
assert(indexHtml.includes(".daily-brief-item-foot > span:empty"), "Daily Brief footer should hide empty placeholders instead of reserving awkward space");
assert(appJs.includes("Market Pulse"), "app.js should use Market Pulse in document titles");
assert(appJs.includes("handleDigestRouteClick"), "app.js should route clickable overview digest cards");
assert(appJs.includes("handleHoldingSort"), "app.js should wire clickable holdings table sorting");
assert(appJs.includes("updateHoldingSortHeaders"), "app.js should update holdings sort header state");
assert(portfolioViewJs.includes("export function tickerDetailHash"), "portfolio view should expose ticker detail hash helper");
assert(portfolioViewJs.includes("export function renderTickerLink"), "portfolio view should render ticker links with native anchors");
assert(portfolioViewJs.includes("safeExternalHref"), "portfolio view should sanitize imported/provider source links");
assert(appJs.includes("escapeHtml(record.ticker || \"UNKNOWN\")"), "import preview should render plain ticker text until holdings are applied");
assert(!appJs.includes("renderTickerLink(record.ticker || \"UNKNOWN\")"), "import preview should not navigate away through ticker links before apply");
assert(portfolioViewJs.includes("function renderTickerDetailPage"), "portfolio view should render ticker detail page");
assert(portfolioViewJs.includes("function renderSignalReview"), "portfolio view should render the Signal Review screen");
assert(portfolioViewJs.includes("Backtesting-lite"), "Signal Review should use exploratory backtesting-lite language");
assert(portfolioViewJs.includes("This is not a validated strategy or a prediction engine"), "Signal Review should not imply validated prediction power");
assert(portfolioViewJs.includes("buildTickerDetailModel"), "portfolio view should build ticker detail data from local state");
assert(appJs.includes("window.location.hash || pathRoute"), "ticker pages should support direct /ticker/SYMBOL path fallback");
assert(portfolioViewJs.includes("providerAvailability"), "ticker detail model should expose provider availability summary");
assert(portfolioViewJs.includes("function buildTickerContextLinks"), "ticker pages should expose portfolio/watchlist context links");
assert(portfolioViewJs.includes("Price Trend"), "ticker detail page should include a price trend section");
assert(portfolioViewJs.includes("Technical Signal Context"), "ticker detail page should include native technical-analysis context");
assert(portfolioViewJs.includes("Return distribution") && portfolioViewJs.includes("Spectral scan") && portfolioViewJs.includes("Regime proxy"), "ticker technical context should expose the deeper GitHub dashboard diagnostics");
assert(portfolioViewJs.includes("Reddit Mention Trend"), "ticker detail page should include a Reddit mention trend section");
assert(portfolioViewJs.includes("Politician Trade Activity"), "ticker detail page should include politician trade activity");
assert(portfolioViewJs.includes("Data Quality & Status"), "ticker detail page should include data quality/status coverage");
assert(portfolioViewJs.includes("normalizeHistoricalPrices"), "ticker detail model should normalize historical price series");
assert(portfolioViewJs.includes("renderTickerLink(holding.ticker)"), "holdings, movers, and risk ticker rows should link to detail pages");
assert(portfolioViewJs.includes("renderTickerLink(signal.ticker)"), "market signal tickers should link to detail pages");
assert(portfolioViewJs.includes("renderTickerChips(summary.visibleTickers)"), "affected-exposure ticker chips should link to detail pages");
assert(portfolioViewJs.includes("renderTickerLink(item.ticker)"), "alert/rebalance ticker chips should link to detail pages");
assert(indexHtml.includes('id="targets"'), "index.html should include Target Allocations section");
assert(indexHtml.includes('id="settings"'), "index.html should include Settings section");
assert(indexHtml.includes("--surface-elevated"), "index.html should include Apple-style surface design tokens");
assert(indexHtml.includes("--radius-large"), "index.html should include large-radius card tokens");
assert(indexHtml.includes("--shadow-soft"), "index.html should include soft-shadow design tokens");
assert(indexHtml.includes('id="thirtySecondBriefPanel"'), "index.html should include portfolio snapshot command panel");
assert(indexHtml.includes('id="firstRunOnboardingPanel"'), "Overview should include a guided first-run onboarding panel");
assert(indexHtml.includes(".first-run-card"), "first-run onboarding should use a styled app-native card");
assert(portfolioViewJs.includes("buildFirstRunOnboardingModel"), "portfolio view should build deterministic first-run onboarding state");
assert(portfolioViewJs.includes("Import your portfolio to begin"), "first-run onboarding should clearly guide no-data users to import");
assert(portfolioViewJs.includes("Sample portfolio is active"), "first-run onboarding should clearly label sample mode");
assert(portfolioViewJs.includes("data-overview-action=\"sample\""), "first-run onboarding should expose the existing sample-data action");
assert(portfolioViewJs.includes("holdings-empty-state"), "Holdings should show a first-run empty state instead of a filter-only message");
assert(indexHtml.includes('id="fidelityFile"'), "index.html should include Fidelity CSV import control");
assert(indexHtml.includes('aria-label="Import Fidelity CSV or holdings JSON file"'), "Fidelity CSV/JSON file input should have an accessible label");
assert(indexHtml.includes('id="fidelityDropZone"'), "Fidelity integration should expose a drag-and-drop import zone");
assert(indexHtml.includes('id="fidelityDropZone" class="fidelity-drop-zone" tabindex="0" role="button"'), "Fidelity drop zone should expose keyboard button semantics");
assert(appJs.includes("handleFidelityDropZoneKeydown") && appJs.includes('addEventListener("keydown", handleFidelityDropZoneKeydown)'), "Fidelity drop zone should support Enter/Space keyboard activation");
assert(indexHtml.includes('id="fidelityPasteInput"'), "Fidelity integration should support pasted export rows");
assert(indexHtml.includes('id="parseFidelityPasteBtn"'), "Fidelity pasted rows should have a preview action");
assert(indexHtml.includes('aria-label="Import Reddit mention JSON file"'), "Reddit JSON file input should have an accessible label");
assert(indexHtml.includes('aria-label="Import federal disclosure CSV or JSON file"'), "politician trade import input should have an accessible label");
assert(indexHtml.includes(".button-label:focus-within"), "file input labels should expose a visible keyboard focus state");
assert(indexHtml.includes(".digest-card[data-route]:focus-within"), "overview cards should show focus when their CTA link is focused");
assert(indexHtml.includes('class="skip-link" href="#mainContent"'), "app should expose a keyboard skip link to main content");
assert(!indexHtml.includes("Advanced dashboard filters"), "stale advanced dashboard filters should stay out of the holdings screen");
assert(indexHtml.includes('id="importSummaryPanel"'), "index.html should include import summary panel");
assert(indexHtml.includes('id="importDebugPanel"'), "index.html should include import debug panel");
assert(indexHtml.includes('id="targetAllocationsPanel"'), "index.html should include target allocations panel");
assert(indexHtml.includes('value="sell-and-rebalance"'), "Targets screen should expose a sell-and-rebalance simulator mode");
assert(indexHtml.includes('href="#what-if"'), "sidebar should include What-If simulator route");
assert(indexHtml.includes('id="what-if" data-screen="what-if"'), "index.html should include What-If screen");
assert(indexHtml.includes('id="whatIfAction"'), "What-If screen should include scenario action control");
assert(indexHtml.includes('id="whatIfTicker"'), "What-If screen should include ticker control");
assert(indexHtml.includes('id="whatIfSummaryPanel"'), "What-If screen should include summary panel");
assert(appJs.includes("simulateWhatIf"), "app.js should wire What-If simulation into render");
assert(appJs.includes("readWhatIfScenario"), "app.js should read What-If controls without persisting scenario state");
assert(portfolioViewJs.includes("renderWhatIfSimulator"), "Portfolio view should render What-If simulator output");
assert(indexHtml.includes('id="saveTargetsBtn"'), "index.html should include target save control");
assert(indexHtml.includes('id="resetTargetsBtn"'), "index.html should include target reset control");
assert(indexHtml.includes('id="exportTargetsBtn"'), "index.html should include target export control");
assert(indexHtml.includes('id="targetFile"'), "index.html should include target import control");
assert(indexHtml.includes('id="thesisStatusSelect"'), "index.html should include thesis status selector");
assert(indexHtml.includes('id="thesisAddConditions"'), "index.html should include thesis add-condition field");
assert(indexHtml.includes('id="thesisTrimConditions"'), "index.html should include thesis trim-condition field");
assert(indexHtml.includes('id="thesisExitReviewConditions"'), "index.html should include thesis exit/review field");
assert(indexHtml.includes('id="thesisNextReviewTrigger"'), "index.html should include thesis next-review trigger field");
assert(indexHtml.includes('id="thesisNotes"'), "index.html should include thesis notes field");
assert(indexHtml.includes('id="holdingViewMode"'), "index.html should include holdings view toggle");
assert(indexHtml.includes('id="portfolioHoldingsTable"'), "holdings table should expose a sortable table id");
assert(indexHtml.includes('data-sort-key="marketValue"'), "holdings table should make Market value sortable");
assert(indexHtml.includes('data-sort-key="ticker"'), "holdings table should make Ticker sortable");
assert(indexHtml.includes('class="sort-button" type="button"'), "holdings sort controls should use buttons inside column headers");
assert(!/<th data-sort-key="[^"]+"[^>]+role="button"/.test(indexHtml), "sortable holdings headers should keep native columnheader semantics");
assert(indexHtml.includes('id="holdingSortStatus"'), "holdings table should show current sort status");
assert(appJs.includes("Activate a column heading to sort"), "holdings sort status should be keyboard-friendly");
assert(indexHtml.includes("Account-level rows"), "holdings table should default to account-level rows");
assert(indexHtml.includes("Grouped by ticker"), "holdings table should offer grouped ticker view");
assert(indexHtml.includes("Primary flow"), "sidebar should emphasize the import-to-review workflow");
assert(indexHtml.includes("Try sample data"), "sample mode should provide a sample-data CTA");
assert(portfolioViewJs.includes("Sample data"), "rendered sample mode should be clearly labeled");
assert(indexHtml.includes("Source-labeled read-throughs"), "Alpha/Market Intelligence source mode should be clearly labeled");
assert(appJs.includes("Technical import details"), "import technical details should be collapsed");
assert(indexHtml.includes("Asset Mix"), "asset class section should use calmer portfolio wording");
assert(indexHtml.includes("Exposure Themes"), "sector section should use exposure-theme wording");
assert(appJs.includes("Skipped non-holding rows"), "app.js should use calm skipped-row import language");
assert(appJs.includes("portfolioUiState"), "app.js should define explicit portfolio UI state");
assert(appJs.includes("activePortfolioStatus"), "app.js should derive active portfolio status from one shared model");
assert(appJs.includes("state.marketDataSnapshot = null"), "portfolio load/reset paths should invalidate stale market data snapshots");
assert(appJs.includes("state.alertState = emptyAlertState()"), "portfolio load/reset paths should clear stale reviewed/hidden alert state");
assert(indexHtml.includes("Fidelity portfolio import"), "Data Sources should focus Fidelity on the working local import path");
assert(indexHtml.includes("Seeking Alpha AI personal import"), "Data Sources should expose Seeking Alpha AI personal import");
assert(indexHtml.includes("Paste Seeking Alpha AI output"), "Data Sources should allow pasted Seeking Alpha AI output preview");
assert(indexHtml.includes("Do not paste passwords, cookies, session tokens"), "Seeking Alpha AI UI should warn against credential material");
assert(appJs.includes("buildSeekingAlphaAiImportPreview"), "app.js should wire Seeking Alpha AI preview before save");
assert(appJs.includes("pendingSeekingAlphaAiImport"), "app.js should hold Seeking Alpha AI imports as pending previews before applying");
assert(seekingAlphaAiPreview.records.length === 1 && seekingAlphaAiPreview.importReport.health.status === "Preview ready", "Seeking Alpha AI preview should parse safe pasted output");
assert(seekingAlphaAiSecretPreview.records.length === 0 && seekingAlphaAiSecretPreview.importReport.rejectedRows.length === 1, "Seeking Alpha AI preview should reject cookie/session-like content");
assert(!indexHtml.includes("Start Fidelity connector") && !indexHtml.includes("Sync holdings"), "no-op Fidelity connector controls should not remain visible before a backend exists");
assert(indexHtml.includes("clearPortfolioBtn"), "Settings should expose a local clear portfolio control");
assert(portfolioViewJs.includes("Signal / not owned"), "ticker pages should distinguish signal-only tickers from watchlist-only tickers");
assert(portfolioViewJs.includes("renderPortfolioAttribution"), "Holdings screen should render contribution-to-return attribution");
assert(indexHtml.includes('id="portfolioAttributionPanel"'), "Holdings screen should include a portfolio attribution panel");
assert(portfolioAttribution.periods.daily.availableCount >= 1, "portfolio attribution should produce daily contribution rows");
assert(portfolioAttribution.rows.every((row) => row.ticker && row.daily), "portfolio attribution rows should stay ticker keyed with period details");
assert(portfolioViewJs.includes("STALE_PERSISTED_REPAIRED"), "portfolio UI should label repaired local holdings instead of treating them as sample data");
assert(appJs.includes("realPortfolioImport"), "app.js should distinguish real imports from sample/demo data");
assert(appJs.includes("import { normalizeSeekingAlphaWorkbook }"), "app.js should include Seeking Alpha workbook import path");
assert(appJs.includes("buildPortfolioDataQualitySummary"), "app.js should wire portfolio data quality into the UI");
assert(appJs.includes("growthDashboardAlertState"), "app.js should persist alert lifecycle state");
assert(appJs.includes("growthDashboardAlertThresholds"), "app.js should persist alert threshold settings");
assert(appJs.includes("buildLocalAlerts"), "app.js should generate local in-app alerts from the alert engine");
assert(appJs.includes("saveAlertThresholdsFromUi"), "app.js should save configurable alert thresholds");
assert(appJs.includes("growthDashboardTargetAllocations"), "app.js should persist target allocations");
assert(appJs.includes("targetAllocations: state.targetAllocations"), "state export should include target allocations");
assert(appJs.includes("buildThesisAlerts"), "app.js should wire thesis alerts into the attention system");
assert(appJs.includes("growthDashboardThesisSnapshots"), "app.js should persist thesis snapshots locally");
assert(appJs.includes("thesisSnapshots: state.thesisSnapshots"), "state export should include thesis snapshots");
assert(appJs.includes("buildDashboardStateRestorePreview") && appJs.includes("pendingStateRestore"), "dashboard state restore should preview before applying local backup data");
assert(appJs.includes("accountScope: state.accountScope") && appJs.includes("marketDataLiveMode: state.marketDataLiveMode"), "dashboard state backup should include local account scope and market data live-mode settings");
assert(indexHtml.includes('id="stateRestorePreview"') && appJs.includes("Apply restore") && appJs.includes("Cancel"), "settings should show an apply/cancel restore preview for state backups");
assert(indexHtml.includes('id="saveThesisSnapshotBtn"') && indexHtml.includes('id="thesisSnapshotPanel"'), "Thesis route should include snapshot save and history UI");
assert(portfolioViewJs.includes("renderTickerThesisSnapshotHistory"), "Ticker pages should render thesis snapshot history");
assert(thesisSnapshot.ticker === "MU" && thesisSnapshot.sourceType === "user-written", "thesis snapshots should normalize source labels");
assert(thesisSnapshotComparison.changed, "thesis snapshot comparison should detect current-vs-prior changes");
assert(appJs.includes("syncTickerTargetFromThesis"), "thesis target edits should sync into target allocations");
assert(appJs.includes("applyManualImportMapping"), "app.js should include manual CSV mapping fallback");
assert(appJs.includes("Preview before applying"), "app.js should render a pre-apply import preview");
assert(appJs.includes("applyPendingPortfolioImport"), "app.js should require explicit apply for portfolio imports");
assert(appJs.includes("async function applyPendingPortfolioImport"), "portfolio import apply should be able to refresh market data after replacing holdings");
assert(appJs.includes("await refreshMarketDataSnapshot({ renderAfter: false })"), "portfolio import apply should refresh market data for the newly imported tickers");
assert(appJs.includes('refreshMarketDataBtn")?.addEventListener("click", () => manualRefreshMarketDataSnapshot())'), "Refresh market data control should refresh market data rather than every provider source");
assert(appJs.includes("function canApplyPortfolioImport"), "app.js should prevent applying zero-holding portfolio imports");
assert(appJs.includes("Preview accepted rows before applying"), "app.js should allow accepted rows to apply while unresolved import rows stay visible");
assert(appJs.includes("First accepted rows from the Fidelity portfolio import preview"), "Fidelity preview should include an accessible table caption");
assert(appJs.includes("parsePastedFidelityHoldings"), "app.js should wire pasted Fidelity rows into the preview-before-apply path");
assert(appJs.includes("handleFidelityDrop"), "app.js should wire drag-and-drop Fidelity imports");
assert(appJs.includes("Map columns"), "manual Fidelity mapping should use human-readable copy");
assert(appJs.includes("Rows needing review"), "app.js should show row-review diagnostics for partial imports");
assert(appJs.includes("cancelPendingPortfolioImport"), "app.js should allow canceling a portfolio import preview");
assert(fidelityImportBranch.includes("buildPortfolioImportPreview") && fidelityImportBranch.includes("pendingCsvImport =") && fidelityImportBranch.includes("preview") && fidelityImportBranch.includes("persist: false") && fidelityImportBranch.includes("return;"), "Fidelity file uploads should stage a preview and return before mutating holdings");
assert(!fidelityImportBranch.includes("mergeImportedRecords"), "Fidelity file uploads should not merge holdings before preview confirmation");
assert(cancelImportFunction.includes("cancelPortfolioImportPreview") && !cancelImportFunction.includes("mergeImportedRecords") && !cancelImportFunction.includes("saveHoldings") && !cancelImportFunction.includes("saveLatestImportReport") && !cancelImportFunction.includes("saveFidelityStatus"), "canceling a portfolio import preview should not mutate or persist holdings");
assert(csvImportPreview.canApply && csvImportPreview.acceptedRows === csvResult.records.length, "portfolio import preview should stage all accepted CSV rows");
assert(canceledCsvImportPreview.changed === false && canceledCsvImportPreview.clearPendingPreview === true, "portfolio import preview cancel should clear pending state without applying holdings");
assert(appliedCsvImportPreview.changed && appliedCsvImportPreview.holdings.length === csvResult.records.length && appliedCsvImportPreview.fidelityStatus.mode === "csv-imported", "portfolio import preview confirm should produce applied holdings and CSV-imported status");
assert(appJs.includes("What changed since last import") && appJs.includes("renderImportChangeSummary"), "confirmed imports should render a portfolio change summary");
assert(appliedCsvImportPreview.importReport.changeSummary.removedPositions.some((row) => row.ticker === "OLD"), "portfolio import confirm should compare against the previous active portfolio");
assert(appliedCsvImportPreview.importReport.changeSummary.rowsSkipped >= 0 && appliedCsvImportPreview.importReport.changeSummary.rowsFlagged >= 0, "portfolio import change summary should include skipped and flagged row counts");
assert(marketDataSelectionJs.includes("!holding.cash && holding.assetClass !== \"Cash\"") && marketDataSelectionJs.includes("holding.marketDataEligible !== false"), "market data requests should skip cash-like and local-identifier holdings before calling live quote providers");
assert(portfolioViewJs.includes("Market data diagnostics"), "Data Sources should expose safe market-data provider diagnostics");
assert(portfolioViewJs.includes("coverageSummary") && portfolioViewJs.includes("52-week high/low") && portfolioViewJs.includes("Average volume") && portfolioViewJs.includes("ticker-provider-coverage"), "Finnhub diagnostics should expose per-ticker field coverage in Data Sources and ticker pages");
assert(indexHtml.includes('accept=".csv,.json,text/csv,application/json"'), "portfolio import should accept CSV and holdings JSON");
assert(csvResult.validation.ok, "sample CSV import path should validate");
assert(csvResult.records.some((record) => record.ticker === "NVDA"), "sample CSV import should include NVDA");
assert(csvResult.importReport.rowsParsed > 0, "CSV import should produce a debug report");
assert(csvResult.importReport.health.status === "Success", "CSV import should report health status");
assert(csvResult.importReport.providerReports.some((report) => report.columnMapping.ticker), "CSV import report should include ticker mapping");
assert(messyImportResult.validation.ok, "messy brokerage fixture should validate without crashing");
assert(messyImportResult.importReport.duplicateRows.length === 1, "messy brokerage fixture should merge duplicate ticker/account rows");
assert(messyImportResult.records.filter((record) => record.ticker === "MU").length === 1, "messy brokerage fixture should merge same-account MU rows");
assert(messyImportResult.importReport.rejectedRows.every((row) => row.classification === "non-holding row"), "messy brokerage fixture should classify footer rows as non-holding");
assert(jsonHoldingsResult.validation.ok, "holdings JSON import path should validate");
assert(jsonHoldingsResult.records.some((record) => record.ticker === "AMD" && record.accountType === "Taxable"), "holdings JSON import should normalize account type");
assert(tortureCsvResult.importReport.holdingsImported === 4 && tortureCsvResult.importReport.rejectedRows.length === 3, "torture CSV should import valid rows and reject bad rows without crashing");
assert(tortureJsonResult.importReport.holdingsImported === 2 && tortureJsonResult.importReport.rejectedRows.length === 2, "torture JSON should import valid rows and reject bad rows without crashing");
assert(malformedJsonResult.importReport.health.status === "Failed", "malformed holdings JSON should produce a structured failed import report");
assert(unquotedCommaCsv.records[0]?.marketValue === 1045, "safe unquoted thousands currency should repair into the market value column");
assert(trailingEmptyCellCsv.importReport.holdingsImported === 1 && trailingEmptyCellCsv.importReport.rejectedRows.length === 0, "Fidelity exports with trailing empty cells should import without manual mapping");
assert(ambiguousCommaCsv.importReport.rejectedRows.some((row) => row.reasons.join(" ").includes("column count mismatch")), "ambiguous comma currency should be rejected instead of shifted");
assert(duplicateAccountCsv.records.filter((record) => record.ticker === "MU").length === 2, "CSV import should preserve same ticker across accounts");
assert(fidelityCusipCsv.records[0]?.ticker === "MU", "Fidelity CUSIP-style exports should infer ticker from description instead of using the identifier as ticker");
assert(plaidRows[0]?.ticker === "MU", "Plaid connector module should normalize holdings");
assert(snapRows[0]?.ticker === "VGT", "SnapTrade connector module should normalize holdings");
assert(alpha.ticker === "NVDA" && Number(alpha.quant) > 4, "Seeking Alpha connector module should normalize ratings");
assert(analysis.overview.totalValue > 0, "portfolio value should be positive");
assert(analysis.alerts.length > 0, "attention alerts should exist");
assert(analysis.risk.decisionDashboard.topPositionWeights.length > 0, "decision-grade risk dashboard should rank top position weights");
assert(analysis.risk.decisionDashboard.themeExposure.some((row) => row.name === "AI / semiconductor"), "decision-grade risk dashboard should include AI/semiconductor theme exposure");
assert(analysis.risk.decisionDashboard.cashExposure.explanation.includes("not downside risk"), "cash risk row should explain deployment risk without fear-mongering");
assert(["normal", "elevated", "high", "extreme"].includes(analysis.risk.decisionDashboard.leveragedEtfExposure.status), "leveraged ETF exposure should include a threshold status");
assert(alertLifecycle.summary.reviewed === 1, "alert lifecycle should track reviewed alerts");
assert(alertLifecycle.summary.hidden === 1, "alert lifecycle should track hidden alerts");
assert(decisionBrief.topPrioritySignals.length > 0, "decision brief should include priority signals");
assert(alphaRecommendations.length > 0, "Alpha Engine should produce ranked recommendations");
assert(alphaRecommendations.every((row) => row.compositeRankScore >= 0 && row.compositeRankScore <= 100), "recommendation composite scores should be bounded 0-100");
assert(alphaRecommendations.map((row) => row.compositeRankScore).every((score, index, rows) => index === 0 || rows[index - 1] >= score), "recommendations should be sorted by composite rank score");
assert(alphaRecommendations.some((row) => row.id === "recommendation:alpha:alpha-samsung-strike-mu" && row.ticker === "MU"), "Samsung-to-MU signal should become a ranked recommendation");
assert(alphaRecommendations.some((row) => row.id === "recommendation:seeking-alpha-ai:MU" && /Seeking Alpha AI/.test(row.sourceFreshness)), "Alpha recommendations should include capped Seeking Alpha AI personal import context rows");
assert(alphaRecommendations.some((row) => row.recommendationType === "stale data review"), "recommendations should include stale/missing data review items");
assert(filterAlphaRecommendations(alphaRecommendations, "owned").every((row) => row.relatedHoldingsStatus === "owned"), "owned recommendation filter should only return owned rows");
assert(filterAlphaRecommendations(alphaRecommendations, "data-issues").every((row) => row.recommendationType === "stale data review" || row.dataQualityScore < 0.45 || row.missingWeakSignals.length >= 2), "data issue filter should only return weak/stale rows");
assert(alphaRecommendations.every((row) => Array.isArray(row.whyThisRank) && row.whyThisRank.length), "each recommendation should explain why it ranks where it does");
assert(decisionBrief.thesisImpactEvents.some((event) => event.ticker === "MU"), "decision brief should include Samsung-to-MU thesis impact");
assert(decisionBrief.noActionRecommendations.some((item) => item.id === "alpha-social-rumor-crdo"), "decision brief should downgrade low-quality rumor");
assert(demoSignals.length >= 5, "Alpha Engine should provide a useful demo signal set");
assert(normalizedSignals.every((signal) => signal.affectedTickers?.length), "Alpha Engine demo signals should normalize affected tickers");
assert(normalizedSignals.every((signal) => Array.isArray(signal.sourceLinks) && signal.sourceLinks.length > 0), "Alpha Engine demo signals should include news/research links");
assert(marketDataset.liveProviderCalls === false, "market provider adapters should not make live calls in demo mode");
assert(marketDataset.events.length >= 5, "market provider adapter contract should return demo events");
assert(marketDataset.providerStatuses.newsApi.missingEnv.includes("NEWSAPI_KEY"), "market provider adapter should show missing-key warnings");
assert(newsApiOnlyMarketDataset.liveProviderCalls === false, "news provider smoke should never make live calls without explicit implementation");
assert(newsApiOnlyMarketDataset.warnings.some((warning) => /NewsAPI is not configured.*NEWSAPI_KEY/.test(warning)), "NewsAPI smoke should surface missing-key warnings");
assert(newsApiOnlyMarketDataset.events.every((event) => event.headline && Array.isArray(event.affectedTickers) && event.affectedTickers.length), "NewsAPI smoke events should normalize headlines and affected tickers");
assert(newsApiOnlyMarketDataset.events.every((event) => event.sourceLinks?.every((link) => /^https:\/\//.test(link.url))), "NewsAPI smoke events should keep source links as safe HTTPS URLs");
assert(newsApiConfiguredMarketDataset.providerStatuses.newsApi.configured === true, "NewsAPI smoke should detect a configured key without enabling live calls");
assert(newsApiConfiguredMarketDataset.providerStatuses.newsApi.liveEnabled === false, "NewsAPI smoke should keep configured provider disabled until implementation is approved");
assert(newsApiConfiguredMarketDataset.warnings.some((warning) => /live calls are disabled/.test(warning)), "NewsAPI smoke should warn that configured keys are not enough for live calls");
assert(marketDataSnapshot.status.status === "mock/sample mode", "mock market data snapshot should expose mock/sample mode status");
assert(marketDataSnapshot.liveProviderCalls === false, "mock market data snapshot should not make live calls");
assert(marketDataSnapshot.quotesByTicker.MU.price === 132.1, "mock market data should include normalized MU quote");
assert(marketDataSnapshot.quotesByTicker.SPY && marketDataSnapshot.quotesByTicker.QQQ, "mock market data should include broad-market proxy quotes for Market Drivers");
assert(marketDataSnapshot.quotesByTicker.SMH && marketDataSnapshot.quotesByTicker.SOXX, "mock market data should include semiconductor proxy quotes for Market Drivers");
assert(holdingsWithMarketData.some((holding) => holding.ticker === "MU" && holding.marketDataIsMock), "mock market data should enrich holdings");
assert(["up", "down", "mixed", "unknown"].includes(marketDriverReport.broadMarket.direction), "Market Drivers should return a broad-market direction");
assert(["up", "down", "mixed", "unknown"].includes(marketDriverReport.aiTech.direction), "Market Drivers should return an AI/tech direction");
assert(["risk-on", "risk-off", "mixed", "overbought", "oversold", "defensive"].includes(marketDriverReport.marketRegime.regime), "Market Drivers should include a deterministic market regime classification");
assert(marketDriverReport.marketRegime.signals.length >= 6, "Market regime should expose contributing signals");
assert(marketDriverReport.broadMarket.drivers.length > 0, "Market Drivers should generate broad-market driver rows");
assert(marketDriverReport.aiTech.drivers.length > 0, "Market Drivers should generate AI/tech driver rows");
assert(marketDriverReport.aiTech.drivers.some((row) => row.href === "#risk" || row.href === "#market-intelligence"), "AI/tech drivers should link to relevant deep screens");
assert(dailyBrief.items.some((row) => row.id === "daily:market-driver:broad-market" && row.href === "#market-drivers"), "Daily Brief should include broad-market Market Drivers item");
assert(dailyBrief.items.some((row) => row.id === "daily:market-driver:ai-tech" && row.href === "#market-drivers"), "Daily Brief should include AI/tech Market Drivers item");
assert(!/\b(buy now|sell now|guaranteed|predicts returns)\b/i.test(JSON.stringify(marketDriverReport)), "Market Drivers should not issue trade commands or predictive claims");
assert(targetPlan.rows.some((row) => row.scope === "ticker" && row.key === "MU"), "target allocation plan should include MU");
assert(targetPlan.cashPlan.availableCash >= 0, "target allocation plan should include a cash deployment planner");
assert(targetPlan.leveragedGuardrails.some((item) => item.ticker === "UPRO" || item.ticker === "SOXL"), "target allocation plan should include leveraged ETF guardrails");
assert(targetPlan.suggestions.every((item) => /^Review|^Hold/i.test(item.action)), "rebalance suggestions should be review prompts, not trade commands");
assert(targetPlan.simulator?.readOnly === true, "target allocation plan should include a read-only rebalancing simulator");
assert(Array.isArray(targetPlan.simulator.beforeAfterRows), "rebalancing simulator should expose before/after allocation rows");
assert(Array.isArray(targetPlan.simulator.estimatedTrades), "rebalancing simulator should expose estimated ticker adjustments");
assert(portfolioViewJs.includes("renderRebalanceSimulator"), "Targets view should render the rebalancing simulator");
assert(portfolioViewJs.includes("No brokerage order, trade ticket, or execution step exists here."), "rebalancing simulator UI should explicitly avoid execution");
assert(whatIfResult.status === "ready", "What-If simulator should return a ready result for a valid scenario");
assert(whatIfResult.readOnly === true, "What-If simulator should explicitly be read-only");
assert(whatIfResult.deltas.totalValue.delta > 0, "external add scenario should show total value delta");
assert(whatIfResult.deltas.leveragedNotionalExposure.delta > 0, "SOXL add scenario should increase leveraged notional exposure");
assert(whatIfResult.tickerRows.some((row) => row.ticker === "SOXL" && row.deltaValue > 0), "What-If ticker comparison should include changed SOXL row");
assert(!appJs.includes("growthDashboardWhatIf"), "What-If scenario should not create localStorage persistence keys");
assert(normalizeTargetAllocations(defaultTargetAllocations()).length >= 10, "default target template should provide multiple allocation rows");
assert(thesisRows.some((row) => row.ticker === "MU" && row.alphaImpact.supporting.length), "thesis tracker should connect Alpha support to MU");
assert(thesisStats.needsAttention >= 0, "thesis tracker should return summary stats");
assert(thesisAlerts.some((alert) => alert.type.startsWith("thesis-")), "thesis tracker should produce review alerts");
assert(thesisAlerts.every((alert) => !/\bbuy\b|\bsell\b/i.test(`${alert.title} ${alert.detail}`)), "thesis alerts should not issue buy/sell commands");
assert(samsung, "Samsung strike to MU signal should exist");
assert(samsung.primaryTicker === "MU", "Samsung event should map to MU");
assert(samsung.thesisImpact === "supports thesis", "Samsung event should support MU thesis in demo mode");
assert(samsung.impactOrderByTicker.MU === "second-order", "Samsung event should be a second-order MU signal");
assert(samsung.actionabilityLevel !== "None", "Samsung event should be actionable enough to review or monitor");
assert(samsung.sourceLinks.some((link) => /Micron|MU|memory|DRAM/i.test(`${link.label} ${link.url}`)), "Samsung event should include MU memory research links");
assert(indexHtml.includes("Rank holdings by evidence quality."), "Alpha Engine UI should rank holdings first");
assert(portfolioViewJs.includes("evidence quality ranking for owned holdings") && /holdings-first ranking/.test(alphaEngineDoc), "Alpha Engine screen should explain the holding ranking model");
assert(indexHtml.includes("Institutional Quant Lens + academic factor discipline") && portfolioViewJs.includes("alphaQuantLensIntegratedScore"), "Alpha Engine quality rank should integrate the Quant Lens directly");
assert(indexHtml.includes('id="alphaRecommendationFilter"'), "Alpha Engine should include recommendation filters");
assert(indexHtml.includes("alpha-ranking-table"), "Alpha Engine should render a table-based holdings rank");
assert(portfolioViewJs.includes("buildRankedAlphaHoldingRows"), "Alpha route should build ranked holding rows");
assert(portfolioViewJs.includes("renderAlphaHoldingRankTable"), "Alpha route should render a table-based holdings rank");
assert(portfolioViewJs.includes("alpha-rank-details") && portfolioViewJs.includes("Explain score") && /Why this rank\?/.test(alphaEngineDoc), "Holding rank details should explain score drivers");
assert(portfolioAnalyticsJs.includes("riskScoreBreakdown") && portfolioViewJs.includes("renderTransparentScoreBreakdown"), "Risk and Alpha scores should expose transparent score math");
assert(portfolioViewJs.includes("Calculated local score; not an AI explanation") && portfolioViewJs.includes("Missing-data handling"), "Score explanation UI should distinguish calculated signals from AI explanations and missing-data handling");
assert(portfolioViewJs.includes("do not treat this as a forecast or trade instruction"), "Alpha Engine should avoid trade-command framing");
assert(portfolioViewJs.includes("buildAffectedExposureSummary"), "Market Intelligence should use a shared affected exposure summary helper");
assert(portfolioViewJs.includes("ticker-chips"), "Market Intelligence should render deduplicated ticker chips");
assert(portfolioViewJs.includes("renderRiskDeepDive"), "Risk route should render dedicated deep-dive panels");
assert(portfolioViewJs.includes("renderRiskConcentrationSummary"), "Risk route should render concentration summary panel");
assert(portfolioViewJs.includes("renderRiskThemeExposurePanel"), "Risk route should render theme exposure panel");
assert(portfolioViewJs.includes("renderRiskAssetMixPanel"), "Risk route should render asset mix and cash exposure panel");
assert(portfolioViewJs.includes("renderRiskCorrelationPanel"), "Risk route should render correlation and overlap panel");
assert(portfolioAnalyticsJs.includes("POSITION_CONCENTRATION_THRESHOLDS"), "Risk analytics should expose explicit 5/10/20/30 concentration thresholds");
assert(portfolioAnalyticsJs.includes("buildConcentrationInterpretation"), "Risk analytics should generate deterministic concentration interpretations");
assert(portfolioAnalyticsJs.includes("securityTypeExposure"), "Risk analytics should separate single stocks, normal ETFs, leveraged ETFs, and cash");
assert(portfolioAnalyticsJs.includes("LEVERAGED_ETF_UNDERLYING_DRAWDOWNS") && portfolioAnalyticsJs.includes("buildLeveragedEtfDrawdownScenarios"), "Risk analytics should model leveraged ETF drawdown scenarios");
assert(portfolioViewJs.includes("Measured pairs"), "Risk correlation panel should display measured pair correlations when history exists");
assert(indexHtml.includes("riskConcentrationSummaryPanel") && indexHtml.includes("riskThemeExposurePanel") && indexHtml.includes("riskCashExposurePanel") && indexHtml.includes("riskCorrelationPanel"), "Risk route should include decision-grade risk panel targets");
assert(indexHtml.includes(".risk-summary-card") && indexHtml.includes(".risk-summary-drivers"), "Risk concentration summary should have stable responsive styling");
assert(indexHtml.includes(".leveraged-scenario-grid") && indexHtml.includes("repeat(auto-fit, minmax(8rem, 1fr))") && portfolioViewJs.includes("riskLeveragedVolatilityDragModule") && portfolioViewJs.includes("Volatility Drag + Drawdown Scenarios"), "Risk route should show leveraged ETF volatility drag scenarios");
assert(indexHtml.includes("grid-template-columns: minmax(18rem, 1fr) max-content"), "Risk rows should reserve readable label width before value/action columns");
assert(indexHtml.includes(".risk-row-main.ranked") && indexHtml.includes("grid-template-columns: auto minmax(0, 1fr)"), "Top position risk rows should align rank and label horizontally");
assert(indexHtml.includes(".risk-row-main b,") && indexHtml.includes("word-break: keep-all"), "Risk ticker labels should not wrap one character per line");
assert(!/\.risk-row-main b,\s*[\r\n]+\s*\.risk-row-main span/.test(indexHtml), "Risk ticker headlines should not be included in break-word fallback rules");
assert(indexHtml.includes(".risk-row-value .button-link,") && indexHtml.includes("white-space: nowrap"), "Risk row action buttons should not crush text columns");
assert(indexHtml.includes(".market-tape-scroll") && indexHtml.includes("max-width: 100%") && indexHtml.includes("overflow-x: auto"), "Ticker tape should scroll inside its container on narrow screens");
assert(indexHtml.includes("grid-template-columns: repeat(2, minmax(0, 1fr))") && indexHtml.includes(".nav-group") && indexHtml.includes("display: contents"), "Mobile navigation should be a compact two-column route rail");
assert(indexHtml.includes(".sidebar-card.account-scope-card") && indexHtml.includes('id="accountScopePanel"'), "Account scope selector should stay reachable in the sidebar");
assert(indexHtml.includes("normal") && indexHtml.includes("elevated") && indexHtml.includes("extreme"), "Risk status labels should have visible styles");
assert(portfolioViewJs.includes("renderMarketTickerSignals"), "Market Intelligence route should render ticker watchlist signal cards");
assert(portfolioViewJs.includes("renderDataSourceHealth"), "Data Sources route should render future-source readiness matrix");
assert(portfolioViewJs.includes("buildDataSourceHealthSummary") && portfolioViewJs.includes("provider-backed") && portfolioViewJs.includes("Last success:") && portfolioViewJs.includes("Fallback:"), "Data Sources health should summarize provider-backed/local status, freshness, and fallback reasons");
assert(indexHtml.includes(".source-health-summary"), "Data Sources health summary should have dedicated responsive styling");
assert(portfolioViewJs.includes("renderSettingsConfiguration"), "Settings route should render local configuration placeholders");
assert(portfolioViewJs.includes("buildSettingsProviderStatusRows") && portfolioViewJs.includes("Provider configuration status"), "Settings should expose provider configuration status without showing secrets");
assert(portfolioViewJs.includes("data-provider-settings-row") && portfolioViewJs.includes("Last error:"), "Settings provider cards should show credential state, last success, and last error metadata");
assert(appJs.includes("aiProviders: config.aiProviders || {}") && appJs.includes("config.aiProviders?.openai?.liveProviderCalls"), "OpenAI provider readiness should pass from local backend config into Settings");
assert(portfolioViewJs.includes("Manual/imported holdings"), "Data Sources should show manual/imported holdings readiness");
assert(portfolioViewJs.includes("Reddit"), "Data Sources should include future Reddit source status");
assert(portfolioViewJs.includes("Reddit diagnostics"), "Data Sources should expose Reddit diagnostics without provider internals");
assert(indexHtml.includes("Sample X/social mode active. Live API: Not configured."), "Data Sources should make inactive X/Twitter status explicit");
assert(portfolioViewJs.includes("Federal disclosure diagnostics"), "Data Sources should expose federal disclosure diagnostics");
assert(portfolioViewJs.includes("Politician trades"), "Data Sources should include future politician trades source status");
assert(portfolioViewJs.includes("Data refresh"), "Settings should include data refresh configuration placeholder");
assert(portfolioViewJs.includes("Risk thresholds"), "Settings should include risk threshold configuration placeholder");
assert(portfolioViewJs.includes("Watchlist preferences"), "Settings should include watchlist preference placeholder");
assert(portfolioViewJs.includes("renderWatchlistIdeas"), "Portfolio view should render Watchlist / Ideas workflow");
assert(portfolioViewJs.includes("<span>Quote</span>"), "Watchlist cards should show quote context when available");
assert(portfolioViewJs.includes('data-watchlist-action="promote-signal"'), "Signal cards should expose Track idea promotion controls");
assert(watchlistIdeaRows.some((row) => row.status === "owned" && row.owned), "watchlist rows should derive owned status from holdings");
assert(filterWatchlistIdeaRows(watchlistIdeaRows, { status: "candidate" }).every((row) => row.status === "candidate"), "watchlist status filter should work");
assert(promotedWatchlist.some((row) => row.ticker === "CRDO"), "ticker signal promotion should save a CRDO idea");
assert(watchlistSummary.total >= watchlistIdeas.length, "watchlist summary should include saved and derived rows");
assert(portfolioViewJs.includes("isImportedState(uiState) ? holdings : []"), "Market Intelligence should not show sample exposure dollars as real portfolio exposure");
assert(!portfolioViewJs.includes("renderAffectedExposure(exposure)"), "Market Intelligence should not call the old raw affected exposure renderer");
assert(portfolioViewJs.includes("renderTargetAllocations"), "Target allocation UI should render current vs target rows");
assert(portfolioViewJs.includes("Cash deployment planner"), "Rebalance UI should include cash deployment planner");
assert(portfolioViewJs.includes("Leveraged ETF guardrails"), "Rebalance UI should include leveraged ETF guardrails");
assert(portfolioViewJs.includes("thesisReviewNote"), "Rebalance UI should include thesis review context");
assert(portfolioViewJs.includes("sortHoldingsForView"), "Portfolio view should sort holdings before rendering table rows");
assert(portfolioViewJs.includes("Invalidation"), "Thesis tracker UI should show invalidation criteria");
assert(portfolioViewJs.includes("Add if"), "Thesis tracker UI should show add conditions");
assert(portfolioViewJs.includes("Needs review now") && portfolioViewJs.includes("Positive thesis support"), "alerts should be grouped by action/severity");
assert(portfolioViewJs.includes('aria-label="Mark reviewed: ${actionLabel}"'), "repeated alert review buttons should have contextual labels");
assert(portfolioViewJs.includes('aria-label="Target weight for ${accessibleLabel}"'), "target allocation inputs should have contextual labels");
assert(exposureSummary.compactValueLabel === "$206.8K", "affected exposure summary should use compact dollars");
assert(exposureSummary.visibleTickers.join(",") === "MU,SOXL,NVDA,AMD", "affected exposure summary should deduplicate tickers");
assert(exposureSummary.uniqueTickers.length === new Set(exposureSummary.uniqueTickers).size, "affected exposure summary should not include duplicate tickers");
assert(signals.some((signal) => signal.id === "alpha-social-rumor-crdo" && signal.evidenceGrade === "D"), "weak social rumor should be downgraded");
assert(!/\bfetch\(\s*["'`]https?:\/\//.test(appJs + portfolioViewJs), "frontend should not make direct external fetches");
assert(appJs.includes('fetch("/api/config", { cache: "no-store" })'), "provider readiness should use same-origin config only");
assert(gitignore.includes("screenshots/") && gitignore.includes("test-results/") && gitignore.includes("playwright-report/"), "visual test artifacts should be ignored");
assert(gitignore.includes(".env") && gitignore.includes(".env.*") && gitignore.includes("!.env.example"), "environment files should be ignored except .env.example");
assert(gitignore.includes("tucker-dashboard-state-*.json"), "local dashboard state exports should be ignored");
assert(gitignore.includes("tucker-portfolio-dashboard-export.csv"), "portfolio exports should be ignored");
assert(gitignore.includes("tucker-target-allocations-*.json"), "target allocation exports should be ignored");
assert(!hasObviousHardcodedSecret(), "no obvious hardcoded secrets should be present");

console.log("Smoke checks passed.");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function mockResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload)
  };
}

function hasObviousHardcodedSecret() {
  const secretPattern = /(sk-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/;
  return listFiles(".")
    .some((file) => secretPattern.test(readFileSync(file, "utf8")));
}

function listFiles(path) {
  if (shouldSkipSmokeScanPath(path)) return [];
  const stat = statSync(path);
  if (stat.isFile()) return [path];
  return readdirSync(path).flatMap((entry) => listFiles(join(path, entry)));
}

function shouldSkipSmokeScanPath(path) {
  const normalized = path.replaceAll("\\", "/");
  return normalized === ".git" ||
    normalized === "node_modules" ||
    normalized.endsWith("/.git") ||
    normalized.includes("/.git/") ||
    normalized.endsWith("/node_modules") ||
    normalized.includes("/node_modules/") ||
    normalized.endsWith("/.DS_Store");
}
