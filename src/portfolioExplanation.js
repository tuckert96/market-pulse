import { isUsableCredentialValue } from "./configValueSafety.js";

export const DEFAULT_OPENAI_EXPLANATION_MODEL = "gpt-5.2";

const SENSITIVE_KEY_PATTERN = /(api[_-]?key|secret|token|password|cookie|authorization|session|credential|access[_-]?token|refresh[_-]?token)/i;
const ACCOUNT_KEY_PATTERN = /(account(number|id)?|acct(number|id)?)/i;

export function buildOpenAIExplanationConfig(env = {}) {
  const configured = isUsableCredentialValue(env.OPENAI_API_KEY);
  const enabled = ["1", "true", "yes"].includes(String(env.OPENAI_PORTFOLIO_EXPLANATIONS_ENABLED || "").toLowerCase());
  const model = String(env.OPENAI_PORTFOLIO_MODEL || env.OPENAI_MODEL || DEFAULT_OPENAI_EXPLANATION_MODEL).trim() || DEFAULT_OPENAI_EXPLANATION_MODEL;
  return {
    provider: "openai",
    label: "OpenAI portfolio explanations",
    configured,
    enabled,
    status: configured ? enabled ? "live-ready" : "configured-not-connected" : "not configured",
    liveProviderCalls: configured && enabled,
    model,
    required: ["OPENAI_API_KEY"],
    missingEnv: configured ? [] : ["OPENAI_API_KEY"],
    detail: configured && enabled
      ? "OpenAI explanations are configured on the local backend. API keys stay server-side."
      : configured
      ? "OpenAI key is present, but portfolio explanations are disabled until OPENAI_PORTFOLIO_EXPLANATIONS_ENABLED=true."
      : "OpenAI explanations are not configured. The app returns deterministic local explanations instead."
  };
}

export function buildPortfolioExplanationFallback(input = {}, options = {}) {
  const sanitized = sanitizePortfolioExplanationInput(input);
  const holdings = sanitized.holdings || sanitized.portfolio?.holdings || [];
  const overview = sanitized.overview || sanitized.portfolio?.overview || {};
  const risk = sanitized.risk || sanitized.portfolio?.risk || {};
  const alerts = sanitized.alerts || sanitized.portfolio?.alerts || [];
  const thesisRows = sanitized.thesisRows || [];
  const sourceStatuses = sanitized.sourceStatuses || sanitized.dataSources || {};
  const totalValue = Number(overview.totalValue || overview.marketValue || 0);
  const topHolding = holdings
    .slice()
    .sort((a, b) => Number(b.marketValue || 0) - Number(a.marketValue || 0))[0];
  const alertCount = alerts.length;
  const missingThesisCount = thesisRows.filter((row) => /missing|needs thesis/i.test(String(row.thesisStatus || row.status || ""))).length;
  const dataSources = sourceCategoryLabels(sourceStatuses, sanitized);
  const caveats = [
    ...missingDataCaveats(sanitized, holdings),
    "This is decision-support context only. It does not place trades or predict returns."
  ];
  const actionItems = [
    topHolding ? `Inspect ${topHolding.ticker || topHolding.name} because it is the largest visible holding.` : "Load a portfolio before using position-level explanations.",
    alertCount ? `Review ${alertCount} current alert${alertCount === 1 ? "" : "s"} before changing position size.` : "No current alert rows were provided to this explanation.",
    missingThesisCount ? `Document thesis gaps for ${missingThesisCount} holding${missingThesisCount === 1 ? "" : "s"}.` : "Keep thesis notes current for large positions."
  ];

  return {
    ok: true,
    mode: "local deterministic",
    sourceMode: "local deterministic",
    status: options.status || "not configured",
    provider: "local",
    model: null,
    dataSources,
    sanitizedInput: sanitized,
    explanation: {
      title: "Local portfolio explanation",
      summary: portfolioSummaryLine({ totalValue, holdings, risk, alertCount }),
      bullets: [
        holdings.length ? `${holdings.length} holding${holdings.length === 1 ? "" : "s"} are included in the explanation payload.` : "No holding rows were provided.",
        topHolding ? `Largest visible holding: ${topHolding.ticker || topHolding.name} at ${formatPct(topHolding.portfolioWeight)}.` : "Largest holding is not available.",
        risk?.top10Weight ? `Top 10 concentration is ${formatPct(risk.top10Weight)}.` : "Top 10 concentration is not available.",
        alertCount ? `${alertCount} alert${alertCount === 1 ? "" : "s"} may need review.` : "No alert rows were provided."
      ],
      actionItems,
      caveats
    }
  };
}

export function buildOpenAIResponsesRequest(input = {}, options = {}) {
  const fallback = buildPortfolioExplanationFallback(input);
  return {
    model: options.model || DEFAULT_OPENAI_EXPLANATION_MODEL,
    store: false,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: buildPortfolioExplanationPrompt(fallback.sanitizedInput, fallback.dataSources)
          }
        ]
      }
    ],
    instructions: [
      "You are a portfolio explanation assistant inside Market Pulse.",
      "Use only the structured data supplied in the prompt.",
      "Do not invent news, prices, account data, catalysts, or recommendations.",
      "Do not issue buy/sell commands or guaranteed-return language.",
      "Mention missing, stale, sample, imported, cached, or live data caveats when relevant.",
      "Keep the answer concise, practical, and review-oriented."
    ].join(" "),
    text: {
      format: { type: "text" },
      verbosity: "low"
    }
  };
}

export function buildPortfolioExplanationPrompt(sanitizedInput = {}, dataSources = []) {
  return [
    "Explain the current portfolio state in plain English.",
    "Return 1 short paragraph followed by 3-5 review bullets.",
    "Data source labels available:",
    dataSources.map((item) => `- ${item}`).join("\n") || "- No source labels supplied.",
    "Structured dashboard data:",
    JSON.stringify(sanitizedInput, null, 2)
  ].join("\n\n");
}

export function extractOpenAIResponseText(payload = {}) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim();
  const output = Array.isArray(payload.output) ? payload.output : [];
  const parts = [];
  for (const item of output) {
    const content = Array.isArray(item.content) ? item.content : [];
    for (const part of content) {
      if (typeof part.text === "string" && part.text.trim()) parts.push(part.text.trim());
    }
  }
  return parts.join("\n").trim();
}

export function sanitizePortfolioExplanationInput(input = {}) {
  const sanitized = sanitizeValue(input);
  return {
    requestType: String(sanitized.requestType || "portfolio-summary").slice(0, 80),
    overview: sanitizeObject(sanitized.overview || sanitized.portfolio?.overview || {}),
    risk: sanitizeObject(sanitized.risk || sanitized.portfolio?.risk || {}),
    holdings: sanitizeArray(sanitized.holdings || sanitized.portfolio?.holdings || [], 30).map(sanitizeHoldingForPrompt),
    alerts: sanitizeArray(sanitized.alerts || sanitized.portfolio?.alerts || [], 20).map((alert) => sanitizeObject(alert)),
    thesisRows: sanitizeArray(sanitized.thesisRows || [], 20).map((row) => sanitizeObject(row)),
    sourceStatuses: sanitizeObject(sanitized.sourceStatuses || sanitized.dataSources || {}),
    marketDataStatus: sanitizeObject(sanitized.marketDataStatus || {}),
    dataQuality: sanitizeObject(sanitized.dataQuality || {})
  };
}

export function redactSecretLikeText(value = "", extraSecrets = []) {
  let text = String(value || "");
  for (const secret of extraSecrets) {
    if (secret && String(secret).length >= 4) text = text.replaceAll(String(secret), "[redacted]");
  }
  return text
    .replace(/(api[_-]?key|access_token|public_token|refresh_token|token|client_secret|secret|password|cookie|authorization)=([^&\s"']+)/gi, "$1=[redacted]")
    .replace(/\b(api[_-]?key|access_token|public_token|refresh_token|client_secret|secret|password|cookie|authorization)\b\s*:?\s*["']?[A-Za-z0-9._~-]{6,}["']?/gi, "$1 [redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]")
    .replace(/[A-Za-z0-9_-]{32,}/g, "[redacted]");
}

function sanitizeValue(value, key = "") {
  if (SENSITIVE_KEY_PATTERN.test(key)) return "[redacted]";
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.slice(0, 80).map((item) => sanitizeValue(item));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      sanitizeValue(entryValue, entryKey)
    ]));
  }
  if (ACCOUNT_KEY_PATTERN.test(key)) return maskAccountLabel(value);
  return redactSecretLikeText(value);
}

function sanitizeHoldingForPrompt(holding = {}) {
  return sanitizeObject({
    ticker: holding.ticker,
    name: holding.name || holding.company,
    account: holding.account,
    accountType: holding.accountType,
    marketValue: holding.marketValue,
    portfolioWeight: holding.portfolioWeight,
    sector: holding.sector,
    assetClass: holding.assetClass,
    riskLevel: holding.riskLevel,
    thesisStatus: holding.thesisStatus,
    source: holding.source,
    sourceAsOf: holding.sourceAsOf
  });
}

function sanitizeObject(value = {}) {
  const cleaned = sanitizeValue(value);
  return cleaned && typeof cleaned === "object" && !Array.isArray(cleaned) ? cleaned : {};
}

function sanitizeArray(value = [], limit = 20) {
  return Array.isArray(value) ? value.slice(0, limit).map((item) => sanitizeValue(item)) : [];
}

function maskAccountLabel(value = "") {
  const text = String(value || "");
  const digits = text.replace(/\D/g, "");
  if (digits.length < 5) return redactSecretLikeText(text);
  const lastFour = digits.slice(-4);
  if (!/[A-Za-z]/.test(text)) return `Account ending ${lastFour}`;
  return redactSecretLikeText(text.replace(/\d(?=(?:\D*\d){4})/g, "•"));
}

function sourceCategoryLabels(sourceStatuses = {}, sanitized = {}) {
  const labels = [];
  const addStatus = (label, status) => {
    const text = typeof status === "string" ? status : status?.label || status?.status || status?.dataFreshness || "";
    if (text) labels.push(`${label}: ${text}`);
  };
  addStatus("Portfolio", sanitized.dataQuality?.portfolioSource || sanitized.overview?.source || sourceStatuses.portfolio);
  addStatus("Market data", sanitized.marketDataStatus || sourceStatuses.marketData);
  addStatus("Reddit", sourceStatuses.reddit);
  addStatus("Politician trades", sourceStatuses.politicianTrades);
  addStatus("Seeking Alpha", sourceStatuses.seekingAlpha);
  addStatus("Alerts", sourceStatuses.alerts);
  return labels.length ? labels : ["Source labels were not supplied"];
}

function missingDataCaveats(input = {}, holdings = []) {
  const caveats = [];
  if (!holdings.length) caveats.push("No holdings were provided.");
  const marketText = JSON.stringify(input.marketDataStatus || {}).toLowerCase();
  if (!marketText || /not configured|missing|sample|mock|stale|error/.test(marketText)) {
    caveats.push("Market data may be sample, stale, missing, or not configured.");
  }
  if (!Array.isArray(input.thesisRows) || !input.thesisRows.length) caveats.push("No thesis rows were provided.");
  return caveats;
}

function portfolioSummaryLine({ totalValue, holdings, risk, alertCount }) {
  const value = totalValue ? formatCurrency(totalValue) : "an unavailable portfolio value";
  const top10 = risk?.top10Weight ? ` Top 10 concentration is ${formatPct(risk.top10Weight)}.` : "";
  const alertText = alertCount ? ` ${alertCount} alert${alertCount === 1 ? "" : "s"} need review.` : " No alert rows were supplied.";
  return `This local explanation covers ${holdings.length} holding${holdings.length === 1 ? "" : "s"} and ${value}.${top10}${alertText}`;
}

function formatCurrency(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "not available";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(number);
}

function formatPct(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "not available";
  return `${(number * 100).toFixed(1)}%`;
}
