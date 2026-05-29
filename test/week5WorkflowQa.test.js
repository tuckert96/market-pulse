import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildAlphaSignals, demoAlphaEvents, demoThesisProfiles } from "../src/alphaEngine.js";
import { buildLocalAlerts, normalizeAlertThresholds } from "../src/alertsEngine.js";
import { buildDailyCommandBrief, DAILY_BRIEF_GROUPS } from "../src/dailyCommandBrief.js";
import {
  buildJournalRows,
  defaultJournalEntries,
  signalSnapshotForTicker,
  upsertJournalEntry
} from "../src/decisionJournal.js";
import { buildPortfolioEvents, defaultCalendarEvents } from "../src/eventCalendar.js";
import {
  applyMarketDataToHoldings,
  buildMarketDataProviderStatuses,
  buildMarketDataStatus,
  buildMockMarketDataSnapshot
} from "../src/marketDataProvider.js";
import { buildTickerDetailModel, renderTickerLink } from "../src/portfolioView.js";
import { analyzePortfolio } from "../src/portfolioAnalytics.js";
import { tuckerDemoHoldings } from "../src/portfolioDemoData.js";
import { demoPoliticianTrades } from "../src/politicianTrades.js";
import { demoRedditMentions } from "../src/redditSignals.js";
import { buildTargetAllocationPlan, defaultTargetAllocations } from "../src/targetAllocations.js";
import { buildThesisRows } from "../src/thesisTracker.js";
import { buildCombinedTickerSignals } from "../src/tickerSignals.js";
import { simulateWhatIf } from "../src/whatIfSimulator.js";
import {
  buildWatchlistIdeaRows,
  defaultWatchlistIdeas,
  promoteTickerSignalToIdea,
  watchlistIdeaTickers
} from "../src/watchlistIdeas.js";

const asOf = "2026-05-24T09:00:00-04:00";
const projectRoot = new URL("../", import.meta.url);

function buildWeek5Workflow() {
  const rawHoldings = tuckerDemoHoldings();
  const marketDataSnapshot = buildMockMarketDataSnapshot(
    ["MU", "NVDA", "AMD", "SOXL", "UPRO", "VGT", "CRDO", "QQQ"],
    { asOf }
  );
  const holdings = applyMarketDataToHoldings(rawHoldings, marketDataSnapshot);
  const analysis = analyzePortfolio(holdings);
  const marketDataStatus = buildMarketDataStatus(marketDataSnapshot);
  const thesisRows = buildThesisRows(analysis.holdings, demoThesisProfiles(), { asOf });
  const targetPlan = buildTargetAllocationPlan(analysis.holdings, defaultTargetAllocations(), { asOf });
  const alphaSignals = buildAlphaSignals(demoAlphaEvents(), analysis.holdings, demoThesisProfiles());
  const redditMentions = demoRedditMentions({ asOf });
  const politicianTrades = demoPoliticianTrades({ asOf });
  const watchlistIdeas = defaultWatchlistIdeas(asOf);
  const tickerSignals = buildCombinedTickerSignals({
    holdings: analysis.holdings,
    redditMentions,
    politicianTrades,
    alphaSignals,
    marketDataSnapshot,
    watchlist: ["MU", "NVDA", "AMD", "SOXL", "UPRO", "VGT", "CRDO", "QQQ"],
    asOf
  });
  const watchlistIdeaRows = buildWatchlistIdeaRows({
    watchlistIdeas,
    holdings: analysis.holdings,
    tickerSignals,
    thesisRows,
    marketDataSnapshot,
    asOf
  });
  const journalRows = buildJournalRows({
    entries: defaultJournalEntries(asOf),
    holdings: analysis.holdings,
    tickerSignals,
    watchlistIdeas: watchlistIdeaRows
  });
  const calendarEvents = buildPortfolioEvents({
    calendarEvents: defaultCalendarEvents(asOf),
    holdings: analysis.holdings,
    watchlistIdeas: watchlistIdeaRows,
    thesisRows,
    asOf
  });
  const providerReadiness = {
    providerStatuses: buildMarketDataProviderStatuses({}),
    marketDataQuoteProviders: buildMarketDataProviderStatuses({}),
    liveProviderCalls: false
  };
  const localAlerts = buildLocalAlerts({
    analysis,
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
  const analysisWithAlerts = {
    ...analysis,
    alerts: [...analysis.alerts, ...localAlerts]
  };
  const dailyBrief = buildDailyCommandBrief({
    analysis: analysisWithAlerts,
    tickerSignals,
    redditMentions,
    politicianTrades,
    providerReadiness,
    marketDataStatus,
    targetPlan,
    thesisRows,
    eventCalendar: calendarEvents,
    portfolioDataQuality: { status: "clean", message: "Sample import is structurally usable." },
    uiState: "IMPORTED_CLEAN",
    asOf
  });

  return {
    rawHoldings,
    holdings,
    analysis: analysisWithAlerts,
    marketDataSnapshot,
    marketDataStatus,
    thesisRows,
    targetPlan,
    alphaSignals,
    redditMentions,
    politicianTrades,
    tickerSignals,
    watchlistIdeas,
    watchlistIdeaRows,
    journalRows,
    calendarEvents,
    providerReadiness,
    dailyBrief
  };
}

test("Week 5 daily workflow connects brief, alerts, signals, ticker pages, journal, what-if, and risk", () => {
  const workflow = buildWeek5Workflow();
  const { dailyBrief } = workflow;

  assert.equal(dailyBrief.statusLabel, "Imported");
  assert.ok(dailyBrief.groups[DAILY_BRIEF_GROUPS.ACTION].length > 0, "action group should have review items");
  assert.ok(dailyBrief.groups[DAILY_BRIEF_GROUPS.WATCH].length > 0, "watch group should have monitoring items");
  assert.ok(dailyBrief.groups[DAILY_BRIEF_GROUPS.INFO].length > 0, "info group should have context items");
  assert.ok(dailyBrief.items.every((item) => /^#(\/ticker\/[A-Z0-9.-]+|[a-z-]+)$/.test(item.href)), "brief links should route to app screens or ticker pages");

  assert.ok(workflow.analysis.alerts.some((alert) => alert.actionCategory === "Review" || alert.actionCategory === "Monitor"));
  assert.ok(workflow.tickerSignals.length > 0);
  assert.ok(workflow.tickerSignals[0].combinedScore > 0);

  const muPage = buildTickerDetailModel(workflow.analysis, {
    selectedTicker: "MU",
    marketDataSnapshot: workflow.marketDataSnapshot,
    marketDataStatus: workflow.marketDataStatus,
    thesisRows: workflow.thesisRows,
    tickerSignals: workflow.tickerSignals,
    allWatchlistIdeaRows: workflow.watchlistIdeaRows,
    allJournalRows: workflow.journalRows,
    redditMentions: workflow.redditMentions,
    politicianTrades: workflow.politicianTrades,
    alphaSignals: workflow.alphaSignals,
    marketEvents: demoAlphaEvents(),
    allCalendarEvents: workflow.calendarEvents,
    uiState: "IMPORTED_CLEAN",
    asOf
  });

  assert.equal(muPage.ticker, "MU");
  assert.equal(muPage.owned, true);
  assert.ok(muPage.movementExplainer.drivers.length > 0, "ticker page should explain movement from structured data");
  assert.ok(muPage.journalEntries.length > 0, "ticker page should show decision history");
  assert.ok(muPage.calendarEvents.length > 0, "ticker page should show event context");
  assert.ok(muPage.redditSummary, "ticker page should include social summary context");
  assert.ok(muPage.politicianTrades.length > 0, "ticker page should include disclosure context");

  const promotedIdeas = promoteTickerSignalToIdea({
    ticker: "ASML",
    combinedScore: 82,
    actionCategory: "Monitor",
    topHeadline: "ASML mock signal entered the idea pipeline",
    explanation: "Signal is a research prompt only.",
    sector: "Semiconductors",
    missingData: ["live quote missing"],
    warnings: ["sample/local score only"]
  }, workflow.watchlistIdeas, { asOf });
  assert.ok(promotedIdeas.some((idea) => idea.ticker === "ASML" && idea.status === "candidate"));

  const journalEntries = upsertJournalEntry(defaultJournalEntries(asOf), {
    ticker: "MU",
    decisionType: "hold",
    dateTime: asOf,
    thesisNote: "Review memory pricing thesis after demo signal.",
    riskNote: "Keep position size aligned with evidence quality.",
    catalyst: "Sample Samsung-to-MU read-through.",
    conviction: "Medium-high",
    signalSnapshot: signalSnapshotForTicker("MU", workflow.tickerSignals, asOf)
  });
  const journalMu = journalEntries.find((entry) => entry.ticker === "MU" && /Review memory pricing thesis/.test(entry.thesisNote));
  assert.equal(journalMu.executionStatus, "not-executed");
  assert.ok(journalMu.signalSnapshot.combinedScore > 0);

  const beforeMuValue = tickerValue(workflow.analysis.holdings, "MU");
  const scenario = simulateWhatIf({
    holdings: workflow.analysis.holdings,
    scenario: { action: "add", ticker: "MU", amount: 2500, fundingMode: "cash-first" },
    targetPlan: workflow.targetPlan,
    asOf
  });
  assert.equal(scenario.status, "ready");
  assert.equal(scenario.readOnly, true);
  assert.equal(tickerValue(workflow.analysis.holdings, "MU"), beforeMuValue, "what-if should not mutate imported holdings");
  assert.ok(scenario.tickerRows.some((row) => row.ticker === "MU" && row.deltaValue > 0));
  assert.ok(scenario.sectorRows.some((row) => row.name === "Semiconductors" && row.deltaValue > 0));
  assert.ok(scenario.riskRows.some((row) => row.id === "top10" || row.id === "leveraged"));

  const removeScenario = simulateWhatIf({
    holdings: workflow.analysis.holdings,
    scenario: { action: "remove", ticker: "SOXL" },
    targetPlan: workflow.targetPlan,
    asOf
  });
  assert.match(removeScenario.message, /Real holdings were not changed/);

  const emptyAnalysis = analyzePortfolio([]);
  assert.equal(emptyAnalysis.risk.top5Weight, 0);
  assert.equal(emptyAnalysis.risk.top10Weight, 0);
  assert.doesNotMatch(JSON.stringify(emptyAnalysis.risk), /NaN/);
});

test("Week 5 workflow labels data sources honestly and avoids execution or guarantee language", () => {
  const workflow = buildWeek5Workflow();
  const serialized = JSON.stringify({
    dailyBrief: workflow.dailyBrief,
    alerts: workflow.analysis.alerts,
    tickerSignals: workflow.tickerSignals,
    marketDataStatus: workflow.marketDataStatus,
    calendarEvents: workflow.calendarEvents
  });

  assert.match(serialized, /mock|sample|imported|local/i);
  assert.match(workflow.marketDataStatus.status, /mock|sample|stale/i);
  assert.ok(workflow.tickerSignals.every((signal) => signal.warnings.some((warning) => /not a recommendation/i.test(warning))));
  assert.doesNotMatch(serialized, /\b(buy now|sell now|guaranteed|guarantees|will outperform|trade ticket|place order|brokerage order)\b/i);
});

test("Week 5 route, accessibility, and mobile hooks remain present", () => {
  const indexHtml = readFileSync(new URL("index.html", projectRoot), "utf8");
  const appJs = readFileSync(new URL("src/app.js", projectRoot), "utf8");
  const portfolioViewJs = readFileSync(new URL("src/portfolioView.js", projectRoot), "utf8");

  ["#daily", "#alerts", "#market-intelligence", "#watchlist", "#journal", "#what-if", "#risk"].forEach((route) => {
    assert.match(`${indexHtml}\n${appJs}\n${portfolioViewJs}`, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
  assert.match(renderTickerLink("MU"), /href="#\/ticker\/MU"/);
  assert.match(indexHtml, /id="routeStatus"[^>]+aria-live="polite"/);
  assert.match(appJs, /function focusActiveScreen/);
  assert.match(appJs, /aria-sort/);
  assert.match(indexHtml, /@media \(max-width: 720px\)/);
  assert.match(indexHtml, /@media \(max-width: 720px\)[\s\S]*\.what-if-summary-grid,[\s\S]*\.what-if-grid,[\s\S]*grid-template-columns: 1fr/);
  assert.match(portfolioViewJs, /aria-label="Edit journal entry for/);
  assert.match(portfolioViewJs, /aria-label="Delete calendar event/);
  assert.match(portfolioViewJs, /aria-label="Log decision for/);
  assert.doesNotMatch(portfolioViewJs, /<div><b>Entry zone<\/b>/);
  assert.match(portfolioViewJs, /function whatIfRiskDeltaClass/);
  assert.match(portfolioViewJs, /not a trade ticket, brokerage instruction, or recommendation/i);
  assert.match(indexHtml, /It is not a trading recommendation/i);
});

function tickerValue(holdings = [], ticker = "") {
  return holdings
    .filter((holding) => String(holding.ticker || "").toUpperCase() === ticker.toUpperCase())
    .reduce((sum, holding) => sum + (Number(holding.marketValue) || 0), 0);
}
