const EVIDENCE_POINTS = Object.freeze({ A: 1, B: 0.82, C: 0.62, D: 0.34, F: 0.08 });
const THESIS_POINTS = Object.freeze({
  "breaks thesis": 1,
  "weakens thesis": 0.78,
  "introduces new risk": 0.66,
  "requires review": 0.58,
  "confirms known risk": 0.52,
  "supports thesis": 0.48,
  "no thesis impact / noise": 0.08
});
const IMPACT_POINTS = Object.freeze({ direct: 1, "second-order": 0.72, "third-order": 0.42 });
const ACTIONABILITY_POINTS = Object.freeze({ None: 0, Low: 0.22, Medium: 0.46, High: 0.7, Critical: 0.94 });
const ACTION_LABELS = Object.freeze({ None: "Ignore", Low: "Log", Medium: "Monitor", High: "Review", Critical: "Critical Review" });

export function demoThesisProfiles() {
  return {
    MU: {
      ticker: "MU",
      whyOwned: "Memory-cycle recovery, AI/HBM demand, and margin expansion through tighter DRAM/NAND supply.",
      bullishAssumptions: [
        "AI/HBM demand continues growing.",
        "DRAM/NAND pricing improves.",
        "Supply discipline remains rational.",
        "Margins recover through the memory cycle.",
        "Datacenter demand offsets weaker consumer electronics."
      ],
      keyRisks: [
        "HBM demand slows materially.",
        "DRAM/NAND pricing rolls over earlier than expected.",
        "Samsung or SK Hynix add irrational supply.",
        "Gross margin recovery stalls.",
        "Management guides below cycle expectations."
      ],
      thesisBreakingConditions: [
        "Memory pricing rollover with no offset from AI/HBM demand.",
        "Confirmed irrational capacity expansion by major competitors.",
        "MU gross margin recovery fails to materialize across two reporting periods."
      ],
      reviewTriggers: [
        "Competitor production disruption.",
        "DRAM/NAND spot price change.",
        "HBM demand update.",
        "MU earnings or guide change."
      ],
      targetAllocation: 0.08,
      confidenceLevel: "Medium-high",
      lastReviewedDate: "2026-05-21"
    },
    NVDA: {
      ticker: "NVDA",
      whyOwned: "AI infrastructure leadership, accelerator ecosystem strength, and sustained hyperscaler capex.",
      bullishAssumptions: ["AI capex remains strong.", "Margins remain durable.", "Supply chain can support demand."],
      keyRisks: ["AI capex digestion.", "Export controls.", "Margin compression.", "Customer concentration."],
      thesisBreakingConditions: ["Hyperscaler AI capex rolls over sharply.", "Gross margins structurally compress."],
      reviewTriggers: ["AI capex updates.", "HBM supply disruptions.", "Export control changes."],
      targetAllocation: 0.12,
      confidenceLevel: "High",
      lastReviewedDate: "2026-05-21"
    },
    AMD: {
      ticker: "AMD",
      whyOwned: "AI accelerator challenger with improving datacenter opportunity.",
      bullishAssumptions: ["AI accelerator share gains continue.", "Datacenter margins improve.", "Revision trend stabilizes."],
      keyRisks: ["AI share gains disappoint.", "Margins lag expectations.", "Customer adoption slows."],
      thesisBreakingConditions: ["AI accelerator traction fails to show in revenue and margins."],
      reviewTriggers: ["Datacenter revenue update.", "AI customer commentary.", "EPS revision trend change."],
      targetAllocation: 0.07,
      confidenceLevel: "Medium",
      lastReviewedDate: "2026-05-21"
    },
    VGT: {
      ticker: "VGT",
      whyOwned: "Core technology ETF exposure with quality mega-cap compounding.",
      bullishAssumptions: ["Mega-cap tech earnings remain durable.", "AI capex benefits top holdings."],
      keyRisks: ["Valuation compression.", "Rate shock.", "AI capex digestion."],
      thesisBreakingConditions: ["Mega-cap tech earnings breadth deteriorates materially."],
      reviewTriggers: ["Rates shock.", "AI capex change.", "Mega-cap earnings season."],
      targetAllocation: 0.18,
      confidenceLevel: "High",
      lastReviewedDate: "2026-05-21"
    },
    SOXL: {
      ticker: "SOXL",
      whyOwned: "Tactical leveraged semiconductor exposure.",
      bullishAssumptions: ["Semiconductor momentum remains favorable.", "Volatility does not erode returns."],
      keyRisks: ["Volatility decay.", "Sharp semiconductor drawdown.", "Position grows beyond cap."],
      thesisBreakingConditions: ["Semiconductor trend breaks while leverage remains high."],
      reviewTriggers: ["Negative semiconductor sector news.", "Volatility spike.", "Weight above cap."],
      targetAllocation: 0.05,
      confidenceLevel: "Medium",
      lastReviewedDate: "2026-05-21"
    },
    UPRO: {
      ticker: "UPRO",
      whyOwned: "Leveraged broad-market growth sleeve.",
      bullishAssumptions: ["Risk-on regime persists.", "Market breadth remains acceptable.", "Volatility does not spike."],
      keyRisks: ["Volatility decay.", "Recession risk.", "Rates/liquidity shock."],
      thesisBreakingConditions: ["Volatility rises while breadth deteriorates.", "Macro regime turns risk-off."],
      reviewTriggers: ["Rates shock.", "Volatility spike.", "S&P trend break."],
      targetAllocation: 0.08,
      confidenceLevel: "Medium",
      lastReviewedDate: "2026-05-21"
    },
    CRDO: {
      ticker: "CRDO",
      whyOwned: "Speculative AI connectivity growth exposure; thesis needs better documentation.",
      bullishAssumptions: ["AI networking demand remains strong.", "Revenue growth converts into operating leverage."],
      keyRisks: ["Valuation risk.", "Customer concentration.", "Execution miss."],
      thesisBreakingConditions: ["Growth slows without margin proof."],
      reviewTriggers: ["Earnings update.", "Customer concentration news.", "Valuation reset."],
      targetAllocation: 0.06,
      confidenceLevel: "Medium-low",
      lastReviewedDate: "2026-05-21"
    }
  };
}

export function demoAlphaEvents() {
  return [
    {
      id: "alpha-samsung-strike-mu",
      timestamp: "2026-05-21T13:30:00-04:00",
      detectedAt: "2026-05-21T13:45:00-04:00",
      sourceType: "news",
      sourceName: "Sample verified news bundle",
      sourceUrl: "https://news.google.com/search?q=Samsung%20memory%20strike%20Micron%20DRAM%20NAND",
      sourceLinks: [
        { label: "Search live news", url: "https://news.google.com/search?q=Samsung%20memory%20strike%20Micron%20DRAM%20NAND" },
        { label: "Check MU news", url: "https://news.google.com/search?q=Micron%20memory%20pricing%20Samsung%20strike" },
        { label: "Verify DRAM/NAND pricing", url: "https://www.google.com/search?q=DRAM%20NAND%20spot%20prices%20Samsung%20strike" }
      ],
      headline: "Samsung memory plant workers expand strike",
      summary: "Sample event: labor disruption at Samsung memory operations may affect DRAM/NAND/HBM supply if production impact is confirmed.",
      rawText: "Samsung employee strike expands at memory operations; facility, duration, product mix, and production impact remain unconfirmed in this demo.",
      tickersMentioned: [],
      inferredTickersAffected: ["MU", "SOXL", "NVDA", "AMD"],
      sectorsAffected: ["Semiconductors", "Memory"],
      themes: ["memory pricing", "AI memory", "semiconductor supply"],
      eventType: "labor disruption / competitor supply disruption",
      geography: "South Korea",
      entities: ["Samsung Electronics", "Micron", "SK Hynix", "DRAM", "NAND", "HBM"],
      sentiment: "mixed-positive",
      confidence: 0.56,
      noveltyScore: 0.78,
      credibilityScore: 0.62,
      relevanceScore: 0.88,
      marketImpactScore: 0.7,
      expectedDirectionByTicker: { MU: "potentially positive, but uncertain", SOXL: "mixed-positive", NVDA: "mixed", AMD: "mixed" },
      scenarioImpactByTicker: {
        MU: [
          "Short strike / limited production impact: minimal MU impact.",
          "Multi-week disruption in memory production: modest positive for MU.",
          "Severe DRAM/HBM disruption: meaningful positive for MU and memory pricing."
        ]
      },
      timeHorizon: "days/weeks to quarterly earnings impact",
      evidence: [
        { grade: "C", text: "Samsung is a major memory competitor; a disruption could affect supply if production impact is real." },
        { grade: "C", text: "Memory pricing is sensitive to supply/demand balance." }
      ],
      supportingEvidence: [
        "Samsung is a major DRAM/NAND/HBM supplier.",
        "Tighter supply can support memory pricing.",
        "MU revenue and margins are sensitive to pricing in the memory cycle."
      ],
      contradictingEvidence: [
        "No confirmed production loss estimate yet.",
        "Strike duration may be short.",
        "Samsung may satisfy customers from inventory.",
        "Demand may matter more than supply.",
        "Market may already have priced it in."
      ],
      missingEvidence: [
        "Production impact",
        "Strike duration",
        "Affected facilities",
        "Affected product lines",
        "DRAM/NAND spot price response",
        "HBM supply commentary",
        "MU and peer price action",
        "Analyst EPS revisions",
        "Samsung/SK Hynix updates"
      ],
      counterarguments: [
        "Strike may be short.",
        "Production impact may be limited.",
        "Samsung may have inventory.",
        "Demand may matter more than supply.",
        "Market may already have priced it in."
      ],
      followUpQuestions: [
        "Which Samsung memory facilities are affected?",
        "Is HBM, DRAM, or NAND output impacted?",
        "Did MU outperform memory peers after the headline?",
        "Did DRAM/NAND spot prices react?"
      ],
      whatToMonitorNext: [
        "production impact",
        "strike duration",
        "DRAM/NAND spot prices",
        "HBM supply commentary",
        "MU/peer price action",
        "analyst EPS revisions",
        "Samsung/SK Hynix updates"
      ],
      staleAfter: "2026-05-28T13:30:00-04:00",
      factualClaim: "Samsung employee strike expands at memory operations.",
      interpretation: "Potential second-order positive for MU through memory supply/pricing.",
      businessMechanism: "Samsung is a major memory competitor. A production disruption could tighten DRAM/NAND/HBM supply. Tighter memory supply could support memory pricing. Stronger memory pricing may benefit Micron revenue and margins.",
      affectedDrivers: ["revenue", "margins", "valuation"],
      impactOrderByTicker: { MU: "second-order", SOXL: "second-order", NVDA: "third-order", AMD: "third-order" },
      thesisImpactByTicker: { MU: "supports thesis", SOXL: "requires review", NVDA: "no thesis impact / noise", AMD: "no thesis impact / noise" },
      priceAction: {
        status: "no confirmation",
        affectedMove: 0.008,
        peerBasketMove: 0.006,
        sectorEtfMove: 0.007,
        benchmarkMove: 0.004,
        volumeChange: 0.12,
        explanation: "Sample state: MU and semis are not clearly outperforming enough to confirm materiality yet."
      }
    },
    {
      id: "alpha-ai-capex-nvda-soxl-vgt",
      timestamp: "2026-05-21T11:30:00-04:00",
      detectedAt: "2026-05-21T11:34:00-04:00",
      sourceType: "news",
      sourceName: "Sample capex monitor",
      sourceUrl: "https://news.google.com/search?q=AI%20capex%20Nvidia%20hyperscaler%20commentary",
      sourceLinks: [
        { label: "AI capex news", url: "https://news.google.com/search?q=AI%20capex%20Nvidia%20hyperscaler%20commentary" },
        { label: "NVDA news", url: "https://news.google.com/search?q=NVDA%20AI%20capex%20datacenter" },
        { label: "Semiconductor ETF news", url: "https://news.google.com/search?q=SOXL%20SMH%20semiconductor%20AI%20capex" }
      ],
      headline: "Hyperscaler AI capex commentary remains constructive",
      summary: "Sample event: continued AI infrastructure spending supports the revenue setup for AI semiconductor and mega-cap technology holdings.",
      rawText: "Large cloud customers continue to describe AI infrastructure as a strategic spending priority in this demo signal.",
      tickersMentioned: ["NVDA", "VGT"],
      inferredTickersAffected: ["NVDA", "SOXL", "VGT", "AMD", "CRDO"],
      sectorsAffected: ["Semiconductors", "Mega-cap tech", "Software infrastructure"],
      themes: ["AI capex", "datacenter demand", "accelerators", "networking"],
      eventType: "customer demand / AI demand",
      geography: "United States",
      entities: ["Microsoft", "Amazon", "Meta", "Google", "NVIDIA", "AMD", "Credo"],
      sentiment: "positive",
      confidence: 0.7,
      noveltyScore: 0.52,
      credibilityScore: 0.76,
      relevanceScore: 0.9,
      marketImpactScore: 0.66,
      expectedDirectionByTicker: { NVDA: "positive", SOXL: "positive but leveraged", VGT: "positive", AMD: "mixed-positive", CRDO: "mixed-positive" },
      timeHorizon: "quarterly earnings impact",
      evidence: [
        { grade: "B", text: "Reputable company commentary and named customer capex plans would be meaningful if confirmed." },
        { grade: "C", text: "Sample bundle does not include live transcript verification yet." }
      ],
      supportingEvidence: [
        "AI infrastructure demand is a direct driver for NVDA revenue.",
        "VGT and SOXL hold or overlap with large AI semiconductor exposure.",
        "CRDO and AMD can benefit if AI infrastructure spending broadens."
      ],
      contradictingEvidence: [
        "AI capex may already be embedded in valuation.",
        "Customer spending can be lumpy.",
        "Supply constraints may shift revenue timing.",
        "High expectations reduce margin for error."
      ],
      missingEvidence: [
        "Primary earnings-call quotes",
        "Capex dollar changes versus prior plan",
        "Supplier allocation details",
        "Analyst estimate revisions"
      ],
      counterarguments: [
        "Constructive AI capex can be old narrative rather than new information.",
        "Positive demand does not automatically justify adding to concentrated exposure."
      ],
      followUpQuestions: [
        "Is this new capex information or already reflected in estimates?",
        "Which holdings have the largest incremental earnings exposure?"
      ],
      staleAfter: "2026-06-05T11:30:00-04:00",
      factualClaim: "Hyperscaler AI capex commentary remains constructive in the demo signal set.",
      interpretation: "Supports AI infrastructure thesis, but valuation and concentration discipline still matter.",
      businessMechanism: "AI capex -> accelerator, memory, and networking demand -> revenue growth for NVDA/AMD/CRDO and ETF exposure through VGT/SOXL.",
      affectedDrivers: ["revenue", "margins", "valuation", "positioning"],
      impactOrderByTicker: { NVDA: "direct", SOXL: "second-order", VGT: "second-order", AMD: "direct", CRDO: "direct" },
      thesisImpactByTicker: { NVDA: "supports thesis", SOXL: "requires review", VGT: "supports thesis", AMD: "supports thesis", CRDO: "supports thesis" },
      priceAction: {
        status: "peer-group confirmed",
        affectedMove: 0.026,
        peerBasketMove: 0.021,
        sectorEtfMove: 0.018,
        benchmarkMove: 0.006,
        volumeChange: 0.28,
        explanation: "Sample state: AI semiconductor peers are outperforming the benchmark, suggesting the theme is being treated as relevant."
      }
    },
    {
      id: "alpha-rates-semi-selloff",
      timestamp: "2026-05-21T09:55:00-04:00",
      detectedAt: "2026-05-21T09:57:00-04:00",
      sourceType: "macro",
      sourceName: "Sample rates and factor monitor",
      sourceUrl: "https://news.google.com/search?q=rates%20semiconductor%20growth%20stocks%20selloff",
      sourceLinks: [
        { label: "Rates and semis", url: "https://news.google.com/search?q=rates%20semiconductor%20growth%20stocks%20selloff" },
        { label: "SOXL news", url: "https://news.google.com/search?q=SOXL%20semiconductor%20selloff%20rates" },
        { label: "Nasdaq rates news", url: "https://news.google.com/search?q=Nasdaq%20growth%20stocks%20interest%20rates" }
      ],
      headline: "Higher-rate shock pressures semiconductor growth stocks",
      summary: "Sample event: rising yields trigger a semiconductor selloff, elevating risk for SOXL and high-growth chip holdings.",
      rawText: "Rates-sensitive growth equities are selling off while semiconductor ETFs underperform the broad market.",
      tickersMentioned: ["SOXL", "NVDA", "AMD", "MU"],
      inferredTickersAffected: ["SOXL", "NVDA", "AMD", "MU", "CRDO", "VGT"],
      sectorsAffected: ["Semiconductors", "Mega-cap tech"],
      themes: ["rates", "valuation compression", "semiconductor cycle", "leverage"],
      eventType: "interest rates / macro",
      geography: "United States",
      entities: ["Federal Reserve", "Treasury yields", "Semiconductor sector"],
      sentiment: "negative",
      confidence: 0.74,
      noveltyScore: 0.6,
      credibilityScore: 0.82,
      relevanceScore: 0.95,
      marketImpactScore: 0.78,
      expectedDirectionByTicker: { SOXL: "negative", NVDA: "negative risk", AMD: "negative risk", MU: "negative risk", VGT: "negative risk" },
      timeHorizon: "immediate trading impact",
      evidence: [
        { grade: "B", text: "Price and rates moves are observable market data in the demo model." }
      ],
      supportingEvidence: [
        "Higher rates can pressure long-duration growth valuations.",
        "SOXL amplifies semiconductor downside.",
        "NVDA, AMD, MU, and CRDO share factor and sector exposure."
      ],
      contradictingEvidence: [
        "Company fundamentals may remain intact.",
        "Rates shocks can reverse quickly.",
        "Some selloffs are positioning-driven rather than thesis-driven."
      ],
      missingEvidence: [
        "Actual yield move magnitude",
        "Intraday volume confirmation",
        "Options volatility change",
        "Breadth across semiconductor subsectors"
      ],
      counterarguments: [
        "Macro factor selloff is not the same as broken company thesis.",
        "A broad selloff may create opportunity if thesis and sizing are intact."
      ],
      followUpQuestions: [
        "Is SOXL above target after accounting for 3x effective exposure?",
        "Are MU/NVDA moving worse than the semiconductor ETF?"
      ],
      staleAfter: "2026-05-22T09:55:00-04:00",
      factualClaim: "Semiconductors are selling off during a higher-rate shock in the demo tape.",
      interpretation: "Risk is more about factor exposure and position sizing than new company-specific information.",
      businessMechanism: "higher rates -> valuation compression for growth equities -> semiconductor factor selloff -> amplified drawdown in SOXL and concentrated chip holdings.",
      affectedDrivers: ["valuation", "rates", "positioning", "liquidity"],
      impactOrderByTicker: { SOXL: "direct", NVDA: "second-order", AMD: "second-order", MU: "second-order", CRDO: "second-order", VGT: "second-order" },
      thesisImpactByTicker: { SOXL: "confirms known risk", NVDA: "requires review", AMD: "requires review", MU: "requires review", CRDO: "requires review", VGT: "confirms known risk" },
      priceAction: {
        status: "sector-wide",
        affectedMove: -0.061,
        peerBasketMove: -0.026,
        sectorEtfMove: -0.023,
        benchmarkMove: -0.008,
        volumeChange: 0.41,
        explanation: "Sample state: the move is sector-wide and amplified by leverage, not clearly company-specific."
      }
    },
    {
      id: "alpha-risk-off-upro",
      timestamp: "2026-05-21T14:05:00-04:00",
      detectedAt: "2026-05-21T14:08:00-04:00",
      sourceType: "price",
      sourceName: "Sample broad-market monitor",
      sourceUrl: "https://news.google.com/search?q=SP%20500%20risk%20off%20volatility%20UPRO",
      sourceLinks: [
        { label: "Market risk-off news", url: "https://news.google.com/search?q=SP%20500%20risk%20off%20volatility%20UPRO" },
        { label: "Volatility check", url: "https://www.google.com/search?q=VIX%20S%26P%20500%20risk%20off" },
        { label: "UPRO news", url: "https://news.google.com/search?q=UPRO%20leveraged%20S%26P%20500%20risk" }
      ],
      headline: "Broad market risk-off tape hits leveraged S&P exposure",
      summary: "Sample event: weakening breadth and lower liquidity raise review urgency for UPRO.",
      rawText: "The S&P 500 declines while volatility rises and market breadth weakens.",
      tickersMentioned: ["UPRO"],
      inferredTickersAffected: ["UPRO", "VGT", "QQQ"],
      sectorsAffected: ["Broad market", "Mega-cap tech"],
      themes: ["risk-off", "liquidity", "breadth", "leverage"],
      eventType: "macro / unusual price-volume",
      geography: "United States",
      entities: ["S&P 500", "VIX", "Federal Reserve liquidity"],
      sentiment: "negative",
      confidence: 0.76,
      noveltyScore: 0.64,
      credibilityScore: 0.84,
      relevanceScore: 0.86,
      marketImpactScore: 0.72,
      expectedDirectionByTicker: { UPRO: "negative", VGT: "negative risk", QQQ: "negative risk" },
      timeHorizon: "immediate trading impact",
      evidence: [
        { grade: "B", text: "Broad-market price, breadth, and volatility indicators are observable market data in demo mode." }
      ],
      supportingEvidence: [
        "UPRO is leveraged to S&P 500 daily moves.",
        "Risk-off conditions increase drawdown risk and volatility decay.",
        "Mega-cap technology overlap can add correlated pressure."
      ],
      contradictingEvidence: [
        "Risk-off days can reverse.",
        "Broad-market thesis may remain intact over longer horizons.",
        "A single session does not confirm a regime change."
      ],
      missingEvidence: [
        "Actual breadth reading",
        "Volatility term-structure change",
        "Credit-spread confirmation",
        "Follow-through over multiple sessions"
      ],
      counterarguments: [
        "One bad tape does not break a long-term growth thesis.",
        "UPRO risk should be handled through pre-set sizing rules, not panic."
      ],
      followUpQuestions: [
        "Is UPRO above its target allocation?",
        "Has volatility risen enough to trigger the stop-review rule?"
      ],
      staleAfter: "2026-05-22T14:05:00-04:00",
      factualClaim: "Broad-market risk-off conditions are pressuring leveraged S&P exposure in the demo tape.",
      interpretation: "UPRO requires sizing review when volatility and breadth worsen together.",
      businessMechanism: "risk-off tape -> S&P 500 drawdown and volatility rise -> leveraged ETF drawdown and volatility decay risk -> position-sizing review.",
      affectedDrivers: ["rates", "liquidity", "positioning"],
      impactOrderByTicker: { UPRO: "direct", VGT: "second-order", QQQ: "second-order" },
      thesisImpactByTicker: { UPRO: "confirms known risk", VGT: "requires review" },
      priceAction: {
        status: "macro-driven",
        affectedMove: -0.045,
        peerBasketMove: -0.018,
        sectorEtfMove: -0.014,
        benchmarkMove: -0.015,
        volumeChange: 0.33,
        explanation: "Sample state: UPRO is moving with broad-market risk-off conditions, as expected for leveraged S&P exposure."
      }
    },
    {
      id: "alpha-social-rumor-crdo",
      timestamp: "2026-05-21T15:10:00-04:00",
      detectedAt: "2026-05-21T15:11:00-04:00",
      sourceType: "social",
      sourceName: "Sample social chatter",
      sourceUrl: "https://news.google.com/search?q=CRDO%20AI%20networking%20order",
      sourceLinks: [
        { label: "Look for confirmation", url: "https://news.google.com/search?q=CRDO%20AI%20networking%20order" },
        { label: "Company releases", url: "https://www.credosemi.com/news/" }
      ],
      headline: "Unverified social post claims a large AI networking order for CRDO",
      summary: "Sample event: a vague social-media rumor claims CRDO won a major AI networking order, but no primary source or named customer is provided.",
      rawText: "Unconfirmed social rumor says CRDO has a huge order. No source link, no customer name, no filing, no company statement.",
      tickersMentioned: ["CRDO"],
      inferredTickersAffected: ["CRDO", "NVDA"],
      sectorsAffected: ["Semiconductors", "AI networking"],
      themes: ["social rumor", "AI demand", "customer order"],
      eventType: "social rumor",
      geography: "Unknown",
      entities: ["Credo Technology Group", "AI networking customer"],
      sentiment: "positive-rumor",
      confidence: 0.18,
      noveltyScore: 0.5,
      credibilityScore: 0.16,
      relevanceScore: 0.5,
      marketImpactScore: 0.26,
      expectedDirectionByTicker: { CRDO: "uncertain", NVDA: "no clear impact" },
      timeHorizon: "unknown",
      evidence: [
        { grade: "D", text: "Social media claim without primary source, named customer, or independent confirmation." }
      ],
      supportingEvidence: [
        "CRDO is levered to AI networking demand.",
        "A confirmed large order could matter for revenue."
      ],
      contradictingEvidence: [
        "No primary source.",
        "No named customer.",
        "No company release or filing.",
        "No independent confirmation.",
        "No clear price-action confirmation."
      ],
      missingEvidence: [
        "Customer identity",
        "Order size",
        "Shipment timing",
        "Company confirmation",
        "Filing or earnings-call confirmation",
        "Named reputable report"
      ],
      counterarguments: [
        "This may be engagement bait.",
        "The claim may recycle old AI networking optimism without new facts."
      ],
      followUpQuestions: [
        "Is there a primary source or reputable named-source report?",
        "Does CRDO price/volume confirm that the market cares?"
      ],
      staleAfter: "2026-05-22T15:10:00-04:00",
      factualClaim: "An unverified social post claims CRDO has a large AI networking order.",
      interpretation: "Low-trust rumor; log only unless confirmed by primary or reputable sources.",
      businessMechanism: "confirmed AI networking order -> potential revenue growth, but the claim lacks enough evidence to treat as investable signal.",
      affectedDrivers: ["revenue"],
      impactOrderByTicker: { CRDO: "direct", NVDA: "third-order" },
      thesisImpactByTicker: { CRDO: "no thesis impact / noise", NVDA: "no thesis impact / noise" },
      priceAction: {
        status: "no confirmation",
        affectedMove: 0.004,
        peerBasketMove: 0.006,
        sectorEtfMove: 0.007,
        benchmarkMove: 0.003,
        volumeChange: 0.04,
        explanation: "Sample state: there is no meaningful CRDO-specific move or volume confirmation."
      }
    }
  ];
}

export function normalizeAlphaEvent(event = {}) {
  const affected = unique([...(event.tickersMentioned || []), ...(event.inferredTickersAffected || [])].map(normalizeTicker));
  const timestamp = event.timestamp || new Date().toISOString();
  return {
    id: event.id || `signal-${timestamp}-${affected.join("-") || "portfolio"}`,
    timestamp,
    detectedAt: event.detectedAt || timestamp,
    sourceType: event.sourceType || "manual",
    sourceName: event.sourceName || "Sample signal engine",
    sourceUrl: event.sourceUrl || "",
    sourceLinks: normalizeSourceLinks(event),
    headline: event.headline || "Untitled signal",
    summary: event.summary || "",
    rawText: event.rawText || event.summary || "",
    tickersMentioned: unique((event.tickersMentioned || []).map(normalizeTicker)),
    inferredTickersAffected: unique((event.inferredTickersAffected || []).map(normalizeTicker)),
    affectedTickers: affected,
    sectorsAffected: event.sectorsAffected || [],
    themes: event.themes || [],
    eventType: event.eventType || "manual",
    geography: event.geography || "",
    entities: event.entities || [],
    sentiment: event.sentiment || "neutral",
    confidence: clamp01(event.confidence ?? 0.4),
    noveltyScore: clamp01(event.noveltyScore ?? 0.45),
    credibilityScore: clamp01(event.credibilityScore ?? sourceCredibilityDefault(event.sourceType)),
    relevanceScore: clamp01(event.relevanceScore ?? 0.4),
    marketImpactScore: clamp01(event.marketImpactScore ?? 0.35),
    expectedDirectionByTicker: event.expectedDirectionByTicker || {},
    scenarioImpactByTicker: event.scenarioImpactByTicker || {},
    timeHorizon: event.timeHorizon || "unknown",
    evidence: event.evidence || [],
    supportingEvidence: event.supportingEvidence || [],
    contradictingEvidence: event.contradictingEvidence || [],
    missingEvidence: event.missingEvidence || [],
    counterarguments: event.counterarguments || [],
    followUpQuestions: event.followUpQuestions || [],
    whatToMonitorNext: event.whatToMonitorNext || event.followUpQuestions || [],
    staleAfter: event.staleAfter || staleAfter(timestamp, 7),
    factualClaim: event.factualClaim || event.summary || event.headline || "",
    interpretation: event.interpretation || "",
    businessMechanism: event.businessMechanism || "",
    mechanism: event.businessMechanism || event.mechanism || "",
    affectedDrivers: event.affectedDrivers || [],
    impactOrderByTicker: event.impactOrderByTicker || {},
    thesisImpactByTicker: event.thesisImpactByTicker || {},
    priceAction: event.priceAction || { status: "unknown", explanation: "No price-action context available." }
  };
}

export function buildAlphaSignals(events = [], holdings = [], thesisProfiles = demoThesisProfiles()) {
  return events.map((event) => scoreAlphaEvent(normalizeAlphaEvent(event), holdings, thesisProfiles))
    .sort((a, b) => actionRank(b.actionabilityLevel) - actionRank(a.actionabilityLevel) || b.priorityScore - a.priorityScore);
}

export function scoreAlphaEvent(event, holdings = [], thesisProfiles = demoThesisProfiles()) {
  const affectedSet = new Set(event.affectedTickers);
  const affectedHoldings = holdings.filter((holding) => affectedSet.has(holding.ticker));
  const totalValue = holdings.reduce((sum, holding) => sum + (Number(holding.marketValue) || 0), 0);
  const affectedWeight = totalValue
    ? affectedHoldings.reduce((sum, holding) => sum + (Number(holding.marketValue) || 0), 0) / totalValue
    : 0;
  const primaryTicker = primaryTickerForEvent(event, affectedHoldings);
  const thesisProfile = thesisProfiles[primaryTicker] || {};
  const thesisImpact = event.thesisImpactByTicker?.[primaryTicker] || inferThesisImpact(event, thesisProfile);
  const evidenceGrade = evidenceGradeForEvent(event);
  const evidenceScore = evidenceScoreForGrade(evidenceGrade);
  const portfolioRelevanceScore = portfolioRelevanceScoreForEvent(event, affectedWeight, affectedHoldings);
  const thesisImpactScore = thesisImpactScoreForEvent(thesisImpact);
  const materialityScore = materialityScoreForEvent(event, affectedWeight);
  const confidenceScore = confidenceScoreForEvent(event, evidenceGrade);
  const actionability = actionabilityForEvent(event, {
    affectedWeight,
    materialityScore,
    confidenceScore,
    thesisImpact,
    evidenceGrade,
    affectedHoldings
  });
  const priorityScore = priorityScoreForEvent(event, {
    portfolioRelevanceScore,
    materialityScore,
    confidenceScore,
    evidenceGrade,
    actionabilityScore: actionability.score
  });
  const impactType = event.impactOrderByTicker?.[primaryTicker] || strongestImpactOrder(event);
  const noActionRecommendation = actionability.level === "None" || actionability.level === "Low";

  return {
    ...event,
    affectedHoldings: affectedHoldings.map((holding) => ({
      ticker: holding.ticker,
      name: holding.name,
      account: holding.account,
      marketValue: holding.marketValue,
      weight: holding.portfolioWeight || affectedWeight,
      riskLevel: holding.riskLevel,
      strategySleeve: holding.strategySleeve
    })),
    primaryTicker,
    thesisProfile,
    thesisImpact,
    thesisImpactScore,
    evidenceGrade,
    evidenceScore,
    materialityScore,
    confidenceScore,
    portfolioRelevanceScore,
    affectedWeight,
    affectedWeightLabel: formatPct(affectedWeight),
    actionabilityLevel: actionability.level,
    actionLabel: ACTION_LABELS[actionability.level] || actionability.level,
    actionabilityScore: actionability.score,
    actionabilityReason: actionability.reason,
    positionSizingCheck: positionSizingCheck({ affectedHoldings, affectedWeight, evidenceGrade, thesisImpact, confidenceScore }),
    priorityScore,
    pricedInStatus: pricedInStatus(event),
    nextReviewQuestion: nextReviewQuestion(event, thesisImpact),
    impactType,
    isLowSignal: noActionRecommendation || evidenceGrade === "D" || evidenceGrade === "F",
    isStaleSignal: isStaleSignal(event),
    noActionRecommendation,
    whatChanged: event.factualClaim || event.summary || event.headline,
    whyItMatters: event.interpretation || event.businessMechanism || "No clear portfolio mechanism supplied.",
    whyThisMattersToTucker: whyThisMattersToTucker({ affectedHoldings, affectedWeight, thesisImpact, impactType, evidenceGrade }),
    whatCouldProveWrong: whatCouldProveWrong(event)
  };
}

export function buildDecisionBrief(signals = [], analysis = {}) {
  const activeSignals = signals.filter((signal) => !signal.isStaleSignal);
  const staleSignals = signals.filter((signal) => signal.isStaleSignal);
  const sortedSignals = [...activeSignals].sort((a, b) =>
    actionRank(b.actionabilityLevel) - actionRank(a.actionabilityLevel) ||
    b.priorityScore - a.priorityScore
  );
  const risks = (analysis.alerts || [])
    .filter((alert) => ["high", "critical"].includes(alert.severity))
    .slice(0, 3)
    .map((alert) => ({
      id: alert.id,
      title: alert.title,
      detail: alert.detail,
      severity: alert.severity
    }));
  const monitorItems = sortedSignals
    .flatMap((signal) => (signal.whatToMonitorNext || []).slice(0, 2).map((item) => ({
      id: `${signal.id}:${item}`,
      ticker: signal.primaryTicker,
      text: item,
      source: signal.headline
    })))
    .slice(0, 3);
  const thesisImpactEvents = sortedSignals
    .filter((signal) => signal.thesisImpact && signal.thesisImpact !== "no thesis impact / noise")
    .slice(0, 4)
    .map((signal) => ({
      id: signal.id,
      ticker: signal.primaryTicker,
      headline: signal.headline,
      thesisImpact: signal.thesisImpact,
      actionLabel: signal.actionLabel
    }));
  const noActionRecommendations = signals
    .filter((signal) => signal.noActionRecommendation || signal.isLowSignal)
    .slice(0, 3)
    .map((signal) => ({
      id: signal.id,
      headline: signal.headline,
      reason: lowSignalReason(signal),
      actionLabel: signal.actionLabel
    }));
  const staleDataWarnings = [
    ...(analysis.dataQuality?.issues || [])
      .filter((issue) => issue.type === "stale-data")
      .slice(0, 3)
      .map((issue) => ({ id: issue.message, message: issue.message })),
    ...staleSignals.slice(0, 2).map((signal) => ({ id: signal.id, message: `${signal.headline} is past its stale-after date.` }))
  ];

  return {
    generatedAt: new Date().toISOString(),
    topPrioritySignals: sortedSignals.slice(0, 3),
    topPortfolioRisks: risks,
    monitorItems,
    thesisImpactEvents,
    noActionRecommendations,
    staleDataWarnings,
    summaryLine: summaryLine(sortedSignals, risks, noActionRecommendations)
  };
}

export function materialityScoreForEvent(event, affectedWeight = 0) {
  const driverScore = (event.affectedDrivers || []).length ? Math.min(1, event.affectedDrivers.length / 4) : 0.1;
  const impactOrder = strongestImpactOrder(event);
  const directness = IMPACT_POINTS[impactOrder] || 0.35;
  const eventImpact = Number(event.marketImpactScore || 0.35);
  const mechanismPenalty = event.businessMechanism ? 0 : 0.18;
  return clamp01(eventImpact * 0.34 + Math.min(1, affectedWeight * 3) * 0.28 + driverScore * 0.2 + directness * 0.18 - mechanismPenalty);
}

export function confidenceScoreForEvent(event, evidenceGrade = evidenceGradeForEvent(event)) {
  const evidence = evidenceScoreForGrade(evidenceGrade);
  const sourceCredibility = Number(event.credibilityScore ?? sourceCredibilityDefault(event.sourceType));
  const statedConfidence = Number(event.confidence ?? 0.4);
  const missingPenalty = Math.min(0.22, (event.missingEvidence || []).length * 0.025);
  const rumorPenalty = isRumor(event) ? 0.14 : 0;
  const noSourcePenalty = event.sourceUrl || event.sourceType !== "social" ? 0 : 0.08;
  return clamp01(evidence * 0.34 + sourceCredibility * 0.28 + statedConfidence * 0.28 + Number(event.noveltyScore || 0.4) * 0.1 - missingPenalty - rumorPenalty - noSourcePenalty);
}

export function evidenceGradeForEvent(event) {
  const grades = (event.evidence || []).map((item) => item.grade).filter(Boolean);
  if (!grades.length) return event.sourceType === "social" ? "D" : "C";
  return grades.sort((a, b) => (EVIDENCE_POINTS[b] || 0) - (EVIDENCE_POINTS[a] || 0))[0];
}

export function evidenceScoreForGrade(grade) {
  return EVIDENCE_POINTS[grade] || 0.2;
}

export function portfolioRelevanceScoreForEvent(event, affectedWeight = 0, affectedHoldings = []) {
  const holdingsScore = Math.min(1, affectedHoldings.length / 4);
  const weightScore = Math.min(1, affectedWeight * 3);
  const explicitRelevance = Number(event.relevanceScore ?? 0.4);
  const leveragedBoost = affectedHoldings.some((holding) => /very high/i.test(holding.riskLevel || "")) ? 0.12 : 0;
  return clamp01(explicitRelevance * 0.36 + weightScore * 0.38 + holdingsScore * 0.18 + leveragedBoost);
}

export function thesisImpactScoreForEvent(thesisImpact) {
  return THESIS_POINTS[thesisImpact] || 0.2;
}

export function actionabilityForEvent(event, context) {
  const thesis = thesisImpactScoreForEvent(context.thesisImpact);
  const leverageBoost = context.affectedHoldings.some((holding) => /very high/i.test(holding.riskLevel || "")) ? 0.12 : 0;
  const urgency = /immediate|trading|earnings/i.test(event.timeHorizon || "") ? 0.1 : 0;
  const lowEvidencePenalty = context.evidenceGrade === "D" ? 0.12 : context.evidenceGrade === "F" ? 0.22 : 0;
  const score = clamp01(
    context.materialityScore * 0.3 +
    context.confidenceScore * 0.22 +
    thesis * 0.22 +
    Math.min(1, context.affectedWeight * 3) * 0.16 +
    leverageBoost +
    urgency -
    lowEvidencePenalty
  );
  if (score >= 0.82) return { level: "Critical", score, reason: "Immediate review. Thesis or large exposure may be affected." };
  if (score >= 0.64) return { level: "High", score, reason: "Review now. Signal is material enough to check thesis and sizing." };
  if (score >= 0.42) return { level: "Medium", score, reason: "Monitor and add to thesis notes." };
  if (score >= 0.22) return { level: "Low", score, reason: "Log only. No portfolio action yet." };
  return { level: "None", score, reason: "Ignore. Low-signal or low-relevance item." };
}

export function priorityScoreForEvent(event, context) {
  const grade = evidenceScoreForGrade(context.evidenceGrade);
  const timeDecay = timeDecayForEvent(event.timestamp);
  const confirmation = priceConfirmationMultiplier(event.priceAction?.status);
  const actionabilityMultiplier = 1 + (context.actionabilityScore ?? ACTIONABILITY_POINTS.Low);
  const raw =
    Math.max(0.08, context.portfolioRelevanceScore) *
    context.materialityScore *
    context.confidenceScore *
    Number(event.noveltyScore || 0.5) *
    grade *
    timeDecay *
    confirmation *
    actionabilityMultiplier;
  return Math.round(raw * 1000);
}

export function classifyPriceAction(priceAction = {}) {
  return priceAction.status || "unknown";
}

export function compactActionLabel(level) {
  return ACTION_LABELS[level] || level || "Monitor";
}

export function signalActionCategory(signal = {}) {
  if (signal.isLowSignal || signal.evidenceGrade === "D" || signal.evidenceGrade === "F") {
    return signal.actionabilityLevel === "None" ? "Ignore" : "Log Only";
  }
  if (signal.thesisImpact === "breaks thesis") return "Critical Review";
  if (signal.thesisImpact === "weakens thesis" || signal.thesisImpact === "requires review") return "Review";
  if (signal.thesisImpact === "supports thesis") {
    const eventType = String(signal.eventType || "").toLowerCase();
    const impactType = String(signal.impactType || "").toLowerCase();
    if (eventType.includes("labor") || eventType.includes("supply") || impactType.includes("second")) {
      return "Monitor";
    }
    return "Positive Signal";
  }
  if (signal.actionabilityLevel === "Critical") return "Critical Review";
  if (signal.actionabilityLevel === "High") return "Review";
  if (signal.actionabilityLevel === "Medium") return "Monitor";
  if (signal.actionabilityLevel === "Low") return "Log Only";
  return "Ignore";
}

export function actionCategorySeverity(category = "") {
  return {
    "Critical Review": "critical",
    Review: "medium",
    Monitor: "low",
    "Positive Signal": "positive",
    "Log Only": "low",
    Ignore: "low"
  }[category] || "low";
}

function primaryTickerForEvent(event, affectedHoldings) {
  if (affectedHoldings.length) {
    const ordered = [...affectedHoldings].sort((a, b) => (Number(b.marketValue) || 0) - (Number(a.marketValue) || 0));
    const explicitlyFirst = event.inferredTickersAffected?.find((ticker) => ordered.some((holding) => holding.ticker === ticker));
    return explicitlyFirst || ordered[0].ticker;
  }
  return event.inferredTickersAffected?.[0] || event.tickersMentioned?.[0] || event.affectedTickers?.[0];
}

function normalizeSourceLinks(event = {}) {
  const links = Array.isArray(event.sourceLinks) ? event.sourceLinks : [];
  const normalized = links
    .map((link) => ({
      label: String(link.label || link.sourceName || "Source").trim(),
      url: String(link.url || link.href || "").trim()
    }))
    .filter((link) => link.label && /^https?:\/\//i.test(link.url));
  if (!normalized.length && /^https?:\/\//i.test(String(event.sourceUrl || ""))) {
    normalized.push({ label: event.sourceName || "Source", url: event.sourceUrl });
  }
  return normalized.slice(0, 4);
}

function strongestImpactOrder(event) {
  const values = Object.values(event.impactOrderByTicker || {});
  if (values.includes("direct")) return "direct";
  if (values.includes("second-order")) return "second-order";
  return values[0] || "third-order";
}

function positionSizingCheck({ affectedHoldings, affectedWeight, evidenceGrade, thesisImpact, confidenceScore }) {
  const tickers = uniqueTickers(affectedHoldings).join(", ") || "No direct holding";
  const hasLeveraged = affectedHoldings.some((holding) => /very high/i.test(holding.riskLevel || ""));
  if (evidenceGrade === "D" || evidenceGrade === "F") {
    return `${tickers}: evidence quality is too low for position-size changes. Log only until better evidence appears.`;
  }
  if (hasLeveraged) {
    return `${tickers}: effective exposure is elevated because leveraged holdings are affected. Review sizing before interpreting the signal directionally.`;
  }
  if (affectedWeight >= 0.2 && confidenceScore < 0.55) {
    return `${tickers}: large affected portfolio weight with limited confidence. Review, but do not overreact.`;
  }
  if (thesisImpact === "breaks thesis" || thesisImpact === "weakens thesis") {
    return `${tickers}: thesis-relevant negative signal. Compare current weight against target and downside scenario.`;
  }
  return `${tickers}: sizing review should follow target allocation, conviction, and evidence quality.`;
}

function whyThisMattersToTucker({ affectedHoldings, affectedWeight, thesisImpact, impactType, evidenceGrade }) {
  if (!affectedHoldings.length) return "This has no direct match to current holdings, so it should stay below portfolio-action priority.";
  const tickers = uniqueTickers(affectedHoldings);
  const leveraged = affectedHoldings.filter((holding) => /very high/i.test(holding.riskLevel || "") || /leveraged/i.test(holding.strategySleeve || ""));
  const sectors = [...new Set(affectedHoldings.map((holding) => holding.strategySleeve || holding.riskLevel).filter(Boolean))].slice(0, 3);
  const leveragedTickers = uniqueTickers(leveraged);
  const reasons = [
    `${tickers.join(", ")} represent ${formatPct(affectedWeight)} of the current portfolio`,
    impactType ? `impact is ${impactType}` : "",
    leveragedTickers.length ? `leveraged exposure is involved through ${leveragedTickers.join(", ")}` : "",
    thesisImpact && thesisImpact !== "no thesis impact / noise" ? `thesis impact is ${thesisImpact}` : "",
    sectors.length ? `risk is concentrated in ${sectors.join(", ")}` : "",
    evidenceGrade === "D" || evidenceGrade === "F" ? `evidence quality is only ${evidenceGrade}` : ""
  ].filter(Boolean);
  return `This matters because ${reasons.join("; ")}.`;
}

function uniqueTickers(holdings = []) {
  return [...new Set(holdings.map((holding) => holding.ticker).filter(Boolean))];
}

function whatCouldProveWrong(event) {
  const counter = (event.counterarguments || event.contradictingEvidence || []).slice(0, 3);
  if (counter.length) return counter;
  if (event.missingEvidence?.length) return [`Missing evidence appears benign or contradicts the mechanism: ${event.missingEvidence.slice(0, 2).join(", ")}.`];
  return ["No clear falsification test supplied yet."];
}

function lowSignalReason(signal) {
  if (signal.evidenceGrade === "D" || signal.evidenceGrade === "F") {
    return `Low-quality ${signal.sourceType} item. Evidence grade ${signal.evidenceGrade}. ${signal.priceAction?.status === "no confirmation" ? "No price-action confirmation. " : ""}Action: ${signal.actionLabel}.`;
  }
  return `${signal.actionLabel}: ${signal.actionabilityReason}`;
}

function summaryLine(signals, risks, noActionRecommendations) {
  const top = signals[0];
  if (!top) return "No active Alpha Engine signals need review from the current demo data.";
  const riskText = risks.length ? `${risks.length} portfolio risk${risks.length === 1 ? "" : "s"} need attention` : "no high-severity portfolio risks are active";
  const ignoreText = noActionRecommendations.length ? `${noActionRecommendations.length} low-signal item${noActionRecommendations.length === 1 ? "" : "s"} can be ignored or logged` : "no low-signal items surfaced";
  return `${top.actionLabel}: ${top.primaryTicker || "Portfolio"} is the top signal. ${riskText}; ${ignoreText}.`;
}

function pricedInStatus(event) {
  const status = classifyPriceAction(event.priceAction);
  if (status === "no confirmation") return "No price-action confirmation yet";
  if (status === "company-specific" || status === "peer-group confirmed") return "Partially priced in";
  if (status === "sector-wide" || status === "macro-driven" || status === "factor-driven") return "Probably already priced in through broader factor move";
  return "Unknown";
}

function inferThesisImpact(event, thesisProfile) {
  const text = `${event.summary || ""} ${event.rawText || ""} ${event.businessMechanism || ""}`.toLowerCase();
  if ((thesisProfile.thesisBreakingConditions || []).some((item) => hasMeaningfulOverlap(text, item))) return "breaks thesis";
  if ((thesisProfile.keyRisks || []).some((item) => hasMeaningfulOverlap(text, item))) return "confirms known risk";
  if ((thesisProfile.bullishAssumptions || []).some((item) => hasMeaningfulOverlap(text, item))) return "supports thesis";
  if (event.sourceType === "social" && confidenceScoreForEvent(event) < 0.3) return "no thesis impact / noise";
  if (event.marketImpactScore >= 0.7) return "requires review";
  return "no thesis impact / noise";
}

function nextReviewQuestion(event, thesisImpact) {
  if (event.followUpQuestions?.length) return event.followUpQuestions[0];
  if (thesisImpact === "supports thesis") return "What primary evidence would confirm this support is financially material?";
  if (thesisImpact === "weakens thesis" || thesisImpact === "breaks thesis") return "Which thesis assumption changed, and what data would prove it wrong?";
  return "Is there a clear mechanism that affects revenue, margins, cash flow, rates, liquidity, or positioning?";
}

function timeDecayForEvent(timestamp) {
  if (!timestamp) return 0.8;
  const ageHours = Math.max(0, (Date.now() - new Date(timestamp).getTime()) / 36e5);
  return Math.max(0.35, Math.exp(-ageHours / 96));
}

function isStaleSignal(event) {
  if (!event.staleAfter) return false;
  const staleAt = new Date(event.staleAfter).getTime();
  return Number.isFinite(staleAt) && Date.now() > staleAt;
}

function actionRank(level) {
  return { Critical: 5, High: 4, Medium: 3, Low: 2, None: 1 }[level] || 0;
}

function priceConfirmationMultiplier(status) {
  if (status === "company-specific" || status === "peer-group confirmed") return 1.16;
  if (status === "sector-wide" || status === "macro-driven" || status === "factor-driven") return 1.04;
  if (status === "no confirmation") return 0.86;
  return 0.94;
}

function sourceCredibilityDefault(sourceType) {
  return { filing: 0.95, earnings: 0.9, news: 0.68, macro: 0.76, price: 0.82, manual: 0.5, social: 0.22 }[sourceType] || 0.4;
}

function isRumor(event) {
  return /rumor|unconfirmed|speculation|social/i.test(`${event.sourceType} ${event.eventType} ${event.summary} ${event.rawText}`);
}

function hasMeaningfulOverlap(text, phrase) {
  const words = String(phrase || "")
    .toLowerCase()
    .split(/[^a-z0-9/]+/)
    .filter((word) => word.length > 5);
  return words.some((word) => text.includes(word));
}

function staleAfter(timestamp, days) {
  const date = new Date(timestamp);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function normalizeTicker(ticker) {
  return String(ticker || "").trim().toUpperCase();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function formatPct(value) {
  return `${((Number(value) || 0) * 100).toFixed(1)}%`;
}
