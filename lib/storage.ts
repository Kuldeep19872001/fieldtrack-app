import { supabase, getCachedUserId } from './supabase';
import { encodePolyline } from './polyline';
import type { Lead, Trip, LocationPoint, Visit, CallLog, Activity, DayRecord } from './types';

// --- AUTH UTILS ---

async function getAuthUserId(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) return session.user.id;

  const cached = getCachedUserId();
  if (cached) return cached;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) return user.id;
  } catch (e: any) {}

  throw new Error('Please sign in again to continue');
}

// --- DATA TRANSFORMS (Type Safety) ---

function transformLead(row: any): Lead {
  return {
    id: row.id,
    name: row.name,
    company: row.company || '',
    area: row.area || '',
    phone: row.phone || '',
    email: row.email || '',
    stage: row.stage || 'New',
    notes: row.notes || '',
    source: row.source || '',
    address: row.address || '',
    mobile: row.mobile || '',
    leadType: row.lead_type || '',
    assignedStaff: row.assigned_staff || 'Self',
    lastVisitDate: row.last_visit_date,
    locationLat: row.location_lat ? Number(row.location_lat) : null,
    locationLng: row.location_lng ? Number(row.location_lng) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function transformTrip(row: any): Trip {
  return {
    id: row.id,
    userId: row.user_id,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    startLat: Number(row.start_lat),
    startLng: Number(row.start_lng),
    endLat: row.end_lat ? Number(row.end_lat) : null,
    endLng: row.end_lng ? Number(row.end_lng) : null,
    encodedPolyline: row.encoded_polyline,
    totalDistance: Number(row.total_distance || 0),
    pointCount: Number(row.point_count || 0),
  };
}

// --- DISTANCE LOGIC (Mathematical Accuracy) ---

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  if (lat1 === lat2 && lon1 === lon2) return 0;
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return isNaN(distance) ? 0 : distance;
}

export function calculateTotalDistance(points: LocationPoint[]): number {
  if (!points || points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += calculateDistance(
      points[i - 1].latitude, points[i - 1].longitude,
      points[i].latitude, points[i].longitude
    );
  }
  return Math.round(total * 100) / 100;
}

// --- TRIP ACTIONS ---

export async function startTrip(location: LocationPoint): Promise<Trip> {
  const userId = await getAuthUserId();
  const today = new Date().toISOString().split('T')[0];

  const { data: row, error } = await supabase
    .from('trips')
    .insert({
      user_id: userId,
      date: today,
      start_time: new Date().toISOString(),
      start_lat: Number(location.latitude.toFixed(6)),
      start_lng: Number(location.longitude.toFixed(6)),
      total_distance: 0,
      point_count: 1
    })
    .select()
    .single();

  if (error) throw new Error('Failed to start trip: ' + error.message);
  return transformTrip(row);
}

export async function saveRoutePoints(tripId: string, points: LocationPoint[]): Promise<void> {
  if (!points || points.length === 0) return;
  try {
    const userId = await getAuthUserId();
    const today = new Date().toISOString().split('T')[0];
    const dayRecord = await getOrCreateDayRecord(userId, today);

    const rows = points.map(p => ({
      day_record_id: dayRecord.id,
      trip_id: tripId, 
      latitude: Number(p.latitude.toFixed(6)),
      longitude: Number(p.longitude.toFixed(6)),
      timestamp: Math.round(p.timestamp),
      accuracy: p.accuracy ? Math.round(p.accuracy) : null,
    }));

    const BATCH_SIZE = 100;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from('route_points').insert(batch);
      if (error) console.error('Supabase Route Point Error:', error.message);
    }
  } catch (e: any) {
    console.error('Storage: Failed to save route points', e.message);
  }
}

export async function endTrip(
  tripId: string,
  points: LocationPoint[],
  endLocation: LocationPoint,
  snappedPolyline?: string | null,
  snappedDistance?: number | null
): Promise<Trip> {
  // 1. Prioritize Snapped Distance > Calculated Distance
  let totalDist = snappedDistance ?? calculateTotalDistance(points);
  if (isNaN(totalDist) || totalDist < 0) totalDist = 0;

  // 2. Prioritize Snapped Polyline > Raw Polyline
  let finalPoly = snappedPolyline;
  if (!finalPoly && points.length >= 2) {
    finalPoly = encodePolyline(points);
  } else if (!finalPoly) {
    finalPoly = encodePolyline([endLocation, endLocation]);
  }

  const { data: row, error } = await supabase
    .from('trips')
    .update({
      end_time: new Date().toISOString(),
      end_lat: Number(endLocation.latitude.toFixed(6)),
      end_lng: Number(endLocation.longitude.toFixed(6)),
      encoded_polyline: finalPoly,
      total_distance: Number(totalDist.toFixed(2)),
      point_count: points.length,
    })
    .eq('id', tripId)
    .select()
    .single();

  if (error) throw new Error('Failed to end trip: ' + error.message);
  return transformTrip(row);
}

export async function getActiveTrip(): Promise<Trip | null> {
  try {
    const userId = await getAuthUserId();
    const { data, error } = await supabase
      .from('trips')
      .select('*')
      .eq('user_id', userId)
      .is('end_time', null)
      .order('start_time', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return null;
    return data ? transformTrip(data) : null;
  } catch (e) {
    return null;
  }
}

// --- DAY RECORDS & VISITS ---

async function getOrCreateDayRecord(userId: string, date: string): Promise<any> {
  const { data: existing } = await supabase
    .from('day_records')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle();

  if (existing) return existing;

  const { data: created, error } = await supabase
    .from('day_records')
    .insert({ user_id: userId, date })
    .select()
    .single();

  if (error) {
    const { data: retry } = await supabase.from('day_records').select('*').eq('user_id', userId).eq('date', date).maybeSingle();
    if (retry) return retry;
    throw new Error('Day record failure: ' + error.message);
  }
  return created;
}

export async function getDayRecord(date?: string): Promise<DayRecord> {
  const d = date || new Date().toISOString().split('T')[0];
  try {
    const userId = await getAuthUserId();
    const dayRecord = await getOrCreateDayRecord(userId, d);

    const [tripsRes, visitsRes, callsRes, activitiesRes] = await Promise.all([
      supabase.from('trips').select('*').eq('user_id', userId).eq('date', d).order('start_time'),
      supabase.from('visits').select('*').eq('day_record_id', dayRecord.id).order('timestamp'),
      supabase.from('calls').select('*').eq('day_record_id', dayRecord.id).order('timestamp'),
      supabase.from('activities').select('*').eq('day_record_id', dayRecord.id).order('timestamp'),
    ]);

    const trips = (tripsRes.data || []).map(transformTrip);
    const activeTrip = trips.find(t => !t.endTime) || null;
    const totalDistance = trips.reduce((sum, t) => sum + t.totalDistance, 0);

    let totalWorkingMinutes = 0;
    for (const trip of trips) {
      const start = new Date(trip.startTime).getTime();
      const end = trip.endTime ? new Date(trip.endTime).getTime() : Date.now();
      totalWorkingMinutes += Math.floor((end - start) / 60000);
    }

    return {
      date: d,
      trips,
      activeTrip,
      visits: (visitsRes.data || []).map(r => ({
        id: r.id, leadId: r.lead_id, leadName: r.lead_name, type: r.type,
        latitude: Number(r.latitude), longitude: Number(r.longitude),
        address: r.address, notes: r.notes, timestamp: r.timestamp,
        duration: r.duration, tripId: r.trip_id,
      })),
      calls: (callsRes.data || []).map(r => ({
        id: r.id, leadId: r.lead_id, leadName: r.lead_name, type: r.type,
        duration: r.duration, notes: r.notes, timestamp: r.timestamp,
      })),
      activities: (activitiesRes.data || []).map(r => ({
        id: r.id, leadId: r.lead_id, leadName: r.lead_name, type: r.type,
        description: r.description, timestamp: r.timestamp,
      })),
      totalDistance: Math.round(totalDistance * 100) / 100,
      totalWorkingMinutes,
    };
  } catch (e: any) {
    return { date: d, trips: [], activeTrip: null, visits: [], calls: [], activities: [], totalDistance: 0, totalWorkingMinutes: 0 };
  }
}