import test from "node:test";
import assert from "node:assert/strict";
import {
  SOURCE_HISTORY_EVENT_TYPES,
  appendSourceHistoryEvent,
  buildSourceHistoryEvent,
  normalizeSourceHistory,
  sourceHistoryEventFromImportReport,
  sourceHistoryEventFromMarketDataStatus,
  sourceHistoryEventFromProviderSync,
  sourceHistorySummary
} from "../src/sourceHistory.js";

test("portfolio import history keeps counts and redacts file, detail, and account-shaped values", () => {
  const event = sourceHistoryEventFromImportReport({
    provider: "fidelity",
    fileName: "/Users/tucker/Portfolio_Positions_123456789.csv?api_key=raw-secret",
    importedAt: "2026-05-31T12:00:00.000Z",
    rowsParsed: 10,
    holdingsImported: 7,
    rejectedRows: [
      { classification: "non-holding row", raw: "footer" },
      { classification: "needs review", raw: "account 987654321" }
    ],
    accountsDetected: ["Roth IRA 123456789"],
    tickersDetected: ["MU", "UPRO"],
    totalMarketValue: 12345.67,
    health: {
      status: "Partial success",
      message: "Imported with warning client_secret=do-not-store-this-value"
    }
  }, {
    provider: "Fidelity",
    activePortfolioSource: true
  });

  const visible = JSON.stringify(event);
  assert.equal(event.type, SOURCE_HISTORY_EVENT_TYPES.PORTFOLIO_IMPORT);
  assert.equal(event.status, "warning");
  assert.equal(event.rowsParsed, 10);
  assert.equal(event.acceptedRows, 7);
  assert.equal(event.skippedRows, 1);
  assert.equal(event.reviewRows, 1);
  assert.equal(event.accountsCount, 1);
  assert.equal(event.tickersCount, 2);
  assert.equal(event.activePortfolioSource, true);
  assert.match(event.fileName, /Portfolio_Positions_masked-6789\.csv/);
  assert.doesNotMatch(visible, /raw-secret|do-not-store|123456789|987654321/);
});

test("source history normalizes, sorts, limits, and clears prior active source when a new source is active", () => {
  const imported = buildSourceHistoryEvent(SOURCE_HISTORY_EVENT_TYPES.PORTFOLIO_IMPORT, {
    label: "First import",
    timestamp: "2026-05-30T12:00:00.000Z",
    activePortfolioSource: true,
    status: "success"
  });
  const sample = buildSourceHistoryEvent(SOURCE_HISTORY_EVENT_TYPES.SAMPLE_LOAD, {
    label: "Sample portfolio loaded",
    timestamp: "2026-05-31T12:00:00.000Z",
    activePortfolioSource: true,
    status: "info"
  });
  const reset = buildSourceHistoryEvent(SOURCE_HISTORY_EVENT_TYPES.PORTFOLIO_RESET, {
    label: "Portfolio reset",
    timestamp: "2026-06-01T12:00:00.000Z",
    status: "info"
  });

  const withSample = appendSourceHistoryEvent(appendSourceHistoryEvent([], imported), sample);
  assert.equal(withSample[0].label, "Sample portfolio loaded");
  assert.equal(withSample[0].activePortfolioSource, true);
  assert.equal(withSample[1].activePortfolioSource, false);

  const withReset = appendSourceHistoryEvent(withSample, reset);
  assert.equal(withReset[0].type, SOURCE_HISTORY_EVENT_TYPES.PORTFOLIO_RESET);
  assert.equal(withReset.some((event) => event.activePortfolioSource), false);

  const many = Array.from({ length: 5 }, (_, index) => buildSourceHistoryEvent(SOURCE_HISTORY_EVENT_TYPES.PROVIDER_SYNC, {
    label: `Event ${index}`,
    timestamp: `2026-05-2${index}T12:00:00.000Z`
  }));
  const limited = normalizeSourceHistory(many, { limit: 3 });
  assert.equal(limited.length, 3);
  assert.deepEqual(limited.map((event) => event.label), ["Event 4", "Event 3", "Event 2"]);
});

test("provider sync and market data refresh events keep safe provider status metadata", () => {
  const sync = sourceHistoryEventFromProviderSync({
    provider: "Plaid Fidelity",
    sourceType: "plaid",
    sourceMode: "Live",
    timestamp: "2026-05-31T13:00:00.000Z",
    providerStatus: "plaid-live",
    detail: "Synced; access_token=do-not-store",
    acceptedRows: 41,
    holdingsCount: 41,
    accountsCount: 4,
    activePortfolioSource: true
  });
  const market = sourceHistoryEventFromMarketDataStatus({
    status: "partial data",
    label: "Finnhub partial data",
    providerLabel: "Finnhub",
    dataFreshness: "cached",
    fetchedAt: "2026-05-31T13:05:00.000Z",
    quoteCount: 35,
    missingQuoteCount: 6,
    requestedTickers: ["MU", "NVDA", "UPRO"]
  });

  assert.equal(sync.status, "success");
  assert.equal(sync.acceptedRows, 41);
  assert.equal(sync.activePortfolioSource, true);
  assert.doesNotMatch(JSON.stringify(sync), /do-not-store/);
  assert.equal(market.type, SOURCE_HISTORY_EVENT_TYPES.MARKET_DATA_REFRESH);
  assert.equal(market.status, "warning");
  assert.equal(market.acceptedRows, 35);
  assert.equal(market.skippedRows, 6);
  assert.equal(market.tickersCount, 3);
  assert.equal(sourceHistorySummary([sync, market]).active.id, sync.id);
});
