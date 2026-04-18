// ── EXPORTS ──────────────────────────────────────────────────

async function exportToExcel(indicator, dataByYear, yearlyStats) {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Data ──
  const years = Object.keys(dataByYear).map(Number).sort();
  const header = ['Mes', ...years.map(String)];
  const rows = [header];
  MONTHS.forEach((m, mi) => {
    rows.push([m, ...years.map(yr => dataByYear[yr][mi] ?? '')]);
  });
  // Totals row
  rows.push(['Total anual', ...years.map(yr => yearlyStats[yr]?.sum ?? '')]);
  const ws1 = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws1, 'Datos');

  // ── Sheet 2: Stats ──
  const statsHeader = ['Año', 'Suma', 'Promedio', 'Mediana', 'Mínimo', 'Máximo', 'Desvío Std', 'Var. interanual suma %'];
  const statsRows = [statsHeader];
  years.forEach(yr => {
    const s = yearlyStats[yr];
    if (!s) return;
    statsRows.push([
      yr,
      s.sum ?? '',
      s.mean?.toFixed(2) ?? '',
      s.median?.toFixed(2) ?? '',
      s.min ?? '',
      s.max ?? '',
      s.stdDev?.toFixed(2) ?? '',
      s.yoySum?.toFixed(1) ?? '',
    ]);
  });
  const ws2 = XLSX.utils.aoa_to_sheet(statsRows);
  XLSX.utils.book_append_sheet(wb, ws2, 'Estadísticas');

  const fileName = `${indicator.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

async function exportToPDF(indicator, dataByYear, yearlyStats) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  const years = Object.keys(dataByYear).map(Number).sort();
  const now = new Date().toLocaleDateString('es-AR');

  // ── Cover ──
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 297, 210, 'F');

  doc.setTextColor(59, 130, 246);
  doc.setFontSize(9);
  doc.text('DASHBOARD DE TURISMO', 14, 20);

  doc.setTextColor(226, 232, 240);
  doc.setFontSize(22);
  doc.text(indicator.name, 14, 34);

  if (indicator.description) {
    doc.setFontSize(11);
    doc.setTextColor(148, 163, 184);
    doc.text(indicator.description, 14, 43);
  }

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generado: ${now}  ·  Unidad: ${indicator.unit || 'N/A'}`, 14, 52);

  // ── KPI boxes ──
  const allVals = Object.values(dataByYear).flat().filter(v => v !== null && !isNaN(v));
  const globalStats = calcStats(allVals);
  const kpis = [
    { label: 'Promedio global', value: formatNumber(globalStats?.mean) },
    { label: 'Máximo histórico', value: formatNumber(globalStats?.max) },
    { label: 'Mínimo histórico', value: formatNumber(globalStats?.min) },
    { label: 'Años cargados', value: String(years.length) },
  ];
  kpis.forEach((kpi, i) => {
    const x = 14 + i * 68;
    doc.setFillColor(30, 41, 59);
    doc.roundedRect(x, 60, 62, 20, 3, 3, 'F');
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    doc.text(kpi.label, x + 5, 68);
    doc.setTextColor(226, 232, 240);
    doc.setFontSize(13);
    doc.text(kpi.value, x + 5, 76);
  });

  // ── Charts ──
  const lineCanvas = document.getElementById('lineChart');
  const barCanvas = document.getElementById('barChart');

  if (lineCanvas) {
    const lineImg = lineCanvas.toDataURL('image/png', 1.0);
    doc.addPage();
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 297, 210, 'F');
    doc.setTextColor(226, 232, 240);
    doc.setFontSize(13);
    doc.text('Evolución mensual por año', 14, 15);
    doc.addImage(lineImg, 'PNG', 14, 20, 269, 160);
  }

  if (barCanvas) {
    const barImg = barCanvas.toDataURL('image/png', 1.0);
    doc.addPage();
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 297, 210, 'F');
    doc.setTextColor(226, 232, 240);
    doc.setFontSize(13);
    doc.text('Totales anuales', 14, 15);
    doc.addImage(barImg, 'PNG', 14, 20, 269, 160);
  }

  // ── Stats table ──
  doc.addPage();
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 297, 210, 'F');
  doc.setTextColor(226, 232, 240);
  doc.setFontSize(13);
  doc.text('Estadísticas por año', 14, 15);

  const tableHead = [['Año', 'Total', 'Promedio', 'Mediana', 'Mínimo', 'Máximo', 'Desvío Std', 'Var. interanual']];
  const tableBody = years.map(yr => {
    const s = yearlyStats[yr];
    return [
      String(yr),
      formatNumber(s?.sum),
      formatNumber(s?.mean),
      formatNumber(s?.median),
      formatNumber(s?.min),
      formatNumber(s?.max),
      formatNumber(s?.stdDev),
      s?.yoySum !== undefined ? formatPct(s.yoySum) : '-',
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

  const fileName = `${indicator.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.pdf`;
  doc.save(fileName);
}
