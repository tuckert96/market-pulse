import { normalizeSeekingAlphaRecord } from "./seekingAlphaConnector.js";
import { readXlsxRows } from "./xlsxWorkbook.js";

const HEADER_ALIASES = Object.freeze({
  ticker: ["ticker", "symbol", "symbols", "watchlistsymbol"],
  company: ["company", "companyname", "name", "securityname", "stock"],
  sector: ["sector", "sectorname"],
  quant: ["quant", "quantrating", "quantscore", "saquant", "quantfactorgrade"],
  authorRating: ["authorrating", "sarating", "saauthorrating", "authorsrating"],
  wallStreetRating: ["wallstreetrating", "sellside", "sellsideconsensus", "analystconsensus", "analystsrating"],
  valuationGrade: ["valuation", "valuationgrade", "value", "valuegrade"],
  growthGrade: ["growth", "growthgrade"],
  profitabilityGrade: ["profitability", "profitabilitygrade"],
  momentumGrade: ["momentum", "momentumgrade"],
  revisionsGrade: ["epsrevisions", "epsrevisionsgrade", "revisions", "revisiongrade"],
  dividendYield: ["dividendyield", "yield", "divyield", "dividend"],
  dividendGrade: ["dividendgrade", "sadividendgrade"],
  grossMargin: ["grossmargin", "grossmarginpercent", "grossprofitmargin"],
  freeCashFlowMargin: ["freecashflowmargin", "fcfmargin", "fcfmarginpercent"],
  priceToSales: ["pricetosales", "psratio", "p/s", "pricesales"],
  operatingCashFlow: ["operatingcashflow", "cashfromoperations", "ocf"],
  capitalExpenditures: ["capitalexpenditures", "capex"],
  freeCashFlow: ["freecashflow", "fcf"],
  cashAndEquivalents: ["cashandequivalents", "totalcash", "cashshortterminvestments"],
  totalDebt: ["totaldebt", "debt", "netdebt"],
  debtToEquity: ["debttoequity", "d/e", "debtequity"],
  nextEarnings: ["nextearnings", "earningsdate", "earnings", "reportdate"],
  priceTarget: ["pricetarget", "pt", "wallstreetpricetarget", "targetprice"],
  ratingChanges: ["ratingchanges", "ratingchange", "quantchange", "gradechanges", "changes"],
  updatedAt: ["updated", "updatedat", "asof", "date"]
});

export async function normalizeSeekingAlphaWorkbook(arrayBuffer) {
  const rows = await readXlsxRows(arrayBuffer);
  return normalizeSeekingAlphaWorkbookRows(rows);
}

export function normalizeSeekingAlphaWorkbookRows(rows = []) {
  const headerIndex = findHeaderRowIndex(rows);
  if (headerIndex < 0) return [];

  const headers = rows[headerIndex].map((header) => canonicalHeader(header));
  return rows
    .slice(headerIndex + 1)
    .map((values, index) => rowToRecord(headers, values, headerIndex + index + 2))
    .map((record) => ({
      ...normalizeSeekingAlphaRecord(record),
      dividendYield: percentFrom(record.dividendYield),
      grossMargin: percentFrom(record.grossMargin),
      freeCashFlowMargin: percentFrom(record.freeCashFlowMargin),
      priceToSales: numberFrom(record.priceToSales),
      operatingCashFlow: numberFrom(record.operatingCashFlow),
      capitalExpenditures: numberFrom(record.capitalExpenditures),
      freeCashFlow: numberFrom(record.freeCashFlow),
      cashAndEquivalents: numberFrom(record.cashAndEquivalents),
      totalDebt: numberFrom(record.totalDebt),
      debtToEquity: numberFrom(record.debtToEquity),
      priceTarget: numberFrom(record.priceTarget),
      ratingChanges: record.ratingChanges,
      sourceRows: [{ provider: "seeking-alpha-xlsx", rowNumber: record.__rowNumber }]
    }))
    .filter((record) => record.ticker);
}

function rowToRecord(headers, values, rowNumber) {
  const record = { __rowNumber: rowNumber };
  headers.forEach((header, index) => {
    if (!header) return;
    const value = normalizeWorkbookValue(header, values[index]);
    if (value !== "") record[header] = value;
  });
  return record;
}

function findHeaderRowIndex(rows) {
  let bestIndex = -1;
  let bestScore = 0;
  rows.slice(0, 12).forEach((row, index) => {
    const score = row.reduce((total, cell) => total + (canonicalHeader(cell) ? 1 : 0), 0);
    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  });
  return bestScore >= 2 ? bestIndex : -1;
}

function canonicalHeader(value) {
  const normalized = normalizeHeader(value);
  return Object.entries(HEADER_ALIASES).find(([, aliases]) => aliases.includes(normalized))?.[0] || "";
}

function normalizeWorkbookValue(header, value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (header === "nextEarnings" || header === "updatedAt") return normalizeDate(text);
  return text;
}

function normalizeDate(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 20000 && numeric < 80000) {
    const date = new Date(Date.UTC(1899, 11, 30 + numeric));
    return date.toISOString().slice(0, 10);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString().slice(0, 10);
}

function percentFrom(value) {
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  const numeric = numberFrom(text);
  if (numeric === undefined) return undefined;
  if (text.includes("%") || numeric > 1) return numeric / 100;
  return numeric;
}

function numberFrom(value) {
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  const numeric = Number(text.replace(/\((.*)\)/, "-$1").replace(/[$,%+,]/g, ""));
  return Number.isFinite(numeric) ? numeric : undefined;
}

function normalizeHeader(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
