import { signalActionCategory } from "./alphaEngine.js";
import { DATA_MODES, dataModeBadgeClass, dataModeLabel, marketDataMode, normalizeDataMode, portfolioDataMode, sourceDataMode } from "./dataModes.js";
import { eventSourceLabel, eventTypeLabel, summarizeCalendarEvents } from "./eventCalendar.js";
import { buildTickerMovementExplainer } from "./movementExplainer.js";
import { normalizeTicker } from "./portfolioSchema.js";
import { countHoldingRowsNeedingReview, isRealPortfolioUiState } from "./portfolioState.js";
import { summarizeRedditMentions } from "./redditSignals.js";
import { buildTechnicalAnalysisSnapshot } from "./technicalAnalysis.js";
import { buildThesisRiskSummary } from "./thesisTracker.js";
import { buildTickerResearchLens } from "./tickerResearch.js";
import { summarizeXUpdates } from "./xUpdatesProvider.js";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

export function renderPortfolioCommandCenter(analysis, options = {}) {
  renderDataModeIndicator(options.portfolioStatus, options.marketDataStatus, options.latestImportReport, options.accountScope);
  renderMarketTape(analysis.holdings, options.tickerSignals || [], options.marketDataStatus, options.uiState);
  renderThirtySecondBrief(analysis, options);
  renderDailyCommandBrief(options.dailyBrief, options.uiState);
  renderOverviewDailySnapshot(options.dailyBrief, options.uiState);
  renderOverviewHealthSnapshot(options.portfolioHealth, options.uiState);
  renderPortfolioHealthPanel(options.portfolioHealth, options.uiState);
  renderOverviewCalendarSnapshot(options.allCalendarEvents || [], options.uiState);
  renderImportSnapshot(options.latestImportReport, options.portfolioDataQuality);
  renderOverviewTopMovers(analysis.holdings, options.uiState, options.marketDataStatus);
  renderOverviewConcentrationWarnings(analysis.risk, analysis.overview, options.uiState);
  renderOverviewConvictionHoldings(options.thesisRows || [], options.uiState);
  renderOverviewRecentAlerts(analysis.alerts, options.uiState);
  renderOverviewMarketSnapshot(options.marketEvents || [], analysis.holdings, options.uiState, options.tickerSignals || [], options.marketDataStatus);
  renderOverviewMarketDriversSnapshot(options.marketDrivers);
  renderOverviewConnectionStatus(options.providerReadiness, options.fidelityStatus, options.seekingAlphaStatus, options.marketDataStatus);
  renderBreakdowns(analysis.breakdowns, options.uiState, analysis.holdings);
  renderAccountAllocationPanel(options.accountScope, options.uiState);
  renderAttentionAlerts(analysis.alerts, options.alertLifecycle, options.uiState);
  renderDecisionBrief(options.decisionBrief, options.uiState);
  renderAlphaRecommendations(
    options.alphaRecommendations || [],
    options.allAlphaRecommendations || [],
    options.alphaRecommendationFilter || "all",
    analysis.holdings,
    options.tickerSignals || [],
    options.uiState
  );
  renderTargetAllocations(options.targetPlan, options.targetAllocations, options.uiState);
  renderRebalancePlan(options.targetPlan || options.rebalancePlan, options.uiState);
  renderSleeves(options.sleeves || [], options.uiState);
  renderThesisTracker(options.thesisRows || [], options.thesisSummary);
  renderWatchlistIdeas(options.watchlistIdeaRows || [], options.watchlistIdeaSummary || {}, options.watchlistFilters || {});
  renderDecisionJournal(options.journalRows || [], options.journalSummary || {}, options.journalFilters || {});
  renderCalendarEvents(options.calendarEvents || [], options.calendarSummary || {}, options.calendarFilters || {}, options.eventCalendarImportReport);
  renderHoldingsTable(
    sortHoldingsForView(
      prepareHoldingsForView(filterHoldings(analysis.holdings, options), options.viewMode),
      options.holdingSortKey,
      options.holdingSortDirection
    ),
    options.uiState
  );
  renderWhatIfSimulator(options.whatIfResult, options.whatIfScenario, options.uiState);
  renderRiskDeepDive(analysis.risk, analysis.breakdowns, analysis.overview, analysis.holdings, options.uiState, options.marketDataStatus);
  renderRiskPanel(analysis.risk, analysis.overview, options.uiState);
  renderDataQuality(analysis.dataQuality, options.portfolioDataQuality, options.uiState);
  renderTickerDetailPage(analysis, options);
  renderMarketTickerSignals(options.marketEvents || [], analysis.holdings, options.alphaSignals || [], options.uiState, options.tickerSignals || [], options.marketDataStatus);
  renderMarketDrivers(options.marketDrivers);
  renderSignalReview(options.signalReviewRows || [], options.signalReviewFilter || "all");
  renderXSignals(options.xUpdates || [], options.xUpdateImportReport, options.xSettings);
  renderRedditSignals(options.redditMentions || [], options.redditImportReport, options.redditSettings);
  renderMarketCalendarEvents(options.calendarEvents || options.allCalendarEvents || [], options.uiState);
  renderMarketIntelligence(options.marketEvents || [], analysis.holdings, options.uiState, {
    alphaSignals: options.alphaSignals || [],
    asOf: options.asOf,
    politicianTrades: options.politicianTrades || [],
    providerReadiness: options.providerReadiness || {},
    redditMentions: options.redditMentions || [],
    xUpdates: options.xUpdates || []
  });
  renderDataSourceHealth(options.providerReadiness, options.fidelityStatus, options.seekingAlphaStatus, options.latestImportReport, options.marketDataStatus, options.politicianTradeImportReport, options.politicianTrades || [], options.redditImportReport, options.redditMentions || [], options.portfolioStatus, options.accountScope, options.xUpdateImportReport, options.xUpdates || []);
  renderRedditSourceStatus(options.redditMentions || [], options.redditImportReport, options.redditSettings, options.providerReadiness);
  renderXSourceStatus(options.xUpdates || [], options.xUpdateImportReport, options.xSettings, options.providerReadiness);
  renderPoliticianTrades(options.politicianTrades || [], options.politicianTradeImportReport);
  renderMarketPoliticianTrades(options.politicianTrades || [], options.politicianTradeImportReport);
  renderProviderReadiness(options.providerReadiness);
  renderSettingsConfiguration(options.alertThresholds);
}

export function filterHoldings(holdings, options = {}) {
  const query = String(options.query || "").trim().toLowerCase();
  const group = options.group || "all";
  const groupValue = options.groupValue || "all";
  const risk = options.risk || "all";
  const thesis = options.thesis || "all";
  const hideTinyCash = Boolean(options.hideTinyCash);

  return holdings.filter((holding) => {
    const text = `${holding.ticker} ${holding.name} ${holding.account}`.toLowerCase();
    const matchesQuery = !query || text.includes(query);
    const groupKey = group === "all" ? "account" : group;
    const matchesGroup =
      groupValue === "all" ||
      String(holding[groupKey] || "").toLowerCase() === String(groupValue).toLowerCase();
    const matchesRisk = risk === "all" || holding.riskLevel === risk;
    const matchesThesis = thesis === "all" || holding.thesisStatus === thesis;
    const hidesTinyCash = hideTinyCash && (holding.assetClass === "Cash" || holding.portfolioWeight < 0.002);
    return matchesQuery && matchesGroup && matchesRisk && matchesThesis && !hidesTinyCash;
  });
}

export function populatePortfolioFilters(holdings, group = "all") {
  const groupKey = group === "all" ? "account" : group;
  setOptions("portfolioGroupValue", ["all", ...unique(holdings.map((holding) => holding[groupKey]))], group === "all" ? "All accounts" : "All groups");
  setOptions("riskFilter", ["all", ...unique(holdings.map((holding) => holding.riskLevel))], "All risk levels");
  setOptions("thesisFilter", ["all", ...unique(holdings.map((holding) => holding.thesisStatus))], "All thesis statuses");
}

export function tickerDetailHash(ticker = "") {
  const normalized = normalizeTickerSymbol(ticker);
  return normalized ? `#/ticker/${encodeURIComponent(normalized)}` : "#holdings";
}

export function renderTickerLink(ticker = "", label = ticker, className = "ticker-link") {
  const normalized = normalizeTickerSymbol(ticker);
  const text = label || normalized || "--";
  if (!normalized || normalized === "UNKNOWN") return `<span>${escapeHtml(text)}</span>`;
  return `<a class="${escapeHtml(className)}" href="${tickerDetailHash(normalized)}" data-ticker-link="${escapeHtml(normalized)}">${escapeHtml(text)}</a>`;
}

function renderTickerChips(tickers = []) {
  return uniqueInInputOrder(tickers)
    .filter(Boolean)
    .map((ticker) => renderTickerLink(ticker, ticker, "ticker-chip"))
    .join("");
}

export function safeExternalHref(url = "#") {
  const fallback = "#";
  const text = String(url || "").trim();
  if (text.startsWith("#")) return text || fallback;
  if (!/^https?:\/\//i.test(text)) return fallback;
  try {
    const parsed = new URL(text);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href;
    return fallback;
  } catch {
    return fallback;
  }
}

function safeHashHref(href = "#overview") {
  const text = String(href || "").trim();
  return text.startsWith("#") ? text : "#overview";
}

function renderDataModeIndicator(portfolioStatus = {}, marketDataStatus = {}, report = null, accountScope = null) {
  const target = byId("dataModeIndicator");
  if (!target) return;
  const portfolioMode = portfolioDataMode(portfolioStatus, report);
  const marketMode = marketDataMode(marketDataStatus);
  const portfolioDetail = portfolioStatus?.detail || "Load a portfolio to power portfolio-specific screens.";
  const marketDetail = marketDataDisplayDetail(marketDataStatus);
  const accountSummary = accountScope?.selectedSummary || accountScope?.combined || {};
  const accountLabel = accountScope?.selectedAccount && accountScope.selectedAccount !== "all" ? accountScope.selectedAccountLabel || "Selected account" : "All accounts";
  const accountDetail = accountSummary?.value !== undefined
    ? `${accountLabel} · ${formatCompact(accountSummary.value)} · ${Number(accountSummary.holdingCount) || 0} holdings`
    : accountLabel;
  const accountTitle = accountSummary?.value !== undefined
    ? `Portfolio screens are scoped to ${accountLabel}: ${formatCurrency(accountSummary.value)} across ${Number(accountSummary.holdingCount) || 0} holdings.`
    : "Portfolio screens are scoped by the account view selected in the sidebar.";
  target.innerHTML = `
    <span class="data-mode-pill ${escapeHtml(dataModeBadgeClass(portfolioMode))}" title="${escapeHtml(portfolioDetail)}">Portfolio: ${escapeHtml(dataModeLabel(portfolioMode))}</span>
    <span class="data-mode-pill ${escapeHtml(dataModeBadgeClass(marketMode))}" title="${escapeHtml(marketDetail)}">Market data: ${escapeHtml(dataModeLabel(marketMode))}</span>
    <span class="data-mode-pill badge-source-imported" title="${escapeHtml(accountTitle)}">View: ${escapeHtml(accountDetail)}</span>
  `;
  const status = byId("dataModeStatus");
  if (status) {
    status.textContent = `Portfolio ${dataModeLabel(portfolioMode)}. Market data ${dataModeLabel(marketMode)}. Account view ${accountDetail}.`;
  }
}

function renderMarketTape(holdings = [], tickerSignals = [], marketDataStatus = {}, uiState = "SAMPLE_MODE") {
  const target = byId("marketTape");
  if (!target) return;
  const imported = isImportedState(uiState);
  const byTicker = new Map();
  holdings.forEach((holding) => {
    const ticker = normalizeTickerSymbol(holding.ticker);
    if (!ticker) return;
    const previous = byTicker.get(ticker) || { ticker, marketValue: 0, dailyChange: 0, dailyChangePercent: 0, score: 0, price: 0 };
    previous.marketValue += Number(holding.marketValue) || 0;
    previous.dailyChange += Number(holding.dailyChange) || 0;
    previous.dailyChangePercent = previous.marketValue ? previous.dailyChange / previous.marketValue : Number(holding.dailyChangePercent) || previous.dailyChangePercent;
    previous.price = Number(holding.marketDataPrice || holding.price || previous.price) || previous.price;
    previous.name = previous.name || holding.name;
    previous.source = imported ? "Imported" : "Sample";
    byTicker.set(ticker, previous);
  });
  tickerSignals.forEach((signal) => {
    const ticker = normalizeTickerSymbol(signal.ticker);
    if (!ticker) return;
    const previous = byTicker.get(ticker) || { ticker, marketValue: 0, dailyChange: 0, dailyChangePercent: 0, price: 0 };
    byTicker.set(ticker, {
      ...previous,
      score: Math.max(previous.score || 0, Number(signal.combinedScore) || 0),
      price: Number(signal.marketDataPrice || previous.price) || previous.price,
      dailyChangePercent: Number(signal.marketDataDailyChangePercent ?? previous.dailyChangePercent) || previous.dailyChangePercent,
      source: signal.liveProviderCalls ? dataModeLabel(marketDataMode(marketDataStatus)) : previous.source || "Sample"
    });
  });
  const rows = Array.from(byTicker.values())
    .sort((a, b) => Math.abs(b.dailyChange || 0) - Math.abs(a.dailyChange || 0) || (b.score || 0) - (a.score || 0) || b.marketValue - a.marketValue)
    .slice(0, 12);
  const sourceLabel = marketDataDisplayLabel(marketDataStatus);
  const empty = imported
    ? "Refresh market data to populate live/cached quotes."
    : "Load a portfolio or try sample data to populate the research tape.";
  target.innerHTML = `
    <span class="market-tape-label">Research tape · ${escapeHtml(sourceLabel)}</span>
    <div class="market-tape-scroll">
      ${rows.length ? rows.map((row) => `
        <a class="market-tape-item" href="${tickerDetailHash(row.ticker)}" aria-label="Open ${escapeHtml(row.ticker)} ticker page">
          <b>${escapeHtml(row.ticker)}</b>
          <span>${row.price ? formatCurrency(row.price) : row.score ? `${Math.round(row.score)}/100` : "--"}</span>
          <span class="${row.dailyChangePercent >= 0 ? "positive" : "negative"}">${formatSignedPct(row.dailyChangePercent || 0)}</span>
          <span>${escapeHtml(row.source || sourceLabel)}</span>
        </a>
      `).join("") : `<a class="market-tape-item" href="#imports"><b>Start</b><span>${escapeHtml(empty)}</span></a>`}
    </div>
  `;
}

function renderThirtySecondBrief(analysis, options = {}) {
  const target = byId("thirtySecondBriefPanel");
  if (!target) return;
  const uiState = options.uiState || "SAMPLE_MODE";
  const marketDataStatus = options.marketDataStatus || {};
  const marketDataLabel = marketDataDisplayLabel(marketDataStatus);
  if (!isImportedState(uiState)) {
    target.innerHTML = `
      <div class="command-snapshot pre-import ${escapeHtml(uiState.toLowerCase())}">
        <div class="command-snapshot-top">
          <span class="status-badge sample">${uiState === "NO_DATA" ? "No portfolio loaded" : "Sample data"}</span>
          <span class="status-badge safe">Local only</span>
        </div>
        <strong class="command-number">--</strong>
        <span class="command-label">Import your portfolio to begin.</span>
        <div class="command-pair">
          <div><span>Daily move</span><b>--</b><small>Market data not configured.</small></div>
          <div><span>Safety</span><b>Local only</b><small>No passwords. No scraping. No cloud sync.</small></div>
        </div>
        <div class="cta-row">
          <a class="button-link primary" href="#imports">Import Fidelity CSV</a>
          <button type="button" data-overview-action="sample">Try sample data</button>
        </div>
      </div>
    `;
    return;
  }
  const quality = options.portfolioDataQuality;
  const displayStatus = portfolioStatusLabel(uiState);
  const topAlert = analysis.alerts?.[0];
  const topSignal = options.decisionBrief?.topPrioritySignals?.[0];
  const topDailyItem = topDailyBriefItem(options.dailyBrief);
  const biggestRisk = analysis.risk?.decisionDashboard?.sectorConcentration?.[0] ||
    analysis.risk?.decisionDashboard?.topPositionWeights?.[0] ||
    null;
  const nextAction = portfolioNeedsImportReview(uiState)
    ? "Review CSV import warnings before acting."
    : displayStatus === "data missing"
      ? "Import a Fidelity CSV so the dashboard reflects Tucker's real portfolio."
      : topDailyItem?.title
      ? `${topDailyItem.title}: ${topDailyItem.detail || "Open the Daily Brief for context."}`
      : topAlert?.title
      ? "Review the highest-priority alert, then set target allocations."
      : "Import real data or set target allocations.";
  target.innerHTML = `
    <div class="command-snapshot ${escapeHtml((displayStatus || "data missing").replaceAll(" ", "-"))}">
      <div class="command-snapshot-top">
        <span class="status-badge ${uiState === "IMPORTED_CLEAN" ? "safe" : "sample"}">${escapeHtml(displayStatus)}</span>
        <span class="status-badge">${escapeHtml(friendlyQualityLabel(quality, uiState))}</span>
      </div>
      <strong class="command-number">${formatCurrency(analysis.overview.totalValue)}</strong>
      <span class="command-label">Portfolio value from imported holdings</span>
      <div class="command-pair">
        <div>
          <span>Daily move</span>
          <b class="${analysis.overview.dailyChange >= 0 ? "positive" : "negative"}">${formatSignedCurrency(analysis.overview.dailyChange)}</b>
          <small>${formatSignedPct(analysis.overview.dailyChangePercent)} · ${escapeHtml(marketDataLabel)}</small>
        </div>
        <div>
          <span>Next action</span>
          <b>${escapeHtml(topDailyItem?.actionLabel || (topAlert?.title ? "Review alert" : "Set targets"))}</b>
          <small>${escapeHtml(nextAction)}</small>
        </div>
      </div>
      <div class="command-pair">
        <div>
          <span>Biggest risk</span>
          <b>${escapeHtml(biggestRisk?.name || "Not available")}</b>
          <small>${biggestRisk ? formatPct(biggestRisk.weight) : "Import holdings for risk read."}</small>
        </div>
        <div>
          <span>Top signal</span>
          <b>${escapeHtml(topSignal?.primaryTicker || "None")}</b>
          <small>${escapeHtml(topSignal ? `${topSignal.actionLabel}: ${topSignal.headline}` : "No active Alpha signal.")}</small>
        </div>
      </div>
    </div>
  `;
}

function topDailyBriefItem(brief = {}) {
  const groups = brief.groups || {};
  return groups["Action needed"]?.[0] || groups["Watch closely"]?.[0] || groups.Informational?.[0] || null;
}

function renderOverviewDailySnapshot(brief = {}, uiState = "SAMPLE_MODE") {
  const target = byId("overviewDailySnapshot");
  if (!target) return;
  const imported = isImportedState(uiState);
  const summary = brief.summary || {};
  const groups = brief.groups || {};
  const topItem = topDailyBriefItem(brief);
  if (!imported) {
    target.innerHTML = `
      <div class="daily-snapshot">
        <div class="brief-count-row">
          <div class="brief-count"><span>Action</span><b>--</b></div>
          <div class="brief-count"><span>Watch</span><b>--</b></div>
          <div class="brief-count"><span>Info</span><b>--</b></div>
        </div>
        <div class="priority-line">
          <span>Start here</span>
          <b>${uiState === "SAMPLE_MODE" ? "Sample workflow only" : "Import your portfolio"}</b>
          <small>${uiState === "SAMPLE_MODE" ? "Sample values are not Tucker's real holdings." : "The brief stays quiet until real holdings are loaded."}</small>
          <a class="button-link" href="#imports">Import portfolio</a>
        </div>
      </div>
    `;
    return;
  }
  target.innerHTML = `
    <div class="daily-snapshot">
      <div class="brief-count-row" aria-label="Daily brief counts">
        <div class="brief-count"><span>Action</span><b>${escapeHtml(summary.actionCount || 0)}</b></div>
        <div class="brief-count"><span>Watch</span><b>${escapeHtml(summary.watchCount || 0)}</b></div>
        <div class="brief-count"><span>Info</span><b>${escapeHtml(summary.infoCount || 0)}</b></div>
      </div>
      ${topItem ? `
        <div class="priority-line">
          <span>First thing to inspect</span>
          <b>${escapeHtml(topItem.title || "Open Daily Brief")}</b>
          <small>${escapeHtml(topItem.reason || topItem.detail || "Review the linked screen for context.")}</small>
          <a class="button-link" href="${escapeHtml(safeHashHref(topItem.href || "#daily"))}">${escapeHtml(dailyBriefItemCta(topItem))}</a>
        </div>
      ` : `
        <div class="priority-line">
          <span>First thing to inspect</span>
          <b>No review items right now</b>
          <small>Open the Daily Brief for source labels and missing-data notes.</small>
          <a class="button-link" href="#daily">Open daily brief</a>
        </div>
      `}
    </div>
  `;
}

function renderOverviewHealthSnapshot(health = {}, uiState = "SAMPLE_MODE") {
  const target = byId("overviewHealthSnapshot");
  if (!target) return;
  const imported = isImportedState(uiState);
  const actions = Array.isArray(health.nextActions) ? health.nextActions : [];
  const firstAction = actions[0] || {
    label: imported ? "Open daily brief" : "Import portfolio",
    href: imported ? "#daily" : "#imports",
    reason: imported ? "Review portfolio health context." : "Portfolio health needs real holdings."
  };
  target.innerHTML = `
    <div class="overview-health-summary ${escapeHtml(healthToneClass(health.tone))}">
      <div class="health-score-ring" aria-label="Portfolio health score">
        <strong>${imported ? escapeHtml(Math.round(Number(health.score) || 0)) : "--"}</strong>
        <span>/100</span>
      </div>
      <div class="health-copy">
        <span class="status-badge ${escapeHtml(healthToneClass(health.tone))}">${escapeHtml(health.label || (imported ? "Needs review" : "Data missing"))}</span>
        <b>${escapeHtml(imported ? health.summary || "Portfolio health is ready." : "Import holdings to score portfolio health.")}</b>
        <small>${escapeHtml(firstAction.reason || "Open the linked screen for context.")}</small>
        <a class="button-link" href="${escapeHtml(safeHashHref(firstAction.href || "#daily"))}">${escapeHtml(firstAction.label || "Open detail")}</a>
      </div>
    </div>
  `;
}

function renderPortfolioHealthPanel(health = {}, uiState = "SAMPLE_MODE") {
  const target = byId("portfolioHealthPanel");
  if (!target) return;
  const imported = isImportedState(uiState);
  const components = Array.isArray(health.components) ? health.components : [];
  const actions = Array.isArray(health.nextActions) ? health.nextActions : [];
  if (!imported) {
    target.innerHTML = `
      <div class="portfolio-health-card pre-import">
        <div class="portfolio-health-head">
          <div>
            <span class="status-badge sample">${escapeHtml(health.label || "Data missing")}</span>
            <h3>Portfolio Health Score</h3>
            <p>${escapeHtml(health.summary || "Import holdings before the dashboard can produce a health read.")}</p>
          </div>
          <a class="button-link primary" href="#imports">Import portfolio</a>
        </div>
      </div>
    `;
    return;
  }
  target.innerHTML = `
    <section class="portfolio-health-card ${escapeHtml(healthToneClass(health.tone))}" aria-label="Portfolio Health Score">
      <div class="portfolio-health-head">
        <div>
          <span class="status-badge ${escapeHtml(healthToneClass(health.tone))}">${escapeHtml(health.label || "Needs review")}</span>
          <h3>Portfolio Health Score</h3>
          <p>${escapeHtml(health.summary || "Portfolio health combines data quality, concentration, thesis coverage, targets, alerts, and market freshness.")}</p>
        </div>
        <div class="portfolio-health-score">
          <strong>${escapeHtml(Math.round(Number(health.score) || 0))}</strong>
          <span>/100</span>
        </div>
      </div>
      <div class="health-component-grid">
        ${components.map((component) => `
          <a class="health-component" href="${escapeHtml(safeHashHref(component.href || "#daily"))}">
            <div class="health-component-top">
              <b>${escapeHtml(component.label || "Component")}</b>
              <span>${escapeHtml(Math.round(Number(component.score) || 0))}</span>
            </div>
            <div class="health-meter" aria-hidden="true"><span style="width:${escapeHtml(Math.max(0, Math.min(100, Number(component.score) || 0)))}%"></span></div>
            <small>${escapeHtml(component.detail || "No detail available.")}</small>
          </a>
        `).join("")}
      </div>
      <div class="health-action-list">
        ${(actions.length ? actions : [{ label: "Open risk dashboard", href: "#risk", reason: "No urgent health issues; review concentration periodically." }]).map((action) => `
          <a class="health-action-row" href="${escapeHtml(safeHashHref(action.href || "#daily"))}">
            <span>${escapeHtml(action.label || "Review")}</span>
            <small>${escapeHtml(action.reason || "Open detail for context.")}</small>
          </a>
        `).join("")}
      </div>
    </section>
  `;
}

function renderOverviewCards(overview, risk = {}, quality = {}, uiState = "SAMPLE_MODE") {
  const imported = isImportedState(uiState);
  const status = imported ? portfolioStatusLabel(uiState) : uiState === "NO_DATA" ? "no portfolio loaded" : "sample mode";
  const nextAction = portfolioNeedsImportReview(uiState)
    ? "Review import warnings"
    : !imported
      ? "Import Fidelity CSV"
    : overview.totalValue
      ? "Review top alerts"
      : "Import Fidelity CSV";
  const cards = [
    ["Portfolio status", imported ? "Loaded" : "Not loaded", status, "#imports"],
    ["Total portfolio value", imported ? formatCurrency(overview.totalValue) : "--", imported ? "Real imported holdings" : "Import CSV to calculate", "#holdings"],
    ["Daily move", imported ? formatSignedCurrency(overview.dailyChange) : "--", imported ? formatSignedPct(overview.dailyChangePercent) : "Market data not configured", "#holdings"],
    ["Cash %", imported ? formatPct(divide(overview.cashBalance, overview.totalValue)) : "--", imported ? formatCurrency(overview.cashBalance) : "Waiting for import", "#targets"],
    ["Top concentration", imported ? formatPct(risk.top10Weight) : "--", imported ? "Top 10 holdings weight" : "Waiting for import", "#risk"],
    ["Semiconductor / AI", imported ? formatPct(divide(overview.semiconductorAiExposure, overview.totalValue)) : "--", imported ? formatCurrency(overview.semiconductorAiExposure) : "Waiting for import", "#risk"],
    ["Leveraged ETF", imported ? formatPct(divide(overview.leveragedEtfExposure, overview.totalValue)) : "--", imported ? `${formatCurrency(overview.leveragedNotionalExposure)} notional` : "Waiting for import", "#risk"],
    ["Data quality", imported ? friendlyQualityLabel(quality, uiState) : "No real CSV", quality.detectedFileDate ? `File date ${quality.detectedFileDate}` : "Import CSV to validate", "#risk"],
    ["Next suggested action", nextAction, "Start here before drilling down", imported ? "#alerts" : "#imports"]
  ];

  const target = byId("portfolioOverviewCards");
  if (!target) return;
  target.innerHTML = cards.map(([label, value, detail, href]) => `
    <a class="metric command-metric" href="${escapeHtml(href)}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(detail)}</small>
    </a>
  `).join("");
}

function renderKeyTakeaways(analysis, options = {}) {
  const target = byId("keyTakeawaysPanel");
  if (!target) return;
  const uiState = options.uiState || "SAMPLE_MODE";
  if (!isImportedState(uiState)) {
    target.innerHTML = `
      <div class="empty">
        <strong>No real portfolio imported yet.</strong>
        <span>Import a Fidelity CSV to get portfolio-specific takeaways, risks, and next actions.</span>
      </div>
    `;
    return;
  }
  const overview = analysis.overview || {};
  const account = analysis.breakdowns?.account?.[0];
  const theme = analysis.breakdowns?.sector?.find((row) => row.name !== "Cash") || analysis.breakdowns?.sector?.[0];
  const unknownCount = (analysis.holdings || []).filter((holding) =>
    /unknown|uncategorized|other/i.test(`${holding.sector} ${holding.assetClass}`)
  ).length;
  const items = [
    `Cash is ${formatPct(divide(overview.cashBalance, overview.totalValue))} of the portfolio.`,
    theme ? `${theme.name} is the largest non-cash exposure theme at ${formatPct(theme.weight)}.` : "Exposure themes will populate after holdings are classified.",
    account ? `${account.name} is the largest account bucket at ${formatPct(account.weight)}.` : "Account breakdown will appear after import.",
    unknownCount ? `${unknownCount} holding${unknownCount === 1 ? "" : "s"} need classification.` : "Current holdings have usable classifications.",
    "Next useful step: set target allocations for the largest positions."
  ];
  target.innerHTML = `
    <div class="takeaway-card">
      <div class="panel-mini-head">
        <h3>Key Takeaways</h3>
        ${unknownCount ? '<a class="button-link" href="#holdings">Review classifications</a>' : ""}
      </div>
      <ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </div>
  `;
}

function renderImportSnapshot(report, quality = {}) {
  const target = byId("importSummaryPanel");
  if (!target) return;
  if (!report?.realPortfolioImport) {
    target.innerHTML = `
      <div class="empty import-empty">
        <strong>No Fidelity portfolio loaded yet.</strong>
        <span>Drop a Fidelity CSV, choose a holdings JSON file, or paste copied position rows. Nothing changes until you review and apply the preview.</span>
      </div>
    `;
    return;
  }
  const harmless = quality.rejectedNonHoldingRows || 0;
  const holdingFailures = Math.max(0, (report.rejectedRows || []).length - harmless);
  const title = holdingFailures
    ? `Imported with ${holdingFailures} row${holdingFailures === 1 ? "" : "s"} needing review`
    : harmless ? `Import successful - ${harmless} non-holding row${harmless === 1 ? "" : "s"} skipped` : "Portfolio imported";
  const statusClass = holdingFailures ? "failed" : harmless ? "imported-with-skipped-rows" : "success";
  const message = holdingFailures
    ? "Some holding rows need review before relying on totals."
    : "Portfolio imported successfully. Review the summary below, then go to Overview.";
  target.innerHTML = `
    <div class="import-summary-card ${escapeHtml(statusClass)}">
      <div>
        <span>Last import status</span>
        <b>${escapeHtml(title)}</b>
        <small>${escapeHtml(message)}</small>
      </div>
      <div class="import-summary-grid">
        ${summaryMetric("Rows parsed", report.rowsParsed)}
        ${summaryMetric("Holdings imported", report.holdingsImported)}
        ${summaryMetric("Skipped non-holding rows", harmless)}
        ${summaryMetric("Total imported value", formatCurrency(report.totalMarketValue))}
        ${summaryMetric("Accounts", (report.accountsDetected || []).length || quality.accountCount || 0)}
        ${summaryMetric("File", report.fileName || "Local CSV")}
      </div>
      <div class="cta-row">
        <a class="button-link primary" href="#overview">Go to Overview</a>
        <a class="button-link" href="#holdings">View Holdings</a>
      </div>
    </div>
  `;
}

function renderOverviewTopHoldings(holdings, uiState = "SAMPLE_MODE") {
  const target = byId("overviewTopHoldings");
  if (!target) return;
  if (!isImportedState(uiState)) {
    target.innerHTML = '<div class="empty"><strong>No real holdings loaded.</strong><span>Import a Fidelity CSV to see Tucker’s actual top holdings.</span></div>';
    return;
  }
  target.innerHTML = holdings.length
    ? holdings.slice(0, 5).map((holding) => `
      <div>
        <span>${renderTickerLink(holding.ticker)} · ${escapeHtml(holding.account)}</span>
        <b>${formatPct(holding.portfolioWeight)}</b>
        <small>${formatCurrency(holding.marketValue)} · ${escapeHtml(holding.sector)}</small>
      </div>
    `).join("")
    : '<div class="empty">Import a Fidelity CSV to see top holdings.</div>';
}

function renderOverviewTopMovers(holdings = [], uiState = "SAMPLE_MODE", marketDataStatus = {}) {
  const target = byId("overviewTopMovers");
  if (!target) return;
  if (!isImportedState(uiState)) {
    target.innerHTML = '<div class="empty"><strong>No real movers yet.</strong><span>Import a Fidelity CSV before using position-level movement as guidance.</span></div>';
    return;
  }
  const movers = [...holdings]
    .filter((holding) => Math.abs(Number(holding.dailyChange) || 0) > 0 || Math.abs(Number(holding.dailyChangePercent) || 0) > 0)
    .map((holding) => ({
      ...holding,
      moveAmount: Number(holding.dailyChange) || 0,
      movePercent: Number(holding.dailyChangePercent) || 0
    }));
  const gainers = movers.filter((holding) => holding.moveAmount > 0 || holding.movePercent > 0)
    .sort((a, b) => b.moveAmount - a.moveAmount || b.movePercent - a.movePercent)
    .slice(0, 2)
    .map((holding) => ({ label: "Gainer", holding }));
  const losers = movers.filter((holding) => holding.moveAmount < 0 || holding.movePercent < 0)
    .sort((a, b) => a.moveAmount - b.moveAmount || a.movePercent - b.movePercent)
    .slice(0, 2)
    .map((holding) => ({ label: "Loser", holding }));
  const rows = [...gainers, ...losers].slice(0, 4);
  target.innerHTML = rows.length
    ? rows.map(({ label, holding }) => `
      <div>
        <span>${escapeHtml(label)} · ${renderTickerLink(holding.ticker)}</span>
        <b class="${holding.moveAmount >= 0 ? "positive" : "negative"}">${formatSignedCurrency(holding.moveAmount)}</b>
        <small>${formatSignedPct(holding.movePercent)} today · ${escapeHtml(dailyMoveSourceLabel(holding))} · ${escapeHtml(holding.account)}</small>
      </div>
    `).join("")
    : '<div class="empty"><strong>Market data not configured.</strong><span>Imported CSV values load positions, but Live daily movers are Not configured.</span></div>';
}

function renderOverviewConcentrationWarnings(risk = {}, overview = {}, uiState = "SAMPLE_MODE") {
  const target = byId("overviewConcentrationWarnings");
  if (!target) return;
  if (!isImportedState(uiState)) {
    target.innerHTML = '<div class="empty"><strong>No concentration read yet.</strong><span>Import holdings to see top-10, semiconductor, and leverage risk.</span></div>';
    return;
  }
  const topContributor = risk.riskContributors?.[0];
  const items = [
    { label: "Top 10 holdings", value: formatPct(risk.top10Weight), detail: "Largest combined position weight" },
    { label: "Semiconductor stack", value: formatCurrency(risk.overlap?.semiconductorStack), detail: "AI/semiconductor overlap" },
    { label: "Leveraged notional", value: formatCurrency(overview.leveragedNotionalExposure), detail: "Effective exposure estimate" },
    topContributor ? { label: `${renderTickerLink(topContributor.ticker)} risk contributor`, value: `${topContributor.riskScore}/100`, detail: formatPct(topContributor.portfolioWeight), htmlLabel: true } : null
  ].filter(Boolean);
  target.innerHTML = items.map(({ label, value, detail, htmlLabel }) => `
    <div>
      <span>${htmlLabel ? label : escapeHtml(label)}</span>
      <b>${escapeHtml(value)}</b>
      <small>${escapeHtml(detail)}</small>
    </div>
  `).join("");
}

function renderOverviewConvictionHoldings(rows = [], uiState = "SAMPLE_MODE") {
  const target = byId("overviewConvictionHoldings");
  if (!target) return;
  if (!isImportedState(uiState)) {
    target.innerHTML = '<div class="empty"><strong>No thesis conviction yet.</strong><span>Import holdings, then use the Thesis screen to document conviction.</span></div>';
    return;
  }
  const convictionRows = [...rows]
    .filter((row) => /high|medium-high/i.test(row.confidenceLevel || "") && !/missing/i.test(row.status || ""))
    .sort((a, b) => b.portfolioWeight - a.portfolioWeight)
    .slice(0, 3);
  target.innerHTML = convictionRows.length
    ? convictionRows.map((row) => `
      <div>
        <span>${renderTickerLink(row.ticker)} · ${escapeHtml(row.confidenceLevel)}</span>
        <b>${formatPct(row.portfolioWeight)}</b>
        <small>${escapeHtml(row.status)} thesis · target ${formatPct(row.targetWeight)}</small>
      </div>
    `).join("")
    : '<div class="empty"><strong>No high-conviction thesis rows yet.</strong><span>Open Thesis to mark confidence and review triggers.</span></div>';
}

function renderOverviewRecentAlerts(alerts = [], uiState = "SAMPLE_MODE") {
  const target = byId("overviewRecentAlerts");
  if (!target) return;
  if (!isImportedState(uiState)) {
    target.innerHTML = '<div class="empty"><strong>No real alerts yet.</strong><span>Import holdings to generate a portfolio-specific action queue.</span></div>';
    return;
  }
  target.innerHTML = alerts.length
    ? alerts.slice(0, 3).map((alert) => `
        <div>
          <span>${escapeHtml(alertDisplayLabel(alert))}</span>
          <b>${escapeHtml(alert.title)}</b>
          <small>${alert.ticker ? `${renderTickerLink(alert.ticker)} · ` : ""}${escapeHtml(alert.detail)}</small>
        </div>
    `).join("")
    : '<div class="empty"><strong>No alerts need review.</strong><span>Target drift, data quality, and thesis alerts will appear here.</span></div>';
}

function renderOverviewMarketSnapshot(events = [], holdings = [], uiState = "SAMPLE_MODE", tickerSignals = [], marketDataStatus = {}) {
  const target = byId("overviewMarketSnapshot");
  if (!target) return;
  if (!isImportedState(uiState)) {
    target.innerHTML = '<div class="empty"><strong>No portfolio read-through yet.</strong><span>Import holdings so demo market events can map to actual exposure.</span></div>';
    return;
  }
  const ownedSignals = tickerSignals.filter((signal) => signal.portfolioOwnershipFlag && !signal.samplePortfolioFlag);
  if (ownedSignals.length) {
    const confluenceLabel = `Local confluence · ${marketDataDisplayLabel(marketDataStatus)}`;
    target.innerHTML = ownedSignals.slice(0, 3).map((signal) => `
      <div>
        <span>${escapeHtml(confluenceLabel)} · ${escapeHtml(signal.actionCategory)}</span>
        <b>${renderTickerLink(signal.ticker)} · ${signal.combinedScore}/100</b>
        <small>${escapeHtml(signal.topHeadline)} · ${formatPct(signal.portfolioWeight)} portfolio weight · ${escapeHtml((signal.whyScoreIsHigh || []).slice(0, 2).join(", ") || marketDataStatus.label || "Sample market data")}</small>
      </div>
    `).join("");
    return;
  }
  target.innerHTML = events.length
    ? events.slice(0, 2).map((event) => {
      const exposure = buildAffectedExposureSummary(event, holdings);
      return `
        <div>
          <span>Sample scenario · ${escapeHtml(marketActionLabel(event))}</span>
          <b>${escapeHtml(event.title)}</b>
          <small>${escapeHtml(exposure.compactValueLabel)} affected</small>
          <div class="ticker-chips">${renderTickerChips(exposure.visibleTickers)}</div>
        </div>
      `;
    }).join("")
    : '<div class="empty"><strong>No market events loaded.</strong><span>Sample read-throughs appear here until live news is approved.</span></div>';
}

function renderOverviewMarketDriversSnapshot(report = null) {
  const target = byId("overviewMarketDriversSnapshot");
  if (!target) return;
  if (!report?.broadMarket || !report?.aiTech) {
    target.innerHTML = '<div class="empty"><strong>No driver read yet.</strong><span>Refresh market data or load sample data to see market drivers.</span></div>';
    return;
  }
  const regime = report.marketRegime ? `
    <div>
      <span>Market regime · ${escapeHtml(report.marketRegime.confidenceLabel || "Low")} confidence</span>
      <b>${escapeHtml(report.marketRegime.label || "Mixed")} · ${escapeHtml(report.marketRegime.sourceStatus || "Source-labeled")}</b>
      <small>${escapeHtml(report.marketRegime.interpretation || "Rule-based regime context pending.")}</small>
    </div>
  ` : "";
  target.innerHTML = regime + [report.broadMarket, report.aiTech].map((scope) => `
    <div>
      <span>${escapeHtml(scope.label)} · ${escapeHtml(scope.confidenceLabel)} confidence</span>
      <b>${escapeHtml(scope.directionLabel)} · ${escapeHtml(scope.moveLabel || "move unavailable")}</b>
      <small>${escapeHtml(scope.drivers?.[0]?.title || scope.missingData?.[0] || "Source-labeled explanation pending")}</small>
    </div>
  `).join("");
}

function renderOverviewConnectionStatus(readiness = {}, fidelityStatus = {}, seekingAlphaStatus = {}, marketDataStatus = {}) {
  const target = byId("overviewConnectionStatus");
  if (!target) return;
  const providerStatuses = Object.values(readiness.providerStatuses || {});
  const configuredCount = providerStatuses.filter((status) => status.configured && status.id !== "demo").length;
  const providerCount = providerStatuses.length;
  const plaidReadiness = readiness.connectors?.plaid || {};
  const plaidLinked = Boolean(plaidReadiness.linked);
  const plaidCachedSync = Boolean(fidelityStatus.provider === "plaid" && fidelityStatus.connected && !plaidLinked);
  const fidelityOverview = connectorOverviewStatus("Fidelity", fidelityStatus, "CSV import works. Plaid account linking runs through the local backend when configured.");
  const seekingAlphaOverview = connectorOverviewStatus("Seeking Alpha", seekingAlphaStatus, "Use authorized CSV/XLSX exports or a future licensed API.");
  const rows = [
    [
      "Fidelity",
      plaidLinked ? dataModeLabel(DATA_MODES.LIVE) : plaidCachedSync ? dataModeLabel(DATA_MODES.CACHED) : fidelityOverview.value,
      plaidLinked
        ? "Plaid item linked through the local backend; tokens stay server-side."
        : plaidCachedSync
        ? "Prior Plaid-synced holdings are cached locally, but the local backend has not confirmed an active Plaid item."
        : fidelityOverview.detail
    ],
    ["Seeking Alpha", seekingAlphaOverview.value, seekingAlphaOverview.detail],
    ["Market data", marketDataStatus.label || "Sample market data", marketDataStatus.detail || "Sample mode. Not configured."],
    ["Market providers", `${configuredCount}/${providerCount || 0} key${configuredCount === 1 ? "" : "s"} detected`, readiness.liveProviderCalls ? "Live server proxy enabled" : "Live event/news: Not configured"]
  ];
  target.innerHTML = rows.map(([label, value, detail]) => `
    <div>
      <span>${escapeHtml(label)}</span>
      <b>${escapeHtml(value)}</b>
      <small>${escapeHtml(detail)}</small>
    </div>
  `).join("");
}

function renderOverviewTargetSnapshot(plan, uiState = "SAMPLE_MODE") {
  const target = byId("overviewTargetSnapshot");
  if (!target) return;
  if (!isImportedState(uiState)) {
    target.innerHTML = '<div class="empty"><strong>No target review yet.</strong><span>Import holdings before target drift and cash deployment are meaningful.</span></div>';
    return;
  }
  if (!plan) {
    target.innerHTML = '<div class="empty"><strong>No target plan ready.</strong><span>Open Targets to create or reset the template.</span></div>';
    return;
  }
  const topSuggestion = plan.suggestions?.[0];
  const guardrail = plan.leveragedGuardrails?.find((item) => item.status === "above cap");
  const rows = [
    ["Target rows", plan.rows?.length || 0, `${plan.targetCount || 0} saved targets`],
    ["Deployable cash", formatCurrency(plan.cashPlan?.deployableCash), `Target cash ${formatPct(plan.cashPlan?.targetCashWeight)}`],
    guardrail ? ["Leverage guardrail", guardrail.ticker, guardrail.warning] : ["Leverage guardrail", "Within caps", "No leveraged ETF cap breach"],
    topSuggestion ? ["Top review", topSuggestion.action, `${topSuggestion.key || topSuggestion.scope} · ${formatCurrency(topSuggestion.amount)}`] : ["Top review", "Hold", "No urgent rebalance suggestion"]
  ];
  target.innerHTML = rows.map(([label, value, detail]) => `
    <div>
      <span>${escapeHtml(label)}</span>
      <b>${escapeHtml(value)}</b>
      <small>${escapeHtml(detail)}</small>
    </div>
  `).join("");
}

function renderBreakdowns(breakdowns, uiState = "SAMPLE_MODE", holdings = []) {
  renderBreakdownList("accountBreakdown", breakdowns.account, uiState);
  renderBreakdownList("assetBreakdown", breakdowns.assetClass, uiState);
  renderBreakdownList("sectorBreakdown", breakdowns.sector, uiState, { cashNote: true });
  renderBreakdownList("sleeveBreakdown", breakdowns.sleeve, uiState);
  renderClassificationNote(holdings, uiState);
}

function renderAccountAllocationPanel(accountScope = null, uiState = "SAMPLE_MODE") {
  const target = byId("accountAllocationPanel");
  if (!target) return;
  const accounts = Array.isArray(accountScope?.accounts) ? accountScope.accounts : [];
  if (!isImportedState(uiState)) {
    target.innerHTML = '<div class="empty">Import a Fidelity CSV or sync provider holdings to view account allocation by tax bucket.</div>';
    return;
  }
  if (!accounts.length) {
    target.innerHTML = '<div class="empty">No account rows are available for the active portfolio.</div>';
    return;
  }
  target.innerHTML = accounts.map((account) => renderAccountAllocationRow(account)).join("");
}

function renderAccountAllocationRow(account = {}) {
  const bucket = account.taxBucket || {};
  const mixRows = (account.assetMix || []).slice(0, 4).map((row) => `
    <div>
      <span>${escapeHtml(row.name)} · ${formatPct(row.weight)} · ${formatCompact(row.value)}</span>
      <i style="width:${Math.min(100, Math.max(0, Number(row.weight || 0) * 100))}%"></i>
    </div>
  `).join("");
  const topRows = (account.topPositions || []).map((position) => `
    <li>
      <span>${renderTickerLink(position.ticker)} · ${formatPct(position.weight)}</span>
      <span>${formatCompact(position.value)}</span>
    </li>
  `).join("");
  return `
    <article class="account-allocation-row" data-tax-bucket="${escapeHtml(bucket.key || "other")}">
      <div class="account-allocation-main">
        <span class="tax-bucket-pill ${escapeHtml(bucket.className || "tax-bucket-other")}">${escapeHtml(bucket.label || "Other")}</span>
        <h3>${escapeHtml(account.account || account.label || "Account")}</h3>
        <p>${formatCurrency(account.value)} · ${formatPct(account.portfolioWeight)} of portfolio · ${account.holdingCount || 0} holding${account.holdingCount === 1 ? "" : "s"}</p>
        <div class="account-allocation-bar" aria-label="${escapeHtml(`${account.account || "Account"} is ${formatPct(account.portfolioWeight)} of portfolio`)}"><i style="width:${Math.min(100, Math.max(0, Number(account.portfolioWeight || 0) * 100))}%"></i></div>
        <div class="account-allocation-meta">
          <span>${escapeHtml(account.accountTypeLabel || bucket.detail || "Account type unknown")}</span>
          <span>Cash ${formatPct(account.cashWeight)} · daily move ${formatCurrency(account.dailyChange || 0)}</span>
        </div>
      </div>
      <div class="account-allocation-mix">
        <b>Asset mix</b>
        <div class="account-mix-bars">${mixRows || "<span>No mix available.</span>"}</div>
      </div>
      <div class="account-allocation-top">
        <b>Top positions</b>
        <ul>${topRows || "<li><span>No positions available.</span><span></span></li>"}</ul>
      </div>
    </article>
  `;
}

function renderBreakdownList(id, rows = [], uiState = "SAMPLE_MODE", options = {}) {
  const target = byId(id);
  if (!target) return;
  if (!isImportedState(uiState)) {
    target.innerHTML = '<div class="empty">Import a Fidelity CSV to populate this breakdown.</div>';
    return;
  }
  const cashVisible = options.cashNote && rows.some((row) => row.name === "Cash");
  target.innerHTML = rows.length ? rows.slice(0, 8).map((row) => `
    <div class="breakdown-row">
      <div>
        <b>${escapeHtml(row.name)}</b>
        <span>${row.count} holding${row.count === 1 ? "" : "s"}</span>
      </div>
      <div class="breakdown-value">
        <b>${formatCompact(row.value)}</b>
        <span>${formatPct(row.weight)}</span>
      </div>
      <div class="breakdown-bar"><i style="width:${Math.min(100, row.weight * 100)}%"></i></div>
    </div>
  `).join("") + (cashVisible ? '<p class="section-note">Cash/money market positions are shown separately because they dominate current allocation.</p>' : "") : '<div class="empty">Import a Fidelity CSV to populate this breakdown.</div>';
}

function renderClassificationNote(holdings = [], uiState = "SAMPLE_MODE") {
  const target = byId("classificationNote");
  if (!target) return;
  if (!isImportedState(uiState)) {
    target.innerHTML = '<div class="empty">Classification checks appear after a real CSV import.</div>';
    return;
  }
  const unknownCount = holdings.filter((holding) => /unknown|uncategorized|other/i.test(`${holding.sector} ${holding.assetClass}`)).length;
  target.innerHTML = unknownCount
    ? `<div class="classification-note"><b>${unknownCount} holding${unknownCount === 1 ? "" : "s"} need classification</b><span>Review classifications</span></div>`
    : '<div class="classification-note clean"><b>Classifications usable</b><span>No obvious unknown sector or asset-class labels.</span></div>';
}

function renderAttentionAlerts(alerts, lifecycle = {}, uiState = "SAMPLE_MODE") {
  const target = byId("attentionAlerts");
  if (!target) return;
  if (!isImportedState(uiState)) {
    target.innerHTML = `
      <div class="alert-summary">
        <span>No real portfolio alerts yet</span>
      </div>
      <div class="empty"><strong>Import a Fidelity CSV to see what needs attention.</strong><span>Sample/demo alerts are kept out of this list so they do not look like real risk instructions.</span></div>
    `;
    return;
  }
  const summary = lifecycle.summary || { total: alerts.length, visible: alerts.length, reviewed: 0, hidden: 0 };
  const summaryHtml = `
    <div class="alert-summary">
      <span>${summary.visible} visible</span>
      <span>${summary.reviewed} reviewed</span>
      <span>${summary.hidden} hidden</span>
      ${summary.hidden ? '<button type="button" data-alert-action="restore-hidden" aria-label="Restore hidden alerts">Restore hidden</button>' : ""}
    </div>
  `;
  const groups = groupAlertsByAction(alerts);
  target.innerHTML = alerts.length
    ? `${summaryHtml}${groups.map(([title, items]) => `
      <section class="alert-group">
        <h3>${escapeHtml(title)}</h3>
        ${items.map(renderAlertItem).join("")}
      </section>
    `).join("")}`
    : `${summaryHtml}<div class="empty"><strong>No alerts need attention.</strong><span>Import data, set targets, or connect providers later to add more context.</span></div>`;
}

function renderAlertItem(item) {
  const actionLabel = escapeHtml(item.title || item.detail || item.id || "alert");
  return `
    <article class="alert-item ${escapeHtml(alertTone(item))}">
      <span>${escapeHtml(alertDisplayLabel(item))}</span>
      <div>
        <div class="alert-title-row">
          <b>${escapeHtml(item.title)}</b>
          ${item.status === "reviewed" ? '<em>reviewed</em>' : ""}
        </div>
        ${item.ticker ? `<div class="ticker-chips">${renderTickerLink(item.ticker)}</div>` : ""}
        <p>${escapeHtml(item.detail)}</p>
        <div class="alert-actions">
          <button type="button" data-alert-action="review" data-alert-id="${escapeHtml(item.id)}" aria-label="Mark reviewed: ${actionLabel}">Mark reviewed</button>
          <button type="button" data-alert-action="hide" data-alert-id="${escapeHtml(item.id)}" aria-label="Hide alert: ${actionLabel}">Hide</button>
        </div>
      </div>
    </article>
  `;
}

function groupAlertsByAction(alerts = []) {
  const groups = [
    ["Needs review now", []],
    ["Monitor", []],
    ["Positive thesis support", []],
    ["Log / ignore", []]
  ];
  const byName = new Map(groups);
  alerts.slice(0, 16).forEach((alert) => {
    byName.get(alertGroupName(alert)).push(alert);
  });
  return groups.filter(([, items]) => items.length);
}

function alertGroupName(alert = {}) {
  if (alert.actionCategory === "Positive Signal" || /supports thesis|positive signal/i.test(`${alert.title} ${alert.detail}`)) return "Positive thesis support";
  if (alert.actionCategory === "Log Only" || alert.actionCategory === "Ignore" || /ignore|log only/i.test(alert.detail || "") || alert.severity === "info") return "Log / ignore";
  if (alert.actionCategory === "Monitor" || /monitor/i.test(alert.detail || "") || ["low", "watch"].includes(alert.severity)) return "Monitor";
  return "Needs review now";
}

function alertDisplayLabel(alert = {}) {
  return alert.actionCategory || ({
    critical: "Critical Review",
    warning: "Review",
    watch: "Monitor",
    info: "Log Only",
    high: "Review",
    medium: "Review",
    low: "Monitor",
    positive: "Positive Signal"
  }[alert.severity] || "Monitor");
}

function alertTone(alert = {}) {
  const label = alertDisplayLabel(alert);
  if (label === "Critical Review") return "critical";
  if (label === "Review") return "medium";
  if (label === "Positive Signal") return "positive";
  if (label === "Ignore" || label === "Log Only") return "low";
  if (alert.severity === "warning") return "medium";
  if (alert.severity === "watch") return "low";
  if (alert.severity === "info") return "low";
  return "low";
}

function renderDecisionBrief(brief = {}, uiState = "SAMPLE_MODE") {
  const target = byId("decisionBriefPanel");
  if (!target) return;
  if (!isImportedState(uiState)) {
    target.innerHTML = `
      <div class="empty">
        <strong>No real portfolio intelligence yet.</strong>
        <span>Import Tucker’s Fidelity CSV to generate portfolio-specific risks, monitoring items, and actions.</span>
      </div>
    `;
    return;
  }
  target.innerHTML = `
    <div class="brief-lede">${escapeHtml(brief.summaryLine || "No decision brief is available yet.")}</div>
    <div class="brief-grid">
      ${briefBlock("Top signals", (brief.topPrioritySignals || []).map((signal) => `${escapeHtml(signal.actionLabel)}: ${renderTickerOrLabel(signal.primaryTicker)} - ${escapeHtml(signal.headline)}`), { html: true })}
      ${briefBlock("Top risks", (brief.topPortfolioRisks || []).map((risk) => `${risk.severity}: ${risk.title}`))}
      ${briefBlock("Monitor next", (brief.monitorItems || []).map((item) => `${renderTickerOrLabel(item.ticker)}: ${escapeHtml(item.text)}`), { html: true })}
      ${briefBlock("Thesis impact", (brief.thesisImpactEvents || []).map((event) => `${renderTickerOrLabel(event.ticker)}: ${escapeHtml(event.thesisImpact)}`), { html: true })}
      ${briefBlock("Ignore / log", (brief.noActionRecommendations || []).map((item) => item.reason))}
      ${briefBlock("Stale data", (brief.staleDataWarnings || []).map((item) => item.message))}
    </div>
  `;
}

function renderDailyCommandBrief(brief = {}, uiState = "SAMPLE_MODE") {
  const summaryTarget = byId("dailyBriefSummaryPanel");
  const rankedTarget = byId("dailyBriefRankedFeed");
  const actionTarget = byId("dailyBriefActionNeeded");
  const watchTarget = byId("dailyBriefWatchClosely");
  const infoTarget = byId("dailyBriefInformational");
  if (!summaryTarget || !actionTarget || !watchTarget || !infoTarget) return;
  const imported = isImportedState(uiState);
  const groups = brief.groups || {};
  const summary = brief.summary || {};
  summaryTarget.innerHTML = `
    <div class="daily-brief-hero ${imported ? "imported" : "pre-import"}">
      <div>
        <span class="status-badge ${imported ? "safe" : "sample"}">${escapeHtml(brief.statusLabel || (imported ? "Real portfolio loaded" : "No real portfolio loaded"))}</span>
        <span class="status-badge">${escapeHtml(brief.sourceMode || "Local")}</span>
        <span class="status-badge">${escapeHtml(brief.generatedAt ? `Generated ${shortDateTime(brief.generatedAt)}` : "Generated locally")}</span>
      </div>
      <h3>${escapeHtml(brief.headline || "Daily Command Brief is ready.")}</h3>
      <div class="daily-brief-stats">
        <div><span>Portfolio value</span><b>${imported ? formatCurrency(summary.totalValue) : "--"}</b></div>
        <div><span>Daily move</span><b class="${Number(summary.dailyChange) >= 0 ? "positive" : "negative"}">${imported ? formatSignedCurrency(summary.dailyChange) : "--"}</b></div>
        <div><span>Action needed</span><b>${summary.actionCount || 0}</b></div>
        <div><span>Watch closely</span><b>${summary.watchCount || 0}</b></div>
        <div><span>Data label</span><b>${escapeHtml(summary.marketDataLabel || "Local")}</b></div>
        <div><span>Move coverage</span><b>${escapeHtml(dailyMoveCoverageLabel(summary.dailyMoveCoverage))}</b></div>
      </div>
    </div>
  `;
  if (rankedTarget) rankedTarget.innerHTML = renderDailyBriefRankedFeed(brief.items || [], imported);
  actionTarget.innerHTML = renderDailyBriefGroup(groups["Action needed"], {
    title: "Action needed",
    summary: "Inspect these first because they can affect portfolio risk, target drift, or source trust.",
    limit: 5,
    emptyTitle: imported ? "No urgent action items." : "Import a portfolio to unlock action items.",
    emptyDetail: imported ? "Review alerts and target drift will appear here when they need attention." : "The brief stays quiet until real holdings are loaded."
  });
  watchTarget.innerHTML = renderDailyBriefGroup(groups["Watch closely"], {
    title: "Watch closely",
    summary: "Material but not urgent items for ticker follow-up, upcoming events, and signal changes.",
    limit: 5,
    emptyTitle: "Nothing unusual to watch right now.",
    emptyDetail: "Top movers, signal scores, Reddit acceleration, disclosures, and upcoming events appear here."
  });
  infoTarget.innerHTML = renderDailyBriefGroup(groups.Informational, {
    title: "Informational",
    summary: "Context and source-quality notes that should stay visible without driving the day.",
    limit: 4,
    emptyTitle: "No informational notes.",
    emptyDetail: "Data-source labels and missing-data notes appear here when relevant."
  });
}

function renderDailyBriefRankedFeed(items = [], imported = false) {
  const ranked = Array.isArray(items) ? items.slice(0, 6) : [];
  if (!ranked.length) {
    return `<div class="empty"><strong>${imported ? "No ranked brief items yet." : "Import a portfolio to generate the ranked feed."}</strong><span>${imported ? "Alerts, movers, signals, events, and source notes appear here when they have enough context." : "The feed stays quiet until real holdings or Sample mode are loaded."}</span></div>`;
  }
  return ranked.map(renderDailyBriefItem).join("");
}

function renderDailyBriefGroup(items = [], options = {}) {
  const rows = Array.isArray(items) ? items : [];
  const limit = Number(options.limit) > 0 ? Number(options.limit) : 5;
  if (!rows.length) {
    return `<div class="empty"><strong>${escapeHtml(options.emptyTitle || "No items.")}</strong><span>${escapeHtml(options.emptyDetail || "Nothing to show right now.")}</span></div>`;
  }
  const hiddenCount = Math.max(0, rows.length - limit);
  return `
    <div class="daily-group-summary">
      <b>${escapeHtml(options.title || "Brief group")} · ${rows.length} item${rows.length === 1 ? "" : "s"}</b>
      <span>${escapeHtml(options.summary || "Open linked screens for the underlying context.")}</span>
    </div>
    ${rows.slice(0, limit).map(renderDailyBriefItem).join("")}
    ${hiddenCount ? `<div class="daily-brief-more">Showing the top ${limit}; ${hiddenCount} more lower-priority item${hiddenCount === 1 ? "" : "s"} remain in this group.</div>` : ""}
  `;
}

function renderDailyBriefItem(item = {}) {
  const href = String(item.href || "#overview").startsWith("#") ? item.href : "#overview";
  const ticker = item.ticker ? renderTickerLink(item.ticker) : "";
  return `
    <article class="daily-brief-item ${escapeHtml(String(item.group || "").toLowerCase().replaceAll(" ", "-"))}">
      <div class="daily-brief-item-top">
        <span class="status-badge">${escapeHtml(dailyBriefKindLabel(item))}</span>
        <span class="status-badge ${dailyBriefBadgeClass(item)}">${escapeHtml(item.actionLabel || "Review")}</span>
        <span class="status-badge">${escapeHtml(item.dataStatus || "Local")}</span>
      </div>
      <h3>${escapeHtml(item.title || "Brief item")}</h3>
      <p>${escapeHtml(item.detail || "")}</p>
      <small><b>Why it matters:</b> ${escapeHtml(item.reason || "Review the linked screen for context.")}</small>
      <div class="daily-brief-item-foot">
        ${ticker ? `<div class="ticker-chips">${ticker}</div>` : "<span></span>"}
        <a class="button-link" href="${escapeHtml(href)}">${escapeHtml(dailyBriefItemCta(item))}</a>
      </div>
    </article>
  `;
}

function dailyBriefItemCta(item = {}) {
  const href = String(item.href || "");
  if (item.ticker) return "Open ticker";
  if (href === "#alerts") return "Review alerts";
  if (href === "#risk") return "Review risk";
  if (href === "#data-sources") return "Check sources";
  if (href === "#calendar") return "Open calendar";
  if (href === "#holdings") return "Open holdings";
  if (href === "#targets") return "Review targets";
  if (href === "#alpha") return "Open Alpha";
  if (href === "#market-intelligence") return "Open intelligence";
  if (href === "#thesis") return "Open thesis";
  if (href === "#what-if") return "Open simulator";
  return "Open detail";
}

function dailyMoveCoverageLabel(coverage = null) {
  if (!coverage || !coverage.eligibleCount) return "--";
  return `${Number(coverage.coveredCount) || 0}/${Number(coverage.eligibleCount) || 0}`;
}

function dailyBriefKindLabel(item = {}) {
  const kind = String(item.kind || "").replaceAll("-", " ").trim();
  if (!kind) return "Brief item";
  return titleCase(kind);
}

function renderOverviewCalendarSnapshot(events = [], uiState = "SAMPLE_MODE") {
  const target = byId("overviewCalendarSnapshot");
  if (!target) return;
  if (!isImportedState(uiState)) {
    target.innerHTML = '<div><span>Calendar</span><b>Import portfolio first</b><small>Events stay labeled as mock/imported/manual.</small></div>';
    return;
  }
  const summary = summarizeCalendarEvents(events);
  const next = summary.nextEvent;
  target.innerHTML = next
    ? `
      <div>
        <span>${escapeHtml(eventTypeLabel(next.eventType))} · ${escapeHtml(eventSourceLabel(next.sourceMode, next.sourceLabel))}</span>
        <b>${escapeHtml(next.title)}</b>
        <small>${eventTickerChips(next)} ${escapeHtml(next.date)} · ${escapeHtml(titleCase(next.importance))} importance</small>
      </div>
      <div>
        <span>Next 45 days</span>
        <b>${summary.upcoming45} events</b>
        <small>${summary.highImportance} high importance · ${summary.mockCount} mock · ${summary.importedCount} imported/manual</small>
      </div>
    `
    : '<div><span>Calendar</span><b>No upcoming events loaded</b><small>Import a CSV/JSON event file or add a custom event.</small></div>';
}

function dailyBriefBadgeClass(item = {}) {
  if (item.group === "Action needed") return "brief-action";
  if (item.group === "Watch closely") return "brief-watch";
  return "brief-info";
}

function renderCalendarEvents(events = [], summary = {}, filters = {}, importReport = null) {
  const target = byId("calendarEventsPanel");
  const summaryTarget = byId("calendarSummaryPanel");
  const importTarget = byId("calendarImportDetails");
  const sourceLabel = summary.importedCount || summary.manualCount
    ? summary.mockCount ? "Mixed" : "Imported"
    : "Sample";
  setStatusBadge("calendarSummarySourceBadge", sourceLabel, summary.importedCount || summary.manualCount ? "" : "demo");
  if (summaryTarget) {
    summaryTarget.innerHTML = `
      <div class="risk-grid">
        <div><span>Upcoming 45 days</span><b>${summary.upcoming45 || 0}</b><small>Sample/imported/manual events only unless a live provider is added later.</small></div>
        <div><span>Next 7 days</span><b>${summary.next7 || 0}</b><small>Near-term review windows.</small></div>
        <div><span>High importance</span><b>${summary.highImportance || 0}</b><small>Earnings, Fed/macro, or user-marked high.</small></div>
        <div><span>Source mix</span><b>${summary.mockCount || 0} mock</b><small>${summary.importedCount || 0} imported · ${summary.manualCount || 0} manual</small></div>
      </div>
    `;
  }
  if (importTarget) {
    importTarget.innerHTML = importReport
      ? `
        <details>
          <summary>Calendar import details</summary>
          <p><b>File:</b> ${escapeHtml(importReport.fileName || "Local file")}</p>
          <p><b>Rows parsed:</b> ${escapeHtml(importReport.rowsParsed || 0)} · <b>Events imported:</b> ${escapeHtml(importReport.eventsImported || 0)}</p>
          ${(importReport.rejectedRows || []).length ? `<p><b>Rows needing review:</b></p><ul>${(importReport.rejectedRows || []).slice(0, 8).map((row) => `<li>Row ${escapeHtml(row.rowNumber)}: ${escapeHtml((row.reasons || []).join(", "))}</li>`).join("")}</ul>` : "<p>No rejected rows from the latest calendar import.</p>"}
        </details>
      `
      : '<p class="section-note">No calendar import has been applied yet. Sample events and manual events stay local.</p>';
  }
  if (!target) return;
  target.innerHTML = events.length
    ? events.map(renderCalendarEventCard).join("")
    : `<div class="empty"><strong>No events match the current filters.</strong><span>Adjust filters, import a CSV/JSON calendar file, or add a custom user event.</span></div>`;
}

function renderCalendarEventCard(event = {}) {
  const source = eventSourceLabel(event.sourceMode, event.sourceLabel);
  const sourceClass = eventSourceBadgeClass(event.sourceMode);
  return `
    <article class="market-event ${escapeHtml(event.importance || "medium")} calendar-event-card">
      <div>
        <div class="badge-row">
          <span class="status-badge">${escapeHtml(eventTypeLabel(event.eventType))}</span>
          <span class="status-badge ${sourceClass}">${escapeHtml(source)}</span>
          <span class="status-badge ${event.importance === "high" ? "sample" : event.importance === "medium" ? "demo" : "safe"}">${escapeHtml(titleCase(event.importance || "medium"))} importance</span>
        </div>
        <h3>${escapeHtml(event.title || "Calendar event")}</h3>
        <p>${escapeHtml(event.summary || event.notes || "Local calendar event. Verify timing before relying on it.")}</p>
        <div class="alpha-quick-facts">
          <span>Date ${escapeHtml(event.date || "unknown")}</span>
          <span>${escapeHtml(event.daysUntil === 0 ? "Today" : Number.isFinite(event.daysUntil) ? `${event.daysUntil} days away` : "Timing unknown")}</span>
          <span>${escapeHtml(source)}</span>
        </div>
        ${event.notes ? `<p class="section-note">${escapeHtml(event.notes)}</p>` : ""}
      </div>
      <div class="affected-exposure">
        <span>Affected tickers</span>
        <div class="ticker-chips">${eventTickerChips(event) || "<span class=\"status-badge\">Portfolio / macro</span>"}</div>
        <small>${escapeHtml(event.sourceMode === "live" ? "Live provider event" : `${dataModeLabel(sourceDataMode(event))} calendar data`)}</small>
        ${event.sourceMode === "manual" || event.sourceMode === "imported" ? `<div class="connector-actions compact"><button type="button" data-calendar-action="edit" data-calendar-id="${escapeHtml(event.id)}" aria-label="Edit calendar event ${escapeHtml(event.title || event.id)}">Edit</button><button type="button" data-calendar-action="delete" data-calendar-id="${escapeHtml(event.id)}" aria-label="Delete calendar event ${escapeHtml(event.title || event.id)}">Delete</button></div>` : ""}
      </div>
    </article>
  `;
}

function renderMarketCalendarEvents(events = [], uiState = "SAMPLE_MODE") {
  const target = byId("marketCalendarEventsPanel");
  if (!target) return;
  const upcoming = events.slice(0, 6);
  target.innerHTML = upcoming.length
    ? upcoming.map((event) => `
      <article class="market-event ${escapeHtml(event.importance || "medium")} calendar-event-card compact">
        <div>
          <div class="badge-row">
            <span class="status-badge">${escapeHtml(eventTypeLabel(event.eventType))}</span>
            <span class="status-badge ${eventSourceBadgeClass(event.sourceMode)}">${escapeHtml(eventSourceLabel(event.sourceMode, event.sourceLabel))}</span>
            <span class="status-badge action">${escapeHtml(titleCase(event.importance || "medium"))}</span>
          </div>
          <h3>${escapeHtml(event.title)}</h3>
          <p>${escapeHtml(event.summary || "Calendar context for owned/watchlist tickers.")}</p>
          <p><b>Review prompt:</b> ${escapeHtml(calendarReviewPrompt(event, uiState))}</p>
        </div>
        <div class="affected-exposure">
          <span>Affected tickers</span>
          <div class="ticker-chips">${eventTickerChips(event) || "<span class=\"status-badge\">Portfolio / macro</span>"}</div>
          <small>${escapeHtml(event.date || "unknown date")}</small>
        </div>
      </article>
    `).join("")
    : '<div class="empty"><strong>No calendar events loaded.</strong><span>Import events or add a custom event on Calendar. Live events are not configured.</span></div>';
}

function renderAlphaRecommendations(recommendations = [], allRecommendations = recommendations, activeFilter = "all", holdings = [], tickerSignals = [], uiState = "SAMPLE_MODE") {
  const target = byId("alphaEnginePanel");
  if (!target) return;
  const rankedRows = buildRankedAlphaHoldingRows(holdings, allRecommendations, tickerSignals, activeFilter, uiState);
  const allRows = buildRankedAlphaHoldingRows(holdings, allRecommendations, tickerSignals, "all", uiState);
  const sourceIssues = buildAlphaSourceIssueRows(recommendations, allRecommendations);
  const summary = alphaHoldingSummaryStats(allRows);
  target.innerHTML = `
    <div class="recommendation-summary">
      <div>
        <span>Evidence quality rank</span>
        <b>${escapeHtml(allRows.length)} holding${allRows.length === 1 ? "" : "s"} scored</b>
        <small>Owned positions ranked by factor discipline, thesis support, source freshness, risk, and data coverage. Review priority is shown separately and is not a quality signal.</small>
      </div>
      <div>
        <span>Current filter</span>
        <b>${escapeHtml(alphaRecommendationFilterLabel(activeFilter))}</b>
        <small>Highest evidence row: ${allRows[0] ? `${escapeHtml(allRows[0].ticker)} · ${escapeHtml(allRows[0].qualityScore)}/100 · ${escapeHtml(allRows[0].postureLabel)}` : "none"} · source items: ${escapeHtml(sourceIssues.length)}</small>
      </div>
      <div>
        <span>Useful split</span>
        <b>${summary.strongCount} strong · ${summary.reviewCount} review</b>
        <small>${summary.weakDataCount} weak-data row${summary.weakDataCount === 1 ? "" : "s"} · weakest: ${summary.weakestRow ? `${escapeHtml(summary.weakestRow.ticker)} ${escapeHtml(summary.weakestRow.qualityScore)}/100` : "none"}</small>
      </div>
      <div>
        <span>Best next click</span>
        <b>${summary.topReviewRow ? escapeHtml(summary.topReviewRow.ticker) : summary.topQualityRow ? escapeHtml(summary.topQualityRow.ticker) : "None"}</b>
        <small>${escapeHtml(summary.nextClickReason)}</small>
      </div>
    </div>
    ${sourceIssues.length ? renderAlphaSourceIssueList(sourceIssues) : ""}
    ${allRows.length ? renderAlphaHoldingRankTable(rankedRows, activeFilter) : '<div class="empty"><strong>No holdings available to rank.</strong><span>Import holdings or load sample data to score owned positions. Watchlist-only signals stay in Market Intelligence until they are linked to a holding.</span></div>'}
  `;
}

function alphaHoldingSummaryStats(rows = []) {
  const strongRows = rows.filter((row) => row.qualityScore >= 70 && !/Weak data|Risk review/i.test(row.postureLabel));
  const reviewRows = rows.filter((row) => /Risk review|Weak data/i.test(row.postureLabel) || row.reviewPriorityScore >= 70);
  const weakDataRows = rows.filter((row) => /Weak data/i.test(row.postureLabel) || row.dataQualityScore < 0.45);
  const topReviewRow = reviewRows
    .slice()
    .sort((left, right) => right.reviewPriorityScore - left.reviewPriorityScore || right.marketValue - left.marketValue)[0];
  const topQualityRow = strongRows[0] || rows[0];
  const weakestRow = rows
    .slice()
    .sort((left, right) => left.dataQualityScore - right.dataQualityScore || left.qualityScore - right.qualityScore)[0];
  return {
    strongCount: strongRows.length,
    reviewCount: reviewRows.length,
    weakDataCount: weakDataRows.length,
    topReviewRow,
    topQualityRow,
    weakestRow,
    nextClickReason: topReviewRow
      ? `${topReviewRow.postureLabel}: review quality score separately from urgency.`
      : topQualityRow
      ? `${topQualityRow.postureLabel}: inspect supporting factors before acting.`
      : "Import holdings to build the ranking."
  };
}

export function buildRankedAlphaHoldingRows(holdings = [], recommendations = [], tickerSignals = [], activeFilter = "all", uiState = "SAMPLE_MODE") {
  const groupedHoldings = prepareHoldingsForView(holdings, "ticker")
    .filter((holding) => normalizeTickerSymbol(holding.ticker) && Number(holding.marketValue) > 0 && !/cash/i.test(holding.assetClass || ""));
  const signalsByTicker = new Map((tickerSignals || []).map((signal) => [normalizeTickerSymbol(signal.ticker), signal]).filter(([ticker]) => ticker));
  const recommendationsByTicker = groupRecommendationsByTicker(recommendations);
  const rows = groupedHoldings.map((holding) => {
    const ticker = normalizeTickerSymbol(holding.ticker);
    const signal = signalsByTicker.get(ticker) || {};
    const relatedRecommendations = recommendationsByTicker.get(ticker) || [];
    return buildAlphaHoldingRankRow(holding, signal, relatedRecommendations, uiState);
  }).sort((left, right) =>
    right.qualityScore - left.qualityScore ||
    right.marketValue - left.marketValue ||
    left.ticker.localeCompare(right.ticker)
  );

  return rows
    .map((row, index) => ({ ...row, rank: index + 1 }))
    .filter((row) => alphaHoldingRowMatchesFilter(row, activeFilter));
}

function renderAlphaHoldingRankTable(rows = [], activeFilter = "all") {
  return `
    <div class="alpha-ranking-table-wrap table-wrap">
      <table class="alpha-ranking-table">
        <caption class="sr-only">Alpha Engine evidence quality ranking for owned holdings</caption>
        <thead>
          <tr>
            <th scope="col">Rank</th>
            <th scope="col">Holding</th>
            <th scope="col">Quality score</th>
            <th scope="col">Weight</th>
            <th scope="col">Thesis + factors</th>
            <th scope="col">Review priority</th>
            <th scope="col">Risk + source quality</th>
            <th scope="col">Factors</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length ? rows.map(renderAlphaHoldingRankRow).join("") : `<tr><td colspan="8" class="empty">No holdings match ${escapeHtml(alphaRecommendationFilterLabel(activeFilter))}. Try All holdings, Needs review, or Weak data.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderAlphaHoldingRankRow(row) {
  return `
    <tr class="alpha-ranking-row ${escapeHtml(row.postureClass)}" aria-label="${escapeHtml(`${row.ticker} rank ${row.rank}, quality score ${row.qualityScore} out of 100, ${row.postureLabel}`)}">
      <td class="rank-cell">#${escapeHtml(row.rank)}</td>
      <td class="holding-cell">
        <b>${renderTickerLink(row.ticker)}</b>
        <span>${escapeHtml(row.name || row.sector || "Holding")}</span>
        <small>${escapeHtml(row.accountLabel)}</small>
        <small class="holding-reason"><b>Evidence:</b> ${escapeHtml(summaryText(row.topReason, 96))}</small>
      </td>
      <td>
        <span class="alpha-score-pill ${escapeHtml(row.scoreClass)}">${escapeHtml(row.qualityScore)}/100</span>
        <small class="score-posture">${escapeHtml(row.postureLabel)} · quality, not urgency</small>
      </td>
      <td class="numeric-cell"><b>${formatCurrency(row.marketValue)}</b><span>${formatPct(row.portfolioWeight)}</span></td>
      <td>
        <span>${escapeHtml(row.thesisLabel)}</span>
        <small>${formatScore100(row.quantLensScore)} Quant Lens · ${formatScore100(row.academicCompositeScore)} academic discipline</small>
        <small class="alpha-factor-discipline">${escapeHtml(row.factorDisciplineLine)}</small>
      </td>
      <td class="numeric-cell"><b>${formatScore100(row.reviewPriorityScore)}</b><span>${escapeHtml(row.signalLabel)}</span></td>
      <td>
        <span class="alpha-risk-line">${escapeHtml(row.riskLabel)}</span>
        <small>${escapeHtml(row.dataLabel)}</small>
      </td>
      <td class="details-cell">
        <details class="alpha-rank-details">
          <summary aria-label="Show Alpha Engine factors and rank for ${escapeHtml(row.ticker)}">Factors & rank</summary>
          <div class="alpha-rank-details-grid">
            <div>
              <b>Quality evidence</b>
              ${row.supportingSignals.length ? list(row.supportingSignals.slice(0, 4)) : "<span>No strong support signal is loaded yet.</span>"}
            </div>
            <div>
              <b>Rank limits</b>
              ${row.missingWeakSignals.length ? list(row.missingWeakSignals.slice(0, 4)) : "<span>No major weak-data item listed.</span>"}
            </div>
            <div>
              <b>Why this quality rank?</b>
              ${row.whyThisRank.length ? list(row.whyThisRank.slice(0, 5)) : "<span>Quality score reflects available quant, thesis, source coverage, and risk inputs.</span>"}
            </div>
            <div>
              <b>Factor discipline</b>
              <p class="alpha-rank-footnote">The Quant Lens is now a first-class Alpha quality input. Paper-backed factor checks keep quality, value, momentum, risk, and validation separate.</p>
              ${renderAcademicFactorMiniList(row.academicFactors)}
            </div>
            <div>
              <b>Prediction model</b>
              ${renderAlphaPredictionMini(row.prediction)}
            </div>
            <div>
              <b>Quality score math</b>
              ${renderAlphaQualityScoreBreakdown(row.qualityBreakdown)}
            </div>
            <div>
              <b>Review priority math</b>
              ${renderAlphaReviewPriorityBreakdown(row.reviewPriorityBreakdown)}
            </div>
          </div>
          <div class="alpha-grid compact">
            <div><b>Quant Lens</b><span>${formatScore100(row.quantLensScore)}</span></div>
            <div><b>Data quality</b><span>${formatScore(row.dataQualityScore)}</span></div>
            <div><b>Confidence</b><span>${formatScore(row.confidenceScore)}</span></div>
            <div><b>Risk penalty</b><span>${formatScore(row.riskPenaltyScore)}</span></div>
            <div><b>Freshness</b><span>${formatScore(row.sourceFreshnessScore)}</span></div>
            <div><b>Factor discipline</b><span>${formatScore100(row.academicCompositeScore)}</span></div>
            <div><b>Review priority</b><span>${formatScore100(row.reviewPriorityScore)}</span></div>
            <div><b>Evidence cap</b><span>${escapeHtml(row.qualityCap < 100 ? `${row.qualityCap}/100` : "None")}</span></div>
            <div><b>Updated</b><span>${escapeHtml(row.updatedLabel)}</span></div>
          </div>
          ${row.academicValidationWarnings.length ? `<p><b>Validation guardrail:</b> ${escapeHtml(row.academicValidationWarnings.slice(0, 2).join("; "))}</p>` : ""}
          <p><b>Guardrail:</b> Quality rank and review priority are separate. Inspect the evidence; do not treat this as a forecast or trade instruction.</p>
          <a class="button-link" href="${tickerDetailHash(row.ticker)}">Open ${escapeHtml(row.ticker)} analysis</a>
        </details>
      </td>
    </tr>
  `;
}

function buildAlphaHoldingRankRow(holding = {}, signal = {}, recommendations = [], uiState = "SAMPLE_MODE") {
  const ticker = normalizeTickerSymbol(holding.ticker);
  const quantScore = alphaQuantScore(holding, signal);
  const thesisScore = thesisQualityScore(holding.thesisStatus, holding.confidenceLevel);
  const dataQualityScore = alphaDataQualityScore(signal, recommendations);
  const supportScore = alphaSupportScore(signal, recommendations);
  const priceScore = alphaPriceScore(signal, holding);
  const sourceFreshnessScore = alphaSourceFreshnessScore(signal, recommendations, uiState);
  const riskPenaltyScore = alphaRiskPenaltyScore(holding, signal, recommendations);
  const confidenceScore = Math.max(score01(signal.institutionalQuantConfidenceScore / 100), maxRecommendationScore(recommendations, "confidenceScore"), dataQualityScore * 0.85);
  const reviewPriorityBreakdown = alphaReviewPriorityBreakdown(signal, recommendations);
  const reviewPriorityScore = reviewPriorityBreakdown.score;
  const academicCompositeScore = normalizedAcademicCompositeScore(signal, quantScore);
  const academicFactors = signal.institutionalQuantAcademicFactors || signal.institutionalQuantFactors || [];
  const academicValidationWarnings = signal.institutionalQuantAcademicValidationWarnings || signal.institutionalQuantDataSufficiencyWarnings || [];
  const quantLensScore = alphaQuantLensIntegratedScore({
    quantScore,
    academicCompositeScore,
    dataQualityScore,
    validationWarnings: academicValidationWarnings
  });
  const qualityBreakdown = alphaQualityScoreBreakdown({
    quantLensScore,
    thesisScore,
    dataQualityScore,
    sourceFreshnessScore,
    supportScore,
    priceScore,
    riskPenaltyScore
  });
  const rawQualityScore = qualityBreakdown.reduce((total, item) => total + item.points, 0);
  const qualityCap = alphaQualityEvidenceCap({ signal, recommendations, dataQualityScore, validationWarnings: academicValidationWarnings });
  const qualityScore = Math.round(Math.max(0, Math.min(qualityCap, rawQualityScore)));
  const posture = alphaHoldingPosture({ qualityScore, holding, signal, recommendations, dataQualityScore, riskPenaltyScore });
  const supportingSignals = uniqueInInputOrder([
    ...(signal.institutionalQuantStrengths || []),
    ...(signal.whyScoreIsHigh || []),
    ...recommendations.flatMap((recommendation) => recommendation.supportingSignals || [])
  ]).slice(0, 8);
  const missingWeakSignals = uniqueInInputOrder([
    ...(signal.institutionalQuantWeaknesses || []),
    ...(signal.institutionalQuantMissingData || []),
    ...(signal.missingData || []),
    ...recommendations.flatMap((recommendation) => recommendation.missingWeakSignals || [])
  ]).slice(0, 8);
  const whyThisRank = alphaHoldingRankReasons({
    holding,
    signal,
    recommendations,
    qualityScore,
    quantLensScore,
    quantScore,
    thesisScore,
    dataQualityScore,
    supportScore,
    riskPenaltyScore,
    sourceFreshnessScore,
    qualityCap,
    uiState
  });
  return {
    ticker,
    name: holding.name || holding.company || signal.name || "",
    sector: holding.sector || signal.sector || "",
    accountLabel: holding.account || "",
    marketValue: Number(holding.marketValue) || 0,
    portfolioWeight: Number(holding.portfolioWeight) || 0,
    thesisLabel: holding.thesisStatus || "No thesis",
    quantScore,
    quantLensScore,
    quantLabel: signal.institutionalQuantLabel || (holding.quant ? "SA/imported" : "Limited data"),
    signalScore: Number(signal.combinedScore) || Math.round(supportScore * 100),
    signalLabel: signal.actionCategory || (recommendations[0] ? titleCase(recommendations[0].recommendationType) : "No signal"),
    riskLabel: alphaRiskLabel(holding, signal, recommendations, riskPenaltyScore),
    dataLabel: alphaDataLabel(signal, recommendations, dataQualityScore, uiState),
    watchlistLinked: Boolean(signal.watchlistFlag || recommendations.some((recommendation) =>
      recommendation.relatedHoldingsStatus === "watchlist" ||
      /watchlist/i.test(`${recommendation.recommendationType || ""} ${recommendation.title || ""} ${recommendation.summary || ""}`)
    )),
    dataQualityScore,
    confidenceScore,
    riskPenaltyScore,
    sourceFreshnessScore,
    reviewPriorityScore,
    reviewPriorityBreakdown,
    academicCompositeScore,
    academicFactors,
    academicValidationWarnings,
    qualityBreakdown,
    qualityCap,
    factorDisciplineLine: alphaFactorDisciplineLine(academicCompositeScore, academicFactors, academicValidationWarnings),
    qualityScore,
    scoreClass: alphaScoreClass(qualityScore),
    postureLabel: posture.label,
    postureClass: posture.className,
    topReason: whyThisRank[0] || "Balanced score from available local inputs.",
    supportingSignals,
    missingWeakSignals,
    whyThisRank,
    prediction: stockPredictionFromSignal(signal),
    updatedLabel: shortDateTime(signal.updatedAt || signal.marketDataFetchedAt || recommendations[0]?.updatedAt || recommendations[0]?.createdAt),
    sourceModes: uniqueInInputOrder([signal.sourceLabel, signal.marketDataLabel, ...recommendations.flatMap((recommendation) => recommendation.sourceModes || [])].filter(Boolean)),
    recommendations
  };
}

function alphaQualityEvidenceCap({ signal = {}, recommendations = [], dataQualityScore = 0, validationWarnings = [] } = {}) {
  const missingCount = [
    ...(signal.institutionalQuantMissingData || []),
    ...(signal.institutionalQuantWeaknesses || []),
    ...(signal.missingData || []),
    ...recommendations.flatMap((recommendation) => recommendation.missingWeakSignals || [])
  ].length;
  if (dataQualityScore < 0.3) return 48;
  if (dataQualityScore < 0.45) return 58;
  if (missingCount >= 4) return 64;
  if ((validationWarnings || []).length >= 2) return 70;
  if ((validationWarnings || []).length) return 78;
  return 100;
}

export function buildAlphaSourceIssueRows(_filteredRecommendations = [], allRecommendations = []) {
  return allRecommendations
    .filter((recommendation) => !recommendation.ticker || recommendation.recommendationType === "stale data review" || recommendation.relatedHoldingsStatus === "signal-only")
    .slice(0, 4);
}

function renderAlphaSourceIssueList(rows = []) {
  return `
    <div class="alpha-source-issues" aria-label="Portfolio and data source items">
      <h3>Portfolio and data-source items</h3>
      <p>These affect trust in the ranking but are not individual holding scores.</p>
      ${rows.map((row) => `
        <a href="${escapeHtml(safeHashHref(row.href || "#data-sources"))}">
          <span>${escapeHtml(titleCase(row.recommendationType || "review"))}</span>
          <b>${escapeHtml(row.title || "Review data source")}</b>
          <small>${escapeHtml(row.summary || row.sourceFreshness || "Check source status.")}</small>
        </a>
      `).join("")}
    </div>
  `;
}

function renderAlphaPredictionMini(prediction = {}) {
  if (!prediction.score) return "<p class=\"alpha-rank-footnote\">No prediction model output is available for this holding yet.</p>";
  return `
    <p class="alpha-rank-footnote">${escapeHtml(prediction.label || "Neutral")} · ${formatScore100(prediction.score)} · ${escapeHtml(prediction.horizon || "20 trading days")} · ${escapeHtml(prediction.confidenceLabel || "confidence limited")}.</p>
    ${(prediction.topDrivers || []).length ? list((prediction.topDrivers || []).slice(0, 3)) : ""}
    <p class="alpha-rank-footnote">${escapeHtml(prediction.guardrail || "Decision support only; not a valuation target or order instruction.")}</p>
  `;
}

function stockPredictionFromSignal(signal = {}) {
  return {
    modelVersion: signal.stockPredictionModelVersion,
    horizon: signal.stockPredictionHorizon,
    score: Number(signal.stockPredictionScore) || 0,
    rawScore: Number(signal.stockPredictionRawScore) || 0,
    label: signal.stockPredictionLabel || "",
    direction: signal.stockPredictionDirection || "",
    confidence: Number(signal.stockPredictionConfidence) || 0,
    confidenceLabel: signal.stockPredictionConfidenceLabel || "",
    sourceMode: signal.stockPredictionSourceMode || "",
    securityKind: signal.stockPredictionSecurityKind || "",
    summary: signal.stockPredictionSummary || "",
    factors: signal.stockPredictionFactors || [],
    topDrivers: signal.stockPredictionTopDrivers || [],
    weakSignals: signal.stockPredictionWeakSignals || [],
    caveats: signal.stockPredictionCaveats || [],
    recommendations: signal.stockPredictionNextChecks || [],
    guardrail: signal.stockPredictionGuardrail || "",
    generatedAt: signal.updatedAt || signal.marketDataFetchedAt || signal.marketDataAsOf || ""
  };
}

function predictionBadgeClass(prediction = {}) {
  const score = Number(prediction.score) || 0;
  if (score >= 72) return "safe";
  if (score >= 58) return "positive-signal";
  if (score >= 44) return "monitor";
  return "sample";
}

function normalizedAcademicCompositeScore(signal = {}, fallbackScore = 0) {
  const explicitScore = Number(signal.institutionalQuantAcademicCompositeScore);
  if (Number.isFinite(explicitScore) && explicitScore > 0) return Math.max(0, Math.min(100, explicitScore));
  const quantScore = Number(signal.institutionalQuantScore);
  if (Number.isFinite(quantScore) && quantScore > 0) return Math.max(0, Math.min(100, quantScore));
  return Math.max(0, Math.min(100, Number(fallbackScore) || 0));
}

function alphaQuantLensIntegratedScore({
  quantScore = 0,
  academicCompositeScore = 0,
  dataQualityScore = 0,
  validationWarnings = []
} = {}) {
  const quant = Math.max(0, Math.min(100, Number(quantScore) || 0));
  const academic = Math.max(0, Math.min(100, Number(academicCompositeScore) || 0));
  const coverage = score01(dataQualityScore);
  const validationPenalty = Math.min(10, (validationWarnings || []).length * 2.5);
  const coveragePenalty = coverage < 0.45 ? 8 : coverage < 0.6 ? 3 : 0;
  return Math.round(Math.max(0, Math.min(100, quant * 0.58 + academic * 0.42 - validationPenalty - coveragePenalty)));
}

function alphaFactorDisciplineLine(score = 0, factors = [], validationWarnings = []) {
  const numericScore = Math.max(0, Math.min(100, Number(score) || 0));
  const label = numericScore >= 75 ? "strong factor discipline" : numericScore >= 60 ? "usable factor discipline" : "thin factor evidence";
  const factorCount = (factors || []).filter((factor) => factor?.label).length;
  const coverage = factorCount ? `${factorCount} factor check${factorCount === 1 ? "" : "s"}` : "factor checks missing";
  const warning = (validationWarnings || []).length ? "validation warning present" : "validation guardrails clear";
  return `${formatScore100(numericScore)} · ${label} · ${coverage}; ${warning}`;
}

function renderAcademicFactorMiniList(factors = []) {
  const visible = (factors || [])
    .filter((factor) => factor?.label)
    .sort((a, b) => Number(b.weightedPoints || 0) - Number(a.weightedPoints || 0) || Number(b.score || 0) - Number(a.score || 0))
    .slice(0, 4);
  if (!visible.length) return "<span>No quant factor diagnostics loaded yet.</span>";
  return `<ul class="alpha-factor-list">${visible.map((factor) => `
    <li>
      <b>${escapeHtml(factor.label)} · ${formatScore100(factor.score)}</b>
      <span>${escapeHtml(factor.paper || factor.coverageStatus || "Factor evidence")}</span>
      <small>${escapeHtml(factor.driver || factor.methodology || "No factor driver supplied.")}</small>
    </li>
  `).join("")}</ul>`;
}

function renderAlphaQualityScoreBreakdown(items = []) {
  const visible = (items || []).filter((item) => item?.label);
  if (!visible.length) return "<span>No score component details loaded yet.</span>";
  const finalScore = Math.round(Math.max(0, Math.min(100, visible.reduce((total, item) => total + (Number(item.points) || 0), 0))));
  return `<span class="alpha-rank-footnote">Final quality = ${escapeHtml(finalScore)}/100 from weighted components and penalties.</span><ul class="alpha-factor-list alpha-score-breakdown">${visible.map((item) => {
    const points = Number(item.points) || 0;
    const sign = points > 0 ? "+" : "";
    return `
      <li>
        <b>${escapeHtml(item.label)} · ${sign}${points.toFixed(1)} pts</b>
        <span>${Math.round(score01(item.score) * 100)}/100 input · ${Math.round(Math.abs(Number(item.weight) || 0) * 100)}% ${points < 0 ? "penalty" : "weight"}</span>
      </li>
    `;
  }).join("")}</ul>`;
}

function renderAlphaReviewPriorityBreakdown(breakdown = {}) {
  if (!breakdown || !Number.isFinite(Number(breakdown.score))) {
    return "<span>No review-priority math loaded yet.</span>";
  }
  const rankMath = breakdown.recommendationMath || {};
  const contributors = (rankMath.topContributors?.length ? rankMath.topContributors : rankMath.components || []).slice(0, 4);
  const penalties = (rankMath.penalties || []).filter((penalty) => Number(penalty.points));
  return `
    <span class="alpha-rank-footnote">Review priority = max(ticker signal ${formatScore100(breakdown.signalScore)}, top recommendation ${formatScore100(breakdown.recommendationScore)}). It does not lift quality.</span>
    <ul class="alpha-factor-list alpha-score-breakdown">
      <li>
        <b>${escapeHtml(titleCase(breakdown.source || "review priority"))} · ${formatScore100(breakdown.score)}</b>
        <span>${escapeHtml(breakdown.recommendationTitle || "Ticker signal only")}</span>
      </li>
      ${contributors.map((component) => {
        const points = Number(component.points) || 0;
        return `
          <li>
            <b>${escapeHtml(component.label)} · +${points.toFixed(1)} pts</b>
            <span>${Math.round(score01(component.score) * 100)}/100 input · ${Math.round(Math.abs(Number(component.weight) || 0) * 100)}% weight</span>
          </li>
        `;
      }).join("")}
      ${penalties.map((penalty) => `
        <li>
          <b>${escapeHtml(penalty.label)} · ${Number(penalty.points).toFixed(1)} pts</b>
          <span>Subtracted after weighted recommendation drivers.</span>
        </li>
      `).join("")}
    </ul>
  `;
}

function alphaReviewPriorityBreakdown(signal = {}, recommendations = []) {
  const signalScore = Math.max(0, Math.min(100, Number(signal.combinedScore) || 0));
  const rankedRecommendations = (recommendations || [])
    .map((recommendation) => ({
      recommendation,
      score: Math.max(0, Math.min(100, Number(recommendation.compositeRankScore) || 0))
    }))
    .sort((left, right) => right.score - left.score);
  const topRecommendation = rankedRecommendations[0] || null;
  const recommendationScore = topRecommendation?.score || 0;
  const recommendation = topRecommendation?.recommendation || null;
  const score = Math.max(signalScore, recommendationScore, 0);
  const usesRecommendation = recommendationScore >= signalScore && recommendationScore > 0;
  return {
    score,
    source: usesRecommendation ? "top recommendation" : signalScore > 0 ? "ticker signal" : "none",
    signalScore,
    recommendationScore,
    recommendationTitle: recommendation?.title || "",
    recommendationType: recommendation?.recommendationType || "",
    recommendationMath: recommendation?.rankMath || null
  };
}

function groupRecommendationsByTicker(recommendations = []) {
  const grouped = new Map();
  for (const recommendation of recommendations) {
    const ticker = normalizeTickerSymbol(recommendation.ticker);
    if (!ticker) continue;
    const rows = grouped.get(ticker) || [];
    rows.push(recommendation);
    grouped.set(ticker, rows);
  }
  return grouped;
}

function alphaHoldingRowMatchesFilter(row = {}, filter = "all") {
  const normalized = filter || "all";
  if (normalized === "all" || normalized === "owned") return true;
  if (normalized === "watchlist") return Boolean(row.watchlistLinked);
  if (normalized === "risk") return row.riskPenaltyScore >= 0.55 || /review|trim|risk/i.test(row.postureLabel);
  if (normalized === "opportunities") return row.qualityScore >= 68 && row.riskPenaltyScore < 0.7;
  if (normalized === "data-issues") return row.dataQualityScore < 0.45 || row.missingWeakSignals.length >= 2 || /weak data/i.test(row.postureLabel);
  if (normalized === "recent") return row.recommendations.some((recommendation) => Number(recommendation.recencyScore) >= 0.72) || /live|cached|imported/i.test(row.dataLabel);
  if (normalized === "high-confidence") return row.confidenceScore >= 0.68 || row.qualityScore >= 75;
  return true;
}

function alphaQuantScore(holding = {}, signal = {}) {
  const signalScore = Number(signal.institutionalQuantScore);
  if (Number.isFinite(signalScore) && signalScore > 0) return Math.max(0, Math.min(100, signalScore));
  const saQuant = Number(holding.quant);
  if (Number.isFinite(saQuant) && saQuant > 0) return Math.max(0, Math.min(100, (saQuant / 5) * 100));
  return 50;
}

function thesisQualityScore(status = "", confidence = "") {
  const text = `${status} ${confidence}`.toLowerCase();
  let score = 58;
  if (/supported|active|current|strong/.test(text)) score = 78;
  if (/mixed|needs review|stale/.test(text)) score = 48;
  if (/missing|contradicted|breaking/.test(text)) score = 28;
  if (/high/.test(text)) score += 6;
  if (/low|weak/.test(text)) score -= 8;
  return Math.max(0, Math.min(100, score));
}

function alphaDataQualityScore(signal = {}, recommendations = []) {
  const coverage = score01(Number(signal.institutionalQuantDataCoverageScore) / 100);
  const confidence = score01(Number(signal.institutionalQuantConfidenceScore) / 100);
  const recommendationQuality = maxRecommendationScore(recommendations, "dataQualityScore");
  const availableInputs = [
    coverage > 0 ? coverage : null,
    confidence > 0 ? confidence * 0.9 : null,
    recommendationQuality > 0 ? recommendationQuality : null
  ].filter((value) => Number.isFinite(value));
  const weakDataFlags = [
    ...(signal.institutionalQuantMissingData || []),
    ...(signal.institutionalQuantDataSufficiencyWarnings || []),
    ...(signal.missingData || []),
    ...(signal.warnings || []),
    ...recommendations.flatMap((recommendation) => recommendation.missingWeakSignals || [])
  ].length;
  const fallback = recommendations.length ? 0.42 : 0.32;
  const bestAvailable = availableInputs.length ? Math.max(...availableInputs) : fallback;
  const penalty = Math.min(0.22, weakDataFlags * 0.035);
  return score01(bestAvailable - penalty);
}

function alphaSupportScore(signal = {}, recommendations = []) {
  const positiveTypes = new Set(["possible add", "add to watchlist", "investigate", "watch"]);
  const support = recommendations.reduce((best, recommendation) => {
    const typeBoost = positiveTypes.has(recommendation.recommendationType) ? 0.12 : 0;
    const score = score01(recommendation.confidenceScore) * 0.55 + score01(recommendation.impactScore) * 0.33 + typeBoost;
    return Math.max(best, score);
  }, 0);
  const combined = score01((Number(signal.combinedScore) || 0) / 100);
  const quantConfidence = score01((Number(signal.institutionalQuantConfidenceScore) || 0) / 100);
  return Math.max(support, combined * 0.55, quantConfidence * 0.75, recommendations.length ? 0.42 : 0.32);
}

function alphaPriceScore(signal = {}, holding = {}) {
  const momentum = score01(signal.priceMomentumScore);
  const relative = score01(signal.relativeStrengthScore);
  const dailyMove = score01(0.5 + Math.max(-0.08, Math.min(0.08, Number(signal.marketDataDailyChangePercent ?? holding.dailyChangePercent ?? 0))) * 3);
  return Math.max(momentum, relative * 0.9, dailyMove);
}

function alphaSourceFreshnessScore(signal = {}, recommendations = [], uiState = "SAMPLE_MODE") {
  const recFreshness = maxRecommendationScore(recommendations, "sourceFreshnessScore");
  const sourceText = `${signal.marketDataStatus || ""} ${signal.marketDataMode || ""} ${signal.sourceMode || ""} ${signal.marketDataLabel || ""} ${signal.institutionalQuantSourceFreshness || ""}`.toLowerCase();
  if (/error|failed|not configured|missing/.test(sourceText)) return Math.max(0.22, Math.min(recFreshness || 0, 0.34));
  if (/stale/.test(sourceText)) return Math.max(0.3, Math.min(Math.max(recFreshness, 0.3), 0.46));
  if (/mock|sample|demo/.test(sourceText) || !isImportedState(uiState)) return Math.max(0.38, Math.min(Math.max(recFreshness, 0.38), 0.52));
  if (signal.liveProviderCalls) return Math.max(0.82, recFreshness);
  if (/cached|imported/.test(sourceText)) return Math.max(0.66, recFreshness);
  if (isImportedState(uiState)) return Math.max(0.58, recFreshness);
  return Math.max(0.38, recFreshness);
}

function alphaQualityScoreBreakdown({
  quantLensScore = 0,
  thesisScore = 0,
  dataQualityScore = 0,
  sourceFreshnessScore = 0,
  supportScore = 0,
  priceScore = 0,
  riskPenaltyScore = 0
} = {}) {
  return [
    { label: "Quant Lens", weight: 0.46, score: score01(quantLensScore / 100), points: score01(quantLensScore / 100) * 46 },
    { label: "Thesis", weight: 0.15, score: score01(thesisScore / 100), points: score01(thesisScore / 100) * 15 },
    { label: "Data coverage", weight: 0.13, score: score01(dataQualityScore), points: score01(dataQualityScore) * 13 },
    { label: "Freshness", weight: 0.09, score: score01(sourceFreshnessScore), points: score01(sourceFreshnessScore) * 9 },
    { label: "Signal support", weight: 0.08, score: score01(supportScore), points: score01(supportScore) * 8 },
    { label: "Price trend", weight: 0.05, score: score01(priceScore), points: score01(priceScore) * 5 },
    { label: "Risk penalty", weight: -0.13, score: score01(riskPenaltyScore), points: score01(riskPenaltyScore) * -13 }
  ];
}

function alphaRiskPenaltyScore(holding = {}, signal = {}, recommendations = []) {
  const positionRisk = Math.min(1, Math.max(0, ((Number(holding.portfolioWeight) || 0) - 0.08) / 0.18));
  const leverageRisk = holding.isLeveragedEtf || signal.isLeveragedEtf ? Math.min(1, Math.abs(Number(holding.leveragedMultiple || signal.leveragedMultiple || 2)) / 3) : 0;
  const concentration = score01(signal.concentrationRiskScore);
  const recRisk = recommendations.reduce((best, recommendation) => {
    const typeRisk = ["trim risk", "possible exit/reduce", "review position"].includes(recommendation.recommendationType) ? 0.7 : 0;
    return Math.max(best, score01(recommendation.riskScore), score01(recommendation.concentrationRiskScore), typeRisk);
  }, 0);
  const qualitativeRisk = riskRank(holding.riskLevel) / 4;
  return Math.max(concentration, recRisk, leverageRisk, positionRisk * 0.75, qualitativeRisk * 0.65);
}

function alphaHoldingPosture({ qualityScore = 0, holding = {}, recommendations = [], dataQualityScore = 0, riskPenaltyScore = 0 }) {
  const hasExitRisk = recommendations.some((recommendation) => ["trim risk", "possible exit/reduce"].includes(recommendation.recommendationType));
  const leveraged = holding.isLeveragedEtf || Math.abs(Number(holding.leveragedMultiple || 0)) > 1;
  if (dataQualityScore < 0.38) return { label: "Weak data", className: "low-signal" };
  if (qualityScore >= 82) return { label: riskPenaltyScore >= 0.65 ? "Strong / size watch" : "Strong", className: "safe" };
  if (qualityScore >= 68) return { label: riskPenaltyScore >= 0.65 ? "Constructive / risk watch" : "Constructive", className: "positive-signal" };
  if (hasExitRisk || leveraged || (riskPenaltyScore >= 0.82 && qualityScore < 50)) return { label: "Risk review", className: "medium" };
  if (qualityScore >= 55) return { label: riskPenaltyScore >= 0.55 ? "Watch risk" : "Watch", className: "monitor" };
  if (qualityScore >= 42) return { label: "Review", className: "medium" };
  return { label: "Weak", className: "low-signal" };
}

function alphaHoldingRankReasons({ holding = {}, signal = {}, recommendations = [], qualityScore = 0, qualityCap = 100, quantScore = 0, quantLensScore = 0, thesisScore = 0, dataQualityScore = 0, supportScore = 0, riskPenaltyScore = 0, sourceFreshnessScore = 0, uiState = "SAMPLE_MODE" }) {
  const reasons = [];
  if (qualityCap < 100) reasons.push(`Evidence cap limits quality score to ${qualityCap}/100 until missing or stale inputs improve.`);
  if (quantLensScore >= 75) reasons.push("The integrated Quant Lens is lifting the Alpha quality rank.");
  if (quantLensScore < 45) reasons.push("Weak or missing Quant Lens evidence is holding the Alpha rank down.");
  if (Number(signal.institutionalQuantAcademicCompositeScore) >= 72) reasons.push("Academic factor discipline supports the rank.");
  if ((signal.institutionalQuantAcademicValidationWarnings || []).length) reasons.push("Academic validation warnings limit confidence in the rank.");
  if (thesisScore >= 70) reasons.push("Thesis status supports the position.");
  if (thesisScore < 45) reasons.push("Thesis is missing, stale, or needs review.");
  if (dataQualityScore >= 0.7) reasons.push("Data coverage is useful enough for decision support.");
  if (dataQualityScore < 0.45) reasons.push("Lower confidence because source coverage is weak or missing.");
  if (supportScore >= 0.68) reasons.push("Supporting signals agree strongly enough to improve the rank.");
  if ((Number(holding.portfolioWeight) || 0) >= 0.1) reasons.push(`High impact because this is ${formatPct(holding.portfolioWeight)} of the portfolio.`);
  if (riskPenaltyScore >= 0.65) reasons.push("Risk penalty is elevated because of size, leverage, concentration, or review alerts.");
  if (sourceFreshnessScore < 0.45) reasons.push("Source freshness is weak, stale, sample, or not configured.");
  if ((Number(signal.marketDataDailyChangePercent) || 0) > 0.02) reasons.push("Recent price action is positive in the available market data.");
  if (recommendations.some((recommendation) => recommendation.recommendationType === "stale data review")) reasons.push("A stale-data recommendation reduces trust in the rank.");
  if (!isImportedState(uiState)) reasons.push("Sample context: import Tucker's real holdings before treating the rank as portfolio-specific.");
  if (!reasons.length) reasons.push(`Balanced ${qualityScore}/100 quality rank from available quant, thesis, risk, source coverage, and freshness inputs.`);
  return uniqueInInputOrder(reasons).slice(0, 7);
}

function alphaRiskLabel(holding = {}, signal = {}, recommendations = [], riskPenaltyScore = 0) {
  if (holding.isLeveragedEtf || signal.isLeveragedEtf) return "Leveraged exposure";
  if (recommendations.some((recommendation) => ["trim risk", "possible exit/reduce"].includes(recommendation.recommendationType))) return "Review risk";
  if (riskPenaltyScore >= 0.7) return "Elevated risk";
  if (riskPenaltyScore >= 0.45) return "Moderate risk";
  return holding.riskLevel || "Normal";
}

function alphaDataLabel(signal = {}, recommendations = [], dataQualityScore = 0, uiState = "SAMPLE_MODE") {
  if (signal.liveProviderCalls) return "Live/cached provider inputs";
  if (recommendations.some((recommendation) => /stale|error|missing|not configured/i.test(recommendation.sourceFreshness || ""))) return "Source issue";
  if (isImportedState(uiState)) return dataQualityScore >= 0.55 ? "Imported/local inputs" : "Imported with gaps";
  return "Sample/local inputs";
}

function alphaScoreClass(score = 0) {
  if (score >= 82) return "safe";
  if (score >= 68) return "positive-signal";
  if (score >= 55) return "monitor";
  if (score >= 42) return "medium";
  return "low-signal";
}

function maxRecommendationScore(recommendations = [], key = "") {
  return recommendations.reduce((best, recommendation) => Math.max(best, score01(recommendation[key])), 0);
}

function score01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

function alphaRecommendationFilterLabel(filter = "all") {
  return ({
    all: "All holdings",
    owned: "Owned holdings",
    watchlist: "Watchlist-linked",
    risk: "Needs review",
    opportunities: "Strong / constructive",
    "data-issues": "Weak data",
    recent: "Recent inputs",
    "high-confidence": "High confidence"
  })[filter] || "All holdings";
}

function recommendationMetric(label, value) {
  return `<div><span>${escapeHtml(label)}</span><b>${formatScore(value)}</b></div>`;
}

function recommendationClass(recommendation = {}) {
  if (recommendation.recommendationType === "possible exit/reduce" || recommendation.recommendationType === "trim risk") return "high";
  if (recommendation.recommendationType === "review position" || recommendation.urgencyScore >= 0.72) return "medium";
  if (recommendation.recommendationType === "stale data review" || recommendation.dataQualityScore < 0.45) return "low-signal";
  if (recommendation.recommendationType === "possible add" || recommendation.recommendationType === "add to watchlist") return "positive-signal";
  return "monitor";
}

function dataQualityBadgeClass(recommendation = {}) {
  if (recommendation.dataQualityScore < 0.35 || /stale|missing|error|not configured/i.test(recommendation.sourceFreshness || "")) return "sample";
  if (/mock/i.test(recommendation.sourceFreshness || "")) return "demo";
  return "safe";
}

function renderAlphaSignalCard(signal, extraClass = "") {
  const exposure = buildAffectedExposureSummary(signal, signal.affectedHoldings || []);
  const actionCategory = signalActionCategory(signal);
  const monitorItems = (signal.whatToMonitorNext || []).slice(0, 3);
  return `
      <article class="alpha-card ${escapeHtml(actionCategory.toLowerCase().replaceAll(" ", "-"))} ${signal.isLowSignal ? "low-signal" : ""} ${extraClass}">
        <div class="alpha-card-head">
          <div>
            <div class="badge-row">
              <span class="status-badge">${escapeHtml(signal.eventType || "event")}</span>
              <span class="status-badge">${escapeHtml(`Confidence ${formatScore(signal.confidenceScore)}`)}</span>
              <span class="status-badge demo">Sample scenario</span>
              <span class="status-badge action">${escapeHtml(actionCategory)}</span>
            </div>
            <h3>${escapeHtml(signal.headline)}</h3>
          </div>
          ${renderAffectedExposureSummary(exposure)}
        </div>
        <div class="alpha-decision">
          <div>
            <b>Suggested review</b>
            <span>${escapeHtml(actionTextForSignal(signal, actionCategory))}</span>
          </div>
          <div>
            <b>Next check</b>
            ${monitorItems.length ? `<ul>${monitorItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : `<span>${escapeHtml(signal.nextReviewQuestion || "Monitor for confirmation.")}</span>`}
          </div>
        </div>
        ${signal.isLowSignal ? `<p class="noise-filter"><b>Noise filter:</b> ${escapeHtml(signal.noActionRecommendation ? `${signal.actionLabel}: ${signal.actionabilityReason}` : `Evidence grade ${signal.evidenceGrade}; confirm before acting.`)}</p>` : ""}
        <p class="tucker-readthrough"><b>Why this matters to Tucker:</b> ${escapeHtml(signal.whyThisMattersToTucker || "No portfolio-specific read-through supplied.")}</p>
        <div class="alpha-quick-facts">
          <span>${escapeHtml(exposure.impactTypeLabel)}</span>
          <span>Exposure ${escapeHtml(exposure.compactValueLabel)}</span>
          <span>Evidence ${escapeHtml(signal.evidenceGrade)}</span>
          <span>Thesis: ${escapeHtml(signal.thesisImpact)}</span>
        </div>
        ${sourceLinks(signal)}
        <details class="signal-details">
          <summary>Dive deeper: evidence, mechanism, and scoring</summary>
          <p><b>What changed:</b> ${escapeHtml(signal.whatChanged || signal.factualClaim || signal.summary)}</p>
          <p><b>Why it matters:</b> ${escapeHtml(signal.whyItMatters || signal.interpretation || "No interpretation supplied.")}</p>
          <p><b>Mechanism:</b> ${escapeHtml(signal.businessMechanism || signal.mechanism || "No clear business mechanism supplied.")}</p>
          <p><b>Price action:</b> ${escapeHtml(signal.priceAction?.status || "unknown")} - ${escapeHtml(signal.priceAction?.explanation || "No price-action context available.")}</p>
          <div class="alpha-grid compact">
            <div><b>Materiality</b><span>${formatScore(signal.materialityScore)}</span></div>
            <div><b>Portfolio relevance</b><span>${formatScore(signal.portfolioRelevanceScore)}</span></div>
            <div><b>Source</b><span>${escapeHtml(signal.sourceName || "Demo")}</span></div>
          </div>
          <div class="evidence-columns">
            <div><b>Supporting</b>${list(signal.supportingEvidence)}</div>
            <div><b>Contradicting</b>${list(signal.contradictingEvidence || signal.counterarguments)}</div>
            <div><b>Missing</b>${list(signal.missingEvidence)}</div>
          </div>
          <div class="evidence-columns two-col">
            <div><b>What could prove this wrong</b>${list(signal.whatCouldProveWrong)}</div>
            <div><b>What to monitor next</b>${list(signal.whatToMonitorNext)}</div>
          </div>
          <p><b>Review prompt:</b> ${escapeHtml(signal.actionabilityReason)}</p>
          <p><b>Position sizing:</b> ${escapeHtml(signal.positionSizingCheck || "Review against target allocation and conviction.")}</p>
          <p><b>Next question:</b> ${escapeHtml(signal.nextReviewQuestion)}</p>
        </details>
      </article>
    `;
}

function sourceLinks(signal) {
  const links = signal.sourceLinks || [];
  if (!links.length) return '<div class="news-links"><span>No source links available in demo mode.</span></div>';
  return `
    <div class="news-links">
      <b>News and research links</b>
      ${links.map((link) => `<a href="${escapeHtml(safeExternalHref(link.url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label)}</a>`).join("")}
    </div>
  `;
}

export function buildAffectedExposureSummary(signal = {}, holdings = []) {
  const requestedTickers = new Set([
    ...(signal.affectedTickers || []),
    ...(signal.inferredTickersAffected || []),
    ...(signal.affectedHoldings || []).map((holding) => holding.ticker)
  ].filter(Boolean).map(normalizeTicker));
  const rows = holdings.filter((holding) => {
    const ticker = normalizeTicker(holding.ticker);
    return !requestedTickers.size || requestedTickers.has(ticker);
  });
  const byTicker = new Map();
  rows.forEach((holding) => {
    const ticker = normalizeTicker(holding.ticker) || "UNKNOWN";
    const current = byTicker.get(ticker) || {
      ticker,
      marketValue: 0,
      weight: 0
    };
    current.marketValue += Number(holding.marketValue) || 0;
    current.weight += Number(holding.portfolioWeight || holding.weight) || 0;
    byTicker.set(ticker, current);
  });
  const ordered = [...byTicker.values()].sort((a, b) => b.marketValue - a.marketValue || a.ticker.localeCompare(b.ticker));
  const visible = ordered.slice(0, 6).map((row) => row.ticker);
  const hiddenCount = Math.max(0, ordered.length - visible.length);
  const value = ordered.reduce((total, row) => total + row.marketValue, 0);
  return {
    compactValueLabel: formatCompact(value),
    uniqueTickers: ordered.map((row) => row.ticker),
    visibleTickers: visible,
    hiddenCount,
    impactTypeLabel: impactTypeLabel(signal)
  };
}

export function renderAffectedExposureSummary(summary) {
  return `
    <aside class="affected-exposure">
      <span>Affected exposure</span>
      <b>${escapeHtml(summary.compactValueLabel)}</b>
      <div class="ticker-chips">
        ${renderTickerChips(summary.visibleTickers)}
        ${summary.hiddenCount ? `<span>+${summary.hiddenCount} more</span>` : ""}
      </div>
      <small>${escapeHtml(summary.impactTypeLabel)}</small>
    </aside>
  `;
}

function impactTypeLabel(signal = {}) {
  const explicit = signal.impactTypeLabel || signal.impactType;
  if (explicit) return titleCase(String(explicit).replace("-", " "));
  const category = String(signal.category || signal.eventType || "").toLowerCase();
  if (category.includes("theme") || category.includes("customer demand") || category.includes("ai demand")) return "Theme/direct";
  if (category.includes("risk") || category.includes("macro") || category.includes("leveraged")) return "Direct";
  if (category.includes("supply") || category.includes("competitor") || category.includes("labor")) return "Second-order";
  return "Portfolio read-through";
}

function actionTextForSignal(signal, actionCategory) {
  if (actionCategory === "Positive Signal") {
    return "Supports thesis; no urgent action. Watch whether estimates and price action confirm it.";
  }
  if (actionCategory === "Monitor") {
    return signal.actionabilityReason?.replace(/^Review now\.\s*/i, "Monitor. ") || "Monitor; do not treat this as an automatic buy or sell signal.";
  }
  return signal.actionabilityReason || "Review the evidence before changing position size.";
}

function renderHoldingsTable(holdings, uiState = "SAMPLE_MODE") {
  const target = byId("portfolioHoldingsRows");
  if (!target) return;
  const sampleRow = isImportedState(uiState) ? "" : `
    <tr class="sample-row">
      <td colspan="23"><b>Sample holdings only.</b> Import a Fidelity CSV to replace these with Tucker’s real account-level rows.</td>
    </tr>
  `;
  target.innerHTML = holdings.length
    ? `${sampleRow}${holdings.map((holding) => `
      <tr>
        <th scope="row"><b>${renderTickerLink(holding.ticker)}</b><span>${escapeHtml(holding.name)}</span></th>
        <td>${escapeHtml(holding.account)}</td>
        <td>${formatNumber(holding.shares)}</td>
        <td>${formatCurrency(holding.marketDataPrice || holding.price)}${renderHoldingMarketDataTag(holding, "quote")}</td>
        <td>${formatCurrency(holding.marketValue)}</td>
        <td>${formatPct(holding.portfolioWeight)}</td>
        <td>${formatCurrency(holding.costBasis)}</td>
        <td class="${holding.unrealizedGainPercent >= 0 ? "positive" : "negative"}">${formatPct(holding.unrealizedGainPercent)}</td>
        <td class="${holding.dailyChange >= 0 ? "positive" : "negative"}">${formatSignedCurrency(holding.dailyChange)}${renderHoldingMarketDataTag(holding, holding.marketDataAppliedToDailyChange ? "move" : "quote")}</td>
        <td>${formatPct(holding.targetWeight)}</td>
        <td class="${holding.drift >= 0 ? "negative" : "positive"}">${formatSignedPct(holding.drift)}</td>
        <td>${escapeHtml(holding.sector)}</td>
        <td>${escapeHtml(holding.assetClass)}</td>
        <td><span class="pill neutral">${escapeHtml(holding.thesisStatus)}</span></td>
        <td><span class="pill ${riskClass(holding.riskLevel)}">${escapeHtml(holding.riskLevel)}</span></td>
        <td>${holding.quant ? number.format(holding.quant) : "--"}</td>
        <td>${escapeHtml(holding.valuationGrade || "--")}</td>
        <td>${escapeHtml(holding.growthGrade || "--")}</td>
        <td>${escapeHtml(holding.profitabilityGrade || "--")}</td>
        <td>${escapeHtml(holding.momentumGrade || "--")}</td>
        <td>${escapeHtml(holding.revisionsGrade || "--")}</td>
        <td>${holding.dividendYield ? formatPct(holding.dividendYield) : "--"}</td>
        <td>${escapeHtml(holding.nextEarnings || "--")}</td>
      </tr>
    `).join("")}`
    : '<tr><td colspan="23" class="empty">No holdings match the current filters.</td></tr>';
}

export function prepareHoldingsForView(holdings, viewMode = "account") {
  if (viewMode !== "ticker") return holdings;
  const grouped = new Map();
  for (const holding of holdings) {
    const key = holding.ticker || "UNKNOWN";
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, {
        ...holding,
        accounts: new Set([holding.account]),
        marketValue: Number(holding.marketValue) || 0,
        costBasis: Number(holding.costBasis) || 0,
        dailyChange: Number(holding.dailyChange) || 0,
        shares: Number(holding.shares) || 0,
        portfolioWeight: Number(holding.portfolioWeight) || 0,
        targetWeight: Number(holding.targetWeight) || 0,
        targetWeightValues: [Number(holding.targetWeight) || 0],
        riskRank: riskRank(holding.riskLevel)
      });
      continue;
    }
    current.accounts.add(holding.account);
    current.marketValue += Number(holding.marketValue) || 0;
    current.costBasis += Number(holding.costBasis) || 0;
    current.dailyChange += Number(holding.dailyChange) || 0;
    current.shares += Number(holding.shares) || 0;
    current.portfolioWeight += Number(holding.portfolioWeight) || 0;
    current.targetWeightValues.push(Number(holding.targetWeight) || 0);
    current.targetWeight = Math.max(current.targetWeight, Number(holding.targetWeight) || 0);
    if (riskRank(holding.riskLevel) > current.riskRank) {
      current.riskRank = riskRank(holding.riskLevel);
      current.riskLevel = holding.riskLevel;
    }
    current.thesisStatus = current.thesisStatus === holding.thesisStatus ? current.thesisStatus : "Mixed";
  }

  return [...grouped.values()]
    .map((holding) => ({
      ...holding,
      account: `Grouped across ${holding.accounts.size} account${holding.accounts.size === 1 ? "" : "s"}`,
      price: holding.shares ? holding.marketValue / holding.shares : holding.price,
      unrealizedGainPercent: holding.costBasis ? (holding.marketValue - holding.costBasis) / holding.costBasis : 0,
      targetWeight: Math.max(...(holding.targetWeightValues || [holding.targetWeight || 0])),
      targetWeightValues: undefined,
      drift: holding.portfolioWeight - holding.targetWeight
    }))
    .sort((a, b) => b.marketValue - a.marketValue);
}

export function sortHoldingsForView(holdings = [], sortKey = "marketValue", sortDirection = -1) {
  const direction = Number(sortDirection) === 1 ? 1 : -1;
  const key = sortKey || "marketValue";
  return [...holdings].sort((left, right) => {
    const comparison = compareHoldingValues(sortValue(left, key), sortValue(right, key), key);
    if (comparison !== 0) return comparison * direction;
    return String(left.ticker || "").localeCompare(String(right.ticker || "")) ||
      String(left.account || "").localeCompare(String(right.account || ""));
  });
}

function sortValue(holding = {}, key = "") {
  if (key === "name") return holding.name || holding.company || "";
  if (key === "price") return holding.marketDataPrice || holding.price;
  if (key === "riskLevel") return riskRank(holding.riskLevel);
  if (key === "nextEarnings") {
    const time = holding.nextEarnings ? new Date(`${holding.nextEarnings}T12:00:00`).getTime() : Number.POSITIVE_INFINITY;
    return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
  }
  return holding[key];
}

function compareHoldingValues(left, right, key = "") {
  const numericKeys = new Set([
    "shares",
    "price",
    "marketValue",
    "portfolioWeight",
    "costBasis",
    "unrealizedGainPercent",
    "dailyChange",
    "targetWeight",
    "drift",
    "quant",
    "dividendYield",
    "nextEarnings",
    "riskLevel"
  ]);
  if (numericKeys.has(key)) {
    const leftNumber = numericSortValue(left);
    const rightNumber = numericSortValue(right);
    return leftNumber - rightNumber;
  }
  return String(left ?? "").localeCompare(String(right ?? ""), undefined, { numeric: true, sensitivity: "base" });
}

function numericSortValue(value) {
  const numeric = Number(value);
  if (numeric === Number.POSITIVE_INFINITY || numeric === Number.NEGATIVE_INFINITY) return numeric;
  if (Number.isFinite(numeric)) return numeric;
  return Number.NEGATIVE_INFINITY;
}

function renderTargetAllocations(plan, targetAllocations = [], uiState = "SAMPLE_MODE") {
  const target = byId("targetAllocationsPanel");
  if (!target) return;
  if (!isImportedState(uiState)) {
    target.innerHTML = `
      <div class="empty">
        <strong>No real portfolio loaded yet.</strong>
        <span>Import a Fidelity CSV before setting target allocations so current weights come from Tucker's actual accounts.</span>
      </div>
    `;
    return;
  }
  if (!plan?.rows?.length) {
    target.innerHTML = '<div class="empty"><strong>No target rows available.</strong><span>Use the default template or import target JSON to begin.</span></div>';
    return;
  }
  const rows = plan.rows;
  const tickerRows = rows.filter((row) => row.scope === "ticker");
  const scopeRows = rows.filter((row) => row.scope !== "ticker");
  target.innerHTML = `
    <div class="target-summary-grid">
      ${targetMetric("Saved targets", targetAllocations.length)}
      ${targetMetric("Current value", formatCurrency(plan.totalValue))}
      ${targetMetric("Rows shown", rows.length)}
      ${targetMetric("Largest drift", largestDriftLabel(rows))}
    </div>
    <div class="target-table-wrap">
      <table class="target-table">
        <thead>
          <tr>
            <th>Scope</th>
            <th>Target</th>
            <th>Current</th>
            <th>Target %</th>
            <th>Min %</th>
            <th>Max %</th>
            <th>Drift</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          ${tickerRows.map(renderTargetRow).join("")}
          ${scopeRows.length ? `<tr class="target-section-row"><td colspan="10">Portfolio lenses</td></tr>${scopeRows.map(renderTargetRow).join("")}` : ""}
        </tbody>
      </table>
    </div>
  `;
}

function renderTargetRow(row) {
  const label = `${scopeLabel(row.scope)} ${row.key}`;
  const accessibleLabel = escapeHtml(label);
  return `
    <tr data-target-row data-scope="${escapeHtml(row.scope)}" data-key="${escapeHtml(row.key)}">
      <td><span class="scope-chip">${escapeHtml(scopeLabel(row.scope))}</span></td>
      <td><b>${row.scope === "ticker" ? renderTickerLink(row.key) : escapeHtml(row.key)}</b><small>${row.accounts.length ? escapeHtml(row.accounts.slice(0, 2).join(", ")) : "No current holding"}</small></td>
      <td class="number-cell">${formatCurrency(row.currentValue)}<small>${formatPct(row.currentWeight)}</small></td>
      <td><input data-target-field="targetWeight" type="number" min="0" max="100" step="0.1" value="${toPercentInput(row.targetWeight)}" aria-label="Target weight for ${accessibleLabel}" /></td>
      <td><input data-target-field="minWeight" type="number" min="0" max="100" step="0.1" value="${toPercentInput(row.minWeight)}" aria-label="Minimum weight for ${accessibleLabel}" /></td>
      <td><input data-target-field="maxWeight" type="number" min="0" max="100" step="0.1" value="${toPercentInput(row.maxWeight)}" aria-label="Maximum weight for ${accessibleLabel}" /></td>
      <td class="number-cell ${row.driftWeight >= 0 ? "negative" : "positive"}">${formatSignedPct(row.driftWeight)}<small>${formatSignedCurrency(row.driftValue)}</small></td>
      <td><span class="pill ${targetStatusClass(row.status)}">${escapeHtml(row.suggestedAction)}</span></td>
      <td>
        <select data-target-field="priority" aria-label="Priority for ${accessibleLabel}">
          ${["low", "medium", "high"].map((priority) => `<option value="${priority}" ${row.priority === priority ? "selected" : ""}>${titleCase(priority)}</option>`).join("")}
        </select>
      </td>
      <td>
        <input data-target-field="notes" type="text" value="${escapeHtml(targetNoteValue(row.notes))}" aria-label="Notes for ${accessibleLabel}" />
        <input data-target-field="maxEffectiveExposure" type="hidden" value="${toPercentInput(row.maxEffectiveExposure)}" />
      </td>
    </tr>
  `;
}

function renderRebalancePlan(plan, uiState = "SAMPLE_MODE") {
  const target = byId("rebalancePanel");
  if (!target || !plan) return;
  if (!isImportedState(uiState)) {
    target.innerHTML = '<div class="empty"><strong>No target allocations yet.</strong><span>Import the real portfolio first, then set targets for the largest holdings.</span></div>';
    return;
  }
  if (plan.cashPlan) {
    target.innerHTML = `
      <div class="target-summary-grid">
        ${targetMetric("Mode", modeLabel(plan.mode))}
        ${targetMetric("Available cash", formatCurrency(plan.cashPlan.availableCash))}
        ${targetMetric("Target cash", formatPct(plan.cashPlan.targetCashWeight))}
        ${targetMetric("Excess cash estimate", formatCurrency(plan.cashPlan.excessCash))}
      </div>

      <section class="rebalance-section">
        <h3>Review suggestions</h3>
        <div class="mini-list">
          ${plan.suggestions.length ? plan.suggestions.map((item) => `
            <div>
              <span>${escapeHtml(item.action)} · ${escapeHtml(item.key)}</span>
              <b>${item.amount ? formatCurrency(item.amount) : "Hold"}</b>
              <small>${escapeHtml(item.rationale)}${thesisReviewNote(plan.thesisRows, item.key)}</small>
            </div>
          `).join("") : '<div><span>No rebalance suggestions from current settings.</span><b>Hold</b><small>Targets are close enough or no deployable cash is available.</small></div>'}
        </div>
      </section>

      ${renderRebalanceSimulator(plan.simulator)}

      <section class="rebalance-section">
        <h3>Cash deployment planner</h3>
        <div class="cash-plan">
          ${plan.cashPlan.suggestions.length ? plan.cashPlan.suggestions.map((item) => `
            <div>
              <span>${renderTickerLink(item.ticker)}</span>
              <b>${formatCurrency(item.amount)}</b>
              <small>${escapeHtml(item.rationale)}</small>
            </div>
          `).join("") : '<div><span>No excess cash to deploy against current targets.</span><b>Hold cash</b><small>Adjust the target cash percentage if Tucker wants a different cash buffer.</small></div>'}
        </div>
      </section>

      <section class="rebalance-section">
        <h3>Leveraged ETF guardrails</h3>
        <div class="guardrail-list">
          ${plan.leveragedGuardrails.length ? plan.leveragedGuardrails.map((item) => `
            <div class="${item.status === "above cap" ? "needs-review" : "ok"}">
              <span>${renderTickerLink(item.ticker)} · ${escapeHtml(item.status)}</span>
              <b>${formatPct(item.effectiveExposure)} effective</b>
              <small>Current ${formatPct(item.currentWeight)} · cap ${formatPct(item.targetCap)} · ${escapeHtml(item.warning)}</small>
            </div>
          `).join("") : '<div><span>No leveraged ETFs detected in current holdings.</span><b>OK</b><small>UPRO, SOXL, TQQQ-style positions will appear here when present.</small></div>'}
        </div>
      </section>

      <section class="rebalance-section">
        <h3>Current vs target</h3>
        <div class="target-table-wrap">
          <table class="target-table compact-table">
            <thead>
              <tr><th>Target</th><th>Current</th><th>Target</th><th>Drift</th><th>Review action</th></tr>
            </thead>
            <tbody>
              ${plan.rows.filter((row) => row.scope === "ticker").slice(0, 16).map((row) => `
                <tr>
                  <td><b>${row.scope === "ticker" ? renderTickerLink(row.key) : escapeHtml(row.key)}</b><small>${escapeHtml(scopeLabel(row.scope))}</small></td>
                  <td class="number-cell">${formatPct(row.currentWeight)}<small>${formatCurrency(row.currentValue)}</small></td>
                  <td class="number-cell">${formatPct(row.targetWeight)}<small>range ${formatPct(row.minWeight)}-${formatPct(row.maxWeight)}</small></td>
                  <td class="number-cell ${row.driftWeight >= 0 ? "negative" : "positive"}">${formatSignedPct(row.driftWeight)}<small>${formatSignedCurrency(row.driftValue)}</small></td>
                  <td><span class="pill ${targetStatusClass(row.status)}">${escapeHtml(row.suggestedAction)}</span></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
    return;
  }
  target.innerHTML = `
    <div class="risk-grid">
      <div class="risk-stat"><span>Mode</span><b>${escapeHtml(plan.mode)}</b></div>
      <div class="risk-stat"><span>Cash available</span><b>${formatCurrency(plan.cashAvailable)}</b></div>
      <div class="risk-stat"><span>Contribution used</span><b>${formatCurrency(plan.contributionAmount)}</b></div>
    </div>
    <div class="mini-list">
      ${plan.suggestions.length ? plan.suggestions.map((item) => `
        <div>
          <span>${escapeHtml(item.action)} · ${renderTickerLink(item.ticker)} · ${escapeHtml(item.account)}</span>
          <b>${item.amount ? formatCurrency(item.amount) : "Hold"}</b>
          <small>${item.estimatedShares ? `${item.estimatedShares} sh` : ""} ${escapeHtml(item.rationale)}</small>
        </div>
      `).join("") : '<div><span>No rebalance suggestions from current settings.</span><b>OK</b><small>Targets are close enough or no cash is available.</small></div>'}
    </div>
  `;
}

function renderRebalanceSimulator(simulator = {}) {
  if (!simulator || !simulator.readOnly) return "";
  const trades = simulator.estimatedTrades || [];
  const categories = simulator.categoryAdjustments || [];
  const beforeAfter = simulator.beforeAfterRows || [];
  const warnings = simulator.taxWarnings || [];
  const mode = modeLabel(simulator.mode);
  return `
    <section class="rebalance-section" data-rebalance-simulator>
      <h3>Rebalancing simulator</h3>
      <div class="target-summary-grid">
        ${targetMetric("Simulator mode", mode)}
        ${targetMetric("Modeled sale proceeds", formatCurrency(simulator.saleProceedsModeled || 0))}
        ${targetMetric("Cash available for adds", formatCurrency(simulator.deployableCash || 0))}
        ${targetMetric("Portfolio after model", formatCurrency(simulator.totalAfter || simulator.totalValue || 0))}
      </div>
      <div class="what-if-callout">
        <div class="badge-row"><span class="status-badge safe">Read-only</span><span class="status-badge">${escapeHtml(mode)}</span></div>
        <b>${escapeHtml(simulator.note || "Local rebalance model.")}</b>
        <span>Estimated adjustments are review prompts only. No brokerage order, trade ticket, or execution step exists here.</span>
        ${warnings.length ? `<ul class="what-if-warning-list">${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>` : ""}
      </div>
      <div class="grid-two">
        <div>
          <h3>Estimated ticker adjustments</h3>
          <div class="mini-list">
            ${trades.length ? trades.map(renderSimulatorTrade).join("") : '<div><span>No ticker adjustments from this mode.</span><b>Hold</b><small>Current targets are close enough, or no deployable cash/proceeds are available.</small></div>'}
          </div>
        </div>
        <div>
          <h3>Category context</h3>
          <div class="mini-list">
            ${categories.length ? categories.map(renderSimulatorCategory).join("") : '<div><span>No category-level drift above the review threshold.</span><b>Balanced</b><small>Asset class, sleeve, and account targets are close enough for this model.</small></div>'}
          </div>
        </div>
      </div>
      <div class="target-table-wrap">
        <table class="target-table compact-table">
          <thead>
            <tr><th>Ticker</th><th>Current</th><th>Modeled after</th><th>Target</th><th>Drift after</th><th>Status</th></tr>
          </thead>
          <tbody>
            ${beforeAfter.length ? beforeAfter.map((row) => `
              <tr>
                <td><b>${renderTickerLink(row.ticker || row.key)}</b><small>Before drift ${formatSignedPct(row.driftBefore)}</small></td>
                <td class="number-cell">${formatPct(row.currentWeight)}<small>${formatCurrency(row.currentValue)}</small></td>
                <td class="number-cell">${formatPct(row.afterWeight)}<small>${formatCurrency(row.simulatedValue)}</small></td>
                <td class="number-cell">${formatPct(row.targetWeight)}</td>
                <td class="number-cell ${row.driftAfter >= 0 ? "negative" : "positive"}">${formatSignedPct(row.driftAfter)}<small>${formatSignedCurrency(row.driftValueAfter)}</small></td>
                <td><span class="pill ${targetStatusClass(row.statusAfter)}">${escapeHtml(row.statusAfter)}</span></td>
              </tr>
            `).join("") : '<tr><td colspan="6">No before/after rows available yet.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderSimulatorTrade(trade = {}) {
  const amount = trade.amount ? formatCurrency(trade.amount) : "Review";
  const delta = trade.valueDelta ? formatSignedCurrency(trade.valueDelta) : "No modeled change";
  return `
    <div>
      <span>${escapeHtml(trade.action || "Review")} · ${trade.ticker ? renderTickerLink(trade.ticker) : escapeHtml(trade.key || "Target")}</span>
      <b>${amount}</b>
      <small>${delta} · ${escapeHtml(trade.rationale || "Review this adjustment in context.")}${trade.taxableWarning ? ` ${escapeHtml(trade.taxableWarning)}` : ""}</small>
    </div>
  `;
}

function renderSimulatorCategory(row = {}) {
  return `
    <div>
      <span>${escapeHtml(scopeLabel(row.scope))} · ${escapeHtml(row.key || "Category")}</span>
      <b>${escapeHtml(row.reviewAction || row.status || "Review")}</b>
      <small>${formatSignedPct(row.driftWeight)} · ${formatSignedCurrency(row.driftValue)} · ${escapeHtml(row.rationale || "Review category drift before changing holdings.")}</small>
    </div>
  `;
}

function renderSleeves(sleeves, uiState = "SAMPLE_MODE") {
  const target = byId("sleevePanel");
  if (!target) return;
  if (!isImportedState(uiState)) {
    target.innerHTML = '<div class="empty"><strong>No real sleeve weights yet.</strong><span>Import a Fidelity CSV to view strategy buckets.</span></div>';
    return;
  }
  target.innerHTML = sleeves.map((sleeve) => `
    <div class="breakdown-row">
      <div>
        <b>${escapeHtml(sleeve.name)}</b>
        <span>${sleeve.holdings} holding${sleeve.holdings === 1 ? "" : "s"} · risk ${sleeve.averageRisk}/100</span>
      </div>
      <div class="breakdown-value">
        <b>${formatCurrency(sleeve.value)}</b>
        <span>${formatPct(sleeve.weight)} · drift ${formatSignedPct(sleeve.drift)}</span>
      </div>
      <div class="breakdown-bar"><i style="width:${Math.min(100, sleeve.weight * 100)}%"></i></div>
    </div>
  `).join("");
}

function renderThesisTracker(rows, summary) {
  const target = byId("thesisPanel");
  if (!target) return;
  target.innerHTML = `
    <div class="risk-grid">
      <div class="risk-stat"><span>Needs attention</span><b>${summary?.needsAttention ?? 0}</b></div>
      <div class="risk-stat"><span>Missing</span><b>${summary?.missing ?? 0}</b></div>
      <div class="risk-stat"><span>Stale</span><b>${summary?.stale ?? 0}</b></div>
      <div class="risk-stat"><span>Alpha review</span><b>${summary?.alphaReview ?? 0}</b></div>
      <div class="risk-stat"><span>Above target risk</span><b>${summary?.aboveTargetWithWeakOrStale ?? 0}</b></div>
      <div class="risk-stat"><span>Missing guardrails</span><b>${summary?.leveragedGuardrailMissing ?? 0}</b></div>
    </div>
    <div class="thesis-list">
      ${rows.slice(0, 10).map((row) => `
        <article class="thesis-card ${escapeHtml(thesisStatusClass(row.thesisStatus))}">
          <div class="thesis-card-head">
            <div>
              <span class="status-badge">${escapeHtml(row.thesisStatus)}</span>
              <span class="status-badge action">${escapeHtml(row.reviewAction)}</span>
              <span class="status-badge">${escapeHtml(row.confidenceLevel)}</span>
            </div>
            <b>${renderTickerLink(row.ticker)}</b>
            <small>${formatPct(row.portfolioWeight)} current · ${formatPct(row.targetWeight)} target · drift ${formatSignedPct(row.drift)}</small>
          </div>
          <p>${escapeHtml(row.whyOwned || "No thesis documented yet.")}</p>
          <div class="thesis-card-grid">
            <div><b>Next trigger</b><span>${escapeHtml(row.nextReviewTrigger)}</span></div>
            <div><b>Invalidation</b><span>${escapeHtml(row.invalidation)}</span></div>
            <div><b>Add if</b><span>${escapeHtml(row.whatWouldMakeMeAdd)}</span></div>
            <div><b>Trim/review if</b><span>${escapeHtml(row.whatWouldMakeMeTrim || row.whatWouldMakeMeExitReview)}</span></div>
          </div>
          ${row.reviewReasons.length ? `<ul class="why-list">${row.reviewReasons.slice(0, 4).map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>` : ""}
          ${row.alphaImpact.summary ? `<p class="section-note"><b>Alpha signal:</b> ${escapeHtml(row.alphaImpact.summary)}</p>` : ""}
        </article>
      `).join("") || '<div class="empty"><strong>No thesis rows yet.</strong><span>Import holdings to build a thesis review list.</span></div>'}
    </div>
  `;
}

function renderWatchlistIdeas(rows = [], summary = {}, filters = {}) {
  const target = byId("watchlistIdeasPanel");
  const summaryTarget = byId("watchlistSummaryPanel");
  if (summaryTarget) {
    summaryTarget.innerHTML = `
      <div class="risk-grid">
        <div class="risk-stat"><span>Total ideas</span><b>${summary.total || 0}</b></div>
        <div class="risk-stat"><span>Researching</span><b>${summary.researching || 0}</b></div>
        <div class="risk-stat"><span>Watching</span><b>${summary.watching || 0}</b></div>
        <div class="risk-stat"><span>Candidates</span><b>${summary.candidate || 0}</b></div>
        <div class="risk-stat"><span>Owned links</span><b>${summary.owned || 0}</b></div>
        <div class="risk-stat"><span>Needs review</span><b>${(summary.stale || 0) + Math.max(0, (summary.total || 0) - (summary.saved || 0))}</b></div>
      </div>
      <p class="section-note">Saved ideas stay local. Signal-derived rows are suggestions until Tucker tracks or rejects them.</p>
    `;
  }
  if (!target) return;
  if (!rows.length) {
    target.innerHTML = `
      <div class="empty">
        <strong>No ideas match the current filters.</strong>
        <span>Clear filters, promote a ticker signal, or add a manual idea with the form.</span>
      </div>
    `;
    return;
  }
  target.innerHTML = `
    <div class="provider-status-note">
      <b>${rows.length} visible idea${rows.length === 1 ? "" : "s"}</b>
      <span>Status ${escapeHtml(watchlistFilterLabel(filters.status, "all statuses"))} · sector ${escapeHtml(watchlistFilterLabel(filters.sector, "all sectors"))} · source ${escapeHtml(watchlistFilterLabel(filters.signalSource, "all sources"))} · conviction ${escapeHtml(watchlistFilterLabel(filters.conviction, "all conviction levels"))}.</span>
    </div>
    <div class="watchlist-card-grid">
      ${rows.map(renderWatchlistIdeaCard).join("")}
    </div>
  `;
}

function renderWatchlistIdeaCard(row = {}) {
  const statusClass = row.status === "owned" ? "safe" : row.status === "candidate" ? "demo" : row.status === "rejected" ? "sample" : "";
  return `
    <article class="watchlist-card ${escapeHtml(row.status || "watching")}">
      <div class="watchlist-card-head">
        <div class="badge-row">
          <span class="status-badge ${statusClass}">${escapeHtml(titleCase(row.status || "watching"))}</span>
          <span class="status-badge">${escapeHtml(row.conviction || "Unrated")}</span>
          <span class="status-badge ${row.saved ? "safe" : "demo"}">${row.saved ? "Saved" : "Signal suggestion"}</span>
          ${row.owned ? '<span class="status-badge safe">Owned</span>' : ""}
        </div>
        <div>
          <h3>${renderTickerLink(row.ticker)}${row.name && row.name !== row.ticker ? ` · ${escapeHtml(row.name)}` : ""}</h3>
          <p>${escapeHtml(row.thesis || "Add a thesis before treating this as an actionable candidate.")}</p>
        </div>
      </div>
      <div class="ticker-mini-metrics">
        <div><span>Exposure</span><b>${row.owned ? formatCurrency(row.marketValue) : "Not owned"}</b><small>${row.owned ? formatPct(row.portfolioWeight) : "Watchlist only"}</small></div>
        <div><span>Signal score</span><b>${row.signalScore ? `${Math.round(row.signalScore)}/100` : "--"}</b><small>${escapeHtml(row.signalAction || "No current signal")}</small></div>
        <div><span>Source</span><b>${escapeHtml(watchlistSourceLabel(row.signalSource))}</b><small>${escapeHtml(row.sourceOfIdea || "Manual")}</small></div>
        <div><span>Review</span><b>${escapeHtml(row.reviewState || "needs review")}</b><small>${escapeHtml(row.lastReviewed || "Not reviewed")}</small></div>
      </div>
      <div class="watchlist-detail-grid">
        <div><b>Catalyst</b><span>${escapeHtml(row.catalyst || row.signalHeadline || "No catalyst documented yet.")}</span></div>
        <div><b>Review zone</b><span>${escapeHtml(row.targetEntryZone || "Not set.")}</span></div>
        <div><b>Risk notes</b><span>${escapeHtml(row.riskNotes || "No risk notes yet.")}</span></div>
        <div><b>Time horizon</b><span>${escapeHtml(row.timeHorizon || "Not set.")}</span></div>
      </div>
      <div class="connector-actions compact-actions">
        <button type="button" data-watchlist-action="${row.saved ? "edit" : "promote-signal"}" data-ticker="${escapeHtml(row.ticker)}" data-score="${escapeHtml(row.signalScore || 0)}" data-headline="${escapeHtml(row.signalHeadline || row.catalyst || "")}" data-explanation="${escapeHtml(row.thesis || "")}" data-sector="${escapeHtml(row.sector || "")}" data-status="${escapeHtml(row.status || "watching")}" data-source="${escapeHtml(row.sourceOfIdea || "")}" data-conviction="${escapeHtml(row.conviction || "")}" aria-label="${row.saved ? "Edit idea for" : "Track idea for"} ${escapeHtml(row.ticker)}">${row.saved ? "Edit idea" : "Track idea"}</button>
        ${row.status !== "candidate" ? `<button type="button" data-watchlist-action="set-status" data-status="candidate" data-ticker="${escapeHtml(row.ticker)}" aria-label="Mark ${escapeHtml(row.ticker)} as candidate">Mark candidate</button>` : ""}
        ${row.status !== "rejected" ? `<button type="button" data-watchlist-action="set-status" data-status="rejected" data-ticker="${escapeHtml(row.ticker)}" aria-label="Reject idea for ${escapeHtml(row.ticker)}">Reject</button>` : ""}
        ${row.saved ? `<button type="button" data-watchlist-action="delete" data-ticker="${escapeHtml(row.ticker)}" aria-label="Remove saved idea for ${escapeHtml(row.ticker)}">Remove saved idea</button>` : ""}
      </div>
    </article>
  `;
}

function watchlistFilterLabel(value = "", fallback = "all") {
  return !value || value === "all" ? fallback : value;
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
  })[source] || source || "Manual";
}

function renderDecisionJournal(rows = [], summary = {}, filters = {}) {
  const target = byId("decisionJournalPanel");
  const summaryTarget = byId("decisionJournalSummaryPanel");
  if (summaryTarget) {
    summaryTarget.innerHTML = `
      <div class="risk-grid">
        <div class="risk-stat"><span>Total entries</span><b>${summary.total || 0}</b></div>
        <div class="risk-stat"><span>Buy/add notes</span><b>${summary.buys || 0}</b></div>
        <div class="risk-stat"><span>Trim/sell notes</span><b>${summary.sells || 0}</b></div>
        <div class="risk-stat"><span>Hold notes</span><b>${summary.holds || 0}</b></div>
        <div class="risk-stat"><span>Watch/reject notes</span><b>${(summary.watches || 0) + (summary.rejects || 0)}</b></div>
        <div class="risk-stat"><span>Signal snapshots</span><b>${summary.withSignalSnapshot || 0}</b></div>
      </div>
      <p class="section-note">This is a decision log only. It does not place trades or confirm brokerage execution.</p>
    `;
  }
  if (!target) return;
  if (!rows.length) {
    target.innerHTML = `
      <div class="empty">
        <strong>No journal entries match these filters.</strong>
        <span>Log why you bought, sold, held, trimmed, added, watched, or rejected a ticker. Entries stay local.</span>
      </div>
    `;
    return;
  }
  target.innerHTML = `
    <div class="provider-status-note">
      <b>${rows.length} visible decision note${rows.length === 1 ? "" : "s"}</b>
      <span>Ticker ${escapeHtml(journalFilterLabel(filters.ticker, "all tickers"))} · decision ${escapeHtml(journalFilterLabel(filters.decisionType, "all decisions"))} · conviction ${escapeHtml(journalFilterLabel(filters.conviction, "all conviction levels"))}. These are notes, not trade confirmations.</span>
    </div>
    <div class="journal-list">
      ${rows.map(renderJournalEntryCard).join("")}
    </div>
  `;
}

function renderJournalEntryCard(row = {}) {
  const decisionClass = ["sell", "trim", "reject"].includes(row.decisionType) ? "sample" : ["buy", "add"].includes(row.decisionType) ? "demo" : "safe";
  const snapshot = row.signalSnapshot;
  return `
    <article class="journal-card">
      <div class="journal-card-head">
        <div>
          <div class="badge-row">
            <span class="status-badge ${decisionClass}">${escapeHtml(journalDecisionLabel(row.decisionType))}</span>
            <span class="status-badge">${escapeHtml(row.conviction || "Unrated")}</span>
            <span class="status-badge ${row.owned ? "safe" : "demo"}">${row.owned ? "Owned" : "Not owned"}</span>
            ${snapshot ? '<span class="status-badge demo">Signal snapshot</span>' : ""}
          </div>
          <h3>${renderTickerLink(row.ticker)} · ${escapeHtml(shortDateTime(row.dateTime))}</h3>
          <p>${escapeHtml(row.thesisNote || "No thesis note recorded.")}</p>
        </div>
        <div class="connector-actions compact-actions">
          <button type="button" data-journal-action="edit" data-journal-id="${escapeHtml(row.id)}" aria-label="Edit journal entry for ${escapeHtml(row.ticker)}">Edit</button>
          <button type="button" data-journal-action="delete" data-journal-id="${escapeHtml(row.id)}" aria-label="Delete journal entry for ${escapeHtml(row.ticker)}">Delete</button>
        </div>
      </div>
      <div class="watchlist-detail-grid">
        <div><b>Risk note</b><span>${escapeHtml(row.riskNote || "No risk note recorded.")}</span></div>
        <div><b>Catalyst</b><span>${escapeHtml(row.catalyst || "No catalyst recorded.")}</span></div>
        <div><b>Portfolio context</b><span>${row.owned ? `${formatCurrency(row.marketValue)} · ${formatPct(row.portfolioWeight)}` : "No current position"} · ${escapeHtml(row.sector || "Unknown")}</span></div>
        <div><b>Signal snapshot</b><span>${snapshot ? `${snapshot.combinedScore ?? "--"}/100 · ${escapeHtml(snapshot.actionCategory || "No action label")} · ${escapeHtml(snapshot.topHeadline || "No headline")}` : "No signal score was available when this entry was saved."}</span></div>
      </div>
    </article>
  `;
}

function journalFilterLabel(value = "", fallback = "all") {
  return !value || value === "all" ? fallback : value;
}

function journalDecisionLabel(value = "") {
  return String(value || "watch").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function renderWhatIfSimulator(result = {}, scenario = {}, uiState = "SAMPLE_MODE") {
  renderWhatIfSummary(result, scenario, uiState);
  renderWhatIfRows("whatIfTickerWeightsPanel", result.tickerRows || [], {
    title: "ticker",
    itemLabel: (row) => renderTickerLink(row.ticker || row.key),
    empty: "No ticker weight changes yet."
  });
  renderWhatIfRows("whatIfSectorWeightsPanel", result.sectorRows || [], {
    title: "sector",
    itemLabel: (row) => escapeHtml(row.name || row.key),
    empty: "No sector weight changes yet."
  });
  renderWhatIfRiskRows(result.riskRows || []);
  renderWhatIfAlerts(result.alertsTriggered || [], result.alertsResolved || []);
}

function renderWhatIfSummary(result = {}, scenario = {}, uiState = "SAMPLE_MODE") {
  const target = byId("whatIfSummaryPanel");
  if (!target) return;
  if (!result || !result.before) {
    target.innerHTML = '<div class="empty"><strong>No simulator model yet.</strong><span>Import or load holdings to start modeling scenarios.</span></div>';
    return;
  }
  const sourceBadge = isImportedState(uiState)
    ? '<span class="status-badge safe">Imported holdings</span>'
    : '<span class="status-badge demo">Sample holdings</span>';
  const actionLabel = whatIfActionLabel(scenario.action);
  const statusBadge = result.status === "ready"
    ? '<span class="status-badge safe">Read-only result</span>'
    : '<span class="status-badge sample">Needs input</span>';
  if (result.status !== "ready") {
    target.innerHTML = `
      <div class="what-if-callout">
        <div class="badge-row">${sourceBadge}${statusBadge}</div>
        <b>${escapeHtml(result.message || "Complete the scenario inputs.")}</b>
        <span>Nothing is written to holdings or localStorage from this screen.</span>
      </div>
    `;
    return;
  }
  const delta = result.deltas || {};
  const warnings = (result.warnings || [])
    .map((warning) => `<li>${escapeHtml(warning)}</li>`)
    .join("");
  target.innerHTML = `
    <div class="what-if-callout">
      <div class="badge-row">${sourceBadge}${statusBadge}<span class="status-badge">${escapeHtml(actionLabel)}</span></div>
      <b>${escapeHtml(result.message || "Scenario modeled locally.")}</b>
      <span>This is not a trade ticket, brokerage instruction, or recommendation. It is a local concentration and risk model.</span>
      ${warnings ? `<ul class="what-if-warning-list">${warnings}</ul>` : ""}
    </div>
    <div class="what-if-summary-grid">
      ${whatIfMetric("Portfolio value", delta.totalValue, "currency")}
      ${whatIfMetric("Cash balance", delta.cashBalance, "currency")}
      ${whatIfMetric("Top 10 concentration", delta.top10Weight, "percent")}
      ${whatIfMetric("Leveraged notional", delta.leveragedNotionalExposure, "currency")}
    </div>
  `;
}

function renderWhatIfRows(id, rows = [], options = {}) {
  const target = byId(id);
  if (!target) return;
  target.innerHTML = rows.length
    ? rows.slice(0, 10).map((row) => `
      <article class="what-if-row">
        <div>
          <b>${options.itemLabel ? options.itemLabel(row) : escapeHtml(row.key || "--")}</b>
          <small>${escapeHtml(titleCase(options.title || "row"))} weight changed by ${formatSignedPct(row.deltaWeight)}</small>
        </div>
        <div class="num">
          <b>${formatCompact(row.afterValue)}</b>
          <small>${formatPct(row.beforeWeight)} → ${formatPct(row.afterWeight)}</small>
        </div>
        <div class="num">
          <b class="${row.deltaValue >= 0 ? "positive" : "negative"}">${formatSignedCurrency(row.deltaValue)}</b>
          <small>${formatSignedPct(row.deltaWeight)}</small>
        </div>
      </article>
    `).join("")
    : `<div class="empty"><strong>${escapeHtml(options.empty || "No changes yet.")}</strong><span>Adjust the scenario inputs to model a different portfolio shape.</span></div>`;
}

function renderWhatIfRiskRows(rows = []) {
  const target = byId("whatIfRiskPanel");
  if (!target) return;
  target.innerHTML = rows.length
    ? rows.map((row) => `
      <article class="what-if-row">
        <div>
          <b>${escapeHtml(row.label)}</b>
          <small>Before: ${formatWhatIfValue(row.before, row.format)}</small>
        </div>
        <div class="num">
          <b>${formatWhatIfValue(row.after, row.format)}</b>
          <small>After</small>
        </div>
        <div class="num">
          <b class="${whatIfRiskDeltaClass(row)}">${formatWhatIfSignedValue(row.delta, row.format)}</b>
          <small>Change</small>
        </div>
      </article>
    `).join("")
    : '<div class="empty"><strong>No risk comparison available.</strong><span>Import or load holdings to calculate simulator risk changes.</span></div>';
}

function whatIfRiskDeltaClass(row = {}) {
  const delta = Number(row.delta) || 0;
  if (delta === 0) return "";
  const higherIsRiskier = ["top10", "leveraged-notional", "concentration-score"].includes(row.id);
  if (higherIsRiskier) return delta > 0 ? "negative" : "positive";
  return delta > 0 ? "positive" : "negative";
}

function renderWhatIfAlerts(triggered = [], resolved = []) {
  const target = byId("whatIfAlertsPanel");
  if (!target) return;
  const triggeredHtml = triggered.map((alert) => whatIfAlertRow(alert, "Triggered")).join("");
  const resolvedHtml = resolved.map((alert) => whatIfAlertRow(alert, "Resolved")).join("");
  target.innerHTML = triggeredHtml || resolvedHtml
    ? `${triggeredHtml}${resolvedHtml}`
    : '<div class="empty"><strong>No alert changes.</strong><span>The modeled scenario does not trigger or resolve local alert rules.</span></div>';
}

function whatIfAlertRow(alert = {}, label = "Alert") {
  const ticker = alert.ticker && !["LEVERAGE"].includes(alert.ticker) ? renderTickerLink(alert.ticker) : escapeHtml(alert.ticker || label);
  return `
    <article class="risk-row ${escapeHtml(alert.severity === "critical" ? "extreme" : alert.severity === "high" || alert.severity === "warning" ? "high" : alert.severity === "medium" || alert.severity === "watch" ? "elevated" : "normal")}">
      <div class="risk-row-main">
        <b>${escapeHtml(label)}: ${escapeHtml(alert.title || "Scenario alert")}</b>
        <span>${ticker} · ${escapeHtml(alert.actionCategory || alert.severity || "Review")}</span>
        <p>${escapeHtml(alert.detail || "Review this modeled alert in context.")}</p>
      </div>
      <div class="risk-row-value">
        <b>${escapeHtml(alert.score ?? "--")}</b>
        <span>score</span>
      </div>
    </article>
  `;
}

function whatIfMetric(label = "", metric = {}, format = "currency") {
  const delta = Number(metric.delta) || 0;
  return `
    <div class="what-if-metric">
      <span>${escapeHtml(label)}</span>
      <b>${formatWhatIfValue(metric.after, format)}</b>
      <span>Before ${formatWhatIfValue(metric.before, format)} · <span class="${delta >= 0 ? "positive" : "negative"}">${formatWhatIfSignedValue(delta, format)}</span></span>
    </div>
  `;
}

function formatWhatIfValue(value, format = "currency") {
  if (format === "percent") return formatPct(value);
  if (format === "number") return formatNumber(value);
  return formatCurrency(value);
}

function formatWhatIfSignedValue(value, format = "currency") {
  if (format === "percent") return formatSignedPct(value);
  if (format === "number") return `${Number(value) >= 0 ? "+" : ""}${formatNumber(value)}`;
  return formatSignedCurrency(value);
}

function whatIfActionLabel(action = "") {
  return {
    add: "Add",
    "trim-dollar": "Trim dollars",
    "trim-percent": "Trim percent",
    remove: "Remove",
    "rebalance-target": "Rebalance to target"
  }[action] || "Scenario";
}

function renderRiskDeepDive(risk = {}, breakdowns = {}, overview = {}, holdings = [], uiState = "SAMPLE_MODE", marketDataStatus = {}) {
  const decision = risk.decisionDashboard || {};
  renderRiskConcentrationSummary(decision.concentrationInterpretation, decision.topPositionWeights || risk.topHoldings || [], decision.leveragedEtfExposure, uiState);
  renderRiskTopPositions(decision.topPositionWeights || risk.topHoldings || [], uiState, marketDataStatus);
  const marketNote = marketDataStatus.status
    ? ` Market movement source: ${marketDataDisplayLabel(marketDataStatus)}. ${marketDataDisplayDetail(marketDataStatus)}`
    : "";
  renderRiskBreakdownPanel("riskSectorExposurePanel", decision.sectorConcentration || breakdowns.sector || [], uiState, `Cash/money market exposure is separated from operating-sector risk.${marketNote}`);
  renderRiskBreakdownPanel("riskAccountExposurePanel", decision.accountConcentration || breakdowns.account || [], uiState, marketNote.trim());
  renderLeveragedExposurePanel(decision.leveragedEtfExposure, holdings, overview, uiState, marketDataStatus);
  renderRiskThemeExposurePanel(decision.themeExposure || [], uiState);
  renderRiskAssetMixPanel(decision.assetMix || {}, decision.cashExposure, uiState);
  renderRiskCorrelationPanel(decision.correlationPlaceholder, uiState);
}

function renderRiskConcentrationSummary(interpretation = {}, topPositions = [], leverageSummary = {}, uiState = "SAMPLE_MODE") {
  const target = byId("riskConcentrationSummaryPanel");
  if (!target) return;
  if (!isImportedState(uiState)) {
    target.innerHTML = '<div class="empty"><strong>No real concentration summary yet.</strong><span>Import holdings to calculate top-position, top-5, top-10, sector, and leverage concentration.</span></div>';
    return;
  }
  const top = topPositions[0] || {};
  const drivers = Array.isArray(interpretation.drivers) ? interpretation.drivers : [];
  target.innerHTML = `
    <article class="risk-summary-card">
      <div>
        <div>
          <h3>${escapeHtml(interpretation.headline || "Concentration needs review")}</h3>
          <p>${escapeHtml(interpretation.summary || "Deterministic local read from current position weights and source-labeled exposure data.")}</p>
        </div>
        ${renderRiskStatusBadge(interpretation.status || "normal")}
      </div>
      <div class="risk-summary-drivers">
        <div><span>Largest holding</span><b>${escapeHtml(top.name || "None")} · ${formatPct(top.weight || 0)}</b></div>
        <div><span>Position threshold</span><b>${escapeHtml(top.thresholdLabel || "Below 5%")}</b></div>
        <div><span>Leveraged notional</span><b>${formatPct(leverageSummary?.notionalWeight || 0)}</b></div>
        <div><span>Next inspection</span><b>${escapeHtml(interpretation.nextStep || "Open the largest risk row before changing exposure.")}</b></div>
      </div>
      ${drivers.length ? `<ul>${drivers.slice(0, 5).map((driver) => `<li>${escapeHtml(driver)}</li>`).join("")}</ul>` : ""}
    </article>
  `;
}

function renderRiskTopPositions(topHoldings = [], uiState = "SAMPLE_MODE", marketDataStatus = {}) {
  const target = byId("riskTopPositionsPanel");
  if (!target) return;
  if (!isImportedState(uiState)) {
    target.innerHTML = '<div class="empty"><strong>No real position weights yet.</strong><span>Import a Fidelity CSV to rank Tucker’s actual top holdings.</span></div>';
    return;
  }
  target.innerHTML = topHoldings.length
    ? `${topHoldings.slice(0, 10).map((row, index) => {
      const ticker = row.tickers?.[0] || row.ticker || row.name;
      const label = row.label || row.name || ticker;
      const value = row.value ?? row.marketValue;
      const weight = row.weight ?? row.portfolioWeight;
      const details = row.explanation || `${ticker} is ${formatPct(weight)} of portfolio value.`;
      const sourceLabel = marketDataStatus.status ? ` · ${marketDataDisplayLabel(marketDataStatus)}` : "";
      const thresholdText = row.thresholdFlags?.length ? ` · ${row.thresholdFlags.map((flag) => flag.label).join(", ")}` : "";
      return `
        <article class="risk-row ${escapeHtml(row.status || "normal")}">
          <div class="risk-row-main ranked">
            <span class="risk-rank">${index + 1}</span>
            <div>
              <b>${ticker ? renderTickerLink(ticker) : escapeHtml(row.name)}</b>
              <span>${escapeHtml(label)}${escapeHtml(sourceLabel)}${escapeHtml(thresholdText)}</span>
            </div>
          </div>
          <div class="risk-row-value">
            <b>${formatPct(weight)}</b>
            <span>${formatCurrency(value)}</span>
            ${renderRiskStatusBadge(row.status || "normal")}
            <a class="button-link compact-link" href="${escapeHtml(ticker ? tickerDetailHash(ticker) : "#holdings")}">${escapeHtml(ticker ? "Open ticker" : "Inspect")}</a>
          </div>
          <p>${escapeHtml(details)} ${escapeHtml(riskReviewPrompt(row.status || "normal"))}</p>
        </article>
      `;
    }).join("")}<p class="section-note">Use this list to spot positions that can dominate portfolio results. A higher status means “review sizing,” not automatic action.</p>`
    : '<div class="empty"><strong>No positions found.</strong><span>Import holdings to calculate top position weights.</span></div>';
}

function renderRiskBreakdownPanel(id, rows = [], uiState = "SAMPLE_MODE", note = "") {
  const target = byId(id);
  if (!target) return;
  if (!isImportedState(uiState)) {
    target.innerHTML = '<div class="empty"><strong>No real exposure breakdown yet.</strong><span>Import holdings to calculate this risk view.</span></div>';
    return;
  }
  target.innerHTML = rows.length
    ? `${rows.slice(0, 10).map((row) => `
      <article class="breakdown-row risk-row ${escapeHtml(row.status || "normal")}">
        <div class="risk-row-main">
          <b>${escapeHtml(row.name)}</b>
          <span>${row.explanation ? escapeHtml(row.explanation) : `${row.count || 0} holding${row.count === 1 ? "" : "s"} · daily ${formatSignedCurrency(row.dailyChange)}`}</span>
        </div>
        <div class="breakdown-value">
          <b>${formatCompact(row.value)}</b>
          <span>${formatPct(row.weight)}</span>
          ${renderRiskStatusBadge(row.status || "normal")}
        </div>
        <div class="breakdown-bar"><i style="width:${Math.min(100, row.weight * 100)}%"></i></div>
        <a class="button-link compact-link" href="${escapeHtml(row.href || "#holdings")}">Inspect holdings</a>
      </article>
    `).join("")}${note ? `<p class="section-note">${escapeHtml(note)}</p>` : ""}`
    : '<div class="empty"><strong>No exposure rows available.</strong><span>Import holdings to populate this panel.</span></div>';
}

function renderLeveragedExposurePanel(leverageSummary = {}, holdings = [], overview = {}, uiState = "SAMPLE_MODE", marketDataStatus = {}) {
  const target = byId("riskLeveragedExposurePanel");
  if (!target) return;
  if (!isImportedState(uiState)) {
    target.innerHTML = '<div class="empty"><strong>No real leverage read yet.</strong><span>Import holdings to identify UPRO, SOXL, TQQQ-style exposure.</span></div>';
    return;
  }
  const rows = leverageSummary?.rows || holdings
    .filter((holding) => holding.isLeveragedEtf)
    .sort((a, b) => (b.marketValue * Math.abs(b.leveragedMultiple || 1)) - (a.marketValue * Math.abs(a.leveragedMultiple || 1)))
    .map((holding) => ({
      name: holding.ticker,
      label: `${holding.leveragedMultiple || 1}x ${holding.name}`,
      value: holding.marketValue * Math.abs(holding.leveragedMultiple || 1),
      weight: divide(holding.marketValue * Math.abs(holding.leveragedMultiple || 1), overview.totalValue),
      status: "elevated",
      explanation: `${holding.ticker} is ${formatPct(holding.portfolioWeight)} direct weight and ${formatPct(divide(holding.marketValue * Math.abs(holding.leveragedMultiple || 1), overview.totalValue))} estimated notional exposure.`,
      tickers: [holding.ticker],
      href: `#/ticker/${holding.ticker}`
    }));
  if (!rows.length) {
    target.innerHTML = '<div class="empty"><strong>No leveraged ETFs detected.</strong><span>UPRO, SOXL, TQQQ-style positions will appear here when present.</span></div>';
    return;
  }
  target.innerHTML = `
    ${rows.map((row) => renderRiskDecisionRow(row, "Review ETF")).join("")}
    <article class="risk-row ${escapeHtml(leverageSummary.status || "normal")}">
      <div class="risk-row-main">
        <b>Total leveraged ETF exposure</b>
        <span>${escapeHtml(leverageSummary.explanation || "Review effective exposure before adding risk.")}</span>
      </div>
      <div class="risk-row-value">
        <b>${formatCurrency(leverageSummary.notionalValue ?? overview.leveragedNotionalExposure)}</b>
        <span>${formatPct(leverageSummary.notionalWeight ?? divide(overview.leveragedNotionalExposure, overview.totalValue))} notional</span>
        <span>${formatCurrency(leverageSummary.directValue ?? overview.leveragedEtfExposure)} direct · ${formatPct(leverageSummary.directWeight ?? divide(overview.leveragedEtfExposure, overview.totalValue))}</span>
        ${renderRiskStatusBadge(leverageSummary.status || "normal")}
      </div>
    </article>
    ${renderLeveragedDrawdownScenarios(leverageSummary)}
    ${marketDataStatus.status ? `<p class="section-note">Market data source: ${escapeHtml(marketDataDisplayLabel(marketDataStatus))}. ${escapeHtml(marketDataDisplayDetail(marketDataStatus))}</p>` : ""}
  `;
}

export function renderLeveragedDrawdownScenarios(leverageSummary = {}) {
  const scenarios = Array.isArray(leverageSummary.scenarios) ? leverageSummary.scenarios : [];
  if (!scenarios.length) return "";
  return `
    <article id="riskLeveragedVolatilityDragModule" class="leveraged-education">
      <h3>Volatility Drag + Drawdown Scenarios</h3>
      <p>${escapeHtml(leverageSummary.dailyResetExplanation || "Daily-reset leveraged ETFs target their stated multiple for one trading day, not over every long-term holding period.")}</p>
      <div id="riskLeveragedDrawdownScenarios" class="leveraged-scenario-grid">
        ${scenarios.map((scenario) => `
          <div>
            <span>Underlying ${escapeHtml(scenario.underlyingMoveLabel || formatPct(scenario.underlyingMove || 0))}</span>
            <b>${formatSignedPct(scenario.estimatedProductMove || 0)}</b>
            <small>${formatSignedCurrency(scenario.estimatedPortfolioImpact || 0)} portfolio impact · ${formatSignedPct(scenario.estimatedPortfolioImpactPct || 0)}</small>
          </div>
        `).join("")}
      </div>
      <p>${escapeHtml(leverageSummary.volatilityDragExplanation || "Volatility drag can make multi-day results differ from a simple multiple of the underlying index return.")}</p>
    </article>
  `;
}

function renderRiskThemeExposurePanel(rows = [], uiState = "SAMPLE_MODE") {
  const target = byId("riskThemeExposurePanel");
  if (!target) return;
  if (!isImportedState(uiState)) {
    target.innerHTML = '<div class="empty"><strong>No theme exposure yet.</strong><span>Import holdings to calculate AI, semiconductor, memory, mega-cap tech, and leveraged-growth overlap.</span></div>';
    return;
  }
  target.innerHTML = rows.length
    ? `${rows.map((row) => renderRiskDecisionRow(row, "Review theme")).join("")}<p class="section-note">Theme exposure is estimated from ticker tags and holding metadata. It is a practical overlap check, not a measured factor model.</p>`
    : '<div class="empty"><strong>No tagged themes detected.</strong><span>Theme rows appear when holdings match AI, semiconductor, memory, mega-cap tech, or leveraged-growth tags.</span></div>';
}

function renderRiskAssetMixPanel(assetMix = {}, cashExposure = {}, uiState = "SAMPLE_MODE") {
  const assetTarget = byId("riskAssetMixPanel");
  const cashTarget = byId("riskCashExposurePanel");
  if (!assetTarget && !cashTarget) return;
  if (!isImportedState(uiState)) {
    const empty = '<div class="empty"><strong>No asset mix yet.</strong><span>Import holdings to split individual stocks, ETFs/funds, and cash exposure.</span></div>';
    if (assetTarget) assetTarget.innerHTML = empty;
    if (cashTarget) cashTarget.innerHTML = "";
    return;
  }
  const assetRows = [assetMix.individualStock, assetMix.normalEtf || assetMix.etf, assetMix.leveragedEtf].filter(Boolean);
  if (assetTarget) {
    assetTarget.innerHTML = assetRows.length
      ? assetRows.map((row) => renderRiskDecisionRow(row, "Inspect holdings")).join("")
      : '<div class="empty"><strong>No stock or ETF rows available.</strong><span>Import holdings to populate the asset-mix view.</span></div>';
  }
  if (cashTarget) {
    cashTarget.innerHTML = cashExposure
      ? `<h3>Cash Exposure</h3>${renderRiskDecisionRow(cashExposure, "Review cash plan")}<p class="section-note">Cash and money market positions are shown separately because high cash creates deployment decisions instead of equity drawdown risk.</p>`
      : '<div class="empty"><strong>No cash row available.</strong><span>Cash exposure appears here when money-market or cash positions are imported.</span></div>';
  }
}

function renderRiskCorrelationPanel(correlation = {}, uiState = "SAMPLE_MODE") {
  const target = byId("riskCorrelationPanel");
  if (!target) return;
  if (!isImportedState(uiState)) {
    target.innerHTML = '<div class="empty"><strong>No overlap read yet.</strong><span>Import holdings to identify positions that may move together.</span></div>';
    return;
  }
  const groups = correlation.groups || [];
  const measuredPairs = correlation.measuredPairs || [];
  target.innerHTML = `
    <article class="risk-row ${escapeHtml(correlation.status || "normal")}">
      <div class="risk-row-main">
        <b>${escapeHtml(correlation.label || "Correlation and overlap")}</b>
        <span>${escapeHtml(correlation.explanation || "Refresh market data history to calculate measured correlations.")}</span>
      </div>
      <div class="risk-row-value">
        ${renderRiskStatusBadge(correlation.status || "normal")}
      </div>
    </article>
    ${measuredPairs.length ? `
      <h3>Measured pairs</h3>
      ${measuredPairs.map((pair) => `
        <article class="risk-row ${escapeHtml(pair.status || "normal")}">
          <div class="risk-row-main">
            <b>${renderTickerChips(pair.tickers || [])}</b>
            <span>${escapeHtml(pair.explanation || "Measured from available historical price returns.")}</span>
          </div>
          <div class="risk-row-value">
            <b>${escapeHtml(pair.correlationLabel || number.format(pair.correlation || 0))}</b>
            <span>${formatPct(pair.weight || 0)} shared weight</span>
            <span>${Number(pair.observations) || 0} return points</span>
            ${renderRiskStatusBadge(pair.status || "normal")}
          </div>
        </article>
      `).join("")}
    ` : ""}
    ${groups.length ? "<h3>Theme overlap</h3>" : ""}
    ${groups.length ? groups.map((group) => `
      <article class="risk-row ${escapeHtml(group.weight >= 0.35 ? "high" : "elevated")}">
        <div class="risk-row-main">
          <b>${escapeHtml(group.name)}</b>
          <span>${escapeHtml(group.explanation)}</span>
          <div class="ticker-chips">${renderTickerChips(group.tickers)}</div>
        </div>
        <div class="risk-row-value">
          <b>${formatPct(group.weight)}</b>
          <span>shared theme</span>
        </div>
      </article>
    `).join("") : !measuredPairs.length ? '<div class="empty"><strong>No obvious multi-holding overlap.</strong><span>Refresh market data history to calculate measured correlations, or import holdings with theme/classification tags.</span></div>' : ""}
  `;
}

function renderRiskDecisionRow(row = {}, ctaLabel = "Inspect") {
  const tickers = row.tickers || [];
  const headline = tickers.length === 1 ? renderTickerLink(tickers[0]) : escapeHtml(row.name || "Risk row");
  const subtitle = row.label ? `<span>${escapeHtml(row.label)}</span>` : "";
  const chips = !row.label && tickers.length > 1 ? `<div class="ticker-chips">${renderTickerChips(tickers)}</div>` : "";
  return `
    <article class="risk-row ${escapeHtml(row.status || "normal")}">
      <div class="risk-row-main">
        <b>${headline}</b>
        ${subtitle}
        ${chips}
        <p>${escapeHtml(row.explanation || "Review this exposure in context.")} ${escapeHtml(riskReviewPrompt(row.status || "normal"))}</p>
      </div>
      <div class="risk-row-value">
        <b>${formatCompact(row.value)}</b>
        <span>${formatPct(row.weight)}</span>
        ${renderRiskStatusBadge(row.status || "normal")}
        <a class="button-link compact-link" href="${escapeHtml(row.href || "#holdings")}">${escapeHtml(ctaLabel)}</a>
      </div>
    </article>
  `;
}

function renderRiskStatusBadge(status = "normal") {
  return `<span class="risk-status ${escapeHtml(status)}">${escapeHtml(titleCase(status))}</span>`;
}

function riskReviewPrompt(status = "normal") {
  const normalized = String(status || "normal").toLowerCase();
  if (normalized === "extreme") return "Review sizing and assumptions before adding exposure.";
  if (normalized === "high") return "Check whether this exposure still matches targets and thesis.";
  if (normalized === "elevated") return "Monitor this exposure and confirm it is intentional.";
  return "No immediate action implied.";
}

function renderRiskPanel(risk, overview, uiState = "SAMPLE_MODE") {
  const target = byId("riskPanel");
  if (!target) return;
  if (!isImportedState(uiState)) {
    target.innerHTML = '<div class="empty"><strong>No real risk analytics yet.</strong><span>Import a Fidelity CSV to calculate concentration, overlap, beta, and stress tests from Tucker’s actual holdings.</span></div>';
    return;
  }
  target.innerHTML = `
    <div class="risk-grid">
      <div class="risk-stat"><span>Concentration score</span><b>${risk.concentrationScore}/100</b></div>
      <div class="risk-stat"><span>Top 5 holdings</span><b>${formatPct(risk.top5Weight)}</b></div>
      <div class="risk-stat"><span>Top 10 holdings</span><b>${formatPct(risk.top10Weight)}</b></div>
      <div class="risk-stat"><span>Beta estimate</span><b>${number.format(risk.betaEstimate)}</b></div>
      <div class="risk-stat"><span>QQQ/VGT/NVDA stack</span><b>${formatCurrency(risk.overlap.qqqVgtNvdaStack)}</b></div>
      <div class="risk-stat"><span>Semiconductor stack</span><b>${formatCurrency(risk.overlap.semiconductorStack)}</b></div>
    </div>
    <h3>Stress Tests</h3>
    <div class="stress-list">
      ${risk.stressTests.map((test) => `
        <div class="stress-row">
          <span>${escapeHtml(test.name)}</span>
          <b class="negative">${formatSignedCurrency(test.impact)}</b>
          <small>${formatPct(divide(test.impact, overview.totalValue))}</small>
        </div>
      `).join("")}
    </div>
    <h3>Top Risk Contributors</h3>
    <div class="mini-list">
      ${risk.riskContributors.slice(0, 10).map((holding) => `
        <div><span>${renderTickerLink(holding.ticker)}</span><b>${holding.riskScore}/100</b><small>${formatPct(holding.portfolioWeight)}</small></div>
      `).join("")}
    </div>
  `;
}

function renderDataQuality(dataQuality, portfolioQuality, uiState = "SAMPLE_MODE") {
  const target = byId("dataQualityPanel");
  if (!target) return;
  if (!isImportedState(uiState)) {
    target.innerHTML = '<div class="empty"><strong>No CSV imported.</strong><span>Data quality checks appear after a real portfolio import.</span></div>';
    return;
  }
  const metrics = portfolioQuality ? `
    <div class="quality-summary">
      <div class="quality-status ${escapeHtml(portfolioQuality.status.replaceAll(" ", "-"))}">
        <b>Data quality status</b>
        <span>${escapeHtml(portfolioQuality.status)}</span>
      </div>
      ${qualityMetric("Imported total", formatCurrency(portfolioQuality.importedTotalMarketValue))}
      ${qualityMetric("Accounts", portfolioQuality.accountCount)}
      ${qualityMetric("Holdings", portfolioQuality.holdingCount)}
      ${qualityMetric("Cash", formatPct(portfolioQuality.cashPercentage))}
      ${qualityMetric("Top 10 weight", formatPct(portfolioQuality.top10HoldingsPercentage))}
      ${qualityMetric("Missing cost basis", portfolioQuality.missingCostBasisCount)}
      ${qualityMetric("Skipped non-holding rows", portfolioQuality.rejectedNonHoldingRows)}
      ${qualityMetric("File date", portfolioQuality.detectedFileDate || "Unknown")}
    </div>
  ` : "";
  const issues = dataQuality.issueCount
    ? dataQuality.issues.slice(0, 12).map((item) => `<div class="quality-item"><b>${escapeHtml(item.type)}</b><span>${escapeHtml(item.message)}</span></div>`).join("")
    : '<div class="empty">No data quality issues detected.</div>';
  const warnings = portfolioQuality?.warnings?.length
    ? `<div class="quality-warnings"><b>Post-import warnings</b><ul>${portfolioQuality.warnings.slice(0, 8).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`
    : "";

  target.innerHTML = `${metrics}${warnings}${issues}`;
}

export function buildTickerDetailModel(analysis = {}, options = {}) {
  const ticker = normalizeTickerSymbol(options.selectedTicker || "");
  if (!ticker) return null;
  const realPortfolio = isRealPortfolioUiState(options.uiState || "NO_DATA");
  const holdings = (analysis.holdings || []).filter((holding) => normalizeTickerSymbol(holding.ticker) === ticker);
  const quote = options.marketDataSnapshot?.quotesByTicker?.[ticker] ||
    (options.marketDataSnapshot?.quotes || []).find((row) => normalizeTickerSymbol(row.ticker) === ticker) ||
    null;
  const thesisRow = (options.thesisRows || []).find((row) => normalizeTickerSymbol(row.ticker) === ticker) || null;
  const tickerSignal = (options.tickerSignals || []).find((row) => normalizeTickerSymbol(row.ticker) === ticker) || null;
  const watchlistIdea = (options.allWatchlistIdeaRows || options.watchlistIdeaRows || [])
    .find((row) => normalizeTickerSymbol(row.ticker) === ticker) || null;
  const journalEntries = (options.allJournalRows || options.journalRows || [])
    .filter((row) => normalizeTickerSymbol(row.ticker) === ticker)
    .sort((a, b) => timestampSortValue(b.dateTime) - timestampSortValue(a.dateTime))
    .slice(0, 6);
  const redditSummary = summarizeRedditMentions(options.redditMentions || [])
    .find((row) => normalizeTickerSymbol(row.ticker) === ticker) || null;
  const redditMentions = (options.redditMentions || [])
    .filter((record) => redditMentionTickers(record).includes(ticker))
    .sort((a, b) => timestampSortValue(b.createdAt || b.detectedAt || b.sourceAsOf) - timestampSortValue(a.createdAt || a.detectedAt || a.sourceAsOf))
    .slice(0, 8);
  const xSummary = summarizeXUpdates(options.xUpdates || [])
    .find((row) => normalizeTickerSymbol(row.ticker) === ticker) || null;
  const xUpdates = (options.xUpdates || [])
    .filter((record) => normalizeTickerSymbol(record.ticker) === ticker || (record.extractedTickers || []).map(normalizeTickerSymbol).includes(ticker))
    .sort((a, b) => timestampSortValue(b.createdAt || b.detectedAt || b.sourceAsOf) - timestampSortValue(a.createdAt || a.detectedAt || a.sourceAsOf))
    .slice(0, 8);
  const politicianTrades = (options.politicianTrades || [])
    .filter((trade) => normalizeTickerSymbol(trade.ticker) === ticker)
    .sort((a, b) => String(b.disclosureDate || b.disclosedAt || "").localeCompare(String(a.disclosureDate || a.disclosedAt || "")));
  const alerts = (analysis.alerts || [])
    .filter((alert) => normalizeTickerSymbol(alert.ticker) === ticker || RegExp(`\\b${escapeRegExp(ticker)}\\b`, "i").test(`${alert.title || ""} ${alert.detail || ""}`))
    .slice(0, 10);
  const alphaSignals = (options.alphaSignals || [])
    .filter((signal) => eventTickers(signal).includes(ticker))
    .sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0))
    .slice(0, 4);
  const marketEvents = (options.marketEvents || [])
    .filter((event) => eventTickers(event).includes(ticker))
    .slice(0, 4);
  const calendarEvents = (options.allCalendarEvents || options.calendarEvents || [])
    .filter((event) => eventCalendarTickers(event).includes(ticker))
    .sort((a, b) => timestampSortValue(a.date || a.timestamp) - timestampSortValue(b.date || b.timestamp))
    .slice(0, 8);
  const totalValue = Number(analysis.overview?.totalValue) || 0;
  const marketValue = holdings.reduce((sum, holding) => sum + (Number(holding.marketValue) || 0), 0);
  const shares = holdings.reduce((sum, holding) => sum + (Number(holding.shares) || 0), 0);
  const hasPositionRows = Boolean(holdings.length);
  const dailyChangeTotal = holdings.reduce((sum, holding) => sum + (Number(holding.dailyChange) || 0), 0);
  const dailyChangeAvailable = hasPositionRows && holdings.some((holding) => (Number(holding.dailyChange) || 0) !== 0 || (Number(holding.dailyChangePercent) || 0) !== 0);
  const dailyChange = dailyChangeAvailable ? dailyChangeTotal : null;
  const costBasis = holdings.reduce((sum, holding) => sum + (Number(holding.costBasis) || 0), 0);
  const accounts = aggregateTickerAccounts(holdings);
  const firstHolding = holdings[0] || {};
  const historicalPrices = normalizeHistoricalPrices(quote?.historicalPrices || firstHolding.marketDataHistoricalPrices || []);
  const tracked = Boolean(holdings.length || quote || tickerSignal || watchlistIdea || journalEntries.length || redditSummary || xSummary || politicianTrades.length || alerts.length || alphaSignals.length || marketEvents.length || calendarEvents.length);
  const samplePosition = Boolean(holdings.length && !realPortfolio);
  const owned = Boolean(holdings.length && realPortfolio);
  const savedWatchlistIdea = isSavedWatchlistIdea(watchlistIdea);
  const watchlistOnly = !owned && !samplePosition && Boolean(savedWatchlistIdea || tickerSignal?.watchlistFlag);
  const derivedSignalIdea = !owned && !samplePosition && Boolean(watchlistIdea?.derived && !savedWatchlistIdea);
  const displayPrice = quote?.price ?? (shares ? marketValue / shares : firstHolding.price);
  const priceAvailable = Number.isFinite(Number(displayPrice)) && (Boolean(quote) || hasPositionRows);
  const model = {
    ticker,
    name: firstHolding.name || quote?.name || ticker,
    owned,
    samplePosition,
    positionSource: owned ? "Imported" : samplePosition ? "Sample" : watchlistOnly ? "Watchlist" : tracked ? "Signal" : "None",
    tracked,
    watchlistOnly,
    savedWatchlistIdea,
    derivedSignalIdea,
    externallyDiscovered: !owned && tracked && !watchlistOnly,
    holdings,
    accounts,
    quote,
    historicalPrices,
    thesisRow,
    tickerSignal,
    watchlistIdea,
    journalEntries,
    redditSummary,
    redditMentions,
    xSummary,
    xUpdates,
    politicianTrades,
    alerts,
    alphaSignals,
    marketEvents,
    calendarEvents,
    marketValue,
    shares,
    dailyChange,
    dailyChangeAvailable,
    costBasis,
    portfolioWeight: totalValue ? marketValue / totalValue : 0,
    averagePrice: priceAvailable ? Number(displayPrice) : 0,
    displayPrice: priceAvailable ? Number(displayPrice) : null,
    priceAvailable,
    unrealizedGainPercent: costBasis ? (marketValue - costBasis) / costBasis : 0,
    sector: firstHolding.sector || watchlistIdea?.sector || quote?.sector || "Unknown",
    industry: quote?.industry || firstHolding.marketDataIndustry || "Unknown",
    assetClass: firstHolding.assetClass || "Watchlist",
    riskLevel: thesisRow?.riskLevel || firstHolding.riskLevel || "Unrated",
    thesisStatus: thesisRow?.thesisStatus || firstHolding.thesisStatus || "No thesis",
    confidenceLevel: thesisRow?.confidenceLevel || watchlistIdea?.conviction || firstHolding.confidenceLevel || "Unrated",
    marketDataStatus: options.marketDataStatus || options.marketDataSnapshot?.status || {},
    providerCoverage: tickerProviderCoverage(options.marketDataStatus || options.marketDataSnapshot?.status || {}, ticker, quote)
  };
  model.thesisRiskSummary = buildThesisRiskSummary(thesisRow || {}, {
    holding: firstHolding,
    sourceMode: options.thesisSummarySourceMode || "local deterministic"
  });
  model.researchLens = buildTickerResearchLens({
    ...firstHolding,
    ticker,
    name: model.name,
    sector: model.sector,
    industry: model.industry,
    assetClass: model.assetClass,
    strategySleeve: firstHolding.strategySleeve || watchlistIdea?.status || "",
    riskLevel: model.riskLevel,
    portfolioWeight: model.portfolioWeight,
    marketValue: model.marketValue,
    price: quote?.price ?? firstHolding.price,
    marketDataPrice: quote?.price,
    dailyChangePercent: quote?.dailyChangePercent ?? firstHolding.dailyChangePercent,
    volume: quote?.volume ?? firstHolding.marketDataVolume,
    marketDataVolume: quote?.volume ?? firstHolding.marketDataVolume,
    marketCap: quote?.marketCap ?? firstHolding.marketDataMarketCap,
    marketDataMarketCap: quote?.marketCap ?? firstHolding.marketDataMarketCap,
    fiftyTwoWeekHigh: quote?.fiftyTwoWeekHigh ?? firstHolding.marketData52WeekHigh,
    fiftyTwoWeekLow: quote?.fiftyTwoWeekLow ?? firstHolding.marketData52WeekLow,
    forwardPe: firstHolding.forwardPe,
    priceToSales: firstHolding.priceToSales,
    dividendYield: firstHolding.dividendYield,
    thesisAvailable: Boolean(thesisRow),
    positionAvailable: Boolean(holdings.length),
    quoteAvailable: Boolean(quote),
    signalAvailable: Boolean(tickerSignal)
  });
  model.technicalAnalysis = buildTechnicalAnalysisSnapshot(historicalPrices, {
    ticker,
    sourceLabel: tickerMarketDataSourceLabel(model)
  });
  model.dataQuality = buildTickerDataQuality(model);
  model.movementExplainer = buildTickerMovementExplainer(model, {
    marketDataSnapshot: options.marketDataSnapshot,
    asOf: options.asOf
  });
  return model;
}

function renderTickerDetailPage(analysis = {}, options = {}) {
  const panel = byId("tickerDetailPanel");
  if (!panel) return;
  const model = buildTickerDetailModel(analysis, options);
  const eyebrow = byId("tickerDetailEyebrow");
  const title = byId("tickerDetailTitle");
  const description = byId("tickerDetailDescription");

  if (!model) {
    if (eyebrow) eyebrow.textContent = "Ticker";
    if (title) title.textContent = "Ticker intelligence.";
    if (description) description.textContent = "Click any ticker symbol to open ownership, risk, thesis, and source-labeled signal context.";
    panel.innerHTML = '<div class="empty"><strong>No ticker selected.</strong><span>Open Holdings, Risk, Alerts, or Market Intelligence and choose a ticker.</span></div>';
    return;
  }

  if (eyebrow) eyebrow.textContent = model.owned ? "Owned ticker" : model.samplePosition ? "Sample ticker" : model.tracked ? "Tracked ticker" : "Ticker lookup";
  if (title) title.textContent = `${model.ticker} intelligence.`;
  if (description) description.textContent = `${model.name} ownership, quote/cache context, thesis notes, and related local signals.`;

  const quote = model.quote;
  const hasMove = Boolean(quote) || model.dailyChangeAvailable;
  const move = quote ? Number(quote.dailyChangePercent || 0) : model.dailyChangeAvailable ? divide(model.dailyChange, Math.max(model.marketValue - model.dailyChange, 1)) : null;
  const moveAmount = quote ? Number(quote.dailyChange || 0) : Number(model.dailyChange || 0);
  const marketStatus = model.marketDataStatus?.label || quote?.providerLabel || "Market data not configured";
  const marketStatusClass = marketDataBadgeClass(model.marketDataStatus, quote);
  const marketFreshnessLine = marketDataFreshnessLine(model.marketDataStatus, quote);
  panel.innerHTML = `
    ${model.tracked ? "" : `<div class="empty"><strong>${escapeHtml(model.ticker)} is not in local holdings or sample watch data.</strong><span>Add it to holdings/watchlist data later to populate this page.</span></div>`}
    <div class="connector-actions ticker-context-actions" aria-label="Ticker page shortcuts">
      <a class="button-link" href="#holdings">Back to Holdings</a>
      <a class="button-link" href="#risk">Review Risk</a>
      <a class="button-link" href="#alpha">Open Alpha</a>
      <a class="button-link" href="#watchlist">${model.watchlistOnly || model.savedWatchlistIdea ? "Open Watchlist" : "Add research note"}</a>
      <a class="button-link" href="#journal">Log Decision</a>
    </div>
    <div class="ticker-detail-grid">
      <div class="ticker-hero">
        <article class="ticker-price-card">
          <div class="badge-row">
            <span class="status-badge ${model.owned ? "safe" : model.watchlistOnly ? "demo" : "sample"}">${escapeHtml(tickerOwnershipLabel(model))}</span>
            <span class="status-badge ${marketStatusClass}">${escapeHtml(marketStatus)}</span>
            <span class="status-badge">${escapeHtml(model.sector)}</span>
          </div>
          <strong>${model.priceAvailable ? formatCurrency(model.displayPrice) : "Quote unavailable"}</strong>
          <span class="${moveAmount >= 0 ? "positive" : "negative"}">
            ${hasMove ? `${quote ? formatSignedCurrency(quote.dailyChange) : formatSignedCurrency(model.dailyChange)} ${formatSignedPct(move)}` : "Not available"}
          </span>
          <p class="section-note">${escapeHtml(marketDataDisplayDetail(model.marketDataStatus))}</p>
          ${marketFreshnessLine ? `<p class="section-note">${escapeHtml(marketFreshnessLine)}</p>` : ""}
          ${renderTickerFactorStrip(model, { compact: true })}
        </article>
        <div class="ticker-stat-grid">
          <div><span>Position value</span><b>${model.owned || model.samplePosition ? formatCurrency(model.marketValue) : "Not currently owned"}</b></div>
          <div><span>${model.samplePosition ? "Sample weight" : "Portfolio weight"}</span><b>${model.owned || model.samplePosition ? formatPct(model.portfolioWeight) : "Not available"}</b></div>
          <div><span>Shares</span><b>${model.owned || model.samplePosition ? formatNumber(model.shares) : "Not available"}</b></div>
          <div><span>Daily move impact</span><b class="${Number(model.dailyChange || 0) >= 0 ? "positive" : "negative"}">${(model.owned || model.samplePosition) && model.dailyChangeAvailable ? formatSignedCurrency(model.dailyChange) : "Not available"}</b></div>
          <div><span>Open</span><b>${formatMarketDataValue(quote?.dayOpen, formatCurrency)}</b></div>
          <div><span>Day high</span><b>${formatMarketDataValue(quote?.dayHigh, formatCurrency)}</b></div>
          <div><span>Day low</span><b>${formatMarketDataValue(quote?.dayLow, formatCurrency)}</b></div>
          <div><span>Market cap</span><b>${formatMarketDataValue(quote?.marketCap, formatCompact)}</b></div>
          <div><span>Volume</span><b>${formatMarketDataValue(quote?.volume, formatNumber)}</b></div>
          <div><span>52-week high</span><b>${formatMarketDataValue(quote?.fiftyTwoWeekHigh, formatCurrency)}</b></div>
          <div><span>52-week low</span><b>${formatMarketDataValue(quote?.fiftyTwoWeekLow, formatCurrency)}</b></div>
        </div>
      </div>
      <div class="ticker-hero">
        ${renderTickerThesisSummaryCard(model)}
        ${renderTickerWatchlistIdeaCard(model)}
        <article class="ticker-note-card">
          <span>Sector / industry</span>
          <b>${escapeHtml(model.sector)}</b>
          <p>${escapeHtml(model.industry)} · ${escapeHtml(model.assetClass)} · risk ${escapeHtml(model.riskLevel)}</p>
        </article>
        <article class="ticker-note-card">
          <span>Market data status</span>
          <b>${escapeHtml(dataModeLabel(marketDataMode(model.marketDataStatus, quote)))}</b>
          <p>${escapeHtml(model.marketDataStatus?.detail || "Market data provider: Not configured. Sample data keeps screens wired for later APIs.")}</p>
          ${marketFreshnessLine ? `<p>${escapeHtml(marketFreshnessLine)}</p>` : ""}
        </article>
      </div>
    </div>
    ${renderTickerResearchOverview(model)}
    <div class="grid-two">
      ${renderTickerPositionExposure(model)}
      ${renderTickerPriceTrend(model)}
    </div>
    ${renderTickerTechnicalAnalysis(model)}
    ${renderTickerQuantLens(model)}
    ${renderTickerPredictionModel(model)}
    ${renderTickerMovementExplainer(model)}
    ${renderTickerRecentExternalUpdates(model)}
    ${renderTickerEventCalendar(model)}
    <div class="grid-two">
      ${renderTickerRedditTrend(model)}
      ${renderTickerPoliticianActivity(model)}
    </div>
    <div class="grid-two">
      ${renderTickerThesisRisk(model)}
      ${renderTickerAlertHistory(model)}
    </div>
    ${renderTickerJournalHistory(model)}
    <div class="grid-two">
      <section class="panel">
        <div class="panel-head"><div><h2>Signal Snapshot</h2><p>Explainable confluence and local intelligence context.</p></div></div>
        <div class="body-pad mini-list">
          ${tickerSignalSummary(model)}
          ${redditSignalSummary(model)}
          ${politicianSignalSummary(model)}
        </div>
      </section>
      ${renderTickerDataQuality(model)}
    </div>
    <section class="panel">
      <div class="panel-head"><div><h2>Related Market Read-Throughs</h2><p>Sample Alpha and Market Intelligence items linked to ${escapeHtml(model.ticker)}.</p></div></div>
      <div class="body-pad mini-list">
        ${tickerRelatedSignals(model)}
      </div>
    </section>
  `;
}

function renderTickerRecentExternalUpdates(model) {
  const rows = buildTickerRecentExternalUpdateRows(model).slice(0, 8);
  const latest = rows[0]?.dateLabel || "No recent rows";
  const statusLine = [
    model.xUpdates.length ? `${model.xUpdates.length} X/social` : "X: Not configured or no rows",
    model.redditMentions.length ? `${model.redditMentions.length} Reddit/social` : "Reddit: Not configured or no rows",
    model.alphaSignals.length || model.marketEvents.length ? `${model.alphaSignals.length + model.marketEvents.length} news/read-through` : "News/read-throughs: none linked",
    model.politicianTrades.length ? `${model.politicianTrades.length} federal disclosure` : "Federal disclosures: none linked"
  ].join(" · ");
  return `
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Recent Social, News & Disclosure Updates</h2>
          <p>Source-labeled ticker context from Reddit/social imports, Alpha/news read-throughs, and federal disclosure rows.</p>
        </div>
        <span class="status-badge ${rows.length ? "" : "demo"}">${escapeHtml(latest)}</span>
      </div>
      <div class="body-pad">
        <div class="provider-status-note">
          <b>${escapeHtml(rows.length ? `${rows.length} recent update${rows.length === 1 ? "" : "s"}` : "No linked external updates")}</b>
          <span>${escapeHtml(statusLine)}. Social/disclosure rows are context only; verify against primary sources before changing thesis or sizing.</span>
        </div>
        <div class="mini-list ticker-section-list">
          ${rows.length ? rows.map((row) => `
            <div class="ticker-update-row ${escapeHtml(row.tone)}">
              <span>${escapeHtml(row.kind)} · ${escapeHtml(row.status)} · ${escapeHtml(row.dateLabel)}</span>
              <b>${escapeHtml(row.title)}</b>
              <small>${escapeHtml(row.detail)}</small>
              ${row.href && row.href !== "#" ? `<a class="compact-link" href="${escapeHtml(row.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(row.linkLabel)}</a>` : ""}
            </div>
          `).join("") : `
            <div class="empty">
              <strong>No recent source-labeled updates for ${escapeHtml(model.ticker)}.</strong>
              <span>Reddit/X-style social rows, Alpha/news read-throughs, and federal disclosure imports will appear here when they map to this ticker. The app will not invent missing external context.</span>
            </div>
          `}
        </div>
      </div>
    </section>
  `;
}

function buildTickerRecentExternalUpdateRows(model = {}) {
  const xRows = (model.xUpdates || []).map((update) => ({
    kind: "X / social",
    status: xUpdateSourceLabel(update),
    title: summaryText(update.text || update.body || update.title, 110) || "X/social update",
    detail: [
      `engagement ${formatNumber(update.engagementScore ?? update.score ?? 0)}`,
      update.sentiment ? `sentiment ${update.sentiment}` : "sentiment not scored",
      "no author data stored"
    ].filter(Boolean).join(" · "),
    href: safeExternalHref(update.sourceUrl || update.url || "#"),
    linkLabel: "Open source",
    timestamp: timestampSortValue(update.createdAt || update.detectedAt || update.sourceAsOf),
    dateLabel: shortDateTime(update.createdAt || update.detectedAt || update.sourceAsOf),
    tone: "social"
  }));
  const redditRows = (model.redditMentions || []).map((mention) => ({
    kind: /x|twitter/i.test(`${mention.sourceType || ""} ${mention.platform || ""} ${mention.sourceName || ""}`) ? "X / social" : "Reddit / social",
    status: redditMentionSourceLabel(mention),
    title: summaryText(redditMentionText(mention), 110) || "Social mention record",
    detail: [
      mention.subreddit ? `r/${mention.subreddit}` : mention.platform || "social source",
      `score ${formatNumber(mention.score ?? mention.upvotes ?? mention.engagementScore ?? 0)}`,
      mention.sentiment ? `sentiment ${mention.sentiment}` : "sentiment not scored",
      mention.citesPrimarySource ? "cites primary source" : "no primary-source citation"
    ].filter(Boolean).join(" · "),
    href: safeExternalHref(mention.sourceUrl || mention.url || "#"),
    linkLabel: "Open source",
    timestamp: timestampSortValue(mention.createdAt || mention.detectedAt || mention.sourceAsOf),
    dateLabel: shortDateTime(mention.createdAt || mention.detectedAt || mention.sourceAsOf),
    tone: "social"
  }));
  const disclosureRows = (model.politicianTrades || []).map((trade) => ({
    kind: "Federal disclosure",
    status: politicianTradeSourceLabel(trade),
    title: `${titleCase(trade.transactionType || "unknown")} · ${trade.politicianName || "Unknown official"}`,
    detail: [
      formatTradeRange(trade),
      [trade.chamber, trade.party, trade.state].filter(Boolean).join(" "),
      `traded ${trade.transactionDate || trade.tradedAt || "unknown"}`,
      `disclosed ${trade.disclosureDate || trade.disclosedAt || "unknown"}`
    ].filter(Boolean).join(" · "),
    href: safeExternalHref(trade.sourceUrl || "#"),
    linkLabel: "Open disclosure",
    timestamp: timestampSortValue(trade.disclosureDate || trade.disclosedAt || trade.transactionDate || trade.tradedAt),
    dateLabel: shortDateTime(trade.disclosureDate || trade.disclosedAt || trade.transactionDate || trade.tradedAt),
    tone: "disclosure"
  }));
  const alphaRows = (model.alphaSignals || []).map((signal) => {
    const firstLink = (signal.sourceLinks || []).find((link) => link?.url);
    return {
      kind: "Alpha / news",
      status: signal.sourceName || signal.sourceType || "Alpha Engine",
      title: signal.headline || signal.title || "Alpha read-through",
      detail: signal.whyThisMattersToTucker || signal.actionabilityReason || signal.summary || "Review source and thesis impact.",
      href: safeExternalHref(firstLink?.url || signal.sourceUrl || "#"),
      linkLabel: firstLink?.label || "Open source",
      timestamp: timestampSortValue(signal.detectedAt || signal.timestamp || signal.sourceAsOf),
      dateLabel: shortDateTime(signal.detectedAt || signal.timestamp || signal.sourceAsOf),
      tone: "news"
    };
  });
  const marketRows = (model.marketEvents || []).map((event) => {
    const firstLink = (event.sourceLinks || []).find((link) => link?.url);
    return {
      kind: "Market / news",
      status: event.sourceName || event.source || event.sourceType || "Market Intelligence",
      title: event.title || "Market read-through",
      detail: event.portfolioReadThrough || event.summary || event.suggestedAction || "Review linked event context.",
      href: safeExternalHref(firstLink?.url || event.sourceUrl || event.url || "#"),
      linkLabel: firstLink?.label || "Open source",
      timestamp: timestampSortValue(event.detectedAt || event.timestamp || event.sourceAsOf || event.date),
      dateLabel: shortDateTime(event.detectedAt || event.timestamp || event.sourceAsOf || event.date),
      tone: "news"
    };
  });
  return [...xRows, ...redditRows, ...disclosureRows, ...alphaRows, ...marketRows]
    .sort((a, b) => b.timestamp - a.timestamp || a.kind.localeCompare(b.kind));
}

function renderTickerResearchOverview(model) {
  const lens = model.researchLens || {};
  const sa = lens.seekingAlphaSnapshot || {};
  const owner = lens.buffettChecklist || {};
  const valuation = lens.valuationContext || {};
  const source = lens.sourceSummary || {};
  const checklist = owner.checklist || [];
  return `
    <section class="panel research-terminal-panel">
      <div class="panel-head">
        <div>
          <h2>Research Snapshot</h2>
          <p>Seeking Alpha-style factors plus a Buffett-style owner checklist. Decision support only.</p>
        </div>
        <div class="badge-row">
          <span class="status-badge ${sa.averageScore >= 78 ? "safe" : sa.averageScore >= 58 ? "demo" : "sample"}">${escapeHtml(sa.ratingLabel || "No factor import")}</span>
          <span class="status-badge ${owner.score >= 74 ? "safe" : owner.score >= 56 ? "demo" : "sample"}">${escapeHtml(owner.label || "Owner lens")}</span>
        </div>
      </div>
      <div class="body-pad">
        <div class="research-quote-grid">
          <article class="research-summary-card">
            <span>Factor view</span>
            <b>${escapeHtml(sa.averageScore ? `${sa.averageScore}/100` : "Missing")}</b>
            <p>${escapeHtml(sa.summary || "No imported factor fields yet.")}</p>
            ${renderTickerFactorStrip(model)}
          </article>
          <article class="research-summary-card">
            <span>Long-term owner lens</span>
            <b>${escapeHtml(owner.score ? `${owner.score}/100 · ${owner.label}` : "Needs evidence")}</b>
            <p>${escapeHtml(owner.summary || "No owner-quality summary available yet.")}</p>
            <small>${escapeHtml(owner.posture || "Use this as a research checklist, not a trading instruction.")}</small>
          </article>
          <article class="research-summary-card">
            <span>Margin of safety</span>
            <b>${escapeHtml(valuation.label || "Not enough data")}</b>
            <p>${escapeHtml(valuation.note || "Valuation fields are missing. The app will not invent intrinsic value.")}</p>
            <small>${escapeHtml(source.label || "limited local context")}</small>
          </article>
        </div>
        <div class="owner-checklist-grid">
          ${checklist.map((item) => `
            <div class="owner-checklist-card ${escapeHtml(cssToken(item.status))}">
              <span>${escapeHtml(item.label)}</span>
              <b>${escapeHtml(item.score)}/100</b>
              <p>${escapeHtml(item.evidence)}</p>
              ${(item.watchItems || []).length ? `<small>${escapeHtml(item.watchItems[0])}</small>` : ""}
            </div>
          `).join("")}
        </div>
        <details class="signal-details">
          <summary>Research gaps and watch items</summary>
          <div class="grid-two">
            <div>
              <h3>Missing evidence</h3>
              ${(owner.missingEvidence || source.missing || []).length ? list((owner.missingEvidence || source.missing || []).slice(0, 8)) : "<p>No major missing evidence listed.</p>"}
            </div>
            <div>
              <h3>Watch items</h3>
              ${(owner.watchItems || []).length ? list(owner.watchItems.slice(0, 8)) : "<p>No special owner-checklist watch item yet.</p>"}
            </div>
          </div>
          <p>This panel does not calculate intrinsic value, owner earnings, or a buy/sell signal unless the required source data is imported or provided.</p>
        </details>
      </div>
    </section>
  `;
}

function renderTickerFactorStrip(model, options = {}) {
  const factors = model.researchLens?.seekingAlphaSnapshot?.factors || [];
  const visible = factors.slice(0, options.compact ? 4 : factors.length);
  if (!visible.length) return "";
  return `
    <div class="sa-factor-strip ${options.compact ? "compact" : ""}" aria-label="Seeking Alpha-style factor grades">
      ${visible.map((factor) => `
        <div class="sa-factor ${escapeHtml(factor.tone)}">
          <span>${escapeHtml(factor.label)}</span>
          <b>${escapeHtml(factor.value)}</b>
        </div>
      `).join("")}
    </div>
  `;
}

function renderTickerMovementExplainer(model) {
  const explainer = model.movementExplainer;
  if (!explainer) {
    return `
      <section class="panel">
        <div class="panel-head"><div><h2>Why Is This Moving?</h2><p>Structured movement context.</p></div></div>
        <div class="body-pad">
          <div class="empty"><strong>No movement context available.</strong><span>The app needs quote or imported daily-change data before it can summarize movement.</span></div>
        </div>
      </section>
    `;
  }
  return `
    <section class="panel">
      <div class="panel-head">
        <div><h2>Why Is This Moving?</h2><p>Deterministic context from price, volume, events, alerts, and local signals.</p></div>
        <span class="status-badge ${explainer.confidence.score >= 70 ? "safe" : explainer.confidence.score >= 45 ? "sample" : ""}">${escapeHtml(explainer.confidence.label)}</span>
      </div>
      <div class="body-pad">
        <div class="provider-status-note">
          <b>${escapeHtml(explainer.movementLabel)} · ${escapeHtml(explainer.sourceLabel)}</b>
          <span>${escapeHtml(explainer.summary)}</span>
        </div>
        <div class="mini-list ticker-section-list">
          ${explainer.drivers.length ? explainer.drivers.map((driver) => `
            <div>
              <span>${escapeHtml(driver.label)} · ${escapeHtml(driver.sourceType)}</span>
              <b>${escapeHtml(driver.tone === "negative" ? "Pressure" : driver.tone === "positive" ? "Supportive context" : driver.tone === "watch" ? "Watch closely" : "Context")}</b>
              <small>${escapeHtml(driver.detail)}</small>
            </div>
          `).join("") : '<div class="empty"><strong>No structured drivers found.</strong><span>The app will not invent a news explanation when source data is missing.</span></div>'}
        </div>
        ${explainer.nextChecks.length ? `
          <div class="section-subcard">
            <h3>Next checks</h3>
            <ul class="why-list">${explainer.nextChecks.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
          </div>
        ` : ""}
        <details class="signal-details">
          <summary>Missing context and limitations</summary>
          ${explainer.missingData.length ? `<ul class="why-list">${explainer.missingData.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "<p>No major missing context listed by the deterministic explainer.</p>"}
          <p>${escapeHtml(explainer.confidence.detail)}</p>
          <p>${escapeHtml(explainer.caveat)}</p>
        </details>
      </div>
    </section>
  `;
}

function renderTickerPredictionModel(model) {
  const prediction = stockPredictionFromSignal(model.tickerSignal || {});
  if (!prediction.score) {
    return `
      <section class="panel">
        <div class="panel-head"><div><h2>Transparent Prediction Model</h2><p>Model-implied ticker outlook from local factor and market inputs.</p></div></div>
        <div class="body-pad">
          <div class="empty"><strong>No prediction available.</strong><span>Load quote context, factor inputs, or ticker signals before the prediction model can produce a guarded outlook.</span></div>
        </div>
      </section>
    `;
  }
  return `
    <section class="panel prediction-model-panel">
      <div class="panel-head">
        <div>
          <h2>Transparent Prediction Model</h2>
          <p>Model-implied ${escapeHtml(prediction.horizon || "20 trading days")} outlook. Decision support only, not a valuation target or order instruction.</p>
        </div>
        <div class="badge-row">
          <span class="status-badge ${escapeHtml(predictionBadgeClass(prediction))}">${escapeHtml(prediction.label || "Neutral")}</span>
          <span class="status-badge">${escapeHtml(prediction.sourceMode || "Imported/local")}</span>
          <span class="status-badge">${escapeHtml(prediction.modelVersion || "prediction-v1")}</span>
        </div>
      </div>
      <div class="body-pad">
        <div class="ticker-mini-metrics">
          <div><span>Outlook score</span><b>${formatScore100(prediction.score)}</b><small>${escapeHtml(prediction.direction || "Balanced")}</small></div>
          <div><span>Confidence</span><b>${formatScore100(prediction.confidence)}</b><small>${escapeHtml(prediction.confidenceLabel || "confidence limited")}</small></div>
          <div><span>Horizon</span><b>${escapeHtml(prediction.horizon || "20 trading days")}</b><small>${escapeHtml(prediction.generatedAt ? `as of ${shortDateTime(prediction.generatedAt)}` : "as of current inputs")}</small></div>
          <div><span>Weak signals</span><b>${escapeHtml((prediction.weakSignals || []).length)}</b><small>${escapeHtml((prediction.weakSignals || [])[0] || "no major weak input")}</small></div>
        </div>
        <p class="section-note">${escapeHtml(prediction.summary || "Prediction model assembled from local signal inputs.")}</p>
        <div class="signal-component-list prediction-factor-list">
          ${(prediction.factors || []).map((factor) => `
            <div>
              <span>${escapeHtml(factor.label)}</span>
              <b>${formatScore100(factor.score)}</b>
              <div class="bar"><i style="width:${Math.max(0, Math.min(100, Math.round(Number(factor.score) || 0)))}%"></i></div>
              <small>${escapeHtml(factor.detail || "")} · weight ${escapeHtml(Math.round(Number(factor.weight || 0) * 100))}%</small>
            </div>
          `).join("")}
        </div>
        <details class="signal-details">
          <summary>Model drivers, checks, and limits</summary>
          <div class="grid-two">
            <div>
              <h3>Top drivers</h3>
              ${(prediction.topDrivers || []).length ? list(prediction.topDrivers) : "<p>No standout positive driver.</p>"}
            </div>
            <div>
              <h3>Caveats</h3>
              ${(prediction.caveats || []).length ? list(prediction.caveats) : "<p>No major caveat listed by the model.</p>"}
            </div>
          </div>
          ${(prediction.recommendations || []).length ? `<h3>Next checks</h3>${list(prediction.recommendations)}` : ""}
          <p>${escapeHtml(prediction.guardrail || "Decision support only. Not a valuation target or order instruction.")}</p>
        </details>
      </div>
    </section>
  `;
}

function renderTickerQuantLens(model) {
  const signal = model.tickerSignal || {};
  const factors = signal.institutionalQuantFactors || [];
  const lensName = signal.institutionalQuantSecurityKind === "fund-or-etf" ? "Institutional Exposure Lens" : "Institutional Quant Lens";
  if (!signal.institutionalQuantScore) {
    return `
      <section class="panel">
        <div class="panel-head"><div><h2>${lensName}</h2><p>Quality, valuation, momentum, revisions, risk, liquidity, portfolio fit, and source coverage.</p></div></div>
        <div class="body-pad">
          <div class="empty"><strong>No quant lens yet.</strong><span>Load holdings, market data, or Seeking Alpha-style factor fields to populate this decision-support score.</span></div>
        </div>
      </section>
    `;
  }
  return `
    <section class="panel">
      <div class="panel-head">
        <div><h2>${lensName}</h2><p>Separates durable factors from short-term signal noise. Decision support only, not a return forecast.</p></div>
        <span class="status-badge ${signal.institutionalQuantScore >= 75 ? "safe" : signal.institutionalQuantScore >= 60 ? "demo" : "sample"}">${escapeHtml(signal.institutionalQuantLabel || "Quant lens")}</span>
      </div>
      <div class="body-pad">
        <div class="ticker-mini-metrics">
          <div><span>${signal.institutionalQuantSecurityKind === "fund-or-etf" ? "Exposure lens" : "Quant lens"}</span><b>${formatScore100(signal.institutionalQuantScore)}</b><small>${escapeHtml(signal.institutionalQuantSourceFreshness || "Local/imported inputs")}</small></div>
          <div><span>Confidence</span><b>${formatScore100(signal.institutionalQuantConfidenceScore)}</b><small>${escapeHtml(signal.institutionalQuantDataCoverageLabel || "Source coverage")}</small></div>
          <div><span>Data coverage</span><b>${formatScore100(signal.institutionalQuantDataCoverageScore)}</b><small>${escapeHtml((signal.institutionalQuantDataSufficiencyWarnings || [])[0] || "factor inputs checked")}</small></div>
          <div><span>Peer rank</span><b>${escapeHtml(signal.institutionalQuantPeerRank ? `#${signal.institutionalQuantPeerRank}/${signal.institutionalQuantPeerCount}` : "--")}</b><small>${escapeHtml(signal.institutionalQuantPeerGroup || "peer group unavailable")}</small></div>
          <div><span>Score trend</span><b>${escapeHtml(signal.institutionalQuantScoreTrendLabel || "No prior score")}</b><small>${escapeHtml(signal.institutionalQuantScoreHistoryLabel || "first local score")}</small></div>
          ${signal.institutionalQuantScoreWasEvidenceCapped ? `<div><span>Evidence cap</span><b>${formatScore100(signal.institutionalQuantEvidenceCapScore)}</b><small>${escapeHtml((signal.institutionalQuantEvidenceCapReasons || []).slice(0, 1).join("; ") || "data coverage cap")}</small></div>` : ""}
          <div><span>Weak spots</span><b>${escapeHtml((signal.institutionalQuantMissingData || []).length)}</b><small>missing data points</small></div>
        </div>
        <p class="section-note">${escapeHtml(signal.institutionalQuantExplanation || "Quant lens assembled from local factor data.")}</p>
        <div class="section-subcard">
          <h3>Academic factor discipline</h3>
          <p>${escapeHtml(signal.institutionalQuantAcademicCaveat || "Paper-backed diagnostics keep momentum, quality, value, risk, and validation separate.")}</p>
          ${renderAcademicFactorMiniList(signal.institutionalQuantAcademicFactors || [])}
          ${(signal.institutionalQuantAcademicValidationWarnings || []).length ? `<small>${escapeHtml(signal.institutionalQuantAcademicValidationWarnings.slice(0, 2).join("; "))}</small>` : ""}
        </div>
        <div class="section-subcard">
          <h3>Long-term owner read</h3>
          <p>${escapeHtml(ownerQualityQuantRead(signal))}</p>
          <small>Momentum is secondary evidence here. For long-term review, prioritize business quality, valuation discipline, risk control, and data quality.</small>
        </div>
        <div class="signal-component-list">
          ${factors.map((factor) => `
            <div>
              <span>${escapeHtml(factor.label)}</span>
              <b>${formatScore100(factor.score)}</b>
              <div class="bar"><i style="width:${Math.max(0, Math.min(100, Math.round(Number(factor.score) || 0)))}%"></i></div>
              <small>${escapeHtml(factor.driver || "")}${factor.coverageStatus ? ` · ${escapeHtml(titleCase(factor.coverageStatus))} coverage` : ""}</small>
            </div>
          `).join("")}
        </div>
        <details class="signal-details">
          <summary>Strengths, gaps, and model limits for ${escapeHtml(model.ticker || "this ticker")}</summary>
          <div class="grid-two">
            <div>
              <h3>Strengths</h3>
              ${(signal.institutionalQuantStrengths || []).length ? list(signal.institutionalQuantStrengths) : "<p>No standout factor strength yet.</p>"}
            </div>
            <div>
              <h3>Weak / missing data</h3>
              ${(signal.institutionalQuantWeaknesses || signal.institutionalQuantMissingData || []).length ? list((signal.institutionalQuantWeaknesses || signal.institutionalQuantMissingData).slice(0, 6)) : "<p>No major weak-data warning listed.</p>"}
            </div>
          </div>
          ${signal.institutionalQuantDataSufficiencyWarnings?.length ? `<p><b>Coverage warning:</b> ${escapeHtml(signal.institutionalQuantDataSufficiencyWarnings.join("; "))}</p>` : ""}
          ${signal.institutionalQuantEvidenceCapReasons?.length ? `<p><b>Evidence cap:</b> ${escapeHtml(signal.institutionalQuantEvidenceCapReasons.join("; "))}</p>` : ""}
          ${signal.institutionalQuantPeerSummary ? `<p><b>Peer context:</b> ${escapeHtml(signal.institutionalQuantPeerSummary)} ${escapeHtml(signal.institutionalQuantPeerWarning || "")}</p>` : ""}
          ${signal.institutionalQuantScoreHistoryLabel ? `<p><b>Score history:</b> ${escapeHtml(signal.institutionalQuantScoreHistoryLabel)}.</p>` : ""}
          <p>${escapeHtml(signal.institutionalQuantCaveat || "Decision-support factor score only. Not a buy/sell command.")}</p>
        </details>
      </div>
    </section>
  `;
}

function ownerQualityQuantRead(signal = {}) {
  const factors = signal.institutionalQuantFactorScores || {};
  const quality = Number(factors.quality || 0);
  const valuation = Number(factors.valuation || 0);
  const risk = Number(factors.riskControl || 0);
  const dataQuality = Number(factors.dataQuality || 0);
  const pieces = [
    quality ? `business quality ${Math.round(quality)}/100` : "business quality missing",
    valuation ? `valuation discipline ${Math.round(valuation)}/100` : "valuation discipline missing",
    risk ? `risk control ${Math.round(risk)}/100` : "risk control missing",
    dataQuality ? `data quality ${Math.round(dataQuality)}/100` : "data quality missing"
  ];
  const caveat = signal.institutionalQuantScoreWasEvidenceCapped
    ? " Evidence cap is active because source coverage is incomplete."
    : "";
  return `Owner lens: ${pieces.join("; ")}.${caveat}`;
}

function renderTickerTechnicalAnalysis(model) {
  const technical = model.technicalAnalysis;
  if (!technical || technical.status !== "available") {
    return `
      <section class="panel">
        <div class="panel-head"><div><h2>Technical Signal Context</h2><p>Price-series indicators from local market data history.</p></div></div>
        <div class="body-pad">
          <div class="empty"><strong>No technical context yet.</strong><span>${escapeHtml(technical?.summary || "Refresh market data or import history to calculate trend, RSI, MACD, drawdown, and risk context.")}</span></div>
        </div>
      </section>
    `;
  }
  const indicators = technical.indicators || {};
  const band = indicators.bollinger || {};
  const distribution = technical.returnsDistribution || {};
  const spectral = technical.spectral || {};
  const stft = technical.stft || {};
  const regime = technical.regimeProxy || {};
  return `
    <section class="panel">
      <div class="panel-head">
        <div><h2>Technical Signal Context</h2><p>Ported from the GitHub technical dashboard as native, deterministic price-series diagnostics.</p></div>
        <span class="status-badge ${technical.pointCount >= 20 ? "safe" : "sample"}">${technical.pointCount >= 20 ? "Fuller history" : "Short history"}</span>
      </div>
      <div class="body-pad">
        <div class="provider-status-note">
          <b>${escapeHtml(technical.modelLabel)} · ${escapeHtml(technical.sourceLabel)}</b>
          <span>${escapeHtml(technical.summary)}</span>
        </div>
        <div class="ticker-mini-metrics">
          <div><span>Trend</span><b>${escapeHtml(technical.labels.trend)}</b><small>${formatCurrency(technical.latestClose)} vs SMA ${formatCurrency(indicators.sma)}</small></div>
          <div><span>RSI</span><b>${Number.isFinite(indicators.rsi) ? formatNumber(indicators.rsi) : "--"}</b><small>${escapeHtml(technical.labels.rsi)} · ${technical.windows.rsiWindow}-point window</small></div>
          <div><span>MACD</span><b>${Number.isFinite(indicators.macd?.histogram) ? formatSignedNumber(indicators.macd.histogram) : "--"}</b><small>${escapeHtml(technical.labels.macd)}</small></div>
          <div><span>Bollinger</span><b>${Number.isFinite(band.percentB) ? formatNumber(band.percentB) : "--"}</b><small>Percent B · ${escapeHtml(technical.labels.bollinger)}</small></div>
          <div><span>Z-score</span><b>${Number.isFinite(indicators.zScore) ? formatSignedNumber(indicators.zScore) : "--"}</b><small>${technical.windows.zWindow}-point local standardization</small></div>
          <div><span>Drawdown</span><b class="${technical.latestDrawdown < -0.1 ? "negative" : ""}">${formatSignedPct(technical.latestDrawdown)}</b><small>${escapeHtml(technical.labels.drawdown)} · max ${formatSignedPct(technical.maxDrawdown)}</small></div>
          <div><span>Rolling Sharpe</span><b>${Number.isFinite(indicators.rollingSharpe) ? formatNumber(indicators.rollingSharpe) : "--"}</b><small>signal-to-noise context</small></div>
          <div><span>Autocorr lag 1</span><b>${Number.isFinite(indicators.autocorrelationLag1) ? formatSignedNumber(indicators.autocorrelationLag1) : "--"}</b><small>serial-dependence check</small></div>
        </div>
        <div class="grid-two">
          <div class="section-subcard">
            <h3>Supportive reads</h3>
            ${technical.strengths.length ? list(technical.strengths) : "<p>No standout supportive technical read from the available series.</p>"}
          </div>
          <div class="section-subcard">
            <h3>Risks / limits</h3>
            ${technical.riskNotes.length ? list(technical.riskNotes) : "<p>No major technical risk note from the available series.</p>"}
          </div>
        </div>
        <div class="grid-two">
          <div class="section-subcard">
            <h3>Return distribution</h3>
            <ul class="why-list">
              <li>${escapeHtml(distribution.label || "Return distribution unavailable")}</li>
              <li>Average log return ${Number.isFinite(distribution.mean) ? formatSignedPct(distribution.mean) : "--"} · annualized volatility ${Number.isFinite(distribution.annualizedVolatility) ? formatPct(distribution.annualizedVolatility) : "--"}</li>
              <li>Skew ${Number.isFinite(distribution.skew) ? formatSignedNumber(distribution.skew) : "--"} · excess kurtosis ${Number.isFinite(distribution.excessKurtosis) ? formatSignedNumber(distribution.excessKurtosis) : "--"} · tails ${Number.isFinite(distribution.tailEventCount) ? formatNumber(distribution.tailEventCount) : "--"}</li>
            </ul>
          </div>
          <div class="section-subcard">
            <h3>Spectral scan</h3>
            <ul class="why-list">
              <li>${escapeHtml(spectral.label || "Spectral scan unavailable")}</li>
              <li>Dominant frequency ${Number.isFinite(spectral.dominantFrequency) ? formatNumber(spectral.dominantFrequency) : "--"} cycles/sample · concentration ${Number.isFinite(spectral.spectralConcentration) ? formatPct(spectral.spectralConcentration) : "--"}</li>
              <li>${escapeHtml(stft.label || "Spectrogram unavailable")} ${Number.isFinite(stft.powerShift) ? `· shift ${formatSignedNumber(stft.powerShift)} dB` : ""}</li>
            </ul>
          </div>
        </div>
        <div class="section-subcard">
          <h3>Regime proxy</h3>
          <p><b>${escapeHtml(regime.label || "Mixed / neutral")}</b> · ${escapeHtml(regime.detail || "Deterministic proxy from returns, drawdown, and volatility. HMM-style state decoding is not enabled.")}</p>
        </div>
        <details class="signal-details">
          <summary>Data gaps and model limits</summary>
          ${technical.missingData.length ? list(technical.missingData) : "<p>No major technical data gaps listed.</p>"}
          <p>${escapeHtml(technical.caveat)}</p>
        </details>
      </div>
    </section>
  `;
}

function renderTickerThesisSummaryCard(model) {
  const summary = model.thesisRiskSummary || buildThesisRiskSummary(model.thesisRow || {}, { holding: model.holdings?.[0] || {} });
  return `
    <article class="ticker-note-card">
      <span>Thesis / risk · ${escapeHtml(summary.sourceLabel || "Local deterministic")}</span>
      <b>${escapeHtml(model.thesisStatus)} · ${escapeHtml(model.confidenceLevel)}</b>
      <p>${escapeHtml(summary.summary || model.thesisRow?.whyOwned || model.holdings[0]?.thesis || "No thesis note documented yet.")}</p>
      <small>${escapeHtml(summary.flags?.[0] || summary.nextReview || "Open Thesis to add review triggers and invalidation criteria.")}</small>
      <a class="button-link" href="#thesis">Open Thesis</a>
    </article>
  `;
}

function renderTickerWatchlistIdeaCard(model) {
  const idea = model.watchlistIdea;
  if (!idea) {
    return `
      <article class="ticker-note-card">
        <span>Watchlist / idea pipeline</span>
        <b>${model.owned ? "Owned, no separate idea record" : model.samplePosition ? "Sample position, no saved idea" : "No saved idea"}</b>
        <p>${model.owned ? "Use Watchlist to add catalysts, entry zones, and risk notes alongside the thesis record." : model.samplePosition ? "Sample holdings demonstrate the workflow. Import Tucker's real portfolio before treating this as owned." : "Track this ticker from Market Intelligence or add it manually in Watchlist."}</p>
        <a class="button-link" href="#watchlist">Open Watchlist</a>
      </article>
    `;
  }
  if (model.derivedSignalIdea) {
    return `
      <article class="ticker-note-card">
        <span>Signal-derived idea</span>
        <b>Not saved to watchlist · ${escapeHtml(idea.conviction || "Unrated")}</b>
        <p>${escapeHtml(idea.thesis || "A local ticker signal created this draft idea. Save it in Watchlist before treating it as a tracked thesis.")}</p>
        <small>${escapeHtml(idea.catalyst || idea.signalHeadline || "Open Watchlist to track, reject, or edit this signal-derived idea.")}</small>
        <a class="button-link" href="#watchlist">Open Watchlist</a>
      </article>
    `;
  }
  return `
    <article class="ticker-note-card">
      <span>Watchlist / idea pipeline</span>
      <b>${escapeHtml(titleCase(idea.status || "watching"))} · ${escapeHtml(idea.conviction || "Unrated")}</b>
      <p>${escapeHtml(idea.thesis || "No idea thesis documented yet.")}</p>
      <small>${escapeHtml(idea.catalyst || idea.targetEntryZone || "Open Watchlist to edit catalyst, entry zone, and risk notes.")}</small>
      <a class="button-link" href="#watchlist">Open Watchlist</a>
    </article>
  `;
}

function renderTickerEventCalendar(model) {
  const rows = model.calendarEvents || [];
  return `
    <section class="panel">
      <div class="panel-head"><div><h2>Upcoming Events</h2><p>Calendar items tied to ${escapeHtml(model.ticker)}. Source labels use Sample, Imported, Live, Cached, Stale, Error, or Not configured.</p></div><a class="button-link" href="#calendar">Open Calendar</a></div>
      <div class="body-pad">
        ${rows.length ? rows.slice(0, 5).map((event) => `
          <article class="ticker-event-row">
            <div>
              <span class="status-badge">${escapeHtml(eventTypeLabel(event.eventType))}</span>
              <span class="status-badge ${eventSourceBadgeClass(event.sourceMode)}">${escapeHtml(eventSourceLabel(event.sourceMode, event.sourceLabel))}</span>
              <span class="status-badge action">${escapeHtml(titleCase(event.importance || "medium"))}</span>
            </div>
            <b>${escapeHtml(event.title)}</b>
            <p>${escapeHtml(event.summary || event.notes || "Upcoming review window.")}</p>
            <small>${escapeHtml(event.date || "Unknown date")} · ${escapeHtml(event.sourceMode === "live" ? "Live calendar data" : `${dataModeLabel(sourceDataMode(event))} calendar data`)}</small>
          </article>
        `).join("") : `<div class="empty"><strong>No upcoming events for ${escapeHtml(model.ticker)}.</strong><span>Add custom events on Calendar or import a CSV/JSON event file. The app will not invent live earnings dates.</span><a class="button-link" href="#calendar">Open Calendar</a></div>`}
      </div>
    </section>
  `;
}

function renderTickerPositionExposure(model) {
  const hasPositionRows = model.owned || model.samplePosition;
  return `
    <section class="panel">
      <div class="panel-head"><div><h2>Position Exposure</h2><p>What Tucker owns and where it sits.</p></div></div>
      <div class="body-pad">
        <div class="ticker-mini-metrics">
          <div><span>Position status</span><b>${model.owned ? "Owned" : model.samplePosition ? "Sample position" : model.watchlistOnly ? "Watchlist only" : model.externallyDiscovered ? "Signal-discovered" : "Not tracked"}</b></div>
          <div><span>Market value</span><b>${hasPositionRows ? formatCurrency(model.marketValue) : "--"}</b></div>
          <div><span>${model.samplePosition ? "Sample weight" : "Portfolio weight"}</span><b>${hasPositionRows ? formatPct(model.portfolioWeight) : "--"}</b></div>
        </div>
        <div class="mini-list ticker-section-list">
          ${model.accounts.length ? model.accounts.map((row) => `
            <div><span>${escapeHtml(row.account)}${model.samplePosition ? " · Sample" : ""}</span><b>${formatCurrency(row.marketValue)}</b><small>${formatPct(row.weight)} of ${escapeHtml(model.ticker)} exposure · ${formatNumber(row.shares)} shares</small></div>
          `).join("") : '<div class="empty"><strong>No current position.</strong><span>This ticker can still show watchlist, imported disclosure, Reddit, alert, or market-data context.</span></div>'}
        </div>
      </div>
    </section>
  `;
}

function renderTickerPriceTrend(model) {
  const points = model.historicalPrices || [];
  const source = model.quote ? tickerMarketDataSourceLabel(model) : "Historical data missing";
  if (points.length < 2) {
    return `
      <section class="panel">
        <div class="panel-head"><div><h2>Price Trend</h2><p>Historical price context from the configured market data layer.</p></div></div>
        <div class="body-pad">
          <div class="empty"><strong>No historical price series yet.</strong><span>${escapeHtml(source)}. Configure or refresh market data later to populate the trend chart.</span></div>
        </div>
      </section>
    `;
  }
  const first = points[0];
  const last = points[points.length - 1];
  const values = points.map((point) => point.close);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const chartPoints = points.map((point, index) => {
    const x = points.length === 1 ? 0 : (index / (points.length - 1)) * 320;
    const y = 110 - ((point.close - min) / range) * 92;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const change = divide(last.close - first.close, first.close);
  return `
    <section class="panel">
      <div class="panel-head"><div><h2>Price Trend</h2><p>${escapeHtml(source)} · ${points.length} historical points.</p></div></div>
      <div class="body-pad">
        <div class="ticker-chart-card">
          <div class="ticker-chart-summary">
            <div><span>Start</span><b>${formatCurrency(first.close)}</b><small>${escapeHtml(shortDateTime(first.date))}</small></div>
            <div><span>Latest</span><b>${formatCurrency(last.close)}</b><small>${escapeHtml(shortDateTime(last.date))}</small></div>
            <div><span>Series change</span><b class="${change >= 0 ? "positive" : "negative"}">${formatSignedPct(change)}</b><small>context only</small></div>
          </div>
          <svg class="ticker-price-chart" viewBox="0 0 320 120" role="img" aria-label="${escapeHtml(model.ticker)} historical price trend">
            <line x1="0" y1="110" x2="320" y2="110" />
            <polyline points="${chartPoints}" />
          </svg>
        </div>
      </div>
    </section>
  `;
}

function renderTickerRedditTrend(model) {
  const row = model.redditSummary;
  return `
    <section class="panel">
      <div class="panel-head"><div><h2>Reddit Mention Trend</h2><p>Lower-trust social context, filtered through the ticker whitelist.</p></div></div>
      <div class="body-pad">
        ${row ? `
          <div class="ticker-mini-metrics">
            <div><span>1 day</span><b>${formatNumber(row.oneDayMentions || 0)}</b></div>
            <div><span>7 days</span><b>${formatNumber(row.sevenDayMentions || 0)}</b></div>
            <div><span>30 days</span><b>${formatNumber(row.thirtyDayMentions || 0)}</b></div>
            <div><span>Acceleration</span><b>${formatGrowth(row.mentionAcceleration ?? row.mentionGrowth)}</b></div>
          </div>
          <div class="mini-list ticker-section-list">
            ${model.redditMentions.length ? model.redditMentions.slice(0, 5).map((mention) => `
              <div><span>${escapeHtml(redditMentionSourceLabel(mention))} · r/${escapeHtml(mention.subreddit || "unknown")}</span><b>${escapeHtml(summaryText(redditMentionText(mention), 96) || "Mention record")}</b><small>${escapeHtml(shortDateTime(mention.createdAt || mention.detectedAt))} · score ${formatNumber(mention.score ?? mention.upvotes ?? 0)} · sentiment ${escapeHtml(mention.sentiment || "placeholder")}</small></div>
            `).join("") : '<div class="empty"><strong>Summary exists, but no source rows are loaded.</strong><span>Import or connect compliant Reddit data later to show mention records.</span></div>'}
          </div>
        ` : '<div class="empty"><strong>No Reddit mention trend for this ticker.</strong><span>Sample, imported, or future API records will appear here when available. Social data remains lower trust than filings or confirmed news.</span></div>'}
      </div>
    </section>
  `;
}

function renderTickerPoliticianActivity(model) {
  const buys = model.politicianTrades.filter((trade) => /purchase|buy/i.test(trade.transactionType || "")).length;
  const sells = model.politicianTrades.filter((trade) => /sale|sell/i.test(trade.transactionType || "")).length;
  return `
    <section class="panel">
      <div class="panel-head"><div><h2>Politician Trade Activity</h2><p>Sample, imported, or configured public disclosure context.</p></div></div>
      <div class="body-pad">
        ${model.politicianTrades.length ? `
          <div class="ticker-mini-metrics">
            <div><span>Disclosures</span><b>${formatNumber(model.politicianTrades.length)}</b></div>
            <div><span>Purchases</span><b>${formatNumber(buys)}</b></div>
            <div><span>Sales</span><b>${formatNumber(sells)}</b></div>
          </div>
          <div class="mini-list ticker-section-list">
            ${model.politicianTrades.slice(0, 5).map((trade) => `
              <div><span>${escapeHtml(politicianTradeSourceLabel(trade))} · ${escapeHtml(shortDateTime(trade.disclosureDate || trade.disclosedAt))}</span><b>${escapeHtml(titleCase(trade.transactionType || "unknown"))} · ${escapeHtml(trade.politicianName || "Unknown official")}</b><small>${escapeHtml(formatTradeRange(trade))} · ${escapeHtml(trade.chamber || "chamber unknown")} ${escapeHtml(trade.state || "")} · traded ${escapeHtml(trade.transactionDate || trade.tradedAt || "unknown")}</small></div>
            `).join("")}
          </div>
        ` : '<div class="empty"><strong>No politician trade records for this ticker.</strong><span>Local imports or configured public disclosure syncs will appear here with source attribution.</span></div>'}
      </div>
    </section>
  `;
}

function renderTickerThesisRisk(model) {
  const row = model.thesisRow;
  const summary = model.thesisRiskSummary || buildThesisRiskSummary(row || {}, { holding: model.holdings?.[0] || {} });
  const list = (items = [], fallback = "Not documented") => {
    const values = Array.isArray(items) ? items.filter(Boolean) : String(items || "").split(/\n|;/).map((item) => item.trim()).filter(Boolean);
    return values.length ? `<ul class="why-list">${values.slice(0, 5).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : `<p class="section-note">${escapeHtml(fallback)}</p>`;
  };
  return `
    <section class="panel">
      <div class="panel-head"><div><h2>Thesis & Risk Notes</h2><p>Why Tucker owns it, what matters, and what would force review.</p></div></div>
      <div class="body-pad">
        ${row ? `
          <div class="ticker-mini-metrics">
            <div><span>Status</span><b>${escapeHtml(row.thesisStatus || "Unrated")}</b></div>
            <div><span>Confidence</span><b>${escapeHtml(row.confidenceLevel || "Unrated")}</b></div>
            <div><span>Last reviewed</span><b>${escapeHtml(row.lastReviewedDate || "Not set")}</b></div>
            <div><span>Target weight</span><b>${Number.isFinite(Number(row.targetWeight)) ? formatPct(Number(row.targetWeight)) : "--"}</b></div>
          </div>
          <div class="provider-status-note">
            <b>${escapeHtml(summary.sourceLabel || "Local deterministic")} thesis/risk summary</b>
            <span>${escapeHtml(summary.summary || "No thesis note documented yet.")}</span>
          </div>
          <div class="mini-list">
            ${summary.flags.slice(0, 4).map((flag) => `<div><span>Review flag</span><b>${escapeHtml(flag)}</b><small>${escapeHtml(summary.reviewAction || "Review thesis")}</small></div>`).join("")}
          </div>
          <details class="signal-details">
            <summary>Thesis details</summary>
            <h3>Bullish assumptions</h3>
            ${list(row.bullishAssumptions)}
            <h3>Key risks</h3>
            ${list(summary.keyRisks || row.keyRisks)}
            <h3>Invalidation criteria</h3>
            ${list(summary.invalidationCriteria || row.invalidationCriteria || row.thesisBreakingConditions)}
            <h3>What would make Tucker add</h3>
            ${list(summary.addConditions || row.addConditions)}
            <h3>What would make Tucker trim</h3>
            ${list(summary.trimConditions || row.trimConditions)}
            <h3>What would make Tucker exit/review</h3>
            ${list(summary.exitReviewConditions || row.exitReviewConditions)}
            <h3>Review triggers</h3>
            ${list([row.nextReviewTrigger, row.whatWouldMakeMeTrim, row.whatWouldMakeMeExitReview].filter(Boolean), "No review triggers documented.")}
            ${row.notes ? `<h3>Notes</h3><p>${escapeHtml(row.notes)}</p>` : ""}
            <p class="section-note">${escapeHtml(summary.caveat || "Local deterministic summary; no AI text was generated.")}</p>
          </details>
        ` : '<div class="empty"><strong>No thesis profile yet.</strong><span>Open Thesis to document why Tucker owns or tracks this ticker, invalidation criteria, and review triggers.</span><a class="button-link" href="#thesis">Open Thesis</a></div>'}
      </div>
    </section>
  `;
}

function renderTickerAlertHistory(model) {
  return `
    <section class="panel">
      <div class="panel-head"><div><h2>Alert History</h2><p>Local portfolio and signal alerts referencing ${escapeHtml(model.ticker)}.</p></div></div>
      <div class="body-pad mini-list">
        ${model.alerts.length ? model.alerts.map((alert) => `
          <div><span>${escapeHtml(alertDisplayLabel(alert))} · ${escapeHtml(alert.severity || "info")}</span><b>${escapeHtml(alert.title)}</b><small>${escapeHtml(alert.detail)}${alert.createdAt ? ` · ${escapeHtml(shortDateTime(alert.createdAt))}` : ""}</small></div>
        `).join("") : '<div class="empty"><strong>No current alerts for this ticker.</strong><span>Alerts will appear here when concentration, source status, thesis, or signal rules reference this ticker.</span></div>'}
      </div>
    </section>
  `;
}

function renderTickerJournalHistory(model) {
  return `
    <section class="panel">
      <div class="panel-head">
        <div><h2>Decision Journal</h2><p>Decision notes for buying, selling, holding, rejecting, or watching ${escapeHtml(model.ticker)}.</p></div>
        <button type="button" data-journal-action="new-for-ticker" data-ticker="${escapeHtml(model.ticker)}" data-decision-type="${model.owned ? "hold" : "watch"}" data-conviction="${escapeHtml(model.confidenceLevel || "Unrated")}" aria-label="Log decision for ${escapeHtml(model.ticker)}">Log decision</button>
      </div>
      <div class="body-pad mini-list">
        ${model.journalEntries.length ? model.journalEntries.map((entry) => `
          <div>
            <span>${escapeHtml(journalDecisionLabel(entry.decisionType))} · ${escapeHtml(entry.conviction || "Unrated")} · ${escapeHtml(shortDateTime(entry.dateTime))}</span>
            <b>${escapeHtml(entry.thesisNote || "No thesis note recorded.")}</b>
            <small>${escapeHtml(entry.riskNote || "No risk note.")}${entry.signalSnapshot?.combinedScore !== undefined ? ` · signal snapshot ${escapeHtml(entry.signalSnapshot.combinedScore)}/100` : ""}</small>
          </div>
        `).join("") : '<div class="empty"><strong>No journal entries yet.</strong><span>Use Log decision to record why this ticker is being watched or held. This is not brokerage execution.</span></div>'}
      </div>
    </section>
  `;
}

function renderTickerDataQuality(model) {
  return `
    <section class="panel">
      <div class="panel-head"><div><h2>Data Quality & Status</h2><p>What is present, missing, Sample, Imported, Cached, Stale, Error, or Live.</p></div></div>
      <div class="body-pad">
        <div class="provider-status-note">
          <b>${escapeHtml(model.dataQuality.summary)}</b>
          <span>${escapeHtml(model.dataQuality.detail)}</span>
        </div>
        ${renderTickerProviderCoverage(model)}
        <div class="ticker-coverage-grid">
          ${model.dataQuality.rows.map((row) => `
            <div class="ticker-coverage-item ${escapeHtml(row.tone)}"><span>${escapeHtml(row.label)}</span><b>${escapeHtml(row.status)}</b><small>${escapeHtml(row.detail)}</small></div>
          `).join("")}
        </div>
      </div>
    </section>
  `;
}

function renderTickerProviderCoverage(model = {}) {
  const coverage = model.providerCoverage || {};
  const fields = Array.isArray(coverage.fieldCoverage) ? coverage.fieldCoverage : [];
  if (!fields.length) {
    return `
      <div class="ticker-provider-coverage">
        <div>
          <b>Provider coverage</b>
          <span>No per-ticker provider diagnostics yet. Refresh market data from Data Sources after loading a portfolio.</span>
        </div>
      </div>
    `;
  }
  return `
    <div class="ticker-provider-coverage">
      <div>
        <b>Provider coverage</b>
        <span>${escapeHtml(coverage.coverageSummary || "Coverage pending")} · ${escapeHtml(coverageGapSummary(coverage))}</span>
      </div>
      <div class="coverage-chip-row" aria-label="Provider field coverage for ${escapeHtml(model.ticker)}">
        ${fields.map((field) => `
          <span class="coverage-chip ${coverageFieldBadgeClass(field)}">
            <b>${escapeHtml(field.label)}</b>
            <small>${escapeHtml(coverageFieldStatusLabel(field))}</small>
          </span>
        `).join("")}
      </div>
      ${coverage.lastError ? `<p class="section-note">Provider note: ${escapeHtml(String(coverage.lastError))}</p>` : ""}
    </div>
  `;
}

function tickerProviderCoverage(marketDataStatus = {}, ticker = "", quote = null) {
  const normalizedTicker = normalizeTicker(ticker);
  const diagnostics = Array.isArray(marketDataStatus.quoteDiagnostics) ? marketDataStatus.quoteDiagnostics : [];
  const row = diagnostics.find((item) => normalizeTicker(item.ticker) === normalizedTicker);
  if (row) return row;
  if (!quote) return { ticker: normalizedTicker, fieldCoverage: [] };
  const status = quote.dataFreshness || quote.cacheStatus || "unknown";
  const field = (key, label, available, resourceStatus = status) => ({
    key,
    label,
    missingLabel: label.toLowerCase(),
    available,
    status: available ? resourceStatus : "missing",
    resourceStatus
  });
  const fields = [
    field("quote", "Quote", Number(quote.price || 0) > 0),
    field("week52Range", "52-week high/low", Number(quote.fiftyTwoWeekHigh || 0) > 0 && Number(quote.fiftyTwoWeekLow || 0) > 0),
    field("volume", "Volume", Number(quote.volume || 0) > 0),
    field("averageVolume", "Average volume", Number(quote.averageVolume || 0) > 0),
    field("marketCap", "Market cap", Number(quote.marketCap || 0) > 0),
    field("companyProfile", "Company profile", Boolean(quote.name && normalizeTicker(quote.name) !== normalizeTicker(quote.ticker))),
    field("sectorIndustry", "Sector/industry", Boolean((quote.sector && quote.sector !== "Unknown") || (quote.industry && quote.industry !== "Unknown"))),
    field("historicalCandles", "Historical candles", Array.isArray(quote.historicalPrices) && quote.historicalPrices.length > 0)
  ];
  const available = fields.filter((item) => item.available).map((item) => item.label);
  const missing = fields.filter((item) => !item.available).map((item) => item.missingLabel);
  return {
    ticker: normalizedTicker,
    fieldCoverage: fields,
    availableFields: available,
    missingFields: missing,
    unavailableFields: missing,
    staleFields: status === "stale" ? available : [],
    coverageSummary: `${available.length}/${fields.length} fields available`,
    coverageStatus: missing.length ? "partial" : "complete",
    lastError: quote.lastError?.message || quote.lastError || ""
  };
}

function buildTickerDataQuality(model) {
  const quoteCoverage = tickerQuoteCoverage(model);
  const factorSnapshot = model.researchLens?.seekingAlphaSnapshot || {};
  const factorRows = factorSnapshot.factors || [];
  const hasFundamentalRatings = factorRows.some((factor) => factor.available && ["quant", "valuation", "growth", "profitability", "revisions"].includes(factor.key));
  const valuationContext = model.researchLens?.valuationContext || {};
  const ownerMissing = model.researchLens?.buffettChecklist?.missingEvidence || [];
  const rows = [
    tickerCoverageRow("Position data", model.owned, model.owned ? "owned" : model.watchlistOnly ? "watchlist only" : model.externallyDiscovered ? "signal-discovered" : "missing", model.owned ? `${model.accounts.length} account${model.accounts.length === 1 ? "" : "s"} with local/imported holding rows.` : "No current local position. This page can still show watchlist or discovered signal context.", model.owned ? "good" : "neutral"),
    tickerCoverageRow("Quote summary", Boolean(model.quote), quoteCoverage.status, quoteCoverage.detail, quoteCoverage.tone),
    tickerCoverageRow("Historical prices", (model.historicalPrices || []).length >= 2, (model.historicalPrices || []).length >= 2 ? `${model.historicalPrices.length} points` : "missing", (model.historicalPrices || []).length >= 2 ? "Price trend chart can render from local provider data." : "No usable historical price series yet.", (model.historicalPrices || []).length >= 2 ? "good" : "warn"),
    tickerCoverageRow("Fundamental ratings", hasFundamentalRatings, hasFundamentalRatings ? `${factorRows.filter((factor) => factor.available).length} factors` : "missing", hasFundamentalRatings ? "Imported or local factor fields support the research snapshot." : "Import Seeking Alpha-style ratings or fundamentals to populate quality, valuation, growth, profitability, and revisions.", hasFundamentalRatings ? "good" : "warn"),
    tickerCoverageRow("Valuation inputs", Boolean(valuationContext.forwardPe || valuationContext.priceToSales || valuationContext.dividendYield || factorRows.some((factor) => factor.key === "valuation" && factor.available)), valuationContext.note || "missing", "Used for margin-of-safety review; the app does not invent intrinsic value.", valuationContext.forwardPe || valuationContext.priceToSales || factorRows.some((factor) => factor.key === "valuation" && factor.available) ? "neutral" : "warn"),
    tickerCoverageRow("Owner earnings inputs", !ownerMissing.some((item) => /free-cash-flow|cash flow|capex|debt|interest|owner earnings/i.test(item)), ownerMissing.some((item) => /free-cash-flow|cash flow|capex|debt|interest|owner earnings/i.test(item)) ? "missing" : "present", "Buffett-style owner earnings need operating cash flow, capex, debt/cash, and multi-year fundamentals before intrinsic value work.", ownerMissing.some((item) => /free-cash-flow|cash flow|capex|debt|interest|owner earnings/i.test(item)) ? "warn" : "good"),
    tickerCoverageRow("Sector / industry", model.sector !== "Unknown" || model.industry !== "Unknown", `${model.sector} / ${model.industry}`, "Classification context used by risk and concentration views.", model.sector === "Unknown" && model.industry === "Unknown" ? "warn" : "good"),
    tickerCoverageRow("Thesis notes", Boolean(model.thesisRow), model.thesisRow ? model.thesisStatus : "missing", model.thesisRow ? "Thesis tracker has a local profile for this ticker." : "No local thesis profile is documented yet.", model.thesisRow ? "good" : "warn"),
    tickerCoverageRow("Reddit mentions", Boolean(model.redditSummary || model.redditMentions.length), model.redditSummary ? `${model.redditSummary.sevenDayMentions || 0} / 7d` : "none", "Lower-trust social context; use as a monitoring input, not evidence by itself.", model.redditSummary ? "neutral" : "warn"),
    tickerCoverageRow("Politician trades", Boolean(model.politicianTrades.length), model.politicianTrades.length ? `${model.politicianTrades.length} records` : "none", "Sample, Imported, or configured public disclosure records with source attribution.", model.politicianTrades.length ? "neutral" : "warn"),
    tickerCoverageRow("Alert history", Boolean(model.alerts.length), model.alerts.length ? `${model.alerts.length} alerts` : "none", "Local alert rules connected to this ticker.", model.alerts.length ? "neutral" : "good")
  ];
  const missing = rows.filter((row) => row.tone === "warn").length;
  return {
    summary: missing ? `Usable with ${missing} missing data area${missing === 1 ? "" : "s"}` : "Coverage looks usable",
    detail: "Ticker pages combine owned/imported holdings, market data, thesis notes, social placeholders, disclosure records, and alerts. Missing sections are expected until those sources are connected or imported.",
    rows
  };
}

function tickerQuoteCoverage(model = {}) {
  if (!model.quote) {
    return { status: "missing", detail: "No quote is available yet for this ticker.", tone: "warn" };
  }
  const label = tickerMarketDataSourceLabel(model);
  if (model.marketDataStatus?.status === "stale data") {
    return { status: label, detail: "Quote fields are Stale or Cached data. Refresh provider data before relying on price-sensitive context.", tone: "warn" };
  }
  if (model.marketDataStatus?.status === "error") {
    return { status: label, detail: "Market data provider returned Error. Quote fields may be unavailable or fallback-only.", tone: "warn" };
  }
  if (model.marketDataStatus?.status === "mock/sample mode" || model.quote?.isMock || model.quote?.sourceMode === "mock") {
    return { status: label, detail: "Quote fields are Sample data, not Live.", tone: "neutral" };
  }
  return { status: label, detail: "Quote fields are available through the market data layer.", tone: "good" };
}

function tickerCoverageRow(label, present, status, detail, tone = "neutral") {
  return {
    label,
    present,
    status,
    detail,
    tone
  };
}

function normalizeHistoricalPrices(values = []) {
  if (!Array.isArray(values)) return [];
  return values.map((item, index) => {
    if (typeof item === "number") return { date: `Point ${index + 1}`, close: Number(item) };
    const close = Number(item?.close ?? item?.price ?? item?.adjustedClose ?? item?.adjClose ?? item?.value);
    if (!Number.isFinite(close) || close <= 0) return null;
    return {
      date: item.date || item.timestamp || item.time || `Point ${index + 1}`,
      close,
      open: finiteOptionalNumber(item?.open),
      high: finiteOptionalNumber(item?.high),
      low: finiteOptionalNumber(item?.low),
      volume: finiteOptionalNumber(item?.volume)
    };
  }).filter(Boolean);
}

function redditMentionTickers(record = {}) {
  return unique([
    normalizeTickerSymbol(record.ticker),
    ...(Array.isArray(record.extractedTickers) ? record.extractedTickers.map(normalizeTickerSymbol) : [])
  ]);
}

function redditMentionText(record = {}) {
  return record.title || record.body || record.commentText || record.text || record.summary || "";
}

function redditMentionSourceLabel(record = {}) {
  if (record.liveProviderCalls || record.sourceMode === "api") return "Reddit API";
  if (record.sourceMode === "local-file" || record.source === "local-reddit-import") return "Imported JSON";
  if (record.sourceMode === "mock" || record.source === "mock-reddit") return "Sample Reddit";
  return record.sourceName || record.providerId || "Local Reddit record";
}

function xUpdateSourceLabel(record = {}) {
  if (record.liveProviderCalls || record.providerId === "x-api" || record.sourceMode === "api") return "X API";
  if (record.sourceMode === "local-file" || record.source === "local-x-import") return "Imported X/social";
  if (record.sourceMode === "mock" || record.source === "mock-x" || record.providerId === "mock") return "Sample X/social";
  return record.sourceName || record.providerId || "Local X/social record";
}

function tickerMarketDataSourceLabel(model = {}) {
  const quote = model.quote || {};
  if (model.marketDataStatus?.status === "stale data") return `${quote.providerName || "Provider"} Stale quote`;
  if (model.marketDataStatus?.status === "error") return "Error market data";
  if (model.marketDataStatus?.status === "mock/sample mode") return "Sample market data";
  if (quote.dataFreshness === "live" || quote.cacheStatus === "live") return `${quote.providerName || "Provider"} Live quote`;
  if (quote.dataFreshness === "cached" || quote.cacheStatus === "cached") return `${quote.providerName || "Provider"} Cached quote`;
  if (quote.dataFreshness === "stale" || quote.cacheStatus === "stale") return `${quote.providerName || "Provider"} Stale quote`;
  if (quote.sourceMode === "mock" || quote.isMock) return "Sample market data";
  return marketDataDisplayLabel(model.marketDataStatus);
}

function timestampSortValue(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function tickerSignalSummary(model) {
  const signal = model.tickerSignal;
  if (!signal) return '<div><span>Ticker signal</span><b>No confluence row</b><small>Future watchlist/data signals will populate this row.</small></div>';
  const lensLabel = signal.institutionalQuantSecurityKind === "fund-or-etf" ? "exposure lens" : "quant lens";
  const quantLine = signal.institutionalQuantScore
    ? ` ${lensLabel} ${formatScore100(signal.institutionalQuantScore)} · ${escapeHtml(signal.institutionalQuantLabel || "decision support")} · ${escapeHtml(signal.institutionalQuantPeerLabel || "peer rank pending")} · ${escapeHtml(signal.institutionalQuantScoreTrendLabel || "no prior score")}.`
    : "";
  return `<div><span>Ticker signal</span><b>${signal.combinedScore}/100 · ${escapeHtml(signal.actionCategory)}</b><small>${escapeHtml(signal.explanation || signal.topHeadline)}${quantLine} Missing: ${escapeHtml((signal.missingData || []).slice(0, 2).join(", ") || "none listed")}.</small></div>`;
}

function redditSignalSummary(model) {
  const row = model.redditSummary;
  if (!row) return '<div><span>Reddit/social context</span><b>No source-labeled mentions</b><small>Reddit API: Not configured.</small></div>';
  return `<div><span>Reddit/social context</span><b>${row.sevenDayMentions} mentions / 7d</b><small>${escapeHtml(row.sentiment)} sentiment label · growth ${formatGrowth(row.mentionGrowth)}</small></div>`;
}

function politicianSignalSummary(model) {
  if (!model.politicianTrades.length) return '<div><span>Politician trade disclosures</span><b>No Imported disclosures</b><small>Public disclosure sync: Not configured. Disclosures are delayed context, not live trade alerts.</small></div>';
  const trade = model.politicianTrades[0];
  const sourceLabel = politicianTradeSourceLabel(trade).toLowerCase();
  return `<div><span>Politician trade disclosures</span><b>${escapeHtml(titleCase(trade.transactionType || "unknown"))} · ${escapeHtml(trade.politicianName || "Unknown")}</b><small>${escapeHtml(formatTradeRange(trade))} · traded ${escapeHtml(trade.transactionDate || trade.tradedAt || "unknown")} · disclosed ${escapeHtml(trade.disclosureDate || trade.disclosedAt || "unknown")} · ${escapeHtml(sourceLabel)}</small></div>`;
}

function tickerRelatedSignals(model) {
  const rows = [
    ...model.alphaSignals.map((signal) => ({ label: `Alpha · ${signalActionCategory(signal)}`, title: signal.headline, detail: signal.nextReviewQuestion || signal.actionabilityReason })),
    ...model.marketEvents.map((event) => ({ label: `Market · ${marketActionLabel(event)}`, title: event.title, detail: event.portfolioReadThrough || event.suggestedAction }))
  ].slice(0, 8);
  return rows.length
    ? rows.map((row) => `<div><span>${escapeHtml(row.label)}</span><b>${escapeHtml(row.title)}</b><small>${escapeHtml(row.detail || "Review details in Alpha Engine or Market Intelligence.")}</small></div>`).join("")
    : '<div class="empty"><strong>No linked read-throughs.</strong><span>Sample events will appear here when they map to this ticker.</span></div>';
}

function aggregateTickerAccounts(holdings = []) {
  const rows = new Map();
  const total = holdings.reduce((sum, holding) => sum + (Number(holding.marketValue) || 0), 0);
  holdings.forEach((holding) => {
    const key = holding.account || "Unknown account";
    const current = rows.get(key) || { account: key, marketValue: 0, shares: 0, weight: 0 };
    current.marketValue += Number(holding.marketValue) || 0;
    current.shares += Number(holding.shares) || 0;
    rows.set(key, current);
  });
  return [...rows.values()]
    .map((row) => ({ ...row, weight: total ? row.marketValue / total : 0 }))
    .sort((a, b) => b.marketValue - a.marketValue || a.account.localeCompare(b.account));
}

function marketTickerSignalSourceLabel(status = {}) {
  const mode = marketDataMode(status);
  if (mode === DATA_MODES.LIVE) return "Live-assisted";
  if (mode === DATA_MODES.CACHED) return "Cached-assisted";
  if (mode === DATA_MODES.STALE) return "Stale-assisted";
  if (mode === DATA_MODES.PARTIAL) return "Partial data";
  if (mode === DATA_MODES.RATE_LIMITED) return "Rate limited";
  if (mode === DATA_MODES.ERROR) return "Error";
  return "Sample/local";
}

function renderMarketDrivers(report = null) {
  const heroTarget = byId("marketDriversHeroPanel");
  const listTarget = byId("marketDriversPanel");
  const sourceTarget = byId("marketDriversSourcePanel");
  if (!heroTarget || !listTarget || !sourceTarget) return;
  if (!report?.broadMarket || !report?.aiTech) {
    heroTarget.innerHTML = '<div class="empty"><strong>No market driver report yet.</strong><span>Load sample data or refresh market data to generate a source-labeled explanation.</span></div>';
    listTarget.innerHTML = "";
    sourceTarget.innerHTML = "";
    setStatusBadge("marketDriversSourceBadge", "Not configured", dataModeBadgeClass(DATA_MODES.NOT_CONFIGURED));
    return;
  }
  setStatusBadge("marketDriversSourceBadge", report.sourceStatus || "Source-labeled", dataModeBadgeClass(report.sourceMode));
  heroTarget.innerHTML = `
    ${renderMarketRegimeCard(report.marketRegime)}
    <div class="market-driver-hero-grid">
      ${renderMarketDriverScopeCard(report.broadMarket)}
      ${renderMarketDriverScopeCard(report.aiTech)}
    </div>
  `;
  const driverRows = [
    ...(report.broadMarket.drivers || []).map((row) => ({ ...row, scopeLabel: report.broadMarket.label })),
    ...(report.aiTech.drivers || []).map((row) => ({ ...row, scopeLabel: report.aiTech.label }))
  ].sort((left, right) => Number(right.score || 0) - Number(left.score || 0));
  listTarget.innerHTML = driverRows.length
    ? driverRows.slice(0, 10).map(renderMarketDriverRow).join("")
    : '<div class="empty"><strong>No ranked drivers yet.</strong><span>Market prices, social rows, or event read-throughs need to be loaded first.</span></div>';
  sourceTarget.innerHTML = renderMarketDriverSourceSummary(report);
}

function renderMarketRegimeCard(regime = null) {
  if (!regime) return "";
  const signals = (regime.signals || []).slice(0, 6);
  return `
    <article class="market-driver-card market-regime-card">
      <div class="badge-row">
        <span class="status-badge ${escapeHtml(marketRegimeBadgeClass(regime.regime))}">${escapeHtml(regime.label || "Mixed")}</span>
        <span class="status-badge">${escapeHtml(regime.confidenceLabel || "Low")} confidence</span>
        <span class="status-badge ${escapeHtml(dataModeBadgeClass(regime.sourceMode))}">${escapeHtml(regime.sourceStatus || "Source-labeled")}</span>
      </div>
      <div>
        <h3>Market Regime</h3>
        <div class="move-line"><b>${escapeHtml(regime.summary || "Rule-based regime read pending.")}</b></div>
      </div>
      <p>${escapeHtml(regime.interpretation || "Use this as source-labeled context only.")}</p>
      <div class="target-summary-grid">
        ${targetMetric("Risk-on score", `${escapeHtml(regime.riskOnScore ?? 0)}`)}
        ${targetMetric("Risk-off score", `${escapeHtml(regime.riskOffScore ?? 0)}`)}
        ${targetMetric("Defensive score", `${escapeHtml(regime.defensiveScore ?? 0)}`)}
        ${targetMetric("Data gaps", `${(regime.missingData || []).length}`)}
      </div>
      <div class="market-driver-signal-grid">
        ${signals.map((signal) => `
          <div class="provider-status-card ${signal.status === "missing" ? "badge-source-not-configured" : ""}">
            <div><b>${escapeHtml(signal.label)}</b><span>${escapeHtml(titleCase(String(signal.status || "mixed").replaceAll("-", " ")))}</span></div>
            <p>${escapeHtml(signal.reading || "Data unavailable")}</p>
          </div>
        `).join("")}
      </div>
      <div class="news-links">
        <a href="#risk">Review portfolio risk</a>
        <a href="#data-sources">Check sources</a>
      </div>
    </article>
  `;
}

function renderMarketDriverScopeCard(scope = {}) {
  return `
    <article class="market-driver-card">
      <div class="badge-row">
        <span class="status-badge ${escapeHtml(marketDriverDirectionClass(scope.direction))}">${escapeHtml(scope.directionLabel || "Unknown")}</span>
        <span class="status-badge">${escapeHtml(scope.confidenceLabel || "Low")} confidence</span>
        <span class="status-badge ${escapeHtml(dataModeBadgeClass(scope.sourceMode))}">${escapeHtml(scope.sourceStatus || "Source-labeled")}</span>
      </div>
      <div>
        <h3>${escapeHtml(scope.label || "Market scope")}</h3>
        <div class="move-line"><b>${escapeHtml(scope.moveLabel || "Move unavailable")}</b></div>
      </div>
      <p>${escapeHtml(scope.summary || "No source-labeled explanation available yet.")}</p>
      <div class="market-driver-meta">
        ${(scope.affectedTickers || []).slice(0, 7).map((ticker) => renderTickerLink(ticker, ticker, "ticker-chip")).join("")}
      </div>
      <div class="news-links">
        <a href="${escapeHtml(scope.key === "aiTech" ? "#risk" : "#daily")}">${scope.key === "aiTech" ? "Review AI/tech exposure" : "Review daily brief"}</a>
        <a href="#data-sources">Check sources</a>
      </div>
    </article>
  `;
}

function renderMarketDriverRow(row = {}) {
  return `
    <article class="market-driver-row">
      <div>
        <div class="badge-row">
          <span class="status-badge">${escapeHtml(row.scopeLabel || "Market")}</span>
          <span class="status-badge">${escapeHtml(row.category || "Driver")}</span>
          <span class="status-badge ${escapeHtml(marketDriverDirectionClass(row.direction))}">${escapeHtml(row.direction || "mixed")}</span>
          <span class="status-badge">Evidence ${escapeHtml(row.evidenceStrength || "Low")}</span>
        </div>
        <h3>${escapeHtml(row.title || "Market driver")}</h3>
        <p><b>What changed:</b> ${escapeHtml(row.whatChanged || "No change explanation loaded.")}</p>
        <p><b>Portfolio relevance:</b> ${escapeHtml(row.portfolioRelevance || "Review linked exposure before acting.")}</p>
        <p><b>What to inspect next:</b> ${escapeHtml(row.nextStep || "Open the linked detail screen.")}</p>
        ${row.evidence?.length ? `<ul class="market-driver-evidence">${row.evidence.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
      </div>
      <aside class="market-driver-aside">
        <span>Driver weight</span>
        <b>${Math.round(Number(row.score) || 0)}/100</b>
        <div class="ticker-chips">${renderTickerChips(row.tickers || [])}</div>
        <small>${escapeHtml((row.sourceModes || []).join(" · ") || "Source-labeled")}</small>
        <a class="button-link" href="${escapeHtml(safeHashHref(row.href || "#market-drivers"))}">Inspect source</a>
      </aside>
    </article>
  `;
}

function renderMarketDriverSourceSummary(report = {}) {
  const source = report.sourceSummary || {};
  const rows = [
    ["Market data", source.marketDataLabel || "Not configured", "SPY/QQQ/IWM/DIA and AI/tech proxy quotes when available."],
    ["X / Twitter", source.xLabel || "Not configured", "Lower-trust social attention from local/sample rows or official API sync."],
    ["Reddit", source.redditLabel || "Not configured", "Lower-trust subreddit mention acceleration and sentiment placeholders."],
    ["Federal disclosures", source.disclosureLabel || "Not configured", "Delayed disclosure context only; not an intraday market cause."],
    ["News/events", source.eventLabel || "Not configured", "Source-labeled read-throughs; live news remains provider-gated."]
  ];
  return `
    <div class="provider-status-grid">
      ${rows.map(([label, value, detail]) => `
        <div class="provider-status-card ${escapeHtml(dataModeBadgeClass(value))}">
          <div><b>${escapeHtml(label)}</b><span>${escapeHtml(value)}</span></div>
          <p>${escapeHtml(detail)}</p>
        </div>
      `).join("")}
    </div>
    ${report.missingData?.length ? `
      <div class="empty">
        <strong>What the app cannot know yet</strong>
        <span>${escapeHtml(report.missingData.slice(0, 5).join(" "))}</span>
      </div>
    ` : ""}
  `;
}

function marketDriverDirectionClass(direction = "") {
  if (direction === "up") return "safe";
  if (direction === "down") return "medium";
  if (direction === "unknown") return "demo";
  return "";
}

function marketRegimeBadgeClass(regime = "") {
  if (regime === "risk-on") return "safe";
  if (regime === "risk-off" || regime === "defensive") return "medium";
  if (regime === "overbought" || regime === "oversold") return "demo";
  return "";
}

function renderMarketTickerSignals(events = [], holdings = [], alphaSignals = [], uiState = "SAMPLE_MODE", tickerSignals = [], marketDataStatus = {}) {
  const target = byId("marketTickerSignalsPanel");
  if (!target) return;
  const sourceBadgeLabel = marketTickerSignalSourceLabel(marketDataStatus);
  setStatusBadge("marketTickerSignalsSourceBadge", sourceBadgeLabel, marketDataBadgeClass(marketDataStatus));
  if (tickerSignals.length) {
    target.innerHTML = tickerSignals.slice(0, 12).map((signal) => {
      const lensName = signal.institutionalQuantSecurityKind === "fund-or-etf" ? "Institutional Exposure Lens" : "Institutional Quant Lens";
      const lensBadge = signal.institutionalQuantSecurityKind === "fund-or-etf" ? "Exposure" : "Quant";
      return `
      <article class="market-event ${escapeHtml(signal.tone)}">
        <div>
          <div class="badge-row">
            <span class="status-badge demo">Local confluence</span>
            <span class="status-badge ${escapeHtml(marketDataBadgeClass(marketDataStatus))}">${escapeHtml(marketDataStatus.label || "Sample market data")}</span>
            <span class="status-badge">${signal.combinedScore}/100</span>
            <span class="status-badge ${signal.actionCategory === "Monitor" ? "demo" : "safe"}">${escapeHtml(signal.actionCategory)}</span>
            <span class="status-badge">${signal.portfolioOwnershipFlag ? "Owned" : "Watchlist"}</span>
          </div>
          <h3>${renderTickerLink(signal.ticker)} · ${escapeHtml(signal.topHeadline)}</h3>
          <p>${escapeHtml(signal.explanation)}</p>
          <ul class="why-list">
            <li>Formula: ${escapeHtml(signal.formulaLabel || "transparent local review-priority score")}</li>
            <li>Momentum ${formatScore(signal.priceMomentumScore ?? signal.priceMomentumPlaceholder)} · relative strength ${formatScore(signal.relativeStrengthScore)} · concentration risk ${formatScore(signal.concentrationRiskScore)}.</li>
            <li>${lensName} ${formatScore100(signal.institutionalQuantScore)} · ${escapeHtml(signal.institutionalQuantLabel || "not enough data")} · ${escapeHtml(signal.institutionalQuantDataCoverageLabel || "coverage not scored")} · ${escapeHtml((signal.institutionalQuantStrengths || []).slice(0, 2).join("; ") || "no standout factor strength yet")}${signal.institutionalQuantScoreWasEvidenceCapped ? ` · evidence cap ${formatScore100(signal.institutionalQuantEvidenceCapScore)}` : ""}.</li>
            <li>Peer context: ${escapeHtml(signal.institutionalQuantPeerSummary || "peer rank needs more comparable names")} ${escapeHtml(signal.institutionalQuantPeerWarning || "")}</li>
            <li>Score history: ${escapeHtml(signal.institutionalQuantScoreHistoryLabel || "first local score for this source mode")}.</li>
            <li>Reddit acceleration ${formatScore(signal.redditMentionAccelerationScore)} · sentiment ${escapeHtml(signal.redditSentimentPlaceholder)} (${formatScore(signal.redditSentimentScore)}) · politician activity ${formatScore(signal.politicianActivityScore)}.</li>
            <li>Why high: ${escapeHtml((signal.whyScoreIsHigh || []).slice(0, 4).join("; ") || "baseline local/watchlist context")}.</li>
            <li>Missing data: ${escapeHtml((signal.missingData || []).slice(0, 4).join("; ") || "none listed")}.</li>
            <li>${escapeHtml(signal.marketDataLabel || "Market data is sample only.")}</li>
            <li>Confidence is capped for mock/social/disclosure-only inputs: ${formatScore(signal.confidenceScore)}.</li>
          </ul>
          <p><b>Next check:</b> ${escapeHtml(signal.nextCheck)}</p>
          <div class="connector-actions compact-actions">
            <button type="button" data-watchlist-action="promote-signal" data-ticker="${escapeHtml(signal.ticker)}" data-score="${escapeHtml(signal.combinedScore || 0)}" data-headline="${escapeHtml(signal.topHeadline || "")}" data-explanation="${escapeHtml(signal.explanation || "")}" data-sector="${escapeHtml(signal.sector || "")}" data-action-category="${escapeHtml(signal.actionCategory || "")}" aria-label="${signal.watchlistFlag ? "Update idea for" : "Track idea for"} ${escapeHtml(signal.ticker)}">${signal.watchlistFlag ? "Update idea" : "Track idea"}</button>
          </div>
          <details class="signal-details">
            <summary>Score details</summary>
            <p><b>${lensName}:</b> ${formatScore100(signal.institutionalQuantScore)} · ${escapeHtml(signal.institutionalQuantLabel || "not enough data")} · ${escapeHtml(signal.institutionalQuantDataCoverageLabel || "coverage not scored")} · ${escapeHtml(signal.institutionalQuantPeerLabel || "peer rank pending")} · ${escapeHtml(signal.institutionalQuantScoreHistoryLabel || "first local score for this source mode")}.</p>
            ${signal.topDrivers.slice(0, 5).map((driver) => `
              <p><b>${escapeHtml(driver.label)}:</b> ${formatScore(driver.score)} · ${escapeHtml(driver.reason)}</p>
            `).join("")}
            <p><b>Warnings:</b> ${escapeHtml(signal.warnings.join("; "))}</p>
          </details>
        </div>
        <aside class="affected-exposure">
          <span>Confluence score</span>
          <b>${signal.combinedScore}/100</b>
          <div class="ticker-chips">${renderTickerChips([signal.ticker])}</div>
          <small>${signal.portfolioOwnershipFlag ? `${formatCurrency(signal.holdingsValue)} · ${formatPct(signal.portfolioWeight)}` : "No current position"} · ${lensBadge} Lens ${formatScore100(signal.institutionalQuantScore)} · ${signal.watchlistFlag ? "watchlist" : "tracked"}${signal.marketDataPrice ? ` · quote ${formatCurrency(signal.marketDataPrice)}` : ""}</small>
        </aside>
      </article>
    `;
    }).join("") + `<p class="section-note">${escapeHtml(marketDataSignalsDisclaimer(marketDataStatus))}</p>`;
    return;
  }
  const rows = buildTickerSignalRows(events, holdings, alphaSignals, uiState);
  if (!rows.length) {
    target.innerHTML = `
      <div class="empty">
        <strong>No ticker signals available.</strong>
        <span>Sample market scenarios appear here once local events are loaded. Configured news provider: Not configured.</span>
      </div>
    `;
    return;
  }
  target.innerHTML = rows.map((row) => `
    <article class="market-event ${escapeHtml(row.tone)}">
      <div>
        <div class="badge-row">
          <span class="status-badge demo">Sample scenario</span>
          <span class="status-badge">${escapeHtml(row.eventCountLabel)}</span>
          <span class="status-badge action">${escapeHtml(row.actionLabel)}</span>
        </div>
        <h3>${renderTickerLink(row.ticker)}</h3>
        <p>${escapeHtml(row.summary)}</p>
        <ul class="why-list">
          ${row.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}
        </ul>
        <p><b>Next check:</b> ${escapeHtml(row.nextCheck)}</p>
      </div>
      <aside class="affected-exposure">
        <span>Current exposure</span>
        <b>${escapeHtml(row.valueLabel)}</b>
        <div class="ticker-chips">${renderTickerChips([row.ticker])}</div>
        <small>${escapeHtml(row.weightLabel)}</small>
      </aside>
    </article>
  `).join("");
}

function buildTickerSignalRows(events = [], holdings = [], alphaSignals = [], uiState = "SAMPLE_MODE") {
  const imported = isImportedState(uiState);
  const holdingMap = new Map();
  if (imported) {
    holdings.forEach((holding) => {
      const ticker = holding.ticker || "UNKNOWN";
      const current = holdingMap.get(ticker) || { ticker, value: 0, weight: 0, accounts: new Set(), riskLevel: holding.riskLevel, thesisStatus: holding.thesisStatus };
      current.value += Number(holding.marketValue) || 0;
      current.weight += Number(holding.portfolioWeight) || 0;
      current.accounts.add(holding.account);
      if (riskRank(holding.riskLevel) > riskRank(current.riskLevel)) current.riskLevel = holding.riskLevel;
      if (current.thesisStatus !== holding.thesisStatus) current.thesisStatus = "Mixed";
      holdingMap.set(ticker, current);
    });
  }
  const tickers = unique([
    ...holdings.map((holding) => holding.ticker),
    ...events.flatMap(eventTickers),
    ...alphaSignals.flatMap(eventTickers),
    "MU",
    "NVDA",
    "AMD",
    "SOXL",
    "UPRO",
    "VGT",
    "CRDO"
  ]).slice(0, 24);
  return tickers
    .map((ticker) => {
      const relatedEvents = events.filter((event) => eventTickers(event).includes(ticker));
      const relatedSignals = alphaSignals.filter((signal) => eventTickers(signal).includes(ticker));
      const holding = holdingMap.get(ticker);
      const topSignal = relatedSignals.sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0))[0];
      const topEvent = relatedEvents[0];
      const eventCount = relatedEvents.length + relatedSignals.length;
      const value = holding?.value || 0;
      const actionLabel = topSignal ? signalActionCategory(topSignal) : topEvent ? marketActionLabel(topEvent) : "Watchlist";
      return {
        ticker,
        value,
        eventCount,
        eventCountLabel: `${eventCount} linked item${eventCount === 1 ? "" : "s"}`,
        actionLabel,
        tone: actionLabel === "Review" || actionLabel === "Critical Review" ? "high" : "medium",
        valueLabel: imported && holding ? formatCurrency(value) : "--",
        weightLabel: imported
          ? holding ? `${formatPct(holding.weight || 0)} portfolio weight` : "Not owned in active portfolio"
          : "Import portfolio to calculate weight",
        summary: topSignal?.headline || topEvent?.title || "Tracked holding/watchlist ticker with no current source-labeled event.",
        reasons: [
          imported
            ? holding
              ? `${formatCurrency(value)} across ${holding.accounts.size} account${holding.accounts.size === 1 ? "" : "s"}.`
              : "Not owned in the active portfolio; treat this as market/context only."
            : "No real portfolio exposure shown until import.",
          topEvent?.portfolioReadThrough || topSignal?.whyThisMattersToTucker || "Use this as a watchlist row, not a live market signal.",
          holding?.thesisStatus ? `Thesis status: ${holding.thesisStatus}.` : "Thesis status appears after import/thesis setup."
        ],
        nextCheck: topSignal?.nextReviewQuestion || topEvent?.suggestedAction || "Watch for confirmed source data before acting."
      };
    })
    .filter((row) => row.eventCount || row.value)
    .sort((a, b) => b.eventCount - a.eventCount || b.value - a.value || a.ticker.localeCompare(b.ticker))
    .slice(0, 10);
}

function renderSignalReview(rows = [], filter = "all") {
  const target = byId("signalReviewPanel");
  if (!target) return;
  const countLabel = `${rows.length} signal${rows.length === 1 ? "" : "s"}`;
  if (!rows.length) {
    target.innerHTML = `
      <div class="empty">
        <strong>No signals match this filter.</strong>
        <span>Try a broader filter or load holdings/market data. This review is exploratory and only uses available local/live-cached history.</span>
      </div>
    `;
    return;
  }
  target.innerHTML = `
    <div class="provider-status-note">
      <b>Exploratory signal review · ${escapeHtml(countLabel)}</b>
      <span>Filter: ${escapeHtml(signalReviewFilterLabel(filter))}. Forward returns are calculated only when historical closes exist after the signal anchor. This is not a validated strategy or a prediction engine.</span>
    </div>
    <div class="signal-review-list">
      ${rows.slice(0, 18).map(renderSignalReviewCard).join("")}
    </div>
  `;
}

function renderSignalReviewCard(row) {
  return `
    <article class="market-event signal-review-card ${row.combinedScore >= 70 ? "medium" : row.combinedScore >= 55 ? "low" : "muted"}">
      <div>
        <div class="badge-row">
          <span class="status-badge demo">Backtesting-lite</span>
          <span class="status-badge">${escapeHtml(row.quoteSourceLabel)}</span>
          <span class="status-badge ${row.actionCategory === "Monitor" ? "demo" : "safe"}">${escapeHtml(row.actionCategory)}</span>
          ${row.sourceDrivers.slice(0, 2).map((label) => `<span class="status-badge">${escapeHtml(label)}</span>`).join("")}
          ${row.sourceDrivers.length > 2 ? `<span class="status-badge">+${row.sourceDrivers.length - 2} drivers</span>` : ""}
        </div>
        <h3>${renderTickerLink(row.ticker)} · ${escapeHtml(row.headline)}</h3>
        <p>${escapeHtml(row.explanation)}</p>
        <div class="signal-component-list">
          ${row.scoreComponents.map((component) => `
            <div>
              <span>${escapeHtml(component.label)}</span>
              <b>${formatScore(component.score)}</b>
              <div class="bar"><i style="width:${Math.round((Number(component.score) || 0) * 100)}%"></i></div>
              <small>${escapeHtml(component.note)}</small>
            </div>
          `).join("")}
        </div>
        <details class="signal-details">
          <summary>Missing data and method notes</summary>
          ${row.missingDataWarnings.length
            ? `<ul class="why-list">${row.missingDataWarnings.slice(0, 8).map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>`
            : '<p>No obvious missing data warnings for this lightweight review.</p>'}
          <p>Forward returns use available historical close rows as trading-day points. No slippage, taxes, execution, survivorship, benchmark adjustment, or portfolio sizing rules are modeled.</p>
        </details>
      </div>
      <aside class="affected-exposure signal-review-aside">
        <span>Signal score</span>
        <b>${row.combinedScore}/100</b>
        <small>${row.portfolioOwnershipFlag ? `${formatCurrency(row.marketValue)} owned · ${formatPct(row.portfolioWeight)}` : row.watchlistFlag ? "Watchlist / not owned" : "Tracked signal"} · anchor ${escapeHtml(row.signalDateLabel)}</small>
        <div class="forward-return-grid">
          ${["1d", "5d", "20d"].map((key) => renderForwardReturnCell(key, row.forward?.returns?.[key])).join("")}
        </div>
        <button type="button" data-watchlist-action="promote-signal" data-ticker="${escapeHtml(row.ticker)}" data-score="${escapeHtml(row.combinedScore || 0)}" data-headline="${escapeHtml(row.headline || "")}" data-explanation="${escapeHtml(row.explanation || "")}" data-action-category="${escapeHtml(row.actionCategory || "")}" aria-label="${row.watchlistFlag ? "Update idea for" : "Track idea for"} ${escapeHtml(row.ticker)}">${row.watchlistFlag ? "Update idea" : "Track idea"}</button>
      </aside>
    </article>
  `;
}

function renderForwardReturnCell(label, result) {
  if (!result || result.returnPct === null || result.returnPct === undefined) {
    return `<div><span>${escapeHtml(label)}</span><b>--</b><small>not enough history</small></div>`;
  }
  return `<div><span>${escapeHtml(label)}</span><b class="${result.returnPct >= 0 ? "positive" : "negative"}">${formatSignedPct(result.returnPct)}</b><small>${escapeHtml(shortDateTime(result.endDate))}</small></div>`;
}

function signalReviewFilterLabel(filter = "all") {
  return ({
    all: "All current signals",
    owned: "Owned tickers",
    watchlist: "Watchlist-only tickers",
    reddit: "Reddit-driven",
    politician: "Politician-trade-driven",
    momentum: "High momentum"
  })[filter] || "All current signals";
}

function renderXSignals(records = [], report = null, settings = {}) {
  const target = byId("xSignalsPanel");
  if (!target) return;
  if (!records.length) {
    target.innerHTML = `
      <div class="empty">
        <strong>No X/social update records loaded.</strong>
        <span>Sample X rows appear here until Tucker enables a compliant X API provider. No scraping, cookies, or browser sessions are used.</span>
      </div>
    `;
    return;
  }
  const source = xSourceMeta(records, report);
  const summary = summarizeXUpdates(records, { asOf: report?.fetchedAt || records[0]?.sourceAsOf || new Date().toISOString() });
  target.innerHTML = `
    <div class="provider-status-note">
      <b>${escapeHtml(source.label)}</b>
      <span>${records.length} update row${records.length === 1 ? "" : "s"} · query ${escapeHtml(report?.settings?.query || settings?.query || "default cashtag watch")}. ${escapeHtml(source.detail)}</span>
    </div>
    <div class="reddit-summary-grid">
      ${summary.slice(0, 6).map((row) => `
        <div class="provider-status-card ${escapeHtml(source.className || "missing")}">
          <div>
            <b>${renderTickerLink(row.ticker)}</b>
            <span>1d ${row.oneDayMentions} · 7d ${row.sevenDayMentions} · 30d ${row.thirtyDayMentions}</span>
          </div>
          <div>
            <strong>${number.format(row.totalEngagement || 0)}</strong>
            <span>engagement · low-trust social attention</span>
          </div>
          <p>X/social updates are attention signals only. Confirm with price action, filings, company releases, or higher-quality sources.</p>
        </div>
      `).join("")}
    </div>
    <div class="market-list">
      ${records.slice(0, 6).map((update) => `
        <article class="market-event low">
          <div>
            <div class="badge-row">
              <span class="status-badge ${escapeHtml(source.badgeClass || "demo")}">${escapeHtml(source.label)}</span>
              <span class="status-badge">${escapeHtml(update.trustLevel || "low trust")}</span>
              <span class="status-badge">${escapeHtml(update.sentiment || "unknown")} placeholder</span>
            </div>
            <h3>${escapeHtml(update.title || update.ticker || "X/social ticker update")}</h3>
            <p>${escapeHtml(summaryText(update.text || update.body, 180))}</p>
            <p><b>Review prompt:</b> Treat as chatter unless higher-quality evidence confirms it.</p>
            <details class="signal-details">
              <summary>Details</summary>
              <p><b>Created:</b> ${escapeHtml(formatDateTime(update.createdAt))}</p>
              <p><b>Engagement:</b> ${number.format(update.engagementScore || update.score || 0)}</p>
              <p><a href="${escapeHtml(safeExternalHref(update.sourceUrl || "#"))}" target="_blank" rel="noopener noreferrer">${source.live ? "X source" : "Sample source"}</a></p>
            </details>
          </div>
          <aside class="affected-exposure">
            <span>Extracted tickers</span>
            <b>${renderTickerLink(update.ticker || "")}</b>
            <div class="ticker-chips">
              ${renderTickerChips((update.extractedTickers || [update.ticker]).slice(0, 6))}
            </div>
            <small>No usernames stored</small>
          </aside>
        </article>
      `).join("")}
    </div>
    <p class="section-note">${escapeHtml(source.footer)}</p>
  `;
}

function renderRedditSignals(records = [], report = null, settings = {}) {
  const target = byId("redditSignalsPanel");
  if (!target) return;
  if (!records.length) {
    target.innerHTML = `
      <div class="empty">
        <strong>No Reddit mention records loaded.</strong>
        <span>Sample Reddit rows appear here until Tucker approves a compliant API provider. No Reddit scraping is active.</span>
      </div>
    `;
    return;
  }
  const source = redditSourceMeta(records, report);
  const summary = summarizeRedditMentions(records, { asOf: report?.fetchedAt || records[0]?.sourceAsOf || new Date().toISOString() });
  target.innerHTML = `
    <div class="provider-status-note">
      <b>${escapeHtml(source.label)}</b>
      <span>${report?.fileName && !source.live ? `${escapeHtml(report.fileName)} · ` : ""}${records.length} mention row${records.length === 1 ? "" : "s"} · subreddits ${(settings.subreddits || report?.subredditsDetected || []).slice(0, 5).map((subreddit) => `r/${escapeHtml(subreddit)}`).join(", ") || "default watch"}. ${escapeHtml(source.detail)}</span>
    </div>
    <div class="reddit-summary-grid">
      ${summary.slice(0, 6).map((row) => `
      <div class="provider-status-card ${escapeHtml(source.className)}">
          <div>
            <b>${renderTickerLink(row.ticker)}</b>
            <span>1d ${row.oneDayMentions} · 7d ${row.sevenDayMentions} · 30d ${row.thirtyDayMentions}</span>
          </div>
          <div>
            <strong>${formatGrowth(row.mentionGrowth)}</strong>
            <span>${escapeHtml(row.sentiment)} sentiment label · acceleration ${formatGrowth(row.mentionAcceleration ?? row.mentionGrowth)}</span>
          </div>
          <p>Total ${source.providerBacked || source.mode === DATA_MODES.IMPORTED ? "social" : "mock"} engagement ${number.format(row.totalEngagement)}. Reddit/social signals stay low trust until confirmed by primary sources.</p>
        </div>
      `).join("")}
    </div>
    <div class="market-list">
      ${records.slice(0, 6).map((mention) => `
        <article class="market-event low">
          <div>
            <div class="badge-row">
              <span class="status-badge ${escapeHtml(source.badgeClass)}">${escapeHtml(source.label)}</span>
              <span class="status-badge">r/${escapeHtml(mention.subreddit || "unknown")}</span>
              <span class="status-badge">${escapeHtml(mention.sentiment || "unknown")} placeholder</span>
            </div>
            <h3>${escapeHtml(mention.title || mention.ticker || "Reddit ticker mention")}</h3>
            <p>${escapeHtml(summaryText(mention.text || mention.body || mention.commentText, 180))}</p>
            <p><b>Review prompt:</b> Log only unless a higher-quality source confirms the claim.</p>
            <details class="signal-details">
              <summary>Details</summary>
              <p><b>Created:</b> ${escapeHtml(formatDateTime(mention.createdAt))}</p>
              <p><b>Engagement:</b> score ${number.format(mention.score || 0)} · comments ${number.format(mention.commentCount || 0)}</p>
              <p><b>Primary source cited:</b> ${mention.citesPrimarySource ? "Yes" : "No"}</p>
              <p><a href="${escapeHtml(safeExternalHref(mention.sourceUrl || "#"))}" target="_blank" rel="noopener noreferrer">${source.providerBacked ? "Reddit source" : "Sample source"}</a></p>
            </details>
          </div>
          <aside class="affected-exposure">
            <span>Extracted tickers</span>
            <b>${renderTickerLink(mention.ticker || "")}</b>
            <div class="ticker-chips">
              ${renderTickerChips((mention.extractedTickers || [mention.ticker]).slice(0, 6))}
            </div>
            <small>False positives filtered</small>
          </aside>
        </article>
      `).join("")}
    </div>
    <p class="section-note">${escapeHtml(source.footer)}</p>
  `;
}

function renderRedditSourceStatus(records = [], report = null, settings = {}, readiness = {}) {
  const target = byId("redditProviderPanel");
  if (!target) return;
  const statuses = readiness.redditProviderStatuses || {};
  const config = readiness.redditProviderConfig || {};
  const rejected = report?.rejectedRows || [];
  const source = redditSourceMeta(records, report);
  target.innerHTML = `
    <div class="provider-status-note">
      <b>${escapeHtml(source.live ? "Reddit API synced" : source.providerBacked ? source.label : report?.mentionsImported ? "Reddit JSON imported" : "Reddit API not configured")}</b>
      <span>${report?.fileName && !source.live ? `${escapeHtml(report.fileName)} · ` : ""}${records.length} ${source.providerBacked ? "API/cache" : "sample/local"} mention row${records.length === 1 ? "" : "s"} loaded. ${escapeHtml(config.detail || source.detail || "")}</span>
    </div>
    ${Object.values(statuses).length ? Object.values(statuses).map((status) => `
      <div class="provider-status-card ${status.liveProviderCalls ? "configured" : status.configured ? "configured-pending" : status.status === "mock/sample mode" ? "missing" : "missing"}">
        <div>
          <b>${escapeHtml(status.label)}</b>
          <span>${escapeHtml((status.subreddits || settings.subreddits || []).slice(0, 5).map((subreddit) => `r/${subreddit}`).join(", ") || "subreddit watchlist")}</span>
        </div>
        <div>
          <strong>${escapeHtml(status.liveProviderCalls ? "Live sync enabled" : status.configured && status.id !== "mock" ? "Configured, disabled" : status.status || "Not configured")}</strong>
          <span>${status.liveProviderCalls ? "Server-side API only" : dataModeLabel(DATA_MODES.NOT_CONFIGURED)}</span>
        </div>
        <p>${escapeHtml(status.warning || "Sample/local mode only. Do not scrape Reddit pages.")}</p>
      </div>
    `).join("") : `
      <div class="provider-status-card missing">
        <div><b>Reddit API</b><span>OAuth planned; not configured</span></div>
        <div><strong>Not configured</strong><span>${dataModeLabel(DATA_MODES.NOT_CONFIGURED)}</span></div>
        <p>Add Reddit environment variables on the local backend. Sample/local JSON remains active.</p>
      </div>
    `}
    ${report ? `
      <details class="signal-details">
        <summary>Reddit import details</summary>
        <p><b>Rows parsed:</b> ${number.format(report.rowsParsed || 0)} · <b>Mentions imported:</b> ${number.format(report.mentionsImported || 0)} · <b>Rejected rows:</b> ${number.format(rejected.length)}</p>
        <p><b>Tickers:</b> ${escapeHtml((report.tickersDetected || []).join(", ") || "none")} · <b>Subreddits:</b> ${escapeHtml((report.subredditsDetected || []).join(", ") || "none")}</p>
        ${rejected.length ? rejected.slice(0, 6).map((row) => `<p><b>Row ${escapeHtml(row.rowNumber)}:</b> ${escapeHtml(row.reason)}</p>`).join("") : "<p>No rejected rows.</p>"}
      </details>
    ` : ""}
  `;
}

function renderXSourceStatus(records = [], report = null, settings = {}, readiness = {}) {
  const target = byId("xProviderPanel");
  if (!target) return;
  const statuses = readiness.xProviderStatuses || {};
  const config = readiness.xProviderConfig || {};
  const rejected = report?.rejectedRows || [];
  const source = xSourceMeta(records, report);
  target.innerHTML = `
    <div class="provider-status-note">
      <b>${escapeHtml(source.live ? "X API synced" : report?.updatesImported ? "X/social rows loaded" : "X API not configured")}</b>
      <span>${records.length} ${source.live ? "API" : "sample/local"} update row${records.length === 1 ? "" : "s"} loaded. ${escapeHtml(config.detail || source.detail || "")}</span>
    </div>
    ${Object.values(statuses).length ? Object.values(statuses).map((status) => `
      <div class="provider-status-card ${status.liveProviderCalls ? "configured" : status.configured ? "configured-pending" : status.status === "mock/sample mode" ? "missing" : "missing"}">
        <div>
          <b>${escapeHtml(status.label)}</b>
          <span>${escapeHtml(status.query || settings.query || "default cashtag watch")}</span>
        </div>
        <div>
          <strong>${escapeHtml(status.liveProviderCalls ? "Live sync enabled" : status.configured && status.id !== "mock" ? "Configured, disabled" : status.status || "Not configured")}</strong>
          <span>${status.liveProviderCalls ? "Server-side API only" : dataModeLabel(DATA_MODES.NOT_CONFIGURED)}</span>
        </div>
        <p>${escapeHtml(status.warning || "Sample/local mode only. Do not scrape X pages or store cookies.")}</p>
      </div>
    `).join("") : `
      <div class="provider-status-card missing">
        <div><b>X API</b><span>Recent search planned; not configured</span></div>
        <div><strong>Not configured</strong><span>${dataModeLabel(DATA_MODES.NOT_CONFIGURED)}</span></div>
        <p>Add X_BEARER_TOKEN and X_LIVE_ENABLED=true on the local backend. Sample X rows remain active.</p>
      </div>
    `}
    ${report ? `
      <details class="signal-details">
        <summary>X source details</summary>
        <p><b>Rows parsed:</b> ${number.format(report.rowsParsed || 0)} · <b>Updates loaded:</b> ${number.format(report.updatesImported || records.length || 0)} · <b>Rejected rows:</b> ${number.format(rejected.length)}</p>
        <p><b>Tickers:</b> ${escapeHtml((report.tickersDetected || []).join(", ") || "none")} · <b>Status:</b> ${escapeHtml(report.dataFreshness || report.status || "sample")}</p>
        ${rejected.length ? rejected.slice(0, 6).map((row) => `<p><b>Row ${escapeHtml(row.rowNumber)}:</b> ${escapeHtml(row.reason)}</p>`).join("") : "<p>No rejected rows.</p>"}
      </details>
    ` : ""}
  `;
}

function xSourceMeta(records = [], report = null) {
  const providerBacked = Boolean(report?.mode === "x-api" || records.some((record) => record.providerId === "x-api" || record.liveProviderCalls));
  const sourceStatus = String(report?.dataFreshness || report?.cacheStatus || report?.status || "");
  const stale = /stale/i.test(sourceStatus);
  const cached = /cached/i.test(sourceStatus);
  const limitedOrError = /rate limited|error|failed/i.test(sourceStatus);
  const live = providerBacked && Boolean(report?.liveProviderCalls || records.some((record) => record.liveProviderCalls)) && !stale && !cached && !limitedOrError;
  if (providerBacked) {
    return {
      providerBacked,
      live,
      stale,
      cached,
      limitedOrError,
      label: limitedOrError ? "X API needs review" : stale ? "Stale X API" : cached || !live ? "Cached X API" : "Live X API",
      badgeClass: limitedOrError || stale ? "warning" : "info",
      className: limitedOrError || stale ? "configured-pending" : cached ? "imported-local" : "configured",
      detail: limitedOrError
        ? "X API rows may be partial or rate-limited. Treat them as low-trust context until refresh succeeds."
        : stale ? "Using stale cached X API rows after a refresh issue." : cached || !live ? "Using cached X API rows restored from local browser storage." : "Live X API rows were fetched server-side through the local backend.",
      footer: "X/social data remains lower trust than primary sources. No usernames, cookies, passwords, session tokens, or API secrets are stored in the browser."
    };
  }
  return {
    providerBacked,
    live: false,
    stale: false,
    cached: false,
    limitedOrError: false,
    label: "Sample X/social",
    badgeClass: "demo",
    className: "missing",
    detail: "Sample X/social mode is active. Live X API: Not configured.",
    footer: "Sample social data only. Live X API: Not configured. No scraping, cookies, browser sessions, or credentials are connected."
  };
}

function redditSourceMeta(records = [], report = null) {
  const providerBacked = Boolean(
    report?.mode === "reddit-api" ||
    report?.sourceMode === "api" ||
    report?.providerId === "reddit-api" ||
    records.some((record) => record.sourceMode === "api" || record.providerId === "reddit-api" || record.liveProviderCalls)
  );
  const sourceStatus = String(report?.dataFreshness || report?.cacheStatus || report?.status || "");
  const stale = /stale/i.test(sourceStatus);
  const cached = /cached/i.test(sourceStatus);
  const limitedOrError = /rate limited|error|failed/i.test(sourceStatus);
  const live = providerBacked && Boolean(report?.liveProviderCalls || records.some((record) => record.liveProviderCalls)) && !stale && !cached && !limitedOrError;
  const mode = limitedOrError
    ? DATA_MODES.ERROR
    : stale
    ? DATA_MODES.STALE
    : cached || (providerBacked && !live)
    ? DATA_MODES.CACHED
    : live
    ? DATA_MODES.LIVE
    : report?.mentionsImported || report?.mode === "local-json"
    ? DATA_MODES.IMPORTED
    : records.length
    ? DATA_MODES.SAMPLE
    : DATA_MODES.NOT_CONFIGURED;
  if (providerBacked) {
    return {
      live,
      providerBacked,
      mode,
      stale,
      cached: mode === DATA_MODES.CACHED,
      limitedOrError,
      label: limitedOrError ? "Reddit API needs review" : stale ? "Stale Reddit API" : mode === DATA_MODES.CACHED ? "Cached Reddit API" : "Live Reddit API",
      badgeClass: limitedOrError || stale ? "warning" : "info",
      className: limitedOrError || stale ? "configured-pending" : cached || !live ? "imported-local" : "configured",
      detail: limitedOrError
        ? "Reddit API rows may be partial or rate-limited. Treat them as low-trust context until refresh succeeds."
        : stale ? "Using stale cached Reddit API rows after a refresh issue." : cached || !live ? "Using cached Reddit API rows restored from local browser storage." : "Live Reddit API rows were fetched server-side through the local backend.",
      footer: "Reddit/social data remains lower trust than primary sources. No usernames, cookies, passwords, or API secrets are stored in the browser."
    };
  }
  if (report?.mentionsImported || report?.mode === "local-json") {
    return {
      live,
      providerBacked,
      mode,
      stale: false,
      cached: false,
      limitedOrError: false,
      label: "Imported local JSON",
      badgeClass: "demo",
      className: "imported-local",
      detail: "Imported file data is active. Live Reddit API: Not configured.",
      footer: "Imported Reddit-like JSON is local-only and low trust until confirmed by higher-quality sources."
    };
  }
  return {
    live,
    providerBacked,
    mode,
    stale: false,
    cached: false,
    limitedOrError: false,
    label: "Sample Reddit",
    badgeClass: "demo",
    className: "missing",
    detail: "Sample Reddit mode is active. Live Reddit API: Not configured.",
    footer: "Sample social data only. Live Reddit API: Not configured. No scraping, cookies, or credentials are connected."
  };
}

function politicianTradeSourceMeta(records = [], report = null) {
  const providerBacked = Boolean(
    report?.mode === "public-static-dataset" ||
    report?.providerId === "senate-stock-watcher-public-dataset" ||
    records.some((record) => record.sourceMode === "public-static-dataset" || record.providerId === "senate-stock-watcher-public-dataset" || record.liveProviderCalls)
  );
  const sourceStatus = String(report?.dataFreshness || report?.cacheStatus || report?.status || "");
  const stale = /stale/i.test(sourceStatus);
  const cached = /cached/i.test(sourceStatus);
  const limitedOrError = /rate limited|error|failed/i.test(sourceStatus);
  const live = providerBacked && Boolean(report?.liveProviderCalls || records.some((record) => record.liveProviderCalls)) && !stale && !cached && !limitedOrError;
  const imported = Boolean(report?.mode === "local-file" || (report?.tradesImported && !providerBacked));
  const mode = limitedOrError
    ? DATA_MODES.ERROR
    : stale
    ? DATA_MODES.STALE
    : cached || (providerBacked && !live)
    ? DATA_MODES.CACHED
    : live
    ? DATA_MODES.LIVE
    : imported
    ? DATA_MODES.IMPORTED
    : records.length
    ? DATA_MODES.SAMPLE
    : DATA_MODES.NOT_CONFIGURED;
  if (providerBacked) {
    return {
      providerBacked,
      live,
      stale,
      cached: mode === DATA_MODES.CACHED,
      limitedOrError,
      mode,
      label: limitedOrError ? "Public disclosures need review" : stale ? "Stale public disclosures" : mode === DATA_MODES.CACHED ? "Cached public disclosures" : "Public disclosures synced",
      className: limitedOrError || stale ? "configured-pending" : mode === DATA_MODES.CACHED ? "imported-local" : "configured",
      detail: limitedOrError
        ? "Public disclosure refresh failed. Review provider status before relying on new activity."
        : stale ? "Using stale cached disclosure rows; federal disclosures may already be delayed." : mode === DATA_MODES.CACHED ? "Using public disclosure rows restored from local browser storage." : "Fetched through the local backend; provider freshness is source-labeled.",
      guidance: limitedOrError ? "Public disclosure refresh failed. Review provider status before relying on new activity." : stale ? "Using cached disclosure rows after a provider refresh issue. Public disclosures may already be delayed." : report?.sourceCoverage || "Public disclosure dataset rows are source-attributed but delayed and partial; treat them as context, not real-time activity."
    };
  }
  if (imported) {
    return {
      providerBacked,
      live,
      stale: false,
      cached: false,
      limitedOrError: false,
      mode,
      label: "Imported local disclosure rows",
      className: "imported-local",
      detail: "Local CSV/JSON disclosure data is active.",
      guidance: "Imported disclosure data is usable as context."
    };
  }
  return {
    providerBacked,
    live,
    stale: false,
    cached: false,
    limitedOrError: false,
    mode,
    label: "Sample disclosure rows",
    className: "missing",
    detail: "Public disclosure sync: Not configured.",
    guidance: "Federal disclosure provider: Not configured."
  };
}

function eventTickers(event = {}) {
  return unique([
    ...(event.affectedTickers || []),
    ...(event.inferredTickersAffected || []),
    ...(event.tickersMentioned || []),
    event.primaryTicker
  ].filter(Boolean).map((ticker) => String(ticker).toUpperCase()));
}

function eventCalendarTickers(event = {}) {
  return unique([
    event.ticker,
    ...(event.tickers || []),
    ...(event.affectedTickers || []),
    ...(event.inferredTickersAffected || [])
  ].filter(Boolean).map((ticker) => String(ticker).toUpperCase()));
}

function eventTickerChips(event = {}) {
  return renderTickerChips(eventCalendarTickers(event).slice(0, 6));
}

function eventSourceBadgeClass(sourceMode = "") {
  const mode = String(sourceMode || "").toLowerCase();
  if (mode === "live") return "safe";
  if (mode === "imported" || mode === "manual") return "";
  if (mode === "stale" || mode === "error") return "sample";
  return "demo";
}

function calendarReviewPrompt(event = {}, uiState = "SAMPLE_MODE") {
  if (!isImportedState(uiState)) return "Sample event only. Import a real portfolio before treating it as Tucker-specific.";
  if (event.eventType === "earnings") return "Check thesis assumptions and position size before the earnings window.";
  if (event.eventType === "fed-macro") return "Review leverage, rates sensitivity, and broad market exposure.";
  if (event.eventType === "product-event" || event.eventType === "investor-day") return "Watch whether the event supports or weakens the thesis.";
  if (event.eventType === "ex-dividend") return "Log the date; this is usually informational unless income timing matters.";
  return "Review the linked ticker or notes if the event could change thesis or sizing.";
}

function renderMarketIntelligence(events, holdings, uiState = "SAMPLE_MODE", options = {}) {
  const target = byId("marketIntelligencePanel");
  if (!target) return;
  target.innerHTML = events.length
    ? events.map((event) => {
      const exposure = buildAffectedExposureSummary(event, isImportedState(uiState) ? holdings : []);
      const sourceContext = buildMarketEventSourceContext(event, options);
      const sourceBadges = sourceContext.badges.slice(0, 2);
      const hiddenSourceBadgeCount = Math.max(0, sourceContext.badges.length - sourceBadges.length);
      return `
        <article class="market-event ${escapeHtml(event.severity)}">
          <div>
            <div class="badge-row">
              <span class="status-badge">${escapeHtml(event.category || "event")}</span>
              <span class="status-badge">${escapeHtml(`${event.confidence || "Unknown"} confidence`)}</span>
              <span class="status-badge demo">Sample scenario</span>
              <span class="status-badge action">${escapeHtml(marketActionLabel(event))}</span>
              ${sourceBadges.map((badge) => `<span class="status-badge ${escapeHtml(badge.className || "")}">${escapeHtml(badge.label)}</span>`).join("")}
              ${hiddenSourceBadgeCount ? `<span class="status-badge">+${hiddenSourceBadgeCount} source${hiddenSourceBadgeCount === 1 ? "" : "s"}</span>` : ""}
            </div>
            <h3>${escapeHtml(event.title)}</h3>
            <p>${escapeHtml(event.summary)}</p>
            <ul class="why-list">
              <li>${escapeHtml(event.portfolioReadThrough)}</li>
              ${sourceContext.linkedSummary ? `<li>${escapeHtml(sourceContext.linkedSummary)}</li>` : ""}
            </ul>
            <p><b>Suggested review:</b> ${escapeHtml(event.suggestedAction)}</p>
            <details class="signal-details">
              <summary>Details</summary>
              <p><b>Source:</b> ${escapeHtml(event.source || "Sample market intelligence")}</p>
              <p><b>As of:</b> ${escapeHtml(event.sourceAsOf || "Demo")}</p>
              ${renderMarketEventSourceContext(sourceContext)}
            </details>
          </div>
          ${renderAffectedExposureSummary(exposure)}
        </article>
      `;
    }).join("")
    : '<div class="empty"><strong>No market intelligence events loaded.</strong><span>Sample read-throughs appear here until live news is approved and connected.</span></div>';
}

function buildMarketEventSourceContext(event = {}, options = {}) {
  const tickers = new Set(eventTickers(event));
  const matchingReddit = summarizeRedditMentions(options.redditMentions || [], { asOf: options.asOf })
    .filter((row) => tickers.has(normalizeTickerSymbol(row.ticker)) && (row.sevenDayMentions || row.thirtyDayMentions))
    .slice(0, 2);
  const matchingX = summarizeXUpdates(options.xUpdates || [], { asOf: options.asOf })
    .filter((row) => tickers.has(normalizeTickerSymbol(row.ticker)) && (row.sevenDayMentions || row.thirtyDayMentions))
    .slice(0, 2);
  const matchingDisclosures = (options.politicianTrades || [])
    .filter((trade) => tickers.has(normalizeTickerSymbol(trade.ticker)))
    .sort((a, b) => String(b.disclosureDate || b.disclosedAt || b.transactionDate || "").localeCompare(String(a.disclosureDate || a.disclosedAt || a.transactionDate || "")))
    .slice(0, 2);
  const matchingSocial = (options.alphaSignals || [])
    .filter((signal) =>
      String(signal.sourceType || "").toLowerCase() === "social" &&
      eventTickers(signal).some((ticker) => tickers.has(ticker))
    )
    .sort((a, b) => (Number(b.priorityScore) || 0) - (Number(a.priorityScore) || 0))
    .slice(0, 2);
  const xStatus = options.providerReadiness?.providerStatuses?.xApi || {};
  const badges = [];
  const rows = [];

  if (matchingX.length || matchingSocial.length) {
    const totalXUpdates = matchingX.reduce((total, row) => total + (Number(row.sevenDayMentions) || 0), 0);
    badges.push({ label: `X/social ${totalXUpdates || matchingSocial.length}`, className: matchingX.length ? "info" : "demo" });
    rows.push({
      label: "X/social",
      detail: matchingX.length
        ? matchingX.map((row) => `${row.ticker}: ${row.sevenDayMentions || 0} / 7d, engagement ${number.format(row.totalEngagement || 0)}`).join("; ")
        : matchingSocial.map((signal) => summaryText(signal.headline || signal.summary || "Lower-trust social signal", 110)).join("; ")
    });
  } else {
    rows.push({
      label: "X",
      detail: xStatus.configured
        ? "Key presence is detected, but live X adapter calls are disabled; no X posts are merged into this card."
        : "Not connected; no X posts are merged into this card."
    });
  }

  if (matchingReddit.length) {
    const totalMentions = matchingReddit.reduce((total, row) => total + (Number(row.sevenDayMentions) || 0), 0);
    badges.push({ label: `Reddit ${totalMentions}`, className: "demo" });
    rows.push({
      label: "Reddit",
      detail: matchingReddit.map((row) => `${row.ticker}: ${row.sevenDayMentions || 0} / 7d, ${row.sentiment || "unknown"}, ${row.mentionAccelerationLabel || "flat"}`).join("; ")
    });
  } else {
    rows.push({
      label: "Reddit",
      detail: "No matching Reddit mention rows for the affected tickers."
    });
  }

  if (matchingDisclosures.length) {
    badges.push({ label: `Disclosures ${matchingDisclosures.length}` });
    rows.push({
      label: "Federal disclosures",
      detail: matchingDisclosures.map((trade) =>
        `${normalizeTickerSymbol(trade.ticker)}: ${titleCase(trade.transactionType || "transaction")} by ${trade.politicianName || "unknown filer"}, disclosed ${trade.disclosureDate || trade.disclosedAt || "unknown"}`
      ).join("; ")
    });
  } else {
    rows.push({
      label: "Federal disclosures",
      detail: "No matching federal disclosure rows for the affected tickers."
    });
  }

  const linkedPieces = [
    matchingSocial.length ? `${matchingSocial.length} lower-trust X/social signal${matchingSocial.length === 1 ? "" : "s"}` : "",
    matchingReddit.length ? `${matchingReddit.reduce((total, row) => total + (Number(row.sevenDayMentions) || 0), 0)} Reddit mention${matchingReddit.reduce((total, row) => total + (Number(row.sevenDayMentions) || 0), 0) === 1 ? "" : "s"} / 7d` : "",
    matchingDisclosures.length ? `${matchingDisclosures.length} federal disclosure row${matchingDisclosures.length === 1 ? "" : "s"}` : ""
  ].filter(Boolean);

  return {
    badges,
    rows,
    linkedSummary: linkedPieces.length
      ? `Cross-source context: ${linkedPieces.join("; ")}. These are context signals, not confirmation or trade commands.`
      : ""
  };
}

function renderMarketEventSourceContext(context = {}) {
  const rows = context.rows || [];
  return `
    <p><b>Source mix:</b> Cards show at most two matching secondary-source badges; full Reddit and disclosure panels remain below for detail.</p>
    ${rows.map((row) => `<p><b>${escapeHtml(row.label)}:</b> ${escapeHtml(row.detail)}</p>`).join("")}
  `;
}

function marketActionLabel(event = {}) {
  if (/supply|labor/i.test(event.category || event.title || "")) return "Monitor";
  if (/risk|leveraged|volatility/i.test(event.category || event.title || "")) return "Review";
  return "Positive Signal";
}

function renderProviderReadiness(readiness = {}) {
  const target = byId("providerReadinessPanel");
  if (!target) return;
  const statuses = Object.values(readiness.providerStatuses || {});
  const quoteStatuses = Object.values(readiness.marketDataQuoteProviders || {});
  const marketDataConfig = readiness.marketDataConfig || {};
  target.innerHTML = `
    <div class="provider-status-note">
      <b>${escapeHtml(readiness.mode || "demo")}</b>
      <span>${escapeHtml(readiness.message || "Provider readiness is unavailable.")}</span>
    </div>
    ${statuses.map((status) => {
      const providerLabel = providerStatusDisplay(status);
      return `
      <div class="provider-status-card ${providerLabel.className}">
        <div>
          <b>${escapeHtml(status.label)}</b>
          <span>${escapeHtml(status.sourceTypes?.join(", ") || "source")} · trust ${escapeHtml(status.trustLevel || "unknown")}</span>
        </div>
        <div>
          <strong>${escapeHtml(providerLabel.strong)}</strong>
          <span>${escapeHtml(providerLabel.detail)}</span>
        </div>
        <p>${escapeHtml(status.warning || "")}</p>
      </div>
    `;
    }).join("")}
    <div class="provider-status-note quiet">
      <b>Market data quote provider</b>
      <span>${escapeHtml(marketDataConfig.detail || "Quote provider configuration is local-only and not connected.")}</span>
    </div>
    ${quoteStatuses.map((status) => {
      const providerLabel = providerStatusDisplay(status);
      return `
      <div class="provider-status-card ${providerLabel.className}">
        <div>
          <b>${escapeHtml(status.label)}</b>
          <span>${escapeHtml(status.capabilities?.slice(0, 4).join(", ") || "quote provider")} · ${escapeHtml(status.recommendation || "configurable later")}</span>
        </div>
        <div>
          <strong>${escapeHtml(providerLabel.strong)}</strong>
          <span>${escapeHtml(providerLabel.detail)}</span>
        </div>
        <p>${escapeHtml(status.warning || "Quote calls stay behind the local backend and never expose API keys to browser code.")}</p>
      </div>
    `;
    }).join("")}
  `;
}

export function renderDataSourceHealth(readiness = {}, fidelityStatus = {}, seekingAlphaStatus = {}, report = {}, marketDataStatus = {}, politicianReport = null, politicianTrades = [], redditReport = null, redditMentions = [], portfolioStatus = null, accountScope = null, xReport = null, xUpdates = []) {
  const target = byId("dataSourceHealthPanel");
  if (!target) return;
  const providerStatuses = Object.values(readiness.providerStatuses || {});
  const configuredProviders = providerStatuses.filter((status) => status.configured && status.id !== "demo").length;
  const marketDataConfig = readiness.marketDataConfig || {};
  const marketAvailability = marketDataSourceAvailability(marketDataStatus, marketDataConfig);
  const marketDataMeta = marketDataFreshnessLine(marketDataStatus);
  const importAvailability = portfolioImportSourceStatus(report, portfolioStatus);
  const redditConfig = readiness.redditProviderConfig || {};
  const redditSource = redditSourceMeta(redditMentions, redditReport);
  const redditLiveStatus = (readiness.redditProviderStatuses || {}).redditApi || {};
  const redditAvailabilityLabel = dataModeLabel(redditSource.mode);
  const xConfig = readiness.xProviderConfig || {};
  const xSource = xSourceMeta(xUpdates, xReport);
  const xLiveStatus = (readiness.xProviderStatuses || {}).xApi || {};
  const xAvailabilityLabel = xSource.live ? dataModeLabel(DATA_MODES.LIVE) : xSource.cached ? dataModeLabel(DATA_MODES.CACHED) : xSource.stale ? dataModeLabel(DATA_MODES.STALE) : xReport?.updatesImported ? dataModeLabel(DATA_MODES.IMPORTED) : xUpdates.length ? dataModeLabel(DATA_MODES.SAMPLE) : dataModeLabel(DATA_MODES.NOT_CONFIGURED);
  const politicianConfig = readiness.politicianTradeProviderConfig || {};
  const redditSyncButton = byId("syncRedditMentionsBtn");
  if (redditSyncButton) redditSyncButton.hidden = !Boolean(redditConfig.liveProviderCalls || redditConfig.configured);
  const xSyncButton = byId("syncXUpdatesBtn");
  if (xSyncButton) xSyncButton.hidden = !Boolean(xConfig.liveProviderCalls || xConfig.configured);
  const politicianSyncButton = byId("syncPoliticianTradesBtn");
  if (politicianSyncButton) politicianSyncButton.hidden = !Boolean(politicianConfig.liveProviderCalls || politicianConfig.configured);
  const politicianSource = politicianTradeSourceMeta(politicianTrades, politicianReport);
  const politicianProviderSynced = politicianSource.providerBacked && politicianReport?.tradesImported;
  const politicianStale = politicianSource.stale;
  const politicianError = politicianSource.limitedOrError;
  const fidelityOverview = connectorOverviewStatus("Fidelity", fidelityStatus, "CSV import works. Plaid account linking runs through the local backend when configured.");
  const seekingAlphaOverview = connectorOverviewStatus("Seeking Alpha", seekingAlphaStatus, "Use authorized CSV/XLSX exports or a future licensed API.");
  const fidelityImported = /csv|import|local-file/i.test(String(fidelityStatus.mode || ""));
  const plaidReadiness = readiness.connectors?.plaid || {};
  const plaidLinked = Boolean(plaidReadiness.linked);
  const plaidConfigured = Boolean(plaidReadiness.configured);
  const plaidCachedSync = Boolean(fidelityStatus.provider === "plaid" && fidelityStatus.connected && !plaidLinked);
  const accountScopeLine = accountScope?.combined?.accountCount
    ? ` · ${accountScope.combined.accountCount} account${accountScope.combined.accountCount === 1 ? "" : "s"} loaded${accountScope.selectedAccount && accountScope.selectedAccount !== "all" ? ` · viewing ${accountScope.selectedAccountLabel || "selected account"}` : ""}`
    : "";
  const portfolioDiagnostics = portfolioImportDiagnosticsLine(report);
  const rows = [
    {
      label: "Manual/imported holdings",
      status: importAvailability.status,
      detail: portfolioStatus?.realPortfolio
        ? `${portfolioStatus.holdingCount || report?.holdingsImported || 0} holding${(portfolioStatus.holdingCount || report?.holdingsImported || 0) === 1 ? "" : "s"} active${accountScopeLine}${portfolioDiagnostics}${portfolioStatus.loadedAt ? ` · loaded ${shortDateTime(portfolioStatus.loadedAt)}` : ""}${report?.fileName ? ` · ${report.fileName}` : ""}`
        : portfolioStatus?.samplePortfolio
        ? `${portfolioStatus.holdingCount || 0} sample holding${(portfolioStatus.holdingCount || 0) === 1 ? "" : "s"} active for workflow testing${accountScopeLine}. Import a CSV before relying on portfolio totals.`
        : "Import Fidelity CSV to load Tucker's real account-level holdings.",
      configured: importAvailability.configured,
      configuredPending: importAvailability.configuredPending,
      demoReady: importAvailability.demoReady,
      availabilityLabel: importAvailability.label,
      guidance: importAvailability.guidance,
      className: importAvailability.className,
      providerBacked: false,
      sourceType: "Local portfolio state",
      lastSuccessfulAt: report?.importedAt || portfolioStatus?.loadedAt || fidelityStatus?.lastSync,
      fallbackReason: portfolioStatus?.samplePortfolio
        ? "Sample portfolio is active until a CSV/JSON import or provider sync is applied."
        : !portfolioStatus?.realPortfolio ? "No active imported portfolio is loaded yet." : ""
    },
    {
      label: "Market data",
      status: marketDataStatus.label || marketDataConfig.label || (configuredProviders ? `${configuredProviders} provider key${configuredProviders === 1 ? "" : "s"} detected` : dataModeLabel(DATA_MODES.NOT_CONFIGURED)),
      detail: marketDataStatus.detail || marketDataConfig.detail || (readiness.liveProviderCalls ? "Live provider calls run through the local proxy." : "Sample data remains active until a server-side provider is configured."),
      configured: marketAvailability.configured,
      configuredPending: marketAvailability.configuredPending,
      demoReady: marketAvailability.demoReady,
      availabilityLabel: marketAvailability.label,
      guidance: marketAvailability.guidance,
      metadata: marketDataMeta,
      diagnostics: marketDataDiagnosticsHtml(marketDataStatus, marketDataConfig),
      providerBacked: Boolean(marketDataStatus.liveProviderCalls || marketDataConfig.liveProviderCalls),
      sourceType: "Provider-backed quotes",
      lastSuccessfulAt: marketDataStatus.lastSuccessfulRefresh || marketDataStatus.fetchedAt || marketDataStatus.asOf,
      fallbackReason: marketAvailability.demoReady
        ? "Sample quote context is active until Finnhub or another provider is configured."
        : marketAvailability.configuredPending ? marketAvailability.guidance : ""
    },
    {
      label: "Reddit / social mentions",
      status: redditSource.limitedOrError
        ? "Reddit API needs review"
        : redditSource.stale
        ? `${redditMentions.length} stale Reddit API mention${redditMentions.length === 1 ? "" : "s"} cached`
        : redditSource.cached
        ? `${redditMentions.length} cached Reddit API mention${redditMentions.length === 1 ? "" : "s"} loaded`
        : redditSource.live
        ? `${redditReport?.mentionsImported || redditMentions.length} Reddit API mention${(redditReport?.mentionsImported || redditMentions.length) === 1 ? "" : "s"} synced`
        : redditReport?.mentionsImported
          ? `${redditReport.mentionsImported} local mention${redditReport.mentionsImported === 1 ? "" : "s"} imported`
          : redditConfig.label || (redditMentions.length ? "Sample/local mentions loaded" : "Reddit API not configured"),
      detail: redditReport?.fileName && !redditSource.live
        ? `${redditReport.fileName}: ${redditReport.rowsParsed || 0} rows parsed, ${(redditReport.rejectedRows || []).length} rejected.`
        : redditConfig.detail || redditSource.detail || "Use compliant Reddit API/OAuth later. Sample/local JSON is active today; no scraping.",
      configured: [DATA_MODES.LIVE, DATA_MODES.CACHED, DATA_MODES.IMPORTED].includes(redditSource.mode),
      configuredPending: Boolean(redditSource.limitedOrError || redditSource.stale || (!redditSource.providerBacked && (redditConfig.status === "configured-not-connected" || redditConfig.status === "configured"))),
      demoReady: redditSource.mode === DATA_MODES.SAMPLE,
      availabilityLabel: redditAvailabilityLabel,
      guidance: redditSource.limitedOrError ? "Reddit provider needs review. Keep this as low-trust social context until refresh succeeds." : redditSource.stale ? "Using stale Reddit context only; avoid treating it as today's signal." : redditSource.live ? redditSource.footer : redditReport?.mentionsImported ? "Local JSON import is usable as low-trust social context." : "No Reddit API calls are active.",
      className: redditSource.className,
      diagnostics: redditDiagnosticsHtml(redditReport, redditConfig, redditSource, redditLiveStatus, redditMentions.length),
      providerBacked: redditSource.providerBacked,
      sourceType: redditSource.providerBacked ? "Provider-backed social feed" : redditReport?.mentionsImported ? "Local social import" : "Sample social rows",
      lastSuccessfulAt: redditReport?.lastSuccessfulRefresh || redditReport?.fetchedAt || redditReport?.importedAt,
      fallbackReason: redditSource.mode === DATA_MODES.SAMPLE ? "Sample Reddit rows are active; no live API call is connected." : redditSource.stale || redditSource.limitedOrError ? redditSource.detail : ""
    },
    {
      label: "X / Twitter",
      status: xSource.limitedOrError
        ? "X API needs review"
        : xSource.stale
        ? `${xUpdates.length} stale X update${xUpdates.length === 1 ? "" : "s"} cached`
        : xSource.cached
        ? `${xUpdates.length} cached X update${xUpdates.length === 1 ? "" : "s"} loaded`
        : xSource.live
        ? `${xReport?.updatesImported || xUpdates.length} X API update${(xReport?.updatesImported || xUpdates.length) === 1 ? "" : "s"} synced`
        : xReport?.updatesImported
          ? `${xReport.updatesImported} X/social update${xReport.updatesImported === 1 ? "" : "s"} loaded`
          : xConfig.label || (xUpdates.length ? "Sample/local X rows loaded" : "X API not configured"),
      detail: xConfig.detail || xSource.detail || "Use compliant X API recent search later. Sample/local rows are active today; no scraping.",
      configured: Boolean(xSource.live || xSource.cached || xReport?.updatesImported),
      configuredPending: Boolean(xSource.limitedOrError || xSource.stale || (!xSource.providerBacked && (xConfig.status === "configured-not-connected" || xConfig.status === "configured"))),
      demoReady: !xReport?.updatesImported && xUpdates.length > 0,
      availabilityLabel: xAvailabilityLabel,
      guidance: xSource.limitedOrError ? "X provider needs review. Keep this as low-trust social context until refresh succeeds." : xSource.stale ? "Using stale X context only; avoid treating it as today's signal." : xSource.live ? xSource.footer : xReport?.updatesImported ? "Loaded X/social rows are usable as low-trust social context." : "No X API calls are active.",
      className: xSource.className,
      diagnostics: xSocialDiagnosticsHtml(xReport, xConfig, xSource, xLiveStatus, xUpdates.length),
      providerBacked: xSource.providerBacked,
      sourceType: xSource.providerBacked ? "Provider-backed social feed" : xReport?.updatesImported ? "Local social import" : "Sample social rows",
      lastSuccessfulAt: xReport?.lastSuccessfulRefresh || xReport?.fetchedAt || xReport?.importedAt,
      fallbackReason: xSource.className === "missing" ? "Sample X/social rows are active; no live API call is connected." : xSource.stale || xSource.limitedOrError ? xSource.detail : ""
    },
    {
      label: "Federal disclosures",
      status: politicianStale
        ? `Stale public cache: ${politicianReport.tradesImported || politicianTrades.length} row${(politicianReport.tradesImported || politicianTrades.length) === 1 ? "" : "s"}`
        : politicianError
        ? "Public provider error"
        : politicianProviderSynced
        ? `${politicianReport.tradesImported} public row${politicianReport.tradesImported === 1 ? "" : "s"} ${politicianSource.mode === DATA_MODES.CACHED ? "cached" : "synced"}`
        : politicianReport?.tradesImported
        ? `${politicianReport.tradesImported} local disclosure row${politicianReport.tradesImported === 1 ? "" : "s"} imported`
        : politicianConfig.configured ? "Public provider configured" : politicianTrades.length ? "Sample/local disclosure rows loaded" : "Not configured",
      detail: politicianReport?.fileName
        ? `${politicianReport.fileName}: ${politicianReport.rowsParsed || 0} rows parsed, ${(politicianReport.rejectedRows || []).length} rejected.`
        : politicianConfig.detail || politicianSource.detail || "Local CSV/JSON import is available. Public static dataset sync is config-gated; no scraping.",
      configured: [DATA_MODES.LIVE, DATA_MODES.CACHED, DATA_MODES.IMPORTED].includes(politicianSource.mode),
      configuredPending: politicianStale || politicianError || politicianConfig.configuredPending,
      demoReady: politicianSource.mode === DATA_MODES.SAMPLE,
      availabilityLabel: dataModeLabel(politicianSource.mode),
      guidance: politicianSource.guidance || politicianConfig.sourceRecommendation || "Federal disclosure provider: Not configured.",
      className: politicianSource.className,
      diagnostics: federalDisclosureDiagnosticsHtml(politicianReport, politicianConfig, politicianTrades, politicianProviderSynced, politicianStale, politicianError),
      providerBacked: politicianSource.providerBacked,
      sourceType: politicianSource.providerBacked ? "Provider-backed disclosure feed" : politicianReport?.tradesImported ? "Local disclosure import" : "Sample disclosure rows",
      lastSuccessfulAt: politicianReport?.lastSuccessfulRefresh || politicianReport?.fetchedAt || politicianReport?.importedAt,
      fallbackReason: politicianSource.mode === DATA_MODES.SAMPLE ? "Sample federal disclosure rows are active; public sync is not configured." : politicianStale || politicianError ? politicianSource.detail : ""
    },
    {
      label: "Seeking Alpha",
      status: seekingAlphaOverview.value,
      detail: seekingAlphaOverview.detail,
      configured: Boolean(seekingAlphaStatus.connected),
      demoReady: /demo/i.test(String(seekingAlphaStatus.mode || "")),
      availabilityLabel: seekingAlphaStatus.connected ? dataModeLabel(DATA_MODES.IMPORTED) : /demo/i.test(String(seekingAlphaStatus.mode || "")) ? dataModeLabel(DATA_MODES.SAMPLE) : dataModeLabel(DATA_MODES.NOT_CONFIGURED),
      guidance: seekingAlphaStatus.connected ? "Authorized export/import data is available locally." : "Use authorized exports or a licensed API later; no scraping or password collection.",
      className: seekingAlphaStatus.connected && /csv|xlsx|import/i.test(String(seekingAlphaStatus.mode || "")) ? "imported-local" : undefined,
      providerBacked: false,
      sourceType: "Manual premium-rating import",
      lastSuccessfulAt: seekingAlphaStatus.lastSync || seekingAlphaStatus.importedAt,
      fallbackReason: seekingAlphaStatus.connected ? "" : "No authorized Seeking Alpha import is loaded."
    },
    {
      label: "Fidelity",
      status: plaidLinked
        ? "Fidelity linked through Plaid"
        : plaidCachedSync
        ? "Plaid-synced holdings cached locally"
        : plaidConfigured
        ? "Plaid ready to connect"
        : fidelityOverview.value,
      detail: plaidLinked
        ? `Plaid item linked${plaidReadiness.lastSync ? ` · last sync ${shortDateTime(plaidReadiness.lastSync)}` : ""}.`
        : plaidCachedSync
        ? "A previous Plaid sync is present in browser state, but the local backend has not confirmed an active Plaid item. Sync again before treating it as live."
        : plaidConfigured
        ? "Plaid credentials detected. Use Imports to open Plaid Link, then sync investment holdings."
        : fidelityOverview.detail,
      configured: Boolean(fidelityStatus.connected || fidelityImported || plaidLinked),
      configuredPending: Boolean(plaidConfigured && !plaidLinked && !fidelityImported),
      demoReady: /demo/i.test(String(fidelityStatus.mode || "")),
      availabilityLabel: fidelityImported ? dataModeLabel(DATA_MODES.IMPORTED) : plaidLinked ? dataModeLabel(DATA_MODES.LIVE) : plaidCachedSync ? dataModeLabel(DATA_MODES.CACHED) : /demo/i.test(String(fidelityStatus.mode || "")) ? dataModeLabel(DATA_MODES.SAMPLE) : dataModeLabel(DATA_MODES.NOT_CONFIGURED),
      guidance: fidelityImported ? "CSV import is active; no direct Fidelity credentials are stored." : plaidLinked ? "Plaid investment holdings are available through the local backend. Access tokens never enter browser code." : plaidCachedSync ? "Reconnect or sync Plaid before relying on brokerage-linked freshness." : plaidConfigured ? "Open Plaid Link from Imports to authorize Fidelity. The dashboard does not collect Fidelity usernames or passwords." : "Use CSV import, or add Plaid credentials to .env for tokenized account linking.",
      className: fidelityImported ? "imported-local" : plaidLinked ? "configured" : plaidCachedSync ? "configured-pending" : undefined,
      providerBacked: Boolean(plaidLinked || plaidCachedSync),
      sourceType: fidelityImported ? "Local brokerage import" : "Tokenized brokerage connector",
      lastSuccessfulAt: fidelityStatus.lastSync || report?.importedAt || plaidReadiness.lastSync,
      fallbackReason: fidelityImported ? "" : plaidConfigured && !plaidLinked ? "Plaid keys are present, but no linked Fidelity item is active yet." : "Use CSV import or tokenized Plaid linking before treating holdings as connected."
    },
    {
      label: "OpenAI explanations",
      status: readiness.aiProviders?.openai?.configured ? "OpenAI key detected" : "Not configured",
      detail: readiness.aiProviders?.openai?.detail || "Optional AI-assisted explanations are off. Local deterministic summaries remain available.",
      configured: Boolean(readiness.aiProviders?.openai?.liveProviderCalls),
      configuredPending: Boolean(readiness.aiProviders?.openai?.configured && !readiness.aiProviders?.openai?.liveProviderCalls),
      demoReady: !readiness.aiProviders?.openai?.configured,
      availabilityLabel: readiness.aiProviders?.openai?.liveProviderCalls ? dataModeLabel(DATA_MODES.LIVE) : dataModeLabel(DATA_MODES.NOT_CONFIGURED),
      guidance: readiness.aiProviders?.openai?.configured
        ? "API calls stay server-side through the local backend. Explanations must remain grounded in dashboard data."
        : "Add OPENAI_API_KEY to local .env only if Tucker wants AI-assisted explanations. Never commit the key.",
      className: readiness.aiProviders?.openai?.liveProviderCalls ? "configured" : readiness.aiProviders?.openai?.configured ? "configured-pending" : "missing",
      providerBacked: Boolean(readiness.aiProviders?.openai?.liveProviderCalls),
      sourceType: "AI explanation provider",
      lastSuccessfulAt: readiness.aiProviders?.openai?.lastSuccessfulRefresh || readiness.aiProviders?.openai?.lastSync,
      fallbackReason: readiness.aiProviders?.openai?.liveProviderCalls ? "" : "Deterministic local explanation fallback is used when OpenAI is not enabled."
    }
  ];
  const summary = buildDataSourceHealthSummary(rows);
  target.innerHTML = `
    <div class="source-health-summary" aria-label="Data source health summary">
      <div><b>${escapeHtml(summary.usableCount)}</b><span>usable now</span></div>
      <div><b>${escapeHtml(summary.reviewCount)}</b><span>needs review</span></div>
      <div><b>${escapeHtml(summary.providerBackedCount)}</b><span>provider-backed</span></div>
      <div><b>${escapeHtml(summary.localOnlyCount)}</b><span>local/sample</span></div>
      <p>Provider-backed sources are separated from local imports, sample rows, and deterministic calculations so source labels stay honest.</p>
    </div>
    ${rows.map((row) => `
    <div class="provider-status-card ${escapeHtml(row.className || (row.configured ? "configured" : row.configuredPending ? "configured-pending" : "missing"))}">
      <div>
        <b>${escapeHtml(row.label)}</b>
        <span>${escapeHtml(row.detail)}</span>
      </div>
      <div>
        <strong>${escapeHtml(row.status)}</strong>
        <span class="status-badge ${escapeHtml(dataModeBadgeClass(dataSourceAvailabilityMode(row)))}">${escapeHtml(dataSourceAvailabilityLabel(row))}</span>
      </div>
      <p class="source-meta">${escapeHtml(dataSourceHealthMetadata(row))}</p>
      ${row.metadata ? `<p class="source-meta">${escapeHtml(row.metadata)}</p>` : ""}
      <p>${escapeHtml(row.guidance || dataSourceAvailabilityGuidance(row))}</p>
      ${row.diagnostics || ""}
    </div>
  `).join("")}`;
}

export function portfolioImportDiagnosticsLine(report = {}) {
  if (!report || typeof report !== "object" || (!report.realPortfolioImport && !report.rowsParsed)) return "";
  const skipped = (report.rejectedRows || []).filter((row) => row.classification === "non-holding row").length;
  const reviewRows = countHoldingRowsNeedingReview(report);
  const duplicateRows = Array.isArray(report.duplicateRows) ? report.duplicateRows.length : 0;
  const parts = [];
  if (report.rowsParsed) parts.push(`${formatNumber(report.rowsParsed)} rows parsed`);
  if (report.holdingsImported) parts.push(`${formatNumber(report.holdingsImported)} accepted`);
  if (skipped) parts.push(`${formatNumber(skipped)} skipped non-holding`);
  if (reviewRows) parts.push(`${formatNumber(reviewRows)} need review`);
  if (duplicateRows) parts.push(`${formatNumber(duplicateRows)} duplicate merged`);
  return parts.length ? ` · ${parts.join(" · ")}` : "";
}

function renderPoliticianTrades(records = [], report = null) {
  const target = byId("politicianTradesPanel");
  if (!target) return;
  if (!records.length) {
    target.innerHTML = `
      <div class="empty">
        <strong>No federal disclosure rows loaded.</strong>
        <span>Sample rows appear here until a compliant federal disclosure provider or local import is configured.</span>
      </div>
    `;
    return;
  }
  const source = politicianTradeSourceMeta(records, report);
  const importSummary = report ? `
    <div class="provider-status-note">
      <b>${report.tradesImported ? source.label : "Federal disclosure import needs review"}</b>
      <span>${escapeHtml(report.fileName || "Local file")} · ${report.rowsParsed || 0} rows parsed · ${report.tradesImported || 0} usable · ${(report.rejectedRows || []).length} rejected · tickers ${(report.tickersDetected || []).join(", ") || "none"}</span>
    </div>
    ${report.rejectedRows?.length ? `
      <details class="signal-details">
        <summary>Rejected row details</summary>
        ${(report.rejectedRows || []).slice(0, 8).map((row) => `<p><b>Row ${escapeHtml(row.rowNumber)}:</b> ${escapeHtml(row.reason)}</p>`).join("")}
      </details>
    ` : ""}
  ` : "";
  target.innerHTML = importSummary + renderPoliticianTradeCards(records, "data-sources") + '<p class="section-note">Disclosure rows are informational. They do not imply intent, causation, or a buy/sell recommendation.</p>';
}

function renderMarketPoliticianTrades(records = [], report = null) {
  const target = byId("marketPoliticianTradesPanel");
  if (!target) return;
  const source = politicianTradeSourceMeta(records, report);
  setStatusBadge(
    "marketPoliticianTradesSourceBadge",
    source.label,
    source.mode === DATA_MODES.SAMPLE ? "demo" : source.stale || source.limitedOrError ? "warning" : ""
  );
  if (!records.length) {
    target.innerHTML = `
      <div class="empty">
        <strong>No politician trade disclosure rows loaded.</strong>
        <span>Import a local CSV/JSON file on Data Sources, or use mock rows while the provider architecture is tested.</span>
      </div>
    `;
    return;
  }
  target.innerHTML = `
    <div class="provider-status-note">
      <b>${escapeHtml(source.label)}</b>
      <span>${report?.fileName ? `${escapeHtml(report.fileName)} · ` : ""}${records.length} disclosure row${records.length === 1 ? "" : "s"} mapped into ticker signals. ${escapeHtml(source.detail)}</span>
    </div>
    ${renderPoliticianTradeCards(records, "market-intelligence")}
  `;
}

function renderPoliticianTradeCards(records = [], context = "data-sources") {
  const sorted = [...records].sort((a, b) => String(b.disclosureDate || b.disclosedAt || "").localeCompare(String(a.disclosureDate || a.disclosedAt || "")));
  return sorted.slice(0, context === "market-intelligence" ? 4 : 6).map((trade) => {
    const sourceLabel = politicianTradeSourceLabel(trade);
    const configured = trade.sourceMode === "local-file" || trade.sourceMode === "public-static-dataset" || trade.source === "local-politician-trade-import";
    return `
    <div class="provider-status-card ${configured ? "configured" : "missing"}">
      <div>
        <b>${renderTickerLink(trade.ticker)} · ${escapeHtml(titleCase(trade.transactionType || "unknown"))}</b>
        <span>${escapeHtml(trade.assetName || "Unknown asset")} · ${escapeHtml(formatTradeRange(trade))}</span>
      </div>
      <div>
        <strong>${escapeHtml(trade.politicianName || "Unknown politician")}</strong>
        <span>${escapeHtml([trade.chamber, trade.party, trade.state, sourceLabel].filter(Boolean).join(" · "))}</span>
      </div>
      <p>
        Owner ${escapeHtml(trade.owner || "Unknown")} · traded ${escapeHtml(trade.transactionDate || trade.tradedAt || "unknown")} · disclosed ${escapeHtml(trade.disclosureDate || trade.disclosedAt || "unknown")} · recency ${formatScore(trade.recencyScore)} · size ${formatScore(trade.sizeScore)}.
        <a href="${escapeHtml(safeExternalHref(trade.sourceUrl || "#"))}" target="_blank" rel="noopener noreferrer">Source</a>
      </p>
    </div>
  `;
  }).join("");
}

function politicianTradeSourceLabel(trade = {}) {
  const freshness = String(trade.dataFreshness || trade.cacheStatus || "").toLowerCase();
  if (trade.sourceMode === "public-static-dataset" && /stale/.test(freshness)) return "Stale public disclosure row";
  if (trade.sourceMode === "public-static-dataset" && /cached|cache/.test(freshness)) return "Cached public disclosure row";
  if (trade.sourceMode === "public-static-dataset") return "Public disclosure dataset";
  if (trade.liveProviderCalls) return "Backend provider row";
  if (trade.sourceMode === "local-file" || trade.source === "local-politician-trade-import") return "Imported local file";
  return "Sample row";
}

function setOptions(id, values, allLabel) {
  const target = byId(id);
  if (!target) return;
  const previous = target.value;
  target.innerHTML = values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value === "all" ? allLabel : value)}</option>`).join("");
  target.value = values.includes(previous) ? previous : "all";
}

function list(items = [], options = {}) {
  return `<ul>${items.slice(0, 5).map((item) => `<li>${options.html ? item : escapeHtml(item)}</li>`).join("")}</ul>`;
}

function cssToken(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function briefBlock(title, items = [], options = {}) {
  return `
    <div class="brief-block">
      <b>${escapeHtml(title)}</b>
      ${items.length ? list(items.slice(0, 3), options) : '<span>None from current sample data.</span>'}
    </div>
  `;
}

function renderTickerOrLabel(ticker) {
  return ticker ? renderTickerLink(ticker) : "Portfolio";
}

function qualityMetric(label, value) {
  return `<div><b>${escapeHtml(label)}</b><span>${escapeHtml(value)}</span></div>`;
}

function summaryMetric(label, value) {
  return `<div><b>${escapeHtml(label)}</b><span>${escapeHtml(value)}</span></div>`;
}

function formatTradeRange(trade = {}) {
  const low = trade.amountRangeLow ?? trade.amountRange?.min ?? 0;
  const high = trade.amountRangeHigh ?? trade.amountRange?.max ?? low;
  return `${formatCurrency(low)}-${formatCurrency(high)}`;
}

function renderSettingsConfiguration(thresholds = {}) {
  const target = byId("settingsConfigurationPanel");
  if (!target) return;
  const position = Number(thresholds.maxPositionWeight ?? 0.12);
  const sector = Number(thresholds.maxSectorWeight ?? 0.32);
  const leverage = Number(thresholds.maxLeveragedWeight ?? 0.14);
  const targetDrift = Number(thresholds.minActionDrift ?? 0.015);
  const tickerScore = Number(thresholds.tickerSignalScore ?? 70);
  const redditAcceleration = Number(thresholds.redditMentionAcceleration ?? 0.6);
  const settings = [
    {
      title: "Data refresh",
      detail: "Manual refresh. Live market data uses server-side keys when configured; sample mode remains available without credentials.",
      value: "Local proxy"
    },
    {
      title: "Risk thresholds",
      detail: `Review above ${formatPct(position)} position weight, ${formatPct(sector)} sector/theme weight, ${formatPct(leverage)} leveraged ETF exposure, or ${formatPct(targetDrift)} target drift.`,
      value: "Configurable"
    },
    {
      title: "Watchlist preferences",
      detail: "Tracked demo tickers: MU, NVDA, AMD, SOXL, UPRO, VGT, CRDO.",
      value: "Local watchlist"
    },
    {
      title: "Signal thresholds",
      detail: `Ticker signal alerts start at ${Math.round(tickerScore)}/100; Reddit acceleration alerts start near ${formatPct(redditAcceleration)}.`,
      value: "In-app only"
    }
  ];
  target.innerHTML = settings.map((item) => `
    <div class="note">
      <b>${escapeHtml(item.title)}</b>
      <p>${escapeHtml(item.detail)}</p>
      <span class="status-badge safe">${escapeHtml(item.value)}</span>
    </div>
  `).join("");
}

function targetMetric(label, value) {
  return `<div class="target-metric"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`;
}

function largestDriftLabel(rows = []) {
  const row = rows
    .filter((item) => item.scope === "ticker")
    .sort((a, b) => Math.abs(b.driftValue) - Math.abs(a.driftValue))[0];
  return row ? `${row.key} ${formatSignedPct(row.driftWeight)}` : "None";
}

function toPercentInput(value) {
  return Number(((Number(value) || 0) * 100).toFixed(2));
}

function targetNoteValue(value = "") {
  return value === "No saved target yet." ? "" : value;
}

function scopeLabel(scope = "") {
  return ({
    ticker: "Ticker",
    assetClass: "Asset class",
    strategySleeve: "Strategy sleeve",
    account: "Account"
  })[scope] || scope;
}

function modeLabel(mode = "") {
  return ({
    "new-contribution": "New contributions only",
    "sell-and-rebalance": "Sell and rebalance model",
    "taxable-safe": "Taxable caution",
    "retirement-only": "Retirement/HSA only",
    full: "Full portfolio view"
  })[mode] || mode;
}

function targetStatusClass(status = "") {
  if (status === "overweight") return "negative";
  if (status === "underweight") return "positive";
  if (status === "within range") return "neutral";
  return "low";
}

function thesisReviewNote(rows = [], ticker = "") {
  const row = rows.find((item) => item.ticker === ticker);
  if (!row || ["Current", "Supported"].includes(row.thesisStatus)) return "";
  return ` Thesis check: ${row.reviewAction} (${row.thesisStatus}).`;
}

function thesisStatusClass(status = "") {
  if (status === "Thesis-breaking signal" || status === "Contradicted") return "critical";
  if (status === "Missing" || status === "Needs review") return "needs-review";
  if (status === "Stale") return "stale";
  if (status === "Supported") return "supported";
  return "current";
}

function friendlyQualityLabel(quality = {}, uiState = "SAMPLE_MODE") {
  if (uiState === "IMPORTED_WITH_SKIPPED_ROWS") return "Imported with skipped non-holding rows";
  if (uiState === "IMPORTED_CLEAN") return "Clean import";
  if (uiState === "IMPORTED_PARTIAL_REVIEW") return "Imported with row review";
  if (uiState === "STALE_PERSISTED_REPAIRED") return "Persisted local portfolio";
  if (uiState === "IMPORT_FAILED") return "Needs review";
  return quality.importHealth || quality.status || "No real CSV";
}

function portfolioStatusLabel(uiState = "SAMPLE_MODE") {
  if (uiState === "IMPORTED_CLEAN") return "real portfolio loaded";
  if (uiState === "IMPORTED_WITH_SKIPPED_ROWS") return "real portfolio loaded with skipped rows";
  if (uiState === "IMPORTED_PARTIAL_REVIEW") return "real portfolio loaded with row review";
  if (uiState === "STALE_PERSISTED_REPAIRED") return "local portfolio restored";
  if (uiState === "IMPORT_FAILED") return "needs review";
  if (uiState === "NO_DATA") return "no portfolio loaded";
  return "sample mode";
}

function portfolioNeedsImportReview(uiState = "") {
  return uiState === "IMPORTED_PARTIAL_REVIEW" || uiState === "IMPORT_FAILED" || uiState === "STALE_PERSISTED_REPAIRED";
}

function isImportedState(uiState = "") {
  return isRealPortfolioUiState(uiState);
}

function tickerOwnershipLabel(model = {}) {
  if (model.owned) return "Owned";
  if (model.samplePosition) return "Sample position";
  if (model.watchlistOnly) return "Watchlist / not owned";
  if (model.externallyDiscovered) return "Signal / not owned";
  return "Not owned";
}

function isSavedWatchlistIdea(idea = null) {
  if (!idea) return false;
  if (idea.saved === true) return true;
  if (idea.derived === true || idea.saved === false) return false;
  return true;
}

function riskRank(value = "") {
  if (/very high/i.test(value)) return 4;
  if (/high/i.test(value)) return 3;
  if (/medium/i.test(value)) return 2;
  if (/low/i.test(value)) return 1;
  return 0;
}

function titleCase(value = "") {
  return value.replace(/\b\w/g, (match) => match.toUpperCase());
}

function summaryText(value = "", maxLength = 160) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
}

function formatGrowth(value) {
  const numeric = Number(value) || 0;
  if (numeric === 1) return "new spike";
  if (numeric > 0) return `+${number.format(numeric * 100)}% growth`;
  if (numeric < 0) return `${number.format(numeric * 100)}% growth`;
  return "flat";
}

function formatDateTime(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
}

function uniqueInInputOrder(values) {
  return [...new Set(values.filter(Boolean))];
}

function riskClass(value) {
  if (/very high|high/i.test(value)) return "bad";
  if (/medium/i.test(value)) return "warn";
  return "good";
}

function healthToneClass(value = "") {
  if (/safe|strong/i.test(value)) return "safe";
  if (/monitor|usable/i.test(value)) return "monitor";
  if (/warn|needs/i.test(value)) return "medium";
  return "sample";
}

function byId(id) {
  return document.getElementById(id);
}

function setStatusBadge(id, label, className = "") {
  const target = byId(id);
  if (!target) return;
  target.textContent = label;
  target.className = `status-badge ${className}`.trim();
}

function divide(a, b) {
  return b ? a / b : 0;
}

function formatCurrency(value) {
  return currency.format(Number(value) || 0);
}

function formatCompact(value) {
  const numeric = Number(value) || 0;
  const abs = Math.abs(numeric);
  const sign = numeric < 0 ? "-" : "";
  const units = [
    { value: 1_000_000_000_000, suffix: "T" },
    { value: 1_000_000_000, suffix: "B" },
    { value: 1_000_000, suffix: "M" },
    { value: 1_000, suffix: "K" }
  ];
  const unit = units.find((item) => abs >= item.value);
  if (!unit) return currency.format(numeric);
  const scaled = abs / unit.value;
  const label = scaled.toFixed(1).replace(/\.0$/, "");
  return `${sign}$${label}${unit.suffix}`;
}

function formatSignedCurrency(value) {
  const numeric = Number(value) || 0;
  return `${numeric >= 0 ? "+" : ""}${currency.format(numeric)}`;
}

function formatNumber(value) {
  return number.format(Number(value) || 0);
}

function formatSignedNumber(value) {
  const numeric = Number(value) || 0;
  return `${numeric >= 0 ? "+" : ""}${number.format(numeric)}`;
}

function formatPct(value) {
  return `${((Number(value) || 0) * 100).toFixed(1)}%`;
}

function formatScore(value) {
  return `${Math.round((Number(value) || 0) * 100)}/100`;
}

function formatScore100(value) {
  const numeric = Math.max(0, Math.min(100, Number(value) || 0));
  return `${Math.round(numeric)}/100`;
}

function connectorOverviewStatus(label, status = {}, fallbackDetail = "") {
  const mode = String(status.mode || "").trim();
  const restored = Boolean(status.restoredFromBackup);
  const demo = /demo/i.test(mode);
  const imported = /csv|xlsx|import/i.test(mode);
  if (restored) {
    return {
      value: dataModeLabel(DATA_MODES.NOT_CONFIGURED),
      detail: status.message || "Status came from a local backup and must be revalidated before treating it as connected."
    };
  }
  if (imported) {
    return {
      value: dataModeLabel(DATA_MODES.IMPORTED),
      detail: mode || status.provider || "Local provider state loaded."
    };
  }
  if (status.connected) {
    return {
      value: dataModeLabel(DATA_MODES.LIVE),
      detail: mode || status.provider || "Local provider state loaded."
    };
  }
  if (demo) {
    return {
      value: dataModeLabel(DATA_MODES.SAMPLE),
      detail: status.message || `${label} sample data is local-only, not a live connection.`
    };
  }
  return {
    value: dataModeLabel(DATA_MODES.NOT_CONFIGURED),
    detail: fallbackDetail || "No live provider connection is active."
  };
}

function dailyMoveSourceLabel(holding = {}) {
  if (!holding.marketDataAppliedToDailyChange) return "imported/local daily move";
  if (holding.marketDataIsMock || holding.marketDataMode === "mock" || holding.marketDataStatus === "mock/sample mode") {
    return "mock daily move";
  }
  if (holding.marketDataStatus === "stale data") return "stale market-data daily move";
  if (holding.marketDataStatus === "error") return "market-data error";
  if (/cached/i.test(String(holding.marketDataStatus || holding.dailyChangeSource || ""))) return "cached provider daily move";
  return "provider daily move";
}

export function providerStatusDisplay(status = {}) {
  if (status.liveProviderCalls) {
    return {
      className: "configured",
      strong: "Configured",
      detail: "Key detected; waiting for a successful data refresh"
    };
  }
  if (status.configured) {
    return {
      className: "configured-pending",
      strong: dataModeLabel(DATA_MODES.NOT_CONFIGURED),
      detail: "Key detected; live calls disabled"
    };
  }
  if (status.status === "mock/sample mode") {
    return {
      className: "missing",
      strong: dataModeLabel(DATA_MODES.SAMPLE),
      detail: dataModeLabel(DATA_MODES.NOT_CONFIGURED)
    };
  }
  if (status.disabled) {
    return {
      className: "missing",
      strong: dataModeLabel(DATA_MODES.NOT_CONFIGURED),
      detail: dataModeLabel(DATA_MODES.NOT_CONFIGURED)
    };
  }
  return {
    className: "missing",
    strong: dataModeLabel(DATA_MODES.NOT_CONFIGURED),
    detail: dataModeLabel(DATA_MODES.NOT_CONFIGURED)
  };
}

export function portfolioImportSourceStatus(report = {}, portfolioStatus = null) {
  if (portfolioStatus?.uiState === "STALE_PERSISTED_REPAIRED") {
    return {
      status: "Persisted local portfolio loaded",
      configured: false,
      configuredPending: true,
      demoReady: false,
      className: "configured-pending",
      label: dataModeLabel(DATA_MODES.IMPORTED),
      guidance: "Holdings were restored and normalized from local storage, but the original import report is missing. Re-import the source file when possible."
    };
  }
  if (portfolioStatus?.uiState === "NO_DATA") {
    return {
      status: "No portfolio loaded",
      configured: false,
      configuredPending: false,
      demoReady: false,
      className: "missing",
      label: dataModeLabel(DATA_MODES.NO_DATA),
      guidance: "Import a portfolio or load sample data to populate portfolio screens."
    };
  }
  if (!report?.realPortfolioImport) {
    return {
      status: "Sample/local only",
      configured: false,
      configuredPending: false,
      demoReady: true,
      className: "missing",
      label: dataModeLabel(DATA_MODES.SAMPLE),
      guidance: "Sample holdings are display-only until a real CSV is imported."
    };
  }
  const skipped = (report.rejectedRows || []).filter((row) => row.classification === "non-holding row").length;
  const failedHoldingRows = countHoldingRowsNeedingReview(report);
  const failedHealth = ["Failed", "Needs manual mapping"].includes(report.health?.status);
  if (failedHoldingRows > 0 && (report.holdingsImported || 0) > 0) {
    return {
      status: "Imported with holding-row review",
      configured: false,
      configuredPending: true,
      demoReady: false,
      className: "configured-pending",
      label: dataModeLabel(DATA_MODES.IMPORTED),
      guidance: `${failedHoldingRows} holding row${failedHoldingRows === 1 ? "" : "s"} failed validation. Active screens use the accepted holdings, but review rejected rows before relying on totals.`
    };
  }
  if (failedHealth || failedHoldingRows > 0) {
    return {
      status: failedHoldingRows > 0 ? "Imported with holding-row review" : "Import needs review",
      configured: false,
      configuredPending: true,
      demoReady: false,
      className: "configured-pending",
      label: dataModeLabel(DATA_MODES.ERROR),
      guidance: failedHoldingRows > 0
        ? `${failedHoldingRows} holding row${failedHoldingRows === 1 ? "" : "s"} failed validation. Review before relying on totals.`
        : "Import did not complete cleanly. Review mapping and rejected rows before relying on totals."
    };
  }
  if (skipped > 0) {
    return {
      status: `Imported with ${skipped} skipped non-holding row${skipped === 1 ? "" : "s"}`,
      configured: false,
      configuredPending: false,
      demoReady: false,
      className: "imported-local",
      label: dataModeLabel(DATA_MODES.IMPORTED),
      guidance: "Real holdings are loaded from a local portfolio import. Skipped Fidelity footer/disclaimer rows are harmless."
    };
  }
  return {
    status: dataModeLabel(DATA_MODES.IMPORTED),
    configured: false,
    configuredPending: false,
    demoReady: false,
    className: "imported-local",
    label: dataModeLabel(DATA_MODES.IMPORTED),
    guidance: "Real holdings are loaded from a local portfolio import."
  };
}

export function marketDataSourceAvailability(status = {}, config = {}) {
  const statusValue = status?.status || config?.status || "";
  const freshness = status?.dataFreshness || status?.cacheStatus || "";
  const combinedStatus = `${statusValue} ${freshness} ${status?.label || ""} ${status?.detail || ""}`.toLowerCase();
  if (/rate limited|rate-limit|quota/.test(combinedStatus)) {
    return {
      configured: false,
      configuredPending: true,
      demoReady: false,
      label: dataModeLabel(DATA_MODES.RATE_LIMITED),
      guidance: status?.detail || "Provider rate limit reached. Use cached or Sample data until the provider allows another refresh."
    };
  }
  if (/error|failed/.test(combinedStatus)) {
    return {
      configured: false,
      configuredPending: true,
      demoReady: false,
      label: dataModeLabel(DATA_MODES.ERROR),
      guidance: status?.detail || "Review provider status before relying on price-sensitive output."
    };
  }
  if (/stale/.test(combinedStatus)) {
    return {
      configured: false,
      configuredPending: true,
      demoReady: false,
      label: dataModeLabel(DATA_MODES.STALE),
      guidance: status?.detail || "Use stale cached quotes for context only until a provider refresh succeeds."
    };
  }
  if (statusValue === "connected" || statusValue === "cached") {
    const cached = /cached/i.test(String(freshness));
    return {
      configured: true,
      configuredPending: false,
      demoReady: false,
      label: cached ? dataModeLabel(DATA_MODES.CACHED) : dataModeLabel(DATA_MODES.LIVE),
      guidance: cached || statusValue === "cached"
        ? "Fresh cached quotes came through the local backend; check fetched time before price-sensitive reviews."
        : "Quotes came through the local backend; provider credentials remain server-side."
    };
  }
  if (statusValue === "partial data") {
    return {
      configured: true,
      configuredPending: true,
      demoReady: false,
      label: dataModeLabel(DATA_MODES.PARTIAL),
      guidance: status?.detail || "Provider returned usable quotes for part of the request; review missing tickers before price-sensitive decisions."
    };
  }
  if (statusValue === "mock/sample mode") {
    return {
      configured: false,
      configuredPending: false,
      demoReady: true,
      label: dataModeLabel(DATA_MODES.SAMPLE),
      guidance: "Sample quote context only; no live market data was fetched."
    };
  }
  if (statusValue === "configured-not-connected") {
    return {
      configured: false,
      configuredPending: true,
      demoReady: false,
      label: dataModeLabel(DATA_MODES.NOT_CONFIGURED),
      guidance: "A provider key is present, but live quote calls are disabled for the selected provider. Displayed quotes may be mock fallback."
    };
  }
  if (config?.configured) {
    return {
      configured: false,
      configuredPending: true,
      demoReady: false,
      label: dataModeLabel(DATA_MODES.NOT_CONFIGURED),
      guidance: "Credentials stay server-side; live quote data has not been confirmed for this screen."
    };
  }
  return {
    configured: false,
    configuredPending: false,
    demoReady: false,
    label: dataModeLabel(DATA_MODES.NOT_CONFIGURED),
    guidance: "No market data credentials or provider calls are active."
  };
}

export function dataSourceAvailabilityMode(row = {}) {
  if (row.availabilityMode) return normalizeDataMode(row.availabilityMode);
  if (row.availabilityLabel) return normalizeDataMode(row.availabilityLabel);
  if (row.providerBacked && row.configuredPending) return DATA_MODES.STALE;
  if (row.configured) return sourceDataMode({ connected: true, ...row });
  if (row.configuredPending) return DATA_MODES.NOT_CONFIGURED;
  if (row.demoReady) return DATA_MODES.SAMPLE;
  return DATA_MODES.NOT_CONFIGURED;
}

export function dataSourceAvailabilityLabel(row = {}) {
  return dataModeLabel(dataSourceAvailabilityMode(row));
}

export function buildDataSourceHealthSummary(rows = []) {
  const counts = rows.reduce((memo, row) => {
    const mode = dataSourceAvailabilityMode(row);
    memo[mode] = (memo[mode] || 0) + 1;
    return memo;
  }, {});
  const reviewModes = new Set([DATA_MODES.STALE, DATA_MODES.ERROR, DATA_MODES.PARTIAL, DATA_MODES.RATE_LIMITED]);
  const usableModes = new Set([DATA_MODES.LIVE, DATA_MODES.CACHED, DATA_MODES.IMPORTED]);
  const reviewCount = rows.filter((row) => row.configuredPending || reviewModes.has(dataSourceAvailabilityMode(row))).length;
  const usableCount = rows.filter((row) => usableModes.has(dataSourceAvailabilityMode(row))).length;
  const providerBackedCount = rows.filter((row) => row.providerBacked).length;
  return {
    sourceCount: rows.length,
    usableCount,
    reviewCount,
    providerBackedCount,
    localOnlyCount: Math.max(0, rows.length - providerBackedCount),
    counts
  };
}

function dataSourceHealthMetadata(row = {}) {
  const parts = [
    `Type: ${row.sourceType || (row.providerBacked ? "Provider-backed" : "Local/sample")}`,
    `Last success: ${row.lastSuccessfulAt ? shortDateTime(row.lastSuccessfulAt) : "Not yet"}`
  ];
  if (row.fallbackReason) parts.push(`Fallback: ${row.fallbackReason}`);
  return parts.join(" · ");
}

function dataSourceAvailabilityGuidance(row = {}) {
  if (row.configured) return "Usable in the local dashboard.";
  if (row.configuredPending) return "Credentials stay server-side; review provider status before relying on this data.";
  if (row.demoReady) return "Sample rows are labeled and should not be treated as live data.";
  return "Shown for planning only; no credentials or provider calls are active.";
}

export function marketDataBadgeClass(status = {}, quote = {}) {
  if (status?.status === "connected" && (status.dataFreshness === "live" || quote.dataFreshness === "live" || quote.cacheStatus === "live")) return "safe";
  if (status?.status === "connected" && (status.dataFreshness === "cached" || quote.dataFreshness === "cached" || quote.cacheStatus === "cached")) return "";
  if (status?.status === "partial data") return "";
  if (status?.status === "rate limited") return "sample";
  if (status?.status === "stale data" || quote.dataFreshness === "stale" || quote.cacheStatus === "stale") return "sample";
  if (status?.status === "error") return "sample";
  if (status?.status === "mock/sample mode" || quote.isMock || quote.sourceMode === "mock") return "demo";
  return "";
}

function marketDataDisplayLabel(status = {}) {
  return `${dataModeLabel(marketDataMode(status))} market data`;
}

export function marketDataQuoteSourceLabel(status = {}, quote = {}) {
  const mode = marketDataMode(status, quote);
  return `${dataModeLabel(mode)} quote`;
}

function renderMarketDataSourceTag(status = {}, quote = {}, suffix = "quote") {
  const mode = marketDataMode(status, quote);
  return `<span class="data-tag ${dataModeBadgeClass(mode)}">${escapeHtml(dataModeLabel(mode))} ${escapeHtml(suffix)}</span>`;
}

function renderHoldingMarketDataTag(holding = {}, suffix = "quote") {
  if (!holding.marketDataStatus && !holding.marketDataFreshness && !holding.marketDataCacheStatus && !holding.marketDataIsMock) return "";
  return renderMarketDataSourceTag({
    status: holding.marketDataStatus,
    dataFreshness: holding.marketDataFreshness,
    cacheStatus: holding.marketDataCacheStatus
  }, {
    isMock: holding.marketDataIsMock,
    dataFreshness: holding.marketDataFreshness,
    cacheStatus: holding.marketDataCacheStatus
  }, suffix);
}

function formatMarketDataValue(value, formatter) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "Not available";
  return formatter(numeric);
}

function marketDataDisplayDetail(status = {}) {
  if (status.status === "mock/sample mode") {
    return "Quote and price-move context is Sample data. Market data key: Not configured.";
  }
  if (status.status === "stale data") {
    return `Using stale cached market data. ${status.detail || "Refresh the local backend when provider access is available."}`;
  }
  if (status.status === "error") {
    return `Market data refresh error. ${status.detail || "Sample or prior cached data may be shown elsewhere."}`;
  }
  if (status.status === "partial data") {
    return status.detail || "Provider returned some usable quotes, but at least one requested ticker was missing. Treat missing quote rows as Partial data.";
  }
  if (status.status === "rate limited") {
    return status.detail || "Provider rate limit reached. Use cached or Sample data until another refresh is allowed.";
  }
  if (status.status === "configured-not-connected") {
    return status.detail || "A provider key is present, but live quote calls are not enabled for this provider. Any displayed quote context is sample fallback.";
  }
  if (status.dataFreshness === "cached" || status.cacheStatus === "cached") {
    return "Quote and price-move context is fresh cached data from the local backend.";
  }
  if (status.dataFreshness === "live" || status.cacheStatus === "live") {
    return "Quote and price-move context came through the server-side live market data proxy.";
  }
  return status.detail || "Market data provider: Not configured. Sample data keeps screens wired for later APIs.";
}

export function marketDataFreshnessLine(status = {}, quote = {}) {
  const provider = status.providerLabel || quote.providerLabel || quote.providerName;
  const fetchedAt = quote.fetchedAt || status.fetchedAt;
  const asOf = quote.asOf || status.asOf;
  const lastSuccessfulRefresh = quote.lastSuccessfulRefresh || status.lastSuccessfulRefresh;
  const lastError = quote.lastError?.message || status.lastError?.message;
  const parts = [
    provider ? `Provider: ${provider}` : "",
    fetchedAt ? `Fetched: ${formatDateTime(fetchedAt)}` : "",
    asOf ? `As of: ${formatDateTime(asOf)}` : "",
    lastSuccessfulRefresh ? `Last success: ${formatDateTime(lastSuccessfulRefresh)}` : "",
    lastError ? `Last error: ${lastError}` : ""
  ].filter(Boolean);
  return parts.join(" · ");
}

function resourceCoverageLabel(value = "") {
  const text = String(value || "").trim();
  if (!text) return "Not available";
  if (text === "disabled") return "Not requested";
  if (text === "deferred") return "Deferred";
  if (text === "skipped") return "Skipped";
  if (text === "missing") return "Missing";
  return dataModeLabel(marketDataMode({ status: text, dataFreshness: text, cacheStatus: text }));
}

const PROVIDER_COVERAGE_FIELD_ORDER = Object.freeze([
  ["quote", "Quote"],
  ["week52Range", "52-week"],
  ["volume", "Volume"],
  ["averageVolume", "Avg volume"],
  ["marketCap", "Market cap"],
  ["companyProfile", "Profile"],
  ["sectorIndustry", "Sector/industry"],
  ["historicalCandles", "History"]
]);

function coverageFieldsByKey(row = {}) {
  const fields = Array.isArray(row.fieldCoverage) ? row.fieldCoverage : [];
  const map = Object.fromEntries(fields.map((field) => [field.key, field]));
  if (fields.length) return map;
  return {
    quote: legacyCoverageField("quote", "Quote", row.quote),
    week52Range: legacyCoverageField("week52Range", "52-week high/low", row.metric),
    volume: legacyCoverageField("volume", "Volume", row.quote),
    averageVolume: legacyCoverageField("averageVolume", "Average volume", row.metric),
    marketCap: legacyCoverageField("marketCap", "Market cap", row.profile),
    companyProfile: legacyCoverageField("companyProfile", "Company profile", row.profile),
    sectorIndustry: legacyCoverageField("sectorIndustry", "Sector/industry", row.profile),
    historicalCandles: legacyCoverageField("historicalCandles", "Historical candles", row.history)
  };
}

function legacyCoverageField(key, label, status) {
  const normalized = String(status || "unknown").toLowerCase();
  const available = !["missing", "deferred", "skipped", "disabled", "unknown", ""].includes(normalized);
  return { key, label, missingLabel: label.toLowerCase(), available, status: normalized || "unknown", resourceStatus: normalized || "unknown" };
}

function coverageFieldStatusLabel(field = {}) {
  const status = String(field.status || "").toLowerCase();
  if (status === "available") return "Available";
  return resourceCoverageLabel(status || field.resourceStatus || "");
}

function coverageFieldBadgeClass(field = {}) {
  const status = String(field.status || "").toLowerCase();
  if (["live", "available"].includes(status)) return "badge-source-live";
  if (status === "cached") return "badge-source-cached";
  if (status === "mock") return "badge-source-sample";
  if (["stale", "deferred", "skipped"].includes(status)) return "badge-source-stale";
  if (["missing", "disabled", "unknown"].includes(status)) return "badge-source-not-configured";
  return dataModeBadgeClass(marketDataMode({ status, dataFreshness: status, cacheStatus: status }));
}

function coverageGapSummary(row = {}) {
  const stale = Array.isArray(row.staleFields) ? row.staleFields : [];
  const unavailable = Array.isArray(row.unavailableFields) && row.unavailableFields.length
    ? row.unavailableFields
    : Array.isArray(row.missingFields)
      ? row.missingFields
      : [];
  const parts = [];
  if (unavailable.length) parts.push(`Missing: ${unavailable.slice(0, 4).join(", ")}${unavailable.length > 4 ? ` +${unavailable.length - 4} more` : ""}`);
  if (stale.length) parts.push(`Stale: ${stale.slice(0, 4).join(", ")}${stale.length > 4 ? ` +${stale.length - 4} more` : ""}`);
  return parts.join(" · ") || "Complete";
}

function marketDataCoverageTableHtml(rows = []) {
  const visible = rows.slice(0, 16);
  if (!visible.length) {
    return '<p class="section-note">No per-ticker quote diagnostics yet. Refresh market data after loading a portfolio to populate coverage.</p>';
  }
  return `
    <div class="provider-coverage-wrap">
      <table class="provider-coverage-table">
        <thead>
          <tr>
            <th scope="col">Ticker</th>
            <th scope="col">Status</th>
            <th scope="col">Coverage</th>
            <th scope="col">Quote</th>
            <th scope="col">52-week</th>
            <th scope="col">Volume</th>
            <th scope="col">Avg volume</th>
            <th scope="col">Market cap</th>
            <th scope="col">Profile</th>
            <th scope="col">Sector / industry</th>
            <th scope="col">History</th>
            <th scope="col">Missing / stale</th>
            <th scope="col">Last fetch</th>
          </tr>
        </thead>
        <tbody>
          ${visible.map((row) => {
            const mode = marketDataMode({ status: row.status, dataFreshness: row.dataFreshness, cacheStatus: row.cacheStatus });
            const fields = coverageFieldsByKey(row);
            return `
              <tr>
                <th scope="row">${escapeHtml(row.ticker || "Unknown")}</th>
                <td><span class="status-badge ${dataModeBadgeClass(mode)}">${escapeHtml(dataModeLabel(mode))}</span></td>
                <td>${escapeHtml(row.coverageSummary || "Coverage pending")}</td>
                ${PROVIDER_COVERAGE_FIELD_ORDER.map(([key]) => {
                  const field = fields[key] || {};
                  return `<td><span class="data-tag ${coverageFieldBadgeClass(field)}">${escapeHtml(coverageFieldStatusLabel(field))}</span></td>`;
                }).join("")}
                <td>${escapeHtml(coverageGapSummary(row))}</td>
                <td>${row.fetchedAt ? escapeHtml(formatDateTime(row.fetchedAt)) : "Not available"}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
      ${rows.length > visible.length ? `<p class="section-note">Showing ${visible.length} of ${rows.length} requested tickers.</p>` : ""}
    </div>
  `;
}

export function marketDataDiagnosticsHtml(status = {}, config = {}) {
  const requestedTickers = Array.isArray(status.requestedTickers) ? status.requestedTickers : [];
  const visibleRequested = requestedTickers.slice(0, 12).join(", ");
  const missingTickers = Array.isArray(status.missingTickers) ? status.missingTickers : [];
  const truncatedTickers = Array.isArray(status.truncatedTickers) ? status.truncatedTickers : [];
  const warnings = Array.isArray(status.warnings) ? status.warnings : [];
  const cache = status.cache || {};
  const requestBudget = status.requestBudget || cache.requestBudget || config.requestBudget || {};
  const deferredEnrichmentTickers = Array.isArray(cache.deferredEnrichmentTickers) ? cache.deferredEnrichmentTickers : [];
  const lastError = status.lastError?.message || cache.lastError?.message || "";
  const providerAttempts = Array.isArray(status.providerAttempts) ? status.providerAttempts : [];
  const attemptLabel = providerAttempts.length
    ? providerAttempts.map((attempt) => `${attempt.providerLabel || attempt.providerId || "Provider"}: ${attempt.status || "unknown"} (${attempt.quoteCount || 0})`).join(" -> ")
    : "Primary provider only";
  const diagnostics = [
    ["Provider selected", status.providerLabel || config.selectedLabel || "Market data provider"],
    ["Key present", config.configured || status.configured ? "Yes" : "No"],
    ["Provider attempts", attemptLabel],
    ["Last request", status.fetchedAt ? formatDateTime(status.fetchedAt) : "Not requested yet"],
    ["Tickers requested", requestedTickers.length ? `${visibleRequested}${requestedTickers.length > 12 ? ` +${requestedTickers.length - 12} more` : ""}` : "None"],
    ["Successful responses", status.quoteCount ?? cache.quoteCount ?? 0],
    ["Failed/missing responses", missingTickers.length ? missingTickers.slice(0, 12).join(", ") : "None"],
    ["Cache status", `${status.cacheStatus || cache.status || "unknown"} · live ${cache.liveCount || 0} · cached ${cache.hitCount || 0} · stale ${cache.staleCount || 0}`],
    ["Request budget", requestBudget.enrichmentTickerLimit ? `enrich first ${requestBudget.enrichmentTickerLimit} tickers · quote cap ${requestBudget.maxQuoteTickers || "default"}` : "Default local budget"],
    ["Deferred enrichment", deferredEnrichmentTickers.length ? `${deferredEnrichmentTickers.slice(0, 12).join(", ")}${deferredEnrichmentTickers.length > 12 ? ` +${deferredEnrichmentTickers.length - 12} more` : ""}` : "None"],
    ["Truncated request", truncatedTickers.length ? `${truncatedTickers.length} omitted by local safety cap` : "No"],
    ["Last error", lastError || "None"]
  ];

  return `
    <details class="signal-details provider-diagnostics">
      <summary>Market data diagnostics</summary>
      <div class="import-debug-grid">
        ${diagnostics.map(([label, value]) => `<div><b>${escapeHtml(label)}</b><span>${escapeHtml(value)}</span></div>`).join("")}
      </div>
      <p><b>Per-ticker provider coverage</b></p>
      ${marketDataCoverageTableHtml(status.quoteDiagnostics || [])}
      ${warnings.length ? `<p><b>Provider warnings</b></p><ul>${warnings.slice(0, 6).map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>` : ""}
    </details>
  `;
}

function providerDiagnosticsHtml(title, diagnostics = [], warnings = []) {
  return `
    <details class="signal-details provider-diagnostics">
      <summary>${escapeHtml(title)}</summary>
      <div class="import-debug-grid">
        ${diagnostics.map(([label, value]) => `<div><b>${escapeHtml(label)}</b><span>${escapeHtml(value)}</span></div>`).join("")}
      </div>
      ${warnings.length ? `<p><b>Provider warnings</b></p><ul>${warnings.slice(0, 6).map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>` : ""}
    </details>
  `;
}

function yesNo(value) {
  return value ? "Yes" : "No";
}

function redditDiagnosticsHtml(report = null, config = {}, source = {}, liveStatus = {}, rowCount = 0) {
  const rejected = report?.rejectedRows || [];
  const subreddits = report?.subredditsDetected || liveStatus.subreddits || config.subreddits || [];
  const tickers = report?.tickersDetected || liveStatus.tickersDetected || [];
  const warnings = [
    liveStatus.warning,
    report?.warning,
    source.limitedOrError ? source.detail : ""
  ].filter(Boolean);
  return providerDiagnosticsHtml("Reddit diagnostics", [
    ["Provider selected", liveStatus.label || config.label || "Reddit API"],
    ["Key present", yesNo(config.configured || liveStatus.configured)],
    ["Live calls enabled", yesNo(source.live || config.liveProviderCalls || liveStatus.liveProviderCalls)],
    ["Status", liveStatus.status || report?.status || source.label || "Not configured"],
    ["Last request", report?.fetchedAt ? formatDateTime(report.fetchedAt) : liveStatus.fetchedAt ? formatDateTime(liveStatus.fetchedAt) : "Not requested yet"],
    ["Rows loaded", number.format(rowCount)],
    ["Imported file", report?.fileName || "None"],
    ["Rejected rows", number.format(rejected.length)],
    ["Subreddits", subreddits.length ? subreddits.slice(0, 8).map((subreddit) => `r/${subreddit}`).join(", ") : "None"],
    ["Tickers detected", tickers.length ? tickers.slice(0, 12).join(", ") : "None"]
  ], warnings);
}

function federalDisclosureDiagnosticsHtml(report = null, config = {}, records = [], providerSynced = false, stale = false, error = false) {
  const rejected = report?.rejectedRows || [];
  const tickers = report?.tickersDetected || unique(records.map((trade) => trade.ticker).filter(Boolean));
  const warnings = [
    config.warning,
    report?.warning,
    stale ? "Using stale cached disclosure rows; federal disclosures can already be delayed." : "",
    error ? "Public disclosure refresh failed; imported/sample rows may still be displayed." : ""
  ].filter(Boolean);
  return providerDiagnosticsHtml("Federal disclosure diagnostics", [
    ["Provider selected", config.label || "Federal disclosure provider"],
    ["Key present", "No key required"],
    ["Live calls enabled", yesNo(config.liveProviderCalls || report?.liveProviderCalls)],
    ["Source mode", report?.mode || (providerSynced ? "public-static-dataset" : report?.tradesImported ? "local-file" : records.length ? "sample/local" : "Not configured")],
    ["Status", error ? "Error" : stale ? "Stale" : providerSynced ? "Public dataset synced" : report?.tradesImported ? "Imported" : records.length ? "Sample/local" : "Not configured"],
    ["Last request", report?.fetchedAt ? formatDateTime(report.fetchedAt) : report?.importedAt ? formatDateTime(report.importedAt) : "Not requested yet"],
    ["Rows loaded", number.format(report?.tradesImported || records.length || 0)],
    ["Imported file", report?.fileName || "None"],
    ["Rejected rows", number.format(rejected.length)],
    ["Tickers detected", tickers.length ? tickers.slice(0, 12).join(", ") : "None"]
  ], warnings);
}

function xSocialDiagnosticsHtml(report = null, config = {}, source = {}, liveStatus = {}, rowCount = 0) {
  const rejected = report?.rejectedRows || [];
  const tickers = report?.tickersDetected || [];
  const warnings = [
    liveStatus.warning,
    report?.warning,
    source.limitedOrError ? source.detail : ""
  ].filter(Boolean);
  return providerDiagnosticsHtml("X / Twitter diagnostics", [
    ["Provider selected", liveStatus.label || config.label || "X API"],
    ["Key present", yesNo(config.configured || liveStatus.configured)],
    ["Live calls enabled", yesNo(source.live || config.liveProviderCalls || liveStatus.liveProviderCalls)],
    ["Credentials in browser", "No"],
    ["Cookies or sessions stored", "No"],
    ["Status", liveStatus.status || report?.status || source.label || "Not configured"],
    ["Last request", report?.fetchedAt ? formatDateTime(report.fetchedAt) : liveStatus.fetchedAt ? formatDateTime(liveStatus.fetchedAt) : "Not requested yet"],
    ["Rows loaded", number.format(rowCount)],
    ["Rejected rows", number.format(rejected.length)],
    ["Query", config.query || liveStatus.query || "Default cashtag watch"],
    ["Tickers detected", tickers.length ? tickers.slice(0, 12).join(", ") : "None"]
  ], warnings);
}

function marketDataSignalsDisclaimer(status = {}) {
  if (status.dataFreshness === "live" || status.dataFreshness === "cached" || status.status === "connected") {
    return "Market quotes and price moves come through the local backend as live or cached provider data. Confluence scores remain review signals, not personalized financial advice or buy/sell recommendations.";
  }
  if (status.status === "stale data") {
    return "Market quotes are stale cached provider data. Treat price-sensitive signals as needs-review, not as current trading information.";
  }
  return "Sample/local data only. Market quotes, price moves, and confluence scores are not Live market data, not personalized financial advice, and not a recommendation to buy or sell.";
}

function shortDateTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatSignedPct(value) {
  const numeric = Number(value) || 0;
  return `${numeric >= 0 ? "+" : ""}${formatPct(numeric)}`;
}

function normalizeTickerSymbol(value = "") {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "");
}

function finiteOptionalNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
