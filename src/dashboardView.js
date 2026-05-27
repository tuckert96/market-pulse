const defaultIds = {
  stockRows: "stockRows",
  topCards: "topCards",
  sector: "sector",
  signalChart: "signalChart",
  pickCount: "pickCount",
  pickHint: "pickHint",
  topSignal: "topSignal",
  topSignalHint: "topSignalHint",
  avgGrowth: "avgGrowth",
  overlap: "overlap",
  minScore: "minScore"
};

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0
});

const currencyFormatter = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 0,
  style: "currency"
});

function byId(id) {
  return document.getElementById(id);
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatPercent(value) {
  return `${numberFormatter.format(Number(value) || 0)}%`;
}

function formatNumber(value) {
  return numberFormatter.format(Number(value) || 0);
}

function formatCurrency(value) {
  return currencyFormatter.format(Number(value) || 0);
}

function daysUntil(dateText, now = new Date()) {
  if (!dateText) return 999;
  const date = new Date(`${dateText}T12:00:00`);
  if (Number.isNaN(date.getTime())) return 999;
  return Math.ceil((date - now) / 86400000);
}

function pillClass(score) {
  if (Number(score) >= 78) return "good";
  if (Number(score) >= 62) return "warn";
  return "bad";
}

function scoreDrivers(stock) {
  const drivers = [];
  if (Number(stock.revenueGrowth) >= 35) drivers.push("sales acceleration");
  if (Number(stock.epsGrowth) >= 45) drivers.push("earnings leverage");
  if (Number(stock.momentum) >= 80) drivers.push("price momentum");
  if (Number(stock.quant) >= 4.5) drivers.push("SA quant");
  if (Number(stock.forwardPe) <= 35) drivers.push("valuation support");
  if (daysUntil(stock.nextEarnings) <= 12) drivers.push("near catalyst");
  return drivers.slice(0, 4);
}

function getPositionValue(stock) {
  if (stock.positionValue !== undefined) return Number(stock.positionValue) || 0;
  return (Number(stock.shares) || 0) * (Number(stock.price) || 0);
}

function safeRows(rows) {
  return Array.isArray(rows) ? rows : [];
}

function setText(id, value) {
  const target = byId(id);
  if (target) target.textContent = value;
}

export function renderMetrics(rows, allRows = rows, options = {}) {
  const ids = { ...defaultIds, ...options.ids };
  const filteredRows = safeRows(rows);
  const sourceRows = safeRows(allRows);
  const top = filteredRows[0];
  const minScoreElement = byId(ids.minScore);
  const minScore = Number(options.minScore ?? minScoreElement?.value ?? 0);
  const avgGrowth = filteredRows.length
    ? filteredRows.reduce((sum, stock) => {
        const blend =
          ((Number(stock.revenueGrowth) || 0) + (Number(stock.epsGrowth) || 0)) /
          2;
        return sum + blend;
      }, 0) / filteredRows.length
    : 0;
  const overlap = filteredRows.length
    ? filteredRows.filter((stock) => Number(stock.shares) > 0).length /
      filteredRows.length
    : 0;
  const passingCount = sourceRows.filter(
    (stock) => Number(stock.score) >= minScore
  ).length;

  setText(ids.pickCount, filteredRows.length);
  setText(ids.topSignal, top ? top.ticker : "--");
  setText(
    ids.topSignalHint,
    top ? `${top.company || top.ticker}, score ${top.score}` : "No qualified pick"
  );
  setText(ids.avgGrowth, filteredRows.length ? formatPercent(avgGrowth) : "--");
  setText(ids.overlap, filteredRows.length ? `${Math.round(overlap * 100)}%` : "--");
  setText(ids.pickHint, `${passingCount} of ${sourceRows.length} pass`);
}

export function renderRankedTableRows(rows, options = {}) {
  const ids = { ...defaultIds, ...options.ids };
  const target = byId(options.targetId || ids.stockRows);
  if (!target) return;

  const rankedRows = safeRows(rows);
  if (!rankedRows.length) {
    target.innerHTML =
      '<tr><td colspan="10" class="empty">No stocks match the current filters.</td></tr>';
    return;
  }

  target.innerHTML = rankedRows
    .map((stock) => {
      const score = clamp(stock.score);
      const earningsDays = daysUntil(stock.nextEarnings);
      const catalyst = earningsDays < 0 ? "reported" : `${earningsDays}d`;
      const positionValue = getPositionValue(stock);
      const catalystClass = earningsDays <= 10 ? "warn" : "good";

      return `
        <tr>
          <td>
            <div class="score">
              <span class="pill ${pillClass(score)}">${score}</span>
              <span class="bar"><i style="width:${score}%"></i></span>
            </div>
          </td>
          <td>
            <div class="ticker">
              <b>${escapeHtml(stock.ticker || "--")}</b>
              <span>${escapeHtml(stock.company || "Unknown company")}</span>
            </div>
          </td>
          <td>${escapeHtml(stock.sector || "Unclassified")}</td>
          <td>${formatPercent(stock.revenueGrowth)}</td>
          <td>${formatPercent(stock.epsGrowth)}</td>
          <td>${formatNumber(stock.momentum)}</td>
          <td>${Number(stock.quant || 0).toFixed(2)}</td>
          <td>${formatNumber(stock.forwardPe)}</td>
          <td>${positionValue ? formatCurrency(positionValue) : "New idea"}</td>
          <td>
            ${escapeHtml(stock.nextEarnings || "--")}
            <span class="pill ${catalystClass}">${catalyst}</span>
          </td>
        </tr>
      `;
    })
    .join("");
}

export function renderTopPickCards(rows, options = {}) {
  const ids = { ...defaultIds, ...options.ids };
  const target = byId(options.targetId || ids.topCards);
  if (!target) return;

  const limit = Number(options.limit || 4);
  const topRows = safeRows(rows).slice(0, limit);
  if (!topRows.length) {
    target.innerHTML =
      '<div class="empty">No top picks match the current filters.</div>';
    return;
  }

  target.innerHTML = topRows
    .map((stock) => {
      const score = clamp(stock.score);
      const drivers = scoreDrivers(stock);
      const driverMarkup = drivers.length
        ? drivers
            .map((driver) => `<span class="driver">${escapeHtml(driver)}</span>`)
            .join("")
        : '<span class="driver">watchlist candidate</span>';

      return `
        <article class="stock-card">
          <div class="card-top">
            <div>
              <h3>${escapeHtml(stock.ticker || "--")} · ${escapeHtml(stock.company || "Unknown company")}</h3>
              <span>${escapeHtml(stock.thesis || "Imported idea")}</span>
            </div>
            <span class="pill ${pillClass(score)}">${score}</span>
          </div>
          <div class="drivers">${driverMarkup}</div>
        </article>
      `;
    })
    .join("");
}

export function renderSectorOptions(stocks, options = {}) {
  const ids = { ...defaultIds, ...options.ids };
  const target = byId(options.targetId || ids.sector);
  if (!target) return [];

  const existing = options.selectedValue ?? target.value;
  const sectors = [
    ...new Set(safeRows(stocks).map((stock) => stock.sector).filter(Boolean))
  ].sort((a, b) => a.localeCompare(b));

  target.innerHTML = [
    '<option value="all">All sectors</option>',
    ...sectors.map(
      (sector) =>
        `<option value="${escapeHtml(sector)}">${escapeHtml(sector)}</option>`
    )
  ].join("");
  target.value = sectors.includes(existing) ? existing : "all";
  return sectors;
}

export function generateExportCsv(rows, options = {}) {
  const headers = options.headers || [
    "rank",
    "ticker",
    "company",
    "sector",
    "score",
    "revenueGrowth",
    "epsGrowth",
    "momentum",
    "quant",
    "forwardPe",
    "positionValue",
    "nextEarnings",
    "thesis"
  ];
  const csvRows = safeRows(rows).map((stock, index) =>
    headers
      .map((header) => {
        const value =
          header === "rank"
            ? index + 1
            : header === "positionValue"
              ? getPositionValue(stock)
              : stock[header] ?? "";
        return `"${String(value).replaceAll('"', '""')}"`;
      })
      .join(",")
  );

  return [headers.join(","), ...csvRows].join("\n");
}

export function downloadExportCsv(rows, options = {}) {
  const csv = generateExportCsv(rows, options);
  const filename = options.filename || "growth-signal-picks.csv";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  return csv;
}

export function renderScoreChart(rows, options = {}) {
  const ids = { ...defaultIds, ...options.ids };
  const canvas = byId(options.targetId || ids.signalChart);
  if (!canvas) return;

  const context = canvas.getContext("2d");
  if (!context) return;

  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = Math.max(320, rect.width || Number(canvas.width) || 600);
  const cssHeight = Number(options.height || 360);
  const topRows = safeRows(rows).slice(0, Number(options.limit || 6));
  const left = 52;
  const topPad = 28;
  const barGap = 13;
  const barHeight = 30;
  const chartWidth = cssWidth - 92;

  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;
  canvas.style.height = `${cssHeight}px`;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, cssWidth, cssHeight);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, cssWidth, cssHeight);
  context.font = "12px Inter, system-ui, sans-serif";

  if (!topRows.length) {
    context.fillStyle = "#667085";
    context.fillText("No filtered stocks to chart.", 22, 40);
    return;
  }

  topRows.forEach((stock, index) => {
    const score = clamp(stock.score);
    const y = topPad + index * (barHeight + barGap);
    const scoreWidth = Math.max(6, (score / 100) * chartWidth);

    context.fillStyle = "#eef2f7";
    context.fillRect(left, y, chartWidth, barHeight);
    context.fillStyle =
      score >= 78 ? "#2f7d32" : score >= 62 ? "#b45309" : "#b42318";
    context.fillRect(left, y, scoreWidth, barHeight);
    context.fillStyle = "#15171a";
    context.fillText(String(stock.ticker || "--"), 14, y + 20);
    context.fillStyle = "#ffffff";
    context.font = "700 12px Inter, system-ui, sans-serif";
    context.fillText(String(score), left + 10, y + 20);
    context.font = "12px Inter, system-ui, sans-serif";
  });

  context.fillStyle = "#667085";
  context.fillText("Composite score", left, cssHeight - 24);
}

export function renderDashboardView(rows, allRows = rows, options = {}) {
  renderSectorOptions(allRows, options);
  renderMetrics(rows, allRows, options);
  renderRankedTableRows(rows, options);
  renderTopPickCards(rows, options);
  renderScoreChart(rows, options);
}
