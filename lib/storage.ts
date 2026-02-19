import { supabase, getCachedUserId } from './supabase';
import { encodePolyline } from './polyline';
import type { Lead, Trip, LocationPoint, Visit, CallLog, Activity, DayRecord } from './types';

async function getAuthUserId(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    return session.user.id;
  }

  const cached = getCachedUserId();
  if (cached) {
    console.log('Using cached user ID (session was empty)');
    return cached;
  }

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (user) return user.id;
    if (userError) console.error('getUser error:', userError.message);
  } catch (e: any) {
    console.error('getUser exception:', e.message);
  }

  throw new Error('Please sign in again to continue');
}

export async function getLeadTypes(): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('lead_types')
      .select('name')
      .order('name');
    if (error) {
      console.error('Get lead types error:', error.message);
      return ['Doctor', 'Nursing Home', 'School', 'Ambulance', 'College', 'KOL', 'Individual', 'NGO', 'Hospital', 'Clinic', 'Pharmacy', 'Other'];
    }
    return (data || []).map((t: any) => t.name);
  } catch (e: any) {
    console.error('Get lead types exception:', e.message);
    return ['Doctor', 'Nursing Home', 'School', 'Ambulance', 'College', 'KOL', 'Individual', 'NGO', 'Hospital', 'Clinic', 'Pharmacy', 'Other'];
  }
}

export async function addLeadType(type: string): Promise<string[]> {
  try {
    const { error } = await supabase.from('lead_types').upsert({ name: type }, { onConflict: 'name' });
    if (error) console.error('Add lead type error:', error.message);
    return await getLeadTypes();
  } catch (e) {
    return getLeadTypes();
  }
}

export async function getLeads(): Promise<Lead[]> {
  try {
    const userId = await getAuthUserId();
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Get leads error:', error.message, error.details, error.hint);
      throw new Error('Failed to load leads: ' + error.message);
    }
    return (data || []).map(transformLead);
  } catch (e: any) {
    console.error('Get leads exception:', e.message);
    return [];
  }
}

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
    locationLat: row.location_lat,
    locationLng: row.location_lng,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function saveLead(lead: Lead): Promise<void> {
  const userId = await getAuthUserId();
  const { error } = await supabase
    .from('leads')
    .update({
      name: lead.name,
      company: lead.company,
      area: lead.area,
      phone: lead.phone,
      email: lead.email,
      stage: lead.stage,
      notes: lead.notes,
      source: lead.source,
      address: lead.address,
      mobile: lead.mobile,
      lead_type: lead.leadType,
      assigned_staff: lead.assignedStaff,
      last_visit_date: lead.lastVisitDate,
      location_lat: lead.locationLat,
      location_lng: lead.locationLng,
      updated_at: new Date().toISOString(),
    })
    .eq('id', lead.id)
    .eq('user_id', userId);
  if (error) {
    console.error('Save lead error:', error.message, error.details);
    throw new Error('Failed to save lead: ' + error.message);
  }
}

export async function createLead(data: {
  name: string;
  source: string;
  address: string;
  mobile: string;
  leadType: string;
  locationLat: number | null;
  locationLng: number | null;
  assignedStaff: string;
}): Promise<Lead> {
  const userId = await getAuthUserId();
  const insertData = {
    user_id: userId,
    name: data.name,
    source: data.source || '',
    address: data.address || '',
    mobile: data.mobile,
    lead_type: data.leadType || '',
    location_lat: data.locationLat,
    location_lng: data.locationLng,
    assigned_staff: data.assignedStaff || 'Self',
    stage: 'New' as const,
  };
  const { data: row, error } = await supabase
    .from('leads')
    .insert(insertData)
    .select()
    .single();
  if (error) {
    console.error('Create lead Supabase error:', JSON.stringify(error));
    throw new Error(error.message || 'Failed to create lead');
  }
  if (!row) throw new Error('No data returned after creating lead');
  return transformLead(row);
}

export async function createLeadsBatch(leadsData: Array<{
  name: string;
  source: string;
  address: string;
  mobile: string;
  leadType: string;
  locationLat: number | null;
  locationLng: number | null;
  assignedStaff: string;
}>): Promise<Lead[]> {
  const userId = await getAuthUserId();
  const rows = leadsData.map(data => ({
    user_id: userId,
    name: data.name,
    source: data.source || '',
    address: data.address || '',
    mobile: data.mobile || '',
    lead_type: data.leadType || '',
    location_lat: data.locationLat,
    location_lng: data.locationLng,
    assigned_staff: data.assignedStaff || 'Self',
    stage: 'New' as const,
  }));
  const { data: result, error } = await supabase
    .from('leads')
    .insert(rows)
    .select();
  if (error) {
    console.error('Batch insert error:', JSON.stringify(error));
    throw new Error(error.message || 'Failed to import leads');
  }
  return (result || []).map(transformLead);
}

export async function getLeadById(id: string): Promise<Lead | undefined> {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('id', id)
      .single();
    if (error) {
      console.error('Get lead by id error:', error.message);
      return undefined;
    }
    return data ? transformLead(data) : undefined;
  } catch (e: any) {
    console.error('Get lead by id exception:', e.message);
    return undefined;
  }
}

function transformTrip(row: any): Trip {
  return {
    id: row.id,
    userId: row.user_id,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    startLat: row.start_lat,
    startLng: row.start_lng,
    endLat: row.end_lat,
    endLng: row.end_lng,
    encodedPolyline: row.encoded_polyline,
    totalDistance: row.total_distance || 0,
    pointCount: row.point_count || 0,
  };
}

export async function startTrip(location: LocationPoint): Promise<Trip> {
  const userId = await getAuthUserId();
  const today = new Date().toISOString().split('T')[0];

  const { data: row, error } = await supabase
    .from('trips')
    .insert({
      user_id: userId,
      date: today,
      start_time: new Date().toISOString(),
      start_lat: location.latitude,
      start_lng: location.longitude,
    })
    .select()
    .single();

  if (error) {
    console.error('Start trip error:', error.message, error.details);
    throw new Error('Failed to start trip: ' + error.message);
  }

  return transformTrip(row);
}

export async function endTrip(
  tripId: string,
  points: LocationPoint[],
  endLocation: LocationPoint,
  snappedPolyline?: string | null
): Promise<Trip> {
  const encodedPoly = snappedPolyline || (points.length >= 2 ? encodePolyline(points) : null);
  const totalDist = calculateTotalDistance(points);

  const { data: row, error } = await supabase
    .from('trips')
    .update({
      end_time: new Date().toISOString(),
      end_lat: endLocation.latitude,
      end_lng: endLocation.longitude,
      encoded_polyline: encodedPoly,
      total_distance: totalDist,
      point_count: points.length,
    })
    .eq('id', tripId)
    .select()
    .single();

  if (error) {
    console.error('End trip error:', error.message, error.details);
    throw new Error('Failed to end trip: ' + error.message);
  }

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

    if (error) {
      console.error('Get active trip error:', error.message);
      return null;
    }
    return data ? transformTrip(data) : null;
  } catch (e: any) {
    console.error('Get active trip exception:', e.message);
    return null;
  }
}

export async function getTripsByDate(date: string): Promise<Trip[]> {
  try {
    const userId = await getAuthUserId();
    const { data, error } = await supabase
      .from('trips')
      .select('*')
      .eq('user_id', userId)
      .eq('date', date)
      .order('start_time', { ascending: true });

    if (error) {
      console.error('Get trips by date error:', error.message);
      return [];
    }
    return (data || []).map(transformTrip);
  } catch (e: any) {
    console.error('Get trips by date exception:', e.message);
    return [];
  }
}

export async function getTripsByDateRange(startDate: string, endDate: string): Promise<Trip[]> {
  try {
    const userId = await getAuthUserId();
    const { data, error } = await supabase
      .from('trips')
      .select('*')
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('start_time', { ascending: true });

    if (error) {
      console.error('Get trips by date range error:', error.message);
      return [];
    }
    return (data || []).map(transformTrip);
  } catch (e: any) {
    console.error('Get trips by date range exception:', e.message);
    return [];
  }
}

async function getOrCreateDayRecord(userId: string, date: string): Promise<any> {
  const { data: existing, error: selectError } = await supabase
    .from('day_records')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle();

  if (selectError) {
    console.error('Day record select error:', selectError.message);
  }

  if (existing) return existing;

  const { data: created, error: insertError } = await supabase
    .from('day_records')
    .insert({ user_id: userId, date })
    .select()
    .single();

  if (insertError) {
    console.error('Day record insert error:', insertError.message, insertError.details);
    const { data: retry, error: retryError } = await supabase
      .from('day_records')
      .select('*')
      .eq('user_id', userId)
      .eq('date', date)
      .maybeSingle();
    if (retryError) console.error('Day record retry error:', retryError.message);
    if (retry) return retry;
    throw new Error('Failed to create day record: ' + insertError.message);
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

    if (tripsRes.error) console.error('Trips fetch error:', tripsRes.error.message);
    if (visitsRes.error) console.error('Visits fetch error:', visitsRes.error.message);
    if (callsRes.error) console.error('Calls fetch error:', callsRes.error.message);
    if (activitiesRes.error) console.error('Activities fetch error:', activitiesRes.error.message);

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
      visits: (visitsRes.data || []).map((r: any) => ({
        id: r.id,
        leadId: r.lead_id,
        leadName: r.lead_name,
        type: r.type,
        latitude: r.latitude,
        longitude: r.longitude,
        address: r.address,
        notes: r.notes,
        timestamp: r.timestamp,
        duration: r.duration,
        tripId: r.trip_id,
      })),
      calls: (callsRes.data || []).map((r: any) => ({
        id: r.id,
        leadId: r.lead_id,
        leadName: r.lead_name,
        type: r.type,
        duration: r.duration,
        notes: r.notes,
        timestamp: r.timestamp,
      })),
      activities: (activitiesRes.data || []).map((r: any) => ({
        id: r.id,
        leadId: r.lead_id,
        leadName: r.lead_name,
        type: r.type,
        description: r.description,
        timestamp: r.timestamp,
      })),
      totalDistance,
      totalWorkingMinutes,
    };
  } catch (e: any) {
    console.error('getDayRecord error:', e.message);
    return {
      date: d,
      trips: [],
      activeTrip: null,
      visits: [],
      calls: [],
      activities: [],
      totalDistance: 0,
      totalWorkingMinutes: 0,
    };
  }
}

export async function addVisit(visit: Omit<Visit, 'id'>, tripId?: string): Promise<Visit> {
  const userId = await getAuthUserId();
  const today = new Date().toISOString().split('T')[0];
  const dayRecord = await getOrCreateDayRecord(userId, today);

  const insertData: any = {
    day_record_id: dayRecord.id,
    lead_id: visit.leadId,
    lead_name: visit.leadName,
    type: visit.type,
    latitude: visit.latitude,
    longitude: visit.longitude,
    address: visit.address || '',
    notes: visit.notes || '',
    duration: visit.duration || 0,
  };
  if (tripId) insertData.trip_id = tripId;

  const { data: row, error } = await supabase
    .from('visits')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error('Add visit error:', error.message, error.details);
    throw new Error('Failed to add visit: ' + error.message);
  }

  return {
    id: row.id,
    leadId: row.lead_id,
    leadName: row.lead_name,
    type: row.type,
    latitude: row.latitude,
    longitude: row.longitude,
    address: row.address,
    notes: row.notes,
    timestamp: row.timestamp,
    duration: row.duration,
    tripId: row.trip_id,
  };
}

export async function getVisitsForLead(leadId: string): Promise<Visit[]> {
  const userId = await getAuthUserId();
  const { data, error } = await supabase
    .from('visits')
    .select('*, day_records!inner(user_id)')
    .eq('lead_id', leadId)
    .eq('day_records.user_id', userId)
    .order('timestamp', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Get visits for lead error:', error.message);
    return [];
  }

  return (data || []).map((r: any) => ({
    id: r.id,
    leadId: r.lead_id,
    leadName: r.lead_name,
    type: r.type,
    latitude: r.latitude,
    longitude: r.longitude,
    address: r.address,
    notes: r.notes,
    timestamp: r.timestamp,
    duration: r.duration,
    tripId: r.trip_id,
  }));
}

export async function addCallLog(call: Omit<CallLog, 'id'>): Promise<CallLog> {
  const userId = await getAuthUserId();
  const today = new Date().toISOString().split('T')[0];
  const dayRecord = await getOrCreateDayRecord(userId, today);

  const { data: row, error } = await supabase
    .from('calls')
    .insert({
      day_record_id: dayRecord.id,
      lead_id: call.leadId,
      lead_name: call.leadName,
      type: call.type,
      duration: call.duration || 0,
      notes: call.notes || '',
    })
    .select()
    .single();

  if (error) {
    console.error('Add call error:', error.message, error.details);
    throw new Error('Failed to log call: ' + error.message);
  }

  return {
    id: row.id,
    leadId: row.lead_id,
    leadName: row.lead_name,
    type: row.type,
    duration: row.duration,
    notes: row.notes,
    timestamp: row.timestamp,
  };
}

export async function getCallsForLead(leadId: string): Promise<CallLog[]> {
  try {
    const { data, error } = await supabase
      .from('calls')
      .select('*')
      .eq('lead_id', leadId)
      .order('timestamp', { ascending: false });

    if (error) {
      console.error('Get calls for lead error:', error.message);
      return [];
    }
    return (data || []).map((r: any) => ({
      id: r.id,
      leadId: r.lead_id,
      leadName: r.lead_name,
      type: r.type,
      duration: r.duration,
      notes: r.notes,
      timestamp: r.timestamp,
    }));
  } catch (e: any) {
    console.error('Get calls exception:', e.message);
    return [];
  }
}

export async function addActivity(activity: Omit<Activity, 'id'>): Promise<Activity> {
  const userId = await getAuthUserId();
  const today = new Date().toISOString().split('T')[0];
  const dayRecord = await getOrCreateDayRecord(userId, today);

  const { data: row, error } = await supabase
    .from('activities')
    .insert({
      day_record_id: dayRecord.id,
      lead_id: activity.leadId,
      lead_name: activity.leadName,
      type: activity.type,
      description: activity.description || '',
    })
    .select()
    .single();

  if (error) {
    console.error('Add activity error:', error.message, error.details);
    throw new Error('Failed to log activity: ' + error.message);
  }

  return {
    id: row.id,
    leadId: row.lead_id,
    leadName: row.lead_name,
    type: row.type,
    description: row.description,
    timestamp: row.timestamp,
  };
}

export async function saveRoutePoints(tripId: string, points: LocationPoint[]): Promise<void> {
  if (points.length === 0) return;
  try {
    const userId = await getAuthUserId();
    const today = new Date().toISOString().split('T')[0];
    const dayRecord = await getOrCreateDayRecord(userId, today);

    const rows = points.map(p => ({
      day_record_id: dayRecord.id,
      latitude: p.latitude,
      longitude: p.longitude,
      timestamp: Math.round(p.timestamp),
    }));

    const batchSize = 50;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const { error } = await supabase.from('route_points').insert(batch);
      if (error) {
        console.error('Save route points batch error:', error.message);
      }
    }
  } catch (e: any) {
    console.error('Save route points error:', e.message);
  }
}

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function calculateTotalDistance(points: LocationPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += calculateDistance(
      points[i - 1].latitude, points[i - 1].longitude,
      points[i].latitude, points[i].longitude
    );
  }
  return Math.round(total * 100) / 100;
}
