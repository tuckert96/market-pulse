import { normalizeTicker } from "./portfolioSchema.js";
import { summarizeRedditMentions } from "./redditSignals.js";
import { buildInstitutionalQuantLens } from "./scoringModel.js";
import { buildStockPredictionModel } from "./stockPredictionModel.js";
import { marketDataCoverageQualityForTicker } from "./marketDataProvider.js";

export const DEFAULT_TICKER_SIGNAL_WATCHLIST = Object.freeze(["MU", "NVDA", "AMD", "SOXL", "UPRO", "VGT", "CRDO", "QQQ"]);
export const TICKER_SIGNAL_WEIGHTS = Object.freeze({
  priceMomentumScore: 0.22,
  relativeStrengthScore: 0.14,
  redditMentionAccelerationScore: 0.16,
  redditSentimentScore: 0.08,
  politicianActivityScore: 0.16,
  ownershipWatchlistScore: 0.08,
  thesisConvictionRiskScore: 0.10,
  concentrationRiskScore: 0.06
});

export function buildCombinedTickerSignals({
  holdings = [],
  redditMentions = [],
  politicianTrades = [],
  marketEvents = [],
  alphaSignals = [],
  marketDataSnapshot = null,
  watchlist = DEFAULT_TICKER_SIGNAL_WATCHLIST,
  uiState = "IMPORTED_CLEAN",
  asOf = new Date().toISOString()
} = {}) {
  const holdingsByTicker = summarizeHoldingsByTicker(holdings);
  const portfolioTotalValue = holdings.reduce((sum, holding) => sum + (Number(holding.marketValue) || 0), 0);
  const realPortfolio = isRealTickerPortfolio(uiState);
  const redditByTicker = new Map(summarizeRedditMentions(redditMentions, { asOf }).map((row) => [row.ticker, row]));
  const politicianByTicker = summarizePoliticianTrades(politicianTrades);
  const marketCounts = summarizeMarketItems(marketEvents, alphaSignals);
  const marketDataByTicker = quoteMapFromSnapshot(marketDataSnapshot);
  const watchlistSet = new Set((watchlist || []).map((ticker) => normalizeTicker(ticker)).filter(Boolean));
  const allowedTickers = new Set([
    ...holdingsByTicker.keys(),
    ...politicianByTicker.keys(),
    ...marketCounts.keys(),
    ...marketDataByTicker.keys(),
    ...watchlistSet
  ]);
  const tickers = unique([
    ...allowedTickers,
    ...[...redditByTicker.keys()].filter((ticker) => allowedTickers.has(ticker))
  ]);

  return tickers
    .map((ticker) => {
      const holding = holdingsByTicker.get(ticker);
      const reddit = redditByTicker.get(ticker);
      const politician = politicianByTicker.get(ticker) || { buyScore: 0, sellScore: 0, tradeCount: 0 };
      const marketItemCount = marketCounts.get(ticker) || 0;
      const marketDataQuote = marketDataByTicker.get(ticker);
      const marketDataCoverage = marketDataCoverageQualityForTicker(marketDataSnapshot, ticker);
      const liveMarketDataInput = Boolean(marketDataQuote && !marketDataQuote.isMock && marketDataQuote.liveProviderCalls);
      const benchmarkDailyChangePercent = benchmarkDailyChangePercentFromSnapshot(marketDataSnapshot, ticker);
      const priceMomentumPlaceholder = scorePriceMomentumPlaceholder(holding, marketItemCount, marketDataQuote);
      const priceMomentumScore = priceMomentumPlaceholder;
      const relativeStrengthScore = scoreRelativeStrengthPlaceholder(holding, marketDataQuote, benchmarkDailyChangePercent);
      const redditMentionScore = scoreRedditMentions(reddit);
      const redditMentionAccelerationScore = scoreRedditMentionAcceleration(reddit);
      const redditSentimentScore = scoreRedditSentiment(reddit);
      const politicianBuyScore = roundScore(politician.buyScore);
      const politicianSellScore = roundScore(politician.sellScore);
      const politicianSignalScore = roundScore(clampScore(0.5 + politicianBuyScore * 0.5 - politicianSellScore * 0.5));
      const politicianActivityScore = scorePoliticianActivity(politician);
      const ownershipWatchlistScore = scoreOwnershipWatchlist(holding, watchlistSet.has(ticker), { realPortfolio });
      const thesisRiskFundamentalPlaceholder = scoreThesisRiskFundamentalPlaceholder(holding);
      const thesisConvictionRiskScore = scoreThesisConvictionRisk(holding);
      const concentrationRiskScore = scoreConcentrationRisk(holding);
      const institutionalQuant = buildInstitutionalQuantLens(
        institutionalStockInput({ ticker, holding, marketDataQuote, marketDataCoverage }),
        {
          asOf,
          portfolio: {
            totalValue: portfolioTotalValue,
            maxPositionWeight: 0.14,
            maxSectorWeight: 0.32
          }
        }
      );
      const stockPrediction = buildStockPredictionModel({
        holding,
        signal: {
          ticker,
          priceMomentumScore,
          priceMomentumPlaceholder,
          relativeStrengthScore,
          redditMentionAccelerationScore,
          redditMentionScore,
          redditSentimentScore,
          politicianBuyScore,
          politicianSellScore,
          politicianActivityScore,
          concentrationRiskScore,
          institutionalQuantScore: institutionalQuant.compositeScore,
          institutionalQuantRawScore: institutionalQuant.rawCompositeScore,
          institutionalQuantConfidenceScore: institutionalQuant.confidenceScore,
          institutionalQuantDataCoverageScore: institutionalQuant.dataCoverageScore,
          institutionalQuantMissingData: institutionalQuant.missingData,
          institutionalQuantSecurityKind: institutionalQuant.securityKind,
          institutionalQuantAcademicCompositeScore: institutionalQuant.academicCompositeScore,
          institutionalQuantAcademicValidationWarnings: institutionalQuant.academicValidationWarnings,
          institutionalQuantFactors: institutionalQuant.factors,
          marketDataPrice: marketDataQuote?.price || null,
          marketDataDailyChangePercent: marketDataQuote?.dailyChangePercent || 0,
          marketDataAsOf: marketDataQuote?.asOf || marketDataSnapshot?.asOf || "",
          marketDataStatus: marketDataSnapshot?.status?.status || "not configured",
          sourceMode: liveMarketDataInput ? "live market input" : marketDataQuote?.isMock ? "sample market input" : "local placeholder",
          isLeveragedEtf: Boolean(holding?.isLeveragedEtf),
          leveragedMultiple: holding?.leveragedMultiple || null,
          portfolioWeight: holding?.portfolioWeight || 0
        },
        uiState,
        asOf
      });
      const sourceCounts = {
        market: marketItemCount,
        marketData: marketDataQuote ? 1 : 0,
        reddit: reddit?.sevenDayMentions || 0,
        politician: politician.tradeCount || 0
      };
      const rawConfluenceScore = roundScore(
        priceMomentumScore * TICKER_SIGNAL_WEIGHTS.priceMomentumScore +
        relativeStrengthScore * TICKER_SIGNAL_WEIGHTS.relativeStrengthScore +
        redditMentionAccelerationScore * TICKER_SIGNAL_WEIGHTS.redditMentionAccelerationScore +
        redditSentimentScore * TICKER_SIGNAL_WEIGHTS.redditSentimentScore +
        politicianActivityScore * TICKER_SIGNAL_WEIGHTS.politicianActivityScore +
        ownershipWatchlistScore * TICKER_SIGNAL_WEIGHTS.ownershipWatchlistScore +
        thesisConvictionRiskScore * TICKER_SIGNAL_WEIGHTS.thesisConvictionRiskScore +
        concentrationRiskScore * TICKER_SIGNAL_WEIGHTS.concentrationRiskScore
      );
      const sourceTrust = sourceTrustGuardrail({
        reddit,
        politician,
        marketDataQuote,
        marketItemCount,
        holding,
        realPortfolio
      });
      const confluenceScore = roundScore(Math.min(rawConfluenceScore, sourceTrust.cap));
      const scoreLayers = buildScoreLayers({
        priceMomentumScore,
        relativeStrengthScore,
        redditMentionAccelerationScore,
        redditSentimentScore,
        politicianActivityScore,
        ownershipWatchlistScore,
        thesisConvictionRiskScore,
        concentrationRiskScore,
        marketDataQuote,
        marketDataCoverage,
        reddit,
        politician,
        holding,
        realPortfolio,
        benchmarkDailyChangePercent
      });
      const materialityScore = scoreMateriality(holding, marketItemCount);
      const confidenceScore = scoreTickerSignalConfidence({ marketItemCount, sourceCounts, marketDataQuote, marketDataCoverage, reddit, politician });
      const actionCategory = actionForConfluence(confluenceScore);
      const holdingQualityScore = scoreHoldingQuality({ holding, institutionalQuant });
      const explanation = buildScoreExplanation({
        ticker,
        holding,
        reddit,
        politician,
        marketItemCount,
        marketDataQuote,
        watchlistSet,
        realPortfolio,
        marketDataCoverage,
        priceMomentumScore,
        relativeStrengthScore,
        redditMentionAccelerationScore,
        redditSentimentScore,
        politicianActivityScore,
        ownershipWatchlistScore,
        thesisConvictionRiskScore,
        concentrationRiskScore
      });

      return {
        id: `ticker-signal-${ticker.toLowerCase()}`,
        ticker,
        scoreModelVersion: "ticker-signal-v2",
        scoreKind: "review-priority",
        scoreMeaning: "Higher combinedScore means inspect sooner; it is not a quality score, expected-return score, or trade instruction.",
        scoreScale: "0-100",
        confidenceCapReason: liveMarketDataInput
          ? "Confidence is capped because this is a local confluence model; market quotes may be live, but social, disclosure, and thesis layers may still be sample/imported/placeholder."
          : "Confidence is capped because current inputs are sample/local, social, disclosure, and placeholder data rather than a fully live provider stack.",
        priceMomentumPlaceholder,
        priceMomentumScore,
        relativeStrengthPlaceholder: relativeStrengthScore,
        relativeStrengthScore,
        redditMentionScore,
        redditMentionAccelerationScore,
        redditSentimentScore,
        redditSentimentPlaceholder: reddit?.sentiment || "unknown",
        politicianBuyScore,
        politicianSellScore,
        politicianSignalScore,
        politicianActivityScore,
        thesisRiskFundamentalPlaceholder,
        thesisConvictionRiskScore,
        ownershipWatchlistScore,
        concentrationRiskScore,
        institutionalQuantScore: institutionalQuant.compositeScore,
        institutionalQuantRawScore: institutionalQuant.rawCompositeScore,
        institutionalQuantEvidenceCapScore: institutionalQuant.evidenceCapScore,
        institutionalQuantEvidenceCapReasons: institutionalQuant.evidenceCapReasons,
        institutionalQuantScoreWasEvidenceCapped: institutionalQuant.scoreWasEvidenceCapped,
        institutionalQuantLabel: institutionalQuant.ratingLabel,
        institutionalQuantConfidenceScore: institutionalQuant.confidenceScore,
        institutionalQuantDataCoverageScore: institutionalQuant.dataCoverageScore,
        institutionalQuantDataCoverageLabel: institutionalQuant.dataCoverageLabel,
        institutionalQuantDataSufficiencyWarnings: institutionalQuant.dataSufficiencyWarnings,
        institutionalQuantModelGovernance: institutionalQuant.modelGovernance,
        institutionalQuantModelVersion: institutionalQuant.modelVersion,
        institutionalQuantScoreKind: institutionalQuant.scoreKind,
        institutionalQuantSecurityKind: institutionalQuant.securityKind,
        institutionalQuantFactorScores: institutionalQuant.factorScores,
        institutionalQuantFactors: institutionalQuant.factors,
        institutionalQuantFactorCoverage: institutionalQuant.factorCoverage,
        institutionalQuantAcademicCompositeScore: institutionalQuant.academicCompositeScore,
        institutionalQuantAcademicModelVersion: institutionalQuant.academicModelVersion,
        institutionalQuantAcademicFactors: institutionalQuant.academicFactorDiagnostics,
        institutionalQuantAcademicValidationWarnings: institutionalQuant.academicValidationWarnings,
        institutionalQuantAcademicResearchAnchors: institutionalQuant.academicResearchAnchors,
        institutionalQuantAcademicCaveat: institutionalQuant.academicCaveat,
        institutionalQuantStrengths: institutionalQuant.topStrengths,
        institutionalQuantWeaknesses: institutionalQuant.topWeaknesses,
        institutionalQuantMissingData: institutionalQuant.missingData,
        institutionalQuantExplanation: institutionalQuant.explanation,
        institutionalQuantSourceFreshness: institutionalQuant.sourceFreshness,
        institutionalQuantCaveat: institutionalQuant.caveat,
        stockPredictionModelVersion: stockPrediction.modelVersion,
        stockPredictionHorizon: stockPrediction.horizon,
        stockPredictionScore: stockPrediction.score,
        stockPredictionRawScore: stockPrediction.rawScore,
        stockPredictionLabel: stockPrediction.label,
        stockPredictionDirection: stockPrediction.direction,
        stockPredictionConfidence: stockPrediction.confidence,
        stockPredictionConfidenceLabel: stockPrediction.confidenceLabel,
        stockPredictionSourceMode: stockPrediction.sourceMode,
        stockPredictionSecurityKind: stockPrediction.securityKind,
        stockPredictionSummary: stockPrediction.summary,
        stockPredictionFactors: stockPrediction.factors,
        stockPredictionTopDrivers: stockPrediction.topDrivers,
        stockPredictionWeakSignals: stockPrediction.weakSignals,
        stockPredictionCaveats: stockPrediction.caveats,
        stockPredictionNextChecks: stockPrediction.recommendations,
        stockPredictionGuardrail: stockPrediction.guardrail,
        portfolioOwnershipFlag: Boolean(holding?.marketValue && realPortfolio),
        samplePortfolioFlag: Boolean(holding?.marketValue && !realPortfolio),
        watchlistFlag: watchlistSet.has(ticker),
        rawConfluenceScore,
        sourceTrustCap: sourceTrust.cap,
        sourceTrustCapReason: rawConfluenceScore > sourceTrust.cap ? sourceTrust.reason : "",
        confluenceScore,
        combinedScore: Math.round(confluenceScore * 100),
        reviewPriorityScore: Math.round(confluenceScore * 100),
        reviewPriorityScoreKind: "review-priority-not-quality",
        holdingQualityScore,
        holdingQualityScoreKind: "quality-context-not-review-priority",
        holdingQualityLabel: holdingQualityLabel(holdingQualityScore),
        actionCategory,
        tone: actionCategory === "Monitor" ? "medium" : actionCategory === "Log Only" ? "low" : "muted",
        evidenceGrade: "D",
        confidenceScore,
        materialityScore,
        marketIntelligencePlaceholder: roundScore(Math.min(1, marketItemCount / 3)),
        mockData: !liveMarketDataInput,
        sourceLabel: !realPortfolio && holding?.marketValue
          ? "Sample portfolio confluence score"
          : liveMarketDataInput ? "Local confluence score with provider quote input" : "Sample/local confluence score",
        sourceMode: liveMarketDataInput ? "local-model-live-market-data" : "mock-local-only",
        liveProviderCalls: liveMarketDataInput,
        dataMode: liveMarketDataInput ? "local-score-live-market-data" : "placeholder",
        sourceTypes: [marketDataQuote?.isMock ? "mock-market-data" : marketDataQuote ? "market-data" : "price-placeholder", "social", "disclosure", "thesis-placeholder"],
        sourceCounts,
        sector: holding?.sector || marketDataQuote?.sector || "",
        industry: holding?.marketDataIndustry || marketDataQuote?.industry || "",
        assetClass: holding?.assetClass || "",
        isLeveragedEtf: Boolean(holding?.isLeveragedEtf),
        leveragedMultiple: holding?.leveragedMultiple || null,
        holdingsValue: holding?.marketValue || 0,
        portfolioWeight: holding?.portfolioWeight || 0,
        marketDataPrice: marketDataQuote?.price || null,
        marketDataDailyChangePercent: marketDataQuote?.dailyChangePercent || 0,
        marketDataVolume: marketDataQuote?.volume || 0,
        marketDataSourceLabel: marketDataQuote?.providerLabel || marketDataSnapshot?.providerLabel || "Sample Market Data",
        marketDataStatus: marketDataSnapshot?.status?.status || "not configured",
        marketDataMode: marketDataQuote?.sourceMode || marketDataSnapshot?.mode || "mock",
        marketDataAsOf: marketDataQuote?.asOf || marketDataSnapshot?.asOf || "",
        marketDataFetchedAt: marketDataQuote?.fetchedAt || marketDataSnapshot?.fetchedAt || "",
        marketDataCoverageScore: marketDataCoverage?.coverageScore ?? null,
        marketDataCoverageStatus: marketDataCoverage?.coverageQualityStatus || "",
        marketDataCoverageLabel: marketDataCoverage?.coverageQualityLabel || "",
        marketDataCoverageWarnings: marketDataCoverage?.confidenceWarnings || [],
        marketDataMissingFields: marketDataCoverage?.unavailableFields || marketDataCoverage?.missingFields || [],
        marketDataMomentumConfidenceScore: marketDataCoverage?.momentumConfidenceScore ?? null,
        marketDataTechnicalConfidenceScore: marketDataCoverage?.technicalConfidenceScore ?? null,
        marketDataFundamentalConfidenceScore: marketDataCoverage?.fundamentalConfidenceScore ?? null,
        updatedAt: marketDataQuote?.fetchedAt || marketDataQuote?.asOf || marketDataSnapshot?.fetchedAt || marketDataSnapshot?.asOf || "",
        marketDataLabel: marketDataQuote?.isMock
          ? `Sample market data quote ${currencyLike(marketDataQuote.price)} · daily ${percentLike(marketDataQuote.dailyChangePercent)} · Live data not configured.`
          : marketDataQuote
            ? `${marketDataQuote.providerLabel || "Market data"} quote ${currencyLike(marketDataQuote.price)} · daily ${percentLike(marketDataQuote.dailyChangePercent)}.`
            : "Price momentum uses local holding data when live market data is unavailable.",
        redditOneDayMentions: reddit?.oneDayMentions || 0,
        redditSevenDayMentions: reddit?.sevenDayMentions || 0,
        redditThirtyDayMentions: reddit?.thirtyDayMentions || 0,
        redditMentionGrowth: reddit?.mentionGrowth || 0,
        redditMentionAcceleration: reddit?.mentionAcceleration ?? reddit?.mentionGrowth ?? 0,
        politicianTradeCount: politician.tradeCount || 0,
        scoreBreakdown: {
          priceMomentumScore: weighted(priceMomentumScore, TICKER_SIGNAL_WEIGHTS.priceMomentumScore),
          relativeStrengthScore: weighted(relativeStrengthScore, TICKER_SIGNAL_WEIGHTS.relativeStrengthScore),
          redditMentionAccelerationScore: weighted(redditMentionAccelerationScore, TICKER_SIGNAL_WEIGHTS.redditMentionAccelerationScore),
          redditSentimentScore: weighted(redditSentimentScore, TICKER_SIGNAL_WEIGHTS.redditSentimentScore),
          politicianActivityScore: weighted(politicianActivityScore, TICKER_SIGNAL_WEIGHTS.politicianActivityScore),
          ownershipWatchlistScore: weighted(ownershipWatchlistScore, TICKER_SIGNAL_WEIGHTS.ownershipWatchlistScore),
          thesisConvictionRiskScore: weighted(thesisConvictionRiskScore, TICKER_SIGNAL_WEIGHTS.thesisConvictionRiskScore),
          concentrationRiskScore: weighted(concentrationRiskScore, TICKER_SIGNAL_WEIGHTS.concentrationRiskScore)
        },
        scoreLayers,
        topDrivers: topDrivers({
          priceMomentumScore,
          relativeStrengthScore,
          redditMentionAccelerationScore,
          redditSentimentScore,
          politicianBuyScore,
          politicianSellScore,
          politicianActivityScore,
          ownershipWatchlistScore,
          thesisConvictionRiskScore,
          concentrationRiskScore,
          reddit,
          politician,
          holding,
          realPortfolio,
          marketItemCount,
          marketDataQuote,
          marketDataCoverage,
          benchmarkDailyChangePercent
        }),
        topHeadline: headlineForTicker({ ticker, reddit, politician, marketItemCount }),
        nextCheck: "Confirm with primary sources, price action, and thesis review before making portfolio changes.",
        warnings: liveMarketDataInput
          ? [!realPortfolio && holding?.marketValue ? "Sample portfolio context, not Tucker's imported holdings" : "Local confluence model only", "Market quote input is live/provider data, but social/disclosure/thesis layers may still be mock or imported", ...(marketDataCoverage?.confidenceWarnings || []).slice(0, 3), sourceTrust.reason && rawConfluenceScore > sourceTrust.cap ? sourceTrust.reason : "", "Not a recommendation to buy or sell"].filter(Boolean)
          : [!realPortfolio && holding?.marketValue ? "Sample portfolio context, not Tucker's imported holdings" : "Sample/local score only", "Market data not configured", ...(marketDataCoverage?.confidenceWarnings || []).slice(0, 3), sourceTrust.reason && rawConfluenceScore > sourceTrust.cap ? sourceTrust.reason : "", "Not a recommendation to buy or sell"].filter(Boolean),
        explanation: explanation.summary,
        whyScoreIsHigh: explanation.whyScoreIsHigh,
        missingData: explanation.missingData,
        dataModeDetails: explanation.dataModeDetails,
        formulaLabel: "Review priority formula: 22% price momentum, 14% relative strength, 16% Reddit acceleration, 8% Reddit sentiment, 16% politician activity, 8% ownership/watchlist, 10% thesis review need, 6% concentration risk. Quality context is reported separately."
      };
    })
    .sort((a, b) => b.confluenceScore - a.confluenceScore || b.holdingsValue - a.holdingsValue || a.ticker.localeCompare(b.ticker));
}

function institutionalStockInput({ ticker, holding = null, marketDataQuote = null, marketDataCoverage = null } = {}) {
  const quoteHistory = marketDataQuote?.historicalPrices || [];
  const holdingHistory = holding?.marketDataHistoricalPrices?.length ? holding.marketDataHistoricalPrices : holding?.historicalPrices || [];
  return {
    ...(holding || {}),
    ticker,
    symbol: ticker,
    company: holding?.name || marketDataQuote?.name || ticker,
    name: holding?.name || marketDataQuote?.name || ticker,
    price: marketDataQuote?.price ?? holding?.price,
    currentPrice: marketDataQuote?.price ?? holding?.price,
    marketDataPrice: marketDataQuote?.price,
    dailyChangePercent: marketDataQuote?.dailyChangePercent ?? holding?.dailyChangePercent,
    marketDataDailyChangePercent: marketDataQuote?.dailyChangePercent,
    volume: marketDataQuote?.volume ?? holding?.marketDataVolume,
    marketDataVolume: marketDataQuote?.volume ?? holding?.marketDataVolume,
    averageVolume: marketDataQuote?.averageVolume ?? holding?.marketDataAverageVolume,
    marketDataAverageVolume: marketDataQuote?.averageVolume ?? holding?.marketDataAverageVolume,
    marketCap: marketDataQuote?.marketCap ?? holding?.marketDataMarketCap,
    marketDataMarketCap: marketDataQuote?.marketCap ?? holding?.marketDataMarketCap,
    sector: marketDataQuote?.sector || holding?.sector,
    industry: marketDataQuote?.industry || holding?.marketDataIndustry,
    beta: marketDataQuote?.beta ?? holding?.beta,
    grossProfit: marketDataQuote?.grossProfit ?? holding?.grossProfit,
    grossProfits: marketDataQuote?.grossProfits ?? holding?.grossProfits,
    grossProfitTTM: marketDataQuote?.grossProfitTTM ?? holding?.grossProfitTTM,
    totalAssets: marketDataQuote?.totalAssets ?? holding?.totalAssets,
    assets: marketDataQuote?.assets ?? holding?.assets,
    grossProfitToAssets: marketDataQuote?.grossProfitToAssets ?? holding?.grossProfitToAssets,
    grossProfitsToAssets: marketDataQuote?.grossProfitsToAssets ?? holding?.grossProfitsToAssets,
    grossProfitability: marketDataQuote?.grossProfitability ?? holding?.grossProfitability,
    bookEquity: marketDataQuote?.bookEquity ?? holding?.bookEquity,
    bookValue: marketDataQuote?.bookValue ?? holding?.bookValue,
    bookToMarket: marketDataQuote?.bookToMarket ?? holding?.bookToMarket,
    earningsYield: marketDataQuote?.earningsYield ?? holding?.earningsYield,
    cashFlowYield: marketDataQuote?.cashFlowYield ?? holding?.cashFlowYield,
    momentumLookbackMonths: marketDataQuote?.momentumLookbackMonths ?? holding?.momentumLookbackMonths,
    momentumSkipMonths: marketDataQuote?.momentumSkipMonths ?? holding?.momentumSkipMonths,
    historicalPriceSource: marketDataQuote?.historicalPriceSource ?? holding?.historicalPriceSource,
    historicalPriceFrequency: marketDataQuote?.historicalPriceFrequency ?? holding?.historicalPriceFrequency,
    historicalPrices: quoteHistory.length ? quoteHistory : holdingHistory,
    marketDataHistoricalPrices: quoteHistory.length ? quoteHistory : holdingHistory,
    marketDataStatus: marketDataQuote?.cacheStatus || marketDataQuote?.dataFreshness || holding?.marketDataStatus,
    marketDataMode: marketDataQuote?.sourceMode || holding?.marketDataMode,
    dataFreshness: marketDataQuote?.dataFreshness,
    cacheStatus: marketDataQuote?.cacheStatus,
    marketDataCoverageScore: marketDataCoverage?.coverageScore,
    marketDataCoverageStatus: marketDataCoverage?.coverageQualityStatus,
    marketDataCoverageLabel: marketDataCoverage?.coverageQualityLabel,
    marketDataCoverageWarnings: marketDataCoverage?.confidenceWarnings || [],
    marketDataMissingFields: marketDataCoverage?.unavailableFields || marketDataCoverage?.missingFields || [],
    marketDataMissingQuote: marketDataCoverage?.missingQuote,
    marketDataMissingHistory: marketDataCoverage?.missingHistory,
    marketDataMissingProfileOrMetrics: marketDataCoverage?.missingProfileOrMetrics,
    marketDataMomentumConfidenceScore: marketDataCoverage?.momentumConfidenceScore,
    marketDataTechnicalConfidenceScore: marketDataCoverage?.technicalConfidenceScore,
    marketDataFundamentalConfidenceScore: marketDataCoverage?.fundamentalConfidenceScore,
    isMock: marketDataQuote?.isMock || holding?.marketDataIsMock,
    liveProviderCalls: Boolean(marketDataQuote?.liveProviderCalls)
  };
}

export function scoreRedditMentions(row = {}) {
  if (!row || !row.ticker) return 0;
  const sentimentComponent = {
    bullish: 0.8,
    mixed: 0.55,
    neutral: 0.45,
    bearish: 0.2,
    unknown: 0.35
  }[row.sentiment] ?? 0.35;
  return roundScore(
    Math.min(1, (Number(row.oneDayMentions) || 0) / 2) * 0.45 +
    Math.min(1, (Number(row.sevenDayMentions) || 0) / 4) * 0.25 +
    Math.min(1, (Number(row.totalEngagement) || 0) / 150) * 0.2 +
    sentimentComponent * 0.1
  );
}

export function scoreRedditMentionAcceleration(row = {}) {
  if (!row || !row.ticker) return 0;
  const acceleration = Number(row.mentionAcceleration ?? row.mentionGrowth) || 0;
  const oneDay = Number(row.oneDayMentions) || 0;
  const sevenDay = Number(row.sevenDayMentions) || 0;
  const accelerationComponent = clampScore(0.5 + acceleration * 0.35);
  const nearTermComponent = Math.min(1, oneDay / 2);
  const sevenDayComponent = Math.min(1, sevenDay / 5);
  return roundScore(accelerationComponent * 0.5 + nearTermComponent * 0.3 + sevenDayComponent * 0.2);
}

export function scoreRedditSentiment(row = {}) {
  return roundScore({
    bullish: 0.74,
    mixed: 0.55,
    neutral: 0.48,
    bearish: 0.28,
    unknown: 0.4
  }[row?.sentiment] ?? 0.4);
}

export function summarizePoliticianTrades(records = []) {
  const rows = new Map();
  records.forEach((trade) => {
    const ticker = normalizeTicker(trade.ticker);
    if (!ticker) return;
    const row = rows.get(ticker) || { ticker, buyScore: 0, sellScore: 0, tradeCount: 0 };
    const score = roundScore((Number(trade.recencyScore) || 0) * 0.6 + (Number(trade.sizeScore) || 0) * 0.4);
    if (trade.transactionType === "purchase") row.buyScore = Math.max(row.buyScore, score);
    if (trade.transactionType === "sale") row.sellScore = Math.max(row.sellScore, score);
    row.tradeCount += 1;
    rows.set(ticker, row);
  });
  return rows;
}

export function scorePriceMomentumPlaceholder(holding, marketItemCount = 0, marketDataQuote = null) {
  if (marketDataQuote) {
    return roundScore(clampScore(0.5 + (Number(marketDataQuote.dailyChangePercent) || 0) * 8 + Math.min(0.12, marketItemCount * 0.03)));
  }
  if (!holding) return roundScore(0.45 + Math.min(0.15, marketItemCount * 0.04));
  const dailyPct = holding.marketValue ? (Number(holding.dailyChange) || 0) / Math.max(1, Number(holding.marketValue) || 1) : 0;
  return roundScore(clampScore(0.5 + dailyPct * 6 + Math.min(0.12, marketItemCount * 0.03)));
}

export function scoreRelativeStrengthPlaceholder(holding, marketDataQuote = null, benchmarkDailyChangePercent = 0) {
  const tickerMove = marketDataQuote
    ? Number(marketDataQuote.dailyChangePercent) || 0
    : holding?.marketValue
      ? (Number(holding.dailyChange) || 0) / Math.max(1, Number(holding.marketValue) || 1)
      : 0;
  if (!marketDataQuote && !holding) return 0.45;
  return roundScore(clampScore(0.5 + (tickerMove - benchmarkDailyChangePercent) * 8));
}

export function scoreThesisRiskFundamentalPlaceholder(holding) {
  if (!holding) return 0.45;
  const thesisBoost = /active|supported/i.test(holding.thesisStatus || "") ? 0.14 : /needs review/i.test(holding.thesisStatus || "") ? 0.04 : -0.08;
  const riskPenalty = /very high/i.test(holding.riskLevel || "") ? 0.16 : /high/i.test(holding.riskLevel || "") ? 0.08 : 0;
  const quantBoost = Number.isFinite(Number(holding.quant)) ? ((Number(holding.quant) || 0) / 5 - 0.5) * 0.2 : 0;
  return roundScore(clampScore(0.5 + thesisBoost + quantBoost - riskPenalty));
}

export function scorePoliticianActivity(politician = {}) {
  const buy = Number(politician.buyScore) || 0;
  const sell = Number(politician.sellScore) || 0;
  const activity = Math.min(1, Number(politician.tradeCount || 0) / 3);
  return roundScore(clampScore(0.5 + buy * 0.32 - sell * 0.32 + activity * 0.14));
}

export function scoreOwnershipWatchlist(holding, watchlisted = false, options = {}) {
  const realPortfolio = options.realPortfolio !== false;
  if (holding?.marketValue && !realPortfolio && watchlisted) return 0.58;
  if (holding?.marketValue && !realPortfolio) return 0.46;
  if (holding?.marketValue && watchlisted) return 0.82;
  if (holding?.marketValue) return 0.72;
  if (watchlisted) return 0.56;
  return 0.35;
}

export function scoreThesisConvictionRisk(holding) {
  if (!holding) return 0.42;
  const weakConfidence = 1 - confidenceLevelScore(holding.confidenceLevel);
  const statusScore = thesisReviewNeedScore(holding.thesisStatus);
  const riskReview = riskReviewScore(holding.riskLevel);
  const missingThesis = holding.thesisStatus ? 0 : 0.14;
  return roundScore(clampScore(weakConfidence * 0.28 + statusScore * 0.34 + riskReview * 0.26 + missingThesis));
}

export function scoreConcentrationRisk(holding) {
  if (!holding?.marketValue) return 0.2;
  const weight = Number(holding.portfolioWeight) || 0;
  const weightScore = Math.min(1, weight / 0.16);
  const leverageBoost = holding.isLeveragedEtf ? 0.22 : 0;
  const riskBoost = riskReviewScore(holding.riskLevel) * 0.18;
  return roundScore(clampScore(weightScore * 0.6 + leverageBoost + riskBoost));
}

function scoreMateriality(holding, marketItemCount = 0) {
  const holdingWeight = Math.min(1, (Number(holding?.portfolioWeight) || 0) * 5);
  return roundScore(Math.min(1, holdingWeight * 0.7 + Math.min(1, marketItemCount / 3) * 0.3));
}

function actionForConfluence(score) {
  if (score >= 0.7) return "Monitor";
  if (score >= 0.45) return "Log Only";
  return "Ignore";
}

function sourceTrustGuardrail({
  reddit = null,
  politician = {},
  marketDataQuote = null,
  marketItemCount = 0,
  holding = null,
  realPortfolio = false
} = {}) {
  const hasSocialFlow = Boolean(reddit?.sourceIds?.length || reddit?.oneDayMentions || reddit?.sevenDayMentions);
  const hasDisclosureFlow = Boolean(politician?.tradeCount);
  if (!hasSocialFlow && !hasDisclosureFlow) return { cap: 1, reason: "" };

  const hasOwnedPortfolioContext = Boolean(holding?.marketValue && realPortfolio);
  const hasConfirmedMarketContext = Boolean(
    marketItemCount > 0 ||
    (marketDataQuote && !marketDataQuote.isMock && marketDataQuote.liveProviderCalls)
  );
  if (hasOwnedPortfolioContext && hasConfirmedMarketContext) return { cap: 1, reason: "" };

  if (hasOwnedPortfolioContext) {
    return {
      cap: 0.68,
      reason: "Social and federal disclosure flow is capped until confirmed by market data, primary-source events, or thesis evidence."
    };
  }

  return {
    cap: 0.58,
    reason: "Social and federal disclosure flow is capped because this ticker is not an owned imported holding."
  };
}

function scoreTickerSignalConfidence({ marketItemCount = 0, sourceCounts = {}, marketDataQuote = null, marketDataCoverage = null, reddit = null, politician = {} } = {}) {
  const base = 0.18;
  const coverage = Number(marketDataCoverage?.coverageScore);
  const hasCoverageScore = Number.isFinite(coverage);
  const coverageComponent = hasCoverageScore ? Math.max(0, Math.min(0.1, coverage / 100 * 0.1)) : 0;
  const marketData = marketDataQuote ? Math.max(0.03, coverageComponent || 0.08) : 0;
  const marketContext = Math.min(0.1, marketItemCount * 0.035);
  const redditContext = Math.min(0.08, (sourceCounts.reddit || 0) * 0.018);
  const disclosureContext = Math.min(0.08, (politician.tradeCount || 0) * 0.04);
  const importedBoost = reddit?.sourceIds?.length ? 0.02 : 0;
  const missingQuotePenalty = marketDataCoverage?.missingQuote ? 0.08 : 0;
  const missingHistoryPenalty = marketDataCoverage?.missingHistory ? 0.04 : 0;
  const missingProfilePenalty = marketDataCoverage?.missingProfileOrMetrics ? 0.03 : 0;
  return roundScore(Math.min(0.58, base + marketData + marketContext + redditContext + disclosureContext + importedBoost - missingQuotePenalty - missingHistoryPenalty - missingProfilePenalty));
}

function buildScoreExplanation(context = {}) {
  const {
    ticker,
    holding,
    reddit,
    politician = {},
    marketItemCount = 0,
    marketDataQuote,
    marketDataCoverage = null,
    watchlistSet,
    priceMomentumScore,
    relativeStrengthScore,
    redditMentionAccelerationScore,
    redditSentimentScore,
    politicianActivityScore,
    ownershipWatchlistScore,
    thesisConvictionRiskScore,
    concentrationRiskScore,
    realPortfolio = true
  } = context;
  const whyScoreIsHigh = [];
  const liveMarketDataInput = Boolean(marketDataQuote && !marketDataQuote.isMock && marketDataQuote.liveProviderCalls);
  if (priceMomentumScore >= 0.62) whyScoreIsHigh.push(liveMarketDataInput ? "positive provider-backed price momentum" : "positive sample/local price momentum");
  if (relativeStrengthScore >= 0.62) whyScoreIsHigh.push(liveMarketDataInput ? "relative strength versus available provider quote context" : "relative strength versus the sample/local benchmark");
  if (redditMentionAccelerationScore >= 0.62) whyScoreIsHigh.push("accelerating Reddit mentions");
  if (redditSentimentScore >= 0.62) whyScoreIsHigh.push("bullish Reddit sentiment placeholder");
  if (politicianActivityScore >= 0.62) whyScoreIsHigh.push("recent politician disclosure activity");
  if (ownershipWatchlistScore >= 0.7) whyScoreIsHigh.push(holding ? "owned portfolio position" : "watchlist relevance");
  if (holding && !realPortfolio) whyScoreIsHigh.push("sample portfolio context only");
  if (thesisConvictionRiskScore >= 0.62) whyScoreIsHigh.push("thesis review need or risk flag");
  if (concentrationRiskScore >= 0.62) whyScoreIsHigh.push("position concentration or leverage risk");
  if (marketItemCount) whyScoreIsHigh.push(`${marketItemCount} linked market/Alpha placeholder item${marketItemCount === 1 ? "" : "s"}`);

  const missingData = [];
  if (!marketDataQuote || marketDataQuote.isMock) missingData.push("live market quote and history");
  if (marketDataQuote && !marketDataQuote.isMock && marketDataCoverage?.missingQuote) missingData.push("provider quote/current price");
  if (marketDataQuote && !marketDataQuote.isMock && marketDataCoverage?.missingHistory) missingData.push("historical candles");
  if (marketDataQuote && !marketDataQuote.isMock && marketDataCoverage?.missingProfileOrMetrics) missingData.push("provider profile/fundamental fields");
  if (!reddit?.sevenDayMentions) missingData.push("Reddit mention confirmation");
  if (!politician?.tradeCount) missingData.push("politician disclosure confirmation");
  if (!holding || !realPortfolio) missingData.push("imported portfolio ownership context");
  if (holding && (!holding.thesisStatus || /missing|needs/i.test(holding.thesisStatus))) missingData.push("current thesis conviction");

  const dataModeDetails = [
    liveMarketDataInput ? "provider market data input" : marketDataQuote?.isMock ? "sample market data" : marketDataQuote ? "provider-shaped market data" : "no market quote",
    marketDataCoverage?.coverageQualityLabel ? `market data coverage: ${marketDataCoverage.coverageQualityLabel}` : "",
    reddit?.sourceIds?.length ? "sample/local Reddit mentions" : "no Reddit rows",
    politician?.tradeCount ? "sample/local politician disclosures" : "no politician disclosure rows",
    liveMarketDataInput ? "market quote provider calls happened server-side before scoring" : "no live provider calls"
  ].filter(Boolean);

  const reason = whyScoreIsHigh.length ? whyScoreIsHigh.slice(0, 3).join(", ") : "baseline watchlist/portfolio context";
  const combinedMissingData = unique([...(marketDataCoverage?.confidenceWarnings || []), ...missingData]);
  return {
    whyScoreIsHigh,
    missingData: combinedMissingData,
    dataModeDetails,
    summary: `${ticker}: score reflects ${reason}. Missing: ${combinedMissingData.slice(0, 3).join(", ") || "none from current local data"}.`
  };
}

function buildScoreLayers({
  priceMomentumScore,
  relativeStrengthScore,
  redditMentionAccelerationScore,
  redditSentimentScore,
  politicianActivityScore,
  ownershipWatchlistScore,
  thesisConvictionRiskScore,
  concentrationRiskScore,
  marketDataQuote,
  marketDataCoverage,
  reddit,
  politician = {},
  holding,
  realPortfolio = true,
  benchmarkDailyChangePercent = 0
} = {}) {
  return [
    {
      key: "priceMomentumScore",
      label: "Price momentum",
      score: roundScore(priceMomentumScore),
      weight: TICKER_SIGNAL_WEIGHTS.priceMomentumScore,
      dataMode: marketDataQuote?.isMock ? "sample market quote" : marketDataQuote?.liveProviderCalls ? "live provider quote" : marketDataQuote ? "provider-shaped quote" : "local holding move",
      missingData: marketDataQuote
        ? (marketDataCoverage?.missingHistory ? ["historical candles"] : [])
        : ["live quote", "historical price series"],
      note: marketDataCoverage?.coverageQualityLabel || ""
    },
    {
      key: "relativeStrengthScore",
      label: "Relative strength placeholder",
      score: roundScore(relativeStrengthScore),
      weight: TICKER_SIGNAL_WEIGHTS.relativeStrengthScore,
      dataMode: "sample/local benchmark comparison",
      missingData: ["validated benchmark basket", "historical beta-adjusted returns"],
      note: `Benchmark move: ${percentLike(benchmarkDailyChangePercent)}`
    },
    {
      key: "redditMentionAccelerationScore",
      label: "Reddit mention acceleration",
      score: roundScore(redditMentionAccelerationScore),
      weight: TICKER_SIGNAL_WEIGHTS.redditMentionAccelerationScore,
      dataMode: reddit?.sourceIds?.length ? "sample/local Reddit import" : "missing",
      missingData: reddit?.sourceIds?.length ? [] : ["Reddit import/API data"],
      note: reddit?.sevenDayMentions ? `${reddit.oneDayMentions || 0} one-day / ${reddit.sevenDayMentions} seven-day mentions` : "No local Reddit rows"
    },
    {
      key: "redditSentimentScore",
      label: "Reddit sentiment placeholder",
      score: roundScore(redditSentimentScore),
      weight: TICKER_SIGNAL_WEIGHTS.redditSentimentScore,
      dataMode: reddit?.sentiment ? "sample/local sentiment placeholder" : "missing",
      missingData: reddit?.sentiment ? [] : ["sentiment classifier"],
      note: `Sentiment: ${reddit?.sentiment || "unknown"}`
    },
    {
      key: "politicianActivityScore",
      label: "Politician disclosure activity",
      score: roundScore(politicianActivityScore),
      weight: TICKER_SIGNAL_WEIGHTS.politicianActivityScore,
      dataMode: politician?.tradeCount ? "sample/local disclosure import" : "missing",
      missingData: politician?.tradeCount ? [] : ["politician trade import/API data"],
      note: politician?.tradeCount ? `${politician.tradeCount} disclosure row${politician.tradeCount === 1 ? "" : "s"}` : "No local disclosure rows"
    },
    {
      key: "ownershipWatchlistScore",
      label: "Ownership/watchlist status",
      score: roundScore(ownershipWatchlistScore),
      weight: TICKER_SIGNAL_WEIGHTS.ownershipWatchlistScore,
      dataMode: holding?.marketValue ? (realPortfolio ? "owned holding" : "sample holding") : "watchlist/baseline",
      missingData: holding?.marketValue && realPortfolio ? [] : ["imported portfolio ownership context"]
    },
    {
      key: "thesisConvictionRiskScore",
      label: "Thesis review need",
      score: roundScore(thesisConvictionRiskScore),
      weight: TICKER_SIGNAL_WEIGHTS.thesisConvictionRiskScore,
      dataMode: holding ? "local thesis/holding fields" : "missing",
      missingData: holding ? [] : ["thesis tracker row"],
      note: holding ? `Higher means weaker/stale/missing thesis context or elevated risk. Status ${holding.thesisStatus || "unknown"} · confidence ${holding.confidenceLevel || "unrated"} · risk ${holding.riskLevel || "unknown"}` : "No thesis context"
    },
    {
      key: "concentrationRiskScore",
      label: "Concentration risk",
      score: roundScore(concentrationRiskScore),
      weight: TICKER_SIGNAL_WEIGHTS.concentrationRiskScore,
      dataMode: holding?.marketValue ? (realPortfolio ? "portfolio exposure" : "sample portfolio exposure") : "not owned",
      missingData: holding?.marketValue && realPortfolio ? [] : ["imported position weight"],
      note: holding?.marketValue ? `${realPortfolio ? "Portfolio" : "Sample portfolio"} weight ${percentLike(holding.portfolioWeight)}` : "No current position"
    }
  ].map((layer) => ({
    ...layer,
    contribution: weighted(layer.score, layer.weight)
  }));
}

function topDrivers({
  priceMomentumScore,
  relativeStrengthScore,
  redditMentionAccelerationScore,
  redditSentimentScore,
  politicianBuyScore,
  politicianSellScore,
  politicianActivityScore,
  ownershipWatchlistScore,
  thesisConvictionRiskScore,
  concentrationRiskScore,
  reddit,
  politician,
  holding,
  realPortfolio = true,
  marketItemCount,
  marketDataQuote,
  marketDataCoverage,
  benchmarkDailyChangePercent
}) {
  return [
    {
      sourceType: marketDataQuote?.isMock ? "mock-market-data" : marketDataQuote?.liveProviderCalls ? "market-data" : "price-placeholder",
      label: marketDataQuote?.isMock ? "Sample market data momentum" : marketDataQuote?.liveProviderCalls ? "Provider quote momentum" : "Price momentum placeholder",
      score: priceMomentumScore,
      reason: marketDataQuote
        ? marketDataQuote.liveProviderCalls
          ? `Uses ${marketDataQuote.providerLabel || "provider"} daily price change as a server-side market data input; ${marketDataCoverage?.coverageQualityLabel || "coverage pending"}.`
          : `Uses ${marketDataQuote.providerLabel || "provider-shaped"} daily price change; live provider status is not confirmed.`
        : "Uses local daily move when available; not a live price feed.",
      sourceIds: []
    },
    {
      sourceType: "relative-strength-placeholder",
      label: "Relative strength placeholder",
      score: relativeStrengthScore,
      reason: `Compares ticker move with sample/local benchmark context (${percentLike(benchmarkDailyChangePercent)}).`,
      sourceIds: []
    },
    {
      sourceType: "social",
      label: "Reddit mention acceleration",
      score: redditMentionAccelerationScore,
      reason: reddit?.sevenDayMentions ? `${reddit.oneDayMentions || 0} mentions in 1 day, ${reddit.sevenDayMentions} in 7 days, acceleration ${formatSignedNumber(reddit.mentionAcceleration ?? reddit.mentionGrowth)}.` : "No sample/local Reddit mentions.",
      sourceIds: reddit?.sourceIds || []
    },
    {
      sourceType: "social-sentiment-placeholder",
      label: "Reddit sentiment placeholder",
      score: redditSentimentScore,
      reason: `Placeholder sentiment is ${reddit?.sentiment || "unknown"} and remains low trust.`,
      sourceIds: reddit?.sourceIds || []
    },
    {
      sourceType: "disclosure",
      label: "Politician disclosure activity",
      score: politicianActivityScore,
      reason: politician?.tradeCount ? `Uses ${politician.tradeCount} disclosure row${politician.tradeCount === 1 ? "" : "s"}; buy ${formatScoreText(politicianBuyScore)} / sell ${formatScoreText(politicianSellScore)} without inferring intent.` : "No sample/local disclosure rows.",
      sourceIds: []
    },
    {
      sourceType: "thesis-placeholder",
      label: "Thesis review need",
      score: thesisConvictionRiskScore,
      reason: holding ? `Raises review priority for stale, missing, weak, or contradicted thesis context and for elevated risk; strong quant quality is reported separately.` : "No thesis context because ticker is not currently owned.",
      sourceIds: []
    },
    {
      sourceType: "ownership-watchlist",
      label: "Ownership/watchlist status",
      score: ownershipWatchlistScore,
      reason: holding?.marketValue
        ? realPortfolio ? "Owned tickers get higher review priority than unowned watchlist-only names." : "Sample positions demonstrate the scoring workflow but are not Tucker-owned."
        : "Watchlist-only or tracked baseline.",
      sourceIds: []
    },
    {
      sourceType: "concentration-risk",
      label: "Concentration risk",
      score: concentrationRiskScore,
      reason: holding?.marketValue
        ? `${realPortfolio ? "Portfolio" : "Sample portfolio"} weight ${percentLike(holding.portfolioWeight)} and risk ${holding.riskLevel || "unknown"} inform review priority.`
        : "No current portfolio exposure.",
      sourceIds: []
    },
    {
      sourceType: "market-placeholder",
      label: "Linked market placeholders",
      score: Math.min(1, marketItemCount / 3),
      reason: `${marketItemCount} linked demo market/Alpha item${marketItemCount === 1 ? "" : "s"}.`,
      sourceIds: []
    }
  ].sort((a, b) => b.score - a.score);
}

function headlineForTicker({ ticker, reddit, politician, marketItemCount }) {
  if (reddit?.sevenDayMentions && politician?.tradeCount) return `${ticker}: social mentions and disclosure activity overlap`;
  if (reddit?.sevenDayMentions) return `${ticker}: mock Reddit attention detected`;
  if (politician?.tradeCount) return `${ticker}: mock politician disclosure activity detected`;
  if (marketItemCount) return `${ticker}: linked demo market placeholder`;
  return `${ticker}: tracked ticker baseline`;
}

function summarizeHoldingsByTicker(holdings = []) {
  const rows = new Map();
  holdings.forEach((holding) => {
    const ticker = normalizeTicker(holding.ticker);
    if (!ticker) return;
    const row = rows.get(ticker) || {
      ticker,
      marketValue: 0,
      portfolioWeight: 0,
      dailyChange: 0,
      thesisStatus: holding.thesisStatus,
      confidenceLevel: holding.confidenceLevel,
      riskLevel: holding.riskLevel,
      riskScore: holding.riskScore || 0,
      quant: holding.quant,
      name: holding.name || ticker,
      sector: holding.sector,
      assetClass: holding.assetClass,
      valuationGrade: holding.valuationGrade,
      valueGrade: holding.valueGrade,
      value: holding.value,
      growthGrade: holding.growthGrade,
      growth: holding.growth,
      profitabilityGrade: holding.profitabilityGrade,
      profitability: holding.profitability,
      momentumGrade: holding.momentumGrade,
      momentum: holding.momentum,
      revisionsGrade: holding.revisionsGrade,
      epsRevisionsGrade: holding.epsRevisionsGrade,
      revisions: holding.revisions,
      revenueGrowth: holding.revenueGrowth,
      epsGrowth: holding.epsGrowth,
      forwardPe: holding.forwardPe,
      priceToSales: holding.priceToSales,
      grossMargin: holding.grossMargin,
      freeCashFlowMargin: holding.freeCashFlowMargin,
      grossProfit: holding.grossProfit,
      grossProfits: holding.grossProfits,
      grossProfitTTM: holding.grossProfitTTM,
      totalAssets: holding.totalAssets,
      assets: holding.assets,
      grossProfitToAssets: holding.grossProfitToAssets,
      grossProfitsToAssets: holding.grossProfitsToAssets,
      grossProfitability: holding.grossProfitability,
      bookEquity: holding.bookEquity,
      bookValue: holding.bookValue,
      bookToMarket: holding.bookToMarket,
      earningsYield: holding.earningsYield,
      cashFlowYield: holding.cashFlowYield,
      beta: holding.beta,
      price: holding.price,
      shares: 0,
      costBasis: 0,
      marketDataVolume: holding.marketDataVolume,
      marketDataAverageVolume: holding.marketDataAverageVolume,
      marketDataMarketCap: holding.marketDataMarketCap,
      marketDataIndustry: holding.marketDataIndustry,
      marketDataHistoricalPrices: holding.marketDataHistoricalPrices || [],
      historicalPrices: holding.historicalPrices || [],
      momentumLookbackMonths: holding.momentumLookbackMonths,
      momentumSkipMonths: holding.momentumSkipMonths,
      historicalPriceSource: holding.historicalPriceSource,
      historicalPriceFrequency: holding.historicalPriceFrequency,
      marketDataStatus: holding.marketDataStatus,
      marketDataMode: holding.marketDataMode,
      marketDataIsMock: holding.marketDataIsMock,
      saUpdatedAt: holding.saUpdatedAt || holding.importedAt || holding.sourceAsOf,
      nextEarnings: holding.nextEarnings,
      leveragedMultiple: holding.leveragedMultiple,
      isLeveragedEtf: Boolean(holding.isLeveragedEtf)
    };
    row.marketValue += Number(holding.marketValue) || 0;
    row.portfolioWeight += Number(holding.portfolioWeight) || 0;
    row.dailyChange += Number(holding.dailyChange) || 0;
    row.shares += Number(holding.shares) || 0;
    row.costBasis += Number(holding.costBasis) || 0;
    row.positionValue = row.marketValue;
    preserveFirst(row, holding, [
      "valuationGrade",
      "valueGrade",
      "value",
      "growthGrade",
      "growth",
      "profitabilityGrade",
      "profitability",
      "momentumGrade",
      "momentum",
      "revisionsGrade",
      "epsRevisionsGrade",
      "revisions",
      "revenueGrowth",
      "epsGrowth",
      "forwardPe",
      "priceToSales",
      "grossMargin",
      "freeCashFlowMargin",
      "grossProfit",
      "grossProfits",
      "grossProfitTTM",
      "totalAssets",
      "assets",
      "grossProfitToAssets",
      "grossProfitsToAssets",
      "grossProfitability",
      "bookEquity",
      "bookValue",
      "bookToMarket",
      "earningsYield",
      "cashFlowYield",
      "beta",
      "marketDataVolume",
      "marketDataAverageVolume",
      "marketDataMarketCap",
      "marketDataIndustry",
      "momentumLookbackMonths",
      "momentumSkipMonths",
      "historicalPriceSource",
      "historicalPriceFrequency",
      "marketDataStatus",
      "marketDataMode",
      "saUpdatedAt",
      "nextEarnings",
      "leveragedMultiple"
    ]);
    if (!row.marketDataHistoricalPrices?.length && holding.marketDataHistoricalPrices?.length) {
      row.marketDataHistoricalPrices = holding.marketDataHistoricalPrices;
    }
    if (!row.historicalPrices?.length && holding.historicalPrices?.length) {
      row.historicalPrices = holding.historicalPrices;
    }
    if (riskRank(holding.riskLevel) > riskRank(row.riskLevel)) row.riskLevel = holding.riskLevel;
    if (confidenceLevelScore(holding.confidenceLevel) > confidenceLevelScore(row.confidenceLevel)) row.confidenceLevel = holding.confidenceLevel;
    row.riskScore = Math.max(row.riskScore || 0, Number(holding.riskScore) || 0);
    row.isLeveragedEtf = row.isLeveragedEtf || Boolean(holding.isLeveragedEtf);
    if (!row.quant && Number.isFinite(Number(holding.quant))) row.quant = Number(holding.quant);
    if (row.thesisStatus !== holding.thesisStatus) row.thesisStatus = "Mixed";
    rows.set(ticker, row);
  });
  return rows;
}

function preserveFirst(target = {}, source = {}, fields = []) {
  fields.forEach((field) => {
    if ((target[field] === undefined || target[field] === null || target[field] === "") && source[field] !== undefined && source[field] !== null && source[field] !== "") {
      target[field] = source[field];
    }
  });
}

function summarizeMarketItems(marketEvents = [], alphaSignals = []) {
  const rows = new Map();
  [...marketEvents, ...alphaSignals].forEach((item) => {
    eventTickers(item).forEach((ticker) => rows.set(ticker, (rows.get(ticker) || 0) + 1));
  });
  return rows;
}

function eventTickers(event = {}) {
  return unique([
    ...(event.affectedTickers || []),
    ...(event.inferredTickersAffected || []),
    ...(event.tickersMentioned || []),
    event.primaryTicker
  ].filter(Boolean).map((ticker) => normalizeTicker(ticker)));
}

function explainSignal({ ticker, holding, reddit, politician, marketItemCount, marketDataQuote, watchlistSet, realPortfolio = true }) {
  const pieces = [];
  pieces.push(holding ? (realPortfolio ? "owned in the current portfolio" : "sample portfolio position only") : "not currently owned");
  if (watchlistSet.has(ticker)) pieces.push("on the local watchlist");
  if (marketDataQuote) pieces.push(`${marketDataQuote.providerLabel || "mock market data"} quote context`);
  if (reddit?.sevenDayMentions) pieces.push(`${reddit.sevenDayMentions} mock Reddit mention${reddit.sevenDayMentions === 1 ? "" : "s"} in 7 days`);
  if (politician?.tradeCount) pieces.push(`${politician.tradeCount} mock politician disclosure row${politician.tradeCount === 1 ? "" : "s"}`);
  if (marketItemCount) pieces.push(`${marketItemCount} linked market/Alpha placeholder item${marketItemCount === 1 ? "" : "s"}`);
  return pieces.join("; ");
}

function isRealTickerPortfolio(uiState = "") {
  return [
    "IMPORTED_CLEAN",
    "IMPORTED_WITH_SKIPPED_ROWS",
    "IMPORTED_PARTIAL_REVIEW",
    "STALE_PERSISTED_REPAIRED"
  ].includes(uiState);
}

function benchmarkDailyChangePercentFromSnapshot(snapshot = null, excludedTicker = "") {
  const normalizedExcludedTicker = normalizeTicker(excludedTicker);
  const quotes = (Array.isArray(snapshot?.quotes) ? snapshot.quotes : Object.values(snapshot?.quotesByTicker || {}))
    .filter((quote) => normalizeTicker(quote.ticker) !== normalizedExcludedTicker);
  const preferred = ["QQQ", "VGT", "SPY", "VOO"]
    .map((ticker) => quotes.find((quote) => normalizeTicker(quote.ticker) === ticker))
    .find(Boolean);
  if (preferred) return Number(preferred.dailyChangePercent) || 0;
  const values = quotes.map((quote) => Number(quote.dailyChangePercent)).filter(Number.isFinite);
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function quoteMapFromSnapshot(snapshot = null) {
  if (!snapshot) return new Map();
  const quotes = Array.isArray(snapshot.quotes) ? snapshot.quotes : Object.values(snapshot.quotesByTicker || {});
  return new Map(quotes.map((quote) => [normalizeTicker(quote.ticker), quote]).filter(([ticker]) => ticker));
}

function weighted(score, weight) {
  return roundScore((Number(score) || 0) * weight);
}

function currencyText(value) {
  return `$${(Number(value) || 0).toFixed(2)}`;
}

function signedPercentText(value) {
  const numeric = Number(value) || 0;
  return `${numeric >= 0 ? "+" : ""}${(numeric * 100).toFixed(2)}%`;
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function riskRank(value = "") {
  if (/very high/i.test(value)) return 4;
  if (/high/i.test(value)) return 3;
  if (/medium/i.test(value)) return 2;
  if (/low/i.test(value)) return 1;
  return 0;
}

function confidenceLevelScore(value = "") {
  const text = String(value || "").toLowerCase();
  if (/medium-high/.test(text)) return 0.66;
  if (/medium-low/.test(text)) return 0.42;
  if (/very high|high/.test(text)) return 0.78;
  if (/medium/.test(text)) return 0.55;
  if (/low/.test(text)) return 0.3;
  return 0.44;
}

function thesisStatusScore(value = "") {
  const text = String(value || "").toLowerCase();
  if (/supported|active|current/.test(text)) return 0.72;
  if (/needs review|stale|mixed/.test(text)) return 0.56;
  if (/missing|needs thesis/.test(text)) return 0.36;
  if (/contradicted|breaking/.test(text)) return 0.2;
  return 0.46;
}

function thesisReviewNeedScore(value = "") {
  const text = String(value || "").toLowerCase();
  if (/contradicted|breaking/.test(text)) return 0.92;
  if (/missing|needs thesis/.test(text)) return 0.78;
  if (/needs review|stale|mixed/.test(text)) return 0.66;
  if (/supported|active|current/.test(text)) return 0.24;
  return 0.54;
}

function riskReviewScore(value = "") {
  const text = String(value || "").toLowerCase();
  if (/very high/.test(text)) return 0.9;
  if (/high/.test(text)) return 0.7;
  if (/medium/.test(text)) return 0.5;
  if (/low/.test(text)) return 0.28;
  return 0.45;
}

function scoreHoldingQuality({ holding = null, institutionalQuant = {} } = {}) {
  const quantScore = Number.isFinite(Number(institutionalQuant.compositeScore))
    ? clampScore(Number(institutionalQuant.compositeScore) / 100)
    : Number.isFinite(Number(holding?.quant))
      ? clampScore((Number(holding.quant) || 0) / 5)
      : 0.5;
  const quantConfidence = Number.isFinite(Number(institutionalQuant.confidenceScore))
    ? clampScore(Number(institutionalQuant.confidenceScore) / 100)
    : 0.42;
  const dataCoverage = Number.isFinite(Number(institutionalQuant.dataCoverageScore))
    ? clampScore(Number(institutionalQuant.dataCoverageScore) / 100)
    : 0.38;
  const thesisQuality = holding ? 1 - thesisReviewNeedScore(holding.thesisStatus) : 0.42;
  const concentrationDrag = holding?.marketValue ? scoreConcentrationRisk(holding) * 0.12 : 0;
  return Math.round(clampScore(quantScore * 0.5 + quantConfidence * 0.2 + dataCoverage * 0.14 + thesisQuality * 0.16 - concentrationDrag) * 100);
}

function holdingQualityLabel(score) {
  const value = Number(score) || 0;
  if (value >= 78) return "strong quality context";
  if (value >= 62) return "constructive quality context";
  if (value >= 45) return "mixed quality context";
  return "weak or incomplete quality context";
}

function clampScore(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function roundScore(value) {
  return Math.round(clampScore(value) * 1000) / 1000;
}

function currencyLike(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `$${numeric.toFixed(numeric >= 100 ? 2 : 2)}` : "--";
}

function percentLike(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${(numeric * 100).toFixed(2)}%` : "--";
}

function formatSignedNumber(value) {
  const numeric = Number(value) || 0;
  return `${numeric >= 0 ? "+" : ""}${numeric.toFixed(2)}`;
}

function formatScoreText(value) {
  return `${Math.round((Number(value) || 0) * 100)}/100`;
}
