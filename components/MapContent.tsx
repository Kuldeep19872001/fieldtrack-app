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

  const allCoords: Array<{ latitude: number; longitude: number }> = [];
  decodedTrips.forEach(t => allCoords.push(...t.coords));
  if (livePoints.length > 0) allCoords.push(...livePoints);

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

        {livePoints.length >= 2 && (
          <Polyline
            coordinates={livePoints}
            strokeColor={Colors.primary}
            strokeWidth={4}
            lineCap="round"
            lineJoin="round"
            lineDashPattern={[0]}
          />
        )}

        {trips.map((trip, idx) => (
          <React.Fragment key={`markers-${trip.id}`}>
            <Marker
              coordinate={{ latitude: trip.startLat, longitude: trip.startLng }}
              title={`Trip ${idx + 1} Start`}
              description={new Date(trip.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              pinColor="green"
            />
            {trip.endLat != null && trip.endLng != null && (
              <Marker
                coordinate={{ latitude: trip.endLat, longitude: trip.endLng }}
                title={`Trip ${idx + 1} End`}
                description={trip.endTime ? new Date(trip.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                pinColor="red"
              />
            )}
          </React.Fragment>
        ))}

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
