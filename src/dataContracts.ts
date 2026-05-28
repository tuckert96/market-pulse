export type AccountType = "Taxable" | "Retirement" | "HSA" | "Cash" | "Unknown" | string;
export type AssetClass = "Equity" | "ETF" | "Cash" | "Treasuries" | "Option" | "Crypto" | string;
export type DataSourceType = "csv" | "xlsx" | "provider" | "demo" | "manual" | "api" | "social" | "filing" | "market-data" | "event-calendar";
export type DataSourceStatusValue = "demo" | "imported" | "configured" | "setup-required" | "missing-key" | "error" | "disabled" | "stale" | "stale-data";
export type MarketDataStatusValue = "not configured" | "configured-not-connected" | "live-ready" | "mock/sample mode" | "connected" | "cached" | "partial data" | "rate limited" | "error" | "stale data" | "disabled";
export type DataModeLabel = "Sample" | "Imported" | "Live" | "Cached" | "Stale" | "Error" | "Not configured" | "No data loaded";
export type EvidenceGrade = "A" | "B" | "C" | "D" | "F";
export type AlertSeverity = "info" | "watch" | "warning" | "critical" | "low" | "medium" | "high" | "positive";
export type ActionCategory = "Critical Review" | "Review" | "Monitor" | "Positive Signal" | "Log Only" | "Ignore";
export type SignalSourceType = "news" | "social" | "filing" | "price" | "macro" | "earnings" | "manual";
export type CalendarEventType = "earnings" | "ex-dividend" | "investor-day" | "product-event" | "fed-macro" | "custom";
export type CalendarEventImportance = "low" | "medium" | "high";
export type CalendarEventSourceMode = "mock" | "imported" | "manual" | "live" | "stale" | "error";
export type WhatIfAction = "add" | "trim-dollar" | "trim-percent" | "remove" | "rebalance-target";
export type HoldingRiskCategory = "core_mega_cap" | "cyclical_high_beta" | "speculative_growth" | "leveraged_etf" | "broad_index";
export type RiskAction = "hold" | "review" | "trim" | "exit";
export type RecommendationType =
  | "investigate"
  | "watch"
  | "add to watchlist"
  | "review position"
  | "trim risk"
  | "possible add"
  | "possible exit/reduce"
  | "stale data review";
export type ThesisImpact =
  | "supports thesis"
  | "weakens thesis"
  | "breaks thesis"
  | "confirms known risk"
  | "introduces new risk"
  | "requires review"
  | "no thesis impact / noise";

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  provider: "csv" | "plaid" | "snaptrade" | "demo" | "manual" | string;
  institution?: string;
  accountNumberMasked?: string;
  asOf?: string;
  cashBalance?: number;
  marketValue?: number;
  currency?: "USD" | string;
}

export interface Holding {
  id: string;
  accountId?: string;
  ticker: string;
  name: string;
  account: string;
  accountType: AccountType;
  shares: number;
  price: number;
  marketValue: number;
  costBasis?: number;
  unrealizedGain?: number;
  unrealizedGainPercent?: number;
  dailyChange?: number;
  dailyChangePercent?: number;
  targetWeight?: number;
  sector: string;
  assetClass: AssetClass;
  strategySleeve?: string;
  thesisStatus?: string;
  riskLevel?: string;
  riskCategory?: HoldingRiskCategory | string;
  quant?: number;
  valuationGrade?: string;
  growthGrade?: string;
  profitabilityGrade?: string;
  momentumGrade?: string;
  revisionsGrade?: string;
  dividendYield?: number;
  dividendGrade?: string;
  grossMargin?: number;
  freeCashFlowMargin?: number;
  grossProfit?: number;
  grossProfits?: number;
  grossProfitTTM?: number;
  totalAssets?: number;
  assets?: number;
  grossProfitToAssets?: number;
  grossProfitsToAssets?: number;
  grossProfitability?: number;
  priceToSales?: number;
  bookEquity?: number;
  bookValue?: number;
  bookToMarket?: number;
  earningsYield?: number;
  cashFlowYield?: number;
  operatingCashFlow?: number;
  capitalExpenditures?: number;
  freeCashFlow?: number;
  cashAndEquivalents?: number;
  totalDebt?: number;
  debtToEquity?: number;
  nextEarnings?: string;
  leveragedMultiple?: number;
  beta?: number;
  isLeveragedEtf?: boolean;
  isSemiconductor?: boolean;
  isAiTheme?: boolean;
  isMegaCapTech?: boolean;
  marketDataProvider?: string;
  marketDataMode?: "mock" | "live" | "cached" | "stale" | "demo" | "not-configured" | string;
  marketDataStatus?: MarketDataStatusValue | string;
  marketDataAsOf?: string;
  marketDataPrice?: number;
  marketDataDailyChange?: number;
  marketDataDailyChangePercent?: number;
  marketDataMarketCap?: number;
  marketDataVolume?: number;
  marketDataAverageVolume?: number;
  marketDataIndustry?: string;
  marketData52WeekHigh?: number;
  marketData52WeekLow?: number;
  momentumLookbackMonths?: number;
  momentumSkipMonths?: number;
  historicalPriceSource?: string;
  historicalPriceFrequency?: "daily" | "weekly" | "monthly" | string;
  historicalPrices?: Array<{ date: string; close: number; open?: number; high?: number; low?: number; volume?: number }>;
  marketDataHistoricalPrices?: Array<{ date: string; close: number; open?: number; high?: number; low?: number; volume?: number }>;
  marketDataIsMock?: boolean;
  marketDataAppliedToDailyChange?: boolean;
  dailyChangeSource?: string;
  source: string;
  sourceAsOf: string;
}

export interface WatchlistItem {
  id: string;
  ticker: string;
  name?: string;
  status: "researching" | "watching" | "candidate" | "rejected" | "owned";
  thesis: string;
  catalyst?: string;
  targetEntryZone?: string;
  riskNotes?: string;
  timeHorizon?: string;
  conviction: "High" | "Medium-high" | "Medium" | "Medium-low" | "Low" | "Unrated";
  sourceOfIdea: string;
  signalSource?: "manual" | "ticker-signal" | "reddit" | "politician" | "market-intelligence" | "owned-holding" | "sample";
  sector?: string;
  targetWeight?: number;
  dateAdded: string;
  lastReviewed?: string;
  notes?: string;
}

export interface DecisionJournalEntry {
  id: string;
  dateTime: string;
  ticker: string;
  decisionType: "buy" | "sell" | "hold" | "trim" | "add" | "watch" | "reject";
  thesisNote: string;
  riskNote?: string;
  catalyst?: string;
  conviction: "High" | "Medium-high" | "Medium" | "Medium-low" | "Low" | "Unrated";
  signalSnapshot?: {
    ticker?: string;
    capturedAt: string;
    combinedScore?: number;
    actionCategory?: string;
    confidenceScore?: number;
    materialityScore?: number;
    sourceLabel?: string;
    topHeadline?: string;
    missingData?: string[];
    warnings?: string[];
  } | null;
  source?: "local-decision-journal" | string;
  executionStatus?: "not-executed";
  updatedAt?: string;
}

export interface CalendarEvent {
  id: string;
  ticker?: string;
  tickers: string[];
  eventType: CalendarEventType;
  typeLabel?: string;
  date: string;
  timestamp?: string;
  title: string;
  summary?: string;
  importance: CalendarEventImportance;
  sourceMode: CalendarEventSourceMode;
  sourceLabel: string;
  sourceUrl?: string;
  notes?: string;
  detectedAt: string;
  importedAt?: string;
  staleAfter?: string;
  custom?: boolean;
}

export interface WhatIfScenario {
  action: WhatIfAction;
  ticker: string;
  amount?: number;
  percent?: number;
  targetWeight?: number;
  fundingMode: "cash-first" | "external";
  readOnly: true;
}

export interface WhatIfResult {
  status: "ready" | "invalid";
  message: string;
  scenario: WhatIfScenario;
  readOnly: true;
  deltas: {
    totalValue: { before: number; after: number; delta: number };
    cashBalance: { before: number; after: number; delta: number };
    top10Weight: { before: number; after: number; delta: number };
    concentrationScore: { before: number; after: number; delta: number };
    leveragedDirectExposure: { before: number; after: number; delta: number };
    leveragedNotionalExposure: { before: number; after: number; delta: number };
  };
  tickerRows: Array<{ ticker: string; beforeValue: number; afterValue: number; deltaValue: number; beforeWeight: number; afterWeight: number; deltaWeight: number }>;
  sectorRows: Array<{ name: string; beforeValue: number; afterValue: number; deltaValue: number; beforeWeight: number; afterWeight: number; deltaWeight: number }>;
  riskRows: Array<{ id: string; label: string; before: number; after: number; delta: number; format: "currency" | "percent" | "number" }>;
  alertsTriggered: Alert[];
  alertsResolved: Alert[];
  warnings: string[];
}

export interface TickerSignal {
  id: string;
  ticker: string;
  headline: string;
  summary: string;
  sourceType: SignalSourceType;
  sourceIds: string[];
  affectedTickers: string[];
  eventType: string;
  thesisImpact: ThesisImpact;
  actionCategory: ActionCategory;
  evidenceGrade: EvidenceGrade;
  materialityScore: number;
  confidenceScore: number;
  priorityScore: number;
  detectedAt: string;
  staleAfter?: string;
  sourceUrl?: string;
  scoreModelVersion?: string;
  scoreKind?: "review-priority" | string;
  scoreScale?: "0-100" | string;
  confidenceCapReason?: string;
  priceMomentumPlaceholder?: number;
  priceMomentumScore?: number;
  relativeStrengthPlaceholder?: number;
  relativeStrengthScore?: number;
  redditMentionScore?: number;
  redditMentionAccelerationScore?: number;
  redditMentionAcceleration?: number;
  redditSentimentScore?: number;
  redditSentimentPlaceholder?: string;
  politicianBuyScore?: number;
  politicianSellScore?: number;
  politicianActivityScore?: number;
  ownershipWatchlistScore?: number;
  thesisConvictionRiskScore?: number;
  concentrationRiskScore?: number;
  institutionalQuantScore?: number;
  institutionalQuantRawScore?: number;
  institutionalQuantEvidenceCapScore?: number;
  institutionalQuantEvidenceCapReasons?: string[];
  institutionalQuantScoreWasEvidenceCapped?: boolean;
  institutionalQuantLabel?: string;
  institutionalQuantConfidenceScore?: number;
  institutionalQuantDataCoverageScore?: number;
  institutionalQuantDataCoverageLabel?: string;
  institutionalQuantPeerGroup?: string;
  institutionalQuantPeerGroupType?: "sector-peer-group" | "exposure-peer-group" | string;
  institutionalQuantPeerRank?: number | null;
  institutionalQuantPeerCount?: number;
  institutionalQuantPeerPercentile?: number | null;
  institutionalQuantPeerLabel?: string;
  institutionalQuantPeerSummary?: string;
  institutionalQuantPeerWarning?: string;
  institutionalQuantPreviousScore?: number | null;
  institutionalQuantPreviousScoreDate?: string | null;
  institutionalQuantScoreChange?: number | null;
  institutionalQuantScoreTrend?: "new" | "improving" | "stable" | "deteriorating" | string;
  institutionalQuantScoreTrendLabel?: string;
  institutionalQuantHistoryPoints?: number;
  institutionalQuantScoreHistoryLabel?: string;
  institutionalQuantModelVersion?: string;
  institutionalQuantScoreKind?: "stock-quality-decision-support" | "fund-exposure-decision-support" | string;
  institutionalQuantSecurityKind?: "operating-company" | "fund-or-etf" | string;
  institutionalQuantFactorScores?: Record<string, number>;
  institutionalQuantFactorCoverage?: Record<string, "covered" | "partial" | "thin" | string>;
  institutionalQuantFactors?: Array<{
    key: string;
    label: string;
    score: number;
    weight: number;
    weightedPoints: number;
    driver: string;
    missingData?: string[];
    coverageStatus?: "covered" | "partial" | "thin" | string;
    coverageScore?: number;
    details?: Record<string, unknown>;
  }>;
  institutionalQuantAcademicCompositeScore?: number;
  institutionalQuantAcademicModelVersion?: string;
  institutionalQuantAcademicFactors?: Array<{
    key: string;
    label: string;
    paper: string;
    score: number;
    weight?: number;
    weightedPoints?: number;
    driver: string;
    missingData?: string[];
    methodology?: string;
    details?: Record<string, unknown>;
  }>;
  institutionalQuantAcademicValidationWarnings?: string[];
  institutionalQuantAcademicResearchAnchors?: string[];
  institutionalQuantAcademicCaveat?: string;
  institutionalQuantStrengths?: string[];
  institutionalQuantWeaknesses?: string[];
  institutionalQuantMissingData?: string[];
  institutionalQuantDataSufficiencyWarnings?: string[];
  institutionalQuantExplanation?: string;
  institutionalQuantSourceFreshness?: string;
  institutionalQuantModelGovernance?: Record<string, unknown>;
  institutionalQuantCaveat?: string;
  portfolioOwnershipFlag?: boolean;
  watchlistFlag?: boolean;
  confluenceScore?: number;
  combinedScore?: number;
  sourceMode?: "mock-local-only" | "demo" | "live" | string;
  liveProviderCalls?: boolean;
  marketDataPrice?: number;
  marketDataDailyChangePercent?: number;
  marketDataVolume?: number;
  marketDataSourceLabel?: string;
  marketDataStatus?: MarketDataStatusValue | string;
  marketDataMode?: "mock" | "live" | "cached" | "stale" | "demo" | "not-configured" | string;
  marketDataLabel?: string;
  whyScoreIsHigh?: string[];
  missingData?: string[];
  dataModeDetails?: string[];
  formulaLabel?: string;
  scoreBreakdown?: Record<string, number>;
  scoreLayers?: Array<{
    key: string;
    label: string;
    score: number;
    weight: number;
    contribution: number;
    dataMode: string;
    missingData?: string[];
    note?: string;
  }>;
  topDrivers?: Array<{
    sourceType: string;
    label: string;
    score: number;
    reason: string;
    sourceIds?: string[];
  }>;
}

export interface QuantScoreHistoryEntry {
  schemaVersion: number;
  ticker: string;
  date: string;
  timestamp: string;
  modelVersion: string;
  scoreKind: "stock-quality-decision-support" | "fund-exposure-decision-support" | string;
  securityKind: "operating-company" | "fund-or-etf" | string;
  portfolioMode: "sample" | "imported" | "local" | "no-data" | string;
  score: number;
  rawScore?: number | null;
  confidenceScore?: number | null;
  dataCoverageScore?: number | null;
  peerGroup?: string;
  peerRank?: number | null;
  peerCount?: number | null;
  label?: string;
  sourceFreshness?: string;
}

export interface MarketDataQuote {
  id: string;
  ticker: string;
  name: string;
  price: number;
  previousClose: number;
  dailyChange: number;
  dailyChangePercent: number;
  dayOpen?: number;
  dayHigh?: number;
  dayLow?: number;
  marketCap?: number;
  grossProfit?: number;
  grossProfits?: number;
  grossProfitTTM?: number;
  totalAssets?: number;
  assets?: number;
  grossProfitToAssets?: number;
  grossProfitsToAssets?: number;
  grossProfitability?: number;
  bookEquity?: number;
  bookValue?: number;
  bookToMarket?: number;
  earningsYield?: number;
  cashFlowYield?: number;
  volume?: number;
  averageVolume?: number;
  sector?: string;
  industry?: string;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  momentumLookbackMonths?: number;
  momentumSkipMonths?: number;
  historicalPriceSource?: string;
  historicalPriceFrequency?: "daily" | "weekly" | "monthly" | string;
  historicalPrices?: Array<{
    date: string;
    close: number;
    open?: number;
    high?: number;
    low?: number;
    volume?: number;
  }>;
  providerId: string;
  providerLabel: string;
  source: string;
  sourceMode: "mock" | "live" | "demo" | "not-configured" | string;
  dataFreshness?: "live" | "cached" | "stale" | "mock" | string;
  cacheStatus?: "live" | "cached" | "stale" | "mock" | string;
  fetchedAt?: string;
  providerName?: string;
  lastSuccessfulRefresh?: string;
  lastError?: {
    message: string;
    at?: string;
  } | null;
  isMock: boolean;
  liveProviderCalls: boolean;
  asOf: string;
  staleAfter?: string;
}

export interface MarketDataProviderStatus {
  status: MarketDataStatusValue | string;
  label: string;
  detail: string;
  providerId: string;
  providerLabel: string;
  mode: string;
  configured: boolean;
  liveProviderCalls: boolean;
  quoteCount: number;
  asOf?: string | null;
  fetchedAt?: string | null;
  dataFreshness?: string;
  cacheStatus?: string;
  lastSuccessfulRefresh?: string | null;
  lastError?: {
    message: string;
    at?: string;
  } | null;
}

export interface MarketDataProviderConfig {
  selectedProvider: string;
  selectedLabel: string;
  recommendedProvider: string;
  recommendedLabel: string;
  configured: boolean;
  disabled: boolean;
  liveEnabled: boolean;
  liveProviderCalls: boolean;
  exposesSecretValues: boolean;
  status: MarketDataStatusValue | string;
  label: string;
  detail: string;
  missingEnv: string[];
  sourceTypes: string[];
  capabilities: string[];
  cacheTtls?: {
    quoteTtlMs: number;
    profileTtlMs: number;
    historyTtlMs: number;
  };
  warning?: string;
}

export interface MarketDataSnapshot {
  providerId: string;
  providerLabel: string;
  mode: "mock" | "live" | "demo" | "not-configured" | string;
  configured: boolean;
  liveProviderCalls: boolean;
  asOf: string;
  fetchedAt?: string;
  dataFreshness?: string;
  cache?: {
    enabled: boolean;
    providerName: string;
    status: string;
    freshness: string;
    fetchedAt?: string | null;
    quoteCount: number;
    hitCount: number;
    liveCount: number;
    staleCount: number;
    mockCount: number;
    ttlConfig?: {
      quoteTtlMs: number;
      profileTtlMs: number;
      historyTtlMs: number;
    } | null;
    lastSuccessfulRefresh?: string | null;
    lastError?: {
      message: string;
      at?: string;
    } | null;
  };
  lastSuccessfulRefresh?: string | null;
  lastError?: {
    message: string;
    at?: string;
  } | null;
  quotes: MarketDataQuote[];
  quotesByTicker: Record<string, MarketDataQuote>;
  requestedTickers?: string[];
  missingTickers?: string[];
  warnings?: string[];
  error?: string;
  sourceTypes: string[];
  status: MarketDataProviderStatus;
}

export interface RedditMention {
  id: string;
  sourceId: string;
  ticker: string;
  subreddit: string;
  createdAt: string;
  title?: string;
  commentText?: string;
  text: string;
  score: number;
  upvotes: number;
  commentCount: number;
  permalink?: string;
  sourceUrl: string;
  body?: string;
  extractedTickers: string[];
  sentiment: "bullish" | "bearish" | "mixed" | "neutral" | "unknown";
  sentimentPlaceholder?: string;
  credibilityScore: number;
  engagementScore: number;
  isRumor: boolean;
  citesPrimarySource: boolean;
  detectedAt: string;
  staleAfter?: string;
  source?: string;
  sourceMode?: "mock" | "api" | "local-file" | "not-configured" | string;
  providerId?: string;
  providerLabel?: string;
  liveProviderCalls?: boolean;
  dataFreshness?: "fresh" | "cached" | "stale" | "error" | string;
  cacheStatus?: "fresh" | "cached" | "stale" | "error" | string;
  apiRecordKind?: "post" | "comment" | string;
  providerRecordId?: string;
  threadSourceId?: string;
  parentSourceId?: string;
  retrievedAt?: string;
  ingestionRunId?: string;
  matchedBy?: "cashtag" | "whitelist" | "provider-search" | "manual" | string;
  upvoteRatio?: number;
  sourceAsOf?: string;
}

export interface RedditImportReport {
  ok: boolean;
  partial: boolean;
  mode: "local-json" | "reddit-api" | "configured-not-connected" | "not-configured" | "rate-limited" | "error" | string;
  fileName?: string;
  fileType?: "json" | string;
  providerId?: string;
  providerLabel?: string;
  sourceMode?: "api" | "local-file" | "mock" | string;
  status?: "connected" | "rate limited" | "error" | "stale" | "mock/sample mode" | string;
  rowsParsed: number;
  mentionsImported: number;
  rejectedRows: Array<{
    rowNumber: number;
    reason: string;
    missingFields?: string[];
  }>;
  missingFields: string[];
  tickersDetected: string[];
  subredditsDetected: string[];
  warnings?: string[];
  fetchedAt?: string;
  dataFreshness?: "fresh" | "cached" | "stale" | "error" | string;
  liveProviderCalls: boolean;
}

export interface RedditProviderConfig {
  selectedProvider: string;
  selectedLabel: string;
  configured: boolean;
  oauthReady: boolean;
  liveEnabled: boolean;
  liveProviderCalls: boolean;
  exposesSecretValues: boolean;
  status: "not configured" | "configured-not-connected" | "configured" | "connected" | "rate limited" | "error" | "stale" | "mock/sample mode" | string;
  label: string;
  detail: string;
  requiredEnv: string[];
  optionalEnv: string[];
  missingEnv: string[];
  credentialLocation: "server-only .env" | "none" | string;
  postLimit?: number;
  commentLimit?: number;
  ttlMinutes?: number;
  subreddits: string[];
  whitelist: string[];
  falsePositives: string[];
}

export interface PoliticianTrade {
  id: string;
  ticker: string;
  politicianName: string;
  chamber: "House" | "Senate" | string;
  party: string;
  state: string;
  assetName: string;
  office: string;
  transactionType: "purchase" | "sale" | "exchange" | "unknown";
  transactionDate: string;
  disclosureDate: string;
  amountRangeLow: number;
  amountRangeHigh: number;
  amountRange: {
    min: number;
    max: number;
  };
  owner: string;
  tradedAt?: string;
  disclosedAt: string;
  sourceUrl: string;
  sourceType: "disclosure" | "filing" | "provider";
  sourceMode?: "mock" | "local-file" | "public-static-dataset" | "future-api" | "official-disclosure-parser" | string;
  providerId?: string;
  providerRecordId?: string;
  liveProviderCalls?: boolean;
  dataFreshness?: "fresh" | "cached" | "stale" | "error" | string;
  cacheStatus?: "fresh" | "cached" | "stale" | "error" | string;
  confidenceScore: number;
  recencyScore: number;
  sizeScore: number;
  committeeRelevanceScore: number;
  committeeRelevancePlaceholder?: string;
  clusterScore: number;
  clusterScorePlaceholder?: string;
  notes?: string;
}

export interface PoliticianTradeImportReport {
  ok: boolean;
  partial?: boolean;
  mode: "local-file" | "public-static-dataset" | "mock" | string;
  fileName: string;
  fileType?: "csv" | "json" | "unknown" | string;
  detectedColumns: string[];
  rowsParsed: number;
  tradesImported: number;
  rejectedRows: Array<{
    rowNumber: number;
    reason: string;
    raw?: Record<string, unknown>;
  }>;
  missingFields: string[];
  tickersDetected: string[];
  validation: {
    ok: boolean;
    errors: string[];
    warnings: string[];
  };
  liveProviderCalls: boolean;
  providerId?: string;
  providerLabel?: string;
  sourceCoverage?: string;
  sourceRecommendation?: string;
  primarySource?: string;
  cacheStatus?: "fresh" | "cached" | "stale" | "error" | string;
  fetchedAt?: string;
  dataFreshness?: "fresh" | "cached" | "stale" | "error" | string;
  warnings: string[];
}

export interface PoliticianTradeProviderConfig {
  selectedProvider: "mock" | "senate-stock-watcher" | "public-static-dataset" | string;
  label: string;
  mode: "mock" | "public-static-dataset" | "not-connected" | string;
  configured: boolean;
  configuredPending: boolean;
  liveEnabled: boolean;
  liveProviderCalls: boolean;
  sourceUrlConfigured: boolean;
  usesDefaultSourceUrl: boolean;
  sourceCoverage?: string;
  sourceRecommendation?: string;
  primarySource?: string;
  requiredEnv: string[];
  optionalEnv: string[];
  missingEnv: string[];
  status: "mock/sample mode" | "configured-not-connected" | "configured" | string;
  detail: string;
}

export type ExternalSignalSourceType = "x" | "reddit" | "federal-trade";

export type ExternalSignalSourceMode =
  | "mock"
  | "manual"
  | "local-file"
  | "api"
  | "public-static-dataset"
  | "not-configured"
  | "blocked";

export interface NewsUpdate {
  id: string;
  modelVersion: "external-signal-v1" | string;
  kind: "news-update";
  sourceType: ExternalSignalSourceType;
  sourceMode: ExternalSignalSourceMode;
  sourceLabel: string;
  providerId?: string;
  providerLabel?: string;
  liveProviderCalls: boolean;
  signalType: "social-update" | "social-mention" | "federal-trade-disclosure" | string;
  signalSubtype: string;
  actionability: "review-context-only";
  trustLevel: "low" | "medium" | "medium-high" | "high" | "mixed" | "unknown";
  primaryTicker: string;
  tickers: string[];
  headline: string;
  summary: string;
  sentiment: "bullish" | "bearish" | "mixed" | "neutral" | "unknown";
  sourceIds?: string[];
  sourceUrl?: string;
  occurredAt: string;
  detectedAt: string;
  staleAfter?: string;
  warnings: string[];
  metadata?: Record<string, unknown>;
}

export type ExternalSignal = NewsUpdate;

export interface Alert {
  id: string;
  type: "allocation" | "risk" | "data-quality" | "alpha" | "market-intelligence" | "thesis" | "connector" | "position-weight" | "sector-concentration" | "leveraged-etf-exposure" | "ticker-signal" | "politician-trade-match" | "reddit-mention-acceleration" | "data-source" | string;
  ruleId?: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  ticker?: string;
  score: number;
  source?: string;
  actionCategory?: ActionCategory;
  status: "active" | "reviewed" | "hidden";
  createdAt?: string;
  metadata?: Record<string, unknown>;
}

export interface Recommendation {
  id: string;
  ticker?: string;
  recommendationType: RecommendationType;
  title: string;
  summary: string;
  confidenceScore: number;
  recencyScore: number;
  impactScore: number;
  urgencyScore: number;
  dataQualityScore: number;
  riskScore: number;
  riskAdjustedFitScore: number;
  ownershipRelevanceScore: number;
  sourceFreshnessScore: number;
  alertSeverityScore: number;
  priceMovementScore: number;
  concentrationRiskScore: number;
  portfolioWeight: number;
  compositeRankScore: number;
  supportingSignals: string[];
  missingWeakSignals: string[];
  sourceFreshness: "mock" | "imported" | "live" | "cached" | "stale" | "missing" | "local" | string;
  relatedHoldingsStatus: "owned" | "watchlist" | "signal-only" | "portfolio" | string;
  sourceModes: string[];
  sourceIds: string[];
  href: string;
  whyThisRank: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DataSourceStatus {
  id: string;
  name: string;
  type: DataSourceType;
  status: DataSourceStatusValue;
  provider?: string;
  trustLevel: "low" | "medium" | "medium-high" | "high" | "mixed" | "unknown";
  liveEnabled: boolean;
  lastSyncAt?: string;
  sourceTypes: SignalSourceType[];
  requiredEnv?: string[];
  missingEnv?: string[];
  credentialLocation?: "none" | "local-env" | "server-only";
  warnings: string[];
}

export interface LocalDataBundle {
  schemaVersion: number;
  generatedAt: string;
  accounts: Account[];
  holdings: Holding[];
  watchlist: WatchlistItem[];
  decisionJournal?: DecisionJournalEntry[];
  eventCalendar?: CalendarEvent[];
  tickerSignals: TickerSignal[];
  marketDataQuotes: MarketDataQuote[];
  redditMentions: RedditMention[];
  politicianTrades: PoliticianTrade[];
  externalSignals?: ExternalSignal[];
  alerts: Alert[];
  dataSources: DataSourceStatus[];
}
