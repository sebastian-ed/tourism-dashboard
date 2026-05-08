// ── CHARTS ───────────────────────────────────────────────────
let lineChartInstance = null;
let barChartInstance = null;
let comparisonChartInstance = null;

const CHART_DEFAULTS = {
  font: { family: "'DM Sans', sans-serif" },
  animation: { duration: 600, easing: 'easeInOutQuart' },
};

function destroyCharts() {
  if (lineChartInstance) { lineChartInstance.destroy(); lineChartInstance = null; }
  if (barChartInstance) { barChartInstance.destroy(); barChartInstance = null; }
}

function destroyComparisonChart() {
  if (comparisonChartInstance) { comparisonChartInstance.destroy(); comparisonChartInstance = null; }
}

function getChartWrap(canvas) {
  return canvas?.closest?.('.chart-wrap') || null;
}

function updateChartDensity(canvas, seriesCount) {
  const wrap = getChartWrap(canvas);
  if (!wrap) return;
  wrap.classList.toggle('has-many-series', seriesCount > 10);
  wrap.classList.toggle('has-dense-series', seriesCount > 16);
}

function buildLineDatasets(dataByYear, years) {
  const isDense = years.length > 12;
  return years.map((yr, i) => {
    const color = YEAR_COLORS[i % YEAR_COLORS.length];
    return {
      label: String(yr),
      data: dataByYear[yr],
      borderColor: color,
      backgroundColor: color + '22',
      borderWidth: isDense ? 2 : 2.5,
      pointRadius: isDense ? 3 : 4,
      pointHoverRadius: 7,
      pointHitRadius: 18,
      tension: 0.35,
      fill: false,
    };
  });
}

function renderLineChart(canvasId, dataByYear, indicator, dataMetaByYear = {}) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  if (lineChartInstance) lineChartInstance.destroy();

  const years = Object.keys(dataByYear).map(Number).sort((a, b) => a - b);
  const datasets = buildLineDatasets(dataByYear, years);
  const showLegend = years.length <= 10;
  updateChartDensity(ctx, years.length);

  lineChartInstance = new Chart(ctx, {
    type: 'line',
    data: { labels: MONTHS, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false, axis: 'xy' },
      plugins: {
        legend: {
          display: showLegend,
          position: 'top',
          labels: {
            color: '#94a3b8',
            font: { family: "'DM Sans', sans-serif", size: 12 },
            usePointStyle: true,
            pointStyleWidth: 12,
          }
        },
        tooltip: {
          backgroundColor: '#0f172a',
          borderColor: '#334155',
          borderWidth: 1,
          titleColor: '#e2e8f0',
          bodyColor: '#cbd5e1',
          displayColors: true,
          usePointStyle: true,
          padding: 12,
          caretPadding: 8,
          titleMarginBottom: 8,
          bodySpacing: 6,
          boxPadding: 4,
          titleFont: { family: "'DM Sans', sans-serif", size: 12, weight: '700' },
          bodyFont: { family: "'DM Sans', sans-serif", size: 12, weight: '500' },
          callbacks: {
            title: (items) => {
              const item = items?.[0];
              if (!item) return '';
              return `${MONTHS[item.dataIndex]} · ${item.dataset.label}`;
            },
            label: (ctx) => `${formatNumber(ctx.parsed.y)} ${indicator.unit || ''}`,
            afterLabel: (ctx) => {
              const year = Number(ctx.dataset.label);
              const meta = dataMetaByYear?.[year]?.[ctx.dataIndex] || null;
              const annotation = getDataPointAnnotationText(meta);
              return annotation ? `* ${annotation}` : '';
            },
          }
        },
      },
      scales: {
        x: {
          grid: { color: '#1e293b' },
          ticks: { color: '#64748b', font: { family: "'DM Sans', sans-serif", size: 11 } },
        },
        y: {
          grid: { color: '#1e293b' },
          ticks: {
            color: '#64748b',
            font: { family: "'DM Sans', sans-serif", size: 11 },
            callback: (v) => formatNumber(v, 0),
          },
        }
      }
    }
  });
  return lineChartInstance;
}

function renderBarChart(canvasId, yearlyStats, indicator) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  if (barChartInstance) barChartInstance.destroy();

  const annualMeta = getAnnualCalcMeta(getIndicatorCalcMode(indicator));
  const years = Object.keys(yearlyStats)
    .filter(key => key !== '__meta')
    .map(Number)
    .sort((a, b) => a - b);
  updateChartDensity(ctx, years.length);

  barChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: years.map(String),
      datasets: [{
        label: annualMeta.shortLabel,
        data: years.map(yr => yearlyStats[yr]?.annualValue ?? null),
        backgroundColor: years.map((_, i) => YEAR_COLORS[i % YEAR_COLORS.length] + 'cc'),
        borderColor: years.map((_, i) => YEAR_COLORS[i % YEAR_COLORS.length]),
        borderWidth: 1.5,
        borderRadius: 6,
        maxBarThickness: 28,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f172a',
          borderColor: '#334155',
          borderWidth: 1,
          titleColor: '#e2e8f0',
          bodyColor: '#94a3b8',
          callbacks: {
            label: (ctx) => ` ${annualMeta.shortLabel}: ${formatNumber(ctx.parsed.y)} ${indicator.unit || ''}`,
          }
        }
      },
      scales: {
        x: { grid: { color: '#1e293b' }, ticks: { color: '#64748b' } },
        y: {
          grid: { color: '#1e293b' },
          ticks: { color: '#64748b', callback: (v) => formatNumber(v, 0) },
        }
      }
    }
  });
  return barChartInstance;
}

function renderComparisonChart(canvasId, comparisonPayload) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  if (comparisonChartInstance) comparisonChartInstance.destroy();

  const years = comparisonPayload.years || [];
  const seriesCount = (comparisonPayload.series || []).length;
  updateChartDensity(ctx, seriesCount);
  const datasets = (comparisonPayload.series || []).map((serie, index) => {
    const color = YEAR_COLORS[index % YEAR_COLORS.length];
    return {
      label: serie.label,
      data: serie.values,
      borderColor: color,
      backgroundColor: color + '22',
      borderWidth: 2.5,
      pointRadius: 4,
      pointHoverRadius: 7,
      tension: 0.28,
      fill: false,
      spanGaps: true,
    };
  });

  comparisonChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: years.map(String),
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false, axis: 'xy' },
      plugins: {
        legend: {
          display: seriesCount <= 10,
          position: 'top',
          labels: {
            color: '#94a3b8',
            font: { family: "'DM Sans', sans-serif", size: 12 },
            usePointStyle: true,
            pointStyleWidth: 12,
          }
        },
        tooltip: {
          backgroundColor: '#0f172a',
          borderColor: '#334155',
          borderWidth: 1,
          titleColor: '#e2e8f0',
          bodyColor: '#94a3b8',
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${formatNumber(ctx.parsed.y)} ${comparisonPayload.unit || ''}`,
            afterLabel: () => comparisonPayload.measureLabel ? ` Medida: ${comparisonPayload.measureLabel}` : '',
          }
        },
      },
      scales: {
        x: {
          grid: { color: '#1e293b' },
          ticks: { color: '#64748b', font: { family: "'DM Sans', sans-serif", size: 11 } },
        },
        y: {
          grid: { color: '#1e293b' },
          ticks: {
            color: '#64748b',
            font: { family: "'DM Sans', sans-serif", size: 11 },
            callback: (v) => formatNumber(v, 0),
          },
        }
      }
    }
  });

  return comparisonChartInstance;
}
