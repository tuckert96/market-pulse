import test from "node:test";
import assert from "node:assert/strict";
import { buildTickerMovementExplainer } from "../src/movementExplainer.js";

const asOf = "2026-05-24T09:00:00-04:00";

test("movement explainer summarizes structured drivers without claiming news causation", () => {
  const explainer = buildTickerMovementExplainer({
    ticker: "MU",
    owned: true,
    marketValue: 12000,
    dailyChange: 240,
    sector: "Semiconductors",
    marketDataStatus: { status: "mock/sample mode", label: "Sample market data" },
    quote: {
      ticker: "MU",
      price: 132.1,
      dailyChange: 2.18,
      dailyChangePercent: 0.0168,
      volume: 24_600_000,
      averageVolume: 19_800_000,
      sourceMode: "mock",
      isMock: true
    },
    redditSummary: {
      ticker: "MU",
      oneDayMentions: 2,
      sevenDayMentions: 5,
      mentionAcceleration: 0.8,
      sentiment: "bullish"
    },
    politicianTrades: [
      { ticker: "MU", politicianName: "Demo Member", transactionType: "Purchase", disclosureDate: "2026-05-22" }
    ],
    calendarEvents: [
      { ticker: "MU", title: "MU imported earnings review", date: "2026-06-01", importance: "high", sourceMode: "imported", sourceLabel: "Imported calendar" }
    ],
    alerts: [
      { title: "MU signal score is elevated", detail: "Review local confluence score.", severity: "watch" }
    ],
    journalEntries: [
      { decisionType: "hold", dateTime: "2026-05-20T09:00:00-04:00", catalyst: "HBM pricing and memory margins" }
    ]
  }, {
    asOf,
    marketDataSnapshot: {
      quotesByTicker: {
        SOXL: { ticker: "SOXL", sector: "Semiconductors", dailyChangePercent: 0.014 },
        NVDA: { ticker: "NVDA", sector: "Semiconductors", dailyChangePercent: 0.01 },
        QQQ: { ticker: "QQQ", sector: "Mega-cap tech", dailyChangePercent: 0.006 }
      }
    }
  });

  assert.equal(explainer.ticker, "MU");
  assert.match(explainer.summary, /MU is up 1\.7%/);
  assert.equal(explainer.sourceLabel, "Sample quote");
  assert.ok(explainer.drivers.some((driver) => driver.id === "price-action"));
  assert.ok(explainer.drivers.some((driver) => driver.id === "volume-confirmation"));
  assert.ok(explainer.drivers.some((driver) => driver.id === "peer-context"));
  assert.ok(explainer.drivers.some((driver) => driver.id === "reddit-attention"));
  assert.ok(explainer.drivers.some((driver) => driver.id === "politician-disclosures"));
  assert.ok(explainer.drivers.some((driver) => driver.id === "upcoming-event"));
  assert.ok(explainer.drivers.some((driver) => driver.id === "local-alert"));
  assert.ok(explainer.drivers.some((driver) => driver.id === "journal-context"));
  assert.match(explainer.caveat, /does not infer news causation/i);
  assert.doesNotMatch(JSON.stringify(explainer), /\b(news caused|because news|guaranteed|predict)\b/i);
});

test("movement explainer gives missing-data notes when it cannot explain a move", () => {
  const explainer = buildTickerMovementExplainer({
    ticker: "CRDO",
    owned: false,
    watchlistOnly: true,
    sector: "AI networking",
    marketDataStatus: { status: "not configured" },
    quote: null,
    redditSummary: null,
    politicianTrades: [],
    calendarEvents: [],
    alerts: [],
    journalEntries: []
  }, { asOf });

  assert.equal(explainer.movementLabel, "Move unavailable");
  assert.match(explainer.summary, /cannot explain movement without quote or imported daily-change data/i);
  assert.ok(explainer.missingData.some((item) => /No quote or imported daily move/i.test(item)));
  assert.ok(explainer.missingData.some((item) => /No decision-journal note/i.test(item)));
  assert.equal(explainer.confidence.label, "Thin structured context");
  assert.doesNotMatch(JSON.stringify(explainer), /\bcaused by news|headline drove|buy now|sell now\b/i);
});

test("movement explainer labels stale/error market data without overstating confidence", () => {
  const stale = buildTickerMovementExplainer({
    ticker: "AMD",
    owned: true,
    marketValue: 5000,
    dailyChange: -150,
    sector: "Semiconductors",
    marketDataStatus: { status: "stale data", detail: "Refresh failed." },
    quote: {
      ticker: "AMD",
      dailyChange: -1.31,
      dailyChangePercent: -0.008,
      volume: 46_800_000,
      averageVolume: 51_400_000,
      cacheStatus: "stale"
    }
  }, { asOf });

  assert.equal(stale.sourceLabel, "Stale quote");
  assert.ok(stale.confidence.score <= 45);
  assert.match(stale.summary, /AMD is down/);
});
