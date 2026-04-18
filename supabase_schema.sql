-- Tourism Dashboard - Supabase Schema
-- Run this in your Supabase SQL Editor

-- Indicators table
CREATE TABLE IF NOT EXISTS indicators (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  unit TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Data points table
CREATE TABLE IF NOT EXISTS data_points (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  indicator_id UUID REFERENCES indicators(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  value NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(indicator_id, year, month)
);

-- Enable Row Level Security
ALTER TABLE indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_points ENABLE ROW LEVEL SECURITY;

-- Public read access for all
CREATE POLICY "Public read indicators" ON indicators FOR SELECT USING (true);
CREATE POLICY "Public read data_points" ON data_points FOR SELECT USING (true);

-- Admin write access (authenticated users only)
CREATE POLICY "Auth insert indicators" ON indicators FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth update indicators" ON indicators FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Auth delete indicators" ON indicators FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "Auth insert data_points" ON data_points FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth update data_points" ON data_points FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Auth delete data_points" ON data_points FOR DELETE USING (auth.role() = 'authenticated');

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_data_points_indicator ON data_points(indicator_id);
CREATE INDEX IF NOT EXISTS idx_data_points_year ON data_points(year);
