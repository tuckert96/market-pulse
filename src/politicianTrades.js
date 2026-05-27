import { normalizeTicker, numberFrom } from "./portfolioSchema.js";

export const POLITICIAN_TRADE_STORAGE_KEY = "growthDashboardPoliticianTrades";
export const DEFAULT_POLITICIAN_TRADE_SOURCE_URL = "https://raw.githubusercontent.com/timothycarambat/senate-stock-watcher-data/master/aggregate/all_daily_summaries.json";

const TRANSACTION_TYPES = new Set(["purchase", "sale", "exchange", "unknown"]);
const SOURCE_TYPES = new Set(["disclosure", "filing", "provider"]);
export const POLITICIAN_TRADE_PROVIDER_TYPES = Object.freeze({
  MOCK: "mock",
  LOCAL_FILE: "local-file",
  PUBLIC_STATIC_DATASET: "public-static-dataset",
  SENATE_STOCK_WATCHER: "senate-stock-watcher",
  FUTURE_API: "future-api",
  OFFICIAL_DISCLOSURE_PARSER: "official-disclosure-parser"
});
export const POLITICIAN_TRADE_SOURCE_RECOMMENDATION = Object.freeze({
  providerType: POLITICIAN_TRADE_PROVIDER_TYPES.SENATE_STOCK_WATCHER,
  providerId: "senate-stock-watcher-public-dataset",
  label: "Senate Stock Watcher public static dataset",
  sourceUrl: DEFAULT_POLITICIAN_TRADE_SOURCE_URL,
  primarySource: "U.S. Senate eFD public financial disclosure database",
  coverage: "Senate PTR rows only; House disclosures require local import or a separately approved provider.",
  recommendation: "Use this existing config-gated local-backend static JSON path for automatic Senate disclosure sync. Do not scrape official disclosure sites."
});

export function buildPoliticianTradeProviderConfig(env = {}, options = {}) {
  const selectedProvider = normalizeProviderName(env.POLITICIAN_TRADES_PROVIDER || env.POLITICIAN_TRADE_PROVIDER || POLITICIAN_TRADE_PROVIDER_TYPES.MOCK);
  const liveEnabled = truthy(env.POLITICIAN_TRADES_LIVE_ENABLED || env.POLITICIAN_TRADE_LIVE_ENABLED);
  const sourceUrlConfigured = Boolean(stringFrom(env.POLITICIAN_TRADES_SOURCE_URL || env.POLITICIAN_TRADE_SOURCE_URL));
  const supportsLive = selectedProvider === POLITICIAN_TRADE_PROVIDER_TYPES.SENATE_STOCK_WATCHER ||
    selectedProvider === POLITICIAN_TRADE_PROVIDER_TYPES.PUBLIC_STATIC_DATASET;
  const usesDefaultSourceUrl = Boolean(supportsLive && !sourceUrlConfigured && (options.defaultSourceUrl || DEFAULT_POLITICIAN_TRADE_SOURCE_URL));
  const configured = supportsLive && liveEnabled && (sourceUrlConfigured || usesDefaultSourceUrl);
  const missingEnv = [];
  if (supportsLive && !liveEnabled) missingEnv.push("POLITICIAN_TRADES_LIVE_ENABLED");
  if (supportsLive && !sourceUrlConfigured && !usesDefaultSourceUrl) missingEnv.push("POLITICIAN_TRADES_SOURCE_URL");
  return {
    selectedProvider,
    label: supportsLive ? "Senate Stock Watcher public dataset" : "Sample/local politician trade data",
    mode: configured ? "public-static-dataset" : selectedProvider === "mock" ? "mock" : "not-connected",
    configured,
    configuredPending: supportsLive && !configured,
    liveEnabled,
    liveProviderCalls: configured,
    sourceUrlConfigured,
    usesDefaultSourceUrl,
    missingEnv,
    requiredEnv: ["POLITICIAN_TRADES_PROVIDER", "POLITICIAN_TRADES_LIVE_ENABLED"],
    optionalEnv: ["POLITICIAN_TRADES_SOURCE_URL", "POLITICIAN_TRADES_TTL_HOURS"],
    status: configured ? "configured" : supportsLive ? "configured-not-connected" : "mock/sample mode",
    sourceRecommendation: POLITICIAN_TRADE_SOURCE_RECOMMENDATION.recommendation,
    sourceCoverage: POLITICIAN_TRADE_SOURCE_RECOMMENDATION.coverage,
    primarySource: POLITICIAN_TRADE_SOURCE_RECOMMENDATION.primarySource,
    detail: configured
      ? "Senate public disclosure rows can be fetched by the local backend. No browser credentials are used."
      : supportsLive
      ? "Set POLITICIAN_TRADES_LIVE_ENABLED=true to fetch the public static dataset through the local backend."
      : "Sample and local CSV/JSON import remain active. No live provider calls are enabled."
  };
}

export function createPoliticianTradeProvider(type = POLITICIAN_TRADE_PROVIDER_TYPES.MOCK, options = {}) {
  const providerType = normalizeProviderName(type);
  if (providerType === POLITICIAN_TRADE_PROVIDER_TYPES.LOCAL_FILE) {
    return {
      id: "local-politician-trade-file",
      label: "Local politician trade file",
      mode: "local-file",
      liveProviderCalls: false,
      sourceTypes: ["csv", "json", "disclosure"],
      importText(text, options = {}) {
        return importPoliticianTradeFile(text, options);
      },
      normalizeTrades: normalizePoliticianTrades,
      validateTrades: validatePoliticianTrades
    };
  }

  if (providerType === POLITICIAN_TRADE_PROVIDER_TYPES.PUBLIC_STATIC_DATASET ||
      providerType === POLITICIAN_TRADE_PROVIDER_TYPES.SENATE_STOCK_WATCHER) {
    const sourceUrl = options.sourceUrl || "";
    const liveEnabled = Boolean(options.liveEnabled);
    return {
      id: options.providerId || "senate-stock-watcher-public-dataset",
      label: options.label || "Senate Stock Watcher public dataset",
      mode: "public-static-dataset",
      liveProviderCalls: Boolean(liveEnabled && sourceUrl),
      sourceTypes: ["provider", "disclosure", "json"],
      async fetchRawTrades(fetchOptions = {}) {
        return fetchPublicPoliticianTradeDataset({
          ...options,
          ...fetchOptions,
          sourceUrl: fetchOptions.sourceUrl || sourceUrl,
          liveEnabled: fetchOptions.liveEnabled ?? liveEnabled,
          providerId: fetchOptions.providerId || options.providerId || "senate-stock-watcher-public-dataset",
          providerLabel: fetchOptions.providerLabel || options.label || "Senate Stock Watcher public dataset"
        });
      },
      normalizeTrades: normalizePoliticianTrades,
      validateTrades: validatePoliticianTrades
    };
  }

  if (providerType === POLITICIAN_TRADE_PROVIDER_TYPES.FUTURE_API) {
    return futureProvider("future-politician-trade-api", "Future politician trade API", "Future licensed/public API adapter placeholder.");
  }

  if (providerType === POLITICIAN_TRADE_PROVIDER_TYPES.OFFICIAL_DISCLOSURE_PARSER) {
    return futureProvider("future-official-disclosure-parser", "Future official disclosure parser", "Future official disclosure parser placeholder. No scraping is implemented.");
  }

  return {
    id: "mock-politician-trades",
    label: "Sample politician trades",
    mode: "mock",
    liveProviderCalls: false,
    sourceTypes: ["mock", "disclosure"],
    async fetchRawTrades() {
      return fetchRawPoliticianTrades({ source: "mock" });
    },
    normalizeTrades: normalizePoliticianTrades,
    validateTrades: validatePoliticianTrades
  };
}

export function politicianTradeProviderStatuses(env = {}, options = {}) {
  const config = buildPoliticianTradeProviderConfig(env, options);
  return {
    mock: {
      id: "mock-politician-trades",
      label: "Sample politician trades",
      configured: true,
      liveEnabled: false,
      liveProviderCalls: false,
      mode: "mock",
      status: "mock/sample mode"
    },
    localFile: {
      id: "local-politician-trade-file",
      label: "Local CSV/JSON import",
      configured: true,
      liveEnabled: false,
      liveProviderCalls: false,
      mode: "local-file",
      status: "ready"
    },
    senateStockWatcher: {
      id: "senate-stock-watcher-public-dataset",
      label: "Senate Stock Watcher public dataset",
      configured: config.configured,
      configuredPending: config.configuredPending,
      liveEnabled: config.liveEnabled,
      liveProviderCalls: config.liveProviderCalls,
      mode: config.configured ? "public-static-dataset" : "not-connected",
      status: config.status,
      missingEnv: config.missingEnv,
      sourceUrlConfigured: config.sourceUrlConfigured,
      usesDefaultSourceUrl: config.usesDefaultSourceUrl,
      sourceRecommendation: config.sourceRecommendation,
      sourceCoverage: config.sourceCoverage,
      primarySource: config.primarySource,
      warning: "Public static dataset coverage is Senate-only and can be delayed or incomplete; treat disclosure rows as informational only."
    },
    futureApi: {
      id: "future-politician-trade-api",
      label: "Future politician trade API",
      configured: false,
      liveEnabled: false,
      liveProviderCalls: false,
      mode: "not-implemented",
      status: "future source"
    },
    officialDisclosureParser: {
      id: "future-official-disclosure-parser",
      label: "Future official disclosure parser",
      configured: false,
      liveEnabled: false,
      liveProviderCalls: false,
      mode: "not-implemented",
      status: "future source"
    }
  };
}

export function mockPoliticianTradeRows() {
  return [
    {
      politician_name: "Sample Representative",
      chamber: "House",
      party: "D",
      state: "CA",
      ticker: "NVDA",
      asset_name: "NVIDIA Corporation",
      transaction_type: "Purchase",
      transaction_date: "2026-05-10",
      disclosure_date: "2026-05-21",
      amount_low: "$1,001",
      amount_high: "$15,000",
      owner: "Self",
      source_url: "https://example.test/disclosures/nvda-demo",
      committees: ["Technology modernization placeholder"]
    },
    {
      politician_name: "Sample Senator",
      chamber: "Senate",
      party: "R",
      state: "TX",
      ticker: "AMD",
      asset_name: "Advanced Micro Devices, Inc.",
      transaction_type: "Sale",
      transaction_date: "2026-05-06",
      disclosure_date: "2026-05-20",
      amount_low: "$15,001",
      amount_high: "$50,000",
      owner: "Spouse",
      source_url: "https://example.test/disclosures/amd-demo",
      committees: []
    },
    {
      politician_name: "Sample Delegate",
      chamber: "House",
      party: "I",
      state: "VA",
      ticker: "MU",
      asset_name: "Micron Technology, Inc.",
      transaction_type: "Purchase",
      transaction_date: "2026-05-03",
      disclosure_date: "2026-05-18",
      amount_low: "$1,001",
      amount_high: "$15,000",
      owner: "Joint",
      source_url: "https://example.test/disclosures/mu-demo",
      committees: ["Commerce placeholder"]
    }
  ];
}

export async function fetchRawPoliticianTrades({ source = "mock", ...options } = {}) {
  const providerType = normalizeProviderName(source);
  if (providerType === POLITICIAN_TRADE_PROVIDER_TYPES.PUBLIC_STATIC_DATASET ||
      providerType === POLITICIAN_TRADE_PROVIDER_TYPES.SENATE_STOCK_WATCHER) {
    return fetchPublicPoliticianTradeDataset(options);
  }

  if (providerType !== "mock") {
    return {
      mode: "not-implemented",
      liveProviderCalls: false,
      warnings: ["Live politician-trade providers are not connected yet. Use sample data only."],
      records: []
    };
  }

  return {
    mode: "mock",
    liveProviderCalls: false,
    warnings: ["Sample politician trade data only. No scraping or live provider calls were made."],
    records: mockPoliticianTradeRows()
  };
}

export async function fetchPublicPoliticianTradeDataset(options = {}) {
  const {
    sourceUrl = "",
    fetchImpl = globalThis.fetch?.bind(globalThis),
    liveEnabled = false,
    asOf = new Date().toISOString(),
    limit = 250,
    providerId = "senate-stock-watcher-public-dataset",
    providerLabel = "Senate Stock Watcher public dataset"
  } = options;
  const displaySourceUrl = safeSourceUrlForDisplay(sourceUrl);

  if (!liveEnabled) {
    return {
      ok: false,
      mode: "public-static-dataset",
      providerId,
      providerLabel,
      ...publicDatasetSourceMeta(),
      configured: Boolean(sourceUrl),
      liveProviderCalls: false,
      setupRequired: true,
      sourceUrl: displaySourceUrl,
      status: "disabled",
      dataFreshness: "disabled",
      fetchedAt: asOf,
      records: [],
      rejectedRows: [],
      warnings: ["Public politician-trade fetch is disabled. Set POLITICIAN_TRADES_LIVE_ENABLED=true on the local backend to enable it."]
    };
  }

  if (!sourceUrl) {
    return {
      ok: false,
      mode: "public-static-dataset",
      providerId,
      providerLabel,
      ...publicDatasetSourceMeta(),
      configured: false,
      liveProviderCalls: false,
      setupRequired: true,
      sourceUrl: "",
      status: "not configured",
      dataFreshness: "missing",
      fetchedAt: asOf,
      records: [],
      rejectedRows: [],
      warnings: ["Public politician-trade source URL is missing."]
    };
  }

  if (typeof fetchImpl !== "function") {
    return {
      ok: false,
      mode: "public-static-dataset",
      providerId,
      providerLabel,
      ...publicDatasetSourceMeta(),
      configured: true,
      liveProviderCalls: false,
      sourceUrl: displaySourceUrl,
      status: "error",
      dataFreshness: "error",
      fetchedAt: asOf,
      records: [],
      rejectedRows: [],
      warnings: ["No fetch implementation is available for the local backend provider."]
    };
  }

  try {
    const response = await fetchImpl(sourceUrl, {
      headers: { Accept: "application/json,text/csv;q=0.9,*/*;q=0.5" }
    });
    const text = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        mode: "public-static-dataset",
        providerId,
        providerLabel,
        ...publicDatasetSourceMeta(),
        configured: true,
        liveProviderCalls: true,
        sourceUrl: displaySourceUrl,
        status: response.status === 429 ? "rate limited" : "error",
        httpStatus: response.status,
        dataFreshness: response.status === 429 ? "rate limited" : "error",
        fetchedAt: asOf,
        records: [],
        rejectedRows: [],
        warnings: [`Public politician-trade provider returned HTTP ${response.status}. ${sanitizeProviderMessage(text)}`.trim()]
      };
    }

    const parsed = parsePublicProviderPayload(text, { sourceUrl });
    if (!parsed.ok) {
      return {
        ok: false,
        mode: "public-static-dataset",
        providerId,
        providerLabel,
        ...publicDatasetSourceMeta(),
        configured: true,
        liveProviderCalls: true,
        sourceUrl: displaySourceUrl,
        status: "error",
        dataFreshness: "error",
        fetchedAt: asOf,
        records: [],
        rejectedRows: [],
        warnings: [parsed.error]
      };
    }

    const flattenedRows = flattenPublicProviderRows(parsed.rows, { sourceUrl: displaySourceUrl });
    const normalized = [];
    const rejectedRows = [];
    flattenedRows.forEach((row, index) => {
      const record = normalizePoliticianTradeRecord(row, {
        asOf,
        source: providerId,
        sourceMode: "public-static-dataset",
        providerId,
        sourceType: "provider",
        sourceUrl: row.source_url || row.sourceUrl || row.ptr_link || displaySourceUrl,
        defaultChamber: "Senate",
        defaultParty: "Unknown",
        defaultState: "Unknown",
        liveProviderCalls: true,
        notes: "Public disclosure dataset row. Coverage can be delayed or incomplete; verify source before using it for decisions."
      });
      const validation = validatePoliticianTradeRecord(record);
      if (validation.ok) {
        normalized.push(record);
      } else {
        rejectedRows.push({
          rowNumber: row.__rowNumber || index + 1,
          reason: validation.errors.join("; "),
          raw: redactSensitiveRow(row),
          normalized: redactSensitiveRow(record)
        });
      }
    });

    const sorted = normalizePoliticianTrades(normalized, {
      asOf,
      source: providerId,
      sourceMode: "public-static-dataset",
      providerId,
      sourceType: "provider",
      sourceUrl: displaySourceUrl,
      defaultChamber: "Senate",
      defaultParty: "Unknown",
      defaultState: "Unknown",
      liveProviderCalls: true,
      notes: "Public disclosure dataset row. Coverage can be delayed or incomplete; verify source before using it for decisions."
    }).sort((a, b) => String(b.disclosureDate || b.transactionDate || "").localeCompare(String(a.disclosureDate || a.transactionDate || "")));
    const limited = sorted.slice(0, Math.max(1, Number(limit) || 250));
    const validation = validatePoliticianTrades(limited);
    return {
      ok: limited.length > 0 && validation.ok,
      partial: limited.length > 0 && rejectedRows.length > 0,
      mode: "public-static-dataset",
      providerId,
      providerLabel,
      ...publicDatasetSourceMeta(),
      sourceUrl: displaySourceUrl,
      status: "connected",
      fetchedAt: asOf,
      dataFreshness: "fresh",
      configured: true,
      liveProviderCalls: true,
      detectedColumns: parsed.detectedColumns,
      rowsParsed: flattenedRows.length,
      tradesImported: limited.length,
      rejectedRows,
      missingFields: missingFieldsFromRejected(rejectedRows),
      tickersDetected: [...new Set(limited.map((record) => record.ticker).filter(Boolean))].sort(),
      records: limited,
      validation,
      warnings: [
        `${providerLabel} rows are Senate public disclosure data and may be delayed, partial, or missing House disclosures.`,
        ...(rejectedRows.length ? [`${rejectedRows.length} provider row${rejectedRows.length === 1 ? "" : "s"} rejected during normalization.`] : []),
        ...(validation.warnings || [])
      ]
    };
  } catch (error) {
    return {
      ok: false,
      mode: "public-static-dataset",
      providerId,
      providerLabel,
      ...publicDatasetSourceMeta(),
      configured: true,
      liveProviderCalls: true,
      sourceUrl: displaySourceUrl,
      status: "error",
      dataFreshness: "error",
      fetchedAt: asOf,
      records: [],
      rejectedRows: [],
      warnings: [`Public politician-trade fetch failed: ${sanitizeProviderMessage(error?.message || String(error))}`]
    };
  }
}

export function importPoliticianTradeFile(text = "", options = {}) {
  const fileName = options.fileName || "politician-trades-import";
  const asOf = options.asOf || new Date().toISOString();
  const parsed = parsePoliticianTradeFile(text, { fileName });
  if (!parsed.ok) {
    return {
      ok: false,
      mode: "local-file",
      fileName,
      fileType: parsed.fileType,
      detectedColumns: parsed.detectedColumns || [],
      rowsParsed: 0,
      tradesImported: 0,
      rejectedRows: [{ rowNumber: 0, reason: parsed.error, raw: {} }],
      missingFields: [],
      tickersDetected: [],
      records: [],
      validation: { ok: false, errors: [parsed.error], warnings: [] },
      liveProviderCalls: false,
      warnings: ["Local import failed before normalization. No external provider calls were made."]
    };
  }

  const records = [];
  const rejectedRows = [];
  const missingFields = new Set();
  parsed.rows.forEach((row, index) => {
    const normalized = normalizePoliticianTradeRecord(row, {
      asOf,
      source: "local-politician-trade-import",
      sourceMode: "local-file",
      providerId: "local-politician-trade-file"
    });
    const validation = validatePoliticianTradeRecord(normalized);
    if (validation.ok) {
      records.push(normalized);
    } else {
      validation.errors
        .filter((error) => /is required/.test(error))
        .forEach((error) => missingFields.add(error.replace(" is required", "")));
      rejectedRows.push({
        rowNumber: row.__rowNumber || index + 1,
        reason: validation.errors.join("; "),
        raw: redactSensitiveRow(row),
        normalized: redactSensitiveRow(normalized)
      });
    }
  });

  const normalizedRecords = normalizePoliticianTrades(records, {
    asOf,
    source: "local-politician-trade-import",
    sourceMode: "local-file",
    providerId: "local-politician-trade-file"
  });
  const validation = validatePoliticianTrades(normalizedRecords);
  return {
    ok: normalizedRecords.length > 0 && rejectedRows.length === 0 && validation.ok,
    partial: normalizedRecords.length > 0 && rejectedRows.length > 0,
    mode: "local-file",
    fileName,
    fileType: parsed.fileType,
    detectedColumns: parsed.detectedColumns,
    rowsParsed: parsed.rows.length,
    tradesImported: normalizedRecords.length,
    rejectedRows,
    missingFields: [...missingFields],
    tickersDetected: [...new Set(normalizedRecords.map((record) => record.ticker).filter(Boolean))].sort(),
    records: normalizedRecords,
    validation,
    liveProviderCalls: false,
    warnings: [
      "Local politician trade import only. No scraping or live provider calls were made.",
      ...(validation.warnings || [])
    ]
  };
}

export function demoPoliticianTrades(options = {}) {
  return normalizePoliticianTrades(mockPoliticianTradeRows(), {
    asOf: options.asOf || "2026-05-23T12:00:00-04:00",
    source: "mock-politician-trades"
  });
}

export function normalizePoliticianTrades(rawRows = [], options = {}) {
  const normalized = rawRows.map((row) => normalizePoliticianTradeRecord(row, options));
  const clusterCounts = countByTicker(normalized);
  return normalized.map((trade) => ({
    ...trade,
    clusterScore: scoreCluster(clusterCounts.get(trade.ticker) || 1),
    clusterScorePlaceholder: "Placeholder based on same-ticker mock disclosure count."
  }));
}

export function normalizePoliticianTradeRecord(raw = {}, options = {}) {
  const ticker = normalizeTicker(extractDisclosureTicker(pick(raw, ["ticker", "symbol", "assetTicker"])));
  const politicianName = politicianNameFromRow(raw);
  const transactionDate = normalizeDate(pick(raw, ["transactionDate", "transaction_date", "tradedAt", "transactionDateIso"]));
  const disclosureDate = normalizeDate(pick(raw, ["disclosureDate", "disclosure_date", "disclosedAt", "filingDate", "date_recieved", "date_received", "notificationDate"]));
  const parsedRange = parseAmountRange(pick(raw, ["amountRange", "amount_range", "amount", "range", "amountRangeText"]));
  const amountRangeLow = numberFrom(pick(raw, ["amountRangeLow", "amount_low", "amountLow", "minAmount", "amountMin"]), parsedRange.min, 0);
  const amountRangeHigh = numberFrom(pick(raw, ["amountRangeHigh", "amount_high", "amountHigh", "maxAmount", "amountMax"]), parsedRange.max, amountRangeLow);
  const transactionType = normalizeTransactionType(pick(raw, ["transactionType", "transaction_type", "type"]));
  const asOf = options.asOf || new Date().toISOString();
  const record = {
    id: raw.id || raw.providerRecordId || raw.providerRowId || stableTradeId({ politicianName, ticker, transactionDate, disclosureDate, transactionType, amountRangeLow, amountRangeHigh, owner: pick(raw, ["owner", "ownerType"]) }),
    politicianName,
    chamber: stringFrom(pick(raw, ["chamber", "body"])) || options.defaultChamber || "",
    party: stringFrom(pick(raw, ["party", "partyCode"])) || options.defaultParty || "",
    state: stringFrom(pick(raw, ["state", "districtState"])) || options.defaultState || "",
    ticker,
    assetName: stringFrom(pick(raw, ["assetName", "asset_name", "asset", "asset_description", "securityName", "description"])),
    transactionType,
    transactionDate,
    disclosureDate,
    amountRangeLow,
    amountRangeHigh: Math.max(amountRangeLow, amountRangeHigh),
    amountRange: {
      min: amountRangeLow,
      max: Math.max(amountRangeLow, amountRangeHigh)
    },
    owner: stringFrom(pick(raw, ["owner", "ownerType"])) || "Unknown",
    sourceUrl: safeSourceUrlForDisplay(stringFrom(pick(raw, ["sourceUrl", "source_url", "url", "filingUrl", "ptr_link"])) || options.sourceUrl || ""),
    sourceType: pick(raw, ["sourceType", "source_type", "filingType", "providerType"]) || options.sourceType || "disclosure",
    tradedAt: transactionDate,
    disclosedAt: disclosureDate,
    office: stringFrom(pick(raw, ["office"])) || stringFrom(pick(raw, ["chamber", "body"])),
    confidenceScore: scoreConfidence(raw),
    recencyScore: scoreRecency(disclosureDate, asOf),
    sizeScore: scoreSize(amountRangeLow, Math.max(amountRangeLow, amountRangeHigh)),
    committeeRelevanceScore: scoreCommitteeRelevance(raw.committees),
    committeeRelevancePlaceholder: "Placeholder until committee-to-sector mapping is implemented.",
    clusterScore: 0,
    clusterScorePlaceholder: "Calculated after normalization across the batch.",
    sourceMode: options.sourceMode || raw.sourceMode || (options.source === "local-politician-trade-import" ? "local-file" : "mock"),
    providerId: options.providerId || raw.providerId || (options.source === "local-politician-trade-import" ? "local-politician-trade-file" : "mock-politician-trades"),
    providerRecordId: raw.providerRecordId || raw.providerRowId || "",
    dataFreshness: options.dataFreshness || raw.dataFreshness || raw.data_freshness,
    cacheStatus: options.cacheStatus || raw.cacheStatus || raw.cache_status,
    liveProviderCalls: Boolean(options.liveProviderCalls || raw.liveProviderCalls),
    source: options.source || raw.source || "mock-politician-trades",
    sourceAsOf: asOf,
    notes: options.notes || raw.notes || (options.source === "local-politician-trade-import"
      ? "Local imported disclosure row. Review source before using it for decisions."
      : "Sample disclosure row for local architecture only.")
  };
  return pruneEmpty(record);
}

export function validatePoliticianTradeRecord(record = {}) {
  const errors = [];
  const warnings = [];
  requireString(record.id, "id", errors);
  requireString(record.politicianName, "politicianName", errors);
  requireString(record.chamber, "chamber", errors);
  requireString(record.party, "party", errors);
  requireString(record.state, "state", errors);
  requireString(record.ticker, "ticker", errors);
  if (record.ticker && !/^[A-Z][A-Z0-9.-]{0,11}$/.test(record.ticker)) {
    errors.push("ticker must be a valid exchange symbol");
  }
  requireString(record.assetName, "assetName", errors);
  requireKnown(record.transactionType, TRANSACTION_TYPES, "transactionType", errors);
  requireString(record.transactionDate, "transactionDate", errors);
  requireString(record.disclosureDate, "disclosureDate", errors);
  requireString(record.disclosedAt, "disclosedAt", errors);
  requireString(record.office, "office", errors);
  requireNonNegative(record.amountRangeLow, "amountRangeLow", errors);
  requireNonNegative(record.amountRangeHigh, "amountRangeHigh", errors);
  if (Number(record.amountRangeLow) > Number(record.amountRangeHigh)) {
    errors.push("amountRangeLow cannot exceed amountRangeHigh");
  }
  if (!record.amountRange || typeof record.amountRange !== "object") {
    errors.push("amountRange must be an object");
  } else {
    requireNonNegative(record.amountRange.min, "amountRange.min", errors);
    requireNonNegative(record.amountRange.max, "amountRange.max", errors);
    if (Number(record.amountRange.min) > Number(record.amountRange.max)) {
      errors.push("amountRange min cannot exceed max");
    }
    if (Number(record.amountRangeLow) !== Number(record.amountRange.min)) {
      errors.push("amountRangeLow must match amountRange.min");
    }
    if (Number(record.amountRangeHigh) !== Number(record.amountRange.max)) {
      errors.push("amountRangeHigh must match amountRange.max");
    }
  }
  requireString(record.owner, "owner", errors);
  requireString(record.sourceUrl, "sourceUrl", errors);
  requireKnown(record.sourceType, SOURCE_TYPES, "sourceType", errors);
  requireScore(record.confidenceScore, "confidenceScore", errors);
  requireScore(record.recencyScore, "recencyScore", errors);
  requireScore(record.sizeScore, "sizeScore", errors);
  requireScore(record.committeeRelevanceScore, "committeeRelevanceScore", errors);
  requireScore(record.clusterScore, "clusterScore", errors);
  if (!record.sourceUrl || !/^https?:\/\//i.test(record.sourceUrl)) {
    warnings.push("sourceUrl should be an absolute HTTP(S) URL when live disclosure data is added.");
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function validatePoliticianTrades(records = []) {
  const results = records.map(validatePoliticianTradeRecord);
  return {
    ok: results.every((result) => result.ok),
    errors: results.flatMap((result, index) => result.errors.map((error) => `records[${index}].${error}`)),
    warnings: results.flatMap((result, index) => result.warnings.map((warning) => `records[${index}].${warning}`)),
    count: records.length
  };
}

export function politicianTradesForTicker(records = [], ticker = "") {
  const normalizedTicker = normalizeTicker(ticker);
  return records
    .filter((record) => normalizeTicker(record.ticker) === normalizedTicker)
    .sort((a, b) => String(b.disclosureDate || b.disclosedAt || "").localeCompare(String(a.disclosureDate || a.disclosedAt || "")));
}

export function exportPoliticianTrades(records = []) {
  const normalized = persistPoliticianTradeCacheRecords(records);
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    politicianTrades: normalized,
    safety: {
      includesPasswords: false,
      includesApiKeys: false,
      liveProviderCalls: false,
      note: "Politician trade export contains normalized local/cache disclosure-style records. Sample data is not investment advice."
    }
  };
}

export function persistPoliticianTradeCacheRecords(records = [], fallbackFreshness = "cached") {
  return normalizePoliticianTrades(records).map((record) => {
    if (!isProviderBackedPoliticianTradeRecord(record)) return record;
    const freshness = persistedPoliticianTradeFreshness(record, fallbackFreshness);
    return pruneEmpty({
      ...record,
      dataFreshness: freshness,
      cacheStatus: freshness,
      liveProviderCalls: false
    });
  });
}

export function savePoliticianTrades(storage, records = [], key = POLITICIAN_TRADE_STORAGE_KEY) {
  if (!storage?.setItem) return false;
  try {
    storage.setItem(key, JSON.stringify(persistPoliticianTradeCacheRecords(records)));
    return true;
  } catch {
    return false;
  }
}

export function loadPoliticianTrades(storage, key = POLITICIAN_TRADE_STORAGE_KEY) {
  try {
    const stored = storage?.getItem ? JSON.parse(storage.getItem(key) || "null") : null;
    return Array.isArray(stored) && stored.length ? persistPoliticianTradeCacheRecords(stored) : demoPoliticianTrades();
  } catch {
    return demoPoliticianTrades();
  }
}

function isProviderBackedPoliticianTradeRecord(record = {}) {
  return Boolean(
    record.liveProviderCalls ||
    record.sourceMode === POLITICIAN_TRADE_PROVIDER_TYPES.PUBLIC_STATIC_DATASET ||
    record.providerId === POLITICIAN_TRADE_SOURCE_RECOMMENDATION.providerId
  );
}

function persistedPoliticianTradeFreshness(record = {}, fallbackFreshness = "cached") {
  const statusText = `${record.dataFreshness || ""} ${record.cacheStatus || ""} ${record.status || ""}`.toLowerCase();
  if (/stale|expired|error|failed|rate[-\s]?limited|429/.test(statusText)) return "stale";
  if (/cached|cache/.test(statusText)) return "cached";
  return fallbackFreshness;
}

function futureProvider(id, label, warning) {
  return {
    id,
    label,
    mode: "not-implemented",
    liveProviderCalls: false,
    sourceTypes: ["disclosure", "provider"],
    async fetchRawTrades() {
      return {
        mode: "not-implemented",
        liveProviderCalls: false,
        warnings: [warning],
        records: []
      };
    },
    normalizeTrades: normalizePoliticianTrades,
    validateTrades: validatePoliticianTrades
  };
}

function parsePublicProviderPayload(text = "", options = {}) {
  const source = String(text || "").replace(/^\uFEFF/, "").trim();
  if (!source) return { ok: false, error: "Provider returned an empty payload." };
  const looksJson = /\.json(?:$|\?)/i.test(options.sourceUrl || "") || /^[{\[]/.test(source);
  if (looksJson) {
    try {
      const payload = JSON.parse(source);
      const rows = Array.isArray(payload)
        ? payload
        : payload.politicianTrades || payload.trades || payload.records || payload.data || [];
      if (!Array.isArray(rows)) {
        return { ok: false, error: "Provider JSON must contain an array or a politicianTrades/trades/records/data array." };
      }
      return {
        ok: true,
        fileType: "json",
        detectedColumns: inferColumns(rows),
        rows: rows.map((row, index) => ({ ...row, __rowNumber: index + 1 }))
      };
    } catch (error) {
      return { ok: false, error: `Provider JSON parse failed: ${sanitizeProviderMessage(error?.message || "Invalid JSON.")}` };
    }
  }

  const parsed = parseSimpleCsv(source);
  if (!parsed.headers.length) return { ok: false, error: "Provider CSV is missing a header row." };
  return {
    ok: true,
    fileType: "csv",
    detectedColumns: parsed.headers,
    rows: parsed.rows
  };
}

function flattenPublicProviderRows(rows = [], options = {}) {
  return rows.flatMap((row, index) => {
    if (Array.isArray(row.transactions)) {
      const politicianName = stringFrom([row.first_name, row.last_name].filter(Boolean).join(" ")) ||
        stringFrom(row.senator || row.representative || row.politicianName || row.politician_name || row.name);
      return row.transactions.map((transaction, transactionIndex) => ({
        ...transaction,
        __rowNumber: row.__rowNumber || index + 1,
        politicianName,
        senator: politicianName,
        chamber: row.chamber || "Senate",
        party: row.party || row.partyCode || "Unknown",
        state: row.state || "Unknown",
        office: row.office || "Senate",
        date_recieved: row.date_recieved || row.date_received || row.disclosure_date || row.disclosureDate,
        sourceUrl: row.sourceUrl || row.source_url || row.ptr_link || options.sourceUrl,
        ptr_link: row.ptr_link || options.sourceUrl,
        providerRowId: row.bioguide ? `${row.bioguide}-${transactionIndex}` : undefined
      }));
    }
    return {
      ...row,
      __rowNumber: row.__rowNumber || index + 1,
      sourceUrl: row.sourceUrl || row.source_url || row.ptr_link || options.sourceUrl,
      providerRowId: row.providerRowId || row.providerRecordId || (row.bioguide ? `${row.bioguide}-${index}` : undefined)
    };
  });
}

function missingFieldsFromRejected(rejectedRows = []) {
  return [...new Set(rejectedRows.flatMap((row) =>
    String(row.reason || "")
      .split(";")
      .map((item) => item.trim().replace(" is required", ""))
      .filter((item) => item && !item.includes(" "))
  ))].sort();
}

function publicDatasetSourceMeta() {
  return {
    sourceRecommendation: POLITICIAN_TRADE_SOURCE_RECOMMENDATION.recommendation,
    sourceCoverage: POLITICIAN_TRADE_SOURCE_RECOMMENDATION.coverage,
    primarySource: POLITICIAN_TRADE_SOURCE_RECOMMENDATION.primarySource
  };
}

function sanitizeProviderMessage(message = "") {
  return String(message || "")
    .replace(/(authorization\s*:\s*)Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "$1Bearer [redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\b(access[_-]?token|refresh[_-]?token|client[_-]?secret|api[_-]?key|apikey|password|cookie|session(?:[_-]?id)?|authorization)\b\s*[:=]\s*["']?[^"',\s&]+/gi, "$1=[redacted]")
    .replace(/([?&](?:apikey|api_key|token|secret|key|access_token|refresh_token|client_secret|authorization|cookie|session_id|password)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, "[redacted]")
    .slice(0, 240);
}

function safeSourceUrlForDisplay(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    for (const key of [...url.searchParams.keys()]) {
      if (/api|key|token|secret|auth|password|cookie|session/i.test(key)) {
        url.searchParams.set(key, "[redacted]");
      }
    }
    return url.toString();
  } catch {
    return sanitizeProviderMessage(text);
  }
}

function redactSensitiveRow(row = {}) {
  if (!row || typeof row !== "object") return row;
  return Object.fromEntries(Object.entries(row).map(([key, value]) => {
    if (String(key).startsWith("__")) return [key, value];
    const normalizedKey = String(key).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (/api|key|token|secret|auth|password|cookie|authorization|session/.test(normalizedKey)) {
      return [key, "[redacted]"];
    }
    if (/url|link|source/.test(normalizedKey)) {
      return [key, safeSourceUrlForDisplay(value)];
    }
    if (typeof value === "string") return [key, sanitizeProviderMessage(value)];
    return [key, value];
  }));
}

function parsePoliticianTradeFile(text = "", options = {}) {
  const fileName = options.fileName || "";
  const source = String(text || "").replace(/^\uFEFF/, "").trim();
  if (!source) {
    return { ok: false, fileType: "unknown", error: "File is empty." };
  }

  const looksJson = /\.json$/i.test(fileName) || /^[{\[]/.test(source);
  if (looksJson) {
    try {
      const payload = JSON.parse(source);
      const rows = Array.isArray(payload)
        ? payload
        : payload.politicianTrades || payload.trades || payload.records || [];
      if (!Array.isArray(rows)) {
        return { ok: false, fileType: "json", error: "JSON must contain an array or a politicianTrades/trades/records array." };
      }
      return {
        ok: true,
        fileType: "json",
        detectedColumns: inferColumns(rows),
        rows: rows.map((row, index) => ({ ...row, __rowNumber: index + 1 }))
      };
    } catch (error) {
      return { ok: false, fileType: "json", error: `JSON parse failed: ${sanitizeProviderMessage(error?.message || "Invalid JSON.")}` };
    }
  }

  const parsed = parseSimpleCsv(source);
  if (!parsed.headers.length) {
    return { ok: false, fileType: "csv", error: "CSV is missing a header row." };
  }
  return {
    ok: true,
    fileType: "csv",
    detectedColumns: parsed.headers,
    rows: parsed.rows
  };
}

function parseSimpleCsv(text = "") {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const source = String(text || "").replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(source);

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (quoted && char === '"' && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
      if (char === "\r" && next === "\n") index += 1;
    } else {
      cell += char;
    }
  }

  if (cell.length || row.length) {
    row.push(cell.trim());
    if (row.some(Boolean)) rows.push(row);
  }

  if (!rows.length) return { headers: [], rows: [] };
  const headers = rows[0].map((header, index) => header || `Column ${index + 1}`);
  return {
    headers,
    rows: rows.slice(1).map((values, rowIndex) => {
      const record = { __rowNumber: rowIndex + 2 };
      headers.forEach((header, headerIndex) => {
        record[header] = values[headerIndex] || "";
      });
      return record;
    }).filter((record) => Object.entries(record).some(([key, value]) => key !== "__rowNumber" && value !== ""))
  };
}

function detectDelimiter(text = "") {
  const firstLine = String(text || "").split(/\r?\n/).find(Boolean) || "";
  const commaCount = (firstLine.match(/,/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  return tabCount > commaCount ? "\t" : ",";
}

function inferColumns(rows = []) {
  return [...new Set(rows.flatMap((row) => Object.keys(row || {}).filter((key) => key !== "__rowNumber")))];
}

function pick(raw, keys) {
  for (const key of keys) {
    if (raw[key] !== undefined && raw[key] !== null && raw[key] !== "") return raw[key];
  }
  const normalizedKeys = keys.map(normalizeKey);
  const match = Object.entries(raw || {}).find(([key, value]) =>
    normalizedKeys.includes(normalizeKey(key)) && value !== undefined && value !== null && value !== ""
  );
  if (match) return match[1];
  return "";
}

function politicianNameFromRow(raw = {}) {
  const directName = stringFrom(pick(raw, ["politicianName", "politician_name", "representative", "senator", "name"]));
  if (directName) return directName;
  return stringFrom([pick(raw, ["firstName", "first_name"]), pick(raw, ["lastName", "last_name"])]
    .map(stringFrom)
    .filter(Boolean)
    .join(" "));
}

function normalizeKey(key) {
  return String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function stringFrom(value) {
  return String(value || "").trim();
}

function extractDisclosureTicker(value) {
  const text = stringFrom(value);
  if (!text) return "";
  const queryMatch = text.match(/[?&]s=([A-Z0-9.-]{1,12})/i);
  if (queryMatch) return queryMatch[1];
  const stripped = text
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .trim();
  const match = stripped.match(/\b[A-Z][A-Z0-9.-]{0,11}\b/);
  return match ? match[0] : stripped;
}

function normalizeTransactionType(value) {
  const text = stringFrom(value).toLowerCase();
  if (/purchase|buy|acquire/.test(text)) return "purchase";
  if (/sale|sell|dispose/.test(text)) return "sale";
  if (/exchange/.test(text)) return "exchange";
  return "unknown";
}

function parseAmountRange(value) {
  if (value && typeof value === "object") {
    return {
      min: numberFrom(value.min, value.low, value.amountRangeLow, 0),
      max: numberFrom(value.max, value.high, value.amountRangeHigh, value.min, 0)
    };
  }
  const matches = String(value || "").match(/\$?\s*\d[\d,]*(?:\.\d+)?/g) || [];
  const amounts = matches.map((item) => numberFrom(item)).filter((item) => Number.isFinite(item) && item >= 0);
  if (amounts.length >= 2) return { min: Math.min(amounts[0], amounts[1]), max: Math.max(amounts[0], amounts[1]) };
  if (amounts.length === 1) return { min: amounts[0], max: amounts[0] };
  return { min: 0, max: 0 };
}

function normalizeDate(value) {
  const text = stringFrom(value);
  if (!text) return "";
  const slashDate = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashDate) {
    const [, month, day, year] = slashDate;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const date = new Date(`${text}T12:00:00`);
  if (Number.isNaN(date.getTime())) return text;
  return date.toISOString().slice(0, 10);
}

function scoreRecency(disclosureDate, asOf) {
  const disclosed = new Date(`${disclosureDate}T12:00:00`).getTime();
  const now = new Date(asOf).getTime();
  if (!Number.isFinite(disclosed) || !Number.isFinite(now)) return 0;
  const days = Math.max(0, (now - disclosed) / (24 * 60 * 60 * 1000));
  if (days <= 7) return 1;
  if (days <= 30) return roundScore(0.75);
  if (days <= 90) return roundScore(0.45);
  return roundScore(0.2);
}

function scoreSize(low, high) {
  const midpoint = (Number(low) + Number(high)) / 2;
  if (midpoint >= 1000000) return 1;
  if (midpoint >= 250000) return 0.8;
  if (midpoint >= 50000) return 0.62;
  if (midpoint >= 15000) return 0.42;
  return 0.22;
}

function scoreCommitteeRelevance(committees) {
  if (!Array.isArray(committees) || !committees.length) return 0.25;
  return 0.5;
}

function scoreCluster(count) {
  if (count >= 4) return 0.85;
  if (count === 3) return 0.65;
  if (count === 2) return 0.45;
  return 0.2;
}

function scoreConfidence(raw) {
  if (raw.confidenceScore !== undefined) return clampScore(raw.confidenceScore);
  if (raw.sourceUrl || raw.source_url || raw.filingUrl) return 0.72;
  return 0.45;
}

function countByTicker(records) {
  const counts = new Map();
  records.forEach((record) => {
    counts.set(record.ticker, (counts.get(record.ticker) || 0) + 1);
  });
  return counts;
}

function normalizeProviderName(value = "") {
  const text = String(value || "").trim().toLowerCase();
  if (["local", "local_file", "local-file", "csv", "json"].includes(text)) return POLITICIAN_TRADE_PROVIDER_TYPES.LOCAL_FILE;
  if (["senate", "senate-stock-watcher", "senatestockwatcher", "stock-watcher", "public-static", "public-static-dataset", "static-json"].includes(text)) {
    return POLITICIAN_TRADE_PROVIDER_TYPES.SENATE_STOCK_WATCHER;
  }
  if (["api", "future-api", "future"].includes(text)) return POLITICIAN_TRADE_PROVIDER_TYPES.FUTURE_API;
  if (["official", "official-disclosure-parser", "official-parser"].includes(text)) return POLITICIAN_TRADE_PROVIDER_TYPES.OFFICIAL_DISCLOSURE_PARSER;
  if (!text || ["mock", "demo", "sample"].includes(text)) return POLITICIAN_TRADE_PROVIDER_TYPES.MOCK;
  return text;
}

function truthy(value) {
  return ["1", "true", "yes", "on", "enabled"].includes(String(value || "").trim().toLowerCase());
}

function stableTradeId(parts) {
  return `politician-trade-${stableToken([
    parts.politicianName,
    parts.ticker,
    parts.transactionDate,
    parts.disclosureDate,
    parts.transactionType,
    parts.amountRangeLow,
    parts.amountRangeHigh,
    parts.owner
  ].join("-"))}`;
}

function stableToken(value) {
  return String(value || "trade")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "trade";
}

function requireString(value, label, errors) {
  if (!stringFrom(value)) errors.push(`${label} is required`);
}

function requireKnown(value, allowed, label, errors) {
  if (!allowed.has(value)) errors.push(`${label} must be one of ${[...allowed].join(", ")}`);
}

function requireScore(value, label, errors) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1) errors.push(`${label} must be a number from 0 to 1`);
}

function requireNonNegative(value, label, errors) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) errors.push(`${label} must be a non-negative number`);
}

function clampScore(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function roundScore(value) {
  return Math.round(clampScore(value) * 100) / 100;
}

function pruneEmpty(record) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => {
      if (Array.isArray(value)) return value.length > 0;
      if (value && typeof value === "object") return Object.keys(value).length > 0;
      return value !== undefined && value !== null && value !== "";
    })
  );
}
