import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import * as Location from 'expo-location';
import { Platform, Alert, AppState, AppStateStatus } from 'react-native';
import {
  getDayRecord, startTrip, endTrip,
  saveVisit, addCallLog, addActivity,
  getLeadById, saveLead, calculateDistance, saveRoutePoints,
} from '../lib/storage';
import { snapToRoads } from '../lib/roads-api';
import { encodePolyline } from '../lib/polyline';
import {
  startBackgroundTracking, stopBackgroundTracking,
  getBackgroundPoints, clearBackgroundPoints,
  saveActiveTripId, clearActiveTripId,
  saveTripPointsBackup, getTripPointsBackup, clearTripPointsBackup,
} from '../lib/background-tracking';
import type { DayRecord, LocationPoint, Visit, CallLog, Activity, LeadStage, Trip } from '../lib/types';

// Performance Tuning
const MIN_DISTANCE_METERS = 10; 
const MAX_ACCURACY_METERS = 35; // Balance between clean lines and signal availability
const MAX_SPEED_MPS = 40;       
const TRACKING_TIME_INTERVAL = 5000;
const SYNC_INTERVAL = 30000;     // Sync to DB every 30 seconds

interface TrackingContextValue {
  dayRecord: DayRecord;
  isCheckedIn: boolean;
  currentLocation: LocationPoint | null;
  tripPoints: LocationPoint[];
  refreshDayRecord: () => Promise<void>;
  performCheckIn: () => Promise<boolean>;
  performCheckOut: () => Promise<void>;
  logVisit: (leadId: string, leadName: string, type: Visit['type'], notes: string, address: string) => Promise<void>;
  logCall: (leadId: string, leadName: string, type: CallLog['type'], duration: number, notes: string) => Promise<void>;
  logActivity: (leadId: string, leadName: string, type: Activity['type'], description: string) => Promise<void>;
  updateLeadStage: (leadId: string, newStage: LeadStage) => Promise<void>;
}

const emptyDayRecord: DayRecord = {
  date: new Date().toISOString().split('T')[0],
  trips: [], activeTrip: null,
  visits: [], calls: [], activities: [],
  totalDistance: 0, totalWorkingMinutes: 0,
};

const TrackingContext = createContext<TrackingContextValue | null>(null);

export function TrackingProvider({ children }: { children: ReactNode }) {
  const [dayRecord, setDayRecord] = useState<DayRecord>(emptyDayRecord);
  const [currentLocation, setCurrentLocation] = useState<LocationPoint | null>(null);
  const [tripPoints, setTripPoints] = useState<LocationPoint[]>([]);
  
  const isMounted = useRef(true);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const syncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeTripRef = useRef<Trip | null>(null);
  const tripPointsRef = useRef<LocationPoint[]>([]);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const isCheckedIn = !!dayRecord.activeTrip;

  // --- DATA REFRESH ---
  const refreshDayRecord = useCallback(async () => {
    try {
      const record = await getDayRecord();
      if (!isMounted.current) return;
      setDayRecord(record);
      if (record.activeTrip) {
        activeTripRef.current = record.activeTrip;
      }
    } catch (e) {
      console.error('Refresh DayRecord Error:', e);
    }
  }, []);

  // --- GEOGRAPHIC FILTERING ---
  const isValidPoint = useCallback((point: LocationPoint, lastPoint: LocationPoint | null): boolean => {
    if (point.accuracy && point.accuracy > MAX_ACCURACY_METERS) return false;
    if (!lastPoint) return true;

    const distKm = calculateDistance(lastPoint.latitude, lastPoint.longitude, point.latitude, point.longitude);
    const distMeters = distKm * 1000;
    
    // Ignore GPS jitter (moving less than 10m)
    if (distMeters < MIN_DISTANCE_METERS) return false;

    // Ignore impossible speeds (GPS jumps)
    const timeDiff = (point.timestamp - lastPoint.timestamp) / 1000;
    if (timeDiff > 0 && (distMeters / timeDiff) > MAX_SPEED_MPS) return false;

    return true;
  }, []);

  // --- BACKGROUND SYNC ---
  const syncBackgroundPoints = useCallback(async () => {
    if (Platform.OS === 'web' || !activeTripRef.current) return;
    
    try {
      const bgPoints = await getBackgroundPoints();
      if (bgPoints.length === 0) return;

      const newValidPoints: LocationPoint[] = [];
      let lastPoint = tripPointsRef.current[tripPointsRef.current.length - 1] || null;

      for (const bp of bgPoints) {
        if (isValidPoint(bp, lastPoint)) {
          newValidPoints.push(bp);
          lastPoint = bp;
        }
      }

      if (newValidPoints.length > 0) {
        tripPointsRef.current = [...tripPointsRef.current, ...newValidPoints];
        setTripPoints([...tripPointsRef.current]);
        setCurrentLocation(newValidPoints[newValidPoints.length - 1]);
        
        // Push to permanent DB storage
        await saveRoutePoints(activeTripRef.current.id, newValidPoints);
      }
      
      await clearBackgroundPoints();
      await saveTripPointsBackup(tripPointsRef.current);
    } catch (e) {
      console.error('Sync Background Error:', e);
    }
  }, [isValidPoint]);

  // --- CHECK-IN ---
  const performCheckIn = useCallback(async (): Promise<boolean> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
      
      if (status !== 'granted' || bgStatus !== 'granted') {
        Alert.alert('Permission Required', 'Enable "Always" location access to track your work route.');
        return false;
      }

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const startPoint: LocationPoint = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        timestamp: loc.timestamp,
        accuracy: loc.coords.accuracy ?? undefined,
      };

      const trip = await startTrip(startPoint);
      activeTripRef.current = trip;
      tripPointsRef.current = [startPoint];
      setTripPoints([startPoint]);
      setCurrentLocation(startPoint);

      await saveActiveTripId(trip.id);
      await startBackgroundTracking();
      await refreshDayRecord();
      
      return true;
    } catch (e: any) {
      Alert.alert('Check-in Failed', e.message);
      return false;
    }
  }, [refreshDayRecord]);

  // --- CHECK-OUT ---
  const performCheckOut = useCallback(async () => {
    try {
      if (!activeTripRef.current) return;

      await stopBackgroundTracking();
      await syncBackgroundPoints();

      const lastLoc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const endPoint: LocationPoint = {
        latitude: lastLoc.coords.latitude,
        longitude: lastLoc.coords.longitude,
        timestamp: lastLoc.timestamp,
      };

      // Ensure points exist
      if (tripPointsRef.current.length < 2) {
        tripPointsRef.current.push(endPoint);
      }

      // Final Road Snapping
      let finalPoly: string | null = null;
      let finalDist: number | null = null;

      try {
        const snapped = await snapToRoads(tripPointsRef.current);
        if (snapped.length >= 2) {
          finalPoly = encodePolyline(snapped);
          let d = 0;
          for(let i=1; i<snapped.length; i++) {
            d += calculateDistance(snapped[i-1].latitude, snapped[i-1].longitude, snapped[i].latitude, snapped[i].longitude);
          }
          finalDist = d;
        }
      } catch (e) {
        console.warn('Road snap fallback used.');
      }

      await endTrip(activeTripRef.current.id, tripPointsRef.current, endPoint, finalPoly, finalDist);

      // Cleanup
      activeTripRef.current = null;
      tripPointsRef.current = [];
      setTripPoints([]);
      await clearActiveTripId();
      await clearTripPointsBackup();
      await refreshDayRecord();

    } catch (e: any) {
      Alert.alert('Check-out Error', e.message);
    }
  }, [syncBackgroundPoints, refreshDayRecord]);

  // --- APP LIFECYCLE & PERSISTENCE ---
  useEffect(() => {
    isMounted.current = true;
    const restoreSession = async () => {
      await refreshDayRecord();
      const backup = await getTripPointsBackup();
      if (backup.length > 0) {
        tripPointsRef.current = backup;
        setTripPoints(backup);
      }
    };
    restoreSession();

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        syncBackgroundPoints();
      }
      appStateRef.current = nextStateState;
    });

    return () => {
      isMounted.current = false;
      appStateSub.remove();
      if (syncTimerRef.current) clearInterval(syncTimerRef.current);
    };
  }, [refreshDayRecord, syncBackgroundPoints]);

  // --- LIVE TRACKING WATCHER ---
  useEffect(() => {
    if (isCheckedIn) {
      Location.watchPositionAsync(
        { 
          accuracy: Location.Accuracy.High, 
          timeInterval: TRACKING_TIME_INTERVAL, 
          distanceInterval: 10 
        },
        (loc) => {
          const p: LocationPoint = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            timestamp: loc.timestamp,
            accuracy: loc.coords.accuracy ?? undefined,
          };
          setCurrentLocation(p);
          if (isValidPoint(p, tripPointsRef.current[tripPointsRef.current.length - 1])) {
            tripPointsRef.current = [...tripPointsRef.current, p];
            setTripPoints([...tripPointsRef.current]);
          }
        }
      ).then(sub => locationSubRef.current = sub);
      
      syncTimerRef.current = setInterval(syncBackgroundPoints, SYNC_INTERVAL);
    } else {
      if (locationSubRef.current) locationSubRef.current.remove();
      if (syncTimerRef.current) clearInterval(syncTimerRef.current);
    }
  }, [isCheckedIn, isValidPoint, syncBackgroundPoints]);

  // --- LOGGERS ---
  const logVisit = useCallback(async (leadId: string, leadName: string, type: Visit['type'], notes: string, address: string) => {
    const tripId = activeTripRef.current?.id;
    await saveVisit({
      leadId, leadName, type,
      latitude: currentLocation?.latitude || 0,
      longitude: currentLocation?.longitude || 0,
      address, notes, timestamp: new Date().toISOString(), duration: 0,
      tripId
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
      await saveLead(lead);
    }
  }, []);

  const value = useMemo(() => ({
    dayRecord, isCheckedIn, currentLocation, tripPoints,
    refreshDayRecord, performCheckIn, performCheckOut,
    logVisit, logCall, logActivity, updateLeadStage,
  }), [dayRecord, isCheckedIn, currentLocation, tripPoints, performCheckIn, performCheckOut, logVisit, logCall, logActivity, updateLeadStage, refreshDayRecord]);

  return <TrackingContext.Provider value={value}>{children}</TrackingContext.Provider>;
}

export function useTracking() {
  const ctx = useContext(TrackingContext);
  if (!ctx) throw new Error('useTracking must be used within TrackingProvider');
  return ctx;
}