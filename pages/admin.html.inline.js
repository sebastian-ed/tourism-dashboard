
const UNASSIGNED_DESTINATION_ID = '__unassigned__';

let destinations = [];
let indicators = [];
let currentDestination = null;
let currentIndicator = null;
let currentDataPoints = [];
let currentDataByYear = {};
let currentDataMetaByYear = {};
let currentYearlyStats = {};
let currentRelatedSeriesMap = {};
let currentDestinationIndicators = [];
let currentDataByIndicator = {};
let gridYears = [];
let gridData = {};
let gridMeta = {};
let selectedGridYears = [];
let selectedGridCell = null;
let comparisonSelection = { metricKey: '', destinationIds: [] };
let currentComparisonTablePayload = null;
let comparisonTableSort = { year: '', direction: 'original' };
const groupCollapseState = { sidebar: {}, center: {} };
let dragState = { indicatorId: '', destinationId: '' };
let groupDragState = { destinationId: '', groupTitle: '' };

function getIndicatorSortOrder(indicator) {
  const value = Number(indicator?.sort_order);
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function compareIndicatorsForOrdering(a, b) {
  const orderDiff = getIndicatorSortOrder(a) - getIndicatorSortOrder(b);
  if (orderDiff !== 0) return orderDiff;
  return (a?.name || '').localeCompare(b?.name || '', 'es');
}

function getNextSortOrderForDestination(destinationId, excludeId = null) {
  const scoped = indicators.filter(ind => (ind.destination_id || '') === (destinationId || '') && ind.id !== excludeId);
  if (!scoped.length) return 0;
  return Math.max(...scoped.map(getIndicatorSortOrder).filter(Number.isFinite)) + 1;
}

window.addEventListener('DOMContentLoaded', async () => {
  const session = await getSession();
  if (session) showApp();
});

async function doLogin() {
  const email = document.getElementById('authEmail').value.trim();
  const pwd = document.getElementById('authPassword').value;
  const label = document.getElementById('loginLabel');
  const errEl = document.getElementById('authError');
  label.textContent = 'Ingresando...';
  errEl.style.display = 'none';
  try {
    await signIn(email, pwd);
    showApp();
  } catch (e) {
    errEl.textContent = e.message || 'Error al iniciar sesión';
    errEl.style.display = 'block';
    label.textContent = 'Ingresar';
  }
}

async function doLogout() {
  await signOut();
  document.getElementById('authPage').style.display = 'flex';
  document.getElementById('appShell').style.display = 'none';
}

async function showApp() {
  document.getElementById('authPage').style.display = 'none';
  document.getElementById('appShell').style.display = 'grid';
  await loadCoreData();
}

async function loadCoreData({ keepSelection = true } = {}) {
  const previousDestinationId = keepSelection ? currentDestination?.id : null;
  const previousIndicatorId = keepSelection ? currentIndicator?.id : null;

  destinations = await fetchDestinations();
  indicators = await fetchIndicators();
  indicators.forEach(ind => { ind.has_data = Boolean(ind.has_data); });
  indicators.sort((a, b) => {
    const destA = (a.destination?.name || 'Sin destino').localeCompare(b.destination?.name || 'Sin destino', 'es');
    if (destA !== 0) return destA;
    return compareIndicatorsForOrdering(a, b);
  });

  const renderableDestinations = getRenderableDestinations();
  currentDestination = renderableDestinations.find(d => d.id === previousDestinationId) || renderableDestinations[0] || null;
  currentIndicator = indicators.find(i => i.id === previousIndicatorId) || null;

  if (currentDestination) {
    await hydrateDestinationDataStatus(currentDestination.id);
  }

  renderSidebar();
  renderComparisonControls();

  if (currentIndicator) {
    await selectIndicator(currentIndicator.id, { silent: true });
  } else if (currentDestination) {
    await selectDestination(currentDestination.id);
  } else {
    showEmptyState();
  }
}

function getRenderableDestinations() {
  const list = [...destinations];
  if (indicators.some(ind => !ind.destination_id)) {
    list.push({ id: UNASSIGNED_DESTINATION_ID, name: 'Sin destino', pseudo: true });
  }
  return list;
}

function getDestinationById(destinationId) {
  return getRenderableDestinations().find(dest => dest.id === destinationId) || null;
}

function getDestinationDisplayName(destination) {
  const name = String(destination?.name || '').replace(/\s+/g, ' ').trim();
  return name || 'Destino sin nombre';
}

function isPseudoDestination(destination) {
  return Boolean(destination?.pseudo || destination?.id === UNASSIGNED_DESTINATION_ID);
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
      <div class="indicator-tree-group ${collapsed ? 'is-collapsed' : ''}" ondragover="handleGroupDragOver(event, '${escapeJs(destinationId)}')" ondragleave="handleGroupDragLeave(event)" ondrop="handleGroupDrop(event, '${encodedTitle}', '${escapeJs(destinationId)}')">
        <button type="button" class="indicator-tree-title group-toggle-btn admin-group-draggable" onclick="toggleGroupVisibility('sidebar', '${escapeJs(destinationId)}', '${encodedTitle}')" draggable="true" ondragstart="handleGroupDragStart(event, '${escapeJs(destinationId)}', '${encodedTitle}')" ondragend="handleGroupDragEnd(event)">
          <span class="group-toggle-main">
            <span class="group-drag-handle" title="Arrastrar grupo para ordenar">⋮⋮</span>
            <span class="group-toggle-icon">▾</span>
            <span>${escapeHtml(group.title)}</span>
          </span>
          <span class="tree-count">${group.indicators.length}</span>
        </button>
        <div class="indicator-tree-items drag-drop-zone" ondragover="handleIndicatorListDragOver(event, '${escapeJs(destinationId)}')" ondragleave="handleIndicatorDragLeave(event)" ondrop="handleIndicatorDropToEnd(event, '${escapeJs(destinationId)}')">
          ${group.indicators.map(ind => `
            <button
              class="indicator-item ${currentIndicator?.id === ind.id ? 'active' : ''}"
              onclick="selectIndicator('${ind.id}')"
              draggable="true"
              data-destination-id="${escapeHtml(destinationId)}"
              ondragstart="handleIndicatorDragStart(event, '${ind.id}', '${escapeJs(destinationId)}')"
              ondragend="handleIndicatorDragEnd(event)"
              ondragover="handleIndicatorDragOver(event, '${escapeJs(destinationId)}')"
              ondragleave="handleIndicatorDragLeave(event)"
              ondrop="handleIndicatorDrop(event, '${ind.id}', '${escapeJs(destinationId)}')"
            >
              <span class="indicator-main">
                <span class="ind-name">${escapeHtml(ind.name)}</span>
                <span class="ind-unit">${escapeHtml(ind.unit || 'sin unidad')}</span>
              </span>
              <span class="indicator-item-side">
                ${ind.has_data ? '<span class="badge badge-green">datos</span>' : '<span class="badge badge-orange">vacío</span>'}
                <span class="drag-handle" title="Arrastrar para reordenar">⋮⋮</span>
              </span>
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
      <section class="grouped-indicator-section ${collapsed ? 'is-collapsed' : ''}" ondragover="handleGroupDragOver(event, '${escapeJs(destinationId)}')" ondragleave="handleGroupDragLeave(event)" ondrop="handleGroupDrop(event, '${encodedTitle}', '${escapeJs(destinationId)}')">
        <button type="button" class="grouped-indicator-section-header group-toggle-btn admin-group-draggable" onclick="toggleGroupVisibility('center', '${escapeJs(destinationId)}', '${encodedTitle}')" draggable="true" ondragstart="handleGroupDragStart(event, '${escapeJs(destinationId)}', '${encodedTitle}')" ondragend="handleGroupDragEnd(event)">
          <div class="grouped-indicator-section-title">
            <span class="group-drag-handle" title="Arrastrar grupo para ordenar">⋮⋮</span>
            <span class="group-toggle-icon">▾</span>
            <h4>${escapeHtml(group.title)}</h4>
          </div>
          <span class="badge badge-blue">${group.indicators.length} indicador${group.indicators.length !== 1 ? 'es' : ''}</span>
        </button>
        <div class="grouped-indicator-section-body">
          <div class="destination-cards drag-drop-zone" ondragover="handleIndicatorListDragOver(event, '${escapeJs(destinationId)}')" ondragleave="handleIndicatorDragLeave(event)" ondrop="handleIndicatorDropToEnd(event, '${escapeJs(destinationId)}')">
            ${group.indicators.map(ind => {
              const annualMeta = getAnnualCalcMeta(getIndicatorCalcMode(ind));
              return `
                <article
                  class="indicator-overview-card admin-draggable-card"
                  draggable="true"
                  data-destination-id="${escapeHtml(destinationId)}"
                  ondragstart="handleIndicatorDragStart(event, '${ind.id}', '${escapeJs(destinationId)}')"
                  ondragend="handleIndicatorDragEnd(event)"
                  ondragover="handleIndicatorDragOver(event, '${escapeJs(destinationId)}')"
                  ondragleave="handleIndicatorDragLeave(event)"
                  ondrop="handleIndicatorDrop(event, '${ind.id}', '${escapeJs(destinationId)}')"
                >
                  <div class="drag-card-top">
                    <span class="drag-handle" title="Arrastrar para reordenar">⋮⋮</span>
                    <span class="drag-help">Arrastrá para ordenar</span>
                  </div>
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
                    <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); selectIndicator('${ind.id}')">Abrir</button>
                    <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); openEditIndicatorModalById('${ind.id}')">Editar</button>
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

function getIndicatorsForDestination(destinationId) {
  const scoped = destinationId === UNASSIGNED_DESTINATION_ID
    ? indicators.filter(ind => !ind.destination_id)
    : indicators.filter(ind => ind.destination_id === destinationId);

  return [...scoped].sort(compareIndicatorsForOrdering);
}

function clearDragClasses() {
  document.querySelectorAll('.drop-before, .drop-after, .drop-inside, .is-dragging').forEach(el => {
    el.classList.remove('drop-before', 'drop-after', 'drop-inside', 'is-dragging');
  });
}

function handleGroupDragStart(event, destinationId, encodedGroupTitle) {
  groupDragState = { destinationId, groupTitle: decodeURIComponent(encodedGroupTitle) };
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', encodedGroupTitle);
  }
  requestAnimationFrame(() => {
    event.currentTarget.classList.add('is-dragging');
  });
}

function handleGroupDragEnd(event) {
  event.currentTarget.classList.remove('is-dragging');
  clearDragClasses();
  groupDragState = { destinationId: '', groupTitle: '' };
}

function canHandleGroupDrop(destinationId) {
  return Boolean(groupDragState.groupTitle) && groupDragState.destinationId === destinationId;
}

function handleGroupDragOver(event, destinationId) {
  if (!canHandleGroupDrop(destinationId)) return;
  event.preventDefault();
  const target = event.currentTarget;
  const rect = target.getBoundingClientRect();
  const insertAfter = event.clientY > rect.top + rect.height / 2;
  target.classList.add(insertAfter ? 'drop-after' : 'drop-before');
  target.classList.remove(insertAfter ? 'drop-before' : 'drop-after');
}

function handleGroupDragLeave(event) {
  event.currentTarget.classList.remove('drop-before', 'drop-after', 'drop-inside');
}

function getOrderedGroupsForDestination(destinationId) {
  return groupIndicatorsByTitle(getIndicatorsForDestination(destinationId));
}

function getReorderedGroupTitles(destinationId, draggedTitle, targetTitle = null, insertAfter = false) {
  const orderedTitles = getOrderedGroupsForDestination(destinationId).map(group => group.title).filter(title => title !== draggedTitle);
  if (!targetTitle) {
    orderedTitles.push(draggedTitle);
    return orderedTitles;
  }

  const targetIndex = orderedTitles.indexOf(targetTitle);
  if (targetIndex === -1) {
    orderedTitles.push(draggedTitle);
    return orderedTitles;
  }

  orderedTitles.splice(insertAfter ? targetIndex + 1 : targetIndex, 0, draggedTitle);
  return orderedTitles;
}

async function persistGroupOrder(destinationId, orderedGroupTitles) {
  const scopedIndicators = getIndicatorsForDestination(destinationId);
  const groupedMap = new Map(groupIndicatorsByTitle(scopedIndicators).map(group => [group.title, group.indicators]));
  const flattenedIndicators = [];

  orderedGroupTitles.forEach(title => {
    const groupItems = groupedMap.get(title) || [];
    groupItems.forEach(indicator => flattenedIndicators.push(indicator));
  });

  if (!flattenedIndicators.length) return;

  const orderedIds = flattenedIndicators.map(indicator => indicator.id);
  await persistIndicatorOrder(destinationId, orderedIds);
}

async function handleGroupDrop(event, encodedTargetGroupTitle, destinationId) {
  if (!canHandleGroupDrop(destinationId)) return;
  event.preventDefault();
  event.stopPropagation();
  const targetTitle = decodeURIComponent(encodedTargetGroupTitle);
  const rect = event.currentTarget.getBoundingClientRect();
  const insertAfter = event.clientY > rect.top + rect.height / 2;
  const orderedGroupTitles = getReorderedGroupTitles(destinationId, groupDragState.groupTitle, targetTitle, insertAfter);
  clearDragClasses();
  await persistGroupOrder(destinationId, orderedGroupTitles);
  groupDragState = { destinationId: '', groupTitle: '' };
}

function handleIndicatorDragStart(event, indicatorId, destinationId) {
  dragState = { indicatorId, destinationId };
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', indicatorId);
  }
  requestAnimationFrame(() => {
    event.currentTarget.classList.add('is-dragging');
  });
}

function handleIndicatorDragEnd(event) {
  event.currentTarget.classList.remove('is-dragging');
  clearDragClasses();
  dragState = { indicatorId: '', destinationId: '' };
}

function canHandleIndicatorDrop(destinationId) {
  return Boolean(dragState.indicatorId) && dragState.destinationId === destinationId;
}

function handleIndicatorDragOver(event, destinationId) {
  if (!canHandleIndicatorDrop(destinationId)) return;
  event.preventDefault();
  const target = event.currentTarget;
  const rect = target.getBoundingClientRect();
  const insertAfter = event.clientY > rect.top + rect.height / 2;
  target.classList.add(insertAfter ? 'drop-after' : 'drop-before');
  target.classList.remove(insertAfter ? 'drop-before' : 'drop-after');
}

function handleIndicatorDragLeave(event) {
  event.currentTarget.classList.remove('drop-before', 'drop-after', 'drop-inside');
}

function handleIndicatorListDragOver(event, destinationId) {
  if (!canHandleIndicatorDrop(destinationId)) return;
  event.preventDefault();
  event.currentTarget.classList.add('drop-inside');
}

function getReorderedIndicatorIds(destinationId, draggedId, targetId = null, insertAfter = false) {
  const orderedIds = getIndicatorsForDestination(destinationId).map(ind => ind.id).filter(id => id !== draggedId);
  if (!targetId) {
    orderedIds.push(draggedId);
    return orderedIds;
  }

  const targetIndex = orderedIds.indexOf(targetId);
  if (targetIndex === -1) {
    orderedIds.push(draggedId);
    return orderedIds;
  }

  orderedIds.splice(insertAfter ? targetIndex + 1 : targetIndex, 0, draggedId);
  return orderedIds;
}

async function persistIndicatorOrder(destinationId, orderedIds) {
  const relevantDestinationId = destinationId === UNASSIGNED_DESTINATION_ID ? null : destinationId;
  const orderMap = new Map(orderedIds.map((id, index) => [id, index]));

  indicators = indicators.map(ind => {
    if ((ind.destination_id || null) !== relevantDestinationId || !orderMap.has(ind.id)) return ind;
    return { ...ind, sort_order: orderMap.get(ind.id) };
  });

  currentDestinationIndicators = currentDestination ? getIndicatorsForDestination(currentDestination.id) : [];
  if (currentDestination?.id === destinationId) {
    if (document.getElementById('destinationOverview').style.display !== 'none') {
      showCurrentDestinationOverview();
    } else {
      renderSidebar();
    }
  } else {
    renderSidebar();
  }

  try {
    await updateIndicatorsSortOrder(relevantDestinationId, orderedIds);
  } catch (error) {
    toast('No pude guardar el nuevo orden: ' + error.message, 'error');
    await loadCoreData({ keepSelection: true });
  }
}

async function handleIndicatorDrop(event, targetIndicatorId, destinationId) {
  if (!canHandleIndicatorDrop(destinationId)) return;
  event.preventDefault();
  event.stopPropagation();
  const rect = event.currentTarget.getBoundingClientRect();
  const insertAfter = event.clientY > rect.top + event.currentTarget.offsetHeight / 2;
  const orderedIds = getReorderedIndicatorIds(destinationId, dragState.indicatorId, targetIndicatorId, insertAfter);
  clearDragClasses();
  await persistIndicatorOrder(destinationId, orderedIds);
  dragState = { indicatorId: '', destinationId: '' };
}

async function handleIndicatorDropToEnd(event, destinationId) {
  if (!canHandleIndicatorDrop(destinationId)) return;
  event.preventDefault();
  event.stopPropagation();
  clearDragClasses();
  const orderedIds = getReorderedIndicatorIds(destinationId, dragState.indicatorId);
  await persistIndicatorOrder(destinationId, orderedIds);
  dragState = { indicatorId: '', destinationId: '' };
}

function getUniqueMetricOptions() {
  const byKey = new Map();
  indicators.forEach(ind => {
    const key = getMetricKey(ind);
    if (!key) return;
    if (!byKey.has(key)) {
      byKey.set(key, { key, label: ind.name, unit: ind.unit || '', count: 0 });
    }
    byKey.get(key).count += 1;
  });
  return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'));
}

function renderSidebar() {
  const destinationList = document.getElementById('destinationList');
  const allDestinations = getRenderableDestinations();
  destinationList.innerHTML = allDestinations.length
    ? allDestinations.map(dest => {
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
      }).join('')
    : '<div class="sidebar-hint">No hay destinos cargados.</div>';

  const sidebarList = document.getElementById('sidebarList');
  if (!currentDestination) {
    sidebarList.innerHTML = '<div class="sidebar-hint">Seleccioná un destino para administrar sus indicadores.</div>';
    return;
  }

  const items = getIndicatorsForDestination(currentDestination.id);
  sidebarList.innerHTML = items.length
    ? renderGroupedSidebarIndicators(items, currentDestination.id)
    : '<div class="sidebar-hint">Este destino todavía no tiene indicadores.</div>';
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
      // la administración sigue operativa aunque falle esta capa visual
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

async function selectDestination(destinationId) {
  currentDestination = getDestinationById(destinationId);
  if (!currentDestination) return;

  if (currentIndicator && currentIndicator.destination_id !== (destinationId === UNASSIGNED_DESTINATION_ID ? null : destinationId)) {
    currentIndicator = null;
    destroyCharts();
  }

  await hydrateDestinationDataStatus(destinationId);
  renderSidebar();
  showCurrentDestinationOverview();
}

function showCurrentDestinationOverview() {
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
  document.getElementById('destinationSubtitle').textContent = isPseudoDestination(currentDestination)
    ? 'Indicadores que quedaron sin destino asignado. Podés reasignarlos desde cada indicador o borrarlos si no sirven.'
    : items.length
      ? 'Podés editar el destino, crear indicadores nuevos o entrar al detalle de cualquiera.'
      : 'Todavía no hay indicadores asociados a este destino.';
  const editDestinationAction = document.getElementById('editDestinationAction');
  const duplicateDestinationAction = document.getElementById('duplicateDestinationAction');
  if (editDestinationAction) editDestinationAction.style.display = isPseudoDestination(currentDestination) ? 'none' : 'inline-flex';
  if (duplicateDestinationAction) duplicateDestinationAction.style.display = isPseudoDestination(currentDestination) ? 'none' : 'inline-flex';
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
}

async function selectIndicator(id, { silent = false } = {}) {
  currentIndicator = indicators.find(i => i.id === id);
  if (!currentIndicator) return;

  const destinationId = currentIndicator.destination_id || UNASSIGNED_DESTINATION_ID;
  ensureIndicatorGroupExpanded(currentIndicator, destinationId);
  currentDestination = getDestinationById(destinationId);
  currentDestinationIndicators = getIndicatorsForDestination(destinationId);
  renderSidebar();

  try {
    const destinationIds = currentDestinationIndicators.map(ind => ind.id);
    const allPoints = await fetchDataPointsForIndicators(destinationIds);
    currentDataByIndicator = buildDataByIndicator(allPoints);
    const presence = buildPresenceFromPoints(allPoints);
    applyPresenceToIndicators(destinationIds, presence);
    currentDataPoints = currentDataByIndicator[currentIndicator.id] || [];
    currentIndicator.has_data = currentDataPoints.length > 0;
    renderSidebar();
    currentDataByYear = buildDataByYear(currentDataPoints);
    currentDataMetaByYear = buildDataPointMetaByYear(currentDataPoints);
    currentRelatedSeriesMap = buildRelatedSeriesMapForDestination(currentIndicator, currentDestinationIndicators, currentDataByIndicator);
    currentYearlyStats = calcYearlyStats(currentDataByYear, {
      indicator: currentIndicator,
      relatedSeriesMap: currentRelatedSeriesMap,
    });
    renderDashboard();
    document.getElementById('mainEmpty').style.display = 'none';
    document.getElementById('destinationOverview').style.display = 'none';
    document.getElementById('mainView').style.display = 'block';
  } catch (e) {
    if (!silent) toast('Error cargando datos: ' + e.message, 'error');
  }
}

function renderDashboard() {
  const years = Object.keys(currentDataByYear).map(Number).sort((a, b) => a - b);
  const annualMeta = getAnnualCalcMeta(getIndicatorCalcMode(currentIndicator));
  const allVals = currentDataPoints.map(d => Number(d.value)).filter(v => !isNaN(v));
  const gs = calcStats(allVals);
  const lastYear = years[years.length - 1];
  const lastStats = lastYear ? currentYearlyStats[lastYear] : null;

  document.getElementById('viewTitle').textContent = currentIndicator.name;
  document.getElementById('viewDesc').textContent = currentIndicator.description || '';
  document.getElementById('viewDestinationBadge').textContent = currentDestination ? getDestinationDisplayName(currentDestination) : 'Sin destino';
  document.getElementById('statsUnit').textContent = currentIndicator.unit || 'unidades';
  document.getElementById('yearsCount').textContent = years.length + ' año' + (years.length !== 1 ? 's' : '');
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

  const kpis = [
    { label: 'Promedio mensual', value: formatNumber(gs?.mean), sub: 'Histórico global', accent: 'var(--accent)' },
    { label: `${annualMeta.shortLabel} ${lastYear || '—'}`, value: formatNumber(lastStats?.annualValue), change: lastStats?.yoyAnnual, accent: '#10B981' },
    { label: 'Máximo mensual', value: formatNumber(gs?.max), sub: 'Histórico', accent: '#A855F7' },
    { label: 'Mínimo mensual', value: formatNumber(gs?.min), sub: 'Histórico', accent: '#F97316' },
    { label: 'Mediana mensual', value: formatNumber(gs?.median), sub: 'Histórico global', accent: '#06B6D4' },
    { label: 'Desvío estándar', value: formatNumber(gs?.stdDev), sub: 'Variabilidad', accent: '#EAB308' },
  ];

  document.getElementById('kpiGrid').innerHTML = kpis.map(k => `
    <div class="kpi-card" style="--accent-color:${k.accent}">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value">${k.value}</div>
      ${k.change !== undefined && k.change !== null ? `<div class="kpi-change ${k.change >= 0 ? 'up' : 'down'}">${k.change >= 0 ? '▲' : '▼'} ${formatPct(k.change)}</div>` : k.sub ? `<div class="kpi-sub">${k.sub}</div>` : ''}
    </div>
  `).join('');

  destroyCharts();
  renderLineChart('lineChart', currentDataByYear, currentIndicator, currentDataMetaByYear);

  const annualChartCard = document.getElementById('annualChartCard');
  if (currentIndicator.annual_chart_visible === false || getIndicatorCalcMode(currentIndicator) === 'none') {
    annualChartCard.style.display = 'none';
  } else {
    annualChartCard.style.display = 'block';
    renderBarChart('barChart', currentYearlyStats, currentIndicator);
  }

  const tbody = document.getElementById('statsBody');
  tbody.innerHTML = years.map(yr => {
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

function showEmptyState() {
  currentDestination = null;
  currentIndicator = null;
  destroyCharts();
  renderSidebar();
  document.getElementById('mainEmpty').style.display = 'block';
  document.getElementById('destinationOverview').style.display = 'none';
  document.getElementById('mainView').style.display = 'none';
}

function populateDestinationSelect(selectedId = '') {
  const select = document.getElementById('indDestination');
  const options = destinations.map(dest => `<option value="${dest.id}">${escapeHtml(getDestinationDisplayName(dest))}</option>`).join('');
  select.innerHTML = `<option value="">Seleccionar destino</option>${options}`;
  select.value = selectedId || currentDestination?.id || '';
}

function populateMetricControls(currentValue = '') {
  const options = getUniqueMetricOptions();
  document.getElementById('metricKeySuggestions').innerHTML = options.map(opt => `<option value="${escapeHtml(opt.key)}">`).join('');
  if (!currentValue) {
    const nameValue = document.getElementById('indName').value.trim();
    document.getElementById('indMetricKey').value = nameValue ? slugify(nameValue) : '';
  }

  const buildSelectOptions = (selectedValue) => {
    const base = ['<option value="">Seleccionar</option>'];
    const seen = new Set();
    options.forEach(opt => {
      if (seen.has(opt.key)) return;
      seen.add(opt.key);
      base.push(`<option value="${escapeHtml(opt.key)}" ${selectedValue === opt.key ? 'selected' : ''}>${escapeHtml(opt.label)} · ${escapeHtml(opt.key)}</option>`);
    });
    if (selectedValue && !seen.has(selectedValue)) {
      base.push(`<option value="${escapeHtml(selectedValue)}" selected>${escapeHtml(selectedValue)}</option>`);
    }
    return base.join('');
  };

  const numerator = document.getElementById('indFormulaNumerator').dataset.current || '';
  const denominator = document.getElementById('indFormulaDenominator').dataset.current || '';
  document.getElementById('indFormulaNumerator').innerHTML = buildSelectOptions(numerator);
  document.getElementById('indFormulaDenominator').innerHTML = buildSelectOptions(denominator);
}

function populateGroupTitleSuggestions(selectedValue = '', destinationId = '') {
  const datalist = document.getElementById('groupTitleSuggestions');
  const scopedIndicators = destinationId && destinationId !== UNASSIGNED_DESTINATION_ID
    ? indicators.filter(ind => ind.destination_id === destinationId)
    : indicators;
  const titles = [...new Set(scopedIndicators.map(ind => (ind.group_title || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  datalist.innerHTML = titles.map(title => `<option value="${escapeHtml(title)}">`).join('');
  if (selectedValue) {
    document.getElementById('indGroupTitle').value = selectedValue;
  }
}

function populateAnnualModeSelect(selectedMode = 'sum') {
  const select = document.getElementById('indAnnualCalcMode');
  select.innerHTML = Object.entries(ANNUAL_CALC_OPTIONS).map(([value, meta]) => `<option value="${value}" ${selectedMode === value ? 'selected' : ''}>${meta.label}</option>`).join('');
  document.getElementById('annualModeDescription').textContent = getAnnualCalcMeta(selectedMode).description;
}

function toggleFormulaFields() {
  const mode = document.getElementById('indAnnualCalcMode').value;
  document.getElementById('ratioFormulaFields').style.display = mode === 'ratio_of_sums' ? 'block' : 'none';
  document.getElementById('annualModeDescription').textContent = getAnnualCalcMeta(mode).description;
}


function populateDestinationCopySource(selectedId = '') {
  const select = document.getElementById('destinationCopySource');
  if (!select) return;
  const options = destinations
    .filter(dest => dest.id !== UNASSIGNED_DESTINATION_ID)
    .map(dest => {
      const count = getIndicatorsForDestination(dest.id).length;
      return `<option value="${dest.id}">${escapeHtml(getDestinationDisplayName(dest))} · ${count} indicador${count !== 1 ? 'es' : ''}</option>`;
    })
    .join('');
  select.innerHTML = `<option value="">Seleccionar destino base</option>${options}`;
  select.value = selectedId || '';
}

function toggleDestinationCopyFields() {
  const enabled = document.getElementById('destinationCopyEnabled')?.checked === true;
  const wrap = document.getElementById('destinationCopySourceWrap');
  if (wrap) wrap.style.display = enabled ? 'block' : 'none';
}

function resetDestinationDuplicateControls({ enabled = false, selectedSourceId = '', visible = true } = {}) {
  const section = document.getElementById('destinationDuplicateSection');
  const checkbox = document.getElementById('destinationCopyEnabled');
  if (section) section.style.display = visible ? 'block' : 'none';
  if (checkbox) checkbox.checked = enabled;
  populateDestinationCopySource(selectedSourceId);
  toggleDestinationCopyFields();
}

function openDuplicateDestinationModal(sourceDestinationId = '') {
  const sourceId = sourceDestinationId || (currentDestination?.id !== UNASSIGNED_DESTINATION_ID ? currentDestination?.id : '');
  document.getElementById('destinationModalTitle').textContent = 'Duplicar destino';
  document.getElementById('destinationId').value = '';
  document.getElementById('destinationName').value = '';
  document.getElementById('destinationName').placeholder = 'Nombre del nuevo destino';
  document.getElementById('destinationOrder').value = '';
  document.getElementById('deleteDestinationBtn').style.display = 'none';
  resetDestinationDuplicateControls({ enabled: true, selectedSourceId: sourceId, visible: true });
  document.getElementById('destinationModal').classList.add('open');
}

function openDestinationModal() {
  document.getElementById('destinationModalTitle').textContent = 'Nuevo destino';
  document.getElementById('destinationId').value = '';
  document.getElementById('destinationName').value = '';
  document.getElementById('destinationName').placeholder = 'Ej: Bahía Blanca';
  document.getElementById('destinationOrder').value = '';
  document.getElementById('deleteDestinationBtn').style.display = 'none';
  resetDestinationDuplicateControls({ enabled: false, selectedSourceId: currentDestination?.id !== UNASSIGNED_DESTINATION_ID ? currentDestination?.id : '', visible: true });
  document.getElementById('destinationModal').classList.add('open');
}

function openEditDestinationModal() {
  if (!currentDestination) return;

  if (isPseudoDestination(currentDestination)) {
    document.getElementById('destinationModalTitle').textContent = 'Editar “Sin destino”';
    document.getElementById('destinationId').value = UNASSIGNED_DESTINATION_ID;
    document.getElementById('destinationName').value = '';
    document.getElementById('destinationName').placeholder = 'Nombre del destino real para estos indicadores';
    document.getElementById('destinationOrder').value = '';
    document.getElementById('deleteDestinationBtn').style.display = 'inline-flex';
    resetDestinationDuplicateControls({ enabled: false, selectedSourceId: '', visible: false });
    document.getElementById('destinationModal').classList.add('open');
    return;
  }

  document.getElementById('destinationModalTitle').textContent = 'Editar destino';
  document.getElementById('destinationId').value = currentDestination.id;
  document.getElementById('destinationName').value = String(currentDestination.name || '').trim();
  document.getElementById('destinationName').placeholder = 'Ej: Mar del Plata';
  document.getElementById('destinationOrder').value = currentDestination.sort_order ?? '';
  document.getElementById('deleteDestinationBtn').style.display = 'inline-flex';
  resetDestinationDuplicateControls({ enabled: false, selectedSourceId: '', visible: false });
  document.getElementById('destinationModal').classList.add('open');
}

function closeDestinationModal() {
  document.getElementById('destinationModal').classList.remove('open');
}

async function saveDestination() {
  const id = document.getElementById('destinationId').value;
  const name = normalizeDestinationName(document.getElementById('destinationName').value);
  const sortOrder = document.getElementById('destinationOrder').value;
  const copyEnabled = !id && document.getElementById('destinationCopyEnabled')?.checked === true;
  const sourceDestinationId = copyEnabled ? document.getElementById('destinationCopySource')?.value : '';
  if (!name) { toast('El nombre del destino es obligatorio', 'error'); return; }
  if (copyEnabled && !sourceDestinationId) { toast('Seleccioná el destino base para copiar la estructura.', 'error'); return; }

  let createdDestination = null;
  try {
    let copiedIndicators = [];
    if (id === UNASSIGNED_DESTINATION_ID) {
      createdDestination = await createDestination(name, sortOrder === '' ? null : Number(sortOrder));
      const movedCount = await moveUnassignedIndicatorsToDestination(createdDestination.id);
      toast(`“Sin destino” convertido en “${getDestinationDisplayName(createdDestination)}” con ${movedCount} indicador${movedCount !== 1 ? 'es' : ''}.`, 'success');
    } else if (id) {
      await updateDestination(id, { name, sort_order: sortOrder === '' ? null : Number(sortOrder) });
      toast('Destino actualizado', 'success');
    } else {
      createdDestination = await createDestination(name, sortOrder === '' ? null : Number(sortOrder));
      if (copyEnabled) {
        try {
          copiedIndicators = await duplicateIndicatorsToDestination(sourceDestinationId, createdDestination.id);
        } catch (copyError) {
          await deleteIndicatorsForDestination(createdDestination.id).catch(() => {});
          await deleteDestination(createdDestination.id).catch(() => {});
          throw copyError;
        }
        toast(`Destino creado con ${copiedIndicators.length} indicador${copiedIndicators.length !== 1 ? 'es' : ''} copiado${copiedIndicators.length !== 1 ? 's' : ''}.`, 'success');
      } else {
        toast('Destino creado', 'success');
      }
    }
    closeDestinationModal();
    await loadCoreData({ keepSelection: false });
    const targetId = createdDestination?.id || destinations.find(d => normalizeDestinationName(d.name).toLowerCase() === name.toLowerCase())?.id;
    if (targetId) await selectDestination(targetId);
  } catch (e) {
    toast('Error guardando destino: ' + e.message, 'error');
  }
}

async function deleteCurrentDestination() {
  if (!currentDestination) return;
  if (isPseudoDestination(currentDestination)) {
    const linkedIndicators = getIndicatorsForDestination(UNASSIGNED_DESTINATION_ID);
    const message = linkedIndicators.length
      ? `¿Eliminar completamente “Sin destino”?\n\nSe eliminarán ${linkedIndicators.length} indicador${linkedIndicators.length !== 1 ? 'es' : ''} sin destino y todos sus datos asociados. Esta acción no se puede deshacer.`
      : '¿Eliminar “Sin destino”? No tiene indicadores asociados.';
    if (!confirm(message)) return;

    try {
      await deleteUnassignedIndicators();
      closeDestinationModal();
      currentDestination = null;
      currentIndicator = null;
      await loadCoreData({ keepSelection: false });
      toast('“Sin destino” eliminado completamente', 'success');
    } catch (e) {
      toast('Error eliminando “Sin destino”: ' + e.message, 'error');
    }
    return;
  }

  const linkedIndicators = getIndicatorsForDestination(currentDestination.id);
  let withDataCount = 0;
  try {
    const ids = linkedIndicators.map(ind => ind.id);
    const presence = await fetchIndicatorsWithData(ids);
    withDataCount = presence.size;
  } catch (e) {
    withDataCount = -1;
  }

  let message = `¿Eliminar el destino “${getDestinationDisplayName(currentDestination)}”?`;
  const shouldDeleteEmptyIndicators = linkedIndicators.length > 0 && withDataCount === 0;
  if (linkedIndicators.length && withDataCount === 0) {
    message += `

Tiene ${linkedIndicators.length} indicador${linkedIndicators.length !== 1 ? 'es' : ''} sin datos cargados. Se eliminarán también esos indicadores para no dejar basura en “Sin destino”.`;
  } else if (linkedIndicators.length && withDataCount > 0) {
    message += `

Tiene ${linkedIndicators.length} indicador${linkedIndicators.length !== 1 ? 'es' : ''}, de los cuales ${withDataCount} tienen datos. Se eliminará solo el destino; los indicadores y sus datos quedarán en “Sin destino” para no perder información.`;
  } else if (linkedIndicators.length) {
    message += `

No pude verificar si sus indicadores tienen datos. Por seguridad se eliminará solo el destino; los indicadores quedarán en “Sin destino”.`;
  }
  if (!confirm(message)) return;

  try {
    if (shouldDeleteEmptyIndicators) {
      await deleteIndicatorsForDestination(currentDestination.id);
    }
    await deleteDestination(currentDestination.id);
    closeDestinationModal();
    currentDestination = null;
    currentIndicator = null;
    await loadCoreData({ keepSelection: false });
    toast('Destino eliminado', 'success');
  } catch (e) {
    toast('Error eliminando destino: ' + e.message, 'error');
  }
}

function resetIndicatorForm() {
  document.getElementById('indicatorId').value = '';
  document.getElementById('indName').value = '';
  document.getElementById('indUnit').value = '';
  document.getElementById('indDesc').value = '';
  document.getElementById('indMetricKey').value = '';
  document.getElementById('indGroupTitle').value = '';
  document.getElementById('indMethodologyNote').value = '';
  document.getElementById('indAnnualChartVisible').checked = true;
  document.getElementById('indFormulaMultiplier').value = '1';
  document.getElementById('indFormulaNumerator').dataset.current = '';
  document.getElementById('indFormulaDenominator').dataset.current = '';
  document.getElementById('indicatorTemplateSelect').value = '';
}

function populateIndicatorTemplateSelect(selectedId = '') {
  const select = document.getElementById('indicatorTemplateSelect');
  const groups = new Map();
  indicators.forEach(ind => {
    const destinationName = ind.destination ? getDestinationDisplayName(ind.destination) : 'Sin destino';
    if (!groups.has(destinationName)) groups.set(destinationName, []);
    groups.get(destinationName).push(ind);
  });

  const groupHtml = [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'es'))
    .map(([destinationName, items]) => {
      const options = items
        .sort((a, b) => a.name.localeCompare(b.name, 'es'))
        .map(ind => `<option value="${ind.id}">${escapeHtml(ind.name)}${ind.unit ? ` · ${escapeHtml(ind.unit)}` : ''}${getMetricKey(ind) ? ` · ${escapeHtml(getMetricKey(ind))}` : ''}</option>`)
        .join('');
      return `<optgroup label="${escapeHtml(destinationName)}">${options}</optgroup>`;
    })
    .join('');

  select.innerHTML = `<option value="">Escribir todo desde cero</option>${groupHtml}`;
  select.value = selectedId || '';
}

function applyIndicatorTemplate() {
  const templateId = document.getElementById('indicatorTemplateSelect').value;
  if (!templateId) {
    toast('Seleccioná un indicador base o seguí cargando todo desde cero.', 'error');
    return;
  }

  const template = indicators.find(ind => ind.id === templateId);
  if (!template) {
    toast('No encontré el indicador base seleccionado.', 'error');
    return;
  }

  const destinationToKeep = document.getElementById('indDestination').value || (currentDestination?.id && currentDestination.id !== UNASSIGNED_DESTINATION_ID ? currentDestination.id : '');
  document.getElementById('indName').value = template.name || '';
  document.getElementById('indUnit').value = template.unit || '';
  document.getElementById('indDesc').value = template.description || '';
  document.getElementById('indMetricKey').value = getMetricKey(template);
  document.getElementById('indGroupTitle').value = template.group_title || '';
  document.getElementById('indMethodologyNote').value = getMethodologyNote(template);
  document.getElementById('indAnnualChartVisible').checked = template.annual_chart_visible !== false;
  document.getElementById('indFormulaMultiplier').value = template.formula_multiplier ?? 1;
  document.getElementById('indFormulaNumerator').dataset.current = template.formula_numerator_key || '';
  document.getElementById('indFormulaDenominator').dataset.current = template.formula_denominator_key || '';
  populateAnnualModeSelect(template.annual_calc_mode || 'sum');
  populateMetricControls(getMetricKey(template));
  toggleFormulaFields();
  populateDestinationSelect(destinationToKeep);
  populateGroupTitleSuggestions(template.group_title || '', destinationToKeep);
  toast('Base copiada. Ahora ajustá el nombre o lo que necesites.', 'success');
}

function clearIndicatorTemplateSelection() {
  const destinationToKeep = document.getElementById('indDestination').value || (currentDestination?.id && currentDestination.id !== UNASSIGNED_DESTINATION_ID ? currentDestination.id : '');
  resetIndicatorForm();
  populateIndicatorTemplateSelect('');
  populateDestinationSelect(destinationToKeep);
  populateGroupTitleSuggestions('', destinationToKeep);
  populateAnnualModeSelect('sum');
  populateMetricControls();
  toggleFormulaFields();
}

function openNewIndicatorModal() {
  resetIndicatorForm();
  document.getElementById('indicatorTemplateSection').style.display = 'block';
  populateIndicatorTemplateSelect('');
  populateDestinationSelect(currentDestination?.id && currentDestination.id !== UNASSIGNED_DESTINATION_ID ? currentDestination.id : '');
  populateGroupTitleSuggestions('', currentDestination?.id && currentDestination.id !== UNASSIGNED_DESTINATION_ID ? currentDestination.id : '');
  populateAnnualModeSelect('sum');
  populateMetricControls();
  toggleFormulaFields();
  document.getElementById('indicatorModalTitle').textContent = 'Nuevo indicador';
  document.getElementById('deleteIndBtn').style.display = 'none';
  document.getElementById('indicatorModal').classList.add('open');
}

function openEditIndicatorModal() {
  if (!currentIndicator) return;
  document.getElementById('indicatorTemplateSection').style.display = 'none';
  document.getElementById('indicatorModalTitle').textContent = 'Editar indicador';
  document.getElementById('indicatorId').value = currentIndicator.id;
  document.getElementById('indName').value = currentIndicator.name;
  document.getElementById('indUnit').value = currentIndicator.unit || '';
  document.getElementById('indDesc').value = currentIndicator.description || '';
  document.getElementById('indMetricKey').value = getMetricKey(currentIndicator);
  document.getElementById('indGroupTitle').value = currentIndicator.group_title || '';
  document.getElementById('indMethodologyNote').value = getMethodologyNote(currentIndicator);
  document.getElementById('indAnnualChartVisible').checked = currentIndicator.annual_chart_visible !== false;
  document.getElementById('indFormulaMultiplier').value = currentIndicator.formula_multiplier ?? 1;
  document.getElementById('indFormulaNumerator').dataset.current = currentIndicator.formula_numerator_key || '';
  document.getElementById('indFormulaDenominator').dataset.current = currentIndicator.formula_denominator_key || '';
  populateIndicatorTemplateSelect('');
  populateDestinationSelect(currentIndicator.destination_id || '');
  populateGroupTitleSuggestions(currentIndicator.group_title || '', currentIndicator.destination_id || '');
  populateAnnualModeSelect(currentIndicator.annual_calc_mode || 'sum');
  populateMetricControls(getMetricKey(currentIndicator));
  toggleFormulaFields();
  document.getElementById('deleteIndBtn').style.display = 'inline-flex';
  document.getElementById('indicatorModal').classList.add('open');
}

function openEditIndicatorModalById(id) {
  currentIndicator = indicators.find(i => i.id === id) || currentIndicator;
  openEditIndicatorModal();
}

function closeIndicatorModal() {
  document.getElementById('indicatorModal').classList.remove('open');
}

document.addEventListener('input', (event) => {
  if (event.target?.id === 'indName') {
    const metricInput = document.getElementById('indMetricKey');
    if (!metricInput.value.trim()) {
      metricInput.value = slugify(event.target.value);
    }
  }
});

document.addEventListener('change', (event) => {
  if (event.target?.id === 'indDestination') {
    populateGroupTitleSuggestions(document.getElementById('indGroupTitle').value.trim(), event.target.value);
  }
});

async function saveIndicator() {
  const id = document.getElementById('indicatorId').value;
  const payload = {
    destination_id: document.getElementById('indDestination').value,
    name: document.getElementById('indName').value.trim(),
    unit: document.getElementById('indUnit').value.trim(),
    description: document.getElementById('indDesc').value.trim(),
    metric_key: document.getElementById('indMetricKey').value.trim() || slugify(document.getElementById('indName').value.trim()),
    group_title: document.getElementById('indGroupTitle').value.trim(),
    methodology_note: document.getElementById('indMethodologyNote').value.trim(),
    annual_calc_mode: document.getElementById('indAnnualCalcMode').value,
    annual_chart_visible: document.getElementById('indAnnualChartVisible').checked,
    formula_numerator_key: document.getElementById('indFormulaNumerator').value,
    formula_denominator_key: document.getElementById('indFormulaDenominator').value,
    formula_multiplier: document.getElementById('indFormulaMultiplier').value,
  };

  if (!payload.destination_id) { toast('Elegí un destino para el indicador.', 'error'); return; }
  if (!payload.name) { toast('El nombre es obligatorio.', 'error'); return; }
  if (payload.annual_calc_mode === 'ratio_of_sums' && (!payload.formula_numerator_key || !payload.formula_denominator_key)) {
    toast('Para recalcular por fórmula anual necesitás numerador y denominador.', 'error');
    return;
  }

  const movingDestination = id && currentIndicator && (currentIndicator.destination_id || '') !== (payload.destination_id || '');
  payload.sort_order = id
    ? (movingDestination ? getNextSortOrderForDestination(payload.destination_id, id) : (currentIndicator?.sort_order ?? getNextSortOrderForDestination(payload.destination_id, id)))
    : getNextSortOrderForDestination(payload.destination_id);

  try {
    if (id) {
      await updateIndicator(id, payload);
      toast('Indicador actualizado', 'success');
    } else {
      await createIndicator(payload);
      toast('Indicador creado', 'success');
    }
    closeIndicatorModal();
    await loadCoreData({ keepSelection: false });
    await selectDestination(payload.destination_id);
  } catch (e) {
    toast('Error guardando indicador: ' + e.message, 'error');
  }
}

async function deleteCurrentIndicator() {
  if (!currentIndicator) return;
  if (!confirm('¿Eliminar este indicador y todos sus datos? Esta acción no se puede deshacer.')) return;
  try {
    const destinationId = currentIndicator.destination_id || UNASSIGNED_DESTINATION_ID;
    await deleteIndicator(currentIndicator.id);
    currentIndicator = null;
    closeIndicatorModal();
    await loadCoreData({ keepSelection: false });
    await selectDestination(destinationId);
    toast('Indicador eliminado', 'success');
  } catch (e) {
    toast('Error eliminando indicador: ' + e.message, 'error');
  }
}

function openDataModal() {
  if (!currentIndicator) return;
  const years = Object.keys(currentDataByYear).map(Number).sort((a, b) => a - b);
  gridYears = [...years];
  gridData = {};
  gridMeta = {};
  gridYears.forEach(yr => {
    gridData[yr] = currentDataByYear[yr] ? [...currentDataByYear[yr]] : new Array(12).fill(null);
    gridMeta[yr] = currentDataMetaByYear[yr] ? currentDataMetaByYear[yr].map(meta => meta ? { ...meta } : null) : new Array(12).fill(null);
  });
  document.getElementById('pasteArea').value = '';
  document.getElementById('pasteArea').style.borderColor = '';
  document.getElementById('pasteYear').value = years.length ? years[years.length - 1] : '';
  selectedGridYears = [];
  selectedGridCell = null;
  renderGrid();
  document.getElementById('dataModal').classList.add('open');
}

function closeDataModal() {
  document.getElementById('dataModal').classList.remove('open');
}

function renderGrid() {
  const grid = document.getElementById('monthGrid');
  if (!gridYears.length) {
    grid.innerHTML = '<div class="sidebar-hint" style="grid-column:1/-1;padding:16px 0">No hay años cargados todavía. Escribí un año y agregalo.</div>';
    renderYearDeleteList();
    syncSelectedCellPanel();
    return;
  }

  let html = `<div class="month-grid-header"><div></div>${MONTHS.map(m => `<div>${m.slice(0,3)}</div>`).join('')}</div>`;
  gridYears.forEach(yr => {
    html += `<div class="month-grid-row">
      <div class="year-label">${yr}</div>
      ${new Array(12).fill(0).map((_, mi) => {
        const meta = gridMeta?.[yr]?.[mi] || null;
        const hasAnnotation = hasDataPointAnnotation(meta);
        const selected = selectedGridCell?.year === yr && selectedGridCell?.monthIndex === mi;
        const rawValue = gridData[yr]?.[mi];
        const displayValue = rawValue === null || rawValue === undefined ? '' : rawValue;
        return `
        <div class="month-cell-wrap ${hasAnnotation ? 'has-note' : ''} ${selected ? 'is-selected' : ''}" data-year="${yr}" data-month="${mi}" onclick="selectGridCell(${yr}, ${mi}, false)">
          <input class="month-cell" type="text" inputmode="decimal" id="cell_${yr}_${mi}" value="${displayValue}"
            onchange="handleGridCellChange(${yr}, ${mi}, this.value)"
            onclick="event.stopPropagation(); selectGridCell(${yr}, ${mi}, false)"
            onfocus="selectGridCell(${yr}, ${mi}, false)"
            onkeydown="cellNav(event, ${yr}, ${mi})"/>
          ${hasAnnotation ? `<button type="button" class="month-cell-note-marker" title="${escapeHtml(getDataPointAnnotationText(meta))}" onclick="event.stopPropagation(); selectGridCell(${yr}, ${mi})">*</button>` : ''}
        </div>`;
      }).join('')}
    </div>`;
  });
  grid.innerHTML = html;
  renderYearDeleteList();
  syncSelectedCellPanel();
}

function handleGridCellChange(year, monthIndex, rawValue) {
  gridData[year][monthIndex] = normalizeNumericValue(rawValue);
  const cell = document.getElementById(`cell_${year}_${monthIndex}`);
  if (cell) cell.value = gridData[year][monthIndex] ?? '';
  if (selectedGridCell?.year === year && selectedGridCell?.monthIndex === monthIndex) {
    syncSelectedCellPanel();
  }
}

function updateGridSelectionStyles() {
  document.querySelectorAll('.month-cell-wrap').forEach(node => {
    const year = Number(node.dataset.year);
    const monthIndex = Number(node.dataset.month);
    const active = selectedGridCell?.year === year && selectedGridCell?.monthIndex === monthIndex;
    node.classList.toggle('is-selected', active);
  });
}

function selectGridCell(year, monthIndex, rerender = false) {
  selectedGridCell = { year, monthIndex };
  syncSelectedCellPanel();
  if (rerender) {
    renderGrid();
  } else {
    updateGridSelectionStyles();
  }
}

function syncSelectedCellPanel() {
  const target = document.getElementById('cellNoteTarget');
  const checkbox = document.getElementById('cellNoteProvisional');
  const textarea = document.getElementById('cellNoteObservation');
  if (!target || !checkbox || !textarea) return;

  if (!selectedGridCell) {
    target.textContent = 'Sin celda seleccionada';
    checkbox.checked = false;
    textarea.value = '';
    checkbox.disabled = true;
    textarea.disabled = true;
    return;
  }

  const { year, monthIndex } = selectedGridCell;
  const meta = gridMeta?.[year]?.[monthIndex] || null;
  target.textContent = `${MONTHS[monthIndex]} ${year}`;
  checkbox.disabled = false;
  textarea.disabled = false;
  checkbox.checked = Boolean(meta?.isProvisional);
  textarea.value = String(meta?.observation || '');
}

function applySelectedCellMeta() {
  if (!selectedGridCell) return;
  const { year, monthIndex } = selectedGridCell;
  const checkbox = document.getElementById('cellNoteProvisional');
  const textarea = document.getElementById('cellNoteObservation');
  const nextMeta = {
    isProvisional: checkbox?.checked === true,
    observation: String(textarea?.value || '').trim(),
  };
  if (!gridMeta[year]) gridMeta[year] = new Array(12).fill(null);
  gridMeta[year][monthIndex] = hasDataPointAnnotation(nextMeta) ? nextMeta : null;
  renderGrid();
}

function clearSelectedCellMeta() {
  if (!selectedGridCell) return;
  const { year, monthIndex } = selectedGridCell;
  if (!gridMeta[year]) gridMeta[year] = new Array(12).fill(null);
  gridMeta[year][monthIndex] = null;
  syncSelectedCellPanel();
  renderGrid();
}

function renderMonthlyDataCell(value, meta) {
  const title = getDataPointAnnotationText(meta);
  const suffix = hasDataPointAnnotation(meta) ? '<span class="data-point-flag" aria-hidden="true">*</span>' : '';
  return `<td ${title ? `title="${escapeHtml(title)}"` : ''}>${formatNumber(value)}${suffix}</td>`;
}

function cellNav(event, yr, mi) {
  const yi = gridYears.indexOf(yr);
  if (event.key === 'ArrowRight' && mi < 11) {
    document.getElementById(`cell_${yr}_${mi + 1}`)?.focus();
  } else if (event.key === 'ArrowLeft' && mi > 0) {
    document.getElementById(`cell_${yr}_${mi - 1}`)?.focus();
  } else if (event.key === 'ArrowDown' && yi < gridYears.length - 1) {
    document.getElementById(`cell_${gridYears[yi + 1]}_${mi}`)?.focus();
  } else if (event.key === 'ArrowUp' && yi > 0) {
    document.getElementById(`cell_${gridYears[yi - 1]}_${mi}`)?.focus();
  }
}

function addYearRow() {
  const year = parseInt(document.getElementById('pasteYear').value, 10);
  if (!year || isNaN(year)) {
    toast('Escribí el año que querés agregar.', 'error');
    return;
  }
  if (gridYears.includes(year)) {
    toast('Ese año ya está cargado en la grilla.', 'error');
    return;
  }
  gridYears.push(year);
  gridYears.sort((a, b) => a - b);
  gridData[year] = new Array(12).fill(null);
  gridMeta[year] = new Array(12).fill(null);
  renderGrid();
}

function removeLastYear() {
  if (!gridYears.length) return;
  const removed = gridYears.pop();
  delete gridData[removed];
  delete gridMeta[removed];
  selectedGridYears = selectedGridYears.filter(year => year !== removed);
  if (selectedGridCell?.year === removed) selectedGridCell = null;
  renderGrid();
}

function renderYearDeleteList() {
  const container = document.getElementById('yearDeleteList');
  if (!container) return;
  if (!gridYears.length) {
    container.innerHTML = '<div class="help-text">Todavía no hay años cargados para seleccionar.</div>';
    return;
  }

  const selected = new Set(selectedGridYears.filter(year => gridYears.includes(year)));
  selectedGridYears = [...selected].sort((a, b) => a - b);
  container.innerHTML = gridYears.map(year => {
    const active = selected.has(year);
    return `
      <button type="button" class="year-delete-chip ${active ? 'active' : ''}" onclick="toggleGridYearSelection(${year})">
        <span class="year-delete-chip-marker">${active ? '−' : '+'}</span>
        <span>${year}</span>
      </button>
    `;
  }).join('');
}

function toggleGridYearSelection(year) {
  const next = new Set(selectedGridYears);
  if (next.has(year)) next.delete(year); else next.add(year);
  selectedGridYears = [...next].sort((a, b) => a - b);
  renderYearDeleteList();
}

function removeSelectedYears() {
  if (!selectedGridYears.length) {
    toast('Seleccioná al menos un año para eliminar.', 'error');
    return;
  }
  const yearsToRemove = [...selectedGridYears];
  yearsToRemove.forEach(year => {
    gridYears = gridYears.filter(item => item !== year);
    delete gridData[year];
    delete gridMeta[year];
    if (selectedGridCell?.year === year) selectedGridCell = null;
  });
  selectedGridYears = [];
  selectedGridCell = null;
  renderGrid();
  toast(`Se quitaron ${yearsToRemove.length} año${yearsToRemove.length !== 1 ? 's' : ''} de la grilla. Guardá para confirmar el cambio.`, 'success');
}

function handlePaste() {
  setTimeout(() => {
    const raw = document.getElementById('pasteArea').value;
    parsePasteValues(raw);
  }, 50);
}

function normalizeNumericValue(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const compact = raw.replace(/\s+/g, '');

  if (/^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(compact)) {
    const normalized = compact.replace(/\./g, '').replace(',', '.');
    const num = Number(normalized);
    return Number.isFinite(num) ? num : null;
  }

  if (/^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(compact)) {
    const normalized = compact.replace(/,/g, '');
    const num = Number(normalized);
    return Number.isFinite(num) ? num : null;
  }

  if (compact.includes(',') && !compact.includes('.')) {
    const num = Number(compact.replace(',', '.'));
    return Number.isFinite(num) ? num : null;
  }

  const num = Number(compact);
  return Number.isFinite(num) ? num : null;
}

function splitCompactNumericToken(token) {
  const parts = token.split(/\s{2,}/).map(v => v.trim()).filter(Boolean);
  return parts.length > 1 ? parts : [token.trim()];
}

function extractPastedValues(raw) {
  const normalized = String(raw || '').replace(/\u00A0/g, ' ').trim();
  if (!normalized) return [];

  const hasStructuredSeparators = /[\t;\r\n]/.test(normalized);
  if (hasStructuredSeparators) {
    return normalized
      .split(/[\t;\r\n]+/)
      .flatMap(splitCompactNumericToken)
      .map(v => v.trim())
      .filter(Boolean);
  }

  const commaSeparated = normalized.split(',').map(v => v.trim()).filter(Boolean);
  const looksLikeSimpleCsv = commaSeparated.length > 1 && commaSeparated.every(v => /^-?\d+(?:\.\d+)?$/.test(v));
  if (looksLikeSimpleCsv) return commaSeparated;

  const spaced = normalized
    .split(/\s{2,}|\r?\n/)
    .map(v => v.trim())
    .filter(Boolean);
  if (spaced.length > 1) return spaced;

  const numericMatches = normalized.match(/-?\d+(?:\.\d{3})*(?:,\d+)?|-?\d+(?:\.\d+)?/g);
  return numericMatches ? numericMatches.map(v => v.trim()).filter(Boolean) : [];
}

function parsePasteValues(raw) {
  const values = extractPastedValues(raw);
  window._parsedPaste = values;
  if (values.length) {
    document.getElementById('pasteArea').style.borderColor = 'var(--success)';
    toast(`${values.length} valores detectados. Elegí el año y aplicalos.`, 'success');
  }
}

function applyPaste() {
  const raw = document.getElementById('pasteArea').value;
  parsePasteValues(raw);
  const year = parseInt(document.getElementById('pasteYear').value, 10);
  if (!year || isNaN(year)) { toast('Ingresá un año válido.', 'error'); return; }
  const values = window._parsedPaste || [];
  if (!values.length) { toast('No hay valores para aplicar. Pegá primero los datos.', 'error'); return; }

  if (!gridYears.includes(year)) {
    gridYears.push(year);
    gridYears.sort((a, b) => a - b);
    gridData[year] = new Array(12).fill(null);
    gridMeta[year] = new Array(12).fill(null);
  }
  if (!gridMeta[year]) gridMeta[year] = new Array(12).fill(null);

  values.slice(0, 12).forEach((v, i) => {
    const num = normalizeNumericValue(v);
    gridData[year][i] = num;
  });

  renderGrid();
  document.getElementById('pasteArea').value = '';
  document.getElementById('pasteArea').style.borderColor = '';
  window._parsedPaste = [];
  toast(`Datos de ${year} aplicados. Revisalos y guardá.`, 'success');
}

async function saveData() {
  if (!currentIndicator) return;

  const existingYears = Object.keys(currentDataByYear).map(Number);
  const allYears = [...new Set([...existingYears, ...gridYears])];
  const points = [];

  gridYears.forEach(yr => {
    for (let mi = 0; mi < 12; mi++) {
      const cell = document.getElementById(`cell_${yr}_${mi}`);
      const raw = cell ? cell.value : (gridData[yr]?.[mi] ?? '');
      const val = normalizeNumericValue(raw);
      if (cell) {
        cell.value = val ?? '';
        gridData[yr][mi] = val;
      }
      const meta = gridMeta?.[yr]?.[mi] || null;
      if (val !== null) {
        points.push({
          indicator_id: currentIndicator.id,
          year: yr,
          month: mi + 1,
          value: val,
          is_provisional: meta?.isProvisional === true,
          observation: String(meta?.observation || '').trim(),
        });
      }
    }
  });

  try {
    if (allYears.length) {
      await deleteDataPointsForYears(currentIndicator.id, allYears);
    }
    if (points.length) {
      await upsertDataPoints(points);
    }

    const verifiedPoints = await fetchDataPoints(currentIndicator.id);
    currentDataMetaByYear = buildDataPointMetaByYear(verifiedPoints);
    if (points.length > 0 && verifiedPoints.length === 0) {
      throw new Error('Supabase respondió sin error, pero no devolvió datos persistidos. Reintentá la carga.');
    }

    await refreshIndicatorsDataStatus([currentIndicator.id]);
    const destinationId = currentIndicator.destination_id || UNASSIGNED_DESTINATION_ID;
    await hydrateDestinationDataStatus(destinationId);
    closeDataModal();
    await selectIndicator(currentIndicator.id, { silent: true });
    renderSidebar();
    toast('Datos guardados correctamente ✓', 'success');
  } catch (e) {
    toast('Error guardando: ' + e.message, 'error');
  }
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

function resetComparisonTableSortForYears(years = []) {
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
}

function handleComparisonSortChange() {
  comparisonTableSort.year = document.getElementById('comparisonSortYear')?.value || '';
  comparisonTableSort.direction = document.getElementById('comparisonSortDirection')?.value || 'original';
  if (!comparisonTableSort.year) comparisonTableSort.direction = 'original';
  renderComparisonTable();
}

function renderComparisonTableSortControls(payload) {
  const controls = document.getElementById('comparisonTableSortControls');
  if (!controls) return;
  const years = payload?.years || [];
  resetComparisonTableSortForYears(years);
  if (!years.length) {
    controls.style.display = 'none';
    controls.innerHTML = '';
    return;
  }

  controls.style.display = 'flex';
  controls.innerHTML = `
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
  `;
}

function getComparisonValueForSort(item, year) {
  if (!year) return null;
  const value = item?.yearlyStats?.[Number(year)]?.annualValue;
  return value === null || value === undefined || isNaN(Number(value)) ? null : Number(value);
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

function renderComparisonTable() {
  const payload = currentComparisonTablePayload;
  const table = document.getElementById('comparisonTable');
  if (!payload || !table) return;

  const years = payload.years || [];
  const sortedSeries = getSortedComparisonSeries(payload);
  const activeSortYear = String(comparisonTableSort.year || '');
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
        return `<td class="${isActive ? 'sorted-column' : ''}">${formatNumber(item.yearlyStats?.[year]?.annualValue)}</td>`;
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
    const chartSeries = series.map(item => ({
      label: item.destinationName,
      values: years.map(year => item.yearlyStats?.[year]?.annualValue ?? null),
    }));

    renderComparisonChart('comparisonChart', {
      years,
      series: chartSeries,
      unit: selectedIndicators[0]?.unit || '',
    });

    const annualMeta = getAnnualCalcMeta(getIndicatorCalcMode(selectedIndicators[0]));
    document.getElementById('compareChartTitle').textContent = `${selectedIndicators[0].name} · comparación entre destinos`;
    document.getElementById('compareChartNote').textContent = annualMeta.shortLabel;
    document.getElementById('compareSummaryBadge').textContent = `${selectedIndicators.length} destinos`;

    currentComparisonTablePayload = { years, series, annualMeta };
    comparisonTableSort = { year: '', direction: 'original' };
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
