-- FieldTrack Supabase Migration
-- Run this SQL in your Supabase SQL Editor (Dashboard > SQL Editor)

-- 1. Profiles table (linked to auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  role TEXT DEFAULT 'Field Executive',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Leads table
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  company TEXT DEFAULT '',
  area TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  stage TEXT DEFAULT 'New' CHECK (stage IN ('New', 'In Process', 'Converted')),
  notes TEXT DEFAULT '',
  source TEXT DEFAULT '',
  address TEXT DEFAULT '',
  mobile TEXT DEFAULT '',
  lead_type TEXT DEFAULT '',
  assigned_staff TEXT DEFAULT 'Self',
  last_visit_date DATE NULL,
  location_lat DOUBLE PRECISION NULL,
  location_lng DOUBLE PRECISION NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Day records table
CREATE TABLE IF NOT EXISTS day_records (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  check_in_time TIMESTAMPTZ NULL,
  check_out_time TIMESTAMPTZ NULL,
  check_in_lat DOUBLE PRECISION NULL,
  check_in_lng DOUBLE PRECISION NULL,
  check_in_timestamp BIGINT NULL,
  total_distance DOUBLE PRECISION DEFAULT 0,
  UNIQUE(user_id, date)
);

-- 4. Route points table
CREATE TABLE IF NOT EXISTS route_points (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  day_record_id BIGINT REFERENCES day_records(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  timestamp BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Visits table
CREATE TABLE IF NOT EXISTS visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_record_id BIGINT REFERENCES day_records(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  lead_name TEXT NOT NULL,
  type TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  address TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  duration INTEGER DEFAULT 0,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Calls table
CREATE TABLE IF NOT EXISTS calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_record_id BIGINT REFERENCES day_records(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  lead_name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('Outbound', 'Inbound')),
  duration INTEGER DEFAULT 0,
  notes TEXT DEFAULT '',
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Activities table
CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_record_id BIGINT REFERENCES day_records(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  lead_name TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT DEFAULT '',
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Lead types table
CREATE TABLE IF NOT EXISTS lead_types (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default lead types
INSERT INTO lead_types (name) VALUES
  ('Doctor'), ('Nursing Home'), ('School'), ('Ambulance'),
  ('College'), ('KOL'), ('Individual'), ('NGO'),
  ('Hospital'), ('Clinic'), ('Pharmacy'), ('Other')
ON CONFLICT (name) DO NOTHING;

-- Enable Row Level Security on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE day_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_types ENABLE ROW LEVEL SECURITY;

-- RLS Policies: profiles
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- RLS Policies: leads
CREATE POLICY "Users can select own leads" ON leads FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own leads" ON leads FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own leads" ON leads FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own leads" ON leads FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies: day_records
CREATE POLICY "Users can select own day records" ON day_records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own day records" ON day_records FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own day records" ON day_records FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies: route_points (through day_records ownership)
CREATE POLICY "Users can select own route points" ON route_points FOR SELECT
  USING (day_record_id IN (SELECT id FROM day_records WHERE user_id = auth.uid()));
CREATE POLICY "Users can insert own route points" ON route_points FOR INSERT
  WITH CHECK (day_record_id IN (SELECT id FROM day_records WHERE user_id = auth.uid()));

-- RLS Policies: visits (through day_records ownership)
CREATE POLICY "Users can select own visits" ON visits FOR SELECT
  USING (day_record_id IN (SELECT id FROM day_records WHERE user_id = auth.uid()));
CREATE POLICY "Users can insert own visits" ON visits FOR INSERT
  WITH CHECK (day_record_id IN (SELECT id FROM day_records WHERE user_id = auth.uid()));

-- RLS Policies: calls (through day_records ownership)
CREATE POLICY "Users can select own calls" ON calls FOR SELECT
  USING (day_record_id IN (SELECT id FROM day_records WHERE user_id = auth.uid()));
CREATE POLICY "Users can insert own calls" ON calls FOR INSERT
  WITH CHECK (day_record_id IN (SELECT id FROM day_records WHERE user_id = auth.uid()));

-- RLS Policies: activities (through day_records ownership)
CREATE POLICY "Users can select own activities" ON activities FOR SELECT
  USING (day_record_id IN (SELECT id FROM day_records WHERE user_id = auth.uid()));
CREATE POLICY "Users can insert own activities" ON activities FOR INSERT
  WITH CHECK (day_record_id IN (SELECT id FROM day_records WHERE user_id = auth.uid()));

-- RLS Policies: lead_types (shared read, authenticated write)
CREATE POLICY "Anyone can view lead types" ON lead_types FOR SELECT USING (true);
CREATE POLICY "Authenticated users can add lead types" ON lead_types FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', ''), 'Field Executive');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
