import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import * as Location from 'expo-location';
import { Platform, Alert, AppState, AppStateStatus } from 'react-native';
import {
  getDayRecord, startTrip, endTrip, getActiveTrip,
  addVisit, addCallLog, addActivity,
  getLeadById, saveLead, calculateDistance, saveRoutePoints,
} from './storage';
import { snapToRoads } from './roads-api';
import { encodePolyline } from './polyline';
import {
  startBackgroundTracking, stopBackgroundTracking,
  getBackgroundPoints, clearBackgroundPoints,
  saveActiveTripId, clearActiveTripId, getActiveTripId,
  saveTripPointsBackup, getTripPointsBackup, clearTripPointsBackup,
  isBackgroundTrackingActive,
} from './background-tracking';
import type { DayRecord, LocationPoint, Visit, CallLog, Activity, LeadStage, Trip } from './types';

const MIN_DISTANCE_METERS = 5;
const MAX_ACCURACY_METERS = 50;
const MAX_SPEED_MPS = 140;
const TRACKING_TIME_INTERVAL = 5000;
const TRACKING_DISTANCE_INTERVAL = 5;
const POINTS_BACKUP_INTERVAL = 30000;

interface TrackingContextValue {
  dayRecord: DayRecord;
  isCheckedIn: boolean;
  isTracking: boolean;
  currentLocation: LocationPoint | null;
  workingMinutes: number;
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
  const [workingMinutes, setWorkingMinutes] = useState(0);
  const [tripPoints, setTripPoints] = useState<LocationPoint[]>([]);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const backupTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeTripRef = useRef<Trip | null>(null);
  const tripPointsRef = useRef<LocationPoint[]>([]);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const bgTrackingActiveRef = useRef(false);

  const isCheckedIn = !!dayRecord.activeTrip;
  const isTracking = isCheckedIn;

  const refreshDayRecord = useCallback(async () => {
    try {
      const record = await getDayRecord();
      setDayRecord(record);
      if (record.activeTrip) {
        activeTripRef.current = record.activeTrip;
      }
    } catch (e: any) {
      console.error('Refresh day record error:', e.message);
    }
  }, []);

  const restoreTripPoints = useCallback(async () => {
    if (Platform.OS === 'web') return;
    try {
      const savedTripId = await getActiveTripId();
      if (!savedTripId) return;

      const savedPoints = await getTripPointsBackup();
      if (savedPoints.length > 0) {
        const restoredPoints: LocationPoint[] = savedPoints.map(p => ({
          latitude: p.latitude,
          longitude: p.longitude,
          timestamp: p.timestamp,
          accuracy: p.accuracy,
          speed: p.speed,
        }));
        tripPointsRef.current = restoredPoints;
        setTripPoints(restoredPoints);
        if (restoredPoints.length > 0) {
          setCurrentLocation(restoredPoints[restoredPoints.length - 1]);
        }
      }
    } catch (e: any) {
      console.error('Restore trip points error:', e.message);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      await refreshDayRecord();
      await restoreTripPoints();
    };
    init();
  }, [refreshDayRecord, restoreTripPoints]);

  const persistTripPoints = useCallback(async () => {
    if (Platform.OS === 'web') return;
    if (tripPointsRef.current.length > 0 && activeTripRef.current) {
      try {
        await saveTripPointsBackup(tripPointsRef.current.map(p => ({
          latitude: p.latitude,
          longitude: p.longitude,
          timestamp: p.timestamp,
          accuracy: p.accuracy,
          speed: p.speed,
        })));
      } catch (e: any) {
        console.error('Persist trip points error:', e.message);
      }
    }
  }, []);

  const syncBackgroundPoints = useCallback(async () => {
    if (Platform.OS === 'web') return;
    try {
      const bgPoints = await getBackgroundPoints();
      if (bgPoints.length > 0) {
        const validPoints: LocationPoint[] = [];
        for (const bp of bgPoints) {
          const point: LocationPoint = {
            latitude: bp.latitude,
            longitude: bp.longitude,
            timestamp: bp.timestamp,
            accuracy: bp.accuracy,
            speed: bp.speed,
          };
          const lastPoint = tripPointsRef.current.length > 0
            ? tripPointsRef.current[tripPointsRef.current.length - 1]
            : (validPoints.length > 0 ? validPoints[validPoints.length - 1] : null);

          if (lastPoint) {
            if (point.accuracy && point.accuracy > MAX_ACCURACY_METERS) continue;
            const distKm = calculateDistance(lastPoint.latitude, lastPoint.longitude, point.latitude, point.longitude);
            const distMeters = distKm * 1000;
            if (distMeters < MIN_DISTANCE_METERS) continue;
            const timeDiff = (point.timestamp - lastPoint.timestamp) / 1000;
            if (timeDiff > 0 && (distMeters / timeDiff) > MAX_SPEED_MPS) continue;
          }
          validPoints.push(point);
        }

        if (validPoints.length > 0) {
          tripPointsRef.current = [...tripPointsRef.current, ...validPoints];
          setTripPoints([...tripPointsRef.current]);
          if (validPoints.length > 0) {
            setCurrentLocation(validPoints[validPoints.length - 1]);
          }
        }
        await clearBackgroundPoints();
        await persistTripPoints();
      }
    } catch (e) {
      console.error('Sync background points error:', e);
    }
  }, [persistTripPoints]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        if (activeTripRef.current) {
          await syncBackgroundPoints();
          refreshDayRecord();
        }
      }
      if (nextState.match(/inactive|background/) && activeTripRef.current) {
        await persistTripPoints();
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, [refreshDayRecord, syncBackgroundPoints, persistTripPoints]);

  useEffect(() => {
    if (isCheckedIn && dayRecord.activeTrip) {
      timerRef.current = setInterval(() => {
        const start = new Date(dayRecord.activeTrip!.startTime).getTime();
        const baseMinutes = dayRecord.trips
          .filter(t => t.endTime)
          .reduce((sum, t) => {
            return sum + Math.floor((new Date(t.endTime!).getTime() - new Date(t.startTime).getTime()) / 60000);
          }, 0);
        const activeMinutes = Math.floor((Date.now() - start) / 60000);
        setWorkingMinutes(baseMinutes + activeMinutes);
      }, 10000);

      const start = new Date(dayRecord.activeTrip.startTime).getTime();
      const baseMinutes = dayRecord.trips
        .filter(t => t.endTime)
        .reduce((sum, t) => {
          return sum + Math.floor((new Date(t.endTime!).getTime() - new Date(t.startTime).getTime()) / 60000);
        }, 0);
      setWorkingMinutes(baseMinutes + Math.floor((Date.now() - start) / 60000));
    } else {
      setWorkingMinutes(dayRecord.totalWorkingMinutes);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isCheckedIn, dayRecord.activeTrip, dayRecord.trips, dayRecord.totalWorkingMinutes]);

  const isValidPoint = useCallback((point: LocationPoint, lastPoint: LocationPoint | null): boolean => {
    if (point.accuracy && point.accuracy > MAX_ACCURACY_METERS) {
      return false;
    }

    if (lastPoint) {
      const distKm = calculateDistance(lastPoint.latitude, lastPoint.longitude, point.latitude, point.longitude);
      const distMeters = distKm * 1000;

      if (distMeters < MIN_DISTANCE_METERS) {
        return false;
      }

      const timeDiff = (point.timestamp - lastPoint.timestamp) / 1000;
      if (timeDiff > 0) {
        const speed = distMeters / timeDiff;
        if (speed > MAX_SPEED_MPS) {
          return false;
        }
      }
    }

    return true;
  }, []);

  const addTripPoint = useCallback((point: LocationPoint) => {
    const lastPoint = tripPointsRef.current.length > 0
      ? tripPointsRef.current[tripPointsRef.current.length - 1]
      : null;

    if (!isValidPoint(point, lastPoint)) return;

    tripPointsRef.current = [...tripPointsRef.current, point];
    setTripPoints([...tripPointsRef.current]);
  }, [isValidPoint]);

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
              accuracy: loc.coords.accuracy ?? undefined,
              speed: loc.coords.speed ?? undefined,
            };
            setCurrentLocation(point);
            addTripPoint(point);
          } catch (e) { /* skip */ }
        }, TRACKING_TIME_INTERVAL);
        locationSubRef.current = { remove: () => clearInterval(webTrack) } as any;
        return;
      }

      const sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: TRACKING_TIME_INTERVAL,
          distanceInterval: TRACKING_DISTANCE_INTERVAL,
        },
        (loc) => {
          const point: LocationPoint = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            timestamp: loc.timestamp,
            accuracy: loc.coords.accuracy ?? undefined,
            speed: loc.coords.speed ?? undefined,
          };
          setCurrentLocation(point);
          addTripPoint(point);
        }
      );
      locationSubRef.current = sub;

      const bgStarted = await startBackgroundTracking();
      bgTrackingActiveRef.current = bgStarted;
      if (bgStarted) {
        console.log('Background tracking enabled via foreground service');
      }

      backupTimerRef.current = setInterval(() => {
        persistTripPoints();
      }, POINTS_BACKUP_INTERVAL);
    } catch (e: any) {
      console.error('Location tracking error:', e.message);
    }
  }, [addTripPoint, persistTripPoints]);

  const stopLocationTracking = useCallback(async () => {
    if (locationSubRef.current) {
      locationSubRef.current.remove();
      locationSubRef.current = null;
    }

    if (backupTimerRef.current) {
      clearInterval(backupTimerRef.current);
      backupTimerRef.current = null;
    }

    if (bgTrackingActiveRef.current) {
      await stopBackgroundTracking();
      bgTrackingActiveRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (isCheckedIn) {
      startLocationTracking();
    }
    return () => {
      stopLocationTracking();
    };
  }, [isCheckedIn, startLocationTracking, stopLocationTracking]);

  const getLocationWithFallback = useCallback(async (): Promise<Location.LocationObject> => {
    if (Platform.OS === 'web') {
      return Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    }

    try {
      return await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('High accuracy timeout')), 8000)),
      ]);
    } catch {
      try {
        return await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Balanced accuracy timeout')), 8000)),
        ]);
      } catch {
        return await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Low accuracy timeout')), 10000)),
        ]);
      }
    }
  }, []);

  const performCheckIn = useCallback(async (): Promise<boolean> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location Required', 'Please enable location permissions in your device settings to check in.');
        return false;
      }

      let loc;
      try {
        loc = await getLocationWithFallback();
      } catch (e: any) {
        Alert.alert('Location Error', 'Could not get your GPS location. Please make sure Location/GPS is turned on in your device settings and try again.');
        return false;
      }

      if (!loc || !loc.coords) {
        Alert.alert('Location Error', 'No location data received. Please try again.');
        return false;
      }

      const point: LocationPoint = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        timestamp: loc.timestamp,
        accuracy: loc.coords.accuracy ?? undefined,
      };
      setCurrentLocation(point);

      tripPointsRef.current = [point];
      setTripPoints([point]);

      await clearBackgroundPoints();
      await clearTripPointsBackup();

      try {
        const trip = await startTrip(point);
        activeTripRef.current = trip;
        await saveActiveTripId(trip.id);
        await saveTripPointsBackup([{
          latitude: point.latitude,
          longitude: point.longitude,
          timestamp: point.timestamp,
          accuracy: point.accuracy,
          speed: point.speed,
        }]);
        await refreshDayRecord();
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
  }, [getLocationWithFallback, refreshDayRecord]);

  const performCheckOut = useCallback(async () => {
    try {
      await stopLocationTracking();

      await syncBackgroundPoints();

      const activeTrip = activeTripRef.current;
      if (!activeTrip) {
        Alert.alert('Error', 'No active trip found to check out.');
        return;
      }

      let endLocation: LocationPoint;
      try {
        const loc = await getLocationWithFallback();
        endLocation = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          timestamp: loc.timestamp,
          accuracy: loc.coords.accuracy ?? undefined,
        };
      } catch {
        const lastPoint = tripPointsRef.current.length > 0
          ? tripPointsRef.current[tripPointsRef.current.length - 1]
          : { latitude: activeTrip.startLat, longitude: activeTrip.startLng, timestamp: Date.now() };
        endLocation = lastPoint;
      }

      const startPoint: LocationPoint = {
        latitude: activeTrip.startLat,
        longitude: activeTrip.startLng,
        timestamp: new Date(activeTrip.startTime).getTime(),
      };

      if (tripPointsRef.current.length === 0) {
        tripPointsRef.current = [startPoint];
      }

      const lastPoint = tripPointsRef.current[tripPointsRef.current.length - 1];
      const endDistFromLast = calculateDistance(
        lastPoint.latitude, lastPoint.longitude,
        endLocation.latitude, endLocation.longitude
      ) * 1000;
      if (endDistFromLast >= 1) {
        tripPointsRef.current = [...tripPointsRef.current, endLocation];
      }

      if (tripPointsRef.current.length < 2) {
        tripPointsRef.current = [startPoint, endLocation];
      }

      try {
        await saveRoutePoints(activeTrip.id, tripPointsRef.current);
      } catch (e: any) {
        console.warn('Failed to save route points to backup table:', e.message);
      }

      let snappedPolyline: string | null = null;
      let snappedDistance: number | null = null;
      if (tripPointsRef.current.length >= 2) {
        try {
          const snappedPoints = await snapToRoads(tripPointsRef.current);
          if (snappedPoints.length >= 2) {
            snappedPolyline = encodePolyline(snappedPoints);
            let dist = 0;
            for (let i = 1; i < snappedPoints.length; i++) {
              dist += calculateDistance(
                snappedPoints[i - 1].latitude, snappedPoints[i - 1].longitude,
                snappedPoints[i].latitude, snappedPoints[i].longitude
              );
            }
            snappedDistance = Math.round(dist * 100) / 100;
          }
        } catch (e: any) {
          console.warn('Road snapping failed, using raw GPS points:', e.message);
        }
      }

      if (!snappedPolyline && tripPointsRef.current.length >= 2) {
        snappedPolyline = encodePolyline(tripPointsRef.current);
      }

      await endTrip(activeTrip.id, tripPointsRef.current, endLocation, snappedPolyline, snappedDistance);

      tripPointsRef.current = [];
      setTripPoints([]);
      activeTripRef.current = null;

      await clearBackgroundPoints();
      await clearActiveTripId();
      await clearTripPointsBackup();

      await refreshDayRecord();
    } catch (e: any) {
      console.error('Check-out error:', e.message);
      Alert.alert('Check-out Error', e.message || 'Could not complete check-out.');
    }
  }, [stopLocationTracking, syncBackgroundPoints, getLocationWithFallback, refreshDayRecord]);

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

    let resolvedAddress = address;
    if (!resolvedAddress || resolvedAddress.trim() === '') {
      try {
        const geocode = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
        if (geocode && geocode.length > 0) {
          const g = geocode[0];
          const parts = [g.name, g.street, g.district, g.city, g.region, g.postalCode].filter(Boolean);
          resolvedAddress = parts.join(', ') || `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
        } else {
          resolvedAddress = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
        }
      } catch (e) {
        resolvedAddress = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
      }
    }

    const tripId = activeTripRef.current?.id;

    await addVisit({
      leadId, leadName, type,
      latitude: lat, longitude: lon,
      address: resolvedAddress, notes,
      timestamp: new Date().toISOString(),
      duration: 0,
    }, tripId);

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
    dayRecord, isCheckedIn, isTracking, currentLocation, workingMinutes, tripPoints,
    refreshDayRecord, performCheckIn, performCheckOut,
    logVisit, logCall, logActivity, updateLeadStage,
  }), [dayRecord, isCheckedIn, isTracking, currentLocation, workingMinutes, tripPoints,
    refreshDayRecord, performCheckIn, performCheckOut,
    logVisit, logCall, logActivity, updateLeadStage]);

  return <TrackingContext.Provider value={value}>{children}</TrackingContext.Provider>;
}

export function useTracking() {
  const ctx = useContext(TrackingContext);
  if (!ctx) throw new Error('useTracking must be used within TrackingProvider');
  return ctx;
}
