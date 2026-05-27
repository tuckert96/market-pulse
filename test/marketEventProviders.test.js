import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDemoMarketEventDataset,
  buildMarketProviderStatuses,
  isSupportedMarketProvider,
  normalizeMarketProviderEvent
} from "../src/marketEventProviders.js";

test("market provider statuses show readiness without exposing secret values", () => {
  const statuses = buildMarketProviderStatuses({
    FINNHUB_API_KEY: "finnhub-secret",
    X_BEARER_TOKEN: "x-secret"
  });
  const text = JSON.stringify(statuses);

  assert.equal(statuses.demo.configured, true);
  assert.equal(statuses.demo.status, "mock");
  assert.equal(statuses.demo.dataFreshness, "mock");
  assert.equal(statuses.finnhub.configured, true);
  assert.equal(statuses.finnhub.liveEnabled, false);
  assert.equal(statuses.finnhub.liveProviderCalls, false);
  assert.equal(statuses.finnhub.status, "configured-disabled");
  assert.equal(statuses.newsApi.configured, false);
  assert.equal(statuses.newsApi.status, "not configured");
  assert.deepEqual(statuses.newsApi.missingEnv, ["NEWSAPI_KEY"]);
  assert.equal(text.includes("finnhub-secret"), false);
  assert.equal(text.includes("x-secret"), false);
});

test("configured X market provider remains disabled until a live adapter exists", () => {
  const statuses = buildMarketProviderStatuses({
    X_BEARER_TOKEN: "x-secret-value-that-should-not-render"
  });
  const dataset = buildDemoMarketEventDataset({
    env: { X_BEARER_TOKEN: "x-secret-value-that-should-not-render" },
    requestedProvider: "xApi"
  });

  assert.equal(statuses.xApi.configured, true);
  assert.equal(statuses.xApi.liveEnabled, false);
  assert.equal(statuses.xApi.mode, "not-implemented");
  assert.match(statuses.xApi.warning, /live calls are disabled/i);
  assert.equal(dataset.liveProviderCalls, false);
  assert.equal(dataset.providerStatuses.xApi.configured, true);
  assert.equal(dataset.providerStatuses.xApi.liveEnabled, false);
  assert.match(dataset.warnings.join(" "), /live calls are disabled/i);
  assert.equal(JSON.stringify(dataset).includes("x-secret-value-that-should-not-render"), false);
});

test("demo market dataset returns canonical events and missing-key warnings", () => {
  const dataset = buildDemoMarketEventDataset({ env: {}, requestedProvider: "newsApi" });

  assert.equal(dataset.mode, "demo");
  assert.equal(dataset.cacheStatus, "mock");
  assert.equal(dataset.dataFreshness, "mock");
  assert.equal(dataset.liveProviderCalls, false);
  assert.equal(dataset.exposesSecretValues, false);
  assert.ok(dataset.warnings.some((warning) => warning.includes("NEWSAPI_KEY")));
  assert.ok(dataset.events.length >= 5);
  assert.ok(dataset.events.every((event) => event.id && event.affectedTickers.length && event.staleAfter));
  assert.ok(dataset.events.every((event) => event.providerId === "demo" && event.sourceMode === "mock"));
});

test("provider event normalizer maps future provider-shaped rows into canonical signals", () => {
  const event = normalizeMarketProviderEvent({
    title: "Memory pricing firming after supply disruption",
    url: "https://example.test/memory",
    symbols: "MU SOXL",
    sourceType: "news",
    publishedAt: "2026-05-22T10:00:00-04:00",
    description: "Memory prices may firm after a supply disruption.",
    mechanism: "supply disruption -> tighter memory supply -> possible MU revenue and margin support",
    affectedDrivers: ["revenue", "margins"],
    evidenceGrade: "B"
  }, "newsApi");

  assert.equal(event.sourceName, "NewsAPI");
  assert.equal(event.providerId, "newsApi");
  assert.equal(event.providerLabel, "NewsAPI");
  assert.equal(event.sourceMode, "provider-adapter");
  assert.equal(event.liveProviderCalls, false);
  assert.equal(event.headline, "Memory pricing firming after supply disruption");
  assert.deepEqual(event.affectedTickers, ["MU", "SOXL"]);
  assert.equal(event.evidence[0].grade, "B");
  assert.match(event.businessMechanism, /tighter memory supply/);
});

test("market provider support check accepts known providers only", () => {
  assert.equal(isSupportedMarketProvider("demo"), true);
  assert.equal(isSupportedMarketProvider("finnhub"), true);
  assert.equal(isSupportedMarketProvider("madeUpProvider"), false);
});
