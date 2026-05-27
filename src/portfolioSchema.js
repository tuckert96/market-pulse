export const CANONICAL_HOLDING_FIELDS = Object.freeze([
  "id",
  "accountId",
  "ticker",
  "name",
  "account",
  "accountType",
  "shares",
  "price",
  "marketValue",
  "costBasis",
  "unrealizedGain",
  "unrealizedGainPercent",
  "dailyChange",
  "dailyChangePercent",
  "targetWeight",
  "sector",
  "assetClass",
  "strategySleeve",
  "thesisStatus",
  "riskLevel",
  "quant",
  "valuationGrade",
  "growthGrade",
  "profitabilityGrade",
  "momentumGrade",
  "revisionsGrade",
  "dividendYield",
  "dividendGrade",
  "grossMargin",
  "freeCashFlowMargin",
  "priceToSales",
  "operatingCashFlow",
  "capitalExpenditures",
  "freeCashFlow",
  "cashAndEquivalents",
  "totalDebt",
  "debtToEquity",
  "nextEarnings",
  "source",
  "sourceAsOf"
]);

const DEFAULTS = Object.freeze({
  account: "Unassigned",
  accountType: "Unknown",
  sector: "Unknown",
  assetClass: "Equity",
  strategySleeve: "Individual stock conviction",
  thesisStatus: "Needs thesis",
  riskLevel: "Medium",
  source: "manual",
  targetWeight: 0
});

const ETF_ASSET_CLASS = new Set(["UPRO", "TQQQ", "SOXL", "VGT", "VOO", "QQQ", "SGOV", "BIL"]);
const LEVERAGED_ETFS = new Map([
  ["UPRO", 3],
  ["TQQQ", 3],
  ["SOXL", 3],
  ["SPXL", 3],
  ["SQQQ", -3]
]);
const SEMICONDUCTORS = new Set(["NVDA", "AMD", "MU", "SOXL", "TSM", "AVGO", "SMH", "CRDO"]);
const MEGA_CAP_TECH = new Set(["NVDA", "AAPL", "MSFT", "AMZN", "GOOGL", "GOOG", "META", "TSLA", "AVGO"]);
const CASH_LIKE_TICKERS = new Set(["CASH", "FCASH", "FDIC", "SPAXX", "FDRXX", "FZFXX", "FDLXX", "SPRXX", "FTEXX", "FZDXX", "FMPXX"]);

export function normalizeHolding(input = {}, options = {}) {
  const ticker = normalizeTicker(input.ticker || input.symbol);
  const shares = numberFrom(input.shares, input.quantity, 0);
  const price = numberFrom(input.price, input.lastPrice, input.currentPrice, 0);
  const marketValue = numberFrom(input.marketValue, input.positionValue, shares * price);
  const costBasis = numberFrom(input.costBasis, input.totalCostBasis, input.averageCost ? shares * numberFrom(input.averageCost) : 0);
  const unrealizedGain = numberFrom(input.unrealizedGain, marketValue - costBasis);
  const unrealizedGainPercent = costBasis > 0 ? unrealizedGain / costBasis : numberFrom(input.unrealizedGainPercent, 0);
  const dailyChangePercentInput = decimalPercent(input.dailyChangePercent ?? 0);
  const dailyChange = numberFrom(input.dailyChange, input.dayChange, marketValue * dailyChangePercentInput);
  const dailyChangePercent = marketValue > 0 ? dailyChange / marketValue : dailyChangePercentInput;
  const cashLike = isCashLikeHolding(ticker, input);
  const invalidCashClassification = !cashLike && (
    /^cash$/i.test(String(input.assetClass || "")) ||
    /^cash$/i.test(String(input.sector || "")) ||
    /^cash$/i.test(String(input.strategySleeve || input.sleeve || "")) ||
    input.cash === true
  );
  const sanitizedInput = invalidCashClassification
    ? { ...input, assetClass: undefined, sector: undefined, strategySleeve: undefined, sleeve: undefined, riskLevel: undefined, cash: false }
    : input;
  const assetClass = sanitizedInput.assetClass || inferAssetClass(ticker, sanitizedInput);
  const sector = sanitizedInput.sector || inferSector(ticker, sanitizedInput);
  const strategySleeve = sanitizedInput.strategySleeve || sanitizedInput.sleeve || inferSleeve(ticker, assetClass, sector, sanitizedInput);
  const targetWeight = decimalPercent(input.targetWeight ?? input.targetAllocation ?? DEFAULTS.targetWeight);
  const sourceAsOf = input.sourceAsOf || input.updatedAt || input.saUpdatedAt || options.sourceAsOf || today();
  const account = sanitizeAccountLabel(input.account || DEFAULTS.account);

  return pruneEmpty({
    ...input,
    id: input.id || `${account}:${ticker || input.name || input.company || "UNKNOWN"}`,
    accountId: input.accountId,
    ticker,
    name: input.name || input.company || input.fundName || ticker || "Unknown holding",
    account,
    accountType: input.accountType || DEFAULTS.accountType,
    shares,
    price,
    marketValue,
    costBasis,
    unrealizedGain,
    unrealizedGainPercent,
    dailyChange,
    dailyChangePercent,
    targetWeight,
    sector,
    assetClass,
    strategySleeve,
    thesisStatus: input.thesisStatus || DEFAULTS.thesisStatus,
    riskLevel: sanitizedInput.riskLevel || inferRiskLevel(ticker, assetClass, sector, sanitizedInput),
    quant: numberFrom(input.quant, input.quantRating, undefined),
    valuationGrade: input.valuationGrade || input.valueGrade || gradeFromNumeric(input.value),
    growthGrade: input.growthGrade || gradeFromNumeric(input.growth),
    profitabilityGrade: input.profitabilityGrade || gradeFromNumeric(input.profitability),
    momentumGrade: input.momentumGrade || gradeFromNumeric(input.momentum),
    revisionsGrade: input.revisionsGrade || input.epsRevisionsGrade || gradeFromNumeric(input.revisions),
    dividendYield: numberFrom(input.dividendYield, undefined),
    dividendGrade: input.dividendGrade,
    grossMargin: numberFrom(input.grossMargin, undefined),
    freeCashFlowMargin: numberFrom(input.freeCashFlowMargin, input.fcfMargin, undefined),
    priceToSales: numberFrom(input.priceToSales, input.psRatio, undefined),
    operatingCashFlow: numberFrom(input.operatingCashFlow, input.cashFromOperations, undefined),
    capitalExpenditures: numberFrom(input.capitalExpenditures, input.capex, undefined),
    freeCashFlow: numberFrom(input.freeCashFlow, input.fcf, undefined),
    cashAndEquivalents: numberFrom(input.cashAndEquivalents, input.cash, undefined),
    totalDebt: numberFrom(input.totalDebt, input.debt, undefined),
    debtToEquity: numberFrom(input.debtToEquity, undefined),
    nextEarnings: input.nextEarnings || input.earningsDate,
    leveragedMultiple: numberFrom(input.leveragedMultiple, LEVERAGED_ETFS.get(ticker) || 1),
    beta: numberFrom(input.beta, inferBeta(ticker, assetClass, sector)),
    isLeveragedEtf: Boolean(input.isLeveragedEtf ?? LEVERAGED_ETFS.has(ticker)),
    isSemiconductor: Boolean(input.isSemiconductor ?? (SEMICONDUCTORS.has(ticker) || /semiconductor/i.test(sector))),
    isAiTheme: Boolean(input.isAiTheme ?? (SEMICONDUCTORS.has(ticker) || /ai|artificial intelligence/i.test(String(input.tags || "")))),
    isMegaCapTech: Boolean(input.isMegaCapTech ?? MEGA_CAP_TECH.has(ticker)),
    source: input.source || DEFAULTS.source,
    sourceAsOf
  });
}

export function normalizeHoldings(records = [], options = {}) {
  return records.map((record) => normalizeHolding(record, options)).filter((holding) => holding.ticker || holding.name);
}

export function mergeHoldingsByAccountAndTicker(...sources) {
  const byKey = new Map();
  const duplicates = [];

  sources.flat().filter(Boolean).forEach((record) => {
    const holding = normalizeHolding(record);
    const key = `${holding.accountId || holding.account}:${holding.ticker || holding.name}`;
    const previous = byKey.get(key);
    if (previous) duplicates.push(key);
    byKey.set(key, previous ? mergeHolding(previous, holding) : holding);
  });

  return {
    holdings: Array.from(byKey.values()),
    duplicates
  };
}

export function toDashboardRecord(holding = {}) {
  return {
    ...holding,
    company: holding.name,
    shares: holding.shares,
    price: holding.price,
    positionValue: holding.marketValue,
    forwardPe: holding.forwardPe,
    priceToSales: holding.priceToSales,
    grossMargin: holding.grossMargin,
    freeCashFlowMargin: holding.freeCashFlowMargin,
    operatingCashFlow: holding.operatingCashFlow,
    capitalExpenditures: holding.capitalExpenditures,
    freeCashFlow: holding.freeCashFlow,
    cashAndEquivalents: holding.cashAndEquivalents,
    totalDebt: holding.totalDebt,
    debtToEquity: holding.debtToEquity,
    dividendGrade: holding.dividendGrade,
    value: numericFromGrade(holding.valuationGrade),
    growth: numericFromGrade(holding.growthGrade),
    profitability: numericFromGrade(holding.profitabilityGrade),
    momentum: numericFromGrade(holding.momentumGrade) * 20 || holding.momentum,
    revisions: numericFromGrade(holding.revisionsGrade) * 20 || holding.revisions
  };
}

export function decimalPercent(value) {
  const numeric = numberFrom(value, 0);
  if (String(value ?? "").includes("%")) return numeric / 100;
  if (numeric > 1) return numeric / 100;
  return numeric;
}

export function numberFrom(...values) {
  const found = values.find((value) => value !== undefined && value !== null && value !== "");
  if (found === undefined) return 0;
  const parsed = Number(String(found).replace(/\((.*)\)/, "-$1").replace(/[$,%+,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeTicker(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/^[$#]/, "")
    .replace(/\*+$/g, "")
    .replace(/\s+/g, "")
    .replace("/", ".")
    .replace(/[^A-Z0-9.-]/g, "");
}

export function sanitizeAccountLabel(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  const digits = text.replace(/\D/g, "");
  if (digits.length < 5) return text;
  const lastFour = digits.slice(-4);
  if (!/[A-Za-z]/.test(text)) return `Account ending ${lastFour}`;
  return text.replace(/\d(?=(?:\D*\d){4})/g, "•");
}

export function numericFromGrade(grade) {
  const map = {
    "A+": 5,
    A: 4.8,
    "A-": 4.6,
    "B+": 4.3,
    B: 4,
    "B-": 3.7,
    "C+": 3.3,
    C: 3,
    "C-": 2.7,
    "D+": 2.3,
    D: 2,
    "D-": 1.7,
    F: 1
  };
  return map[String(grade || "").toUpperCase()] || 0;
}

function mergeHolding(left, right) {
  return pruneEmpty({
    ...left,
    ...right,
    sources: Array.from(new Set([...(left.sources || []), ...(right.sources || [])])),
    source: right.source || left.source
  });
}

function inferAssetClass(ticker, input) {
  if (input.assetClass) return input.assetClass;
  if (isCashLikeHolding(ticker, input)) return "Cash";
  if (ETF_ASSET_CLASS.has(ticker)) return "ETF";
  if (/treasury|bill|bond/i.test(String(input.name || input.company || ""))) return "Treasuries";
  return DEFAULTS.assetClass;
}

function inferSector(ticker, input) {
  if (input.sector) return input.sector;
  if (isCashLikeHolding(ticker, input)) return "Cash";
  if (["UPRO", "VOO"].includes(ticker)) return "Broad market";
  if (["TQQQ", "QQQ", "VGT"].includes(ticker)) return "Mega-cap tech";
  if (SEMICONDUCTORS.has(ticker)) return "Semiconductors";
  if (ticker === "SGOV" || ticker === "BIL") return "Treasuries";
  return DEFAULTS.sector;
}

function inferSleeve(ticker, assetClass, sector, input) {
  if (assetClass === "Cash") return "Cash";
  if (assetClass === "Treasuries") return "Treasuries / hedge";
  if (["UPRO", "TQQQ", "SOXL"].includes(ticker)) return "Leveraged growth";
  if (/semiconductor/i.test(sector)) return "AI / semiconductor";
  if (["VOO", "VGT", "QQQ"].includes(ticker)) return "Core index";
  if (input.speculative) return "Speculative";
  return DEFAULTS.strategySleeve;
}

function inferRiskLevel(ticker, assetClass, sector, input) {
  if (input.riskLevel) return input.riskLevel;
  if (LEVERAGED_ETFS.has(ticker)) return "Very high";
  if (/semiconductor/i.test(sector)) return "High";
  if (assetClass === "Cash" || assetClass === "Treasuries") return "Low";
  if (ticker === "VGT" || ticker === "QQQ") return "Medium-high";
  return DEFAULTS.riskLevel;
}

function inferBeta(ticker, assetClass, sector) {
  if (isCashLikeHolding(ticker, { assetClass, sector }) || assetClass === "Cash") return 0;
  if (assetClass === "Treasuries") return 0.15;
  if (ticker === "UPRO") return 3;
  if (ticker === "TQQQ" || ticker === "SOXL") return 3.3;
  if (/semiconductor/i.test(sector)) return 1.7;
  if (ticker === "VGT" || ticker === "QQQ") return 1.2;
  return 1;
}

function isCashLikeHolding(ticker, input = {}) {
  const normalizedTicker = normalizeTicker(ticker);
  const text = [
    normalizedTicker,
    input.name,
    input.company,
    input.description,
    input.securityDescription,
    input.type
  ].join(" ").toLowerCase();

  if (CASH_LIKE_TICKERS.has(normalizedTicker)) return true;
  return /held in money market|money market|core position|cash sweep|bank deposit|fdic|cash equivalent/.test(text);
}

function gradeFromNumeric(value) {
  const numeric = numberFrom(value, undefined);
  if (!numeric) return undefined;
  if (numeric >= 4.8) return "A";
  if (numeric >= 4.3) return "B+";
  if (numeric >= 3.7) return "B";
  if (numeric >= 3) return "C";
  if (numeric >= 2) return "D";
  return "F";
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function pruneEmpty(record) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => {
      if (Array.isArray(value)) return value.length > 0;
      return value !== undefined && value !== null && value !== "";
    })
  );
}
