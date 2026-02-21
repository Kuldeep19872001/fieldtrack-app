# FieldTrack - Field Staff Tracking & Lead Management

## Overview
A professional mobile application for field staff tracking and lead management. Built with Expo (React Native) frontend, Supabase backend (auth + database). Uses trip-based GPS tracking with Google encoded polyline algorithm for efficient route storage.

## Architecture
- **Frontend**: Expo Router with file-based routing, React Native
- **Backend**: Supabase (auth + PostgreSQL database + Row Level Security)
- **Server**: Express.js (port 5000) serves landing page, Expo manifest, and leave notification/approval API routes
- **Database**: Supabase PostgreSQL with 9 tables: profiles, leads, trips, day_records, route_points, visits, calls, activities, lead_types
- **Auth**: Supabase Auth (email/password) with auto-profile creation trigger
- **State**: React Context for shared state, direct Supabase client calls for data persistence
- **Maps**: react-native-maps (v1.18.0) for live map tracking
- **Location**: expo-location for GPS tracking with foreground service on Android
- **Polyline**: Google encoded polyline algorithm (lib/polyline.ts) for efficient route encoding/decoding

## Key Features
- Secure email/password login/registration via Supabase Auth
- Trip-based tracking: multiple check-in/check-out sessions per day (no restrictions)
- GPS tracking every 5s/10m (HIGH accuracy) with filtering (<50m accuracy, <10m distance, <140m/s speed)
- True background location tracking via Android foreground service (expo-task-manager)
- Google Roads API snap-to-roads on checkout for accurate route display
- In-memory GPS point accumulation during trips, with AsyncStorage persistence for background tracking
- Live map with decoded polyline routes (snapped to roads when available)
- Date range filtering (From-To picker) on Map and Summary screens with quick range buttons
- Session persistence: prevents logout while a trip is active
- Lead management with stages (New, In Process, Converted)
- Add Lead form with Name, Mobile, Source, Address, Type (dynamic dropdown), GPS auto-capture
- Dynamic editable lead type categories
- Lead detail with actions (Follow-up, Visit, Re-visit, Notes, Call) + Add Visit button
- Visit auto-updates lastVisitDate and changes stage from New to In Process
- Call logging (Outbound/Inbound) with auto-timer on return from phone dialer
- Daily/range summary with trip details and performance metrics
- Excel import/export for leads with sample template download

## Tracking System Design
- **Trip model**: Each check-in creates a new trip record. Check-out ends the trip.
- **GPS collection**: Points collected via watchPositionAsync (BestForNavigation accuracy, 5s interval, 15m distance)
- **Background tracking**: Uses expo-task-manager with Location.startLocationUpdatesAsync foreground service on Android. Points stored in AsyncStorage and synced on app foreground via AppState listener.
- **Point filtering**: Multi-layer: accuracy >25m rejected, min distance 15m, max speed 140m/s, sharp angle rejection (>140° at <60m), stationary cluster detection (4-point within 30m radius requires 30m movement to break out)
- **Route storage**: On checkout, Roads API snaps GPS points to roads. Snapped polyline (or raw GPS fallback) encoded and stored as TEXT field in Supabase
- **Route display**: Encoded polylines decoded back to coordinates and rendered via react-native-maps Polyline component
- **Session safety**: Logout is blocked while an active trip exists to prevent data loss
- **Roads API**: Google Roads API (snapToRoads endpoint) with interpolation, falls back to raw GPS if API key not set or API fails

## Admin System
- **Master user**: kuldeepc211@gmail.com (role: 'manager' in profiles table)
- **Admin detection**: `isAdmin` flag in auth context checks `user.role === 'manager'`
- **Admin tab**: Conditionally shown only for manager-role users (hidden via `href: null` for non-admins)
- **Admin capabilities**:
  - View/delete all users across the system
  - View/delete all leads (from any user)
  - Add/edit/delete leave approver emails
  - Approve/reject pending leave requests from all users
  - All existing features (tracking, leads, HRMS, etc.)
- **Lead delete**: Admin can delete leads from the Admin panel or from lead detail screen (trash icon in header)
- **Database functions**: Admin operations bypass RLS via Supabase RPC functions with SECURITY DEFINER (see `admin-migration.sql`)
- **Setup**: Run `admin-migration.sql` in Supabase SQL Editor to create admin RPC functions

## File Structure
- `app/` - Expo Router screens
  - `(tabs)/` - Main tab screens (Dashboard, Map, Leads, HRMS, Summary, Admin)
  - `lead/[id].tsx` - Lead detail screen (admin: delete button in header)
  - `login.tsx` - Login screen (email/password)
  - `index.tsx` - Auth redirect
- `lib/` - Shared logic
  - `supabase.ts` - Supabase client initialization
  - `auth-context.tsx` - Authentication provider (Supabase Auth, logout prevention, isAdmin flag)
  - `tracking-context.tsx` - Trip-based location tracking & data provider (5s/15m GPS, multi-layer filtering, background sync)
  - `background-tracking.ts` - TaskManager-based background location tracking with foreground service
  - `roads-api.ts` - Google Roads API snap-to-roads integration
  - `storage.ts` - Supabase CRUD helpers (trips, leads, visits, calls, activities)
  - `admin-storage.ts` - Admin RPC functions (user mgmt, lead mgmt, leave approval)
  - `polyline.ts` - Google encoded polyline algorithm (encode/decode)
  - `types.ts` - TypeScript interfaces (Trip, DayRecord, Lead, etc.)
  - `hrms-storage.ts` - HRMS module: attendance, leave, shift management
  - `query-client.ts` - React Query config (minimal, no API helpers)
- `components/MapContent.tsx` - Map component with polyline rendering and trip markers
- `components/DateRangePicker.tsx` - Reusable From-To date range picker with quick range buttons
- `constants/colors.ts` - Theme colors
- `supabase-migration.sql` - SQL to run in Supabase SQL Editor to create all tables, RLS policies, and triggers
- `hrms-migration.sql` - HRMS module SQL (user_shifts, leave_balances, leave_requests, leave_approvers)
- `admin-migration.sql` - Admin RPC functions SQL (manager-only operations, bypass RLS)
- `server/` - Express backend (landing page + Expo manifest only)

## Design
- Color scheme: Professional blue (#0066FF) with navy dark (#0A1628)
- Font: Inter (Google Fonts)
- Inspired by Salesforce + Google Maps field tools

## Environment Variables (Secrets)
- `EXPO_PUBLIC_SUPABASE_URL` - Supabase project URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous/public key
- `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` - Google Maps/Roads API key (for snap-to-roads on checkout)

## Database Setup
Run `supabase-migration.sql` in the Supabase SQL Editor to create:
- 9 tables with proper relationships and constraints
- Row Level Security (RLS) policies for all tables
- Auto-profile creation trigger on user signup
- Default lead type categories

### Upgrading from old schema
If you already have the old schema (without trips table), run this in Supabase SQL Editor:
```sql
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
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can select own trips" ON trips FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own trips" ON trips FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own trips" ON trips FOR UPDATE USING (auth.uid() = user_id);
ALTER TABLE visits ADD COLUMN IF NOT EXISTS trip_id UUID REFERENCES trips(id) ON DELETE SET NULL;
```

## Recent Changes
- **Admin System (Feb 2026)**:
  - Master admin role for kuldeepc211@gmail.com (role: 'manager')
  - Admin tab with user management, lead management, leave approver configuration
  - Approve/reject pending leave requests from all users
  - Delete leads from Admin panel or lead detail screen
  - Delete users and all their associated data
  - Admin RPC functions with SECURITY DEFINER for bypassing RLS
  - Manager RLS policies for direct table access (fallback when RPC unavailable)
  - Dual-strategy admin queries: RPC first, then direct query fallback
- **HRMS Leave Improvements (Feb 2026)**:
  - Date picker for leave From/To dates (scrollable list with 90-day future dates, Sunday highlighting)
  - Background email notification to leave approvers via Resend API on leave submission
  - Email contains Approve/Reject buttons that link to server endpoints
  - Server-side approve/reject: HMAC-signed URLs verify token, then call `process_leave_from_email` RPC to update leave_requests table
  - Working days preview count on leave application form
  - Required secrets: RESEND_API_KEY (Resend email service API key)
- **Enhanced Tracking & Features (Feb 2026)**:
  - GPS intervals changed to 5s/10m (HIGH accuracy) for more precise tracking
  - True background location tracking via expo-task-manager foreground service on Android
  - Google Roads API snap-to-roads on checkout (falls back to raw GPS if unavailable)
  - Date range filtering (From-To picker) replaces single date picker on Map and Summary screens
  - Session persistence: logout blocked when active trip exists
  - Sample Excel template download in Leads import/export
  - Background points synced from AsyncStorage on app foreground via AppState listener
- **Trip-based Tracking Refactor (Feb 2026)**: Trip-based model, polyline encoding, in-memory GPS accumulation
- **Supabase Migration (Feb 2026)**: Full backend migration to Supabase
- Call tracking: Outbound calls via app auto-log with timer on return; Inbound calls via manual quick-log
- AppState listener detects return from phone dialer to auto-populate call duration
