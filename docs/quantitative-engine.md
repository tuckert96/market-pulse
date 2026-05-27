# Quantitative Engine

Market Pulse now has four separate score families:

1. **Review-priority scores** answer: “What deserves Tucker’s attention?”
2. **Institutional Quant Lens** answers: “Does this look like a higher-quality stock setup based on the data the app actually has?”
3. **Ticker Research Lens** answers: “What would a long-term owner inspect before changing position size?”
4. **Transparent Prediction Model** answers: “What is the model-implied 20-trading-day outlook from available local factors?”

These scores are intentionally separate from one another. The prediction model is a bounded research outlook, not a calibrated probability, return forecast, valuation target, brokerage instruction, or buy/sell command.

## Transparent Prediction Model v1

Model version: `transparent-stock-prediction-v1`

Horizon: `20 trading days`

The prediction model is currently a transparent factor model, not a trained black-box AI system. It combines price trend, relative strength, Quant Lens quality, academic factor discipline, estimate-revision proxy, low-weight social/disclosure flow, risk control, and data reliability.

Portfolio weight is not part of the pure prediction score. Position size remains review context in Risk, Targets, Alpha review priority, and Portfolio Health.

Every output must show source mode, confidence, top drivers, weak/missing signals, caveats, and the guardrail that the output is not a calibrated probability, return forecast, valuation target, or order instruction.

## Ticker Research Lens

Ticker pages now surface a Seeking Alpha-style factor snapshot beside a Buffett-style owner checklist.

The factor snapshot displays available local/imported fields:

- Quant
- Valuation
- Growth
- Profitability
- Momentum
- EPS revisions
- Dividend

The owner checklist is deterministic and explicitly conservative. For operating companies it reviews:

- understandable business
- durable economics
- earnings visibility
- valuation discipline
- balance-sheet / downside resilience
- price discipline

For funds and leveraged ETFs it switches language to exposure review:

- exposure clarity
- leverage guardrail
- liquidity / tradability
- momentum confirmation
- valuation / exposure fit

The checklist does **not** calculate intrinsic value, owner earnings, or a buy/sell signal unless the required source data is imported or provided. Missing operating cash flow, capex, debt/cash, interest coverage, multi-year fundamentals, or valuation inputs appear as research gaps instead of being silently defaulted.

## Institutional Quant Lens v1.3

Model version: `institutional-quant-lens-v1.3`

Scale: `0-100`

Primary output fields:

- `institutionalQuantScore`
- `institutionalQuantRawScore`
- `institutionalQuantEvidenceCapScore`
- `institutionalQuantEvidenceCapReasons`
- `institutionalQuantScoreWasEvidenceCapped`
- `institutionalQuantLabel`
- `institutionalQuantConfidenceScore`
- `institutionalQuantDataCoverageScore`
- `institutionalQuantDataCoverageLabel`
- `institutionalQuantFactors`
- `institutionalQuantFactorCoverage`
- `institutionalQuantStrengths`
- `institutionalQuantWeaknesses`
- `institutionalQuantMissingData`
- `institutionalQuantDataSufficiencyWarnings`
- `institutionalQuantExplanation`
- `institutionalQuantSourceFreshness`
- `institutionalQuantModelGovernance`
- `institutionalQuantPeerGroup`
- `institutionalQuantPeerRank`
- `institutionalQuantPeerPercentile`
- `institutionalQuantPeerSummary`
- `institutionalQuantScoreChange`
- `institutionalQuantScoreTrend`
- `institutionalQuantScoreHistoryLabel`
- `institutionalQuantAcademicCompositeScore`
- `institutionalQuantAcademicModelVersion`
- `institutionalQuantAcademicFactors`
- `institutionalQuantAcademicValidationWarnings`
- `institutionalQuantAcademicResearchAnchors`
- `institutionalQuantAcademicCaveat`

## Academic Factor Discipline v1

Model version: `academic-factor-discipline-v1`

The Quant Lens is now explicitly anchored to five research guardrails:

- **Gu, Kelly & Xiu, "Empirical Asset Pricing via Machine Learning"**: future ML work should compare simple/regularized/tree-style models out of sample, because high-dimensional signals can overfit and nonlinear interactions matter. The app does not claim a trained ML predictor yet.
- **Jegadeesh & Titman, "Returns to Buying Winners and Selling Losers"**: momentum should prefer 3/6/12-month relative strength and a skipped recent period. When the app has too little price history, it labels the momentum layer as a short-history fallback.
- **Asness, Moskowitz & Pedersen, "Value and Momentum Everywhere"**: value and momentum are reviewed together because they can complement and diversify one another. The app flags large disagreements instead of letting one factor silently dominate.
- **Novy-Marx, "The Other Side of Value"**: profitability belongs beside value. The preferred input is gross profits/assets; when it is missing, the app falls back to imported profitability grades and margin proxies and shows the gap.
- **Harvey, Liu & Zhu, "...and the Cross-Section of Expected Returns"**: factor discovery needs multiple-testing skepticism. The app adds a validation factor, evidence caps, stale-data warnings, and missing-data warnings before letting a high score look high-conviction.

The academic diagnostics are shown as a sidecar to the regular Quant Lens. They are not a hidden model and do not replace user judgment. Their job is to keep the scoring engine honest about factor construction, data sufficiency, and validation risk.

Primary references used for this design:

- Gu, Kelly & Xiu: https://academic.oup.com/rfs/article/33/5/2223/5758276
- Jegadeesh & Titman: https://www.bauer.uh.edu/rsusmel/phd/jegadeesh-titman93.pdf
- Asness, Moskowitz & Pedersen: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1363476
- Novy-Marx: https://www.nber.org/papers/w15940.pdf
- Harvey, Liu & Zhu: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2249314

Academic factor weights:

- 24% momentum discipline
- 22% profitability / quality
- 18% value + momentum balance
- 14% risk / beta controls
- 14% validation discipline
- 8% ML ensemble readiness

The ML ensemble readiness factor is intentionally conservative. It only says whether the local data is broad enough for future ensemble testing. It is not a neural net, forecast, or price target.

## Factor Weights

The current factor stack is a transparent weighted average:

- 20% business quality
- 19% price momentum
- 13% estimate revisions
- 14% valuation discipline
- 12% risk control
- 7% liquidity / capacity
- 6% portfolio fit
- 4% data quality
- 5% factor validation

Each factor is scored from `0-100`, clamped, and shown with a driver sentence and missing-data notes.

Each factor also has a coverage label:

- `covered`: the factor has the expected local/imported/provider inputs.
- `partial`: the factor has enough context to be useful, but one or two important inputs are missing.
- `thin`: the factor is mostly placeholder or missing-context output.

## Factor Inputs

Business quality uses available profitability/growth fields and fundamentals:

- profitability grade
- growth grade
- gross profits/assets when imported or provided
- revenue growth
- EPS growth
- gross margin
- free-cash-flow margin

The broad Seeking Alpha Quant score is deliberately not counted inside business quality. It is a useful imported signal, but counting it alongside profitability, growth, momentum, valuation, and revisions would let one source dominate multiple supposedly independent factors.

Price momentum uses:

- momentum grade
- daily price change
- 12-1 / skipped-recent-period momentum when enough history exists
- shorter historical price trend fallback when history is thin
- range position and drawdown from available history
- relative strength if present

Daily move inputs are normalized as decimal returns. For example, `2%`, `2`, and `0.02` are interpreted as a 2% move. Historical price rows with dates are sorted before return and drawdown calculations so descending provider payloads do not invert momentum.

Estimate revisions uses:

- EPS revisions grade
- estimate-change magnitude if present
- rating freshness

Valuation discipline uses:

- valuation grade
- forward P/E
- price/sales
- growth-adjusted valuation context

Risk control uses:

- portfolio weight
- leveraged ETF flag / leverage multiple
- local risk level
- beta when available
- drawdown from available history

Liquidity / capacity uses:

- market cap
- price
- volume / average volume
- estimated dollar volume

Portfolio fit uses:

- current portfolio weight
- target/default weight
- concentration penalty
- sector exposure penalty when available

Data quality uses:

- quote coverage
- live/cached/stale status
- profile/sector coverage
- historical price coverage
- factor-rating coverage
- thesis status

Factor validation uses:

- factor coverage labels
- missing input count
- 12-1 / skip-period momentum availability
- stale/error/sample-market-data penalties
- multiple-testing and out-of-sample validation warnings

## Labels

- `High-quality setup`: strong composite and acceptable data coverage.
- `Constructive setup`: supportive but not elite.
- `Mixed setup`: useful but not decisive.
- `Watchlist only`: weak or incomplete setup.
- `Risk review`: low score or risk-heavy setup.
- `Needs evidence`: data coverage is too thin for high conviction.

For funds and ETFs, the model changes language from stock-quality to exposure review:

- `Fund/ETF setup review`
- `Fund/ETF watchlist review`
- `Fund/ETF needs evidence`
- `Leveraged exposure review`

Operating-company quality, revisions, and valuation multiples are not treated as applicable to funds or ETFs. Those rows should be reviewed through exposure, liquidity, cost/tracking context, leverage, and fit with Tucker’s portfolio.

## Missing-Data Policy

The model does not fill missing data with fake precision. Missing quote, profile, historical price, factor grade, beta, liquidity, revisions, or thesis data reduces confidence and appears in `institutionalQuantMissingData`.

Sample, imported, live, cached, stale, and missing inputs remain labeled separately. A high score with weak data should be treated as a research prompt, not a conclusion.

## No-Fake-Precision Display Contract

Quant Lens output should be displayed as an integer `0-100` review score with a label, coverage state, and confidence context. It should not be displayed as a decimal ranking, expected return, probability of outperformance, fair value estimate, price target, or portfolio weight instruction.

When the factor stack is thin, stale, sample-only, or evidence-capped, the UI must show that limitation near the score instead of burying it in detail text. Required context:

- source freshness: Sample, Imported, Live, Cached, Stale, Error, Not configured, or Missing
- coverage label: `covered`, `partial`, or `thin`
- confidence score or confidence label
- missing-data warnings
- evidence-cap reasons when present
- academic validation warnings when present

Peer percentile and score-history labels are sidecar context. They should not be treated as new score inputs, model validation, or future-return evidence. Small peer sets should say the peer context is limited rather than printing precise-looking superiority claims.

## Evidence Caps

The model now calculates a raw weighted score and then applies an evidence cap when critical inputs are missing. This prevents a thin-data ticker from showing a high-conviction institutional score just because a few visible factors are strong.

Cap triggers include:

- missing current quote/price input
- missing historical price series
- too-short price history for robust trend/risk scoring
- missing enough independent factor ratings
- missing company profile, sector, or market-cap context
- stale market data
- unverified liquidity/capacity
- too many missing model inputs

When an evidence cap is lower than `100`, the UI can show the cap reasons. `institutionalQuantScoreWasEvidenceCapped` is only true when the raw weighted score was actually above the cap and had to be reduced. Tucker should read capped scores as “research this further,” not as a conclusion.

## Peer Context And Local Score History

Quant Lens scores are enriched after scoring with peer-relative context and local score history. This does not change the v1.3 score formula. It adds sidecar context so Tucker can see whether a ticker ranks well against comparable names and whether its local score is improving, stable, or deteriorating since the prior local snapshot.

Peer groups are intentionally conservative:

- Operating companies are grouped by sector when available, then industry, then a broad operating-company fallback.
- Funds and ETFs are not compared against operating companies. Leveraged ETFs are grouped under `Leveraged ETF exposure`; other funds use fund/asset-class exposure groups.

## Technical Signal Context

The GitHub `real-time-stock-dashboard` zip is a Python Streamlit app built around technical indicators and time-series diagnostics. Market Pulse does not embed the Streamlit runtime or switch to Yahoo Finance. Instead, it ports the useful math layer into `src/technicalAnalysis.js` and runs it against the existing mock/Finnhub/imported historical price series.

The uploaded project includes an MIT license. Market Pulse reimplements the indicator formulas in native JavaScript and documents the integration path here so the source of the idea stays clear. See `docs/third-party-notices.md` for the notice text.

The first native panel appears on ticker detail pages as **Technical Signal Context**. It includes:

- simple and exponential moving-average context
- RSI
- Bollinger band position
- MACD histogram
- rolling z-score
- drawdown and max drawdown
- rolling Sharpe signal-to-noise context
- lag-1 autocorrelation when enough return history exists
- ATR and OBV when high/low/volume history exists
- return-distribution diagnostics: mean, volatility, skew, excess kurtosis, KS-style distance, and two-sigma tail counts
- dependency-free Welch-style power spectral density with dominant cycle and band-power summaries
- lightweight STFT energy-shift summary
- deterministic regime proxy from drift, drawdown, volatility, and rolling Sharpe

The Signal Review screen also receives a **Technical context** score component so the same price-series diagnostics appear beside Reddit, politician-trade, price momentum, concentration, and thesis/risk inputs.

Market-data history now preserves open/high/low/volume rows when providers return them. This matters because ATR needs high/low data and OBV needs volume. When providers only return closes, the UI says those diagnostics are missing instead of fabricating them.

The panel is intentionally descriptive. It explains recent price-series structure, not future returns. When history is short, the UI says so and uses short-window context instead of pretending the app has a robust institutional history window.

Deferred or rejected from the zip:

- Streamlit UI shell
- `yfinance` live data dependency
- Hidden Markov Model regime detection
- Plotly/Streamlit chart renderers
- Yahoo-Finance sidebar quote workflow

The HMM regime decoder is still intentionally rejected for now. Browser-side HMM would add complexity and false confidence with shallow history. The deterministic regime proxy is easier to audit and safer for daily decision support.
- Percentile labels are hidden when fewer than two comparable names exist, and small peer groups carry a warning.

Score history is stored locally as compact records only: ticker, date, model version, portfolio mode, score, confidence/data-coverage scores, peer group/rank, label, and source freshness. It does not persist provider payloads, source text, API keys, cookies, or account-level holdings detail. Sample and imported histories are separated so sample-mode scores cannot appear as changes to Tucker's real imported portfolio.

## Where It Appears

- Market Intelligence ticker signal cards show the Quant Lens score and short driver.
- Ticker detail pages show a full Quant Lens panel with factor scores, peer context, score trend, strengths, weak/missing data, and limits.
- Alpha Engine holding rows now use the Quant Lens as a first-class quality input while keeping review priority separate from durable quality.
- Alpha Engine holding rows show collapsed paper-backed factor checks for momentum discipline, profitability/quality, value/momentum balance, risk controls, validation discipline, and ML ensemble readiness.
- Alpha Engine recommendation cards can cite the Quant Lens as supporting context, peer-context note, score-trend note, and missing-data warning without turning the score into a trade instruction.

## What This Does Not Do

- It does not predict exact prices or returns.
- It does not place trades.
- It does not override thesis, risk, or portfolio-sizing judgment.
- It does not claim Goldman Sachs proprietary methodology.
- It does not use hidden model weights or black-box AI scoring.

## Next Upgrades

Highest-value future improvements:

- Sector-neutral percentile ranks.
- Real estimate revision breadth and magnitude.
- ROIC, debt, accruals, and earnings-quality factors.
- Multi-month momentum excluding the most recent month.
- Volatility, beta, correlation, and downside-risk measurement from historical returns.
- Broader peer universes beyond the active holdings/watchlist universe.
- Better score-history calibration once enough imported/live snapshots exist.
- Calibration against historical forward returns once enough real history exists.
