export function demoMarketIntelligenceEvents() {
  return [
    {
      id: "samsung-strike-mu-memory",
      title: "Samsung labor disruption could tighten memory supply",
      source: "Sample market intelligence",
      sourceUrl: "",
      sourceAsOf: "2026-05-21",
      severity: "high",
      category: "supply-chain",
      affectedTickers: ["MU", "SOXL", "NVDA", "AMD"],
      primaryTicker: "MU",
      summary:
        "Sample scenario: a Samsung strike or production disruption may reduce memory supply, potentially supporting DRAM/NAND pricing and improving Micron's near-term setup.",
      portfolioReadThrough:
        "MU could benefit from tighter memory supply, while SOXL adds amplified semiconductor exposure. This is a review trigger, not an automatic buy signal.",
      suggestedAction:
        "Review MU target weight, earnings date, and thesis. If the thesis is intact, consider whether underweight drift should be addressed with new contributions rather than taxable sales.",
      confidence: "Medium",
      expiresAt: "2026-06-21"
    },
    {
      id: "ai-capex-watch",
      title: "AI capex remains the dominant portfolio driver",
      source: "Sample market intelligence",
      sourceAsOf: "2026-05-21",
      severity: "medium",
      category: "theme",
      affectedTickers: ["NVDA", "VGT", "QQQ", "AMD", "CRDO"],
      primaryTicker: "NVDA",
      summary:
        "AI infrastructure spending supports several holdings, but the same theme creates overlap across individual stocks and ETFs.",
      portfolioReadThrough:
        "The dashboard should treat AI exposure as a combined stack, not separate isolated bets.",
      suggestedAction:
        "Watch total AI/semiconductor weight and avoid adding to every name after the same catalyst.",
      confidence: "High",
      expiresAt: "2026-06-30"
    },
    {
      id: "leveraged-etf-decay-watch",
      title: "Leveraged ETF decay risk rises with volatility",
      source: "Sample market intelligence",
      sourceAsOf: "2026-05-21",
      severity: "high",
      category: "risk",
      affectedTickers: ["UPRO", "SOXL"],
      primaryTicker: "SOXL",
      summary:
        "Leveraged ETFs can diverge from simple 3x expectations when volatility is high or when held through drawdowns.",
      portfolioReadThrough:
        "UPRO and SOXL should have explicit caps, review triggers, and rebalance rules.",
      suggestedAction:
        "Keep leveraged exposure capped and prefer rebalancing inside retirement accounts when possible.",
      confidence: "High",
      expiresAt: "2026-07-01"
    }
  ];
}

export function buildMarketIntelligenceAlerts(events = [], holdings = []) {
  const holdingsByTicker = new Map(holdings.map((holding) => [holding.ticker, holding]));
  return events.flatMap((event) => {
    const impacted = event.affectedTickers
      .map((ticker) => holdingsByTicker.get(ticker))
      .filter(Boolean)
      .sort((a, b) => b.marketValue - a.marketValue);

    if (!impacted.length) return [];

    const exposure = impacted.reduce((total, holding) => total + holding.marketValue, 0);
    const tickers = impacted.map((holding) => holding.ticker).join(", ");
    return [{
      id: `market:${event.id}`,
      type: "market-intelligence",
      severity: event.severity,
      title: event.title,
      detail: `${tickers} exposure: ${formatCurrency(exposure)}. ${event.portfolioReadThrough}`,
      ticker: event.primaryTicker,
      score: severityRank(event.severity) * 25 + Math.min(30, impacted.length * 5),
      event
    }];
  });
}

export function affectedHoldingsForEvent(event, holdings = []) {
  const set = new Set(event.affectedTickers || []);
  return holdings.filter((holding) => set.has(holding.ticker));
}

function severityRank(severity) {
  return { low: 1, medium: 2, high: 3, critical: 4 }[severity] || 1;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value) || 0);
}
