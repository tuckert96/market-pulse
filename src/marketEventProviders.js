import { demoAlphaEvents, normalizeAlphaEvent } from "./alphaEngine.js";
import { isUsableCredentialValue } from "./configValueSafety.js";

export const MARKET_PROVIDER_SPECS = Object.freeze({
  demo: {
    id: "demo",
    label: "Sample Signal Pack",
    requiredEnv: [],
    sourceTypes: ["news", "price", "macro", "social"],
    trustLevel: "mixed",
    defaultEvidenceGrade: "C",
    liveEnabled: false
  },
  finnhub: {
    id: "finnhub",
    label: "Finnhub",
    requiredEnv: ["FINNHUB_API_KEY"],
    sourceTypes: ["news", "social"],
    trustLevel: "medium",
    defaultEvidenceGrade: "B",
    liveEnabled: false
  },
  alphaVantage: {
    id: "alphaVantage",
    label: "Alpha Vantage",
    requiredEnv: ["ALPHA_VANTAGE_API_KEY"],
    sourceTypes: ["news", "sentiment", "price"],
    trustLevel: "medium",
    defaultEvidenceGrade: "B",
    liveEnabled: false
  },
  newsApi: {
    id: "newsApi",
    label: "NewsAPI",
    requiredEnv: ["NEWSAPI_KEY"],
    sourceTypes: ["news"],
    trustLevel: "medium",
    defaultEvidenceGrade: "B",
    liveEnabled: false
  },
  polygon: {
    id: "polygon",
    label: "Polygon",
    requiredEnv: ["POLYGON_API_KEY"],
    sourceTypes: ["news", "price"],
    trustLevel: "medium-high",
    defaultEvidenceGrade: "B",
    liveEnabled: false
  },
  xApi: {
    id: "xApi",
    label: "X API",
    requiredEnv: ["X_BEARER_TOKEN"],
    sourceTypes: ["social"],
    trustLevel: "low",
    defaultEvidenceGrade: "D",
    liveEnabled: false
  }
});

export function supportedMarketProviderIds() {
  return Object.keys(MARKET_PROVIDER_SPECS);
}

export function isSupportedMarketProvider(providerId) {
  return supportedMarketProviderIds().includes(providerId);
}

export function buildMarketProviderStatuses(env = {}) {
  return Object.fromEntries(
    Object.values(MARKET_PROVIDER_SPECS).map((spec) => {
      const missingEnv = spec.requiredEnv.filter((key) => !isUsableCredentialValue(env[key]));
      return [spec.id, {
        id: spec.id,
        label: spec.label,
        status: providerStatus(spec, missingEnv),
        configured: missingEnv.length === 0,
        liveEnabled: spec.liveEnabled,
        liveProviderCalls: false,
        mode: spec.id === "demo" ? "demo" : "not-implemented",
        dataFreshness: spec.id === "demo" ? "mock" : "disabled",
        cacheStatus: "not-applicable",
        sourceTypes: spec.sourceTypes,
        trustLevel: spec.trustLevel,
        requiredEnv: spec.requiredEnv,
        missingEnv,
        warning: providerWarning(spec, missingEnv)
      }];
    })
  );
}

export function buildDemoMarketEventDataset({ env = {}, requestedProvider = "all" } = {}) {
  const providerStatuses = buildMarketProviderStatuses(env);
  const providerIds = requestedProvider === "all"
    ? supportedMarketProviderIds()
    : [requestedProvider];
  const warnings = providerIds
    .map((providerId) => providerStatuses[providerId]?.warning)
    .filter(Boolean);
  const generatedAt = new Date().toISOString();
  const events = demoAlphaEvents().map((event) => normalizeMarketProviderEvent(event, "demo"));

  return {
    mode: "demo",
    requestedProvider,
    generatedAt,
    fetchedAt: generatedAt,
    dataFreshness: "mock",
    cacheStatus: "mock",
    sourceMode: "mock",
    liveProviderCalls: false,
    exposesSecretValues: false,
    providerStatuses,
    warnings,
    events,
    message: "Sample market-event adapter response. Live provider calls are disabled until Tucker approves provider scopes, credentials, and retention."
  };
}

export function normalizeMarketProviderEvent(raw = {}, providerId = "demo") {
  const spec = MARKET_PROVIDER_SPECS[providerId] || MARKET_PROVIDER_SPECS.demo;
  const tickers = normalizeTickers(raw.tickers || raw.tickersMentioned || raw.symbols);
  const inferred = normalizeTickers(raw.inferredTickersAffected || raw.affectedTickers || raw.relatedTickers);
  const evidenceGrade = raw.evidenceGrade || raw.grade || spec.defaultEvidenceGrade;
  const detectedAt = raw.detectedAt || new Date().toISOString();

  const event = normalizeAlphaEvent({
    id: raw.id || `${spec.id}-${stableToken(raw.headline || raw.title || raw.url || Date.now())}`,
    timestamp: raw.timestamp || raw.publishedAt || raw.datetime || new Date().toISOString(),
    detectedAt,
    sourceType: raw.sourceType || firstSourceType(spec),
    sourceName: raw.sourceName || raw.source || spec.label,
    sourceUrl: raw.sourceUrl || raw.url || "",
    headline: raw.headline || raw.title || "Untitled market event",
    summary: raw.summary || raw.description || raw.rawText || "",
    rawText: raw.rawText || raw.content || raw.summary || raw.description || "",
    tickersMentioned: tickers,
    inferredTickersAffected: inferred.length ? inferred : tickers,
    sectorsAffected: raw.sectorsAffected || raw.sectors || [],
    themes: raw.themes || [],
    eventType: raw.eventType || raw.category || "provider event",
    geography: raw.geography || "",
    entities: raw.entities || [],
    sentiment: raw.sentiment || "unknown",
    confidence: raw.confidence,
    noveltyScore: raw.noveltyScore,
    credibilityScore: raw.credibilityScore ?? credibilityForSpec(spec),
    relevanceScore: raw.relevanceScore,
    marketImpactScore: raw.marketImpactScore,
    expectedDirectionByTicker: raw.expectedDirectionByTicker || {},
    scenarioImpactByTicker: raw.scenarioImpactByTicker || {},
    timeHorizon: raw.timeHorizon || "unknown",
    evidence: raw.evidence || [{ grade: evidenceGrade, text: evidenceTextForSpec(spec) }],
    supportingEvidence: raw.supportingEvidence || [],
    contradictingEvidence: raw.contradictingEvidence || [],
    missingEvidence: raw.missingEvidence || defaultMissingEvidenceForProvider(spec),
    counterarguments: raw.counterarguments || [],
    followUpQuestions: raw.followUpQuestions || ["What primary evidence would confirm this item is material to Tucker's holdings?"],
    whatToMonitorNext: raw.whatToMonitorNext || raw.followUpQuestions || ["source confirmation", "affected holding price action", "estimate revisions"],
    staleAfter: raw.staleAfter,
    factualClaim: raw.factualClaim || raw.summary || raw.description || raw.headline || raw.title || "",
    interpretation: raw.interpretation || "",
    businessMechanism: raw.businessMechanism || raw.mechanism || "",
    affectedDrivers: raw.affectedDrivers || [],
    impactOrderByTicker: raw.impactOrderByTicker || {},
    thesisImpactByTicker: raw.thesisImpactByTicker || {},
    priceAction: raw.priceAction || { status: "unknown", explanation: "Price-action adapter: Not configured." }
  });

  return {
    ...event,
    providerId: spec.id,
    providerLabel: spec.label,
    sourceMode: raw.sourceMode || (spec.id === "demo" ? "mock" : "provider-adapter"),
    dataFreshness: raw.dataFreshness || (spec.id === "demo" ? "mock" : "disabled"),
    cacheStatus: raw.cacheStatus || "not-applicable",
    fetchedAt: raw.fetchedAt || detectedAt,
    liveProviderCalls: Boolean(raw.liveProviderCalls && spec.liveEnabled)
  };
}

function providerWarning(spec, missingEnv) {
  if (spec.id === "demo") return "Sample mode uses synthetic local events and needs no API key.";
  if (missingEnv.length) return `${spec.label} is not configured. Missing: ${missingEnv.join(", ")}. Sample events remain available.`;
  return `${spec.label} key is present, but live calls are disabled until Tucker approves provider implementation.`;
}

function providerStatus(spec, missingEnv) {
  if (spec.id === "demo") return "mock";
  if (missingEnv.length) return "not configured";
  return spec.liveEnabled ? "configured" : "configured-disabled";
}

function firstSourceType(spec) {
  return spec.sourceTypes[0] === "sentiment" ? "news" : spec.sourceTypes[0] || "manual";
}

function credibilityForSpec(spec) {
  return {
    "medium-high": 0.82,
    medium: 0.68,
    mixed: 0.55,
    low: 0.22
  }[spec.trustLevel] || 0.45;
}

function evidenceTextForSpec(spec) {
  if (spec.trustLevel === "low") return `${spec.label} is treated as lower-trust social input until confirmed by primary or reputable sources.`;
  return `${spec.label} event normalized through the local adapter contract. Live source verification is not enabled yet.`;
}

function defaultMissingEvidenceForProvider(spec) {
  if (spec.trustLevel === "low") {
    return ["primary source", "reputable confirmation", "material connection to holding", "price-action confirmation"];
  }
  return ["source confirmation", "materiality estimate", "price-action confirmation", "thesis impact review"];
}

function normalizeTickers(values = []) {
  const list = Array.isArray(values) ? values : String(values || "").split(/[,\s]+/);
  return [...new Set(list.map((value) => String(value || "").trim().toUpperCase()).filter(Boolean))];
}

function stableToken(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "event";
}
