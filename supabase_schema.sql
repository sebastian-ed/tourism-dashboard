-- Tourism Dashboard - Schema + migración segura
-- Ejecutar completo en Supabase SQL Editor.
-- Agrega destinos, agrupación comparable y cálculo anual configurable por indicador.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ── DESTINATIONS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS destinations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_destinations_name_unique ON destinations (LOWER(name));
CREATE UNIQUE INDEX IF NOT EXISTS idx_destinations_slug_unique ON destinations (slug);
CREATE INDEX IF NOT EXISTS idx_destinations_sort_order ON destinations (sort_order, name);

INSERT INTO destinations (name, slug, sort_order)
VALUES ('General', 'general', 0)
ON CONFLICT (slug) DO NOTHING;

-- ── INDICATORS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS indicators (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  unit TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE indicators
  ADD COLUMN IF NOT EXISTS destination_id UUID REFERENCES destinations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS annual_calc_mode TEXT DEFAULT 'sum',
  ADD COLUMN IF NOT EXISTS annual_chart_visible BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS metric_key TEXT,
  ADD COLUMN IF NOT EXISTS formula_numerator_key TEXT,
  ADD COLUMN IF NOT EXISTS formula_denominator_key TEXT,
  ADD COLUMN IF NOT EXISTS formula_multiplier NUMERIC DEFAULT 1;

UPDATE indicators
SET destination_id = (SELECT id FROM destinations WHERE slug = 'general' LIMIT 1)
WHERE destination_id IS NULL;

UPDATE indicators
SET metric_key = LOWER(REGEXP_REPLACE(unaccent(COALESCE(name, '')), '[^a-zA-Z0-9]+', '-', 'g'))
WHERE metric_key IS NULL OR metric_key = '';

UPDATE indicators
SET annual_calc_mode = 'sum'
WHERE annual_calc_mode IS NULL OR annual_calc_mode = '';

UPDATE indicators
SET annual_chart_visible = TRUE
WHERE annual_chart_visible IS NULL;

UPDATE indicators
SET formula_multiplier = 1
WHERE formula_multiplier IS NULL;

CREATE INDEX IF NOT EXISTS idx_indicators_destination ON indicators(destination_id);
CREATE INDEX IF NOT EXISTS idx_indicators_name ON indicators(name);
CREATE INDEX IF NOT EXISTS idx_indicators_metric_key ON indicators(metric_key);

-- ── DATA POINTS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS data_points (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  indicator_id UUID REFERENCES indicators(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  value NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(indicator_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_data_points_indicator ON data_points(indicator_id);
CREATE INDEX IF NOT EXISTS idx_data_points_year ON data_points(year);

-- ── RLS ────────────────────────────────────────────────────
ALTER TABLE destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_points ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read destinations" ON destinations;
DROP POLICY IF EXISTS "Auth insert destinations" ON destinations;
DROP POLICY IF EXISTS "Auth update destinations" ON destinations;
DROP POLICY IF EXISTS "Auth delete destinations" ON destinations;

DROP POLICY IF EXISTS "Public read indicators" ON indicators;
DROP POLICY IF EXISTS "Auth insert indicators" ON indicators;
DROP POLICY IF EXISTS "Auth update indicators" ON indicators;
DROP POLICY IF EXISTS "Auth delete indicators" ON indicators;

DROP POLICY IF EXISTS "Public read data_points" ON data_points;
DROP POLICY IF EXISTS "Auth insert data_points" ON data_points;
DROP POLICY IF EXISTS "Auth update data_points" ON data_points;
DROP POLICY IF EXISTS "Auth delete data_points" ON data_points;

CREATE POLICY "Public read destinations" ON destinations FOR SELECT USING (true);
CREATE POLICY "Auth insert destinations" ON destinations FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth update destinations" ON destinations FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Auth delete destinations" ON destinations FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "Public read indicators" ON indicators FOR SELECT USING (true);
CREATE POLICY "Auth insert indicators" ON indicators FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth update indicators" ON indicators FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Auth delete indicators" ON indicators FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "Public read data_points" ON data_points FOR SELECT USING (true);
CREATE POLICY "Auth insert data_points" ON data_points FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth update data_points" ON data_points FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Auth delete data_points" ON data_points FOR DELETE USING (auth.role() = 'authenticated');
