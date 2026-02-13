import React from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Colors from '@/constants/colors';
import { useTracking } from '@/lib/tracking-context';

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

function formatClock(isoStr: string | null): string {
  if (!isoStr) return '--:--';
  return new Date(isoStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function MetricCard({ icon, iconSet, label, value, color, subtitle }: {
  icon: string; iconSet?: 'ion' | 'mci'; label: string; value: string; color: string; subtitle?: string;
}) {
  const IconComp = iconSet === 'mci' ? MaterialCommunityIcons : Ionicons;
  return (
    <View style={styles.metricCard}>
      <View style={[styles.metricIcon, { backgroundColor: color + '15' }]}>
        <IconComp name={icon as any} size={22} color={color} />
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
      {subtitle ? <Text style={styles.metricSub}>{subtitle}</Text> : null}
    </View>
  );
}

export default function SummaryScreen() {
  const insets = useSafeAreaInsets();
  const { dayRecord, workingMinutes } = useTracking();
  const webTop = Platform.OS === 'web' ? 67 : 0;

  const uniqueLeads = new Set(dayRecord.visits.map(v => v.leadId)).size;
  const avgDistPerVisit = dayRecord.visits.length > 0
    ? (dayRecord.totalDistance / dayRecord.visits.length).toFixed(1) : '0';

  const visitsByType = {
    'Visit': dayRecord.visits.filter(v => v.type === 'Visit').length,
    'Re-visit': dayRecord.visits.filter(v => v.type === 'Re-visit').length,
    'First Follow-up': dayRecord.visits.filter(v => v.type === 'First Follow-up').length,
  };

  const outboundCalls = dayRecord.calls.filter(c => c.type === 'Outbound').length;
  const inboundCalls = dayRecord.calls.filter(c => c.type === 'Inbound').length;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + webTop + 16, paddingBottom: 100 + (Platform.OS === 'web' ? 34 : 0) }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Daily Summary</Text>
        <Text style={styles.date}>
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
        </Text>

        <LinearGradient
          colors={['#0A1628', '#1A2942']}
          style={styles.overviewCard}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.overviewRow}>
            <View style={styles.overviewItem}>
              <Ionicons name="navigate" size={20} color={Colors.accent} />
              <Text style={styles.overviewValue}>{dayRecord.totalDistance}</Text>
              <Text style={styles.overviewUnit}>km</Text>
            </View>
            <View style={styles.overviewDivider} />
            <View style={styles.overviewItem}>
              <Ionicons name="time" size={20} color={Colors.warning} />
              <Text style={styles.overviewValue}>{formatTime(workingMinutes)}</Text>
              <Text style={styles.overviewUnit}>working</Text>
            </View>
            <View style={styles.overviewDivider} />
            <View style={styles.overviewItem}>
              <Ionicons name="flag" size={20} color={Colors.primary} />
              <Text style={styles.overviewValue}>{dayRecord.visits.length}</Text>
              <Text style={styles.overviewUnit}>visits</Text>
            </View>
          </View>
          <View style={styles.shiftRow}>
            <Text style={styles.shiftLabel}>Shift: {formatClock(dayRecord.checkInTime)} - {formatClock(dayRecord.checkOutTime)}</Text>
          </View>
        </LinearGradient>

        <Text style={styles.sectionTitle}>Performance Metrics</Text>
        <View style={styles.metricsGrid}>
          <MetricCard icon="people-outline" label="Leads Visited" value={`${uniqueLeads}`} color={Colors.primary} />
          <MetricCard icon="call-outline" label="Total Calls" value={`${dayRecord.calls.length}`} color={Colors.accent} />
          <MetricCard icon="speedometer-outline" label="Avg Dist/Visit" value={`${avgDistPerVisit} km`} color={Colors.warning} />
          <MetricCard icon="analytics-outline" label="Activities" value={`${dayRecord.activities.length}`} color={Colors.stageConverted} />
        </View>

        <Text style={styles.sectionTitle}>Visit Breakdown</Text>
        <View style={styles.breakdownCard}>
          <BreakdownRow label="First Follow-up" count={visitsByType['First Follow-up']} color={Colors.warning} total={dayRecord.visits.length} />
          <BreakdownRow label="Visits" count={visitsByType['Visit']} color={Colors.primary} total={dayRecord.visits.length} />
          <BreakdownRow label="Re-visits" count={visitsByType['Re-visit']} color={Colors.accent} total={dayRecord.visits.length} />
        </View>

        <Text style={styles.sectionTitle}>Call Summary</Text>
        <View style={styles.callSummary}>
          <View style={styles.callItem}>
            <View style={[styles.callIcon, { backgroundColor: Colors.successLight }]}>
              <Ionicons name="call-outline" size={18} color={Colors.success} />
            </View>
            <View>
              <Text style={styles.callCount}>{outboundCalls}</Text>
              <Text style={styles.callType}>Outbound</Text>
            </View>
          </View>
          <View style={styles.callDivider} />
          <View style={styles.callItem}>
            <View style={[styles.callIcon, { backgroundColor: Colors.infoLight }]}>
              <Ionicons name="enter-outline" size={18} color={Colors.info} />
            </View>
            <View>
              <Text style={styles.callCount}>{inboundCalls}</Text>
              <Text style={styles.callType}>Inbound</Text>
            </View>
          </View>
        </View>

        {dayRecord.visits.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Visit Log</Text>
            {dayRecord.visits.map((v, i) => (
              <View key={v.id} style={styles.visitLogItem}>
                <View style={styles.visitLogIndex}>
                  <Text style={styles.visitLogNum}>{i + 1}</Text>
                </View>
                <View style={styles.visitLogContent}>
                  <Text style={styles.visitLogName}>{v.leadName}</Text>
                  <Text style={styles.visitLogAddr}>{v.address}</Text>
                  <View style={styles.visitLogMeta}>
                    <Text style={styles.visitLogType}>{v.type}</Text>
                    <Text style={styles.visitLogTime}>{formatClock(v.timestamp)}</Text>
                  </View>
                </View>
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function BreakdownRow({ label, count, color, total }: { label: string; count: number; color: string; total: number }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <View style={styles.breakdownRow}>
      <View style={styles.breakdownLabelRow}>
        <View style={[styles.breakdownDot, { backgroundColor: color }]} />
        <Text style={styles.breakdownLabel}>{label}</Text>
        <Text style={styles.breakdownCount}>{count}</Text>
      </View>
      <View style={styles.breakdownBarBg}>
        <View style={[styles.breakdownBar, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: 20 },
  title: { fontSize: 28, fontWeight: '700' as const, color: Colors.text, fontFamily: 'Inter_700Bold' },
  date: { fontSize: 13, color: Colors.textTertiary, fontFamily: 'Inter_400Regular', marginTop: 4, marginBottom: 20 },
  overviewCard: { borderRadius: 20, padding: 20, marginBottom: 24 },
  overviewRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  overviewItem: { alignItems: 'center', gap: 6 },
  overviewValue: { fontSize: 24, fontWeight: '700' as const, color: '#FFFFFF', fontFamily: 'Inter_700Bold' },
  overviewUnit: { fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter_400Regular' },
  overviewDivider: { width: 1, height: 50, backgroundColor: 'rgba(255,255,255,0.15)' },
  shiftRow: { alignItems: 'center', marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  shiftLabel: { fontSize: 13, color: 'rgba(255,255,255,0.6)', fontFamily: 'Inter_500Medium' },
  sectionTitle: { fontSize: 16, fontWeight: '600' as const, color: Colors.text, fontFamily: 'Inter_600SemiBold', marginBottom: 12, marginTop: 4 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  metricCard: {
    flex: 1, minWidth: '45%' as any, backgroundColor: Colors.surface,
    borderRadius: 16, padding: 16, alignItems: 'flex-start',
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  metricIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  metricValue: { fontSize: 22, fontWeight: '700' as const, color: Colors.text, fontFamily: 'Inter_700Bold' },
  metricLabel: { fontSize: 12, color: Colors.textTertiary, fontFamily: 'Inter_400Regular', marginTop: 2 },
  metricSub: { fontSize: 11, color: Colors.textTertiary, fontFamily: 'Inter_400Regular' },
  breakdownCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, gap: 14, marginBottom: 24, borderWidth: 1, borderColor: Colors.borderLight },
  breakdownRow: { gap: 6 },
  breakdownLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  breakdownDot: { width: 8, height: 8, borderRadius: 4 },
  breakdownLabel: { flex: 1, fontSize: 13, color: Colors.text, fontFamily: 'Inter_500Medium' },
  breakdownCount: { fontSize: 14, fontWeight: '600' as const, color: Colors.text, fontFamily: 'Inter_600SemiBold' },
  breakdownBarBg: { height: 6, backgroundColor: Colors.surfaceAlt, borderRadius: 3, overflow: 'hidden' },
  breakdownBar: { height: 6, borderRadius: 3 },
  callSummary: {
    flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: 16,
    padding: 20, marginBottom: 24, borderWidth: 1, borderColor: Colors.borderLight,
  },
  callItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, justifyContent: 'center' },
  callIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  callCount: { fontSize: 20, fontWeight: '700' as const, color: Colors.text, fontFamily: 'Inter_700Bold' },
  callType: { fontSize: 12, color: Colors.textTertiary, fontFamily: 'Inter_400Regular' },
  callDivider: { width: 1, height: 40, backgroundColor: Colors.border },
  visitLogItem: {
    flexDirection: 'row', gap: 12, backgroundColor: Colors.surface,
    borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  visitLogIndex: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  visitLogNum: { fontSize: 13, fontWeight: '700' as const, color: Colors.primary, fontFamily: 'Inter_700Bold' },
  visitLogContent: { flex: 1 },
  visitLogName: { fontSize: 14, fontWeight: '600' as const, color: Colors.text, fontFamily: 'Inter_600SemiBold' },
  visitLogAddr: { fontSize: 12, color: Colors.textSecondary, fontFamily: 'Inter_400Regular', marginTop: 2 },
  visitLogMeta: { flexDirection: 'row', gap: 12, marginTop: 4 },
  visitLogType: { fontSize: 11, color: Colors.primary, fontFamily: 'Inter_500Medium' },
  visitLogTime: { fontSize: 11, color: Colors.textTertiary, fontFamily: 'Inter_400Regular' },
});
