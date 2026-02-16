import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import { useTracking } from '@/lib/tracking-context';
import { useAuth } from '@/lib/auth-context';
import MapContent from '@/components/MapContent';

export default function MapScreen() {
  const { dayRecord, currentLocation, isCheckedIn } = useTracking();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const webTop = Platform.OS === 'web' ? 67 : 0;

  const checkOutLocation = dayRecord.checkOutTime && dayRecord.routePoints.length > 0
    ? dayRecord.routePoints[dayRecord.routePoints.length - 1]
    : null;

  return (
    <View style={styles.container}>
      {Platform.OS !== 'web' ? (
        <>
          <MapContent
            routePoints={dayRecord.routePoints}
            visits={dayRecord.visits}
            checkInLocation={dayRecord.checkInLocation}
            checkOutLocation={checkOutLocation}
            currentLocation={currentLocation}
            isCheckedIn={isCheckedIn}
            totalDistance={dayRecord.totalDistance}
            routePointsCount={dayRecord.routePoints.length}
            visitsCount={dayRecord.visits.length}
            userName={user?.name || 'User'}
          />
          <View style={[styles.mapOverlay, { top: insets.top + 12 }]}>
            <View style={styles.mapInfoCard}>
              <View style={styles.mapInfoRow}>
                <View style={[styles.statusDot, { backgroundColor: isCheckedIn ? Colors.success : Colors.textTertiary }]} />
                <Text style={styles.mapInfoText}>
                  {isCheckedIn ? 'Tracking Active' : dayRecord.checkOutTime ? 'Shift Complete' : 'Not Checked In'}
                </Text>
              </View>
              <View style={styles.mapStatsRow}>
                <Text style={styles.mapStatItem}>{dayRecord.totalDistance.toFixed(2)} km</Text>
                <View style={styles.mapStatDivider} />
                <Text style={styles.mapStatItem}>{dayRecord.visits.length} visits</Text>
                <View style={styles.mapStatDivider} />
                <Text style={styles.mapStatItem}>{dayRecord.routePoints.length} pts</Text>
              </View>
            </View>
          </View>
        </>
      ) : (
        <View style={{ flex: 1, paddingTop: insets.top + webTop }}>
          <View style={styles.webHeader}>
            <Text style={styles.webTitle}>Live Route Map</Text>
          </View>
          <MapContent
            routePointsCount={dayRecord.routePoints.length}
            totalDistance={dayRecord.totalDistance}
            visitsCount={dayRecord.visits.length}
            isCheckedIn={isCheckedIn}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  mapOverlay: { position: 'absolute', left: 16, right: 16 },
  mapInfoCard: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 16, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
  },
  mapInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  mapInfoText: { fontSize: 14, fontWeight: '600' as const, color: Colors.text, fontFamily: 'Inter_600SemiBold' },
  mapStatsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  mapStatItem: { fontSize: 13, color: Colors.textSecondary, fontFamily: 'Inter_500Medium' },
  mapStatDivider: { width: 1, height: 14, backgroundColor: Colors.border },
  webHeader: { paddingHorizontal: 20, paddingVertical: 16 },
  webTitle: { fontSize: 24, fontWeight: '700' as const, color: Colors.text, fontFamily: 'Inter_700Bold' },
});
