import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import {
  getDayRecord, checkIn as storageCheckIn,
  checkOut as storageCheckOut, addRoutePoint, addVisit, addCallLog, addActivity,
  getLeadById, saveLead,
} from './storage';
import type { DayRecord, LocationPoint, Visit, CallLog, Activity, LeadStage } from './types';

interface TrackingContextValue {
  dayRecord: DayRecord;
  isCheckedIn: boolean;
  isTracking: boolean;
  currentLocation: LocationPoint | null;
  workingMinutes: number;
  refreshDayRecord: () => Promise<void>;
  performCheckIn: () => Promise<boolean>;
  performCheckOut: () => Promise<void>;
  logVisit: (leadId: string, leadName: string, type: Visit['type'], notes: string, address: string) => Promise<void>;
  logCall: (leadId: string, leadName: string, type: CallLog['type'], duration: number, notes: string) => Promise<void>;
  logActivity: (leadId: string, leadName: string, type: Activity['type'], description: string) => Promise<void>;
  updateLeadStage: (leadId: string, newStage: LeadStage) => Promise<void>;
}

const TrackingContext = createContext<TrackingContextValue | null>(null);

export function TrackingProvider({ children }: { children: ReactNode }) {
  const [dayRecord, setDayRecord] = useState<DayRecord>({
    date: new Date().toISOString().split('T')[0],
    checkInTime: null, checkOutTime: null, checkInLocation: null,
    routePoints: [], visits: [], calls: [], activities: [], totalDistance: 0,
  });
  const [currentLocation, setCurrentLocation] = useState<LocationPoint | null>(null);
  const [workingMinutes, setWorkingMinutes] = useState(0);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isCheckedIn = !!dayRecord.checkInTime && !dayRecord.checkOutTime;
  const isTracking = isCheckedIn;

  const refreshDayRecord = useCallback(async () => {
    const record = await getDayRecord();
    setDayRecord(record);
  }, []);

  useEffect(() => {
    refreshDayRecord();
  }, [refreshDayRecord]);

  useEffect(() => {
    if (isCheckedIn && dayRecord.checkInTime) {
      timerRef.current = setInterval(() => {
        const start = new Date(dayRecord.checkInTime!).getTime();
        const now = Date.now();
        setWorkingMinutes(Math.floor((now - start) / 60000));
      }, 10000);
      const start = new Date(dayRecord.checkInTime).getTime();
      setWorkingMinutes(Math.floor((Date.now() - start) / 60000));
    } else if (dayRecord.checkInTime && dayRecord.checkOutTime) {
      const start = new Date(dayRecord.checkInTime).getTime();
      const end = new Date(dayRecord.checkOutTime).getTime();
      setWorkingMinutes(Math.floor((end - start) / 60000));
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isCheckedIn, dayRecord.checkInTime, dayRecord.checkOutTime]);

  const startLocationTracking = useCallback(async () => {
    try {
      if (Platform.OS === 'web') {
        const webTrack = setInterval(async () => {
          try {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
            const point: LocationPoint = {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              timestamp: loc.timestamp,
            };
            setCurrentLocation(point);
            await addRoutePoint(point);
            await refreshDayRecord();
          } catch (e) { /* skip */ }
        }, 8000);
        locationSubRef.current = { remove: () => clearInterval(webTrack) } as any;
        return;
      }

      const sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000,
          distanceInterval: 5,
        },
        async (loc) => {
          const point: LocationPoint = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            timestamp: loc.timestamp,
          };
          setCurrentLocation(point);
          await addRoutePoint(point);
          await refreshDayRecord();
        }
      );
      locationSubRef.current = sub;
    } catch (e) {
      console.error('Location tracking error:', e);
    }
  }, [refreshDayRecord]);

  const stopLocationTracking = useCallback(() => {
    if (locationSubRef.current) {
      locationSubRef.current.remove();
      locationSubRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isCheckedIn) {
      startLocationTracking();
    }
    return () => stopLocationTracking();
  }, [isCheckedIn, startLocationTracking, stopLocationTracking]);

  const performCheckIn = useCallback(async (): Promise<boolean> => {
    try {
      let loc;
      if (Platform.OS === 'web') {
        loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      } else {
        loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      }
      const point: LocationPoint = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        timestamp: loc.timestamp,
      };
      setCurrentLocation(point);
      const record = await storageCheckIn(point);
      setDayRecord(record);
      return true;
    } catch (e) {
      console.error('Check-in error:', e);
      return false;
    }
  }, []);

  const performCheckOut = useCallback(async () => {
    stopLocationTracking();
    const record = await storageCheckOut();
    setDayRecord(record);
  }, [stopLocationTracking]);

  const logVisit = useCallback(async (leadId: string, leadName: string, type: Visit['type'], notes: string, address: string) => {
    let lat = currentLocation?.latitude || 0;
    let lon = currentLocation?.longitude || 0;
    try {
      if (Platform.OS !== 'web') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        lat = loc.coords.latitude;
        lon = loc.coords.longitude;
      }
    } catch (e) { /* use current */ }

    await addVisit({
      leadId, leadName, type,
      latitude: lat, longitude: lon,
      address, notes,
      timestamp: new Date().toISOString(),
      duration: 0,
    });

    await refreshDayRecord();
  }, [currentLocation, refreshDayRecord]);

  const logCall = useCallback(async (leadId: string, leadName: string, type: CallLog['type'], duration: number, notes: string) => {
    await addCallLog({ leadId, leadName, type, duration, notes, timestamp: new Date().toISOString() });
    await refreshDayRecord();
  }, [refreshDayRecord]);

  const logActivity = useCallback(async (leadId: string, leadName: string, type: Activity['type'], description: string) => {
    await addActivity({ leadId, leadName, type, description, timestamp: new Date().toISOString() });
    await refreshDayRecord();
  }, [refreshDayRecord]);

  const updateLeadStage = useCallback(async (leadId: string, newStage: LeadStage) => {
    const lead = await getLeadById(leadId);
    if (lead) {
      lead.stage = newStage;
      lead.updatedAt = new Date().toISOString();
      await saveLead(lead);
    }
  }, []);

  const value = useMemo(() => ({
    dayRecord, isCheckedIn, isTracking, currentLocation, workingMinutes,
    refreshDayRecord, performCheckIn, performCheckOut,
    logVisit, logCall, logActivity, updateLeadStage,
  }), [dayRecord, isCheckedIn, isTracking, currentLocation, workingMinutes,
    refreshDayRecord, performCheckIn, performCheckOut,
    logVisit, logCall, logActivity, updateLeadStage]);

  return <TrackingContext.Provider value={value}>{children}</TrackingContext.Provider>;
}

export function useTracking() {
  const ctx = useContext(TrackingContext);
  if (!ctx) throw new Error('useTracking must be used within TrackingProvider');
  return ctx;
}
