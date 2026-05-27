import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPortfolioEvents,
  defaultCalendarEvents,
  eventsForTicker,
  filterCalendarEvents,
  importCalendarEventFile,
  normalizeCalendarEvent,
  summarizeCalendarEvents,
  upcomingCalendarEvents
} from "../src/eventCalendar.js";

const asOf = "2026-05-24T09:00:00-04:00";

test("calendar events normalize source, type, tickers, and importance", () => {
  const event = normalizeCalendarEvent({
    ticker: "mu",
    tickers: "SOXL, NVDA",
    type: "earnings date",
    date: "2026-06-03",
    title: "MU review",
    severity: "critical",
    sourceMode: "local-file"
  }, { asOf });

  assert.equal(event.ticker, "MU");
  assert.deepEqual(event.tickers, ["MU", "SOXL", "NVDA"]);
  assert.equal(event.eventType, "earnings");
  assert.equal(event.importance, "high");
  assert.equal(event.sourceMode, "imported");
  assert.equal(event.sourceLabel, "Imported event");
});

test("portfolio events combine mock, holding, thesis, and watchlist dates without hiding source labels", () => {
  const rows = buildPortfolioEvents({
    calendarEvents: defaultCalendarEvents(asOf).slice(0, 1),
    holdings: [{ ticker: "MU", nextEarnings: "2026-06-12", source: "csv", sourceAsOf: "2026-05-22" }],
    watchlistIdeas: [{ ticker: "CRDO", nextEventDate: "2026-06-05", nextEventTitle: "CRDO catalyst check", catalyst: "AI networking demand" }],
    thesisRows: [{ ticker: "NVDA", earningsDate: "2026-06-01", nextReviewTrigger: "Check capex guide" }],
    asOf
  });

  assert.ok(rows.some((event) => event.sourceMode === "mock"));
  assert.ok(rows.some((event) => event.sourceMode === "imported" && event.sourceLabel === "Imported holding field"));
  assert.ok(rows.some((event) => event.sourceMode === "manual" && event.sourceLabel === "Watchlist note"));
  assert.ok(rows.some((event) => event.sourceMode === "manual" && event.sourceLabel === "Thesis tracker"));
  assert.deepEqual(eventsForTicker(rows, "MU").map((event) => event.ticker).filter(Boolean), ["MU", "MU"]);
});

test("upcoming event sorting, filtering, and summary are deterministic", () => {
  const rows = [
    { ticker: "SOXL", tickers: ["SOXL"], eventType: "custom", date: "2026-06-20", title: "Later event", importance: "low", sourceMode: "manual", sourceLabel: "Manual", detectedAt: asOf },
    { ticker: "MU", tickers: ["MU"], eventType: "earnings", date: "2026-05-27", title: "Near event", importance: "high", sourceMode: "imported", sourceLabel: "Import", detectedAt: asOf },
    { ticker: "NVDA", tickers: ["NVDA"], eventType: "product-event", date: "2026-05-30", title: "Product event", importance: "medium", sourceMode: "mock", sourceLabel: "Mock", detectedAt: asOf }
  ];

  assert.deepEqual(upcomingCalendarEvents(rows, { asOf, daysAhead: 30 }).map((event) => event.ticker), ["MU", "NVDA", "SOXL"]);
  assert.deepEqual(filterCalendarEvents(rows, { ticker: "NVDA", eventType: "product-event", importance: "medium", sourceMode: "mock", windowDays: "30" }, { asOf }).map((event) => event.ticker), ["NVDA"]);
  assert.deepEqual(summarizeCalendarEvents(rows, { asOf }), {
    total: 3,
    upcoming45: 3,
    next7: 2,
    highImportance: 1,
    mockCount: 1,
    importedCount: 1,
    manualCount: 1,
    nextEvent: upcomingCalendarEvents(rows, { asOf, daysAhead: 45 })[0]
  });
});

test("calendar CSV/JSON import validates rows without live data claims", () => {
  const csv = [
    "ticker,event type,date,title,importance,source url",
    "MU,earnings,2026-06-26,MU imported earnings,high,https://example.com/mu",
    ",custom,,Bad row,medium,"
  ].join("\n");
  const result = importCalendarEventFile(csv, { fileName: "calendar.csv", asOf });

  assert.equal(result.partial, true);
  assert.equal(result.eventsImported, 1);
  assert.equal(result.records[0].sourceMode, "imported");
  assert.equal(result.records[0].sourceLabel, "Imported calendar file");
  assert.equal(result.rejectedRows.length, 1);
  assert.match(JSON.stringify(result), /Imported calendar file/);
  assert.doesNotMatch(JSON.stringify(result), /\blive earnings\b/i);

  const json = importCalendarEventFile(JSON.stringify({ events: [{ ticker: "UPRO", eventType: "fed-macro", date: "2026-06-01", title: "Fed placeholder", importance: "high" }] }), { fileName: "events.json", asOf });
  assert.equal(json.ok, true);
  assert.equal(json.records[0].eventType, "fed-macro");
});

test("calendar rejected rows redact secret-shaped debug values", () => {
  const result = importCalendarEventFile(JSON.stringify({
    events: [{
      ticker: "",
      eventType: "earnings",
      date: "",
      title: "Bad event access_token=do-not-store-token client_secret=do-not-store-secret",
      cookie: "session=do-not-store-cookie",
      authorization: "Bearer do-not-store-bearer"
    }]
  }), { fileName: "bad-events.json", asOf });

  const visibleReport = JSON.stringify(result.rejectedRows);
  assert.equal(result.ok, false);
  assert.equal(result.rejectedRows.length, 1);
  assert.equal(visibleReport.includes("do-not-store-token"), false);
  assert.equal(visibleReport.includes("do-not-store-secret"), false);
  assert.equal(visibleReport.includes("do-not-store-cookie"), false);
  assert.equal(visibleReport.includes("do-not-store-bearer"), false);
});
