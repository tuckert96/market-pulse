# Alpha Engine Architecture

## Purpose

The Alpha Engine is a demo-mode signal engine for Tucker's portfolio. It is not a news feed and it does not predict exact stock prices. Its job is to turn noisy events into structured review prompts by asking:

1. What changed?
2. Is it factual?
3. Is it material?
4. Is it already priced in?
5. Does it affect revenue, margins, cash flow, rates, liquidity, or positioning?
6. Does it change Tucker's thesis?
7. What would prove the view wrong?

## Demo-Only Scope

Current implementation lives in `src/alphaEngine.js` and uses local demo data only. It does not call Fidelity, Seeking Alpha, X/Twitter, NewsAPI, Finnhub, Polygon, Alpha Vantage, or any other live provider. It does not store passwords, API keys, cookies, or brokerage credentials.

## Canonical Signal Schema

Each normalized signal contains:

- `id`
- `timestamp`
- `detectedAt`
- `sourceType`
- `sourceName`
- `sourceUrl`
- `headline`
- `summary`
- `rawText`
- `tickersMentioned`
- `inferredTickersAffected`
- `affectedTickers`
- `sectorsAffected`
- `themes`
- `eventType`
- `geography`
- `entities`
- `sentiment`
- `confidence`
- `noveltyScore`
- `credibilityScore`
- `relevanceScore`
- `marketImpactScore`
- `expectedDirectionByTicker`
- `scenarioImpactByTicker`
- `timeHorizon`
- `evidence`
- `supportingEvidence`
- `contradictingEvidence`
- `missingEvidence`
- `counterarguments`
- `followUpQuestions`
- `whatToMonitorNext`
- `staleAfter`
- `factualClaim`
- `interpretation`
- `businessMechanism`
- `affectedDrivers`
- `impactOrderByTicker`
- `thesisImpactByTicker`
- `priceAction`

Scored signals also include affected portfolio holdings, thesis impact, materiality score, confidence score, evidence grade, portfolio relevance score, actionability level, position-sizing check, priced-in status, next review question, and priority score.

Presentation metadata also includes:

- `actionLabel`: compact UI label.
- `affectedWeightLabel`: affected portfolio weight.
- `impactType`: direct, second-order, or third-order.
- `whatChanged`
- `whyItMatters`
- `whyThisMattersToTucker`
- `whatCouldProveWrong`
- `isLowSignal`
- `isStaleSignal`
- `noActionRecommendation`

## Decision Brief

The Alpha Engine now produces a "Today's Portfolio Intelligence" decision brief before the signal cards. It summarizes:

- top 3 priority signals
- top 3 portfolio risks
- top 3 items to monitor
- thesis-impacting events
- ignore/log recommendations
- stale data warnings

Reviewed or hidden Alpha Engine alert ids are excluded from the main signal flow, so old or dismissed items do not dominate the dashboard.

## Holdings Ranking And Ranked Review Queue

The Alpha Engine now renders a holdings-first ranking backed by `src/recommendationEngine.js` and the holding-row aggregation in `src/portfolioView.js`. The default UX should answer: "which owned holdings look strongest, mixed, weak, risky, or data-limited right now?"

The ranking is decision-support only, not trading advice, brokerage instructions, or return predictions. It is a queue for inspection. It should never be framed as an automatic buy/sell list.

Each recommendation includes:

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
- `createdAt`
- `updatedAt`

The default ranking formula is:

```text
compositeRankScore =
  22% confidence
  + 18% impact
  + 12% recency
  + 12% urgency
  + 10% data quality
  + 8% risk-adjusted fit
  + 5% ownership relevance
  + 4% source freshness
  + 3% alert severity
  + 3% price movement
  + 3% concentration risk
```

Low-quality data receives an additional penalty, and stale/mock/not-configured/error source states are called out in the row/detail view rather than hidden. Finnhub or other provider quote inputs can raise source freshness and price-movement context when configured, but partial ticker coverage now lowers confidence. Missing quote/current price is treated as the most severe provider gap. Missing history lowers momentum/technical confidence. Missing profile, market cap, sector/industry, 52-week range, or average volume lowers quality/fundamental confidence. The recommendation remains a local review-priority score rather than a return prediction. Low-quality social or rumor-like data can still appear, but it should rank below better-supported portfolio risks and opportunities unless there is strong supporting evidence.

The holdings ranking now uses the Institutional Quant Lens as a first-class quality input. That lens is documented in `docs/quantitative-engine.md` and is still separate from recommendation rank, ticker confluence, and alert severity. A high Quant Lens score can lift the Alpha quality score only when academic factor discipline, source coverage, and validation guardrails support it. Missing, stale, or thin factor inputs remain visible and can lower data quality or cap the integrated quality score.

The current Alpha holding-quality formula is intentionally transparent:

```text
Alpha quality score =
  46% integrated Quant Lens
  + 15% thesis quality
  + 13% data quality
  + 9% source freshness
  + 8% supporting signal agreement
  + 5% price/relative-strength context
  - risk penalty
```

The integrated Quant Lens score combines the capped Institutional Quant Lens score with the academic factor composite. Validation warnings and weak data coverage reduce the integrated contribution before it reaches the Alpha rank.

Recommendation inputs currently include:

- Alpha Engine thesis-impact signals
- combined ticker signal scores
- Institutional Quant Lens stock-quality scores
- active portfolio weight and ownership/watchlist status
- provider quote price movement and source freshness, including Finnhub when configured through the local backend
- per-ticker provider coverage score and missing-field warnings from Finnhub diagnostics
- concentration and leverage risk
- alert severity
- local portfolio alerts
- target allocation drift
- thesis tracker stale/missing/contradicted flags
- event calendar items
- market-data source health

Filters are available for All, Owned, Watchlist, Risk, Opportunities, Data issues, Recent, and High confidence. Each holding row exposes an `Explain score` control with the weighted quality-score math, review-priority math, missing-data handling, and the "Why this rank?" drivers such as high portfolio impact, recency, low data quality, or elevated concentration risk. These are calculated local scores, not AI explanations.

## Quant And No-Fake-Precision Guardrails

Alpha can use Quant Lens and academic factor diagnostics as direct holding-quality inputs, but it must keep these concepts separate:

- holdings ranking: what Tucker should inspect first
- recommendation rank: review-priority queue score
- ticker confluence: source-layer attention score
- Institutional Quant Lens: stock-quality or fund/exposure setup review
- academic factor discipline: validation sidecar for the Quant Lens

The UI should not convert any of those scores into expected returns, price targets, probabilities, or trade instructions. If factor coverage is thin, if peer context has too few comparable names, or if evidence caps/warnings are present, the expanded detail must show those caveats before any high-conviction language.

Paper-backed factor checks should be shown as discipline and limitations: momentum construction, profitability quality, value/momentum balance, risk controls, validation discipline, and ensemble readiness. They are not proof that the current rank will work out.

## Sample Signals

The demo signal set currently includes:

- Samsung strike -> MU
- AI capex optimism -> NVDA / SOXL / VGT / AMD / CRDO
- Semiconductor selloff from rates -> SOXL / NVDA / AMD / MU / CRDO / VGT
- Broad market risk-off -> UPRO / VGT / QQQ
- Weak social-media rumor -> CRDO, downgraded by evidence quality

## Five Modules

### 1. Thesis Change Detector

The engine compares each signal with local thesis profiles. It classifies thesis impact as:

- supports thesis
- weakens thesis
- breaks thesis
- confirms known risk
- introduces new risk
- requires review
- no thesis impact / noise

This keeps alerts focused on thesis change rather than headline volume.

### 2. Mechanism + Materiality Engine

Every useful signal must explain the business mechanism. Mechanisms connect an event to a financial driver such as revenue, margins, cash flow, rates, liquidity, valuation, or positioning.

Materiality uses:

- event impact
- affected portfolio weight
- affected driver count
- direct / second-order / third-order impact
- penalty when no business mechanism is supplied

This rejects vague claims that do not explain how the business could be affected.

### 3. Price-Action Confirmation Engine

Each signal can include price-action context:

- affected stock move
- peer basket move
- sector ETF move
- benchmark move
- volume change
- status
- explanation

Supported statuses include:

- company-specific
- peer-group confirmed
- sector-wide
- macro-driven
- factor-driven
- unexplained
- no confirmation
- unknown

The priced-in label is intentionally approximate:

- Likely not priced in yet
- Partially priced in
- Probably already priced in through broader factor move
- Unknown

## 4. Contradiction + Evidence Quality Engine

Evidence grades:

- **A:** SEC filings, earnings calls, official releases, government/regulatory data, confirmed primary sources.
- **B:** reputable financial news, named sources, industry data, multiple independent confirmations.
- **C:** single-source report, analyst opinion, trade publication, plausible but incomplete data.
- **D:** social media claim, anonymous rumor, vague report, unsupported interpretation.
- **F:** no source, engagement bait, extreme claim, pure conjecture.

Every signal card shows:

- supporting evidence
- contradicting evidence
- missing evidence
- counterarguments
- next review question

This is designed to fight confirmation bias.

### 5. Actionability + Position-Sizing Engine

Actionability depends on materiality, confidence, thesis impact, affected portfolio weight, leveraged exposure, urgency, and evidence quality.

Levels:

- **None -> Ignore:** ignore.
- **Low -> Log:** log only.
- **Medium -> Monitor:** monitor.
- **High -> Review:** review now.
- **Critical -> Critical Review:** immediate review.

The engine never emits automatic buy/sell commands. It produces review prompts such as "monitor", "review sizing", or "add to thesis notes."

## Signal Cards

Each Alpha Engine card shows:

- headline
- affected tickers
- affected portfolio weight
- direct / second-order / third-order impact
- compact action label
- thesis impact
- evidence grade
- confidence
- materiality
- price-action confirmation
- what changed
- why it matters
- why it matters to Tucker
- mechanism
- what could prove this wrong
- what to monitor next
- supporting evidence
- contradicting evidence
- missing evidence
- position-sizing check

Low-quality rumor signals are visually muted and include a noise-filter note.

## Noise Filter

Low-signal items are not allowed to masquerade as insight. If a social rumor has low evidence quality, low confidence, and no price-action confirmation, the card says so directly.

Example:

> Low-quality social item. Evidence grade D. No price-action confirmation. Action: Ignore.

## Scoring Model

Scores are simple and explainable:

- `materialityScore`: event impact, affected weight, financial drivers, impact directness, and mechanism quality.
- `confidenceScore`: evidence grade, source credibility, stated confidence, novelty, missing-evidence penalty, rumor penalty, and no-source penalty.
- `evidenceScore`: grade lookup from A to F.
- `portfolioRelevanceScore`: explicit relevance, affected weight, affected holding count, and leveraged-holding boost.
- `thesisImpactScore`: fixed ranking where thesis-breaking signals score highest and noise scores lowest.
- `actionabilityScore`: materiality, confidence, thesis impact, affected weight, leverage, urgency, and low-evidence penalty.
- `priorityScore`: portfolio relevance * materiality * confidence * novelty * evidence * time decay * price confirmation * actionability multiplier.

The result is intentionally directional, not precise.

## Samsung Strike -> MU Worked Example

Event:
Samsung employee strike expands.

Affected holding:
MU

Impact type:
Second-order.

Mechanism:
Samsung is a major memory competitor. A production disruption could tighten DRAM/NAND/HBM supply. Tighter memory supply could support memory pricing. Stronger memory pricing may benefit Micron revenue and margins.

Likely direction:
Potentially positive for MU, but uncertain.

Confidence:
Medium-low until production impact, facility scope, duration, and product mix are confirmed.

Counterarguments:

- Strike may be short.
- Production impact may be limited.
- Samsung may have inventory.
- Demand may matter more than supply.
- Market may already have priced it in.

Actionability:
Monitor or review, not automatic buy/sell.

What to monitor:

- production impact
- strike duration
- DRAM/NAND spot prices
- HBM supply commentary
- MU/peer price action
- analyst EPS revisions
- Samsung/SK Hynix updates

Why this matters to Tucker:
MU is a large individual stock holding, and Tucker also has broader semiconductor exposure through SOXL, VGT, NVDA, and AMD. The signal matters because it could affect the memory-pricing thesis, but the evidence is not strong enough for an automatic buy/sell decision.

## Limitations

- Sample events are synthetic examples.
- Price-action confirmation is demo data, not a live market feed.
- Evidence grades are only as good as the source metadata supplied.
- The engine estimates probability, direction, materiality, and thesis impact; it does not know future stock prices.
- Real provider adapters should stay behind a backend/proxy and must not expose API keys to browser JavaScript.

## Safety Rules

- Do not scrape paywalled sites.
- Do not scrape X/Twitter.
- Do not store passwords.
- Do not hardcode API keys.
- Do not present rumors as facts.
- Always show source, timestamp, and confidence.
- Distinguish confirmed news from social chatter.
- Distinguish direct impact from second-order inference.
- Always include counterarguments.
- Never state that the tool knows future stock prices.
