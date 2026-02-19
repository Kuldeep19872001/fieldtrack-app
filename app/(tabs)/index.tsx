import React, { useState, useEffect } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, Platform, Alert, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import Colors from '@/constants/colors';
import { useAuth } from '@/lib/auth-context';
import { useTracking } from '@/lib/tracking-context';
import { router } from 'expo-router';

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

function formatClock(isoStr: string | null): string {
  if (!isoStr) return '--:--';
  const d = new Date(isoStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const {
    dayRecord, isCheckedIn, currentLocation, workingMinutes,
    performCheckIn, performCheckOut, refreshDayRecord, tripPoints,
  } = useTracking();
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    (async () => {
      const { status: existing } = await Location.getForegroundPermissionsAsync();
      if (existing === 'granted') {
        setPermissionGranted(true);
      }
    })();
  }, []);

  const showLocationDisclosure = (): Promise<boolean> => {
    return new Promise((resolve) => {
      Alert.alert(
        'Location Access Required',
        'FieldTrack collects your GPS location during active work trips (check-in to check-out) to record your route, calculate distance traveled, and display your path on the map.\n\nBackground location is used to continue tracking even when the app is minimized. A notification will be shown whenever tracking is active.\n\nNo location data is collected when you are not on an active trip.',
        [
          { text: 'Deny', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Allow', onPress: () => resolve(true) },
        ],
        { cancelable: false }
      );
    });
  };

  const handleCheckIn = async () => {
    if (!permissionGranted) {
      const accepted = await showLocationDisclosure();
      if (!accepted) return;
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required to track your trips. Please enable it in your device settings.');
        return;
      }
      setPermissionGranted(true);
    }
    setCheckingIn(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    await performCheckIn();
    setCheckingIn(false);
  };

  const handleCheckOut = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    await performCheckOut();
  };

  const handleLogout = () => {
    if (isCheckedIn) {
      Alert.alert('Cannot Sign Out', 'You have an active trip. Please check out first before signing out.');
      return;
    }
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => {
        try {
          await logout();
          router.replace('/login');
        } catch (e: any) {
          if (e.message === 'ACTIVE_TRIP') {
            Alert.alert('Cannot Sign Out', 'You have an active trip. Please check out first before signing out.');
          } else {
            Alert.alert('Error', 'Failed to sign out. Please try again.');
          }
        }
      }},
    ]);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshDayRecord();
    setRefreshing(false);
  };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const webTop = Platform.OS === 'web' ? 67 : 0;

  const completedTrips = dayRecord.trips.filter(t => t.endTime);
  const activeTrip = dayRecord.activeTrip;
  const tripCount = dayRecord.trips.length;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + webTop + 16, paddingBottom: 100 + (Platform.OS === 'web' ? 34 : 0) }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{greeting()}</Text>
            <Text style={styles.userName}>{user?.name || 'Field Staff'}</Text>
          </View>
          <Pressable onPress={handleLogout} hitSlop={12}>
            <Ionicons name="log-out-outline" size={24} color={Colors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.dateRow}>
          <Ionicons name="calendar-outline" size={16} color={Colors.textTertiary} />
          <Text style={styles.dateText}>
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </Text>
        </View>

        <View style={styles.checkCard}>
          <LinearGradient
            colors={isCheckedIn ? ['#059669', '#047857'] : completedTrips.length > 0 ? ['#6B7280', '#4B5563'] : [Colors.primary, Colors.primaryDark]}
            style={styles.checkGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.checkInfo}>
              {activeTrip ? (
                <View style={styles.checkTimeRow}>
                  <View style={styles.checkTimeBlock}>
                    <Text style={styles.checkLabel}>Trip Started</Text>
                    <Text style={styles.checkTime}>{formatClock(activeTrip.startTime)}</Text>
                  </View>
                  <View style={styles.checkDivider} />
                  <View style={styles.checkTimeBlock}>
                    <Text style={styles.checkLabel}>GPS Points</Text>
                    <Text style={styles.checkTime}>{tripPoints.length}</Text>
                  </View>
                </View>
              ) : completedTrips.length > 0 ? (
                <View style={styles.checkTimeRow}>
                  <View style={styles.checkTimeBlock}>
                    <Text style={styles.checkLabel}>Trips</Text>
                    <Text style={styles.checkTime}>{completedTrips.length}</Text>
                  </View>
                  <View style={styles.checkDivider} />
                  <View style={styles.checkTimeBlock}>
                    <Text style={styles.checkLabel}>Total Time</Text>
                    <Text style={styles.checkTime}>{formatTime(workingMinutes)}</Text>
                  </View>
                </View>
              ) : (
                <View style={styles.checkTimeRow}>
                  <View style={styles.checkTimeBlock}>
                    <Text style={styles.checkLabel}>No trips yet</Text>
                    <Text style={styles.checkTime}>--:--</Text>
                  </View>
                </View>
              )}

              {isCheckedIn ? (
                <View style={styles.activeIndicator}>
                  <View style={styles.pulseDot} />
                  <Text style={styles.activeText}>Tracking Active  {formatTime(workingMinutes)}</Text>
                </View>
              ) : null}
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.checkButton,
                isCheckedIn ? styles.checkOutButton : styles.checkInButton,
                pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
              ]}
              onPress={isCheckedIn ? handleCheckOut : handleCheckIn}
              disabled={checkingIn}
            >
              <Ionicons name={isCheckedIn ? 'stop-circle' : 'play-circle'} size={22} color={isCheckedIn ? Colors.danger : '#fff'} />
              <Text style={[styles.checkButtonText, isCheckedIn && { color: Colors.danger }]}>
                {checkingIn ? 'Getting Location...' : isCheckedIn ? 'Check Out' : `Check In${tripCount > 0 ? ` (Trip ${tripCount + 1})` : ''}`}
              </Text>
            </Pressable>
          </LinearGradient>
        </View>

        <View style={styles.statsGrid}>
          <StatCard icon="navigate-outline" label="Distance" value={`${dayRecord.totalDistance.toFixed(2)} km`} color={Colors.primary} />
          <StatCard icon="time-outline" label="Hours" value={formatTime(workingMinutes)} color={Colors.accent} />
          <StatCard icon="location-outline" label="Visits" value={`${dayRecord.visits.length}`} color={Colors.warning} />
          <StatCard icon="call-outline" label="Calls" value={`${dayRecord.calls.length}`} color={Colors.stageConverted} />
        </View>

        {completedTrips.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Trips Today</Text>
            {completedTrips.map((trip, i) => (
              <View key={trip.id} style={styles.tripItem}>
                <View style={[styles.tripIndex, { backgroundColor: Colors.primaryLight }]}>
                  <Text style={styles.tripIndexText}>{i + 1}</Text>
                </View>
                <View style={styles.tripContent}>
                  <Text style={styles.tripTimeText}>
                    {formatClock(trip.startTime)} - {formatClock(trip.endTime)}
                  </Text>
                  <Text style={styles.tripMeta}>
                    {trip.totalDistance.toFixed(2)} km  |  {trip.pointCount} pts
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {dayRecord.visits.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Today's Visits</Text>
            {dayRecord.visits.slice().reverse().map((v, i) => (
              <Pressable
                key={v.id || i}
                style={styles.visitItem}
                onPress={() => v.leadId ? router.push(`/lead/${v.leadId}`) : null}
              >
                <View style={[styles.visitIndex, { backgroundColor: Colors.primaryLight }]}>
                  <Ionicons name="location" size={16} color={Colors.primary} />
                </View>
                <View style={styles.visitContent}>
                  <Text style={styles.visitName}>{v.leadName}</Text>
                  <View style={styles.visitAddrRow}>
                    <Ionicons name="navigate-outline" size={12} color={Colors.textTertiary} />
                    <Text style={styles.visitAddr} numberOfLines={2}>{v.address || 'No address'}</Text>
                  </View>
                  <View style={styles.visitMetaRow}>
                    <Text style={styles.visitType}>{v.type}</Text>
                    <Text style={styles.visitTime}>{formatClock(v.timestamp)}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
              </Pressable>
            ))}
          </View>
        )}

        {dayRecord.activities.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            {dayRecord.activities.slice(-5).reverse().map((act, i) => (
              <View key={act.id || i} style={styles.activityItem}>
                <View style={[styles.activityDot, { backgroundColor: getActivityColor(act.type) }]} />
                <View style={styles.activityContent}>
                  <Text style={styles.activityType}>{act.type}</Text>
                  <Text style={styles.activityDesc} numberOfLines={1}>{act.description}</Text>
                  <Text style={styles.activityTime}>{formatClock(act.timestamp)}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyActivity}>
            <Ionicons name="clipboard-outline" size={40} color={Colors.textTertiary} />
            <Text style={styles.emptyText}>No activity yet today</Text>
            <Text style={styles.emptySubtext}>Check in to start tracking</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIconBg, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function getActivityColor(type: string): string {
  switch (type) {
    case 'Visit': return Colors.primary;
    case 'Re-visit': return Colors.accent;
    case 'First Follow-up': return Colors.warning;
    case 'Call': return Colors.stageConverted;
    case 'Note': return Colors.textSecondary;
    default: return Colors.textTertiary;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  greeting: { fontSize: 14, color: Colors.textSecondary, fontFamily: 'Inter_400Regular' },
  userName: { fontSize: 24, fontWeight: '700' as const, color: Colors.text, fontFamily: 'Inter_700Bold' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 20, marginTop: 4 },
  dateText: { fontSize: 13, color: Colors.textTertiary, fontFamily: 'Inter_400Regular' },
  checkCard: { borderRadius: 20, overflow: 'hidden', marginBottom: 20 },
  checkGradient: { padding: 20 },
  checkInfo: { marginBottom: 16 },
  checkTimeRow: { flexDirection: 'row', alignItems: 'center' },
  checkTimeBlock: { flex: 1, alignItems: 'center' },
  checkLabel: { fontSize: 12, color: 'rgba(255,255,255,0.6)', fontFamily: 'Inter_500Medium', marginBottom: 4 },
  checkTime: { fontSize: 22, fontWeight: '700' as const, color: '#FFFFFF', fontFamily: 'Inter_700Bold' },
  checkDivider: { width: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.2)' },
  activeIndicator: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12, gap: 8 },
  pulseDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4ADE80' },
  activeText: { fontSize: 13, color: 'rgba(255,255,255,0.8)', fontFamily: 'Inter_500Medium' },
  checkButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: 14, gap: 8,
  },
  checkInButton: { backgroundColor: 'rgba(255,255,255,0.2)' },
  checkOutButton: { backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)' },
  checkButtonText: { fontSize: 16, fontWeight: '600' as const, color: '#FFFFFF', fontFamily: 'Inter_600SemiBold' },
  completedBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
  completedText: { fontSize: 14, color: 'rgba(255,255,255,0.8)', fontFamily: 'Inter_500Medium' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  statCard: {
    flex: 1, minWidth: '45%' as any, backgroundColor: Colors.surface,
    borderRadius: 16, padding: 16, alignItems: 'flex-start',
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  statIconBg: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  statValue: { fontSize: 20, fontWeight: '700' as const, color: Colors.text, fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: 12, color: Colors.textTertiary, fontFamily: 'Inter_400Regular', marginTop: 2 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '600' as const, color: Colors.text, fontFamily: 'Inter_600SemiBold', marginBottom: 12 },
  tripItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.surface, borderRadius: 12, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: Colors.borderLight,
  },
  tripIndex: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  tripIndexText: { fontSize: 14, fontWeight: '700' as const, color: Colors.primary, fontFamily: 'Inter_700Bold' },
  tripContent: { flex: 1 },
  tripTimeText: { fontSize: 14, fontWeight: '600' as const, color: Colors.text, fontFamily: 'Inter_600SemiBold' },
  tripMeta: { fontSize: 12, color: Colors.textSecondary, fontFamily: 'Inter_400Regular', marginTop: 2 },
  activityItem: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: Colors.surface, borderRadius: 12, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: Colors.borderLight,
  },
  activityDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  activityContent: { flex: 1 },
  activityType: { fontSize: 13, fontWeight: '600' as const, color: Colors.text, fontFamily: 'Inter_600SemiBold' },
  activityDesc: { fontSize: 12, color: Colors.textSecondary, fontFamily: 'Inter_400Regular', marginTop: 2 },
  activityTime: { fontSize: 11, color: Colors.textTertiary, fontFamily: 'Inter_400Regular', marginTop: 2 },
  visitItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.surface, borderRadius: 12, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: Colors.borderLight,
  },
  visitIndex: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  visitContent: { flex: 1 },
  visitName: { fontSize: 14, fontWeight: '600' as const, color: Colors.text, fontFamily: 'Inter_600SemiBold' },
  visitAddrRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: 3 },
  visitAddr: { flex: 1, fontSize: 12, color: Colors.textSecondary, fontFamily: 'Inter_400Regular' },
  visitMetaRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  visitType: { fontSize: 11, color: Colors.primary, fontFamily: 'Inter_500Medium' },
  visitTime: { fontSize: 11, color: Colors.textTertiary, fontFamily: 'Inter_400Regular' },
  emptyActivity: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '600' as const, color: Colors.textSecondary, fontFamily: 'Inter_600SemiBold' },
  emptySubtext: { fontSize: 13, color: Colors.textTertiary, fontFamily: 'Inter_400Regular' },
});
