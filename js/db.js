// Supabase client
let supabaseClient = null;

function getSupabase() {
  if (!supabaseClient) {
    supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  }
  return supabaseClient;
}

// ── INDICATORS ──────────────────────────────────────────────
async function fetchIndicators() {
  const { data, error } = await getSupabase()
    .from('indicators')
    .select('*')
    .order('name');
  if (error) throw error;
  return data;
}

async function createIndicator(name, description, unit) {
  const { data, error } = await getSupabase()
    .from('indicators')
    .insert({ name, description, unit })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateIndicator(id, fields) {
  const { error } = await getSupabase()
    .from('indicators')
    .update({ ...fields, updated_at: new Date().toISOString() })
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
    .order('year')
    .order('month');
  if (error) throw error;
  return data;
}

async function upsertDataPoints(points) {
  // points: [{ indicator_id, year, month, value }]
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

// ── AUTH ─────────────────────────────────────────────────────
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
