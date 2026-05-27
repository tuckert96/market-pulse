import { DATA_MODES, dataModeLabel, marketDataMode, normalizeDataMode, sourceDataMode } from "./dataModes.js";
import { normalizeTicker } from "./portfolioSchema.js";
import { summarizeRedditMentions } from "./redditSignals.js";
import { summarizeXUpdates } from "./xUpdatesProvider.js";

export const BROAD_MARKET_DRIVER_TICKERS = Object.freeze(["SPY", "QQQ", "DIA", "IWM"]);
export const AI_TECH_DRIVER_TICKERS = Object.freeze([
  "QQQ",
  "VGT",
  "SMH",
  "SOXX",
  "NVDA",
  "AMD",
  "MU",
  "AVGO",
  "TSM",
  "ASML",
  "AAPL",
  "MSFT",
  "CRDO",
  "SOXL"
]);
export const MARKET_DRIVER_DEFAULT_TICKERS = Object.freeze([
  ...new Set([...BROAD_MARKET_DRIVER_TICKERS, ...AI_TECH_DRIVER_TICKERS])
]);

const SCOPE_LABELS = Object.freeze({
  broadMarket: "Broader Market",
  aiTech: "AI / Tech"
});

const DRIVER_TAGS = Object.freeze({
  broadMarket: new Set(["SPY", "QQQ", "DIA", "IWM", "UPRO", "VOO", "VTI"]),
  aiTech: new Set(AI_TECH_DRIVER_TICKERS)
});

export function buildMarketDriverReport({
  analysis = {},
  holdings = [],
  marketDataSnapshot = {},
  marketEvents = [],
  tickerSignals = [],
  xUpdates = [],
  redditMentions = [],
  politicianTrades = [],
  providerReadiness = {},
  uiState = "SAMPLE_MODE",
  asOf = new Date().toISOString()
} = {}) {
  const activeHoldings = holdings.length ? holdings : analysis.holdings || [];
  const quotesByTicker = normalizeQuoteMap(marketDataSnapshot);
  const sourceSummary = buildSourceSummary({
    marketDataSnapshot,
    xUpdates,
    redditMentions,
    politicianTrades,
    providerReadiness,
    marketEvents
  });
  const broadMarket = buildDriverScope({
    id: "broad-market",
    key: "broadMarket",
    proxyTickers: BROAD_MARKET_DRIVER_TICKERS,
    themeTickers: [...DRIVER_TAGS.broadMarket],
    quotesByTicker,
    holdings: activeHoldings,
    marketEvents,
    tickerSignals,
    xUpdates,
    redditMentions,
    politicianTrades,
    sourceSummary,
    uiState,
    asOf
  });
  const aiTech = buildDriverScope({
    id: "ai-tech",
    key: "aiTech",
    proxyTickers: AI_TECH_DRIVER_TICKERS,
    themeTickers: [...DRIVER_TAGS.aiTech],
    quotesByTicker,
    holdings: activeHoldings,
    marketEvents,
    tickerSignals,
    xUpdates,
    redditMentions,
    politicianTrades,
    sourceSummary,
    uiState,
    asOf
  });
  const topDrivers = [...broadMarket.drivers.slice(0, 2), ...aiTech.drivers.slice(0, 2)]
    .sort((left, right) => right.score - left.score)
    .slice(0, 4);

  return {
    asOf,
    uiState,
    sourceStatus: sourceSummary.overallLabel,
    sourceMode: sourceSummary.overallMode,
    headline: buildReportHeadline(broadMarket, aiTech),
    broadMarket,
    aiTech,
    topDrivers,
    sourceSummary,
    missingData: unique([
      ...broadMarket.missingData,
      ...aiTech.missingData
    ])
  };
}

function buildDriverScope({
  id,
  key,
  proxyTickers,
  themeTickers,
  quotesByTicker,
  holdings,
  marketEvents,
  tickerSignals,
  xUpdates,
  redditMentions,
  politicianTrades,
  sourceSummary,
  uiState,
  asOf
}) {
  const quotes = proxyTickers.map((ticker) => quotesByTicker[normalizeTicker(ticker)]).filter(Boolean);
  const marketMove = aggregateQuoteMove(quotes);
  const themeSet = new Set(themeTickers.map(normalizeTicker));
  const relevantHoldings = holdings.filter((holding) => isHoldingRelevantToScope(holding, themeSet, key));
  const exposureValue = relevantHoldings.reduce((total, holding) => total + (Number(holding.marketValue) || 0), 0);
  const exposureWeight = relevantHoldings.reduce((total, holding) => total + (Number(holding.portfolioWeight) || 0), 0);
  const social = socialEvidenceForScope({ xUpdates, redditMentions, themeSet, asOf });
  const eventEvidence = eventEvidenceForScope(marketEvents, themeSet, key);
  const disclosureEvidence = disclosureEvidenceForScope(politicianTrades, themeSet);
  const signalEvidence = signalEvidenceForScope(tickerSignals, themeSet);
  const drivers = [
    priceActionDriver({ key, marketMove, quotes, sourceSummary }),
    leadershipDriver({ key, marketMove, quotes, themeSet, quotesByTicker }),
    socialAttentionDriver({ key, social }),
    newsReadThroughDriver({ key, eventEvidence }),
    disclosureContextDriver({ key, disclosureEvidence }),
    portfolioExposureDriver({ key, exposureValue, exposureWeight, relevantHoldings, signalEvidence })
  ].filter(Boolean).sort((left, right) => right.score - left.score);
  const missingData = missingDataForScope({ key, quotes, sourceSummary, marketEvents, xUpdates, redditMentions });
  const confidenceScore = confidenceForScope({ marketMove, drivers, missingData, sourceSummary });
  const direction = marketMove.direction;

  return {
    id,
    key,
    label: SCOPE_LABELS[key] || id,
    direction,
    directionLabel: directionLabel(direction),
    movePercent: marketMove.averagePercent,
    moveLabel: marketMove.label,
    headline: scopeHeadline(key, direction, marketMove),
    summary: scopeSummary(key, direction, marketMove, drivers, missingData),
    confidenceScore,
    confidenceLabel: confidenceLabel(confidenceScore),
    sourceStatus: sourceSummary.overallLabel,
    sourceMode: sourceSummary.overallMode,
    proxyTickers: quotes.map((quote) => quote.ticker),
    affectedTickers: unique([...themeTickers, ...relevantHoldings.map((holding) => holding.ticker)]).slice(0, 12),
    portfolioExposure: {
      value: exposureValue,
      weight: exposureWeight,
      holdingCount: relevantHoldings.length,
      topHoldings: relevantHoldings
        .sort((left, right) => (Number(right.marketValue) || 0) - (Number(left.marketValue) || 0))
        .slice(0, 6)
        .map((holding) => normalizeTicker(holding.ticker))
        .filter(Boolean)
    },
    drivers,
    missingData,
    actionItems: actionItemsForScope({ key, direction, exposureWeight, drivers, missingData, uiState })
  };
}

function aggregateQuoteMove(quotes = []) {
  const usable = quotes.filter((quote) => Number.isFinite(Number(quote.dailyChangePercent)));
  if (!usable.length) {
    return {
      direction: "unknown",
      averagePercent: null,
      positiveCount: 0,
      negativeCount: 0,
      label: "Market proxy data unavailable",
      tickers: []
    };
  }
  const averagePercent = usable.reduce((total, quote) => total + Number(quote.dailyChangePercent || 0), 0) / usable.length;
  const positiveCount = usable.filter((quote) => Number(quote.dailyChangePercent) > 0.001).length;
  const negativeCount = usable.filter((quote) => Number(quote.dailyChangePercent) < -0.001).length;
  return {
    direction: directionFromMove(averagePercent, positiveCount, negativeCount, usable.length),
    averagePercent,
    positiveCount,
    negativeCount,
    label: `${formatSignedPercent(averagePercent)} average move across ${usable.map((quote) => quote.ticker).join(", ")}`,
    tickers: usable.map((quote) => quote.ticker)
  };
}

function priceActionDriver({ key, marketMove, quotes, sourceSummary }) {
  if (!quotes.length || marketMove.averagePercent === null) {
    return driver({
      id: `${key}:missing-price-action`,
      category: "Price action",
      title: "Market proxy prices are not loaded",
      direction: "unknown",
      score: 34,
      evidenceStrength: "Low",
      whatChanged: "The app does not have enough broad proxy quote data to explain today's move.",
      evidence: ["Market data source is missing, stale, or not configured."],
      portfolioRelevance: "Without proxy prices, treat social or news chatter as context only.",
      nextStep: "Check Data Sources and refresh market data.",
      href: "#data-sources",
      sourceModes: [sourceSummary.marketDataLabel]
    });
  }
  const leading = [...quotes]
    .sort((left, right) => Math.abs(Number(right.dailyChangePercent) || 0) - Math.abs(Number(left.dailyChangePercent) || 0))
    .slice(0, 3)
    .map((quote) => `${quote.ticker} ${formatSignedPercent(quote.dailyChangePercent)}`);
  return driver({
    id: `${key}:price-action`,
    category: "Price action",
    title: `${SCOPE_LABELS[key]} is ${marketMove.directionLabel || directionLabel(marketMove.direction).toLowerCase()}`,
    direction: marketMove.direction,
    score: 88 + Math.min(10, Math.abs(marketMove.averagePercent || 0) * 400),
    evidenceStrength: sourceSummary.marketDataMode === DATA_MODES.LIVE ? "High" : sourceSummary.marketDataMode === DATA_MODES.CACHED ? "Medium" : "Low",
    whatChanged: `${marketMove.label}.`,
    evidence: leading,
    portfolioRelevance: key === "aiTech"
      ? "This is the first check for whether AI/tech exposure is moving with the group or idiosyncratically."
      : "This separates broad index movement from portfolio-specific movement.",
    nextStep: key === "aiTech" ? "Open Risk / Concentration for AI and semiconductor exposure." : "Open Daily Brief or Risk to compare portfolio impact.",
    href: key === "aiTech" ? "#risk" : "#daily",
    tickers: quotes.map((quote) => quote.ticker),
    sourceModes: [sourceSummary.marketDataLabel]
  });
}

function leadershipDriver({ key, marketMove, quotes, themeSet, quotesByTicker }) {
  if (key !== "aiTech") {
    const qqq = quotesByTicker.QQQ;
    const spy = quotesByTicker.SPY;
    if (!qqq || !spy || !Number.isFinite(Number(qqq.dailyChangePercent)) || !Number.isFinite(Number(spy.dailyChangePercent))) return null;
    const spread = Number(qqq.dailyChangePercent) - Number(spy.dailyChangePercent);
    if (Math.abs(spread) < 0.003) return null;
    return driver({
      id: "broadMarket:tech-leadership",
      category: "Leadership",
      title: spread > 0 ? "Tech is leading the broad tape" : "Tech is lagging the broad tape",
      direction: spread > 0 ? "up" : "down",
      score: 72 + Math.min(14, Math.abs(spread) * 500),
      evidenceStrength: "Medium",
      whatChanged: `QQQ is ${formatSignedPercent(spread)} versus SPY on a relative basis.`,
      evidence: [`QQQ ${formatSignedPercent(qqq.dailyChangePercent)}`, `SPY ${formatSignedPercent(spy.dailyChangePercent)}`],
      portfolioRelevance: "Tech leadership can make the portfolio look stronger or weaker than the broad index if AI/tech exposure is large.",
      nextStep: "Open Market Drivers AI / Tech section or Risk / Concentration.",
      href: "#market-drivers",
      tickers: ["QQQ", "SPY"],
      sourceModes: ["Market data"]
    });
  }
  if (!quotes.length || marketMove.averagePercent === null) return null;
  const strongest = quotes
    .filter((quote) => themeSet.has(quote.ticker) && Number.isFinite(Number(quote.dailyChangePercent)))
    .sort((left, right) => Number(right.dailyChangePercent || 0) - Number(left.dailyChangePercent || 0))
    .slice(0, 4);
  if (!strongest.length) return null;
  const avg = strongest.reduce((total, quote) => total + Number(quote.dailyChangePercent || 0), 0) / strongest.length;
  if (Math.abs(avg) < 0.004) return null;
  return driver({
    id: "aiTech:leadership",
    category: "Leadership",
    title: avg >= 0 ? "AI/tech leadership is positive" : "AI/tech leadership is under pressure",
    direction: avg >= 0 ? "up" : "down",
    score: 78 + Math.min(14, Math.abs(avg) * 450),
    evidenceStrength: "Medium",
    whatChanged: `${strongest.map((quote) => `${quote.ticker} ${formatSignedPercent(quote.dailyChangePercent)}`).join(", ")} are driving the AI/tech basket read.`,
    evidence: strongest.map((quote) => `${quote.name || quote.ticker}: ${formatSignedPercent(quote.dailyChangePercent)}`),
    portfolioRelevance: "Compare this with your owned AI, semiconductor, and leveraged ETF exposure before changing risk.",
    nextStep: "Open Risk / Concentration for AI, semiconductor, and leverage exposure.",
    href: "#risk",
    tickers: strongest.map((quote) => quote.ticker),
    sourceModes: ["Market data"]
  });
}

function socialAttentionDriver({ key, social }) {
  if (!social.rows.length) return null;
  const top = social.rows.slice(0, 4);
  const totalMentions = top.reduce((total, row) => total + (Number(row.sevenDayMentions) || 0), 0);
  if (!totalMentions) return null;
  const tickers = top.map((row) => row.ticker);
  return driver({
    id: `${key}:social-attention`,
    category: "Social attention",
    title: `${key === "aiTech" ? "AI/tech" : "Market"} social attention is active`,
    direction: "mixed",
    score: Math.min(78, 44 + totalMentions * 5 + social.engagement / 180),
    evidenceStrength: social.live ? "Medium" : "Low",
    whatChanged: `${top.map((row) => `${row.ticker}: ${row.sevenDayMentions || 0} mentions / 7d`).join("; ")}.`,
    evidence: top.map((row) => `${row.ticker}: ${row.sourceLabel || "social"} · ${row.sentiment || "unknown"} sentiment placeholder`),
    portfolioRelevance: "Social attention can help decide what to inspect, but it is lower-trust and should not be treated as proof.",
    nextStep: "Open Market Intelligence and confirm with prices, filings, or company sources.",
    href: "#market-intelligence",
    tickers,
    sourceModes: unique(top.map((row) => row.sourceLabel || "Social"))
  });
}

function newsReadThroughDriver({ key, eventEvidence }) {
  if (!eventEvidence.length) return null;
  const top = eventEvidence.slice(0, 3);
  return driver({
    id: `${key}:news-readthrough`,
    category: "News / events",
    title: key === "aiTech" ? "AI/tech read-throughs are on the tape" : "Market read-throughs are on the tape",
    direction: directionFromSentiment(top),
    score: 64 + Math.min(18, top.length * 5),
    evidenceStrength: top.some((event) => event.liveProviderCalls) ? "Medium" : "Low",
    whatChanged: top.map((event) => event.headline || event.title).join("; "),
    evidence: top.map((event) => `${event.sourceName || event.source || "Market event"}: ${event.headline || event.title}`),
    portfolioRelevance: "These events are read-throughs. Use them to decide which holdings or theses deserve review.",
    nextStep: "Open Market Intelligence for affected exposure chips and details.",
    href: "#market-intelligence",
    tickers: unique(top.flatMap(eventTickers)),
    sourceModes: unique(top.map((event) => event.liveProviderCalls ? "Live news/event" : event.sourceMode || "Sample event"))
  });
}

function disclosureContextDriver({ key, disclosureEvidence }) {
  if (key !== "aiTech" || !disclosureEvidence.length) return null;
  const top = disclosureEvidence.slice(0, 3);
  return driver({
    id: "aiTech:federal-disclosures",
    category: "Federal disclosures",
    title: "Federal disclosure context touches AI/tech tickers",
    direction: "mixed",
    score: 40 + Math.min(12, top.length * 4),
    evidenceStrength: "Low",
    whatChanged: top.map((trade) => `${trade.ticker}: ${trade.transactionType || "transaction"} disclosed ${trade.disclosureDate || trade.disclosedAt || "recently"}`).join("; "),
    evidence: top.map((trade) => `${trade.politicianName || "Filer"} · ${trade.ticker} · ${trade.transactionType || "transaction"}`),
    portfolioRelevance: "Disclosure data is delayed context only. It can point to names to inspect but cannot explain intraday market movement by itself.",
    nextStep: "Open Market Intelligence or the ticker page for disclosure context.",
    href: "#market-intelligence",
    tickers: unique(top.map((trade) => trade.ticker)),
    sourceModes: unique(top.map((trade) => trade.liveProviderCalls ? "Public disclosure dataset" : trade.sourceMode || "Imported disclosure"))
  });
}

function portfolioExposureDriver({ key, exposureValue, exposureWeight, relevantHoldings, signalEvidence }) {
  if (!relevantHoldings.length) return null;
  const top = relevantHoldings
    .sort((left, right) => (Number(right.marketValue) || 0) - (Number(left.marketValue) || 0))
    .slice(0, 4);
  const highExposure = exposureWeight >= (key === "aiTech" ? 0.2 : 0.35);
  return driver({
    id: `${key}:portfolio-exposure`,
    category: "Portfolio relevance",
    title: highExposure ? `${SCOPE_LABELS[key]} move matters to your portfolio` : `${SCOPE_LABELS[key]} exposure is present`,
    direction: "mixed",
    score: highExposure ? 76 : 58,
    evidenceStrength: "Medium",
    whatChanged: `${top.map((holding) => `${normalizeTicker(holding.ticker)} ${formatPercent(holding.portfolioWeight)}`).join(", ")} are linked to this driver set.`,
    evidence: [
      `${formatCurrency(exposureValue)} exposed`,
      `${formatPercent(exposureWeight)} portfolio weight`,
      ...(signalEvidence.length ? [`${signalEvidence.length} ticker signal${signalEvidence.length === 1 ? "" : "s"} overlap this scope`] : [])
    ],
    portfolioRelevance: highExposure
      ? "Because the exposure is meaningful, broad driver changes should route into risk, thesis, and target review."
      : "Exposure exists, but it is not dominant enough to be an automatic priority.",
    nextStep: key === "aiTech" ? "Review AI/tech concentration and leveraged ETF exposure." : "Compare broad-market exposure with your target allocation.",
    href: key === "aiTech" ? "#risk" : "#targets",
    tickers: top.map((holding) => holding.ticker),
    sourceModes: ["Imported portfolio"]
  });
}

function socialEvidenceForScope({ xUpdates = [], redditMentions = [], themeSet, asOf }) {
  const xRows = summarizeXUpdates(xUpdates, { asOf })
    .filter((row) => themeSet.has(normalizeTicker(row.ticker)))
    .map((row) => ({ ...row, sourceLabel: row.sourceMode === "api" ? "X API" : "Sample X/social" }));
  const redditRows = summarizeRedditMentions(redditMentions, { asOf })
    .filter((row) => themeSet.has(normalizeTicker(row.ticker)))
    .map((row) => ({ ...row, sourceLabel: row.liveProviderCalls || row.sourceMode === "api" ? "Reddit API" : "Sample Reddit" }));
  const rows = [...xRows, ...redditRows].sort((left, right) =>
    (Number(right.sevenDayMentions) || 0) - (Number(left.sevenDayMentions) || 0) ||
    (Number(right.totalEngagement) || 0) - (Number(left.totalEngagement) || 0)
  );
  return {
    rows,
    live: [...xUpdates, ...redditMentions].some((row) => row.liveProviderCalls || row.sourceMode === "api"),
    engagement: rows.reduce((total, row) => total + (Number(row.totalEngagement) || 0), 0)
  };
}

function eventEvidenceForScope(events = [], themeSet, key) {
  return (events || [])
    .filter((event) => {
      const text = `${event.headline || ""} ${event.title || ""} ${event.summary || ""} ${(event.themes || []).join(" ")} ${(event.sectorsAffected || []).join(" ")}`.toLowerCase();
      const tickers = eventTickers(event);
      const tickerMatch = tickers.some((ticker) => themeSet.has(ticker));
      if (key === "aiTech") return tickerMatch || /ai|artificial intelligence|semiconductor|chip|gpu|memory|capex|hyperscaler|data center|tech|nasdaq/.test(text);
      return tickerMatch || /market|macro|fed|rates|inflation|jobs|consumer|earnings|breadth|s&p|nasdaq|russell|treasury/.test(text);
    })
    .sort((left, right) => Number(right.priorityScore || right.marketImpactScore || 0) - Number(left.priorityScore || left.marketImpactScore || 0));
}

function disclosureEvidenceForScope(trades = [], themeSet) {
  return (trades || [])
    .filter((trade) => themeSet.has(normalizeTicker(trade.ticker)))
    .sort((left, right) => String(right.disclosureDate || right.disclosedAt || right.transactionDate || "").localeCompare(String(left.disclosureDate || left.disclosedAt || left.transactionDate || "")));
}

function signalEvidenceForScope(tickerSignals = [], themeSet) {
  return (tickerSignals || [])
    .filter((signal) => themeSet.has(normalizeTicker(signal.ticker)))
    .sort((left, right) => Number(right.combinedScore || 0) - Number(left.combinedScore || 0));
}

function buildSourceSummary({ marketDataSnapshot = {}, xUpdates = [], redditMentions = [], politicianTrades = [], providerReadiness = {}, marketEvents = [] }) {
  const marketMode = marketDataMode(marketDataSnapshot.status || {});
  const xStatus = providerReadiness?.xProviderStatuses?.xApi || providerReadiness?.providerStatuses?.xApi || {};
  const redditStatus = providerReadiness?.redditProviderStatuses?.redditApi || {};
  const disclosureStatus = providerReadiness?.politicianTradeProviderStatuses?.selected || providerReadiness?.politicianTradeProviderConfig || {};
  const xMode = xUpdates.length ? sourceRowsMode(xUpdates) : sourceDataMode(xStatus);
  const redditMode = redditMentions.length ? sourceRowsMode(redditMentions) : sourceDataMode(redditStatus);
  const disclosureMode = politicianTrades.length ? sourceRowsMode(politicianTrades) : sourceDataMode(disclosureStatus);
  const eventMode = marketEvents.length ? sourceRowsMode(marketEvents) : DATA_MODES.NOT_CONFIGURED;
  const modes = [marketMode, xMode, redditMode, disclosureMode, eventMode].map(normalizeDataMode);
  const overallMode = combinedSourceMode(modes);
  return {
    overallMode,
    overallLabel: dataModeLabel(overallMode),
    marketDataMode: marketMode,
    marketDataLabel: dataModeLabel(marketMode),
    xMode,
    xLabel: dataModeLabel(xMode),
    redditMode,
    redditLabel: dataModeLabel(redditMode),
    disclosureMode,
    disclosureLabel: dataModeLabel(disclosureMode),
    eventMode,
    eventLabel: dataModeLabel(eventMode),
    modes
  };
}

function normalizeQuoteMap(snapshot = {}) {
  const rows = snapshot.quotesByTicker || Object.fromEntries((snapshot.quotes || []).map((quote) => [quote.ticker, quote]));
  return Object.fromEntries(Object.entries(rows || {}).map(([ticker, quote]) => [normalizeTicker(ticker), {
    ...quote,
    ticker: normalizeTicker(quote?.ticker || ticker)
  }]));
}

function sourceRowsMode(rows = []) {
  if (!rows.length) return DATA_MODES.NOT_CONFIGURED;
  if (rows.some((row) => /error/.test(`${row.status || ""} ${row.dataFreshness || ""}`.toLowerCase()))) return DATA_MODES.ERROR;
  if (rows.some((row) => /stale/.test(`${row.status || ""} ${row.dataFreshness || ""} ${row.cacheStatus || ""}`.toLowerCase()))) return DATA_MODES.STALE;
  if (rows.some((row) => /cache/.test(`${row.status || ""} ${row.dataFreshness || ""} ${row.cacheStatus || ""}`.toLowerCase()))) return DATA_MODES.CACHED;
  if (rows.some((row) => row.liveProviderCalls || row.sourceMode === "api" || row.sourceMode === "live")) return DATA_MODES.LIVE;
  if (rows.some((row) => /import|file|manual|public-static/.test(`${row.sourceMode || ""} ${row.mode || ""}`.toLowerCase()))) return DATA_MODES.IMPORTED;
  if (rows.some((row) => /mock|sample|demo/.test(`${row.sourceMode || ""} ${row.mode || ""} ${row.providerId || ""}`.toLowerCase()))) return DATA_MODES.SAMPLE;
  return DATA_MODES.IMPORTED;
}

function combinedSourceMode(modes = []) {
  if (modes.includes(DATA_MODES.LIVE)) return DATA_MODES.LIVE;
  if (modes.includes(DATA_MODES.CACHED)) return DATA_MODES.CACHED;
  if (modes.includes(DATA_MODES.STALE)) return DATA_MODES.STALE;
  if (modes.includes(DATA_MODES.PARTIAL)) return DATA_MODES.PARTIAL;
  if (modes.includes(DATA_MODES.IMPORTED)) return DATA_MODES.IMPORTED;
  if (modes.includes(DATA_MODES.ERROR)) return DATA_MODES.ERROR;
  if (modes.includes(DATA_MODES.SAMPLE)) return DATA_MODES.SAMPLE;
  return DATA_MODES.NOT_CONFIGURED;
}

function missingDataForScope({ key, quotes, sourceSummary, marketEvents, xUpdates, redditMentions }) {
  const missing = [];
  if (!quotes.length) missing.push(`${SCOPE_LABELS[key]} proxy quotes are missing.`);
  if ([DATA_MODES.NOT_CONFIGURED, DATA_MODES.SAMPLE].includes(sourceSummary.marketDataMode)) missing.push("Live/cached market data is not available.");
  if (!marketEvents.length) missing.push("No source-labeled market/news events are loaded.");
  if (!xUpdates.length && !redditMentions.length) missing.push("No X or Reddit social rows are loaded.");
  if (key === "broadMarket") missing.push("Treasury yields, breadth, and macro calendar data are not connected yet.");
  if (key === "aiTech") missing.push("Company-specific live news and estimate revisions are not connected yet.");
  return unique(missing).slice(0, 5);
}

function confidenceForScope({ marketMove, drivers, missingData, sourceSummary }) {
  let score = 35;
  if (marketMove.averagePercent !== null) score += 25;
  if ([DATA_MODES.LIVE, DATA_MODES.CACHED].includes(sourceSummary.marketDataMode)) score += 18;
  if (drivers.some((driverRow) => driverRow.category === "News / events")) score += 10;
  if (drivers.some((driverRow) => driverRow.category === "Social attention")) score += 5;
  if (missingData.length) score -= Math.min(24, missingData.length * 5);
  if ([DATA_MODES.SAMPLE, DATA_MODES.NOT_CONFIGURED].includes(sourceSummary.overallMode)) score -= 8;
  return clamp(score, 5, 92);
}

function actionItemsForScope({ key, direction, exposureWeight, drivers, missingData, uiState }) {
  const imported = /^IMPORTED|STALE_PERSISTED_REPAIRED/.test(String(uiState || ""));
  const items = [];
  if (!imported) items.push("Import your portfolio before treating this as Tucker-specific.");
  if (missingData.length) items.push("Check Data Sources before leaning on the explanation.");
  if (key === "aiTech" && exposureWeight >= 0.15) items.push("Review AI/semiconductor and leveraged ETF exposure.");
  if (direction === "down") items.push("Inspect whether the move weakens thesis assumptions or only marks down multiples.");
  if (direction === "up") items.push("Check whether strength reduces margin of safety or increases concentration.");
  if (drivers.some((row) => row.category === "Social attention")) items.push("Confirm social chatter with price action or primary sources.");
  if (!items.length) items.push("Use this as context, then inspect holdings or risk before taking action.");
  return unique(items).slice(0, 4);
}

function buildReportHeadline(broadMarket, aiTech) {
  return `Broad market: ${broadMarket.directionLabel}. AI/tech: ${aiTech.directionLabel}.`;
}

function scopeHeadline(key, direction, marketMove) {
  if (direction === "unknown") return `${SCOPE_LABELS[key]} driver data is incomplete`;
  return `${SCOPE_LABELS[key]} is ${directionLabel(direction).toLowerCase()} today`;
}

function scopeSummary(key, direction, marketMove, drivers, missingData) {
  const lead = drivers[0];
  if (direction === "unknown") {
    return `${SCOPE_LABELS[key]} movement cannot be explained confidently yet because ${missingData[0] || "key source data is missing"}.`;
  }
  return `${marketMove.label}. Top likely contributor: ${lead?.title || "price action"}. Treat this as a source-labeled explanation, not a confirmed cause.`;
}

function directionFromMove(averagePercent, positiveCount, negativeCount, totalCount) {
  if (!Number.isFinite(Number(averagePercent))) return "unknown";
  if (Math.abs(averagePercent) < 0.0015 || (positiveCount && negativeCount && Math.abs(positiveCount - negativeCount) <= 1 && totalCount > 2)) return "mixed";
  return averagePercent > 0 ? "up" : "down";
}

function directionLabel(direction = "unknown") {
  return ({
    up: "Up",
    down: "Down",
    mixed: "Mixed",
    flat: "Flat",
    unknown: "Unknown"
  })[direction] || "Unknown";
}

function confidenceLabel(score = 0) {
  if (score >= 75) return "High";
  if (score >= 52) return "Medium";
  return "Low";
}

function directionFromSentiment(events = []) {
  const text = events.map((event) => `${event.sentiment || ""} ${event.expectedDirection || ""} ${JSON.stringify(event.expectedDirectionByTicker || {})}`).join(" ").toLowerCase();
  if (/negative|bearish|down|pressure|risk/.test(text) && !/positive|bullish|up|support/.test(text)) return "down";
  if (/positive|bullish|up|support/.test(text) && !/negative|bearish|down|pressure|risk/.test(text)) return "up";
  return "mixed";
}

function eventTickers(event = {}) {
  return unique([
    event.ticker,
    event.primaryTicker,
    ...(event.affectedTickers || []),
    ...(event.inferredTickersAffected || []),
    ...(event.tickersMentioned || [])
  ].map(normalizeTicker).filter(Boolean));
}

function isHoldingRelevantToScope(holding = {}, themeSet, key) {
  const ticker = normalizeTicker(holding.ticker);
  if (themeSet.has(ticker)) return true;
  const text = `${holding.name || ""} ${holding.sector || ""} ${holding.industry || ""} ${holding.assetClass || ""} ${(holding.themes || []).join(" ")}`.toLowerCase();
  if (key === "aiTech") return /ai|artificial intelligence|semiconductor|chip|gpu|memory|technology|software|data center|networking/.test(text);
  return /s&p|broad market|total market|index|large cap|equity|stock/.test(text);
}

function driver({
  id,
  category,
  title,
  direction = "mixed",
  score = 50,
  evidenceStrength = "Low",
  whatChanged = "",
  evidence = [],
  portfolioRelevance = "",
  nextStep = "",
  href = "#market-intelligence",
  tickers = [],
  sourceModes = []
}) {
  return {
    id,
    category,
    title,
    direction,
    score: Math.round(clamp(score, 0, 100)),
    evidenceStrength,
    whatChanged,
    evidence: evidence.filter(Boolean).slice(0, 6),
    portfolioRelevance,
    nextStep,
    href,
    tickers: unique(tickers.map(normalizeTicker).filter(Boolean)).slice(0, 8),
    sourceModes: unique(sourceModes.filter(Boolean)).slice(0, 5)
  };
}

function formatSignedPercent(value) {
  if (!Number.isFinite(Number(value))) return "not available";
  const pct = Number(value) * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(Math.abs(pct) >= 10 ? 1 : 2)}%`;
}

function formatPercent(value) {
  if (!Number.isFinite(Number(value))) return "--";
  return `${(Number(value) * 100).toFixed(Math.abs(Number(value)) >= 0.1 ? 1 : 2)}%`;
}

function formatCurrency(value) {
  const amount = Number(value) || 0;
  if (Math.abs(amount) >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (Math.abs(amount) >= 1_000) return `$${(amount / 1_000).toFixed(1)}K`;
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}
