import { isRealPortfolioUiState } from "./portfolioState.js";

const COMPONENT_WEIGHTS = Object.freeze({
  dataTrust: 0.22,
  concentration: 0.2,
  thesisCoverage: 0.18,
  targetDiscipline: 0.16,
  alertLoad: 0.14,
  marketFreshness: 0.1
});

export function buildPortfolioHealth({
  analysis = {},
  thesisRows = [],
  targetPlan = {},
  alerts = [],
  marketDataStatus = {},
  portfolioDataQuality = {},
  uiState = "SAMPLE_MODE",
  asOf = new Date().toISOString()
} = {}) {
  const realPortfolio = isRealPortfolioUiState(uiState);
  if (!realPortfolio) {
    return {
      score: 0,
      label: uiState === "SAMPLE_MODE" ? "Sample only" : "Data missing",
      tone: "sample",
      generatedAt: asOf,
      summary: uiState === "SAMPLE_MODE"
        ? "Sample data can demonstrate the workflow, but it is not Tucker's real portfolio."
        : "Import holdings before the dashboard can produce a portfolio health read.",
      components: emptyComponents(),
      strengths: [],
      issues: ["No real imported portfolio is loaded."],
      nextActions: [{ label: "Import portfolio", href: "#imports", reason: "Portfolio health needs real holdings." }]
    };
  }

  const components = [
    dataTrustComponent(portfolioDataQuality, analysis),
    concentrationComponent(analysis),
    thesisCoverageComponent(thesisRows, analysis),
    targetDisciplineComponent(targetPlan),
    alertLoadComponent(alerts.length ? alerts : analysis.alerts || []),
    marketFreshnessComponent(marketDataStatus)
  ];
  const rawScore = components.reduce((total, component) => total + component.score * (component.weight / 100), 0);
  const score = Math.round(Math.max(0, Math.min(100, rawScore)));
  const issues = components
    .filter((component) => component.score < 72)
    .sort(componentIssueRank)
    .map((component) => component.issue || component.detail)
    .filter(Boolean)
    .slice(0, 4);
  const strengths = components
    .filter((component) => component.score >= 82)
    .sort((a, b) => b.score - a.score)
    .map((component) => component.strength || component.detail)
    .filter(Boolean)
    .slice(0, 4);

  return {
    score,
    label: healthLabel(score),
    tone: healthTone(score),
    generatedAt: asOf,
    summary: healthSummary(score, issues),
    components,
    strengths,
    issues,
    nextActions: nextActionsForComponents(components).slice(0, 3)
  };
}

function emptyComponents() {
  return Object.entries(COMPONENT_WEIGHTS).map(([key, weight]) => ({
    key,
    label: componentLabel(key),
    score: 0,
    weight: weight * 100,
    detail: "Waiting for imported portfolio data.",
    issue: "Import holdings to calculate this component.",
    href: "#imports"
  }));
}

function dataTrustComponent(quality = {}, analysis = {}) {
  const rejected = Number(quality.rejectedNonHoldingRows || 0);
  const missingCost = Number(quality.missingCostBasisCount || 0);
  const holdingCount = Number(quality.holdingCount || quality.holdingsCount || analysis.holdings?.length || 0);
  const holdingFailures = Number(quality.failedHoldingRows || quality.rejectedHoldingRows || 0);
  let score = 92;
  if (holdingFailures > 0) score -= Math.min(42, holdingFailures * 18);
  if (missingCost > 0) score -= Math.min(18, missingCost * 2);
  if (!holdingCount) score = 25;
  return component({
    key: "dataTrust",
    score,
    detail: holdingFailures
      ? `${holdingFailures} holding row${holdingFailures === 1 ? "" : "s"} need review.`
      : missingCost
      ? `${missingCost} holding${missingCost === 1 ? "" : "s"} missing cost basis.`
      : rejected
      ? `${rejected} harmless non-holding row${rejected === 1 ? "" : "s"} skipped.`
      : "Import data is usable.",
    issue: holdingFailures ? "Fix holding rows that failed import validation." : missingCost ? "Review missing cost basis fields." : "",
    strength: holdingFailures || missingCost ? "" : "Imported portfolio data is usable.",
    href: "#imports"
  });
}

function concentrationComponent(analysis = {}) {
  const risk = analysis.risk || {};
  const overview = analysis.overview || {};
  const top10 = Number(risk.top10Weight || 0);
  const top5 = Number(risk.top5Weight || 0);
  const leverage = Number(overview.leveragedNotionalExposure || 0) / Math.max(1, Number(overview.totalValue || 0));
  const score = 100
    - penaltyAbove(top10, 0.45, 80)
    - penaltyAbove(top5, 0.32, 55)
    - penaltyAbove(leverage, 0.18, 65);
  return component({
    key: "concentration",
    score,
    detail: `Top 10 ${percent(top10)}; top 5 ${percent(top5)}; leverage notional ${percent(leverage)}.`,
    issue: score < 72 ? "Review concentration, top holdings, and leveraged exposure." : "",
    strength: score >= 82 ? "Position concentration is within current review bands." : "",
    href: "#risk"
  });
}

function thesisCoverageComponent(thesisRows = [], analysis = {}) {
  const totalValue = Number(analysis.overview?.totalValue || 0);
  const rows = thesisRows.length ? thesisRows : [];
  const valueFromRow = (row) => {
    const directValue = Number(row.marketValue || row.value || 0);
    if (directValue > 0) return directValue;
    const weight = Number(row.portfolioWeight || row.weight || 0);
    return totalValue > 0 && weight > 0 ? totalValue * weight : 0;
  };
  const coveredValue = rows.reduce((sum, row) => {
    const hasThesis = !/missing|none|n\/a/i.test(`${row.status || row.thesisStatus || ""}`) &&
      Boolean(row.whyOwned || row.confidenceLevel || row.nextReviewTrigger);
    return sum + (hasThesis ? valueFromRow(row) : 0);
  }, 0);
  const staleValue = rows.reduce((sum, row) => {
    const stale = /stale|missing|needs review/i.test(`${row.status || row.thesisStatus || ""}`);
    return sum + (stale ? valueFromRow(row) : 0);
  }, 0);
  const coverage = totalValue > 0 ? coveredValue / totalValue : 0;
  const staleWeight = totalValue > 0 ? staleValue / totalValue : 0;
  const score = coverage * 100 - penaltyAbove(staleWeight, 0.05, 45);
  return component({
    key: "thesisCoverage",
    score,
    detail: `${percent(coverage)} of portfolio value has documented thesis context; ${percent(staleWeight)} is stale or missing.`,
    issue: score < 72 ? "Document thesis, risks, and review triggers for large holdings." : "",
    strength: score >= 82 ? "Most portfolio value has usable thesis context." : "",
    href: "#thesis"
  });
}

function targetDisciplineComponent(targetPlan = {}) {
  const rows = Array.isArray(targetPlan.rows) ? targetPlan.rows.filter((row) => row.scope === "ticker") : [];
  if (!rows.length) {
    return component({
      key: "targetDiscipline",
      score: 42,
      detail: "No ticker-level target plan is saved yet.",
      issue: "Set targets so drift and cash deployment can be reviewed.",
      href: "#targets"
    });
  }
  const largestDrift = rows.reduce((max, row) => Math.max(max, Math.abs(Number(row.driftWeight || 0))), 0);
  const needsTarget = rows.filter((row) => /needs target/i.test(`${row.suggestedAction || ""}`)).length;
  const score = 96 - penaltyAbove(largestDrift, 0.025, 450) - Math.min(25, needsTarget * 4);
  return component({
    key: "targetDiscipline",
    score,
    detail: `${rows.length} ticker targets; largest drift ${percent(largestDrift)}.`,
    issue: score < 72 ? "Review large target drift and holdings that still need targets." : "",
    strength: score >= 82 ? "Targets are defined and drift is controlled." : "",
    href: "#targets"
  });
}

function alertLoadComponent(alerts = []) {
  const critical = alerts.filter((alert) => /critical/i.test(`${alert.severity} ${alert.actionCategory}`)).length;
  const review = alerts.filter((alert) => {
    const text = `${alert.severity} ${alert.actionCategory}`;
    return !/critical/i.test(text) && /warning|review|high/i.test(text);
  }).length;
  const score = 100 - Math.min(60, critical * 22 + review * 8);
  return component({
    key: "alertLoad",
    score,
    detail: `${critical} critical and ${review} review-level alert${review === 1 ? "" : "s"} visible.`,
    issue: score < 72 ? "Clear the highest-priority alert queue before adding new risk." : "",
    strength: score >= 82 ? "Alert queue is calm." : "",
    href: "#alerts"
  });
}

function marketFreshnessComponent(status = {}) {
  const statusText = `${status.status || ""} ${status.dataFreshness || ""} ${status.cacheStatus || ""}`.toLowerCase();
  let score = 48;
  if (/connected|live/.test(statusText)) score = 94;
  else if (/cached/.test(statusText)) score = 82;
  else if (/partial/.test(statusText)) score = 66;
  else if (/stale/.test(statusText)) score = 46;
  else if (/rate|error/.test(statusText)) score = 34;
  else if (/mock|sample/.test(statusText)) score = 52;
  else if (/not configured/.test(statusText)) score = 44;
  return component({
    key: "marketFreshness",
    score,
    detail: status.label || status.status || "Market data not configured.",
    issue: score < 72 ? "Refresh or configure market data before relying on daily move context." : "",
    strength: score >= 82 ? "Market-data freshness is usable." : "",
    href: "#data-sources"
  });
}

function component({ key, score, detail, issue = "", strength = "", href = "#" }) {
  return {
    key,
    label: componentLabel(key),
    score: Math.round(Math.max(0, Math.min(100, Number(score) || 0))),
    weight: Math.round((COMPONENT_WEIGHTS[key] || 0) * 100),
    detail,
    issue,
    strength,
    href
  };
}

function nextActionsForComponents(components = []) {
  return components
    .filter((component) => component.issue)
    .sort(componentIssueRank)
    .map((component) => ({
      label: nextActionLabel(component.key),
      href: component.href,
      reason: component.issue
    }));
}

function componentIssueRank(a, b) {
  if (a.key === "dataTrust" && a.score < 72 && b.key !== "dataTrust") return -1;
  if (b.key === "dataTrust" && b.score < 72 && a.key !== "dataTrust") return 1;
  return a.score - b.score;
}

function componentLabel(key) {
  return {
    dataTrust: "Data trust",
    concentration: "Concentration",
    thesisCoverage: "Thesis coverage",
    targetDiscipline: "Target discipline",
    alertLoad: "Alert load",
    marketFreshness: "Market freshness"
  }[key] || key;
}

function nextActionLabel(key) {
  return {
    dataTrust: "Review import",
    concentration: "Review risk",
    thesisCoverage: "Open thesis",
    targetDiscipline: "Set targets",
    alertLoad: "Review alerts",
    marketFreshness: "Check sources"
  }[key] || "Review";
}

function healthLabel(score) {
  if (score >= 84) return "Strong";
  if (score >= 70) return "Usable";
  if (score >= 54) return "Needs review";
  return "Data weak";
}

function healthTone(score) {
  if (score >= 84) return "safe";
  if (score >= 70) return "monitor";
  if (score >= 54) return "warn";
  return "sample";
}

function healthSummary(score, issues = []) {
  if (score >= 84) return "Portfolio workflow is in good shape. Keep monitoring drift, source freshness, and new alerts.";
  if (score >= 70) return issues[0] || "Portfolio is usable, with a few review items.";
  if (score >= 54) return issues[0] || "Portfolio is loaded but needs review before relying on the brief.";
  return issues[0] || "Data coverage is too weak for a confident command brief.";
}

function penaltyAbove(value, threshold, scale) {
  return Math.max(0, Number(value || 0) - threshold) * scale;
}

function percent(value) {
  return `${Math.round((Number(value) || 0) * 1000) / 10}%`;
}
