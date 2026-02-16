import React, { useRef, useState, useEffect } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';
import { snapToRoads, clearRouteCache } from '@/lib/road-snap';
import type { LocationPoint, Visit } from '@/lib/types';

interface MapContentProps {
  routePoints?: LocationPoint[];
  visits?: Visit[];
  checkInLocation?: LocationPoint | null;
  checkOutLocation?: LocationPoint | null;
  currentLocation?: LocationPoint | null;
  isCheckedIn: boolean;
  totalDistance?: number;
  routePointsCount?: number;
  visitsCount?: number;
  userName?: string;
}

export default function MapContent({
  routePoints = [], visits = [], checkInLocation = null, checkOutLocation = null, currentLocation = null, isCheckedIn, userName = 'User',
}: MapContentProps) {
  const mapRef = useRef<MapView>(null);
  const insets = useSafeAreaInsets();
  const [snappedRoute, setSnappedRoute] = useState<{ latitude: number; longitude: number }[]>([]);
  const lastSnapCountRef = useRef(0);
  const snapInProgressRef = useRef(false);
  const snapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (routePoints.length < 2) {
      setSnappedRoute(routePoints.map(p => ({ latitude: p.latitude, longitude: p.longitude })));
      lastSnapCountRef.current = routePoints.length;
      return;
    }

    const pointDiff = routePoints.length - lastSnapCountRef.current;
    if (pointDiff <= 0 || snapInProgressRef.current) return;

    if (snapTimerRef.current) clearTimeout(snapTimerRef.current);

    snapTimerRef.current = setTimeout(() => {
      snapInProgressRef.current = true;
      let cancelled = false;

      clearRouteCache();
      snapToRoads(routePoints).then(coords => {
        if (!cancelled) {
          setSnappedRoute(coords);
          lastSnapCountRef.current = routePoints.length;
        }
        snapInProgressRef.current = false;
      }).catch(() => {
        if (!cancelled) {
          setSnappedRoute(routePoints.map(p => ({ latitude: p.latitude, longitude: p.longitude })));
          lastSnapCountRef.current = routePoints.length;
        }
        snapInProgressRef.current = false;
      });

      return () => { cancelled = true; };
    }, 2000);

    return () => {
      if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
    };
  }, [routePoints]);

  const displayRoute = snappedRoute.length > 1 ? snappedRoute :
    routePoints.map(p => ({ latitude: p.latitude, longitude: p.longitude }));

  const initialRegion = currentLocation ? {
    latitude: currentLocation.latitude,
    longitude: currentLocation.longitude,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  } : checkInLocation ? {
    latitude: checkInLocation.latitude,
    longitude: checkInLocation.longitude,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  } : {
    latitude: 19.076,
    longitude: 72.8777,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  const centerMap = () => {
    if (mapRef.current && currentLocation) {
      mapRef.current.animateToRegion({
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 500);
    }
  };

  const fitRoute = () => {
    if (mapRef.current && displayRoute.length > 1) {
      mapRef.current.fitToCoordinates(displayRoute, {
        edgePadding: { top: 120, right: 60, bottom: 120, left: 60 },
        animated: true,
      });
    }
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        showsUserLocation={isCheckedIn}
        showsMyLocationButton={false}
        showsCompass={true}
      >
        {displayRoute.length > 1 && (
          <Polyline
            coordinates={displayRoute}
            strokeColor={Colors.primary}
            strokeWidth={4}
            lineCap="round"
            lineJoin="round"
          />
        )}

        {checkInLocation && (
          <Marker
            coordinate={{ latitude: checkInLocation.latitude, longitude: checkInLocation.longitude }}
            title="Check In"
            description={`Checked in at ${new Date().toLocaleTimeString()}`}
            pinColor="green"
          />
        )}

        {checkOutLocation && (
          <Marker
            coordinate={{ latitude: checkOutLocation.latitude, longitude: checkOutLocation.longitude }}
            title="Check Out"
            description="End of shift"
            pinColor="red"
          />
        )}

        {visits.map((visit) => (
          <Marker
            key={visit.id}
            coordinate={{ latitude: visit.latitude, longitude: visit.longitude }}
            title={visit.leadName}
            description={`${visit.type} - ${visit.notes || visit.address}`}
            pinColor="orange"
          />
        ))}

        {currentLocation && !isCheckedIn && (
          <Marker
            coordinate={{ latitude: currentLocation.latitude, longitude: currentLocation.longitude }}
            title={userName}
            pinColor="blue"
          />
        )}
      </MapView>

      <View style={[styles.buttonColumn, { bottom: insets.bottom + 100 }]}>
        {displayRoute.length > 1 && (
          <Pressable style={styles.mapButton} onPress={fitRoute}>
            <Ionicons name="expand" size={20} color={Colors.primary} />
          </Pressable>
        )}
        <Pressable style={styles.mapButton} onPress={centerMap}>
          <Ionicons name="locate" size={22} color={Colors.primary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  buttonColumn: {
    position: 'absolute', right: 16, gap: 10,
  },
  mapButton: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 6, elevation: 4,
  },
});
