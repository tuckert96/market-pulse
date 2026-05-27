const STALE_DAYS = 45;

export function buildThesisRows(holdings = [], profiles = {}, options = {}) {
  const asOf = options.asOf || new Date();
  const targetRowsByTicker = new Map((options.targetPlan?.rows || [])
    .filter((row) => row.scope === "ticker")
    .map((row) => [row.key, row]));
  const alphaByTicker = groupAlphaSignalsByTicker(options.alphaSignals || []);

  return aggregateHoldingsByTicker(holdings)
    .map((holding) => {
      const profile = normalizeThesisProfile(profiles[holding.ticker] || {}, holding);
      const targetRow = targetRowsByTicker.get(holding.ticker);
      const alphaSignals = alphaByTicker.get(holding.ticker) || [];
      const alphaImpact = summarizeAlphaImpact(alphaSignals);
      const ageDays = daysSince(profile.lastReviewedDate, asOf);
      const missing = !profile.whyOwned && !holding.thesis;
      const stale = ageDays === null || ageDays > Number(options.staleDays || STALE_DAYS);
      const contradicted = isContradicted(holding, profile);
      const targetWeight = firstPositive(targetRow?.targetWeight, profile.targetAllocation, holding.targetWeight);
      const drift = holding.portfolioWeight - targetWeight;
      const aboveTarget = targetWeight > 0 && drift > 0.015;
      const weakConfidence = ["Low", "Medium-low", "Unrated"].includes(profile.confidenceLevel);
      const leveragedGuardrailMissing = Boolean(holding.isLeveragedEtf && !hasGuardrailNotes(profile));
      const aboveTargetWithWeakOrStale = Boolean(aboveTarget && (weakConfidence || stale || missing || contradicted));
      const reviewReasons = buildReviewReasons({
        missing,
        stale,
        contradicted,
        aboveTargetWithWeakOrStale,
        leveragedGuardrailMissing,
        alphaImpact
      });
      const thesisStatus = deriveThesisStatus(profile, {
        missing,
        stale,
        contradicted,
        alphaImpact,
        aboveTargetWithWeakOrStale,
        leveragedGuardrailMissing
      });

      return {
        ticker: holding.ticker,
        name: holding.name,
        accounts: holding.accounts,
        account: holding.accounts.join(", "),
        marketValue: holding.marketValue,
        portfolioWeight: holding.portfolioWeight,
        targetWeight,
        drift,
        driftValue: targetRow?.driftValue ?? drift * (options.totalValue || 0),
        aboveTarget,
        thesisStatus,
        manualStatus: profile.thesisStatus,
        whyOwned: profile.whyOwned || holding.thesis || "",
        confidenceLevel: profile.confidenceLevel,
        lastReviewedDate: profile.lastReviewedDate || "",
        ageDays,
        nextReviewTrigger: profile.nextReviewTrigger || first(profile.reviewTriggers) || nextReviewTriggerForHolding(holding),
        downsideRisk: first(profile.keyRisks) || "Not documented",
        invalidation: first(profile.invalidationCriteria) || "Not documented",
        whatWouldMakeMeAdd: first(profile.addConditions) || "Not documented",
        whatWouldMakeMeTrim: first(profile.trimConditions) || "Not documented",
        whatWouldMakeMeExitReview: first(profile.exitReviewConditions) || profile.stopReviewTrigger || "Not documented",
        notes: profile.notes || "",
        bullishAssumptions: profile.bullishAssumptions,
        keyRisks: profile.keyRisks,
        invalidationCriteria: profile.invalidationCriteria,
        addConditions: profile.addConditions,
        trimConditions: profile.trimConditions,
        exitReviewConditions: profile.exitReviewConditions,
        reviewTriggers: profile.reviewTriggers,
        alphaSignals,
        alphaImpact,
        reviewReasons,
        reviewAction: reviewActionForStatus(thesisStatus),
        contradicted,
        contradictionReason: contradicted,
        missing,
        stale,
        weakConfidence,
        aboveTargetWithWeakOrStale,
        leveragedGuardrailMissing,
        isLeveragedEtf: holding.isLeveragedEtf
      };
    })
    .sort((a, b) =>
      thesisRank(a.thesisStatus) - thesisRank(b.thesisStatus) ||
      b.portfolioWeight - a.portfolioWeight ||
      a.ticker.localeCompare(b.ticker)
    );
}

export function buildThesisAlerts(rows = []) {
  return rows.flatMap((row) => {
    const alerts = [];
    if (row.missing) {
      alerts.push(thesisAlert(row, "thesis-missing", row.portfolioWeight >= 0.05 ? "high" : "medium", `${row.ticker} needs a thesis`, "Document why Tucker owns it, target weight, invalidation criteria, and review trigger.", "Review"));
    }
    if (row.stale && row.portfolioWeight >= 0.05) {
      alerts.push(thesisAlert(row, "thesis-stale-large", "high", `${row.ticker} thesis is stale`, `${row.ticker} is ${formatPct(row.portfolioWeight)} of the portfolio and has not been reviewed recently.`, "Review"));
    }
    if (row.aboveTargetWithWeakOrStale) {
      alerts.push(thesisAlert(row, "thesis-above-target", "high", `${row.ticker} is above target with thesis risk`, `Current weight is ${formatPct(row.portfolioWeight)} vs ${formatPct(row.targetWeight)} target. Refresh the thesis before changing size.`, "Review"));
    }
    if (row.leveragedGuardrailMissing) {
      alerts.push(thesisAlert(row, "thesis-leverage-guardrail", "medium", `${row.ticker} needs leverage guardrail notes`, "Add what would make Tucker trim, exit, or review this leveraged ETF.", "Review"));
    }
    if (row.alphaImpact.breaking.length) {
      alerts.push(thesisAlert(row, "thesis-alpha-breaking", "critical", `${row.ticker} has a thesis-breaking signal`, row.alphaImpact.breaking[0].headline, "Critical Review"));
    }
    if (row.alphaImpact.weakening.length) {
      alerts.push(thesisAlert(row, "thesis-alpha-weakening", "high", `${row.ticker} thesis needs signal review`, row.alphaImpact.weakening[0].headline, "Review"));
    }
    if (row.alphaImpact.supporting.length && !row.alphaImpact.breaking.length) {
      alerts.push(thesisAlert(row, "thesis-alpha-support", "positive", `${row.ticker} thesis has support`, `${row.alphaImpact.supporting[0].headline}. No urgent action; monitor confirming evidence.`, "Positive Signal"));
    }
    return alerts;
  }).sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || b.score - a.score).slice(0, 18);
}

export function thesisSummary(rows = []) {
  return {
    total: rows.length,
    missing: rows.filter((row) => row.thesisStatus === "Missing").length,
    stale: rows.filter((row) => row.thesisStatus === "Stale").length,
    contradicted: rows.filter((row) => row.thesisStatus === "Contradicted").length,
    thesisBreakingSignals: rows.filter((row) => row.thesisStatus === "Thesis-breaking signal").length,
    alphaReview: rows.filter((row) => row.alphaImpact.weakening.length || row.alphaImpact.breaking.length).length,
    alphaSupport: rows.filter((row) => row.alphaImpact.supporting.length).length,
    aboveTargetWithWeakOrStale: rows.filter((row) => row.aboveTargetWithWeakOrStale).length,
    leveragedGuardrailMissing: rows.filter((row) => row.leveragedGuardrailMissing).length,
    needsAttention: rows.filter((row) => !["Current", "Supported"].includes(row.thesisStatus)).length
  };
}

export function normalizeThesisProfile(profile = {}, holding = {}) {
  return {
    ticker: profile.ticker || holding.ticker || "",
    whyOwned: String(profile.whyOwned || holding.thesis || "").trim(),
    targetAllocation: positiveNumber(profile.targetAllocation ?? holding.targetWeight),
    confidenceLevel: profile.confidenceLevel || holding.confidenceLevel || "Unrated",
    thesisStatus: normalizeStatus(profile.thesisStatus || holding.thesisStatus),
    bullishAssumptions: normalizeList(profile.bullishAssumptions),
    keyRisks: normalizeList(profile.keyRisks),
    invalidationCriteria: normalizeList(profile.invalidationCriteria || profile.thesisBreakingConditions),
    thesisBreakingConditions: normalizeList(profile.invalidationCriteria || profile.thesisBreakingConditions),
    addConditions: normalizeList(profile.addConditions || profile.whatWouldMakeMeAdd),
    trimConditions: normalizeList(profile.trimConditions || profile.whatWouldMakeMeTrim),
    exitReviewConditions: normalizeList(profile.exitReviewConditions || profile.whatWouldMakeMeExitReview),
    reviewTriggers: normalizeList(profile.reviewTriggers),
    nextReviewTrigger: String(profile.nextReviewTrigger || "").trim(),
    catalyst: String(profile.catalyst || "").trim(),
    stopReviewTrigger: String(profile.stopReviewTrigger || "").trim(),
    lastReviewedDate: profile.lastReviewedDate || "",
    notes: String(profile.notes || "").trim()
  };
}

function aggregateHoldingsByTicker(holdings = []) {
  const byTicker = new Map();
  for (const holding of holdings.filter((item) => item.ticker && item.assetClass !== "Cash")) {
    const current = byTicker.get(holding.ticker) || {
      ...holding,
      marketValue: 0,
      costBasis: 0,
      portfolioWeight: 0,
      targetWeight: 0,
      accounts: new Set(),
      holdings: 0
    };
    current.marketValue += Number(holding.marketValue) || 0;
    current.costBasis += Number(holding.costBasis) || 0;
    current.portfolioWeight += Number(holding.portfolioWeight) || 0;
    current.targetWeight = current.targetWeight || Number(holding.targetWeight) || 0;
    current.accounts.add(holding.account || "Unknown account");
    current.holdings += 1;
    current.isLeveragedEtf = current.isLeveragedEtf || holding.isLeveragedEtf;
    current.isSemiconductor = current.isSemiconductor || holding.isSemiconductor;
    byTicker.set(holding.ticker, current);
  }
  return [...byTicker.values()].map((holding) => ({
    ...holding,
    accounts: [...holding.accounts].sort()
  }));
}

function groupAlphaSignalsByTicker(signals = []) {
  const byTicker = new Map();
  for (const signal of signals) {
    const tickers = new Set([
      ...(signal.affectedTickers || []),
      ...(signal.inferredTickersAffected || []),
      signal.primaryTicker
    ].filter(Boolean));
    for (const ticker of tickers) {
      const rows = byTicker.get(ticker) || [];
      rows.push(signal);
      byTicker.set(ticker, rows);
    }
  }
  return byTicker;
}

function summarizeAlphaImpact(signals = []) {
  const supporting = signals.filter((signal) => signal.thesisImpact === "supports thesis");
  const weakening = signals.filter((signal) => ["weakens thesis", "requires review", "confirms known risk", "introduces new risk"].includes(signal.thesisImpact));
  const breaking = signals.filter((signal) => signal.thesisImpact === "breaks thesis");
  return {
    supporting,
    weakening,
    breaking,
    latest: signals[0] || null,
    summary: breaking[0]?.headline || weakening[0]?.headline || supporting[0]?.headline || ""
  };
}

function buildReviewReasons(context) {
  const reasons = [];
  if (context.missing) reasons.push("No thesis documented.");
  if (context.stale) reasons.push("Thesis review is stale or missing.");
  if (context.contradicted) reasons.push(context.contradicted);
  if (context.aboveTargetWithWeakOrStale) reasons.push("Above target while thesis confidence or freshness needs work.");
  if (context.leveragedGuardrailMissing) reasons.push("Leveraged holding lacks trim/exit guardrail notes.");
  if (context.alphaImpact.breaking.length) reasons.push("Alpha Engine has a thesis-breaking signal.");
  if (context.alphaImpact.weakening.length) reasons.push("Alpha Engine has a thesis review signal.");
  if (!reasons.length && context.alphaImpact.supporting.length) reasons.push("Alpha Engine signal supports the thesis; monitor confirming evidence.");
  return reasons;
}

function deriveThesisStatus(profile, context) {
  if (context.alphaImpact.breaking.length) return "Thesis-breaking signal";
  if (context.missing) return "Missing";
  if (context.contradicted) return "Contradicted";
  if (context.aboveTargetWithWeakOrStale || context.leveragedGuardrailMissing || context.alphaImpact.weakening.length) return "Needs review";
  if (context.stale) return "Stale";
  if (context.alphaImpact.supporting.length) return "Supported";
  if (["Current", "Active", "Supported"].includes(profile.thesisStatus)) return "Current";
  if (profile.thesisStatus && !/needs thesis|missing/i.test(profile.thesisStatus)) return profile.thesisStatus;
  return "Current";
}

function reviewActionForStatus(status) {
  if (status === "Thesis-breaking signal") return "Immediate review";
  if (status === "Missing") return "Document thesis";
  if (status === "Contradicted") return "Review contradiction";
  if (status === "Needs review") return "Review thesis";
  if (status === "Stale") return "Refresh thesis";
  if (status === "Supported") return "Monitor support";
  return "Hold thesis";
}

function isContradicted(holding, profile) {
  if (holding.revisionsGrade && ["D", "D-", "F"].includes(String(holding.revisionsGrade).toUpperCase())) {
    return "EPS revisions are weak relative to the thesis.";
  }
  if (holding.quant && holding.quant < 3 && holding.portfolioWeight > 0.05) {
    return "Large position has weak Quant support.";
  }
  if (holding.valuationGrade && ["D", "D-", "F"].includes(String(holding.valuationGrade).toUpperCase()) && /valuation|margin|pricing/i.test((profile.whyOwned || "") + (holding.thesis || ""))) {
    return "Valuation grade conflicts with a valuation-sensitive thesis.";
  }
  return "";
}

function hasGuardrailNotes(profile) {
  const text = [
    profile.notes,
    ...profile.trimConditions,
    ...profile.exitReviewConditions,
    profile.stopReviewTrigger,
    ...profile.reviewTriggers
  ].join(" ");
  return /cap|trim|exit|review|volatility|drawdown|rebalance|guardrail|leverage/i.test(text);
}

function nextReviewTriggerForHolding(holding) {
  if (holding.nextEarnings) return `Earnings on ${holding.nextEarnings}`;
  if (holding.isLeveragedEtf) return "Weekly leverage and volatility review";
  if (holding.isSemiconductor) return "Memory/AI demand and pricing update";
  return "Monthly thesis review";
}

function thesisAlert(row, type, severity, title, detail, actionCategory) {
  return {
    id: `${type}:${row.ticker}`,
    type,
    severity,
    actionCategory,
    title,
    detail,
    ticker: row.ticker,
    score: severityRank(severity) * 20 + Math.round((row.portfolioWeight || 0) * 100)
  };
}

function daysSince(dateText, asOf = new Date()) {
  if (!dateText) return null;
  const date = new Date(`${dateText}T12:00:00`);
  const current = asOf instanceof Date ? asOf : new Date(`${asOf}T12:00:00`);
  if (Number.isNaN(date.getTime()) || Number.isNaN(current.getTime())) return null;
  return Math.floor((current.getTime() - date.getTime()) / 86400000);
}

function first(values = []) {
  return Array.isArray(values) ? values[0] || "" : "";
}

function normalizeList(value = []) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || "")
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeStatus(value = "") {
  const text = String(value || "").trim();
  if (/missing thesis|needs thesis/i.test(text)) return "Missing";
  if (/active/i.test(text)) return "Active";
  if (["Current", "Supported", "Needs review", "Stale", "Contradicted", "Missing"].includes(text)) return text;
  return "Needs review";
}

function firstPositive(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number > 1 ? number / 100 : number;
  }
  return 0;
}

function positiveNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return number > 1 ? number / 100 : number;
}

function severityRank(severity) {
  return { positive: 1, low: 1, medium: 2, high: 3, critical: 4 }[severity] ?? 0;
}

function thesisRank(status) {
  return {
    "Thesis-breaking signal": 0,
    Contradicted: 1,
    Missing: 2,
    "Needs review": 3,
    Stale: 4,
    Supported: 5,
    Current: 6
  }[status] ?? 7;
}

function formatPct(value) {
  return `${((Number(value) || 0) * 100).toFixed(1)}%`;
}
