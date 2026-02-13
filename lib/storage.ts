import { apiRequest } from './query-client';
import type { Lead, DayRecord, LocationPoint, Visit, CallLog, Activity } from './types';

export async function getLeadTypes(): Promise<string[]> {
  try {
    const res = await apiRequest('GET', '/api/lead-types');
    const data = await res.json();
    return data.map((t: any) => t.name || t);
  } catch (e) {
    return ['Doctor', 'Nursing Home', 'School', 'Ambulance', 'College', 'KOL', 'Individual', 'NGO', 'Hospital', 'Clinic', 'Pharmacy', 'Other'];
  }
}

export async function addLeadType(type: string): Promise<string[]> {
  try {
    const res = await apiRequest('POST', '/api/lead-types', { name: type });
    const data = await res.json();
    return data.map((t: any) => t.name || t);
  } catch (e) {
    return getLeadTypes();
  }
}

export async function getLeads(): Promise<Lead[]> {
  try {
    const res = await apiRequest('GET', '/api/leads');
    return await res.json();
  } catch (e) {
    return [];
  }
}

export async function saveLead(lead: Lead): Promise<void> {
  try {
    await apiRequest('PUT', `/api/leads/${lead.id}`, {
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
      leadType: lead.leadType,
      assignedStaff: lead.assignedStaff,
      lastVisitDate: lead.lastVisitDate,
      locationLat: lead.locationLat,
      locationLng: lead.locationLng,
    });
  } catch (e) {
    console.error('Save lead error:', e);
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
  const res = await apiRequest('POST', '/api/leads', data);
  return await res.json();
}

export async function getLeadById(id: string): Promise<Lead | undefined> {
  try {
    const res = await apiRequest('GET', `/api/leads/${id}`);
    return await res.json();
  } catch (e) {
    return undefined;
  }
}

export async function getDayRecord(date?: string): Promise<DayRecord> {
  const d = date || new Date().toISOString().split('T')[0];
  try {
    const res = await apiRequest('GET', `/api/day-record?date=${d}`);
    return await res.json();
  } catch (e) {
    return {
      date: d,
      checkInTime: null,
      checkOutTime: null,
      checkInLocation: null,
      routePoints: [],
      visits: [],
      calls: [],
      activities: [],
      totalDistance: 0,
    };
  }
}

export async function checkIn(location: LocationPoint): Promise<DayRecord> {
  const res = await apiRequest('POST', '/api/day-record/check-in', {
    latitude: location.latitude,
    longitude: location.longitude,
    timestamp: location.timestamp,
  });
  return await res.json();
}

export async function checkOut(): Promise<DayRecord> {
  const res = await apiRequest('POST', '/api/day-record/check-out');
  return await res.json();
}

export async function addRoutePoint(point: LocationPoint): Promise<void> {
  try {
    await apiRequest('POST', '/api/route-points', {
      latitude: point.latitude,
      longitude: point.longitude,
      timestamp: point.timestamp,
    });
  } catch (e) {
    console.warn('Route point save error:', e);
  }
}

export async function addVisit(visit: Omit<Visit, 'id'>): Promise<Visit> {
  const res = await apiRequest('POST', '/api/visits', {
    leadId: visit.leadId,
    leadName: visit.leadName,
    type: visit.type,
    latitude: visit.latitude,
    longitude: visit.longitude,
    address: visit.address,
    notes: visit.notes,
    duration: visit.duration,
  });
  return await res.json();
}

export async function addCallLog(call: Omit<CallLog, 'id'>): Promise<CallLog> {
  const res = await apiRequest('POST', '/api/calls', {
    leadId: call.leadId,
    leadName: call.leadName,
    type: call.type,
    duration: call.duration,
    notes: call.notes,
  });
  return await res.json();
}

export async function getCallsForLead(leadId: string): Promise<CallLog[]> {
  try {
    const res = await apiRequest('GET', `/api/calls?leadId=${leadId}`);
    return await res.json();
  } catch (e) {
    return [];
  }
}

export async function addActivity(activity: Omit<Activity, 'id'>): Promise<Activity> {
  const res = await apiRequest('POST', '/api/activities', {
    leadId: activity.leadId,
    leadName: activity.leadName,
    type: activity.type,
    description: activity.description,
  });
  return await res.json();
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
