# Rebalancing And Thesis Tracker

This module turns the dashboard from a holdings viewer into a review system. It does not execute trades or issue buy/sell orders. It shows where the portfolio differs from Tucker's targets, which strategy sleeves are carrying risk, and which positions need thesis review.

## Data Model

Target allocation and thesis data live beside the canonical holding model:

- `targetWeight`: desired portfolio weight for the holding.
- `strategySleeve`: Core index, Leveraged growth, AI / semiconductor, Individual stock conviction, Treasuries / hedge, Cash, or Speculative.
- `thesisStatus`: imported or inferred status for dashboard filtering.
- `confidenceLevel`: Tucker's conviction level.
- `lastReviewedDate`: date the thesis was last checked.
- `reviewTriggers`: events that should force a review.
- `thesisBreakingConditions`: facts that would invalidate the position.

The thesis editor stores profile overrides in browser `localStorage` under `growthDashboardThesisProfiles`. It does not leave the machine unless Tucker exports browser data manually.

The expanded thesis profile now includes:

- why Tucker owns it
- target allocation
- confidence level
- thesis status
- bullish assumptions
- key risks
- invalidation criteria
- what would make Tucker add
- what would make Tucker trim
- what would make Tucker exit or review
- last reviewed date
- next review trigger
- notes

The target allocation editor stores a separate local target list under `growthDashboardTargetAllocations`. Targets can be set by:

- ticker
- asset class
- strategy sleeve
- account

Each target includes a target percent, min/max review bands, priority, notes, and optional max effective exposure for leveraged ETF guardrails. Target allocations are included in full dashboard state JSON backups and can also be exported/imported as their own local JSON file.

When Tucker saves a ticker thesis target, the dashboard syncs that target into the ticker-level Target Allocation model so holdings, rebalance review, and the target table stay aligned.

## Rebalance Modes

The rebalance engine supports four modes:

- `new-contribution`: uses available cash or a small contribution estimate to buy underweight positions only.
- `taxable-safe`: avoids taxable-account sales and surfaces hold notes when an overweight position would otherwise be trimmed.
- `retirement-only`: limits trade suggestions to retirement and HSA accounts.
- `full`: shows the full model, including trims and adds.

Leveraged ETFs receive special handling. If a leveraged ETF is overweight by more than 1 percentage point, the engine suggests a capped trim rather than assuming the whole overweight amount should be sold at once.

The newer target allocation plan keeps the language deliberately conservative:

- `Review add`
- `Review trim`
- `Review leverage cap`
- `Hold / review taxable impact`

These are review prompts, not trade orders.

## Cash Deployment Planner

The cash planner compares current cash and money-market holdings against the target cash percentage. Cash above the target is treated as potential deployable cash and allocated across underweight ticker targets proportionally to their dollar drift.

This is meant to answer, "If Tucker deploys cash, which underweight targets should he review first?" It does not assume every dollar must be invested.

## Leveraged ETF Guardrails

UPRO, SOXL, TQQQ-style positions are checked against both direct weight caps and effective exposure caps. For example, a 7% SOXL cap can represent roughly 21% effective semiconductor exposure if modeled as 3x.

The guardrail panel flags holdings above cap and explains why the exposure deserves review. It does not create automatic sell instructions.

## Strategy Sleeves

Sleeves group holdings by strategy intent rather than only by account or sector. The dashboard shows sleeve value, portfolio weight, target drift, estimated return, and average risk score.

Current sleeves include:

- Core index
- Leveraged growth
- AI / semiconductor
- Individual stock conviction
- Treasuries / hedge
- Cash
- Speculative

## Thesis Tracker

For each major holding, Tucker can edit:

- why he owns it
- bullish assumptions
- key risks
- thesis-breaking conditions
- review triggers
- target allocation
- confidence level
- catalyst
- stop-review trigger
- last reviewed date

Rows are aggregated by ticker across accounts, so MU in taxable, IRA, and Roth remains visible as one thesis while holdings and import data still preserve account-level rows. Rows are ranked so the riskiest thesis hygiene problems float to the top:

- `Thesis-breaking signal`: Alpha Engine signal says a thesis assumption may be broken.
- `Contradicted`: factor data or revisions conflict with the thesis.
- `Missing`: no reason for ownership is documented.
- `Needs review`: above target with stale/weak thesis, leveraged guardrail missing, or Alpha signal requires review.
- `Stale`: the thesis has not been reviewed recently.
- `Supported`: Alpha signal supports the thesis, but still requires monitoring evidence.
- `Current`: the thesis has a recent review and no obvious contradiction.

The tracker now flags:

- holdings with no thesis
- large holdings with stale thesis
- holdings above target with weak or stale thesis
- leveraged holdings without trim/exit guardrail notes
- Alpha signals that support, weaken, or break a thesis
- thesis-breaking signals as immediate review items

Alerts remain review-oriented. They use language such as "Review thesis," "Document thesis," "Monitor support," and "Immediate review"; they do not generate buy/sell commands.

## Safety Model

- No brokerage credentials are collected.
- No trade execution is supported.
- Suggestions are review prompts, not instructions.
- Taxable-safe mode is intentionally conservative.
- Thesis edits are local manual overrides, not external research imports.
- The Alpha Engine still requires evidence, mechanism, materiality, confidence, and counterarguments before escalating a signal.

## Validation

Run:

```bash
npm run check
npm run smoke
```

Current tests cover contribution-based rebalance suggestions, target allocation drift math, cash deployment, leveraged ETF guardrails, local target JSON normalization, and strategy sleeve summaries. Future tests should add browser-level target editing once the UI moves behind a browser automation harness.
