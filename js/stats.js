// ── STATISTICS + CÁLCULO ANUAL CONFIGURABLE ─────────────────
const ANNUAL_CALC_OPTIONS = {
  sum: {
    label: 'Suma anual',
    shortLabel: 'Total anual',
    description: 'Suma los 12 meses. Útil para volúmenes del período.',
  },
  average: {
    label: 'Promedio anual',
    shortLabel: 'Promedio anual',
    description: 'Promedio simple de los meses cargados.',
  },
  last_value: {
    label: 'Último valor del año',
    shortLabel: 'Último valor',
    description: 'Toma el último mes con dato. Útil para stocks puntuales.',
  },
  max: {
    label: 'Máximo anual',
    shortLabel: 'Máximo anual',
    description: 'Toma el mayor valor mensual del año.',
  },
  min: {
    label: 'Mínimo anual',
    shortLabel: 'Mínimo anual',
    description: 'Toma el menor valor mensual del año.',
  },
  ratio_of_sums: {
    label: 'Recalcular por numerador / denominador',
    shortLabel: 'Valor anual recalculado',
    description: 'Usa Σ numerador / Σ denominador × multiplicador.',
  },
  none: {
    label: 'Ocultar valor anual',
    shortLabel: 'Valor anual oculto',
    description: 'No calcula valor anual para tabla comparativa ni gráfico.',
  },
};

function getAnnualCalcMeta(mode) {
  return ANNUAL_CALC_OPTIONS[mode] || ANNUAL_CALC_OPTIONS.sum;
}

function getMetricKey(indicator) {
  if (!indicator) return '';
  return String(indicator.metric_key || slugify(indicator.name || '')).trim();
}

function getIndicatorCalcMode(indicator) {
  return indicator?.annual_calc_mode || 'sum';
}

function calcStats(values) {
  const clean = values.filter(v => v !== null && v !== undefined && !isNaN(v)).map(Number);
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

function getLastNonNull(values) {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    if (v !== null && v !== undefined && !isNaN(v)) return Number(v);
  }
  return null;
}

function sumClean(values) {
  return values
    .filter(v => v !== null && v !== undefined && !isNaN(v))
    .reduce((acc, value) => acc + Number(value), 0);
}

function calculateAnnualValue(indicator, baseStats, year, relatedSeriesMap = {}) {
  const mode = getIndicatorCalcMode(indicator);
  const values = indicator?.dataByYear?.[year] || baseStats?.values || [];

  if (mode === 'none') return null;
  if (!baseStats && mode !== 'ratio_of_sums') return null;

  switch (mode) {
    case 'sum':
      return baseStats?.sum ?? null;
    case 'average':
      return baseStats?.mean ?? null;
    case 'last_value':
      return getLastNonNull(values);
    case 'max':
      return baseStats?.max ?? null;
    case 'min':
      return baseStats?.min ?? null;
    case 'ratio_of_sums': {
      const numeratorKey = String(indicator?.formula_numerator_key || '').trim();
      const denominatorKey = String(indicator?.formula_denominator_key || '').trim();
      const multiplier = indicator?.formula_multiplier === null || indicator?.formula_multiplier === undefined || indicator?.formula_multiplier === ''
        ? 1
        : Number(indicator.formula_multiplier);

      if (!numeratorKey || !denominatorKey) return null;
      const numeratorValues = relatedSeriesMap[numeratorKey]?.[year] || [];
      const denominatorValues = relatedSeriesMap[denominatorKey]?.[year] || [];
      const numerator = sumClean(numeratorValues);
      const denominator = sumClean(denominatorValues);
      if (!denominator) return null;
      return (numerator / denominator) * multiplier;
    }
    default:
      return baseStats?.sum ?? null;
  }
}

function calcYearlyStats(dataByYear, options = {}) {
  const years = Object.keys(dataByYear).map(Number).sort((a, b) => a - b);
  const result = {};
  const indicator = options.indicator || null;
  const relatedSeriesMap = options.relatedSeriesMap || {};
  const annualMeta = getAnnualCalcMeta(getIndicatorCalcMode(indicator));

  years.forEach(yr => {
    const vals = dataByYear[yr] || [];
    const stats = calcStats(vals);
    result[yr] = stats ? { ...stats } : { count: 0, values: vals };
    result[yr].year = yr;
    result[yr].values = vals;
    result[yr].annualValue = calculateAnnualValue(
      { ...indicator, dataByYear },
      stats,
      yr,
      relatedSeriesMap,
    );
    result[yr].annualLabel = annualMeta.shortLabel;
  });

  for (let i = 1; i < years.length; i++) {
    const curr = result[years[i]];
    const prev = result[years[i - 1]];
    const currAnnual = curr?.annualValue;
    const prevAnnual = prev?.annualValue;
    if (curr && prev && prevAnnual !== null && prevAnnual !== undefined && !isNaN(prevAnnual) && Number(prevAnnual) !== 0) {
      curr.yoyAnnual = ((Number(currAnnual) - Number(prevAnnual)) / Math.abs(Number(prevAnnual))) * 100;
    }
    if (curr && prev && prev.sum !== 0) {
      curr.yoySum = ((curr.sum - prev.sum) / Math.abs(prev.sum)) * 100;
      curr.yoyMean = ((curr.mean - prev.mean) / Math.abs(prev.mean)) * 100;
    }
  }

  result.__meta = {
    annualCalcMode: getIndicatorCalcMode(indicator),
    annualLabel: annualMeta.shortLabel,
    annualDescription: annualMeta.description,
  };

  return result;
}

function buildDataByYear(dataPoints) {
  const byYear = {};
  (dataPoints || []).forEach(dp => {
    if (!byYear[dp.year]) byYear[dp.year] = new Array(12).fill(null);
    byYear[dp.year][dp.month - 1] = dp.value !== null ? Number(dp.value) : null;
  });
  return byYear;
}

function buildDataPointMetaByYear(dataPoints) {
  const byYear = {};
  (dataPoints || []).forEach(dp => {
    if (!byYear[dp.year]) byYear[dp.year] = new Array(12).fill(null);
    const isProvisional = dp?.is_provisional === true;
    const observation = String(dp?.observation || '').trim();
    byYear[dp.year][dp.month - 1] = (isProvisional || observation) ? { isProvisional, observation } : null;
  });
  return byYear;
}

function hasDataPointAnnotation(meta) {
  return Boolean(meta && (meta.isProvisional || String(meta.observation || '').trim()));
}

function getDataPointAnnotationText(meta) {
  if (!meta) return '';
  const parts = [];
  if (meta.isProvisional) parts.push('Dato provisorio');
  const observation = String(meta.observation || '').trim();
  if (observation) parts.push(observation);
  return parts.join(' · ');
}

function buildDataByIndicator(points) {
  const map = {};
  (points || []).forEach(dp => {
    if (!map[dp.indicator_id]) map[dp.indicator_id] = [];
    map[dp.indicator_id].push(dp);
  });
  return map;
}

function buildRelatedSeriesMapForDestination(indicator, destinationIndicators, dataByIndicator) {
  const map = {};
  (destinationIndicators || []).forEach(destIndicator => {
    const metricKey = getMetricKey(destIndicator);
    if (!metricKey) return;
    map[metricKey] = buildDataByYear(dataByIndicator[destIndicator.id] || []);
  });
  return map;
}

function buildAnnualSeries(yearlyStats) {
  const years = Object.keys(yearlyStats)
    .filter(key => key !== '__meta')
    .map(Number)
    .sort((a, b) => a - b);
  return {
    years,
    values: years.map(year => yearlyStats?.[year]?.annualValue ?? null),
  };
}

function formatNumber(n, decimals = 2) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (Math.abs(n) >= 1_000) return n.toLocaleString('es-AR', { maximumFractionDigits: decimals });
  return n.toLocaleString('es-AR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatPct(n) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  return (n >= 0 ? '+' : '') + Number(n).toFixed(1) + '%';
}
