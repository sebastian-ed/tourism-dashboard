// ── CHARTS ───────────────────────────────────────────────────
let lineChartInstance = null;
let barChartInstance = null;

const CHART_DEFAULTS = {
  font: { family: "'DM Sans', sans-serif" },
  animation: { duration: 600, easing: 'easeInOutQuart' },
};

function destroyCharts() {
  if (lineChartInstance) { lineChartInstance.destroy(); lineChartInstance = null; }
  if (barChartInstance) { barChartInstance.destroy(); barChartInstance = null; }
}

function buildLineDatasets(dataByYear, years) {
  return years.map((yr, i) => {
    const color = YEAR_COLORS[i % YEAR_COLORS.length];
    return {
      label: String(yr),
      data: dataByYear[yr],
      borderColor: color,
      backgroundColor: color + '22',
      borderWidth: 2.5,
      pointRadius: 4,
      pointHoverRadius: 7,
      tension: 0.35,
      fill: false,
    };
  });
}

function renderLineChart(canvasId, dataByYear, indicator) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  if (lineChartInstance) lineChartInstance.destroy();

  const years = Object.keys(dataByYear).map(Number).sort();
  const datasets = buildLineDatasets(dataByYear, years);

  lineChartInstance = new Chart(ctx, {
    type: 'line',
    data: { labels: MONTHS, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
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
            label: (ctx) => ` ${ctx.dataset.label}: ${formatNumber(ctx.parsed.y)} ${indicator.unit || ''}`,
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

  const years = Object.keys(yearlyStats).map(Number).sort();

  barChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: years.map(String),
      datasets: [{
        label: 'Total anual',
        data: years.map(yr => yearlyStats[yr]?.sum ?? null),
        backgroundColor: years.map((_, i) => YEAR_COLORS[i % YEAR_COLORS.length] + 'cc'),
        borderColor: years.map((_, i) => YEAR_COLORS[i % YEAR_COLORS.length]),
        borderWidth: 1.5,
        borderRadius: 6,
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
            label: (ctx) => ` Total: ${formatNumber(ctx.parsed.y)} ${indicator.unit || ''}`,
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
