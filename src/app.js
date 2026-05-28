import { downloadExportCsv } from "./dashboardView.js";
import { buildLocalAlerts, DEFAULT_ALERT_THRESHOLDS, normalizeAlertThresholds } from "./alertsEngine.js";
import { ACCOUNT_SCOPE_ALL, buildAccountScopeModel, filterHoldingsByAccountScope } from "./accountScope.js";
import { applyAlertState, emptyAlertState, filterVisibleAlphaSignals, hideAlert, markAlertReviewed, normalizeAlertState, restoreHiddenAlerts } from "./alertLifecycle.js";
import {
  buildSeekingAlphaInsights,
  demoSeekingAlphaPremiumData
} from "./seekingAlphaConnector.js";
import { actionCategorySeverity, buildAlphaSignals, buildDecisionBrief, demoAlphaEvents, demoThesisProfiles, signalActionCategory } from "./alphaEngine.js";
import { selectMarketDataTickers } from "./marketDataSelection.js";
import { buildMarketDriverReport, MARKET_DRIVER_DEFAULT_TICKERS } from "./marketDrivers.js";
import { buildMarketProviderStatuses } from "./marketEventProviders.js";
import { applyMarketDataToHoldings, buildMarketDataProviderConfig, buildMarketDataProviderStatuses, buildMockMarketDataSnapshot, shouldPreserveMarketDataSnapshot } from "./marketDataProvider.js";
import { buildMarketIntelligenceAlerts, demoMarketIntelligenceEvents } from "./marketIntelligence.js";
import { analyzePortfolio } from "./portfolioAnalytics.js";
import { buildPortfolioDataQualitySummary } from "./portfolioDataQuality.js";
import { buildPortfolioHealth } from "./portfolioHealth.js";
import { tuckerDemoHoldings } from "./portfolioDemoData.js";
import { buildPortfolioStatus, countHoldingRowsNeedingReview } from "./portfolioState.js";
import { buildDailyCommandBrief } from "./dailyCommandBrief.js";
import {
  buildPortfolioEvents,
  defaultCalendarEvents,
  EVENT_IMPORTANCE,
  EVENT_SOURCE_MODES,
  EVENT_TYPES,
  filterCalendarEvents,
  importCalendarEventFile,
  normalizeCalendarEvents,
  removeCalendarEvent,
  summarizeCalendarEvents,
  upsertCalendarEvent
} from "./eventCalendar.js";
import {
  buildJournalRows,
  DECISION_TYPES,
  defaultJournalEntries,
  filterJournalRows,
  JOURNAL_CONVICTIONS,
  normalizeJournalEntry,
  normalizeJournalEntries,
  removeJournalEntry,
  signalSnapshotForTicker,
  summarizeJournal,
  upsertJournalEntry
} from "./decisionJournal.js";
import { buildEquityRiskGuardrails } from "./equityRiskGuardrails.js";
import { mergeHoldingsByAccountAndTicker, normalizeHoldings, normalizeTicker } from "./portfolioSchema.js";
import { populatePortfolioFilters, renderPortfolioCommandCenter, renderTickerLink } from "./portfolioView.js";
import {
  exchangeFidelityPublicToken,
  fetchFidelityHoldingsPayload,
  normalizeProviderHoldings,
  requestFidelityLink,
  unlinkFidelityConnection
} from "./fidelityConnector.js";
import {
  buildPoliticianTradeProviderConfig,
  importPoliticianTradeFile,
  loadPoliticianTrades,
  normalizePoliticianTrades,
  persistPoliticianTradeCacheRecords,
  politicianTradeProviderStatuses,
  savePoliticianTrades
} from "./politicianTrades.js";
import {
  buildRedditProviderConfig,
  importRedditMentionFile,
  loadRedditMentions,
  normalizeRedditMentions,
  normalizeRedditSettings,
  persistRedditMentionCacheRecords,
  redditProviderStatuses,
  saveRedditMentions
} from "./redditSignals.js";
import {
  buildXProviderConfig,
  loadXUpdates,
  normalizeXSettings,
  normalizeXUpdates,
  saveXUpdates,
  xProviderStatuses
} from "./xUpdatesProvider.js";
import { buildAlphaRecommendations, filterAlphaRecommendations } from "./recommendationEngine.js";
import { enrichQuantLensContext, normalizeQuantScoreHistory, quantHistoryPortfolioMode, updateQuantScoreHistory } from "./quantLensContext.js";
import { summarizeSleeves } from "./rebalanceEngine.js";
import { APP_ROUTES as routes, ROUTE_ALIASES as routeAliases, routeFromHashValue } from "./router.js";
import { normalizeSeekingAlphaWorkbook } from "./seekingAlphaWorkbook.js";
import { buildSignalReviewRows, filterSignalReviewRows } from "./signalReview.js";
import { sanitizeImportedState, sanitizeStateForBackup } from "./stateSanitizer.js";
import {
  buildTargetAllocationPlan,
  defaultTargetAllocations,
  normalizeTargetAllocations,
  targetId,
  targetRecordFromFormRow
} from "./targetAllocations.js";
import { buildThesisAlerts, buildThesisRows, normalizeThesisProfile, thesisSummary } from "./thesisTracker.js";
import { buildCombinedTickerSignals, DEFAULT_TICKER_SIGNAL_WATCHLIST } from "./tickerSignals.js";
import { normalizeWhatIfScenario, simulateWhatIf } from "./whatIfSimulator.js";
import {
  buildWatchlistIdeaRows,
  defaultWatchlistIdeas,
  filterWatchlistIdeaRows,
  normalizeWatchlistIdea,
  normalizeWatchlistIdeas,
  promoteTickerSignalToIdea,
  removeWatchlistIdea,
  summarizeWatchlistIdeas,
  upsertWatchlistIdea,
  watchlistIdeaTickers,
  WATCHLIST_CONVICTIONS,
  WATCHLIST_IDEA_STATUSES,
  WATCHLIST_SIGNAL_SOURCES
} from "./watchlistIdeas.js";

const storageKey = "growthDashboardHoldings";
const fidelityStatusKey = "growthDashboardFidelityStatus";
const seekingAlphaStatusKey = "growthDashboardSeekingAlphaStatus";
const marketEventsKey = "growthDashboardMarketEvents";
const alphaEventsKey = "growthDashboardAlphaEvents";
const thesisProfilesKey = "growthDashboardThesisProfiles";
const targetAllocationsKey = "growthDashboardTargetAllocations";
const alertStateKey = "growthDashboardAlertState";
const alertThresholdsKey = "growthDashboardAlertThresholds";
const latestImportReportKey = "growthDashboardLatestImportReport";
const politicianTradesKey = "growthDashboardPoliticianTrades";
const politicianTradeImportReportKey = "growthDashboardPoliticianTradeImportReport";
const redditMentionsKey = "growthDashboardRedditMentions";
const redditImportReportKey = "growthDashboardRedditImportReport";
const redditSettingsKey = "growthDashboardRedditSettings";
const xUpdatesKey = "growthDashboardXUpdates";
const xUpdateImportReportKey = "growthDashboardXUpdateImportReport";
const xSettingsKey = "growthDashboardXSettings";
const redditBrowserCacheTtlMs = 15 * 60 * 1000;
const politicianTradeBrowserCacheTtlMs = 12 * 60 * 60 * 1000;
const browserCacheSnapshotWarning = "Restored from browser localStorage; refresh the provider before treating rows as current.";
const watchlistIdeasKey = "growthDashboardWatchlistIdeas";
const decisionJournalKey = "growthDashboardDecisionJournal";
const eventCalendarKey = "growthDashboardEventCalendar";
const eventCalendarImportReportKey = "growthDashboardEventCalendarImportReport";
const quantScoreHistoryKey = "growthDashboardQuantScoreHistory";
const marketDataLiveModeKey = "growthDashboardMarketDataLiveMode";
const accountScopeKey = "growthDashboardAccountScope";
const MARKET_DATA_LIVE_MODE_MIN_SECONDS = 60;
const MARKET_DATA_LIVE_MODE_MAX_SECONDS = 900;
const MARKET_DATA_LIVE_MODE_DEFAULT_SECONDS = 300;
const MARKET_DATA_LIVE_MODE_RATE_LIMIT_BACKOFF_SECONDS = 15 * 60;
const seekingAlphaEnrichmentFields = [
  "company",
  "sector",
  "quant",
  "quantRating",
  "authorRating",
  "wallStreetRating",
  "value",
  "valueGrade",
  "valuationGrade",
  "growth",
  "growthGrade",
  "profitability",
  "profitabilityGrade",
  "momentum",
  "momentumGrade",
  "revisions",
  "revisionsGrade",
  "epsRevisionsGrade",
  "revenueGrowth",
  "epsGrowth",
  "forwardPe",
  "dividendYield",
  "priceTarget",
  "ratingChanges",
  "nextEarnings",
  "saUpdatedAt",
  "source",
  "sources",
  "thesis"
];
const $ = (id) => document.getElementById(id);
const secretLikeMessagePattern = /(apikey|api_key|token|refresh_token|access_token|client_secret|secret|password|cookie|authorization)=([^&\s"']+)/gi;
const holdingSortLabels = {
  account: "account",
  assetClass: "asset class",
  costBasis: "cost basis",
  dailyChange: "daily change",
  dividendYield: "dividend yield",
  drift: "drift",
  growthGrade: "growth grade",
  marketValue: "market value",
  momentumGrade: "momentum grade",
  nextEarnings: "earnings date",
  portfolioWeight: "portfolio weight",
  price: "price",
  profitabilityGrade: "profitability grade",
  quant: "SA quant",
  revisionsGrade: "EPS revisions",
  riskLevel: "risk level",
  sector: "sector",
  shares: "shares",
  targetWeight: "target weight",
  thesisStatus: "thesis status",
  ticker: "ticker",
  unrealizedGainPercent: "gain/loss percent",
  valuationGrade: "valuation grade"
};

const state = {
  horizon: "swing",
  sortKey: "score",
  sortDirection: -1,
  holdingSortKey: "marketValue",
  holdingSortDirection: -1,
  riskGuardrailSortKey: "riskScore",
  riskGuardrailSortDirection: -1,
  accountScope: loadAccountScope(),
  holdings: loadHoldings(),
  fidelityStatus: loadFidelityStatus(),
  seekingAlphaStatus: loadSeekingAlphaStatus(),
  marketEvents: loadMarketEvents(),
  alphaEvents: loadAlphaEvents(),
  thesisProfiles: loadThesisProfiles(),
  targetAllocations: loadTargetAllocations(),
  alertState: loadAlertState(),
  alertThresholds: loadAlertThresholds(),
  latestImportReport: loadLatestImportReport(),
  politicianTrades: loadPoliticianTrades(localStorage, politicianTradesKey),
  politicianTradeImportReport: loadPoliticianTradeImportReport(),
  redditMentions: loadRedditMentions(localStorage, redditMentionsKey),
  redditImportReport: loadRedditImportReport(),
  redditSettings: loadRedditSettings(),
  xUpdates: loadXUpdates(localStorage, xUpdatesKey),
  xUpdateImportReport: loadXUpdateImportReport(),
  xSettings: loadXSettings(),
  watchlistIdeas: loadWatchlistIdeas(),
  decisionJournal: loadDecisionJournal(),
  eventCalendar: loadEventCalendar(),
  eventCalendarImportReport: loadEventCalendarImportReport(),
  quantScoreHistory: loadQuantScoreHistory(),
  marketDataLiveMode: loadMarketDataLiveMode(),
  marketDataSnapshot: null,
  providerReadiness: {
    mode: "static-demo",
    providerStatuses: buildMarketProviderStatuses({}),
    marketDataConfig: buildMarketDataProviderConfig({}),
    marketDataQuoteProviders: buildMarketDataProviderStatuses({}),
    politicianTradeProviderConfig: buildPoliticianTradeProviderConfig({}),
    politicianTradeProviderStatuses: politicianTradeProviderStatuses({}),
    redditProviderConfig: buildRedditProviderConfig({}),
    redditProviderStatuses: redditProviderStatuses({}),
    xProviderConfig: buildXProviderConfig({}),
    xProviderStatuses: xProviderStatuses({}),
    message: "Provider readiness is sample-only. Run npm run dev to start the local backend status checks.",
    liveProviderCalls: false
  }
};

let pendingCsvImport = null;
let activeRoute = null;
let lastHoldingSortStatusText = "";
let latestTickerSignals = [];
let marketDataLiveModeTimer = null;
let marketDataLiveModeInFlight = false;

function loadHoldings() {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const stored = JSON.parse(raw);
    return Array.isArray(stored) ? normalizeHoldings(stored) : [];
  } catch {
    return [];
  }
}

function safeSetLocalStorage(key, value) {
  try {
    if (localStorage.getItem(key) === value) return true;
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn(`Local storage save skipped for ${key}: ${error?.name || "storage error"}`);
    return false;
  }
}

function safeRemoveLocalStorage(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.warn(`Local storage remove skipped for ${key}: ${error?.name || "storage error"}`);
    return false;
  }
}

function compactPersistedReport(report) {
  if (!report || typeof report !== "object") return report;
  const compact = { ...report };
  for (const key of [
    "records",
    "fidelityRecords",
    "seekingAlphaRecords",
    "trades",
    "mentions",
    "events",
    "normalizedRecords",
    "acceptedRows",
    "acceptedRecords"
  ]) {
    if (Array.isArray(compact[key])) {
      compact[`${key}Count`] = compact[key].length;
      delete compact[key];
    }
  }
  if (Array.isArray(compact.rejectedRows) && compact.rejectedRows.length > 100) {
    compact.rejectedRows = compact.rejectedRows.slice(0, 100);
    compact.rejectedRowsTruncated = true;
  }
  return compact;
}

function persistedSourceReportForStorage(report, sourceType = "") {
  const compact = compactPersistedReport(report);
  if (!compact || typeof compact !== "object") return compact;
  if (!isProviderBackedSourceReport(compact, sourceType)) return compact;
  const freshness = browserCacheFreshness(compact, sourceType);
  return {
    ...compact,
    liveProviderCalls: false,
    cacheStatus: freshness,
    dataFreshness: freshness,
    status: freshness,
    browserCacheSnapshot: true,
    warnings: uniqueWarnings([browserCacheSnapshotWarning, compact.warning, ...(Array.isArray(compact.warnings) ? compact.warnings : [])])
  };
}

function isProviderBackedSourceReport(report = {}, sourceType = "") {
  if (sourceType === "reddit") {
    return Boolean(
      report.liveProviderCalls ||
      report.mode === "reddit-api" ||
      report.sourceMode === "api" ||
      report.providerId === "reddit-api"
    );
  }
  if (sourceType === "politician") {
    return Boolean(
      report.liveProviderCalls ||
      report.mode === "public-static-dataset" ||
      report.providerId === "senate-stock-watcher-public-dataset"
    );
  }
  return Boolean(report.liveProviderCalls);
}

function browserCacheFreshness(report = {}, sourceType = "") {
  const statusText = `${report.dataFreshness || ""} ${report.cacheStatus || ""} ${report.status || ""}`.toLowerCase();
  if (/stale|expired|error|failed|rate[-\s]?limited|429/.test(statusText)) return "stale";
  if (/cached|cache/.test(statusText)) return "cached";
  const fetchedAt = report.fetchedAt || report.importedAt || report.sourceAsOf;
  const fetchedMs = fetchedAt ? new Date(fetchedAt).getTime() : NaN;
  const ttl = sourceType === "reddit" ? redditBrowserCacheTtlMs : politicianTradeBrowserCacheTtlMs;
  if (Number.isFinite(fetchedMs) && Date.now() - fetchedMs > ttl) return "stale";
  return "cached";
}

function persistedReportFreshness(report = null, sourceType = "") {
  const persisted = persistedSourceReportForStorage(report, sourceType);
  return persisted?.dataFreshness || persisted?.cacheStatus || "cached";
}

function uniqueWarnings(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function saveHoldings() {
  safeSetLocalStorage(storageKey, JSON.stringify(state.holdings));
}

function loadAccountScope() {
  try {
    return localStorage.getItem(accountScopeKey) || ACCOUNT_SCOPE_ALL;
  } catch {
    return ACCOUNT_SCOPE_ALL;
  }
}

function saveAccountScope() {
  if (!state.accountScope || state.accountScope === ACCOUNT_SCOPE_ALL) {
    safeRemoveLocalStorage(accountScopeKey);
    return;
  }
  safeSetLocalStorage(accountScopeKey, state.accountScope);
}

function normalizeMarketDataLiveMode(value = {}) {
  const intervalSeconds = Number(value.intervalSeconds);
  const boundedInterval = Number.isFinite(intervalSeconds)
    ? Math.min(MARKET_DATA_LIVE_MODE_MAX_SECONDS, Math.max(MARKET_DATA_LIVE_MODE_MIN_SECONDS, Math.round(intervalSeconds)))
    : MARKET_DATA_LIVE_MODE_DEFAULT_SECONDS;
  return {
    enabled: Boolean(value.enabled),
    intervalSeconds: boundedInterval,
    lastRefreshAt: value.lastRefreshAt || null,
    nextRefreshAt: value.nextRefreshAt || null,
    backoffUntil: value.backoffUntil || null,
    lastStatus: value.lastStatus || null,
    lastError: value.lastError || null
  };
}

function loadMarketDataLiveMode() {
  try {
    return normalizeMarketDataLiveMode(JSON.parse(localStorage.getItem(marketDataLiveModeKey)) || {});
  } catch {
    return normalizeMarketDataLiveMode();
  }
}

function saveMarketDataLiveMode() {
  safeSetLocalStorage(marketDataLiveModeKey, JSON.stringify(state.marketDataLiveMode));
}

function loadFidelityStatus() {
  try {
    return JSON.parse(localStorage.getItem(fidelityStatusKey)) || {
      connected: false,
      provider: "plaid",
      lastSync: null,
      mode: "not-connected"
    };
  } catch {
    return { connected: false, provider: "plaid", lastSync: null, mode: "not-connected" };
  }
}

function saveFidelityStatus() {
  safeSetLocalStorage(fidelityStatusKey, JSON.stringify(state.fidelityStatus));
}

function loadSeekingAlphaStatus() {
  try {
    return JSON.parse(localStorage.getItem(seekingAlphaStatusKey)) || {
      connected: false,
      lastSync: null,
      mode: "not-connected",
      insights: null
    };
  } catch {
    return { connected: false, lastSync: null, mode: "not-connected", insights: null };
  }
}

function saveSeekingAlphaStatus() {
  safeSetLocalStorage(seekingAlphaStatusKey, JSON.stringify(state.seekingAlphaStatus));
}

function loadMarketEvents() {
  try {
    return JSON.parse(localStorage.getItem(marketEventsKey)) || demoMarketIntelligenceEvents();
  } catch {
    return demoMarketIntelligenceEvents();
  }
}

function saveMarketEvents() {
  safeSetLocalStorage(marketEventsKey, JSON.stringify(state.marketEvents));
}

function loadAlphaEvents() {
  try {
    const stored = JSON.parse(localStorage.getItem(alphaEventsKey));
    return Array.isArray(stored) && stored.length >= demoAlphaEvents().length ? stored : demoAlphaEvents();
  } catch {
    return demoAlphaEvents();
  }
}

function saveAlphaEvents() {
  safeSetLocalStorage(alphaEventsKey, JSON.stringify(state.alphaEvents));
}

function loadThesisProfiles() {
  try {
    return JSON.parse(localStorage.getItem(thesisProfilesKey)) || demoThesisProfiles();
  } catch {
    return demoThesisProfiles();
  }
}

function saveThesisProfiles() {
  safeSetLocalStorage(thesisProfilesKey, JSON.stringify(state.thesisProfiles));
}

function loadTargetAllocations() {
  try {
    const stored = JSON.parse(localStorage.getItem(targetAllocationsKey));
    return Array.isArray(stored) ? normalizeTargetAllocations(stored) : defaultTargetAllocations();
  } catch {
    return defaultTargetAllocations();
  }
}

function saveTargetAllocations() {
  safeSetLocalStorage(targetAllocationsKey, JSON.stringify(state.targetAllocations));
}

function loadAlertState() {
  try {
    return normalizeAlertState(JSON.parse(localStorage.getItem(alertStateKey)) || emptyAlertState());
  } catch {
    return emptyAlertState();
  }
}

function saveAlertState() {
  safeSetLocalStorage(alertStateKey, JSON.stringify(state.alertState));
}

function loadAlertThresholds() {
  try {
    return normalizeAlertThresholds(JSON.parse(localStorage.getItem(alertThresholdsKey)) || DEFAULT_ALERT_THRESHOLDS);
  } catch {
    return normalizeAlertThresholds(DEFAULT_ALERT_THRESHOLDS);
  }
}

function saveAlertThresholds() {
  state.alertThresholds = normalizeAlertThresholds(state.alertThresholds);
  safeSetLocalStorage(alertThresholdsKey, JSON.stringify(state.alertThresholds));
}

function loadLatestImportReport() {
  try {
    return JSON.parse(localStorage.getItem(latestImportReportKey)) || null;
  } catch {
    return null;
  }
}

function saveLatestImportReport() {
  if (state.latestImportReport) {
    safeSetLocalStorage(latestImportReportKey, JSON.stringify(compactPersistedReport(state.latestImportReport)));
  } else {
    safeRemoveLocalStorage(latestImportReportKey);
  }
}

function loadPoliticianTradeImportReport() {
  try {
    return persistedSourceReportForStorage(JSON.parse(localStorage.getItem(politicianTradeImportReportKey)) || null, "politician");
  } catch {
    return null;
  }
}

function savePoliticianTradeImportReport() {
  if (state.politicianTradeImportReport) {
    safeSetLocalStorage(politicianTradeImportReportKey, JSON.stringify(persistedSourceReportForStorage(state.politicianTradeImportReport, "politician")));
  } else {
    safeRemoveLocalStorage(politicianTradeImportReportKey);
  }
}

function loadRedditImportReport() {
  try {
    return persistedSourceReportForStorage(JSON.parse(localStorage.getItem(redditImportReportKey)) || null, "reddit");
  } catch {
    return null;
  }
}

function saveRedditImportReport() {
  if (state.redditImportReport) {
    safeSetLocalStorage(redditImportReportKey, JSON.stringify(persistedSourceReportForStorage(state.redditImportReport, "reddit")));
  } else {
    safeRemoveLocalStorage(redditImportReportKey);
  }
}

function loadXUpdateImportReport() {
  try {
    return JSON.parse(localStorage.getItem(xUpdateImportReportKey)) || null;
  } catch {
    return null;
  }
}

function saveXUpdateImportReport() {
  if (state.xUpdateImportReport) {
    safeSetLocalStorage(xUpdateImportReportKey, JSON.stringify(compactPersistedReport(state.xUpdateImportReport)));
  } else {
    safeRemoveLocalStorage(xUpdateImportReportKey);
  }
}

function loadRedditSettings() {
  try {
    return normalizeRedditSettings(JSON.parse(localStorage.getItem(redditSettingsKey)) || {});
  } catch {
    return normalizeRedditSettings();
  }
}

function saveRedditSettings() {
  state.redditSettings = normalizeRedditSettings(state.redditSettings);
  safeSetLocalStorage(redditSettingsKey, JSON.stringify(state.redditSettings));
}

function loadXSettings() {
  try {
    return normalizeXSettings(JSON.parse(localStorage.getItem(xSettingsKey)) || {});
  } catch {
    return normalizeXSettings();
  }
}

function saveXSettings() {
  state.xSettings = normalizeXSettings(state.xSettings);
  safeSetLocalStorage(xSettingsKey, JSON.stringify(state.xSettings));
}

function loadWatchlistIdeas() {
  try {
    const stored = JSON.parse(localStorage.getItem(watchlistIdeasKey));
    return Array.isArray(stored) ? normalizeWatchlistIdeas(stored) : defaultWatchlistIdeas();
  } catch {
    return defaultWatchlistIdeas();
  }
}

function saveWatchlistIdeas() {
  state.watchlistIdeas = normalizeWatchlistIdeas(state.watchlistIdeas);
  safeSetLocalStorage(watchlistIdeasKey, JSON.stringify(state.watchlistIdeas));
}

function loadDecisionJournal() {
  try {
    const stored = JSON.parse(localStorage.getItem(decisionJournalKey));
    return Array.isArray(stored) ? normalizeJournalEntries(stored) : [];
  } catch {
    return [];
  }
}

function saveDecisionJournal() {
  state.decisionJournal = normalizeJournalEntries(state.decisionJournal);
  safeSetLocalStorage(decisionJournalKey, JSON.stringify(state.decisionJournal));
}

function loadEventCalendar() {
  try {
    const stored = JSON.parse(localStorage.getItem(eventCalendarKey));
    return Array.isArray(stored) ? normalizeCalendarEvents(stored) : defaultCalendarEvents();
  } catch {
    return defaultCalendarEvents();
  }
}

function saveEventCalendar() {
  state.eventCalendar = normalizeCalendarEvents(state.eventCalendar);
  safeSetLocalStorage(eventCalendarKey, JSON.stringify(state.eventCalendar));
}

function loadEventCalendarImportReport() {
  try {
    return JSON.parse(localStorage.getItem(eventCalendarImportReportKey)) || null;
  } catch {
    return null;
  }
}

function saveEventCalendarImportReport() {
  if (state.eventCalendarImportReport) {
    safeSetLocalStorage(eventCalendarImportReportKey, JSON.stringify(compactPersistedReport(state.eventCalendarImportReport)));
  } else {
    safeRemoveLocalStorage(eventCalendarImportReportKey);
  }
}

function loadQuantScoreHistory() {
  try {
    return normalizeQuantScoreHistory(JSON.parse(localStorage.getItem(quantScoreHistoryKey)) || []);
  } catch {
    return [];
  }
}

function saveQuantScoreHistory() {
  safeSetLocalStorage(quantScoreHistoryKey, JSON.stringify(state.quantScoreHistory));
}

function render() {
  const renderAsOf = new Date().toISOString();
  const portfolioStatus = activePortfolioStatus(renderAsOf);
  const uiState = portfolioStatus.uiState;
  const alertThresholds = normalizeAlertThresholds(state.alertThresholds);
  const holdingsWithThesisTargets = applyThesisProfiles(state.holdings);
  const marketDataSnapshot = shouldPreserveMarketDataSnapshot(state.marketDataSnapshot)
    ? state.marketDataSnapshot
    : activeMarketDataSnapshot(buildMockMarketDataSnapshot(marketDataTickers(holdingsWithThesisTargets)));
  const holdingsWithMarketData = applyMarketDataToHoldings(holdingsWithThesisTargets, marketDataSnapshot, {
    dailyChangeMode: shouldReplaceDailyMoveFromMarketData(marketDataSnapshot) ? "replace" : "fill-missing"
  });
  const accountScopeModel = buildAccountScopeModel(holdingsWithMarketData, state.accountScope);
  if (accountScopeModel.selectedAccount !== state.accountScope) {
    state.accountScope = accountScopeModel.selectedAccount;
    saveAccountScope();
  }
  const scopedHoldings = accountScopeModel.scopedHoldings;
  renderAccountScopePanel(accountScopeModel);
  const analysisOptions = { ...alertThresholds, skipPortfolioThresholdAlerts: true };
  const baseAnalysis = analyzePortfolio(scopedHoldings, analysisOptions);
  const marketAlerts = buildMarketIntelligenceAlerts(state.marketEvents, baseAnalysis.holdings);
  const alphaSignals = buildAlphaSignals(state.alphaEvents, baseAnalysis.holdings, state.thesisProfiles);
  const alphaAlerts = alphaSignals.map((signal) => ({
    id: `alpha:${signal.id}`,
    type: "alpha-engine",
    severity: actionCategorySeverity(signalActionCategory(signal)),
    actionCategory: signalActionCategory(signal),
    title: `${signal.primaryTicker || "Portfolio"}: ${signal.thesisImpact}`,
    detail: `${signalActionCategory(signal)}: ${signal.actionabilityReason}`,
    ticker: signal.primaryTicker,
    score: signal.priorityScore
  }));
  const activeAlphaSignals = filterVisibleAlphaSignals(alphaSignals, state.alertState);
  const analysis = analyzePortfolio(scopedHoldings, { ...analysisOptions, marketAlerts: [...marketAlerts, ...alphaAlerts] });
  const equityRiskGuardrails = buildEquityRiskGuardrails(analysis.holdings, {
    totalValue: analysis.overview.totalValue
  });
  const targetPlan = buildTargetAllocationPlan(analysis.holdings, state.targetAllocations, { mode: $("rebalanceMode").value });
  const sleeves = summarizeSleeves(analysis.holdings);
  const thesisRows = buildThesisRows(analysis.holdings, state.thesisProfiles, {
    targetPlan,
    alphaSignals: activeAlphaSignals,
    totalValue: analysis.overview.totalValue
  });
  targetPlan.thesisRows = thesisRows;
  analysis.alerts = mergeAlerts(analysis.alerts, buildThesisAlerts(thesisRows));
  const watchlistTickers = combinedWatchlistTickers();
  const portfolioMode = quantHistoryPortfolioMode(uiState);
  const baseTickerSignals = buildCombinedTickerSignals({
    holdings: analysis.holdings,
    marketDataSnapshot,
    redditMentions: state.redditMentions,
    politicianTrades: state.politicianTrades,
    marketEvents: state.marketEvents,
    alphaSignals: activeAlphaSignals,
    watchlist: watchlistTickers,
    uiState
  });
  const tickerSignals = enrichQuantLensContext(baseTickerSignals, {
    history: state.quantScoreHistory,
    asOf: renderAsOf,
    portfolioMode
  });
  state.quantScoreHistory = updateQuantScoreHistory(state.quantScoreHistory, tickerSignals, {
    asOf: renderAsOf,
    portfolioMode
  });
  saveQuantScoreHistory();
  latestTickerSignals = tickerSignals;
  const watchlistIdeaRows = buildWatchlistIdeaRows({
    watchlistIdeas: state.watchlistIdeas,
    holdings: analysis.holdings,
    tickerSignals,
    thesisRows,
    marketDataSnapshot
  });
  syncWatchlistFilterOptions(watchlistIdeaRows);
  const watchlistFilters = readWatchlistFilters();
  const filteredWatchlistIdeaRows = filterWatchlistIdeaRows(watchlistIdeaRows, watchlistFilters);
  const portfolioEvents = buildPortfolioEvents({
    calendarEvents: state.eventCalendar,
    holdings: analysis.holdings,
    watchlistIdeas: watchlistIdeaRows,
    thesisRows,
    asOf: renderAsOf
  });
  syncCalendarFilterOptions(portfolioEvents);
  const calendarFilters = readCalendarFilters();
  const filteredCalendarEvents = filterCalendarEvents(portfolioEvents, calendarFilters, { asOf: renderAsOf });
  const calendarSummary = summarizeCalendarEvents(portfolioEvents, { asOf: renderAsOf });
  const journalRows = buildJournalRows({
    entries: state.decisionJournal,
    holdings: analysis.holdings,
    tickerSignals,
    watchlistIdeas: watchlistIdeaRows
  });
  syncJournalFilterOptions(journalRows);
  const journalFilters = readJournalFilters();
  const filteredJournalRows = filterJournalRows(journalRows, journalFilters);
  const signalReviewRows = filterSignalReviewRows(buildSignalReviewRows({
    tickerSignals,
    marketDataSnapshot,
    holdings: analysis.holdings,
    redditMentions: state.redditMentions,
    politicianTrades: state.politicianTrades,
    marketEvents: state.marketEvents,
    alphaSignals: activeAlphaSignals
  }), $("signalReviewFilter")?.value || "all");
  const localAlerts = buildLocalAlerts({
    analysis,
    tickerSignals,
    politicianTrades: state.politicianTrades,
    redditMentions: state.redditMentions,
    providerReadiness: state.providerReadiness,
    marketDataStatus: marketDataSnapshot.status,
    thresholds: alertThresholds,
    watchlist: watchlistTickers
  });
  analysis.alerts = mergeAlerts(analysis.alerts, localAlerts);
  const alertLifecycle = applyAlertState(analysis.alerts, state.alertState);
  analysis.alerts = alertLifecycle.visibleAlerts;
  const decisionBrief = buildDecisionBrief(activeAlphaSignals, analysis);
  const portfolioDataQuality = buildPortfolioDataQualitySummary(analysis, state.latestImportReport);
  const marketDrivers = buildMarketDriverReport({
    analysis,
    holdings: analysis.holdings,
    marketDataSnapshot,
    marketEvents: state.marketEvents,
    tickerSignals,
    xUpdates: state.xUpdates,
    redditMentions: state.redditMentions,
    politicianTrades: state.politicianTrades,
    providerReadiness: state.providerReadiness,
    uiState,
    asOf: renderAsOf
  });
  const dailyBrief = buildDailyCommandBrief({
    analysis,
    tickerSignals,
    marketDrivers,
    xUpdates: state.xUpdates,
    redditMentions: state.redditMentions,
    politicianTrades: state.politicianTrades,
    providerReadiness: state.providerReadiness,
    marketDataStatus: marketDataSnapshot.status,
    targetPlan,
    thesisRows,
    eventCalendar: portfolioEvents,
    portfolioDataQuality,
    uiState
  });
  const portfolioHealth = buildPortfolioHealth({
    analysis,
    thesisRows,
    targetPlan,
    alerts: analysis.alerts,
    marketDataStatus: marketDataSnapshot.status,
    portfolioDataQuality,
    uiState,
    asOf: renderAsOf
  });
  const alphaRecommendations = buildAlphaRecommendations({
    analysis,
    alphaSignals: activeAlphaSignals,
    tickerSignals,
    alerts: analysis.alerts,
    targetPlan,
    thesisRows,
    watchlistIdeas: watchlistIdeaRows,
    calendarEvents: portfolioEvents,
    marketDataStatus: marketDataSnapshot.status,
    providerReadiness: state.providerReadiness,
    uiState,
    asOf: renderAsOf
  });
  const alphaRecommendationFilter = $("alphaRecommendationFilter")?.value || "all";
  const filteredAlphaRecommendations = filterAlphaRecommendations(alphaRecommendations, alphaRecommendationFilter);
  const whatIfScenario = readWhatIfScenario();
  const whatIfResult = simulateWhatIf({
    holdings: analysis.holdings,
    scenario: whatIfScenario,
    targetPlan,
    alertThresholds,
    asOf: renderAsOf
  });
  populatePortfolioFilters(analysis.holdings, $("portfolioGroup").value);
  syncThesisEditorOptions(analysis.holdings);
  if (!document.activeElement?.closest?.("#thesisEditor")) {
    fillThesisEditor($("thesisTicker").value, analysis.holdings);
  }
  renderPortfolioCommandCenter(analysis, {
    query: $("query").value,
    viewMode: $("holdingViewMode").value,
    group: $("portfolioGroup").value,
    groupValue: $("portfolioGroupValue").value,
    risk: $("riskFilter").value,
    thesis: $("thesisFilter").value,
    hideTinyCash: $("hideTinyCash").checked,
    holdingSortKey: state.holdingSortKey,
    holdingSortDirection: state.holdingSortDirection,
    marketEvents: state.marketEvents,
    calendarEvents: filteredCalendarEvents,
    allCalendarEvents: portfolioEvents,
    calendarSummary,
    calendarFilters,
    eventCalendarImportReport: state.eventCalendarImportReport,
    marketDataSnapshot,
    marketDrivers,
    marketDataStatus: marketDataSnapshot.status,
    alphaSignals: activeAlphaSignals,
    alphaRecommendations: filteredAlphaRecommendations,
    allAlphaRecommendations: alphaRecommendations,
    alphaRecommendationFilter,
    tickerSignals,
    signalReviewRows,
    signalReviewFilter: $("signalReviewFilter")?.value || "all",
    equityRiskGuardrails,
    riskGuardrailFilter: $("riskGuardrailFilter")?.value || "all",
    riskGuardrailSortKey: state.riskGuardrailSortKey,
    riskGuardrailSortDirection: state.riskGuardrailSortDirection,
    decisionBrief,
    dailyBrief,
    portfolioHealth,
    whatIfScenario,
    whatIfResult,
    alertLifecycle,
    targetPlan,
    targetAllocations: state.targetAllocations,
    sleeves,
    thesisRows,
    thesisSummary: thesisSummary(thesisRows),
    uiState,
    portfolioStatus,
    portfolioDataQuality,
    latestImportReport: state.latestImportReport,
    fidelityStatus: state.fidelityStatus,
    seekingAlphaStatus: state.seekingAlphaStatus,
    providerReadiness: state.providerReadiness,
    politicianTrades: state.politicianTrades,
    politicianTradeImportReport: state.politicianTradeImportReport,
    xUpdates: state.xUpdates,
    xUpdateImportReport: state.xUpdateImportReport,
    xSettings: state.xSettings,
    redditMentions: state.redditMentions,
    redditImportReport: state.redditImportReport,
    redditSettings: state.redditSettings,
    watchlistIdeas: state.watchlistIdeas,
    watchlistIdeaRows: filteredWatchlistIdeaRows,
    allWatchlistIdeaRows: watchlistIdeaRows,
    watchlistIdeaSummary: summarizeWatchlistIdeas(watchlistIdeaRows),
    watchlistFilters,
    journalRows: filteredJournalRows,
    allJournalRows: journalRows,
    journalSummary: summarizeJournal(journalRows),
    journalFilters,
    alertThresholds,
    accountScope: accountScopeModel,
    selectedTicker: routeFromHash().ticker,
    asOf: renderAsOf
  });
  syncRedditSettingsInputs();
  syncXSettingsInputs();
  syncAlertThresholdInputs();
  updateMarketDataLiveModeControls();
  updateHoldingSortHeaders();
  updateRiskGuardrailSortHeaders();
  applyRoute();
  updateWhatIfInputVisibility();
}

function readWhatIfScenario() {
  return normalizeWhatIfScenario({
    action: $("whatIfAction")?.value || "add",
    ticker: $("whatIfTicker")?.value || "MU",
    amount: $("whatIfAmount")?.value || 0,
    percent: $("whatIfPercent")?.value || 0,
    targetWeight: $("whatIfTargetWeight")?.value || 0,
    fundingMode: $("whatIfFundingMode")?.value || "cash-first"
  });
}

function updateWhatIfInputVisibility() {
  const action = $("whatIfAction")?.value || "add";
  const visibility = {
    amount: ["add", "trim-dollar"].includes(action),
    percent: action === "trim-percent",
    target: action === "rebalance-target",
    funding: action === "add"
  };
  document.querySelectorAll("[data-what-if-field]").forEach((field) => {
    const key = field.dataset.whatIfField;
    field.hidden = visibility[key] === false;
  });
}

function refreshWhatIfScenario() {
  const status = $("whatIfStatus");
  if (status) {
    status.textContent = "Simulation refreshed. Real holdings were not changed.";
    status.className = "connector-status success";
  }
  render();
}

function resetWhatIfScenario() {
  if ($("whatIfAction")) $("whatIfAction").value = "add";
  if ($("whatIfTicker")) $("whatIfTicker").value = "MU";
  if ($("whatIfAmount")) $("whatIfAmount").value = "5000";
  if ($("whatIfPercent")) $("whatIfPercent").value = "25";
  if ($("whatIfTargetWeight")) $("whatIfTargetWeight").value = "";
  if ($("whatIfFundingMode")) $("whatIfFundingMode").value = "cash-first";
  updateWhatIfInputVisibility();
  const status = $("whatIfStatus");
  if (status) {
    status.textContent = "Scenario reset to a read-only $5,000 MU add using cash first.";
    status.className = "connector-status pending";
  }
  render();
}

function marketDataTickers(holdings = []) {
  const portfolioStatus = activePortfolioStatus();
  return selectMarketDataTickers({
    holdings,
    watchlistIdeas: state.watchlistIdeas,
    redditSettings: state.redditSettings,
    marketEvents: state.marketEvents,
    eventCalendar: state.eventCalendar,
    driverTickers: MARKET_DRIVER_DEFAULT_TICKERS,
    defaultTickers: DEFAULT_TICKER_SIGNAL_WATCHLIST,
    includeDefaultResearchTickers: !portfolioStatus.realPortfolio
  });
}

function currentRoute() {
  return routeFromHash().route;
}

function safeErrorMessage(error, fallback = "The operation failed safely.") {
  return String(error?.message || error || fallback)
    .replace(secretLikeMessagePattern, "$1=[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]")
    .replace(/[A-Za-z0-9_-]{32,}/g, "[redacted]")
    .slice(0, 240);
}

function routeFromHash() {
  return routeFromHashValue(window.location.hash, routes, routeAliases);
}

function applyRoute() {
  const { route, ticker, canonicalHash, shouldReplace } = routeFromHash();
  if (shouldReplace && window.location.hash !== canonicalHash) {
    history.replaceState(null, "", canonicalHash);
  }
  document.querySelectorAll("[data-screen]").forEach((screen) => {
    screen.hidden = screen.dataset.screen !== route;
  });
  document.querySelectorAll(".workspace-nav a").forEach((link) => {
    const linkRoute = routeAliases[link.hash.replace(/^#/, "")] || link.hash.replace(/^#/, "");
    const activeNavRoute = route === "ticker" ? "holdings" : route;
    link.classList.toggle("active", linkRoute === activeNavRoute);
    if (linkRoute === activeNavRoute) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
  document.querySelectorAll(".workspace-nav details").forEach((details) => {
    if (details.querySelector("a.active")) details.open = true;
  });
  const metadata = routes[route] || routes.overview;
  const title = route === "ticker" && ticker ? `${ticker} Intelligence` : metadata.title;
  const description = route === "ticker" && ticker ? `Ticker intelligence for ${ticker}.` : metadata.description;
  document.title = `${title} - Market Pulse`;
  const activeKey = route === "ticker" ? `${route}:${ticker || ""}` : route;
  if (activeRoute !== activeKey) {
    const previousRoute = activeRoute;
    activeRoute = activeKey;
    const routeStatus = $("routeStatus");
    if (routeStatus) routeStatus.textContent = `${title}. ${description}`;
    if (previousRoute !== null || route !== "overview") focusActiveScreen(route);
  }
}

function focusActiveScreen(route) {
  const activeScreen = document.querySelector(`[data-screen="${route}"]`);
  const heading = activeScreen?.querySelector?.(".screen-header h2");
  if (!heading) return;
  heading.setAttribute("tabindex", "-1");
  requestAnimationFrame(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    heading.focus({ preventScroll: true });
    setTimeout(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }), 0);
  });
}

function updateHoldingSortHeaders() {
  document.querySelectorAll("#portfolioHoldingsTable th[data-sort-key]").forEach((header) => {
    const active = header.dataset.sortKey === state.holdingSortKey;
    const label = holdingSortLabels[header.dataset.sortKey] || header.dataset.sortKey;
    const direction = active ? (state.holdingSortDirection === 1 ? "ascending" : "descending") : "not sorted";
    header.classList.toggle("sort-active", active);
    header.dataset.sortDirection = active && state.holdingSortDirection === 1 ? "asc" : "desc";
    header.setAttribute("aria-sort", active ? (state.holdingSortDirection === 1 ? "ascending" : "descending") : "none");
    header.setAttribute("title", `Sort by ${label}`);
    const button = header.querySelector(".sort-button");
    if (button) {
      button.setAttribute("aria-label", `Sort by ${label}. Current state: ${direction}.`);
      button.setAttribute("title", `Sort by ${label}`);
    }
  });
  const status = $("holdingSortStatus");
  if (status) {
    const label = holdingSortLabels[state.holdingSortKey] || state.holdingSortKey;
    const nextText = `Sorted by ${label}, ${state.holdingSortDirection === 1 ? "low to high" : "high to low"}. Activate a column heading to sort.`;
    if (nextText !== lastHoldingSortStatusText) {
      status.textContent = nextText;
      lastHoldingSortStatusText = nextText;
    }
  }
}

function handleHoldingSort(event) {
  const header = event.target.closest?.("#portfolioHoldingsTable th[data-sort-key]");
  if (!header || !event.target.closest?.(".sort-button")) return;
  event.preventDefault();
  const key = header.dataset.sortKey;
  if (state.holdingSortKey === key) {
    state.holdingSortDirection *= -1;
  } else {
    state.holdingSortKey = key;
    state.holdingSortDirection = defaultHoldingSortDirection(key);
  }
  render();
}

function handleHoldingSortKeydown(event) {
  if (!event.target.closest?.("#portfolioHoldingsTable th[data-sort-key]")) return;
  if (event.target.closest?.(".sort-button")) return;
  if (!["Enter", " "].includes(event.key)) return;
  handleHoldingSort(event);
}

function updateRiskGuardrailSortHeaders() {
  document.querySelectorAll("#riskGuardrailsTable th[data-risk-sort-key]").forEach((header) => {
    const active = header.dataset.riskSortKey === state.riskGuardrailSortKey;
    const label = header.textContent.trim();
    const direction = active ? (state.riskGuardrailSortDirection === 1 ? "ascending" : "descending") : "not sorted";
    header.classList.toggle("sort-active", active);
    header.dataset.sortDirection = active ? (state.riskGuardrailSortDirection === 1 ? "asc" : "desc") : "none";
    header.setAttribute("aria-sort", active ? (state.riskGuardrailSortDirection === 1 ? "ascending" : "descending") : "none");
    const button = header.querySelector(".sort-button");
    if (button) {
      button.setAttribute("aria-label", `Sort risk guardrails by ${label}. Current state: ${direction}.`);
      button.setAttribute("title", `Sort risk guardrails by ${label}`);
    }
  });
}

function handleRiskGuardrailSort(event) {
  const header = event.target.closest?.("#riskGuardrailsTable th[data-risk-sort-key]");
  if (!header || !event.target.closest?.(".sort-button")) return;
  event.preventDefault();
  const key = header.dataset.riskSortKey;
  if (state.riskGuardrailSortKey === key) {
    state.riskGuardrailSortDirection *= -1;
  } else {
    state.riskGuardrailSortKey = key;
    state.riskGuardrailSortDirection = defaultRiskGuardrailSortDirection(key);
  }
  render();
}

function defaultRiskGuardrailSortDirection(key = "") {
  const ascending = new Set(["symbol", "riskCategory", "riskAction", "gainLossFromCostPct", "drawdownFromRecentHighPct"]);
  return ascending.has(key) ? 1 : -1;
}

function defaultHoldingSortDirection(key = "") {
  const ascending = new Set(["ticker", "account", "sector", "assetClass", "thesisStatus", "riskLevel", "nextEarnings"]);
  return ascending.has(key) ? 1 : -1;
}

function routeToDigestCard(card) {
  const route = card?.dataset?.route;
  if (!route) return;
  window.location.hash = route;
}

function handleDigestRouteClick(event) {
  const card = event.target.closest?.("[data-route]");
  if (!card || event.target.closest?.("a, button, input, select, textarea, summary")) return;
  routeToDigestCard(card);
}

function handleDigestRouteKeydown(event) {
  const card = event.target.closest?.("[data-route]");
  if (!card || !card.hasAttribute("tabindex")) return;
  if (!card || !["Enter", " "].includes(event.key)) return;
  if (event.target.closest?.("a, button, input, select, textarea, summary")) return;
  event.preventDefault();
  routeToDigestCard(card);
}

function mergeAlerts(alerts = [], thesisAlerts = []) {
  return [...alerts, ...thesisAlerts]
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || (b.score || 0) - (a.score || 0))
    .slice(0, 36);
}

function renderAccountScopePanel(model = {}) {
  const target = $("accountScopePanel");
  if (!target) return;
  const accounts = Array.isArray(model.accounts) ? model.accounts : [];
  const selected = model.selectedAccount || ACCOUNT_SCOPE_ALL;
  const selectedSummary = model.selectedSummary || model.combined || {};
  if (!accounts.length) {
    target.innerHTML = `
      <div class="account-scope-head">
        <b>Portfolio scope</b>
        <span>No portfolio loaded</span>
      </div>
      <p class="account-scope-empty">Import Fidelity CSV or sync Plaid holdings to view accounts individually.</p>
    `;
    return;
  }
  const isPlaid = /plaid/i.test(String(state.fidelityStatus?.provider || state.fidelityStatus?.mode || ""));
  const accountCount = accounts.length;
  const accountNote = isPlaid && accountCount === 1
    ? "Plaid returned one investment account. Link or sync additional Fidelity accounts if you expected more."
    : `${accountCount} account${accountCount === 1 ? "" : "s"} available.`;
  target.innerHTML = `
    <div class="account-scope-head">
      <b>Portfolio scope</b>
      <span>${escapeHtml(accountNote)}</span>
    </div>
    <div class="account-scope-list" role="group" aria-label="Portfolio account views">
      ${renderAccountScopeButton({
        account: ACCOUNT_SCOPE_ALL,
        label: "All accounts",
        value: model.combined?.value || 0,
        detail: `${model.combined?.accountCount || accountCount} account${(model.combined?.accountCount || accountCount) === 1 ? "" : "s"} · ${model.combined?.holdingCount || 0} holding${(model.combined?.holdingCount || 0) === 1 ? "" : "s"} · cash ${formatPercent(model.combined?.cashWeight)}`,
        subdetail: `${formatSignedCurrency(model.combined?.dailyChange)} today (${formatSignedPercent(model.combined?.dailyChangePercent)})`,
        warning: accountScopeWarning(model.combined),
        selected: selected === ACCOUNT_SCOPE_ALL
      })}
      ${accounts.map((account) => renderAccountScopeButton({
        account: account.accountKey,
        label: account.account,
        value: account.value,
        detail: `${formatPercent(account.portfolioWeight)} of portfolio · ${account.holdingCount} holding${account.holdingCount === 1 ? "" : "s"} · cash ${formatPercent(account.cashWeight)}`,
        subdetail: `${account.accountTypeLabel} · largest ${account.largestHoldingLabel} ${formatPercent(account.largestHoldingWeight)}`,
        warning: accountScopeWarning(account),
        selected: selected === account.accountKey
      })).join("")}
    </div>
    <p id="accountScopeStatus" class="account-scope-footnote" aria-live="polite"><b>${escapeHtml(selectedSummary.label || model.selectedAccountLabel || "All accounts")}</b>: ${escapeHtml(formatCurrency(selectedSummary.value || 0))} across ${Number(selectedSummary.holdingCount) || 0} holding${Number(selectedSummary.holdingCount) === 1 ? "" : "s"}. ${escapeHtml(selected === ACCOUNT_SCOPE_ALL ? "Combined view powers every screen." : "This scope powers Overview, Holdings, Risk, Alpha, Alerts, Ticker pages, and What-If.")}</p>
  `;
}

function renderAccountScopeButton({ account, label, value, detail, subdetail = "", warning = "", selected }) {
  const ariaLabel = `${label}. ${formatCurrency(value)}. ${detail}${subdetail ? `. ${subdetail}` : ""}${warning ? `. ${warning}` : ""}${selected ? ". Selected." : ""}`;
  return `
    <button class="account-scope-button ${selected ? "active" : ""}" type="button" data-account-scope="${escapeHtml(account)}" data-account-label="${escapeHtml(label)}" data-account-value="${escapeHtml(value)}" data-account-holdings="${escapeHtml(label === "All accounts" ? "" : detail)}" aria-label="${escapeHtml(ariaLabel)}" title="${escapeHtml(ariaLabel)}" aria-pressed="${selected ? "true" : "false"}">
      <span>${escapeHtml(label)}${selected ? ' <em class="selected-marker">Selected</em>' : ""}</span>
      <b>${formatCurrency(value)}</b>
      <small>${escapeHtml(detail)}</small>
      ${subdetail ? `<small>${escapeHtml(subdetail)}</small>` : ""}
      ${warning ? `<em>${escapeHtml(warning)}</em>` : ""}
    </button>
  `;
}

function handleAccountScopeClick(event) {
  const button = event.target.closest?.("[data-account-scope]");
  if (!button) return;
  state.accountScope = button.dataset.accountScope || ACCOUNT_SCOPE_ALL;
  saveAccountScope();
  if ($("portfolioGroup")) $("portfolioGroup").value = "all";
  if ($("portfolioGroupValue")) $("portfolioGroupValue").value = "all";
  const status = $("routeStatus");
  if (status) {
    const label = button.dataset.accountLabel || state.accountScope;
    const value = Number(button.dataset.accountValue) || 0;
    status.textContent = state.accountScope === ACCOUNT_SCOPE_ALL
      ? `Showing combined portfolio across all accounts: ${formatCurrency(value)}.`
      : `Showing ${label} only: ${formatCurrency(value)}.`;
  }
  render();
}

function accountScopeWarning(row = {}) {
  const warnings = [];
  if (Number(row.missingCostBasisCount) > 0) warnings.push(`${row.missingCostBasisCount} missing basis`);
  if (Number(row.staleHoldingCount) > 0) warnings.push(`${row.staleHoldingCount} stale holding${row.staleHoldingCount === 1 ? "" : "s"}`);
  if (row.hasLeverageWarning) warnings.push(`leverage ${formatPercent(row.leveragedExposureWeight)}`);
  return warnings.slice(0, 3).join(" · ");
}

function portfolioUiState() {
  return activePortfolioStatus().uiState;
}

function activePortfolioStatus(asOf = new Date().toISOString()) {
  return buildPortfolioStatus({
    holdings: state.holdings,
    latestImportReport: state.latestImportReport,
    fidelityStatus: state.fidelityStatus,
    asOf
  });
}

function applyThesisProfiles(holdings) {
  return holdings.map((holding) => {
    const profile = normalizeThesisProfile(state.thesisProfiles[holding.ticker] || {}, holding);
    const tickerTarget = state.targetAllocations.find((target) => target.scope === "ticker" && target.key === holding.ticker);
    const targetWeight = Number(tickerTarget?.targetWeight || profile.targetAllocation);
    return {
      ...holding,
      targetWeight: Number.isFinite(targetWeight) && targetWeight > 0 ? targetWeight : holding.targetWeight,
      thesis: profile.whyOwned || holding.thesis,
      confidenceLevel: profile.confidenceLevel || holding.confidenceLevel,
      thesisStatus: profile.thesisStatus || holding.thesisStatus
    };
  });
}

function showImportStatus(result, options = {}) {
  const status = $("importStatus");
  if (!status) return;
  if (options.persist !== false && result.importReport && isPortfolioImport(result)) {
    state.latestImportReport = {
      ...result.importReport,
      realPortfolioImport: true,
      importedAt: new Date().toISOString()
    };
    saveLatestImportReport();
  }
  const health = result.importReport?.health;
  const portfolioImport = isPortfolioImport(result);
  const friendly = portfolioImport ? friendlyImportHealth(result.importReport) : null;
  const holdingRowsNeedingReview = countHoldingRowsNeedingReview(result?.importReport);
  status.textContent = options.preview && canApplyPortfolioImport(result)
    ? holdingRowsNeedingReview > 0
      ? `Import preview ready with row review. ${result.records?.length || 0} accepted holding${(result.records?.length || 0) === 1 ? "" : "s"} can be applied; ${holdingRowsNeedingReview} row${holdingRowsNeedingReview === 1 ? "" : "s"} will stay skipped until fixed.`
      : `Import preview ready. Review ${result.records?.length || 0} holding${(result.records?.length || 0) === 1 ? "" : "s"} below, then apply when it looks right.`
    : friendly?.message || health?.message || result.summary?.message || "Import complete.";
  const tone = friendly?.tone || (health?.tone === "error" || result.validation?.ok === false ? "error" : "success");
  status.className = `import-status ${tone}`;
  renderImportDebugPanel(result, options);
  if (options.render !== false) render();
  if (options.focus !== false) focusImportStatus();
}

function isPortfolioImport(result) {
  return (result.fidelityRecords || []).length > 0 ||
    (result.importReport?.providerReports || []).some((report) => report.provider === "fidelity" && report.holdingsImported > 0);
}

function canApplyPortfolioImport(result) {
  const blockedStatuses = new Set(["Failed", "Needs manual mapping"]);
  return Boolean(
    result?.validation?.ok &&
    isPortfolioImport(result) &&
    (result.records || []).length > 0 &&
    !blockedStatuses.has(result.importReport?.health?.status)
  );
}

function friendlyImportHealth(report, options = {}) {
  if (!report) return null;
  const skipped = skippedNonHoldingRows(report).length;
  const failedHoldingRows = countHoldingRowsNeedingReview(report);
  const applied = Boolean(options.applied);
  if (["Failed", "Needs manual mapping"].includes(report.health?.status)) {
    return { status: report.health.status, tone: "error", message: report.health.message };
  }
  if (failedHoldingRows > 0) {
    return {
      status: "Import needs row review",
      tone: "warning",
      message: applied
        ? `${report.holdingsImported} accepted holding${report.holdingsImported === 1 ? "" : "s"} applied. ${failedHoldingRows} holding-like row${failedHoldingRows === 1 ? "" : "s"} stayed skipped until fixed or manually mapped.`
        : `${report.holdingsImported} accepted holding${report.holdingsImported === 1 ? "" : "s"} can be applied. ${failedHoldingRows} holding-like row${failedHoldingRows === 1 ? "" : "s"} will stay skipped until fixed or manually mapped.`
    };
  }
  if (skipped > 0) {
    return {
      status: "Imported with skipped non-holding rows",
      tone: "success",
      message: `Portfolio imported successfully. ${skipped} Fidelity footer/disclaimer row${skipped === 1 ? "" : "s"} skipped. Review the summary below, then go to Overview.`
    };
  }
  return {
    status: "Portfolio imported",
    tone: "success",
    message: `Portfolio imported successfully. Review the summary below, then go to Overview.`
  };
}

function skippedNonHoldingRows(report = {}) {
  return (report.rejectedRows || []).filter((row) => row.classification === "non-holding row");
}

function renderImportDebugPanel(result, options = {}) {
  const target = $("importDebugPanel");
  if (!target) return;
  const report = result.importReport;
  const hasDiagnostics = Boolean(
    report?.health ||
    report?.rejectedRows?.length ||
    report?.mappingWarnings?.length ||
    report?.missingRequiredFields?.length
  );
  if (!report || (!hasDiagnostics && !report.rowsParsed && !report.detectedColumns?.length)) {
    target.innerHTML = "";
    target.hidden = true;
    return;
  }

  const mappingRows = Object.entries(report.columnMapping || {})
    .map(([field, column]) => `<span><b>${escapeHtml(field)}</b> ${escapeHtml(column || "not mapped")}</span>`)
    .join("");
  const canApply = options.preview && canApplyPortfolioImport(result);
  const holdingRowsNeedingReview = countHoldingRowsNeedingReview(report);
  const successCta = isPortfolioImport(result) && !canApply
    ? `
      <div class="connector-actions">
        <a class="button-link primary" href="#overview">Review Overview</a>
        <a class="button-link" href="#holdings">View Holdings</a>
      </div>
    `
    : "";
  const friendly = canApply
    ? {
        status: holdingRowsNeedingReview > 0 ? "Preview ready with row review" : "Preview ready",
        tone: holdingRowsNeedingReview > 0 ? "warning" : "success",
        message: holdingRowsNeedingReview > 0
          ? `${result.records?.length || 0} accepted holding${(result.records?.length || 0) === 1 ? "" : "s"} can be applied now. ${holdingRowsNeedingReview} row${holdingRowsNeedingReview === 1 ? "" : "s"} will remain skipped for review.`
          : "Review the normalized holdings below. Nothing changes until you apply this import."
      }
    : isPortfolioImport(result) ? friendlyImportHealth(report, { applied: options.applied }) : report.health;
  const skippedRows = skippedNonHoldingRows(report);
  const reviewRows = (report.rejectedRows || []).filter((row) => row.classification !== "non-holding row");
  const rejectedRows = reviewRows.slice(0, 6)
    .map((row) => `<li>Row ${escapeHtml(row.rowNumber)}: ${escapeHtml(row.classification || "needs review")} - ${escapeHtml(row.reasons.join(", "))}</li>`)
    .join("");
  const skippedRowDetails = skippedRows.slice(0, 6)
    .map((row) => `<li>Row ${escapeHtml(row.rowNumber)}: skipped non-holding row - ${escapeHtml(row.reasons.join(", "))}</li>`)
    .join("");
  const reviewRowsMore = reviewRows.length > 6
    ? `<li>${escapeHtml(reviewRows.length - 6)} more row${reviewRows.length - 6 === 1 ? "" : "s"} need review in the imported file.</li>`
    : "";
  const skippedRowsMore = skippedRows.length > 6
    ? `<li>${escapeHtml(skippedRows.length - 6)} more skipped non-holding row${skippedRows.length - 6 === 1 ? "" : "s"} in the imported file.</li>`
    : "";
  const missing = (report.missingRequiredFields || [])
    .map((item) => `<li>${escapeHtml(item.field)} missing on ${escapeHtml(item.count)} row${item.count === 1 ? "" : "s"}</li>`)
    .join("");
  const unsupported = (report.unsupportedColumns || [])
    .slice(0, 12)
    .map((column) => `<li>${escapeHtml(column)}</li>`)
    .join("");
  const warnings = (report.mappingWarnings || [])
    .map((warning) => `<li>${escapeHtml(warning)}</li>`)
    .join("");
  const duplicates = (report.duplicateRows || [])
    .map((row) => `<li>${escapeHtml(row.ticker || "Unknown")} in ${escapeHtml(row.account || "Unassigned")} merged from row${(row.rowNumbers || []).length === 1 ? "" : "s"} ${escapeHtml((row.rowNumbers || []).join(", ") || "unknown")}.</li>`)
    .join("");

  target.hidden = false;
  target.innerHTML = `
    <div class="import-health ${escapeHtml((friendly?.status || report.health?.status || "Failed").toLowerCase().replaceAll(" ", "-"))}">
      <b>${escapeHtml(friendly?.status || report.health?.status || "Import status")}</b>
      <span>${escapeHtml(friendly?.message || report.health?.message || "Review import details below.")}</span>
    </div>
    <div class="import-debug-grid">
      <div><b>File</b><span>${escapeHtml(report.fileName || "Local CSV")}</span></div>
      <div><b>Rows parsed</b><span>${escapeHtml(report.rowsParsed)}</span></div>
      <div><b>Accepted rows</b><span>${escapeHtml((result.records || []).length)}</span></div>
      <div><b>Holdings imported</b><span>${escapeHtml(report.holdingsImported)}</span></div>
      <div><b>Rows needing review</b><span>${escapeHtml(holdingRowsNeedingReview)}</span></div>
      <div><b>Skipped non-holding rows</b><span>${escapeHtml(skippedRows.length)}</span></div>
      <div><b>Total market value</b><span>${formatCurrency(report.totalMarketValue)}</span></div>
    </div>
    ${canApply ? renderImportPreview(result) : successCta}
    <details>
      <summary>Technical import details</summary>
      <p><b>Detected columns:</b> ${escapeHtml((report.detectedColumns || []).join(", ") || "none")}</p>
      <p><b>Tickers detected:</b> ${escapeHtml((report.tickersDetected || []).join(", ") || "none")}</p>
      <p><b>Accounts detected:</b> ${escapeHtml((report.accountsDetected || []).join(", ") || "none")}</p>
      <div class="import-mapping-used">${mappingRows || "<span>No automatic mapping detected.</span>"}</div>
      ${warnings ? `<p><b>Mapping warnings</b></p><ul>${warnings}</ul>` : ""}
      ${duplicates ? `<p><b>Duplicate ticker/account rows merged</b></p><ul>${duplicates}</ul>` : ""}
      ${missing ? `<p><b>Missing required fields</b></p><ul>${missing}</ul>` : ""}
      ${skippedRowDetails ? `<p><b>Skipped non-holding rows</b> <span>Fidelity footer, disclaimer, and account-container rows are harmless when holdings imported successfully.</span></p><ul>${skippedRowDetails}${skippedRowsMore}</ul>` : ""}
      ${rejectedRows ? `<p><b>Rows needing review</b></p><ul>${rejectedRows}${reviewRowsMore}</ul>` : ""}
      ${unsupported ? `<p><b>Unsupported/unmapped columns</b></p><ul>${unsupported}</ul>` : ""}
    </details>
    ${pendingCsvImport ? renderManualMappingControls(report) : ""}
  `;
}

function renderImportPreview(result) {
  const holdingRowsNeedingReview = countHoldingRowsNeedingReview(result.importReport);
  const accounts = result.importReport?.accountsDetected?.length || 0;
  const totalValue = result.importReport?.totalMarketValue || 0;
  const rows = (result.records || []).slice(0, 8)
    .map((record) => `
      <tr>
        <td>${escapeHtml(record.ticker || "UNKNOWN")}</td>
        <td>${escapeHtml(record.account || "Unassigned")}</td>
        <td class="num">${formatNumber(record.shares)}</td>
        <td class="num">${formatCurrency(record.price)}</td>
        <td class="num">${formatCurrency(record.marketValue)}</td>
        <td>${escapeHtml(record.accountType || "Unknown")}</td>
      </tr>
    `)
    .join("");
  const remaining = Math.max(0, (result.records || []).length - 8);

  return `
    <div class="import-preview-card" role="region" aria-label="Portfolio import preview">
      <div>
        <b>${holdingRowsNeedingReview > 0 ? "Preview accepted rows before applying" : "Preview before applying"}</b>
        <span>${holdingRowsNeedingReview > 0
          ? `${holdingRowsNeedingReview} holding-like row${holdingRowsNeedingReview === 1 ? "" : "s"} will stay skipped for review. Applying will replace the current portfolio with the accepted holdings shown here.`
          : "This will replace the current portfolio holdings only after you choose Apply import."}</span>
        <span>${result.records?.length || 0} holding${(result.records?.length || 0) === 1 ? "" : "s"} · ${accounts || "No"} account${accounts === 1 ? "" : "s"} · ${formatCurrency(totalValue)}</span>
      </div>
      <div class="table-wrap preview-table-wrap">
        <table class="preview-table">
          <caption>First accepted rows from the Fidelity portfolio import preview</caption>
          <thead>
            <tr>
              <th scope="col">Ticker</th>
              <th scope="col">Account</th>
              <th scope="col" class="num">Shares</th>
              <th scope="col" class="num">Price</th>
              <th scope="col" class="num">Market value</th>
              <th scope="col">Account type</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="6">No previewable holdings found.</td></tr>'}</tbody>
        </table>
      </div>
      ${remaining ? `<p class="section-note">${remaining} more holding${remaining === 1 ? "" : "s"} will be imported.</p>` : ""}
      <div class="connector-actions">
        <button type="button" class="primary" data-import-action="apply-preview">${holdingRowsNeedingReview > 0 ? "Apply accepted rows" : "Apply import"}</button>
        <button type="button" data-import-action="cancel-preview">Cancel preview</button>
      </div>
    </div>
  `;
}

function focusImportStatus() {
  const status = $("importStatus");
  if (!status) return;
  status.setAttribute("tabindex", "-1");
  status.focus({ preventScroll: false });
}

function renderManualMappingControls(report) {
  const fields = pendingCsvImport?.provider === "fidelity"
    ? [
        ["ticker", "Ticker / Symbol"],
        ["company", "Company / Description"],
        ["account", "Account"],
        ["accountType", "Account type"],
        ["shares", "Shares / Quantity"],
        ["price", "Price"],
        ["marketValue", "Market value"],
        ["costBasis", "Cost basis"],
        ["unrealizedGain", "Gain/loss"],
        ["unrealizedGainPercent", "% gain/loss"],
        ["type", "Security type"],
        ["sector", "Sector"]
      ]
    : [
        ["ticker", "Ticker / Symbol"],
        ["company", "Company"],
        ["quant", "Quant rating"],
        ["growth", "Growth grade"],
        ["momentum", "Momentum grade"],
        ["revisions", "EPS revisions grade"],
        ["nextEarnings", "Next earnings"]
      ];
  const columns = report.detectedColumns || [];
  const selects = fields.map(([field, label]) => {
    const mapped = report.columnMapping?.[field] || "";
    return `
      <label>
        <span>${escapeHtml(label)}</span>
        <select data-import-map-field="${escapeHtml(field)}">
          <option value="">Not mapped</option>
          ${columns.map((column) => `<option value="${escapeHtml(column)}" ${column === mapped ? "selected" : ""}>${escapeHtml(column)}</option>`).join("")}
        </select>
      </label>
    `;
  }).join("");

  return `
    <details class="manual-mapping">
      <summary>Map columns</summary>
      <p>Use this when the automatic detector picked the wrong column or could not find your Fidelity headers.</p>
      <div class="manual-mapping-grid">${selects}</div>
      <button type="button" class="primary" data-import-action="apply-mapping">Apply mapping and import</button>
    </details>
  `;
}

function applyManualImportMapping() {
  if (!pendingCsvImport) {
    showImportStatus({ validation: { ok: false }, summary: { message: "No CSV import is waiting for manual mapping." } });
    return;
  }
  const adapters = globalThis.DataAdapters;
  const columnMapping = Object.fromEntries(
    Array.from(document.querySelectorAll("[data-import-map-field]"))
      .map((select) => [select.dataset.importMapField, select.value])
      .filter(([, value]) => value)
  );
  const result = buildCsvImportResult(pendingCsvImport.provider, pendingCsvImport.csv, adapters, {
    fileName: pendingCsvImport.fileName,
    columnMapping,
    isJson: pendingCsvImport.isJson
  });

  if (result.validation.ok) {
    pendingCsvImport.result = result;
    showImportStatus(result, { preview: pendingCsvImport.provider === "fidelity" && canApplyPortfolioImport(result), persist: false });
    if (pendingCsvImport.provider !== "fidelity") {
      mergeSeekingAlphaRecords(result.records, "csv-import");
      showImportStatus(result);
    }
    return;
  }
  showImportStatus(result, { persist: false });
}

async function applyPendingPortfolioImport() {
  if (!pendingCsvImport?.result) {
    showImportStatus({ validation: { ok: false }, summary: { message: "No portfolio import preview is waiting to be applied." } });
    return;
  }
  const result = pendingCsvImport.result;
  if (!canApplyPortfolioImport(result)) {
    showImportStatus(result, { persist: false });
    return;
  }
  mergeImportedRecords(result.records, { replace: true, render: false });
  state.fidelityStatus = {
    connected: false,
    provider: "csv-import",
    lastSync: result.importReport?.importedAt || new Date().toISOString(),
    mode: "csv-imported",
    holdings: result.importReport?.holdingsImported || result.records.length,
    accounts: result.importReport?.accountsDetected?.length || 0,
    totalMarketValue: result.importReport?.totalMarketValue || 0,
    fileName: result.importReport?.fileName || pendingCsvImport.fileName,
    skippedNonHoldingRows: skippedNonHoldingRows(result.importReport).length,
    rowsNeedingReview: countHoldingRowsNeedingReview(result.importReport),
    message: `Fidelity import applied: ${result.importReport?.holdingsImported || result.records.length} holding${(result.importReport?.holdingsImported || result.records.length) === 1 ? "" : "s"} loaded locally.`
  };
  saveFidelityStatus();
  renderFidelityStatus();
  pendingCsvImport = null;
  showImportStatus(result, { persist: true, render: false, applied: true });
  await refreshMarketDataSnapshot({ renderAfter: false });
  render();
}

function cancelPendingPortfolioImport() {
  pendingCsvImport = null;
  const status = $("importStatus");
  if (status) {
    status.textContent = "Import preview canceled. No holdings were changed.";
    status.className = "import-status pending";
  }
  const panel = $("importDebugPanel");
  if (panel) {
    panel.innerHTML = "";
    panel.hidden = true;
  }
}

function parsePastedFidelityHoldings() {
  const input = $("fidelityPasteInput");
  const value = String(input?.value || "").trim();
  if (!value) {
    showImportStatus({
      validation: { ok: false },
      summary: { message: "Paste Fidelity position rows before previewing." },
      importReport: {
        fileName: "pasted-fidelity-table",
        detectedColumns: [],
        rowsParsed: 0,
        holdingsImported: 0,
        rejectedRows: [],
        missingRequiredFields: [],
        columnMapping: {},
        totalMarketValue: 0,
        accountsDetected: [],
        tickersDetected: [],
        health: { status: "Failed", tone: "error", message: "Paste Fidelity position rows before previewing." }
      }
    }, { persist: false });
    return;
  }
  const adapters = globalThis.DataAdapters;
  const result = buildCsvImportResult("fidelity", value, adapters, {
    fileName: "pasted-fidelity-table.csv",
    isJson: false
  });
  pendingCsvImport = {
    provider: "fidelity",
    fileName: "pasted-fidelity-table.csv",
    csv: value,
    isJson: false,
    result
  };
  showImportStatus(result, { preview: canApplyPortfolioImport(result), persist: false });
}

function clearFidelityPaste() {
  const input = $("fidelityPasteInput");
  if (input) input.value = "";
  const status = $("importStatus");
  if (status) {
    status.textContent = "Pasted Fidelity rows cleared. No holdings were changed.";
    status.className = "import-status pending";
  }
}

function handleFidelityDrop(event) {
  const zone = $("fidelityDropZone");
  if (!zone) return;
  event.preventDefault();
  zone.classList.remove("is-dragover");
  const file = event.dataTransfer?.files?.[0];
  if (file) importFile(file, "fidelity");
}

function handleFidelityDrag(event) {
  const zone = $("fidelityDropZone");
  if (!zone) return;
  event.preventDefault();
  zone.classList.add("is-dragover");
}

function clearFidelityDragState() {
  $("fidelityDropZone")?.classList.remove("is-dragover");
}

function handleFidelityDropZoneKeydown(event) {
  if (!["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  $("fidelityFile")?.click();
}

function showFidelityStatus(message, tone = "pending") {
  ["fidelityConnectionStatus", "fidelityPlaidStatus"].forEach((id) => {
    const status = $(id);
    if (!status) return;
    status.textContent = message;
    status.className = `connector-status ${tone}`;
  });
}

function showSeekingAlphaStatus(message, tone = "pending") {
  const status = $("seekingAlphaStatus");
  if (!status) return;
  status.textContent = message;
  status.className = `connector-status ${tone}`;
}

function showStateStatus(message, tone = "pending") {
  const status = $("stateStatus");
  if (!status) return;
  status.textContent = message;
  status.className = `connector-status ${tone}`;
}

function showTargetStatus(message, tone = "pending") {
  const status = $("targetStatus");
  if (!status) return;
  status.textContent = message;
  status.className = `connector-status ${tone}`;
}

function showPoliticianTradeStatus(message, tone = "pending") {
  const status = $("politicianTradeImportStatus");
  if (!status) return;
  status.textContent = message;
  status.className = `connector-status ${tone}`;
}

function showRedditImportStatus(message, tone = "pending") {
  const status = $("redditImportStatus");
  if (!status) return;
  status.textContent = message;
  status.className = `connector-status ${tone}`;
}

function showXUpdateStatus(message, tone = "pending") {
  const status = $("xUpdateStatus");
  if (!status) return;
  status.textContent = message;
  status.className = `connector-status ${tone}`;
}

function showAlertThresholdStatus(message, tone = "pending") {
  const status = $("alertThresholdStatus");
  if (!status) return;
  status.textContent = message;
  status.className = `connector-status ${tone}`;
}

function renderSeekingAlphaInsights(insights) {
  const target = $("seekingAlphaInsights");
  if (!target) return;
  if (!insights?.messages?.length) {
    target.innerHTML = "";
    return;
  }
  target.innerHTML = insights.messages.map((message) => `<li>${escapeHtml(message)}</li>`).join("");
}

function exportDashboardState() {
  const payload = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    holdings: state.holdings,
    fidelityStatus: state.fidelityStatus,
    seekingAlphaStatus: state.seekingAlphaStatus,
    marketEvents: state.marketEvents,
    alphaEvents: state.alphaEvents,
    alertState: state.alertState,
    alertThresholds: state.alertThresholds,
    thesisProfiles: state.thesisProfiles,
    targetAllocations: state.targetAllocations,
    politicianTrades: persistPoliticianTradeCacheRecords(state.politicianTrades, persistedReportFreshness(state.politicianTradeImportReport, "politician")),
    politicianTradeImportReport: persistedSourceReportForStorage(state.politicianTradeImportReport, "politician"),
    redditMentions: persistRedditMentionCacheRecords(state.redditMentions, persistedReportFreshness(state.redditImportReport, "reddit")),
    redditImportReport: persistedSourceReportForStorage(state.redditImportReport, "reddit"),
    redditSettings: state.redditSettings,
    xUpdates: state.xUpdates,
    xUpdateImportReport: state.xUpdateImportReport,
    xSettings: state.xSettings,
    watchlistIdeas: state.watchlistIdeas,
    decisionJournal: state.decisionJournal,
    eventCalendar: state.eventCalendar,
    eventCalendarImportReport: state.eventCalendarImportReport,
    quantScoreHistory: state.quantScoreHistory,
    latestImportReport: state.latestImportReport,
    safety: {
      includesPasswords: false,
      includesApiKeys: false,
      note: "Local dashboard backup. Review before sharing because holdings are sensitive financial data."
    }
  };
  downloadJson(sanitizeStateForBackup(payload), `tucker-dashboard-state-${today()}.json`);
  showStateStatus("State JSON exported. Treat it as sensitive because it contains holdings.", "success");
}

function exportTargetAllocations() {
  const payload = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    targetAllocations: state.targetAllocations,
    safety: {
      includesPasswords: false,
      includesApiKeys: false,
      note: "Local target allocation backup. Review before sharing because portfolio strategy can be sensitive."
    }
  };
  downloadJson(payload, `tucker-target-allocations-${today()}.json`);
  showTargetStatus("Target allocation JSON exported.", "success");
}

function downloadJson(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function importStateFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = JSON.parse(String(reader.result || "{}"));
      applyImportedState(payload);
      showStateStatus("State JSON imported and saved locally.", "success");
      renderFidelityStatus();
      renderSeekingAlphaStatus();
      render();
    } catch (error) {
      showStateStatus(`State import failed: ${safeErrorMessage(error)}`, "error");
    }
  };
  reader.readAsText(file);
}

function clearPortfolioData() {
  if (!confirmLocalChange("Clear active portfolio data? This removes local holdings, import reports, alerts, and market-data snapshots from this browser. It does not disconnect providers or change any brokerage account.")) return;
  state.holdings = [];
  state.accountScope = ACCOUNT_SCOPE_ALL;
  state.latestImportReport = null;
  state.alertState = emptyAlertState();
  state.marketDataSnapshot = null;
  state.quantScoreHistory = [];
  latestTickerSignals = [];
  pendingCsvImport = null;
  state.fidelityStatus = {
    connected: false,
    provider: state.fidelityStatus?.provider || "plaid",
    lastSync: null,
    mode: "not-connected",
    message: "No active portfolio loaded."
  };
  saveHoldings();
  saveLatestImportReport();
  saveAlertState();
  saveFidelityStatus();
  saveQuantScoreHistory();
  saveAccountScope();
  showStateStatus("Portfolio holdings cleared locally. Watchlist, journal, settings, and provider placeholders were kept.", "success");
  renderFidelityStatus();
  render();
}

function applyImportedState(payload) {
  if (!payload || typeof payload !== "object") throw new Error("File does not contain a dashboard state object.");
  payload = sanitizeImportedState(payload);
  if (payload.schemaVersion !== undefined && Number(payload.schemaVersion) !== 1) {
    throw new Error("State file schema version is not supported.");
  }
  if (!Array.isArray(payload.holdings)) throw new Error("State file is missing a holdings array.");
  state.holdings = normalizeHoldings(payload.holdings);
  state.accountScope = ACCOUNT_SCOPE_ALL;
  state.fidelityStatus = restoredConnectorStatus(payload.fidelityStatus, loadFidelityStatus(), "Fidelity");
  state.seekingAlphaStatus = restoredConnectorStatus(payload.seekingAlphaStatus, loadSeekingAlphaStatus(), "Seeking Alpha");
  state.marketEvents = Array.isArray(payload.marketEvents) ? payload.marketEvents : demoMarketIntelligenceEvents();
  state.alphaEvents = Array.isArray(payload.alphaEvents) ? payload.alphaEvents : demoAlphaEvents();
  state.thesisProfiles = safeObject(payload.thesisProfiles, demoThesisProfiles());
  state.targetAllocations = normalizeTargetAllocations(Array.isArray(payload.targetAllocations) ? payload.targetAllocations : defaultTargetAllocations());
  state.alertState = normalizeAlertState(payload.alertState || emptyAlertState());
  state.alertThresholds = normalizeAlertThresholds(payload.alertThresholds || DEFAULT_ALERT_THRESHOLDS);
  state.latestImportReport = safeObject(payload.latestImportReport, null);
  state.politicianTradeImportReport = persistedSourceReportForStorage(safeObject(payload.politicianTradeImportReport, null), "politician");
  state.politicianTrades = Array.isArray(payload.politicianTrades)
    ? persistPoliticianTradeCacheRecords(payload.politicianTrades, persistedReportFreshness(state.politicianTradeImportReport, "politician"))
    : loadPoliticianTrades(null, politicianTradesKey);
  state.redditImportReport = persistedSourceReportForStorage(safeObject(payload.redditImportReport, null), "reddit");
  state.redditMentions = Array.isArray(payload.redditMentions)
    ? persistRedditMentionCacheRecords(payload.redditMentions, persistedReportFreshness(state.redditImportReport, "reddit"))
    : loadRedditMentions(null, redditMentionsKey);
  state.redditSettings = normalizeRedditSettings(payload.redditSettings || loadRedditSettings());
  state.xUpdates = Array.isArray(payload.xUpdates) ? normalizeXUpdates(payload.xUpdates) : loadXUpdates(null, xUpdatesKey);
  state.xUpdateImportReport = safeObject(payload.xUpdateImportReport, null);
  state.xSettings = normalizeXSettings(payload.xSettings || loadXSettings());
  state.watchlistIdeas = Array.isArray(payload.watchlistIdeas) ? normalizeWatchlistIdeas(payload.watchlistIdeas) : loadWatchlistIdeas();
  state.decisionJournal = Array.isArray(payload.decisionJournal) ? normalizeJournalEntries(payload.decisionJournal) : loadDecisionJournal();
  state.eventCalendar = Array.isArray(payload.eventCalendar) ? normalizeCalendarEvents(payload.eventCalendar) : loadEventCalendar();
  state.eventCalendarImportReport = safeObject(payload.eventCalendarImportReport, null);
  state.quantScoreHistory = normalizeQuantScoreHistory(payload.quantScoreHistory || []);
  state.marketDataSnapshot = null;
  latestTickerSignals = [];
  pendingCsvImport = null;
  saveHoldings();
  saveFidelityStatus();
  saveSeekingAlphaStatus();
  saveMarketEvents();
  saveAlphaEvents();
  saveThesisProfiles();
  saveTargetAllocations();
  saveAlertState();
  saveAlertThresholds();
  saveLatestImportReport();
  savePoliticianTrades(localStorage, state.politicianTrades, politicianTradesKey);
  savePoliticianTradeImportReport();
  saveRedditMentions(localStorage, state.redditMentions, redditMentionsKey);
  saveRedditImportReport();
  saveRedditSettings();
  saveXUpdates(localStorage, state.xUpdates, xUpdatesKey);
  saveXUpdateImportReport();
  saveXSettings();
  saveWatchlistIdeas();
  saveDecisionJournal();
  saveEventCalendar();
  saveEventCalendarImportReport();
  saveQuantScoreHistory();
  saveAccountScope();
}

function restoredConnectorStatus(importedStatus, fallback, label) {
  const restored = safeObject(importedStatus, fallback);
  if (!importedStatus || typeof importedStatus !== "object") return restored;
  return {
    ...restored,
    connected: false,
    restoredFromBackup: true,
    mode: "restored-local-state",
    message: `${label} status was restored from a local backup. Re-sync or revalidate with the local backend before treating it as connected.`
  };
}

function importTargetAllocationFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = JSON.parse(String(reader.result || "[]"));
      const records = Array.isArray(payload) ? payload : payload.targetAllocations;
      if (!Array.isArray(records)) throw new Error("Target JSON must contain a targetAllocations array.");
      state.targetAllocations = normalizeTargetAllocations(records);
      saveTargetAllocations();
      showTargetStatus(`Imported ${state.targetAllocations.length} target allocation${state.targetAllocations.length === 1 ? "" : "s"}.`, "success");
      render();
    } catch (error) {
      showTargetStatus(`Target import failed: ${safeErrorMessage(error)}`, "error");
    }
  };
  reader.readAsText(file);
}

function importPoliticianTradeFileFromInput(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const result = importPoliticianTradeFile(String(reader.result || ""), {
      fileName: file.name,
      asOf: new Date().toISOString()
    });
    state.politicianTradeImportReport = result;
    savePoliticianTradeImportReport();
    if (result.records.length) {
      state.politicianTrades = result.records;
      savePoliticianTrades(localStorage, state.politicianTrades, politicianTradesKey);
    }
    const tone = result.ok ? "success" : result.partial ? "pending" : "error";
    const message = result.ok
      ? `Imported ${result.tradesImported} politician trade rows from ${result.fileName}.`
      : result.partial
      ? `Imported ${result.tradesImported} rows, rejected ${result.rejectedRows.length}. Review rejected rows below.`
      : `Politician trade import failed: ${result.validation.errors[0] || "No valid rows found."}`;
    showPoliticianTradeStatus(message, tone);
    render();
  };
  reader.onerror = () => showPoliticianTradeStatus("Politician trade import failed: file could not be read.", "error");
  reader.readAsText(file);
}

async function refreshPoliticianTradesFromProvider({ force = false, renderAfter = true } = {}) {
  const config = state.providerReadiness.politicianTradeProviderConfig || buildPoliticianTradeProviderConfig({});
  const localImportActive = state.politicianTradeImportReport?.mode === "local-file" && state.politicianTradeImportReport?.tradesImported;
  if (localImportActive && !force) {
    showPoliticianTradeStatus("Local politician trade file is active. Use Sync public disclosures to replace it with the configured provider.", "pending");
    return null;
  }
  if (!config.configured) {
    showPoliticianTradeStatus("Public disclosure provider is not configured. Sample/local rows remain active.", "pending");
    return null;
  }

  showPoliticianTradeStatus("Syncing public politician trade disclosures through the local backend...", "pending");
  try {
    const response = await fetch(`/api/politician-trades?provider=${encodeURIComponent(config.selectedProvider || "senate-stock-watcher")}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Politician trade provider status ${response.status}`);
    const payload = await response.json();
    if (!payload.records?.length) {
      const warning = payload.warnings?.[0] || "Provider returned no normalized rows.";
      showPoliticianTradeStatus(`Public disclosure sync did not update rows: ${warning}`, "error");
      return payload;
    }
    state.politicianTrades = normalizePoliticianTrades(payload.records);
    state.politicianTradeImportReport = {
      ok: Boolean(payload.ok),
      partial: Boolean(payload.partial),
      mode: payload.mode || "public-static-dataset",
      fileName: payload.providerLabel || "Public politician trade provider",
      fileType: "provider",
      detectedColumns: payload.detectedColumns || [],
      rowsParsed: payload.rowsParsed || payload.records.length,
      tradesImported: payload.records.length,
      rejectedRows: payload.rejectedRows || [],
      missingFields: payload.missingFields || [],
      tickersDetected: payload.tickersDetected || [],
      records: payload.records,
      validation: payload.validation || { ok: true, errors: [], warnings: [] },
      liveProviderCalls: Boolean(payload.liveProviderCalls),
      providerId: payload.providerId,
      providerLabel: payload.providerLabel,
      sourceCoverage: payload.sourceCoverage,
      sourceRecommendation: payload.sourceRecommendation,
      primarySource: payload.primarySource,
      cacheStatus: payload.cacheStatus,
      fetchedAt: payload.fetchedAt,
      dataFreshness: payload.dataFreshness,
      warnings: payload.warnings || []
    };
    savePoliticianTrades(localStorage, state.politicianTrades, politicianTradesKey);
    savePoliticianTradeImportReport();
    showPoliticianTradeStatus(`Synced ${payload.records.length} public politician trade disclosure row${payload.records.length === 1 ? "" : "s"}.`, "success");
    if (renderAfter) render();
    return payload;
    } catch (error) {
      showPoliticianTradeStatus(`Public disclosure sync failed safely: ${safeErrorMessage(error)}`, "error");
    return null;
  }
}

function saveTargetsFromUi() {
  const records = Array.from(document.querySelectorAll("[data-target-row]"))
    .map((row) => {
      const fields = Object.fromEntries(
        Array.from(row.querySelectorAll("[data-target-field]"))
          .map((input) => [input.dataset.targetField, input.value])
      );
      return targetRecordFromFormRow({
        scope: row.dataset.scope,
        key: row.dataset.key,
        ...fields
      });
    })
    .filter((record) => record.scope && record.key)
    .filter((record) => record.targetWeight || record.minWeight || record.maxWeight || record.maxEffectiveExposure || record.notes);

  state.targetAllocations = normalizeTargetAllocations(records);
  saveTargetAllocations();
  showTargetStatus(`Saved ${state.targetAllocations.length} target allocation${state.targetAllocations.length === 1 ? "" : "s"} locally.`, "success");
  render();
}

function resetTargetTemplate() {
  state.targetAllocations = defaultTargetAllocations();
  saveTargetAllocations();
  showTargetStatus("Reset to the default Tucker-style target template.", "success");
  render();
}

function syncThesisEditorOptions(holdings) {
  const target = $("thesisTicker");
  if (!target) return;
  const previous = target.value;
  const tickers = holdings
    .filter((holding) => holding.ticker && holding.assetClass !== "Cash")
    .map((holding) => holding.ticker);
  target.innerHTML = [...new Set(tickers)]
    .sort((a, b) => a.localeCompare(b))
    .map((ticker) => `<option value="${escapeHtml(ticker)}">${escapeHtml(ticker)}</option>`)
    .join("");
  target.value = tickers.includes(previous) ? previous : (tickers.includes("MU") ? "MU" : target.options[0]?.value || "");
}

function syncRedditSettingsInputs() {
  const active = document.activeElement;
  const fields = [
    ["redditSubreddits", state.redditSettings.subreddits],
    ["redditWhitelist", state.redditSettings.whitelist],
    ["redditFalsePositives", state.redditSettings.falsePositives]
  ];
  fields.forEach(([id, values]) => {
    const target = $(id);
    if (!target || target === active) return;
    target.value = (values || []).join(", ");
  });
}

function syncXSettingsInputs() {
  const active = document.activeElement;
  const query = $("xQuery");
  if (query && query !== active) query.value = state.xSettings.query || "";
  const whitelist = $("xWhitelist");
  if (whitelist && whitelist !== active) whitelist.value = (state.xSettings.whitelist || []).join(", ");
}

function combinedWatchlistTickers() {
  const includeDefaultResearchTickers = !activePortfolioStatus().realPortfolio;
  return [...new Set([
    ...(includeDefaultResearchTickers ? DEFAULT_TICKER_SIGNAL_WATCHLIST : []),
    ...(state.redditSettings?.whitelist || []),
    ...(state.xSettings?.whitelist || []),
    ...watchlistIdeaTickers(state.watchlistIdeas)
  ].map((ticker) => normalizeTicker(ticker)).filter(Boolean))].sort();
}

function readWatchlistFilters() {
  return {
    query: $("watchlistQuery")?.value || "",
    status: $("watchlistStatusFilter")?.value || "all",
    sector: $("watchlistSectorFilter")?.value || "all",
    signalSource: $("watchlistSourceFilter")?.value || "all",
    conviction: $("watchlistConvictionFilter")?.value || "all"
  };
}

function syncWatchlistFilterOptions(rows = []) {
  setSelectChoices("watchlistStatusFilter", ["all", ...WATCHLIST_IDEA_STATUSES], "All statuses", watchlistStatusLabel);
  setSelectChoices("watchlistSectorFilter", ["all", ...[...new Set(rows.map((row) => row.sector || "Unknown"))].sort()], "All sectors");
  setSelectChoices("watchlistSourceFilter", ["all", ...WATCHLIST_SIGNAL_SOURCES], "All sources", watchlistSourceLabel);
  setSelectChoices("watchlistConvictionFilter", ["all", ...WATCHLIST_CONVICTIONS], "All conviction levels");
}

function setSelectChoices(id, values = [], allLabel = "All", labelFn = (value) => value) {
  const target = $(id);
  if (!target) return;
  const previous = target.value || "all";
  target.innerHTML = values.map((value) => {
    const label = value === "all" ? allLabel : labelFn(value);
    return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
  }).join("");
  target.value = values.includes(previous) ? previous : "all";
}

function watchlistStatusLabel(status = "") {
  return ({
    researching: "Researching",
    watching: "Watching",
    candidate: "Candidate",
    rejected: "Rejected",
    owned: "Owned"
  })[status] || status;
}

function watchlistSourceLabel(source = "") {
  return ({
    manual: "Manual",
    "ticker-signal": "Ticker signal",
    reddit: "Reddit",
    politician: "Politician trades",
    "market-intelligence": "Market Intelligence",
    "owned-holding": "Owned holding",
    sample: "Sample"
  })[source] || source;
}

function fillWatchlistEditor(item = {}) {
  const normalized = item.ticker ? normalizeWatchlistIdea(item) : {};
  setInputValue("watchlistTicker", normalized.ticker || "");
  setInputValue("watchlistStatusSelect", normalized.status || "watching");
  setInputValue("watchlistThesis", normalized.thesis || "");
  setInputValue("watchlistCatalyst", normalized.catalyst || "");
  setInputValue("watchlistTargetEntryZone", normalized.targetEntryZone || "");
  setInputValue("watchlistRiskNotes", normalized.riskNotes || "");
  setInputValue("watchlistTimeHorizon", normalized.timeHorizon || "");
  setInputValue("watchlistConvictionSelect", normalized.conviction || "Unrated");
  setInputValue("watchlistSourceOfIdea", normalized.sourceOfIdea || "Manual");
  setInputValue("watchlistSector", normalized.sector || "");
  setInputValue("watchlistDateAdded", normalized.dateAdded || today());
  setInputValue("watchlistLastReviewed", normalized.lastReviewed || "");
}

function saveWatchlistIdeaFromEditor() {
  const ticker = normalizeTicker($("watchlistTicker")?.value || "");
  if (!ticker) {
    showWatchlistStatus("Enter a valid ticker before saving an idea.", "error");
    return;
  }
  const record = normalizeWatchlistIdea({
    ticker,
    status: $("watchlistStatusSelect")?.value,
    thesis: $("watchlistThesis")?.value,
    catalyst: $("watchlistCatalyst")?.value,
    targetEntryZone: $("watchlistTargetEntryZone")?.value,
    riskNotes: $("watchlistRiskNotes")?.value,
    timeHorizon: $("watchlistTimeHorizon")?.value,
    conviction: $("watchlistConvictionSelect")?.value,
    sourceOfIdea: $("watchlistSourceOfIdea")?.value,
    sector: $("watchlistSector")?.value,
    dateAdded: $("watchlistDateAdded")?.value || today(),
    lastReviewed: $("watchlistLastReviewed")?.value
  });
  state.watchlistIdeas = upsertWatchlistIdea(state.watchlistIdeas, record);
  saveWatchlistIdeas();
  showWatchlistStatus(`${ticker} idea saved locally.`, "success");
  render();
}

function deleteWatchlistIdeaFromEditor() {
  const ticker = normalizeTicker($("watchlistTicker")?.value || "");
  if (!ticker) {
    showWatchlistStatus("Choose a ticker to delete from saved ideas.", "error");
    return;
  }
  if (!confirmLocalChange(`Remove ${ticker} from saved ideas? Holdings and thesis records will not be changed.`)) return;
  state.watchlistIdeas = removeWatchlistIdea(state.watchlistIdeas, ticker);
  saveWatchlistIdeas();
  fillWatchlistEditor({});
  showWatchlistStatus(`${ticker} removed from saved ideas. Owned holdings and thesis records were not changed.`, "success");
  render();
}

function clearWatchlistEditor() {
  fillWatchlistEditor({ dateAdded: today(), sourceOfIdea: "Manual", status: "watching", conviction: "Unrated" });
  showWatchlistStatus("Idea form cleared. Saved ideas were not changed.", "pending");
}

function showWatchlistStatus(message, tone = "pending") {
  const status = $("watchlistEditorStatus");
  if (!status) return;
  status.textContent = message;
  status.className = `connector-status ${tone}`;
}

function readJournalFilters() {
  return {
    query: $("journalQuery")?.value || "",
    ticker: $("journalTickerFilter")?.value || "all",
    decisionType: $("journalDecisionFilter")?.value || "all",
    conviction: $("journalConvictionFilter")?.value || "all",
    fromDate: $("journalFromDate")?.value || "",
    toDate: $("journalToDate")?.value || ""
  };
}

function syncJournalFilterOptions(rows = []) {
  setSelectChoices("journalTickerFilter", ["all", ...[...new Set(rows.map((row) => row.ticker).filter(Boolean))].sort()], "All tickers");
  setSelectChoices("journalDecisionFilter", ["all", ...DECISION_TYPES], "All decision types", journalDecisionLabel);
  setSelectChoices("journalConvictionFilter", ["all", ...JOURNAL_CONVICTIONS], "All conviction levels");
}

function fillJournalEditor(entry = {}) {
  const normalized = entry.id ? normalizeJournalEntry(entry) : {};
  setInputValue("journalEntryId", normalized.id || "");
  setInputValue("journalDateTime", normalized.dateTime ? localDateTimeInput(normalized.dateTime) : localDateTimeInput(new Date().toISOString()));
  setInputValue("journalTicker", normalized.ticker || "");
  setInputValue("journalDecisionType", normalized.decisionType || "watch");
  setInputValue("journalConviction", normalized.conviction || "Unrated");
  setInputValue("journalThesisNote", normalized.thesisNote || "");
  setInputValue("journalRiskNote", normalized.riskNote || "");
  setInputValue("journalCatalyst", normalized.catalyst || "");
}

function saveJournalEntryFromEditor() {
  const ticker = normalizeTicker($("journalTicker")?.value || "");
  if (!ticker) {
    showJournalStatus("Enter a valid ticker before saving a journal entry.", "error");
    return;
  }
  const now = new Date().toISOString();
  const rawDateTime = $("journalDateTime")?.value || "";
  const parsedDateTime = rawDateTime ? new Date(rawDateTime) : null;
  const dateTime = parsedDateTime && !Number.isNaN(parsedDateTime.getTime()) ? parsedDateTime.toISOString() : now;
  const signalSnapshot = signalSnapshotForTicker(ticker, latestTickerSignals, now);
  const record = normalizeJournalEntry({
    id: $("journalEntryId")?.value || "",
    dateTime,
    ticker,
    decisionType: $("journalDecisionType")?.value,
    conviction: $("journalConviction")?.value,
    thesisNote: $("journalThesisNote")?.value,
    riskNote: $("journalRiskNote")?.value,
    catalyst: $("journalCatalyst")?.value,
    signalSnapshot
  }, { updatedAt: now });
  state.decisionJournal = upsertJournalEntry(state.decisionJournal, record);
  saveDecisionJournal();
  fillJournalEditor(record);
  showJournalStatus(`${ticker} decision journal entry saved locally. No brokerage action was placed.`, "success");
  render();
}

function deleteJournalEntryFromEditor() {
  const id = $("journalEntryId")?.value || "";
  if (!id) {
    showJournalStatus("Choose a journal entry before deleting.", "error");
    return;
  }
  if (!confirmLocalChange("Delete this local journal entry? Holdings, watchlist records, and brokerage data will not be changed.")) return;
  state.decisionJournal = removeJournalEntry(state.decisionJournal, id);
  saveDecisionJournal();
  fillJournalEditor({});
  showJournalStatus("Journal entry deleted locally. Holdings and watchlist records were not changed.", "success");
  render();
}

function clearJournalEditor() {
  fillJournalEditor({});
  showJournalStatus("Journal form cleared. Existing entries were not changed.", "pending");
}

function showJournalStatus(message, tone = "pending") {
  const status = $("journalEditorStatus");
  if (!status) return;
  status.textContent = message;
  status.className = `connector-status ${tone}`;
}

function showCalendarStatus(message, tone = "pending") {
  const status = $("calendarImportStatus");
  if (!status) return;
  status.textContent = message;
  status.className = `connector-status ${tone}`;
}

function readCalendarFilters() {
  return {
    ticker: $("calendarTickerFilter")?.value || "all",
    eventType: $("calendarTypeFilter")?.value || "all",
    importance: $("calendarImportanceFilter")?.value || "all",
    sourceMode: $("calendarSourceFilter")?.value || "all",
    windowDays: $("calendarWindowFilter")?.value || "45"
  };
}

function syncCalendarFilterOptions(events = []) {
  setSelectChoices("calendarTickerFilter", ["all", ...[...new Set(events.flatMap((event) => event.tickers || []).filter(Boolean))].sort()], "All tickers");
  setSelectChoices("calendarTypeFilter", ["all", ...EVENT_TYPES], "All event types", calendarTypeLabel);
  setSelectChoices("calendarImportanceFilter", ["all", ...EVENT_IMPORTANCE], "All importance levels", titleCase);
  setSelectChoices("calendarSourceFilter", ["all", ...EVENT_SOURCE_MODES], "All source modes", titleCase);
}

function importCalendarEventFileFromInput(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const result = importCalendarEventFile(String(reader.result || ""), {
      fileName: file.name,
      asOf: new Date().toISOString()
    });
    state.eventCalendarImportReport = result;
    saveEventCalendarImportReport();
    if (result.records.length) {
      state.eventCalendar = result.records;
      saveEventCalendar();
    }
    const tone = result.ok ? "success" : result.partial ? "pending" : "error";
    const message = result.ok
      ? `Imported ${result.eventsImported} calendar event${result.eventsImported === 1 ? "" : "s"} from ${result.fileName}.`
      : result.partial
      ? `Imported ${result.eventsImported} calendar event${result.eventsImported === 1 ? "" : "s"}; ${result.rejectedRows.length} row${result.rejectedRows.length === 1 ? "" : "s"} need review.`
      : `Calendar import failed: ${result.validation?.errors?.[0] || result.rejectedRows?.[0]?.reasons?.[0] || "No valid rows found."}`;
    showCalendarStatus(message, tone);
    render();
  };
  reader.onerror = () => showCalendarStatus("Calendar import failed: file could not be read.", "error");
  reader.readAsText(file);
}

function fillCalendarEventEditor(event = {}) {
  const normalized = event.id ? normalizeCalendarEvents([event])[0] : {};
  setInputValue("calendarEventId", normalized.id || "");
  setInputValue("calendarEventTitle", normalized.title || "");
  setInputValue("calendarEventTicker", (normalized.tickers || []).join(", "));
  setInputValue("calendarEventDate", normalized.date || today());
  setInputValue("calendarEventType", normalized.eventType || "custom");
  setInputValue("calendarEventImportance", normalized.importance || "medium");
  setInputValue("calendarEventNotes", normalized.notes || normalized.summary || "");
}

function saveCalendarEventFromEditor() {
  const title = $("calendarEventTitle")?.value || "";
  const date = $("calendarEventDate")?.value || "";
  const tickers = ($("calendarEventTicker")?.value || "").split(/[,\s]+/).filter(Boolean);
  if (!title.trim() || !date) {
    showCalendarStatus("Enter a title and event date before saving a custom event.", "error");
    return;
  }
  const record = {
    id: $("calendarEventId")?.value || "",
    title,
    date,
    ticker: tickers[0] || "",
    tickers,
    eventType: $("calendarEventType")?.value || "custom",
    importance: $("calendarEventImportance")?.value || "medium",
    notes: $("calendarEventNotes")?.value || "",
    sourceMode: "manual",
    sourceLabel: "Manual calendar",
    detectedAt: new Date().toISOString()
  };
  state.eventCalendar = upsertCalendarEvent(state.eventCalendar, record);
  saveEventCalendar();
  const saved = normalizeCalendarEvents([record])[0];
  fillCalendarEventEditor(saved);
  showCalendarStatus(`${saved?.title || "Calendar event"} saved locally.`, "success");
  render();
}

function deleteCalendarEventFromEditor() {
  const id = $("calendarEventId")?.value || "";
  if (!id) {
    showCalendarStatus("Choose a saved custom/imported event before deleting.", "error");
    return;
  }
  if (!confirmLocalChange("Delete this local calendar event? Portfolio holdings and imported market data will not be changed.")) return;
  state.eventCalendar = removeCalendarEvent(state.eventCalendar, id);
  saveEventCalendar();
  fillCalendarEventEditor({});
  showCalendarStatus("Calendar event deleted locally.", "success");
  render();
}

function clearCalendarEventEditor() {
  fillCalendarEventEditor({ date: today(), eventType: "custom", importance: "medium" });
  showCalendarStatus("Calendar form cleared. Saved events were not changed.", "pending");
}

function handleCalendarAction(event) {
  const button = event.target.closest("[data-calendar-action]");
  if (!button) return;
  const action = button.dataset.calendarAction;
  const id = button.dataset.calendarId || "";
  if (action === "edit") {
    const row = state.eventCalendar.find((item) => item.id === id);
    if (!row) return;
    fillCalendarEventEditor(row);
    window.location.hash = "#calendar";
    showCalendarStatus(`${row.title || "Calendar event"} loaded into the editor.`, "pending");
    return;
  }
  if (action === "delete") {
    if (!confirmLocalChange("Delete this local calendar event? Portfolio holdings and imported market data will not be changed.")) return;
    state.eventCalendar = removeCalendarEvent(state.eventCalendar, id);
    saveEventCalendar();
    showCalendarStatus("Calendar event deleted locally.", "success");
    render();
  }
}

function calendarTypeLabel(value = "") {
  return titleCase(String(value || "").replaceAll("-", " "));
}

function titleCase(value = "") {
  return String(value || "")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function journalDecisionLabel(value = "") {
  return String(value || "")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function localDateTimeInput(value = "") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function fillThesisEditor(ticker, holdings = []) {
  if (!ticker) return;
  const holding = holdings.find((item) => item.ticker === ticker) || {};
  const profile = normalizeThesisProfile(state.thesisProfiles[ticker] || {}, holding);
  $("thesisWhyOwned").value = profile.whyOwned || holding.thesis || "";
  $("thesisTargetAllocation").value = allocationPercent(profile.targetAllocation ?? holding.targetWeight);
  $("thesisConfidenceLevel").value = profile.confidenceLevel || holding.confidenceLevel || "Unrated";
  $("thesisStatusSelect").value = profile.thesisStatus || holding.thesisStatus || "Needs review";
  $("thesisBullishAssumptions").value = lines(profile.bullishAssumptions);
  $("thesisKeyRisks").value = lines(profile.keyRisks);
  $("thesisBreakingConditions").value = lines(profile.invalidationCriteria);
  $("thesisAddConditions").value = lines(profile.addConditions);
  $("thesisTrimConditions").value = lines(profile.trimConditions);
  $("thesisExitReviewConditions").value = lines(profile.exitReviewConditions);
  $("thesisReviewTriggers").value = lines(profile.reviewTriggers);
  $("thesisNextReviewTrigger").value = profile.nextReviewTrigger || profile.catalyst || holding.nextEarnings || "";
  $("thesisNotes").value = profile.notes || "";
  $("thesisLastReviewedDate").value = profile.lastReviewedDate || "";
}

function saveThesisFromEditor(reviewedToday = false) {
  const ticker = $("thesisTicker").value;
  if (!ticker) return;
  const targetAllocation = Math.max(0, Number($("thesisTargetAllocation").value) || 0) / 100;
  state.thesisProfiles[ticker] = {
    ...(state.thesisProfiles[ticker] || {}),
    ticker,
    whyOwned: $("thesisWhyOwned").value.trim(),
    thesisStatus: $("thesisStatusSelect").value,
    bullishAssumptions: splitLines($("thesisBullishAssumptions").value),
    keyRisks: splitLines($("thesisKeyRisks").value),
    invalidationCriteria: splitLines($("thesisBreakingConditions").value),
    thesisBreakingConditions: splitLines($("thesisBreakingConditions").value),
    addConditions: splitLines($("thesisAddConditions").value),
    trimConditions: splitLines($("thesisTrimConditions").value),
    exitReviewConditions: splitLines($("thesisExitReviewConditions").value),
    reviewTriggers: splitLines($("thesisReviewTriggers").value),
    targetAllocation,
    confidenceLevel: $("thesisConfidenceLevel").value,
    nextReviewTrigger: $("thesisNextReviewTrigger").value.trim(),
    catalyst: $("thesisNextReviewTrigger").value.trim(),
    stopReviewTrigger: firstLine(splitLines($("thesisExitReviewConditions").value)),
    notes: $("thesisNotes").value.trim(),
    lastReviewedDate: reviewedToday ? today() : $("thesisLastReviewedDate").value
  };
  saveThesisProfiles();
  syncTickerTargetFromThesis(ticker, targetAllocation);
  $("thesisEditorStatus").textContent = `${ticker} thesis saved locally.`;
  render();
}

function syncTickerTargetFromThesis(ticker, targetAllocation) {
  if (!ticker || !targetAllocation) return;
  const existing = normalizeTargetAllocations(state.targetAllocations);
  const id = targetId("ticker", ticker);
  const index = existing.findIndex((target) => target.id === id);
  const current = existing[index] || {
    id,
    scope: "ticker",
    key: ticker,
    minWeight: Math.max(0, targetAllocation * 0.75),
    maxWeight: targetAllocation * 1.25,
    priority: "medium",
    notes: "Synced from thesis tracker."
  };
  const updated = {
    ...current,
    targetWeight: targetAllocation,
    minWeight: current.minWeight || Math.max(0, targetAllocation * 0.75),
    maxWeight: current.maxWeight || targetAllocation * 1.25,
    notes: current.notes || "Synced from thesis tracker."
  };
  if (index >= 0) {
    existing[index] = updated;
  } else {
    existing.push(updated);
  }
  state.targetAllocations = normalizeTargetAllocations(existing);
  saveTargetAllocations();
}

function mergeImportedRecords(importedRecords, options = {}) {
  if (options.replace) {
    state.holdings = normalizeHoldings(importedRecords);
    state.accountScope = ACCOUNT_SCOPE_ALL;
    saveAccountScope();
  } else {
    const merged = mergeHoldingsByAccountAndTicker(state.holdings, normalizeHoldings(importedRecords));
    state.holdings = merged.holdings;
  }
  state.alertState = emptyAlertState();
  state.marketDataSnapshot = null;
  latestTickerSignals = [];
  saveAlertState();
  saveHoldings();
  if (options.render !== false) render();
}

function mergeSeekingAlphaRecords(records, mode) {
  const enrichment = seekingAlphaEnrichmentByTicker(records);
  const holdingTickers = new Set(state.holdings.map((holding) => holding.ticker).filter(Boolean));
  const matchedTickers = [...enrichment.keys()].filter((ticker) => holdingTickers.has(ticker));
  const unmatchedTickers = [...enrichment.keys()].filter((ticker) => !holdingTickers.has(ticker));
  state.holdings = normalizeHoldings(state.holdings.map((holding) => {
    const rating = enrichment.get(holding.ticker);
    if (!rating) return holding;
    return {
      ...holding,
      ...rating,
      sources: Array.from(new Set([...(holding.sources || []), ...(rating.sources || []), "seeking-alpha-premium"]))
    };
  }));
  saveHoldings();
  const insights = buildSeekingAlphaInsights(records);
  state.seekingAlphaStatus = {
    connected: mode !== "demo",
    lastSync: new Date().toISOString(),
    mode,
    records: records.length,
    matchedHoldings: matchedTickers.length,
    unmatchedTickers,
    insights
  };
  saveSeekingAlphaStatus();
  renderSeekingAlphaInsights(insights);
  render();
}

function seekingAlphaEnrichmentByTicker(records = []) {
  const map = new Map();
  normalizeHoldings(records).forEach((record) => {
    if (!record.ticker) return;
    const picked = {};
    seekingAlphaEnrichmentFields.forEach((field) => {
      if (record[field] !== undefined && record[field] !== null && record[field] !== "") picked[field] = record[field];
    });
    picked.sources = Array.from(new Set([...(record.sources || []), "seeking-alpha-premium"]));
    map.set(record.ticker, picked);
  });
  return map;
}

function importFile(file, provider) {
  if (!file) return;
  const adapters = globalThis.DataAdapters;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      pendingCsvImport = provider === "seekingAlpha" && isWorkbookFile(file)
        ? null
        : { provider, fileName: file.name, csv: String(reader.result || "") };
      const result = provider === "seekingAlpha" && isWorkbookFile(file)
        ? buildSeekingAlphaWorkbookImportResult(await normalizeSeekingAlphaWorkbook(reader.result))
        : buildCsvImportResult(provider, String(reader.result || ""), adapters, { fileName: file.name, isJson: isJsonFile(file) });
      if (provider === "fidelity") {
        pendingCsvImport = {
          provider,
          fileName: file.name,
          csv: String(reader.result || ""),
          isJson: isJsonFile(file),
          result
        };
        showImportStatus(result, { preview: canApplyPortfolioImport(result), persist: false });
        return;
      }
      if (!result.validation.ok) {
        showImportStatus(result);
        return;
      }
      if (provider === "seekingAlpha") {
        pendingCsvImport = null;
        mergeSeekingAlphaRecords(result.records, isWorkbookFile(file) ? "xlsx-import" : "csv-import");
      } else {
        mergeImportedRecords(result.records, { replace: true });
      }
      showImportStatus(result);
    } catch (error) {
      showImportStatus({
        validation: { ok: false },
        summary: { message: `Import failed: ${safeErrorMessage(error)}` }
      });
    }
  };
  if (provider === "seekingAlpha" && isWorkbookFile(file)) {
    reader.readAsArrayBuffer(file);
  } else {
    reader.readAsText(file);
  }
}

function importRedditMentionFileFromInput(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const report = importRedditMentionFile(String(reader.result || ""), {
        fileName: file.name,
        settings: state.redditSettings
      });
      state.redditImportReport = report;
      saveRedditImportReport();
      if (report.records.length) {
        state.redditMentions = report.records;
        saveRedditMentions(localStorage, state.redditMentions, redditMentionsKey);
      }
      if (report.ok) {
        showRedditImportStatus(`Imported ${report.mentionsImported} Reddit mention row${report.mentionsImported === 1 ? "" : "s"} from ${file.name}.`, "success");
      } else if (report.partial) {
        showRedditImportStatus(`Imported ${report.mentionsImported} Reddit mention row${report.mentionsImported === 1 ? "" : "s"}; ${report.rejectedRows.length} row${report.rejectedRows.length === 1 ? "" : "s"} need review.`, "pending");
      } else {
        showRedditImportStatus(`Reddit JSON import failed: ${report.rejectedRows[0]?.reason || "No usable mentions found."}`, "error");
      }
      render();
    } catch (error) {
      showRedditImportStatus(`Reddit JSON import failed: ${safeErrorMessage(error)}`, "error");
    }
  };
  reader.readAsText(file);
}

async function refreshRedditMentionsFromProvider({ force = false, renderAfter = true } = {}) {
  const config = state.providerReadiness.redditProviderConfig || buildRedditProviderConfig({}, state.redditSettings);
  const localImportActive = state.redditImportReport?.mode === "local-json" && state.redditImportReport?.mentionsImported;
  if (localImportActive && !force) {
    showRedditImportStatus("Local Reddit JSON import is active. Use Check Reddit source to replace it with the configured provider when available.", "pending");
    return;
  }
  if (!config.liveProviderCalls) {
    showRedditImportStatus(config.detail || "Reddit API is not configured for live sync. Sample/local Reddit remains active.", config.configured ? "pending" : "error");
    return;
  }

  showRedditImportStatus("Syncing Reddit mentions through the local backend...", "pending");
  try {
    const params = new URLSearchParams({
      provider: "reddit-api",
      subreddits: state.redditSettings.subreddits.join(","),
      whitelist: state.redditSettings.whitelist.join(","),
      falsePositives: state.redditSettings.falsePositives.join(",")
    });
    const response = await fetch(`/api/reddit/mentions?${params.toString()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Reddit provider status ${response.status}`);
    const payload = await response.json();
    if (Array.isArray(payload.records) && payload.records.length) {
      state.redditMentions = normalizeRedditMentions(payload.records);
      state.redditImportReport = {
        ok: Boolean(payload.ok),
        partial: Boolean(payload.partial),
        mode: payload.mode || "reddit-api",
        providerId: payload.providerId || "reddit-api",
        providerLabel: payload.providerLabel || "Reddit API",
        sourceMode: payload.sourceMode || "api",
        fileName: payload.providerLabel || "Reddit API provider",
        rowsParsed: payload.rowsParsed || 0,
        mentionsImported: payload.mentionsImported || state.redditMentions.length,
        rejectedRows: payload.rejectedRows || [],
        missingFields: payload.missingFields || [],
        tickersDetected: payload.tickersDetected || [],
        subredditsDetected: payload.subredditsDetected || [],
        summary: payload.summary || [],
        warnings: payload.warnings || [],
        status: payload.status || payload.dataFreshness || "connected",
        fetchedAt: payload.fetchedAt || new Date().toISOString(),
        dataFreshness: payload.dataFreshness || payload.status || "fresh",
        liveProviderCalls: true
      };
      saveRedditMentions(localStorage, state.redditMentions, redditMentionsKey);
      saveRedditImportReport();
      showRedditImportStatus(`Synced ${state.redditMentions.length} Reddit mention row${state.redditMentions.length === 1 ? "" : "s"} from configured subreddits.`, "success");
    } else {
      state.redditImportReport = {
        ok: false,
        partial: false,
        mode: payload.mode || "reddit-api",
        providerId: payload.providerId || "reddit-api",
        providerLabel: payload.providerLabel || "Reddit API",
        rowsParsed: payload.rowsParsed || 0,
        mentionsImported: 0,
        rejectedRows: payload.rejectedRows || [],
        missingFields: payload.missingFields || [],
        tickersDetected: [],
        subredditsDetected: [],
        summary: [],
        warnings: payload.warnings || [],
        status: payload.status || payload.dataFreshness || "error",
        fetchedAt: payload.fetchedAt || new Date().toISOString(),
        dataFreshness: payload.dataFreshness || payload.status || "error",
        liveProviderCalls: Boolean(payload.liveProviderCalls)
      };
      saveRedditImportReport();
      showRedditImportStatus(payload.warnings?.[0] || "No whitelisted Reddit ticker mentions were returned.", payload.liveProviderCalls ? "pending" : "error");
    }
  } catch (error) {
    showRedditImportStatus(`Reddit sync failed: ${safeErrorMessage(error)}`, "error");
  }
  if (renderAfter) render();
}

async function refreshXUpdatesFromProvider({ force = false, renderAfter = true } = {}) {
  const config = state.providerReadiness.xProviderConfig || buildXProviderConfig({}, state.xSettings);
  const localImportActive = state.xUpdateImportReport?.mode === "local-json" && state.xUpdateImportReport?.updatesImported;
  if (localImportActive && !force) {
    showXUpdateStatus("Local X/social import is active. Use Check X source to replace it with the configured provider when available.", "pending");
    return;
  }
  if (!config.liveProviderCalls) {
    showXUpdateStatus(config.detail || "X API is not configured for live sync. Sample X/social rows remain active.", config.configured ? "pending" : "error");
    return;
  }

  showXUpdateStatus("Syncing X updates through the local backend...", "pending");
  try {
    const params = new URLSearchParams({
      provider: "x-api",
      query: state.xSettings.query,
      whitelist: state.xSettings.whitelist.join(",")
    });
    const response = await fetch(`/api/x/updates?${params.toString()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`X provider status ${response.status}`);
    const payload = await response.json();
    if (Array.isArray(payload.records) && payload.records.length) {
      state.xUpdates = normalizeXUpdates(payload.records);
      state.xUpdateImportReport = {
        ok: Boolean(payload.ok),
        partial: Boolean(payload.partial),
        mode: payload.mode || "x-api",
        providerId: payload.providerId || "x-api",
        providerLabel: payload.providerLabel || "X API",
        sourceMode: payload.sourceMode || "api",
        fileName: payload.providerLabel || "X API provider",
        rowsParsed: payload.rowsParsed || 0,
        updatesImported: payload.updatesImported || state.xUpdates.length,
        rejectedRows: payload.rejectedRows || [],
        missingFields: payload.missingFields || [],
        tickersDetected: payload.tickersDetected || [],
        summary: payload.summary || [],
        warnings: payload.warnings || [],
        status: payload.status || payload.dataFreshness || "connected",
        fetchedAt: payload.fetchedAt || new Date().toISOString(),
        dataFreshness: payload.dataFreshness || payload.status || "fresh",
        liveProviderCalls: true
      };
      saveXUpdates(localStorage, state.xUpdates, xUpdatesKey);
      saveXUpdateImportReport();
      showXUpdateStatus(`Synced ${state.xUpdates.length} X/social update row${state.xUpdates.length === 1 ? "" : "s"} from the configured recent-search query.`, "success");
    } else {
      state.xUpdateImportReport = {
        ok: false,
        partial: false,
        mode: payload.mode || "x-api",
        providerId: payload.providerId || "x-api",
        providerLabel: payload.providerLabel || "X API",
        rowsParsed: payload.rowsParsed || 0,
        updatesImported: 0,
        rejectedRows: payload.rejectedRows || [],
        missingFields: payload.missingFields || [],
        tickersDetected: [],
        summary: [],
        warnings: payload.warnings || [],
        status: payload.status || payload.dataFreshness || "error",
        fetchedAt: payload.fetchedAt || new Date().toISOString(),
        dataFreshness: payload.dataFreshness || payload.status || "error",
        liveProviderCalls: Boolean(payload.liveProviderCalls)
      };
      saveXUpdateImportReport();
      showXUpdateStatus(payload.warnings?.[0] || "No whitelisted X/social ticker updates were returned.", payload.liveProviderCalls ? "pending" : "error");
    }
  } catch (error) {
    showXUpdateStatus(`X sync failed: ${safeErrorMessage(error)}`, "error");
  }
  if (renderAfter) render();
}

function saveRedditSettingsFromUi() {
  state.redditSettings = normalizeRedditSettings({
    subreddits: $("redditSubreddits")?.value || state.redditSettings.subreddits,
    whitelist: $("redditWhitelist")?.value || state.redditSettings.whitelist,
    falsePositives: $("redditFalsePositives")?.value || state.redditSettings.falsePositives
  });
  saveRedditSettings();
  state.providerReadiness = {
    ...state.providerReadiness,
    redditProviderConfig: buildRedditProviderConfig(state.providerReadiness?.redditProviderConfig || {}, state.redditSettings),
    redditProviderStatuses: redditProviderStatuses(state.providerReadiness?.redditProviderConfig || {}, state.redditSettings)
  };
  showRedditImportStatus("Reddit settings saved locally. Use Check Reddit source when the backend is configured, or keep sample/local mode.", "success");
  render();
}

function saveXSettingsFromUi() {
  state.xSettings = normalizeXSettings({
    query: $("xQuery")?.value || state.xSettings.query,
    whitelist: $("xWhitelist")?.value || state.xSettings.whitelist
  });
  saveXSettings();
  state.providerReadiness = {
    ...state.providerReadiness,
    xProviderConfig: buildXProviderConfig(state.providerReadiness?.xProviderConfig || {}, state.xSettings),
    xProviderStatuses: xProviderStatuses(state.providerReadiness?.xProviderConfig || {}, state.xSettings)
  };
  showXUpdateStatus("X settings saved locally. Use Check X source when the backend is configured, or keep sample mode.", "success");
  render();
}

function syncAlertThresholdInputs() {
  if (document.activeElement?.closest?.("#alertThresholdSettings")) return;
  const thresholds = normalizeAlertThresholds(state.alertThresholds);
  setInputValue("alertMaxPositionWeight", thresholdPercentInput(thresholds.maxPositionWeight));
  setInputValue("alertMaxSectorWeight", thresholdPercentInput(thresholds.maxSectorWeight));
  setInputValue("alertMaxLeveragedWeight", thresholdPercentInput(thresholds.maxLeveragedWeight));
  setInputValue("alertTickerSignalScore", Math.round(thresholds.tickerSignalScore));
  setInputValue("alertPoliticianTradeScore", thresholdPercentInput(thresholds.politicianTradeScore));
  setInputValue("alertRedditAcceleration", thresholdPercentInput(thresholds.redditMentionAcceleration));
  setInputValue("alertStaleHours", thresholds.staleHours);
}

function saveAlertThresholdsFromUi() {
  state.alertThresholds = normalizeAlertThresholds({
    maxPositionWeight: $("alertMaxPositionWeight")?.value,
    maxSectorWeight: $("alertMaxSectorWeight")?.value,
    maxLeveragedWeight: $("alertMaxLeveragedWeight")?.value,
    tickerSignalScore: $("alertTickerSignalScore")?.value,
    politicianTradeScore: $("alertPoliticianTradeScore")?.value,
    redditMentionAcceleration: $("alertRedditAcceleration")?.value,
    staleHours: $("alertStaleHours")?.value,
    minActionDrift: state.alertThresholds.minActionDrift,
    largeMovePercent: state.alertThresholds.largeMovePercent
  });
  saveAlertThresholds();
  showAlertThresholdStatus("Alert thresholds saved locally. Alerts remain in-app only.", "success");
  render();
}

function handleWatchlistAction(event) {
  const button = event.target.closest("[data-watchlist-action]");
  if (!button) return;
  const action = button.dataset.watchlistAction;
  const ticker = normalizeTicker(button.dataset.ticker || "");
  if (action === "promote-signal") {
    if (!ticker) return;
    state.watchlistIdeas = promoteTickerSignalToIdea({
      ticker,
      combinedScore: Number(button.dataset.score || 0),
      topHeadline: button.dataset.headline || "",
      explanation: button.dataset.explanation || "",
      actionCategory: button.dataset.actionCategory || "",
      sector: button.dataset.sector || ""
    }, state.watchlistIdeas, { asOf: new Date().toISOString(), sourceOfIdea: "Ticker signal" });
    saveWatchlistIdeas();
    showWatchlistStatus(`${ticker} added to the idea pipeline.`, "success");
    window.location.hash = "#watchlist";
    render();
    return;
  }
  if (action === "edit") {
    const idea = state.watchlistIdeas.find((row) => normalizeTicker(row.ticker) === ticker) || {
      ticker,
      status: button.dataset.status || "watching",
      thesis: button.dataset.thesis || "",
      catalyst: button.dataset.catalyst || "",
      sourceOfIdea: button.dataset.source || "Manual",
      sector: button.dataset.sector || "",
      conviction: button.dataset.conviction || "Unrated",
      dateAdded: today()
    };
    fillWatchlistEditor(idea);
    showWatchlistStatus(`${ticker || "Idea"} loaded into the editor.`, "pending");
    return;
  }
  if (action === "set-status") {
    if (!ticker) return;
    const existing = state.watchlistIdeas.find((row) => normalizeTicker(row.ticker) === ticker) || { ticker, sourceOfIdea: "Manual", dateAdded: today() };
    state.watchlistIdeas = upsertWatchlistIdea(state.watchlistIdeas, { ...existing, status: button.dataset.status || "watching", updatedAt: new Date().toISOString() });
    saveWatchlistIdeas();
    showWatchlistStatus(`${ticker} moved to ${watchlistStatusLabel(button.dataset.status || "watching").toLowerCase()}.`, "success");
    render();
    return;
  }
  if (action === "delete") {
    if (!ticker) return;
    if (!confirmLocalChange(`Remove ${ticker} from saved ideas? Holdings and thesis records will not be changed.`)) return;
    state.watchlistIdeas = removeWatchlistIdea(state.watchlistIdeas, ticker);
    saveWatchlistIdeas();
    showWatchlistStatus(`${ticker} removed from saved ideas.`, "success");
    render();
  }
}

function handleJournalAction(event) {
  const button = event.target.closest("[data-journal-action]");
  if (!button) return;
  const action = button.dataset.journalAction;
  const id = button.dataset.journalId || "";
  const entry = state.decisionJournal.find((row) => row.id === id);
  if (action === "edit") {
    if (!entry) return;
    fillJournalEditor(entry);
    showJournalStatus(`${entry.ticker} journal entry loaded into the editor.`, "pending");
    return;
  }
  if (action === "delete") {
    if (!entry) return;
    if (!confirmLocalChange(`Delete ${entry.ticker} journal entry? This does not place or cancel any trade.`)) return;
    state.decisionJournal = removeJournalEntry(state.decisionJournal, id);
    saveDecisionJournal();
    showJournalStatus(`${entry.ticker} journal entry deleted locally.`, "success");
    render();
    return;
  }
  if (action === "new-for-ticker") {
    fillJournalEditor({
      ticker: button.dataset.ticker,
      decisionType: button.dataset.decisionType || "watch",
      conviction: button.dataset.conviction || "Unrated",
      dateTime: new Date().toISOString()
    });
    window.location.hash = "#journal";
    showJournalStatus(`Ready to log a ${button.dataset.ticker || "ticker"} decision.`, "pending");
  }
}

function resetAlertThresholds() {
  state.alertThresholds = normalizeAlertThresholds(DEFAULT_ALERT_THRESHOLDS);
  saveAlertThresholds();
  showAlertThresholdStatus("Alert thresholds reset to local defaults.", "success");
  render();
}

function liveMarketDataProxyEnabled() {
  return Boolean(state.providerReadiness?.marketDataConfig?.liveProviderCalls);
}

function marketDataLiveModePausedForVisibility() {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

function marketDataLiveModeBackoffMs(liveMode = state.marketDataLiveMode) {
  const timestamp = new Date(liveMode?.backoffUntil || "").getTime();
  if (!Number.isFinite(timestamp)) return 0;
  return Math.max(0, timestamp - Date.now());
}

function canRunMarketDataLiveRefresh() {
  return Boolean(
    state.marketDataLiveMode.enabled &&
    liveMarketDataProxyEnabled() &&
    !marketDataLiveModePausedForVisibility() &&
    marketDataLiveModeBackoffMs(state.marketDataLiveMode) === 0
  );
}

function marketDataLiveModeStatusText() {
  const liveMode = normalizeMarketDataLiveMode(state.marketDataLiveMode);
  const intervalLabel = formatLiveModeInterval(liveMode.intervalSeconds);
  const lastRefresh = liveMode.lastRefreshAt ? ` Last refresh ${formatLiveModeTime(liveMode.lastRefreshAt)}.` : "";
  const lastStatus = liveMode.lastStatus ? ` Last status: ${liveMode.lastStatus}.` : "";
  if (!liveMode.enabled) {
    return "Live mode off. Use Refresh market data for a one-time cache-aware snapshot.";
  }
  if (!liveMarketDataProxyEnabled()) {
    return "Live mode is on, but it is waiting for a configured local market data provider. Sample mode remains safe.";
  }
  if (marketDataLiveModePausedForVisibility()) {
    return `Live mode is paused while this tab is hidden. It will resume every ${intervalLabel} when the dashboard is visible again.${lastRefresh}${lastStatus}`;
  }
  const backoffMs = marketDataLiveModeBackoffMs(liveMode);
  if (backoffMs > 0) {
    return `Live mode is paused after a provider rate-limit response. Next retry about ${formatLiveModeTime(liveMode.backoffUntil)}.${lastRefresh}${lastStatus}`;
  }
  const nextRefresh = liveMode.nextRefreshAt ? ` Next refresh about ${formatLiveModeTime(liveMode.nextRefreshAt)}.` : "";
  return `Live mode on. Refreshing every ${intervalLabel} through the local cache so provider calls respect TTLs.${nextRefresh}${lastRefresh}${lastStatus}`;
}

function deferMarketDataRefreshDuringBackoff(reason = "manual") {
  const backoffMs = marketDataLiveModeBackoffMs(state.marketDataLiveMode);
  if (reason === "live-mode" || backoffMs <= 0 || !liveMarketDataProxyEnabled()) return false;
  const backoffUntil = state.marketDataLiveMode.backoffUntil;
  state.marketDataLiveMode = normalizeMarketDataLiveMode({
    ...state.marketDataLiveMode,
    lastStatus: "manual refresh deferred",
    lastError: `Provider rate-limit backoff is active until ${formatLiveModeTime(backoffUntil)}.`
  });
  saveMarketDataLiveMode();
  updateMarketDataLiveModeControls();
  return true;
}

function formatLiveModeInterval(seconds) {
  const normalized = normalizeMarketDataLiveMode({ intervalSeconds: seconds }).intervalSeconds;
  if (normalized < 120) return `${normalized} sec`;
  const minutes = Math.round(normalized / 60);
  return `${minutes} min`;
}

function formatLiveModeTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function updateMarketDataLiveModeControls() {
  const liveMode = normalizeMarketDataLiveMode(state.marketDataLiveMode);
  state.marketDataLiveMode = liveMode;
  const toggle = $("marketDataLiveModeToggle");
  const interval = $("marketDataLiveModeInterval");
  const status = $("marketDataLiveModeStatus");
  if (toggle) {
    toggle.checked = Boolean(liveMode.enabled);
    toggle.disabled = false;
    toggle.setAttribute("aria-describedby", "marketDataLiveModeStatus");
  }
  if (interval) {
    interval.value = String(liveMode.intervalSeconds);
    interval.disabled = !liveMode.enabled || !liveMarketDataProxyEnabled();
  }
  if (status) {
    const enabled = liveMode.enabled && liveMarketDataProxyEnabled() && !marketDataLiveModePausedForVisibility();
    status.textContent = marketDataLiveModeStatusText();
    const lastState = `${liveMode.lastStatus || ""} ${liveMode.lastError || ""}`.toLowerCase();
    const stateClass = /error|failed/.test(lastState)
      ? "error"
      : /rate|stale|partial/.test(lastState)
      ? "warning"
      : "success";
    status.className = enabled ? `connector-status ${stateClass}` : liveMode.enabled ? "connector-status pending" : "connector-status";
  }
}

function clearMarketDataLiveModeTimer() {
  if (marketDataLiveModeTimer) {
    clearTimeout(marketDataLiveModeTimer);
    marketDataLiveModeTimer = null;
  }
}

function scheduleMarketDataLiveMode() {
  clearMarketDataLiveModeTimer();
  state.marketDataLiveMode = normalizeMarketDataLiveMode(state.marketDataLiveMode);
  if (!state.marketDataLiveMode.enabled || !liveMarketDataProxyEnabled() || marketDataLiveModePausedForVisibility()) {
    state.marketDataLiveMode.nextRefreshAt = null;
    saveMarketDataLiveMode();
    updateMarketDataLiveModeControls();
    return;
  }
  const intervalMs = Math.max(state.marketDataLiveMode.intervalSeconds * 1000, marketDataLiveModeBackoffMs(state.marketDataLiveMode));
  state.marketDataLiveMode.nextRefreshAt = new Date(Date.now() + intervalMs).toISOString();
  saveMarketDataLiveMode();
  updateMarketDataLiveModeControls();
  marketDataLiveModeTimer = setTimeout(async () => {
    if (!canRunMarketDataLiveRefresh()) {
      scheduleMarketDataLiveMode();
      return;
    }
    if (!marketDataLiveModeInFlight) {
      marketDataLiveModeInFlight = true;
      try {
        await refreshMarketDataSnapshot({ renderAfter: true, reason: "live-mode" });
      } finally {
        marketDataLiveModeInFlight = false;
      }
    }
    scheduleMarketDataLiveMode();
  }, intervalMs);
}

async function toggleMarketDataLiveMode(enabled) {
  state.marketDataLiveMode = normalizeMarketDataLiveMode({
    ...state.marketDataLiveMode,
    enabled,
    backoffUntil: enabled ? state.marketDataLiveMode.backoffUntil : null
  });
  saveMarketDataLiveMode();
  clearMarketDataLiveModeTimer();
  if (enabled && canRunMarketDataLiveRefresh() && !marketDataLiveModeInFlight) {
    marketDataLiveModeInFlight = true;
    try {
      await refreshMarketDataSnapshot({ renderAfter: true, reason: "live-mode" });
    } finally {
      marketDataLiveModeInFlight = false;
      scheduleMarketDataLiveMode();
    }
  } else {
    scheduleMarketDataLiveMode();
    render();
  }
}

function setMarketDataLiveModeInterval(value) {
  state.marketDataLiveMode = normalizeMarketDataLiveMode({
    ...state.marketDataLiveMode,
    intervalSeconds: value
  });
  saveMarketDataLiveMode();
  scheduleMarketDataLiveMode();
}

function buildCsvImportResult(provider, csv, adapters, options = {}) {
  return provider === "fidelity"
    ? adapters.buildImportResult({
        fidelityCsv: options.isJson ? undefined : csv,
        fidelityJson: options.isJson ? csv : undefined,
        fidelityFileName: options.fileName,
        columnMapping: options.columnMapping
      })
    : adapters.buildImportResult({ seekingAlphaCsv: csv, seekingAlphaFileName: options.fileName, seekingAlphaColumnMapping: options.columnMapping });
}

function buildSeekingAlphaWorkbookImportResult(records) {
  const adapters = globalThis.DataAdapters;
  const mergeResult = adapters.mergeRecordsByTicker(records);
  const validation = adapters.validateRecords(mergeResult.records);
  return {
    records: mergeResult.records,
    fidelityRecords: [],
    seekingAlphaRecords: records,
    validation,
    summary: adapters.summarizeImport({
      fidelityRecords: [],
      seekingAlphaRecords: records,
      mergedRecords: mergeResult.records,
      duplicateTickers: mergeResult.summary.duplicateTickers,
      validation
    })
  };
}

function isWorkbookFile(file) {
  return /\.xlsx$/i.test(file.name) || file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

function isJsonFile(file) {
  return /\.json$/i.test(file.name) || file.type === "application/json";
}

function demoSyncSeekingAlpha() {
  const records = demoSeekingAlphaPremiumData();
  mergeSeekingAlphaRecords(records, "demo");
  showSeekingAlphaStatus(`Sample loaded ${records.length} Seeking Alpha Premium rating records.`, "success");
}

function renderFidelityStatus() {
  const status = state.fidelityStatus;
  if (status.restoredFromBackup) {
    showFidelityStatus(status.message || "Fidelity status restored from backup. Revalidate before treating it as connected.", "pending");
    return;
  }
  if (/sample/i.test(String(status.mode || ""))) {
    showFidelityStatus(status.message || "Sample portfolio loaded. Import a Fidelity CSV to use Tucker's real holdings.", "pending");
    return;
  }
  if (status.lastSync) {
    const synced = new Date(status.lastSync).toLocaleString();
    const label = /csv|import/i.test(String(status.mode || ""))
      ? "Fidelity local import active"
      : /plaid/i.test(String(status.mode || "")) || status.provider === "plaid"
      ? "Fidelity linked through Plaid"
      : status.mode === "demo"
      ? "Sample holdings loaded"
      : "Portfolio source loaded";
    const accountText = status.accounts ? ` across ${status.accounts} account${status.accounts === 1 ? "" : "s"}` : "";
    const valueText = status.totalMarketValue ? ` totaling ${formatCurrency(status.totalMarketValue)}` : "";
    showFidelityStatus(`${label}: ${status.holdings || 0} holding${status.holdings === 1 ? "" : "s"}${accountText}${valueText}. Updated ${synced}.`, "success");
  } else {
    showFidelityStatus("Import a Fidelity CSV, or connect with Plaid after adding Plaid credentials to .env. Fidelity credentials are handled by Plaid Link, not this dashboard.", "pending");
  }
}

async function startPlaidFidelityLink() {
  try {
    showFidelityStatus("Preparing Plaid Link. Plaid credentials stay on the local backend.", "pending");
    const link = await requestFidelityLink({ provider: "plaid", baseUrl: "/api" });
    if (!link.linkToken) throw new Error(link.message || "Plaid did not return a Link token.");
    await loadPlaidLinkScript();
    if (!window.Plaid?.create) {
      throw new Error("Plaid Link script is not loaded yet. Check your network connection and reload the dashboard.");
    }
    const handler = window.Plaid.create({
      token: link.linkToken,
      onSuccess: async (publicToken) => {
        try {
          showFidelityStatus("Plaid Link authorized Fidelity. Exchanging token server-side.", "pending");
          await exchangeFidelityPublicToken({ publicToken, provider: "plaid", baseUrl: "/api" });
          await refreshProviderReadiness();
          await syncPlaidFidelityHoldings();
        } catch (error) {
          showFidelityStatus(`Plaid link finished but sync failed safely: ${safeErrorMessage(error)}`, "error");
        }
      },
      onExit: (error) => {
        if (error) {
          showFidelityStatus(`Plaid Link exited: ${safeErrorMessage(error)}`, "error");
        } else {
          showFidelityStatus("Plaid Link closed. No Fidelity holdings were changed.", "pending");
        }
      }
    });
    handler.open();
  } catch (error) {
    showFidelityStatus(`Plaid Link is not ready: ${safeErrorMessage(error)}`, "error");
  }
}

let plaidLinkScriptPromise = null;

function loadPlaidLinkScript() {
  if (window.Plaid?.create) return Promise.resolve();
  if (plaidLinkScriptPromise) return plaidLinkScriptPromise;
  plaidLinkScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-plaid-link-script='true']");
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Plaid Link script failed to load.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
    script.async = true;
    script.defer = true;
    script.dataset.plaidLinkScript = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Plaid Link script failed to load."));
    document.head.appendChild(script);
  });
  return plaidLinkScriptPromise;
}

async function syncPlaidFidelityHoldings() {
  try {
    showFidelityStatus("Syncing Fidelity holdings through Plaid Investments.", "pending");
    const payload = await fetchFidelityHoldingsPayload({ provider: "plaid", baseUrl: "/api" });
    const records = normalizeProviderHoldings("plaid", payload);
    if (!records.length) {
      throw new Error("Plaid returned no investment holdings. Confirm the linked account includes investment positions.");
    }
    mergeImportedRecords(records, { replace: true, render: false });
    const totalMarketValue = records.reduce((sum, record) => sum + (Number(record.marketValue ?? record.positionValue) || 0), 0);
    const accounts = new Set(records.map((record) => record.account).filter(Boolean));
    const rawAccountCount = Array.isArray(payload.accounts) ? payload.accounts.length : accounts.size;
    const linkedAccountNote = rawAccountCount > accounts.size
      ? ` ${rawAccountCount - accounts.size} linked account${rawAccountCount - accounts.size === 1 ? "" : "s"} had no normalized investment holdings.`
      : "";
    state.fidelityStatus = {
      connected: true,
      provider: "plaid",
      mode: "plaid-live",
      lastSync: payload.fetchedAt || new Date().toISOString(),
      linkedAt: payload.linkedAt || state.fidelityStatus?.linkedAt || null,
      holdings: records.length,
      accounts: accounts.size,
      linkedAccounts: rawAccountCount,
      totalMarketValue,
      itemId: payload.itemId || null,
      message: `Fidelity synced through Plaid: ${records.length} holding${records.length === 1 ? "" : "s"} across ${accounts.size} account${accounts.size === 1 ? "" : "s"} loaded.${linkedAccountNote}`
    };
    state.latestImportReport = {
      provider: "plaid",
      fileName: "Plaid Fidelity Investments",
      importedAt: state.fidelityStatus.lastSync,
      realPortfolioImport: true,
      rowsParsed: payload.holdings?.length || records.length,
      holdingsImported: records.length,
      rejectedRows: [],
      skippedRows: [],
      missingRequiredFields: [],
      columnMapping: { source: "Plaid investments holdings/get" },
      totalMarketValue,
      tickersDetected: records.map((record) => record.ticker).filter(Boolean),
      accountsDetected: [...accounts],
      health: {
        status: "Success",
        tone: "success",
        message: state.fidelityStatus.message
      }
    };
    saveFidelityStatus();
    saveLatestImportReport();
    if (canRunMarketDataLiveRefresh()) {
      await refreshMarketDataSnapshot({ renderAfter: false, reason: "live-mode" });
    }
    showImportStatus({
      records,
      fidelityRecords: records,
      validation: { ok: true, errors: [], warnings: [] },
      importReport: state.latestImportReport,
      summary: { message: state.latestImportReport.health.message }
    }, { persist: true, render: false });
    showFidelityStatus(state.fidelityStatus.message, "success");
    render();
  } catch (error) {
    showFidelityStatus(`Plaid holdings sync failed safely: ${safeErrorMessage(error)}`, "error");
  }
}

async function unlinkPlaidFidelity() {
  try {
    showFidelityStatus("Disconnecting local Plaid Fidelity link.", "pending");
    await unlinkFidelityConnection({ provider: "plaid", baseUrl: "/api" });
    state.fidelityStatus = {
      connected: false,
      provider: "plaid",
      lastSync: null,
      mode: "not-connected",
      message: "Fidelity Plaid link cleared locally."
    };
    saveFidelityStatus();
    showFidelityStatus("Fidelity Plaid link cleared locally. Existing holdings remain until you import, sync, or reset the portfolio.", "success");
    await refreshProviderReadiness();
  } catch (error) {
    showFidelityStatus(`Plaid unlink failed safely: ${safeErrorMessage(error)}`, "error");
  }
}

function renderSeekingAlphaStatus() {
  const status = state.seekingAlphaStatus;
  renderSeekingAlphaInsights(status.insights);
  if (status.restoredFromBackup) {
    showSeekingAlphaStatus(status.message || "Seeking Alpha status restored from backup. Revalidate before treating it as connected.", "pending");
    return;
  }
  if (status.lastSync) {
    const synced = new Date(status.lastSync).toLocaleString();
    const label = status.mode === "demo"
      ? "Sample Premium data loaded"
      : /csv|xlsx|import/i.test(String(status.mode || ""))
      ? "Seeking Alpha export imported"
      : status.connected && status.mode === "live"
      ? "Seeking Alpha connector synced"
      : "Seeking Alpha local data loaded";
    showSeekingAlphaStatus(`${label}: ${status.records || 0} records at ${synced}.`, "success");
  } else {
    showSeekingAlphaStatus("Not configured.", "pending");
  }
}

function wireEvents() {
  ["query", "holdingViewMode", "portfolioGroup", "portfolioGroupValue", "riskFilter", "thesisFilter", "rebalanceMode", "hideTinyCash", "signalReviewFilter", "alphaRecommendationFilter", "riskGuardrailFilter", "watchlistQuery", "watchlistStatusFilter", "watchlistSectorFilter", "watchlistSourceFilter", "watchlistConvictionFilter", "journalQuery", "journalTickerFilter", "journalDecisionFilter", "journalConvictionFilter", "journalFromDate", "journalToDate", "calendarTickerFilter", "calendarTypeFilter", "calendarImportanceFilter", "calendarSourceFilter", "calendarWindowFilter", "whatIfAction", "whatIfTicker", "whatIfAmount", "whatIfPercent", "whatIfTargetWeight", "whatIfFundingMode"].forEach((id) => $(id)?.addEventListener("input", render));
  $("fidelityFile").addEventListener("change", (event) => {
    importFile(event.target.files[0], "fidelity");
    event.target.value = "";
  });
  $("fidelityDropZone")?.addEventListener("dragover", handleFidelityDrag);
  $("fidelityDropZone")?.addEventListener("dragleave", clearFidelityDragState);
  $("fidelityDropZone")?.addEventListener("drop", handleFidelityDrop);
  $("fidelityDropZone")?.addEventListener("keydown", handleFidelityDropZoneKeydown);
  $("parseFidelityPasteBtn")?.addEventListener("click", parsePastedFidelityHoldings);
  $("clearFidelityPasteBtn")?.addEventListener("click", clearFidelityPaste);
  $("accountScopePanel")?.addEventListener("click", handleAccountScopeClick);
  $("connectPlaidFidelityBtn")?.addEventListener("click", startPlaidFidelityLink);
  $("syncPlaidFidelityBtn")?.addEventListener("click", syncPlaidFidelityHoldings);
  $("unlinkPlaidFidelityBtn")?.addEventListener("click", unlinkPlaidFidelity);
  $("dataSourcesPlaidSyncBtn")?.addEventListener("click", syncPlaidFidelityHoldings);
  $("alphaFile").addEventListener("change", (event) => {
    importFile(event.target.files[0], "seekingAlpha");
    event.target.value = "";
  });
  $("importDebugPanel").addEventListener("click", (event) => {
    if (event.target.closest("[data-import-action='apply-mapping']")) applyManualImportMapping();
    if (event.target.closest("[data-import-action='apply-preview']")) applyPendingPortfolioImport();
    if (event.target.closest("[data-import-action='cancel-preview']")) cancelPendingPortfolioImport();
  });
  $("demoSeekingAlphaBtn").addEventListener("click", demoSyncSeekingAlpha);
  $("exportStateBtn").addEventListener("click", exportDashboardState);
  $("stateFile").addEventListener("change", (event) => importStateFile(event.target.files[0]));
  $("clearPortfolioBtn")?.addEventListener("click", clearPortfolioData);
  $("saveTargetsBtn").addEventListener("click", saveTargetsFromUi);
  $("resetTargetsBtn").addEventListener("click", resetTargetTemplate);
  $("exportTargetsBtn").addEventListener("click", exportTargetAllocations);
  $("targetFile").addEventListener("change", (event) => importTargetAllocationFile(event.target.files[0]));
  $("politicianTradesFile").addEventListener("change", (event) => importPoliticianTradeFileFromInput(event.target.files[0]));
  $("syncPoliticianTradesBtn")?.addEventListener("click", () => refreshPoliticianTradesFromProvider({ force: true }));
  $("redditJsonFile").addEventListener("change", (event) => importRedditMentionFileFromInput(event.target.files[0]));
  $("calendarEventFile")?.addEventListener("change", (event) => importCalendarEventFileFromInput(event.target.files[0]));
  $("saveRedditSettingsBtn").addEventListener("click", saveRedditSettingsFromUi);
  $("syncRedditMentionsBtn")?.addEventListener("click", () => refreshRedditMentionsFromProvider({ force: true }));
  $("saveXSettingsBtn")?.addEventListener("click", saveXSettingsFromUi);
  $("syncXUpdatesBtn")?.addEventListener("click", () => refreshXUpdatesFromProvider({ force: true }));
  $("refreshMarketDataBtn")?.addEventListener("click", () => manualRefreshMarketDataSnapshot());
  $("marketDataLiveModeToggle")?.addEventListener("change", (event) => toggleMarketDataLiveMode(event.target.checked));
  $("marketDataLiveModeInterval")?.addEventListener("change", (event) => setMarketDataLiveModeInterval(event.target.value));
  $("saveAlertThresholdsBtn").addEventListener("click", saveAlertThresholdsFromUi);
  $("resetAlertThresholdsBtn").addEventListener("click", resetAlertThresholds);
  $("saveWatchlistIdeaBtn")?.addEventListener("click", saveWatchlistIdeaFromEditor);
  $("clearWatchlistIdeaBtn")?.addEventListener("click", clearWatchlistEditor);
  $("deleteWatchlistIdeaBtn")?.addEventListener("click", deleteWatchlistIdeaFromEditor);
  $("saveJournalEntryBtn")?.addEventListener("click", saveJournalEntryFromEditor);
  $("clearJournalEntryBtn")?.addEventListener("click", clearJournalEditor);
  $("deleteJournalEntryBtn")?.addEventListener("click", deleteJournalEntryFromEditor);
  $("saveCalendarEventBtn")?.addEventListener("click", saveCalendarEventFromEditor);
  $("clearCalendarEventBtn")?.addEventListener("click", clearCalendarEventEditor);
  $("deleteCalendarEventBtn")?.addEventListener("click", deleteCalendarEventFromEditor);
  $("runWhatIfBtn")?.addEventListener("click", refreshWhatIfScenario);
  $("resetWhatIfBtn")?.addEventListener("click", resetWhatIfScenario);
  $("attentionAlerts").addEventListener("click", handleAlertLifecycleAction);
  $("portfolioHoldingsTable").addEventListener("click", handleHoldingSort);
  $("portfolioHoldingsTable").addEventListener("keydown", handleHoldingSortKeydown);
  $("riskGuardrailsTable")?.addEventListener("click", handleRiskGuardrailSort);
  document.addEventListener("click", handleDigestRouteClick);
  document.addEventListener("keydown", handleDigestRouteKeydown);
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-overview-action='sample']") && confirmSampleOverwrite()) loadSampleData();
  });
  document.addEventListener("click", handleWatchlistAction);
  document.addEventListener("click", handleJournalAction);
  document.addEventListener("click", handleCalendarAction);
  $("thesisTicker").addEventListener("change", () => {
    const analysis = analyzePortfolio(applyThesisProfiles(state.holdings));
    fillThesisEditor($("thesisTicker").value, analysis.holdings);
  });
  $("saveThesisBtn").addEventListener("click", () => saveThesisFromEditor(false));
  $("markReviewedBtn").addEventListener("click", () => saveThesisFromEditor(true));
  $("sampleBtn").addEventListener("click", () => {
    if (confirmSampleOverwrite()) loadSampleData();
  });
  $("exportBtn").addEventListener("click", () => {
    const analysis = analyzePortfolio(applyThesisProfiles(state.holdings));
    downloadExportCsv(analysis.holdings, {
      filename: "tucker-portfolio-dashboard-export.csv",
      headers: ["ticker", "name", "account", "shares", "price", "marketValue", "portfolioWeight", "costBasis", "unrealizedGainPercent", "dailyChange", "targetWeight", "drift", "sector", "assetClass", "strategySleeve", "thesisStatus", "riskLevel", "quant", "valuationGrade", "growthGrade", "profitabilityGrade", "momentumGrade", "revisionsGrade", "nextEarnings"]
    });
    const status = $("routeStatus");
    if (status) status.textContent = `Exported ${analysis.holdings.length} active holding rows as CSV.`;
  });
  window.addEventListener("resize", render);
  window.addEventListener("hashchange", render);
  document.addEventListener("visibilitychange", scheduleMarketDataLiveMode);
  window.addEventListener("beforeunload", clearMarketDataLiveModeTimer);
}

function loadSampleData() {
  state.holdings = tuckerDemoHoldings();
  state.accountScope = ACCOUNT_SCOPE_ALL;
  state.fidelityStatus = {
    connected: false,
    provider: "plaid",
    lastSync: null,
    mode: "sample-demo",
    message: "Sample portfolio loaded. Fidelity is not configured."
  };
  state.seekingAlphaStatus = {
    connected: false,
    lastSync: null,
    mode: "sample-demo",
    insights: null,
    message: "Sample portfolio loaded. Seeking Alpha is not configured."
  };
  state.marketEvents = demoMarketIntelligenceEvents();
  state.alphaEvents = demoAlphaEvents();
  state.thesisProfiles = demoThesisProfiles();
  state.targetAllocations = defaultTargetAllocations();
  state.alertState = emptyAlertState();
  state.alertThresholds = normalizeAlertThresholds(DEFAULT_ALERT_THRESHOLDS);
  state.latestImportReport = null;
  state.politicianTrades = loadPoliticianTrades(null, politicianTradesKey);
  state.politicianTradeImportReport = null;
  state.redditMentions = loadRedditMentions(null, redditMentionsKey);
  state.redditImportReport = null;
  state.redditSettings = normalizeRedditSettings(state.redditSettings);
  state.xUpdates = loadXUpdates(null, xUpdatesKey);
  state.xUpdateImportReport = null;
  state.xSettings = normalizeXSettings(state.xSettings);
  state.watchlistIdeas = defaultWatchlistIdeas();
  state.decisionJournal = defaultJournalEntries();
  state.eventCalendar = defaultCalendarEvents();
  state.eventCalendarImportReport = null;
  state.marketDataSnapshot = null;
  state.quantScoreHistory = [];
  latestTickerSignals = [];
  saveHoldings();
  saveFidelityStatus();
  renderFidelityStatus();
  saveSeekingAlphaStatus();
  saveMarketEvents();
  saveAlphaEvents();
  saveThesisProfiles();
  saveTargetAllocations();
  saveAlertState();
  saveAlertThresholds();
  saveLatestImportReport();
  savePoliticianTrades(localStorage, state.politicianTrades, politicianTradesKey);
  savePoliticianTradeImportReport();
  saveRedditMentions(localStorage, state.redditMentions, redditMentionsKey);
  saveRedditImportReport();
  saveRedditSettings();
  saveXUpdates(localStorage, state.xUpdates, xUpdatesKey);
  saveXUpdateImportReport();
  saveXSettings();
  saveWatchlistIdeas();
  saveDecisionJournal();
  saveEventCalendar();
  saveEventCalendarImportReport();
  saveQuantScoreHistory();
  saveAccountScope();
  showImportStatus({ validation: { ok: true }, summary: { message: "Sample data loaded. Import a Fidelity CSV to use Tucker’s real portfolio." } });
  render();
}

function confirmSampleOverwrite() {
  const status = activePortfolioStatus();
  if (!status.realPortfolio) return true;
  if (typeof window.confirm !== "function") return false;
  return window.confirm("Load sample data? This replaces the currently imported portfolio in local state. You can re-import the CSV any time.");
}

function confirmLocalChange(message) {
  if (typeof window === "undefined") return true;
  if (typeof window.confirm !== "function") return false;
  return window.confirm(message);
}

wireEvents();
renderFidelityStatus();
renderSeekingAlphaStatus();
refreshProviderReadiness();
render();
applyRoute();

function handleAlertLifecycleAction(event) {
  const button = event.target.closest("[data-alert-action]");
  if (!button) return;
  const action = button.dataset.alertAction;
  const alertId = button.dataset.alertId;
  if (action === "review") {
    state.alertState = markAlertReviewed(state.alertState, alertId);
  } else if (action === "hide") {
    state.alertState = hideAlert(state.alertState, alertId);
  } else if (action === "restore-hidden") {
    state.alertState = restoreHiddenAlerts(state.alertState);
  } else {
    return;
  }
  saveAlertState();
  render();
}

async function refreshProviderReadiness() {
  try {
    const response = await fetch("/api/config", { cache: "no-store" });
    if (!response.ok) throw new Error(`Backend status ${response.status}`);
    const config = await response.json();
    const marketDataConfig = config.marketDataConfig || buildMarketDataProviderConfig({});
    state.providerReadiness = {
      mode: "local-api",
      connectors: config.connectors || {},
      providerStatuses: config.marketDataProviders || buildMarketProviderStatuses({}),
      marketDataConfig,
      marketDataQuoteProviders: config.marketDataQuoteProviders || buildMarketDataProviderStatuses({}),
      politicianTradeProviderConfig: config.politicianTradeProviderConfig || buildPoliticianTradeProviderConfig({}),
      politicianTradeProviderStatuses: config.politicianTradeProviderStatuses || politicianTradeProviderStatuses({}),
      redditProviderConfig: config.redditProviderConfig || buildRedditProviderConfig({}, state.redditSettings),
      redditProviderStatuses: config.redditProviderStatuses || redditProviderStatuses({}, state.redditSettings),
      xProviderConfig: config.xProviderConfig || buildXProviderConfig({}, state.xSettings),
      xProviderStatuses: config.xProviderStatuses || xProviderStatuses({}, state.xSettings),
      message: marketDataConfig.liveProviderCalls
        ? "Local backend readiness loaded. Market data calls run through the server-side proxy."
        : "Local backend readiness loaded. Sample market data remains active until credentials are configured.",
      liveProviderCalls: Boolean(marketDataConfig.liveProviderCalls || config.politicianTradeProviderConfig?.liveProviderCalls || config.redditProviderConfig?.liveProviderCalls || config.xProviderConfig?.liveProviderCalls)
    };
    if (canRunMarketDataLiveRefresh()) {
      await refreshMarketDataSnapshot({ renderAfter: false, reason: "live-mode" });
    }
    if (!state.politicianTradeImportReport?.tradesImported || state.politicianTradeImportReport?.mode === "public-static-dataset") {
      await refreshPoliticianTradesFromProvider({ renderAfter: false });
    }
    if (config.redditProviderConfig?.liveProviderCalls && (!state.redditImportReport?.mentionsImported || state.redditImportReport?.mode === "reddit-api")) {
      await refreshRedditMentionsFromProvider({ renderAfter: false });
    }
    if (config.xProviderConfig?.liveProviderCalls && (!state.xUpdateImportReport?.updatesImported || state.xUpdateImportReport?.mode === "x-api")) {
      await refreshXUpdatesFromProvider({ renderAfter: false });
    }
  } catch {
    state.marketDataSnapshot = markMarketDataSnapshotStale(state.marketDataSnapshot, "Local market data refresh failed.");
    state.providerReadiness = {
      mode: "static-demo",
      providerStatuses: buildMarketProviderStatuses({}),
      connectors: {},
      marketDataConfig: buildMarketDataProviderConfig({}),
      marketDataQuoteProviders: buildMarketDataProviderStatuses({}),
      politicianTradeProviderConfig: buildPoliticianTradeProviderConfig({}),
      politicianTradeProviderStatuses: politicianTradeProviderStatuses({}),
      redditProviderConfig: buildRedditProviderConfig({}, state.redditSettings),
      redditProviderStatuses: redditProviderStatuses({}, state.redditSettings),
      xProviderConfig: buildXProviderConfig({}, state.xSettings),
      xProviderStatuses: xProviderStatuses({}, state.xSettings),
      message: "Sample mode. Run npm run dev to check local backend key presence.",
      liveProviderCalls: false
    };
  }
  scheduleMarketDataLiveMode();
  render();
}

function activeMarketDataSnapshot(fallbackMarketDataSnapshot) {
  const snapshot = state.marketDataSnapshot;
  if (!snapshot || typeof snapshot !== "object") return fallbackMarketDataSnapshot;
  if (shouldPreserveMarketDataSnapshot(snapshot)) return snapshot;
  return fallbackMarketDataSnapshot;
}

function shouldReplaceDailyMoveFromMarketData(snapshot = {}) {
  if (!snapshot || typeof snapshot !== "object") return false;
  const statusText = `${snapshot.status?.status || ""} ${snapshot.mode || ""} ${snapshot.dataFreshness || ""}`.toLowerCase();
  if (/mock|sample|not configured|error/.test(statusText)) return false;
  if (/stale|rate limited|rate-limit|quota/.test(statusText)) return false;
  return Boolean(snapshot.liveProviderCalls || /live|cached|stale|connected|partial/.test(statusText));
}

async function refreshMarketDataSnapshot({ renderAfter = true, reason = "manual" } = {}) {
  const tickers = marketDataTickers(applyThesisProfiles(state.holdings));
  const lightweightRefresh = reason === "live-mode";
  if (deferMarketDataRefreshDuringBackoff(reason)) {
    if (renderAfter) render();
    return;
  }
  try {
    const params = new URLSearchParams({
      tickers: tickers.join(","),
      history: lightweightRefresh ? "0" : "1",
      historyLimit: "30"
    });
    if (lightweightRefresh) params.set("profile", "0");
    const response = await fetch(`/api/market-data/quotes?${params.toString()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Market data status ${response.status}`);
    state.marketDataSnapshot = await response.json();
    if (reason === "live-mode") {
      const statusText = `${state.marketDataSnapshot?.status?.status || ""} ${state.marketDataSnapshot?.status?.label || ""}`.toLowerCase();
      const rateLimited = /rate limited|rate-limit|quota/.test(statusText);
      state.marketDataLiveMode = normalizeMarketDataLiveMode({
        ...state.marketDataLiveMode,
        backoffUntil: rateLimited ? new Date(Date.now() + MARKET_DATA_LIVE_MODE_RATE_LIMIT_BACKOFF_SECONDS * 1000).toISOString() : null,
        lastRefreshAt: new Date().toISOString(),
        lastStatus: state.marketDataSnapshot?.status?.label || state.marketDataSnapshot?.status?.status || "refreshed",
        lastError: rateLimited ? state.marketDataSnapshot?.status?.detail || "Provider rate limit reached." : null
      });
      saveMarketDataLiveMode();
    }
  } catch (error) {
    const message = error?.message || "Market data refresh failed.";
    state.marketDataSnapshot = markMarketDataSnapshotStale(state.marketDataSnapshot, message) ||
      buildMarketDataRefreshErrorSnapshot(tickers, message);
    if (reason === "live-mode") {
      state.marketDataLiveMode = normalizeMarketDataLiveMode({
        ...state.marketDataLiveMode,
        lastRefreshAt: new Date().toISOString(),
        lastStatus: "error",
        lastError: message
      });
      saveMarketDataLiveMode();
    }
  }
  if (renderAfter) render();
}

async function manualRefreshMarketDataSnapshot() {
  await refreshMarketDataSnapshot({ reason: "manual" });
}

function buildMarketDataRefreshErrorSnapshot(tickers = [], message = "Market data refresh failed.") {
  const now = new Date().toISOString();
  const config = state.providerReadiness?.marketDataConfig || {};
  const lastError = { message, at: now };
  const providerId = config.selectedProvider || "market-data";
  const providerLabel = config.selectedLabel || "Market data provider";
  const requestedTickers = tickers.map((ticker) => String(ticker || "").toUpperCase()).filter(Boolean);
  const liveMode = Boolean(config.configured && config.liveProviderCalls);
  const mode = liveMode ? "live" : "not-configured";
  return {
    providerId,
    providerLabel,
    mode,
    configured: Boolean(config.configured),
    liveProviderCalls: Boolean(config.liveProviderCalls),
    asOf: now,
    fetchedAt: now,
    dataFreshness: "error",
    cache: {
      enabled: false,
      providerName: providerLabel,
      status: "error",
      freshness: "error",
      fetchedAt: now,
      quoteCount: 0,
      hitCount: 0,
      liveCount: 0,
      staleCount: 0,
      mockCount: 0,
      ttlConfig: null,
      lastSuccessfulRefresh: null,
      lastError
    },
    lastSuccessfulRefresh: null,
    lastError,
    quotes: [],
    quotesByTicker: {},
    requestedTickers,
    missingTickers: requestedTickers,
    warnings: [message],
    error: message,
    sourceTypes: ["quote", "price"],
    status: {
      status: "error",
      label: "Market data error",
      detail: `Market data refresh failed safely: ${message}`,
      providerId,
      providerLabel,
      mode,
      configured: Boolean(config.configured),
      liveProviderCalls: Boolean(config.liveProviderCalls),
      quoteCount: 0,
      asOf: now,
      fetchedAt: now,
      dataFreshness: "error",
      cacheStatus: "error",
      lastSuccessfulRefresh: null,
      lastError,
      requestedTickers,
      missingTickers: requestedTickers,
      warnings: [message],
      quoteDiagnostics: requestedTickers.map((ticker) => ({
        ticker,
        status: "error",
        dataFreshness: "error",
        cacheStatus: "error",
        quote: "missing",
        profile: "missing",
        metric: "missing",
        history: "missing",
        missingFields: ["quote"],
        fetchedAt: null,
        lastError: message
      })),
      cache: {
        enabled: false,
        quoteCount: 0,
        hitCount: 0,
        liveCount: 0,
        staleCount: 0,
        mockCount: 0,
        lastError
      }
    }
  };
}

function markMarketDataSnapshotStale(snapshot, message) {
  if (!snapshot || !snapshot.quotes?.length) return null;
  const mockSnapshot = snapshot.mode === "mock" ||
    snapshot.status?.status === "mock/sample mode" ||
    snapshot.quotes.some((quote) => quote.isMock || quote.sourceMode === "mock");
  if (mockSnapshot) return null;
  const lastError = { message, at: new Date().toISOString() };
  return {
    ...snapshot,
    dataFreshness: "stale",
    lastError,
    quotes: (snapshot.quotes || []).map((quote) => ({
      ...quote,
      dataFreshness: "stale",
      cacheStatus: "stale",
      sourceMode: quote.sourceMode === "live" ? "cached" : quote.sourceMode,
      lastError
    })),
    quotesByTicker: Object.fromEntries(Object.entries(snapshot.quotesByTicker || {}).map(([ticker, quote]) => [ticker, {
      ...quote,
      dataFreshness: "stale",
      cacheStatus: "stale",
      sourceMode: quote.sourceMode === "live" ? "cached" : quote.sourceMode,
      lastError
    }])),
    status: {
      ...(snapshot.status || {}),
      status: "stale data",
      label: "Stale market data",
      detail: `Using the last successful market data snapshot because refresh failed: ${message}`,
      dataFreshness: "stale",
      cacheStatus: "stale",
      lastError,
      quoteDiagnostics: (snapshot.status?.quoteDiagnostics || []).map((row) => ({
        ...row,
        status: "stale data",
        dataFreshness: "stale",
        cacheStatus: "stale",
        lastError: message
      }))
    }
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

function formatSignedCurrency(value) {
  const numeric = Number(value) || 0;
  return `${numeric >= 0 ? "+" : ""}${formatCurrency(numeric)}`;
}

function formatPercent(value) {
  return `${((Number(value) || 0) * 100).toFixed(1)}%`;
}

function formatSignedPercent(value) {
  const numeric = Number(value) || 0;
  return `${numeric >= 0 ? "+" : ""}${formatPercent(numeric)}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 4
  }).format(Number(value) || 0);
}

function splitLines(value) {
  return String(value || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function lines(values = []) {
  return Array.isArray(values) ? values.join("\n") : "";
}

function firstLine(values = []) {
  return Array.isArray(values) ? values[0] || "" : "";
}

function allocationPercent(value) {
  return Number(((Number(value) || 0) * 100).toFixed(2));
}

function thresholdPercentInput(value) {
  return Number(((Number(value) || 0) * 100).toFixed(1));
}

function setInputValue(id, value) {
  const target = $(id);
  if (target) target.value = value;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function safeObject(value, fallback) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function severityRank(severity) {
  return { info: 1, positive: 1, low: 1, watch: 2, medium: 2, warning: 3, high: 3, critical: 4 }[severity] ?? 0;
}
