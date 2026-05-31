import { normalizeHolding, normalizeTicker } from "./portfolioSchema.js";

export const LOCAL_DATA_CONTRACT_VERSION = 1;

const REQUIRED_ARRAYS = Object.freeze([
  "accounts",
  "holdings",
  "watchlist",
  "decisionJournal",
  "eventCalendar",
  "tickerSignals",
  "marketDataQuotes",
  "redditMentions",
  "politicianTrades",
  "alerts",
  "dataSources"
]);

const EVIDENCE_GRADES = new Set(["A", "B", "C", "D", "F"]);
const ALERT_SEVERITIES = new Set(["info", "watch", "warning", "critical", "low", "medium", "high", "positive"]);
const ACTION_CATEGORIES = new Set(["Critical Review", "Review", "Monitor", "Positive Signal", "Log Only", "Ignore"]);
const DATA_SOURCE_STATUSES = new Set(["demo", "imported", "configured", "setup-required", "missing-key", "error", "disabled", "stale", "stale-data"]);
const SIGNAL_SOURCE_TYPES = new Set(["news", "social", "filing", "price", "macro", "earnings", "manual"]);
const WATCHLIST_STATUSES = new Set(["researching", "watching", "candidate", "rejected", "owned"]);
const WATCHLIST_CONVICTIONS = new Set(["High", "Medium-high", "Medium", "Medium-low", "Low", "Unrated"]);
const JOURNAL_DECISION_TYPES = new Set(["buy", "sell", "hold", "trim", "add", "watch", "reject"]);
const THESIS_IMPACTS = new Set(["supports thesis", "weakens thesis", "breaks thesis", "confirms known risk", "introduces new risk", "requires review", "no thesis impact / noise"]);
const SENTIMENTS = new Set(["bullish", "bearish", "mixed", "neutral", "unknown"]);
const TRADE_TYPES = new Set(["purchase", "sale", "exchange", "unknown"]);
const TRADE_SOURCE_TYPES = new Set(["disclosure", "filing", "provider"]);
const TRUST_LEVELS = new Set(["low", "medium", "medium-high", "high", "mixed", "unknown"]);
const CALENDAR_EVENT_TYPES = new Set(["earnings", "ex-dividend", "investor-day", "product-event", "fed-macro", "custom"]);
const CALENDAR_IMPORTANCE = new Set(["low", "medium", "high"]);
const CALENDAR_SOURCE_MODES = new Set(["mock", "imported", "manual", "live", "stale", "error"]);
const QUANT_HISTORY_PORTFOLIO_MODES = new Set(["sample", "imported", "local", "no-data"]);
const QUANT_SECURITY_KINDS = new Set(["operating-company", "fund-or-etf"]);
const SOURCE_HISTORY_TYPES = new Set(["portfolio_import", "provider_sync", "market_data_refresh", "backup_restore", "sample_load", "portfolio_reset"]);
const SOURCE_HISTORY_STATUSES = new Set(["success", "warning", "error", "info"]);

export function parseLocalDataFixtureJson(text = "", fileName = "local-data-fixtures.json") {
  try {
    return {
      fixture: JSON.parse(text),
      parseError: null
    };
  } catch (error) {
    return {
      fixture: null,
      parseError: `${fileName}: invalid JSON - ${safeParseErrorMessage(error)}`
    };
  }
}

function safeParseErrorMessage(error) {
  return String(error?.message || "Invalid JSON.")
    .replace(/[A-Za-z0-9_-]{24,}/g, "[redacted]")
    .replace(/(access_token|refresh_token|token|client_secret|api_key|apikey|password|cookie)=([^&\s"']+)/gi, "$1=[redacted]")
    .slice(0, 180);
}

export function validateLocalDataBundle(bundle = {}) {
  const errors = [];
  const warnings = [];

  if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)) {
    return failure(["local data bundle must be a JSON object"]);
  }

  if (bundle.schemaVersion !== LOCAL_DATA_CONTRACT_VERSION) {
    errors.push(`schemaVersion must be ${LOCAL_DATA_CONTRACT_VERSION}`);
  }
  requireString(bundle.generatedAt, "generatedAt", errors);

  REQUIRED_ARRAYS.forEach((field) => {
    if (!Array.isArray(bundle[field])) errors.push(`${field} must be an array`);
  });

  if (errors.length) return failure(errors, warnings);

  const accountIds = new Set();
  bundle.accounts.forEach((account, index) => {
    requireString(account.id, `accounts[${index}].id`, errors);
    requireString(account.name, `accounts[${index}].name`, errors);
    requireString(account.type, `accounts[${index}].type`, errors);
    requireString(account.provider, `accounts[${index}].provider`, errors);
    if (account.id) accountIds.add(account.id);
    if (account.cashBalance !== undefined) requireNonNegativeNumber(account.cashBalance, `accounts[${index}].cashBalance`, errors);
    if (account.marketValue !== undefined) requireNonNegativeNumber(account.marketValue, `accounts[${index}].marketValue`, errors);
  });

  const holdingTickers = new Set();
  bundle.holdings.forEach((holding, index) => {
    const normalized = normalizeHolding(holding);
    requireString(holding.id, `holdings[${index}].id`, errors);
    requireString(holding.ticker, `holdings[${index}].ticker`, errors);
    requireString(holding.name, `holdings[${index}].name`, errors);
    requireString(holding.account, `holdings[${index}].account`, errors);
    requireString(holding.accountType, `holdings[${index}].accountType`, errors);
    requireString(holding.sector, `holdings[${index}].sector`, errors);
    requireString(holding.assetClass, `holdings[${index}].assetClass`, errors);
    requireString(holding.source, `holdings[${index}].source`, errors);
    requireString(holding.sourceAsOf, `holdings[${index}].sourceAsOf`, errors);
    requireNonNegativeNumber(holding.marketValue, `holdings[${index}].marketValue`, errors);
    requireNonNegativeNumber(holding.shares, `holdings[${index}].shares`, errors);
    requireNonNegativeNumber(holding.price, `holdings[${index}].price`, errors);
    if (holding.costBasis !== undefined) requireNonNegativeNumber(holding.costBasis, `holdings[${index}].costBasis`, errors);
    holdingTickers.add(normalized.ticker);
    if (!accountIds.size) return;
    if (holding.accountId && !accountIds.has(holding.accountId)) {
      warnings.push(`holdings[${index}].accountId does not match a known account id`);
    }
  });

  bundle.watchlist.forEach((item, index) => {
    const ticker = normalizeTicker(item.ticker);
    requireString(item.id, `watchlist[${index}].id`, errors);
    requireString(ticker, `watchlist[${index}].ticker`, errors);
    requireKnown(item.status, WATCHLIST_STATUSES, `watchlist[${index}].status`, errors);
    requireString(item.thesis || item.reason, `watchlist[${index}].thesis`, errors);
    requireString(item.sourceOfIdea || item.source, `watchlist[${index}].sourceOfIdea`, errors);
    requireString(item.dateAdded || item.addedAt, `watchlist[${index}].dateAdded`, errors);
    if (item.conviction !== undefined) requireKnown(item.conviction, WATCHLIST_CONVICTIONS, `watchlist[${index}].conviction`, errors);
  });

  bundle.decisionJournal.forEach((entry, index) => {
    const ticker = normalizeTicker(entry.ticker);
    requireString(entry.id, `decisionJournal[${index}].id`, errors);
    requireString(entry.dateTime, `decisionJournal[${index}].dateTime`, errors);
    requireString(ticker, `decisionJournal[${index}].ticker`, errors);
    requireKnown(entry.decisionType, JOURNAL_DECISION_TYPES, `decisionJournal[${index}].decisionType`, errors);
    requireString(entry.thesisNote, `decisionJournal[${index}].thesisNote`, errors);
    if (entry.conviction !== undefined) requireKnown(entry.conviction, WATCHLIST_CONVICTIONS, `decisionJournal[${index}].conviction`, errors);
    if (entry.executionStatus !== undefined && entry.executionStatus !== "not-executed") {
      errors.push(`decisionJournal[${index}].executionStatus must be not-executed`);
    }
    if (entry.signalSnapshot !== undefined && entry.signalSnapshot !== null) {
      if (typeof entry.signalSnapshot !== "object" || Array.isArray(entry.signalSnapshot)) {
        errors.push(`decisionJournal[${index}].signalSnapshot must be an object`);
      } else {
        if (entry.signalSnapshot.capturedAt !== undefined) requireString(entry.signalSnapshot.capturedAt, `decisionJournal[${index}].signalSnapshot.capturedAt`, errors);
        if (entry.signalSnapshot.combinedScore !== undefined) requireNonNegativeNumber(entry.signalSnapshot.combinedScore, `decisionJournal[${index}].signalSnapshot.combinedScore`, errors);
      }
    }
    if (ticker && !holdingTickers.has(ticker)) warnings.push(`decisionJournal[${index}] references ticker ${ticker} not present in holdings`);
  });

  bundle.eventCalendar.forEach((event, index) => {
    const ticker = normalizeTicker(event.ticker);
    requireString(event.id, `eventCalendar[${index}].id`, errors);
    requireKnown(event.eventType, CALENDAR_EVENT_TYPES, `eventCalendar[${index}].eventType`, errors);
    requireString(event.date, `eventCalendar[${index}].date`, errors);
    requireString(event.title, `eventCalendar[${index}].title`, errors);
    requireKnown(event.importance, CALENDAR_IMPORTANCE, `eventCalendar[${index}].importance`, errors);
    requireKnown(event.sourceMode, CALENDAR_SOURCE_MODES, `eventCalendar[${index}].sourceMode`, errors);
    requireString(event.sourceLabel, `eventCalendar[${index}].sourceLabel`, errors);
    requireString(event.detectedAt, `eventCalendar[${index}].detectedAt`, errors);
    requireArray(event.tickers, `eventCalendar[${index}].tickers`, errors);
    if (!["fed-macro", "custom"].includes(event.eventType) && !(ticker || event.tickers?.length)) {
      errors.push(`eventCalendar[${index}] must include ticker or tickers unless eventType is fed-macro/custom`);
    }
    (event.tickers || []).forEach((symbol) => {
      const normalized = normalizeTicker(symbol);
      if (normalized && !holdingTickers.has(normalized)) warnings.push(`eventCalendar[${index}] references ticker ${normalized} not present in holdings`);
    });
  });

  bundle.tickerSignals.forEach((signal, index) => {
    const ticker = normalizeTicker(signal.ticker);
    requireString(signal.id, `tickerSignals[${index}].id`, errors);
    requireString(ticker, `tickerSignals[${index}].ticker`, errors);
    requireString(signal.headline, `tickerSignals[${index}].headline`, errors);
    requireString(signal.summary, `tickerSignals[${index}].summary`, errors);
    requireKnown(signal.sourceType, SIGNAL_SOURCE_TYPES, `tickerSignals[${index}].sourceType`, errors);
    requireArray(signal.sourceIds, `tickerSignals[${index}].sourceIds`, errors);
    requireArray(signal.affectedTickers, `tickerSignals[${index}].affectedTickers`, errors);
    requireString(signal.eventType, `tickerSignals[${index}].eventType`, errors);
    requireKnown(signal.thesisImpact, THESIS_IMPACTS, `tickerSignals[${index}].thesisImpact`, errors);
    requireKnown(signal.evidenceGrade, EVIDENCE_GRADES, `tickerSignals[${index}].evidenceGrade`, errors);
    requireKnown(signal.actionCategory, ACTION_CATEGORIES, `tickerSignals[${index}].actionCategory`, errors);
    requireScore(signal.materialityScore, `tickerSignals[${index}].materialityScore`, errors);
    requireScore(signal.confidenceScore, `tickerSignals[${index}].confidenceScore`, errors);
    requireScore(signal.priorityScore, `tickerSignals[${index}].priorityScore`, errors);
    requireString(signal.detectedAt, `tickerSignals[${index}].detectedAt`, errors);
    if (ticker && !holdingTickers.has(ticker)) warnings.push(`tickerSignals[${index}] references ticker ${ticker} not present in holdings`);
  });

  if (bundle.quantScoreHistory !== undefined) {
    if (!Array.isArray(bundle.quantScoreHistory)) {
      errors.push("quantScoreHistory must be an array when present");
    } else {
      bundle.quantScoreHistory.forEach((entry, index) => {
        const ticker = normalizeTicker(entry.ticker);
        requireString(ticker, `quantScoreHistory[${index}].ticker`, errors);
        requireString(entry.date, `quantScoreHistory[${index}].date`, errors);
        requireString(entry.timestamp, `quantScoreHistory[${index}].timestamp`, errors);
        requireString(entry.modelVersion, `quantScoreHistory[${index}].modelVersion`, errors);
        requireKnown(entry.securityKind, QUANT_SECURITY_KINDS, `quantScoreHistory[${index}].securityKind`, errors);
        requireKnown(entry.portfolioMode, QUANT_HISTORY_PORTFOLIO_MODES, `quantScoreHistory[${index}].portfolioMode`, errors);
        requireScore100(entry.score, `quantScoreHistory[${index}].score`, errors);
        if (entry.rawScore !== undefined && entry.rawScore !== null) requireScore100(entry.rawScore, `quantScoreHistory[${index}].rawScore`, errors);
        if (entry.confidenceScore !== undefined && entry.confidenceScore !== null) requireScore100(entry.confidenceScore, `quantScoreHistory[${index}].confidenceScore`, errors);
        if (entry.dataCoverageScore !== undefined && entry.dataCoverageScore !== null) requireScore100(entry.dataCoverageScore, `quantScoreHistory[${index}].dataCoverageScore`, errors);
        if (entry.peerRank !== undefined && entry.peerRank !== null) requireNonNegativeNumber(entry.peerRank, `quantScoreHistory[${index}].peerRank`, errors);
        if (entry.peerCount !== undefined && entry.peerCount !== null) requireNonNegativeNumber(entry.peerCount, `quantScoreHistory[${index}].peerCount`, errors);
        if (ticker && !holdingTickers.has(ticker)) warnings.push(`quantScoreHistory[${index}] references ticker ${ticker} not present in holdings`);
      });
    }
  }

  bundle.marketDataQuotes.forEach((quote, index) => {
    const ticker = normalizeTicker(quote.ticker);
    requireString(quote.id, `marketDataQuotes[${index}].id`, errors);
    requireString(ticker, `marketDataQuotes[${index}].ticker`, errors);
    requireString(quote.name, `marketDataQuotes[${index}].name`, errors);
    requireNonNegativeNumber(quote.price, `marketDataQuotes[${index}].price`, errors);
    requireNonNegativeNumber(quote.previousClose, `marketDataQuotes[${index}].previousClose`, errors);
    requireNumber(quote.dailyChange, `marketDataQuotes[${index}].dailyChange`, errors);
    requireNumber(quote.dailyChangePercent, `marketDataQuotes[${index}].dailyChangePercent`, errors);
    if (quote.dayOpen !== undefined) requireNonNegativeNumber(quote.dayOpen, `marketDataQuotes[${index}].dayOpen`, errors);
    if (quote.dayHigh !== undefined) requireNonNegativeNumber(quote.dayHigh, `marketDataQuotes[${index}].dayHigh`, errors);
    if (quote.dayLow !== undefined) requireNonNegativeNumber(quote.dayLow, `marketDataQuotes[${index}].dayLow`, errors);
    if (quote.marketCap !== undefined) requireNonNegativeNumber(quote.marketCap, `marketDataQuotes[${index}].marketCap`, errors);
    if (quote.volume !== undefined) requireNonNegativeNumber(quote.volume, `marketDataQuotes[${index}].volume`, errors);
    if (quote.averageVolume !== undefined) requireNonNegativeNumber(quote.averageVolume, `marketDataQuotes[${index}].averageVolume`, errors);
    if (quote.fiftyTwoWeekHigh !== undefined) requireNonNegativeNumber(quote.fiftyTwoWeekHigh, `marketDataQuotes[${index}].fiftyTwoWeekHigh`, errors);
    if (quote.fiftyTwoWeekLow !== undefined) requireNonNegativeNumber(quote.fiftyTwoWeekLow, `marketDataQuotes[${index}].fiftyTwoWeekLow`, errors);
    requireString(quote.providerId, `marketDataQuotes[${index}].providerId`, errors);
    requireString(quote.providerLabel, `marketDataQuotes[${index}].providerLabel`, errors);
    requireString(quote.source, `marketDataQuotes[${index}].source`, errors);
    requireString(quote.sourceMode, `marketDataQuotes[${index}].sourceMode`, errors);
    requireBoolean(quote.isMock, `marketDataQuotes[${index}].isMock`, errors);
    requireBoolean(quote.liveProviderCalls, `marketDataQuotes[${index}].liveProviderCalls`, errors);
    requireString(quote.asOf, `marketDataQuotes[${index}].asOf`, errors);
    if (quote.historicalPrices !== undefined) {
      requireArray(quote.historicalPrices, `marketDataQuotes[${index}].historicalPrices`, errors);
    }
    if (ticker && !holdingTickers.has(ticker)) warnings.push(`marketDataQuotes[${index}] references ticker ${ticker} not present in holdings`);
  });

  bundle.redditMentions.forEach((mention, index) => {
    const ticker = normalizeTicker(mention.ticker);
    requireString(mention.id, `redditMentions[${index}].id`, errors);
    requireString(mention.sourceId, `redditMentions[${index}].sourceId`, errors);
    requireString(ticker, `redditMentions[${index}].ticker`, errors);
    requireString(mention.subreddit, `redditMentions[${index}].subreddit`, errors);
    requireString(mention.createdAt, `redditMentions[${index}].createdAt`, errors);
    requireString(mention.sourceUrl, `redditMentions[${index}].sourceUrl`, errors);
    requireString(mention.text, `redditMentions[${index}].text`, errors);
    requireArray(mention.extractedTickers, `redditMentions[${index}].extractedTickers`, errors);
    requireKnown(mention.sentiment, SENTIMENTS, `redditMentions[${index}].sentiment`, errors);
    requireScore(mention.credibilityScore, `redditMentions[${index}].credibilityScore`, errors);
    requireNonNegativeNumber(mention.score, `redditMentions[${index}].score`, errors);
    requireNonNegativeNumber(mention.upvotes, `redditMentions[${index}].upvotes`, errors);
    requireNonNegativeNumber(mention.commentCount, `redditMentions[${index}].commentCount`, errors);
    requireNonNegativeNumber(mention.engagementScore, `redditMentions[${index}].engagementScore`, errors);
    requireBoolean(mention.isRumor, `redditMentions[${index}].isRumor`, errors);
    requireBoolean(mention.citesPrimarySource, `redditMentions[${index}].citesPrimarySource`, errors);
    requireString(mention.detectedAt, `redditMentions[${index}].detectedAt`, errors);
    if (mention.providerId !== undefined) requireString(mention.providerId, `redditMentions[${index}].providerId`, errors);
    if (mention.sourceMode !== undefined) requireString(mention.sourceMode, `redditMentions[${index}].sourceMode`, errors);
    if (mention.liveProviderCalls !== undefined) requireBoolean(mention.liveProviderCalls, `redditMentions[${index}].liveProviderCalls`, errors);
  });

  bundle.politicianTrades.forEach((trade, index) => {
    const ticker = normalizeTicker(trade.ticker);
    requireString(trade.id, `politicianTrades[${index}].id`, errors);
    requireString(ticker, `politicianTrades[${index}].ticker`, errors);
    requireString(trade.politicianName, `politicianTrades[${index}].politicianName`, errors);
    requireString(trade.chamber, `politicianTrades[${index}].chamber`, errors);
    requireString(trade.party, `politicianTrades[${index}].party`, errors);
    requireString(trade.state, `politicianTrades[${index}].state`, errors);
    requireString(trade.assetName, `politicianTrades[${index}].assetName`, errors);
    requireString(trade.office, `politicianTrades[${index}].office`, errors);
    requireKnown(trade.transactionType, TRADE_TYPES, `politicianTrades[${index}].transactionType`, errors);
    requireString(trade.transactionDate, `politicianTrades[${index}].transactionDate`, errors);
    requireString(trade.disclosedAt, `politicianTrades[${index}].disclosedAt`, errors);
    requireString(trade.disclosureDate, `politicianTrades[${index}].disclosureDate`, errors);
    requireString(trade.sourceUrl, `politicianTrades[${index}].sourceUrl`, errors);
    requireKnown(trade.sourceType, TRADE_SOURCE_TYPES, `politicianTrades[${index}].sourceType`, errors);
    requireScore(trade.confidenceScore, `politicianTrades[${index}].confidenceScore`, errors);
    requireScore(trade.recencyScore, `politicianTrades[${index}].recencyScore`, errors);
    requireScore(trade.sizeScore, `politicianTrades[${index}].sizeScore`, errors);
    requireScore(trade.committeeRelevanceScore, `politicianTrades[${index}].committeeRelevanceScore`, errors);
    requireScore(trade.clusterScore, `politicianTrades[${index}].clusterScore`, errors);
    requireString(trade.owner, `politicianTrades[${index}].owner`, errors);
    requireNonNegativeNumber(trade.amountRangeLow, `politicianTrades[${index}].amountRangeLow`, errors);
    requireNonNegativeNumber(trade.amountRangeHigh, `politicianTrades[${index}].amountRangeHigh`, errors);
    if (!trade.amountRange || typeof trade.amountRange !== "object") {
      errors.push(`politicianTrades[${index}].amountRange must be an object`);
    } else {
      requireNonNegativeNumber(trade.amountRange.min, `politicianTrades[${index}].amountRange.min`, errors);
      requireNonNegativeNumber(trade.amountRange.max, `politicianTrades[${index}].amountRange.max`, errors);
      if (Number(trade.amountRange.min) > Number(trade.amountRange.max)) {
        errors.push(`politicianTrades[${index}].amountRange min cannot exceed max`);
      }
    }
  });

  bundle.alerts.forEach((alert, index) => {
    requireString(alert.id, `alerts[${index}].id`, errors);
    requireString(alert.type, `alerts[${index}].type`, errors);
    requireKnown(alert.severity, ALERT_SEVERITIES, `alerts[${index}].severity`, errors);
    requireString(alert.title, `alerts[${index}].title`, errors);
    requireString(alert.detail, `alerts[${index}].detail`, errors);
    requireNonNegativeNumber(alert.score, `alerts[${index}].score`, errors);
    if (alert.actionCategory) requireKnown(alert.actionCategory, ACTION_CATEGORIES, `alerts[${index}].actionCategory`, errors);
    requireString(alert.status, `alerts[${index}].status`, errors);
    if (alert.status && !["active", "reviewed", "hidden"].includes(alert.status)) {
      errors.push(`alerts[${index}].status must be active, reviewed, or hidden`);
    }
  });

  bundle.dataSources.forEach((source, index) => {
    requireString(source.id, `dataSources[${index}].id`, errors);
    requireString(source.name, `dataSources[${index}].name`, errors);
    requireString(source.type, `dataSources[${index}].type`, errors);
    requireKnown(source.status, DATA_SOURCE_STATUSES, `dataSources[${index}].status`, errors);
    requireKnown(source.trustLevel, TRUST_LEVELS, `dataSources[${index}].trustLevel`, errors);
    requireBoolean(source.liveEnabled, `dataSources[${index}].liveEnabled`, errors);
    requireArray(source.sourceTypes, `dataSources[${index}].sourceTypes`, errors);
    requireArray(source.warnings, `dataSources[${index}].warnings`, errors);
  });

  if (bundle.sourceHistory !== undefined) {
    if (!Array.isArray(bundle.sourceHistory)) {
      errors.push("sourceHistory must be an array when present");
    } else {
      bundle.sourceHistory.forEach((event, index) => {
        requireString(event.id, `sourceHistory[${index}].id`, errors);
        requireKnown(event.type, SOURCE_HISTORY_TYPES, `sourceHistory[${index}].type`, errors);
        requireString(event.label, `sourceHistory[${index}].label`, errors);
        requireString(event.sourceType, `sourceHistory[${index}].sourceType`, errors);
        requireString(event.timestamp, `sourceHistory[${index}].timestamp`, errors);
        requireKnown(event.status, SOURCE_HISTORY_STATUSES, `sourceHistory[${index}].status`, errors);
        ["rowsParsed", "acceptedRows", "reviewRows", "skippedRows", "holdingsCount", "accountsCount", "tickersCount", "totalMarketValue"].forEach((field) => {
          if (event[field] !== undefined) requireNonNegativeNumber(event[field], `sourceHistory[${index}].${field}`, errors);
        });
        if (event.activePortfolioSource !== undefined) requireBoolean(event.activePortfolioSource, `sourceHistory[${index}].activePortfolioSource`, errors);
        if (JSON.stringify(event).match(/\d{5,}|sk-[A-Za-z0-9_-]{16,}|access_token|refresh_token|client_secret|api_key|cookie/i)) {
          warnings.push(`sourceHistory[${index}] may contain raw account or secret-like metadata; source history should store redacted labels and counts only`);
        }
      });
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    counts: {
      ...Object.fromEntries(REQUIRED_ARRAYS.map((field) => [field, bundle[field]?.length || 0])),
      sourceHistory: Array.isArray(bundle.sourceHistory) ? bundle.sourceHistory.length : 0
    }
  };
}

function failure(errors, warnings = []) {
  return { ok: false, errors, warnings, counts: {} };
}

function requireString(value, label, errors) {
  if (!String(value || "").trim()) errors.push(`${label} is required`);
}

function requireArray(value, label, errors) {
  if (!Array.isArray(value)) errors.push(`${label} must be an array`);
}

function requireBoolean(value, label, errors) {
  if (typeof value !== "boolean") errors.push(`${label} must be boolean`);
}

function requireKnown(value, allowed, label, errors) {
  if (!allowed.has(value)) errors.push(`${label} must be one of ${[...allowed].join(", ")}`);
}

function requireScore(value, label, errors) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1) errors.push(`${label} must be a number from 0 to 1`);
}

function requireScore100(value, label, errors) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) errors.push(`${label} must be a number from 0 to 100`);
}

function requireNumber(value, label, errors) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) errors.push(`${label} must be a number`);
}

function requireNonNegativeNumber(value, label, errors) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) errors.push(`${label} must be a non-negative number`);
}
