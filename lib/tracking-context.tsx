import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import * as Location from 'expo-location';
import { Platform, Alert } from 'react-native';
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
    try {
      const record = await getDayRecord();
      setDayRecord(record);
    } catch (e: any) {
      console.error('Refresh day record error:', e.message);
    }
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
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.warn('Location permission not granted for tracking');
        return;
      }

      if (Platform.OS === 'web') {
        const webTrack = setInterval(async () => {
          try {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
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
    } catch (e: any) {
      console.error('Location tracking error:', e.message);
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
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location Required', 'Please enable location permissions in your device settings to check in.');
        return false;
      }

      let loc;
      try {
        if (Platform.OS === 'web') {
          loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        } else {
          loc = await Promise.race([
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('High accuracy timeout')), 8000)),
          ]);
        }
      } catch (highAccErr: any) {
        console.warn('High accuracy failed, trying balanced:', highAccErr.message);
        try {
          loc = await Promise.race([
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Balanced accuracy timeout')), 8000)),
          ]);
        } catch (balancedErr: any) {
          console.error('Balanced accuracy also failed:', balancedErr.message);
          try {
            loc = await Promise.race([
              Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }),
              new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Low accuracy timeout')), 10000)),
            ]);
          } catch (lowErr: any) {
            console.error('All location attempts failed:', lowErr.message);
            Alert.alert('Location Error', 'Could not get your GPS location. Please make sure Location/GPS is turned on in your device settings and try again.');
            return false;
          }
        }
      }

      if (!loc || !loc.coords) {
        Alert.alert('Location Error', 'No location data received. Please try again.');
        return false;
      }

      const point: LocationPoint = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        timestamp: loc.timestamp,
      };
      console.log('Got location for check-in:', point.latitude, point.longitude);
      setCurrentLocation(point);

      try {
        const record = await storageCheckIn(point);
        setDayRecord(record);
        console.log('Check-in completed successfully');
        return true;
      } catch (saveError: any) {
        console.error('Check-in save error:', saveError.message);
        Alert.alert('Check-in Failed', 'Got your location but could not save check-in to the server. Error: ' + saveError.message);
        return false;
      }
    } catch (e: any) {
      console.error('Check-in error:', e.message);
      Alert.alert('Check-in Error', e.message || 'An unexpected error occurred during check-in.');
      return false;
    }
  }, []);

  const performCheckOut = useCallback(async () => {
    try {
      stopLocationTracking();
      const record = await storageCheckOut();
      setDayRecord(record);
    } catch (e: any) {
      console.error('Check-out error:', e.message);
      Alert.alert('Check-out Error', e.message || 'Could not complete check-out.');
    }
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
    try {
      const lead = await getLeadById(leadId);
      if (lead) {
        lead.stage = newStage;
        lead.updatedAt = new Date().toISOString();
        await saveLead(lead);
      }
    } catch (e: any) {
      console.error('Update lead stage error:', e.message);
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
