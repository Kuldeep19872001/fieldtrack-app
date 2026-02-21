import React, { useRef } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
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

const MAX_SEGMENT_GAP_KM = 0.5;
const LIVE_JUMP_THRESHOLD_KM = 0.15;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function splitAtGaps(points: Array<{ latitude: number; longitude: number }>, maxGapKm: number = MAX_SEGMENT_GAP_KM): Array<Array<{ latitude: number; longitude: number }>> {
  if (points.length < 2) return [];
  const segments: Array<Array<{ latitude: number; longitude: number }>> = [];
  let current = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const dist = haversineKm(prev.latitude, prev.longitude, points[i].latitude, points[i].longitude);
    if (dist > maxGapKm) {
      if (current.length >= 2) segments.push(current);
      current = [points[i]];
    } else {
      current.push(points[i]);
    }
  }
  if (current.length >= 2) segments.push(current);
  return segments;
}

function splitLivePoints(points: Array<{ latitude: number; longitude: number }>): Array<Array<{ latitude: number; longitude: number }>> {
  if (points.length < 3) return [];
  const segments = splitAtGaps(points, LIVE_JUMP_THRESHOLD_KM);
  return segments.filter(seg => seg.length >= 3);
}

export default function MapContent({
  trips = [], livePoints = [], visits = [], currentLocation = null, isCheckedIn, userName = 'User',
}: MapContentProps) {
  const mapRef = useRef<MapView>(null);
  const insets = useSafeAreaInsets();

  const decodedTrips = trips.map((trip, idx) => {
    if (!trip.encodedPolyline) return { trip, coords: [], color: TRIP_COLORS[idx % TRIP_COLORS.length] };
    const coords = decodePolyline(trip.encodedPolyline);
    return { trip, coords, color: TRIP_COLORS[idx % TRIP_COLORS.length] };
  }).filter(t => t.coords.length >= 2);

  const liveSegments = splitLivePoints(livePoints);

  const allCoords: Array<{ latitude: number; longitude: number }> = [];
  decodedTrips.forEach(t => allCoords.push(...t.coords));
  liveSegments.forEach(seg => allCoords.push(...seg));
  if (currentLocation) allCoords.push(currentLocation);

  const initialRegion = currentLocation ? {
    latitude: currentLocation.latitude,
    longitude: currentLocation.longitude,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  } : allCoords.length > 0 ? {
    latitude: allCoords[0].latitude,
    longitude: allCoords[0].longitude,
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
    const coordsToFit = allCoords.length > 0 ? allCoords : (currentLocation ? [currentLocation] : []);
    if (mapRef.current && coordsToFit.length > 1) {
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
        initialRegion={initialRegion}
        showsUserLocation={isCheckedIn}
        showsMyLocationButton={false}
        showsCompass={true}
      >
        {decodedTrips.map((dt) => {
          const segments = splitAtGaps(dt.coords);
          return segments.map((seg, si) => (
            <Polyline
              key={`${dt.trip.id}-${si}`}
              coordinates={seg}
              strokeColor={dt.color}
              strokeWidth={4}
              lineCap="round"
              lineJoin="round"
            />
          ));
        })}

        {isCheckedIn && liveSegments.map((segment, i) => (
          <Polyline
            key={`live-${i}`}
            coordinates={segment}
            strokeColor={Colors.primary}
            strokeWidth={4}
            lineCap="round"
            lineJoin="round"
            lineDashPattern={[0]}
          />
        ))}

        {trips.map((trip, idx) => {
          const dt = decodedTrips.find(d => d.trip.id === trip.id);
          const startCoord = dt && dt.coords.length > 0
            ? dt.coords[0]
            : { latitude: trip.startLat, longitude: trip.startLng };
          const endCoord = dt && dt.coords.length > 0
            ? dt.coords[dt.coords.length - 1]
            : (trip.endLat != null && trip.endLng != null ? { latitude: trip.endLat, longitude: trip.endLng } : null);
          return (
            <React.Fragment key={`markers-${trip.id}`}>
              <Marker
                coordinate={startCoord}
                title={`Trip ${idx + 1} Start`}
                description={new Date(trip.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                pinColor="green"
              />
              {endCoord && trip.endTime && (
                <Marker
                  coordinate={endCoord}
                  title={`Trip ${idx + 1} End`}
                  description={new Date(trip.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  pinColor="red"
                />
              )}
            </React.Fragment>
          );
        })}

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
        {(allCoords.length > 1 || livePoints.length > 1) && (
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
