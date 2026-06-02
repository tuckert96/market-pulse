import { evidenceScoreForGrade, signalActionCategory } from "./alphaEngine.js";
import { normalizeTicker } from "./portfolioSchema.js";
import { buildSeekingAlphaAiTickerSummaries } from "./seekingAlphaAi.js";

export const RECOMMENDATION_TYPES = Object.freeze([
  "investigate",
  "watch",
  "add to watchlist",
  "review position",
  "trim risk",
  "possible add",
  "possible exit/reduce",
  "stale data review"
]);

export const RECOMMENDATION_RANK_WEIGHTS = Object.freeze({
  confidenceScore: 0.22,
  impactScore: 0.18,
  recencyScore: 0.12,
  urgencyScore: 0.12,
  dataQualityScore: 0.1,
  riskAdjustedFitScore: 0.08,
  ownershipRelevanceScore: 0.05,
  sourceFreshnessScore: 0.04,
  alertSeverityScore: 0.03,
  priceMovementScore: 0.03,
  concentrationRiskScore: 0.03
});

export const DEFAULT_RECOMMENDATION_FILTERS = Object.freeze([
  "all",
  "owned",
  "watchlist",
  "risk",
  "opportunities",
  "data-issues",
  "recent",
  "high-confidence"
]);

export function buildAlphaRecommendations({
  analysis = {},
  alphaSignals = [],
  tickerSignals = [],
  alerts = [],
  targetPlan = {},
  thesisRows = [],
  watchlistIdeas = [],
  calendarEvents = [],
  seekingAlphaAiRecords = [],
  marketDataStatus = {},
  providerReadiness = {},
  uiState = "SAMPLE_MODE",
  asOf = new Date().toISOString()
} = {}) {
  const holdingsByTicker = summarizeHoldingsByTicker(analysis.holdings || []);
  const watchlistByTicker = new Map((watchlistIdeas || []).map((idea) => [normalizeTicker(idea.ticker), idea]));
  const seekingAlphaAiByTicker = buildSeekingAlphaAiTickerSummaries(seekingAlphaAiRecords, [
    ...holdingsByTicker.keys(),
    ...watchlistByTicker.keys()
  ], { now: asOf });
  const realPortfolio = isRealRecommendationPortfolio(uiState);
  const context = { holdingsByTicker, watchlistByTicker, seekingAlphaAiByTicker, asOf, uiState, realPortfolio };
  const recommendations = [
    ...recommendationsFromAlphaSignals(alphaSignals, context),
    ...recommendationsFromTickerSignals(tickerSignals, context),
    ...recommendationsFromSeekingAlphaAiRecords(seekingAlphaAiByTicker, context),
    ...recommendationsFromAlerts(alerts, context),
    ...recommendationsFromTargetPlan(targetPlan, context),
    ...recommendationsFromThesisRows(thesisRows, context),
    ...recommendationsFromCalendarEvents(calendarEvents, context),
    ...recommendationsFromDataSources({ marketDataStatus, providerReadiness, asOf, uiState })
  ];

  return dedupeRecommendations(recommendations)
    .map((recommendation) => {
      const rankMath = recommendationRankBreakdown(recommendation);
      return {
        ...recommendation,
        compositeRankScore: rankMath.finalScore,
        rankMath,
        whyThisRank: explainRecommendationRank(recommendation)
      };
    })
    .sort((a, b) =>
      b.compositeRankScore - a.compositeRankScore ||
      b.impactScore - a.impactScore ||
      b.recencyScore - a.recencyScore ||
      a.title.localeCompare(b.title)
    )
    .slice(0, 80);
}

export function scoreRecommendationRank(recommendation = {}, weights = RECOMMENDATION_RANK_WEIGHTS) {
  return recommendationRankBreakdown(recommendation, weights).finalScore;
}

export function recommendationRankBreakdown(recommendation = {}, weights = RECOMMENDATION_RANK_WEIGHTS) {
  const ownershipRelevance = recommendation.ownershipRelevanceScore ?? ownershipRelevanceScoreFromStatus(recommendation.relatedHoldingsStatus);
  const sourceFreshness = recommendation.sourceFreshnessScore ?? sourceFreshnessScore(recommendation.sourceFreshness);
  const alertSeverity = recommendation.alertSeverityScore ?? severityScore(recommendation.alertSeverity || recommendation.severity);
  const priceMovement = recommendation.priceMovementScore ?? 0.5;
  const concentrationRisk = recommendation.concentrationRiskScore ?? recommendation.riskScore;
  const components = [
    rankComponent("confidenceScore", "Confidence", recommendation.confidenceScore, weights.confidenceScore),
    rankComponent("impactScore", "Impact", recommendation.impactScore, weights.impactScore),
    rankComponent("recencyScore", "Recency", recommendation.recencyScore, weights.recencyScore),
    rankComponent("urgencyScore", "Urgency", recommendation.urgencyScore, weights.urgencyScore),
    rankComponent("dataQualityScore", "Data quality", recommendation.dataQualityScore, weights.dataQualityScore),
    rankComponent("riskAdjustedFitScore", "Risk-adjusted fit", recommendation.riskAdjustedFitScore, weights.riskAdjustedFitScore),
    rankComponent("ownershipRelevanceScore", "Ownership relevance", ownershipRelevance, weights.ownershipRelevanceScore),
    rankComponent("sourceFreshnessScore", "Source freshness", sourceFreshness, weights.sourceFreshnessScore),
    rankComponent("alertSeverityScore", "Alert severity", alertSeverity, weights.alertSeverityScore),
    rankComponent("priceMovementScore", "Price movement", priceMovement, weights.priceMovementScore),
    rankComponent("concentrationRiskScore", "Concentration risk", concentrationRisk, weights.concentrationRiskScore)
  ];
  const rawScore = components.reduce((total, component) => total + component.points, 0);
  const weakDataPenalty = score01(recommendation.dataQualityScore) < 0.35 ? 6 : 0;
  const stalePenalty = /stale|missing|not configured|mock|sample|error/i.test(String(recommendation.sourceFreshness || "")) ? 2 : 0;
  const penalties = [
    weakDataPenalty ? { key: "weakDataPenalty", label: "Weak data penalty", points: -weakDataPenalty } : null,
    stalePenalty ? { key: "staleSourcePenalty", label: "Stale/source penalty", points: -stalePenalty } : null
  ].filter(Boolean);
  const penaltyTotal = penalties.reduce((total, penalty) => total + Math.abs(penalty.points), 0);
  const finalScore = Math.max(0, Math.min(100, Math.round(rawScore - penaltyTotal)));
  return {
    formula: "weighted drivers minus weak/stale data penalties",
    components,
    penalties,
    rawScore,
    penaltyTotal,
    finalScore,
    topContributors: [...components].sort((a, b) => b.points - a.points).slice(0, 4)
  };
}

function rankComponent(key, label, score, weight) {
  const normalizedScore = score01(score);
  const normalizedWeight = Number(weight) || 0;
  return {
    key,
    label,
    score: normalizedScore,
    weight: normalizedWeight,
    points: normalizedScore * normalizedWeight * 100
  };
}

export function filterAlphaRecommendations(recommendations = [], filter = "all") {
  const normalized = DEFAULT_RECOMMENDATION_FILTERS.includes(filter) ? filter : "all";
  if (normalized === "all") return recommendations;
  return recommendations.filter((recommendation) => {
    if (normalized === "owned") return recommendation.relatedHoldingsStatus === "owned";
    if (normalized === "watchlist") return recommendation.relatedHoldingsStatus === "watchlist";
    if (normalized === "risk") return ["trim risk", "possible exit/reduce", "review position", "stale data review"].includes(recommendation.recommendationType) || recommendation.riskScore >= 0.65;
    if (normalized === "opportunities") return ["possible add", "add to watchlist", "investigate", "watch"].includes(recommendation.recommendationType);
    if (normalized === "data-issues") return recommendation.recommendationType === "stale data review" || recommendation.dataQualityScore < 0.45 || (recommendation.missingWeakSignals || []).length >= 2;
    if (normalized === "recent") return recommendation.recencyScore >= 0.72;
    if (normalized === "high-confidence") return recommendation.confidenceScore >= 0.68;
    return true;
  });
}

export function explainRecommendationRank(recommendation = {}) {
  const drivers = [];
  if (recommendation.portfolioWeight >= 0.1 && recommendation.ticker && recommendation.relatedHoldingsStatus === "sample") {
    drivers.push(`Sample context because ${recommendation.ticker} is ${percentLabel(recommendation.portfolioWeight)} of the sample portfolio. Import holdings before treating this as Tucker-specific.`);
  } else if (recommendation.portfolioWeight >= 0.1 && recommendation.ticker) {
    drivers.push(`High impact because ${recommendation.ticker} is ${percentLabel(recommendation.portfolioWeight)} of the active portfolio.`);
  }
  if (recommendation.impactScore >= 0.72) {
    drivers.push(recommendation.ticker
      ? `High impact because ${recommendation.ticker} has meaningful portfolio/watchlist exposure.`
      : "High impact because this affects portfolio-level risk or source trust.");
  }
  if (recommendation.confidenceScore >= 0.68) drivers.push("Confidence is elevated because multiple local signal layers agree.");
  if (recommendation.recencyScore >= 0.72) drivers.push("Recent because the signal or alert timestamp is fresh.");
  if (recommendation.urgencyScore >= 0.7) drivers.push("Urgency is elevated because the item needs review before position sizing changes.");
  if (recommendation.alertSeverityScore >= 0.7) drivers.push("Alert severity increases the rank because a local rule marked this for review.");
  if (recommendation.priceMovementScore >= 0.66) drivers.push("Price movement increases review priority, using provider quote data when available.");
  if (recommendation.concentrationRiskScore >= 0.66) drivers.push("Concentration risk increases the rank because position size, theme, or leverage is elevated.");
  if (recommendation.sourceFreshnessScore >= 0.7) drivers.push("Source freshness supports the rank because the relevant data is live, cached, imported, or recent.");
  if (recommendation.dataQualityScore < 0.45) drivers.push("Lower confidence because data is missing, stale, mock, or weakly sourced.");
  if (recommendation.sourceFreshnessScore < 0.45) drivers.push("Lower rank because one or more source labels are sample, stale, missing, not configured, or erroring.");
  if (recommendation.riskScore >= 0.7) drivers.push("Risk raises review priority because exposure, leverage, target drift, or concentration is elevated.");
  if (!drivers.length) drivers.push("Rank is moderate because the available inputs are useful but not urgent.");
  return uniqueStrings(drivers);
}

function recommendationsFromAlphaSignals(alphaSignals, context) {
  return (alphaSignals || []).map((signal) => {
    const ticker = normalizeTicker(signal.primaryTicker || signal.affectedTickers?.[0]);
    const holding = context.holdingsByTicker.get(ticker);
    const watchlistIdea = context.watchlistByTicker.get(ticker);
    const actionCategory = signalActionCategory(signal);
    const recommendationType = recommendationTypeForAlphaSignal(signal, actionCategory, holding, watchlistIdea);
    const confidenceScore = score01(signal.confidenceScore);
    const impactScore = score01((score01(signal.materialityScore) * 0.45) + (score01(signal.portfolioRelevanceScore) * 0.35) + (Math.min(1, Number(signal.affectedWeight || 0) * 4) * 0.2));
    const urgencyScore = urgencyForAction(actionCategory, signal.actionabilityLevel);
    const dataQualityScore = evidenceScoreForGrade(signal.evidenceGrade);
    const riskScore = riskForHolding(holding, signal);
    const sourceFreshness = sourceFreshnessForSignal(signal, context.asOf);

    return baseRecommendation({
      id: `recommendation:alpha:${signal.id}`,
      ticker,
      recommendationType,
      title: `${ticker || "Portfolio"}: ${signal.headline}`,
      summary: signal.whyThisMattersToTucker || signal.actionabilityReason || signal.summary,
      confidenceScore,
      recencyScore: recencyScore(signal.detectedAt || signal.timestamp, context.asOf),
      impactScore,
      urgencyScore,
      dataQualityScore,
      riskScore,
      portfolioWeight: holding?.portfolioWeight || 0,
      ownershipRelevanceScore: ownershipRelevanceScore(holding, watchlistIdea, context.realPortfolio),
      sourceFreshnessScore: sourceFreshnessScore(sourceFreshness),
      alertSeverityScore: 0,
      priceMovementScore: priceMovementScoreFromAlphaSignal(signal),
      concentrationRiskScore: riskScore,
      riskAdjustedFitScore: riskAdjustedFit({ holding, watchlistIdea, recommendationType, riskScore, dataQualityScore, realPortfolio: context.realPortfolio }),
      supportingSignals: [
        `${actionCategory}: ${signal.actionabilityReason || "review evidence"}`,
        `Evidence grade ${signal.evidenceGrade}`,
        signal.priceAction?.status ? `Price action: ${signal.priceAction.status}` : "",
        signal.thesisImpact ? `Thesis impact: ${signal.thesisImpact}` : ""
      ].filter(Boolean),
      missingWeakSignals: [
        ...(signal.missingEvidence || []).slice(0, 3),
        dataQualityScore < 0.45 ? `Evidence quality is ${signal.evidenceGrade}` : "",
        signal.isStaleSignal ? "Signal is stale" : ""
      ].filter(Boolean),
      sourceFreshness,
      relatedHoldingsStatus: relationshipStatus(holding, watchlistIdea, context),
      sourceModes: [signal.sourceName || "Alpha Engine", sourceFreshness],
      sourceIds: [signal.id],
      href: ticker ? `#/ticker/${ticker}` : "#alpha",
      createdAt: signal.detectedAt || signal.timestamp,
      updatedAt: signal.detectedAt || signal.timestamp,
      rankDrivers: [
        `Impact ${percentLabel(impactScore)}`,
        `confidence ${percentLabel(confidenceScore)}`,
        `recency ${percentLabel(recencyScore(signal.detectedAt || signal.timestamp, context.asOf))}`
      ]
    });
  });
}

function recommendationsFromTickerSignals(tickerSignals, context) {
  return (tickerSignals || [])
    .filter((signal) => Number(signal.combinedScore) >= 48 || signal.portfolioOwnershipFlag || signal.watchlistFlag)
    .map((signal) => {
      const ticker = normalizeTicker(signal.ticker);
      const holding = context.holdingsByTicker.get(ticker);
      const watchlistIdea = context.watchlistByTicker.get(ticker);
      const combined = (Number(signal.combinedScore) || 0) / 100;
      const quantScore = score01((Number(signal.institutionalQuantScore) || 0) / 100);
      const quantConfidenceScore = score01((Number(signal.institutionalQuantConfidenceScore) || 0) / 100);
      const quantEvidenceScore = quantEvidenceQualityScore(signal);
      const dataQualityScore = Math.max(tickerSignalDataQuality(signal), quantEvidenceScore);
      const riskScore = score01(signal.concentrationRiskScore);
      const holdingQualityScore = score01((Number(signal.holdingQualityScore) || 0) / 100 || quantScore);
      const recommendationType = recommendationTypeForTickerSignal(signal, holding, watchlistIdea, riskScore, holdingQualityScore, dataQualityScore);
      const sourceFreshness = tickerSignalFreshness(signal);
      const priceMovementScore = priceMovementScoreForTickerSignal(signal);
      const portfolioWeight = Number(signal.portfolioWeight ?? holding?.portfolioWeight ?? 0) || 0;
      const riskAdjustedFitScore = riskAdjustedFit({ holding, watchlistIdea, recommendationType, riskScore, dataQualityScore, realPortfolio: context.realPortfolio });

      return baseRecommendation({
        id: `recommendation:ticker-signal:${ticker}`,
        ticker,
        recommendationType,
        title: `${ticker}: ${signal.topHeadline || "ticker signal review"}`,
        summary: signal.explanation || "Transparent local review-priority score. Review drivers before changing exposure.",
        confidenceScore: score01(signal.confidenceScore),
        recencyScore: marketDataRecencyScore(signal, context.asOf),
        impactScore: score01(score01(signal.materialityScore) * 0.5 + Math.min(1, Number(signal.portfolioWeight || 0) * 4) * 0.3 + combined * 0.2),
        urgencyScore: signal.actionCategory === "Monitor" ? 0.56 : combined >= 0.75 ? 0.62 : 0.36,
        dataQualityScore,
        riskScore,
        portfolioWeight,
        ownershipRelevanceScore: ownershipRelevanceScore(holding, watchlistIdea, context.realPortfolio),
        sourceFreshnessScore: sourceFreshnessScore(sourceFreshness),
        alertSeverityScore: 0,
        priceMovementScore,
        concentrationRiskScore: riskScore,
        riskAdjustedFitScore,
        supportingSignals: [
          `${signal.combinedScore}/100 review-priority score; not a quality score or trade instruction`,
          signal.sourceTrustCapReason && Number.isFinite(Number(signal.rawConfluenceScore))
            ? `Source trust guardrail capped raw review-priority score ${Math.round(Number(signal.rawConfluenceScore) * 100)}/100 to ${signal.combinedScore}/100`
            : "",
          signal.holdingQualityScore ? `Holding quality context ${Math.round(signal.holdingQualityScore)}/100: ${signal.holdingQualityLabel || "quality context"}` : "",
          signal.institutionalQuantScore ? `Institutional Quant Lens ${Math.round(signal.institutionalQuantScore)}/100: quality context, not rank urgency (${signal.institutionalQuantLabel || "factor review"})` : "",
          signal.institutionalQuantDataCoverageLabel ? `Quant data coverage: ${signal.institutionalQuantDataCoverageLabel}` : "",
          signal.institutionalQuantPeerLabel ? `Quant peer context: ${signal.institutionalQuantPeerLabel} in ${signal.institutionalQuantPeerGroup || "tracked peer group"}` : "",
          signal.institutionalQuantScoreTrendLabel ? `Quant score trend: ${signal.institutionalQuantScoreTrendLabel}` : "",
          ...(signal.institutionalQuantStrengths || []).slice(0, 2),
          Number.isFinite(Number(signal.marketDataDailyChangePercent)) ? `Price move: ${signedPercentLabel(signal.marketDataDailyChangePercent)} from ${signal.marketDataSourceLabel || signal.marketDataLabel || "market data"}` : "",
          ...(signal.whyScoreIsHigh || []).slice(0, 3),
          signal.marketDataLabel || signal.sourceLabel || ""
        ].filter(Boolean),
        missingWeakSignals: [
          ...(signal.institutionalQuantMissingData || []).slice(0, 2).map((item) => `Quant lens missing ${item}`),
          ...(signal.institutionalQuantDataSufficiencyWarnings || []).slice(0, 2),
          signal.institutionalQuantPeerWarning || "",
          signal.sourceTrustCapReason || "",
          ...(signal.missingData || []).slice(0, 3),
          ...(signal.warnings || []).filter((warning) => /mock|not live|missing|stale/i.test(warning)).slice(0, 2)
        ],
        sourceFreshness,
        relatedHoldingsStatus: relationshipStatus(holding, watchlistIdea, context),
        sourceModes: [signal.sourceLabel || "Ticker signal", signal.institutionalQuantSourceFreshness || "", signal.marketDataMode || signal.sourceMode || "local"].filter(Boolean),
        sourceIds: [signal.id],
        href: ticker ? `#/ticker/${ticker}` : "#market-intelligence",
        createdAt: signal.updatedAt || context.asOf,
        updatedAt: signal.updatedAt || context.asOf
      });
    });
}

function recommendationsFromSeekingAlphaAiRecords(seekingAlphaAiByTicker = new Map(), context = {}) {
  return [...seekingAlphaAiByTicker.entries()]
    .filter(([, summary]) => summary?.recordCount)
    .map(([ticker, summary]) => {
      const holding = context.holdingsByTicker.get(ticker);
      const watchlistIdea = context.watchlistByTicker.get(ticker);
      const staleOnly = summary.staleCount === summary.recordCount;
      const riskHeavy = summary.bearishPoints.length > summary.bullishPoints.length || summary.riskScore >= 0.58;
      const ownedReviewContext = Boolean(holding && summary.bearishPoints.length);
      const dataQualityScore = staleOnly ? 0.34 : summary.validationWarnings.length ? 0.48 : 0.58;
      const confidenceScore = score01(Math.min(0.58, 0.4 + (staleOnly ? 0 : 0.08) + Math.min(0.06, summary.recordCount * 0.02) + (summary.ratingMentions.length ? 0.03 : 0) - (summary.validationWarnings.length ? 0.04 : 0)));
      const riskScore = holding ? Math.max(riskForHolding(holding), summary.riskScore) : summary.riskScore;
      const recommendationType = staleOnly
        ? "stale data review"
        : holding && (riskHeavy || ownedReviewContext)
          ? "review position"
          : watchlistIdea && summary.supportScore >= 0.58
            ? "watch"
            : holding
              ? "watch"
              : "investigate";
      const sourceFreshness = staleOnly ? "stale Seeking Alpha AI personal import" : "imported Seeking Alpha AI personal import";
      const latestTimestamp = summary.latestRecord?.importedAt || summary.latestRecord?.reportDate || context.asOf;

      return baseRecommendation({
        id: `recommendation:seeking-alpha-ai:${ticker}`,
        ticker,
        recommendationType,
        title: `${ticker}: Seeking Alpha AI context ${staleOnly ? "needs freshness review" : "is saved"}`,
        summary: `${summary.summary} Personal imported research context only; verify against primary sources and structured data before changing exposure.`,
        confidenceScore,
        recencyScore: recencyScore(latestTimestamp, context.asOf),
        impactScore: score01((holding ? Math.min(1, Number(holding.portfolioWeight || 0) * 4) : watchlistIdea ? 0.42 : 0.28) + Math.min(0.14, summary.recordCount * 0.025)),
        urgencyScore: staleOnly ? 0.4 : holding && riskHeavy ? 0.58 : 0.34,
        dataQualityScore,
        riskScore,
        portfolioWeight: holding?.portfolioWeight || 0,
        ownershipRelevanceScore: ownershipRelevanceScore(holding, watchlistIdea, context.realPortfolio),
        sourceFreshnessScore: sourceFreshnessScore(sourceFreshness),
        alertSeverityScore: staleOnly ? 0.38 : riskHeavy ? 0.48 : 0.28,
        priceMovementScore: 0.5,
        concentrationRiskScore: riskScore,
        riskAdjustedFitScore: riskAdjustedFit({ holding, watchlistIdea, recommendationType, riskScore, dataQualityScore, realPortfolio: context.realPortfolio }),
        supportingSignals: [
          summary.summary,
          ...summary.bullishPoints.slice(0, 2).map((point) => `Support: ${point}`),
          ...summary.ratingMentions.slice(0, 2).map((rating) => `Rating mention: ${rating}`)
        ],
        missingWeakSignals: [
          ...summary.bearishPoints.slice(0, 2).map((point) => `Risk note: ${point}`),
          staleOnly ? "All saved Seeking Alpha AI reports are stale." : "",
          ...summary.validationWarnings.slice(0, 2),
          "Personal import only; not live Seeking Alpha data and not independently verified by the app."
        ].filter(Boolean),
        sourceFreshness,
        relatedHoldingsStatus: relationshipStatus(holding, watchlistIdea, context),
        sourceModes: ["Seeking Alpha AI personal import", ...summary.sourceModes, ...summary.sourceTypes].filter(Boolean),
        sourceIds: summary.records.map((record) => record.id),
        href: `#/ticker/${ticker}`,
        createdAt: latestTimestamp,
        updatedAt: summary.latestRecord?.importedAt || context.asOf,
        rankDrivers: [
          `SA AI records ${summary.recordCount}`,
          staleOnly ? "stale freshness penalty" : "imported personal context",
          `${Math.round(summary.reviewPriorityScore * 100)}/100 context relevance`
        ]
      });
    });
}

function recommendationsFromAlerts(alerts, context) {
  return (alerts || [])
    .filter((alert) => ["critical", "warning", "high", "watch"].includes(String(alert.severity || "").toLowerCase()) || Number(alert.score) >= 70)
    .map((alert) => {
      const ticker = normalizeTicker(alert.ticker);
      const holding = context.holdingsByTicker.get(ticker);
      const watchlistIdea = context.watchlistByTicker.get(ticker);
      const riskScore = alert.severity === "critical" ? 0.92 : alert.severity === "warning" || alert.severity === "high" ? 0.74 : 0.5;
      const dataIssue = /data-source|stale|disconnected|not-live|error/i.test(`${alert.type} ${alert.ruleId} ${alert.title}`);
      const alertSeverityScore = severityScore(alert.severity);
      return baseRecommendation({
        id: `recommendation:alert:${alert.id}`,
        ticker,
        recommendationType: dataIssue ? "stale data review" : riskScore >= 0.72 ? "review position" : "watch",
        title: alert.title || "Alert needs review",
        summary: alert.detail || "Local alert engine item. Review before changing position size.",
        confidenceScore: dataIssue ? 0.55 : 0.66,
        recencyScore: recencyScore(alert.createdAt || context.asOf, context.asOf),
        impactScore: score01((Number(alert.score) || 50) / 100),
        urgencyScore: riskScore,
        dataQualityScore: dataIssue ? 0.45 : 0.62,
        riskScore,
        portfolioWeight: holding?.portfolioWeight || 0,
        ownershipRelevanceScore: ownershipRelevanceScore(holding, watchlistIdea, context.realPortfolio),
        sourceFreshnessScore: sourceFreshnessScore(dataIssue ? "source needs review" : "local alert"),
        alertSeverityScore,
        priceMovementScore: 0.5,
        concentrationRiskScore: riskScore,
        riskAdjustedFitScore: riskAdjustedFit({ holding, watchlistIdea, recommendationType: dataIssue ? "stale data review" : "review position", riskScore, dataQualityScore: dataIssue ? 0.45 : 0.62, realPortfolio: context.realPortfolio }),
        supportingSignals: [`${alert.actionCategory || "Review"} alert`, alert.ruleId || alert.type || "local rule"].filter(Boolean),
        missingWeakSignals: dataIssue ? ["Price-sensitive output may be stale, missing, or not configured."] : [],
        sourceFreshness: dataIssue ? "source needs review" : "local alert",
        relatedHoldingsStatus: relationshipStatus(holding, watchlistIdea, context),
        sourceModes: ["local alert engine"],
        sourceIds: [alert.id],
        href: ticker ? `#/ticker/${ticker}` : "#alerts",
        createdAt: alert.createdAt || context.asOf,
        updatedAt: alert.createdAt || context.asOf
      });
    });
}

function recommendationsFromTargetPlan(targetPlan, context) {
  return (targetPlan.rows || [])
    .filter((row) => row.scope === "ticker" && Math.abs(Number(row.driftWeight) || 0) >= 0.015 && Math.abs(Number(row.driftValue) || 0) >= 100)
    .slice(0, 10)
    .map((row) => {
      const ticker = normalizeTicker(row.key);
      const holding = context.holdingsByTicker.get(ticker);
      const watchlistIdea = context.watchlistByTicker.get(ticker);
      const overweight = Number(row.driftValue) > 0;
      const riskScore = score01(Math.min(1, Math.abs(Number(row.driftWeight) || 0) / 0.08) * 0.7 + (holding?.isLeveragedEtf ? 0.2 : 0));
      return baseRecommendation({
        id: `recommendation:target-drift:${ticker}`,
        ticker,
        recommendationType: overweight ? "trim risk" : "possible add",
        title: `${ticker} is ${overweight ? "above" : "below"} target`,
        summary: `${ticker} is ${row.status || (overweight ? "overweight" : "underweight")} by ${currencyLabel(Math.abs(Number(row.driftValue) || 0))}. This is a review suggestion, not a trade order.`,
        confidenceScore: 0.72,
        recencyScore: 0.7,
        impactScore: score01(Math.min(1, Math.abs(Number(row.driftWeight) || 0) / 0.08)),
        urgencyScore: overweight ? 0.58 : 0.45,
        dataQualityScore: 0.72,
        riskScore,
        portfolioWeight: holding?.portfolioWeight || 0,
        ownershipRelevanceScore: ownershipRelevanceScore(holding, watchlistIdea, context.realPortfolio),
        sourceFreshnessScore: sourceFreshnessScore("local target allocation"),
        alertSeverityScore: 0.45,
        priceMovementScore: 0.5,
        concentrationRiskScore: riskScore,
        riskAdjustedFitScore: riskAdjustedFit({ holding, watchlistIdea, recommendationType: overweight ? "trim risk" : "possible add", riskScore, dataQualityScore: 0.72, realPortfolio: context.realPortfolio }),
        supportingSignals: [
          `Current ${percentLabel(row.currentWeight)} vs target ${percentLabel(row.targetWeight)}`,
          row.suggestedAction ? `Action label: ${row.suggestedAction}` : ""
        ].filter(Boolean),
        missingWeakSignals: row.notes === "No saved target yet." ? ["No saved target notes yet."] : [],
        sourceFreshness: "local target allocation",
        relatedHoldingsStatus: relationshipStatus(holding, watchlistIdea, context),
        sourceModes: ["local target plan"],
        sourceIds: [row.id || ticker],
        href: ticker ? `#/ticker/${ticker}` : "#targets",
        createdAt: context.asOf,
        updatedAt: context.asOf
      });
    });
}

function recommendationsFromThesisRows(thesisRows, context) {
  return (thesisRows || [])
    .filter((row) => row.missing || row.stale || row.aboveTargetWithWeakOrStale || row.leveragedGuardrailMissing || row.contradicted || row.alphaImpact?.breaking?.length || row.alphaImpact?.weakening?.length)
    .map((row) => {
      const ticker = normalizeTicker(row.ticker);
      const holding = context.holdingsByTicker.get(ticker);
      const watchlistIdea = context.watchlistByTicker.get(ticker);
      const critical = Boolean(row.alphaImpact?.breaking?.length || row.contradicted);
      const riskScore = score01((row.aboveTargetWithWeakOrStale ? 0.3 : 0) + (row.leveragedGuardrailMissing ? 0.28 : 0) + (row.stale ? 0.18 : 0) + (row.missing ? 0.16 : 0) + (critical ? 0.25 : 0));
      return baseRecommendation({
        id: `recommendation:thesis:${ticker}`,
        ticker,
        recommendationType: critical ? "possible exit/reduce" : "review position",
        title: `${ticker} thesis needs review`,
        summary: (row.reviewReasons || []).slice(0, 2).join(" ") || "Thesis tracker flagged this holding for review.",
        confidenceScore: 0.66,
        recencyScore: row.stale ? 0.42 : 0.62,
        impactScore: score01(Math.min(1, Number(row.portfolioWeight || 0) * 4)),
        urgencyScore: critical ? 0.88 : row.aboveTargetWithWeakOrStale ? 0.72 : 0.58,
        dataQualityScore: row.missing ? 0.38 : row.stale ? 0.5 : 0.66,
        riskScore,
        portfolioWeight: holding?.portfolioWeight || Number(row.portfolioWeight || 0) || 0,
        ownershipRelevanceScore: ownershipRelevanceScore(holding, watchlistIdea, context.realPortfolio),
        sourceFreshnessScore: sourceFreshnessScore(row.stale ? "stale thesis" : "local thesis tracker"),
        alertSeverityScore: critical ? 0.86 : 0.58,
        priceMovementScore: 0.5,
        concentrationRiskScore: riskScore,
        riskAdjustedFitScore: riskAdjustedFit({ holding, watchlistIdea, recommendationType: critical ? "possible exit/reduce" : "review position", riskScore, dataQualityScore: row.missing ? 0.38 : 0.66, realPortfolio: context.realPortfolio }),
        supportingSignals: (row.reviewReasons || []).slice(0, 4),
        missingWeakSignals: [
          row.missing ? "No thesis documented." : "",
          row.stale ? "Last review is stale or missing." : "",
          row.leveragedGuardrailMissing ? "Leveraged guardrail notes missing." : ""
        ].filter(Boolean),
        sourceFreshness: row.stale ? "stale thesis" : "local thesis tracker",
        relatedHoldingsStatus: relationshipStatus(holding, watchlistIdea, context),
        sourceModes: ["local thesis tracker"],
        sourceIds: [ticker],
        href: ticker ? `#/ticker/${ticker}` : "#thesis",
        createdAt: row.lastReviewedDate || context.asOf,
        updatedAt: context.asOf
      });
    });
}

function recommendationsFromCalendarEvents(calendarEvents, context) {
  return (calendarEvents || [])
    .filter((event) => Number(event.daysUntil) <= 14 || event.importance === "high")
    .slice(0, 10)
    .map((event) => {
      const ticker = normalizeTicker(event.ticker || event.tickers?.[0]);
      const holding = context.holdingsByTicker.get(ticker);
      const watchlistIdea = context.watchlistByTicker.get(ticker);
      const high = event.importance === "high";
      return baseRecommendation({
        id: `recommendation:event:${event.id}`,
        ticker,
        recommendationType: "watch",
        title: event.title || `${ticker || "Portfolio"} event review`,
        summary: event.summary || "Upcoming event may deserve a thesis or sizing review.",
        confidenceScore: event.sourceMode === "live" ? 0.72 : event.sourceMode === "mock" ? 0.34 : 0.56,
        recencyScore: event.daysUntil === 0 ? 1 : score01(1 - Math.min(30, Math.max(0, Number(event.daysUntil) || 0)) / 30),
        impactScore: score01((holding ? Math.min(1, holding.portfolioWeight * 4) : 0.35) + (high ? 0.2 : 0)),
        urgencyScore: event.daysUntil <= 3 ? 0.78 : event.daysUntil <= 14 ? 0.58 : 0.34,
        dataQualityScore: event.sourceMode === "mock" ? 0.32 : event.sourceMode === "live" ? 0.72 : 0.56,
        riskScore: holding ? riskForHolding(holding) : 0.3,
        portfolioWeight: holding?.portfolioWeight || 0,
        ownershipRelevanceScore: ownershipRelevanceScore(holding, watchlistIdea, context.realPortfolio),
        sourceFreshnessScore: sourceFreshnessScore(event.sourceMode === "mock" ? "mock event" : event.sourceMode || "local event"),
        alertSeverityScore: high ? 0.62 : 0.38,
        priceMovementScore: 0.5,
        concentrationRiskScore: holding ? riskForHolding(holding) : 0.3,
        riskAdjustedFitScore: riskAdjustedFit({ holding, watchlistIdea, recommendationType: "watch", riskScore: holding ? riskForHolding(holding) : 0.3, dataQualityScore: event.sourceMode === "mock" ? 0.32 : 0.56, realPortfolio: context.realPortfolio }),
        supportingSignals: [`${event.typeLabel || event.eventType} on ${event.date || "unknown date"}`, event.importance ? `${event.importance} importance` : ""].filter(Boolean),
        missingWeakSignals: event.sourceMode === "mock" ? ["Sample event date. Verify before relying on timing."] : [],
        sourceFreshness: event.sourceMode === "mock" ? "mock event" : event.sourceMode || "local event",
        relatedHoldingsStatus: relationshipStatus(holding, watchlistIdea, context),
        sourceModes: [event.sourceLabel || event.sourceMode || "event calendar"],
        sourceIds: [event.id],
        href: ticker ? `#/ticker/${ticker}` : "#calendar",
        createdAt: event.detectedAt || context.asOf,
        updatedAt: event.detectedAt || context.asOf
      });
    });
}

function recommendationsFromDataSources({ marketDataStatus = {}, providerReadiness = {}, asOf, uiState }) {
  const status = String(marketDataStatus.status || marketDataStatus.label || providerReadiness.message || "").toLowerCase();
  if (!/stale|error|not configured|mock|sample|missing|failed/.test(status)) return [];
  const dataQualityScore = /error|failed/.test(status) ? 0.2 : /stale/.test(status) ? 0.32 : /mock|sample|not configured|missing/.test(status) ? 0.38 : 0.52;
  return [baseRecommendation({
    id: "recommendation:data-source:market-data",
    ticker: "",
    recommendationType: "stale data review",
    title: "Market data source needs review",
    summary: marketDataStatus.detail || providerReadiness.message || "Market data is missing, stale, sample, or not configured. Price-sensitive ranks should be treated carefully.",
    confidenceScore: 0.58,
    recencyScore: 0.72,
    impactScore: uiState?.startsWith?.("IMPORTED") ? 0.62 : 0.42,
    urgencyScore: /error|failed|stale/.test(status) ? 0.72 : 0.38,
    dataQualityScore,
    riskScore: 0.44,
    portfolioWeight: 0,
    ownershipRelevanceScore: 0.5,
    sourceFreshnessScore: sourceFreshnessScore(marketDataStatus.status || "not configured"),
    alertSeverityScore: /error|failed|stale/.test(status) ? 0.72 : 0.34,
    priceMovementScore: 0.5,
    concentrationRiskScore: 0.44,
    riskAdjustedFitScore: 0.5,
    supportingSignals: [marketDataStatus.status || "source status", marketDataStatus.providerLabel || providerReadiness.marketDataConfig?.selectedLabel || ""].filter(Boolean),
    missingWeakSignals: ["Live/cached quote status may be unavailable or stale."],
    sourceFreshness: marketDataStatus.status || "not configured",
    relatedHoldingsStatus: "portfolio",
    sourceModes: ["data-source status"],
    sourceIds: ["market-data-status"],
    href: "#data-sources",
    createdAt: asOf,
    updatedAt: asOf
  })];
}

function baseRecommendation(input) {
  const type = RECOMMENDATION_TYPES.includes(input.recommendationType) ? input.recommendationType : "investigate";
  return {
    id: input.id,
    ticker: normalizeTicker(input.ticker),
    recommendationType: type,
    title: input.title || "Review recommendation",
    summary: input.summary || "Review the supporting and missing data before changing portfolio exposure.",
    confidenceScore: score01(input.confidenceScore),
    recencyScore: score01(input.recencyScore),
    impactScore: score01(input.impactScore),
    urgencyScore: score01(input.urgencyScore),
    dataQualityScore: score01(input.dataQualityScore),
    riskScore: score01(input.riskScore),
    riskAdjustedFitScore: score01(input.riskAdjustedFitScore),
    ownershipRelevanceScore: score01(input.ownershipRelevanceScore ?? ownershipRelevanceScoreFromStatus(input.relatedHoldingsStatus)),
    sourceFreshnessScore: score01(input.sourceFreshnessScore ?? sourceFreshnessScore(input.sourceFreshness)),
    alertSeverityScore: score01(input.alertSeverityScore),
    priceMovementScore: input.priceMovementScore === undefined ? 0.5 : score01(input.priceMovementScore),
    concentrationRiskScore: score01(input.concentrationRiskScore ?? input.riskScore),
    portfolioWeight: score01(input.portfolioWeight),
    compositeRankScore: 0,
    supportingSignals: uniqueStrings(input.supportingSignals || []).slice(0, 5),
    missingWeakSignals: uniqueStrings(input.missingWeakSignals || []).slice(0, 5),
    sourceFreshness: input.sourceFreshness || "local",
    relatedHoldingsStatus: input.relatedHoldingsStatus || "untracked",
    sourceModes: uniqueStrings(input.sourceModes || []).slice(0, 5),
    sourceIds: uniqueStrings(input.sourceIds || []).slice(0, 8),
    href: input.href || (input.ticker ? `#/ticker/${input.ticker}` : "#alpha"),
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: input.updatedAt || input.createdAt || new Date().toISOString(),
    rankDrivers: uniqueStrings(input.rankDrivers || [])
  };
}

function recommendationTypeForAlphaSignal(signal, actionCategory, holding, watchlistIdea) {
  if (signal.isStaleSignal) return "stale data review";
  if (signal.thesisImpact === "breaks thesis") return "possible exit/reduce";
  if (signal.thesisImpact === "weakens thesis" || signal.thesisImpact === "requires review" || actionCategory === "Review" || actionCategory === "Critical Review") return "review position";
  if (actionCategory === "Positive Signal" && holding) return "watch";
  if (actionCategory === "Positive Signal" && !watchlistIdea) return "add to watchlist";
  if (signal.isLowSignal) return "watch";
  return holding ? "review position" : "investigate";
}

function recommendationTypeForTickerSignal(signal, holding, watchlistIdea, riskScore, holdingQualityScore = 0.5, dataQualityScore = 0.5) {
  if (holding && riskScore >= 0.72) return "trim risk";
  if (holding && Number(signal.combinedScore) >= 70) return "review position";
  const constructiveQualityContext = holdingQualityScore >= 0.62 && dataQualityScore >= 0.45 && riskScore < 0.62;
  if (!holding && !watchlistIdea && Number(signal.combinedScore) >= 62 && constructiveQualityContext) return "add to watchlist";
  if (!holding && watchlistIdea && Number(signal.combinedScore) >= 62 && constructiveQualityContext) return "possible add";
  return "watch";
}

function tickerSignalDataQuality(signal) {
  const missingCount = (signal.missingData || []).length;
  const live = /live|provider/i.test(`${signal.marketDataMode} ${signal.sourceMode}`) && !signal.mockData;
  const base = live ? 0.68 : signal.marketDataPrice ? 0.5 : 0.4;
  const warningPenalty = Math.min(0.2, (signal.warnings || []).length * 0.04);
  const missingPenalty = Math.min(0.24, missingCount * 0.04);
  const sourceTrustPenalty = signal.sourceTrustCapReason ? 0.12 : 0;
  const sourceConfirmationBonus = signal.sourceTrustCapReason
    ? 0
    : (signal.sourceCounts?.politician ? 0.04 : 0) + (signal.sourceCounts?.reddit ? 0.04 : 0);
  return score01(base - warningPenalty - missingPenalty - sourceTrustPenalty + sourceConfirmationBonus);
}

function quantEvidenceQualityScore(signal = {}) {
  const confidence = Number(signal.institutionalQuantConfidenceScore);
  const coverage = Number(signal.institutionalQuantDataCoverageScore);
  if (!Number.isFinite(confidence) && !Number.isFinite(coverage)) return 0;
  return score01(
    (Number.isFinite(confidence) ? confidence / 100 : 0.35) * 0.55 +
    (Number.isFinite(coverage) ? coverage / 100 : 0.35) * 0.45
  );
}

function tickerSignalFreshness(signal) {
  if (signal.marketDataStatus && /stale/i.test(signal.marketDataStatus)) return "stale market data";
  if (signal.mockData || /mock|placeholder/i.test(`${signal.sourceMode} ${signal.marketDataMode}`)) return "sample/local";
  if (/cached/i.test(`${signal.marketDataStatus} ${signal.marketDataMode}`)) return "cached";
  if (/live|provider/i.test(`${signal.marketDataMode} ${signal.sourceMode}`)) return "live/provider quote input";
  return "local";
}

function priceMovementScoreForTickerSignal(signal = {}) {
  if (!signal.marketDataPrice && !Number.isFinite(Number(signal.marketDataDailyChangePercent))) return 0.45;
  const absoluteMove = Math.abs(Number(signal.marketDataDailyChangePercent) || 0);
  return score01(0.35 + absoluteMove * 16);
}

function priceMovementScoreFromAlphaSignal(signal = {}) {
  const priceAction = signal.priceAction || {};
  const move = Math.max(
    Math.abs(Number(priceAction.affectedMove) || 0),
    Math.abs(Number(priceAction.peerBasketMove) || 0),
    Math.abs(Number(priceAction.sectorEtfMove) || 0)
  );
  const confirmationBoost = /company-specific|peer-group confirmed|sector-wide|factor-driven/i.test(priceAction.status || "") ? 0.12 : 0;
  return score01(0.35 + move * 12 + confirmationBoost);
}

function marketDataRecencyScore(signal, asOf) {
  const modeText = `${signal.marketDataStatus} ${signal.marketDataMode} ${signal.sourceMode}`.toLowerCase();
  if (/error|missing|not configured|failed/.test(modeText)) return 0.22;
  if (/stale/.test(modeText)) return 0.35;
  if (/mock|placeholder|sample/.test(modeText)) return 0.5;
  const timestamp = signal.marketDataFetchedAt || signal.marketDataAsOf || signal.updatedAt || signal.detectedAt || signal.timestamp;
  if (!timestamp) return 0.42;
  return recencyScore(timestamp, asOf);
}

function riskAdjustedFit({ holding, watchlistIdea, recommendationType, riskScore = 0.4, dataQualityScore = 0.5, realPortfolio = true } = {}) {
  const relationship = holding ? (realPortfolio ? 0.72 : 0.42) : watchlistIdea ? 0.56 : 0.38;
  const risk = score01(riskScore);
  const quality = score01(dataQualityScore);
  if (["trim risk", "possible exit/reduce", "stale data review", "review position"].includes(recommendationType)) {
    return score01(relationship * 0.45 + risk * 0.4 + quality * 0.15);
  }
  return score01(relationship * 0.42 + quality * 0.38 + (1 - risk) * 0.2);
}

function riskForHolding(holding, signal = {}) {
  if (!holding) return 0.3;
  const weightRisk = Math.min(1, Number(holding.portfolioWeight || 0) / 0.16);
  const leverage = holding.isLeveragedEtf || /very high/i.test(holding.riskLevel || "") ? 0.24 : /high/i.test(holding.riskLevel || "") ? 0.12 : 0;
  const thesisRisk = /breaks|weakens|requires review|confirms known risk/i.test(signal.thesisImpact || "") ? 0.18 : 0;
  return score01(weightRisk * 0.58 + leverage + thesisRisk);
}

function sourceFreshnessForSignal(signal, asOf) {
  if (signal.isStaleSignal) return "stale signal";
  const recency = recencyScore(signal.detectedAt || signal.timestamp, asOf);
  if (signal.sourceType === "social") return recency >= 0.7 ? "recent low-trust social" : "older low-trust social";
  if (/demo/i.test(signal.sourceName || "")) return "demo scenario";
  return recency >= 0.7 ? "recent" : "older";
}

function urgencyForAction(category, level) {
  if (category === "Critical Review" || level === "Critical") return 0.92;
  if (category === "Review" || level === "High") return 0.76;
  if (category === "Monitor" || level === "Medium") return 0.56;
  if (category === "Positive Signal") return 0.36;
  if (category === "Log Only" || level === "Low") return 0.24;
  return 0.14;
}

function relationshipStatus(holding, watchlistIdea, context = {}) {
  if (holding?.marketValue) return context.realPortfolio === false ? "sample" : "owned";
  if (watchlistIdea) return "watchlist";
  return "signal-only";
}

function ownershipRelevanceScore(holding, watchlistIdea, realPortfolio = true) {
  if (holding?.marketValue && !realPortfolio) return 0.42;
  if (holding?.marketValue) return score01(0.68 + Math.min(0.2, Number(holding.portfolioWeight || 0) * 1.2));
  if (watchlistIdea) return 0.56;
  return 0.34;
}

function ownershipRelevanceScoreFromStatus(status = "") {
  const text = String(status || "").toLowerCase();
  if (text === "owned") return 0.72;
  if (text === "sample") return 0.42;
  if (text === "watchlist") return 0.56;
  if (text === "portfolio") return 0.5;
  return 0.34;
}

function isRealRecommendationPortfolio(uiState = "") {
  return [
    "IMPORTED_CLEAN",
    "IMPORTED_WITH_SKIPPED_ROWS",
    "IMPORTED_PARTIAL_REVIEW",
    "STALE_PERSISTED_REPAIRED"
  ].includes(uiState);
}

function sourceFreshnessScore(label = "") {
  const text = String(label || "").toLowerCase();
  if (/error|missing|not configured|failed/.test(text)) return 0.22;
  if (/stale|source needs review/.test(text)) return 0.3;
  if (/mock|sample|demo/.test(text)) return 0.42;
  if (/live|connected|provider quote/.test(text)) return 0.86;
  if (/cached/.test(text)) return 0.72;
  if (/recent/.test(text)) return 0.7;
  if (/imported/.test(text)) return 0.64;
  if (/local alert|target allocation|thesis tracker|local event|local/.test(text)) return 0.58;
  if (/older/.test(text)) return 0.5;
  return 0.5;
}

function severityScore(severity = "") {
  const text = String(severity || "").toLowerCase();
  if (/critical/.test(text)) return 0.92;
  if (/high|warning/.test(text)) return 0.74;
  if (/watch/.test(text)) return 0.58;
  if (/info|low/.test(text)) return 0.36;
  return 0.45;
}

function recencyScore(timestamp, asOf = new Date().toISOString()) {
  const then = Date.parse(timestamp || "");
  const now = Date.parse(asOf || "") || Date.now();
  if (!Number.isFinite(then) || !Number.isFinite(now)) return 0.5;
  const ageHours = Math.max(0, (now - then) / 36e5);
  return score01(Math.exp(-ageHours / 120));
}

function summarizeHoldingsByTicker(holdings = []) {
  const rows = new Map();
  for (const holding of holdings || []) {
    const ticker = normalizeTicker(holding.ticker);
    if (!ticker) continue;
    const row = rows.get(ticker) || {
      ticker,
      marketValue: 0,
      portfolioWeight: 0,
      isLeveragedEtf: false,
      riskLevel: holding.riskLevel,
      sector: holding.sector,
      assetClass: holding.assetClass
    };
    row.marketValue += Number(holding.marketValue) || 0;
    row.portfolioWeight += Number(holding.portfolioWeight) || 0;
    row.isLeveragedEtf = row.isLeveragedEtf || Boolean(holding.isLeveragedEtf);
    row.riskLevel = riskRank(holding.riskLevel) > riskRank(row.riskLevel) ? holding.riskLevel : row.riskLevel;
    rows.set(ticker, row);
  }
  return rows;
}

function dedupeRecommendations(recommendations = []) {
  const byId = new Map();
  for (const recommendation of recommendations.filter((item) => item?.id)) {
    const current = byId.get(recommendation.id);
    if (!current || scoreRecommendationRank(recommendation) > scoreRecommendationRank(current)) byId.set(recommendation.id, recommendation);
  }
  return [...byId.values()];
}

function score01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function uniqueStrings(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function riskRank(value = "") {
  return { "Very High": 4, High: 3, Medium: 2, Low: 1 }[value] || 0;
}

function percentLabel(value) {
  return `${Math.round(score01(value) * 100)}%`;
}

function currencyLabel(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function signedPercentLabel(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "unknown";
  return `${numeric >= 0 ? "+" : ""}${(numeric * 100).toFixed(2)}%`;
}
