import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, Platform, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import { useTracking } from '@/lib/tracking-context';
import { useAuth } from '@/lib/auth-context';
import { getTripsByDateRange } from '@/lib/storage';
import MapContent from '@/components/MapContent';
import DateRangePicker from '@/components/DateRangePicker';
import type { Trip, Visit } from '@/lib/types';

function formatDateShort(d: Date): string {
  return d.toISOString().split('T')[0];
}

export default function MapScreen() {
  const { dayRecord, currentLocation, isCheckedIn, tripPoints } = useTracking();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const webTop = Platform.OS === 'web' ? 67 : 0;

  const today = formatDateShort(new Date());
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [displayTrips, setDisplayTrips] = useState<Trip[]>([]);
  const [displayVisits, setDisplayVisits] = useState<Visit[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const isToday = fromDate === today && toDate === today;

  const tripsToShow = isToday ? dayRecord.trips : displayTrips;
  const visitsToShow = isToday ? dayRecord.visits : displayVisits;
  const totalDistance = isToday
    ? dayRecord.totalDistance
    : displayTrips.reduce((sum, t) => sum + t.totalDistance, 0);
  const tripCount = tripsToShow.length;

  const livePoints = isToday && isCheckedIn
    ? tripPoints.map(p => ({ latitude: p.latitude, longitude: p.longitude }))
    : [];

  const loadRangeTrips = useCallback(async (from: string, to: string) => {
    if (from === today && to === today) return;
    setIsLoadingHistory(true);
    try {
      const trips = await getTripsByDateRange(from, to);
      setDisplayTrips(trips);
      setDisplayVisits([]);
    } catch (e) {
      console.error('Load range trips error:', e);
    }
    setIsLoadingHistory(false);
  }, [today]);

  const handleDateRangeChange = useCallback((from: string, to: string) => {
    setFromDate(from);
    setToDate(to);
    if (from !== today || to !== today) {
      loadRangeTrips(from, to);
    }
  }, [today, loadRangeTrips]);

  return (
    <View style={styles.container}>
      {Platform.OS !== 'web' ? (
        <>
          <MapContent
            trips={tripsToShow}
            livePoints={livePoints}
            visits={visitsToShow}
            currentLocation={currentLocation}
            isCheckedIn={isCheckedIn}
            userName={user?.name || 'User'}
          />
          <View style={[styles.mapOverlay, { top: insets.top + 12 }]}>
            <View style={styles.mapInfoCard}>
              <DateRangePicker
                fromDate={fromDate}
                toDate={toDate}
                onDateRangeChange={handleDateRangeChange}
              />

              <View style={styles.mapInfoRow}>
                <View style={[styles.statusDot, { backgroundColor: isToday && isCheckedIn ? Colors.success : Colors.textTertiary }]} />
                <Text style={styles.mapInfoText}>
                  {isToday && isCheckedIn ? 'Tracking Active' : isToday && dayRecord.trips.some(t => t.endTime) ? 'Trips Today' : !isToday ? 'History' : 'Not Checked In'}
                </Text>
              </View>
              <View style={styles.mapStatsRow}>
                <Text style={styles.mapStatItem}>{totalDistance.toFixed(2)} km</Text>
                <View style={styles.mapStatDivider} />
                <Text style={styles.mapStatItem}>{tripCount} trip{tripCount !== 1 ? 's' : ''}</Text>
                <View style={styles.mapStatDivider} />
                <Text style={styles.mapStatItem}>{visitsToShow.length} visits</Text>
              </View>
            </View>
          </View>
        </>
      ) : (
        <View style={{ flex: 1, paddingTop: insets.top + webTop }}>
          <View style={styles.webHeader}>
            <Text style={styles.webTitle}>Route Map</Text>
            <DateRangePicker
              fromDate={fromDate}
              toDate={toDate}
              onDateRangeChange={handleDateRangeChange}
            />
          </View>
          <MapContent
            trips={tripsToShow}
            livePoints={livePoints}
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
  webTitle: { fontSize: 24, fontWeight: '700' as const, color: Colors.text, fontFamily: 'Inter_700Bold', marginBottom: 8 },
});
