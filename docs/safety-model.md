# Safety Model

This dashboard is a local-first research aid for Tucker. It should help identify what changed, what matters, what is risky, and what actions are worth reviewing. It must not become a credential collector, scraper, trading bot, or source of false certainty.

## Hard Rules

- Do not collect or store Fidelity usernames, passwords, MFA codes, cookies, session tokens, or account recovery details.
- Do not collect or store Seeking Alpha passwords.
- Do not collect or store Seeking Alpha cookies, session tokens, hidden browser state, or authorization headers.
- Do not scrape Fidelity, Seeking Alpha Premium, X/Twitter, or paywalled sources.
- Do not use logged-in browser sessions, cookies, or session tokens for Reddit, X/Twitter, or federal disclosure sources.
- Do not hardcode API keys.
- Do not commit `.env`, secrets, personal CSV exports, exported dashboard state, local databases, logs, or screenshots showing private holdings.
- Do not execute trades.
- Do not present a signal as guaranteed prediction or personalized financial advice.
- Do not add paid APIs, production credentials, global installs, or external network dependencies without Tucker's approval.

## Allowed Data Paths

- Local demo data.
- Tucker-controlled CSV imports.
- Tucker-controlled Seeking Alpha `.xlsx` exports.
- Tucker-pasted or locally imported Seeking Alpha AI text/reports that are visible to him and do not include credentials, cookies, session tokens, or hidden browser state.
- Tokenized provider flows through approved aggregators such as Plaid Investments or SnapTrade.
- Licensed APIs or official APIs when keys are stored server-side only.
- Public static federal disclosure datasets when explicitly enabled, source-labeled, cached, and shown as delayed/partial informational data.
- Manual local overrides such as thesis profiles and target allocations.

## Local Storage

The browser app stores holdings, events, connector status, alert lifecycle state, and thesis profiles in `localStorage`. This is convenient but not encrypted. Treat the browser profile as sensitive.

Local JSON state exports intentionally exclude passwords and API keys, but they include holdings and should be treated as sensitive financial records.

Brokerage imports should not preserve full account numbers in UI reports, local holdings, or exported state. Account-number-only labels are masked to the last four digits, and rejected-row debug values redact account-number fields.

## Environment Files

`.env.example` contains placeholder names only. A real `.env` may be used locally for backend experiments and must remain ignored by git.

The local backend `/api/config` endpoint reports only whether credentials are present. It must never return secret values to frontend JavaScript.

The local backend must not serve dotfiles or secret-like static files. Requests for `.env`, `.git/*`, token/secret/key filenames, or private key extensions should return 404 even on localhost.

Provider-specific live modes must fail closed:

- Reddit defaults to Sample/local JSON mode unless official API credentials and `REDDIT_LIVE_ENABLED=true` are present.
- Federal disclosure / politician trade data defaults to Sample/local import mode unless the public static dataset provider and `POLITICIAN_TRADES_LIVE_ENABLED=true` are present.
- X/Twitter defaults to Sample/local mode unless a server-side `X_BEARER_TOKEN` and `X_LIVE_ENABLED=true` are present. The local backend must never expose bearer tokens, usernames, cookies, sessions, or authorization headers to browser JavaScript.
- OpenAI-powered explanations default to deterministic local summaries unless `OPENAI_API_KEY` is present and `OPENAI_PORTFOLIO_EXPLANATIONS_ENABLED=true`. Prompts must use capped, redacted, source-labeled structured context and must not include raw account numbers, tokens, cookies, API keys, or brokerage credentials.

## Signal Discipline

Market intelligence must ask:

- What changed?
- Is it factual?
- Is it material?
- Is it already priced in?
- Does it affect revenue, margins, cash flow, rates, liquidity, or positioning?
- Does it change Tucker's thesis?
- What would prove this view wrong?

Every actionable signal should distinguish:

- fact vs interpretation
- confirmed data vs rumor
- direct impact vs second-order inference
- new information vs old narrative
- material signal vs internet noise
- review prompt vs trade instruction

## Verification Gate

Before checkpointing meaningful work, run:

```bash
npm run lint
npm run validate:data
npm run test
npm run smoke
npm run check
```

Also run a scoped secret-like file check:

```bash
find Documents/Codex/2026-05-20/build-me-an-online-dashboard-that -maxdepth 4 -type f \( -name ".env*" -o -name "*secret*" -o -name "*key*" -o -name "*token*" -o -name "*.pem" -o -name "*.p12" \) -print
```

Expected intentional result: `.env.example` only.
