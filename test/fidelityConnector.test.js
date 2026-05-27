import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizePlaidHoldings,
  normalizeProviderHoldings,
  normalizeSnapTradeHoldings
} from "../src/fidelityConnector.js";

test("Plaid holdings normalize account, security, cash, and canonical fields", () => {
  const records = normalizePlaidHoldings({
    asOf: "2026-05-21",
    accounts: [
      { account_id: "acc-tax", name: "Fidelity Brokerage", subtype: "individual" },
      { account_id: "acc-roth", name: "Fidelity Roth IRA", subtype: "roth" }
    ],
    securities: [
      { security_id: "sec-mu", ticker_symbol: "MU", name: "Micron Technology", sector: "Semiconductors", type: "equity" },
      { security_id: "sec-cash", name: "Core cash position", type: "cash" }
    ],
    holdings: [
      {
        account_id: "acc-tax",
        security_id: "sec-mu",
        quantity: 10,
        institution_price: 132,
        institution_value: 1320,
        cost_basis: 900,
        institution_price_as_of: "2026-05-20"
      },
      {
        account_id: "acc-roth",
        security_id: "sec-cash",
        quantity: 1,
        institution_price: 2400,
        institution_value: 2400
      }
    ]
  });

  const mu = records.find((record) => record.ticker === "MU");
  const cash = records.find((record) => record.ticker === "CASH");

  assert.equal(records.length, 2);
  assert.equal(mu.account, "Fidelity Brokerage");
  assert.equal(mu.accountId, "acc-tax");
  assert.equal(mu.accountType, "Taxable");
  assert.equal(mu.assetClass, "Equity");
  assert.equal(mu.marketValue, 1320);
  assert.equal(mu.sourceAsOf, "2026-05-20");
  assert.equal(mu.providerHoldingId, "Fidelity Brokerage:sec-mu");
  assert.equal(cash.accountType, "Retirement");
  assert.equal(cash.assetClass, "Cash");
  assert.equal(cash.sector, "Cash");
});

test("Plaid holdings disambiguate duplicate account display names", () => {
  const records = normalizePlaidHoldings({
    accounts: [
      { account_id: "acc-roth-a", name: "Fidelity Roth IRA", mask: "1111", subtype: "roth" },
      { account_id: "acc-roth-b", name: "Fidelity Roth IRA", mask: "2222", subtype: "roth" }
    ],
    securities: [
      { security_id: "sec-mu", ticker_symbol: "MU", name: "Micron Technology", type: "equity" },
      { security_id: "sec-nvda", ticker_symbol: "NVDA", name: "NVIDIA", type: "equity" }
    ],
    holdings: [
      {
        account_id: "acc-roth-a",
        security_id: "sec-mu",
        quantity: 1,
        institution_price: 100,
        institution_value: 100
      },
      {
        account_id: "acc-roth-b",
        security_id: "sec-nvda",
        quantity: 1,
        institution_price: 200,
        institution_value: 200
      }
    ]
  });

  assert.deepEqual(records.map((record) => record.account), [
    "Fidelity Roth IRA (•••• 1111)",
    "Fidelity Roth IRA (•••• 2222)"
  ]);
  assert.deepEqual(records.map((record) => record.accountId), ["acc-roth-a", "acc-roth-b"]);
  assert.deepEqual(records.map((record) => record.providerHoldingId), [
    "Fidelity Roth IRA (•••• 1111):sec-mu",
    "Fidelity Roth IRA (•••• 2222):sec-nvda"
  ]);
});

test("SnapTrade holdings preserve account context and cost basis math", () => {
  const records = normalizeSnapTradeHoldings({
    accounts: [
      {
        name: "Fidelity HSA",
        type: "hsa",
        positions: [
          {
            id: "hold-nvda",
            symbol: { symbol: "NVDA", description: "NVIDIA", type: "equity" },
            units: "3",
            price: "1000",
            market_value: "3000",
            average_purchase_price: "700",
            updated_date: "2026-05-21"
          }
        ]
      }
    ]
  });

  assert.equal(records.length, 1);
  assert.equal(records[0].ticker, "NVDA");
  assert.equal(records[0].account, "Fidelity HSA");
  assert.equal(records[0].accountType, "HSA");
  assert.equal(records[0].costBasis, 2100);
  assert.equal(records[0].marketValue, 3000);
  assert.equal(records[0].sourceAsOf, "2026-05-21");
});

test("SnapTrade account-number fallback is masked before it can reach UI/export state", () => {
  const records = normalizeSnapTradeHoldings({
    accounts: [
      {
        number: "123456789",
        type: "brokerage",
        positions: [
          {
            symbol: { symbol: "MU", description: "Micron Technology", type: "equity" },
            units: "2",
            price: "100",
            market_value: "200"
          }
        ]
      }
    ]
  });

  assert.equal(records.length, 1);
  assert.equal(records[0].account, "Account ending 6789");
  assert.equal(JSON.stringify(records).includes("123456789"), false);
});

test("Plaid account labels are masked before they can reach UI/export state", () => {
  const records = normalizePlaidHoldings({
    accounts: [
      {
        account_id: "acc-tax",
        name: "Fidelity Brokerage 123456789",
        official_name: "Fidelity Brokerage Account 123456789",
        subtype: "individual"
      }
    ],
    securities: [
      { security_id: "sec-mu", ticker_symbol: "MU", name: "Micron Technology", type: "equity" }
    ],
    holdings: [
      {
        account_id: "acc-tax",
        security_id: "sec-mu",
        quantity: 2,
        institution_price: 100,
        institution_value: 200
      }
    ]
  });

  assert.equal(records.length, 1);
  assert.equal(records[0].account, "Fidelity Brokerage •••••6789");
  assert.equal(JSON.stringify(records).includes("123456789"), false);
});

test("Provider selector routes SnapTrade separately from Plaid", () => {
  const snap = normalizeProviderHoldings("snaptrade", {
    positions: [
      {
        symbol: "VGT",
        quantity: 2,
        price: 600,
        market_value: 1200,
        account_name: "Fidelity Roth IRA",
        account_type: "ira"
      }
    ]
  });

  assert.equal(snap.length, 1);
  assert.equal(snap[0].ticker, "VGT");
  assert.equal(snap[0].accountType, "Retirement");
  assert.ok(snap[0].sources.includes("snaptrade"));
});
