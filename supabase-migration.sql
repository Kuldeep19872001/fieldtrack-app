-- FieldTrack Complete Database Setup
-- Run this SQL in your Supabase SQL Editor (Dashboard > SQL Editor)
-- Safe to run multiple times - uses IF NOT EXISTS and DROP POLICY IF EXISTS

-- ============================================================
-- 1. CORE TABLES
-- ============================================================

-- Profiles table (linked to auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  role TEXT DEFAULT 'Field Executive',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Leads table
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

-- Trips table
CREATE TABLE IF NOT EXISTS trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NULL,
  start_lat DOUBLE PRECISION NOT NULL,
  start_lng DOUBLE PRECISION NOT NULL,
  end_lat DOUBLE PRECISION NULL,
  end_lng DOUBLE PRECISION NULL,
  encoded_polyline TEXT NULL,
  total_distance DOUBLE PRECISION DEFAULT 0,
  point_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_trips_user_date ON trips(user_id, date);

-- Day records table
CREATE TABLE IF NOT EXISTS day_records (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  check_in_time TIMESTAMPTZ NULL,
  check_out_time TIMESTAMPTZ NULL,
  check_in_lat DOUBLE PRECISION NULL,
  check_in_lng DOUBLE PRECISION NULL,
  check_in_timestamp BIGINT NULL,
  check_out_lat DOUBLE PRECISION NULL,
  check_out_lng DOUBLE PRECISION NULL,
  total_distance DOUBLE PRECISION DEFAULT 0,
  working_minutes INTEGER DEFAULT 0,
  trip_count INTEGER DEFAULT 0,
  visit_count INTEGER DEFAULT 0,
  call_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'Absent',
  UNIQUE(user_id, date)
);

ALTER TABLE day_records ADD COLUMN IF NOT EXISTS check_out_lat DOUBLE PRECISION NULL;
ALTER TABLE day_records ADD COLUMN IF NOT EXISTS check_out_lng DOUBLE PRECISION NULL;
ALTER TABLE day_records ADD COLUMN IF NOT EXISTS working_minutes INTEGER DEFAULT 0;
ALTER TABLE day_records ADD COLUMN IF NOT EXISTS trip_count INTEGER DEFAULT 0;
ALTER TABLE day_records ADD COLUMN IF NOT EXISTS visit_count INTEGER DEFAULT 0;
ALTER TABLE day_records ADD COLUMN IF NOT EXISTS call_count INTEGER DEFAULT 0;
ALTER TABLE day_records ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Absent';

-- Route points table
CREATE TABLE IF NOT EXISTS route_points (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  day_record_id BIGINT REFERENCES day_records(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  timestamp BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Visits table
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
ALTER TABLE visits ADD COLUMN IF NOT EXISTS trip_id UUID REFERENCES trips(id) ON DELETE SET NULL;

-- Calls table
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

-- Activities table
CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_record_id BIGINT REFERENCES day_records(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  lead_name TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT DEFAULT '',
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Lead types table
CREATE TABLE IF NOT EXISTS lead_types (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO lead_types (name) VALUES
  ('Doctor'), ('Nursing Home'), ('School'), ('Ambulance'),
  ('College'), ('KOL'), ('Individual'), ('NGO'),
  ('Hospital'), ('Clinic'), ('Pharmacy'), ('Other')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- 2. HRMS TABLES
-- ============================================================

-- User shifts
CREATE TABLE IF NOT EXISTS user_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  shift_start TIME NOT NULL DEFAULT '09:00:00',
  shift_end TIME NOT NULL DEFAULT '18:00:00',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Leave balances
CREATE TABLE IF NOT EXISTS leave_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  leave_type TEXT NOT NULL CHECK (leave_type IN ('CL', 'PL', 'SL', 'RH', 'LWP')),
  year INTEGER NOT NULL,
  total_days NUMERIC(4,1) NOT NULL DEFAULT 0,
  used_days NUMERIC(4,1) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, leave_type, year)
);

-- Leave requests
CREATE TABLE IF NOT EXISTS leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  leave_type TEXT NOT NULL CHECK (leave_type IN ('CL', 'PL', 'SL', 'RH', 'LWP')),
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  approved_by TEXT NULL,
  approved_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_date_range CHECK (to_date >= from_date)
);

-- Leave approvers
CREATE TABLE IF NOT EXISTS leave_approvers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for HRMS
CREATE INDEX IF NOT EXISTS idx_user_shifts_user ON user_shifts(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_balances_user_year ON leave_balances(user_id, year);
CREATE INDEX IF NOT EXISTS idx_leave_requests_user ON leave_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_dates ON leave_requests(from_date, to_date);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);

-- ============================================================
-- 3. ENABLE ROW LEVEL SECURITY ON ALL TABLES
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE day_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_approvers ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. RLS POLICIES - USER LEVEL (Drop existing + recreate for idempotency)
-- ============================================================

-- profiles
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- leads
DROP POLICY IF EXISTS "Users can select own leads" ON leads;
DROP POLICY IF EXISTS "Users can insert own leads" ON leads;
DROP POLICY IF EXISTS "Users can update own leads" ON leads;
DROP POLICY IF EXISTS "Users can delete own leads" ON leads;
CREATE POLICY "Users can select own leads" ON leads FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own leads" ON leads FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own leads" ON leads FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own leads" ON leads FOR DELETE USING (auth.uid() = user_id);

-- trips
DROP POLICY IF EXISTS "Users can select own trips" ON trips;
DROP POLICY IF EXISTS "Users can insert own trips" ON trips;
DROP POLICY IF EXISTS "Users can update own trips" ON trips;
CREATE POLICY "Users can select own trips" ON trips FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own trips" ON trips FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own trips" ON trips FOR UPDATE USING (auth.uid() = user_id);

-- day_records
DROP POLICY IF EXISTS "Users can select own day records" ON day_records;
DROP POLICY IF EXISTS "Users can insert own day records" ON day_records;
DROP POLICY IF EXISTS "Users can update own day records" ON day_records;
CREATE POLICY "Users can select own day records" ON day_records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own day records" ON day_records FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own day records" ON day_records FOR UPDATE USING (auth.uid() = user_id);

-- route_points
DROP POLICY IF EXISTS "Users can select own route points" ON route_points;
DROP POLICY IF EXISTS "Users can insert own route points" ON route_points;
CREATE POLICY "Users can select own route points" ON route_points FOR SELECT
  USING (day_record_id IN (SELECT id FROM day_records WHERE user_id = auth.uid()));
CREATE POLICY "Users can insert own route points" ON route_points FOR INSERT
  WITH CHECK (day_record_id IN (SELECT id FROM day_records WHERE user_id = auth.uid()));

-- visits
DROP POLICY IF EXISTS "Users can select own visits" ON visits;
DROP POLICY IF EXISTS "Users can insert own visits" ON visits;
CREATE POLICY "Users can select own visits" ON visits FOR SELECT
  USING (day_record_id IN (SELECT id FROM day_records WHERE user_id = auth.uid()));
CREATE POLICY "Users can insert own visits" ON visits FOR INSERT
  WITH CHECK (day_record_id IN (SELECT id FROM day_records WHERE user_id = auth.uid()));

-- calls
DROP POLICY IF EXISTS "Users can select own calls" ON calls;
DROP POLICY IF EXISTS "Users can insert own calls" ON calls;
CREATE POLICY "Users can select own calls" ON calls FOR SELECT
  USING (day_record_id IN (SELECT id FROM day_records WHERE user_id = auth.uid()));
CREATE POLICY "Users can insert own calls" ON calls FOR INSERT
  WITH CHECK (day_record_id IN (SELECT id FROM day_records WHERE user_id = auth.uid()));

-- activities
DROP POLICY IF EXISTS "Users can select own activities" ON activities;
DROP POLICY IF EXISTS "Users can insert own activities" ON activities;
CREATE POLICY "Users can select own activities" ON activities FOR SELECT
  USING (day_record_id IN (SELECT id FROM day_records WHERE user_id = auth.uid()));
CREATE POLICY "Users can insert own activities" ON activities FOR INSERT
  WITH CHECK (day_record_id IN (SELECT id FROM day_records WHERE user_id = auth.uid()));

-- lead_types
DROP POLICY IF EXISTS "Anyone can view lead types" ON lead_types;
DROP POLICY IF EXISTS "Authenticated users can add lead types" ON lead_types;
CREATE POLICY "Anyone can view lead types" ON lead_types FOR SELECT USING (true);
CREATE POLICY "Authenticated users can add lead types" ON lead_types FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- user_shifts
DROP POLICY IF EXISTS "Users can view own shift" ON user_shifts;
DROP POLICY IF EXISTS "Users can insert own shift" ON user_shifts;
DROP POLICY IF EXISTS "Users can update own shift" ON user_shifts;
CREATE POLICY "Users can view own shift" ON user_shifts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own shift" ON user_shifts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own shift" ON user_shifts FOR UPDATE USING (auth.uid() = user_id);

-- leave_balances
DROP POLICY IF EXISTS "Users can view own leave balances" ON leave_balances;
DROP POLICY IF EXISTS "Users can insert own leave balances" ON leave_balances;
DROP POLICY IF EXISTS "Users can update own leave balances" ON leave_balances;
CREATE POLICY "Users can view own leave balances" ON leave_balances FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own leave balances" ON leave_balances FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own leave balances" ON leave_balances FOR UPDATE USING (auth.uid() = user_id);

-- leave_requests
DROP POLICY IF EXISTS "Users can view own leave requests" ON leave_requests;
DROP POLICY IF EXISTS "Users can insert own leave requests" ON leave_requests;
DROP POLICY IF EXISTS "Users can update own leave requests" ON leave_requests;
DROP POLICY IF EXISTS "Users can delete own leave requests" ON leave_requests;
CREATE POLICY "Users can view own leave requests" ON leave_requests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own leave requests" ON leave_requests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own leave requests" ON leave_requests FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own leave requests" ON leave_requests FOR DELETE USING (auth.uid() = user_id);

-- leave_approvers
DROP POLICY IF EXISTS "Authenticated users can view approvers" ON leave_approvers;
DROP POLICY IF EXISTS "Authenticated users can manage approvers" ON leave_approvers;
DROP POLICY IF EXISTS "Authenticated users can update approvers" ON leave_approvers;
DROP POLICY IF EXISTS "Authenticated users can delete approvers" ON leave_approvers;
CREATE POLICY "Authenticated users can view approvers" ON leave_approvers FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can manage approvers" ON leave_approvers FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update approvers" ON leave_approvers FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete approvers" ON leave_approvers FOR DELETE USING (auth.uid() IS NOT NULL);

-- ============================================================
-- 5. MANAGER/ADMIN RLS POLICIES
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'manager'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP POLICY IF EXISTS "Managers can view all profiles" ON profiles;
CREATE POLICY "Managers can view all profiles" ON profiles FOR SELECT USING (
  public.is_manager()
);

DROP POLICY IF EXISTS "Managers can view all leads" ON leads;
CREATE POLICY "Managers can view all leads" ON leads FOR SELECT USING (
  public.is_manager()
);

DROP POLICY IF EXISTS "Managers can delete any lead" ON leads;
CREATE POLICY "Managers can delete any lead" ON leads FOR DELETE USING (
  public.is_manager()
);

DROP POLICY IF EXISTS "Managers can view all trips" ON trips;
CREATE POLICY "Managers can view all trips" ON trips FOR SELECT USING (
  public.is_manager()
);

DROP POLICY IF EXISTS "Managers can view all leave_requests" ON leave_requests;
CREATE POLICY "Managers can view all leave_requests" ON leave_requests FOR SELECT USING (
  public.is_manager()
);

DROP POLICY IF EXISTS "Managers can update any leave_request" ON leave_requests;
CREATE POLICY "Managers can update any leave_request" ON leave_requests FOR UPDATE USING (
  public.is_manager()
);

DROP POLICY IF EXISTS "Managers can view all leave_balances" ON leave_balances;
CREATE POLICY "Managers can view all leave_balances" ON leave_balances FOR SELECT USING (
  public.is_manager()
);

DROP POLICY IF EXISTS "Managers can update leave_balances" ON leave_balances;
CREATE POLICY "Managers can update leave_balances" ON leave_balances FOR UPDATE USING (
  public.is_manager()
);

DROP POLICY IF EXISTS "Managers can manage leave_approvers" ON leave_approvers;
CREATE POLICY "Managers can manage leave_approvers" ON leave_approvers FOR ALL USING (
  public.is_manager()
);

-- ============================================================
-- 6. AUTO-CREATE PROFILE + DEFAULTS ON USER SIGNUP
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', ''), 'Field Executive');

  INSERT INTO public.user_shifts (user_id, shift_start, shift_end)
  VALUES (NEW.id, '09:00:00', '18:00:00');

  INSERT INTO public.leave_balances (user_id, leave_type, year, total_days, used_days)
  VALUES
    (NEW.id, 'CL', EXTRACT(YEAR FROM NOW())::INTEGER, 12, 0),
    (NEW.id, 'PL', EXTRACT(YEAR FROM NOW())::INTEGER, 15, 0),
    (NEW.id, 'SL', EXTRACT(YEAR FROM NOW())::INTEGER, 12, 0),
    (NEW.id, 'RH', EXTRACT(YEAR FROM NOW())::INTEGER, 2, 0),
    (NEW.id, 'LWP', EXTRACT(YEAR FROM NOW())::INTEGER, 0, 0);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 7. ADMIN RPC FUNCTIONS
-- ============================================================

-- Get all profiles with email (admin only)
CREATE OR REPLACE FUNCTION public.admin_get_all_profiles()
RETURNS TABLE (
  id UUID,
  name TEXT,
  role TEXT,
  email TEXT
) AS $$
BEGIN
  IF NOT public.is_manager() THEN
    RAISE EXCEPTION 'Unauthorized: Only managers can access this function';
  END IF;
  RETURN QUERY
  SELECT p.id, p.name, p.role, u.email
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  ORDER BY p.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Delete a user and all their data (admin only)
CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id UUID)
RETURNS VOID AS $$
BEGIN
  IF NOT public.is_manager() THEN
    RAISE EXCEPTION 'Unauthorized: Only managers can delete users';
  END IF;
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete your own account';
  END IF;
  DELETE FROM public.activities WHERE day_record_id IN (SELECT id FROM public.day_records WHERE user_id = target_user_id);
  DELETE FROM public.calls WHERE day_record_id IN (SELECT id FROM public.day_records WHERE user_id = target_user_id);
  DELETE FROM public.visits WHERE day_record_id IN (SELECT id FROM public.day_records WHERE user_id = target_user_id);
  DELETE FROM public.route_points WHERE day_record_id IN (SELECT id FROM public.day_records WHERE user_id = target_user_id);
  DELETE FROM public.day_records WHERE user_id = target_user_id;
  DELETE FROM public.trips WHERE user_id = target_user_id;
  DELETE FROM public.leads WHERE user_id = target_user_id;
  DELETE FROM public.leave_requests WHERE user_id = target_user_id;
  DELETE FROM public.leave_balances WHERE user_id = target_user_id;
  DELETE FROM public.user_shifts WHERE user_id = target_user_id;
  DELETE FROM public.profiles WHERE id = target_user_id;
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Delete any lead (admin only)
CREATE OR REPLACE FUNCTION public.admin_delete_lead(target_lead_id UUID)
RETURNS VOID AS $$
BEGIN
  IF NOT public.is_manager() THEN
    RAISE EXCEPTION 'Unauthorized: Only managers can delete leads';
  END IF;
  DELETE FROM public.activities WHERE lead_id = target_lead_id;
  DELETE FROM public.calls WHERE lead_id = target_lead_id;
  DELETE FROM public.visits WHERE lead_id = target_lead_id;
  DELETE FROM public.leads WHERE id = target_lead_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get all leads with user info (admin only)
CREATE OR REPLACE FUNCTION public.admin_get_all_leads()
RETURNS TABLE (
  id UUID,
  user_id UUID,
  name TEXT,
  mobile TEXT,
  lead_type TEXT,
  source TEXT,
  stage TEXT,
  address TEXT,
  created_at TIMESTAMPTZ,
  user_name TEXT,
  user_email TEXT
) AS $$
BEGIN
  IF NOT public.is_manager() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  RETURN QUERY
  SELECT l.id, l.user_id, l.name, l.mobile, l.lead_type, l.source, l.stage, l.address, l.created_at,
         p.name AS user_name, u.email AS user_email
  FROM public.leads l
  LEFT JOIN public.profiles p ON p.id = l.user_id
  LEFT JOIN auth.users u ON u.id = l.user_id
  ORDER BY l.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get pending leave requests (admin only)
CREATE OR REPLACE FUNCTION public.admin_get_pending_leaves()
RETURNS TABLE (
  id UUID,
  user_id UUID,
  leave_type TEXT,
  from_date DATE,
  to_date DATE,
  reason TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,
  user_name TEXT,
  user_email TEXT
) AS $$
BEGIN
  IF NOT public.is_manager() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  RETURN QUERY
  SELECT lr.id, lr.user_id, lr.leave_type, lr.from_date, lr.to_date, lr.reason, lr.status, lr.created_at,
         p.name AS user_name, u.email AS user_email
  FROM public.leave_requests lr
  LEFT JOIN public.profiles p ON p.id = lr.user_id
  LEFT JOIN auth.users u ON u.id = lr.user_id
  WHERE lr.status = 'Pending'
  ORDER BY lr.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Approve leave (admin only)
CREATE OR REPLACE FUNCTION public.admin_approve_leave(request_id UUID, approver_email TEXT)
RETURNS VOID AS $$
DECLARE
  req RECORD;
  days_count NUMERIC;
  bal RECORD;
BEGIN
  IF NOT public.is_manager() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  SELECT * INTO req FROM public.leave_requests WHERE id = request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Leave request not found'; END IF;
  IF req.status != 'Pending' THEN RAISE EXCEPTION 'Already processed'; END IF;

  SELECT COUNT(*) INTO days_count
  FROM generate_series(req.from_date, req.to_date, '1 day'::interval) d
  WHERE EXTRACT(DOW FROM d) != 0;
  IF days_count = 0 THEN days_count := 1; END IF;

  IF req.leave_type != 'LWP' THEN
    SELECT * INTO bal FROM public.leave_balances
    WHERE user_id = req.user_id AND leave_type = req.leave_type
    AND year = EXTRACT(YEAR FROM req.from_date)::INTEGER;
    IF FOUND AND (bal.used_days + days_count) > bal.total_days THEN
      RAISE EXCEPTION 'Insufficient leave balance';
    END IF;
    IF FOUND THEN
      UPDATE public.leave_balances SET used_days = used_days + days_count WHERE id = bal.id;
    END IF;
  END IF;

  UPDATE public.leave_requests
  SET status = 'Approved', approved_by = approver_email, approved_at = NOW()
  WHERE id = request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reject leave (admin only)
CREATE OR REPLACE FUNCTION public.admin_reject_leave(request_id UUID, approver_email TEXT)
RETURNS VOID AS $$
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE public.leave_requests
  SET status = 'Rejected', approved_by = approver_email, approved_at = NOW()
  WHERE id = request_id AND status = 'Pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found or already processed'; END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Process leave from email (server-side, no auth required)
CREATE OR REPLACE FUNCTION public.process_leave_from_email(p_request_id UUID, p_action TEXT, p_approver TEXT)
RETURNS TEXT AS $$
DECLARE
  req RECORD;
  days_count NUMERIC;
  bal RECORD;
BEGIN
  SELECT * INTO req FROM public.leave_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;
  IF req.status != 'Pending' THEN RETURN 'ALREADY_PROCESSED'; END IF;

  IF p_action = 'approve' THEN
    SELECT COUNT(*) INTO days_count
    FROM generate_series(req.from_date, req.to_date, '1 day'::interval) d
    WHERE EXTRACT(DOW FROM d) != 0;
    IF days_count = 0 THEN days_count := 1; END IF;

    IF req.leave_type != 'LWP' THEN
      SELECT * INTO bal FROM public.leave_balances
      WHERE user_id = req.user_id AND leave_type = req.leave_type
      AND year = EXTRACT(YEAR FROM req.from_date)::INTEGER;
      IF FOUND THEN
        IF (bal.used_days + days_count) > bal.total_days THEN
          RETURN 'INSUFFICIENT_BALANCE';
        END IF;
        UPDATE public.leave_balances SET used_days = used_days + days_count WHERE id = bal.id;
      END IF;
    END IF;

    UPDATE public.leave_requests
    SET status = 'Approved', approved_by = p_approver, approved_at = NOW()
    WHERE id = p_request_id;
    RETURN 'APPROVED';
  ELSIF p_action = 'reject' THEN
    UPDATE public.leave_requests
    SET status = 'Rejected', approved_by = p_approver, approved_at = NOW()
    WHERE id = p_request_id;
    RETURN 'REJECTED';
  END IF;
  RETURN 'INVALID_ACTION';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 8. SETUP DEFAULTS FOR EXISTING USERS
-- ============================================================

-- Add default shifts for existing users who don't have one
INSERT INTO user_shifts (user_id, shift_start, shift_end)
SELECT id, '09:00:00', '18:00:00' FROM auth.users
WHERE id NOT IN (SELECT user_id FROM user_shifts)
ON CONFLICT (user_id) DO NOTHING;

-- Add default leave balances for existing users who don't have them
INSERT INTO leave_balances (user_id, leave_type, year, total_days, used_days)
SELECT u.id, lt.leave_type, EXTRACT(YEAR FROM NOW())::INTEGER, lt.total_days, 0
FROM auth.users u
CROSS JOIN (VALUES ('CL', 12), ('PL', 15), ('SL', 12), ('RH', 2), ('LWP', 0)) AS lt(leave_type, total_days)
WHERE NOT EXISTS (
  SELECT 1 FROM leave_balances lb
  WHERE lb.user_id = u.id AND lb.leave_type = lt.leave_type
  AND lb.year = EXTRACT(YEAR FROM NOW())::INTEGER
)
ON CONFLICT (user_id, leave_type, year) DO NOTHING;
