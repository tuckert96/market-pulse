import { normalizeTicker } from "./portfolioSchema.js";
import { DATA_MODES, dataModeLabel, marketDataMode } from "./dataModes.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function buildTickerMovementExplainer(model = {}, options = {}) {
  const ticker = normalizeTicker(model.ticker || options.ticker || "");
  const quote = model.quote || {};
  const marketDataSnapshot = options.marketDataSnapshot || {};
  const asOf = validDate(options.asOf) || new Date();
  const move = priceMoveFromModel(model);
  const sourceLabel = movementSourceLabel(model);
  const drivers = [];
  const missingData = [];
  const nextChecks = [];

  if (!ticker) {
    return emptyExplainer("Ticker", "No ticker selected.", "Open a ticker page to see structured movement context.");
  }

  if (!move.available) {
    missingData.push("No quote or imported daily move is available for this ticker.");
  } else {
    drivers.push(priceActionDriver(move, sourceLabel));
    nextChecks.push("Check whether the move is confirmed by volume, peers, alerts, or upcoming events.");
  }

  const volumeDriver = buildVolumeDriver(quote);
  if (volumeDriver) {
    drivers.push(volumeDriver);
  } else {
    missingData.push("Volume or average-volume data is missing, so volume confirmation cannot be assessed.");
  }

  const peerDriver = buildPeerMoveDriver(ticker, model, marketDataSnapshot, move);
  if (peerDriver) {
    drivers.push(peerDriver);
  } else {
    missingData.push("Comparable sector or benchmark moves are missing, so the app cannot separate ticker-specific movement from broader market movement.");
  }

  const redditDriver = buildRedditDriver(model);
  if (redditDriver) {
    drivers.push(redditDriver);
    nextChecks.push("Treat Reddit acceleration as a low-trust attention signal unless confirmed by higher-quality sources.");
  } else {
    missingData.push("No Reddit mention acceleration is available for this ticker.");
  }

  const politicianDriver = buildPoliticianDriver(model, asOf);
  if (politicianDriver) {
    drivers.push(politicianDriver);
    nextChecks.push("Use disclosure rows as delayed context only; they do not prove why the ticker moved today.");
  }

  const eventDriver = buildEventDriver(model, asOf);
  if (eventDriver) {
    drivers.push(eventDriver);
    nextChecks.push("Review event timing and source labels before treating the event as current market information.");
  }

  const alertDriver = buildAlertDriver(model);
  if (alertDriver) drivers.push(alertDriver);

  const journalDriver = buildJournalDriver(model, asOf);
  if (journalDriver) {
    drivers.push(journalDriver);
    nextChecks.push("Compare the current move with the last written thesis or journal note.");
  }

  const marketReadThroughDriver = buildMarketReadThroughDriver(model);
  if (marketReadThroughDriver) drivers.push(marketReadThroughDriver);

  if (!model.politicianTrades?.length) missingData.push("No politician disclosure records are loaded for this ticker.");
  if (!model.calendarEvents?.length) missingData.push("No upcoming event is loaded for this ticker.");
  if (!model.alerts?.length) missingData.push("No current alert references this ticker.");
  if (!model.journalEntries?.length) missingData.push("No decision-journal note is available for this ticker.");

  const confidence = contextConfidence({
    move,
    drivers,
    model,
    sourceLabel
  });

  return {
    ticker,
    title: `Why is ${ticker} moving?`,
    summary: movementSummary(ticker, move, drivers, sourceLabel),
    movementLabel: move.available ? `${move.directionLabel} ${formatSignedPercent(move.percent)}` : "Move unavailable",
    sourceLabel,
    confidence,
    drivers: drivers.sort((a, b) => b.priority - a.priority || a.label.localeCompare(b.label)).slice(0, 8),
    missingData: unique(missingData).slice(0, 8),
    nextChecks: unique(nextChecks).slice(0, 5),
    caveat: "This explainer uses deterministic templates from structured app data. It does not infer news causation or forecast future price moves."
  };
}

function emptyExplainer(ticker, title, summary) {
  return {
    ticker,
    title,
    summary,
    movementLabel: "Move unavailable",
    sourceLabel: "Missing ticker",
    confidence: { label: "No context", score: 0, detail: "Ticker context is missing." },
    drivers: [],
    missingData: ["Ticker context is missing."],
    nextChecks: [],
    caveat: "No causal explanation is generated."
  };
}

function priceMoveFromModel(model = {}) {
  const quote = model.quote || {};
  const quotePercent = finiteNumber(quote.dailyChangePercent);
  const quoteDollar = finiteNumber(quote.dailyChange);
  const holdingDailyChange = model.dailyChangeAvailable === false ? null : finiteNumber(model.dailyChange);
  const marketValue = finiteNumber(model.marketValue);
  const priorPositionValue = marketValue !== null && holdingDailyChange !== null ? marketValue - holdingDailyChange : null;
  const holdingPercent = priorPositionValue > 0 && holdingDailyChange !== null ? holdingDailyChange / priorPositionValue : null;
  const percent = quotePercent ?? holdingPercent;
  const dollar = quoteDollar ?? holdingDailyChange;
  const available = percent !== null || dollar !== null;
  const absPercent = Math.abs(percent ?? 0);
  return {
    available,
    percent: percent ?? 0,
    dollar: dollar ?? 0,
    direction: (percent ?? dollar ?? 0) > 0 ? "up" : (percent ?? dollar ?? 0) < 0 ? "down" : "flat",
    directionLabel: (percent ?? dollar ?? 0) > 0 ? "Up" : (percent ?? dollar ?? 0) < 0 ? "Down" : "Flat",
    magnitude: absPercent >= 0.05 ? "sharp" : absPercent >= 0.02 ? "notable" : absPercent >= 0.005 ? "modest" : "small"
  };
}

function movementSourceLabel(model = {}) {
  const status = model.marketDataStatus || {};
  const quote = model.quote || {};
  const mode = marketDataMode(status, quote);
  if (mode === DATA_MODES.SAMPLE) return `${dataModeLabel(DATA_MODES.SAMPLE)} quote`;
  if (mode === DATA_MODES.STALE) return `${dataModeLabel(DATA_MODES.STALE)} quote`;
  if (mode === DATA_MODES.ERROR) return `${dataModeLabel(DATA_MODES.ERROR)} quote`;
  if (mode === DATA_MODES.LIVE) return `${dataModeLabel(DATA_MODES.LIVE)} quote`;
  if (mode === DATA_MODES.CACHED) return `${dataModeLabel(DATA_MODES.CACHED)} quote`;
  if (model.owned && Math.abs(Number(model.dailyChange) || 0) > 0) return "Imported holding daily move";
  return dataModeLabel(DATA_MODES.NOT_CONFIGURED);
}

function priceActionDriver(move, sourceLabel) {
  const action = move.direction === "flat"
    ? "The available price data shows no meaningful move."
    : `The available price data shows a ${move.magnitude} ${move.direction} move of ${formatSignedPercent(move.percent)}.`;
  return {
    id: "price-action",
    label: "Price action",
    tone: move.direction === "up" ? "positive" : move.direction === "down" ? "negative" : "neutral",
    detail: `${action} Source: ${sourceLabel}.`,
    priority: move.available ? 90 : 0,
    sourceType: "price"
  };
}

function buildVolumeDriver(quote = {}) {
  const volume = finiteNumber(quote.volume);
  const averageVolume = finiteNumber(quote.averageVolume);
  if (!volume || !averageVolume) return null;
  const ratio = volume / averageVolume;
  if (ratio >= 1.25) {
    return {
      id: "volume-confirmation",
      label: "Volume confirmation",
      tone: "positive",
      detail: `Volume is ${ratio.toFixed(1)}x average, so the move has above-normal participation in available market data.`,
      priority: 78,
      sourceType: "volume"
    };
  }
  if (ratio <= 0.75) {
    return {
      id: "volume-confirmation",
      label: "Volume confirmation",
      tone: "neutral",
      detail: `Volume is ${ratio.toFixed(1)}x average, so the move has weak volume confirmation so far.`,
      priority: 63,
      sourceType: "volume"
    };
  }
  return {
    id: "volume-confirmation",
    label: "Volume confirmation",
    tone: "neutral",
    detail: `Volume is near average at ${ratio.toFixed(1)}x, so volume does not strongly confirm or reject the move.`,
    priority: 63,
    sourceType: "volume"
  };
}

function buildPeerMoveDriver(ticker, model = {}, marketDataSnapshot = {}, move = {}) {
  if (!move.available) return null;
  const quotes = Object.values(marketDataSnapshot.quotesByTicker || {})
    .filter((quote) => normalizeTicker(quote.ticker) && normalizeTicker(quote.ticker) !== ticker);
  if (!quotes.length) return null;
  const sameSector = quotes.filter((quote) => {
    const quoteSector = String(quote.sector || "").toLowerCase();
    const modelSector = String(model.sector || "").toLowerCase();
    return quoteSector && modelSector && quoteSector === modelSector;
  });
  const peerQuotes = sameSector.length ? sameSector : quotes.filter((quote) => ["QQQ", "VGT", "SOXL", "UPRO"].includes(normalizeTicker(quote.ticker)));
  if (!peerQuotes.length) return null;
  const peerMove = average(peerQuotes.map((quote) => finiteNumber(quote.dailyChangePercent)).filter((value) => value !== null));
  if (peerMove === null) return null;
  const spread = move.percent - peerMove;
  const aligned = sameDirection(move.percent, peerMove) && Math.abs(spread) <= 0.02;
  const label = sameSector.length ? "Peer / sector context" : "Benchmark context";
  const peerLabel = sameSector.length ? `${model.sector} peer average` : "available benchmark average";
  if (aligned) {
    return {
      id: "peer-context",
      label,
      tone: "neutral",
      detail: `${peerLabel} moved ${formatSignedPercent(peerMove)}, directionally close to ${ticker}. The move may be partly broad-sector rather than ticker-specific.`,
      priority: 70,
      sourceType: "market"
    };
  }
  return {
    id: "peer-context",
    label,
    tone: Math.abs(spread) >= 0.02 ? "watch" : "neutral",
    detail: `${ticker} moved ${formatSignedPercent(move.percent)} versus ${peerLabel} at ${formatSignedPercent(peerMove)}. That spread suggests there may be ticker-specific context, but the app needs confirmed news or primary-source data before naming a cause.`,
    priority: Math.abs(spread) >= 0.02 ? 76 : 62,
    sourceType: "market"
  };
}

function buildRedditDriver(model = {}) {
  const row = model.redditSummary;
  if (!row) return null;
  const acceleration = Number(row.mentionAcceleration ?? row.mentionGrowth) || 0;
  const oneDay = Number(row.oneDayMentions) || 0;
  const sevenDay = Number(row.sevenDayMentions) || 0;
  if (oneDay <= 0 && sevenDay <= 0) return null;
  const elevated = acceleration >= 0.6 || oneDay >= 2;
  return {
    id: "reddit-attention",
    label: "Reddit attention",
    tone: elevated ? "watch" : "neutral",
    detail: `${sevenDay} mention${sevenDay === 1 ? "" : "s"} in 7 days and ${formatAcceleration(acceleration)} acceleration. This is low-trust attention context, not proof of a price driver.`,
    priority: elevated ? 68 : 42,
    sourceType: "social"
  };
}

function buildPoliticianDriver(model = {}, asOf = new Date()) {
  const trades = model.politicianTrades || [];
  if (!trades.length) return null;
  const recent = trades.filter((trade) => daysBetween(trade.disclosureDate || trade.disclosedAt || trade.transactionDate, asOf) <= 45);
  const rows = recent.length ? recent : trades.slice(0, 2);
  const purchases = rows.filter((trade) => /purchase|buy/i.test(trade.transactionType || "")).length;
  const sales = rows.filter((trade) => /sale|sell/i.test(trade.transactionType || "")).length;
  return {
    id: "politician-disclosures",
    label: "Politician disclosure activity",
    tone: "neutral",
    detail: `${rows.length} disclosure row${rows.length === 1 ? "" : "s"} loaded (${purchases} purchase, ${sales} sale). Disclosures are delayed and informational; they do not explain today’s move by themselves.`,
    priority: recent.length ? 54 : 34,
    sourceType: "disclosure"
  };
}

function buildEventDriver(model = {}, asOf = new Date()) {
  const events = (model.calendarEvents || [])
    .filter((event) => {
      const days = daysUntil(event.date || event.timestamp, asOf);
      return days !== null && days >= 0 && days <= 21;
    })
    .sort((a, b) => daysUntil(a.date || a.timestamp, asOf) - daysUntil(b.date || b.timestamp, asOf));
  if (!events.length) return null;
  const event = events[0];
  return {
    id: "upcoming-event",
    label: "Upcoming event",
    tone: event.importance === "high" ? "watch" : "neutral",
    detail: `${event.title || "Upcoming event"} is in ${daysUntil(event.date || event.timestamp, asOf)} day(s). Source mode: ${event.sourceLabel || event.sourceMode || "local event"}. Events can shape attention, but this is not a live-news claim.`,
    priority: event.importance === "high" ? 66 : 46,
    sourceType: "event"
  };
}

function buildAlertDriver(model = {}) {
  const alert = (model.alerts || [])[0];
  if (!alert) return null;
  return {
    id: "local-alert",
    label: "Local alert context",
    tone: /critical|warning|high/i.test(`${alert.severity || ""} ${alert.actionCategory || ""}`) ? "watch" : "neutral",
    detail: `${alert.title || "Alert"}: ${alert.detail || "Review the alert screen for context."}`,
    priority: 64,
    sourceType: "alert"
  };
}

function buildJournalDriver(model = {}, asOf = new Date()) {
  const entry = (model.journalEntries || [])[0];
  if (!entry) return null;
  const days = daysBetween(entry.dateTime, asOf);
  return {
    id: "journal-context",
    label: "Decision journal context",
    tone: "neutral",
    detail: `${entry.decisionType || "journal"} note${Number.isFinite(days) ? ` from ${days} day(s) ago` : ""}: ${entry.catalyst || entry.thesisNote || entry.riskNote || "review the saved note."}`,
    priority: Number.isFinite(days) && days <= 14 ? 58 : 38,
    sourceType: "journal"
  };
}

function buildMarketReadThroughDriver(model = {}) {
  const linked = [...(model.alphaSignals || []), ...(model.marketEvents || [])];
  if (!linked.length) return null;
  const item = linked[0];
  return {
    id: "linked-read-through",
    label: "Linked signal/read-through",
    tone: "neutral",
    detail: `${item.headline || item.title || "A local read-through"} is mapped to this ticker. Treat demo/imported read-throughs as prompts to inspect evidence, not as a causal explanation.`,
    priority: 52,
    sourceType: "signal"
  };
}

function contextConfidence({ move, drivers = [], model = {}, sourceLabel = "" } = {}) {
  let score = 0;
  if (move.available) score += 0.25;
  if (drivers.some((driver) => driver.id === "volume-confirmation")) score += 0.18;
  if (drivers.some((driver) => driver.id === "peer-context")) score += 0.18;
  if (drivers.some((driver) => driver.id === "upcoming-event" || driver.id === "local-alert")) score += 0.12;
  if (drivers.some((driver) => driver.id === "reddit-attention")) score += 0.08;
  if (drivers.some((driver) => driver.id === "politician-disclosures")) score += 0.06;
  if (drivers.some((driver) => driver.id === "journal-context")) score += 0.06;
  if (/mock|sample/i.test(sourceLabel) || model.quote?.isMock || model.marketDataStatus?.status === "mock/sample mode") score = Math.min(score, 0.58);
  if (model.marketDataStatus?.status === "stale data") score = Math.min(score, 0.45);
  if (model.marketDataStatus?.status === "error") score = Math.min(score, 0.35);
  const rounded = Math.round(Math.min(1, score) * 100);
  return {
    score: rounded,
    label: rounded >= 70 ? "Good structured context" : rounded >= 45 ? "Partial structured context" : "Thin structured context",
    detail: rounded >= 70
      ? "Price, volume, and comparable context are available, but causation still requires confirmed news or filings."
      : rounded >= 45
        ? "Several structured inputs are available, but some important context is missing."
        : "The app has limited structured context and should not explain the move beyond observed data."
  };
}

function movementSummary(ticker, move, drivers = [], sourceLabel = "") {
  if (!move.available) {
    return `${ticker} has no reliable daily move in the available structured data. The app cannot explain movement without quote or imported daily-change data.`;
  }
  const topDrivers = drivers
    .filter((driver) => driver.id !== "price-action")
    .slice(0, 2)
    .map((driver) => driver.label.toLowerCase());
  const context = topDrivers.length ? ` Structured context to inspect: ${topDrivers.join(" and ")}.` : " No secondary structured driver is available yet.";
  const absoluteMove = `${Math.abs(move.percent * 100).toFixed(1)}%`;
  return `${ticker} is ${move.direction} ${absoluteMove} in ${sourceLabel.toLowerCase()}.${context}`;
}

function finiteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function average(values = []) {
  const numeric = values.filter((value) => Number.isFinite(Number(value))).map(Number);
  return numeric.length ? numeric.reduce((sum, value) => sum + value, 0) / numeric.length : null;
}

function sameDirection(a, b) {
  if (Math.abs(a) < 0.002 || Math.abs(b) < 0.002) return false;
  return Math.sign(a) === Math.sign(b);
}

function validDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysUntil(value, asOf = new Date()) {
  const date = validDate(value);
  if (!date) return null;
  return Math.ceil((date.getTime() - asOf.getTime()) / ONE_DAY_MS);
}

function daysBetween(value, asOf = new Date()) {
  const date = validDate(value);
  if (!date) return Infinity;
  return Math.max(0, Math.floor((asOf.getTime() - date.getTime()) / ONE_DAY_MS));
}

function formatSignedPercent(value) {
  const numeric = Number(value) || 0;
  return `${numeric >= 0 ? "+" : ""}${(numeric * 100).toFixed(1)}%`;
}

function formatAcceleration(value) {
  const numeric = Number(value) || 0;
  if (numeric === 1) return "new spike";
  return `${numeric >= 0 ? "+" : ""}${Math.round(numeric * 100)}%`;
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}
