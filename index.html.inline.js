const UNASSIGNED_DESTINATION_ID = '__unassigned__';

let destinations = [];
let indicators = [];
let currentDestination = null;
let currentIndicator = null;
let currentDataByYear = {};
let currentDataMetaByYear = {};
let currentYearlyStats = {};
let currentRelatedSeriesMap = {};
let visibleYears = [];
let comparisonSelection = { metricKey: '', destinationIds: [] };
let currentComparisonTablePayload = null;
let comparisonTableSort = { year: '', direction: 'original', measure: 'annualValue' };
const groupCollapseState = { sidebar: {}, center: {} };
const overviewScrollState = {};

function getIndicatorSortOrder(indicator) {
  const value = Number(indicator?.sort_order);
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function compareIndicatorsForOrdering(a, b) {
  const orderDiff = getIndicatorSortOrder(a) - getIndicatorSortOrder(b);
  if (orderDiff !== 0) return orderDiff;
  return (a?.name || '').localeCompare(b?.name || '', 'es');
}

window.addEventListener('DOMContentLoaded', initApp);

async function initApp() {
  try {
    await Promise.all([loadDestinations(), loadIndicators()]);
    renderComparisonControls();
    const initialDestination = getRenderableDestinations()[0];
    if (initialDestination) {
      await selectDestination(initialDestination.id);
    } else {
      showEmptyState();
    }
  } catch (e) {
    document.getElementById('destinationList').innerHTML = '<p style="padding:16px;font-size:12px;color:var(--danger)">Error cargando destinos e indicadores</p>';
  }
}

async function loadDestinations() {
  destinations = await fetchDestinations();
}

async function loadIndicators() {
  indicators = await fetchIndicators();
  indicators.sort((a, b) => {
    const destA = (a.destination?.name || 'Sin destino').localeCompare(b.destination?.name || 'Sin destino', 'es');
    if (destA !== 0) return destA;
    return a.name.localeCompare(b.name, 'es');
  });
}

function getRenderableDestinations() {
  const list = [...destinations];
  if (indicators.some(ind => !ind.destination_id)) {
    list.push({ id: UNASSIGNED_DESTINATION_ID, name: 'Sin destino', pseudo: true });
  }
  return list;
}

function getIndicatorsForDestination(destinationId) {
  const scoped = destinationId === UNASSIGNED_DESTINATION_ID
    ? indicators.filter(ind => !ind.destination_id)
    : indicators.filter(ind => ind.destination_id === destinationId);

  return [...scoped].sort(compareIndicatorsForOrdering);
}

function getDestinationById(destinationId) {
  return getRenderableDestinations().find(dest => dest.id === destinationId) || null;
}

function getDestinationDisplayName(destination) {
  const name = String(destination?.name || '').replace(/\s+/g, ' ').trim();
  return name || 'Destino sin nombre';
}

function getIndicatorGroupTitle(indicator) {
  return (indicator?.group_title || '').trim() || 'Sin agrupar';
}


function applyPresenceToIndicators(indicatorIds, presence) {
  const idSet = new Set((indicatorIds || []).filter(Boolean));
  indicators.forEach(ind => {
    if (idSet.has(ind.id)) ind.has_data = presence.has(ind.id);
  });
  if (currentIndicator && idSet.has(currentIndicator.id)) {
    currentIndicator.has_data = presence.has(currentIndicator.id);
  }
}

function buildPresenceFromPoints(points) {
  return new Set((points || []).map(point => point.indicator_id).filter(Boolean));
}

function groupIndicatorsByTitle(items) {
  const orderedItems = [...items].sort(compareIndicatorsForOrdering);
  const groups = new Map();
  orderedItems.forEach(indicator => {
    const title = getIndicatorGroupTitle(indicator);
    if (!groups.has(title)) groups.set(title, []);
    groups.get(title).push(indicator);
  });

  return [...groups.entries()]
    .map(([title, indicators]) => ({
      title,
      indicators,
      sortRank: Math.min(...indicators.map(getIndicatorSortOrder)),
    }))
    .sort((a, b) => {
      if (a.sortRank !== b.sortRank) return a.sortRank - b.sortRank;
      if (a.title === 'Sin agrupar' && b.title !== 'Sin agrupar') return 1;
      if (b.title === 'Sin agrupar' && a.title !== 'Sin agrupar') return -1;
      return a.title.localeCompare(b.title, 'es');
    });
}

function getGroupStateKey(destinationId, groupTitle) {
  return `${destinationId || UNASSIGNED_DESTINATION_ID}::${groupTitle}`;
}

function isGroupCollapsed(scope, destinationId, groupTitle) {
  const key = getGroupStateKey(destinationId, groupTitle);
  return Boolean(groupCollapseState[scope]?.[key]);
}

function ensureIndicatorGroupExpanded(indicator, destinationId) {
  if (!indicator) return;
  const key = getGroupStateKey(destinationId, getIndicatorGroupTitle(indicator));
  groupCollapseState.sidebar[key] = false;
  groupCollapseState.center[key] = false;
}

function toggleGroupVisibility(scope, destinationId, encodedGroupTitle) {
  const groupTitle = decodeURIComponent(encodedGroupTitle);
  const key = getGroupStateKey(destinationId, groupTitle);
  if (!groupCollapseState[scope]) groupCollapseState[scope] = {};
  groupCollapseState[scope][key] = !groupCollapseState[scope][key];

  if (scope === 'sidebar') {
    renderSidebar();
  } else if (currentDestination) {
    showCurrentDestinationOverview();
  }
}

function renderGroupedSidebarIndicators(items, destinationId) {
  const groups = groupIndicatorsByTitle(items);
  return groups.map(group => {
    const collapsed = isGroupCollapsed('sidebar', destinationId, group.title);
    const encodedTitle = encodeURIComponent(group.title);
    return `
      <div class="indicator-tree-group ${collapsed ? 'is-collapsed' : ''}">
        <button type="button" class="indicator-tree-title group-toggle-btn" onclick="toggleGroupVisibility('sidebar', '${escapeJs(destinationId)}', '${encodedTitle}')">
          <span class="group-toggle-main">
            <span class="group-toggle-icon">▾</span>
            <span>${escapeHtml(group.title)}</span>
          </span>
          <span class="tree-count">${group.indicators.length}</span>
        </button>
        <div class="indicator-tree-items">
          ${group.indicators.map(ind => `
            <button class="indicator-item ${currentIndicator?.id === ind.id ? 'active' : ''}" onclick="selectIndicator('${ind.id}')">
              <span class="indicator-main">
                <span class="ind-name">${escapeHtml(ind.name)}</span>
                <span class="ind-unit">${escapeHtml(ind.unit || 'sin unidad')}</span>
              </span>
              ${ind.has_data ? '<span class="badge badge-green">datos</span>' : '<span class="badge badge-orange">vacío</span>'}
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
}

function renderGroupedOverviewCards(items, destinationId) {
  const groups = groupIndicatorsByTitle(items);
  return groups.map(group => {
    const collapsed = isGroupCollapsed('center', destinationId, group.title);
    const encodedTitle = encodeURIComponent(group.title);
    return `
      <section class="grouped-indicator-section ${collapsed ? 'is-collapsed' : ''}">
        <button type="button" class="grouped-indicator-section-header group-toggle-btn" onclick="toggleGroupVisibility('center', '${escapeJs(destinationId)}', '${encodedTitle}')">
          <div class="grouped-indicator-section-title">
            <span class="group-toggle-icon">▾</span>
            <h4>${escapeHtml(group.title)}</h4>
          </div>
          <span class="badge badge-blue">${group.indicators.length} indicador${group.indicators.length !== 1 ? 'es' : ''}</span>
        </button>
        <div class="grouped-indicator-section-body">
          <div class="destination-cards">
            ${group.indicators.map(ind => {
              const annualMeta = getAnnualCalcMeta(getIndicatorCalcMode(ind));
              return `
                <article class="indicator-overview-card">
                  <div>
                    <h4>${escapeHtml(ind.name)}</h4>
                    <p>${escapeHtml(ind.description || 'Sin descripción cargada.')}</p>
                  </div>
                  <div class="indicator-overview-meta">
                    <span>${escapeHtml(ind.unit || 'sin unidad')}</span>
                    <span>${annualMeta.shortLabel}</span>
                  </div>
                  <div class="indicator-overview-meta">
                    <span class="status-inline ${ind.has_data ? 'success' : 'warning'}">${ind.has_data ? 'Con datos' : 'Sin datos'}</span>
                    <span>${getMetricKey(ind) || 'sin clave comparable'}</span>
                  </div>
                  ${getMethodologyNote(ind) ? `<div class="indicator-overview-meta"><span class="indicator-note-badge">Nota metodológica</span><span>${escapeHtml(getMethodologyNote(ind))}</span></div>` : ''}
                  <div class="card-actions">
                    <button class="btn btn-primary btn-sm" onclick="selectIndicator('${ind.id}')">Ver indicador</button>
                  </div>
                </article>
              `;
            }).join('')}
          </div>
        </div>
      </section>
    `;
  }).join('');
}

function getUniqueMetricOptions() {
  const byKey = new Map();
  indicators.forEach(ind => {
    const key = getMetricKey(ind);
    if (!key) return;
    if (!byKey.has(key)) byKey.set(key, { key, label: ind.name, unit: ind.unit || '' });
  });
  return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'));
}

async function hydrateDestinationDataStatus(destinationId) {
  const destinationIndicators = getIndicatorsForDestination(destinationId);
  const ids = destinationIndicators.map(ind => ind.id);
  if (!ids.length) return;
  try {
    const points = await fetchDataPointsForIndicators(ids);
    const presence = buildPresenceFromPoints(points);
    applyPresenceToIndicators(ids, presence);
  } catch (e) {
    try {
      const presence = await fetchIndicatorsWithData(ids);
      applyPresenceToIndicators(ids, presence);
    } catch (_) {
      // la vista pública sigue operativa aunque falle esta capa visual
    }
  }
}

async function refreshIndicatorsDataStatus(indicatorIds) {
  const ids = [...new Set((indicatorIds || []).filter(Boolean))];
  if (!ids.length) return;
  try {
    const points = await fetchDataPointsForIndicators(ids);
    const presence = buildPresenceFromPoints(points);
    applyPresenceToIndicators(ids, presence);
  } catch (e) {
    try {
      const presence = await fetchIndicatorsWithData(ids);
      applyPresenceToIndicators(ids, presence);
    } catch (_) {
      // no rompo la UI por una capa visual
    }
  }
}

function renderSidebar() {
  const destinationList = document.getElementById('destinationList');
  const allDestinations = getRenderableDestinations();

  if (!allDestinations.length) {
    destinationList.innerHTML = '<p class="sidebar-hint">No hay destinos cargados.</p>';
  } else {
    destinationList.innerHTML = allDestinations.map(dest => {
      const count = getIndicatorsForDestination(dest.id).length;
      return `
        <button class="destination-item ${currentDestination?.id === dest.id ? 'active' : ''}" onclick="selectDestination('${dest.id}')">
          <span class="destination-main">
            <span class="destination-name">${escapeHtml(getDestinationDisplayName(dest))}</span>
            <span class="destination-meta">${count} indicador${count !== 1 ? 'es' : ''}</span>
          </span>
          <span class="destination-count">${count}</span>
        </button>
      `;
    }).join('');
  }

  const sidebarList = document.getElementById('sidebarList');
  if (!currentDestination) {
    sidebarList.innerHTML = '<div class="sidebar-hint">Seleccioná un destino para ver sus indicadores.</div>';
    return;
  }

  const currentIndicators = getIndicatorsForDestination(currentDestination.id);
  if (!currentIndicators.length) {
    sidebarList.innerHTML = '<div class="sidebar-hint">Este destino todavía no tiene indicadores.</div>';
    return;
  }

  sidebarList.innerHTML = renderGroupedSidebarIndicators(currentIndicators, currentDestination.id);
}

async function selectDestination(destinationId) {
  currentDestination = getDestinationById(destinationId);
  if (!currentDestination) return;

  if (currentIndicator && currentIndicator.destination_id !== (destinationId === UNASSIGNED_DESTINATION_ID ? null : destinationId)) {
    currentIndicator = null;
    destroyCharts();
  }

  overviewScrollState[currentDestination.id] = 0;
  await hydrateDestinationDataStatus(destinationId);
  renderSidebar();
  showCurrentDestinationOverview({ restoreScroll: false });
}

function showCurrentDestinationOverview({ restoreScroll = true } = {}) {
  if (!currentDestination) {
    showEmptyState();
    return;
  }

  currentIndicator = null;
  renderSidebar();

  const items = getIndicatorsForDestination(currentDestination.id);
  const withData = items.filter(ind => ind.has_data).length;
  const withoutData = items.length - withData;

  document.getElementById('destinationTitle').textContent = getDestinationDisplayName(currentDestination);
  document.getElementById('destinationBadge').textContent = `${items.length} indicador${items.length !== 1 ? 'es' : ''}`;
  document.getElementById('destinationSubtitle').textContent = items.length
    ? 'Seleccioná un indicador para entrar al detalle, comparar su evolución anual y exportarlo.'
    : 'Todavía no hay indicadores asociados a este destino.';
  document.getElementById('overviewIndicatorsCount').textContent = String(items.length);
  document.getElementById('overviewWithDataCount').textContent = String(withData);
  document.getElementById('overviewWithoutDataCount').textContent = String(withoutData);

  const cards = document.getElementById('destinationCards');
  const empty = document.getElementById('destinationCardsEmpty');
  if (!items.length) {
    cards.innerHTML = '';
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    cards.innerHTML = renderGroupedOverviewCards(items, currentDestination.id);
  }

  document.getElementById('mainEmpty').style.display = 'none';
  document.getElementById('mainView').style.display = 'none';
  document.getElementById('destinationOverview').style.display = 'block';

  const mainContent = document.querySelector('.main-content');
  if (mainContent) {
    const targetScroll = restoreScroll ? (overviewScrollState[currentDestination.id] || 0) : 0;
    requestAnimationFrame(() => {
      mainContent.scrollTo({ top: targetScroll, behavior: 'auto' });
    });
  }
}

async function selectIndicator(id) {
  currentIndicator = indicators.find(i => i.id === id);
  if (!currentIndicator) return;

  const mainContent = document.querySelector('.main-content');
  if (currentDestination?.id && mainContent) {
    overviewScrollState[currentDestination.id] = mainContent.scrollTop;
  }

  const destinationId = currentIndicator.destination_id || UNASSIGNED_DESTINATION_ID;
  ensureIndicatorGroupExpanded(currentIndicator, destinationId);
  currentDestination = getDestinationById(destinationId);
  renderSidebar();

  try {
    const destinationIndicators = getIndicatorsForDestination(destinationId);
    const destinationIds = destinationIndicators.map(ind => ind.id);
    const allPoints = await fetchDataPointsForIndicators(destinationIds);
    const dataByIndicator = buildDataByIndicator(allPoints);
    const currentPoints = dataByIndicator[currentIndicator.id] || [];
    currentIndicator.has_data = currentPoints.length > 0;
    const indicatorRef = indicators.find(ind => ind.id === currentIndicator.id);
    if (indicatorRef) indicatorRef.has_data = currentIndicator.has_data;
    renderSidebar();
    currentDataByYear = buildDataByYear(currentPoints);
    currentDataMetaByYear = buildDataPointMetaByYear(currentPoints);
    currentRelatedSeriesMap = buildRelatedSeriesMapForDestination(currentIndicator, destinationIndicators, dataByIndicator);
    currentYearlyStats = calcYearlyStats(currentDataByYear, { indicator: currentIndicator, relatedSeriesMap: currentRelatedSeriesMap });
    visibleYears = getAvailableYears();
    renderDashboard();
    document.getElementById('mainEmpty').style.display = 'none';
    document.getElementById('destinationOverview').style.display = 'none';
    document.getElementById('mainView').style.display = 'block';
  } catch (e) {
    toast('Error cargando el indicador: ' + e.message, 'error');
  }
}

function renderDashboard() {
  const years = getAvailableYears();
  const shownYears = getVisibleYears();
  const annualMeta = getAnnualCalcMeta(getIndicatorCalcMode(currentIndicator));
  document.getElementById('viewTitle').textContent = currentIndicator.name;
  document.getElementById('viewDesc').textContent = currentIndicator.description || '';
  document.getElementById('viewDestinationBadge').textContent = currentDestination ? getDestinationDisplayName(currentDestination) : 'Sin destino';
  document.getElementById('statsUnit').textContent = currentIndicator.unit || 'unidades';
  document.getElementById('yearsCount').textContent = shownYears.length === years.length
    ? years.length + ' año' + (years.length !== 1 ? 's' : '')
    : shownYears.length + ' de ' + years.length + ' año' + (years.length !== 1 ? 's' : '');
  document.getElementById('statsAnnualHeader').textContent = annualMeta.shortLabel;
  document.getElementById('annualChartTitle').textContent = annualMeta.shortLabel;
  document.getElementById('annualChartNote').textContent = currentIndicator.annual_chart_visible === false ? 'Oculto por configuración' : annualMeta.description;
  document.getElementById('annualCalcBadge').textContent = annualMeta.label;
  document.getElementById('annualCalcHelp').textContent = annualMeta.description;

  const methodologyNote = getMethodologyNote(currentIndicator);
  const methodologyCard = document.getElementById('methodologyCard');
  const methodologyNoteText = document.getElementById('methodologyNoteText');
  if (methodologyNote) {
    methodologyCard.style.display = 'block';
    methodologyNoteText.textContent = methodologyNote;
  } else {
    methodologyCard.style.display = 'none';
    methodologyNoteText.textContent = '—';
  }

  renderYearFilter();

  const allVals = Object.values(currentDataByYear).flat().filter(v => v !== null && !isNaN(v)).map(Number);
  const globalStats = calcStats(allVals);
  const selectedVals = getValuesForYears(currentDataByYear, shownYears);
  const selectedStats = calcStats(selectedVals);
  const selectedLabel = getSelectedYearsLabel(shownYears, years);
  const selectedAppliedMetric = calculateAppliedMetricForYears(currentIndicator, currentDataByYear, currentYearlyStats, shownYears, currentRelatedSeriesMap);
  const globalAppliedMetric = calculateAppliedMetricForYears(currentIndicator, currentDataByYear, currentYearlyStats, years, currentRelatedSeriesMap, { scope: 'global' });

  const selectedKpis = [
    { label: selectedAppliedMetric.label, value: formatNumber(selectedAppliedMetric.value), sub: selectedAppliedMetric.sub || selectedLabel, accent: '#10B981' },
    { label: 'Promedio mensual', value: formatNumber(selectedStats?.mean), sub: selectedLabel, accent: 'var(--accent)' },
    { label: 'Mediana mensual', value: formatNumber(selectedStats?.median), sub: selectedLabel, accent: '#06B6D4' },
    { label: 'Máximo mensual', value: formatNumber(selectedStats?.max), sub: selectedLabel, accent: '#A855F7' },
    { label: 'Mínimo mensual', value: formatNumber(selectedStats?.min), sub: selectedLabel, accent: '#F97316' },
    { label: 'Desvío estándar', value: formatNumber(selectedStats?.stdDev), sub: 'Serie seleccionada', accent: '#EAB308' },
  ];

  const globalKpis = [
    { label: globalAppliedMetric.label, value: formatNumber(globalAppliedMetric.value), sub: globalAppliedMetric.sub || 'Todos los años cargados', accent: '#10B981' },
    { label: 'Promedio mensual global', value: formatNumber(globalStats?.mean), sub: 'Todos los años cargados', accent: 'var(--accent)' },
    { label: 'Mediana global', value: formatNumber(globalStats?.median), sub: 'Todos los años cargados', accent: '#06B6D4' },
    { label: 'Máximo histórico', value: formatNumber(globalStats?.max), sub: 'Toda la serie', accent: '#A855F7' },
    { label: 'Mínimo histórico', value: formatNumber(globalStats?.min), sub: 'Toda la serie', accent: '#F97316' },
    { label: 'Años cargados', value: years.length ? String(years.length) : '-', sub: years.length ? `${years[0]}–${years[years.length - 1]}` : 'Sin serie', accent: '#EAB308' },
  ];

  const renderKpiCard = (k) => `
    <div class="kpi-card" style="--accent-color:${k.accent}">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value">${k.value}</div>
      ${k.change !== undefined && k.change !== null ? `<div class="kpi-change ${k.change >= 0 ? 'up' : 'down'}">${k.change >= 0 ? '▲' : '▼'} ${formatPct(k.change)}</div>` : k.sub ? `<div class="kpi-sub">${k.sub}</div>` : ''}
    </div>
  `;

  document.getElementById('kpiGrid').innerHTML = `
    <div class="kpi-grid-section-title kpi-grid-full">
      <span>Medidas de la selección visible</span>
      <small>${escapeHtml(selectedLabel)}</small>
    </div>
    ${selectedKpis.map(renderKpiCard).join('')}
    ${renderSelectedYearStatsTable(shownYears, currentYearlyStats, annualMeta)}
    <div class="kpi-grid-section-title kpi-grid-full">
      <span>Histórico global del indicador</span>
      <small>Calculado con todos los años cargados, aunque estén ocultos en el gráfico.</small>
    </div>
    ${globalKpis.map(renderKpiCard).join('')}
  `;

  destroyCharts();
  const filteredDataByYear = filterDataByYear(currentDataByYear, shownYears);
  const filteredYearlyStats = filterYearlyStats(currentYearlyStats, shownYears);
  const hasVisibleYears = shownYears.length > 0;

  document.getElementById('lineChartEmpty').style.display = hasVisibleYears ? 'none' : 'flex';
  document.getElementById('lineChartWrap').style.display = hasVisibleYears ? 'block' : 'none';
  if (hasVisibleYears) {
    const filteredMetaByYear = Object.fromEntries(shownYears.map(year => [year, currentDataMetaByYear?.[year] || new Array(12).fill(null)]));
    renderLineChart('lineChart', filteredDataByYear, currentIndicator, filteredMetaByYear);
  }

  const annualChartCard = document.getElementById('annualChartCard');
  const annualChartVisible = currentIndicator.annual_chart_visible !== false && getIndicatorCalcMode(currentIndicator) !== 'none';
  if (!annualChartVisible) {
    annualChartCard.style.display = 'none';
  } else {
    annualChartCard.style.display = 'block';
    document.getElementById('barChartEmpty').style.display = hasVisibleYears ? 'none' : 'flex';
    document.getElementById('barChartWrap').style.display = hasVisibleYears ? 'block' : 'none';
    if (hasVisibleYears) {
      renderBarChart('barChart', filteredYearlyStats, currentIndicator);
    }
  }

  document.getElementById('statsBody').innerHTML = years.map(yr => {
    const s = currentYearlyStats[yr];
    const yoy = s?.yoyAnnual;
    return `<tr>
      <td><strong>${yr}</strong></td>
      <td>${formatNumber(s?.annualValue)}</td>
      <td>${formatNumber(s?.mean)}</td>
      <td>${formatNumber(s?.median)}</td>
      <td>${formatNumber(s?.min)}</td>
      <td>${formatNumber(s?.max)}</td>
      <td>${formatNumber(s?.stdDev)}</td>
      <td class="${yoy !== undefined && yoy !== null ? (yoy >= 0 ? 'positive' : 'negative') : ''}">${yoy !== undefined && yoy !== null ? formatPct(yoy) : '-'}</td>
    </tr>`;
  }).join('');

  const mt = document.getElementById('monthlyTable');
  const header = `<thead><tr><th>Mes</th>${years.map(yr => `<th>${yr}</th>`).join('')}</tr></thead>`;
  const rows = MONTHS.map((m, mi) => `
    <tr>
      <td>${m}</td>
      ${years.map(yr => renderMonthlyDataCell(currentDataByYear[yr]?.[mi], currentDataMetaByYear?.[yr]?.[mi])).join('')}
    </tr>
  `).join('');
  mt.innerHTML = header + `<tbody>${rows}</tbody>`;
}


function getValuesForYears(dataByYear, years) {
  const selected = new Set((years || []).map(Number));
  return Object.entries(dataByYear || {})
    .filter(([year]) => selected.has(Number(year)))
    .flatMap(([, values]) => values || [])
    .filter(value => value !== null && value !== undefined && !isNaN(value))
    .map(Number);
}

function getAnnualValuesForYears(yearlyStats, years) {
  return (years || [])
    .map(year => yearlyStats?.[year]?.annualValue)
    .filter(value => value !== null && value !== undefined && !isNaN(value))
    .map(Number);
}


function calculateAppliedMetricForYears(indicator, dataByYear, yearlyStats, selectedYears, relatedSeriesMap = {}, options = {}) {
  const years = [...new Set((selectedYears || []).map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
  const annualMeta = getAnnualCalcMeta(getIndicatorCalcMode(indicator));
  const mode = getIndicatorCalcMode(indicator);
  const values = getValuesForYears(dataByYear, years);
  const stats = calcStats(values);
  const singleYear = years.length === 1 ? years[0] : null;
  const isGlobal = options.scope === 'global';
  const periodLabel = singleYear ? `Año ${singleYear}` : getSelectedYearsLabel(years, getAvailableYears());

  if (!years.length) {
    return {
      label: annualMeta.shortLabel,
      value: null,
      sub: 'Sin años seleccionados',
    };
  }

  if (singleYear) {
    return {
      label: `${annualMeta.shortLabel} ${singleYear}`,
      value: yearlyStats?.[singleYear]?.annualValue ?? null,
      sub: getAppliedMetricHelpText(mode, true),
    };
  }

  switch (mode) {
    case 'sum':
      return {
        label: isGlobal ? 'Total histórico' : 'Total de la selección',
        value: stats?.sum ?? null,
        sub: isGlobal ? 'Suma de todos los meses cargados' : 'Suma de los meses visibles',
      };
    case 'average':
      return {
        label: isGlobal ? 'Promedio aplicado global' : 'Promedio de la selección',
        value: stats?.mean ?? null,
        sub: isGlobal ? 'Promedio mensual de toda la serie' : 'Promedio mensual de los años visibles',
      };
    case 'last_value':
      return {
        label: isGlobal ? 'Último valor histórico' : 'Último valor de la selección',
        value: getLastNonNull(values),
        sub: isGlobal ? 'Último mes con dato de toda la serie' : 'Último mes con dato entre los años visibles',
      };
    case 'max':
      return {
        label: isGlobal ? 'Máximo histórico aplicado' : 'Máximo de la selección',
        value: stats?.max ?? null,
        sub: isGlobal ? 'Mayor valor mensual de toda la serie' : 'Mayor valor mensual visible',
      };
    case 'min':
      return {
        label: isGlobal ? 'Mínimo histórico aplicado' : 'Mínimo de la selección',
        value: stats?.min ?? null,
        sub: isGlobal ? 'Menor valor mensual de toda la serie' : 'Menor valor mensual visible',
      };
    case 'ratio_of_sums': {
      const numeratorKey = String(indicator?.formula_numerator_key || '').trim();
      const denominatorKey = String(indicator?.formula_denominator_key || '').trim();
      const multiplier = indicator?.formula_multiplier === null || indicator?.formula_multiplier === undefined || indicator?.formula_multiplier === ''
        ? 1
        : Number(indicator.formula_multiplier);
      const numerator = sumClean(years.flatMap(year => relatedSeriesMap?.[numeratorKey]?.[year] || []));
      const denominator = sumClean(years.flatMap(year => relatedSeriesMap?.[denominatorKey]?.[year] || []));
      return {
        label: isGlobal ? 'Valor recalculado global' : 'Valor recalculado selección',
        value: denominator ? (numerator / denominator) * multiplier : null,
        sub: isGlobal ? 'Recalculado con toda la serie cargada' : 'Recalculado con numerador y denominador visibles',
      };
    }
    case 'none':
      return {
        label: 'Medida anual oculta',
        value: null,
        sub: 'Sin valor principal por configuración',
      };
    default:
      return {
        label: annualMeta.shortLabel,
        value: stats?.sum ?? null,
        sub: periodLabel,
      };
  }
}

function getAppliedMetricHelpText(mode, isSingleYear = false) {
  switch (mode) {
    case 'sum':
      return isSingleYear ? 'Suma de los meses del año' : 'Suma de los meses visibles';
    case 'average':
      return isSingleYear ? 'Promedio simple de los meses del año' : 'Promedio simple de los meses visibles';
    case 'last_value':
      return isSingleYear ? 'Último mes con dato del año' : 'Último mes con dato visible';
    case 'max':
      return isSingleYear ? 'Mayor valor mensual del año' : 'Mayor valor mensual visible';
    case 'min':
      return isSingleYear ? 'Menor valor mensual del año' : 'Menor valor mensual visible';
    case 'ratio_of_sums':
      return isSingleYear ? 'Recalculado con numerador y denominador del año' : 'Recalculado con numerador y denominador visibles';
    case 'none':
      return 'Sin valor principal por configuración';
    default:
      return 'Regla anual configurada para el indicador';
  }
}

function getSelectedYearsLabel(selectedYears, availableYears) {
  if (!selectedYears.length) return 'Sin años seleccionados';
  if (selectedYears.length === 1) return `Año ${selectedYears[0]}`;
  if (selectedYears.length === availableYears.length) return 'Serie completa visible';
  const first = selectedYears[0];
  const last = selectedYears[selectedYears.length - 1];
  return `${selectedYears.length} años seleccionados · ${first}–${last}`;
}

function renderSelectedYearStatsTable(selectedYears, yearlyStats, annualMeta) {
  if (!selectedYears.length) {
    return `
      <div class="selected-year-stats-card kpi-grid-full">
        <div class="selected-year-stats-header">
          <div>
            <h3>Medidas por año seleccionado</h3>
            <p>Activá uno o varios años para ver sus medidas individuales.</p>
          </div>
        </div>
        <div class="selected-year-empty">No hay años seleccionados.</div>
      </div>
    `;
  }

  const rows = selectedYears.map(year => {
    const stats = yearlyStats?.[year] || {};
    const yoy = stats?.yoyAnnual;
    return `
      <tr>
        <td><strong>${year}</strong></td>
        <td>${formatNumber(stats?.annualValue)}</td>
        <td>${formatNumber(stats?.mean)}</td>
        <td>${formatNumber(stats?.median)}</td>
        <td>${formatNumber(stats?.max)}</td>
        <td>${formatNumber(stats?.min)}</td>
        <td>${formatNumber(stats?.stdDev)}</td>
        <td class="${yoy !== undefined && yoy !== null ? (yoy >= 0 ? 'positive' : 'negative') : ''}">${yoy !== undefined && yoy !== null ? formatPct(yoy) : '-'}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="selected-year-stats-card kpi-grid-full">
      <div class="selected-year-stats-header">
        <div>
          <h3>Medidas por año seleccionado</h3>
          <p>Lectura individual de los años activos en los chips superiores.</p>
        </div>
        <span class="badge badge-blue">${selectedYears.length} año${selectedYears.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="selected-year-stats-table-wrap">
        <table class="data-table selected-year-stats-table">
          <thead>
            <tr>
              <th>Año</th>
              <th>${escapeHtml(annualMeta.shortLabel)}</th>
              <th>Promedio mensual</th>
              <th>Mediana</th>
              <th>Máximo</th>
              <th>Mínimo</th>
              <th>Desvío Std</th>
              <th>Var. interanual</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderMonthlyDataCell(value, meta) {
  const title = getDataPointAnnotationText(meta);
  const suffix = hasDataPointAnnotation(meta) ? '<span class="data-point-flag" aria-hidden="true">*</span>' : '';
  return `<td ${title ? `title="${escapeHtml(title)}"` : ''}>${formatNumber(value)}${suffix}</td>`;
}

function getAvailableYears() {
  return Object.keys(currentDataByYear).map(Number).sort((a, b) => a - b);
}

function getVisibleYears() {
  const availableYears = getAvailableYears();
  if (!availableYears.length) return [];
  const availableSet = new Set(availableYears);
  const cleaned = visibleYears.filter(year => availableSet.has(year)).sort((a, b) => a - b);
  visibleYears = cleaned;
  return cleaned;
}

function renderYearFilter() {
  const container = document.getElementById('yearFilterList');
  if (!container) return;
  const availableYears = getAvailableYears();
  const selectedYears = getVisibleYears();

  if (!availableYears.length) {
    container.innerHTML = '<div class="help-text">Este indicador todavía no tiene años cargados.</div>';
    return;
  }

  const selectedSet = new Set(selectedYears);
  container.innerHTML = availableYears.map(year => {
    const active = selectedSet.has(year);
    return `
      <button
        type="button"
        class="chip-toggle ${active ? 'active' : ''}"
        aria-pressed="${active ? 'true' : 'false'}"
        onclick="toggleVisibleYear(${year})"
      >
        <span class="chip-toggle-marker">${active ? '✓' : '+'}</span>
        <span>${year}</span>
      </button>
    `;
  }).join('');
}

function toggleVisibleYear(year) {
  const next = new Set(getVisibleYears());
  if (next.has(year)) {
    next.delete(year);
  } else {
    next.add(year);
  }
  visibleYears = [...next].sort((a, b) => a - b);
  renderDashboard();
}

function selectAllVisibleYears() {
  visibleYears = getAvailableYears();
  renderDashboard();
}

function clearVisibleYears() {
  visibleYears = [];
  renderDashboard();
}

function filterDataByYear(dataByYear, years) {
  const yearSet = new Set(years);
  return Object.fromEntries(
    Object.entries(dataByYear)
      .filter(([year]) => yearSet.has(Number(year)))
      .map(([year, values]) => [year, values])
  );
}

function filterYearlyStats(yearlyStats, years) {
  const yearSet = new Set(years);
  const filteredEntries = Object.entries(yearlyStats)
    .filter(([key]) => key === '__meta' || yearSet.has(Number(key)));
  return Object.fromEntries(filteredEntries);
}

function showEmptyState() {
  currentDestination = null;
  currentIndicator = null;
  visibleYears = [];
  destroyCharts();
  renderSidebar();
  document.getElementById('mainEmpty').style.display = 'block';
  document.getElementById('destinationOverview').style.display = 'none';
  document.getElementById('mainView').style.display = 'none';
}


function normalizeComparisonText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function buildComparableMetricOptions() {
  const byKey = new Map();
  indicators.forEach(ind => {
    const key = getMetricKey(ind);
    if (!key || !ind.destination_id) return;
    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        label: ind.name || key,
        unit: ind.unit || '',
        groupTitle: getIndicatorGroupTitle(ind),
        destinationIds: new Set(),
      });
    }
    const entry = byKey.get(key);
    entry.destinationIds.add(ind.destination_id);
    if (!entry.unit && ind.unit) entry.unit = ind.unit;
    const groupTitle = getIndicatorGroupTitle(ind);
    if ((!entry.groupTitle || entry.groupTitle === 'Sin agrupar') && groupTitle && groupTitle !== 'Sin agrupar') {
      entry.groupTitle = groupTitle;
    }
  });

  return [...byKey.values()]
    .map(item => ({
      ...item,
      count: item.destinationIds.size,
      destinationIds: [...item.destinationIds],
      groupTitle: item.groupTitle || 'Sin agrupar',
    }))
    .filter(item => item.count >= 2)
    .sort((a, b) => {
      const groupDiff = (a.groupTitle || '').localeCompare(b.groupTitle || '', 'es');
      if (groupDiff !== 0) return groupDiff;
      return (a.label || '').localeCompare(b.label || '', 'es');
    });
}

function getFilteredComparableMetricOptions() {
  const options = buildComparableMetricOptions();
  const searchEl = document.getElementById('compareMetricSearch');
  const query = normalizeComparisonText(searchEl?.value || '');
  if (!query) return options;
  return options.filter(opt => {
    const haystack = normalizeComparisonText(`${opt.label} ${opt.groupTitle} ${opt.unit}`);
    return haystack.includes(query);
  });
}

function renderComparisonMetricOptions(options, selectedMetric) {
  const metricSelect = document.getElementById('compareMetricKey');
  if (!options.length) {
    metricSelect.innerHTML = '<option value="">Sin resultados comparables</option>';
    return;
  }

  const groups = new Map();
  options.forEach(opt => {
    const groupTitle = opt.groupTitle || 'Sin agrupar';
    if (!groups.has(groupTitle)) groups.set(groupTitle, []);
    groups.get(groupTitle).push(opt);
  });

  metricSelect.innerHTML = [...groups.entries()].map(([groupTitle, items]) => `
    <optgroup label="${escapeHtml(groupTitle)}">
      ${items.map(opt => {
        const unit = opt.unit ? ` · ${escapeHtml(opt.unit)}` : '';
        const countLabel = `${opt.count} destino${opt.count !== 1 ? 's' : ''}`;
        return `<option value="${escapeHtml(opt.key)}" ${selectedMetric === opt.key ? 'selected' : ''}>${escapeHtml(opt.label)}${unit} · ${countLabel}</option>`;
      }).join('')}
    </optgroup>
  `).join('');
}

function getComparisonAvailableDestinations(metricKey = comparisonSelection.metricKey) {
  const relevantIndicators = indicators.filter(ind => getMetricKey(ind) === metricKey && ind.destination_id);
  const destinationIds = [...new Set(relevantIndicators.map(ind => ind.destination_id))];
  return destinations.filter(dest => destinationIds.includes(dest.id));
}

function getAutoComparisonSelection(availableDestinations) {
  const selected = [];
  if (currentDestination?.id && availableDestinations.some(dest => dest.id === currentDestination.id)) {
    selected.push(currentDestination.id);
  }
  availableDestinations.forEach(dest => {
    if (selected.length >= Math.min(2, availableDestinations.length)) return;
    if (!selected.includes(dest.id)) selected.push(dest.id);
  });
  return selected;
}

function renderComparisonControls() {
  const metricSelect = document.getElementById('compareMetricKey');
  const allComparableOptions = buildComparableMetricOptions();
  const filteredOptions = getFilteredComparableMetricOptions();
  const container = document.getElementById('compareDestinationList');

  if (!allComparableOptions.length) {
    metricSelect.innerHTML = '<option value="">No hay indicadores repetidos en dos o más destinos</option>';
    container.innerHTML = '<span class="help-text">Todavía no hay indicadores comparables. Para comparar, la misma clave comparable debe existir en al menos dos destinos.</span>';
    return;
  }

  if (!filteredOptions.length) {
    metricSelect.innerHTML = '<option value="">Sin resultados para ese filtro</option>';
    container.innerHTML = '<span class="help-text">No hay indicadores comparables que coincidan con la búsqueda.</span>';
    comparisonSelection.metricKey = '';
    clearComparisonResults();
    return;
  }

  const searchValue = document.getElementById('compareMetricSearch')?.value || '';
  const previousMetric = comparisonSelection.metricKey;
  const currentStillVisible = filteredOptions.some(opt => opt.key === comparisonSelection.metricKey);
  const currentStillComparable = allComparableOptions.some(opt => opt.key === comparisonSelection.metricKey);
  const selectedMetric = currentStillVisible
    ? comparisonSelection.metricKey
    : (currentStillComparable && !searchValue ? comparisonSelection.metricKey : filteredOptions[0].key);
  comparisonSelection.metricKey = selectedMetric;
  if (previousMetric && previousMetric !== selectedMetric) {
    comparisonSelection.destinationIds = [];
  }
  renderComparisonMetricOptions(filteredOptions, selectedMetric);
  renderComparisonDestinationChoices({ autoSelect: true });
}

function handleComparisonMetricSearch() {
  renderComparisonControls();
  clearComparisonResults();
}

function renderComparisonDestinationChoices({ autoSelect = false } = {}) {
  const metricKey = comparisonSelection.metricKey;
  const selectedOption = buildComparableMetricOptions().find(opt => opt.key === metricKey);
  const availableDestinations = getComparisonAvailableDestinations(metricKey);
  const destinationIds = availableDestinations.map(dest => dest.id);
  const preservedSelection = comparisonSelection.destinationIds.filter(id => destinationIds.includes(id));
  comparisonSelection.destinationIds = preservedSelection.length
    ? preservedSelection
    : (autoSelect ? getAutoComparisonSelection(availableDestinations) : []);

  const container = document.getElementById('compareDestinationList');
  if (!selectedOption || availableDestinations.length < 2) {
    container.innerHTML = '<span class="help-text">Ese indicador no está disponible en dos o más destinos.</span>';
    return;
  }

  const selectedCount = comparisonSelection.destinationIds.length;
  container.innerHTML = `
    <div class="compare-helper-row">
      <span>${escapeHtml(selectedOption.label)} está disponible en <strong>${availableDestinations.length}</strong> destino${availableDestinations.length !== 1 ? 's' : ''}. Seleccionados: <strong>${selectedCount}</strong>.</span>
      <span class="compare-helper-actions">
        <button class="btn btn-secondary btn-sm" type="button" onclick="selectAllComparisonDestinations()">Todos</button>
        <button class="btn btn-ghost btn-sm" type="button" onclick="clearComparisonDestinations()">Limpiar</button>
      </span>
    </div>
    <div class="compare-chip-grid">
      ${availableDestinations.map(dest => {
        const active = comparisonSelection.destinationIds.includes(dest.id);
        return `
          <button
            type="button"
            class="chip-toggle ${active ? 'active' : ''}"
            aria-pressed="${active ? 'true' : 'false'}"
            onclick="toggleComparisonDestination('${dest.id}')"
          >
            <span class="chip-toggle-marker">${active ? '✓' : '+'}</span>
            <span>${escapeHtml(dest.name)}</span>
          </button>
        `;
      }).join('')}
    </div>
  `;
}

function handleComparisonMetricChange() {
  comparisonSelection.metricKey = document.getElementById('compareMetricKey').value;
  comparisonSelection.destinationIds = [];
  renderComparisonDestinationChoices({ autoSelect: true });
  clearComparisonResults();
}

function toggleComparisonDestination(destinationId) {
  const next = new Set(comparisonSelection.destinationIds);
  if (next.has(destinationId)) next.delete(destinationId);
  else next.add(destinationId);
  comparisonSelection.destinationIds = [...next];
  renderComparisonDestinationChoices({ autoSelect: false });
  clearComparisonResults();
}

function selectAllComparisonDestinations() {
  comparisonSelection.destinationIds = getComparisonAvailableDestinations().map(dest => dest.id);
  renderComparisonDestinationChoices({ autoSelect: false });
  clearComparisonResults();
}

function clearComparisonDestinations() {
  comparisonSelection.destinationIds = [];
  renderComparisonDestinationChoices({ autoSelect: false });
  clearComparisonResults();
}

function clearComparisonResults() {
  destroyComparisonChart();
  currentComparisonTablePayload = null;
  const sortControls = document.getElementById('comparisonTableSortControls');
  if (sortControls) sortControls.style.display = 'none';
  document.getElementById('compareEmpty').style.display = 'block';
  document.getElementById('compareResults').style.display = 'none';
  document.getElementById('compareSummaryBadge').textContent = 'Sin comparación';
}

function getComparisonMeasureOptions(payload = null) {
  const annualLabel = payload?.annualMeta?.shortLabel || 'Medida anual aplicada';
  return [
    {
      value: 'annualValue',
      label: annualLabel,
      help: 'Respeta la regla anual configurada para el indicador.',
    },
    {
      value: 'mean',
      label: 'Promedio mensual',
      help: 'Promedio simple de los meses cargados dentro de cada año.',
    },
    {
      value: 'median',
      label: 'Mediana mensual',
      help: 'Valor central del año. Útil cuando hay meses atípicos.',
    },
    {
      value: 'max',
      label: 'Máximo mensual del año',
      help: 'Mayor valor mensual registrado en ese año.',
    },
    {
      value: 'min',
      label: 'Mínimo mensual del año',
      help: 'Menor valor mensual registrado en ese año.',
    },
    {
      value: 'stdDev',
      label: 'Desvío estándar mensual',
      help: 'Medida avanzada de variabilidad. Útil para estacionalidad; no conviene como ranking principal.',
    },
  ];
}

function getComparisonMeasureMeta(measure, payload = null) {
  const options = getComparisonMeasureOptions(payload);
  return options.find(option => option.value === measure) || options[0];
}

function getComparisonMeasureValue(item, year, measure = comparisonTableSort.measure) {
  if (!year) return null;
  const stats = item?.yearlyStats?.[Number(year)];
  if (!stats) return null;
  const key = measure || 'annualValue';
  const value = stats?.[key];
  return value === null || value === undefined || isNaN(Number(value)) ? null : Number(value);
}

function resetComparisonTableSortForYears(years = [], payload = null) {
  const availableYears = new Set((years || []).map(year => String(year)));
  if (!availableYears.has(String(comparisonTableSort.year || ''))) {
    comparisonTableSort.year = '';
  }
  if (!['original', 'asc', 'desc'].includes(comparisonTableSort.direction)) {
    comparisonTableSort.direction = 'original';
  }
  if (!comparisonTableSort.year) {
    comparisonTableSort.direction = 'original';
  }
  const availableMeasures = new Set(getComparisonMeasureOptions(payload).map(option => option.value));
  if (!availableMeasures.has(comparisonTableSort.measure)) {
    comparisonTableSort.measure = 'annualValue';
  }
}

function handleComparisonSortChange() {
  comparisonTableSort.measure = document.getElementById('comparisonMeasure')?.value || 'annualValue';
  comparisonTableSort.year = document.getElementById('comparisonSortYear')?.value || '';
  comparisonTableSort.direction = document.getElementById('comparisonSortDirection')?.value || 'original';
  if (!comparisonTableSort.year) comparisonTableSort.direction = 'original';
  renderComparisonTable();
  renderComparisonChartFromPayload();
}

function renderComparisonTableSortControls(payload) {
  const controls = document.getElementById('comparisonTableSortControls');
  if (!controls) return;
  const years = payload?.years || [];
  resetComparisonTableSortForYears(years, payload);
  if (!years.length) {
    controls.style.display = 'none';
    controls.innerHTML = '';
    return;
  }

  const measures = getComparisonMeasureOptions(payload);
  const activeMeasure = getComparisonMeasureMeta(comparisonTableSort.measure, payload);

  controls.style.display = 'flex';
  controls.innerHTML = `
    <div class="comparison-sort-field comparison-measure-field">
      <label class="form-label">Medida de tabla y gráfico</label>
      <select id="comparisonMeasure" class="form-control comparison-sort-select" onchange="handleComparisonSortChange()">
        ${measures.map(option => `<option value="${option.value}" ${comparisonTableSort.measure === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
      </select>
    </div>
    <div class="comparison-sort-field">
      <label class="form-label">Año de referencia</label>
      <select id="comparisonSortYear" class="form-control comparison-sort-select" onchange="handleComparisonSortChange()">
        <option value="" ${comparisonTableSort.year ? '' : 'selected'}>Sin año específico</option>
        ${years.map(year => `<option value="${year}" ${String(comparisonTableSort.year) === String(year) ? 'selected' : ''}>${year}</option>`).join('')}
      </select>
    </div>
    <div class="comparison-sort-field">
      <label class="form-label">Criterio</label>
      <select id="comparisonSortDirection" class="form-control comparison-sort-select" onchange="handleComparisonSortChange()" ${comparisonTableSort.year ? '' : 'disabled'}>
        <option value="original" ${comparisonTableSort.direction === 'original' ? 'selected' : ''}>Orden original</option>
        <option value="desc" ${comparisonTableSort.direction === 'desc' ? 'selected' : ''}>Mayor a menor</option>
        <option value="asc" ${comparisonTableSort.direction === 'asc' ? 'selected' : ''}>Menor a mayor</option>
      </select>
    </div>
    <div class="comparison-measure-note">${escapeHtml(activeMeasure.help)}</div>
  `;
}

function getComparisonValueForSort(item, year) {
  return getComparisonMeasureValue(item, year, comparisonTableSort.measure);
}

function getSortedComparisonSeries(payload) {
  const baseSeries = (payload?.series || []).map((item, index) => ({ ...item, __originalIndex: index }));
  const sortYear = comparisonTableSort.year;
  const sortDirection = comparisonTableSort.direction || 'original';
  if (!sortYear || sortDirection === 'original') return baseSeries;

  const directionFactor = sortDirection === 'asc' ? 1 : -1;
  return baseSeries.sort((a, b) => {
    const aValue = getComparisonValueForSort(a, sortYear);
    const bValue = getComparisonValueForSort(b, sortYear);
    const aMissing = aValue === null;
    const bMissing = bValue === null;

    if (aMissing && bMissing) return a.__originalIndex - b.__originalIndex;
    if (aMissing) return 1;
    if (bMissing) return -1;
    if (aValue === bValue) return a.__originalIndex - b.__originalIndex;
    return (aValue - bValue) * directionFactor;
  });
}

function buildComparisonChartSeries(payload) {
  const years = payload?.years || [];
  const sortedSeries = getSortedComparisonSeries(payload);
  return sortedSeries.map(item => ({
    label: item.destinationName,
    values: years.map(year => getComparisonMeasureValue(item, year, comparisonTableSort.measure)),
  }));
}

function renderComparisonChartFromPayload(payload = currentComparisonTablePayload) {
  if (!payload) return;
  resetComparisonTableSortForYears(payload.years || [], payload);
  const activeMeasure = getComparisonMeasureMeta(comparisonTableSort.measure, payload);
  const metricName = payload.indicatorName || payload.series?.[0]?.indicator?.name || 'Indicador';
  renderComparisonChart('comparisonChart', {
    years: payload.years || [],
    series: buildComparisonChartSeries(payload),
    unit: payload.unit || '',
    measureLabel: activeMeasure.label,
  });
  const titleEl = document.getElementById('compareChartTitle');
  const noteEl = document.getElementById('compareChartNote');
  if (titleEl) titleEl.textContent = `${metricName} · comparación entre destinos`;
  if (noteEl) noteEl.textContent = activeMeasure.label;
}

function renderComparisonTable() {
  const payload = currentComparisonTablePayload;
  const table = document.getElementById('comparisonTable');
  if (!payload || !table) return;

  const years = payload.years || [];
  const sortedSeries = getSortedComparisonSeries(payload);
  const activeSortYear = String(comparisonTableSort.year || '');
  const activeMeasure = getComparisonMeasureMeta(comparisonTableSort.measure, payload);
  const isSortedByValue = activeSortYear && comparisonTableSort.direction !== 'original';
  const sortArrow = comparisonTableSort.direction === 'asc' ? '↑' : comparisonTableSort.direction === 'desc' ? '↓' : '';
  renderComparisonTableSortControls(payload);

  const header = `<thead><tr><th>Destino</th>${years.map(year => {
    const isActive = String(year) === activeSortYear;
    return `<th class="${isActive ? 'sorted-column' : ''}">${year}${isActive && sortArrow ? ` ${sortArrow}` : ''}</th>`;
  }).join('')}</tr></thead>`;

  const rows = sortedSeries.map((item, rowIndex) => `
    <tr class="${isSortedByValue && rowIndex === 0 ? 'top-ranked-row' : ''}">
      <td>${escapeHtml(item.destinationName)}</td>
      ${years.map(year => {
        const isActive = String(year) === activeSortYear;
        return `<td class="${isActive ? 'sorted-column' : ''}" title="${escapeHtml(activeMeasure.label)} · ${year}">${formatNumber(getComparisonMeasureValue(item, year, activeMeasure.value))}</td>`;
      }).join('')}
    </tr>
  `).join('');

  table.innerHTML = header + `<tbody>${rows}</tbody>`;
}


async function runComparison() {
  const metricKey = comparisonSelection.metricKey;
  const destinationIds = comparisonSelection.destinationIds;
  if (!metricKey) {
    toast('Elegí un indicador comparable.', 'error');
    return;
  }
  if (destinationIds.length < 2) {
    toast('Seleccioná al menos dos destinos para comparar.', 'error');
    return;
  }

  const selectedIndicators = destinationIds
    .map(destId => indicators.find(ind => ind.destination_id === destId && getMetricKey(ind) === metricKey))
    .filter(Boolean);
  if (selectedIndicators.length < 2) {
    toast('No encontré suficientes indicadores comparables.', 'error');
    return;
  }

  try {
    const destinationIndicatorIds = [...new Set(destinationIds.flatMap(destId => getIndicatorsForDestination(destId).map(ind => ind.id)))];
    const allPoints = await fetchDataPointsForIndicators(destinationIndicatorIds);
    const dataByIndicator = buildDataByIndicator(allPoints);
    const yearsSet = new Set();
    const series = [];

    selectedIndicators.forEach(indicator => {
      const destinationIndicators = getIndicatorsForDestination(indicator.destination_id);
      const relatedSeriesMap = buildRelatedSeriesMapForDestination(indicator, destinationIndicators, dataByIndicator);
      const dataByYear = buildDataByYear(dataByIndicator[indicator.id] || []);
      const yearlyStats = calcYearlyStats(dataByYear, { indicator, relatedSeriesMap });
      const annualSeries = buildAnnualSeries(yearlyStats);
      annualSeries.years.forEach(year => yearsSet.add(year));
      series.push({
        indicator,
        destinationName: indicator.destination?.name || 'Sin destino',
        yearlyStats,
        annualSeries,
      });
    });

    const years = [...yearsSet].sort((a, b) => a - b);
    const annualMeta = getAnnualCalcMeta(getIndicatorCalcMode(selectedIndicators[0]));

    currentComparisonTablePayload = {
      years,
      series,
      annualMeta,
      unit: selectedIndicators[0]?.unit || '',
      indicatorName: selectedIndicators[0]?.name || 'Indicador',
    };
    comparisonTableSort = { year: '', direction: 'original', measure: 'annualValue' };
    renderComparisonChartFromPayload();
    document.getElementById('compareSummaryBadge').textContent = `${selectedIndicators.length} destinos`;
    renderComparisonTable();

    document.getElementById('compareEmpty').style.display = 'none';
    document.getElementById('compareResults').style.display = 'block';
  } catch (e) {
    toast('Error armando la comparación: ' + e.message, 'error');
  }
}

async function handleExcelExport() {
  if (!currentIndicator) return;
  try {
    await exportToExcel(currentIndicator, currentDataByYear, currentYearlyStats);
    toast('Excel generado ✓', 'success');
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

async function handlePdfExport() {
  if (!currentIndicator) return;
  try {
    await exportToPDF(currentIndicator, currentDataByYear, currentYearlyStats);
    toast('PDF generado ✓', 'success');
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

function escapeJs(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function toast(msg, type = 'success') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}
