(function attachDataAdapters(root, factory) {
  const adapters = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = adapters;
  }

  root.DataAdapters = adapters;
})(typeof globalThis !== "undefined" ? globalThis : window, function createDataAdapters() {
  "use strict";

  const FIELD_ALIASES = {
    ticker: [
      "ticker",
      "symbol",
      "symbols",
      "symbol/cusip",
      "symbolcusip",
      "symbols/cusip",
      "symbolandcusip",
      "tickersymbol",
      "tickercusip",
      "securitysymbol",
      "securityid",
      "securityidentifier",
      "securityidcusip",
      "securityid/cusip",
      "cusip",
      "fidelitysymbol",
      "instrument",
      "security",
      "watchlistsymbol"
    ],
    company: [
      "company",
      "companyname",
      "name",
      "securityname",
      "securitydescription",
      "security",
      "securitydescription",
      "securitydesc",
      "description",
      "securitydescriptionname",
      "securitydescriptionissuer",
      "investmentdescription",
      "investmentname",
      "holding",
      "holdingname"
    ],
    sector: ["sector", "sectorname", "industrysector"],
    shares: ["shares", "quantity", "qty", "qtyquantity", "sharequantity", "quantityshares", "currentquantity", "units", "unitsheld", "sharesheld"],
    price: [
      "price",
      "lastprice",
      "lastpricepershare",
      "last",
      "currentprice",
      "currentpricepershare",
      "marketprice",
      "pricepershare",
      "shareprice",
      "lasttrade",
      "lastclose",
      "unitprice",
      "unitpriceusd",
      "unitpriceus",
      "lastpriceus",
      "currentpriceusd",
      "currentpriceus"
    ],
    costBasis: [
      "costbasis",
      "costbasisusd",
      "costbasisus",
      "costbasistotal",
      "costbasistotalus",
      "totalcostbasis",
      "totalcostbasisusd",
      "totalcostbasisus",
      "costbasisvalue",
      "costbasistotalvalue",
      "costbasispershare",
      "costbasispershareusd",
      "costbasispershareus",
      "costpershare",
      "costpershareusd",
      "costpershareus",
      "totalcost",
      "cost",
      "averagecost",
      "averagecostbasis",
      "averagecostbasisusd",
      "averagecostbasisus",
      "avgcost",
      "avgcostusd",
      "avgcostus",
      "basis",
      "totalbasis",
      "totalbasisus",
      "fidelitycostbasis"
    ],
    marketValue: [
      "marketvalue",
      "currentvalue",
      "currentvalueusd",
      "currentvalueus",
      "totalvalue",
      "totalcurrentvalue",
      "value",
      "positionvalue",
      "positioncurrentvalue",
      "currentmarketvalue",
      "currentmarketvalueusd",
      "currentmarketvalueus",
      "marketvaluecurrent",
      "marketvalueusd",
      "marketvalueus",
      "currentvalueasof",
      "currentvaluedollars",
      "mktval",
      "mktvalmarketvalue",
      "valueusd",
      "valueus"
    ],
    account: [
      "account",
      "acct",
      "acctname",
      "accountname",
      "accountnumber",
      "accountname/number",
      "accountnamenumber",
      "registration",
      "accountregistration",
      "brokerageaccount"
    ],
    accountType: ["accounttype", "accttype", "accountclassification", "registrationtype", "typeofaccount", "accountcategory", "accounttypename", "accountregistrationtype", "registrationaccounttype"],
    type: ["type", "holdingtype", "securitytype"],
    unrealizedGain: [
      "gainloss",
      "gainlossdollar",
      "gain/loss",
      "unrealizedgainloss",
      "unrealizedgain/loss",
      "unrealizedgain",
      "unrealizedgain/lossdollar",
      "totalgainloss",
      "totalgainlossdollar",
      "totalgain/loss",
      "totalgain/lossdollar",
      "gain",
      "gaindollar",
      "gaingain/loss",
      "gaingain/lossdollar"
    ],
    unrealizedGainPercent: [
      "percentgainloss",
      "percentgain/loss",
      "gainlosspercent",
      "gain/losspercent",
      "unrealizedgainlosspercent",
      "unrealizedgain/losspercent",
      "totalgainlosspercent",
      "totalgain/losspercent",
      "gainpercent",
      "gainpercentgain/losspercent"
    ],
    dailyChange: [
      "todaygainloss",
      "todaygainlossdollar",
      "todaygain/loss",
      "todaygain/lossdollar",
      "todaysgainlossdollar",
      "todaysgain/loss",
      "todaysgain/lossdollar",
      "daychng",
      "daychngdollar",
      "daychngdaychange",
      "daychngdollardaychangedollar",
      "daychange",
      "daychangedollar"
    ],
    dailyChangePercent: [
      "todaygainlosspercent",
      "todaygain/losspercent",
      "todaysgainlosspercent",
      "todaysgain/losspercent",
      "daychngpercent",
      "daychngpercentdaychangepercent",
      "daychangepercent"
    ],
    quant: ["quant", "quantscore", "saquant", "quantrating", "quantscore"],
    growth: ["growth", "growthscore", "growthgrade", "sagrowth"],
    momentum: ["momentum", "momentumscore", "momentumgrade", "samomentum"],
    value: ["valuegrade", "value", "valuation", "valuationgrade"],
    profitability: ["profitability", "profitabilitygrade", "profitabilityscore"],
    revisions: ["revisions", "revision", "epsrevisions", "revisionsgrade", "revisiongrade"],
    authorRating: ["authorrating", "authorsrating", "sarating", "rating", "analyst"],
    wallStreetRating: ["wallstreetrating", "wallstreet", "sellside", "analystconsensus"],
    revenueGrowth: [
      "revenuegrowth",
      "salesgrowth",
      "revgrowth",
      "revenuegrowthyoy",
      "salesgrowthyoy"
    ],
    epsGrowth: ["epsgrowth", "earningsgrowth", "epsgrowthyoy", "earningsgrowthyoy"],
    forwardPe: ["forwardpe", "fwdpe", "peforward", "forwardp/e", "fwdp/e"],
    priceToSales: ["pricetosales", "psratio", "p/s", "pricesales", "pricetosalesratio"],
    grossMargin: ["grossmargin", "grossmarginpercent", "grossmargin%", "grossprofitmargin"],
    freeCashFlowMargin: ["freecashflowmargin", "fcfmargin", "fcfmarginpercent", "freecashflowmargin%"],
    operatingCashFlow: ["operatingcashflow", "cashfromoperations", "ocf", "cashflowfromoperations"],
    capitalExpenditures: ["capitalexpenditures", "capex", "capitalexpenditure"],
    freeCashFlow: ["freecashflow", "fcf"],
    cashAndEquivalents: ["cashandequivalents", "cash", "totalcash", "cashshortterminvestments"],
    totalDebt: ["totaldebt", "debt", "longtermdebt", "netdebt"],
    debtToEquity: ["debttoequity", "d/e", "debtequity"],
    dividendYield: ["dividendyield", "yield", "divyield"],
    dividendGrade: ["dividendgrade", "dividend"],
    nextEarnings: ["nextearnings", "earningsdate", "nextreport", "reportdate"],
    notes: ["notes", "thesis", "comment", "comments", "watchlistnotes"]
  };

  const GRADE_TO_SCORE = {
    "a+": 5,
    a: 4.8,
    "a-": 4.6,
    "b+": 4.3,
    b: 4,
    "b-": 3.7,
    "c+": 3.3,
    c: 3,
    "c-": 2.7,
    "d+": 2.3,
    d: 2,
    "d-": 1.7,
    f: 1
  };

  const RATING_TO_SCORE = {
    "strong buy": 5,
    buy: 4.4,
    bullish: 4.2,
    outperform: 4.1,
    hold: 3,
    neutral: 3,
    "market perform": 3,
    sell: 1.8,
    bearish: 1.8,
    "strong sell": 1
  };

  function parseCsv(text, options = {}) {
    if (typeof text !== "string") {
      throw new TypeError("CSV input must be a string.");
    }

    const delimiter = options.delimiter || detectDelimiter(text);
    const source = text.replace(/^\uFEFF/, "");
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;

    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      const next = source[index + 1];

      if (quoted && char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === delimiter && !quoted) {
        row.push(cleanCell(cell, options));
        cell = "";
      } else if ((char === "\n" || char === "\r") && !quoted) {
        row.push(cleanCell(cell, options));
        rows.push(row);
        row = [];
        cell = "";
        if (char === "\r" && next === "\n") index += 1;
      } else {
        cell += char;
      }
    }

    if (cell.length || row.length) {
      row.push(cleanCell(cell, options));
      rows.push(row);
    }

    const meaningfulRows = rows.filter((item) => item.some((value) => value !== ""));
    if (!meaningfulRows.length) {
      return { headers: [], rows: [], rawRows: [] };
    }

    const headerIndex = findHeaderRowIndex(meaningfulRows);
    const headers = dedupeHeaders(meaningfulRows[headerIndex]);
    const dataRows = meaningfulRows.slice(headerIndex + 1);
    const initialAccountContext = findLastPreambleAccountContext(meaningfulRows.slice(0, headerIndex));
    const objects = dataRows.map((values, rowOffset) => {
      const repaired = repairOverflowCells(headers, values);
      const rowValues = repaired.values;
      const record = {};
      headers.forEach((header, headerIndex) => {
        record[header] = rowValues[headerIndex] || "";
      });
      return {
        ...record,
        __rowNumber: headerIndex + rowOffset + 2,
        __cellCount: values.length,
        __expectedCellCount: headers.length,
        __extraCells: rowValues.length > headers.length ? rowValues.slice(headers.length) : [],
        __repairedOverflow: repaired.repaired,
        __repairNotes: repaired.notes,
        __initialAccountContext: rowOffset === 0 ? initialAccountContext : ""
      };
    });

    return { headers, rows: objects, rawRows: meaningfulRows };
  }

  function parseCsvRows(text, options = {}) {
    return parseCsv(text, options).rows;
  }

  function parseHoldingJsonRows(textOrPayload) {
    const payload = typeof textOrPayload === "string"
      ? JSON.parse(textOrPayload || "null")
      : textOrPayload;
    const rows = holdingRowsFromPayload(payload);

    if (!Array.isArray(rows)) {
      throw new Error("Holdings JSON must be an array, contain a holdings, positions, records, rows, or data array, or contain accounts with positions.");
    }

    return rows.map((row, index) => flattenHoldingJsonRow(row, index + 1));
  }

  function normalizeFidelityPositions(csvOrRows, options = {}) {
    const rows = Array.isArray(csvOrRows) ? csvOrRows : parseCsvRows(csvOrRows, options);
    return normalizeRows(rows, "fidelity", options);
  }

  function normalizeSeekingAlphaRatings(csvOrRows, options = {}) {
    const rows = Array.isArray(csvOrRows) ? csvOrRows : parseCsvRows(csvOrRows, options);
    return normalizeRows(rows, "seekingAlpha", options);
  }

  function mergeRecordsByTicker(...sources) {
    const flattened = sources.flat().filter(Boolean);
    const byTicker = new Map();
    const duplicateTickers = new Set();

    flattened.forEach((record) => {
      const ticker = normalizeTicker(record.ticker);
      if (!ticker) return;

      const existing = byTicker.get(ticker);
      if (existing) duplicateTickers.add(ticker);

      byTicker.set(ticker, mergeRecord(existing || {}, { ...record, ticker }));
    });

    const records = Array.from(byTicker.values()).sort((a, b) => a.ticker.localeCompare(b.ticker));
    return {
      records,
      summary: {
        totalInputRecords: flattened.length,
        uniqueTickers: records.length,
        duplicateTickers: Array.from(duplicateTickers).sort()
      }
    };
  }

  function validateRecords(records) {
    const errors = [];
    const warnings = [];
    const seenRows = new Set();

    records.forEach((record, index) => {
      const label = record.ticker || `row ${index + 1}`;
      const ticker = normalizeTicker(record.ticker);
      const accountKey = readComparableText(record.account || "");
      const duplicateKey = accountKey ? `${accountKey}:${ticker}` : ticker;

      if (!ticker) {
        errors.push(`${label}: missing ticker.`);
      } else if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) {
        errors.push(`${label}: ticker contains unsupported characters.`);
      } else if (seenRows.has(duplicateKey)) {
        warnings.push(`${ticker}: duplicate ticker/account row will be merged.`);
      }

      if (ticker) seenRows.add(duplicateKey);

      ["shares", "price", "costBasis", "marketValue", "quant", "growth", "momentum", "revisions", "revenueGrowth", "epsGrowth", "forwardPe"].forEach((field) => {
        if (record[field] !== undefined && record[field] !== null && record[field] !== "" && !Number.isFinite(Number(record[field]))) {
          errors.push(`${label}: ${field} must be numeric.`);
        }
      });

      ["quant", "growth"].forEach((field) => {
        if (Number.isFinite(Number(record[field])) && (Number(record[field]) < 0 || Number(record[field]) > 5)) {
          warnings.push(`${label}: ${field} is outside the expected 0-5 range.`);
        }
      });

      ["momentum", "revisions"].forEach((field) => {
        if (Number.isFinite(Number(record[field])) && (Number(record[field]) < 0 || Number(record[field]) > 100)) {
          warnings.push(`${label}: ${field} is outside the expected 0-100 range.`);
        }
      });

      if (record.nextEarnings && !isLikelyDate(record.nextEarnings)) {
        warnings.push(`${label}: nextEarnings was not recognized as a common date format.`);
      }
    });

    return {
      ok: errors.length === 0,
      errors,
      warnings
    };
  }

  function summarizeImport(details) {
    const fidelityCount = details.fidelityRecords ? details.fidelityRecords.length : 0;
    const alphaCount = details.seekingAlphaRecords ? details.seekingAlphaRecords.length : 0;
    const mergedCount = details.mergedRecords ? details.mergedRecords.length : 0;
    const validation = details.validation || validateRecords(details.mergedRecords || []);
    const duplicateTickers = details.duplicateTickers || [];
    const providerParts = [];

    if (fidelityCount) providerParts.push(`${fidelityCount} Fidelity position${fidelityCount === 1 ? "" : "s"}`);
    if (alphaCount) providerParts.push(`${alphaCount} Seeking Alpha rating${alphaCount === 1 ? "" : "s"}`);

    const headline = providerParts.length
      ? `Imported ${providerParts.join(" and ")}.`
      : "No importable records found.";

    const messages = [
      headline,
      `${mergedCount} unique ticker${mergedCount === 1 ? "" : "s"} ready for the dashboard.`
    ];

    if (duplicateTickers.length) {
      messages.push(`Same ticker held across multiple accounts: ${duplicateTickers.join(", ")}.`);
    }

    if (validation.errors.length) {
      messages.push(`${validation.errors.length} blocking validation issue${validation.errors.length === 1 ? "" : "s"} found.`);
    }

    if (validation.warnings.length) {
      messages.push(`${validation.warnings.length} non-blocking warning${validation.warnings.length === 1 ? "" : "s"} found.`);
    }

    return {
      status: validation.ok ? "success" : "error",
      message: messages.join(" "),
      imported: {
        fidelityPositions: fidelityCount,
        seekingAlphaRatings: alphaCount,
        uniqueTickers: mergedCount
      },
      duplicateTickers,
      errors: validation.errors,
      warnings: validation.warnings
    };
  }

  function buildImportResult(inputs = {}) {
    let fidelityInput = inputs.fidelityRows || inputs.fidelityCsv || [];
    if (!inputs.fidelityRows && inputs.fidelityJson) {
      try {
        fidelityInput = parseHoldingJsonRows(inputs.fidelityJson);
      } catch (error) {
        return buildFailedImportResult({
          provider: "fidelity",
          fileName: inputs.fidelityFileName || inputs.fileName,
          message: `Holdings JSON could not be parsed: ${safeParseErrorMessage(error)}`
        });
      }
    }
    const fidelityImport = buildProviderImport("fidelity", fidelityInput, {
      fileName: inputs.fidelityFileName || inputs.fileName,
      columnMapping: inputs.columnMapping || inputs.fidelityColumnMapping
    });
    const seekingAlphaImport = buildProviderImport("seekingAlpha", inputs.seekingAlphaCsv || inputs.seekingAlphaRows || [], {
      fileName: inputs.seekingAlphaFileName || inputs.fileName,
      columnMapping: inputs.seekingAlphaColumnMapping
    });
    const fidelityRecords = fidelityImport.records;
    const seekingAlphaRecords = seekingAlphaImport.records;
    const mergeResult = mergePositionAndRatingRecords(fidelityRecords, seekingAlphaRecords);
    const validation = validateRecords(mergeResult.records);
    const summary = summarizeImport({
      fidelityRecords,
      seekingAlphaRecords,
      mergedRecords: mergeResult.records,
      duplicateTickers: mergeResult.summary.duplicateTickers,
      validation
    });

    const importReport = combineImportReports([fidelityImport.report, seekingAlphaImport.report]);
    if (fidelityRecords.length) {
      importReport.holdingsImported = mergeResult.records.length;
      importReport.totalMarketValue = fidelityImport.report.totalMarketValue;
      importReport.accountsDetected = fidelityImport.report.accountsDetected;
      importReport.tickersDetected = Array.from(new Set(mergeResult.records.map((record) => record.ticker).filter(Boolean))).sort();
      importReport.ratingsImported = seekingAlphaRecords.length;
      importReport.health = importHealth(importReport);
    }

    return {
      records: mergeResult.records,
      fidelityRecords,
      seekingAlphaRecords,
      validation,
      summary,
      importReport
    };
  }

  function buildProviderImport(provider, csvOrRows, options = {}) {
    const parsed = Array.isArray(csvOrRows)
      ? { headers: inferHeaders(csvOrRows), rows: csvOrRows, rawRows: [] }
      : parseCsv(csvOrRows || "", options);
    const detail = normalizeRowsWithReport(parsed.rows, provider, {
      ...options,
      headers: parsed.headers,
      accountFallback: provider === "fidelity" ? fidelityAccountFallbackFromFileName(options.fileName) : ""
    });
    const merged = provider === "fidelity"
      ? mergeDuplicatePositionRows(detail.records)
      : { records: detail.records, duplicateRows: [] };

    return {
      records: merged.records,
      report: buildImportReport({
        provider,
        fileName: options.fileName,
        headers: parsed.headers,
        rows: parsed.rows,
        records: merged.records,
        rejectedRows: detail.rejectedRows,
        missingRequiredFields: detail.missingRequiredFields,
        columnMapping: detail.columnMapping,
        repairWarnings: detail.repairWarnings,
        duplicateRows: merged.duplicateRows
      })
    };
  }

  function normalizeRows(rows, provider, options = {}) {
    return normalizeRowsWithReport(rows, provider, options).records;
  }

  function normalizeRowsWithReport(rows, provider, options = {}) {
    const headers = options.headers || inferHeaders(rows);
    const columnMapping = buildColumnMapping(headers, provider, options.columnMapping || {});
    const contextualRows = provider === "fidelity"
      ? applyFidelityRowContext(rows, columnMapping)
      : rows;
    const rejectedRows = [];
    const missingRequiredFields = new Map();
    const records = [];
    const repairedOverflowRows = contextualRows.filter((row) => row.__repairedOverflow).length;
    const repairNotes = Array.from(new Set(contextualRows.flatMap((row) => row.__repairNotes || [])));
    const lowConfidence = lowConfidenceFidelityMappingWarnings(headers, provider, columnMapping);

    contextualRows.forEach((row, index) => {
      const rowNumber = row.__rowNumber || index + 2;
      const record = normalizeRecord(row, provider, {
        columnMapping,
        accountFallback: options.accountFallback
      });
      const issues = rowImportIssues(row, record, provider, columnMapping);

      issues.missing.forEach((field) => {
        missingRequiredFields.set(field, (missingRequiredFields.get(field) || 0) + 1);
      });

      if (issues.reject.length) {
        rejectedRows.push({
          rowNumber,
          reasons: issues.reject,
          classification: issues.classification,
          values: visibleRowValues(row)
        });
        return;
      }

      if (record.ticker || record.company) records.push(record);
    });

    return {
      records,
      rejectedRows,
      missingRequiredFields: Array.from(missingRequiredFields.entries()).map(([field, count]) => ({ field, count })),
      columnMapping,
      repairWarnings: [
        ...lowConfidence,
        ...(repairedOverflowRows
          ? [repairNotes.every((note) => note === "ignored trailing empty CSV cells")
              ? `Cleaned ${repairedOverflowRows} row${repairedOverflowRows === 1 ? "" : "s"} with trailing empty CSV cells; no holding data changed.`
              : `Adjusted ${repairedOverflowRows} row${repairedOverflowRows === 1 ? "" : "s"} with harmless CSV cell-count issues: ${repairNotes.join("; ")}.`]
          : []),
        ...fidelityInterpretationWarnings(contextualRows, records),
        ...fidelityAccountFallbackWarnings(options.accountFallback, records, columnMapping)
      ]
    };
  }

  function normalizeRecord(row, provider, options = {}) {
    const lookup = makeLookup(row);
    const columnMapping = options.columnMapping || {};
    const rawTickerValue = readText(lookup, aliasesFor("ticker", columnMapping));
    const rawTicker = rawTickerValue && isSupportedRawTicker(rawTickerValue) ? rawTickerValue : "";
    const rawTickerNonStandard = provider === "fidelity" && Boolean(rawTickerValue && !rawTicker && isLikelyFidelityNonStandardSymbol(rawTickerValue));
    const inferredTicker = provider === "fidelity" && !rawTickerNonStandard && (!rawTicker || isLikelyCusip(rawTickerValue))
      ? tickerFromDescriptionClue(readText(lookup, aliasesFor("company", columnMapping)))
      : "";
    const generatedTicker = provider === "fidelity" && !rawTicker && !inferredTicker
      ? generatedLocalTickerForFidelityRow(lookup, columnMapping, rawTickerValue)
      : "";
    const ticker = inferredTicker || (!isLikelyCusip(rawTickerValue) ? readTicker(lookup, aliasesFor("ticker", columnMapping)) : "") || generatedTicker;
    const company = usefulText(readText(lookup, aliasesFor("company", columnMapping))) ||
      (provider === "fidelity" && isFidelityCashDescriptor(rawTickerValue) ? rawTickerValue : "") ||
      ticker;
    const normalized = {
      ticker,
      company,
      sector: readText(lookup, aliasesFor("sector", columnMapping)) || undefined,
      source: provider,
      sources: [provider],
      sourceRows: row.__rowNumber ? [{ provider, rowNumber: row.__rowNumber }] : []
    };

    if (provider === "fidelity") {
      normalized.shares = readNumber(lookup, aliasesFor("shares", columnMapping), 0);
      const rawPrice = readNumber(lookup, aliasesFor("price", columnMapping), 0);
      normalized.marketValue = readNumber(lookup, aliasesFor("marketValue", columnMapping), normalized.shares * rawPrice);
      normalized.price = rawPrice || inferPriceFromMarketValue(normalized.shares, normalized.marketValue);
      const hasCostBasis = hasParsedNumber(lookup, aliasesFor("costBasis", columnMapping));
      const rawCostBasis = readNumber(lookup, aliasesFor("costBasis", columnMapping), undefined);
      if (hasCostBasis) {
        normalized.costBasis = isAverageCostBasisColumn(columnMapping.costBasis)
          ? rawCostBasis * normalized.shares
          : rawCostBasis;
      } else {
        normalized.missingCostBasis = true;
      }
      normalized.unrealizedGain = readNumber(lookup, aliasesFor("unrealizedGain", columnMapping), undefined);
      normalized.unrealizedGainPercent = readPercentValue(lookup, aliasesFor("unrealizedGainPercent", columnMapping), undefined);
      normalized.dailyChange = readNumber(lookup, aliasesFor("dailyChange", columnMapping), undefined);
      normalized.dailyChangePercent = readPercentValue(lookup, aliasesFor("dailyChangePercent", columnMapping), undefined);
      normalized.account = maskAccountLabel(readText(lookup, aliasesFor("account", columnMapping)) || row.__inferredAccount || options.accountFallback) || undefined;
      normalized.accountType = readText(lookup, aliasesFor("accountType", columnMapping)) || undefined;
      const type = readText(lookup, aliasesFor("type", columnMapping));
      if (generatedTicker) {
        normalized.localIdentifier = true;
        normalized.marketDataEligible = false;
        if (rawTickerNonStandard) {
          normalized.sourceSymbolNonStandard = true;
          normalized.syntheticTickerReason = "Generated local identifier because the Fidelity symbol is not a standard market-data ticker.";
        } else {
          normalized.sourceSymbolMissing = true;
          normalized.syntheticTickerReason = "Generated local identifier because the Fidelity export did not include a tradable symbol.";
        }
      } else if (inferredTicker) {
        normalized.sourceSymbolMissing = true;
        normalized.sourceSymbolInferred = true;
        normalized.syntheticTickerReason = "Inferred symbol from the Fidelity description because the Symbol column was blank.";
      }
      if (isCashPosition({
        ticker,
        company,
        type,
        shares: normalized.shares,
        price: normalized.price,
        marketValue: normalized.marketValue
      })) {
        normalized.assetClass = "Cash";
        normalized.sector = "Cash";
        normalized.strategySleeve = "Cash";
        normalized.riskLevel = "Low";
        normalized.cash = true;
        delete normalized.missingCostBasis;
      }
      normalized.positionValue = normalized.marketValue;
    }

    if (provider === "seekingAlpha") {
      normalized.quant = readScore(lookup, aliasesFor("quant", columnMapping));
      normalized.growth = readScore(lookup, aliasesFor("growth", columnMapping));
      normalized.momentum = readPercentOrGrade(lookup, aliasesFor("momentum", columnMapping));
      normalized.value = readScore(lookup, aliasesFor("value", columnMapping));
      normalized.profitability = readScore(lookup, aliasesFor("profitability", columnMapping));
      normalized.revisions = readPercentOrGrade(lookup, aliasesFor("revisions", columnMapping));
      normalized.authorRating = readText(lookup, aliasesFor("authorRating", columnMapping)) || undefined;
      normalized.wallStreetRating = readText(lookup, aliasesFor("wallStreetRating", columnMapping)) || undefined;
      normalized.revenueGrowth = readNumber(lookup, aliasesFor("revenueGrowth", columnMapping), undefined);
      normalized.epsGrowth = readNumber(lookup, aliasesFor("epsGrowth", columnMapping), undefined);
      normalized.forwardPe = readNumber(lookup, aliasesFor("forwardPe", columnMapping), undefined);
      normalized.priceToSales = readNumber(lookup, aliasesFor("priceToSales", columnMapping), undefined);
      normalized.grossMargin = readPercentValue(lookup, aliasesFor("grossMargin", columnMapping), undefined);
      normalized.freeCashFlowMargin = readPercentValue(lookup, aliasesFor("freeCashFlowMargin", columnMapping), undefined);
      normalized.operatingCashFlow = readNumber(lookup, aliasesFor("operatingCashFlow", columnMapping), undefined);
      normalized.capitalExpenditures = readNumber(lookup, aliasesFor("capitalExpenditures", columnMapping), undefined);
      normalized.freeCashFlow = readNumber(lookup, aliasesFor("freeCashFlow", columnMapping), undefined);
      normalized.cashAndEquivalents = readNumber(lookup, aliasesFor("cashAndEquivalents", columnMapping), undefined);
      normalized.totalDebt = readNumber(lookup, aliasesFor("totalDebt", columnMapping), undefined);
      normalized.debtToEquity = readNumber(lookup, aliasesFor("debtToEquity", columnMapping), undefined);
      normalized.dividendYield = readPercentValue(lookup, aliasesFor("dividendYield", columnMapping), undefined);
      normalized.dividendGrade = readText(lookup, aliasesFor("dividendGrade", columnMapping)) || undefined;
      normalized.nextEarnings = normalizeDate(readText(lookup, aliasesFor("nextEarnings", columnMapping)));
      normalized.thesis = readText(lookup, aliasesFor("notes", columnMapping)) || undefined;
    }

    return pruneEmpty(normalized);
  }

  function mergePositionAndRatingRecords(fidelityRecords, seekingAlphaRecords) {
    if (!fidelityRecords.length) return mergeRecordsByTicker(seekingAlphaRecords);

    const ratingsByTicker = mergeRecordsByTicker(seekingAlphaRecords).records.reduce((map, record) => {
      map.set(record.ticker, record);
      return map;
    }, new Map());
    const positionTickers = new Set();
    const duplicateTickers = new Set();
    const records = fidelityRecords.map((record) => {
      const ticker = normalizeTicker(record.ticker);
      if (positionTickers.has(ticker)) duplicateTickers.add(ticker);
      positionTickers.add(ticker);
      return mergeRecord(record, ratingsByTicker.get(ticker) || {});
    });

    records.sort((left, right) => {
      const tickerSort = String(left.ticker || "").localeCompare(String(right.ticker || ""));
      if (tickerSort) return tickerSort;
      return String(left.account || "").localeCompare(String(right.account || ""));
    });

    return {
      records,
      summary: {
        totalInputRecords: fidelityRecords.length + seekingAlphaRecords.length,
        uniqueTickers: new Set(records.map((record) => normalizeTicker(record.ticker)).filter(Boolean)).size,
        duplicateTickers: Array.from(duplicateTickers).sort()
      }
    };
  }

  function mergeDuplicatePositionRows(records = []) {
    const byKey = new Map();
    const duplicateRows = [];

    records.forEach((record) => {
      const ticker = normalizeTicker(record.ticker);
      const account = readComparableText(record.account || "Unassigned");
      const key = record.localIdentifier
        ? `${account}:local:${readComparableText(record.company)}:${readComparableText(record.sourceSymbol || record.sourceSymbolRaw || "")}`
        : `${account}:${ticker || readComparableText(record.company)}`;
      const previous = byKey.get(key);

      if (!previous) {
        byKey.set(key, { ...record });
        return;
      }

      const merged = mergePositionRow(previous, record);
      byKey.set(key, merged);
      duplicateRows.push({
        ticker: ticker || previous.ticker || "",
        account: previous.account || record.account || "Unassigned",
        rowNumbers: Array.from(new Set([...(previous.sourceRows || []), ...(record.sourceRows || [])].map((source) => source.rowNumber).filter(Boolean))).sort((a, b) => a - b),
        reason: "duplicate ticker/account row merged"
      });
    });

    return {
      records: Array.from(byKey.values()),
      duplicateRows
    };
  }

  function mergePositionRow(left = {}, right = {}) {
    const shares = numericValue(left.shares) + numericValue(right.shares);
    const marketValue = numericValue(left.marketValue) + numericValue(right.marketValue);
    const leftHasCostBasis = numberOrUndefined(left.costBasis) !== undefined;
    const rightHasCostBasis = numberOrUndefined(right.costBasis) !== undefined;
    const missingCostBasis = Boolean(left.missingCostBasis || right.missingCostBasis || !leftHasCostBasis || !rightHasCostBasis);
    const costBasis = leftHasCostBasis || rightHasCostBasis
      ? numericValue(left.costBasis) + numericValue(right.costBasis)
      : undefined;
    const unrealizedGain = numberOrUndefined(left.unrealizedGain) !== undefined || numberOrUndefined(right.unrealizedGain) !== undefined
      ? numericValue(left.unrealizedGain) + numericValue(right.unrealizedGain)
      : undefined;
    const dailyChange = numberOrUndefined(left.dailyChange) !== undefined || numberOrUndefined(right.dailyChange) !== undefined
      ? numericValue(left.dailyChange) + numericValue(right.dailyChange)
      : undefined;
    const price = shares ? marketValue / shares : (numericValue(right.price) || numericValue(left.price));
    const sourceRows = [...(left.sourceRows || []), ...(right.sourceRows || [])];

    return pruneEmpty({
      ...left,
      ...right,
      ticker: left.ticker || right.ticker,
      company: left.company || right.company,
      account: left.account || right.account,
      accountType: left.accountType || right.accountType,
      sector: left.sector || right.sector,
      shares,
      price,
      marketValue,
      costBasis,
      missingCostBasis,
      missingCostBasisRowNumbers: missingCostBasisRowNumbers(left, right),
      unrealizedGain,
      unrealizedGainPercent: costBasis > 0 && unrealizedGain !== undefined ? unrealizedGain / costBasis : (left.unrealizedGainPercent ?? right.unrealizedGainPercent),
      dailyChange,
      dailyChangePercent: marketValue > 0 && dailyChange !== undefined ? dailyChange / marketValue : (left.dailyChangePercent ?? right.dailyChangePercent),
      positionValue: marketValue,
      sources: Array.from(new Set([...(left.sources || []), ...(right.sources || [])])),
      sourceRows
    });
  }

  function missingCostBasisRowNumbers(left = {}, right = {}) {
    return Array.from(new Set([
      ...(left.missingCostBasisRowNumbers || []),
      ...(right.missingCostBasisRowNumbers || []),
      ...(left.missingCostBasis ? (left.sourceRows || []).map((source) => source.rowNumber).filter(Boolean) : []),
      ...(right.missingCostBasis ? (right.sourceRows || []).map((source) => source.rowNumber).filter(Boolean) : [])
    ])).sort((a, b) => a - b);
  }

  function mergeRecord(left, right) {
    const merged = { ...left };

    Object.entries(right).forEach(([key, value]) => {
      if (key === "sources") {
        merged.sources = Array.from(new Set([...(merged.sources || []), ...(value || [])]));
      } else if (key === "sourceRows") {
        merged.sourceRows = [...(merged.sourceRows || []), ...(value || [])];
      } else if (value !== undefined && value !== null && value !== "") {
        merged[key] = value;
      }
    });

    if (Number.isFinite(Number(merged.shares)) && Number.isFinite(Number(merged.price))) {
      merged.positionValue = Number(merged.shares) * Number(merged.price);
      if (!Number.isFinite(Number(merged.marketValue)) || Number(merged.marketValue) === 0) {
        merged.marketValue = merged.positionValue;
      }
    }

    return pruneEmpty(merged);
  }

  function buildColumnMapping(headers = [], provider, manualMapping = {}) {
    const normalizedHeaders = headers.map((header) => ({
      original: header,
      normalized: normalizeHeader(header)
    }));
    const fields = provider === "fidelity"
      ? ["ticker", "company", "account", "accountType", "shares", "price", "marketValue", "costBasis", "unrealizedGain", "unrealizedGainPercent", "dailyChange", "dailyChangePercent", "sector", "type"]
      : ["ticker", "company", "sector", "quant", "growth", "momentum", "value", "profitability", "revisions", "authorRating", "wallStreetRating", "revenueGrowth", "epsGrowth", "forwardPe", "nextEarnings", "notes"];

    return fields.reduce((mapping, field) => {
      const manual = manualMapping[field] || manualMapping[normalizeHeader(field)];
      if (manual && headerExists(normalizedHeaders, manual)) {
        mapping[field] = headerOriginal(normalizedHeaders, manual);
        return mapping;
      }

      const aliases = FIELD_ALIASES[field] || [];
      const found = findMappedHeader(normalizedHeaders, aliases);
      if (found) mapping[field] = found.original;
      return mapping;
    }, {});
  }

  function findMappedHeader(normalizedHeaders = [], aliases = []) {
    const foundAlias = aliases.find((alias) => normalizedHeaders.some((header) => header.normalized === alias));
    const exact = normalizedHeaders.find((header) => header.normalized === foundAlias);
    if (exact) return exact;

    return normalizedHeaders.find((header) => aliases.some((alias) => isDatedHeaderAlias(header.normalized, alias)));
  }

  function isDatedHeaderAlias(header, alias) {
    if (!header || !alias || header === alias || !header.startsWith(alias)) return false;
    const suffix = header.slice(alias.length);
    return /^(?:asof|date)?(?:\d{1,4}\/\d{1,2}\/\d{2,4}|\d{4,8}|[a-z]{3,9}\d{1,2}\d{4})$/.test(suffix);
  }

  function aliasesFor(field, columnMapping = {}) {
    const manual = columnMapping[field];
    const aliases = FIELD_ALIASES[field] || [];
    return manual ? [normalizeHeader(manual), ...aliases] : aliases;
  }

  function inferHeaders(rows = []) {
    const headers = [];
    rows.forEach((row) => {
      Object.keys(row || {}).forEach((key) => {
        if (!key.startsWith("__") && !headers.includes(key)) headers.push(key);
      });
    });
    return headers;
  }

  function headerExists(headers, candidate) {
    const normalized = normalizeHeader(candidate);
    return headers.some((header) => header.normalized === normalized);
  }

  function headerOriginal(headers, candidate) {
    const normalized = normalizeHeader(candidate);
    return headers.find((header) => header.normalized === normalized)?.original || candidate;
  }

  function buildImportReport(details) {
    const totalMarketValue = details.records.reduce((total, record) => total + numericValue(record.marketValue), 0);
    return {
      provider: details.provider,
      fileName: safeFileName(details.fileName || ""),
      detectedFileDate: detectedFileDate(details.fileName, details.rows),
      detectedColumns: details.headers || [],
      unsupportedColumns: unsupportedColumns(details.headers || [], details.columnMapping),
      rowsParsed: details.rows.length,
      holdingsImported: details.records.length,
      rejectedRows: details.rejectedRows,
      duplicateRows: details.duplicateRows || [],
      missingRequiredFields: details.missingRequiredFields,
      columnMapping: details.columnMapping,
      mappingWarnings: [
        ...mappingWarnings(details.columnMapping),
        ...duplicateAccountMappingWarnings(details.duplicateRows || [], details.columnMapping),
        ...(details.repairWarnings || [])
      ],
      totalMarketValue,
      accountsDetected: Array.from(new Set(details.records.map((record) => record.account).filter(Boolean))).sort(),
      tickersDetected: Array.from(new Set(details.records.map((record) => record.ticker).filter(Boolean))).sort()
    };
  }

  function combineImportReports(reports = []) {
    const active = reports.filter((report) => report.rowsParsed || report.detectedColumns.length || report.holdingsImported);
    if (!active.length) {
      return {
        fileName: "",
        detectedFileDate: "",
        detectedColumns: [],
        unsupportedColumns: [],
        rowsParsed: 0,
        holdingsImported: 0,
        rejectedRows: [],
        duplicateRows: [],
        missingRequiredFields: [],
        columnMapping: {},
        mappingWarnings: [],
        totalMarketValue: 0,
        accountsDetected: [],
        tickersDetected: [],
        providerReports: [],
        health: { status: "Failed", tone: "error", message: "Failed: no CSV rows were parsed." }
      };
    }

    const report = {
      fileName: active.map((report) => report.fileName).filter(Boolean).join(", "),
      detectedFileDate: active.find((report) => report.detectedFileDate)?.detectedFileDate || "",
      detectedColumns: Array.from(new Set(active.flatMap((report) => report.detectedColumns))),
      unsupportedColumns: Array.from(new Set(active.flatMap((report) => report.unsupportedColumns || []))),
      rowsParsed: active.reduce((total, report) => total + report.rowsParsed, 0),
      holdingsImported: active.reduce((total, report) => total + report.holdingsImported, 0),
      rejectedRows: active.flatMap((report) => report.rejectedRows.map((row) => ({ ...row, provider: report.provider }))),
      duplicateRows: active.flatMap((report) => (report.duplicateRows || []).map((row) => ({ ...row, provider: report.provider }))),
      missingRequiredFields: combineMissingFields(active.flatMap((report) => report.missingRequiredFields)),
      columnMapping: active.length === 1 ? active[0].columnMapping : Object.fromEntries(active.map((report) => [report.provider, report.columnMapping])),
      mappingWarnings: active.flatMap((report) => report.mappingWarnings || []),
      totalMarketValue: active.reduce((total, report) => total + report.totalMarketValue, 0),
      accountsDetected: Array.from(new Set(active.flatMap((report) => report.accountsDetected || []))).sort(),
      tickersDetected: Array.from(new Set(active.flatMap((report) => report.tickersDetected))).sort(),
      providerReports: active
    };
    return {
      ...report,
      health: importHealth(report)
    };
  }

  function combineMissingFields(fields = []) {
    const counts = new Map();
    fields.forEach((field) => counts.set(field.field, (counts.get(field.field) || 0) + field.count));
    return Array.from(counts.entries()).map(([field, count]) => ({ field, count }));
  }

  function rowImportIssues(row, record, provider, columnMapping) {
    const missing = [];
    const reject = [];
    const lookup = makeLookup(row);
    const rawTicker = readText(lookup, aliasesFor("ticker", columnMapping));
    const rawTickerIsIdentifier = provider === "fidelity" && isLikelyCusip(rawTicker);
    const invalidTicker = Boolean(rawTicker && !rawTickerIsIdentifier && !record.ticker);
    const allowedLocalFidelityIdentifier = provider === "fidelity" && record.localIdentifier && isLikelyFidelityNonStandardSymbol(rawTicker);
    const allowedCashDescriptor = provider === "fidelity" && record.cash && isFidelityCashDescriptor(rawTicker);
    const suspiciousTicker = Boolean(rawTicker && !rawTickerIsIdentifier && !isSupportedRawTicker(rawTicker) && !allowedLocalFidelityIdentifier && !allowedCashDescriptor);
    const classification = isNonHoldingRow(row, columnMapping, rawTicker) ? "non-holding row" : "needs review";
    if (Number(row.__cellCount || 0) > Number(row.__expectedCellCount || 0) && !row.__repairedOverflow) {
      reject.push("column count mismatch; check unquoted comma values");
    }
    if (!record.ticker) {
      missing.push("ticker");
      reject.push("missing ticker");
      if (provider === "fidelity" && classification !== "non-holding row") {
        reject.push("holding-like row has no Symbol/ticker");
      }
      if (invalidTicker) reject.push("invalid ticker");
    } else if (suspiciousTicker) {
      reject.push("invalid ticker");
    }

    if (provider === "fidelity") {
      const hasMarketValue = hasParsedNumber(lookup, aliasesFor("marketValue", columnMapping));
      const hasSharesAndPrice = hasParsedNumber(lookup, aliasesFor("shares", columnMapping)) && hasParsedNumber(lookup, aliasesFor("price", columnMapping));
      const numericIssues = invalidNumberIssues(row, columnMapping, ["shares", "price", "marketValue", "costBasis", "unrealizedGain", "unrealizedGainPercent"]);
      reject.push(...numericIssues);
      if (numberOrUndefined(record.shares) < 0) {
        reject.push("negative quantity requires review");
      }
      if (numberOrUndefined(record.price) < 0) {
        reject.push("negative price requires review");
      }
      if (numberOrUndefined(record.marketValue) < 0) {
        reject.push("negative market value requires review");
      }
      if (!hasMarketValue && !hasSharesAndPrice) {
        if (!hasParsedNumber(lookup, aliasesFor("shares", columnMapping))) missing.push("quantity");
        if (!hasParsedNumber(lookup, aliasesFor("marketValue", columnMapping))) missing.push("market value");
        reject.push("missing market value or shares plus price");
      }
    }

    return {
      missing,
      reject,
      classification
    };
  }

  function isNonHoldingRow(row = {}, columnMapping = {}, rawTicker = "") {
    if (isRepeatedHeaderRow(row) || row.__contextRow) return true;
    const lookup = makeLookup(row);
    const companyText = readText(lookup, aliasesFor("company", columnMapping));
    const rowText = Object.entries(visibleRowValues(row))
      .filter(([key]) => !key.startsWith("__"))
      .map(([, value]) => String(value || ""))
      .join(" ")
      .toLowerCase();
    if (/\b(account total|grand total|subtotal|total account value|total value|positions total|brokeragelink|footer|disclaimer|not fdic insured|prices? delayed|provided by|pending activity|activity pending)\b/i.test(rowText)) {
      return true;
    }
    if (rawTicker && isContainerDescription(rawTicker)) return true;
    if (rawTicker) return false;
    const hasHoldingLikeNumber = ["shares", "price", "marketValue", "costBasis", "unrealizedGain"]
      .some((field) => {
        const raw = readText(lookup, aliasesFor(field, columnMapping));
        return raw && Number.isFinite(parseNumeric(raw));
      });
    const hasHoldingLikeDescription = Boolean(companyText && !/^(total|account total|grand total|subtotal|cash total)$/i.test(companyText.trim()));

    return !hasHoldingLikeDescription && !hasHoldingLikeNumber;
  }

  function applyFidelityRowContext(rows = [], columnMapping = {}) {
    let currentAccount = "";
    return rows.map((row) => {
      if (row.__initialAccountContext) {
        currentAccount = maskAccountLabel(row.__initialAccountContext);
      }
      const accountContext = detectAccountContext(row);
      if (accountContext) {
        currentAccount = maskAccountLabel(accountContext);
        return { ...row, __contextRow: true, __inferredAccount: currentAccount };
      }

      const lookup = makeLookup(row);
      const mappedAccount = readText(lookup, aliasesFor("account", columnMapping));
      if (mappedAccount) currentAccount = maskAccountLabel(mappedAccount);
      if (!currentAccount || mappedAccount) return row;
      return { ...row, __inferredAccount: currentAccount };
    });
  }

  function detectAccountContext(row = {}) {
    const visibleValues = Object.values(visibleRowValues(row))
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    if (!visibleValues.length) return "";

    for (const value of visibleValues) {
      const labeled = value.match(/^(?:account|account name|account registration|registration)\s*[:=-]\s*(.+)$/i);
      if (labeled?.[1]) return labeled[1].trim();
    }

    if (visibleValues.length <= 3 && /^account$/i.test(visibleValues[0] || "") && visibleValues[1]) {
      return visibleValues[1];
    }
    return "";
  }

  function fidelityInterpretationWarnings(rows = [], records = []) {
    const warnings = [];
    const generated = records.filter((record) => record.localIdentifier);
    const inheritedAccounts = rows.filter((row) => row.__inferredAccount && !row.__contextRow).length;

    if (generated.length) {
      warnings.push(
        `Created local identifiers for ${generated.length} Fidelity holding${generated.length === 1 ? "" : "s"} without live quote-ready symbols so real plan funds or non-standard instruments are included instead of dropped. These rows are excluded from live quote refresh until a ticker is supplied.`
      );
    }
    if (inheritedAccounts) {
      warnings.push(
        `Applied account section labels to ${inheritedAccounts} row${inheritedAccounts === 1 ? "" : "s"} with blank account cells.`
      );
    }
    return warnings;
  }

  function lowConfidenceFidelityMappingWarnings(headers = [], provider, columnMapping = {}) {
    if (provider !== "fidelity") return [];
    const warnings = [];
    const normalizedHeaders = new Set(headers.map(normalizeHeader));
    if (!columnMapping.ticker && Array.from(normalizedHeaders).some((header) => header.includes("cusip"))) {
      warnings.push("Detected CUSIP/security identifier columns but no tradable Symbol column. Rows may need manual ticker mapping before live market-data refresh.");
    }
    if (columnMapping.ticker && isCusipHeader(columnMapping.ticker)) {
      warnings.push(isMixedSymbolCusipHeader(columnMapping.ticker)
        ? "Mapped the mixed Symbol/CUSIP column as ticker; CUSIP-only rows will be inferred from descriptions when possible or kept as local identifiers until reviewed."
        : "Mapped the identifier column as ticker; parenthetical symbols in descriptions are preferred when available, otherwise review tickers before applying.");
    }
    if (!columnMapping.marketValue && columnMapping.price && columnMapping.shares) {
      warnings.push("Market value was not mapped; values were inferred from quantity times price where possible.");
    }
    return warnings;
  }

  function isCusipHeader(header = "") {
    const normalized = normalizeHeader(header);
    return normalized === "cusip" || normalized.includes("cusip");
  }

  function isMixedSymbolCusipHeader(header = "") {
    const normalized = normalizeHeader(header);
    return normalized.includes("symbol") && normalized.includes("cusip");
  }

  function generatedLocalTickerForFidelityRow(lookup, columnMapping = {}, rawTickerValue = "") {
    if (isFidelityCashDescriptor(rawTickerValue)) return "CASH";

    const company = readText(lookup, aliasesFor("company", columnMapping));
    const nonStandardSymbol = isLikelyFidelityNonStandardSymbol(rawTickerValue) ? rawTickerValue : "";
    const source = nonStandardSymbol || company;
    if (!source || isContainerDescription(source)) return "";

    const marketValue = readNumber(lookup, aliasesFor("marketValue", columnMapping), 0);
    const shares = readNumber(lookup, aliasesFor("shares", columnMapping), 0);
    const price = readNumber(lookup, aliasesFor("price", columnMapping), 0);
    if (!marketValue && !(shares && price)) return "";

    const base = normalizeTicker(source).replace(/^[^A-Z]+/, "").replace(/[^A-Z0-9]+/g, "");
    if (!base || !/^[A-Z]/.test(base)) return "";
    return base.slice(0, 10);
  }

  function tickerFromDescriptionClue(value = "") {
    const text = String(value || "");
    const parenthetical = text.match(/\(([A-Z][A-Z0-9./-]{0,12}\*?)\)/i);
    if (!parenthetical) return "";
    const ticker = normalizeTicker(parenthetical[1]);
    return isLikelyTicker(ticker) ? ticker : "";
  }

  function isContainerDescription(value = "") {
    const text = String(value || "").trim();
    return /^(total|account total|grand total|subtotal|footer)$/i.test(text) ||
      /\b(account total|grand total|subtotal|total account value|total value|positions total|brokeragelink|footer|disclaimer|not fdic insured|prices? delayed|provided by|pending activity|activity pending)\b/i.test(text);
  }

  function isFidelityCashDescriptor(value = "") {
    return /\bcash\s*(?:&|and)?\s*cash investments\b|\bcash investments\b/i.test(String(value || ""));
  }

  function usefulText(value = "") {
    const text = String(value || "").trim();
    return isBlankNumericPlaceholder(text) ? "" : text;
  }

  function isRepeatedHeaderRow(row = {}) {
    const visible = Object.entries(visibleRowValues(row)).filter(([key]) => !key.startsWith("__"));
    if (visible.length < 2) return false;
    const matches = visible.filter(([key, value]) => normalizeHeader(key) === normalizeHeader(value)).length;
    return matches >= 2 && matches >= Math.ceil(visible.length / 3);
  }

  function findLastPreambleAccountContext(rows = []) {
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const cells = rows[index] || [];
      const values = cells.map((value) => String(value || "").trim()).filter(Boolean);
      for (const value of values) {
        const match = value.match(/^(?:account|account name|account registration|registration)\s*[:=-]\s*(.+)$/i);
        if (match?.[1]) return match[1].trim();
      }
      if (values.length <= 3 && /^account$/i.test(values[0] || "") && values[1]) return values[1];
    }
    return "";
  }

  function fidelityAccountFallbackFromFileName(fileName = "") {
    const base = String(fileName || "")
      .split(/[\\/]/)
      .pop()
      .replace(/\.[A-Za-z0-9]+$/, "")
      .trim();
    if (!base || /^portfolio[-_\s]*positions/i.test(base)) return "";

    const match = base.match(/^(.+?)[-_\s]+positions(?:[-_\s]+\d{4}[-_\s]\d{2}[-_\s]\d{2}.*)?$/i);
    if (!match?.[1]) return "";

    const label = titleCaseHeader(match[1]).replace(/\s+/g, " ").trim();
    if (!label || /^portfolio$/i.test(label)) return "";
    return maskAccountLabel(label);
  }

  function fidelityAccountFallbackWarnings(accountFallback = "", records = [], columnMapping = {}) {
    if (!accountFallback || columnMapping.account || !records.some((record) => record.account === accountFallback)) return [];
    return [`Applied account label "${accountFallback}" from the Fidelity file name because no account column was present.`];
  }

  function buildFailedImportResult({ provider, fileName, message }) {
    const report = {
      provider,
      fileName: fileName || "",
      detectedFileDate: "",
      detectedColumns: [],
      unsupportedColumns: [],
      rowsParsed: 0,
      holdingsImported: 0,
      rejectedRows: [{
        rowNumber: 1,
        reasons: [message],
        classification: "needs review",
        values: {}
      }],
      duplicateRows: [],
      missingRequiredFields: [],
      columnMapping: {},
      mappingWarnings: [],
      totalMarketValue: 0,
      accountsDetected: [],
      tickersDetected: [],
      providerReports: [],
      health: { status: "Failed", tone: "error", message }
    };
    return {
      records: [],
      fidelityRecords: [],
      seekingAlphaRecords: [],
      validation: { ok: false, errors: [message], warnings: [] },
      summary: {
        status: "error",
        message,
        imported: { fidelityPositions: 0, seekingAlphaRatings: 0, uniqueTickers: 0 },
        duplicateTickers: [],
        errors: [message],
        warnings: []
      },
      importReport: report
    };
  }

  function invalidNumberIssues(row, columnMapping, fields) {
    const lookup = makeLookup(row);
    return fields.flatMap((field) => {
      const column = columnMapping[field];
      if (!column) return [];
      const raw = readText(lookup, [normalizeHeader(column)]);
      if (!raw || isBlankNumericPlaceholder(raw)) return [];
      return Number.isFinite(parseNumeric(raw)) ? [] : [`invalid number format in ${field}`];
    });
  }

  const CASH_LIKE_TICKERS = new Set([
    "CASH",
    "FCASH",
    "FDIC",
    "SPAXX",
    "FDRXX",
    "FZFXX",
    "FDLXX",
    "SPRXX",
    "FTEXX",
    "FZDXX",
    "FMPXX"
  ]);

  function isCashPosition(position = {}) {
    const ticker = normalizeTicker(position.ticker);
    const description = String(position.company || "").toLowerCase();
    const type = String(position.type || "").toLowerCase();
    const shares = numericValue(position.shares);
    const price = numericValue(position.price);

    if (CASH_LIKE_TICKERS.has(ticker)) return true;
    if (/held in money market|money market|core position|core cash|cash credit balance|settlement fund|cash sweep|bank deposit|fdic|cash equivalent/.test(description)) return true;

    // Fidelity exports can show Type = Cash for ordinary securities. Treat that
    // field as a cash clue only when the row also lacks normal security pricing.
    return /\bcash\b/.test(type) && !shares && !price && /cash|money market|core|sweep|fdic/.test(description);
  }

  function unsupportedColumns(headers, columnMapping = {}) {
    const mapped = new Set(Object.values(columnMapping).map(normalizeHeader));
    return headers.filter((header) => !mapped.has(normalizeHeader(header)));
  }

  function mappingWarnings(columnMapping = {}) {
    const byColumn = new Map();
    Object.entries(columnMapping).forEach(([field, column]) => {
      const key = normalizeHeader(column);
      byColumn.set(key, [...(byColumn.get(key) || []), field]);
    });
    return Array.from(byColumn.entries())
      .filter(([, fields]) => fields.length > 1)
      .map(([, fields]) => `duplicate/ambiguous mapping: ${fields.join(", ")} use the same column`);
  }

  function duplicateAccountMappingWarnings(duplicateRows = [], columnMapping = {}) {
    if (!duplicateRows.length || columnMapping.account) return [];
    return ["duplicate ticker rows were merged without an account column mapping; verify same-ticker lots belong to the same account"];
  }

  function importHealth(report) {
    const rejected = report.rejectedRows?.length || 0;
    const imported = report.holdingsImported || 0;
    const rows = report.rowsParsed || 0;
    const missingTicker = (report.missingRequiredFields || []).some((item) => item.field === "ticker");

    if (!rows) {
      return { status: "Failed", tone: "error", message: "Failed: no CSV rows were parsed." };
    }
    if (!imported && (missingTicker || !hasTickerMapping(report.columnMapping))) {
      return { status: "Needs manual mapping", tone: "error", message: "Needs manual mapping: no importable ticker column was detected." };
    }
    if (!imported) {
      return { status: "Failed", tone: "error", message: "Failed: no holdings were imported." };
    }
    if (rejected) {
      const nonHoldingRows = (report.rejectedRows || []).filter((row) => row.classification === "non-holding row").length;
      if (nonHoldingRows === rejected) {
        return { status: "Imported with skipped non-holding rows", tone: "success", message: `Imported ${imported} holding${imported === 1 ? "" : "s"}, skipped ${rejected} harmless non-holding row${rejected === 1 ? "" : "s"}.` };
      }
      return { status: "Partial success", tone: "warning", message: `Imported ${imported} row${imported === 1 ? "" : "s"}, rejected ${rejected} row${rejected === 1 ? "" : "s"}. Review rejected rows below.` };
    }
    return { status: "Success", tone: "success", message: `Imported ${imported} holding${imported === 1 ? "" : "s"} across ${report.accountsDetected.length || 1} account${report.accountsDetected.length === 1 ? "" : "s"} totaling ${formatReportCurrency(report.totalMarketValue)}.` };
  }

  function hasTickerMapping(mapping = {}) {
    if (mapping.ticker) return true;
    return Object.values(mapping).some((value) => value?.ticker);
  }

  function formatReportCurrency(value) {
    return `$${Math.round(Number(value) || 0).toLocaleString("en-US")}`;
  }

  function detectedFileDate(fileName = "", rows = []) {
    const text = [
      fileName,
      ...rows.flatMap((row) => Object.values(row || {}).filter((value) => typeof value === "string"))
    ].join(" ");
    const monthName = "(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*";
    const monthNameMatch = text.match(new RegExp(`${monthName}[-\\s]+(\\d{1,2})[-,\\s]+(20\\d{2})`, "i"));
    if (monthNameMatch) {
      return `${monthNameMatch[3]}-${monthNumber(monthNameMatch[1])}-${String(monthNameMatch[2]).padStart(2, "0")}`;
    }
    const iso = text.match(/\b(20\d{2})[-_/](\d{1,2})[-_/](\d{1,2})\b/);
    if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, "0")}-${String(iso[3]).padStart(2, "0")}`;
    return "";
  }

  function monthNumber(month) {
    const index = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
      .indexOf(String(month).slice(0, 3).toLowerCase());
    return String(index + 1).padStart(2, "0");
  }

  function visibleRowValues(row) {
    return Object.fromEntries(
      Object.entries(row || {})
        .filter(([key]) => !key.startsWith("__"))
        .map(([key, value]) => [key, safeVisibleValue(key, value)])
    );
  }

  function safeVisibleValue(key, value) {
    const normalizedKey = normalizeHeader(key);
    if (/secret|token|password|apikey|api\/?key|clientsecret|refreshtoken|cookie|authorization/.test(normalizedKey)) {
      return "[redacted]";
    }
    if (isSensitiveAccountKey(normalizedKey, value)) {
      return maskAccountLabel(value);
    }
    return value;
  }

  function isSensitiveAccountKey(normalizedKey = "", value = "") {
    if (/account(?:name)?\/?number|accountnumber|accountno|accountid|accountending|acctnumber|acctno|acctid/.test(normalizedKey)) {
      return true;
    }
    const digits = String(value || "").replace(/\D/g, "");
    return /account|acct/.test(normalizedKey) && digits.length >= 5;
  }

  function safeFileName(value = "") {
    const fileName = String(value || "").split(/[\\/]/).pop();
    return fileName.replace(/\d{5,}/g, (digits) => `••${digits.slice(-4)}`);
  }

  function safeParseErrorMessage(error) {
    return String(error?.message || "Invalid JSON.")
      .replace(/[A-Za-z0-9_-]{24,}/g, "[redacted]")
      .replace(/(access_token|refresh_token|token|client_secret|api_key|apikey|password|cookie)=([^&\s"']+)/gi, "$1=[redacted]")
      .slice(0, 180);
  }

  function firstArray(payload, keys = []) {
    if (!payload || typeof payload !== "object") return null;
    for (const key of keys) {
      if (Array.isArray(payload[key])) return payload[key];
    }
    return null;
  }

  function holdingRowsFromPayload(payload) {
    if (Array.isArray(payload)) return payload;
    const directRows = firstArray(payload, ["holdings", "positions", "securities", "records", "rows", "data"]);
    if (Array.isArray(directRows)) return directRows;
    if (!Array.isArray(payload?.accounts)) return null;

    return payload.accounts.flatMap((account, accountIndex) => {
      const positions = firstArray(account, ["holdings", "positions", "securities", "records", "rows", "data"]);
      if (!Array.isArray(positions)) return [];
      const accountName = account.name || account.account || account.accountName || account.accountLabel || account.officialName || account.accountNumber || account.number || account.registration;
      const accountType = account.type || account.accountType || account.registrationType || account.accountClassification;
      return positions.map((position, positionIndex) => ({
        ...position,
        account: position.account || position.accountName || position.accountLabel || accountName,
        accountName: position.accountName || position.account || position.accountLabel || accountName,
        accountType: position.accountType || accountType,
        accountNumber: position.accountNumber || account.accountNumber || account.number,
        __rowNumber: position.__rowNumber || positionIndex + 1 + accountIndex * 1000
      }));
    });
  }

  function flattenHoldingJsonRow(row, rowNumber) {
    const flat = {};

    function flattenValue(prefix, value) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        Object.entries(value).forEach(([childKey, childValue]) => {
          const titleKey = `${prefix} ${childKey}`;
          flat[titleCaseHeader(titleKey)] = childValue;
          if (childValue && typeof childValue === "object" && !Array.isArray(childValue)) {
            flattenValue(titleKey, childValue);
          } else if (normalizeHeader(prefix) !== "account" && flat[childKey] === undefined) {
            flat[childKey] = childValue;
          }
        });
        return;
      }
      flat[prefix] = value;
    }

    Object.entries(row || {}).forEach(([key, value]) => {
      flattenValue(key, value);
    });

    return {
      ...flat,
      __rowNumber: row?.__rowNumber || rowNumber
    };
  }

  function titleCaseHeader(value) {
    return String(value || "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function readComparableText(value) {
    return String(value || "").trim().toLowerCase();
  }

  function numberOrUndefined(value) {
    const number = parseNumeric(value);
    return Number.isFinite(number) ? number : undefined;
  }

  function numericValue(value) {
    const number = parseNumeric(value);
    return Number.isFinite(number) ? number : 0;
  }

  function hasParsedNumber(lookup, aliases) {
    const raw = readText(lookup, aliases);
    return raw !== "" && Number.isFinite(parseNumeric(raw));
  }

  function parseNumeric(value) {
    if (isBlankNumericPlaceholder(value)) return NaN;
    const number = Number(String(value ?? "").replace(/\((.*)\)/, "-$1").replace(/[$,%+,]/g, ""));
    return Number.isFinite(number) ? number : NaN;
  }

  function detectDelimiter(text) {
    const lines = String(text).split(/\r?\n/).filter((line) => line.trim()).slice(0, 200);
    const candidates = [",", "\t", ";"].map((delimiter) => ({
      delimiter,
      headerScore: lines.reduce((best, line) => Math.max(best, headerRowScore(line.split(delimiter))), 0),
      delimiterCount: lines.reduce((best, line) => Math.max(best, (line.match(new RegExp(delimiter === "\t" ? "\\t" : delimiter, "g")) || []).length), 0)
    }));
    candidates.sort((left, right) => (right.headerScore - left.headerScore) || (right.delimiterCount - left.delimiterCount));
    return candidates[0]?.delimiter || ",";
  }

  function cleanCell(value, options) {
    const trimmed = options.trim === false ? value : value.trim();
    return trimmed.replace(/^\uFEFF/, "");
  }

  function repairOverflowCells(headers = [], values = []) {
    if (values.length <= headers.length || !headers.length) {
      return { values, repaired: false, notes: [] };
    }

    if (values.slice(headers.length).every((value) => String(value || "").trim() === "")) {
      return {
        values: values.slice(0, headers.length),
        repaired: true,
        notes: ["ignored trailing empty CSV cells"]
      };
    }

    const overflow = values.length - headers.length;
    if (overflow > 8) {
      return { values, repaired: false, notes: [] };
    }

    const memo = new Set();
    function search(headerIndex, valueIndex) {
      const key = `${headerIndex}:${valueIndex}`;
      if (memo.has(key)) return null;
      if (headerIndex === headers.length) {
        return valueIndex === values.length ? [] : null;
      }

      const remainingHeaders = headers.length - headerIndex - 1;
      const maxConsume = values.length - valueIndex - remainingHeaders;
      const header = headers[headerIndex];
      const consumeOptions = [1];
      if (isNumericLikeColumn(header)) {
        for (let consume = 2; consume <= maxConsume; consume += 1) {
          const chunk = values.slice(valueIndex, valueIndex + consume);
          if (isThousandsSplitRepair(chunk)) consumeOptions.push(consume);
        }
      }

      for (const consume of consumeOptions) {
        if (consume > maxConsume) continue;
        const chunk = values.slice(valueIndex, valueIndex + consume);
        const repairedValue = consume === 1 ? chunk[0] : chunk.join(",");
        const tail = search(headerIndex + 1, valueIndex + consume);
        if (tail) return [repairedValue, ...tail];
      }

      memo.add(key);
      return null;
    }

    const repairedValues = search(0, 0);
    return repairedValues
      ? {
          values: repairedValues,
          repaired: true,
          notes: [`repaired ${overflow} split numeric cell${overflow === 1 ? "" : "s"}`]
        }
      : { values, repaired: false, notes: [] };
  }

  function isNumericLikeColumn(header) {
    const normalized = normalizeHeader(header);
    const numericAliases = [
      "shares",
      "quantity",
      "qty",
      "currentquantity",
      "units",
      "price",
      "lastprice",
      "lastpricechange",
      "currentprice",
      "marketprice",
      "unitprice",
      "marketvalue",
      "currentvalue",
      "positionvalue",
      "currentmarketvalue",
      "costbasis",
      "costbasistotal",
      "totalcostbasis",
      "totalcost",
      "averagecostbasis",
      "averagecost",
      "gainloss",
      "gain/loss",
      "unrealizedgainloss",
      "unrealizedgain",
      "totalgainloss",
      "totalgain/lossdollar",
      "percentgainloss",
      "percentgain/loss",
      "gainlosspercent",
      "gain/losspercent",
      "unrealizedgainlosspercent",
      "totalgain/losspercent",
      "percentofaccount",
      "quantscore",
      "forwardpe",
      "fwdpe"
    ];
    return numericAliases.includes(normalized) ||
      /(quantity|shares|price|value|basis|cost|gain|loss|percent|amount|volume|yield|score|marketcap|pe)/.test(normalized);
  }

  function isThousandsSplitRepair(parts = []) {
    if (parts.length < 2) return false;
    const trailingParts = parts.slice(1).map((part) => String(part || "").trim());
    if (trailingParts.some((part) => /[$+]/.test(part) || part.startsWith("-") || part.startsWith("("))) return false;
    const joined = parts.map((part) => String(part || "").trim()).join(",");
    const stripped = joined.replace(/[()\s+$%]/g, "").replace(/^-/, "");
    if (!/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(stripped)) return false;
    return Number.isFinite(parseNumeric(joined));
  }

  function isBlankNumericPlaceholder(value) {
    const text = String(value ?? "").trim().toLowerCase();
    return ["", "-", "--", "—", "n/a", "na", "not available", "null"].includes(text);
  }

  function findHeaderRowIndex(rows) {
    let bestIndex = 0;
    let bestScore = -1;

    rows.slice(0, 200).forEach((row, index) => {
      const score = headerRowScore(row);
      if (score > bestScore) {
        bestIndex = index;
        bestScore = score;
      }
    });

    return bestIndex;
  }

  function headerRowScore(row = []) {
    const normalized = row.map(normalizeHeader).filter(Boolean);
    const known = new Set(Object.values(FIELD_ALIASES).flat());
    const aliasHits = normalized.reduce((total, cell) => total + (known.has(cell) ? 1 : 0), 0);
    const hasTicker = normalized.some((cell) => (FIELD_ALIASES.ticker || []).includes(cell));
    const hasCompany = normalized.some((cell) => (FIELD_ALIASES.company || []).includes(cell));
    const hasValue = normalized.some((cell) => ["marketValue", "shares", "price", "costBasis"].some((field) => (FIELD_ALIASES[field] || []).includes(cell)));
    const accountOnlyPenalty = !hasTicker && hasValue ? 2 : 0;
    return aliasHits + (hasTicker ? 6 : 0) + (hasValue ? 3 : 0) + (hasCompany ? 1 : 0) - accountOnlyPenalty;
  }

  function dedupeHeaders(headers) {
    const counts = new Map();
    return headers.map((header, index) => {
      const fallback = `column${index + 1}`;
      const base = String(header || fallback).trim() || fallback;
      const seen = counts.get(base) || 0;
      counts.set(base, seen + 1);
      return seen ? `${base}_${seen + 1}` : base;
    });
  }

  function makeLookup(row) {
    const lookup = {};
    Object.entries(row || {}).forEach(([key, value]) => {
      if (key.startsWith("__")) return;
      lookup[normalizeHeader(key)] = value;
    });
    return lookup;
  }

  function normalizeHeader(header) {
    return String(header || "").toLowerCase().replace(/%/g, "percent").replace(/[^a-z0-9/]/g, "");
  }

  function readText(lookup, aliases) {
    const alias = aliases.find((key) => lookup[key] !== undefined && lookup[key] !== "");
    if (!alias) return "";
    return String(lookup[alias]).trim();
  }

  function readTicker(lookup, aliases) {
    for (const alias of aliases) {
      const raw = lookup[alias];
      if (raw === undefined || raw === "") continue;
      const ticker = normalizeTicker(raw);
      if (isLikelyTicker(ticker)) return ticker;
    }
    return "";
  }

  function maskAccountLabel(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    const digits = text.replace(/\D/g, "");
    if (digits.length < 5) return text;
    const lastFour = digits.slice(-4);
    if (!/[A-Za-z]/.test(text)) return `Account ending ${lastFour}`;
    return text.replace(/\d(?=(?:\D*\d){4})/g, "•");
  }

  function readNumber(lookup, aliases, fallback) {
    const raw = readText(lookup, aliases);
    if (!raw) return fallback;
    const numeric = parseNumeric(raw);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function readPercentValue(lookup, aliases, fallback) {
    const raw = readText(lookup, aliases);
    if (!raw) return fallback;
    const numeric = parseNumeric(raw);
    if (!Number.isFinite(numeric)) return fallback;
    return raw.includes("%") || Math.abs(numeric) > 1 ? numeric / 100 : numeric;
  }

  function inferPriceFromMarketValue(shares, marketValue) {
    const numericShares = numericValue(shares);
    const numericMarketValue = numericValue(marketValue);
    return numericShares > 0 && numericMarketValue > 0 ? numericMarketValue / numericShares : 0;
  }

  function isAverageCostBasisColumn(columnName = "") {
    return /^averagecost(basis)?(us|usd)?$|^avgcost(us|usd)?$|^costbasispershare(us|usd)?$|^costpershare(us|usd)?$/.test(normalizeHeader(columnName));
  }

  function readScore(lookup, aliases) {
    const raw = readText(lookup, aliases);
    if (!raw) return undefined;
    const lower = raw.toLowerCase().trim();
    if (GRADE_TO_SCORE[lower] !== undefined) return GRADE_TO_SCORE[lower];
    if (RATING_TO_SCORE[lower] !== undefined) return RATING_TO_SCORE[lower];
    return readNumber(lookup, aliases, undefined);
  }

  function readPercentOrGrade(lookup, aliases) {
    const rawScore = readScore(lookup, aliases);
    if (rawScore === undefined) return undefined;
    return rawScore <= 5 ? Math.round(rawScore * 20) : rawScore;
  }

  function normalizeTicker(value) {
    return String(value || "")
      .trim()
      .toUpperCase()
      .replace(/^[$#]/, "")
      .replace(/\*+$/g, "")
      .replace(/\s+/g, "")
      .replace("/", ".")
      .replace(/[^A-Z0-9.-]/g, "");
  }

  function isLikelyTicker(value) {
    return /^[A-Z][A-Z0-9.-]{0,9}$/.test(String(value || ""));
  }

  function isLikelyCusip(value) {
    return /^[A-Z0-9]{9}$/.test(normalizeTicker(value)) && /\d/.test(normalizeTicker(value));
  }

  function isLikelyFidelityNonStandardSymbol(value) {
    const text = String(value || "").trim().toUpperCase();
    const compact = normalizeTicker(text).replace(/^[^A-Z]+/, "").replace(/[^A-Z0-9]+/g, "");
    if (!compact) return false;
    return /^[A-Z]{1,6}\d{6}[CP]\d{3,8}$/.test(compact) ||
      (/^[A-Z][A-Z0-9.\s/-]{0,60}\b(CALL|PUT)\b/.test(text) && /\d/.test(text));
  }

  function isSupportedRawTicker(value) {
    const text = String(value || "").trim();
    return /^[#$]?[A-Za-z][A-Za-z0-9./-]{0,12}\**$/.test(text);
  }

  function normalizeDate(value) {
    const text = String(value || "").trim();
    if (!text) return undefined;
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return text;

    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function isLikelyDate(value) {
    return !Number.isNaN(new Date(value).getTime()) || /^\d{4}-\d{2}-\d{2}$/.test(String(value));
  }

  function pruneEmpty(record) {
    return Object.fromEntries(
      Object.entries(record).filter(([, value]) => {
        if (Array.isArray(value)) return value.length > 0;
        return value !== undefined && value !== null && value !== "";
      })
    );
  }

  return {
    parseCsv,
    parseCsvRows,
    parseHoldingJsonRows,
    buildColumnMapping,
    normalizeFidelityPositions,
    normalizeSeekingAlphaRatings,
    mergeRecordsByTicker,
    validateRecords,
    summarizeImport,
    buildImportResult
  };
});
