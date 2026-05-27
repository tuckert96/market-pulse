# Ticker Signal Scoring

Market Pulse ranks tickers as review priorities, not as price predictions. A high score means “worth Tucker reviewing,” not “buy this.”

## Inputs

The current score uses local/imported/mock provider layers, plus server-side market data when Tucker has configured it:

- price momentum from imported holdings or mock market quotes
- relative strength placeholder versus sample/local benchmark context
- Reddit mention acceleration from sample/local JSON Reddit rows
- Reddit sentiment context when available, otherwise a clearly labeled missing/limited layer
- politician disclosure buy/sell activity from sample/local disclosure rows
- ownership and watchlist status
- concentration risk
- thesis conviction, thesis status, risk level, and available factor context
- Institutional Quant Lens fields from the separate stock-quality model

The scoring module itself does not hold API keys or call providers directly. Live/cached market data, when enabled, arrives through the local backend provider layer.

## Formula

The score is a transparent weighted average:

- 22% price momentum
- 14% relative strength placeholder
- 16% Reddit mention acceleration
- 8% Reddit sentiment placeholder
- 16% politician disclosure activity
- 8% ownership/watchlist status
- 10% thesis conviction/risk
- 6% concentration risk

All component scores are clamped from `0` to `1`. The displayed `combinedScore` is the `0-100` version of the same score.

## No-Fake-Precision Guardrails

Ticker confluence is an attention-priority score. It is not a probability, expected return, price target, volatility forecast, or statistical edge. Display it as a whole-number review score with source labels and missing-data notes.

The confluence model must not imply precision that the data cannot support:

- social and disclosure layers stay lower-trust and source-labeled
- mock/sample layers lower confidence and remain visibly labeled
- missing quote, history, thesis, or factor data appears in `missingData`
- `topDrivers` explain directionally why a ticker needs review instead of promising returns
- Quant Lens peer rank and score-history labels remain context, not score ingredients
- academic factor diagnostics stay attached to the Quant Lens, not merged into confluence without an explicit model change

When the app has only partial data, the right output is "review with limited evidence," not a precise-looking claim that one ticker will outperform another.

## Explanation Fields

Each ticker signal includes:

- `whyScoreIsHigh`: plain-English reasons driving the score
- `missingData`: data that would improve confidence
- `dataModeDetails`: whether data is mock, local imported, provider-shaped, or missing
- `scoreBreakdown`: weighted contribution by component
- `scoreLayers`: score, weight, contribution, data mode, and missing-data note for each scoring layer
- `topDrivers`: component score, label, and reason
- `formulaLabel`: the current formula text shown in UI
- `institutionalQuantScore`: separate 0-100 stock-quality score
- `institutionalQuantFactors`: factor-level business quality, momentum, revisions, valuation, risk, liquidity, portfolio fit, and data-quality scores
- `institutionalQuantMissingData`: missing data that lowers confidence in the stock-quality view
- `institutionalQuantPeerSummary`: peer-relative rank context within comparable tracked names
- `institutionalQuantScoreHistoryLabel`: local change context since the prior score in the same portfolio mode

See `docs/quantitative-engine.md` for the stock-quality model. The ticker confluence score remains a review-priority score; the Institutional Quant Lens is a separate “good stock setup” lens.

## Interpretation

Social and politician disclosure inputs are lower-trust signals. They can raise review priority, but they should not override primary sources, earnings calls, filings, price action, or Tucker’s thesis notes.

Concentration risk can raise a ticker’s score even when the signal is not bullish. This is intentional: a large or leveraged position deserves more review attention when new information appears.

The Institutional Quant Lens can also appear on ticker signal cards and ticker detail pages. It should not be read as a trade recommendation. It is a transparent factor review that depends on available quote/profile/history, Seeking Alpha-style factor fields, thesis data, and portfolio context.

Peer rank and score-history labels are context, not new score ingredients. They help Tucker interpret whether a score is strong relative to comparable tracked names and whether the local score changed since the previous snapshot. They do not change the confluence formula and should not be shown as return predictions.

Academic factor diagnostics are also context, not confluence score ingredients. They check whether the separate Quant Lens has disciplined momentum, profitability, value/momentum balance, risk controls, validation discipline, and ensemble readiness. They should never be described as a trained ML predictor or validated trading strategy.

## Signal Review

The `Signal Review` screen uses the same current ticker signals and compares them with available historical close rows when possible. It calculates lightweight 1, 5, and 20 trading-day forward returns from a signal anchor date.

If a signal timestamp or enough historical data is missing, the screen shows missing-data warnings instead of estimating a result. This is backtesting-lite, not a validated strategy.

See `docs/signal-review.md` for the calculation and limitations.

## Limits

- No black-box AI scoring.
- No exact stock price forecasts.
- No buy/sell/enter/exit commands.
- No live Reddit, politician-trade, or market-data calls unless explicitly approved later.
