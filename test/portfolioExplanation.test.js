import test from "node:test";
import assert from "node:assert/strict";
import {
  buildExplanationReviewMode,
  buildPortfolioExplanationFallback,
  sanitizePortfolioExplanationInput
} from "../src/portfolioExplanation.js";

test("explanation review mode keeps deterministic facts visible beside optional generated text", () => {
  const fallback = buildPortfolioExplanationFallback({
    overview: { totalValue: 250000 },
    risk: { top10Weight: 0.72 },
    holdings: [{ ticker: "MU", marketValue: 65000, portfolioWeight: 0.26 }],
    alerts: [{ title: "MU concentration review" }],
    sourceStatuses: { portfolio: "Imported", marketData: "Cached" },
    marketDataStatus: { label: "Cached Finnhub quotes" }
  });

  const review = buildExplanationReviewMode(fallback, {
    openai: { configured: true, liveProviderCalls: true, status: "connected", model: "gpt-test" },
    generatedText: "Generated summary: review concentration and source freshness.",
    generatedStatus: "generated",
    model: "gpt-test"
  });

  assert.equal(review.mode, "side-by-side-review");
  assert.equal(review.deterministic.label, "Deterministic source facts");
  assert.match(review.deterministic.summary, /local explanation/i);
  assert.ok(review.deterministic.bullets.some((item) => /holding/.test(item)));
  assert.equal(review.generated.label, "Optional generated summary");
  assert.equal(review.generated.status, "generated");
  assert.match(review.generated.narrative, /review concentration/i);
  assert.ok(review.sourceLabels.some((item) => /Portfolio: Imported/.test(item)));
  assert.ok(review.safetyNotes.some((item) => /No buy\/sell/.test(item)));
});

test("explanation review mode lists missing context when generated text is unavailable", () => {
  const fallback = buildPortfolioExplanationFallback({
    marketDataStatus: { status: "not configured" },
    sourceStatuses: { portfolio: "No data loaded" }
  });

  const review = buildExplanationReviewMode(fallback, {
    openai: { configured: false, status: "not configured" },
    generatedStatus: "not configured"
  });

  assert.equal(review.generated.narrative, null);
  assert.equal(review.generated.status, "not configured");
  assert.match(review.generated.unavailableReason, /not configured/i);
  assert.ok(review.missingContext.some((item) => /No holdings/.test(item)));
  assert.ok(review.missingContext.some((item) => /Market data/.test(item)));
  assert.ok(review.safetyNotes.some((item) => /Missing context is listed/.test(item)));
});

test("explanation review mode redacts generated secret-shaped text", () => {
  const fallback = buildPortfolioExplanationFallback({
    holdings: [{ ticker: "NVDA", accountNumber: "123456789", account: "Brokerage 123456789", marketValue: 1000 }]
  });

  const review = buildExplanationReviewMode(fallback, {
    generatedText: "Leaked api_key=provider-demo-secret and Bearer tokenvalue",
    extraSecrets: ["provider-demo-secret"]
  });
  const text = JSON.stringify(review);

  assert.equal(text.includes("provider-demo-secret"), false);
  assert.equal(text.includes("tokenvalue"), false);
  assert.match(review.generated.narrative, /\[redacted\]/);
});

test("portfolio explanation sanitizer masks account identifiers before review data is built", () => {
  const sanitized = sanitizePortfolioExplanationInput({
    holdings: [{ ticker: "MU", accountId: "acct-123456789", account: "Fidelity 123456789", marketValue: 5000 }],
    sourceStatuses: { secret_token: "do-not-keep-this-secret" }
  });
  const text = JSON.stringify(sanitized);

  assert.equal(text.includes("123456789"), false);
  assert.equal(text.includes("do-not-keep-this-secret"), false);
  assert.match(text, /Account ending 6789|•••••6789/);
});
