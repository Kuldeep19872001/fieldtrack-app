export type LeadStage = 'New' | 'In Process' | 'Converted';

export interface Lead {
  id: string;
  name: string;
  company: string;
  area: string;
  phone: string;
  email: string;
  stage: LeadStage;
  notes: string;
  createdAt: string;
  updatedAt: string;
  source: string;
  address: string;
  mobile: string;
  leadType: string;
  assignedStaff: string;
  lastVisitDate: string | null;
  locationLat: number | null;
  locationLng: number | null;
}

/**
 * Updated to include accuracy and speed for road-snapping 
 * and diagnostic health checks.
 */
export interface LocationPoint {
  latitude: number;
  longitude: number;
  timestamp: number;
  accuracy?: number; 
  speed?: number | null;
}

export interface Trip {
  id: string;
  userId: string;
  date: string;
  startTime: string;
  endTime: string | null;
  startLat: number;
  startLng: number;
  endLat: number | null;
  endLng: number | null;
  encodedPolyline: string | null;
  totalDistance: number;
  pointCount: number;
}

/**
 * Linked to tripId to allow route-specific visit reporting.
 */
export interface Visit {
  id: string;
  leadId: string;
  leadName: string;
  type: 'Visit' | 'Re-visit' | 'First Follow-up';
  latitude: number;
  longitude: number;
  address: string;
  notes: string;
  timestamp: string;
  duration: number;
  tripId?: string; // Links visit to the specific path taken
}

export interface CallLog {
  id: string;
  leadId: string;
  leadName: string;
  type: 'Outbound' | 'Inbound';
  duration: number;
  notes: string;
  timestamp: string;
}

export interface Activity {
  id: string;
  leadId: string;
  leadName: string;
  type: 'First Follow-up' | 'Visit' | 'Re-visit' | 'Note' | 'Call';
  description: string;
  timestamp: string;
  tripId?: string; // Optional context for where the activity occurred
}

/**
 * The unified daily view for the dashboard and reports.
 */
export interface DayRecord {
  date: string;
  trips: Trip[];
  activeTrip: Trip | null;
  visits: Visit[];
  calls: CallLog[];
  activities: Activity[];
  totalDistance: number;
  totalWorkingMinutes: number;
}

export interface DailySummary {
  date: string;
  totalDistance: number;
  workingHours: number;
  totalVisits: number;
  totalCalls: number;
  leadsContacted: number;
  newLeads: number;
  convertedLeads: number;
  tripCount: number;
}

export interface UserProfile {
  id: string;
  username: string;
  name: string;
  role: string;
}