import test from "node:test";
import assert from "node:assert/strict";
import {
  buildExternalSignals,
  externalSignalsFromFederalTrades,
  externalSignalsFromRedditMentions,
  normalizeExternalSignal,
  validateExternalSignal
} from "../src/externalSignals.js";

const asOf = "2026-05-27T09:30:00-04:00";

test("X updates normalize as local-first records and block scraped/live modes", () => {
  const signal = normalizeExternalSignal({
    sourceType: "x",
    sourceMode: "scraped-browser-session",
    ticker: "$MU",
    text: "$MU HBM rumor thread",
    sourceUrl: "javascript:alert(1)",
    createdAt: "2026-05-27T08:15:00-04:00",
    liveProviderCalls: true
  }, { asOf });
  const validation = validateExternalSignal(signal);

  assert.equal(validation.ok, true);
  assert.equal(signal.sourceType, "x");
  assert.equal(signal.sourceMode, "blocked");
  assert.equal(signal.sourceLabel, "X/Twitter blocked source");
  assert.equal(signal.liveProviderCalls, false);
  assert.equal(signal.primaryTicker, "MU");
  assert.deepEqual(signal.tickers, ["MU"]);
  assert.equal(signal.sourceUrl, undefined);
  assert.ok(signal.warnings.some((warning) => /Scraping|browser-cookie|server-side API/i.test(warning)));
  assert.ok(signal.warnings.some((warning) => /blocked/i.test(warning)));

  const futureApi = normalizeExternalSignal({
    sourceType: "x",
    sourceMode: "api",
    ticker: "NVDA",
    text: "Approved future server-side X API row for $NVDA",
    providerLabel: "X API",
    createdAt: "2026-05-27T08:45:00-04:00",
    liveProviderCalls: true
  }, { asOf });
  assert.equal(validateExternalSignal(futureApi).ok, true);
  assert.equal(futureApi.sourceMode, "api");
  assert.equal(futureApi.sourceLabel, "X API");
  assert.equal(futureApi.liveProviderCalls, true);
});

test("Reddit mentions map to source-labeled external signals", () => {
  const [signal] = externalSignalsFromRedditMentions([{
    id: "reddit-mu-1",
    sourceId: "t3_mu",
    ticker: "MU",
    extractedTickers: ["MU", "SOXL"],
    subreddit: "stocks",
    title: "MU HBM demand discussion",
    text: "A local Reddit record mentions $MU and SOXL.",
    score: 42,
    commentCount: 7,
    engagementScore: 18,
    sentiment: "bullish",
    sourceMode: "api",
    providerId: "reddit-api",
    providerLabel: "Reddit API",
    sourceUrl: "https://reddit.example/r/stocks/comments/mu",
    createdAt: "2026-05-27T07:00:00-04:00",
    detectedAt: asOf,
    liveProviderCalls: true
  }], { asOf });

  assert.equal(validateExternalSignal(signal).ok, true);
  assert.equal(signal.sourceType, "reddit");
  assert.equal(signal.sourceMode, "api");
  assert.equal(signal.sourceLabel, "Reddit API");
  assert.equal(signal.liveProviderCalls, true);
  assert.equal(signal.signalType, "social-mention");
  assert.equal(signal.signalSubtype, "reddit-post");
  assert.deepEqual(signal.tickers, ["MU", "SOXL"]);
  assert.deepEqual(signal.sourceIds, ["t3_mu", "reddit-mu-1"]);
  assert.equal(signal.metadata.subreddit, "stocks");
  assert.equal(signal.metadata.commentCount, 7);
  assert.ok(signal.warnings.some((warning) => /lower-trust social signal/i.test(warning)));
});

test("federal trade disclosures normalize without becoming trade instructions", () => {
  const [signal] = externalSignalsFromFederalTrades([{
    id: "trade-mu-1",
    ticker: "MU",
    politicianName: "Sample Senator",
    chamber: "Senate",
    state: "NC",
    assetName: "Micron Technology, Inc.",
    transactionType: "Purchase",
    transactionDate: "2026-05-20",
    disclosureDate: "2026-05-26",
    amountRangeLow: 1001,
    amountRangeHigh: 15000,
    owner: "Self",
    sourceMode: "public-static-dataset",
    providerLabel: "Senate Stock Watcher public dataset",
    sourceUrl: "https://example.test/disclosures/mu",
    liveProviderCalls: true
  }], { asOf });

  assert.equal(validateExternalSignal(signal).ok, true);
  assert.equal(signal.sourceType, "federal-trade");
  assert.equal(signal.sourceMode, "public-static-dataset");
  assert.equal(signal.sourceLabel, "Senate Stock Watcher public dataset");
  assert.equal(signal.signalType, "federal-trade-disclosure");
  assert.equal(signal.signalSubtype, "purchase-disclosure");
  assert.equal(signal.actionability, "review-context-only");
  assert.equal(signal.sentiment, "unknown");
  assert.equal(signal.metadata.politicianName, "Sample Senator");
  assert.equal(signal.metadata.amountRangeHigh, 15000);
  assert.doesNotMatch(JSON.stringify(signal), /\b(buy now|sell now|trade now|enter|exit)\b/i);
  assert.ok(signal.warnings.some((warning) => /delayed and informational/i.test(warning)));
});

test("combined external signals remain sorted and source-labeled", () => {
  const signals = buildExternalSignals({
    xUpdates: [{
      ticker: "NVDA",
      text: "Manual X note for $NVDA",
      sourceMode: "manual",
      createdAt: "2026-05-27T09:00:00-04:00"
    }],
    redditMentions: [{
      sourceId: "t3_amd",
      ticker: "AMD",
      subreddit: "stocks",
      title: "AMD thread",
      text: "$AMD mention",
      sourceMode: "local-file",
      createdAt: "2026-05-27T08:00:00-04:00"
    }],
    federalTrades: [{
      ticker: "MU",
      politicianName: "Sample Representative",
      chamber: "House",
      state: "CA",
      assetName: "Micron",
      transactionType: "Sale",
      transactionDate: "2026-05-10",
      disclosureDate: "2026-05-26",
      sourceMode: "local-file",
      sourceUrl: "https://example.test/disclosures/mu"
    }],
    asOf
  });

  assert.deepEqual(signals.map((signal) => signal.sourceType), ["x", "reddit", "federal-trade"]);
  assert.ok(signals.every((signal) => signal.sourceLabel));
  assert.ok(signals.every((signal) => signal.actionability === "review-context-only"));
  assert.ok(signals.every((signal) => validateExternalSignal(signal).ok));
});
