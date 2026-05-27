# Fidelity Live Holdings Connector

## Goal

Pull Tucker's Fidelity holdings into the dashboard without asking for or storing Fidelity credentials in the browser app.

## Security Position

- Do not collect Fidelity usernames, passwords, MFA codes, cookies, or session tokens.
- Use a tokenized account-linking provider such as Plaid Investments or SnapTrade.
- Keep provider client secrets and access tokens on a backend, never in `index.html` or browser `localStorage`.
- Store only normalized holdings needed for the dashboard unless Tucker explicitly asks for more.
- This local build stores Plaid access tokens only in the local backend's private `local-data/fidelity-plaid-session.json` file. The file is gitignored and blocked from static serving, but it is not a multi-user encrypted production vault.
- For production use, encrypt tokens at rest, log sync events, and keep disconnect/delete controls.

## Current Frontend Contract

The dashboard supports two Fidelity paths:

1. CSV/pasted holdings import as the always-available fallback.
2. Plaid Investments account linking through the local backend when Plaid credentials are configured in `.env`.

Plaid Link is launched in the browser, but token exchange and holdings calls are handled by the local backend.

```http
POST /api/connectors/fidelity/link
Content-Type: application/json

{ "provider": "plaid" }
```

Expected response, depending on provider:

```json
{
  "provider": "plaid",
  "linkToken": "link-sandbox-...",
  "liveProviderCalls": true
}
```

After Plaid Link succeeds, exchange the returned public token:

```http
POST /api/connectors/fidelity/exchange
Content-Type: application/json

{ "provider": "plaid", "public_token": "public-sandbox-..." }
```

For syncing holdings:

```http
GET /api/connectors/fidelity/holdings?provider=plaid
```

For disconnecting the local Plaid item:

```http
POST /api/connectors/fidelity/unlink
Content-Type: application/json

{ "provider": "plaid" }
```

The frontend can normalize either a Plaid-style holdings response or a SnapTrade-style holdings response through `src/fidelityConnector.js`.

Normalized provider holdings map into the dashboard's canonical holding shape:

- ticker
- company
- account
- account type
- shares
- price
- market value
- cost basis
- sector
- asset class
- source timestamp
- provider holding id
- source badges

The normalizer handles common provider details such as Plaid `accounts`, `securities`, and `holdings`, SnapTrade account-level `positions`, cash-like core positions, retirement/HSA/taxable account type inference, and average-cost-to-total-cost-basis conversion.
Provider account labels are sanitized before they reach the UI/export state, so account numbers are masked while preserving enough context to distinguish account buckets.

## Plaid Path

Plaid's Investments product supports holdings and investment account data. The local implementation now:

1. Create a Link token on the backend with Investments enabled.
2. Launch Plaid Link in the browser.
3. Exchange the public token for an access token on the backend.
4. Store the access token in the local backend's private token file.
5. Call Plaid holdings endpoints server-side.
6. Return normalized holdings to the dashboard.

Reference:

- https://plaid.com/docs/investments/
- https://plaid.com/docs/api/products/investments/

## SnapTrade Path

SnapTrade supports brokerage account connections and holdings retrieval. A production implementation should:

1. Register or look up Tucker as a SnapTrade user from the backend.
2. Generate a secure connection portal URL.
3. Let Tucker connect Fidelity through the provider portal.
4. Store the SnapTrade user secret encrypted.
5. Call SnapTrade holdings endpoints server-side.
6. Return normalized holdings to the dashboard.

Reference:

- https://snaptrade.com/brokerage-integrations/fidelity-api
- https://docs.snaptrade.com/reference/Account%20Information/AccountInformation_getAllUserHoldings

## Dashboard Behavior Today

- **Import Fidelity CSV** remains the safest fallback path for Tucker's real holdings.
- **Connect Fidelity with Plaid** is available when `PLAID_CLIENT_ID`, `PLAID_SECRET`, and `PLAID_ENV` are configured locally.
- **Sync linked holdings** replaces the active portfolio with normalized Plaid investment holdings and writes a local source report, so portfolio-driven screens update from the same imported/provider state.
- **Sample portfolio** remains available for workflow testing and is clearly labeled as sample data.
- **Direct Fidelity credentials** are never collected by Market Pulse. Plaid Link handles Fidelity authorization.

## Next Build Step

Test the Plaid sandbox flow, then connect a development-mode Plaid app only after Tucker confirms the scopes and understands local token storage.
