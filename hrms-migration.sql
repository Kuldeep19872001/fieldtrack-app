-- HRMS Module Migration for FieldTrack
-- Run this SQL in your Supabase SQL Editor (Dashboard > SQL Editor)
-- This adds HRMS tables WITHOUT modifying any existing tables.

-- 1. User Shifts - stores shift timing per user
CREATE TABLE IF NOT EXISTS user_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  shift_start TIME NOT NULL DEFAULT '09:00:00',
  shift_end TIME NOT NULL DEFAULT '18:00:00',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Leave balances - per user per leave type per year
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

-- 3. Leave requests - leave applications
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

-- 4. Leave approvers - configurable approver emails
CREATE TABLE IF NOT EXISTS leave_approvers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_shifts_user ON user_shifts(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_balances_user_year ON leave_balances(user_id, year);
CREATE INDEX IF NOT EXISTS idx_leave_requests_user ON leave_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_dates ON leave_requests(from_date, to_date);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);

-- Enable Row Level Security
ALTER TABLE user_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_approvers ENABLE ROW LEVEL SECURITY;

-- RLS Policies: user_shifts
CREATE POLICY "Users can view own shift" ON user_shifts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own shift" ON user_shifts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own shift" ON user_shifts FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies: leave_balances
CREATE POLICY "Users can view own leave balances" ON leave_balances FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own leave balances" ON leave_balances FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own leave balances" ON leave_balances FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies: leave_requests
CREATE POLICY "Users can view own leave requests" ON leave_requests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own leave requests" ON leave_requests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own leave requests" ON leave_requests FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies: leave_approvers (all authenticated users can view)
CREATE POLICY "Authenticated users can view approvers" ON leave_approvers FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can manage approvers" ON leave_approvers FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update approvers" ON leave_approvers FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete approvers" ON leave_approvers FOR DELETE USING (auth.uid() IS NOT NULL);

-- Auto-create default shift when user registers (update existing trigger)
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

-- For existing users: run these INSERT statements to add default data
-- Replace 'YOUR_USER_ID' with the actual user ID from auth.users

-- To add default shift for an existing user:
-- INSERT INTO user_shifts (user_id, shift_start, shift_end)
-- VALUES ('YOUR_USER_ID', '09:00:00', '18:00:00')
-- ON CONFLICT (user_id) DO NOTHING;

-- To add default leave balances for an existing user:
-- INSERT INTO leave_balances (user_id, leave_type, year, total_days, used_days)
-- VALUES
--   ('YOUR_USER_ID', 'CL', 2026, 12, 0),
--   ('YOUR_USER_ID', 'PL', 2026, 15, 0),
--   ('YOUR_USER_ID', 'SL', 2026, 12, 0),
--   ('YOUR_USER_ID', 'RH', 2026, 2, 0),
--   ('YOUR_USER_ID', 'LWP', 2026, 0, 0)
-- ON CONFLICT (user_id, leave_type, year) DO NOTHING;

-- To add a default leave approver:
-- INSERT INTO leave_approvers (email, name, is_active)
-- VALUES ('manager@company.com', 'Manager Name', true);
