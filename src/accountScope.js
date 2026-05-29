import { inferLeveragedEtfMultiple, isLeveragedEtfTicker } from "./portfolioSchema.js";

export const ACCOUNT_SCOPE_ALL = "all";

export function buildAccountScopeModel(holdings = [], selectedAccount = ACCOUNT_SCOPE_ALL) {
  const accounts = accountRows(holdings);
  const selectedRow = accounts.find((row) => row.accountKey === selectedAccount || row.account === selectedAccount);
  const validSelection = selectedAccount && selectedAccount !== ACCOUNT_SCOPE_ALL && selectedRow
    ? selectedRow.accountKey
    : ACCOUNT_SCOPE_ALL;
  const combined = summarizeScope({
    accountKey: ACCOUNT_SCOPE_ALL,
    account: ACCOUNT_SCOPE_ALL,
    label: "All accounts",
    holdings,
    totalPortfolioValue: totalValue(holdings),
    accountCount: accounts.length
  });
  const selectedSummary = validSelection === ACCOUNT_SCOPE_ALL ? combined : selectedRow || combined;

  return {
    selectedAccount: validSelection,
    selectedAccountLabel: selectedRow?.account || "All accounts",
    combined,
    selectedSummary,
    accounts,
    scopedHoldings: filterHoldingsByAccountScope(holdings, validSelection)
  };
}

export function filterHoldingsByAccountScope(holdings = [], selectedAccount = ACCOUNT_SCOPE_ALL) {
  if (!selectedAccount || selectedAccount === ACCOUNT_SCOPE_ALL) return holdings;
  return holdings.filter((holding) => accountKey(holding) === selectedAccount || accountLabel(holding) === selectedAccount);
}

export function accountRows(holdings = []) {
  const rows = new Map();
  const portfolioValue = totalValue(holdings);
  holdings.forEach((holding) => {
    const account = accountLabel(holding);
    const key = accountKey(holding);
    const current = rows.get(key) || {
      accountKey: key,
      account,
      value: 0,
      holdingCount: 0,
      accountTypes: new Set(),
      largestHolding: null,
      holdings: []
    };
    const marketValue = holdingValue(holding);
    current.value += marketValue;
    current.holdingCount += 1;
    current.holdings.push(holding);
    if (holding.accountType) current.accountTypes.add(holding.accountType);
    if (!current.largestHolding || marketValue > current.largestHolding.value) {
      current.largestHolding = {
        ticker: holding.ticker || holding.name || "Holding",
        value: marketValue
      };
    }
    rows.set(key, current);
  });

  return [...rows.values()]
    .map((row) => summarizeScope({
      ...row,
      label: row.account,
      totalPortfolioValue: portfolioValue,
      accountTypes: [...row.accountTypes],
      accountTypeLabel: [...row.accountTypes].filter(Boolean).join(", ") || "Account",
      taxBucket: inferTaxBucket(row.account, [...row.accountTypes]),
      assetMix: assetMixFor(row.holdings),
      topPositions: topPositionsFor(row.holdings)
    }))
    .sort((left, right) => right.value - left.value || left.account.localeCompare(right.account));
}

export function inferTaxBucket(account = "", accountTypes = []) {
  const text = `${account} ${accountTypes.join(" ")}`.toLowerCase();
  if (/hsa|health savings|health/.test(text)) {
    return { key: "hsa", label: "HSA", className: "tax-bucket-hsa", detail: "Health savings account" };
  }
  if (/roth/.test(text)) {
    return { key: "roth", label: "Roth", className: "tax-bucket-roth", detail: "After-tax retirement bucket" };
  }
  if (/traditional|rollover|401\s*\(?k\)?|403\s*\(?b\)?|ira|sep|simple|retirement/.test(text)) {
    return { key: "traditional", label: "Traditional", className: "tax-bucket-traditional", detail: "Tax-deferred retirement bucket" };
  }
  if (/taxable|brokerage|individual|joint|margin/.test(text)) {
    return { key: "taxable", label: "Taxable", className: "tax-bucket-taxable", detail: "Taxable brokerage bucket" };
  }
  if (/cash|bank|checking|savings/.test(text)) {
    return { key: "cash", label: "Cash", className: "tax-bucket-cash", detail: "Cash or banking bucket" };
  }
  return { key: "other", label: "Other", className: "tax-bucket-other", detail: "Account type not classified" };
}

function accountLabel(holding = {}) {
  return String(holding.account || "Unassigned account").trim() || "Unassigned account";
}

function accountKey(holding = {}) {
  return String(holding.accountId || accountLabel(holding)).trim() || "Unassigned account";
}

function summarizeScope(scope = {}) {
  const holdings = Array.isArray(scope.holdings) ? scope.holdings : [];
  const value = typeof scope.value === "number" ? scope.value : totalValue(holdings);
  const totalPortfolioValue = Number(scope.totalPortfolioValue) || value;
  const dailyChange = holdings.reduce((sum, holding) => sum + (Number(holding.dailyChange) || 0), 0);
  const cashValue = holdings.reduce((sum, holding) => sum + (isCashLikeHolding(holding) ? holdingValue(holding) : 0), 0);
  const leveragedExposure = holdings.reduce((sum, holding) => {
    if (!isLeveragedHolding(holding)) return sum;
    const multiple = Math.max(1, Math.abs(Number(holding.leveragedMultiple) || inferredLeverageMultiple(holding)));
    return sum + holdingValue(holding) * multiple;
  }, 0);
  const staleHoldingCount = holdings.filter(isStaleHolding).length;
  const missingCostBasisCount = holdings.filter(isMissingCostBasis).length;
  const largestHolding = scope.largestHolding || largestHoldingFor(holdings);
  const accountTypes = Array.isArray(scope.accountTypes) ? scope.accountTypes : [];
  const taxBucket = scope.taxBucket || inferTaxBucket(scope.account || scope.label, accountTypes);

  return {
    ...scope,
    value,
    holdingCount: holdings.length || scope.holdingCount || 0,
    accountCount: scope.accountCount || 1,
    accountTypeLabel: scope.accountTypeLabel || "Account",
    accountTypes,
    dailyChange,
    dailyChangePercent: value ? dailyChange / value : 0,
    cashValue,
    cashWeight: value ? cashValue / value : 0,
    portfolioWeight: totalPortfolioValue ? value / totalPortfolioValue : 0,
    leveragedExposure,
    leveragedExposureWeight: value ? leveragedExposure / value : 0,
    staleHoldingCount,
    missingCostBasisCount,
    largestHolding,
    largestHoldingLabel: largestHolding?.ticker || "No holdings",
    largestHoldingWeight: value && largestHolding?.value ? largestHolding.value / value : 0,
    taxBucket,
    assetMix: Array.isArray(scope.assetMix) ? scope.assetMix : assetMixFor(holdings),
    topPositions: Array.isArray(scope.topPositions) ? scope.topPositions : topPositionsFor(holdings),
    hasDataQualityWarning: Boolean(staleHoldingCount || missingCostBasisCount),
    hasLeverageWarning: leveragedExposure > value * 0.15
  };
}

function assetMixFor(holdings = []) {
  const total = totalValue(holdings);
  const rows = new Map();
  holdings.forEach((holding) => {
    const name = normalizedAssetClass(holding);
    const current = rows.get(name) || { name, value: 0, count: 0, weight: 0 };
    current.value += holdingValue(holding);
    current.count += 1;
    rows.set(name, current);
  });
  return [...rows.values()]
    .map((row) => ({ ...row, weight: total ? row.value / total : 0 }))
    .sort((left, right) => right.value - left.value || left.name.localeCompare(right.name));
}

function topPositionsFor(holdings = []) {
  const total = totalValue(holdings);
  return holdings
    .map((holding) => ({
      ticker: holding.ticker || holding.name || "Holding",
      name: holding.name || holding.company || "",
      value: holdingValue(holding),
      weight: total ? holdingValue(holding) / total : 0
    }))
    .sort((left, right) => right.value - left.value || left.ticker.localeCompare(right.ticker))
    .slice(0, 3);
}

function normalizedAssetClass(holding = {}) {
  if (isCashLikeHolding(holding)) return "Cash";
  if (isLeveragedHolding(holding)) return "ETF/Fund";
  const assetClass = String(holding.assetClass || holding.type || "").trim();
  if (/etf|fund/i.test(assetClass)) return "ETF/Fund";
  if (/stock|equity/i.test(assetClass)) return "Stock";
  return assetClass || "Other";
}

function totalValue(holdings = []) {
  return holdings.reduce((sum, holding) => sum + holdingValue(holding), 0);
}

function holdingValue(holding = {}) {
  return Number(holding.marketValue ?? holding.positionValue) || 0;
}

function largestHoldingFor(holdings = []) {
  return holdings.reduce((largest, holding) => {
    const value = holdingValue(holding);
    if (largest && largest.value >= value) return largest;
    return { ticker: holding.ticker || holding.name || "Holding", value };
  }, null);
}

function isCashLikeHolding(holding = {}) {
  const text = `${holding.ticker || ""} ${holding.name || ""} ${holding.assetClass || ""} ${holding.sector || ""}`.toLowerCase();
  return /\bcash\b|money market|treasury|spaxx|fdrxx|core position|settlement/.test(text);
}

function isLeveragedHolding(holding = {}) {
  if (holding.isLeveragedEtf || Math.abs(Number(holding.leveragedMultiple)) > 1) return true;
  return isLeveragedEtfTicker(holding.ticker, holding);
}

function inferredLeverageMultiple(holding = {}) {
  return inferLeveragedEtfMultiple(holding.ticker, holding) || 1;
}

function isMissingCostBasis(holding = {}) {
  if (isCashLikeHolding(holding)) return false;
  const value = holding.costBasis ?? holding.totalCostBasis;
  return value === undefined || value === null || value === "" || !Number.isFinite(Number(value));
}

function isStaleHolding(holding = {}) {
  const sourceAsOf = holding.sourceAsOf || holding.lastUpdated || holding.asOf;
  if (!sourceAsOf) return false;
  const parsed = Date.parse(sourceAsOf);
  if (!Number.isFinite(parsed)) return false;
  return Date.now() - parsed > 1000 * 60 * 60 * 24 * 7;
}
