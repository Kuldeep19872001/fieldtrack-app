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

export interface LocationPoint {
  latitude: number;
  longitude: number;
  timestamp: number;
}

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
}

export interface DayRecord {
  date: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  checkInLocation: LocationPoint | null;
  routePoints: LocationPoint[];
  visits: Visit[];
  calls: CallLog[];
  activities: Activity[];
  totalDistance: number;
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
}

export interface UserProfile {
  id: string;
  username: string;
  name: string;
  role: string;
}
