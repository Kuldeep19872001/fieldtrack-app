# FieldTrack - Field Staff Tracking & Lead Management

## Overview
A professional mobile application for field staff tracking and lead management. Built with Expo (React Native) + Express backend.

## Architecture
- **Frontend**: Expo Router with file-based routing, React Native
- **Backend**: Express.js (port 5000) serving REST API and landing page
- **Database**: PostgreSQL (Replit built-in) with 8 tables: users, leads, day_records, route_points, visits, calls, activities, lead_types
- **Auth**: Session-based with express-session + connect-pg-simple, bcryptjs password hashing
- **State**: React Context for shared state, API calls for data persistence
- **Maps**: react-native-maps (v1.18.0) for live map tracking
- **Location**: expo-location for GPS tracking

## Key Features
- Secure login/registration with PostgreSQL-backed session auth
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
  - `login.tsx` - Login screen
  - `index.tsx` - Auth redirect
- `lib/` - Shared logic
  - `auth-context.tsx` - Authentication provider (API-backed)
  - `tracking-context.tsx` - Location tracking & data provider
  - `storage.ts` - API-backed CRUD helpers (replaces AsyncStorage)
  - `types.ts` - TypeScript interfaces
  - `query-client.ts` - React Query config + apiRequest helper
- `constants/colors.ts` - Theme colors
- `server/` - Express backend
  - `db.ts` - PostgreSQL connection pool + schema initialization
  - `routes.ts` - 20 REST API endpoints (auth, leads, visits, calls, activities, day records, route points, lead types)
  - `index.ts` - Server setup with CORS, session, Expo routing

## Design
- Color scheme: Professional blue (#0066FF) with navy dark (#0A1628)
- Font: Inter (Google Fonts)
- Inspired by Salesforce + Google Maps field tools

## Recent Changes
- **Database Migration (Feb 2026)**: Migrated entire data layer from AsyncStorage to PostgreSQL
  - Created 8 database tables with proper relationships and constraints
  - Built 20 REST API endpoints for all CRUD operations
  - Session-based auth with bcryptjs password hashing and connect-pg-simple session store
  - Login screen now supports both login and registration
  - All frontend storage functions now call API instead of AsyncStorage
  - Multi-user support with data scoped to logged-in user
- Road-snapped polylines via OSRM API (lib/road-snap.ts) for accurate map routes
- Custom circular profile markers on map (user initials, check-in/out, visit markers)
- Call tracking: Outbound calls via app auto-log with timer on return; Inbound calls via manual quick-log
- Call log modal on leads screen and lead detail with type selection, duration, notes
- AppState listener detects return from phone dialer to auto-populate call duration
