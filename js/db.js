// Supabase client
let supabaseClient = null;

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
async function fetchIndicators() {
  const { data, error } = await getSupabase()
    .from('indicators')
    .select('*, destinations(id, name, slug)')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data || []).map(item => ({
    ...item,
    destination: item.destinations || null,
  }));
}

async function createIndicator(name, description, unit, destinationId) {
  const { data, error } = await getSupabase()
    .from('indicators')
    .insert({
      name: name.trim(),
      description,
      unit,
      destination_id: destinationId || null,
    })
    .select('*, destinations(id, name, slug)')
    .single();
  if (error) throw error;
  return {
    ...data,
    destination: data.destinations || null,
  };
}

async function updateIndicator(id, fields) {
  const { error } = await getSupabase()
    .from('indicators')
    .update({
      ...fields,
      destination_id: fields.destination_id || null,
      updated_at: new Date().toISOString(),
    })
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

// ── DATA POINTS ─────────────────────────────────────────────
async function fetchDataPoints(indicatorId) {
  const { data, error } = await getSupabase()
    .from('data_points')
    .select('*')
    .eq('indicator_id', indicatorId)
    .order('year', { ascending: true })
    .order('month', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function upsertDataPoints(points) {
  const { error } = await getSupabase()
    .from('data_points')
    .upsert(points, { onConflict: 'indicator_id,year,month' });
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


async function fetchIndicatorsWithData(indicatorIds) {
  if (!indicatorIds || !indicatorIds.length) return new Set();
  const { data, error } = await getSupabase()
    .from('data_points')
    .select('indicator_id')
    .in('indicator_id', indicatorIds);
  if (error) throw error;
  return new Set((data || []).map(row => row.indicator_id));
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
