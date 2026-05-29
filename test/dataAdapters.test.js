import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { buildAccountScopeModel } from "../src/accountScope.js";
import { buildAlphaSignals, demoAlphaEvents, demoThesisProfiles } from "../src/alphaEngine.js";
import { analyzePortfolio } from "../src/portfolioAnalytics.js";
import { normalizeHoldings, sanitizeAccountLabel } from "../src/portfolioSchema.js";
import { countHoldingRowsNeedingReview } from "../src/portfolioState.js";

await import("../src/dataAdapters.js");

const adapters = globalThis.DataAdapters;

test("sample CSV imports merge Fidelity positions and Seeking Alpha ratings", () => {
  const result = adapters.buildImportResult({
    fidelityFileName: "sample-fidelity-positions.csv",
    fidelityCsv: readFileSync("data/sample-fidelity-positions.csv", "utf8"),
    seekingAlphaCsv: readFileSync("data/sample-seeking-alpha-ratings.csv", "utf8")
  });
  const nvda = result.records.find((record) => record.ticker === "NVDA");

  assert.equal(result.validation.ok, true);
  assert.equal(result.fidelityRecords.length, 5);
  assert.equal(result.seekingAlphaRecords.length, 6);
  assert.equal(result.records.length, 5);
  assert.ok(nvda);
  assert.equal(nvda.shares, 18);
  assert.equal(nvda.marketValue, 18252);
  assert.equal(nvda.quant, 4.92);
  assert.ok(nvda.sources.includes("fidelity"));
  assert.ok(nvda.sources.includes("seekingAlpha"));
  assert.equal(result.importReport.rowsParsed, 11);
  assert.equal(result.importReport.holdingsImported, result.records.length);
  assert.equal(result.importReport.ratingsImported, 6);
  assert.equal(result.importReport.providerReports.find((report) => report.provider === "seekingAlpha").holdingsImported, 6);
  assert.ok(result.importReport.detectedColumns.includes("Symbol"));
  assert.ok(result.importReport.tickersDetected.includes("NVDA"));
  assert.equal(result.importReport.health.status, "Success");
});

test("Seeking Alpha ratings-only tickers do not become holdings when positions exist", () => {
  const result = adapters.buildImportResult({
    fidelityCsv: `Account,Symbol,Description,Shares,Current Price,Market Value,Cost Basis
Taxable,MU,Micron Technology,10,100,1000,750`,
    seekingAlphaCsv: `Ticker,Company,Quant Rating,Growth Grade,Momentum Grade,Next Earnings
MU,Micron Technology,4.43,A-,A,2026-06-26
APP,AppLovin,4.86,A,A+,2026-08-06`
  });

  assert.equal(result.validation.ok, true);
  assert.equal(result.seekingAlphaRecords.length, 2);
  assert.deepEqual(result.records.map((record) => record.ticker), ["MU"]);
  assert.equal(result.importReport.holdingsImported, result.records.length);
  assert.equal(result.importReport.ratingsImported, 2);
  assert.equal(result.records.some((record) => record.ticker === "APP"), false);
  assert.equal(result.records[0].quant, 4.43);
  assert.equal(result.records[0].nextEarnings, "2026-06-26");
});

test("Seeking Alpha CSV ratings normalize grades and dates", () => {
  const records = adapters.normalizeSeekingAlphaRatings(`Ticker,Company,Quant Rating,Growth Grade,Momentum Grade,Revisions Grade,Valuation Grade,Profitability Grade,Gross Margin,FCF Margin,Forward PE,Price To Sales,Free Cash Flow,Total Debt,Dividend Yield,Next Earnings
MU,Micron Technology,4.43,A-,A,B+,B,A-,48%,17%,18,6,"$3,200,000,000","$12,000,000,000",0.5%,2026-06-26`);

  assert.equal(records.length, 1);
  assert.equal(records[0].ticker, "MU");
  assert.equal(records[0].growth, 4.6);
  assert.equal(records[0].momentum, 96);
  assert.equal(records[0].revisions, 86);
  assert.equal(records[0].grossMargin, 0.48);
  assert.equal(records[0].freeCashFlowMargin, 0.17);
  assert.equal(records[0].forwardPe, 18);
  assert.equal(records[0].priceToSales, 6);
  assert.equal(records[0].freeCashFlow, 3200000000);
  assert.equal(records[0].totalDebt, 12000000000);
  assert.equal(records[0].dividendYield, 0.005);
  assert.equal(records[0].nextEarnings, "2026-06-26");
});

test("portfolio analytics calculates ticker weights from imported values", () => {
  const records = adapters.normalizeFidelityPositions(`Account,Symbol,Security Description,Quantity,Last Price,Current Value,Total Cost Basis
Taxable,MU,Micron Technology,10,100,1000,750
Taxable,NVDA,NVIDIA,1,3000,3000,2000`);
  const analysis = analyzePortfolio(records);
  const mu = analysis.holdings.find((holding) => holding.ticker === "MU");
  const nvda = analysis.holdings.find((holding) => holding.ticker === "NVDA");

  assert.equal(analysis.overview.totalValue, 4000);
  assert.equal(mu.portfolioWeight, 0.25);
  assert.equal(nvda.portfolioWeight, 0.75);
});

test("Fidelity-like CSV preserves same ticker across multiple accounts", () => {
  const csv = `Account Name,Symbol,Security Description,Quantity,Last Price,Current Value,Total Cost Basis,Gain/Loss,% Gain/Loss
Taxable,MU,Micron Technology Inc,12,104.50,1254.00,900.00,354.00,39.33%
Roth IRA,MU,Micron Technology Inc,5,104.50,522.50,500.00,22.50,4.50%
HSA,NVDA,NVIDIA Corp,2,950.00,1900.00,1200.00,700.00,58.33%
Account Total,,Total,19,,3676.50,2600.00,,`;
  const result = adapters.buildImportResult({
    fidelityFileName: "fidelity-realistic.csv",
    fidelityCsv: csv
  });
  const muRows = result.records.filter((record) => record.ticker === "MU");

  assert.equal(result.validation.ok, true);
  assert.equal(result.fidelityRecords.length, 3);
  assert.equal(muRows.length, 2);
  assert.deepEqual(muRows.map((record) => record.account).sort(), ["Roth IRA", "Taxable"]);
  assert.equal(result.importReport.rowsParsed, 4);
  assert.equal(result.importReport.holdingsImported, 3);
  assert.equal(result.importReport.rejectedRows.length, 1);
  assert.equal(result.importReport.totalMarketValue, 3676.5);
  assert.equal(result.importReport.health.status, "Imported with skipped non-holding rows");
  assert.match(result.importReport.health.message, /Imported 3 holdings, skipped 1 harmless non-holding row/);
  assert.equal(muRows[0].unrealizedGainPercent > 0, true);
});

test("Fidelity production headers map current value, gain/loss, and per-share cost basis", () => {
  const csv = `Account Name,Account Type,Symbol,Description,Quantity,Last Price,Current Value (USD),Cost Basis Per Share,Gain/Loss,% Gain/Loss
Taxable Brokerage,Individual,MU,Micron Technology Inc,10,$100.00,"$1,000.00",$75.00,+$250.00,+33.33%
Roth IRA,Retirement,NVDA,NVIDIA Corp,2,$950.00,"$1,900.00",$600.00,+$700.00,+58.33%
Footer,,,,,,,,,`;
  const result = adapters.buildImportResult({
    fidelityFileName: "Portfolio_Positions_May-22-2026.csv",
    fidelityCsv: csv
  });
  const mu = result.records.find((record) => record.ticker === "MU");
  const nvda = result.records.find((record) => record.ticker === "NVDA");

  assert.equal(result.validation.ok, true);
  assert.equal(result.importReport.holdingsImported, 2);
  assert.equal(result.importReport.columnMapping.marketValue, "Current Value (USD)");
  assert.equal(result.importReport.columnMapping.costBasis, "Cost Basis Per Share");
  assert.equal(result.importReport.columnMapping.unrealizedGainPercent, "% Gain/Loss");
  assert.equal(mu.marketValue, 1000);
  assert.equal(mu.costBasis, 750);
  assert.equal(mu.unrealizedGain, 250);
  assert.equal(Math.round(mu.unrealizedGainPercent * 10000) / 10000, 0.3333);
  assert.equal(nvda.costBasis, 1200);
  assert.equal(countHoldingRowsNeedingReview(result.importReport), 0);
});

test("Fidelity single-account position exports map abbreviated quantity, value, day-change, gain, and cash rows", () => {
  const result = adapters.buildImportResult({
    fidelityFileName: "Contributory-Positions-2025-10-02-081120.csv",
    fidelityCsv: [
      "Symbol,Description,Qty (Quantity),Mkt Val (Market Value),Day Chng $ (Day Change $),Day Chng % (Day Change %),Cost Basis,Gain $ (Gain/Loss $),Gain % (Gain/Loss %),Ratings,Reinvest?,Reinvest Capital Gains?,% of Acct (% of Account),Div Yld (Dividend Yield),Security Type",
      'MU,Micron Technology Inc,10,"$1,045.00",$12.50,1.21%,$750.00,$295.00,39.33%,--,No,No,20.00%,--,Stock',
      'Cash & Cash Investments,--,--,"$7,811.05",$0.00,0%,--,--,--,--,--,--,4.64%,--,Cash and Money Market',
      'Account Total,--,--,"$8,856.05",$12.50,0.14%,$750.00,$295.00,39.33%,--,--,--,--,--,--'
    ].join("\n")
  });
  const mu = result.records.find((record) => record.ticker === "MU");
  const cash = result.records.find((record) => record.ticker === "CASH");

  assert.equal(result.validation.ok, true);
  assert.equal(result.importReport.health.status, "Imported with skipped non-holding rows");
  assert.equal(result.importReport.holdingsImported, 2);
  assert.equal(result.importReport.rejectedRows.length, 1);
  assert.equal(result.importReport.rejectedRows[0].classification, "non-holding row");
  assert.equal(countHoldingRowsNeedingReview(result.importReport), 0);
  assert.equal(result.importReport.columnMapping.shares, "Qty (Quantity)");
  assert.equal(result.importReport.columnMapping.marketValue, "Mkt Val (Market Value)");
  assert.equal(result.importReport.columnMapping.dailyChange, "Day Chng $ (Day Change $)");
  assert.equal(result.importReport.columnMapping.dailyChangePercent, "Day Chng % (Day Change %)");
  assert.equal(result.importReport.columnMapping.unrealizedGain, "Gain $ (Gain/Loss $)");
  assert.equal(result.importReport.columnMapping.unrealizedGainPercent, "Gain % (Gain/Loss %)");
  assert.deepEqual(result.importReport.accountsDetected, ["Contributory"]);
  assert.equal(mu.account, "Contributory");
  assert.equal(mu.marketValue, 1045);
  assert.equal(mu.dailyChange, 12.5);
  assert.equal(mu.dailyChangePercent, 0.0121);
  assert.equal(mu.unrealizedGain, 295);
  assert.equal(Math.round(mu.unrealizedGainPercent * 10000) / 10000, 0.3933);
  assert.equal(cash.account, "Contributory");
  assert.equal(cash.cash, true);
  assert.equal(cash.assetClass, "Cash");
  assert.equal(cash.marketValue, 7811.05);
  assert.equal(cash.marketDataEligible, false);
  assert.match(result.importReport.mappingWarnings.join(" "), /file name/);
});

test("Fidelity Symbol/CUSIP and date-stamped value headers map cleanly", () => {
  const result = adapters.buildImportResult({
    fidelityFileName: "dated-fidelity-export.csv",
    fidelityCsv: [
      "Account Name,Symbol/CUSIP,Description,Quantity,Last Price As Of 05/22/2026,Current Value As Of 05/22/2026,Cost Basis Total As Of 05/22/2026,Total Gain/Loss ($),Total Gain/Loss (%)",
      'Taxable,MU,Micron Technology,10,$100.00,"$1,000.00",$750.00,$250.00,33.33%'
    ].join("\n")
  });
  const mu = result.records[0];

  assert.equal(result.validation.ok, true);
  assert.equal(result.importReport.health.status, "Success");
  assert.equal(result.importReport.columnMapping.ticker, "Symbol/CUSIP");
  assert.equal(result.importReport.columnMapping.price, "Last Price As Of 05/22/2026");
  assert.equal(result.importReport.columnMapping.marketValue, "Current Value As Of 05/22/2026");
  assert.equal(result.importReport.columnMapping.costBasis, "Cost Basis Total As Of 05/22/2026");
  assert.match(result.importReport.mappingWarnings.join(" "), /mixed Symbol\/CUSIP column/);
  assert.doesNotMatch(result.importReport.mappingWarnings.join(" "), /identifier column as ticker/);
  assert.equal(mu.ticker, "MU");
  assert.equal(mu.marketValue, 1000);
  assert.equal(mu.costBasis, 750);
  assert.equal(mu.unrealizedGain, 250);
  assert.equal(Math.round(mu.unrealizedGainPercent * 10000) / 10000, 0.3333);
});

test("Fidelity CUSIP-style exports prefer description ticker clues over identifiers", () => {
  const result = adapters.buildImportResult({
    fidelityFileName: "fidelity-cusip-export.csv",
    fidelityCsv: `Account Registration Type,Account,Security ID / CUSIP,Security Description,Units Held,Current Price USD,Current Value Dollars,Total Basis
Individual,Taxable,595112103,MICRON TECHNOLOGY INC (MU),10,$100.00,$1000.00,$750.00
Roth IRA,Roth,67066G104,NVIDIA CORP (NVDA),2,$950.00,$1900.00,$1200.00`
  });

  assert.equal(result.validation.ok, true);
  assert.deepEqual(result.records.map((record) => record.ticker), ["MU", "NVDA"]);
  assert.equal(result.records[0].accountType, "Individual");
  assert.equal(result.records[0].marketValue, 1000);
  assert.match(result.importReport.mappingWarnings.join(" "), /identifier column/i);
  assert.equal(JSON.stringify(result).includes("595112103"), false);
});

test("Fidelity pasted table text imports like a CSV preview source", () => {
  const pasted = [
    "Account\tSymbol\tDescription\tQuantity\tLast Price\tCurrent Value\tCost Basis",
    "Taxable\tAMD\tAdvanced Micro Devices\t4\t$150.00\t$600.00\t$500.00",
    "Roth IRA\tSOXL\tDirexion Daily Semiconductor Bull 3X Shares\t3\t$40.00\t$120.00\t$100.00"
  ].join("\n");
  const result = adapters.buildImportResult({
    fidelityFileName: "pasted-fidelity-table.csv",
    fidelityCsv: pasted
  });

  assert.equal(result.validation.ok, true);
  assert.equal(result.importReport.holdingsImported, 2);
  assert.deepEqual(result.importReport.accountsDetected, ["Roth IRA", "Taxable"]);
  assert.equal(result.importReport.totalMarketValue, 720);
});

test("Fidelity import detects tab-delimited tables after comma-heavy preambles", () => {
  const preamble = Array.from({ length: 40 }, (_, index) => `Legal note ${index}, commas, are, common, here`).join("\n");
  const table = [
    "Account Name\tSymbol\tDescription\tQuantity\tLast Price\tCurrent Value\tCost Basis",
    "Taxable\tMU\tMicron Technology\t10\t$100.00\t$1,000.00\t$750.00",
    "Roth IRA\tNVDA\tNVIDIA Corp\t2\t$950.00\t$1,900.00\t$1,200.00"
  ].join("\n");
  const result = adapters.buildImportResult({
    fidelityFileName: "fidelity-tab-with-preamble.csv",
    fidelityCsv: `${preamble}\n${table}`
  });

  assert.equal(result.validation.ok, true);
  assert.equal(result.importReport.holdingsImported, 2);
  assert.deepEqual(result.records.map((record) => record.ticker), ["MU", "NVDA"]);
});

test("Fidelity import chooses the real holdings header over account summary rows", () => {
  const result = adapters.buildImportResult({
    fidelityFileName: "fidelity-summary-preamble.csv",
    fidelityCsv: [
      "Account,Current Value,Total Cost Basis",
      "Taxable,\"$2,900.00\",\"$1,950.00\"",
      "Account Name,Symbol,Description,Quantity,Last Price,Current Value,Cost Basis",
      "Taxable,MU,Micron Technology,10,$100.00,\"$1,000.00\",$750.00",
      "Roth IRA,NVDA,NVIDIA Corp,2,$950.00,\"$1,900.00\",\"$1,200.00\""
    ].join("\n")
  });

  assert.equal(result.validation.ok, true);
  assert.equal(result.importReport.holdingsImported, 2);
  assert.deepEqual(result.records.map((record) => record.ticker), ["MU", "NVDA"]);
});

test("Fidelity import treats footer text in the symbol column as harmless non-holding rows", () => {
  const result = adapters.buildImportResult({
    fidelityFileName: "fidelity-footer-symbol.csv",
    fidelityCsv: [
      "Account Name,Symbol,Description,Quantity,Last Price,Current Value,Cost Basis",
      "Taxable,MU,Micron Technology,10,$100.00,\"$1,000.00\",$750.00",
      "Taxable,Prices delayed,Footer disclaimer,,,,"
    ].join("\n")
  });

  assert.equal(result.validation.ok, true);
  assert.equal(result.importReport.holdingsImported, 1);
  assert.equal(result.importReport.rejectedRows[0].classification, "non-holding row");
  assert.equal(countHoldingRowsNeedingReview(result.importReport), 0);
});

test("Fidelity import accepts explicit zero-value rows without crashing the preview", () => {
  const result = adapters.buildImportResult({
    fidelityFileName: "fidelity-zero-value.csv",
    fidelityCsv: [
      "Account Name,Symbol,Description,Quantity,Last Price,Current Value,Cost Basis",
      "Taxable,MU,Micron Technology,0,$0.00,$0.00,$0.00"
    ].join("\n")
  });

  assert.equal(result.validation.ok, true);
  assert.equal(result.importReport.holdingsImported, 1);
  assert.equal(result.records[0].ticker, "MU");
  assert.equal(result.records[0].marketValue, 0);
});

test("Fidelity export imports symbol-less valued plan funds with a local identifier", () => {
  const result = adapters.buildImportResult({
    fidelityFileName: "Portfolio_Positions_May-22-2026.csv",
    fidelityCsv: `Account Number,Account Name,Symbol,Description,Quantity,Last Price,Last Price Change,Current Value,Today's Gain/Loss Dollar,Today's Gain/Loss Percent,Total Gain/Loss Dollar,Total Gain/Loss Percent,Percent Of Account,Cost Basis Total,Average Cost Basis,Type
12345,Taxable,MU,MICRON TECHNOLOGY INC,10,$100.00,+$1.00,$1000.00,+$10.00,+1.00%,+$250.00,+33.33%,10.00%,$750.00,$75.00,Stock
12345,Taxable,NVDA,NVIDIA CORP,2,$950.00,+$5.00,$1900.00,+$10.00,+0.53%,+$700.00,+58.33%,19.00%,$1200.00,$600.00,Stock
12345,Plan,,US EQ S&P 500 INDEX,10,$1.00,,$10.00,,,,,,,
12345,Plan,,BROKERAGELINK,100,$1.00,,$100.00,,,,,,,
,,,,,,,,,,,,,,,`
  });
  const localFund = result.records.find((record) => record.company === "US EQ S&P 500 INDEX");
  const mu = result.records.find((record) => record.ticker === "MU");
  const skippedRows = result.importReport.rejectedRows.filter((row) => row.classification === "non-holding row");

  assert.equal(result.validation.ok, true);
  assert.equal(result.records.length, 3);
  assert.equal(result.importReport.holdingsImported, 3);
  assert.equal(result.importReport.health.status, "Imported with skipped non-holding rows");
  assert.equal(countHoldingRowsNeedingReview(result.importReport), 0);
  assert.equal(skippedRows.length, 1);
  assert.ok(localFund);
  assert.equal(localFund.ticker, "USEQSP500I");
  assert.equal(localFund.sourceSymbolMissing, true);
  assert.equal(localFund.localIdentifier, true);
  assert.equal(localFund.marketDataEligible, false);
  assert.equal(mu.unrealizedGain, 250);
  assert.equal(mu.unrealizedGainPercent, 0.3333);
  assert.equal(mu.dailyChange, 10);
  assert.equal(mu.dailyChangePercent, 0.01);
  assert.match(result.importReport.mappingWarnings.join(" "), /local identifiers/);
  assert.deepEqual(result.records.map((record) => record.ticker).sort(), ["MU", "NVDA", "USEQSP500I"]);
});

test("Fidelity Today gain/loss columns import as daily movement, not total unrealized gain", () => {
  const result = adapters.buildImportResult({
    fidelityFileName: "today-gain-loss.csv",
    fidelityCsv: [
      "Account Name,Symbol,Description,Quantity,Last Price,Current Value,Today's Gain/Loss Dollar,Today's Gain/Loss Percent",
      "Taxable,MU,Micron Technology,10,$100.00,$1000.00,+$25.00,+2.50%"
    ].join("\n")
  });
  const row = result.records[0];

  assert.equal(result.validation.ok, true);
  assert.equal(row.dailyChange, 25);
  assert.equal(row.dailyChangePercent, 0.025);
  assert.equal(row.unrealizedGain, undefined);
  assert.equal(row.unrealizedGainPercent, undefined);
});

test("Fidelity symbol-less local identifiers do not merge on truncated display ticker collisions", () => {
  const result = adapters.buildImportResult({
    fidelityFileName: "plan-funds.csv",
    fidelityCsv: [
      "Account Name,Symbol,Description,Quantity,Last Price,Current Value",
      "Plan,,US EQ S&P 500 INDEX,10,$1.00,$10.00",
      "Plan,,US EQ S&P 500 INDEX II,20,$1.00,$20.00"
    ].join("\n")
  });

  assert.equal(result.validation.ok, true);
  assert.equal(result.records.length, 2);
  assert.deepEqual(result.records.map((record) => record.company), ["US EQ S&P 500 INDEX", "US EQ S&P 500 INDEX II"]);
  assert.equal(result.importReport.duplicateRows.length, 0);
  assert.equal(result.records.every((record) => record.localIdentifier), true);
});

test("Fidelity option-like symbols import as local non-market-data holdings", () => {
  const result = adapters.buildImportResult({
    fidelityFileName: "fidelity-options.csv",
    fidelityCsv: [
      "Account Name,Symbol,Description,Quantity,Last Price,Current Value,Cost Basis Total,Type",
      'Taxable,-AAPL250620C00190000,AAPL Jun 20 2025 $190 Call,1,$12.34,"$1,234.00",$900.00,Option',
      "Taxable,BAD!,Punctuation contaminated ticker,1,$10.00,$10.00,$5.00,Stock"
    ].join("\n")
  });
  const option = result.records.find((record) => record.company.includes("AAPL"));

  assert.equal(result.validation.ok, true);
  assert.equal(result.importReport.health.status, "Partial success");
  assert.ok(option);
  assert.equal(option.ticker, "AAPL250620");
  assert.equal(option.localIdentifier, true);
  assert.equal(option.sourceSymbolNonStandard, true);
  assert.equal(option.marketDataEligible, false);
  assert.equal(option.marketValue, 1234);
  assert.equal(result.importReport.rejectedRows.length, 1);
  assert.match(result.importReport.rejectedRows[0].reasons.join(" "), /invalid ticker/);
  assert.match(result.importReport.mappingWarnings.join(" "), /local identifiers/);
});

test("Fidelity export cash footnotes and cost basis totals normalize correctly", () => {
  const result = adapters.buildImportResult({
    fidelityFileName: "portfolio-positions.csv",
    fidelityCsv: `Account Number,Account Name,Symbol,Description,Quantity,Last Price,Current Value,Total Gain/Loss Dollar,Total Gain/Loss Percent,Cost Basis Total,Average Cost Basis,Type
12345,Individual - TOD,SPAXX**,HELD IN MONEY MARKET,,,$413.69,,,,$1.00,Cash
12345,Individual - TOD,MU,MICRON TECHNOLOGY INC,10,$100.00,$1000.00,+$250.00,+33.33%,$750.00,$75.00,Cash`
  });
  const cash = result.records.find((record) => record.ticker === "SPAXX");
  const mu = result.records.find((record) => record.ticker === "MU");

  assert.equal(result.validation.ok, true);
  assert.equal(result.importReport.health.status, "Success");
  assert.equal(result.importReport.columnMapping.account, "Account Name");
  assert.equal(result.importReport.columnMapping.costBasis, "Cost Basis Total");
  assert.equal(cash.assetClass, "Cash");
  assert.equal(cash.marketValue, 413.69);
  assert.equal(mu.account, "Individual - TOD");
  assert.notEqual(mu.assetClass, "Cash");
  assert.equal(mu.costBasis, 750);
  assert.equal(mu.unrealizedGain, 250);
  assert.equal(Math.round(mu.unrealizedGainPercent * 10000) / 10000, 0.3333);
});

test("Fidelity cash credit balance rows are treated as cash holdings", () => {
  const result = adapters.buildImportResult({
    fidelityFileName: "fidelity-cash-credit.csv",
    fidelityCsv: 'Account Name,Symbol,Description,Quantity,Last Price,Current Value,Cost Basis Total,Type\nTaxable,,Cash Credit Balance,,,"$42.17",,Cash'
  });
  const cash = result.records[0];

  assert.equal(result.validation.ok, true);
  assert.equal(result.importReport.health.status, "Success");
  assert.equal(cash.assetClass, "Cash");
  assert.equal(cash.marketValue, 42.17);
  assert.equal(cash.marketDataEligible, false);
});

test("Fidelity Type Cash does not inflate cash category for ordinary securities", () => {
  const result = adapters.buildImportResult({
    fidelityFileName: "portfolio-positions.csv",
    fidelityCsv: `Account Number,Account Name,Symbol,Description,Quantity,Last Price,Current Value,Cost Basis Total,Type
12345,Individual - TOD,SPAXX**,HELD IN MONEY MARKET,,,$413.69,,Cash
12345,Individual - TOD,MU,MICRON TECHNOLOGY INC,10,$100.00,$1000.00,$750.00,Cash
12345,Individual - TOD,NVDA,NVIDIA CORP,2,$1000.00,$2000.00,$1500.00,Cash`
  });
  const analysis = analyzePortfolio(normalizeHoldings(result.records));
  const cashBreakdown = analysis.breakdowns.assetClass.find((row) => row.name === "Cash");
  const equityBreakdown = analysis.breakdowns.assetClass.find((row) => row.name === "Equity");
  const cashSector = analysis.breakdowns.sector.find((row) => row.name === "Cash");

  assert.equal(result.validation.ok, true);
  assert.equal(analysis.overview.cashBalance, 413.69);
  assert.equal(cashBreakdown.value, 413.69);
  assert.equal(cashSector.value, 413.69);
  assert.equal(equityBreakdown.value, 3000);
  assert.equal(analysis.holdings.find((holding) => holding.ticker === "MU").assetClass, "Equity");
  assert.equal(analysis.holdings.find((holding) => holding.ticker === "NVDA").assetClass, "Equity");
});

test("account-number-only imports are masked in holdings and import reports", () => {
  const result = adapters.buildImportResult({
    fidelityFileName: "account-number-only.csv",
    fidelityCsv: `Account Number,Symbol,Description,Quantity,Last Price,Current Value,Cost Basis,API Token
987654321,MU,Micron Technology,10,100,1000,750,local-placeholder-token
987654321,,Footer row,,,,,local-placeholder-token`
  });
  const normalized = normalizeHoldings(result.records);
  const rejected = result.importReport.rejectedRows[0];

  assert.equal(sanitizeAccountLabel("987654321"), "Account ending 4321");
  assert.equal(result.records[0].account, "Account ending 4321");
  assert.equal(normalized[0].account, "Account ending 4321");
  assert.deepEqual(result.importReport.accountsDetected, ["Account ending 4321"]);
  assert.equal(rejected.values["Account Number"], "Account ending 4321");
  assert.equal(rejected.values["API Token"], "[redacted]");
  assert.equal(JSON.stringify(result).includes("987654321"), false);
  assert.equal(JSON.stringify(result).includes("local-placeholder-token"), false);
});

test("portfolio import diagnostics mask account-name-number columns and account-shaped file names", () => {
  const result = adapters.buildImportResult({
    fidelityFileName: "Brokerage-123456789-Positions.csv",
    fidelityCsv: `Account Name/Number,Symbol,Description,Quantity,Current Value,Cost Basis
Taxable 123456789,BAD!,Bad ticker,1,100,80
Taxable 123456789,MU,Micron Technology,10,1000,750`
  });
  const visibleReport = JSON.stringify(result.importReport);

  assert.equal(result.validation.ok, true);
  assert.equal(result.importReport.fileName, "Brokerage-••6789-Positions.csv");
  assert.equal(result.importReport.rejectedRows.length, 1);
  assert.equal(result.importReport.rejectedRows[0].values["Account Name/Number"], "Taxable •••••6789");
  assert.equal(result.records[0].account, "Taxable •••••6789");
  assert.equal(visibleReport.includes("123456789"), false);
});

test("Fidelity rows with missing optional cost basis do not fabricate gain/loss", () => {
  const result = adapters.buildImportResult({
    fidelityFileName: "missing-cost-basis.csv",
    fidelityCsv: `Account Name,Symbol,Description,Quantity,Last Price,Current Value,Cost Basis
Taxable,MU,Micron Technology,10,$100.00,"$1,000.00",--`
  });
  const holding = result.records[0];
  const normalized = normalizeHoldings(result.records)[0];

  assert.equal(result.validation.ok, true);
  assert.equal(result.importReport.health.status, "Success");
  assert.equal(holding.costBasis, undefined);
  assert.equal(holding.missingCostBasis, true);
  assert.equal(holding.unrealizedGain, undefined);
  assert.equal(normalized.costBasis, undefined);
  assert.equal(normalized.missingCostBasis, true);
  assert.equal(normalized.unrealizedGain, undefined);
});

test("Fidelity average-cost-basis USD headers are treated as per-share cost basis", () => {
  const result = adapters.buildImportResult({
    fidelityFileName: "average-cost-basis-usd.csv",
    fidelityCsv: `Account Name,Symbol,Description,Quantity,Last Price,Current Value,Average Cost Basis USD,Total Gain/Loss Dollar
Taxable,MU,Micron Technology,10,$100.00,"$1,000.00",$75.00,$250.00`
  });
  const mu = result.records[0];

  assert.equal(result.validation.ok, true);
  assert.equal(result.importReport.columnMapping.costBasis, "Average Cost Basis USD");
  assert.equal(mu.costBasis, 750);
  assert.equal(mu.unrealizedGain, 250);
});

test("generic brokerage CSV maps common position columns", () => {
  const csv = `Account,Ticker,Description,Shares,Current Price,Market Value,Cost Basis,Sector
Brokerage,SOXL,Direxion Daily Semiconductor Bull 3X Shares,30,45.25,1357.50,1100.00,Semiconductors
Brokerage,VGT,Vanguard Information Technology ETF,4,525.00,2100.00,1800.00,Mega-cap tech`;
  const result = adapters.buildImportResult({
    fidelityFileName: "generic-brokerage.csv",
    fidelityCsv: csv
  });
  const soxl = result.records.find((record) => record.ticker === "SOXL");

  assert.equal(result.validation.ok, true);
  assert.equal(result.records.length, 2);
  assert.equal(soxl.marketValue, 1357.5);
  assert.equal(soxl.company, "Direxion Daily Semiconductor Bull 3X Shares");
  assert.equal(result.importReport.columnMapping.marketValue, "Market Value");
  assert.equal(result.importReport.health.status, "Success");
});

test("messy brokerage fixture imports with preview-safe report fields and duplicate merges", () => {
  const result = adapters.buildImportResult({
    fidelityFileName: "sample-messy-brokerage-positions.csv",
    fidelityCsv: readFileSync("data/sample-messy-brokerage-positions.csv", "utf8")
  });
  const mu = result.records.find((record) => record.ticker === "MU");
  const nvda = result.records.find((record) => record.ticker === "NVDA");
  const cash = result.records.find((record) => record.ticker === "SPAXX");

  assert.equal(result.validation.ok, true);
  assert.equal(result.importReport.rowsParsed, 6);
  assert.equal(result.importReport.holdingsImported, 3);
  assert.equal(result.importReport.rejectedRows.length, 2);
  assert.equal(result.importReport.rejectedRows.every((row) => row.classification === "non-holding row"), true);
  assert.equal(result.importReport.duplicateRows.length, 1);
  assert.equal(result.importReport.duplicateRows[0].ticker, "MU");
  assert.deepEqual(result.records.map((record) => record.ticker).sort(), ["MU", "NVDA", "SPAXX"]);
  assert.equal(mu.account, "Taxable Brokerage");
  assert.equal(mu.accountType, "Taxable");
  assert.equal(mu.shares, 12);
  assert.equal(mu.marketValue, 1255);
  assert.equal(mu.costBasis, 910);
  assert.equal(mu.unrealizedGain, 345);
  assert.equal(Math.round(mu.price * 100) / 100, 104.58);
  assert.equal(nvda.accountType, "Retirement");
  assert.equal(cash.assetClass, "Cash");
  assert.equal(result.importReport.totalMarketValue, 2618.69);
  assert.equal(result.importReport.health.status, "Imported with skipped non-holding rows");
  assert.match(result.importReport.health.message, /skipped 2 harmless non-holding rows/);
  assert.ok(result.importReport.unsupportedColumns.includes("Export Memo"));
});

test("torture brokerage CSV reports bad rows while normalizing accepted holdings", () => {
  const result = adapters.buildImportResult({
    fidelityFileName: "torture-brokerage-positions.csv",
    fidelityCsv: readFileSync("data/torture-brokerage-positions.csv", "utf8")
  });
  const mu = result.records.find((record) => record.ticker === "MU");
  const amd = result.records.find((record) => record.ticker === "AMD");
  const cash = result.records.find((record) => record.ticker === "SPAXX");
  const invalidTickerRow = result.importReport.rejectedRows.find((row) => row.values.Symbol === "1234");
  const negativeQuantityRow = result.importReport.rejectedRows.find((row) => row.values.Symbol === "QQQ");

  assert.equal(result.validation.ok, true);
  assert.equal(result.importReport.rowsParsed, 8);
  assert.equal(result.importReport.holdingsImported, 4);
  assert.equal(result.importReport.rejectedRows.length, 3);
  assert.equal(result.importReport.rejectedRows.filter((row) => row.classification === "non-holding row").length, 1);
  assert.equal(result.importReport.health.status, "Partial success");
  assert.match(result.importReport.health.message, /rejected 3 rows/i);
  assert.equal(result.importReport.duplicateRows.length, 1);
  assert.equal(result.importReport.duplicateRows[0].ticker, "MU");
  assert.equal(mu.shares, 12);
  assert.equal(mu.marketValue, 1255);
  assert.equal(mu.costBasis, 910);
  assert.equal(amd.price, 180);
  assert.equal(amd.marketValue, 540);
  assert.equal(cash.assetClass, "Cash");
  assert.equal(result.importReport.totalMarketValue, 3245.5);
  assert.match(invalidTickerRow.reasons.join(" "), /invalid ticker/);
  assert.match(negativeQuantityRow.reasons.join(" "), /negative quantity requires review/);
  assert.ok(result.importReport.unsupportedColumns.includes("Unmapped Note"));
});

test("bad Fidelity activity CSV fails with actionable diagnostics and expected columns", () => {
  const result = adapters.buildImportResult({
    fidelityFileName: "bad-fidelity-activity.csv",
    fidelityCsv: readFileSync("data/bad-fidelity-activity.csv", "utf8")
  });
  const report = result.importReport;

  assert.equal(result.validation.ok, true);
  assert.equal(result.records.length, 0);
  assert.equal(report.health.status, "Failed");
  assert.match(report.health.message, /activity\/transaction export/i);
  assert.match(report.health.message, /Symbol/);
  assert.equal(report.rowsParsed, 3);
  assert.equal(report.rejectedRows.length, 3);
  assert.equal(report.rejectedRows[0].rowNumber, 2);
  assert.match(report.rejectedRows[0].reasons.join(" "), /unsupported transaction\/activity export/);
  assert.ok(report.expectedColumns.some((column) => column.field === "ticker" && column.examples.includes("Symbol")));
  assert.ok(report.expectedColumns.some((column) => column.field === "marketValue" && column.examples.includes("Current Value")));
  assert.ok(report.mappingWarnings.some((warning) => /activity\/transaction export/i.test(warning)));
  assert.ok(report.recoveryActions.some((action) => /Positions\/Holdings/i.test(action)));
});

test("empty Fidelity CSV still explains expected holdings columns", () => {
  const result = adapters.buildImportResult({
    fidelityFileName: "empty-fidelity.csv",
    fidelityCsv: ""
  });
  const report = result.importReport;

  assert.equal(result.records.length, 0);
  assert.equal(report.health.status, "Failed");
  assert.match(report.health.message, /no CSV rows were parsed/i);
  assert.match(report.health.message, /Symbol/);
  assert.equal(report.fileName, "empty-fidelity.csv");
  assert.ok(report.expectedColumns.some((column) => column.field === "ticker" && column.examples.includes("Symbol")));
  assert.ok(report.expectedColumns.some((column) => column.field === "marketValue" && column.examples.includes("Current Value")));
  assert.ok(report.missingColumnHints.some((hint) => /Ticker\/symbol column not mapped/i.test(hint)));
  assert.ok(report.recoveryActions.some((action) => /Map columns/i.test(action)));
});

test("Fidelity footer rows do not inflate missing required field diagnostics", () => {
  const result = adapters.buildImportResult({
    fidelityCsv: `Account Name,Symbol,Description,Quantity,Last Price,Current Value,Cost Basis
Taxable,MU,Micron Technology,10,$100.00,"$1,000.00",$750.00
Footer,,Prices delayed,,,,`
  });

  assert.equal(result.importReport.health.status, "Imported with skipped non-holding rows");
  assert.equal(result.importReport.rejectedRows[0].classification, "non-holding row");
  assert.deepEqual(result.importReport.missingRequiredFields, []);
});

test("Fidelity exports infer blank last price and convert average cost basis totals", () => {
  const result = adapters.buildImportResult({
    fidelityFileName: "fidelity-average-cost.csv",
    fidelityCsv: `Account Name,Symbol,Description,Quantity,Last Price,Current Value,Average Cost Basis,Total Gain/Loss Dollar
Taxable,MU,Micron Technology,10,,$1,250.00,$75.00,$500.00`
  });
  const mu = result.records[0];

  assert.equal(result.validation.ok, true);
  assert.equal(result.importReport.health.status, "Success");
  assert.equal(mu.ticker, "MU");
  assert.equal(mu.price, 125);
  assert.equal(mu.marketValue, 1250);
  assert.equal(mu.costBasis, 750);
  assert.equal(mu.unrealizedGain, 500);
});

test("Fidelity header detection handles long preambles and tab-delimited exports", () => {
  const preamble = Array.from({ length: 10 }, (_, index) => `Fidelity export note ${index + 1}`).join("\n");
  const result = adapters.buildImportResult({
    fidelityFileName: "fidelity-tabs.csv",
    fidelityCsv: `${preamble}
Account Name\tAccount Type\tSymbol\tDescription\tQuantity\tLast Price\tCurrent Value\tCost Basis Total
Taxable\tTaxable\tNVDA\tNVIDIA Corp\t2\t$950.00\t$1,900.00\t$1,200.00
Footer\t\t\t\t\t\t\t`
  });
  const nvda = result.records[0];

  assert.equal(result.validation.ok, true);
  assert.equal(result.importReport.detectedColumns.includes("Symbol"), true);
  assert.equal(result.importReport.holdingsImported, 1);
  assert.equal(result.importReport.rejectedRows.length, 1);
  assert.equal(nvda.ticker, "NVDA");
  assert.equal(nvda.marketValue, 1900);
  assert.equal(nvda.costBasis, 1200);
});

test("Fidelity header detection survives very long preambles", () => {
  const preamble = Array.from({ length: 60 }, (_, index) => `Fidelity legal export note ${index + 1}`).join("\n");
  const result = adapters.buildImportResult({
    fidelityFileName: "long-preamble.csv",
    fidelityCsv: `${preamble}
Account Name,Symbol,Description,Quantity,Last Price,Current Value,Cost Basis Total
Taxable,MU,Micron Technology,10,$100.00,"$1,000.00",$750.00`
  });

  assert.equal(result.validation.ok, true);
  assert.equal(result.importReport.health.status, "Success");
  assert.equal(result.importReport.detectedColumns.includes("Symbol"), true);
  assert.equal(result.records[0].ticker, "MU");
  assert.equal(result.records[0].marketValue, 1000);
});

test("Fidelity repeated sections and account context are interpreted cleanly", () => {
  const result = adapters.buildImportResult({
    fidelityFileName: "sectioned-fidelity.csv",
    fidelityCsv: `Account: Taxable Brokerage - 1234
Symbol,Description,Quantity,Last Price,Current Value,Cost Basis Total
MU,Micron Technology,10,$100.00,"$1,000.00",$750.00
Account Total,,10,,$1000.00,$750.00
Symbol,Description,Quantity,Last Price,Current Value,Cost Basis Total
Account: Roth IRA - 9999
NVDA,NVIDIA Corp,2,$950.00,"$1,900.00",$1,200.00
Footer,,,,,`
  });
  const mu = result.records.find((record) => record.ticker === "MU");
  const nvda = result.records.find((record) => record.ticker === "NVDA");

  assert.equal(result.validation.ok, true);
  assert.equal(result.importReport.holdingsImported, 2);
  assert.equal(countHoldingRowsNeedingReview(result.importReport), 0);
  assert.equal(result.importReport.rejectedRows.every((row) => row.classification === "non-holding row"), true);
  assert.equal(mu.account, "Taxable Brokerage - 1234");
  assert.equal(nvda.account, "Roth IRA - 9999");
  assert.equal(result.importReport.rejectedRows.some((row) => row.values.Symbol === "Symbol"), true);
});

test("Fidelity quoted multi-line descriptions remain one holding row", () => {
  const result = adapters.buildImportResult({
    fidelityFileName: "multiline-description.csv",
    fidelityCsv: `Account Name,Symbol,Description,Quantity,Last Price,Current Value,Cost Basis Total
Taxable,MU,"Micron Technology
Inc.",10,$100.00,"$1,000.00",$750.00`
  });

  assert.equal(result.validation.ok, true);
  assert.equal(result.importReport.rowsParsed, 1);
  assert.equal(result.importReport.health.status, "Success");
  assert.equal(result.records[0].ticker, "MU");
  assert.match(result.records[0].company, /Micron Technology/);
});

test("nested account-shaped holdings JSON inherits account metadata", () => {
  const result = adapters.buildImportResult({
    fidelityFileName: "accounts-positions.json",
    fidelityJson: JSON.stringify({
      accounts: [
        {
          name: "Taxable Brokerage",
          type: "Taxable",
          positions: [
            {
              security: { identifiers: { symbol: "CRDO" }, description: "Credo Technology Group" },
              position: { quantity: 12 },
              pricing: { currentPrice: 80, marketValue: 960 },
              cost: { costBasisTotal: 720 }
            }
          ]
        }
      ]
    })
  });
  const crdo = result.records[0];

  assert.equal(result.validation.ok, true);
  assert.equal(result.importReport.health.status, "Success");
  assert.equal(crdo.ticker, "CRDO");
  assert.equal(crdo.account, "Taxable Brokerage");
  assert.equal(crdo.accountType, "Taxable");
  assert.equal(crdo.shares, 12);
  assert.equal(crdo.price, 80);
  assert.equal(crdo.marketValue, 960);
  assert.equal(crdo.costBasis, 720);
});

test("Fidelity rows with unquoted thousands commas repair numeric columns safely", () => {
  const result = adapters.buildImportResult({
    fidelityFileName: "fidelity-thousands.csv",
    fidelityCsv: `Account Number,Account Name,Symbol,Description,Quantity,Last Price,Last Price Change,Current Value,Today's Gain/Loss Dollar,Today's Gain/Loss Percent,Total Gain/Loss Dollar,Total Gain/Loss Percent,Percent Of Account,Cost Basis Total,Average Cost Basis,Type
12345,Taxable,MU,Micron Technology,100,$89.12,+$1.00,$8,912.00,+$10.00,+0.11%,+$512.00,+6.10%,12.30%,$8,400.00,$84.00,Stock`
  });
  const mu = result.records[0];

  assert.equal(result.validation.ok, true);
  assert.equal(result.records.length, 1);
  assert.equal(result.importReport.health.status, "Success");
  assert.equal(result.importReport.rejectedRows.length, 0);
  assert.equal(mu.ticker, "MU");
  assert.equal(mu.marketValue, 8912);
  assert.equal(mu.costBasis, 8400);
  assert.equal(mu.unrealizedGain, 512);
  assert.equal(result.importReport.totalMarketValue, 8912);
  assert.match(result.importReport.mappingWarnings.join(" "), /Adjusted 1 row/);
  assert.match(result.importReport.mappingWarnings.join(" "), /split numeric cell/);
});

test("Fidelity rows with multiple unquoted thousands fields repair safely", () => {
  const result = adapters.buildImportResult({
    fidelityFileName: "fidelity-many-thousands.csv",
    fidelityCsv: `Account Number,Account Name,Symbol,Description,Quantity,Last Price,Last Price Change,Current Value,Today's Gain/Loss Dollar,Today's Gain/Loss Percent,Total Gain/Loss Dollar,Total Gain/Loss Percent,Percent Of Account,Cost Basis Total,Average Cost Basis,Type
12345,Taxable,NVDA,NVIDIA Corp,10,$1,000.00,+$1.00,$10,000.00,+$100.00,+1.00%,+$2,500.00,+33.33%,20.00%,$7,500.00,$750.00,Stock`
  });
  const nvda = result.records[0];

  assert.equal(result.validation.ok, true);
  assert.equal(result.importReport.health.status, "Success");
  assert.equal(nvda.price, 1000);
  assert.equal(nvda.marketValue, 10000);
  assert.equal(nvda.unrealizedGain, 2500);
  assert.equal(nvda.costBasis, 7500);
  assert.match(result.importReport.mappingWarnings.join(" "), /split numeric cell/);
});

test("Fidelity rows with trailing empty cells import instead of requiring manual mapping", () => {
  const result = adapters.buildImportResult({
    fidelityFileName: "fidelity-trailing-comma.csv",
    fidelityCsv: `Account Number,Account Name,Symbol,Description,Quantity,Last Price,Last Price Change,Current Value,Today's Gain/Loss Dollar,Today's Gain/Loss Percent,Total Gain/Loss Dollar,Total Gain/Loss Percent,Percent Of Account,Cost Basis Total,Average Cost Basis,Type
12345,Taxable,NVDA,NVIDIA Corp,2,$950.00,+$5.00,$1900.00,+$10.00,+0.53%,+$700.00,+58.33%,15.00%,$1200.00,$600.00,Stock,`
  });
  const nvda = result.records[0];

  assert.equal(result.validation.ok, true);
  assert.equal(result.records.length, 1);
  assert.equal(result.importReport.health.status, "Success");
  assert.equal(result.importReport.rejectedRows.length, 0);
  assert.equal(nvda.ticker, "NVDA");
  assert.equal(nvda.marketValue, 1900);
  assert.match(result.importReport.mappingWarnings.join(" "), /trailing empty CSV cells/);
});

test("ambiguous unquoted comma rows are still rejected instead of silently shifted", () => {
  const result = adapters.buildImportResult({
    fidelityFileName: "bad-thousands.csv",
    fidelityCsv: `Account,Symbol,Description,Quantity,Current Price,Market Value,Cost Basis
Taxable,MU,Micron Technology,10,$104.50,$1,45.00,$750.00`
  });

  assert.equal(result.validation.ok, true);
  assert.equal(result.records.length, 0);
  assert.equal(result.importReport.health.status, "Failed");
  assert.equal(result.importReport.rejectedRows.length, 1);
  assert.match(result.importReport.rejectedRows[0].reasons.join(" "), /column count mismatch/);
  assert.notEqual(result.importReport.totalMarketValue, 1);
});

test("dirty ticker strings are rejected while common symbols normalize", () => {
  const result = adapters.buildImportResult({
    fidelityCsv: `Account,Symbol,Description,Quantity,Current Price,Market Value,Cost Basis
Taxable,brk/b,Berkshire Hathaway Class B,1,400,400,300
Taxable,BAD!,Punctuation contaminated ticker,1,10,10,5`
  });

  assert.equal(result.validation.ok, true);
  assert.deepEqual(result.records.map((record) => record.ticker), ["BRK.B"]);
  assert.equal(result.importReport.rejectedRows.length, 1);
  assert.match(result.importReport.rejectedRows[0].reasons.join(" "), /invalid ticker/);
});

test("duplicate ticker rows without account mapping produce a review warning", () => {
  const result = adapters.buildImportResult({
    fidelityCsv: `Symbol,Description,Quantity,Current Price,Market Value,Cost Basis
MU,Micron lot one,1,100,100,80
MU,Micron lot two,2,100,200,160`
  });

  assert.equal(result.validation.ok, true);
  assert.equal(result.records.length, 1);
  assert.equal(result.importReport.duplicateRows.length, 1);
  assert.match(result.importReport.mappingWarnings.join(" "), /without an account column mapping/);
});

test("same ticker across different accounts is normal and not a duplicate merge warning", () => {
  const result = adapters.buildImportResult({
    fidelityCsv: `Account,Symbol,Description,Quantity,Current Price,Market Value,Cost Basis
Taxable,MU,Micron lot taxable,1,100,100,80
Roth IRA,MU,Micron lot roth,2,100,200,160`
  });

  assert.equal(result.validation.ok, true);
  assert.equal(result.records.length, 2);
  assert.equal(result.importReport.duplicateRows.length, 0);
  assert.equal(result.validation.warnings.some((warning) => /duplicate ticker will be merged/i.test(warning)), false);
  assert.match(result.summary.message, /Same ticker held across multiple accounts: MU/);
});

test("symbol-less cash rows can infer tickers from Fidelity descriptions", () => {
  const result = adapters.buildImportResult({
    fidelityCsv: `Account Name,Symbol,Description,Quantity,Last Price,Current Value,Cost Basis Total,Type
Taxable,,FIDELITY GOVERNMENT MONEY MARKET (SPAXX),,,$1,234.56,,Cash`
  });
  const cash = result.records[0];

  assert.equal(result.validation.ok, true);
  assert.equal(result.importReport.health.status, "Success");
  assert.equal(cash.ticker, "SPAXX");
  assert.equal(cash.sourceSymbolInferred, true);
  assert.equal(cash.assetClass, "Cash");
  assert.equal(cash.marketValue, 1234.56);
});

test("holdings JSON import normalizes nested account and security fields", () => {
  const result = adapters.buildImportResult({
    fidelityFileName: "sample-holdings-import.json",
    fidelityJson: readFileSync("data/sample-holdings-import.json", "utf8")
  });
  const amd = result.records.find((record) => record.ticker === "AMD");
  const vgt = result.records.find((record) => record.ticker === "VGT");

  assert.equal(result.validation.ok, true);
  assert.equal(result.importReport.health.status, "Success");
  assert.equal(result.importReport.holdingsImported, 2);
  assert.equal(amd.account, "Taxable Brokerage");
  assert.equal(amd.accountType, "Taxable");
  assert.equal(amd.company, "Advanced Micro Devices");
  assert.equal(amd.marketValue, 1080);
  assert.equal(amd.unrealizedGain, 180);
  assert.equal(vgt.account, "Roth IRA");
  assert.equal(vgt.accountType, "Retirement");
  assert.equal(vgt.marketValue, 2100);
});

test("torture holdings JSON reports invalid rows without throwing", () => {
  const result = adapters.buildImportResult({
    fidelityFileName: "torture-holdings-import.json",
    fidelityJson: readFileSync("data/torture-holdings-import.json", "utf8")
  });
  const crdo = result.records.find((record) => record.ticker === "CRDO");
  const vgt = result.records.find((record) => record.ticker === "VGT");

  assert.equal(result.validation.ok, true);
  assert.equal(result.importReport.health.status, "Partial success");
  assert.equal(result.importReport.holdingsImported, 2);
  assert.equal(result.importReport.rejectedRows.length, 2);
  assert.match(result.importReport.rejectedRows[0].reasons.join(" "), /invalid ticker/);
  assert.match(result.importReport.rejectedRows[1].reasons.join(" "), /negative quantity requires review/);
  assert.equal(crdo.account, "Taxable");
  assert.equal(crdo.accountType, "Taxable");
  assert.equal(crdo.marketValue, 960);
  assert.equal(vgt.account, "Roth IRA");
  assert.equal(vgt.marketValue, 2100);
});

test("malformed holdings JSON returns a failed import report", () => {
  const result = adapters.buildImportResult({
    fidelityFileName: "broken-holdings.json",
    fidelityJson: "{ not-json"
  });

  assert.equal(result.validation.ok, false);
  assert.equal(result.records.length, 0);
  assert.equal(result.importReport.health.status, "Failed");
  assert.match(result.importReport.health.message, /Holdings JSON could not be parsed/);
  assert.equal(result.importReport.rejectedRows[0].classification, "needs review");
});

test("large portfolio CSV normalizes without duplicate collapse or crashes", () => {
  const rows = Array.from({ length: 1200 }, (_, index) => {
    const ticker = `AA${index}`;
    return `Taxable,${ticker},Large Portfolio Holding ${index},1,10,10,8`;
  });
  const result = adapters.buildImportResult({
    fidelityFileName: "large-portfolio.csv",
    fidelityCsv: `Account,Symbol,Description,Quantity,Current Price,Market Value,Cost Basis\n${rows.join("\n")}`
  });

  assert.equal(result.validation.ok, true);
  assert.equal(result.importReport.health.status, "Success");
  assert.equal(result.importReport.rowsParsed, 1200);
  assert.equal(result.records.length, 1200);
  assert.equal(result.importReport.totalMarketValue, 12000);
  assert.equal(result.importReport.duplicateRows.length, 0);
});

test("stale stored holdings are repaired safely during normalization", () => {
  const holdings = normalizeHoldings([
    {
      ticker: "mu",
      name: "Micron Technology",
      account: "Taxable",
      marketValue: "$1,000.00",
      costBasis: "$750.00",
      dailyChange: "($25.00)",
      assetClass: "Cash",
      sector: "Cash",
      strategySleeve: "Cash",
      cash: true
    },
    {
      ticker: "spaxx**",
      name: "HELD IN MONEY MARKET",
      account: "Taxable",
      marketValue: "$1,234.56",
      dailyChangePercent: "0.5%",
      assetClass: "Cash",
      sector: "Cash",
      cash: true
    }
  ]);
  const mu = holdings.find((holding) => holding.ticker === "MU");
  const cash = holdings.find((holding) => holding.ticker === "SPAXX");

  assert.equal(mu.assetClass, "Equity");
  assert.equal(mu.sector, "Semiconductors");
  assert.equal(mu.dailyChange, -25);
  assert.equal(mu.dailyChangePercent, -0.025);
  assert.equal(cash.assetClass, "Cash");
  assert.equal(cash.marketValue, 1234.56);
  assert.equal(Math.round(cash.dailyChange * 100) / 100, 6.17);
});

test("manual column mapping fallback rescues unusual brokerage headers", () => {
  const csv = `Portfolio Bucket,Instrument Code,Issuer Label,Position Count,Quoted NAV,Portfolio Dollars,Original Dollars
Taxable,CRDO,Credo Technology Group,25,77.50,1937.50,1200.00
Taxable,AMD,Advanced Micro Devices,6,180.00,1080.00,900.00`;
  const failed = adapters.buildImportResult({ fidelityCsv: csv, fidelityFileName: "odd-export.csv" });
  const rescued = adapters.buildImportResult({
    fidelityCsv: csv,
    fidelityFileName: "odd-export.csv",
    columnMapping: {
      account: "Portfolio Bucket",
      ticker: "Instrument Code",
      company: "Issuer Label",
      shares: "Position Count",
      price: "Quoted NAV",
      marketValue: "Portfolio Dollars",
      costBasis: "Original Dollars"
    }
  });

  assert.equal(failed.records.length, 0);
  assert.equal(failed.importReport.rejectedRows.length, 2);
  assert.equal(failed.importReport.health.status, "Needs manual mapping");
  assert.equal(rescued.validation.ok, true);
  assert.equal(rescued.records.length, 2);
  assert.equal(rescued.importReport.columnMapping.ticker, "Instrument Code");
  assert.deepEqual(rescued.importReport.tickersDetected, ["AMD", "CRDO"]);
});

test("rejected brokerage rows explain missing values and invalid number formats", () => {
  const result = adapters.buildImportResult({
    fidelityCsv: `Account,Symbol,Description,Shares,Current Price,Market Value,Cost Basis,Unmapped Memo
Taxable,,No symbol fund,10,50,500,400,missing ticker
Taxable,MU,Micron Technology,not-a-number,104,,900,bad shares
Taxable,NVDA,NVIDIA,2,950,1900,1200,ok`
  });

  assert.equal(result.importReport.health.status, "Partial success");
  const localIdentifier = result.records.find((record) => record.localIdentifier);

  assert.equal(result.importReport.holdingsImported, 2);
  assert.equal(result.importReport.rejectedRows.length, 1);
  assert.ok(localIdentifier);
  assert.equal(localIdentifier.company, "No symbol fund");
  assert.match(result.importReport.rejectedRows[0].reasons.join(" "), /invalid number format in shares/);
  assert.ok(result.importReport.unsupportedColumns.includes("Unmapped Memo"));
  assert.equal(countHoldingRowsNeedingReview(result.importReport), 1);
});

test("accepted CSV holdings drive overview, accounts, alpha weights, alerts, and state payload shape", () => {
  const csv = `Account,Symbol,Description,Quantity,Current Price,Market Value,Total Cost Basis,Sector
Taxable,MU,Micron Technology Inc,12,104.50,1254.00,900.00,Semiconductors
Roth IRA,MU,Micron Technology Inc,5,104.50,522.50,500.00,Semiconductors
HSA,NVDA,NVIDIA Corp,2,950.00,1900.00,1200.00,Semiconductors
Taxable,SOXL,Direxion Semiconductor Bull 3X,20,45.00,900.00,700.00,Semiconductors`;
  const result = adapters.buildImportResult({ fidelityCsv: csv });
  const holdings = normalizeHoldings(result.records);
  const analysis = analyzePortfolio(holdings);
  const accountScope = buildAccountScopeModel(holdings);
  const samsung = buildAlphaSignals(demoAlphaEvents(), analysis.holdings, demoThesisProfiles())
    .find((signal) => signal.id === "alpha-samsung-strike-mu");
  const statePayload = {
    schemaVersion: 1,
    holdings,
    safety: { includesPasswords: false, includesApiKeys: false }
  };
  const restoredHoldings = normalizeHoldings(JSON.parse(JSON.stringify(statePayload)).holdings);

  assert.equal(result.importReport.health.status, "Success");
  assert.equal(holdings.filter((holding) => holding.ticker === "MU").length, 2);
  assert.equal(analysis.overview.totalValue, 4576.5);
  assert.equal(analysis.risk.topHoldings[0].ticker, "NVDA");
  assert.deepEqual(analysis.breakdowns.account.map((account) => account.name).sort(), ["HSA", "Roth IRA", "Taxable"]);
  assert.deepEqual(accountScope.accounts.map((account) => account.taxBucket.key).sort(), ["hsa", "roth", "taxable"]);
  assert.equal(accountScope.accounts.find((account) => account.account === "Taxable").portfolioWeight > 0.45, true);
  assert.equal(accountScope.accounts.find((account) => account.account === "HSA").topPositions[0].ticker, "NVDA");
  assert.ok(analysis.alerts.length > 0);
  assert.equal(Math.round(samsung.affectedWeight * 1000) / 1000, Math.round((4576.5 / 4576.5) * 1000) / 1000);
  assert.match(samsung.affectedWeightLabel, /100/);
  assert.equal(restoredHoldings.length, holdings.length);
  assert.equal(statePayload.safety.includesPasswords, false);
  assert.equal(statePayload.safety.includesApiKeys, false);
});
