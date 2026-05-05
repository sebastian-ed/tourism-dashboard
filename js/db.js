// Supabase client
let supabaseClient = null;


const SUPABASE_PAGE_SIZE = 1000;

async function fetchAllPagedRows(buildPageQuery) {
  let from = 0;
  const rows = [];

  while (true) {
    const to = from + SUPABASE_PAGE_SIZE - 1;
    const { data, error } = await buildPageQuery(from, to);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < SUPABASE_PAGE_SIZE) break;
    from += SUPABASE_PAGE_SIZE;
  }

  return rows;
}

function getSupabase() {
  if (!supabaseClient) {
    supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  }
  return supabaseClient;
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

// ── DESTINATIONS ───────────────────────────────────────────
async function fetchDestinations() {
  const { data, error } = await getSupabase()
    .from('destinations')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function createDestination(name, sortOrder = null) {
  const payload = {
    name: name.trim(),
    slug: slugify(name),
  };
  if (sortOrder !== null && sortOrder !== '' && !isNaN(sortOrder)) {
    payload.sort_order = Number(sortOrder);
  }

  const { data, error } = await getSupabase()
    .from('destinations')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateDestination(id, fields) {
  const payload = { ...fields, updated_at: new Date().toISOString() };
  if (payload.name) {
    payload.name = payload.name.trim();
    if (!payload.slug) payload.slug = slugify(payload.name);
  }
  if (payload.sort_order === '' || payload.sort_order === null || payload.sort_order === undefined) {
    delete payload.sort_order;
  }
  const { error } = await getSupabase()
    .from('destinations')
    .update(payload)
    .eq('id', id);
  if (error) throw error;
}

async function deleteDestination(id) {
  const { error } = await getSupabase()
    .from('destinations')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ── INDICATORS ─────────────────────────────────────────────
function getMethodologyNote(indicator) {
  return String(indicator?.methodology_note || '').trim();
}

function normalizeIndicatorRow(item) {
  return {
    ...item,
    annual_calc_mode: item.annual_calc_mode || 'sum',
    annual_chart_visible: item.annual_chart_visible !== false,
    metric_key: item.metric_key || '',
    formula_numerator_key: item.formula_numerator_key || '',
    formula_denominator_key: item.formula_denominator_key || '',
    formula_multiplier: item.formula_multiplier === null || item.formula_multiplier === undefined ? 1 : Number(item.formula_multiplier),
    group_title: item.group_title || '',
    sort_order: item.sort_order === null || item.sort_order === undefined ? 0 : Number(item.sort_order),
    methodology_note: getMethodologyNote(item),
    destination: item.destinations || null,
  };
}

async function fetchIndicators() {
  const { data, error } = await getSupabase()
    .from('indicators')
    .select('*, destinations(id, name, slug)')
    .order('destination_id', { ascending: true, nullsFirst: true })
    .order('sort_order', { ascending: true, nullsFirst: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return (data || []).map(normalizeIndicatorRow);
}

async function createIndicator(payload) {
  const { data, error } = await getSupabase()
    .from('indicators')
    .insert({
      name: payload.name.trim(),
      description: payload.description || '',
      unit: payload.unit || '',
      destination_id: payload.destination_id || null,
      annual_calc_mode: payload.annual_calc_mode || 'sum',
      annual_chart_visible: payload.annual_chart_visible !== false,
      metric_key: payload.metric_key || '',
      formula_numerator_key: payload.formula_numerator_key || null,
      formula_denominator_key: payload.formula_denominator_key || null,
      formula_multiplier: payload.formula_multiplier === '' || payload.formula_multiplier === null || payload.formula_multiplier === undefined ? 1 : Number(payload.formula_multiplier),
      group_title: payload.group_title || '',
      sort_order: payload.sort_order === '' || payload.sort_order === null || payload.sort_order === undefined ? 0 : Number(payload.sort_order),
      methodology_note: (payload.methodology_note || '').trim(),
    })
    .select('*, destinations(id, name, slug)')
    .single();
  if (error) throw error;
  return normalizeIndicatorRow(data);
}

async function updateIndicator(id, fields) {
  const payload = {
    ...fields,
    destination_id: fields.destination_id || null,
    updated_at: new Date().toISOString(),
  };
  if (Object.prototype.hasOwnProperty.call(payload, 'formula_numerator_key') && !payload.formula_numerator_key) {
    payload.formula_numerator_key = null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'formula_denominator_key') && !payload.formula_denominator_key) {
    payload.formula_denominator_key = null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'formula_multiplier')) {
    payload.formula_multiplier = payload.formula_multiplier === '' || payload.formula_multiplier === null || payload.formula_multiplier === undefined
      ? 1
      : Number(payload.formula_multiplier);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'group_title')) {
    payload.group_title = (payload.group_title || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'sort_order')) {
    payload.sort_order = payload.sort_order === '' || payload.sort_order === null || payload.sort_order === undefined
      ? 0
      : Number(payload.sort_order);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'methodology_note')) {
    payload.methodology_note = (payload.methodology_note || '').trim();
  }
  const { error } = await getSupabase()
    .from('indicators')
    .update(payload)
    .eq('id', id);
  if (error) throw error;
}

async function deleteIndicator(id) {
  const { error } = await getSupabase()
    .from('indicators')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

async function updateIndicatorsSortOrder(destinationId, orderedIds) {
  const uniqueIds = [...new Set((orderedIds || []).filter(Boolean))];
  if (!uniqueIds.length) return;

  const timestamp = new Date().toISOString();
  const updates = uniqueIds.map((id, index) =>
    getSupabase()
      .from('indicators')
      .update({
        sort_order: index,
        updated_at: timestamp,
      })
      .eq('id', id)
      .eq('destination_id', destinationId)
  );

  const results = await Promise.all(updates);
  const failed = results.find(result => result.error);
  if (failed?.error) throw failed.error;
}


async function duplicateIndicatorsToDestination(sourceDestinationId, targetDestinationId) {
  if (!sourceDestinationId || !targetDestinationId) {
    throw new Error('Falta seleccionar destino origen o destino nuevo.');
  }

  const { data: sourceIndicators, error: fetchError } = await getSupabase()
    .from('indicators')
    .select('*')
    .eq('destination_id', sourceDestinationId)
    .order('sort_order', { ascending: true, nullsFirst: true })
    .order('name', { ascending: true });
  if (fetchError) throw fetchError;

  const source = sourceIndicators || [];
  if (!source.length) return [];

  const payload = source.map((indicator, index) => ({
    name: indicator.name,
    description: indicator.description || '',
    unit: indicator.unit || '',
    destination_id: targetDestinationId,
    annual_calc_mode: indicator.annual_calc_mode || 'sum',
    annual_chart_visible: indicator.annual_chart_visible !== false,
    metric_key: indicator.metric_key || '',
    formula_numerator_key: indicator.formula_numerator_key || null,
    formula_denominator_key: indicator.formula_denominator_key || null,
    formula_multiplier: indicator.formula_multiplier === null || indicator.formula_multiplier === undefined ? 1 : Number(indicator.formula_multiplier),
    group_title: indicator.group_title || '',
    sort_order: indicator.sort_order === null || indicator.sort_order === undefined ? index : Number(indicator.sort_order),
    methodology_note: (indicator.methodology_note || '').trim(),
  }));

  const { data, error } = await getSupabase()
    .from('indicators')
    .insert(payload)
    .select('*, destinations(id, name, slug)');
  if (error) throw error;

  return (data || []).map(normalizeIndicatorRow);
}

// ── DATA POINTS ─────────────────────────────────────────────
async function fetchDataPoints(indicatorId) {
  return fetchAllPagedRows((from, to) =>
    getSupabase()
      .from('data_points')
      .select('*')
      .eq('indicator_id', indicatorId)
      .order('year', { ascending: true })
      .order('month', { ascending: true })
      .range(from, to)
  );
}

async function fetchDataPointsForIndicators(indicatorIds) {
  if (!indicatorIds || !indicatorIds.length) return [];
  const uniqueIds = [...new Set(indicatorIds.filter(Boolean))];
  if (!uniqueIds.length) return [];
  return fetchAllPagedRows((from, to) =>
    getSupabase()
      .from('data_points')
      .select('*')
      .in('indicator_id', uniqueIds)
      .order('indicator_id', { ascending: true })
      .order('year', { ascending: true })
      .order('month', { ascending: true })
      .range(from, to)
  );
}

async function upsertDataPoints(points) {
  const payload = (points || []).map(point => ({
    ...point,
    is_provisional: point?.is_provisional === true,
    observation: String(point?.observation || '').trim(),
  }));

  const { error } = await getSupabase()
    .from('data_points')
    .upsert(payload, { onConflict: 'indicator_id,year,month' });
  if (error) throw error;
}

async function deleteDataPointsForYear(indicatorId, year) {
  const { error } = await getSupabase()
    .from('data_points')
    .delete()
    .eq('indicator_id', indicatorId)
    .eq('year', year);
  if (error) throw error;
}

async function deleteDataPointsForYears(indicatorId, years) {
  if (!years || !years.length) return;
  const { error } = await getSupabase()
    .from('data_points')
    .delete()
    .eq('indicator_id', indicatorId)
    .in('year', years);
  if (error) throw error;
}

async function deleteAllDataPointsForIndicator(indicatorId) {
  const { error } = await getSupabase()
    .from('data_points')
    .delete()
    .eq('indicator_id', indicatorId);
  if (error) throw error;
}

async function fetchIndicatorsWithData(indicatorIds) {
  if (!indicatorIds || !indicatorIds.length) return new Set();
  const uniqueIds = [...new Set(indicatorIds.filter(Boolean))];
  if (!uniqueIds.length) return new Set();
  const rows = await fetchAllPagedRows((from, to) =>
    getSupabase()
      .from('data_points')
      .select('indicator_id')
      .in('indicator_id', uniqueIds)
      .order('indicator_id', { ascending: true })
      .range(from, to)
  );
  return new Set(rows.map(row => row.indicator_id));
}

// ── AUTH ───────────────────────────────────────────────────
async function signIn(email, password) {
  const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function signOut() {
  await getSupabase().auth.signOut();
}

async function getSession() {
  const { data } = await getSupabase().auth.getSession();
  return data.session;
}
