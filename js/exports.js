// ── EXPORTS ──────────────────────────────────────────────────

function buildExportLabel(indicator) {
  const destinationName = indicator?.destination?.name || indicator?.destination_name || '';
  return destinationName ? `${destinationName} · ${indicator.name}` : indicator.name;
}

function buildExportFilename(indicator, ext) {
  const parts = [];
  if (indicator?.destination?.name) parts.push(indicator.destination.name);
  if (indicator?.name) parts.push(indicator.name);
  const base = parts.join('_').replace(/\s+/g, '_').replace(/[^\w\-áéíóúÁÉÍÓÚñÑ]/g, '');
  return `${base || 'indicador'}_${new Date().toISOString().slice(0,10)}.${ext}`;
}

async function exportToExcel(indicator, dataByYear, yearlyStats) {
  const wb = XLSX.utils.book_new();

  const years = Object.keys(dataByYear).map(Number).sort((a, b) => a - b);
  const destinationName = indicator?.destination?.name || '';
  const annualMeta = getAnnualCalcMeta(getIndicatorCalcMode(indicator));

  const header = ['Mes', ...years.map(String)];
  const rows = [];
  if (destinationName) rows.push(['Destino', destinationName]);
  rows.push(['Indicador', indicator.name]);
  rows.push(['Unidad', indicator.unit || '']);
  rows.push(['Cálculo anual', annualMeta.label]);
  if (getMethodologyNote(indicator)) rows.push(['Aclaración metodológica', getMethodologyNote(indicator)]);
  rows.push([]);
  rows.push(header);

  MONTHS.forEach((m, mi) => {
    rows.push([m, ...years.map(yr => dataByYear[yr][mi] ?? '')]);
  });
  rows.push([annualMeta.shortLabel, ...years.map(yr => yearlyStats[yr]?.annualValue ?? '')]);
  const ws1 = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws1, 'Datos');

  const statsHeader = ['Año', annualMeta.shortLabel, 'Promedio', 'Mediana', 'Mínimo', 'Máximo', 'Desvío Std', 'Var. interanual'];
  const statsRows = [statsHeader];
  years.forEach(yr => {
    const s = yearlyStats[yr];
    if (!s) return;
    statsRows.push([
      yr,
      s.annualValue ?? '',
      s.mean?.toFixed(2) ?? '',
      s.median?.toFixed(2) ?? '',
      s.min ?? '',
      s.max ?? '',
      s.stdDev?.toFixed(2) ?? '',
      s.yoyAnnual?.toFixed(1) ?? '',
    ]);
  });
  const ws2 = XLSX.utils.aoa_to_sheet(statsRows);
  XLSX.utils.book_append_sheet(wb, ws2, 'Estadísticas');

  XLSX.writeFile(wb, buildExportFilename(indicator, 'xlsx'));
}

async function exportToPDF(indicator, dataByYear, yearlyStats) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  const years = Object.keys(dataByYear).map(Number).sort((a, b) => a - b);
  const now = new Date().toLocaleDateString('es-AR');
  const destinationName = indicator?.destination?.name || '';
  const annualMeta = getAnnualCalcMeta(getIndicatorCalcMode(indicator));

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 297, 210, 'F');

  doc.setTextColor(59, 130, 246);
  doc.setFontSize(9);
  doc.text(destinationName ? 'DASHBOARD DE TURISMO · DESTINO' : 'DASHBOARD DE TURISMO', 14, 20);

  doc.setTextColor(148, 163, 184);
  doc.setFontSize(11);
  if (destinationName) doc.text(destinationName, 14, 29);

  doc.setTextColor(226, 232, 240);
  doc.setFontSize(22);
  doc.text(indicator.name, 14, destinationName ? 40 : 34);

  if (indicator.description) {
    doc.setFontSize(11);
    doc.setTextColor(148, 163, 184);
    doc.text(indicator.description, 14, destinationName ? 49 : 43);
  }

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  const metaY = destinationName ? 58 : 52;
  doc.text(`Generado: ${now}  ·  Unidad: ${indicator.unit || 'N/A'}  ·  Cálculo anual: ${annualMeta.label}`, 14, metaY);

  const methodologyNote = getMethodologyNote(indicator);
  if (methodologyNote) {
    doc.setFontSize(9);
    doc.setTextColor(249, 115, 22);
    const noteLines = doc.splitTextToSize(`Aclaración metodológica: ${methodologyNote}`, 269);
    doc.text(noteLines, 14, metaY + 8);
  }

  const allVals = Object.values(dataByYear).flat().filter(v => v !== null && !isNaN(v));
  const globalStats = calcStats(allVals);
  const lastYear = years[years.length - 1];
  const lastAnnual = lastYear ? yearlyStats?.[lastYear]?.annualValue : null;
  const kpis = [
    { label: annualMeta.shortLabel, value: formatNumber(lastAnnual) },
    { label: 'Máximo histórico', value: formatNumber(globalStats?.max) },
    { label: 'Mínimo histórico', value: formatNumber(globalStats?.min) },
    { label: 'Años cargados', value: String(years.length) },
  ];
  const kpiY = methodologyNote ? (destinationName ? 78 : 72) : (destinationName ? 66 : 60);
  kpis.forEach((kpi, i) => {
    const x = 14 + i * 68;
    doc.setFillColor(30, 41, 59);
    doc.roundedRect(x, kpiY, 62, 20, 3, 3, 'F');
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    doc.text(kpi.label, x + 5, kpiY + 8);
    doc.setTextColor(226, 232, 240);
    doc.setFontSize(13);
    doc.text(kpi.value, x + 5, kpiY + 16);
  });

  const lineCanvas = document.getElementById('lineChart');
  const barCanvas = document.getElementById('barChart');

  if (lineCanvas) {
    const lineImg = lineCanvas.toDataURL('image/png', 1.0);
    doc.addPage();
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 297, 210, 'F');
    doc.setTextColor(226, 232, 240);
    doc.setFontSize(13);
    doc.text(`Evolución mensual por año · ${buildExportLabel(indicator)}`, 14, 15);
    doc.addImage(lineImg, 'PNG', 14, 20, 269, 160);
  }

  if (barCanvas && indicator?.annual_chart_visible !== false) {
    const barImg = barCanvas.toDataURL('image/png', 1.0);
    doc.addPage();
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 297, 210, 'F');
    doc.setTextColor(226, 232, 240);
    doc.setFontSize(13);
    doc.text(`${annualMeta.shortLabel} por año · ${buildExportLabel(indicator)}`, 14, 15);
    doc.addImage(barImg, 'PNG', 14, 20, 269, 160);
  }

  doc.addPage();
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 297, 210, 'F');
  doc.setTextColor(226, 232, 240);
  doc.setFontSize(13);
  doc.text(`Estadísticas por año · ${buildExportLabel(indicator)}`, 14, 15);

  const tableHead = [['Año', annualMeta.shortLabel, 'Promedio', 'Mediana', 'Mínimo', 'Máximo', 'Desvío Std', 'Var. interanual']];
  const tableBody = years.map(yr => {
    const s = yearlyStats[yr];
    return [
      String(yr),
      formatNumber(s?.annualValue),
      formatNumber(s?.mean),
      formatNumber(s?.median),
      formatNumber(s?.min),
      formatNumber(s?.max),
      formatNumber(s?.stdDev),
      s?.yoyAnnual !== undefined ? formatPct(s.yoyAnnual) : '-',
    ];
  });

  doc.autoTable({
    head: tableHead,
    body: tableBody,
    startY: 22,
    theme: 'grid',
    styles: {
      fillColor: [30, 41, 59],
      textColor: [226, 232, 240],
      fontSize: 9,
      cellPadding: 3,
    },
    headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [15, 23, 42] },
  });

  doc.save(buildExportFilename(indicator, 'pdf'));
}
