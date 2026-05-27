import test from "node:test";
import assert from "node:assert/strict";

import {
  DATA_MODES,
  dataModeLabel,
  marketDataMode,
  normalizeDataMode,
  portfolioDataMode,
  sourceDataMode
} from "../src/dataModes.js";

test("data mode labels use the standardized user-facing vocabulary", () => {
  assert.equal(dataModeLabel(DATA_MODES.SAMPLE), "Sample");
  assert.equal(dataModeLabel(DATA_MODES.IMPORTED), "Imported");
  assert.equal(dataModeLabel(DATA_MODES.LIVE), "Live");
  assert.equal(dataModeLabel(DATA_MODES.CACHED), "Cached");
  assert.equal(dataModeLabel(DATA_MODES.STALE), "Stale");
  assert.equal(dataModeLabel(DATA_MODES.PARTIAL), "Partial data");
  assert.equal(dataModeLabel(DATA_MODES.RATE_LIMITED), "Rate limited");
  assert.equal(dataModeLabel(DATA_MODES.ERROR), "Error");
  assert.equal(dataModeLabel(DATA_MODES.NOT_CONFIGURED), "Not configured");
});

test("legacy source strings normalize into canonical data modes", () => {
  assert.equal(normalizeDataMode("mock/sample mode"), DATA_MODES.SAMPLE);
  assert.equal(normalizeDataMode("Demo scenario"), DATA_MODES.SAMPLE);
  assert.equal(normalizeDataMode("Imported local data"), DATA_MODES.IMPORTED);
  assert.equal(normalizeDataMode("connected"), DATA_MODES.LIVE);
  assert.equal(normalizeDataMode("cached provider data"), DATA_MODES.CACHED);
  assert.equal(normalizeDataMode("stale data"), DATA_MODES.STALE);
  assert.equal(normalizeDataMode("Provider error"), DATA_MODES.ERROR);
  assert.equal(normalizeDataMode("configured-not-connected"), DATA_MODES.NOT_CONFIGURED);
  assert.equal(normalizeDataMode("live-ready"), DATA_MODES.NOT_CONFIGURED);
  assert.equal(normalizeDataMode("quote missing"), DATA_MODES.PARTIAL);
});

test("portfolio mode transitions distinguish no data, sample, imported, and import error", () => {
  assert.equal(portfolioDataMode({ uiState: "NO_DATA" }), DATA_MODES.NO_DATA);
  assert.equal(portfolioDataMode({ uiState: "SAMPLE_MODE" }), DATA_MODES.SAMPLE);
  assert.equal(portfolioDataMode({ uiState: "IMPORTED_CLEAN" }), DATA_MODES.IMPORTED);
  assert.equal(portfolioDataMode({ uiState: "IMPORTED_WITH_SKIPPED_ROWS" }), DATA_MODES.IMPORTED);
  assert.equal(portfolioDataMode({ uiState: "IMPORT_FAILED" }), DATA_MODES.ERROR);
});

test("market data mode transitions distinguish live, cached, stale, error, sample, and not configured", () => {
  assert.equal(marketDataMode({ status: "connected", dataFreshness: "live" }), DATA_MODES.LIVE);
  assert.equal(marketDataMode({ status: "connected", dataFreshness: "cached" }), DATA_MODES.CACHED);
  assert.equal(marketDataMode({ status: "cached" }), DATA_MODES.CACHED);
  assert.equal(marketDataMode({ status: "stale data" }), DATA_MODES.STALE);
  assert.equal(marketDataMode({ status: "partial data" }), DATA_MODES.PARTIAL);
  assert.equal(marketDataMode({ status: "rate limited" }), DATA_MODES.RATE_LIMITED);
  assert.equal(marketDataMode({ status: "missing" }), DATA_MODES.PARTIAL);
  assert.equal(marketDataMode({ status: "error" }), DATA_MODES.ERROR);
  assert.equal(marketDataMode({ status: "mock/sample mode" }), DATA_MODES.SAMPLE);
  assert.equal(marketDataMode({ status: "configured-not-connected" }), DATA_MODES.NOT_CONFIGURED);
});

test("generic source status helper keeps imported, live, cached, stale, error, and not-configured honest", () => {
  assert.equal(sourceDataMode({ connected: true }), DATA_MODES.LIVE);
  assert.equal(sourceDataMode({ mode: "local-file" }), DATA_MODES.IMPORTED);
  assert.equal(sourceDataMode({ dataFreshness: "cached" }), DATA_MODES.CACHED);
  assert.equal(sourceDataMode({ mode: "reddit-api", dataFreshness: "stale", liveProviderCalls: true }), DATA_MODES.STALE);
  assert.equal(sourceDataMode({ mode: "public-static-dataset", cacheStatus: "cached", liveProviderCalls: true }), DATA_MODES.CACHED);
  assert.equal(sourceDataMode({ status: "stale" }), DATA_MODES.STALE);
  assert.equal(sourceDataMode({ status: "error" }), DATA_MODES.ERROR);
  assert.equal(sourceDataMode({ configuredPending: true }), DATA_MODES.NOT_CONFIGURED);
});
