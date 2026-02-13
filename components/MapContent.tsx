import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';
import { snapToRoads, clearRouteCache } from '@/lib/road-snap';
import type { LocationPoint, Visit } from '@/lib/types';

interface MapContentProps {
  routePoints: LocationPoint[];
  visits: Visit[];
  checkInLocation: LocationPoint | null;
  checkOutLocation: LocationPoint | null;
  currentLocation: LocationPoint | null;
  isCheckedIn: boolean;
  totalDistance: number;
  routePointsCount: number;
  visitsCount: number;
  userName: string;
}

function ProfileMarker({ name, color, size }: { name: string; color: string; size: number }) {
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  return (
    <View style={[markerStyles.container, { width: size + 8, height: size + 8 + 12 }]}>
      <View style={[markerStyles.outerRing, { width: size + 8, height: size + 8, borderRadius: (size + 8) / 2, borderColor: color }]}>
        <View style={[markerStyles.innerCircle, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}>
          <Text style={[markerStyles.initials, { fontSize: size * 0.38 }]}>{initials}</Text>
        </View>
      </View>
      <View style={[markerStyles.pointer, { borderTopColor: color }]} />
    </View>
  );
}

function CheckMarker({ label, color, icon }: { label: string; color: string; icon: string }) {
  return (
    <View style={markerStyles.checkContainer}>
      <View style={[markerStyles.checkBubble, { backgroundColor: color }]}>
        <Ionicons name={icon as any} size={14} color="#fff" />
        <Text style={markerStyles.checkLabel}>{label}</Text>
      </View>
      <View style={[markerStyles.pointer, { borderTopColor: color }]} />
    </View>
  );
}

function VisitMarker({ visit }: { visit: Visit }) {
  const initials = visit.leadName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  return (
    <View style={markerStyles.visitContainer}>
      <View style={markerStyles.visitBubble}>
        <View style={markerStyles.visitAvatar}>
          <Text style={markerStyles.visitInitials}>{initials}</Text>
        </View>
        <Text style={markerStyles.visitName} numberOfLines={1}>{visit.leadName}</Text>
      </View>
      <View style={[markerStyles.pointer, { borderTopColor: Colors.warning }]} />
    </View>
  );
}

export default function MapContent({
  routePoints, visits, checkInLocation, checkOutLocation, currentLocation, isCheckedIn, userName,
}: MapContentProps) {
  const mapRef = useRef<MapView>(null);
  const insets = useSafeAreaInsets();
  const [snappedRoute, setSnappedRoute] = useState<{ latitude: number; longitude: number }[]>([]);
  const lastSnapCountRef = useRef(0);
  const snapInProgressRef = useRef(false);

  useEffect(() => {
    if (routePoints.length < 2) {
      setSnappedRoute(routePoints.map(p => ({ latitude: p.latitude, longitude: p.longitude })));
      lastSnapCountRef.current = routePoints.length;
      return;
    }

    const pointDiff = routePoints.length - lastSnapCountRef.current;
    if (pointDiff <= 0 || snapInProgressRef.current) return;

    if (pointDiff < 3 && lastSnapCountRef.current > 0) return;

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
      snapInProgressRef.current = false;
    });

    return () => { cancelled = true; };
  }, [routePoints]);

  const displayRoute = snappedRoute.length > 1 ? snappedRoute :
    routePoints.map(p => ({ latitude: p.latitude, longitude: p.longitude }));

  const initialRegion = currentLocation ? {
    latitude: currentLocation.latitude,
    longitude: currentLocation.longitude,
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

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        showsUserLocation={false}
        showsMyLocationButton={false}
      >
        {displayRoute.length > 1 && (
          <Polyline
            coordinates={displayRoute}
            strokeColor={Colors.primary}
            strokeWidth={5}
            lineDashPattern={undefined}
            lineCap="round"
            lineJoin="round"
          />
        )}

        {checkInLocation && (
          <Marker
            coordinate={{ latitude: checkInLocation.latitude, longitude: checkInLocation.longitude }}
            title="Check In"
            anchor={{ x: 0.5, y: 1 }}
          >
            <CheckMarker label="IN" color={Colors.success} icon="log-in-outline" />
          </Marker>
        )}

        {checkOutLocation && (
          <Marker
            coordinate={{ latitude: checkOutLocation.latitude, longitude: checkOutLocation.longitude }}
            title="Check Out"
            anchor={{ x: 0.5, y: 1 }}
          >
            <CheckMarker label="OUT" color={Colors.danger} icon="log-out-outline" />
          </Marker>
        )}

        {visits.map((visit) => (
          <Marker
            key={visit.id}
            coordinate={{ latitude: visit.latitude, longitude: visit.longitude }}
            title={visit.leadName}
            description={`${visit.type} - ${visit.notes || visit.address}`}
            anchor={{ x: 0.5, y: 1 }}
          >
            <VisitMarker visit={visit} />
          </Marker>
        ))}

        {currentLocation && isCheckedIn && (
          <Marker
            coordinate={{ latitude: currentLocation.latitude, longitude: currentLocation.longitude }}
            title={userName}
            anchor={{ x: 0.5, y: 1 }}
          >
            <ProfileMarker name={userName} color={Colors.primary} size={40} />
          </Marker>
        )}
      </MapView>
      <Pressable style={[styles.centerButton, { bottom: insets.bottom + 100 }]} onPress={centerMap}>
        <Ionicons name="locate" size={22} color={Colors.primary} />
      </Pressable>
    </View>
  );
}

const markerStyles = StyleSheet.create({
  container: { alignItems: 'center' },
  outerRing: { alignItems: 'center', justifyContent: 'center', borderWidth: 3 },
  innerCircle: { alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#fff', fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  pointer: {
    width: 0, height: 0,
    borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 10,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    marginTop: -1,
  },
  checkContainer: { alignItems: 'center' },
  checkBubble: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14,
  },
  checkLabel: { color: '#fff', fontSize: 11, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  visitContainer: { alignItems: 'center' },
  visitBubble: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 8, paddingVertical: 5,
    borderWidth: 2, borderColor: Colors.warning,
    maxWidth: 140,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15, shadowRadius: 3, elevation: 3,
  },
  visitAvatar: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.warning + '25',
    alignItems: 'center', justifyContent: 'center',
  },
  visitInitials: { fontSize: 10, fontWeight: '700' as const, color: Colors.warning, fontFamily: 'Inter_700Bold' },
  visitName: { fontSize: 11, fontWeight: '600' as const, color: Colors.text, fontFamily: 'Inter_600SemiBold', flexShrink: 1 },
});

const styles = StyleSheet.create({
  centerButton: {
    position: 'absolute', right: 16,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 6, elevation: 4,
  },
});
