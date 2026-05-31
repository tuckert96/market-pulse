export const SEEKING_ALPHA_DATA_FIELDS = Object.freeze([
  "quant",
  "quantRating",
  "authorRating",
  "wallStreetRating",
  "saAnalystsRating",
  "value",
  "growth",
  "profitability",
  "momentum",
  "revisions",
  "revenueGrowth",
  "epsGrowth",
  "forwardPe",
  "priceToSales",
  "grossMargin",
  "freeCashFlowMargin",
  "operatingCashFlow",
  "capitalExpenditures",
  "freeCashFlow",
  "cashAndEquivalents",
  "totalDebt",
  "debtToEquity",
  "nextEarnings",
  "dividendYield",
  "dividendGrade",
  "priceTarget",
  "ratingChanges"
]);

export function connectorReadiness() {
  return {
    ready: false,
    backendRequired: true,
    message:
      "Seeking Alpha Premium data can be used through your authorized exports or a licensed backend integration. This dashboard will not scrape premium pages or ask for your Seeking Alpha password."
  };
}

export async function requestSeekingAlphaLink({ baseUrl = "/api" } = {}) {
  const response = await fetch(`${baseUrl}/connectors/seeking-alpha/link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestedFields: SEEKING_ALPHA_DATA_FIELDS })
  });

  if (!response.ok) {
    throw new Error(`Seeking Alpha link request failed with ${response.status}.`);
  }

  return response.json();
}

export async function fetchSeekingAlphaDataset({ baseUrl = "/api" } = {}) {
  const response = await fetch(`${baseUrl}/connectors/seeking-alpha/ratings`);

  if (!response.ok) {
    throw new Error(`Seeking Alpha sync failed with ${response.status}.`);
  }

  const payload = await response.json();
  return normalizeSeekingAlphaDataset(payload);
}

export function normalizeSeekingAlphaDataset(payload = {}) {
  const records = Array.isArray(payload) ? payload : payload.records || payload.ratings || payload.data || [];
  return records.map(normalizeSeekingAlphaRecord).filter((record) => record.ticker);
}

export function normalizeSeekingAlphaRecord(record = {}) {
  const ticker = textFrom(record, ["ticker", "symbol"]);
  const quant = ratingToScore(textFrom(record, ["quant", "quantRating", "quantScore"]));

  return pruneEmpty({
    ticker: normalizeTicker(ticker),
    company: textFrom(record, ["company", "companyName", "name"], ticker),
    sector: textFrom(record, ["sector", "sectorName"], "Imported"),
    quant,
    quantRating: readableRatingText(textFrom(record, ["quantRating", "quantRatingLabel", "quantRecommendation"])) || readableRatingText(textFrom(record, ["quant"])),
    authorRating: textFrom(record, ["authorRating", "saAuthorRating", "authorsRating"]),
    wallStreetRating: textFrom(record, ["wallStreetRating", "sellSideRating", "analystRating"]),
    saAnalystsRating: textFrom(record, ["saAnalystsRating", "saAnalysts", "seekingAlphaAnalystsRating"]),
    value: ratingToScore(textFrom(record, ["value", "valueGrade", "valuation", "valuationGrade"])),
    growth: ratingToScore(textFrom(record, ["growth", "growthGrade"])),
    profitability: ratingToScore(textFrom(record, ["profitability", "profitabilityGrade"])),
    momentum: ratingToPercent(textFrom(record, ["momentum", "momentumGrade"])),
    revisions: ratingToPercent(textFrom(record, ["revisions", "epsRevisions", "epsRevisionsGrade", "revisionGrade", "revisionsGrade"])),
    revenueGrowth: numberFrom(record, ["revenueGrowth", "salesGrowth", "revenueGrowthYoy"]),
    epsGrowth: numberFrom(record, ["epsGrowth", "earningsGrowth", "epsGrowthYoy"]),
    forwardPe: numberFrom(record, ["forwardPe", "fwdPe", "pe"]),
    priceToSales: numberFrom(record, ["priceToSales", "psRatio", "priceSales"]),
    grossMargin: percentFrom(record, ["grossMargin", "grossProfitMargin"]),
    freeCashFlowMargin: percentFrom(record, ["freeCashFlowMargin", "fcfMargin"]),
    operatingCashFlow: numberFrom(record, ["operatingCashFlow", "cashFromOperations", "ocf"]),
    capitalExpenditures: numberFrom(record, ["capitalExpenditures", "capex"]),
    freeCashFlow: numberFrom(record, ["freeCashFlow", "fcf"]),
    cashAndEquivalents: numberFrom(record, ["cashAndEquivalents", "cash", "totalCash"]),
    totalDebt: numberFrom(record, ["totalDebt", "debt", "netDebt"]),
    debtToEquity: numberFrom(record, ["debtToEquity"]),
    dividendYield: percentFrom(record, ["dividendYield", "yield", "dividend"]),
    dividendGrade: textFrom(record, ["dividendGrade", "dividendGradeSA"]),
    priceTarget: numberFrom(record, ["priceTarget", "targetPrice", "wallStreetPriceTarget"]),
    ratingChanges: textFrom(record, ["ratingChanges", "ratingChange", "gradeChanges"]),
    nextEarnings: textFrom(record, ["nextEarnings", "earningsDate"]),
    saUpdatedAt: textFrom(record, ["updatedAt", "saUpdatedAt", "asOf", "date", "ratingDate", "importedAt"]),
    source: "seeking-alpha-premium",
    sources: ["seeking-alpha-premium"],
    thesis: insightSummary(record)
  });
}

export function demoSeekingAlphaPremiumData() {
  return [
    {
      ticker: "APP",
      company: "AppLovin",
      sector: "Software",
      quant: 4.86,
      authorRating: "Buy",
      wallStreetRating: "Buy",
      value: "B",
      growth: "A",
      profitability: "A+",
      momentum: "A+",
      revisions: "A",
      revenueGrowth: 48,
      epsGrowth: 303,
      forwardPe: 28,
      nextEarnings: "2026-08-06",
      saUpdatedAt: "2026-05-21",
      thesis: "Premium demo: elite quant, momentum, profitability, and revisions support a high-growth setup."
    },
    {
      ticker: "TSM",
      company: "Taiwan Semiconductor Manufacturing",
      sector: "Semiconductors",
      quant: 4.58,
      authorRating: "Buy",
      wallStreetRating: "Strong Buy",
      value: "B+",
      growth: "A-",
      profitability: "A+",
      momentum: "A",
      revisions: "A-",
      revenueGrowth: 33,
      epsGrowth: 47,
      forwardPe: 24,
      nextEarnings: "2026-07-17",
      saUpdatedAt: "2026-05-21",
      thesis: "Premium demo: growth and profitability grades reinforce AI semiconductor supply-chain exposure."
    },
    {
      ticker: "PLTR",
      company: "Palantir",
      sector: "Software",
      quant: 4.33,
      authorRating: "Hold",
      wallStreetRating: "Hold",
      value: "D",
      growth: "A-",
      profitability: "A",
      momentum: "A+",
      revisions: "B+",
      revenueGrowth: 21,
      epsGrowth: 36,
      forwardPe: 86,
      nextEarnings: "2026-08-04",
      saUpdatedAt: "2026-05-21",
      thesis: "Premium demo: momentum is excellent, but valuation pressure needs discipline."
    }
  ].map(normalizeSeekingAlphaRecord);
}

export function buildSeekingAlphaInsights(records = []) {
  const rows = records.filter((record) => record.ticker);
  const strong = rows.filter((record) => Number(record.quant) >= 4.5);
  const growthLeaders = rows.filter((record) => Number(record.growth) >= 4.3 || Number(record.revenueGrowth) >= 35);
  const valuationRisks = rows.filter((record) => Number(record.forwardPe) >= 60 || Number(record.value) <= 2.5);
  const revisionSupport = rows.filter((record) => Number(record.revisions) >= 80);

  return {
    strongQuantCount: strong.length,
    growthLeaderCount: growthLeaders.length,
    valuationRiskCount: valuationRisks.length,
    revisionSupportCount: revisionSupport.length,
    messages: [
      `${strong.length} ticker${strong.length === 1 ? "" : "s"} have elite Quant support.`,
      `${growthLeaders.length} ticker${growthLeaders.length === 1 ? "" : "s"} show strong growth signals.`,
      `${revisionSupport.length} ticker${revisionSupport.length === 1 ? "" : "s"} have positive revision support.`,
      `${valuationRisks.length} ticker${valuationRisks.length === 1 ? "" : "s"} carry valuation risk worth reviewing.`
    ]
  };
}

function insightSummary(record) {
  const ticker = textFrom(record, ["ticker", "symbol"], "Ticker");
  const quant = textFrom(record, ["quant", "quantRating", "quantScore"]);
  const growth = textFrom(record, ["growth", "growthGrade"]);
  const momentum = textFrom(record, ["momentum", "momentumGrade"]);
  if (!quant && !growth && !momentum) return "Imported from Seeking Alpha Premium data.";
  return `Seeking Alpha signals for ${ticker}: Quant ${quant || "n/a"}, Growth ${growth || "n/a"}, Momentum ${momentum || "n/a"}.`;
}

function textFrom(record, keys, fallback = "") {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined && value !== null && value !== "") return String(value).trim();
  }
  return fallback;
}

function numberFrom(record, keys, fallback = undefined) {
  const raw = textFrom(record, keys);
  if (!raw) return fallback;
  const parsed = Number(raw.replace(/[$,%+,]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function percentFrom(record, keys, fallback = undefined) {
  const raw = textFrom(record, keys);
  if (!raw) return fallback;
  const parsed = Number(raw.replace(/[$,%+,]/g, ""));
  if (!Number.isFinite(parsed)) return fallback;
  return raw.includes("%") || parsed > 1 ? parsed / 100 : parsed;
}

function ratingToScore(value) {
  const text = String(value || "").trim();
  if (!text) return undefined;
  const numeric = Number(text.replace(/[$,%+,]/g, ""));
  if (Number.isFinite(numeric)) return numeric;
  const lower = text.toLowerCase();
  const map = {
    "strong buy": 5,
    buy: 4.4,
    bullish: 4.2,
    outperform: 4.1,
    hold: 3,
    neutral: 3,
    sell: 1.8,
    bearish: 1.8,
    "strong sell": 1,
    "a+": 5,
    a: 4.8,
    "a-": 4.6,
    "b+": 4.3,
    b: 4,
    "b-": 3.7,
    "c+": 3.3,
    c: 3,
    "c-": 2.7,
    "d+": 2.3,
    d: 2,
    "d-": 1.7,
    f: 1
  };
  return map[lower];
}

function readableRatingText(value) {
  const text = String(value || "").trim();
  return [
    "strong buy",
    "buy",
    "bullish",
    "outperform",
    "hold",
    "neutral",
    "sell",
    "bearish",
    "strong sell"
  ].includes(text.toLowerCase()) ? text : "";
}

function ratingToPercent(value) {
  const score = ratingToScore(value);
  if (score === undefined) return undefined;
  return score <= 5 ? Math.round(score * 20) : score;
}

function normalizeTicker(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/^[$#]/, "")
    .replace(/\s+/g, "")
    .replace("/", ".");
}

function pruneEmpty(record) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => {
      if (Array.isArray(value)) return value.length > 0;
      return value !== undefined && value !== null && value !== "";
    })
  );
}
