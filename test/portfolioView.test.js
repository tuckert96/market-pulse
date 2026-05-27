import test from "node:test";
import assert from "node:assert/strict";
import { analyzePortfolio } from "../src/portfolioAnalytics.js";
import {
  buildAffectedExposureSummary,
  buildAlphaSourceIssueRows,
  buildRankedAlphaHoldingRows,
  buildTickerDetailModel,
  dataSourceAvailabilityLabel,
  filterHoldings,
  marketDataBadgeClass,
  marketDataDiagnosticsHtml,
  marketDataFreshnessLine,
  marketDataQuoteSourceLabel,
  marketDataSourceAvailability,
  prepareHoldingsForView,
  portfolioImportSourceStatus,
  providerStatusDisplay,
  renderAffectedExposureSummary,
  renderTickerLink,
  safeExternalHref,
  sortHoldingsForView,
  tickerDetailHash
} from "../src/portfolioView.js";

test("affected exposure summary deduplicates tickers and compact-formats exposure", () => {
  const summary = buildAffectedExposureSummary({
    affectedTickers: ["MU", "SOXL", "NVDA", "AMD"],
    category: "supply-chain"
  }, [
    { ticker: "MU", marketValue: 100000, portfolioWeight: 0.2 },
    { ticker: "MU", marketValue: 25000, portfolioWeight: 0.05 },
    { ticker: "SOXL", marketValue: 50000, portfolioWeight: 0.1 },
    { ticker: "NVDA", marketValue: 20000, portfolioWeight: 0.04 },
    { ticker: "AMD", marketValue: 11750, portfolioWeight: 0.02 }
  ]);

  assert.equal(summary.compactValueLabel, "$206.8K");
  assert.deepEqual(summary.visibleTickers, ["MU", "SOXL", "NVDA", "AMD"]);
  assert.equal(new Set(summary.uniqueTickers).size, summary.uniqueTickers.length);
  assert.equal(summary.hiddenCount, 0);
  assert.equal(summary.impactTypeLabel, "Second-order");
});

test("affected exposure summary limits visible tickers", () => {
  const summary = buildAffectedExposureSummary({
    affectedTickers: ["A", "B", "C", "D", "E", "F", "G"],
    category: "theme"
  }, [
    { ticker: "A", marketValue: 7 },
    { ticker: "B", marketValue: 6 },
    { ticker: "C", marketValue: 5 },
    { ticker: "D", marketValue: 4 },
    { ticker: "E", marketValue: 3 },
    { ticker: "F", marketValue: 2 },
    { ticker: "G", marketValue: 1 }
  ]);

  assert.deepEqual(summary.visibleTickers, ["A", "B", "C", "D", "E", "F"]);
  assert.equal(summary.hiddenCount, 1);
  assert.equal(summary.impactTypeLabel, "Theme/direct");
});

test("affected exposure chips preserve value-sorted ticker order", () => {
  const summary = {
    compactValueLabel: "$206.8K",
    visibleTickers: ["SOXL", "MU", "AMD"],
    hiddenCount: 0,
    impactTypeLabel: "Second-order"
  };
  const html = renderAffectedExposureSummary(summary);

  assert.ok(html.indexOf("SOXL") < html.indexOf("MU"));
  assert.ok(html.indexOf("MU") < html.indexOf("AMD"));
});

test("external source links reject unsafe URL schemes", () => {
  assert.equal(safeExternalHref("https://example.test/source"), "https://example.test/source");
  assert.equal(safeExternalHref("http://example.test/source"), "http://example.test/source");
  assert.equal(safeExternalHref("#"), "#");
  assert.equal(safeExternalHref("javascript:alert(1)"), "#");
  assert.equal(safeExternalHref("data:text/html,bad"), "#");
  assert.equal(safeExternalHref("/relative/path"), "#");
});

test("provider and data source status helpers avoid misleading live labels", () => {
  assert.deepEqual(providerStatusDisplay({ configured: true, liveProviderCalls: false }), {
    className: "configured-pending",
    strong: "Not configured",
    detail: "Key detected; live calls disabled"
  });
  assert.deepEqual(providerStatusDisplay({ configured: true, liveProviderCalls: true }), {
    className: "configured",
    strong: "Configured",
    detail: "Key detected; waiting for a successful data refresh"
  });
  assert.deepEqual(providerStatusDisplay({ configured: false }), {
    className: "missing",
    strong: "Not configured",
    detail: "Not configured"
  });

  assert.deepEqual(marketDataSourceAvailability({ status: "mock/sample mode" }, {}), {
    configured: false,
    configuredPending: false,
    demoReady: true,
    label: "Sample",
    guidance: "Sample quote context only; no live market data was fetched."
  });
  assert.equal(marketDataSourceAvailability({ status: "connected", dataFreshness: "cached" }, {}).label, "Cached");
  assert.equal(marketDataSourceAvailability({ status: "stale data" }, {}).label, "Stale");
  assert.equal(marketDataSourceAvailability({ status: "error" }, {}).label, "Error");
  assert.equal(marketDataSourceAvailability({}, { configured: true }).label, "Not configured");
  assert.equal(dataSourceAvailabilityLabel({ configured: false, demoReady: true }), "Sample");
});

test("portfolio import status distinguishes clean, skipped, partial, and failed imports", () => {
  assert.deepEqual(portfolioImportSourceStatus(null), {
    status: "Sample/local only",
    configured: false,
    configuredPending: false,
    demoReady: true,
    className: "missing",
    label: "Sample",
    guidance: "Sample holdings are display-only until a real CSV is imported."
  });
  assert.equal(portfolioImportSourceStatus({
    realPortfolioImport: true,
    rejectedRows: [],
    health: { status: "Success" }
  }).status, "Imported");
  assert.equal(portfolioImportSourceStatus({
    realPortfolioImport: true,
    fileName: "holdings.json",
    rejectedRows: [],
    health: { status: "Success" }
  }).guidance, "Real holdings are loaded from a local portfolio import.");
  assert.equal(portfolioImportSourceStatus({
    realPortfolioImport: true,
    rejectedRows: [{ classification: "non-holding row" }],
    health: { status: "Partial success" }
  }).status, "Imported with 1 skipped non-holding row");
  const partial = portfolioImportSourceStatus({
    realPortfolioImport: true,
    rejectedRows: [{ classification: "needs review" }],
    health: { status: "Partial success" }
  });
  assert.equal(partial.status, "Imported with holding-row review");
  assert.equal(partial.configuredPending, true);
  assert.equal(partial.className, "configured-pending");
  assert.equal(portfolioImportSourceStatus(null, { uiState: "NO_DATA" }).status, "No portfolio loaded");
  assert.equal(portfolioImportSourceStatus(null, { uiState: "STALE_PERSISTED_REPAIRED" }).status, "Persisted local portfolio loaded");
  assert.equal(portfolioImportSourceStatus(null, { uiState: "STALE_PERSISTED_REPAIRED" }).label, "Imported");
});

test("market data badge class respects live, cached, stale, error, and mock status", () => {
  assert.equal(marketDataBadgeClass({ status: "connected", dataFreshness: "live" }), "safe");
  assert.equal(marketDataBadgeClass({ status: "connected", dataFreshness: "cached" }), "");
  assert.equal(marketDataBadgeClass({ status: "stale data" }), "sample");
  assert.equal(marketDataBadgeClass({ status: "error" }), "sample");
  assert.equal(marketDataBadgeClass({ status: "mock/sample mode" }), "demo");
});

test("market data source availability distinguishes partial and rate-limited provider states", () => {
  const partial = marketDataSourceAvailability({
    status: "partial data",
    label: "Partial market data",
    detail: "Live provider data returned for some requested tickers. Missing quotes: BAD."
  });
  const rateLimited = marketDataSourceAvailability({
    status: "rate limited",
    label: "Market data rate limited",
    detail: "Finnhub rate limit or quota response (429)."
  });

  assert.equal(partial.label, "Partial data");
  assert.match(partial.guidance, /Missing quotes: BAD/);
  assert.equal(rateLimited.label, "Rate limited");
  assert.match(rateLimited.guidance, /rate limit/i);
});

test("Alpha source issues stay visible when holding filters match rows", () => {
  const filtered = [
    { ticker: "MU", recommendationType: "possible add", title: "MU constructive setup" }
  ];
  const all = [
    ...filtered,
    {
      ticker: "",
      recommendationType: "stale data review",
      title: "Market data source needs review",
      summary: "Live provider status affects price-sensitive ranks.",
      href: "#data-sources"
    }
  ];
  const sourceIssues = buildAlphaSourceIssueRows(filtered, all);

  assert.ok(sourceIssues.some((row) => row.title === "Market data source needs review"));
});

test("market data source availability prefers stale/error freshness over connected status", () => {
  assert.deepEqual(marketDataSourceAvailability({
    status: "connected",
    dataFreshness: "stale",
    detail: "Last successful refresh is older than the quote TTL."
  }, {}), {
    configured: false,
    configuredPending: true,
    demoReady: false,
    label: "Stale",
    guidance: "Last successful refresh is older than the quote TTL."
  });
  assert.equal(marketDataSourceAvailability({
    status: "connected",
    label: "Provider error",
    detail: "Provider failed; serving previous cache."
  }, {}).label, "Error");
  assert.equal(marketDataSourceAvailability({
    status: "connected",
    detail: "Finnhub rate limit or quota response."
  }, {}).label, "Rate limited");
});

test("market data freshness line shows provider, timestamps, and last error", () => {
  const line = marketDataFreshnessLine({
    providerLabel: "Financial Modeling Prep",
    fetchedAt: "2026-05-23T16:00:00.000Z",
    asOf: "2026-05-23T15:59:00.000Z",
    lastSuccessfulRefresh: "2026-05-23T16:00:00.000Z",
    lastError: { message: "Provider returned no quote; using previous successful data." }
  });

  assert.match(line, /Provider: Financial Modeling Prep/);
  assert.match(line, /Fetched:/);
  assert.match(line, /As of:/);
  assert.match(line, /Last success:/);
  assert.match(line, /Last error: Provider returned no quote/);
});

test("market data diagnostics show request budget and deferred enrichment", () => {
  const html = marketDataDiagnosticsHtml({
    requestedTickers: ["MU", "NVDA", "AMD"],
    quoteDiagnostics: [
      { ticker: "MU", status: "connected", dataFreshness: "live", cacheStatus: "live", quote: "live", profile: "live", metric: "live", history: "live", missingFields: [], fetchedAt: "2026-05-23T16:00:00.000Z" },
      { ticker: "NVDA", status: "partial data", dataFreshness: "live", cacheStatus: "live", quote: "live", profile: "deferred", metric: "deferred", history: "skipped", missingFields: ["history"], fetchedAt: "2026-05-23T16:00:00.000Z" },
      { ticker: "AMD", status: "partial data", dataFreshness: "missing", cacheStatus: "missing", quote: "missing", profile: "missing", metric: "missing", history: "missing", missingFields: ["quote"], fetchedAt: null }
    ],
    cache: {
      status: "live",
      quoteCount: 3,
      liveCount: 3,
      requestBudget: { maxQuoteTickers: 50, enrichmentTickerLimit: 1 },
      deferredEnrichmentTickers: ["NVDA", "AMD"]
    }
  }, {
    selectedLabel: "Finnhub",
    configured: true
  });

  assert.match(html, /Request budget/);
  assert.match(html, /enrich first 1 tickers/);
  assert.match(html, /Deferred enrichment/);
  assert.match(html, /NVDA, AMD/);
  assert.match(html, /Per-ticker provider coverage/);
  assert.match(html, /MU/);
  assert.match(html, /Deferred/);
  assert.match(html, /Missing/);
  assert.match(html, /history/);
});

test("market data quote labels distinguish live cached stale and missing quote states", () => {
  assert.equal(marketDataQuoteSourceLabel({ status: "connected", dataFreshness: "live" }), "Live quote");
  assert.equal(marketDataQuoteSourceLabel({ status: "cached", dataFreshness: "cached" }), "Cached quote");
  assert.equal(marketDataQuoteSourceLabel({ status: "stale data", dataFreshness: "stale" }), "Stale quote");
  assert.equal(marketDataQuoteSourceLabel({ status: "partial data" }), "Partial data quote");
  assert.equal(marketDataQuoteSourceLabel({ status: "not configured" }), "Not configured quote");
});

test("affected exposure summary matches imported/provider tickers case-insensitively", () => {
  const summary = buildAffectedExposureSummary({
    affectedTickers: ["mu", "soxl"],
    category: "labor disruption"
  }, [
    { ticker: "MU", marketValue: 100000, portfolioWeight: 0.2 },
    { ticker: "soxl", marketValue: 50000, portfolioWeight: 0.1 },
    { ticker: "NVDA", marketValue: 20000, portfolioWeight: 0.04 }
  ]);

  assert.equal(summary.compactValueLabel, "$150K");
  assert.deepEqual(summary.visibleTickers, ["MU", "SOXL"]);
});

test("grouped ticker holdings keep a single ticker target instead of summing account rows", () => {
  const [mu] = prepareHoldingsForView([
    { ticker: "MU", account: "Taxable", shares: 3, marketValue: 300, costBasis: 240, portfolioWeight: 0.06, targetWeight: 0.2, riskLevel: "High", thesisStatus: "Current" },
    { ticker: "MU", account: "Roth IRA", shares: 2, marketValue: 200, costBasis: 160, portfolioWeight: 0.04, targetWeight: 0.2, riskLevel: "High", thesisStatus: "Current" }
  ], "ticker");

  assert.equal(mu.marketValue, 500);
  assert.equal(mu.portfolioWeight, 0.1);
  assert.equal(mu.targetWeight, 0.2);
  assert.equal(mu.drift, -0.1);
});

test("default holdings filter value behaves as account filtering", () => {
  const rows = [
    { ticker: "MU", account: "Taxable", shares: 10, price: 100, marketValue: 1000, portfolioWeight: 0.1 },
    { ticker: "NVDA", account: "Roth IRA", shares: 5, price: 200, marketValue: 1000, portfolioWeight: 0.1 }
  ];
  const filtered = filterHoldings(rows, { group: "all", groupValue: "Roth IRA" });

  assert.deepEqual(filtered.map((row) => row.ticker), ["NVDA"]);
});

test("Alpha Engine holdings rank scores owned tickers from strongest to weakest", () => {
  const rows = buildRankedAlphaHoldingRows([
    { ticker: "MU", name: "Micron", account: "Taxable", shares: 10, marketValue: 12000, portfolioWeight: 0.12, assetClass: "Equity", sector: "Semiconductors", riskLevel: "High", thesisStatus: "Active", confidenceLevel: "High", quant: 4.7 },
    { ticker: "SOXL", name: "Direxion Daily Semiconductor Bull 3X", account: "Roth", shares: 5, marketValue: 8000, portfolioWeight: 0.08, assetClass: "ETF", sector: "Leveraged ETF", riskLevel: "Very high", thesisStatus: "Needs review", isLeveragedEtf: true, leveragedMultiple: 3, quant: 2.3 },
    { ticker: "CASH", name: "Money Market", account: "Brokerage", shares: 1, marketValue: 5000, portfolioWeight: 0.05, assetClass: "Cash", riskLevel: "Low", thesisStatus: "N/A" }
  ], [
    { ticker: "MU", recommendationType: "possible add", title: "MU signal support", confidenceScore: 0.78, impactScore: 0.74, dataQualityScore: 0.72, sourceFreshnessScore: 0.68, sourceFreshness: "imported", supportingSignals: ["HBM demand supports thesis"], missingWeakSignals: [], compositeRankScore: 76 },
    { ticker: "SOXL", recommendationType: "trim risk", title: "SOXL leverage risk", confidenceScore: 0.7, impactScore: 0.8, riskScore: 0.9, concentrationRiskScore: 0.9, dataQualityScore: 0.58, sourceFreshnessScore: 0.62, supportingSignals: ["Semiconductor trend is positive"], missingWeakSignals: ["Leveraged ETF decay risk"], compositeRankScore: 82 }
  ], [
    { ticker: "MU", institutionalQuantScore: 86, institutionalQuantLabel: "High quality", institutionalQuantConfidenceScore: 78, institutionalQuantDataCoverageScore: 74, institutionalQuantStrengths: ["Revenue acceleration"], institutionalQuantFactors: [{ label: "Business quality", score: 88, weightedPoints: 17.6, coverageStatus: "covered", driver: "quality inputs support the rank" }], combinedScore: 72, priceMomentumScore: 0.72, relativeStrengthScore: 0.7, marketDataDailyChangePercent: 0.015, stockPredictionModelVersion: "transparent-stock-prediction-v1", stockPredictionScore: 74, stockPredictionLabel: "Favorable", stockPredictionHorizon: "20 trading days", stockPredictionConfidence: 68, stockPredictionConfidenceLabel: "Moderate confidence", stockPredictionTopDrivers: ["Price trend: 72/100"], stockPredictionGuardrail: "Decision support only. This is not a calibrated probability, return forecast, valuation target, or order instruction.", updatedAt: "2026-05-23T12:00:00Z" },
    { ticker: "SOXL", institutionalQuantScore: 43, institutionalQuantLabel: "Leverage lens", institutionalQuantConfidenceScore: 48, institutionalQuantDataCoverageScore: 46, institutionalQuantWeaknesses: ["Leverage amplifies drawdowns"], institutionalQuantMissingData: ["Underlying holdings detail"], combinedScore: 67, priceMomentumScore: 0.62, concentrationRiskScore: 0.8, isLeveragedEtf: true, leveragedMultiple: 3, updatedAt: "2026-05-23T12:00:00Z" }
  ], "all", "IMPORTED_CLEAN");

  assert.deepEqual(rows.map((row) => row.ticker), ["MU", "SOXL"]);
  assert.ok(rows[0].qualityScore > rows[1].qualityScore);
  assert.equal(rows[0].rank, 1);
  assert.equal(rows[0].reviewPriorityScore, 76);
  assert.equal(rows[0].academicCompositeScore, 86);
  assert.equal(rows[0].academicFactors[0].label, "Business quality");
  assert.equal(rows[0].prediction.label, "Favorable");
  assert.equal(rows[0].prediction.score, 74);
  assert.ok(rows[0].qualityBreakdown.some((item) => item.label === "Quant Lens" && item.points > 0));
  assert.ok(rows[0].qualityBreakdown.some((item) => item.label === "Risk penalty" && item.points <= 0));
  assert.match(rows[0].topReason, /quant|Thesis|support|impact|Data/i);
  assert.equal(rows[1].postureLabel, "Risk review");
  assert.ok(rows[1].missingWeakSignals.some((item) => /Leveraged|Underlying|decay/i.test(item)));
});

test("Alpha Engine quality rank uses Quant Lens academic factor discipline as a first-class input", () => {
  const holdings = [
    { ticker: "AAA", name: "Academic Leader", account: "Taxable", marketValue: 10000, portfolioWeight: 0.1, assetClass: "Equity", sector: "Technology", riskLevel: "Medium", thesisStatus: "Active", confidenceLevel: "High" },
    { ticker: "BBB", name: "Academic Lag", account: "Taxable", marketValue: 10000, portfolioWeight: 0.1, assetClass: "Equity", sector: "Technology", riskLevel: "Medium", thesisStatus: "Active", confidenceLevel: "High" }
  ];
  const tickerSignals = [
    {
      ticker: "AAA",
      institutionalQuantScore: 70,
      institutionalQuantAcademicCompositeScore: 88,
      institutionalQuantAcademicFactors: [{ label: "Momentum discipline", score: 91, weightedPoints: 22, paper: "Jegadeesh & Titman", driver: "canonical skip-period momentum support" }],
      institutionalQuantConfidenceScore: 80,
      institutionalQuantDataCoverageScore: 82,
      combinedScore: 50,
      updatedAt: "2026-05-23T12:00:00Z"
    },
    {
      ticker: "BBB",
      institutionalQuantScore: 70,
      institutionalQuantAcademicCompositeScore: 42,
      institutionalQuantAcademicFactors: [{ label: "Momentum discipline", score: 38, weightedPoints: 9, paper: "Jegadeesh & Titman", driver: "short history only" }],
      institutionalQuantAcademicValidationWarnings: ["12-1 / skip-period momentum history"],
      institutionalQuantConfidenceScore: 80,
      institutionalQuantDataCoverageScore: 82,
      combinedScore: 50,
      updatedAt: "2026-05-23T12:00:00Z"
    }
  ];

  const rows = buildRankedAlphaHoldingRows(holdings, [], tickerSignals, "all", "IMPORTED_CLEAN");

  assert.deepEqual(rows.map((row) => row.ticker), ["AAA", "BBB"]);
  assert.equal(rows[0].quantScore, rows[1].quantScore);
  assert.equal(rows[0].quantLensScore > rows[1].quantLensScore, true);
  assert.equal(rows[0].qualityScore > rows[1].qualityScore, true);
  assert.ok(rows[0].whyThisRank.some((reason) => /Academic factor discipline supports/i.test(reason)));
  assert.ok(rows[1].whyThisRank.some((reason) => /validation warnings/i.test(reason)));
});

test("Alpha Engine holdings rank filters risk, opportunities, and weak data", () => {
  const holdings = [
    { ticker: "MU", name: "Micron", account: "Taxable", marketValue: 12000, portfolioWeight: 0.12, assetClass: "Equity", riskLevel: "Medium", thesisStatus: "Active", quant: 4.8 },
    { ticker: "SOXL", name: "Leveraged semi ETF", account: "Roth", marketValue: 9000, portfolioWeight: 0.09, assetClass: "ETF", riskLevel: "Very high", thesisStatus: "Needs review", isLeveragedEtf: true, leveragedMultiple: 3, quant: 2.2 },
    { ticker: "XYZ", name: "Uncovered", account: "Taxable", marketValue: 3000, portfolioWeight: 0.03, assetClass: "Equity", riskLevel: "Low", thesisStatus: "Missing thesis" }
  ];
  const recommendations = [
    { ticker: "SOXL", recommendationType: "trim risk", riskScore: 0.9, concentrationRiskScore: 0.82, dataQualityScore: 0.6, sourceFreshnessScore: 0.62, confidenceScore: 0.7, impactScore: 0.8, compositeRankScore: 80 },
    { ticker: "XYZ", recommendationType: "stale data review", dataQualityScore: 0.2, sourceFreshness: "missing", sourceFreshnessScore: 0.2, confidenceScore: 0.2, missingWeakSignals: ["No market data"], compositeRankScore: 30 }
  ];
  const tickerSignals = [
    { ticker: "MU", institutionalQuantScore: 88, institutionalQuantDataCoverageScore: 80, institutionalQuantConfidenceScore: 74, combinedScore: 70, priceMomentumScore: 0.7 },
    { ticker: "SOXL", institutionalQuantScore: 41, institutionalQuantDataCoverageScore: 50, institutionalQuantConfidenceScore: 50, combinedScore: 64, concentrationRiskScore: 0.82, isLeveragedEtf: true },
    { ticker: "XYZ", institutionalQuantScore: 35, institutionalQuantDataCoverageScore: 16, institutionalQuantConfidenceScore: 18, institutionalQuantMissingData: ["No quote"], combinedScore: 22 }
  ];

  assert.deepEqual(buildRankedAlphaHoldingRows(holdings, recommendations, tickerSignals, "risk", "IMPORTED_CLEAN").map((row) => row.ticker), ["SOXL"]);
  assert.deepEqual(buildRankedAlphaHoldingRows(holdings, recommendations, tickerSignals, "opportunities", "IMPORTED_CLEAN").map((row) => row.ticker), ["MU"]);
  assert.deepEqual(buildRankedAlphaHoldingRows(holdings, recommendations, tickerSignals, "data-issues", "IMPORTED_CLEAN").map((row) => row.ticker), ["XYZ"]);
  const weakDataRow = buildRankedAlphaHoldingRows(holdings, recommendations, tickerSignals, "all", "IMPORTED_CLEAN").find((row) => row.ticker === "XYZ");
  assert.ok(weakDataRow.dataQualityScore < 0.45);
  assert.equal(weakDataRow.postureLabel, "Weak data");
});

test("Alpha Engine quality rank is capped when evidence coverage is weak", () => {
  const rows = buildRankedAlphaHoldingRows([
    { ticker: "THIN", name: "Thin Evidence Co", account: "Taxable", marketValue: 15000, portfolioWeight: 0.15, assetClass: "Equity", riskLevel: "Medium", thesisStatus: "Active", confidenceLevel: "High", quant: 5 }
  ], [
    { ticker: "THIN", recommendationType: "possible add", confidenceScore: 0.95, impactScore: 0.95, dataQualityScore: 0.2, sourceFreshnessScore: 0.9, supportingSignals: ["Strong headline signal"], missingWeakSignals: ["No live quote", "No fundamentals", "No history", "No thesis review"], compositeRankScore: 90 }
  ], [
    { ticker: "THIN", institutionalQuantScore: 96, institutionalQuantConfidenceScore: 95, institutionalQuantDataCoverageScore: 18, institutionalQuantMissingData: ["No live quote", "No fundamentals", "No history"], combinedScore: 90, priceMomentumScore: 0.95 }
  ], "all", "IMPORTED_CLEAN");

  assert.equal(rows[0].qualityCap, 64);
  assert.equal(rows[0].qualityScore <= 64, true);
  assert.notEqual(rows[0].postureLabel, "Strong");
});

test("Alpha Engine quality rank does not change from prediction sidecar score alone", () => {
  const holding = { ticker: "MU", name: "Micron", account: "Taxable", marketValue: 12000, portfolioWeight: 0.12, assetClass: "Equity", riskLevel: "Medium", thesisStatus: "Active", confidenceLevel: "High" };
  const baseSignal = { ticker: "MU", institutionalQuantScore: 82, institutionalQuantDataCoverageScore: 78, institutionalQuantConfidenceScore: 76, combinedScore: 70, priceMomentumScore: 0.65, updatedAt: "2026-05-23T12:00:00Z" };
  const lowPrediction = buildRankedAlphaHoldingRows([holding], [], [{ ...baseSignal, stockPredictionScore: 20, stockPredictionLabel: "Weak" }], "all", "IMPORTED_CLEAN")[0];
  const highPrediction = buildRankedAlphaHoldingRows([holding], [], [{ ...baseSignal, stockPredictionScore: 95, stockPredictionLabel: "Strong" }], "all", "IMPORTED_CLEAN")[0];

  assert.equal(lowPrediction.qualityScore, highPrediction.qualityScore);
  assert.notEqual(lowPrediction.prediction.score, highPrediction.prediction.score);
});

test("Alpha Engine watchlist filter shows owned holdings with saved watchlist context", () => {
  const holdings = [
    { ticker: "MU", name: "Micron", account: "Taxable", marketValue: 12000, portfolioWeight: 0.12, assetClass: "Equity", riskLevel: "Medium", thesisStatus: "Active", quant: 4.8 },
    { ticker: "SOXL", name: "Leveraged semi ETF", account: "Roth", marketValue: 9000, portfolioWeight: 0.09, assetClass: "ETF", riskLevel: "Very high", thesisStatus: "Needs review", isLeveragedEtf: true, leveragedMultiple: 3, quant: 2.2 }
  ];
  const recommendations = [
    { ticker: "MU", recommendationType: "review position", title: "Watchlist catalyst still open", summary: "Owned holding has a saved watchlist catalyst.", dataQualityScore: 0.7, sourceFreshnessScore: 0.7, confidenceScore: 0.7, compositeRankScore: 66 }
  ];
  const tickerSignals = [
    { ticker: "MU", institutionalQuantScore: 80, institutionalQuantDataCoverageScore: 72, institutionalQuantConfidenceScore: 68, combinedScore: 66, watchlistFlag: true },
    { ticker: "SOXL", institutionalQuantScore: 41, institutionalQuantDataCoverageScore: 50, institutionalQuantConfidenceScore: 50, combinedScore: 64 }
  ];

  const rows = buildRankedAlphaHoldingRows(holdings, recommendations, tickerSignals, "watchlist", "IMPORTED_CLEAN");

  assert.deepEqual(rows.map((row) => row.ticker), ["MU"]);
  assert.equal(rows[0].watchlistLinked, true);
});

test("holdings table sort helper orders numeric and text columns", () => {
  const holdings = [
    { ticker: "MU", account: "Taxable", marketValue: 1000, portfolioWeight: 0.1 },
    { ticker: "NVDA", account: "Roth IRA", marketValue: 3000, portfolioWeight: 0.3 },
    { ticker: "AMD", account: "HSA", marketValue: 2000, portfolioWeight: 0.2 }
  ];

  assert.deepEqual(sortHoldingsForView(holdings, "marketValue", -1).map((holding) => holding.ticker), ["NVDA", "AMD", "MU"]);
  assert.deepEqual(sortHoldingsForView(holdings, "ticker", 1).map((holding) => holding.ticker), ["AMD", "MU", "NVDA"]);
  assert.deepEqual(sortHoldingsForView(holdings, "account", 1).map((holding) => holding.account), ["HSA", "Roth IRA", "Taxable"]);
});

test("holdings earnings sort keeps missing dates after dated events", () => {
  const holdings = [
    { ticker: "NO_DATE", nextEarnings: "" },
    { ticker: "LATER", nextEarnings: "2026-06-01" },
    { ticker: "SOONER", nextEarnings: "2026-05-28" }
  ];

  assert.deepEqual(sortHoldingsForView(holdings, "nextEarnings", 1).map((holding) => holding.ticker), ["SOONER", "LATER", "NO_DATE"]);
});

test("ticker route helpers produce native links without fake keyboard traps", () => {
  assert.equal(tickerDetailHash("mu"), "#/ticker/MU");
  assert.match(renderTickerLink("MU"), /href="#\/ticker\/MU"/);
  assert.match(renderTickerLink("MU"), /data-ticker-link="MU"/);
  assert.doesNotMatch(renderTickerLink("UNKNOWN"), /<a /);
  assert.doesNotMatch(renderTickerLink("MU"), /role="link"|tabindex="0"/);
});

test("ticker detail model separates owned and watchlist-only ticker states", () => {
  const analysis = {
    overview: { totalValue: 5000 },
    holdings: [
      { ticker: "MU", name: "Micron", account: "Taxable", shares: 10, marketValue: 1200, dailyChange: 18, costBasis: 900, portfolioWeight: 0.24, sector: "Semiconductors", assetClass: "Equity", riskLevel: "High", thesisStatus: "Current" }
    ],
    alerts: [{ id: "a1", ticker: "MU", title: "MU needs review", detail: "Position size above target", severity: "high" }]
  };
  const options = {
    selectedTicker: "MU",
    marketDataSnapshot: {
      status: { status: "mock/sample mode", label: "Sample market data" },
      quotesByTicker: {
        MU: {
          ticker: "MU",
          name: "Micron",
          price: 132.1,
          dailyChange: 2.1,
          dailyChangePercent: 0.016,
          marketCap: 146000000000,
          volume: 42100000,
          sector: "Semiconductors",
          industry: "Memory",
          sourceMode: "mock",
          historicalPrices: [
            { date: "2026-05-20", close: 121 },
            { date: "2026-05-21", close: 126 },
            { date: "2026-05-22", close: 132.1 }
          ]
        },
        PLTR: { ticker: "PLTR", name: "Palantir", price: 25, dailyChange: 0.5, sourceMode: "mock", historicalPrices: [{ date: "2026-05-21", close: 24 }, { date: "2026-05-22", close: 25 }] },
        TSLA: { ticker: "TSLA", name: "Tesla", price: 198, dailyChange: -1.5, sourceMode: "mock", historicalPrices: [{ date: "2026-05-21", close: 201 }, { date: "2026-05-22", close: 198 }] }
      }
    },
    tickerSignals: [
      { ticker: "MU", combinedScore: 73, actionCategory: "Monitor", topHeadline: "MU sample context", marketDataLabel: "Sample quote" },
      { ticker: "PLTR", combinedScore: 51, actionCategory: "Log Only", topHeadline: "Watchlist-only row", marketDataLabel: "Sample quote", watchlistFlag: true },
      { ticker: "TSLA", combinedScore: 46, actionCategory: "Log Only", topHeadline: "Signal-discovered row", marketDataLabel: "Sample quote" },
      { ticker: "NQTE", combinedScore: 44, actionCategory: "Log Only", topHeadline: "Signal without quote", marketDataLabel: "Missing quote" }
    ],
    allWatchlistIdeaRows: [
      { ticker: "PLTR", status: "candidate", conviction: "Medium", thesis: "Saved watchlist idea", catalyst: "Manual check", sector: "Software", saved: true, derived: false },
      { ticker: "TSLA", status: "watching", conviction: "Low", thesis: "Derived signal draft", catalyst: "Signal context", sector: "Autos", signalSource: "ticker-signal", saved: false, derived: true },
      { ticker: "NQTE", status: "watching", conviction: "Low", thesis: "Derived signal without quote", catalyst: "Signal context", sector: "Unknown", signalSource: "ticker-signal", saved: false, derived: true }
    ],
    redditMentions: [
      { id: "r1", ticker: "MU", extractedTickers: ["MU"], subreddit: "stocks", title: "MU HBM demand discussion", createdAt: "2026-05-23T12:00:00Z", detectedAt: "2026-05-23T12:00:00Z", engagementScore: 10, score: 42, sentiment: "bullish", sourceMode: "mock" },
      { id: "r2", ticker: "PLTR", extractedTickers: ["PLTR"], subreddit: "investing", title: "PLTR watchlist thread", createdAt: "2026-05-23T10:00:00Z", detectedAt: "2026-05-23T10:00:00Z", engagementScore: 6, score: 11, sentiment: "neutral", sourceMode: "local-file" }
    ],
    politicianTrades: [
      { ticker: "MU", politicianName: "Older Member", transactionType: "sale", transactionDate: "2026-05-18", disclosureDate: "2026-05-20", amountRangeLow: 1000, amountRangeHigh: 15000, sourceMode: "mock" },
      { ticker: "MU", politicianName: "Imported Member", transactionType: "purchase", transactionDate: "2026-05-21", disclosureDate: "2026-05-22", amountRangeLow: 1000, amountRangeHigh: 15000, sourceMode: "local-file", source: "local-politician-trade-import" }
    ],
    thesisRows: [{
      ticker: "MU",
      thesisStatus: "Current",
      confidenceLevel: "High",
      whyOwned: "Memory cycle",
      nextReviewTrigger: "Earnings",
      bullishAssumptions: ["HBM demand grows"],
      keyRisks: ["Pricing rolls over"],
      invalidationCriteria: ["Margins stall"],
      whatWouldMakeMeTrim: "Position above target with weaker evidence"
    }],
    alphaSignals: [{ primaryTicker: "MU", affectedTickers: ["MU"], headline: "MU signal", priorityScore: 0.7, actionabilityReason: "Monitor" }],
    marketEvents: [],
    uiState: "IMPORTED_CLEAN",
    allCalendarEvents: [
      { id: "event-mu", ticker: "MU", tickers: ["MU"], eventType: "earnings", date: "2026-06-01", title: "MU imported earnings", importance: "high", sourceMode: "imported", sourceLabel: "Imported calendar file", detectedAt: "2026-05-23T12:00:00Z" },
      { id: "event-pltr", ticker: "PLTR", tickers: ["PLTR"], eventType: "custom", date: "2026-06-08", title: "PLTR watchlist check", importance: "medium", sourceMode: "manual", sourceLabel: "Manual calendar", detectedAt: "2026-05-23T12:00:00Z" }
    ]
  };
  const owned = buildTickerDetailModel(analysis, options);
  const watchlist = buildTickerDetailModel(analysis, { ...options, selectedTicker: "PLTR" });
  const signalOnly = buildTickerDetailModel(analysis, { ...options, selectedTicker: "TSLA" });
  const signalWithoutQuote = buildTickerDetailModel(analysis, { ...options, selectedTicker: "NQTE" });

  assert.equal(owned.ticker, "MU");
  assert.equal(owned.owned, true);
  assert.equal(owned.marketValue, 1200);
  assert.equal(owned.researchLens.ticker, "MU");
  assert.equal(owned.researchLens.buffettChecklist.securityKind, "operating-company");
  assert.ok(owned.researchLens.buffettChecklist.summary.includes("MU"));
  assert.ok(owned.researchLens.sourceSummary.missing.some((item) => /cash flow|free-cash-flow|debt|valuation|profitability|growth/i.test(item)));
  assert.equal(owned.accounts[0].account, "Taxable");
  assert.equal(owned.alerts.length, 1);
  assert.equal(owned.redditSummary.sevenDayMentions, 1);
  assert.equal(owned.redditMentions.length, 1);
  assert.equal(owned.redditMentions[0].subreddit, "stocks");
  assert.equal(owned.politicianTrades.length, 2);
  assert.equal(owned.politicianTrades[0].politicianName, "Imported Member");
  assert.equal(owned.politicianTrades[0].sourceMode, "local-file");
  assert.equal(owned.calendarEvents.length, 1);
  assert.equal(owned.calendarEvents[0].sourceMode, "imported");
  assert.equal(owned.historicalPrices.length, 3);
  assert.equal(owned.technicalAnalysis.status, "available");
  assert.equal(owned.technicalAnalysis.pointCount, 3);
  assert.match(owned.technicalAnalysis.summary, /MU is up across 3 available price points/);
  assert.ok(owned.technicalAnalysis.missingData.some((item) => /Only 3 historical price points/.test(item)));
  assert.equal(owned.movementExplainer.ticker, "MU");
  assert.match(owned.movementExplainer.summary, /MU is up/);
  assert.ok(owned.movementExplainer.drivers.some((driver) => driver.id === "price-action"));
  assert.ok(owned.movementExplainer.drivers.some((driver) => driver.id === "reddit-attention"));
  assert.equal(owned.dataQuality.rows.some((row) => row.label === "Historical prices" && row.status === "3 points"), true);
  assert.equal(owned.dataQuality.rows.some((row) => row.label === "Thesis notes" && row.status === "Current"), true);
  assert.equal(watchlist.ticker, "PLTR");
  assert.equal(watchlist.owned, false);
  assert.equal(watchlist.tracked, true);
  assert.equal(watchlist.watchlistOnly, true);
  assert.equal(watchlist.savedWatchlistIdea, true);
  assert.equal(watchlist.externallyDiscovered, false);
  assert.equal(watchlist.marketValue, 0);
  assert.equal(watchlist.quote.price, 25);
  assert.equal(watchlist.historicalPrices.length, 2);
  assert.equal(watchlist.calendarEvents.length, 1);
  assert.equal(watchlist.calendarEvents[0].sourceLabel, "Manual calendar");
  assert.equal(watchlist.dataQuality.rows.some((row) => row.label === "Position data" && row.status === "watchlist only"), true);
  assert.equal(signalOnly.ticker, "TSLA");
  assert.equal(signalOnly.owned, false);
  assert.equal(signalOnly.watchlistOnly, false);
  assert.equal(signalOnly.derivedSignalIdea, true);
  assert.equal(signalOnly.externallyDiscovered, true);
  assert.equal(signalOnly.dataQuality.rows.some((row) => row.label === "Position data" && row.status === "signal-discovered"), true);
  assert.equal(signalWithoutQuote.ticker, "NQTE");
  assert.equal(signalWithoutQuote.owned, false);
  assert.equal(signalWithoutQuote.watchlistOnly, false);
  assert.equal(signalWithoutQuote.externallyDiscovered, true);
  assert.equal(signalWithoutQuote.priceAvailable, false);
  assert.equal(signalWithoutQuote.dailyChangeAvailable, false);
  assert.equal(signalWithoutQuote.movementExplainer.movementLabel, "Move unavailable");
  assert.equal(signalWithoutQuote.movementExplainer.drivers.some((driver) => driver.id === "price-action"), false);
  assert.equal(signalWithoutQuote.dataQuality.rows.some((row) => row.label === "Quote summary" && row.status === "missing"), true);
});

test("ticker detail defaults to no real ownership without an explicit imported ui state", () => {
  const analysis = analyzePortfolio([
    { ticker: "MU", name: "Micron", account: "Sample", shares: 10, price: 100, marketValue: 1000, assetClass: "Equity", sector: "Semiconductors" }
  ]);
  const model = buildTickerDetailModel(analysis, { selectedTicker: "MU" });

  assert.equal(model.owned, false);
  assert.equal(model.samplePosition, true);
  assert.equal(model.positionSource, "Sample");
});

test("ticker detail does not invent flat movement for owned rows without quote or daily-change data", () => {
  const model = buildTickerDetailModel({
    overview: { totalValue: 1000 },
    holdings: [
      { ticker: "XYZ", name: "Imported Holding", account: "Taxable", shares: 10, price: 100, marketValue: 1000, dailyChange: 0, dailyChangePercent: 0, sector: "Industrials", assetClass: "Equity" }
    ],
    alerts: []
  }, {
    selectedTicker: "XYZ",
    marketDataSnapshot: { quotesByTicker: {}, status: { status: "not configured" } },
    marketDataStatus: { status: "not configured" },
    tickerSignals: [],
    allWatchlistIdeaRows: [],
    uiState: "IMPORTED_CLEAN"
  });

  assert.equal(model.owned, true);
  assert.equal(model.priceAvailable, true);
  assert.equal(model.dailyChangeAvailable, false);
  assert.equal(model.movementExplainer.movementLabel, "Move unavailable");
  assert.equal(model.movementExplainer.drivers.some((driver) => driver.id === "price-action"), false);
});
