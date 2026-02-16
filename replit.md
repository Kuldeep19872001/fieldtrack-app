# FieldTrack - Field Staff Tracking & Lead Management

## Overview
A professional mobile application for field staff tracking and lead management. Built with Expo (React Native) frontend, Supabase backend (auth + database).

## Architecture
- **Frontend**: Expo Router with file-based routing, React Native
- **Backend**: Supabase (auth + PostgreSQL database + Row Level Security)
- **Server**: Express.js (port 5000) serves only the landing page and Expo manifest (no API routes)
- **Database**: Supabase PostgreSQL with 8 tables: profiles, leads, day_records, route_points, visits, calls, activities, lead_types
- **Auth**: Supabase Auth (email/password) with auto-profile creation trigger
- **State**: React Context for shared state, direct Supabase client calls for data persistence
- **Maps**: react-native-maps (v1.18.0) for live map tracking
- **Location**: expo-location for GPS tracking

## Key Features
- Secure email/password login/registration via Supabase Auth
- Daily check-in/check-out with GPS
- Continuous location tracking during shifts
- Live map with route polyline, visit markers, check-in/out locations
- Lead management with stages (New, In Process, Converted)
- Add Lead form with Name, Mobile, Source, Address, Type (dynamic dropdown), GPS auto-capture
- Dynamic editable lead type categories (Doctor, Hospital, School, Ambulance, College, KOL, Individual, NGO, etc.)
- Lead cards show Name, Mobile, Type, Location, Assigned Staff, Last Visit Date
- Add Visit button on each lead with mandatory GPS capture, timestamp, and notes
- Lead detail with actions (Follow-up, Visit, Re-visit, Notes, Call) + Add Visit button
- Visit auto-updates lastVisitDate and changes stage from New to In Process
- Call logging (Outbound/Inbound)
- Daily summary with performance metrics

## File Structure
- `app/` - Expo Router screens
  - `(tabs)/` - Main tab screens (Dashboard, Map, Leads, Summary)
  - `lead/[id].tsx` - Lead detail screen
  - `login.tsx` - Login screen (email/password)
  - `index.tsx` - Auth redirect
- `lib/` - Shared logic
  - `supabase.ts` - Supabase client initialization
  - `auth-context.tsx` - Authentication provider (Supabase Auth)
  - `tracking-context.tsx` - Location tracking & data provider
  - `storage.ts` - Supabase CRUD helpers (direct client queries)
  - `types.ts` - TypeScript interfaces
  - `query-client.ts` - React Query config (minimal, no API helpers)
- `constants/colors.ts` - Theme colors
- `supabase-migration.sql` - SQL to run in Supabase SQL Editor to create all tables, RLS policies, and triggers
- `server/` - Express backend (landing page + Expo manifest only)
  - `index.ts` - Server setup with CORS, landing page, Expo routing
  - `routes.ts` - Health check endpoint only
  - `templates/landing-page.html` - Landing page HTML

## Design
- Color scheme: Professional blue (#0066FF) with navy dark (#0A1628)
- Font: Inter (Google Fonts)
- Inspired by Salesforce + Google Maps field tools

## Environment Variables (Secrets)
- `EXPO_PUBLIC_SUPABASE_URL` - Supabase project URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous/public key

## Database Setup
Run `supabase-migration.sql` in the Supabase SQL Editor to create:
- 8 tables with proper relationships and constraints
- Row Level Security (RLS) policies for all tables
- Auto-profile creation trigger on user signup
- Default lead type categories

## Recent Changes
- **Supabase Migration (Feb 2026)**: Migrated entire backend from Replit PostgreSQL + Express API to Supabase
  - Auth: Switched from username/session-based to Supabase email/password auth
  - Database: All 8 tables now in Supabase with RLS policies
  - Storage: All CRUD operations use Supabase client directly (no REST API)
  - Server: Stripped all API routes, server only serves landing page and Expo manifest
  - Login: Updated to email-based authentication
  - Standalone: App operates fully without server API dependencies
- Road-snapped polylines via OSRM API (lib/road-snap.ts) for accurate map routes
- Custom circular profile markers on map (user initials, check-in/out, visit markers)
- Call tracking: Outbound calls via app auto-log with timer on return; Inbound calls via manual quick-log
- AppState listener detects return from phone dialer to auto-populate call duration
