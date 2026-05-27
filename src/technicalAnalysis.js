const DEFAULT_WINDOWS = Object.freeze({
  sma: 20,
  ema: 20,
  rsi: 14,
  bollinger: 20,
  bollingerK: 2,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  zScore: 20,
  atr: 14,
  sharpe: 20,
  annualization: 252,
  autocorrelationMaxLag: 5,
  psdNperseg: 128,
  stftNperseg: 64,
  stftOverlap: 48,
  topFrequencyPeaks: 5
});

function finiteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function cleanValues(values = []) {
  return values.map(finiteNumber).filter((value) => value !== null);
}

function lastFinite(values = []) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (Number.isFinite(values[index])) return values[index];
  }
  return null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function effectiveWindow(preferred, count, minimum = 3) {
  if (count <= 0) return preferred;
  return clamp(Math.min(preferred, count), Math.min(minimum, count), preferred);
}

function mean(values = []) {
  const clean = cleanValues(values);
  if (!clean.length) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function standardDeviation(values = []) {
  const clean = cleanValues(values);
  if (!clean.length) return null;
  const avg = mean(clean);
  const variance = clean.reduce((sum, value) => sum + (value - avg) ** 2, 0) / clean.length;
  return Math.sqrt(variance);
}

function sampleStandardDeviation(values = []) {
  const clean = cleanValues(values);
  if (clean.length < 2) return null;
  const avg = mean(clean);
  const variance = clean.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (clean.length - 1);
  return Math.sqrt(variance);
}

function normalizePoint(point, index) {
  if (typeof point === "number") {
    return { date: `Point ${index + 1}`, close: point, originalIndex: index };
  }
  const close = finiteNumber(point?.close ?? point?.price ?? point?.adjustedClose ?? point?.adjClose ?? point?.value);
  if (close === null || close <= 0) return null;
  const open = finiteNumber(point?.open);
  const high = finiteNumber(point?.high);
  const low = finiteNumber(point?.low);
  const volume = finiteNumber(point?.volume);
  const date = point?.date || point?.timestamp || point?.time || `Point ${index + 1}`;
  const timestamp = Date.parse(date);
  return {
    date,
    close,
    open,
    high,
    low,
    volume,
    originalIndex: index,
    sortValue: Number.isNaN(timestamp) ? null : timestamp
  };
}

export function normalizeTechnicalPricePoints(points = []) {
  const normalized = (Array.isArray(points) ? points : [])
    .map(normalizePoint)
    .filter(Boolean);
  const sortable = normalized.length > 1 && normalized.every((point) => point.sortValue !== null);
  return (sortable ? [...normalized].sort((a, b) => a.sortValue - b.sortValue) : normalized)
    .map(({ originalIndex, sortValue, ...point }) => point);
}

export function simpleMovingAverage(values = [], window = DEFAULT_WINDOWS.sma) {
  const clean = cleanValues(values);
  return clean.map((_, index) => {
    if (index + 1 < window) return null;
    return mean(clean.slice(index + 1 - window, index + 1));
  });
}

export function exponentialMovingAverage(values = [], window = DEFAULT_WINDOWS.ema) {
  const clean = cleanValues(values);
  if (!clean.length) return [];
  const alpha = 2 / (window + 1);
  const result = [];
  clean.forEach((value, index) => {
    result[index] = index === 0 ? value : alpha * value + (1 - alpha) * result[index - 1];
  });
  return result;
}

export function relativeStrengthIndex(values = [], window = DEFAULT_WINDOWS.rsi) {
  const clean = cleanValues(values);
  if (clean.length < 2) return clean.map(() => null);
  const result = [null];
  let avgGain = 0;
  let avgLoss = 0;
  for (let index = 1; index < clean.length; index += 1) {
    const diff = clean[index] - clean[index - 1];
    const gain = Math.max(diff, 0);
    const loss = Math.max(-diff, 0);
    if (index <= window) {
      avgGain += gain;
      avgLoss += loss;
      if (index < window) {
        result.push(null);
        continue;
      }
      avgGain /= window;
      avgLoss /= window;
    } else {
      avgGain = (avgGain * (window - 1) + gain) / window;
      avgLoss = (avgLoss * (window - 1) + loss) / window;
    }
    if (avgLoss === 0 && avgGain === 0) result.push(50);
    else if (avgLoss === 0) result.push(100);
    else {
      const rs = avgGain / avgLoss;
      result.push(100 - 100 / (1 + rs));
    }
  }
  return result;
}

export function bollingerBands(values = [], window = DEFAULT_WINDOWS.bollinger, k = DEFAULT_WINDOWS.bollingerK) {
  const clean = cleanValues(values);
  return clean.map((value, index) => {
    if (index + 1 < window) return { mid: null, upper: null, lower: null, percentB: null, bandwidth: null };
    const slice = clean.slice(index + 1 - window, index + 1);
    const mid = mean(slice);
    const sd = standardDeviation(slice) || 0;
    const upper = mid + k * sd;
    const lower = mid - k * sd;
    const bandRange = upper - lower;
    return {
      mid,
      upper,
      lower,
      percentB: bandRange ? (value - lower) / bandRange : 0.5,
      bandwidth: mid ? bandRange / mid : null
    };
  });
}

export function macd(values = [], fast = DEFAULT_WINDOWS.macdFast, slow = DEFAULT_WINDOWS.macdSlow, signal = DEFAULT_WINDOWS.macdSignal) {
  const clean = cleanValues(values);
  const fastEma = exponentialMovingAverage(clean, fast);
  const slowEma = exponentialMovingAverage(clean, slow);
  const line = clean.map((_, index) => fastEma[index] - slowEma[index]);
  const signalLine = exponentialMovingAverage(line, signal);
  return clean.map((_, index) => ({
    macd: line[index],
    signal: signalLine[index],
    histogram: line[index] - signalLine[index]
  }));
}

export function averageTrueRange(points = [], window = DEFAULT_WINDOWS.atr) {
  return averageTrueRangeSeries(points, window);
}

export function wilderMovingAverage(values = [], window = DEFAULT_WINDOWS.atr) {
  const clean = cleanValues(values);
  const alpha = 1 / window;
  const result = [];
  clean.forEach((value, index) => {
    result[index] = index === 0 ? value : alpha * value + (1 - alpha) * result[index - 1];
  });
  return result;
}

export function averageTrueRangeSeries(points = [], window = DEFAULT_WINDOWS.atr) {
  const normalized = normalizeTechnicalPricePoints(points);
  if (!normalized.length || !normalized.every((point) => Number.isFinite(point.high) && Number.isFinite(point.low))) {
    return [];
  }
  const trueRanges = normalized.map((point, index) => {
    const previousClose = index > 0 ? normalized[index - 1].close : point.close;
    return Math.max(
      Math.abs(point.high - point.low),
      Math.abs(point.high - previousClose),
      Math.abs(point.low - previousClose)
    );
  });
  return wilderMovingAverage(trueRanges, window);
}

export function onBalanceVolume(points = []) {
  const normalized = normalizeTechnicalPricePoints(points);
  if (!normalized.length || !normalized.every((point) => Number.isFinite(point.volume))) return [];
  let cumulative = 0;
  return normalized.map((point, index) => {
    if (index === 0) return cumulative;
    const direction = Math.sign(point.close - normalized[index - 1].close);
    cumulative += direction * point.volume;
    return cumulative;
  });
}

export function rollingZScore(values = [], window = DEFAULT_WINDOWS.zScore) {
  const clean = cleanValues(values);
  return clean.map((value, index) => {
    if (index + 1 < window) return null;
    const slice = clean.slice(index + 1 - window, index + 1);
    const avg = mean(slice);
    const sd = standardDeviation(slice);
    return sd ? (value - avg) / sd : 0;
  });
}

export function logReturns(values = []) {
  const clean = cleanValues(values);
  return clean.map((value, index) => {
    if (index === 0) return null;
    const previous = clean[index - 1];
    return previous > 0 && value > 0 ? Math.log(value) - Math.log(previous) : null;
  });
}

export function drawdown(values = []) {
  const clean = cleanValues(values);
  let runningMax = 0;
  return clean.map((value) => {
    runningMax = Math.max(runningMax, value);
    return runningMax ? value / runningMax - 1 : 0;
  });
}

export function rollingSharpe(values = [], window = DEFAULT_WINDOWS.sharpe, annualization = DEFAULT_WINDOWS.annualization) {
  const returns = logReturns(values).filter((value) => value !== null);
  return returns.map((_, index) => {
    if (index + 1 < window) return null;
    const slice = returns.slice(index + 1 - window, index + 1);
    const avg = mean(slice);
    const sd = standardDeviation(slice);
    return sd ? Math.sqrt(annualization) * (avg / sd) : null;
  });
}

export function autocorrelation(values = [], maxLag = DEFAULT_WINDOWS.autocorrelationMaxLag) {
  const clean = cleanValues(values);
  if (clean.length < maxLag + 2) return [];
  const avg = mean(clean);
  const centered = clean.map((value) => value - avg);
  const variance = centered.reduce((sum, value) => sum + value * value, 0);
  if (!variance) return Array.from({ length: maxLag }, (_, index) => ({ lag: index + 1, value: 0 }));
  return Array.from({ length: maxLag }, (_, index) => {
    const lag = index + 1;
    let covariance = 0;
    for (let i = 0; i < centered.length - lag; i += 1) {
      covariance += centered[i] * centered[i + lag];
    }
    return { lag, value: covariance / variance };
  });
}

export function returnsDistribution(values = []) {
  const returns = logReturns(values).filter((value) => value !== null);
  const count = returns.length;
  if (count < 2) {
    return {
      count,
      mean: null,
      sigma: null,
      skew: null,
      excessKurtosis: null,
      ksStatistic: null,
      tailEventCount: 0,
      annualizedVolatility: null,
      label: "Return distribution unavailable",
      detail: "At least two return observations are needed."
    };
  }
  const avg = mean(returns);
  const sigma = sampleStandardDeviation(returns) || 0;
  const centered = returns.map((value) => value - avg);
  const populationSigma = standardDeviation(returns) || 0;
  const skew = populationSigma
    ? centered.reduce((sum, value) => sum + value ** 3, 0) / count / (populationSigma ** 3)
    : 0;
  const excessKurtosis = populationSigma
    ? centered.reduce((sum, value) => sum + value ** 4, 0) / count / (populationSigma ** 4) - 3
    : 0;
  const tailEventCount = sigma
    ? returns.filter((value) => Math.abs(value - avg) > sigma * 2).length
    : 0;
  const ksStatistic = sigma ? kolmogorovSmirnovNormalStatistic(returns, avg, sigma) : null;
  const annualizedVolatility = sigma * Math.sqrt(DEFAULT_WINDOWS.annualization);
  const label = Math.abs(skew) >= 1 || excessKurtosis >= 3 || tailEventCount >= Math.max(2, Math.ceil(count * 0.12))
    ? "Fat-tailed / asymmetric"
    : annualizedVolatility >= 0.45
      ? "High-volatility distribution"
      : "Orderly distribution";
  const detail = `${count} return observations; skew ${round(skew, 2)}, excess kurtosis ${round(excessKurtosis, 2)}, ${tailEventCount} two-sigma tail events.`;
  return {
    count,
    mean: avg,
    sigma,
    skew,
    excessKurtosis,
    ksStatistic,
    tailEventCount,
    annualizedVolatility,
    label,
    detail
  };
}

export function detrendLinear(values = []) {
  const clean = cleanValues(values);
  const count = clean.length;
  if (count < 4) return clean;
  const xMean = (count - 1) / 2;
  const yMean = mean(clean);
  let numerator = 0;
  let denominator = 0;
  clean.forEach((value, index) => {
    numerator += (index - xMean) * (value - yMean);
    denominator += (index - xMean) ** 2;
  });
  const slope = denominator ? numerator / denominator : 0;
  const intercept = yMean - slope * xMean;
  return clean.map((value, index) => value - (intercept + slope * index));
}

export function powerSpectralDensity(values = [], options = {}) {
  const clean = cleanValues(values);
  const fs = Number(options.fs) || 1;
  const nPeaks = Number(options.nPeaks) || DEFAULT_WINDOWS.topFrequencyPeaks;
  if (clean.length < 8) {
    return {
      freqs: [],
      power: [],
      peakFreqs: [],
      peakPowers: [],
      dominantFrequency: null,
      dominantCycle: null,
      spectralConcentration: null,
      bandPowers: {},
      label: "Spectral scan unavailable"
    };
  }

  const arr = detrendLinear(clean);
  const nperseg = Math.min(Number(options.nperseg) || DEFAULT_WINDOWS.psdNperseg, arr.length);
  const step = Math.max(1, Math.floor(nperseg / 2));
  const starts = [];
  for (let start = 0; start + nperseg <= arr.length; start += step) starts.push(start);
  if (!starts.length) starts.push(0);
  const bins = Math.floor(nperseg / 2) + 1;
  const freqs = Array.from({ length: bins }, (_, index) => (index * fs) / nperseg);
  const power = Array.from({ length: bins }, () => 0);
  const window = hannWindow(nperseg);
  const windowPower = window.reduce((sum, value) => sum + value * value, 0) || 1;

  starts.forEach((start) => {
    const segment = arr.slice(start, start + nperseg);
    const periodogram = oneSidedPower(segment, window, windowPower);
    periodogram.forEach((value, index) => {
      power[index] += value;
    });
  });
  const averagedPower = power.map((value) => value / starts.length);
  const peaks = findSpectralPeaks(freqs, averagedPower, nPeaks);
  const totalPower = averagedPower.reduce((sum, value, index) => sum + (index === 0 ? 0 : value), 0);
  const topPower = peaks[0]?.power || 0;
  const dominantFrequency = peaks[0]?.frequency ?? null;
  const dominantCycle = dominantFrequency ? 1 / dominantFrequency : null;
  const bandPowers = {
    slow: bandPower({ freqs, power: averagedPower }, 0.001, 0.05),
    medium: bandPower({ freqs, power: averagedPower }, 0.05, 0.18),
    fast: bandPower({ freqs, power: averagedPower }, 0.18, 0.5)
  };
  const spectralConcentration = totalPower ? topPower / totalPower : null;
  const label = dominantCycle
    ? `Dominant cycle near ${round(dominantCycle, 1)} samples`
    : "No dominant cycle detected";
  return {
    freqs,
    power: averagedPower,
    peakFreqs: peaks.map((peak) => peak.frequency),
    peakPowers: peaks.map((peak) => peak.power),
    peaks,
    dominantFrequency,
    dominantCycle,
    spectralConcentration,
    bandPowers,
    label
  };
}

export function stftSpectrogram(values = [], options = {}) {
  const clean = cleanValues(values);
  const fs = Number(options.fs) || 1;
  if (clean.length < 8) {
    return {
      times: [],
      freqs: [],
      powerDb: [],
      label: "Spectrogram unavailable",
      powerShift: null
    };
  }
  const arr = detrendLinear(clean);
  const nperseg = Math.min(Number(options.nperseg) || DEFAULT_WINDOWS.stftNperseg, arr.length);
  const noverlap = Math.min(Number(options.noverlap) || DEFAULT_WINDOWS.stftOverlap, Math.max(0, nperseg - 1));
  const step = Math.max(1, nperseg - noverlap);
  const window = hannWindow(nperseg);
  const windowPower = window.reduce((sum, value) => sum + value * value, 0) || 1;
  const times = [];
  const frames = [];
  for (let start = 0; start + nperseg <= arr.length; start += step) {
    const segment = arr.slice(start, start + nperseg);
    const power = oneSidedPower(segment, window, windowPower);
    frames.push(power.map((value) => 10 * Math.log10(value + 1e-12)));
    times.push(start + nperseg / 2);
  }
  if (!frames.length) {
    const power = oneSidedPower(arr, hannWindow(arr.length), arr.length / 2 || 1);
    frames.push(power.map((value) => 10 * Math.log10(value + 1e-12)));
    times.push(arr.length / 2);
  }
  const freqs = Array.from({ length: frames[0].length }, (_, index) => (index * fs) / nperseg);
  const frameEnergy = frames.map((frame) => frame.reduce((sum, value) => sum + value, 0) / frame.length);
  const powerShift = frameEnergy.length > 1 ? frameEnergy[frameEnergy.length - 1] - frameEnergy[0] : 0;
  return {
    times,
    freqs,
    powerDb: frames,
    label: powerShift > 3 ? "Time-frequency energy rising" : powerShift < -3 ? "Time-frequency energy fading" : "Time-frequency energy stable",
    powerShift
  };
}

export function bandPower(psd = {}, lo = 0, hi = 0.5) {
  const freqs = psd.freqs || [];
  const power = psd.power || [];
  if (!freqs.length || !power.length) return NaN;
  let area = 0;
  for (let index = 1; index < freqs.length; index += 1) {
    const leftFreq = freqs[index - 1];
    const rightFreq = freqs[index];
    if (rightFreq < lo || leftFreq > hi) continue;
    const width = Math.min(rightFreq, hi) - Math.max(leftFreq, lo);
    if (width <= 0) continue;
    area += ((power[index - 1] + power[index]) / 2) * width;
  }
  return area;
}

function rsiLabel(value) {
  if (!Number.isFinite(value)) return "Unavailable";
  if (value >= 70) return "Extended";
  if (value <= 30) return "Washed out";
  if (value >= 55) return "Constructive";
  if (value <= 45) return "Soft";
  return "Neutral";
}

function trendLabel(latest, sma, ema) {
  if (!Number.isFinite(latest) || !Number.isFinite(sma)) return "Trend unavailable";
  const aboveSma = latest >= sma;
  const aboveEma = Number.isFinite(ema) ? latest >= ema : aboveSma;
  if (aboveSma && aboveEma) return "Above trend";
  if (!aboveSma && !aboveEma) return "Below trend";
  return "Mixed trend";
}

function macdLabel(histogram) {
  if (!Number.isFinite(histogram)) return "MACD unavailable";
  if (histogram > 0) return "Momentum positive";
  if (histogram < 0) return "Momentum negative";
  return "Flat momentum";
}

function bollingerLabel(percentB) {
  if (!Number.isFinite(percentB)) return "Band unavailable";
  if (percentB >= 1) return "Above upper band";
  if (percentB <= 0) return "Below lower band";
  if (percentB >= 0.8) return "Near upper band";
  if (percentB <= 0.2) return "Near lower band";
  return "Inside band";
}

function drawdownLabel(value) {
  if (!Number.isFinite(value)) return "Drawdown unavailable";
  const magnitude = Math.abs(value);
  if (magnitude >= 0.25) return "Deep drawdown";
  if (magnitude >= 0.1) return "Meaningful drawdown";
  return "Near highs";
}

function distributionRiskNote(distribution = {}) {
  if (!Number.isFinite(distribution.annualizedVolatility)) return "";
  if (/fat-tailed|asymmetric/i.test(distribution.label)) return "Return distribution is fat-tailed or asymmetric; avoid over-reading normal-distribution assumptions.";
  if (distribution.annualizedVolatility >= 0.45) return "Annualized volatility is high on the available return sample.";
  return "";
}

function spectralRiskNote(spectral = {}) {
  if (!Number.isFinite(spectral.spectralConcentration)) return "";
  if (spectral.spectralConcentration >= 0.45) return "Spectral power is concentrated in one cycle; review whether the series is regime-like instead of broad trend.";
  return "";
}

function regimeProxyLabel({ seriesReturn, latestDrawdown, latestSharpe, distribution }) {
  const vol = distribution?.annualizedVolatility;
  if (Number.isFinite(latestDrawdown) && latestDrawdown <= -0.12 && seriesReturn < 0) return "Pressure regime";
  if (Number.isFinite(vol) && vol >= 0.55) return "Volatile tape";
  if (Number.isFinite(latestSharpe) && latestSharpe >= 1 && seriesReturn > 0) return "Constructive trend";
  if (seriesReturn > 0.04) return "Positive drift";
  if (seriesReturn < -0.04) return "Negative drift";
  return "Mixed / neutral";
}

function regimeProxyDetail(label) {
  return ({
    "Pressure regime": "Price is below prior highs and the available series return is negative.",
    "Volatile tape": "Realized return volatility is elevated on the available sample.",
    "Constructive trend": "Recent return signal-to-noise and price drift are positive.",
    "Positive drift": "The available series has positive price drift, but broader confirmation is limited.",
    "Negative drift": "The available series has negative price drift, but broader confirmation is limited.",
    "Mixed / neutral": "No single deterministic regime proxy dominates the available series."
  })[label] || "Deterministic regime proxy from returns, drawdown, and volatility.";
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function buildSummary({ ticker, labels, indicators, seriesReturn, pointCount }) {
  const direction = Number(seriesReturn) >= 0 ? "up" : "down";
  const pieces = [
    `${ticker || "Ticker"} is ${direction} across ${pointCount} available price points`,
    labels.trend.toLowerCase(),
    labels.rsi.toLowerCase()
  ];
  if (Number.isFinite(indicators.macd?.histogram)) pieces.push(labels.macd.toLowerCase());
  return `${pieces.join("; ")}. Context only, not a trading instruction.`;
}

export function buildTechnicalAnalysisSnapshot(points = [], options = {}) {
  const normalized = normalizeTechnicalPricePoints(points);
  const closes = normalized.map((point) => point.close);
  const pointCount = closes.length;
  const ticker = String(options.ticker || "").trim().toUpperCase();

  if (pointCount < 2) {
    return {
      ticker,
      status: "missing",
      pointCount,
      summary: "No usable historical price series is available yet.",
      indicators: {},
      labels: {},
      strengths: [],
      riskNotes: [],
      missingData: ["historical price series with at least two close values"]
    };
  }

  const trendWindow = effectiveWindow(DEFAULT_WINDOWS.sma, pointCount);
  const rsiWindow = effectiveWindow(DEFAULT_WINDOWS.rsi, pointCount - 1, 2);
  const bandWindow = effectiveWindow(DEFAULT_WINDOWS.bollinger, pointCount);
  const zWindow = effectiveWindow(DEFAULT_WINDOWS.zScore, pointCount);
  const sharpeWindow = effectiveWindow(DEFAULT_WINDOWS.sharpe, pointCount - 1, 2);
  const atrWindow = effectiveWindow(DEFAULT_WINDOWS.atr, pointCount, 2);

  const smaSeries = simpleMovingAverage(closes, trendWindow);
  const emaSeries = exponentialMovingAverage(closes, trendWindow);
  const rsiSeries = relativeStrengthIndex(closes, rsiWindow);
  const bandSeries = bollingerBands(closes, bandWindow);
  const macdSeries = macd(closes);
  const zScoreSeries = rollingZScore(closes, zWindow);
  const drawdownSeries = drawdown(closes);
  const returns = logReturns(closes).filter((value) => value !== null);
  const sharpeSeries = rollingSharpe(closes, sharpeWindow);
  const autocorr = autocorrelation(returns, Math.min(DEFAULT_WINDOWS.autocorrelationMaxLag, Math.max(1, returns.length - 2)));
  const atrSeries = averageTrueRangeSeries(normalized, atrWindow);
  const obvSeries = onBalanceVolume(normalized);
  const distribution = returnsDistribution(closes);
  const spectral = powerSpectralDensity(closes);
  const stft = stftSpectrogram(closes);

  const latestClose = closes[pointCount - 1];
  const firstClose = closes[0];
  const latestSma = lastFinite(smaSeries);
  const latestEma = lastFinite(emaSeries);
  const latestRsi = lastFinite(rsiSeries);
  const latestBand = bandSeries[bandSeries.length - 1] || {};
  const latestMacd = macdSeries[macdSeries.length - 1] || {};
  const latestZScore = lastFinite(zScoreSeries);
  const latestDrawdown = lastFinite(drawdownSeries);
  const maxDrawdown = Math.min(...drawdownSeries.filter(Number.isFinite));
  const latestSharpe = lastFinite(sharpeSeries);
  const latestAtr = lastFinite(atrSeries);
  const latestObv = lastFinite(obvSeries);
  const seriesReturn = firstClose ? latestClose / firstClose - 1 : 0;

  const hasHighLow = normalized.every((point) => Number.isFinite(point.high) && Number.isFinite(point.low));
  const hasVolume = normalized.every((point) => Number.isFinite(point.volume));
  const missingData = [];
  if (pointCount < DEFAULT_WINDOWS.sma) {
    missingData.push(`Only ${pointCount} historical price points available; using short-window context instead of a full 20-day trend.`);
  }
  if (!hasHighLow) missingData.push("High/low history is unavailable, so ATR volatility context is missing.");
  if (!hasVolume) missingData.push("Volume history is unavailable, so OBV/volume confirmation is missing.");
  if (pointCount < 8) missingData.push("At least 8 points are needed for Welch PSD and STFT spectral diagnostics.");
  if (pointCount < 50) missingData.push("HMM-style regime detection is not enabled; this panel uses a deterministic regime proxy instead.");

  const indicators = {
    sma: latestSma,
    ema: latestEma,
    rsi: latestRsi,
    bollinger: latestBand,
    macd: latestMacd,
    zScore: latestZScore,
    atr: latestAtr,
    obv: latestObv,
    rollingSharpe: latestSharpe,
    autocorrelationLag1: autocorr[0]?.value ?? null
  };
  const regimeLabel = regimeProxyLabel({ seriesReturn, latestDrawdown, latestSharpe, distribution });
  const labels = {
    trend: trendLabel(latestClose, latestSma, latestEma),
    rsi: rsiLabel(latestRsi),
    macd: macdLabel(latestMacd.histogram),
    bollinger: bollingerLabel(latestBand.percentB),
    drawdown: drawdownLabel(latestDrawdown),
    returnsDistribution: distribution.label,
    spectral: spectral.label,
    timeFrequency: stft.label,
    regimeProxy: regimeLabel
  };
  const strengths = [
    labels.trend === "Above trend" ? "Latest price is above the short-window moving average context." : "",
    labels.macd === "Momentum positive" ? "MACD histogram is positive on the available series." : "",
    labels.rsi === "Constructive" ? "RSI is constructive without being extended." : ""
  ].filter(Boolean);
  const riskNotes = [
    labels.rsi === "Extended" ? "RSI is extended; review whether the move is crowded or overbought." : "",
    labels.bollinger === "Above upper band" ? "Price is above the upper Bollinger band; near-term extension risk is elevated." : "",
    Math.abs(maxDrawdown) >= 0.15 ? "Available history includes a meaningful drawdown." : "",
    distributionRiskNote(distribution),
    spectralRiskNote(spectral),
    pointCount < DEFAULT_WINDOWS.sma ? "Technical confidence is limited by short history." : ""
  ].filter(Boolean);

  return {
    ticker,
    status: "available",
    pointCount,
    firstDate: normalized[0]?.date || "",
    lastDate: normalized[normalized.length - 1]?.date || "",
    firstClose,
    latestClose,
    seriesReturn,
    latestDrawdown,
    maxDrawdown,
    windows: {
      trendWindow,
      rsiWindow,
      bandWindow,
      zWindow,
      sharpeWindow,
      atrWindow
    },
    indicators,
    returnsDistribution: distribution,
    spectral,
    stft: {
      times: stft.times,
      freqs: stft.freqs,
      frameCount: stft.powerDb.length,
      powerShift: stft.powerShift,
      label: stft.label
    },
    regimeProxy: {
      label: regimeLabel,
      detail: regimeProxyDetail(regimeLabel)
    },
    labels,
    strengths,
    riskNotes,
    missingData,
    summary: buildSummary({ ticker, labels, indicators, seriesReturn, pointCount }),
    sourceLabel: options.sourceLabel || "Local market data history",
    modelLabel: "Technical Signal Context",
    caveat: "Indicators describe recent price-series structure. They do not predict returns or place trades."
  };
}

function kolmogorovSmirnovNormalStatistic(values = [], avg = 0, sigma = 1) {
  const clean = cleanValues(values).sort((a, b) => a - b);
  if (!clean.length || !sigma) return null;
  let maxDistance = 0;
  clean.forEach((value, index) => {
    const cdf = normalCdf((value - avg) / sigma);
    const empiricalRight = (index + 1) / clean.length;
    const empiricalLeft = index / clean.length;
    maxDistance = Math.max(maxDistance, Math.abs(empiricalRight - cdf), Math.abs(cdf - empiricalLeft));
  });
  return maxDistance;
}

function normalCdf(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const abs = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * abs);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-abs * abs);
  return sign * y;
}

function hannWindow(length) {
  if (length <= 1) return [1];
  return Array.from({ length }, (_, index) => 0.5 * (1 - Math.cos((2 * Math.PI * index) / (length - 1))));
}

function oneSidedPower(segment = [], window = hannWindow(segment.length), windowPower = 1) {
  const count = segment.length;
  const bins = Math.floor(count / 2) + 1;
  return Array.from({ length: bins }, (_, frequencyIndex) => {
    let real = 0;
    let imag = 0;
    for (let sample = 0; sample < count; sample += 1) {
      const angle = (-2 * Math.PI * frequencyIndex * sample) / count;
      const weighted = segment[sample] * window[sample];
      real += weighted * Math.cos(angle);
      imag += weighted * Math.sin(angle);
    }
    return (real * real + imag * imag) / (count * windowPower || 1);
  });
}

function findSpectralPeaks(freqs = [], power = [], limit = DEFAULT_WINDOWS.topFrequencyPeaks) {
  const peaks = [];
  for (let index = 1; index < power.length - 1; index += 1) {
    if (freqs[index] === 0) continue;
    if (power[index] >= power[index - 1] && power[index] >= power[index + 1]) {
      peaks.push({ frequency: freqs[index], power: power[index] });
    }
  }
  if (!peaks.length && power.length > 1) {
    let maxIndex = 1;
    for (let index = 2; index < power.length; index += 1) {
      if (power[index] > power[maxIndex]) maxIndex = index;
    }
    peaks.push({ frequency: freqs[maxIndex], power: power[maxIndex] });
  }
  return peaks.sort((a, b) => b.power - a.power).slice(0, limit);
}
