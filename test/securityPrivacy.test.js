import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { sanitizeImportedState, sanitizeStateForBackup } from "../src/stateSanitizer.js";
import { importRedditMentionFile } from "../src/redditSignals.js";
import { fetchPublicPoliticianTradeDataset, importPoliticianTradeFile } from "../src/politicianTrades.js";
import { buildConfigStatus } from "../scripts/local-server.js";

const gitignore = readFileSync(new URL("../.gitignore", import.meta.url), "utf8");
const envExample = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const appJs = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const dataContractsTs = readFileSync(new URL("../src/dataContracts.ts", import.meta.url), "utf8");
const localFixture = readFileSync(new URL("../data/local-data-fixtures.json", import.meta.url), "utf8");
const redditSignalsJs = readFileSync(new URL("../src/redditSignals.js", import.meta.url), "utf8");
const dataAdaptersJs = readFileSync(new URL("../src/dataAdapters.js", import.meta.url), "utf8");
const portfolioSchemaJs = readFileSync(new URL("../src/portfolioSchema.js", import.meta.url), "utf8");
const packageJson = readFileSync(new URL("../package.json", import.meta.url), "utf8");
const politicianTradesJs = readFileSync(new URL("../src/politicianTrades.js", import.meta.url), "utf8");
const fidelityConnectorJs = readFileSync(new URL("../src/fidelityConnector.js", import.meta.url), "utf8");
const quantLensContextJs = readFileSync(new URL("../src/quantLensContext.js", import.meta.url), "utf8");

test(".env files are ignored while .env.example remains a placeholder", () => {
  assert.match(gitignore, /^\.env$/m);
  assert.match(gitignore, /^\.env\.\*$/m);
  assert.match(gitignore, /^!\.env\.example$/m);
  assert.match(gitignore, /^tucker-portfolio-dashboard-export\.csv$/m);
  assert.match(gitignore, /^tucker-target-allocations-\*\.json$/m);
  assert.match(gitignore, /^Portfolio_Positions_\*\.csv$/m);
  assert.match(gitignore, /^\*Positions\*\.csv$/m);
  assert.match(gitignore, /^private-portfolio-\*\.json$/m);
  assert.doesNotMatch(envExample, /(sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/);
});

test("repo sources do not contain obvious committed secret material", () => {
  const secretPattern = /(sk-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/;
  const offenders = trackedFiles()
    .filter((file) => existsSync(file))
    .filter((file) => !file.includes("/node_modules/") && !file.startsWith("./.git/") && !file.includes("/test-results/") && !file.includes("/playwright-report/"))
    .filter((file) => {
      const text = readFileSync(file, "utf8");
      return secretPattern.test(text);
    });

  assert.deepEqual(offenders, []);
});

test("dashboard backup sanitizer removes secret-shaped fields and masks account ids", () => {
  const longNotes = `${"x".repeat(2100)} access_token=raw-token-value`;
  const rawOpenAiToken = `s${"k"}-${"abcdefghijklmnopqrstuvwxyz1234567890"}`;
  const rawGithubToken = `gh${"p"}_${"abcdefghijklmnopqrstuvwxyz1234567890"}`;
  const rawSlackToken = `xo${"xb"}-${"123456789012"}-${"123456789012"}-${"abcdefghijklmnopqrstuvwxyz"}`;
  const rawOpaqueToken = `abcdefghijklmnopqrstuvwxyz${"ABCDEFGHIJKLMNOPQRSTUVWXYZ"}1234567890`;
  const payload = {
    schemaVersion: 1,
    finnhubApiKey: "do-not-export",
    nested: {
      clientSecret: "private",
      refreshToken: "private",
      cookie: "private",
      providerError: "request failed client_secret=raw-client-secret cookie=session-cookie Authorization: Bearer raw-bearer-token",
      providerWarning: "clientSecret=raw-camel-secret refreshToken=raw-camel-refresh access-token=raw-dash-access session_id=raw-session-id",
      itemId: "plaid-item-should-not-export",
      accountNumber: "123456789",
      accountNameNumber: "Taxable 987654321",
      accountLabel: "Brokerage 456789123"
    },
    notes: longNotes,
    decisionJournal: [{
      thesisNote: `Raw OpenAI token ${rawOpenAiToken} should never export.`
    }],
    watchlistIdeas: [{
      thesis: `GitHub token ${rawGithubToken} should be stripped.`
    }],
    thesisProfiles: [{
      notes: `Slack token ${rawSlackToken} and opaque ${rawOpaqueToken} should be stripped.`
    }],
    holdings: [{ ticker: "MU", accountId: "acct-987654321", account_id: "acc-123456789", account: "Taxable" }]
  };

  const exported = sanitizeStateForBackup(payload);
  const imported = sanitizeImportedState(payload);

  assert.equal("finnhubApiKey" in exported, false);
  assert.equal("clientSecret" in exported.nested, false);
  assert.equal("refreshToken" in exported.nested, false);
  assert.equal("cookie" in exported.nested, false);
  assert.equal("itemId" in exported.nested, false);
  assert.equal(exported.nested.providerError.includes("raw-client-secret"), false);
  assert.equal(exported.nested.providerError.includes("session-cookie"), false);
  assert.equal(exported.nested.providerError.includes("raw-bearer-token"), false);
  assert.equal(exported.notes.includes("raw-token-value"), false);
  assert.equal(exported.nested.providerWarning.includes("raw-camel-secret"), false);
  assert.equal(exported.nested.providerWarning.includes("raw-camel-refresh"), false);
  assert.equal(exported.nested.providerWarning.includes("raw-dash-access"), false);
  assert.equal(exported.nested.providerWarning.includes("raw-session-id"), false);
  assert.equal(JSON.stringify(exported.decisionJournal).includes(rawOpenAiToken), false);
  assert.equal(JSON.stringify(exported.watchlistIdeas).includes(rawGithubToken), false);
  assert.equal(JSON.stringify(exported.thesisProfiles).includes(rawSlackToken), false);
  assert.equal(JSON.stringify(exported.thesisProfiles).includes(rawOpaqueToken), false);
  assert.equal(exported.notes.length, 2000);
  assert.equal(exported.nested.accountNumber, "masked-6789");
  assert.equal(exported.nested.accountNameNumber, "masked-4321");
  assert.equal(exported.nested.accountLabel, "masked-9123");
  assert.equal(exported.holdings[0].accountId, "masked-4321");
  assert.equal(exported.holdings[0].account_id, "masked-6789");
  assert.equal("finnhubApiKey" in imported, false);
});

test("Reddit JSON import redacts rejected-row usernames and secret-shaped values", () => {
  const report = importRedditMentionFile(JSON.stringify([{
    id: "bad-secret-row",
    subreddit: "",
    author: "do-not-store-user",
    username: "do-not-store-username",
    cookie: "session=do-not-store-cookie",
    refresh_token: "do-not-store-refresh-token",
    title: "No usable ticker here",
    body: "Request failed access_token=do-not-store-access-token client_secret=do-not-store-client-secret clientSecret=do-not-store-camel-secret refreshToken=do-not-store-camel-refresh access-token=do-not-store-dash-access session_id=do-not-store-session-id Authorization: Bearer do-not-store-bearer",
    permalink: ""
  }]), {
    fileName: "reddit-secret-row.json",
    asOf: "2026-05-23T12:00:00-04:00"
  });

  const visibleReport = JSON.stringify(report.rejectedRows);
  assert.equal(report.ok, false);
  assert.equal(report.rejectedRows.length, 1);
  assert.equal(visibleReport.includes("do-not-store-user"), false);
  assert.equal(visibleReport.includes("do-not-store-username"), false);
  assert.equal(visibleReport.includes("do-not-store-cookie"), false);
  assert.equal(visibleReport.includes("do-not-store-refresh-token"), false);
  assert.equal(visibleReport.includes("do-not-store-access-token"), false);
  assert.equal(visibleReport.includes("do-not-store-client-secret"), false);
  assert.equal(visibleReport.includes("do-not-store-camel-secret"), false);
  assert.equal(visibleReport.includes("do-not-store-camel-refresh"), false);
  assert.equal(visibleReport.includes("do-not-store-dash-access"), false);
  assert.equal(visibleReport.includes("do-not-store-session-id"), false);
  assert.equal(visibleReport.includes("do-not-store-bearer"), false);
});

test("Reddit records omit usernames in contracts, fixtures, and normalization", () => {
  assert.doesNotMatch(dataContractsTs, /authorHandle/);
  assert.doesNotMatch(localFixture, /authorHandle/);
  assert.doesNotMatch(redditSignalsJs, /authorHandle:\s*stringFrom\(pick\(raw/);
  assert.match(redditSignalsJs, /personalKeyPattern/);
  assert.match(redditSignalsJs, /secretKeyPattern/);
});

test("portfolio imports mask account-number fields and visible error messages redact secret-like values", () => {
  assert.match(dataAdaptersJs, /function maskAccountLabel/);
  assert.match(dataAdaptersJs, /safeVisibleValue/);
  assert.match(portfolioSchemaJs, /export function sanitizeAccountLabel/);
  assert.match(appJs, /function safeErrorMessage/);
  assert.match(appJs, /secretLikeMessagePattern/);
  assert.match(appJs, /function safeSetLocalStorage/);
  assert.match(appJs, /function compactPersistedReport/);
  assert.doesNotMatch(appJs, /error\.message/);
});

test("local dev server and provider reports avoid serving or echoing sensitive values", () => {
  assert.match(packageJson, /"dev": "node scripts\/local-server\.js"/);
  assert.match(politicianTradesJs, /function redactSensitiveRow/);
  assert.match(fidelityConnectorJs, /sanitizeAccountLabel\(position\.account_name/);
});

test("local config reports live provider presence without secret values", () => {
  const status = buildConfigStatus({
    X_BEARER_TOKEN: "x-bearer-secret-value-123456789",
    REDDIT_CLIENT_ID: "reddit-client-id-123",
    REDDIT_CLIENT_SECRET: "reddit-client-secret-value-123456789",
    REDDIT_USER_AGENT: "market-pulse-test",
    REDDIT_LIVE_ENABLED: "true",
    POLITICIAN_TRADES_PROVIDER: "senate-stock-watcher",
    POLITICIAN_TRADES_LIVE_ENABLED: "true",
    POLITICIAN_TRADES_SOURCE_URL: "https://example.test/disclosures.json?api_key=source-key-123"
  });
  const visibleStatus = JSON.stringify(status);

  assert.equal(status.exposesSecretValues, false);
  assert.equal(status.marketData.xApi, true);
  assert.equal(visibleStatus.includes("x-bearer-secret-value"), false);
  assert.equal(visibleStatus.includes("reddit-client-secret-value"), false);
  assert.equal(visibleStatus.includes("source-key-123"), false);
});

test("politician disclosure reports redact auth material from warnings and rejected rows", async () => {
  const providerReport = await fetchPublicPoliticianTradeDataset({
    sourceUrl: "https://example.test/disclosures.json?api_key=query-secret",
    liveEnabled: true,
    fetchImpl: async () => ({
      ok: false,
      status: 502,
      text: async () => "Authorization: Bearer raw-bearer-token access_token=raw-access-token client_secret=raw-client-secret cookie=raw-cookie session_id=raw-session-id"
    })
  });
  const visibleProviderReport = JSON.stringify(providerReport);

  assert.equal(providerReport.ok, false);
  assert.equal(visibleProviderReport.includes("raw-bearer-token"), false);
  assert.equal(visibleProviderReport.includes("raw-access-token"), false);
  assert.equal(visibleProviderReport.includes("raw-client-secret"), false);
  assert.equal(visibleProviderReport.includes("raw-cookie"), false);
  assert.equal(visibleProviderReport.includes("raw-session-id"), false);

  const importReport = importPoliticianTradeFile(JSON.stringify([{
    politicianName: "",
    ticker: "",
    authorization: "Bearer local-bearer-secret",
    cookie: "session=local-cookie-secret",
    session_id: "local-session-secret",
    sourceUrl: "https://example.test/disclosure?api_key=local-query-secret&safe=1",
    notes: "provider failed with Bearer local-note-bearer and refresh_token=local-refresh-token"
  }]), { fileName: "politician-secret-row.json" });
  const visibleRejectedRows = JSON.stringify(importReport.rejectedRows);

  assert.equal(importReport.ok, false);
  assert.equal(visibleRejectedRows.includes("local-bearer-secret"), false);
  assert.equal(visibleRejectedRows.includes("local-cookie-secret"), false);
  assert.equal(visibleRejectedRows.includes("local-session-secret"), false);
  assert.equal(visibleRejectedRows.includes("local-query-secret"), false);
  assert.equal(visibleRejectedRows.includes("local-refresh-token"), false);
});

test("Plaid Link script loads only after the user starts the connector flow", () => {
  assert.doesNotMatch(indexHtml, /cdn\.plaid\.com/);
  assert.match(appJs, /function loadPlaidLinkScript/);
  assert.match(appJs, /document\.createElement\("script"\)/);
  assert.match(appJs, /cdn\.plaid\.com\/link\/v2\/stable\/link-initialize\.js/);
  assert.match(appJs, /await loadPlaidLinkScript\(\)/);
});

test("quant score history stores compact scores instead of source text or provider payloads", () => {
  assert.match(appJs, /quantScoreHistory/);
  assert.match(quantLensContextJs, /sourceFreshness/);
  assert.match(quantLensContextJs, /peerGroup/);
  assert.doesNotMatch(quantLensContextJs, /providerPayload|sourceText|sourceUrl|apiKey|token|rawProvider/i);
  assert.match(dataContractsTs, /export interface QuantScoreHistoryEntry/);
});

function listFiles(path) {
  const stat = statSync(path);
  if (stat.isFile()) return [path];
  return readdirSync(path).flatMap((entry) => listFiles(join(path, entry)));
}

function trackedFiles() {
  try {
    return execFileSync("git", ["ls-files"], { encoding: "utf8" })
      .split(/\r?\n/)
      .filter(Boolean);
  } catch {
    return listFiles(".")
      .filter((file) => !file.includes(`${join(".", ".git")}/`) && !file.startsWith(".git/"));
  }
}
