import test from "node:test";
import assert from "node:assert/strict";
import {
  averageTrueRangeSeries,
  bandPower,
  bollingerBands,
  buildTechnicalAnalysisSnapshot,
  detrendLinear,
  drawdown,
  exponentialMovingAverage,
  logReturns,
  macd,
  powerSpectralDensity,
  normalizeTechnicalPricePoints,
  onBalanceVolume,
  relativeStrengthIndex,
  returnsDistribution,
  rollingSharpe,
  rollingZScore,
  stftSpectrogram,
  simpleMovingAverage
} from "../src/technicalAnalysis.js";

test("technical indicators calculate deterministic moving averages and bands", () => {
  const closes = [10, 11, 12, 13, 14];

  assert.deepEqual(simpleMovingAverage(closes, 3).map((value) => value === null ? null : Number(value.toFixed(2))), [null, null, 11, 12, 13]);
  assert.deepEqual(exponentialMovingAverage([10, 12, 14], 3).map((value) => Number(value.toFixed(2))), [10, 11, 12.5]);
  assert.equal(Number(relativeStrengthIndex(closes, 3).at(-1).toFixed(2)), 100);
  assert.equal(Number(bollingerBands(closes, 3).at(-1).mid.toFixed(2)), 13);
  assert.ok(macd(closes).at(-1).histogram > 0);
});

test("technical diagnostics cover volatility, volume, returns, drawdown, and z-score", () => {
  const points = [
    { date: "2026-05-20", close: 100, high: 104, low: 99, volume: 1000 },
    { date: "2026-05-21", close: 105, high: 107, low: 102, volume: 1200 },
    { date: "2026-05-22", close: 102, high: 106, low: 101, volume: 900 },
    { date: "2026-05-23", close: 110, high: 111, low: 104, volume: 1500 }
  ];

  assert.equal(normalizeTechnicalPricePoints([...points].reverse())[0].date, "2026-05-20");
  assert.ok(averageTrueRangeSeries(points, 3).at(-1) > 0);
  assert.equal(onBalanceVolume(points).at(-1), 1800);
  assert.equal(logReturns([100, 110]).length, 2);
  assert.equal(Number(drawdown([100, 120, 90]).at(-1).toFixed(2)), -0.25);
  assert.ok(Number.isFinite(rollingZScore([100, 101, 102, 103], 3).at(-1)));
  assert.ok(Number.isFinite(rollingSharpe([100, 101, 103, 106], 2).at(-1)));
});

test("technical snapshot summarizes short history honestly", () => {
  const snapshot = buildTechnicalAnalysisSnapshot([
    { date: "2026-05-20", close: 121 },
    { date: "2026-05-21", close: 126 },
    { date: "2026-05-22", close: 132.1 }
  ], { ticker: "MU", sourceLabel: "Sample market data" });

  assert.equal(snapshot.status, "available");
  assert.equal(snapshot.ticker, "MU");
  assert.equal(snapshot.pointCount, 3);
  assert.equal(snapshot.labels.trend, "Above trend");
  assert.match(snapshot.summary, /MU is up across 3 available price points/);
  assert.ok(snapshot.missingData.some((item) => /Only 3 historical price points/.test(item)));
  assert.ok(snapshot.riskNotes.includes("Technical confidence is limited by short history."));
});

test("technical diagnostics include returns distribution and spectral scans when history is deep enough", () => {
  const closes = Array.from({ length: 64 }, (_, index) => 100 + Math.sin((2 * Math.PI * index) / 8) * 4 + index * 0.08);
  const distribution = returnsDistribution(closes);
  const psd = powerSpectralDensity(closes, { nperseg: 32 });
  const stft = stftSpectrogram(closes, { nperseg: 16, noverlap: 8 });
  const snapshot = buildTechnicalAnalysisSnapshot(closes.map((close, index) => ({ date: `2026-05-${String((index % 28) + 1).padStart(2, "0")}`, close })), { ticker: "CYCLE" });

  assert.equal(distribution.count, 63);
  assert.ok(Number.isFinite(distribution.annualizedVolatility));
  assert.ok(detrendLinear(closes).length === closes.length);
  assert.ok(psd.peakFreqs.length >= 1);
  assert.ok(psd.dominantCycle > 0);
  assert.ok(Number.isFinite(bandPower(psd, 0.05, 0.2)));
  assert.ok(stft.powerDb.length >= 1);
  assert.equal(snapshot.spectral.peakFreqs.length >= 1, true);
  assert.match(snapshot.regimeProxy.label, /Constructive|Positive|Mixed|Volatile|Pressure|Negative/);
  assert.equal(snapshot.missingData.some((item) => /Welch PSD/.test(item)), false);
});

test("technical snapshot reports missing history without fabricating signals", () => {
  const snapshot = buildTechnicalAnalysisSnapshot([], { ticker: "XYZ" });

  assert.equal(snapshot.status, "missing");
  assert.equal(snapshot.pointCount, 0);
  assert.deepEqual(snapshot.missingData, ["historical price series with at least two close values"]);
});
