import React, { useRef, useMemo } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';
import type { Visit, Trip } from '@/lib/types';
import { decodePolyline } from '@/lib/polyline';

interface MapContentProps {
  trips?: Trip[];
  livePoints?: Array<{ latitude: number; longitude: number }>;
  visits?: Visit[];
  currentLocation?: { latitude: number; longitude: number } | null;
  isCheckedIn: boolean;
  userName?: string;
}

const TRIP_COLORS = [
  Colors.primary,
  '#E91E63',
  '#9C27B0',
  '#FF9800',
  '#009688',
  '#3F51B5',
];

export default function MapContent({
  trips = [], livePoints = [], visits = [], currentLocation = null, isCheckedIn, userName = 'User',
}: MapContentProps) {
  const mapRef = useRef<MapView>(null);
  const insets = useSafeAreaInsets();

  // 1. Memoize decoded trips to prevent expensive re-calculation on live point updates
  const decodedTrips = useMemo(() => {
    return trips.map((trip, idx) => {
      if (!trip.encodedPolyline) return { trip, coords: [], color: TRIP_COLORS[idx % TRIP_COLORS.length] };
      try {
        const coords = decodePolyline(trip.encodedPolyline);
        return { trip, coords, color: TRIP_COLORS[idx % TRIP_COLORS.length] };
      } catch (e) {
        console.warn('Polyline decoding failed for trip:', trip.id);
        return { trip, coords: [], color: TRIP_COLORS[idx % TRIP_COLORS.length] };
      }
    }).filter(t => t.coords.length >= 2);
  }, [trips]);

  // 2. Aggregate all coordinates for fitting the view
  const allCoords = useMemo(() => {
    const coords: Array<{ latitude: number; longitude: number }> = [];
    decodedTrips.forEach(t => coords.push(...t.coords));
    if (livePoints.length > 0) coords.push(...livePoints);
    return coords;
  }, [decodedTrips, livePoints]);

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
    const coordsToFit = allCoords.length > 1 ? allCoords : (currentLocation ? [currentLocation] : []);
    if (mapRef.current && coordsToFit.length >= 2) {
      mapRef.current.fitToCoordinates(coordsToFit, {
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
        provider={PROVIDER_GOOGLE} // Ensure consistent rendering
        initialRegion={{
          latitude: currentLocation?.latitude || 19.0760,
          longitude: currentLocation?.longitude || 72.8777,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        showsUserLocation={isCheckedIn}
        showsMyLocationButton={false}
        showsCompass={true}
        rotateEnabled={false} // Cleaner UX for navigation
      >
        {/* Historical Trip Polylines */}
        {decodedTrips.map((dt) => (
          <Polyline
            key={dt.trip.id}
            coordinates={dt.coords}
            strokeColor={dt.color}
            strokeWidth={4}
            lineCap="round"
            lineJoin="round"
          />
        ))}

        {/* Live Active Trip Polyline */}
        {isCheckedIn && livePoints.length >= 2 && (
          <Polyline
            coordinates={livePoints}
            strokeColor={Colors.primary}
            strokeWidth={5} // Slightly thicker for the active trip
            lineCap="round"
            lineJoin="round"
            zIndex={10}
          />
        )}

        {/* Start/End Markers for History */}
        {trips.map((trip, idx) => (
          <React.Fragment key={`markers-${trip.id}`}>
            <Marker
              coordinate={{ latitude: Number(trip.startLat), longitude: Number(trip.startLng) }}
              title={`Trip ${idx + 1} Start`}
              pinColor="green"
            />
            {trip.endLat != null && trip.endLng != null && (
              <Marker
                coordinate={{ latitude: Number(trip.endLat), longitude: Number(trip.endLng) }}
                title={`Trip ${idx + 1} End`}
                pinColor="red"
              />
            )}
          </React.Fragment>
        ))}

        {/* Visit Markers */}
        {visits.map((visit) => (
          <Marker
            key={visit.id}
            coordinate={{ latitude: Number(visit.latitude), longitude: Number(visit.longitude) }}
            title={visit.leadName}
            description={`${visit.type} - ${visit.notes || ''}`}
          >
            <View style={styles.visitMarker}>
              <Ionicons name="location" size={26} color="#FF9800" />
            </View>
          </Marker>
        ))}

        {/* User Pointer (when not checked in) */}
        {currentLocation && !isCheckedIn && (
          <Marker
            coordinate={currentLocation}
            title={userName}
            flat
          >
             <Ionicons name="navigate" size={24} color={Colors.primary} />
          </Marker>
        )}
      </MapView>

      {/* Map Controls */}
      <View style={[styles.buttonColumn, { bottom: insets.bottom + 20 }]}>
        {allCoords.length > 1 && (
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
    position: 'absolute', right: 16, gap: 12,
  },
  mapButton: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 4, elevation: 5,
  },
  visitMarker: {
    alignItems: 'center',
    justifyContent: 'center',
  }
});