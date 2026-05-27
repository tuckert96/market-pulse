const gradeScoreMap = Object.freeze({
  "A+": 98,
  A: 94,
  "A-": 90,
  "B+": 84,
  B: 78,
  "B-": 72,
  "C+": 66,
  C: 58,
  "C-": 50,
  "D+": 42,
  D: 34,
  "D-": 26,
  F: 10
});

const factorDefinitions = Object.freeze([
  { key: "quant", label: "Quant", sourceKeys: ["quant", "quantScore", "saQuant", "quantRating"], kind: "rating" },
  { key: "valuation", label: "Valuation", sourceKeys: ["valuationGrade", "valueGrade", "value"], kind: "grade" },
  { key: "growth", label: "Growth", sourceKeys: ["growthGrade", "growth"], kind: "grade" },
  { key: "profitability", label: "Profitability", sourceKeys: ["profitabilityGrade", "profitability"], kind: "grade" },
  { key: "momentum", label: "Momentum", sourceKeys: ["momentumGrade", "momentum"], kind: "grade" },
  { key: "revisions", label: "EPS revisions", sourceKeys: ["epsRevisionsGrade", "revisionsGrade", "revisions"], kind: "grade" },
  { key: "dividend", label: "Dividend", sourceKeys: ["dividendGrade", "dividendYield"], kind: "dividend" }
]);

export function buildSeekingAlphaStyleSnapshot(input = {}) {
  const factors = factorDefinitions.map((definition) => {
    const raw = firstPresent(input, definition.sourceKeys);
    const value = displayFactorValue(raw, definition.kind);
    const score = scoreFactor(raw, definition.kind);
    return {
      key: definition.key,
      label: definition.label,
      raw,
      value,
      score,
      tone: factorTone(score),
      available: raw !== undefined && raw !== null && raw !== ""
    };
  });
  const availableFactors = factors.filter((factor) => factor.available);
  const averageScore = availableFactors.length
    ? Math.round(availableFactors.reduce((sum, factor) => sum + factor.score, 0) / availableFactors.length)
    : 0;
  const missing = factors.filter((factor) => !factor.available).map((factor) => factor.label);
  const quantFactor = factors.find((factor) => factor.key === "quant");
  const valuationFactor = factors.find((factor) => factor.key === "valuation");
  const growthFactor = factors.find((factor) => factor.key === "growth");
  const profitabilityFactor = factors.find((factor) => factor.key === "profitability");
  const momentumFactor = factors.find((factor) => factor.key === "momentum");

  return {
    factors,
    averageScore,
    ratingLabel: researchRatingLabel(averageScore, availableFactors.length),
    missing,
    strengths: factors
      .filter((factor) => factor.available && factor.score >= 78)
      .map((factor) => `${factor.label}: ${factor.value}`)
      .slice(0, 4),
    concerns: factors
      .filter((factor) => factor.available && factor.score < 58)
      .map((factor) => `${factor.label}: ${factor.value}`)
      .slice(0, 4),
    summary: buildSaSnapshotSummary({
      quantFactor,
      valuationFactor,
      growthFactor,
      profitabilityFactor,
      momentumFactor,
      averageScore,
      availableCount: availableFactors.length,
      ticker: input.ticker
    })
  };
}

export function buildBuffettResearchChecklist(input = {}) {
  const saSnapshot = input.seekingAlphaSnapshot || buildSeekingAlphaStyleSnapshot(input);
  const securityKind = isFundLike(input) ? "fund-or-etf" : "operating-company";
  const checklist = securityKind === "fund-or-etf"
    ? fundChecklist(input, saSnapshot)
    : companyChecklist(input, saSnapshot);
  const score = Math.round(checklist.reduce((sum, item) => sum + item.score, 0) / Math.max(1, checklist.length));
  const missingEvidence = unique(checklist.flatMap((item) => item.missingEvidence || []));
  const watchItems = unique(checklist.flatMap((item) => item.watchItems || []));
  return {
    securityKind,
    score,
    label: buffettLabel(score, missingEvidence.length, securityKind),
    posture: buffettPosture({ score, missingEvidence, input, securityKind }),
    checklist,
    missingEvidence,
    watchItems,
    summary: buffettSummary({ input, score, missingEvidence, watchItems, securityKind })
  };
}

export function buildTickerResearchLens(input = {}) {
  const seekingAlphaSnapshot = buildSeekingAlphaStyleSnapshot(input);
  const buffettChecklist = buildBuffettResearchChecklist({ ...input, seekingAlphaSnapshot });
  return {
    ticker: input.ticker || "",
    seekingAlphaSnapshot,
    buffettChecklist,
    valuationContext: buildValuationContext(input, seekingAlphaSnapshot),
    sourceSummary: buildSourceSummary(input, seekingAlphaSnapshot, buffettChecklist)
  };
}

function companyChecklist(input, saSnapshot) {
  const profitability = factorScore(saSnapshot, "profitability");
  const growth = factorScore(saSnapshot, "growth");
  const valuation = factorScore(saSnapshot, "valuation");
  const revisions = factorScore(saSnapshot, "revisions");
  const momentum = factorScore(saSnapshot, "momentum");
  const forwardPe = finiteNumber(input.forwardPe ?? input.marketDataForwardPe ?? input.pe);
  const marketCap = finiteNumber(input.marketCap ?? input.marketDataMarketCap);
  const riskLevel = String(input.riskLevel || "").toLowerCase();
  const portfolioWeight = decimalNumber(input.portfolioWeight);

  return [
    checklistItem({
      label: "Understandable business",
      score: knownText(input.sector) && knownText(input.industry) ? 82 : knownText(input.sector) ? 66 : 42,
      evidence: knownText(input.sector) ? `${input.sector}${knownText(input.industry) ? ` / ${input.industry}` : ""}` : "Business classification is missing.",
      missingEvidence: knownText(input.sector) ? [] : ["sector and industry classification"],
      watchItems: knownText(input.industry) ? [] : ["Add industry context before judging business quality."]
    }),
    checklistItem({
      label: "Durable economics",
      score: averageKnown([profitability, growth], 50),
      evidence: `${factorLabel(saSnapshot, "profitability", "Profitability missing")} · ${factorLabel(saSnapshot, "growth", "Growth missing")}`,
      missingEvidence: missingFactorEvidence(saSnapshot, ["profitability", "growth"]),
      watchItems: profitability >= 78 && growth >= 72 ? [] : ["Confirm margins, return on invested capital, and cash conversion from primary filings."]
    }),
    checklistItem({
      label: "Earnings visibility",
      score: averageKnown([revisions, finiteNumber(input.epsGrowth) ? Math.min(96, 52 + finiteNumber(input.epsGrowth) * 0.65) : undefined], 48),
      evidence: `${factorLabel(saSnapshot, "revisions", "EPS revisions missing")}${finiteNumber(input.epsGrowth) ? ` · EPS growth ${formatPctPoint(input.epsGrowth)}` : ""}`,
      missingEvidence: [
        ...missingFactorEvidence(saSnapshot, ["revisions"]),
        finiteNumber(input.epsGrowth) ? "" : "EPS growth or estimate-change detail"
      ].filter(Boolean),
      watchItems: revisions >= 72 ? [] : ["Watch estimate revisions before treating near-term earnings as durable."]
    }),
    checklistItem({
      label: "Valuation discipline",
      score: valuationScore(valuation, forwardPe, growth),
      evidence: `${factorLabel(saSnapshot, "valuation", "Valuation grade missing")}${Number.isFinite(forwardPe) ? ` · forward P/E ${formatNumber(forwardPe)}` : ""}`,
      missingEvidence: [
        ...missingFactorEvidence(saSnapshot, ["valuation"]),
        Number.isFinite(forwardPe) ? "" : "forward P/E or valuation multiple"
      ].filter(Boolean),
      watchItems: valuation < 58 || (Number.isFinite(forwardPe) && forwardPe > 45) ? ["Demand a wider margin of safety or stronger evidence before increasing exposure."] : []
    }),
    checklistItem({
      label: "Balance-sheet / downside resilience",
      score: downsideResilienceScore(input, portfolioWeight, riskLevel),
      evidence: marketCap ? `Market cap ${formatCompactUsd(marketCap)}${riskLevel ? ` · risk ${input.riskLevel}` : ""}` : riskLevel ? `Risk ${input.riskLevel}` : "Balance-sheet data is not loaded.",
      missingEvidence: marketCap ? ["debt, cash, interest coverage, and free-cash-flow history"] : ["market cap, debt, cash, interest coverage, and free-cash-flow history"],
      watchItems: portfolioWeight > 0.1 ? ["Position size makes downside evidence more important."] : []
    }),
    checklistItem({
      label: "Price discipline",
      score: averageKnown([momentum, valuation], 52),
      evidence: `${factorLabel(saSnapshot, "momentum", "Momentum missing")} · ${factorLabel(saSnapshot, "valuation", "Valuation missing")}`,
      missingEvidence: missingFactorEvidence(saSnapshot, ["momentum", "valuation"]),
      watchItems: momentum >= 78 && valuation < 58 ? ["Great price action with weak valuation can become narrative risk."] : []
    })
  ];
}

function fundChecklist(input, saSnapshot) {
  const momentum = factorScore(saSnapshot, "momentum");
  const valuation = factorScore(saSnapshot, "valuation");
  const riskLevel = String(input.riskLevel || "").toLowerCase();
  const leveraged = Boolean(input.isLeveragedEtf || Number(input.leveragedMultiple || 1) > 1);
  const portfolioWeight = decimalNumber(input.portfolioWeight);
  return [
    checklistItem({
      label: "Exposure clarity",
      score: knownText(input.sector) || knownText(input.strategySleeve) ? 78 : 48,
      evidence: `${input.sector || "Sector missing"}${input.strategySleeve ? ` · ${input.strategySleeve}` : ""}`,
      missingEvidence: knownText(input.sector) ? [] : ["underlying exposure classification"],
      watchItems: []
    }),
    checklistItem({
      label: "Leverage guardrail",
      score: leveraged ? Math.max(18, 72 - Number(input.leveragedMultiple || 3) * 12 - portfolioWeight * 180) : 76,
      evidence: leveraged ? `${input.leveragedMultiple || 3}x leveraged ETF · ${formatPct(decimalNumber(portfolioWeight))} portfolio weight` : "No leverage flag detected.",
      missingEvidence: leveraged ? ["documented max target cap and volatility plan"] : [],
      watchItems: leveraged ? ["Review path-dependency, decay, and position cap before adding exposure."] : []
    }),
    checklistItem({
      label: "Liquidity / tradability",
      score: finiteNumber(input.volume) || finiteNumber(input.marketDataVolume) ? 82 : 52,
      evidence: finiteNumber(input.volume ?? input.marketDataVolume) ? `Volume ${formatNumber(input.volume ?? input.marketDataVolume)}` : "Volume data missing.",
      missingEvidence: finiteNumber(input.volume ?? input.marketDataVolume) ? [] : ["volume and spread/liquidity data"],
      watchItems: []
    }),
    checklistItem({
      label: "Momentum confirmation",
      score: momentum || 52,
      evidence: factorLabel(saSnapshot, "momentum", "Momentum grade missing"),
      missingEvidence: missingFactorEvidence(saSnapshot, ["momentum"]),
      watchItems: momentum < 58 ? ["Leveraged exposure without momentum support deserves caution."] : []
    }),
    checklistItem({
      label: "Valuation / exposure fit",
      score: valuation || 52,
      evidence: factorLabel(saSnapshot, "valuation", "Valuation/exposure value grade missing"),
      missingEvidence: missingFactorEvidence(saSnapshot, ["valuation"]),
      watchItems: riskLevel.includes("very") || portfolioWeight > 0.08 ? ["Compare exposure to target allocation and volatility tolerance."] : []
    })
  ];
}

function buildValuationContext(input, saSnapshot) {
  const forwardPe = finiteNumber(input.forwardPe ?? input.marketDataForwardPe ?? input.pe);
  const priceToSales = finiteNumber(input.priceToSales ?? input.psRatio);
  const dividendYield = decimalNumber(input.dividendYield);
  const marketCap = finiteNumber(input.marketCap ?? input.marketDataMarketCap);
  const price = finiteNumber(input.price ?? input.marketDataPrice);
  const high = finiteNumber(input.fiftyTwoWeekHigh);
  const low = finiteNumber(input.fiftyTwoWeekLow);
  const rangePosition = Number.isFinite(price) && Number.isFinite(high) && Number.isFinite(low) && high > low
    ? Math.max(0, Math.min(1, (price - low) / (high - low)))
    : null;
  const valuation = factorScore(saSnapshot, "valuation");
  const growth = factorScore(saSnapshot, "growth");
  const marginOfSafetyScore = Math.round(Math.max(0, Math.min(100,
    (valuation || 50) * 0.48 +
    (growth || 50) * 0.18 +
    (rangePosition === null ? 52 : (1 - rangePosition) * 100) * 0.2 +
    (Number.isFinite(forwardPe) ? Math.max(0, 100 - Math.max(0, forwardPe - 16) * 1.7) : 52) * 0.14
  )));

  return {
    forwardPe,
    priceToSales,
    dividendYield,
    marketCap,
    rangePosition,
    marginOfSafetyScore,
    label: marginOfSafetyScore >= 75 ? "Valuation support" : marginOfSafetyScore >= 58 ? "Fair-value watch" : "Thin margin of safety",
    note: buildValuationNote({ forwardPe, priceToSales, dividendYield, rangePosition, valuation, marginOfSafetyScore })
  };
}

function buildSourceSummary(input, saSnapshot, buffettChecklist) {
  const pieces = [];
  if (saSnapshot.factors.some((factor) => factor.available)) pieces.push("Seeking Alpha-style imported/factor fields");
  if (input.quoteAvailable) pieces.push("market quote/profile");
  if (input.thesisAvailable) pieces.push("local thesis");
  if (input.positionAvailable) pieces.push("portfolio exposure");
  if (input.signalAvailable) pieces.push("local signal score");
  return {
    label: pieces.length ? pieces.join(", ") : "limited local context",
    missing: unique([
      ...saSnapshot.missing,
      ...buffettChecklist.missingEvidence
    ]).slice(0, 8)
  };
}

function buildSaSnapshotSummary({ quantFactor, valuationFactor, growthFactor, profitabilityFactor, momentumFactor, averageScore, availableCount, ticker }) {
  if (!availableCount) return `${ticker || "Ticker"} has no imported Seeking Alpha-style factor fields yet.`;
  const leaders = [quantFactor, valuationFactor, growthFactor, profitabilityFactor, momentumFactor]
    .filter((factor) => factor?.available)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((factor) => `${factor.label} ${factor.value}`);
  return `${ticker || "Ticker"} factor snapshot averages ${averageScore}/100${leaders.length ? `, led by ${leaders.join(" and ")}` : ""}.`;
}

function buildValuationNote({ forwardPe, priceToSales, dividendYield, rangePosition, valuation, marginOfSafetyScore }) {
  const notes = [];
  if (Number.isFinite(forwardPe)) notes.push(`forward P/E ${formatNumber(forwardPe)}`);
  if (Number.isFinite(priceToSales)) notes.push(`price/sales ${formatNumber(priceToSales)}`);
  if (dividendYield) notes.push(`yield ${formatPct(dividendYield)}`);
  if (rangePosition !== null) notes.push(`${Math.round(rangePosition * 100)}% through 52-week range`);
  if (valuation < 58) notes.push("valuation grade is weak");
  if (!notes.length) notes.push("valuation inputs are limited");
  return `${notes.join(" · ")}. Margin-of-safety read: ${marginOfSafetyScore}/100.`;
}

function buffettSummary({ input, score, missingEvidence, watchItems, securityKind }) {
  if (securityKind === "fund-or-etf") {
    return `${input.ticker || "This fund"} scores ${score}/100 as an exposure review. Funds and leveraged ETFs should be judged by exposure, liquidity, costs, sizing, and risk controls rather than company fundamentals.`;
  }
  const missing = missingEvidence.length ? ` Missing: ${missingEvidence.slice(0, 3).join(", ")}.` : "";
  const watch = watchItems.length ? ` Watch: ${watchItems[0]}` : "";
  return `${input.ticker || "This company"} scores ${score}/100 on a Buffett-style quality checklist: understandable business, durable economics, earnings visibility, valuation discipline, downside resilience, and price discipline.${missing}${watch}`;
}

function buffettLabel(score, missingCount, securityKind) {
  if (missingCount >= 5) return "Needs evidence";
  if (securityKind === "fund-or-etf") {
    if (score >= 72) return "Exposure fits with guardrails";
    if (score >= 56) return "Exposure needs review";
    return "Risk guardrail needed";
  }
  if (score >= 78) return "Quality candidate";
  if (score >= 64) return "Study further";
  if (score >= 50) return "Mixed evidence";
  return "Needs stronger proof";
}

function buffettPosture({ score, missingEvidence, input, securityKind }) {
  if (securityKind === "fund-or-etf") return "Review exposure, liquidity, and sizing guardrails before changing position size.";
  if (missingEvidence.length >= 5) return "Do more primary-source research before relying on this score.";
  if (score >= 78 && decimalNumber(input.portfolioWeight) < 0.08) return "High-quality candidate, but valuation and margin of safety still need confirmation.";
  if (score >= 64) return "Study further and compare against target weight, risk, and alternatives.";
  return "Treat as a watch/review item until fundamentals and valuation evidence improve.";
}

function checklistItem({ label, score, evidence, missingEvidence = [], watchItems = [] }) {
  const bounded = Math.round(Math.max(0, Math.min(100, Number(score) || 0)));
  return {
    label,
    score: bounded,
    status: bounded >= 75 ? "supportive" : bounded >= 58 ? "mixed" : "needs evidence",
    evidence,
    missingEvidence: missingEvidence.filter(Boolean),
    watchItems: watchItems.filter(Boolean)
  };
}

function valuationScore(valuation, forwardPe, growth) {
  const valuationBase = valuation || 52;
  const peScore = Number.isFinite(forwardPe) ? Math.max(0, Math.min(100, 104 - Math.max(0, forwardPe - 16) * 1.45)) : 52;
  const growthOffset = growth >= 78 ? 8 : growth < 58 ? -6 : 0;
  return Math.round(valuationBase * 0.58 + peScore * 0.34 + growthOffset);
}

function downsideResilienceScore(input, portfolioWeight, riskLevel) {
  let score = 68;
  if (knownText(input.riskLevel)) {
    if (riskLevel.includes("very")) score -= 20;
    else if (riskLevel.includes("high")) score -= 11;
    else if (riskLevel.includes("low")) score += 8;
  } else {
    score -= 8;
  }
  if (portfolioWeight > 0.12) score -= 12;
  if (Boolean(input.isLeveragedEtf)) score -= 25;
  if (finiteNumber(input.marketCap ?? input.marketDataMarketCap) > 20_000_000_000) score += 6;
  return Math.max(0, Math.min(100, score));
}

function factorLabel(snapshot, key, fallback) {
  const factor = snapshot.factors.find((item) => item.key === key);
  if (!factor?.available) return fallback;
  return `${factor.label} ${factor.value}`;
}

function factorScore(snapshot, key) {
  return snapshot.factors.find((item) => item.key === key)?.score || 0;
}

function missingFactorEvidence(snapshot, keys) {
  return keys
    .map((key) => snapshot.factors.find((item) => item.key === key))
    .filter((factor) => factor && !factor.available)
    .map((factor) => `${factor.label} grade`);
}

function displayFactorValue(raw, kind) {
  if (raw === undefined || raw === null || raw === "") return "Missing";
  if (kind === "dividend") {
    const dividend = decimalNumber(raw);
    return dividend ? formatPct(dividend) : String(raw);
  }
  const text = String(raw).trim();
  const numeric = Number(text.replace(/[$,%+]/g, ""));
  if (Number.isFinite(numeric) && kind === "rating") return numeric <= 5 ? numeric.toFixed(2) : `${Math.round(numeric)}/100`;
  if (Number.isFinite(numeric) && kind === "grade") return numeric <= 5 ? numericToGrade(numeric) : `${Math.round(numeric)}/100`;
  return text.toUpperCase();
}

function scoreFactor(raw, kind) {
  if (raw === undefined || raw === null || raw === "") return 0;
  if (kind === "dividend") {
    const dividend = decimalNumber(raw);
    if (!dividend) return 48;
    return Math.max(35, Math.min(88, 54 + dividend * 1000));
  }
  const text = String(raw).trim();
  const numeric = Number(text.replace(/[$,%+]/g, ""));
  if (Number.isFinite(numeric)) {
    if (numeric <= 5) return Math.round(numeric * 20);
    return Math.round(Math.max(0, Math.min(100, numeric)));
  }
  const lower = text.toLowerCase();
  const ratingMap = {
    "strong buy": 96,
    buy: 84,
    bullish: 80,
    outperform: 78,
    hold: 58,
    neutral: 56,
    sell: 32,
    bearish: 30,
    "strong sell": 14
  };
  if (ratingMap[lower] !== undefined) return ratingMap[lower];
  return gradeScoreMap[text.toUpperCase()] || 0;
}

function factorTone(score) {
  if (score >= 78) return "good";
  if (score >= 58) return "neutral";
  if (score > 0) return "warn";
  return "missing";
}

function researchRatingLabel(score, availableCount) {
  if (!availableCount) return "No factor import";
  if (score >= 82) return "Strong factor support";
  if (score >= 68) return "Constructive factor mix";
  if (score >= 52) return "Mixed factor support";
  return "Weak factor support";
}

function firstPresent(input, keys) {
  for (const key of keys) {
    const value = input?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function isFundLike(input) {
  return Boolean(
    input.isLeveragedEtf ||
    /ETF|fund|treasur/i.test(String(input.assetClass || "")) ||
    /ETF|fund|trust|proshares|direxion|invesco|vanguard|ishares/i.test(String(input.name || ""))
  );
}

function knownText(value) {
  return Boolean(value && !/^unknown|unclassified|n\/a$/i.test(String(value).trim()));
}

function averageKnown(values, fallback) {
  const known = values.filter((value) => Number.isFinite(value) && value > 0);
  return known.length ? Math.round(known.reduce((sum, value) => sum + value, 0) / known.length) : fallback;
}

function finiteNumber(value) {
  const parsed = Number(String(value ?? "").replace(/[$,%+]/g, ""));
  return Number.isFinite(parsed) && parsed !== 0 ? parsed : NaN;
}

function decimalNumber(value) {
  if (value === undefined || value === null || value === "") return 0;
  const text = String(value).trim();
  const parsed = Number(text.replace(/[$,%+]/g, ""));
  if (!Number.isFinite(parsed)) return 0;
  return text.includes("%") || parsed > 1 ? parsed / 100 : parsed;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(Number(value) || 0);
}

function formatPct(value) {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format((Number(value) || 0) * 100)}%`;
}

function formatPctPoint(value) {
  const numeric = Number(value) || 0;
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(Math.abs(numeric) <= 1 ? numeric * 100 : numeric)}%`;
}

function formatCompactUsd(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(Number(value) || 0);
}

function numericToGrade(score) {
  if (score >= 4.85) return "A+";
  if (score >= 4.65) return "A";
  if (score >= 4.45) return "A-";
  if (score >= 4.2) return "B+";
  if (score >= 3.85) return "B";
  if (score >= 3.55) return "B-";
  if (score >= 3.2) return "C+";
  if (score >= 2.85) return "C";
  if (score >= 2.55) return "C-";
  if (score >= 2.2) return "D+";
  if (score >= 1.85) return "D";
  if (score >= 1.55) return "D-";
  return "F";
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}
