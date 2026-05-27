import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPoliticianTradeProviderConfig,
  createPoliticianTradeProvider,
  DEFAULT_POLITICIAN_TRADE_SOURCE_URL,
  demoPoliticianTrades,
  exportPoliticianTrades,
  fetchPublicPoliticianTradeDataset,
  fetchRawPoliticianTrades,
  importPoliticianTradeFile,
  loadPoliticianTrades,
  mockPoliticianTradeRows,
  normalizePoliticianTradeRecord,
  normalizePoliticianTrades,
  politicianTradeProviderStatuses,
  politicianTradesForTicker,
  savePoliticianTrades,
  validatePoliticianTradeRecord,
  validatePoliticianTrades
} from "../src/politicianTrades.js";

test("mock politician trade fetch never makes live calls", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = () => {
    fetchCalled = true;
    throw new Error("network should not be called");
  };

  try {
    const dataset = await fetchRawPoliticianTrades();
    const live = await fetchRawPoliticianTrades({ source: "live" });

    assert.equal(fetchCalled, false);
    assert.equal(dataset.mode, "mock");
    assert.equal(dataset.liveProviderCalls, false);
    assert.ok(dataset.warnings.some((warning) => /Sample politician trade data/i.test(warning)));
    assert.ok(dataset.records.length >= 3);
    assert.ok(dataset.records.every((record) => /example\.test/.test(record.source_url)));
    assert.equal(live.mode, "not-implemented");
    assert.equal(live.liveProviderCalls, false);
    assert.deepEqual(live.records, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("politician trade provider interface exposes mock, local-file, and future safe providers", async () => {
  const mock = createPoliticianTradeProvider("mock");
  const local = createPoliticianTradeProvider("local-file");
  const futureApi = createPoliticianTradeProvider("future-api");
  const officialParser = createPoliticianTradeProvider("official-disclosure-parser");
  const futureResult = await futureApi.fetchRawTrades();
  const statuses = politicianTradeProviderStatuses();

  assert.equal(mock.liveProviderCalls, false);
  assert.equal(typeof mock.fetchRawTrades, "function");
  assert.equal(local.liveProviderCalls, false);
  assert.equal(typeof local.importText, "function");
  assert.equal(futureApi.mode, "not-implemented");
  assert.equal(officialParser.mode, "not-implemented");
  assert.equal(futureResult.liveProviderCalls, false);
  assert.deepEqual(futureResult.records, []);
  assert.equal(statuses.localFile.status, "ready");
  assert.equal(statuses.futureApi.liveEnabled, false);
});

test("politician trade provider config keeps public dataset off until explicitly enabled", () => {
  const missing = buildPoliticianTradeProviderConfig({
    POLITICIAN_TRADES_PROVIDER: "senate-stock-watcher"
  }, {
    defaultSourceUrl: "https://example.test/senate-stock-watcher.json"
  });
  const configured = buildPoliticianTradeProviderConfig({
    POLITICIAN_TRADES_PROVIDER: "senate-stock-watcher",
    POLITICIAN_TRADES_LIVE_ENABLED: "true"
  }, {
    defaultSourceUrl: "https://example.test/senate-stock-watcher.json"
  });
  const statuses = politicianTradeProviderStatuses({
    POLITICIAN_TRADES_PROVIDER: "senate-stock-watcher",
    POLITICIAN_TRADES_LIVE_ENABLED: "true"
  }, {
    defaultSourceUrl: "https://example.test/senate-stock-watcher.json"
  });

  assert.equal(missing.configured, false);
  assert.equal(missing.liveProviderCalls, false);
  assert.deepEqual(missing.missingEnv, ["POLITICIAN_TRADES_LIVE_ENABLED"]);
  assert.equal(configured.configured, true);
  assert.equal(configured.liveProviderCalls, true);
  assert.equal(configured.usesDefaultSourceUrl, true);
  assert.equal(statuses.senateStockWatcher.configured, true);
  assert.equal(statuses.senateStockWatcher.liveProviderCalls, true);
  assert.match(configured.sourceCoverage, /Senate PTR rows only/);
  assert.match(configured.sourceRecommendation, /Do not scrape/);
});

test("politician trade provider config uses default public source when source URL is blank", () => {
  const config = buildPoliticianTradeProviderConfig({
    POLITICIAN_TRADES_PROVIDER: "senate-stock-watcher",
    POLITICIAN_TRADES_LIVE_ENABLED: "true",
    POLITICIAN_TRADES_SOURCE_URL: " "
  }, {
    defaultSourceUrl: DEFAULT_POLITICIAN_TRADE_SOURCE_URL
  });

  assert.equal(config.configured, true);
  assert.equal(config.usesDefaultSourceUrl, true);
  assert.deepEqual(config.missingEnv, []);
});

test("public politician trade provider stays disabled without live flag and never calls fetch", async () => {
  let calls = 0;
  const provider = createPoliticianTradeProvider("senate-stock-watcher", {
    sourceUrl: "https://example.test/senate-stock-watcher.json",
    liveEnabled: false,
    fetchImpl() {
      calls += 1;
      throw new Error("fetch should not be called");
    }
  });
  const result = await provider.fetchRawTrades();

  assert.equal(calls, 0);
  assert.equal(provider.liveProviderCalls, false);
  assert.equal(result.setupRequired, true);
  assert.equal(result.liveProviderCalls, false);
  assert.deepEqual(result.records, []);
});

test("public politician trade provider stays disabled without a source URL and never calls fetch", async () => {
  let calls = 0;
  const provider = createPoliticianTradeProvider("senate-stock-watcher", {
    liveEnabled: true,
    fetchImpl() {
      calls += 1;
      throw new Error("fetch should not be called without a source URL");
    }
  });
  const result = await provider.fetchRawTrades();

  assert.equal(calls, 0);
  assert.equal(provider.liveProviderCalls, false);
  assert.equal(result.configured, false);
  assert.equal(result.setupRequired, true);
  assert.equal(result.liveProviderCalls, false);
  assert.deepEqual(result.records, []);
  assert.match(result.warnings[0], /source URL is missing/i);
});

test("public politician trade provider normalizes Senate Stock Watcher daily summary payloads", async () => {
  const payload = [{
    first_name: "Jane",
    last_name: "Doe",
    office: "Doe, Jane (Senator)",
    ptr_link: "https://example.test/ptr/jane-doe",
    date_recieved: "05/20/2026",
    bioguide: "D000001",
    transactions: [{
      transaction_date: "05/01/2026",
      owner: "Self",
      ticker: "MU",
      asset_description: "Micron Technology, Inc.",
      asset_type: "Stock",
      type: "Purchase",
      amount: "$15,001 - $50,000",
      comment: "--"
    }]
  }];
  const result = await fetchPublicPoliticianTradeDataset({
    sourceUrl: "https://example.test/senate-stock-watcher.json",
    liveEnabled: true,
    asOf: "2026-05-24T12:00:00-04:00",
    fetchImpl: async () => mockResponse(payload),
    limit: 10
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, "public-static-dataset");
  assert.equal(result.liveProviderCalls, true);
  assert.equal(result.tradesImported, 1);
  assert.equal(result.records[0].ticker, "MU");
  assert.equal(result.records[0].politicianName, "Jane Doe");
  assert.equal(result.records[0].chamber, "Senate");
  assert.equal(result.records[0].party, "Unknown");
  assert.equal(result.records[0].state, "Unknown");
  assert.equal(result.records[0].transactionDate, "2026-05-01");
  assert.equal(result.records[0].disclosureDate, "2026-05-20");
  assert.equal(result.records[0].sourceMode, "public-static-dataset");
  assert.equal(result.records[0].providerId, "senate-stock-watcher-public-dataset");
  assert.equal(result.records[0].sourceUrl, "https://example.test/ptr/jane-doe");
  assert.equal(result.records[0].amountRangeLow, 15001);
  assert.equal(result.records[0].amountRangeHigh, 50000);
  assert.match(result.records[0].notes, /Public disclosure dataset row/);
  assert.match(result.sourceCoverage, /Senate PTR rows only/);
});

test("public politician trade provider normalizes flat Senate Stock Watcher rows", async () => {
  const result = await fetchPublicPoliticianTradeDataset({
    sourceUrl: "https://example.test/senate-stock-watcher.json",
    liveEnabled: true,
    asOf: "2026-05-24T12:00:00-04:00",
    fetchImpl: async () => mockResponse([{
      first_name: "Alex",
      last_name: "Smith",
      office: "Smith, Alex (Senator)",
      ptr_link: "https://example.test/ptr/alex-smith",
      date_recieved: "05/20/2026",
      transaction_date: "05/01/2026",
      owner: "Self",
      ticker: "AMD",
      asset_description: "Advanced Micro Devices, Inc.",
      type: "Sale (Partial)",
      amount: "$1,001 - $15,000",
      bioguide: "S000001"
    }])
  });

  assert.equal(result.ok, true);
  assert.equal(result.records[0].politicianName, "Alex Smith");
  assert.equal(result.records[0].transactionType, "sale");
  assert.equal(result.records[0].providerId, "senate-stock-watcher-public-dataset");
  assert.match(result.records[0].providerRecordId, /S000001/);
});

test("public politician trade provider rejects malformed provider records without fabricating rows", async () => {
  const result = await fetchPublicPoliticianTradeDataset({
    sourceUrl: "https://example.test/senate-stock-watcher.json?token=provider-token-value-123456789",
    liveEnabled: true,
    asOf: "2026-05-24T12:00:00-04:00",
    fetchImpl: async () => mockResponse([{
      first_name: "Missing",
      last_name: "Ticker",
      office: "Ticker, Missing (Senator)",
      ptr_link: "https://example.test/ptr/missing-ticker?api_key=row-token-value-123456789",
      api_key: "row-api-key-value-123456789",
      date_recieved: "05/20/2026",
      transactions: [{
        transaction_date: "05/01/2026",
        owner: "Self",
        ticker: "--",
        asset_description: "Unknown asset",
        type: "Purchase",
        amount: "$1,001 - $15,000"
      }]
    }])
  });

  assert.equal(result.ok, false);
  assert.equal(result.records.length, 0);
  assert.equal(result.rejectedRows.length, 1);
  assert.match(result.rejectedRows[0].reason, /ticker must be a valid exchange symbol/);
  assert.equal(JSON.stringify(result).includes("provider-token-value-123456789"), false);
  assert.equal(JSON.stringify(result).includes("row-token-value-123456789"), false);
  assert.equal(JSON.stringify(result).includes("row-api-key-value-123456789"), false);
});

test("public politician trade provider handles provider failures without leaking URL tokens", async () => {
  const result = await fetchPublicPoliticianTradeDataset({
    sourceUrl: "https://example.test/disclosures?token=secret-token-value-123456789",
    liveEnabled: true,
    fetchImpl: async () => mockResponse({ error: "rate limited" }, 429, "Limit for token=secret-token-value-123456789")
  });

  assert.equal(result.ok, false);
  assert.equal(result.liveProviderCalls, true);
  assert.equal(result.status, "rate limited");
  assert.equal(result.httpStatus, 429);
  assert.equal(result.dataFreshness, "rate limited");
  assert.match(result.warnings[0], /HTTP 429/);
  assert.equal(JSON.stringify(result).includes("secret-token-value-123456789"), false);
});

test("politician trade CSV import normalizes common disclosure columns", () => {
  const csv = `Politician Name,Chamber,Party,State,Symbol,Asset Name,Transaction Type,Transaction Date,Disclosure Date,Amount,Owner,Source URL
Rep Example,House,D,CA,MU,Micron Technology Inc,Purchase,2026-05-01,2026-05-12,"$1,001 - $15,000",Self,https://example.test/disclosures/mu-import
Sen Example,Senate,R,TX,NVDA,NVIDIA Corporation,Sale,2026-05-03,2026-05-14,"$15,001 - $50,000",Spouse,https://example.test/disclosures/nvda-import`;
  const result = importPoliticianTradeFile(csv, {
    fileName: "congress-trades.csv",
    asOf: "2026-05-23T12:00:00-04:00"
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, "local-file");
  assert.equal(result.fileType, "csv");
  assert.equal(result.rowsParsed, 2);
  assert.equal(result.tradesImported, 2);
  assert.deepEqual(result.tickersDetected, ["MU", "NVDA"]);
  assert.equal(result.records[0].ticker, "MU");
  assert.equal(result.records[0].amountRangeLow, 1001);
  assert.equal(result.records[0].amountRangeHigh, 15000);
  assert.equal(result.records[0].sourceMode, "local-file");
  assert.equal(result.records[0].providerId, "local-politician-trade-file");
  assert.equal(result.records[0].liveProviderCalls, false);
  assert.match(result.records[0].notes, /Local imported disclosure/);
});

test("politician trade JSON import accepts bundle and preserves ticker matching", () => {
  const payload = {
    politicianTrades: [{
      politicianName: "Rep JSON",
      chamber: "House",
      party: "I",
      state: "VA",
      ticker: "AMD",
      assetName: "Advanced Micro Devices",
      transactionType: "Purchase",
      transactionDate: "2026-05-02",
      disclosureDate: "2026-05-13",
      amountRange: { min: 1001, max: 15000 },
      owner: "Joint",
      sourceUrl: "https://example.test/disclosures/amd-json"
    }]
  };
  const result = importPoliticianTradeFile(JSON.stringify(payload), {
    fileName: "politician-trades.json",
    asOf: "2026-05-23T12:00:00-04:00"
  });
  const matches = politicianTradesForTicker(result.records, "amd");

  assert.equal(result.ok, true);
  assert.equal(result.fileType, "json");
  assert.equal(result.tradesImported, 1);
  assert.equal(result.records[0].ticker, "AMD");
  assert.deepEqual(result.records[0].amountRange, { min: 1001, max: 15000 });
  assert.equal(matches.length, 1);
  assert.equal(matches[0].politicianName, "Rep JSON");
});

test("politician trade import rejects malformed rows with useful errors", () => {
  const csv = `Politician Name,Chamber,Party,State,Symbol,Asset Name,Transaction Type,Transaction Date,Disclosure Date,Amount,Owner,Source URL,API Token
,House,D,CA,,Micron Technology Inc,Gift,not-a-date,,bad amount,,https://example.test/disclosures?token=local-token-value-123456789,local-api-key-value-123456789`;
  const result = importPoliticianTradeFile(csv, {
    fileName: "bad-trades.csv",
    asOf: "2026-05-23T12:00:00-04:00"
  });

  assert.equal(result.ok, false);
  assert.equal(result.tradesImported, 0);
  assert.equal(result.rejectedRows.length, 1);
  assert.equal(result.rejectedRows[0].rowNumber, 2);
  assert.match(result.rejectedRows[0].reason, /politicianName is required/);
  assert.match(result.rejectedRows[0].reason, /ticker is required/);
  assert.ok(result.missingFields.includes("politicianName"));
  assert.ok(result.missingFields.includes("ticker"));
  assert.equal(JSON.stringify(result).includes("local-token-value-123456789"), false);
  assert.equal(JSON.stringify(result).includes("local-api-key-value-123456789"), false);
});

test("politician trade normalization preserves dates, range, and scoring placeholders", () => {
  const trade = normalizePoliticianTradeRecord({
    politician_name: "Demo Member",
    chamber: "House",
    party: "D",
    state: "NY",
    ticker: "nvda",
    asset_name: "NVIDIA Corporation",
    transaction_type: "Purchase",
    transaction_date: "2026-05-10",
    disclosure_date: "2026-05-21",
    amount_low: "$1,001",
    amount_high: "$15,000",
    owner: "Self",
    source_url: "https://example.test/disclosure",
    committees: ["Technology placeholder"]
  }, { asOf: "2026-05-23T12:00:00-04:00" });

  assert.equal(trade.ticker, "NVDA");
  assert.equal(trade.transactionType, "purchase");
  assert.equal(trade.transactionDate, "2026-05-10");
  assert.equal(trade.disclosureDate, "2026-05-21");
  assert.equal(trade.amountRangeLow, 1001);
  assert.equal(trade.amountRangeHigh, 15000);
  assert.deepEqual(trade.amountRange, { min: 1001, max: 15000 });
  assert.equal(trade.owner, "Self");
  assert.equal(trade.recencyScore, 1);
  assert.equal(trade.sizeScore, 0.22);
  assert.equal(trade.committeeRelevanceScore, 0.5);
  assert.match(trade.committeeRelevancePlaceholder, /Placeholder/);
  assert.match(trade.notes, /Sample disclosure row/);
});

test("politician trade batch normalization adds cluster placeholders", () => {
  const rows = normalizePoliticianTrades([
    ...mockPoliticianTradeRows(),
    { ...mockPoliticianTradeRows()[0], politician_name: "Another Demo Representative" }
  ]);
  const nvdaRows = rows.filter((row) => row.ticker === "NVDA");

  assert.equal(nvdaRows.length, 2);
  assert.ok(nvdaRows.every((row) => row.clusterScore === 0.45));
  assert.ok(nvdaRows.every((row) => /same-ticker/.test(row.clusterScorePlaceholder)));
});

test("politician trade validation rejects malformed rows", () => {
  const result = validatePoliticianTradeRecord({
    id: "",
    politicianName: "",
    chamber: "",
    party: "",
    state: "",
    ticker: "",
    assetName: "",
    transactionType: "gift",
    transactionDate: "",
    disclosureDate: "",
    disclosedAt: "",
    amountRangeLow: 50000,
    amountRangeHigh: 1000,
    owner: "",
    office: "",
    sourceUrl: "not-a-url",
    sourceType: "rumor",
    confidenceScore: 1.5,
    recencyScore: 1.4,
    sizeScore: -1,
    committeeRelevanceScore: 0.2,
    clusterScore: 0.2
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("id")));
  assert.ok(result.errors.some((error) => error.includes("politicianName")));
  assert.ok(result.errors.some((error) => error.includes("chamber")));
  assert.ok(result.errors.some((error) => error.includes("office")));
  assert.ok(result.errors.some((error) => error.includes("transactionType")));
  assert.ok(result.errors.some((error) => error.includes("disclosedAt")));
  assert.ok(result.errors.some((error) => error.includes("sourceType")));
  assert.ok(result.errors.some((error) => error.includes("amountRange must be an object")));
  assert.ok(result.errors.some((error) => error.includes("amountRangeLow cannot exceed amountRangeHigh")));
  assert.ok(result.errors.some((error) => error.includes("confidenceScore")));
  assert.ok(result.errors.some((error) => error.includes("recencyScore")));
  assert.ok(result.errors.some((error) => error.includes("sizeScore")));
  assert.ok(result.warnings.some((warning) => warning.includes("sourceUrl should be an absolute HTTP(S) URL")));
});

test("politician trade validation enforces amount range object consistency", () => {
  const trade = normalizePoliticianTradeRecord(mockPoliticianTradeRows()[0], { asOf: "2026-05-23T12:00:00-04:00" });
  const missingRange = validatePoliticianTradeRecord({ ...trade, amountRange: undefined });
  const mismatchedRange = validatePoliticianTradeRecord({ ...trade, amountRange: { min: 10, max: 20 } });

  assert.equal(missingRange.ok, false);
  assert.ok(missingRange.errors.some((error) => error.includes("amountRange must be an object")));
  assert.equal(mismatchedRange.ok, false);
  assert.ok(mismatchedRange.errors.some((error) => error.includes("amountRangeLow must match amountRange.min")));
  assert.ok(mismatchedRange.errors.some((error) => error.includes("amountRangeHigh must match amountRange.max")));
});

test("politician trade export and storage stay local-safe", () => {
  const trades = demoPoliticianTrades();
  const validation = validatePoliticianTrades(trades);
  const exported = exportPoliticianTrades(trades);
  const storage = new Map();
  const localStorageLike = {
    setItem: (key, value) => storage.set(key, value),
    getItem: (key) => storage.get(key)
  };

  assert.equal(validation.ok, true);
  assert.equal(exported.safety.includesPasswords, false);
  assert.equal(exported.safety.includesApiKeys, false);
  assert.equal(exported.safety.liveProviderCalls, false);
  assert.equal(savePoliticianTrades(localStorageLike, trades), true);
  assert.equal(loadPoliticianTrades(localStorageLike).length, trades.length);
  const liveProviderTrade = {
    ...trades[0],
    sourceMode: "public-static-dataset",
    providerId: "senate-stock-watcher-public-dataset",
    dataFreshness: "fresh",
    liveProviderCalls: true
  };
  const liveProviderExport = exportPoliticianTrades([liveProviderTrade]);
  assert.equal(liveProviderExport.safety.liveProviderCalls, false);
  assert.equal(liveProviderExport.politicianTrades[0].liveProviderCalls, false);
  assert.equal(liveProviderExport.politicianTrades[0].cacheStatus, "cached");
  const providerStorage = new Map();
  const providerStorageLike = {
    setItem: (key, value) => providerStorage.set(key, value),
    getItem: (key) => providerStorage.get(key)
  };
  assert.equal(savePoliticianTrades(providerStorageLike, [liveProviderTrade]), true);
  const persistedProviderRows = JSON.parse([...providerStorage.values()][0]);
  assert.equal(persistedProviderRows[0].liveProviderCalls, false);
  assert.equal(persistedProviderRows[0].cacheStatus, "cached");
  const loadedProviderRows = loadPoliticianTrades(providerStorageLike);
  assert.equal(loadedProviderRows[0].liveProviderCalls, false);
  assert.equal(loadedProviderRows[0].cacheStatus, "cached");
  assert.equal(loadPoliticianTrades(null).length >= 3, true);
  assert.equal(savePoliticianTrades({ setItem() { throw new Error("QuotaExceededError"); } }, trades), false);
});

function mockResponse(payload, status = 200, textOverride = null) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => textOverride ?? JSON.stringify(payload)
  };
}
