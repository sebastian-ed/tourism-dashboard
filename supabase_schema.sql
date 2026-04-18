-- Tourism Dashboard - Schema + migration segura para agrupar indicadores por destino
-- Ejecutar completo en Supabase SQL Editor.
-- Si ya tenías datos, el script agrega la estructura nueva y mueve los indicadores existentes al destino "General".

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
  ADD COLUMN IF NOT EXISTS destination_id UUID REFERENCES destinations(id) ON DELETE SET NULL;

UPDATE indicators
SET destination_id = (SELECT id FROM destinations WHERE slug = 'general' LIMIT 1)
WHERE destination_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_indicators_destination ON indicators(destination_id);
CREATE INDEX IF NOT EXISTS idx_indicators_name ON indicators(name);

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
