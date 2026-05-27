# Transparent Prediction Model

Model version: `transparent-stock-prediction-v1`

Horizon: `20 trading days`

Purpose: provide a bounded, source-labeled research outlook for a ticker. It is decision support only. It is not a calibrated probability, return forecast, valuation target, or order instruction.

## What It Predicts

The model produces:

- `stockPredictionScore`: 0-100 model-implied outlook score
- `stockPredictionLabel`: Favorable, Constructive, Neutral, Caution, or Unfavorable
- `stockPredictionDirection`: Positive skew, Balanced, or Negative skew
- `stockPredictionConfidence`: 0-100 confidence read based on coverage and freshness
- `stockPredictionFactors`: transparent factor scores, weights, and contribution points
- `stockPredictionCaveats`: stale, missing, sample, validation, or ETF/leverage warnings

The score is deliberately separate from:

- Alpha Engine quality rank
- Alpha recommendation review priority
- ticker confluence score
- portfolio alerts
- target allocation or rebalance suggestions

## Current Factors

Weights sum to 100%:

- Price trend: 24%
- Relative strength: 16%
- Quant quality: 18%
- Academic factor discipline: 10%
- Estimate revisions proxy: 8%
- Social/disclosure flow: 6%
- Risk control: 10%
- Data reliability: 8%

Portfolio position size is review context only. It is not part of the stock-return prediction score.

## Guardrails

The model must show:

- model version
- horizon
- source mode
- confidence
- top drivers
- weak/missing signals
- caveats
- the guardrail text that this is not a valuation target or order instruction

The model must not say:

- buy now
- sell now
- guaranteed
- will go up
- price target or target price
- expected profit
- trade ticket
- place order

## Validation Status

This is a first transparent model layer, not a validated institutional strategy.

Before it can claim calibration or statistical edge, the app needs point-in-time feature snapshots and walk-forward testing against:

- zero-return baseline
- benchmark-relative return baseline
- simple momentum baseline
- existing Quant Lens rank

Useful future validation metrics:

- sample count
- hit rate
- benchmark-relative return
- rank IC / Spearman correlation
- decile spread
- calibration error
- drawdown and turnover diagnostics

Until those exist, prediction output remains a bounded model-implied research read.
