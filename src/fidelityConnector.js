import { sanitizeAccountLabel } from "./portfolioSchema.js";

export const FIDELITY_CONNECTOR_PROVIDERS = Object.freeze({
  plaid: Object.freeze({
    label: "Plaid Investments",
    product: "Investments",
    docsUrl: "https://plaid.com/docs/investments/",
    holdingsEndpoint: "/investments/holdings/get",
    notes:
      "Uses a Link flow and server-side public-token exchange. Holdings are returned with account, holding, and security records."
  }),
  snaptrade: Object.freeze({
    label: "SnapTrade",
    product: "Brokerage account data",
    docsUrl: "https://docs.snaptrade.com/reference/Account%20Information/AccountInformation_getAllUserHoldings",
    holdingsEndpoint: "/api/v1/holdings",
    notes:
      "Uses a registered SnapTrade user and connection portal. Holdings can be pulled across connected brokerage accounts."
  })
});

export function normalizePlaidHoldings(payload = {}) {
  const securitiesById = new Map(
    safeArray(payload.securities).map((security) => [security.security_id, security])
  );
  const accountsById = new Map(
    safeArray(payload.accounts).map((account) => [account.account_id, account])
  );
  const accountLabelsById = plaidAccountDisplayLabels(payload.accounts);

  return safeArray(payload.holdings)
    .map((holding) => {
      const security = securitiesById.get(holding.security_id) || {};
      const account = accountsById.get(holding.account_id) || {};
      const accountId = holding.account_id || account.account_id;
      const accountLabel = accountLabelsById.get(accountId) || sanitizeAccountLabel(account.name || account.official_name || account.mask || account.account_id);
      const ticker = securityTicker(security);
      const price = numberFrom(holding.institution_price, security.close_price);
      const shares = numberFrom(holding.quantity);
      const marketValue = numberFrom(holding.institution_value, shares * price);

      return pruneEmpty({
        ticker: normalizeTicker(ticker),
        company: security.name || ticker,
        sector: providerSector(security),
        assetClass: providerAssetClass(security, ticker),
        accountType: accountTypeFromProvider(account.subtype || account.type),
        shares,
        price,
        costBasis: numberFrom(holding.cost_basis),
        marketValue,
        positionValue: marketValue,
        account: accountLabel,
        accountId,
        sourceAsOf: holding.institution_price_datetime || holding.institution_price_as_of || security.close_price_as_of || payload.asOf || payload.updatedAt || payload.fetchedAt,
        providerHoldingId: [accountLabel, holding.security_id].filter(Boolean).join(":"),
        providerSecurityId: holding.security_id,
        source: "fidelity-live",
        sources: ["fidelity-live", "plaid"],
        thesis: "Synced from Fidelity holdings through Plaid."
      });
    })
    .filter((record) => record.ticker);
}

export function normalizeSnapTradeHoldings(payload = {}) {
  const rawPositions = snapTradePositions(payload);

  return rawPositions
    .map(({ position, account }) => {
      const symbol = position.symbol || position.symbol_info || position.security || {};
      const ticker = snapTradeTicker(position, symbol);
      const shares = numberFrom(position.units, position.quantity, position.shares);
      const price = numberFrom(position.price, position.last_price, position.market_price);
      const marketValue = numberFrom(position.market_value, position.value, shares * price);
      const averageCost = numberFrom(position.average_purchase_price, position.average_cost, position.avg_cost);
      const totalCostBasis = numberFrom(position.cost_basis, position.total_cost_basis, averageCost ? shares * averageCost : 0);

      return pruneEmpty({
        ticker: normalizeTicker(ticker),
        company: symbol.description || symbol.name || position.name || ticker,
        sector: providerSector({ sector: position.sector, type: symbol.type || position.asset_class }),
        assetClass: providerAssetClass({ type: symbol.type || position.asset_class, name: symbol.description || position.name }, ticker),
        accountType: accountTypeFromProvider(account?.type || account?.account_type || position.account_type),
        shares,
        price,
        costBasis: totalCostBasis,
        marketValue,
        positionValue: marketValue,
        account: sanitizeAccountLabel(position.account_name || account?.name || account?.number || position.account),
        sourceAsOf: position.updated_date || position.as_of_date || payload.asOf || payload.updatedAt,
        providerHoldingId: position.id || position.holding_id,
        source: "fidelity-live",
        sources: ["fidelity-live", "snaptrade"],
        thesis: "Synced from Fidelity holdings through SnapTrade."
      });
    })
    .filter((record) => record.ticker);
}

export async function requestFidelityLink({ provider = "plaid", baseUrl = "/api" } = {}) {
  const response = await fetch(`${baseUrl}/connectors/fidelity/link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider })
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || `Link request failed with ${response.status}.`);
  }

  return payload;
}

export async function exchangeFidelityPublicToken({ publicToken, provider = "plaid", baseUrl = "/api" } = {}) {
  const response = await fetch(`${baseUrl}/connectors/fidelity/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, public_token: publicToken })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || `Plaid token exchange failed with ${response.status}.`);
  }

  return payload;
}

export async function fetchFidelityHoldingsPayload({ provider = "plaid", baseUrl = "/api" } = {}) {
  const response = await fetch(`${baseUrl}/connectors/fidelity/holdings?provider=${encodeURIComponent(provider)}`, {
    cache: "no-store"
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || `Holdings sync failed with ${response.status}.`);
  }

  return payload;
}

export async function fetchFidelityHoldings({ provider = "plaid", baseUrl = "/api" } = {}) {
  const payload = await fetchFidelityHoldingsPayload({ provider, baseUrl });
  return normalizeProviderHoldings(provider, payload);
}

export async function unlinkFidelityConnection({ provider = "plaid", baseUrl = "/api" } = {}) {
  const response = await fetch(`${baseUrl}/connectors/fidelity/unlink`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || `Fidelity unlink failed with ${response.status}.`);
  }
  return payload;
}

export function normalizeProviderHoldings(provider, payload) {
  if (provider === "snaptrade") return normalizeSnapTradeHoldings(payload);
  return normalizePlaidHoldings(payload);
}

export function demoFidelityHoldings() {
  return [
    {
      ticker: "NVDA",
      company: "NVIDIA",
      sector: "Semiconductors",
      shares: 18,
      price: 1014,
      costBasis: 687,
      positionValue: 18252,
      account: "Fidelity Brokerage",
      source: "fidelity-live-demo",
      sources: ["fidelity-live-demo"],
      thesis: "Sample Fidelity holding; replace with provider-synced data."
    },
    {
      ticker: "ANET",
      company: "Arista Networks",
      sector: "Networking",
      shares: 12,
      price: 92,
      costBasis: 71,
      positionValue: 1104,
      account: "Fidelity Roth IRA",
      source: "fidelity-live-demo",
      sources: ["fidelity-live-demo"],
      thesis: "Sample Fidelity holding; replace with provider-synced data."
    },
    {
      ticker: "TSM",
      company: "Taiwan Semiconductor Manufacturing",
      sector: "Semiconductors",
      shares: 16,
      price: 184,
      costBasis: 151,
      positionValue: 2944,
      account: "Fidelity Brokerage",
      source: "fidelity-live-demo",
      sources: ["fidelity-live-demo"],
      revenueGrowth: 33,
      epsGrowth: 47,
      momentum: 82,
      quant: 4.58,
      growth: 4.4,
      revisions: 86,
      forwardPe: 24,
      nextEarnings: "2026-07-17",
      thesis: "Sample synced holding with AI semiconductor supply-chain exposure."
    }
  ];
}

export function connectorReadiness(provider = "plaid") {
  const details = FIDELITY_CONNECTOR_PROVIDERS[provider] || FIDELITY_CONNECTOR_PROVIDERS.plaid;
  return {
    provider,
    label: details.label,
    ready: false,
    backendRequired: true,
    message:
      `${details.label} is the right shape for live Fidelity holdings, but this static dashboard needs a small backend for token exchange and encrypted storage before connecting your real account.`
  };
}

function safeArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  return [];
}

function plaidAccountDisplayLabels(accounts = []) {
  const rawAccounts = safeArray(accounts);
  const baseLabels = new Map();
  rawAccounts.forEach((account) => {
    const label = plaidBaseAccountLabel(account);
    baseLabels.set(label, (baseLabels.get(label) || 0) + 1);
  });

  const duplicateIndexes = new Map();
  return new Map(rawAccounts.map((account) => {
    const label = plaidBaseAccountLabel(account);
    const duplicateCount = baseLabels.get(label) || 0;
    if (duplicateCount <= 1) return [account.account_id, label];

    const nextIndex = (duplicateIndexes.get(label) || 0) + 1;
    duplicateIndexes.set(label, nextIndex);
    return [account.account_id, `${label} ${plaidMaskedAccountSuffix(account, nextIndex)}`];
  }));
}

function plaidBaseAccountLabel(account = {}) {
  return sanitizeAccountLabel(account.name || account.official_name || account.mask || account.account_id || "Fidelity account");
}

function plaidMaskedAccountSuffix(account = {}, index = 1) {
  const mask = String(account.mask || "").replace(/\D/g, "").slice(-4);
  if (mask) return `(•••• ${mask})`;
  const subtype = String(account.subtype || account.type || "").trim();
  if (subtype) return `(${subtype} ${index})`;
  return `#${index}`;
}

function numberFrom(...values) {
  const found = values.find((value) => value !== undefined && value !== null && value !== "");
  if (found === undefined) return 0;
  const parsed = Number(String(found).replace(/[$,%+,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function securityTicker(security = {}) {
  if (isCashLike(security)) return "CASH";
  return security.ticker_symbol || security.symbol || security.cusip || security.isin;
}

function snapTradeTicker(position = {}, symbol = {}) {
  if (isCashLike(symbol) || isCashLike(position)) return "CASH";
  if (typeof position.symbol === "string") return position.symbol;
  return symbol.symbol || symbol.raw_symbol || position.ticker || position.raw_symbol;
}

function providerAssetClass(security = {}, ticker = "") {
  const text = `${security.type || ""} ${security.asset_class || ""} ${security.name || ""}`.toLowerCase();
  if (ticker === "CASH" || /cash|money market/.test(text)) return "Cash";
  if (/treasury|bond|fixed income|bill/.test(text)) return "Treasuries";
  if (/etf|fund/.test(text)) return "ETF";
  if (/option/.test(text)) return "Option";
  if (/crypto/.test(text)) return "Crypto";
  return "Equity";
}

function providerSector(security = {}) {
  const text = `${security.sector || ""} ${security.industry || ""} ${security.type || ""}`.trim();
  if (isCashLike(security)) return "Cash";
  if (/treasury|bond|fixed income|bill/i.test(text)) return "Treasuries";
  if (/etf|fund/i.test(text)) return "ETF";
  return security.sector || security.industry || "Imported";
}

function accountTypeFromProvider(value = "") {
  const text = String(value).toLowerCase();
  if (/hsa|health/.test(text)) return "HSA";
  if (/ira|roth|401|403|retirement|pension/.test(text)) return "Retirement";
  if (/brokerage|individual|joint|taxable|margin/.test(text)) return "Taxable";
  return undefined;
}

function snapTradePositions(payload = {}) {
  const root = safeArray(payload.accounts || payload.positions || payload.holdings || payload);
  return root.flatMap((item) => {
    const accountPositions = item.positions || item.holdings || item.balances;
    if (accountPositions) {
      return safeArray(accountPositions).map((position) => ({ position, account: item }));
    }
    return { position: item, account: item.account || payload.account };
  });
}

function isCashLike(value = {}) {
  const text = `${value.ticker_symbol || ""} ${value.symbol || ""} ${value.type || ""} ${value.name || ""} ${value.description || ""}`.toLowerCase();
  return /\bcash\b|money market|core position/.test(text);
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
