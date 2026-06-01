# Local Data Contracts

Market Pulse is local-first. Future providers should normalize into these contracts before they touch portfolio analytics, alerts, Alpha Engine scoring, or UI screens.

Runtime code still uses lightweight JavaScript normalizers. TypeScript contracts live in `src/dataContracts.ts` so future API/provider work has a clear target without forcing a framework migration today.

## Current Storage Model

- `localStorage`: active app state for holdings, thesis profiles, targets, alerts, connector status, Alpha events, and market events.
- CSV/XLSX files: user-authorized local imports.
- Holdings JSON files: user-authorized local position imports for provider-shaped exports or local fixtures.
- JSON backup/export: local state backup for restore.
- No database exists yet.

## Fixture

`data/local-data-fixtures.json` is the canonical example bundle for future integrations. It includes:

- imported Fidelity-style holdings
- account containers
- watchlist items
- decision journal entries
- event calendar rows
- ticker signals
- market data quote shape
- Reddit mention shape
- politician trade disclosure shape
- alerts
- data source statuses
- optional compact Quant Lens score history

Validate it with:

```bash
npm run validate:data
```

## Contracts

### Holding

One position in one account. Existing implementation: `src/portfolioSchema.js`.

Provider adapters must preserve account-level rows. Do not collapse the same ticker across accounts before canonical normalization. Same ticker/account rows from brokerage lot exports may be merged only when the report surfaces the duplicate merge and sums shares, market value, cost basis, and gain/loss deterministically.

Portfolio CSV/JSON imports should run through a preview before they replace active holdings. Validation errors must remain row-level so a bad footer, disclaimer, or malformed row cannot crash the whole import.

Required fields:

- `id`
- `accountId` optional link to an `Account.id`
- `ticker`
- `name`
- `account`
- `accountType`
- `shares`
- `price`
- `marketValue`
- `sector`
- `assetClass`
- `source`
- `sourceAsOf`

Optional quant-engine fields should be preserved when a provider or import supplies them:

- Novy-Marx profitability inputs: `grossProfit`, `grossProfits`, `grossProfitTTM`, `totalAssets`, `assets`, `grossProfitToAssets`, `grossProfitsToAssets`, or `grossProfitability`
- Value inputs: `bookEquity`, `bookValue`, `bookToMarket`, `earningsYield`, `cashFlowYield`, `forwardPe`, and `priceToSales`
- Momentum inputs: `historicalPrices`, `marketDataHistoricalPrices`, `momentumLookbackMonths`, `momentumSkipMonths`, `historicalPriceSource`, and `historicalPriceFrequency`

Adapters may provide direct ratios such as `grossProfitToAssets` or raw numerator/denominator fields such as `grossProfit` and `totalAssets`. Do not drop these fields during account/ticker aggregation; the Quant Lens needs them to keep paper-backed profitability, value, and momentum diagnostics separate from generic factor grades.

### Account

Brokerage/account container used for account-level summaries and future provider linking.

Required fields:

- `id`
- `name`
- `type`
- `provider`

Optional fields include `institution`, `accountNumberMasked`, `asOf`, `cashBalance`, `marketValue`, and `currency`.

### WatchlistItem

Local watchlist row for tracked tickers, whether owned or not.

Required fields:

- `id`
- `ticker`
- `status`: researching, watching, candidate, rejected, or owned
- `thesis`
- `sourceOfIdea`
- `dateAdded`

Optional fields include `name`, `catalyst`, `targetEntryZone`, `riskNotes`, `timeHorizon`, `conviction`, `signalSource`, `sector`, `targetWeight`, `lastReviewed`, and `notes`.

### DecisionJournalEntry

Local decision note tied to a ticker. This is a personal reasoning log only; it is not a brokerage execution record and it never places trades.

Required fields:

- `id`
- `dateTime`
- `ticker`
- `decisionType`: buy, sell, hold, trim, add, watch, or reject
- `thesisNote`
- `conviction`: High, Medium-high, Medium, Medium-low, Low, or Unrated

Optional fields include `riskNote`, `catalyst`, `signalSnapshot`, `source`, `executionStatus`, and `updatedAt`.

`signalSnapshot` can capture the local ticker signal score, action category, confidence/materiality scores, source label, headline, missing data, and warnings that were visible when Tucker saved the note. Snapshots are for auditability and learning; they are not proof that an external data source was live.

### CalendarEvent

Local-first event calendar row for review windows that can affect owned or watchlist tickers. This contract supports sample, imported CSV/JSON, manual/custom, and future live provider events.

Required fields:

- `id`
- `tickers`: array; can be empty only for portfolio-level macro placeholders
- `eventType`: earnings, ex-dividend, investor-day, product-event, fed-macro, or custom
- `date`
- `title`
- `importance`: low, medium, or high
- `sourceMode`: mock, imported, manual, live, stale, or error
- `sourceLabel`
- `detectedAt`

Optional fields include `ticker`, `typeLabel`, `timestamp`, `summary`, `sourceUrl`, `notes`, `importedAt`, `staleAfter`, and `custom`.

Important: sample calendar dates are workflow examples. The UI must label them as Sample and must not present them as live earnings dates. Imported or manual rows should be shown as local data until a future provider is connected.

### WhatIfScenario / WhatIfResult

Read-only portfolio scenario model used by the What-If Simulator. It never mutates real holdings, never places trades, and should not be persisted as active portfolio state unless Tucker explicitly approves an apply workflow later.

Supported scenario actions:

- `add`: add a ticker by dollar amount, using cash first or modeling outside contribution.
- `trim-dollar`: reduce an owned ticker by a dollar amount and move proceeds to simulated cash.
- `trim-percent`: reduce an owned ticker by a percentage and move proceeds to simulated cash.
- `remove`: remove an owned ticker and move proceeds to simulated cash.
- `rebalance-target`: move an owned ticker toward a saved or entered target weight.

`WhatIfResult` should include before/after deltas for total value, cash, top-10 concentration, concentration score, leveraged ETF exposure, ticker weights, sector weights, local alerts triggered, local alerts resolved, and warnings. UI copy must label this as simulation-only and must not describe modeled changes as actual holdings or brokerage instructions.

### TickerSignal

Provider-neutral signal that can feed Alpha Engine, Market Intelligence, Alerts, and Thesis.

Required fields:

- `id`
- `ticker`
- `headline`
- `summary`
- `sourceType`
- `sourceIds`
- `affectedTickers`
- `eventType`
- `thesisImpact`
- `actionCategory`
- `evidenceGrade`
- `materialityScore`
- `confidenceScore`
- `priorityScore`
- `detectedAt`

Scores are decimals from `0` to `1`. Evidence grades are `A`, `B`, `C`, `D`, or `F`.

MVP combined ticker signal rows may add `scoreModelVersion`, `scoreKind`, `scoreScale`, `confidenceCapReason`, `priceMomentumPlaceholder`, `priceMomentumScore`, `relativeStrengthScore`, `redditMentionScore`, `redditMentionAccelerationScore`, `redditSentimentScore`, `redditSentimentPlaceholder`, `politicianBuyScore`, `politicianSellScore`, `politicianActivityScore`, `ownershipWatchlistScore`, `thesisConvictionRiskScore`, `concentrationRiskScore`, `institutionalQuantScore`, `institutionalQuantRawScore`, `institutionalQuantEvidenceCapScore`, `institutionalQuantEvidenceCapReasons`, `institutionalQuantScoreWasEvidenceCapped`, `institutionalQuantLabel`, `institutionalQuantConfidenceScore`, `institutionalQuantDataCoverageScore`, `institutionalQuantDataCoverageLabel`, `institutionalQuantPeerGroup`, `institutionalQuantPeerRank`, `institutionalQuantPeerCount`, `institutionalQuantPeerPercentile`, `institutionalQuantPeerSummary`, `institutionalQuantScoreChange`, `institutionalQuantScoreTrend`, `institutionalQuantScoreHistoryLabel`, `institutionalQuantSecurityKind`, `institutionalQuantScoreKind`, `institutionalQuantFactors`, `institutionalQuantFactorCoverage`, `institutionalQuantAcademicCompositeScore`, `institutionalQuantAcademicModelVersion`, `institutionalQuantAcademicFactors`, `institutionalQuantAcademicValidationWarnings`, `institutionalQuantAcademicResearchAnchors`, `institutionalQuantAcademicCaveat`, `institutionalQuantStrengths`, `institutionalQuantWeaknesses`, `institutionalQuantMissingData`, `institutionalQuantDataSufficiencyWarnings`, `institutionalQuantModelGovernance`, `portfolioOwnershipFlag`, `watchlistFlag`, `confluenceScore`, `combinedScore`, `marketDataPrice`, `marketDataDailyChangePercent`, `marketDataVolume`, `marketDataStatus`, `sourceMode`, `liveProviderCalls`, `whyScoreIsHigh`, `missingData`, `dataModeDetails`, `formulaLabel`, `scoreBreakdown`, `scoreLayers`, and `topDrivers`.

The current local review-priority formula is:

- 22% price momentum
- 14% relative strength placeholder
- 16% Reddit mention acceleration
- 8% Reddit sentiment placeholder
- 16% politician disclosure activity
- 8% ownership/watchlist status
- 10% thesis conviction/risk
- 6% concentration risk

These scores are local review priorities only. Sample market data can feed price momentum and relative strength placeholders, but it must be labeled as Sample and not buy/sell guidance. Concentration risk can raise review priority even when it is not bullish.

`institutionalQuantScore` is the separate Quant Lens stock-quality/exposure model. It is a 0-100 decision-support score with factor details, evidence caps, factor coverage labels, and missing-data notes, not a price forecast or trade command. Operating-company rows use `stock-quality-decision-support`; fund/ETF rows use `fund-exposure-decision-support`.

### MarketDriverReport

Daily broad-market and AI/tech movement explanations are represented by `MarketDriverReport`. The report has two required scopes:

- `broadMarket`: SPY, QQQ, DIA, IWM-style broader market proxies.
- `aiTech`: QQQ, VGT, SMH, SOXX, NVDA, AMD, MU, AVGO, TSM, ASML, AAPL, MSFT, CRDO, SOXL-style AI/tech proxies.

Each scope records direction, average move, confidence score, source status, affected tickers, portfolio exposure, ranked driver rows, missing-data notes, and action-oriented next inspections. Driver rows are deterministic and can come from price action, leadership spreads, X/Reddit attention, source-labeled market events/news read-throughs, federal disclosure context, or active portfolio exposure.

Rules:

- The report is a source-labeled explanation, not confirmed causality.
- Missing market/news/social/macro context must be shown as missing data.
- X/Reddit context is lower-trust and must not become buy/sell guidance.
- Federal disclosure context is delayed and must not be presented as intraday causality.
- Driver rows should link to `#risk`, `#daily`, `#market-intelligence`, `#data-sources`, or ticker pages for deeper inspection.

### QuantScoreHistoryEntry

Optional local backup/restore rows for compact Quant Lens score history. These records are for local comparison only and should not include provider payloads, source text, account numbers, cookies, API keys, or raw holdings rows.

Required fields:

- `ticker`
- `date`
- `timestamp`
- `modelVersion`
- `scoreKind`
- `securityKind`: operating-company or fund-or-etf
- `portfolioMode`: sample, imported, local, or no-data
- `score`: 0-100

Optional fields include `rawScore`, `confidenceScore`, `dataCoverageScore`, `peerGroup`, `peerRank`, `peerCount`, `label`, and `sourceFreshness`. History is scoped by portfolio mode so sample and imported score changes do not mix.

### Recommendation

Ranked Alpha Engine decision-support row generated from existing holdings, alerts, target drift, thesis flags, event calendar items, Alpha signals, ticker signals, and data-source health. Recommendations are not trade orders and do not predict returns.

Required fields:

- `id`
- `ticker`
- `recommendationType`: `investigate`, `watch`, `add to watchlist`, `review position`, `trim risk`, `possible add`, `possible exit/reduce`, or `stale data review`
- `title`
- `summary`
- `confidenceScore`
- `recencyScore`
- `impactScore`
- `urgencyScore`
- `dataQualityScore`
- `riskScore`
- `riskAdjustedFitScore`
- `ownershipRelevanceScore`
- `sourceFreshnessScore`
- `alertSeverityScore`
- `priceMovementScore`
- `concentrationRiskScore`
- `portfolioWeight`
- `compositeRankScore`
- `supportingSignals`
- `missingWeakSignals`
- `sourceFreshness`
- `relatedHoldingsStatus`
- `sourceModes`
- `sourceIds`
- `href`
- `whyThisRank`
- `createdAt`
- `updatedAt`

Composite rank is transparent:

- 22% confidence
- 18% impact
- 12% recency
- 12% urgency
- 10% data quality
- 8% risk-adjusted fit
- 5% ownership relevance
- 4% source freshness
- 3% alert severity
- 3% price movement
- 3% concentration risk

Weak, stale, missing, mock, or not-configured data is shown on the recommendation card and can lower the rank.

### MarketDataQuote

Normalized quote and historical-price context from a market data provider. The dashboard remains mock-first, and live provider slices map Finnhub or Financial Modeling Prep quote/profile/history responses into this same shape through the local backend proxy. Screens and scoring modules should consume this canonical shape rather than provider-specific payloads.

Required fields:

- `id`
- `ticker`
- `name`
- `price`
- `previousClose`
- `dailyChange`
- `dailyChangePercent`
- `providerId`
- `providerLabel`
- `source`
- `sourceMode`
- `isMock`
- `liveProviderCalls`
- `asOf`

Optional fields:

- `fetchedAt`
- `providerName`
- `dataFreshness`: `live`, `cached`, `stale`, `error`, or `mock`
- `cacheStatus`: `live`, `cached`, `stale`, `error`, or `mock`
- `lastSuccessfulRefresh`
- `lastError`
- `marketCap`
- `volume`
- `averageVolume`
- `sector`
- `industry`
- `grossProfit`, `grossProfits`, `grossProfitTTM`, `totalAssets`, `assets`, `grossProfitToAssets`, `grossProfitsToAssets`, `grossProfitability`
- `bookEquity`, `bookValue`, `bookToMarket`, `earningsYield`, `cashFlowYield`
- `momentumLookbackMonths`, `momentumSkipMonths`, `historicalPriceSource`, `historicalPriceFrequency`
- `fiftyTwoWeekHigh`
- `fiftyTwoWeekLow`
- `historicalPrices`
- `staleAfter`

User-facing provider status should use the canonical data mode labels:

- `Sample`: local fixture/example data, not Tucker's real portfolio and not live provider output.
- `Imported`: local CSV/JSON/XLSX/manual data.
- `Live`: fetched through the local backend from a configured provider.
- `Cached`: provider data reused inside the configured TTL.
- `Stale`: cached/provider data past freshness or used after refresh failure.
- `Error`: provider/import refresh failed or returned unusable data.
- `Not configured`: no approved provider credentials or connector path is active.

Internal provider payloads may still include raw values such as `not configured`, `mock/sample mode`, `connected`, `error`, or `stale data`; UI code maps those values into the canonical labels.

`MarketDataSnapshot` also carries request-level integrity fields:

- `requestedTickers`: normalized tickers requested from the provider/cache layer
- `missingTickers`: requested tickers that did not produce a normalized quote
- `warnings`: human-readable notes such as omitted provider rows or stale cache fallback
- `providerAttempts`: safe audit trail of the selected provider, any configured fallback providers, and sample/no-data fallback. Each attempt includes provider id/label, role (`primary`, `fallback`, or `sample`), status, timestamp, quote count, cache status, cache-hit/stale counts, and a redacted safe error reason when applicable.

If a provider omits a ticker that has a prior cached quote, the snapshot can return that quote as `stale` with `lastError` explaining the fallback. It should never fabricate a quote for an invalid or omitted ticker.

Sample quotes are allowed to drive display and placeholder scoring only when clearly labeled. They must not imply live market connectivity.

### RedditMention

Lower-trust social item. It should never be treated as confirmed news unless corroborated.

Required fields:

- `id`
- `sourceId`
- `ticker`
- `subreddit`
- `createdAt`
- `text`
- `score`
- `upvotes`
- `commentCount`
- `sourceUrl`
- `extractedTickers`
- `sentiment`
- `credibilityScore`
- `engagementScore`
- `isRumor`
- `citesPrimarySource`
- `detectedAt`

Optional fields:

- `title`
- `body`
- `commentText`
- `permalink`
- `sentimentPlaceholder`
- `staleAfter`
- `sourceMode`
- `providerId`
- `providerLabel`
- `liveProviderCalls`
- `apiRecordKind`
- `providerRecordId`
- `retrievedAt`
- `fetchedAt`
- `dataFreshness`
- `mentionAcceleration`

Rules:

- Do not scrape Reddit pages.
- Use official/compliant APIs only.
- Keep sample mode as the default.
- Local JSON imports are allowed for testing provider-shaped payloads.
- Reddit rows must come through sample/local import or the local backend, omit usernames/author handles, and carry `sourceMode` plus `liveProviderCalls` so provenance is explicit.
- API keys, OAuth secrets, refresh tokens, auth codes, cookies, and authorization headers must stay out of browser code and exported state.
- Extract tickers through a whitelist and filter common false positives such as `ON`, `BE`, `AI`, `NOW`, `ARE`, `IT`, and `CAN`.
- Keep mention counts as social signal inputs only; do not treat them as confirmed facts.
- Penalize rumor-only mentions in scoring.
- Clearly distinguish social chatter from primary evidence.

### PoliticianTrade

Disclosure or provider-normalized politician trade row.

Required fields:

- `id`
- `ticker`
- `politicianName`
- `chamber`
- `party`
- `state`
- `assetName`
- `office`
- `transactionType`
- `transactionDate`
- `disclosureDate`
- `amountRangeLow`
- `amountRangeHigh`
- `amountRange`
- `owner`
- `tradedAt`
- `disclosedAt`
- `sourceUrl`
- `sourceType`
- `sourceMode`
- `providerId`
- `providerRecordId`
- `liveProviderCalls`
- `confidenceScore`
- `recencyScore`
- `sizeScore`
- `committeeRelevanceScore`
- `committeeRelevancePlaceholder`
- `clusterScore`
- `clusterScorePlaceholder`
- `notes`

Rules:

- Treat disclosure dates and trade dates separately.
- Do not imply intent or causation from a disclosure alone.
- Use ranges; do not invent exact amounts when filings report ranges.
- Keep committee relevance and cluster scoring as placeholders until a real source and mapping are approved.
- Local CSV/JSON imports should preserve `sourceMode: local-file`, `providerId: local-politician-trade-file`, and `liveProviderCalls: false`.
- Public static dataset syncs should preserve `sourceMode: public-static-dataset`, `providerId`, `providerRecordId` when supplied, `liveProviderCalls: true`, provider cache metadata, source recommendation/coverage metadata, and source URLs for individual disclosure rows when available.
- Import reports should surface row counts, rejected-row reasons, missing fields, tickers detected, and validation warnings.
- Static public datasets can be partial. Unknown party/state values are allowed only when the source omits them and should remain visibly labeled as unknown.

See `docs/politician-trade-ingestion.md` for accepted CSV/JSON formats.

### Alert

Action queue item. Alerts should be review prompts, not buy/sell commands.

Required fields:

- `id`
- `type`
- `severity`
- `title`
- `detail`
- `score`
- `status`

Primary local alert severities are `info`, `watch`, `warning`, and `critical`. Legacy/demo rows may still use `low`, `medium`, `high`, or `positive`; UI helpers map those into the same calm action groups.

MVP local alert rules cover position weight, sector/theme concentration, leveraged ETF exposure, ticker signal score, politician disclosure matches, Reddit mention acceleration, and stale/disconnected data-source state. Thresholds are stored locally in dashboard state and never create email, text, push, or external notifications.

### DataSourceStatus

Connector/provider readiness row for Data Sources.

Required fields:

- `id`
- `name`
- `type`
- `status`
- `trustLevel`
- `liveEnabled`
- `sourceTypes`
- `warnings`

Rules:

- API keys belong in local `.env` and server-side config only.
- Browser JavaScript must not expose provider keys.
- Future sources should show `setup-required` or `demo` until approved.

## Minimal Database Path

There is no database layer today. Keep it that way until localStorage and JSON backups become a real limitation.

When a database is needed, migrate in this order:

1. Keep these contracts as the boundary.
2. Add a local repository module that reads/writes `LocalDataBundle`.
3. Back it with IndexedDB for browser-only use, or SQLite for local backend use.
4. Add import/export migrations by `schemaVersion`.
5. Keep CSV/XLSX imports and JSON backup compatible.

Do not let provider adapters write directly into UI state. They should normalize into these contracts first.
