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

export default function MapContent({ 
  routePointsCount, 
  totalDistance, 
  visitsCount, 
  isCheckedIn 
}: MapContentProps) {
  
  // Format distance for clean display on the dashboard
  const formattedDistance = totalDistance ? totalDistance.toFixed(2) : '0.00';

  return (
    <View style={styles.webContent}>
      {/* Visual Placeholder for the Map */}
      <View style={styles.webMapPlaceholder}>
        <View style={styles.iconCircle}>
          <Ionicons name="map" size={48} color={Colors.primary} />
        </View>
        <Text style={styles.webMapText}>Live Map Visualization</Text>
        <Text style={styles.webMapSubtext}>
          Interactive maps are optimized for mobile. 
          {'\n'}View live paths in the mobile app.
        </Text>
      </View>

      {/* Synchronized Stats Dashboard */}
      <View style={styles.webStats}>
        <Text style={styles.dashboardTitle}>Current Session Overview</Text>
        
        <View style={styles.webStatRow}>
          <View style={[styles.statusIndicator, { backgroundColor: isCheckedIn ? Colors.success : Colors.textTertiary }]} />
          <Text style={styles.webStatLabel}>Tracking Status:</Text>
          <Text style={[styles.webStatValue, { color: isCheckedIn ? Colors.success : Colors.textSecondary }]}>
            {isCheckedIn ? 'ACTIVE' : 'INACTIVE'}
          </Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.webStatRow}>
          <Ionicons name="analytics" size={18} color={Colors.primary} />
          <Text style={styles.webStatLabel}>Data Points Collected:</Text>
          <Text style={styles.webStatValue}>{routePointsCount}</Text>
        </View>

        <View style={styles.webStatRow}>
          <Ionicons name="bicycle" size={18} color={Colors.accent} />
          <Text style={styles.webStatLabel}>Distance Traveled:</Text>
          <Text style={styles.webStatValue}>{formattedDistance} km</Text>
        </View>

        <View style={styles.webStatRow}>
          <Ionicons name="briefcase" size={18} color={Colors.warning} />
          <Text style={styles.webStatLabel}>Visits Logged:</Text>
          <Text style={styles.webStatValue}>{visitsCount}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  webContent: { flex: 1, backgroundColor: Colors.background },
  webMapPlaceholder: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surfaceAlt, margin: 20, borderRadius: 24, gap: 16,
    borderWidth: 1, borderColor: Colors.borderLight, borderStyle: 'dashed',
  },
  iconCircle: {
    width: 100, height: 100, borderRadius: 50, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center', elevation: 2,
  },
  webMapText: { fontSize: 18, color: Colors.text, fontWeight: '600' },
  webMapSubtext: { fontSize: 14, color: Colors.textTertiary, textAlign: 'center', lineHeight: 20 },
  webStats: {
    marginHorizontal: 20, marginBottom: 20, backgroundColor: Colors.surface, borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: Colors.borderLight, gap: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10,
  },
  dashboardTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  webStatRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusIndicator: { width: 10, height: 10, borderRadius: 5 },
  webStatLabel: { fontSize: 14, color: Colors.textSecondary, flex: 1 },
  webStatValue: { fontSize: 15, fontWeight: '700', color: Colors.text },
  divider: { height: 1, backgroundColor: Colors.borderLight, marginVertical: 4 },
});