import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, Platform, RefreshControl, Alert, Modal, TextInput, FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import { useAuth } from '@/lib/auth-context';
import {
  getTodayAttendance, getMonthlyAttendance, getLeaveBalances, getLeaveRequests,
  applyLeave, cancelLeaveRequest, getUserShift, ensureUserShift, updateUserShift,
  AttendanceRecord, MonthlySummary, LeaveBalance, LeaveRequest, getLeaveApprovers,
} from '@/lib/hrms-storage';

const SERVER_URL = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : 'http://localhost:5000';

const LEAVE_TYPES = ['CL', 'PL', 'SL', 'RH', 'LWP'];
const LEAVE_LABELS: Record<string, string> = {
  CL: 'Casual Leave',
  PL: 'Privilege Leave',
  SL: 'Sick Leave',
  RH: 'Restricted Holiday',
  LWP: 'Leave Without Pay',
};

const STATUS_COLORS: Record<string, string> = {
  Present: Colors.success,
  'Half Day': Colors.warning,
  Absent: Colors.danger,
  Leave: Colors.info,
  Pending: Colors.warning,
  Approved: Colors.success,
  Rejected: Colors.danger,
};

function formatClock(isoStr: string | null): string {
  if (!isoStr) return '--:--';
  const d = new Date(isoStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function formatDateFull(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

function generateFutureDates(days: number): string[] {
  const dates: string[] = [];
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    dates.push(toDateStr(d));
  }
  return dates;
}

export default function HRMSScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const [attendance, setAttendance] = useState<AttendanceRecord | null>(null);
  const [monthly, setMonthly] = useState<MonthlySummary | null>(null);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [shiftStart, setShiftStart] = useState('09:00');
  const [shiftEnd, setShiftEnd] = useState('18:00');

  const [showApplyLeave, setShowApplyLeave] = useState(false);
  const [leaveType, setLeaveType] = useState('CL');
  const [leaveFromDate, setLeaveFromDate] = useState('');
  const [leaveToDate, setLeaveToDate] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [editShiftStart, setEditShiftStart] = useState('09:00');
  const [editShiftEnd, setEditShiftEnd] = useState('18:00');

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerField, setDatePickerField] = useState<'from' | 'to'>('from');

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const futureDates = generateFutureDates(90);

  const loadData = useCallback(async () => {
    try {
      const shift = await ensureUserShift();
      setShiftStart(shift.shiftStart.substring(0, 5));
      setShiftEnd(shift.shiftEnd.substring(0, 5));

      const [att, mon, bal, req] = await Promise.all([
        getTodayAttendance(),
        getMonthlyAttendance(currentYear, currentMonth),
        getLeaveBalances(currentYear),
        getLeaveRequests(),
      ]);

      setAttendance(att);
      setMonthly(mon);
      setBalances(bal);
      setRequests(req);
    } catch (e: any) {
      console.error('HRMS load error:', e.message);
    } finally {
      setLoading(false);
    }
  }, [currentYear, currentMonth]);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const openDatePicker = (field: 'from' | 'to') => {
    setDatePickerField(field);
    setShowDatePicker(true);
  };

  const handleDateSelect = (date: string) => {
    setShowDatePicker(false);
    if (datePickerField === 'from') {
      setLeaveFromDate(date);
      if (leaveToDate && date > leaveToDate) {
        setLeaveToDate(date);
      }
    } else {
      setLeaveToDate(date);
      if (leaveFromDate && date < leaveFromDate) {
        setLeaveFromDate(date);
      }
    }
  };

  const sendEmailToApprovers = async (requestId: string, leaveTypeName: string, fromDate: string, toDate: string, reason: string) => {
    try {
      const approvers = await getLeaveApprovers();
      if (approvers.length === 0) return;

      const approverEmails = approvers.map(a => a.email);
      const userName = user?.name || user?.username || 'A team member';
      const daysCount = countLeaveDays(fromDate, toDate);

      const response = await fetch(`${SERVER_URL}/api/leave/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          userName,
          leaveType: leaveTypeName,
          fromDate,
          toDate,
          days: daysCount,
          reason,
          approverEmails,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        console.warn('Email notification failed:', result.error);
      }
    } catch (e: any) {
      console.warn('Failed to send email notification:', e.message);
    }
  };

  const countLeaveDays = (from: string, to: string): number => {
    const start = new Date(from);
    const end = new Date(to);
    let count = 0;
    const d = new Date(start);
    while (d <= end) {
      if (d.getDay() !== 0) count++;
      d.setDate(d.getDate() + 1);
    }
    return count || 1;
  };

  const handleApplyLeave = async () => {
    if (!leaveFromDate || !leaveToDate) {
      Alert.alert('Error', 'Please select both From and To dates.');
      return;
    }
    if (!leaveReason.trim()) {
      Alert.alert('Error', 'Please enter a reason for the leave.');
      return;
    }
    if (leaveToDate < leaveFromDate) {
      Alert.alert('Error', 'To date cannot be before From date.');
      return;
    }

    setSubmitting(true);
    try {
      const requestId = await applyLeave(leaveType, leaveFromDate, leaveToDate, leaveReason.trim());
      Alert.alert('Success', 'Leave request submitted successfully.');
      setShowApplyLeave(false);

      const leaveTypeName = LEAVE_LABELS[leaveType] || leaveType;
      sendEmailToApprovers(requestId, leaveTypeName, leaveFromDate, leaveToDate, leaveReason.trim());

      setLeaveFromDate('');
      setLeaveToDate('');
      setLeaveReason('');
      setLeaveType('CL');
      await loadData();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to submit leave request.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelLeave = (req: LeaveRequest) => {
    Alert.alert('Cancel Leave', `Cancel ${req.leaveType} leave (${formatDate(req.fromDate)} - ${formatDate(req.toDate)})?`, [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Cancel', style: 'destructive', onPress: async () => {
          try {
            await cancelLeaveRequest(req.id);
            await loadData();
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        }
      },
    ]);
  };

  const handleSaveShift = async () => {
    try {
      await updateUserShift(editShiftStart + ':00', editShiftEnd + ':00');
      setShiftStart(editShiftStart);
      setShiftEnd(editShiftEnd);
      setShowShiftModal(false);
      await loadData();
      Alert.alert('Success', 'Shift timing updated.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const webTop = Platform.OS === 'web' ? 67 : 0;

  const finalStatus = () => {
    if (!attendance) return 'Loading...';
    let s = attendance.status;
    if (attendance.isLate && s !== 'Leave' && s !== 'Absent') {
      s += ' (Late)';
    }
    return s;
  };

  const monthName = now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const filteredDates = datePickerField === 'to' && leaveFromDate
    ? futureDates.filter(d => d >= leaveFromDate)
    : futureDates;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + webTop + 16, paddingBottom: 100 + (Platform.OS === 'web' ? 34 : 0) }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        <View style={styles.header}>
          <Text style={styles.title}>HRMS</Text>
          <Pressable onPress={() => { setEditShiftStart(shiftStart); setEditShiftEnd(shiftEnd); setShowShiftModal(true); }} hitSlop={12}>
            <Ionicons name="settings-outline" size={22} color={Colors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.shiftRow}>
          <Ionicons name="time-outline" size={14} color={Colors.textTertiary} />
          <Text style={styles.shiftText}>Shift: {shiftStart} - {shiftEnd}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Today's Attendance</Text>
          <View style={styles.attendanceGrid}>
            <View style={styles.attendanceItem}>
              <Text style={styles.attendanceLabel}>First Check-In</Text>
              <Text style={styles.attendanceValue}>{formatClock(attendance?.firstCheckin || null)}</Text>
            </View>
            <View style={styles.attendanceItem}>
              <Text style={styles.attendanceLabel}>Last Check-Out</Text>
              <Text style={styles.attendanceValue}>{formatClock(attendance?.lastCheckout || null)}</Text>
            </View>
            <View style={styles.attendanceItem}>
              <Text style={styles.attendanceLabel}>Working Hours</Text>
              <Text style={styles.attendanceValue}>{attendance ? formatHours(attendance.workingMinutes) : '--'}</Text>
            </View>
            <View style={styles.attendanceItem}>
              <Text style={styles.attendanceLabel}>Status</Text>
              <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[attendance?.status || 'Absent'] || Colors.textTertiary) + '20' }]}>
                <Text style={[styles.statusText, { color: STATUS_COLORS[attendance?.status || 'Absent'] || Colors.textTertiary }]}>
                  {finalStatus()}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Monthly Summary - {monthName}</Text>
          {monthly ? (
            <View style={styles.monthlyGrid}>
              <MonthStat label="Present" value={monthly.presentDays} color={Colors.success} />
              <MonthStat label="Half Day" value={monthly.halfDays} color={Colors.warning} />
              <MonthStat label="Leave" value={monthly.leaveDays} color={Colors.info} />
              <MonthStat label="Absent" value={monthly.absentDays} color={Colors.danger} />
              <MonthStat label="Late" value={monthly.lateDays} color="#F97316" />
              <MonthStat label="Working Days" value={monthly.totalWorkingDays} color={Colors.textSecondary} />
            </View>
          ) : (
            <Text style={styles.loadingText}>Loading...</Text>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle}>Leave Balance ({currentYear})</Text>
          </View>
          {balances.length > 0 ? (
            <View style={styles.balanceList}>
              {balances.map(b => (
                <View key={b.leaveType} style={styles.balanceRow}>
                  <View style={styles.balanceLeft}>
                    <View style={[styles.balanceDot, { backgroundColor: getLeaveColor(b.leaveType) }]} />
                    <Text style={styles.balanceType}>{b.leaveType}</Text>
                    <Text style={styles.balanceFullName}>{LEAVE_LABELS[b.leaveType] || ''}</Text>
                  </View>
                  <View style={styles.balanceRight}>
                    <Text style={styles.balanceNum}>{b.remaining}</Text>
                    <Text style={styles.balanceOf}>/ {b.totalDays}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.loadingText}>Loading...</Text>
          )}
        </View>

        <Pressable
          style={({ pressed }) => [styles.applyButton, pressed && { opacity: 0.85 }]}
          onPress={() => setShowApplyLeave(true)}
        >
          <Ionicons name="add-circle-outline" size={20} color="#fff" />
          <Text style={styles.applyButtonText}>Apply Leave</Text>
        </Pressable>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Leave History</Text>
          {requests.length > 0 ? (
            requests.map(req => (
              <View key={req.id} style={styles.leaveItem}>
                <View style={styles.leaveItemTop}>
                  <View style={[styles.leaveTypeBadge, { backgroundColor: getLeaveColor(req.leaveType) + '20' }]}>
                    <Text style={[styles.leaveTypeText, { color: getLeaveColor(req.leaveType) }]}>{req.leaveType}</Text>
                  </View>
                  <Text style={styles.leaveDates}>{formatDate(req.fromDate)} - {formatDate(req.toDate)}</Text>
                  <Text style={styles.leaveDays}>{req.days}d</Text>
                </View>
                <Text style={styles.leaveReason} numberOfLines={2}>{req.reason}</Text>
                <View style={styles.leaveItemBottom}>
                  <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[req.status] || Colors.textTertiary) + '20' }]}>
                    <Text style={[styles.statusText, { color: STATUS_COLORS[req.status] || Colors.textTertiary }]}>{req.status}</Text>
                  </View>
                  {req.status === 'Pending' && (
                    <Pressable onPress={() => handleCancelLeave(req)} hitSlop={8}>
                      <Text style={styles.cancelText}>Cancel</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No leave requests yet</Text>
          )}
        </View>
      </ScrollView>

      <Modal visible={showApplyLeave} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Apply Leave</Text>
              <Pressable onPress={() => setShowApplyLeave(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>

            <Text style={styles.inputLabel}>Leave Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeScroll}>
              {LEAVE_TYPES.map(lt => (
                <Pressable
                  key={lt}
                  style={[styles.typeChip, leaveType === lt && styles.typeChipActive]}
                  onPress={() => setLeaveType(lt)}
                >
                  <Text style={[styles.typeChipText, leaveType === lt && styles.typeChipTextActive]}>{lt}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.inputLabel}>From Date</Text>
            <Pressable style={styles.dateSelectBtn} onPress={() => openDatePicker('from')}>
              <Ionicons name="calendar-outline" size={18} color={leaveFromDate ? Colors.primary : Colors.textTertiary} />
              <Text style={[styles.dateSelectText, !leaveFromDate && { color: Colors.textTertiary }]}>
                {leaveFromDate ? formatDateFull(leaveFromDate) : 'Select start date'}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
            </Pressable>

            <Text style={styles.inputLabel}>To Date</Text>
            <Pressable style={styles.dateSelectBtn} onPress={() => openDatePicker('to')}>
              <Ionicons name="calendar-outline" size={18} color={leaveToDate ? Colors.primary : Colors.textTertiary} />
              <Text style={[styles.dateSelectText, !leaveToDate && { color: Colors.textTertiary }]}>
                {leaveToDate ? formatDateFull(leaveToDate) : 'Select end date'}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
            </Pressable>

            {leaveFromDate && leaveToDate && (
              <View style={styles.daysPreview}>
                <Ionicons name="time-outline" size={14} color={Colors.primary} />
                <Text style={styles.daysPreviewText}>
                  {countLeaveDays(leaveFromDate, leaveToDate)} working day{countLeaveDays(leaveFromDate, leaveToDate) > 1 ? 's' : ''}
                </Text>
              </View>
            )}

            <Text style={styles.inputLabel}>Reason</Text>
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
              value={leaveReason}
              onChangeText={setLeaveReason}
              placeholder="Enter reason for leave"
              placeholderTextColor={Colors.textTertiary}
              multiline
            />

            <Pressable
              style={({ pressed }) => [styles.submitButton, pressed && { opacity: 0.85 }, submitting && { opacity: 0.6 }]}
              onPress={handleApplyLeave}
              disabled={submitting}
            >
              <Text style={styles.submitButtonText}>{submitting ? 'Submitting...' : 'Submit Request'}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={showDatePicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.datePickerBackdrop} onPress={() => setShowDatePicker(false)} />
          <View
            style={[styles.datePickerContent, { paddingBottom: insets.bottom + 20 }]}
          >
            <View style={styles.datePickerHeader}>
              <View style={styles.datePickerHandle} />
              <Text style={styles.datePickerTitle}>
                {datePickerField === 'from' ? 'Select From Date' : 'Select To Date'}
              </Text>
              <Pressable onPress={() => setShowDatePicker(false)} hitSlop={12} style={styles.datePickerClose}>
                <Ionicons name="close-circle" size={28} color={Colors.textTertiary} />
              </Pressable>
            </View>

            <FlatList
              data={filteredDates}
              keyExtractor={item => item}
              renderItem={({ item }) => {
                const isSelected = (datePickerField === 'from' && item === leaveFromDate) ||
                  (datePickerField === 'to' && item === leaveToDate);
                const d = new Date(item + 'T12:00:00');
                const isToday = item === toDateStr(new Date());
                const isSunday = d.getDay() === 0;

                return (
                  <Pressable
                    style={[
                      styles.datePickerItem,
                      isSelected && styles.datePickerItemSelected,
                      isSunday && styles.datePickerItemSunday,
                    ]}
                    onPress={() => handleDateSelect(item)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[
                        styles.datePickerItemText,
                        isSelected && styles.datePickerItemTextSelected,
                        isSunday && styles.datePickerItemTextSunday,
                      ]}>
                        {d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                      </Text>
                      {isSunday && <Text style={styles.sundayLabel}>Holiday</Text>}
                    </View>
                    {isToday && <Text style={styles.todayBadge}>Today</Text>}
                    {isSelected && <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />}
                  </Pressable>
                );
              }}
              style={styles.datePickerList}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
            />
          </View>
        </View>
      </Modal>

      <Modal visible={showShiftModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Shift Timing</Text>
              <Pressable onPress={() => setShowShiftModal(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>

            <Text style={styles.inputLabel}>Shift Start (HH:MM)</Text>
            <TextInput
              style={styles.input}
              value={editShiftStart}
              onChangeText={setEditShiftStart}
              placeholder="09:00"
              placeholderTextColor={Colors.textTertiary}
            />

            <Text style={styles.inputLabel}>Shift End (HH:MM)</Text>
            <TextInput
              style={styles.input}
              value={editShiftEnd}
              onChangeText={setEditShiftEnd}
              placeholder="18:00"
              placeholderTextColor={Colors.textTertiary}
            />

            <Pressable
              style={({ pressed }) => [styles.submitButton, pressed && { opacity: 0.85 }]}
              onPress={handleSaveShift}
            >
              <Text style={styles.submitButtonText}>Save Shift</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function MonthStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.monthStatItem}>
      <View style={[styles.monthStatDot, { backgroundColor: color }]} />
      <Text style={styles.monthStatValue}>{value}</Text>
      <Text style={styles.monthStatLabel}>{label}</Text>
    </View>
  );
}

function getLeaveColor(type: string): string {
  switch (type) {
    case 'CL': return Colors.info;
    case 'PL': return Colors.success;
    case 'SL': return Colors.warning;
    case 'RH': return '#8B5CF6';
    case 'LWP': return Colors.danger;
    default: return Colors.textSecondary;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  title: { fontSize: 24, fontWeight: '700', color: Colors.text, fontFamily: 'Inter_700Bold' },
  shiftRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16, marginTop: 4 },
  shiftText: { fontSize: 13, color: Colors.textTertiary, fontFamily: 'Inter_400Regular' },
  card: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 16,
    marginBottom: 16, borderWidth: 1, borderColor: Colors.borderLight,
  },
  cardTitle: { fontSize: 15, fontWeight: '600', color: Colors.text, fontFamily: 'Inter_600SemiBold', marginBottom: 12 },
  cardTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  attendanceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  attendanceItem: { width: '46%' as any, marginBottom: 4 },
  attendanceLabel: { fontSize: 11, color: Colors.textTertiary, fontFamily: 'Inter_400Regular', marginBottom: 4 },
  attendanceValue: { fontSize: 18, fontWeight: '700', color: Colors.text, fontFamily: 'Inter_700Bold' },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 12, fontWeight: '600', fontFamily: 'Inter_600SemiBold' },
  monthlyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  monthStatItem: { width: '30%' as any, alignItems: 'center', paddingVertical: 8 },
  monthStatDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 6 },
  monthStatValue: { fontSize: 20, fontWeight: '700', color: Colors.text, fontFamily: 'Inter_700Bold' },
  monthStatLabel: { fontSize: 11, color: Colors.textTertiary, fontFamily: 'Inter_400Regular', marginTop: 2, textAlign: 'center' },
  balanceList: { gap: 8 },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  balanceLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  balanceDot: { width: 10, height: 10, borderRadius: 5 },
  balanceType: { fontSize: 14, fontWeight: '600', color: Colors.text, fontFamily: 'Inter_600SemiBold', width: 36 },
  balanceFullName: { fontSize: 12, color: Colors.textSecondary, fontFamily: 'Inter_400Regular', flex: 1 },
  balanceRight: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  balanceNum: { fontSize: 18, fontWeight: '700', color: Colors.text, fontFamily: 'Inter_700Bold' },
  balanceOf: { fontSize: 12, color: Colors.textTertiary, fontFamily: 'Inter_400Regular' },
  applyButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14, marginBottom: 16,
  },
  applyButtonText: { fontSize: 15, fontWeight: '600', color: '#fff', fontFamily: 'Inter_600SemiBold' },
  leaveItem: {
    backgroundColor: Colors.background, borderRadius: 12, padding: 12,
    marginBottom: 8, borderWidth: 1, borderColor: Colors.borderLight,
  },
  leaveItemTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  leaveTypeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  leaveTypeText: { fontSize: 12, fontWeight: '600', fontFamily: 'Inter_600SemiBold' },
  leaveDates: { flex: 1, fontSize: 13, color: Colors.text, fontFamily: 'Inter_500Medium' },
  leaveDays: { fontSize: 13, color: Colors.textSecondary, fontFamily: 'Inter_500Medium' },
  leaveReason: { fontSize: 12, color: Colors.textSecondary, fontFamily: 'Inter_400Regular', marginBottom: 8 },
  leaveItemBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cancelText: { fontSize: 13, color: Colors.danger, fontFamily: 'Inter_600SemiBold' },
  emptyText: { fontSize: 13, color: Colors.textTertiary, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingVertical: 16 },
  loadingText: { fontSize: 13, color: Colors.textTertiary, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingVertical: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: Colors.text, fontFamily: 'Inter_700Bold' },
  inputLabel: { fontSize: 13, fontWeight: '500', color: Colors.textSecondary, fontFamily: 'Inter_500Medium', marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: Colors.background, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: Colors.text, fontFamily: 'Inter_400Regular',
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  typeScroll: { flexGrow: 0, marginBottom: 4 },
  typeChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginRight: 8,
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.borderLight,
  },
  typeChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  typeChipText: { fontSize: 13, fontWeight: '500', color: Colors.text, fontFamily: 'Inter_500Medium' },
  typeChipTextActive: { color: '#fff' },
  submitButton: {
    backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14,
    alignItems: 'center', marginTop: 20,
  },
  submitButtonText: { fontSize: 15, fontWeight: '600', color: '#fff', fontFamily: 'Inter_600SemiBold' },

  dateSelectBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.background, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  dateSelectText: { flex: 1, fontSize: 15, color: Colors.text, fontFamily: 'Inter_500Medium' },
  daysPreview: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 8, paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: Colors.primaryLight, borderRadius: 8, alignSelf: 'flex-start',
  },
  daysPreviewText: { fontSize: 13, fontWeight: '600', color: Colors.primary, fontFamily: 'Inter_600SemiBold' },

  datePickerBackdrop: {
    flex: 1,
  },
  datePickerContent: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 12, paddingHorizontal: 20, maxHeight: '70%',
  },
  datePickerHeader: {
    flexDirection: 'column', alignItems: 'center', marginBottom: 8,
  },
  datePickerClose: {
    position: 'absolute', right: 0, top: 0,
  },
  datePickerHandle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  datePickerTitle: { fontSize: 18, fontWeight: '700', color: Colors.text, fontFamily: 'Inter_700Bold', marginBottom: 12 },
  datePickerList: { flexGrow: 0 },
  datePickerItem: {
    paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12,
    marginBottom: 4, flexDirection: 'row', alignItems: 'center',
  },
  datePickerItemSelected: { backgroundColor: Colors.primaryLight },
  datePickerItemSunday: { backgroundColor: '#FFF5F5' },
  datePickerItemText: { fontSize: 15, color: Colors.text, fontFamily: 'Inter_500Medium' },
  datePickerItemTextSelected: { color: Colors.primary, fontWeight: '600' },
  datePickerItemTextSunday: { color: Colors.danger },
  sundayLabel: { fontSize: 11, color: Colors.danger, fontFamily: 'Inter_400Regular', marginTop: 2 },
  todayBadge: {
    fontSize: 11, color: Colors.primary, fontFamily: 'Inter_600SemiBold',
    backgroundColor: Colors.primaryLight, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8,
    marginRight: 8,
  },
});
