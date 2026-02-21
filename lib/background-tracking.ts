import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const BACKGROUND_LOCATION_TASK = 'background-location-task';
const BG_POINTS_KEY = 'bg_location_points';
const ACTIVE_TRIP_KEY = 'active_trip_id';
const TRIP_POINTS_KEY = 'trip_points_backup';

// Constants for filtering (Synced with TrackingProvider)
const MAX_ACCURACY_METERS = 30; // Anything above 30 is likely a tower guess
const MAX_SPEED_MPS = 45;      // Approx 160km/h - filters GPS "teleportation" glitches

export interface BGLocationPoint {
  latitude: number;
  longitude: number;
  timestamp: number;
  accuracy?: number;
  speed?: number;
}

// Global variable to prevent concurrent write collisions within the task
let isProcessing = false;

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }: any) => {
  if (error) {
    console.error('Background location task error:', error);
    return;
  }
  
  if (data && !isProcessing) {
    isProcessing = true;
    const { locations } = data as { locations: Location.LocationObject[] };
    
    if (locations && locations.length > 0) {
      // 1. Filter points immediately for quality
      const validNewPoints: BGLocationPoint[] = locations
        .filter(loc => {
          const acc = loc.coords.accuracy;
          const speed = loc.coords.speed;
          if (acc && acc > MAX_ACCURACY_METERS) return false;
          if (speed && speed > MAX_SPEED_MPS) return false;
          return true;
        })
        .map(loc => ({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          timestamp: loc.timestamp,
          accuracy: loc.coords.accuracy ?? undefined,
          speed: loc.coords.speed ?? undefined,
        }));

      if (validNewPoints.length > 0) {
        try {
          // 2. Use a "Get-Modify-Set" pattern with error handling
          const existingData = await AsyncStorage.getItem(BG_POINTS_KEY);
          const currentPoints: BGLocationPoint[] = existingData ? JSON.parse(existingData) : [];
          
          // Deduplicate based on timestamp to prevent double-logging
          const lastTimestamp = currentPoints.length > 0 ? currentPoints[currentPoints.length - 1].timestamp : 0;
          const uniqueNewPoints = validNewPoints.filter(p => p.timestamp > lastTimestamp);

          if (uniqueNewPoints.length > 0) {
            const updatedPoints = [...currentPoints, ...uniqueNewPoints];
            await AsyncStorage.setItem(BG_POINTS_KEY, JSON.stringify(updatedPoints));
          }
        } catch (e) {
          console.error('Failed to sync BG points to storage:', e);
        }
      }
    }
    isProcessing = false;
  }
});

export async function startBackgroundTracking(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  try {
    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== 'granted') return false;

    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
    if (bgStatus !== 'granted') {
      console.warn('Background location permission denied');
      return false;
    }

    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
    if (isRegistered) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    }

    // Reset background points buffer when starting a new trip
    await AsyncStorage.setItem(BG_POINTS_KEY, JSON.stringify([]));

    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: 5000,
      distanceInterval: 10, // Increased slightly to reduce jitter while stationary
      deferredUpdatesInterval: 10000,
      deferredUpdatesDistance: 10,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'FieldTrack Active',
        notificationBody: 'Recording your trip in the background',
        notificationColor: '#0066FF',
      },
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.AutomotiveNavigation,
    });

    return true;
  } catch (e: any) {
    console.error('Start background tracking error:', e.message);
    return false;
  }
}

export async function stopBackgroundTracking(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
    if (isRegistered) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    }
  } catch (e: any) {
    console.error('Stop background tracking error:', e.message);
  }
}

// --- STORAGE HELPERS (Standardized for TrackingProvider) ---

export async function getBackgroundPoints(): Promise<BGLocationPoint[]> {
  try {
    const data = await AsyncStorage.getItem(BG_POINTS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function clearBackgroundPoints(): Promise<void> {
  try {
    await AsyncStorage.setItem(BG_POINTS_KEY, JSON.stringify([]));
  } catch (e) {}
}

export async function saveActiveTripId(tripId: string): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_TRIP_KEY, tripId);
}

export async function getActiveTripId(): Promise<string | null> {
  return await AsyncStorage.getItem(ACTIVE_TRIP_KEY);
}

export async function clearActiveTripId(): Promise<void> {
  await AsyncStorage.removeItem(ACTIVE_TRIP_KEY);
}

export async function saveTripPointsBackup(points: BGLocationPoint[]): Promise<void> {
  try {
    // We stringify once here to ensure data integrity
    await AsyncStorage.setItem(TRIP_POINTS_KEY, JSON.stringify(points));
  } catch (e) {}
}

export async function getTripPointsBackup(): Promise<BGLocationPoint[]> {
  try {
    const data = await AsyncStorage.getItem(TRIP_POINTS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function clearTripPointsBackup(): Promise<void> {
  await AsyncStorage.removeItem(TRIP_POINTS_KEY);
}

export async function isBackgroundTrackingActive(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  return await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
}