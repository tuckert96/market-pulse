# Signal Review

Signal Review is Market Pulse's backtesting-lite screen. It helps Tucker ask whether current signal scores would have been directionally useful when compared with available historical price movement.

It is intentionally modest. It is not an institutional backtest, not a trading system, and not a prediction engine.

## What It Shows

- Current top ticker signals from the combined ticker scoring model.
- Score components such as price momentum, relative strength, Reddit acceleration, politician disclosure activity, thesis/risk, and concentration.
- Simple forward returns when historical close data exists:
  - 1 trading day
  - 5 trading days
  - 20 trading days
- Missing-data warnings when signal timestamps, price history, or enough future price points are unavailable.
- Filters for owned tickers, watchlist tickers, Reddit-driven signals, politician-trade-driven signals, and high-momentum signals.

## Return Calculation

Forward returns use the available historical price array as trading-day points.

For a signal anchor date:

```text
forward return = (future close - anchor close) / anchor close
```

If the exact signal date is not present, the calculation uses the next available historical point and shows a warning.

If no signal timestamp exists, the screen uses the first available historical point as an exploratory anchor and shows a warning.

If there are not enough later price points for a horizon, that horizon is shown as missing rather than estimated.

## Limits

- No slippage, spreads, taxes, trade sizing, liquidity, or execution assumptions.
- No benchmark-relative performance calculation yet.
- No survivorship-bias correction.
- No portfolio-level simulation.
- No optimization or overfit threshold tuning.
- Sample/local/social/disclosure inputs are lower-confidence than primary filings, earnings calls, and confirmed market data.

Use this screen to review whether signals deserve more attention, not to issue buy/sell commands.
