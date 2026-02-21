import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const BACKGROUND_LOCATION_TASK = 'background-location-task';
const BG_POINTS_KEY = 'bg_location_points';
const ACTIVE_TRIP_KEY = 'active_trip_id';
const TRIP_POINTS_KEY = 'trip_points_backup';

export interface BGLocationPoint {
  latitude: number;
  longitude: number;
  timestamp: number;
  accuracy?: number;
  speed?: number;
}

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }: any) => {
  if (error) {
    console.error('Background location task error:', error);
    return;
  }
  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    if (locations && locations.length > 0) {
      const newPoints: BGLocationPoint[] = locations
        .filter(loc => {
          if (loc.coords.accuracy && loc.coords.accuracy > 25) return false;
          if (loc.coords.speed && loc.coords.speed > 140) return false;
          return true;
        })
        .map(loc => ({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          timestamp: loc.timestamp,
          accuracy: loc.coords.accuracy ?? undefined,
          speed: loc.coords.speed ?? undefined,
        }));

      if (newPoints.length === 0) return;

      try {
        const existing = await AsyncStorage.getItem(BG_POINTS_KEY);
        const allPoints: BGLocationPoint[] = existing ? JSON.parse(existing) : [];
        allPoints.push(...newPoints);
        await AsyncStorage.setItem(BG_POINTS_KEY, JSON.stringify(allPoints));
      } catch (e) {
        console.error('Failed to save background location points:', e);
      }
    }
  }
});

export async function startBackgroundTracking(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  try {
    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== 'granted') return false;

    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
    if (bgStatus !== 'granted') {
      console.warn('Background location permission not granted');
      return false;
    }

    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
    if (isRegistered) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    }

    await AsyncStorage.setItem(BG_POINTS_KEY, JSON.stringify([]));

    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 5000,
      distanceInterval: 15,
      deferredUpdatesInterval: 5000,
      deferredUpdatesDistance: 15,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'FieldTrack',
        notificationBody: 'Tracking your location for the active trip',
        notificationColor: '#0066FF',
      },
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.AutomotiveNavigation,
    });

    console.log('Background location tracking started');
    return true;
  } catch (e: any) {
    console.error('Failed to start background tracking:', e.message);
    return false;
  }
}

export async function stopBackgroundTracking(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
    if (isRegistered) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      console.log('Background location tracking stopped');
    }
  } catch (e: any) {
    console.error('Failed to stop background tracking:', e.message);
  }
}

export async function getBackgroundPoints(): Promise<BGLocationPoint[]> {
  try {
    const data = await AsyncStorage.getItem(BG_POINTS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('Failed to get background points:', e);
    return [];
  }
}

export async function clearBackgroundPoints(): Promise<void> {
  try {
    await AsyncStorage.setItem(BG_POINTS_KEY, JSON.stringify([]));
  } catch (e) {
    console.error('Failed to clear background points:', e);
  }
}

export async function saveActiveTripId(tripId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(ACTIVE_TRIP_KEY, tripId);
  } catch (e) {
    console.error('Failed to save active trip ID:', e);
  }
}

export async function getActiveTripId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(ACTIVE_TRIP_KEY);
  } catch (e) {
    console.error('Failed to get active trip ID:', e);
    return null;
  }
}

export async function clearActiveTripId(): Promise<void> {
  try {
    await AsyncStorage.removeItem(ACTIVE_TRIP_KEY);
  } catch (e) {
    console.error('Failed to clear active trip ID:', e);
  }
}

export async function saveTripPointsBackup(points: BGLocationPoint[]): Promise<void> {
  try {
    await AsyncStorage.setItem(TRIP_POINTS_KEY, JSON.stringify(points));
  } catch (e) {
    console.error('Failed to save trip points backup:', e);
  }
}

export async function getTripPointsBackup(): Promise<BGLocationPoint[]> {
  try {
    const data = await AsyncStorage.getItem(TRIP_POINTS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('Failed to get trip points backup:', e);
    return [];
  }
}

export async function clearTripPointsBackup(): Promise<void> {
  try {
    await AsyncStorage.removeItem(TRIP_POINTS_KEY);
  } catch (e) {
    console.error('Failed to clear trip points backup:', e);
  }
}

export async function isBackgroundTrackingActive(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
  } catch {
    return false;
  }
}
