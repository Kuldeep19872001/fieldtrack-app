import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';

interface MapContentProps {
  routePointsCount: number;
  totalDistance: number;
  visitsCount: number;
  isCheckedIn: boolean;
}

export default function MapContent({ routePointsCount, totalDistance, visitsCount, isCheckedIn }: MapContentProps) {
  return (
    <View style={styles.webContent}>
      <View style={styles.webMapPlaceholder}>
        <Ionicons name="map" size={64} color={Colors.textTertiary} />
        <Text style={styles.webMapText}>Map view available on mobile devices</Text>
        <Text style={styles.webMapSubtext}>Open in Expo Go to see the live map</Text>
      </View>
      <View style={styles.webStats}>
        <View style={styles.webStatRow}>
          <Ionicons name="location" size={18} color={Colors.primary} />
          <Text style={styles.webStatLabel}>Route Points:</Text>
          <Text style={styles.webStatValue}>{routePointsCount}</Text>
        </View>
        <View style={styles.webStatRow}>
          <Ionicons name="navigate" size={18} color={Colors.accent} />
          <Text style={styles.webStatLabel}>Distance:</Text>
          <Text style={styles.webStatValue}>{totalDistance} km</Text>
        </View>
        <View style={styles.webStatRow}>
          <Ionicons name="flag" size={18} color={Colors.warning} />
          <Text style={styles.webStatLabel}>Visits:</Text>
          <Text style={styles.webStatValue}>{visitsCount}</Text>
        </View>
        <View style={styles.webStatRow}>
          <Ionicons name="radio-button-on" size={18} color={isCheckedIn ? Colors.success : Colors.textTertiary} />
          <Text style={styles.webStatLabel}>Status:</Text>
          <Text style={[styles.webStatValue, { color: isCheckedIn ? Colors.success : Colors.textSecondary }]}>
            {isCheckedIn ? 'Tracking' : 'Inactive'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  webContent: { flex: 1 },
  webMapPlaceholder: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surfaceAlt, margin: 20, borderRadius: 20, gap: 12,
  },
  webMapText: { fontSize: 16, color: Colors.textSecondary, fontFamily: 'Inter_500Medium' },
  webMapSubtext: { fontSize: 13, color: Colors.textTertiary, fontFamily: 'Inter_400Regular' },
  webStats: {
    marginHorizontal: 20, marginBottom: 20, backgroundColor: Colors.surface, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.borderLight, gap: 12,
  },
  webStatRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  webStatLabel: { fontSize: 14, color: Colors.textSecondary, fontFamily: 'Inter_400Regular', flex: 1 },
  webStatValue: { fontSize: 14, fontWeight: '600' as const, color: Colors.text, fontFamily: 'Inter_600SemiBold' },
});
