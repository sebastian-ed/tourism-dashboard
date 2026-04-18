// ── STATISTICS ───────────────────────────────────────────────

function calcStats(values) {
  const clean = values.filter(v => v !== null && v !== undefined && !isNaN(v));
  if (clean.length === 0) return null;

  const sorted = [...clean].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = clean.reduce((a, b) => a + b, 0);
  const mean = sum / n;

  let median;
  if (n % 2 === 0) {
    median = (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  } else {
    median = sorted[Math.floor(n / 2)];
  }

  const variance = clean.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);

  return {
    count: n,
    sum,
    mean,
    median,
    min: sorted[0],
    max: sorted[n - 1],
    range: sorted[n - 1] - sorted[0],
    stdDev,
  };
}

function calcYearlyStats(dataByYear) {
  const years = Object.keys(dataByYear).map(Number).sort();
  const result = {};

  years.forEach(yr => {
    const vals = dataByYear[yr];
    result[yr] = calcStats(vals);
    if (result[yr]) {
      result[yr].year = yr;
      result[yr].values = vals;
    }
  });

  for (let i = 1; i < years.length; i++) {
    const curr = result[years[i]];
    const prev = result[years[i - 1]];
    if (curr && prev && prev.sum !== 0) {
      curr.yoySum = ((curr.sum - prev.sum) / Math.abs(prev.sum)) * 100;
      curr.yoyMean = ((curr.mean - prev.mean) / Math.abs(prev.mean)) * 100;
    }
  }

  return result;
}

function buildDataByYear(dataPoints) {
  const byYear = {};
  dataPoints.forEach(dp => {
    if (!byYear[dp.year]) byYear[dp.year] = new Array(12).fill(null);
    byYear[dp.year][dp.month - 1] = dp.value !== null ? Number(dp.value) : null;
  });
  return byYear;
}

function formatNumber(n, decimals = 2) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (Math.abs(n) >= 1_000) return n.toLocaleString('es-AR', { maximumFractionDigits: decimals });
  return n.toLocaleString('es-AR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatPct(n) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  return (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
}
