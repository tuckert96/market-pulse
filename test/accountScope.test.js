import test from "node:test";
import assert from "node:assert/strict";
import { ACCOUNT_SCOPE_ALL, buildAccountScopeModel, filterHoldingsByAccountScope, inferTaxBucket } from "../src/accountScope.js";

const holdings = [
  { ticker: "MU", account: "Roth IRA", accountType: "Retirement", assetClass: "Equity", marketValue: 12000, dailyChange: 240, costBasis: 10000, sourceAsOf: new Date().toISOString() },
  { ticker: "NVDA", account: "Taxable Brokerage", accountType: "Taxable", assetClass: "Equity", marketValue: 8000, dailyChange: -80, costBasis: 9000, sourceAsOf: new Date().toISOString() },
  { ticker: "SPAXX", account: "Roth IRA", accountType: "Retirement", assetClass: "Cash", marketValue: 3000, dailyChange: 0, sourceAsOf: new Date().toISOString() },
  { ticker: "AMD", account: "HSA", accountType: "HSA", assetClass: "Equity", marketValue: 2000, dailyChange: 20, sourceAsOf: "2026-01-01T00:00:00Z" }
];

test("account scope model builds combined and individual account views", () => {
  const model = buildAccountScopeModel(holdings, ACCOUNT_SCOPE_ALL);

  assert.equal(model.selectedAccount, ACCOUNT_SCOPE_ALL);
  assert.equal(model.combined.value, 25000);
  assert.equal(model.combined.accountCount, 3);
  assert.equal(model.combined.cashValue, 3000);
  assert.equal(model.combined.cashWeight, 0.12);
  assert.equal(model.combined.dailyChange, 180);
  assert.equal(model.combined.missingCostBasisCount, 1);
  assert.equal(model.combined.staleHoldingCount, 1);
  assert.deepEqual(model.accounts.map((row) => row.account), ["Roth IRA", "Taxable Brokerage", "HSA"]);
  assert.equal(model.accounts[0].holdingCount, 2);
  assert.equal(model.accounts[0].portfolioWeight, 0.6);
  assert.equal(model.accounts[0].cashWeight, 0.2);
  assert.equal(model.accounts[0].largestHoldingWeight, 0.8);
  assert.equal(model.accounts[0].largestHoldingLabel, "MU");
  assert.equal(model.accounts[0].taxBucket.label, "Roth");
  assert.deepEqual(model.accounts[0].assetMix.map((row) => row.name), ["Stock", "Cash"]);
  assert.deepEqual(model.accounts[0].topPositions.map((row) => row.ticker), ["MU", "SPAXX"]);
});

test("account scope classifies tax buckets for allocation display", () => {
  assert.equal(inferTaxBucket("Taxable Brokerage", ["Taxable"]).key, "taxable");
  assert.equal(inferTaxBucket("Fidelity Roth IRA", ["Retirement"]).key, "roth");
  assert.equal(inferTaxBucket("Traditional IRA", ["Retirement"]).key, "traditional");
  assert.equal(inferTaxBucket("Employer 401k", ["Retirement"]).key, "traditional");
  assert.equal(inferTaxBucket("Fidelity HSA", ["HSA"]).key, "hsa");
  assert.equal(inferTaxBucket("Mystery Account", ["Unknown"]).key, "other");
});

test("account scope filters holdings and resets invalid selections to combined", () => {
  const roth = buildAccountScopeModel(holdings, "Roth IRA");
  assert.equal(roth.selectedAccount, "Roth IRA");
  assert.deepEqual(roth.scopedHoldings.map((holding) => holding.ticker), ["MU", "SPAXX"]);
  assert.deepEqual(filterHoldingsByAccountScope(holdings, "Taxable Brokerage").map((holding) => holding.ticker), ["NVDA"]);

  const invalid = buildAccountScopeModel(holdings, "Closed Account");
  assert.equal(invalid.selectedAccount, ACCOUNT_SCOPE_ALL);
  assert.equal(invalid.scopedHoldings.length, holdings.length);
});

test("account scope uses stable account ids when display labels repeat", () => {
  const repeatedLabels = [
    { ticker: "MU", accountId: "plaid-roth-1", account: "Fidelity Roth IRA", accountType: "Retirement", marketValue: 1000 },
    { ticker: "NVDA", accountId: "plaid-roth-2", account: "Fidelity Roth IRA", accountType: "Retirement", marketValue: 2000 }
  ];

  const model = buildAccountScopeModel(repeatedLabels, "plaid-roth-2");

  assert.equal(model.accounts.length, 2);
  assert.equal(model.selectedAccount, "plaid-roth-2");
  assert.equal(model.selectedAccountLabel, "Fidelity Roth IRA");
  assert.deepEqual(model.accounts.map((account) => account.taxBucket.key), ["roth", "roth"]);
  assert.deepEqual(model.scopedHoldings.map((holding) => holding.ticker), ["NVDA"]);
  assert.deepEqual(filterHoldingsByAccountScope(repeatedLabels, "plaid-roth-1").map((holding) => holding.ticker), ["MU"]);
});

test("account scope flags leveraged exposure and selected summaries", () => {
  const model = buildAccountScopeModel([
    { ticker: "UPRO", account: "Trading", accountType: "Taxable", marketValue: 5000, costBasis: 4000, leveragedMultiple: 3 },
    { ticker: "SPAXX", account: "Trading", accountType: "Taxable", marketValue: 5000, assetClass: "Cash" },
    { ticker: "VTI", account: "Retirement", accountType: "Retirement", marketValue: 10000, costBasis: 9000 }
  ], "Trading");

  assert.equal(model.selectedSummary.account, "Trading");
  assert.equal(model.selectedSummary.value, 10000);
  assert.equal(model.selectedSummary.portfolioWeight, 0.5);
  assert.equal(model.selectedSummary.leveragedExposure, 15000);
  assert.equal(model.selectedSummary.leveragedExposureWeight, 1.5);
  assert.equal(model.selectedSummary.hasLeverageWarning, true);
  assert.equal(model.selectedSummary.cashWeight, 0.5);
  assert.equal(model.selectedSummary.taxBucket.key, "taxable");
  assert.deepEqual(model.selectedSummary.assetMix.map((row) => row.name), ["Cash", "ETF/Fund"]);
});
