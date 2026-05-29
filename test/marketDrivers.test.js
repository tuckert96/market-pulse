import test from "node:test";
import assert from "node:assert/strict";
import { DATA_MODES, dataModeLabel } from "../src/dataModes.js";
import { buildMarketDataSnapshot, normalizeMarketQuote } from "../src/marketDataProvider.js";
import { buildMarketDriverReport, buildMarketRegime } from "../src/marketDrivers.js";

const asOf = "2026-05-27T14:30:00.000Z";

function quote(ticker, price, dailyChange, extra = {}) {
  return normalizeMarketQuote({
    ticker,
    name: extra.name || ticker,
    price,
    previousClose: price - dailyChange,
    dailyChange,
    sector: extra.sector,
    industry: extra.industry,
    asOf,
    liveProviderCalls: extra.liveProviderCalls ?? true,
    sourceMode: extra.sourceMode || "live"
  }, {
    providerId: "finnhub",
    providerLabel: "Finnhub",
    mode: extra.sourceMode || "live",
    source: "finnhub",
    asOf
  });
}

function snapshot(quotes) {
  return buildMarketDataSnapshot({
    provider: {
      id: "finnhub",
      label: "Finnhub",
      mode: "live",
      configured: true,
      liveProviderCalls: true
    },
    quotes,
    requestedTickers: quotes.map((row) => row.ticker),
    asOf,
    now: asOf
  });
}

function quoteMap(rows = []) {
  return Object.fromEntries(rows.map(([ticker, percent]) => {
    const normalized = normalizeMarketQuote({
      ticker,
      name: ticker,
      price: 100,
      previousClose: 100 / (1 + percent),
      dailyChangePercent: percent,
      asOf,
      liveProviderCalls: true,
      sourceMode: "live"
    }, {
      providerId: "finnhub",
      providerLabel: "Finnhub",
      mode: "live",
      source: "finnhub",
      asOf
    });
    return [normalized.ticker, normalized];
  }));
}

function sourceSummary(mode = DATA_MODES.LIVE) {
  return {
    marketDataMode: mode,
    marketDataLabel: dataModeLabel(mode)
  };
}

test("market driver report explains broad market and AI/tech moves without trade commands", () => {
  const report = buildMarketDriverReport({
    asOf,
    uiState: "IMPORTED_CLEAN",
    holdings: [
      { ticker: "NVDA", name: "NVIDIA Corporation", sector: "Semiconductors", marketValue: 140000, portfolioWeight: 0.16 },
      { ticker: "SOXL", name: "Direxion Daily Semiconductor Bull 3X Shares", sector: "Semiconductors", marketValue: 45000, portfolioWeight: 0.052 },
      { ticker: "UPRO", name: "ProShares UltraPro S&P500", sector: "Broad market", marketValue: 37000, portfolioWeight: 0.043 }
    ],
    marketDataSnapshot: snapshot([
      quote("SPY", 632.4, 2.4),
      quote("QQQ", 472.9, 5.6),
      quote("DIA", 426.7, 0.4),
      quote("IWM", 221.9, -0.5),
      quote("NVDA", 1014, 13),
      quote("SOXL", 52.8, 1.9),
      quote("AMD", 164.5, 0.9)
    ]),
    marketEvents: [{
      id: "event-ai-capex",
      title: "Hyperscaler AI capex commentary supports AI infrastructure names",
      headline: "Hyperscaler AI capex commentary supports AI infrastructure names",
      affectedTickers: ["NVDA", "AMD", "SOXL"],
      themes: ["AI", "semiconductor"],
      sourceMode: "imported",
      priorityScore: 82
    }],
    xUpdates: [{
      id: "x-1",
      sourceId: "x-1",
      ticker: "NVDA",
      createdAt: asOf,
      detectedAt: asOf,
      engagementScore: 280,
      liveProviderCalls: true,
      sourceMode: "api"
    }],
    redditMentions: [{
      id: "reddit-1",
      sourceId: "reddit-1",
      ticker: "SOXL",
      createdAt: asOf,
      detectedAt: asOf,
      engagementScore: 60,
      sentiment: "mixed",
      sourceMode: "mock"
    }],
    politicianTrades: [{
      id: "disclosure-1",
      politicianName: "Sample Filer",
      ticker: "NVDA",
      transactionType: "Purchase",
      disclosureDate: "2026-05-24",
      sourceMode: "public-static"
    }],
    tickerSignals: [{ ticker: "NVDA", combinedScore: 82 }]
  });

  assert.equal(report.broadMarket.label, "Broader Market");
  assert.ok(report.marketRegime);
  assert.ok(report.marketRegime.signals.length >= 6);
  assert.equal(report.marketRegime.sourceStatus, "Live");
  assert.equal(report.aiTech.label, "AI / Tech");
  assert.equal(report.aiTech.proxyTickers.includes("NVDA"), true);
  assert.equal(report.aiTech.drivers.some((driver) => driver.category === "News / events"), true);
  assert.equal(report.aiTech.drivers.some((driver) => driver.category === "Social attention"), true);
  assert.equal(report.aiTech.drivers.some((driver) => driver.category === "Federal disclosures"), true);
  assert.equal(report.aiTech.actionItems.some((item) => /Review AI\/semiconductor/.test(item)), true);

  const visibleText = JSON.stringify(report);
  assert.doesNotMatch(visibleText, /\b(buy|sell|place trade|guaranteed|predicts returns)\b/i);
  assert.match(report.aiTech.summary, /source-labeled explanation, not a confirmed cause/i);
});

test("market regime classifies risk-on, risk-off, and mixed tapes deterministically", () => {
  const riskOn = buildMarketRegime({
    quotesByTicker: quoteMap([
      ["SPY", 0.008], ["QQQ", 0.011], ["DIA", 0.006], ["IWM", 0.009],
      ["VIX", -0.04], ["TLT", 0.006], ["XLY", 0.009], ["XLU", -0.002], ["XLP", -0.001]
    ]),
    sourceSummary: sourceSummary(DATA_MODES.LIVE),
    asOf
  });
  const riskOff = buildMarketRegime({
    quotesByTicker: quoteMap([
      ["SPY", -0.009], ["QQQ", -0.014], ["DIA", -0.007], ["IWM", -0.011],
      ["VIX", 0.065], ["TLT", -0.007]
    ]),
    sourceSummary: sourceSummary(DATA_MODES.LIVE),
    asOf
  });
  const mixed = buildMarketRegime({
    quotesByTicker: quoteMap([
      ["SPY", 0.001], ["QQQ", -0.001], ["DIA", 0.0005], ["IWM", -0.0005],
      ["VIX", 0.002], ["TLT", 0.001], ["XLY", 0.001], ["XLU", 0.001]
    ]),
    sourceSummary: sourceSummary(DATA_MODES.LIVE),
    asOf
  });

  assert.equal(riskOn.regime, "risk-on");
  assert.ok(riskOn.riskOnScore > riskOn.riskOffScore);
  assert.equal(riskOff.regime, "risk-off");
  assert.ok(riskOff.riskOffScore > riskOff.riskOnScore);
  assert.equal(mixed.regime, "mixed");
  assert.ok(mixed.signals.every((signal) => signal.label && signal.reading));
  assert.doesNotMatch(JSON.stringify([riskOn, riskOff, mixed]), /\b(buy|sell|place trade|guaranteed|predicts returns)\b/i);
});

test("market regime surfaces stale and missing-data states without pretending precision", () => {
  const stale = buildMarketRegime({
    quotesByTicker: quoteMap([["SPY", 0.004], ["QQQ", 0.006], ["DIA", 0.001], ["IWM", -0.002]]),
    sourceSummary: sourceSummary(DATA_MODES.STALE),
    asOf
  });
  const missing = buildMarketRegime({
    quotesByTicker: {},
    sourceSummary: sourceSummary(DATA_MODES.NOT_CONFIGURED),
    asOf
  });

  assert.equal(stale.sourceStatus, "Stale");
  assert.ok(stale.actionItems.some((item) => /Refresh market data/i.test(item)));
  assert.ok(stale.confidenceScore < 80);
  assert.equal(missing.regime, "mixed");
  assert.equal(missing.signals.every((signal) => signal.status === "missing"), true);
  assert.ok(missing.missingData.length >= 4);
  assert.match(missing.summary, /Source status: Not configured/);
});

test("market driver report is explicit when real-time source data is missing", () => {
  const report = buildMarketDriverReport({
    asOf,
    uiState: "NO_DATA",
    marketDataSnapshot: buildMarketDataSnapshot({
      provider: {
        id: "market-data-unconfigured",
        label: "Market data provider",
        mode: "not-configured",
        configured: false,
        liveProviderCalls: false
      },
      quotes: [],
      requestedTickers: ["SPY", "QQQ"],
      asOf,
      now: asOf
    }),
    marketEvents: [],
    xUpdates: [],
    redditMentions: []
  });

  assert.equal(report.broadMarket.direction, "unknown");
  assert.equal(report.aiTech.direction, "unknown");
  assert.equal(report.broadMarket.drivers[0].category, "Price action");
  assert.match(report.broadMarket.summary, /cannot be explained confidently/i);
  assert.equal(report.missingData.some((item) => /proxy quotes are missing/i.test(item)), true);
  assert.equal(report.broadMarket.actionItems.some((item) => /Import your portfolio/i.test(item)), true);
});
