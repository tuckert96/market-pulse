import { readFileSync } from "node:fs";
import { parseLocalDataFixtureJson, validateLocalDataBundle } from "../src/localDataContracts.js";

await import("../src/dataAdapters.js");

const adapters = globalThis.DataAdapters;
const fidelityCsv = readFileSync("data/sample-fidelity-positions.csv", "utf8");
const seekingAlphaCsv = readFileSync("data/sample-seeking-alpha-ratings.csv", "utf8");
const result = adapters.buildImportResult({ fidelityCsv, seekingAlphaCsv });
const messyResult = adapters.buildImportResult({
  fidelityFileName: "sample-messy-brokerage-positions.csv",
  fidelityCsv: readFileSync("data/sample-messy-brokerage-positions.csv", "utf8")
});
const jsonHoldingsResult = adapters.buildImportResult({
  fidelityFileName: "sample-holdings-import.json",
  fidelityJson: readFileSync("data/sample-holdings-import.json", "utf8")
});
const tortureCsvResult = adapters.buildImportResult({
  fidelityFileName: "torture-brokerage-positions.csv",
  fidelityCsv: readFileSync("data/torture-brokerage-positions.csv", "utf8")
});
const tortureJsonResult = adapters.buildImportResult({
  fidelityFileName: "torture-holdings-import.json",
  fidelityJson: readFileSync("data/torture-holdings-import.json", "utf8")
});
const fixtureText = readFileSync("data/local-data-fixtures.json", "utf8");
const fixtureParse = parseLocalDataFixtureJson(fixtureText);
assert(!fixtureParse.parseError, fixtureParse.parseError || "fixture JSON should parse");
const fixtureValidation = validateLocalDataBundle(fixtureParse.fixture);

assert(result.validation.ok, `sample import validation failed: ${result.validation.errors.join("; ")}`);
assert(result.fidelityRecords.length === 5, "expected 5 sample Fidelity rows");
assert(result.seekingAlphaRecords.length === 6, "expected 6 sample Seeking Alpha rows");
assert(result.records.some((record) => record.ticker === "NVDA" && Number(record.shares) === 18), "expected NVDA Fidelity position to merge");
assert(result.seekingAlphaRecords.some((record) => record.ticker === "APP" && Number(record.quant) >= 4.8), "expected APP Seeking Alpha rating row");
assert(!result.records.some((record) => record.ticker === "APP"), "Seeking Alpha ratings-only rows should not become portfolio holdings");
assert(messyResult.validation.ok, `messy brokerage validation failed: ${messyResult.validation.errors.join("; ")}`);
assert(messyResult.importReport.duplicateRows.length === 1, "expected messy brokerage fixture to merge duplicate lots");
assert(jsonHoldingsResult.validation.ok, `holdings JSON validation failed: ${jsonHoldingsResult.validation.errors.join("; ")}`);
assert(jsonHoldingsResult.records.some((record) => record.ticker === "AMD" && record.accountType === "Taxable"), "expected holdings JSON fixture to normalize nested account type");
assert(tortureCsvResult.importReport.holdingsImported === 4, "expected torture CSV to import valid rows only");
assert(tortureCsvResult.importReport.rejectedRows.length === 3, "expected torture CSV to reject invalid ticker, negative quantity, and footer rows");
assert(tortureJsonResult.importReport.holdingsImported === 2, "expected torture JSON to import valid rows only");
assert(tortureJsonResult.importReport.rejectedRows.length === 2, "expected torture JSON to reject invalid and negative rows");
assert(fixtureValidation.ok, `local data fixture validation failed: ${fixtureValidation.errors.join("; ")}`);
assert(fixtureValidation.counts.holdings >= 2, "expected local data fixture holdings");
assert(fixtureValidation.counts.decisionJournal >= 1, "expected local data fixture decision journal example");
assert(fixtureValidation.counts.eventCalendar >= 1, "expected local data fixture event calendar example");
assert(fixtureValidation.counts.redditMentions >= 1, "expected local data fixture Reddit mention example");
assert(fixtureValidation.counts.politicianTrades >= 1, "expected local data fixture politician trade example");

console.log(`Data validation passed: ${result.records.length} portfolio tickers, ${result.seekingAlphaRecords.length} Seeking Alpha rating rows, ${messyResult.records.length} messy brokerage holdings, ${jsonHoldingsResult.records.length} JSON holdings, ${tortureCsvResult.records.length} torture CSV holdings, ${tortureJsonResult.records.length} torture JSON holdings, and ${fixtureValidation.counts.dataSources} local data source contracts.`);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
