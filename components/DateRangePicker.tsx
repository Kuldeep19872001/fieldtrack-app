import React, { useState } from 'react';
import { View, Text, Pressable, Modal, FlatList, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';

interface DateRangePickerProps {
  fromDate: string;
  toDate: string;
  onDateRangeChange: (from: string, to: string) => void;
}

function formatDateShort(d: Date): string {
  return d.toISOString().split('T')[0];
}

function formatDisplay(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function generateDateList(): string[] {
  const dates: string[] = [];
  const today = new Date();
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(formatDateShort(d));
  }
  return dates;
}

export default function DateRangePicker({ fromDate, toDate, onDateRangeChange }: DateRangePickerProps) {
  const insets = useSafeAreaInsets();
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickingField, setPickingField] = useState<'from' | 'to'>('from');

  const today = formatDateShort(new Date());
  const dateList = generateDateList();

  const openPicker = (field: 'from' | 'to') => {
    setPickingField(field);
    setPickerVisible(true);
  };

  const handleSelect = (date: string) => {
    setPickerVisible(false);
    if (pickingField === 'from') {
      const newFrom = date > toDate ? toDate : date;
      onDateRangeChange(newFrom, toDate);
    } else {
      const newTo = date < fromDate ? fromDate : date;
      onDateRangeChange(fromDate, newTo);
    }
  };

  const handleQuickRange = (days: number) => {
    const to = today;
    const from = formatDateShort(new Date(new Date().setDate(new Date().getDate() - days + 1)));
    onDateRangeChange(from, to);
    setPickerVisible(false);
  };

  return (
    <>
      <View style={styles.container}>
        <Pressable style={styles.dateBtn} onPress={() => openPicker('from')}>
          <Ionicons name="calendar-outline" size={14} color={Colors.primary} />
          <Text style={styles.dateBtnText}>{formatDisplay(fromDate)}</Text>
        </Pressable>
        <Ionicons name="arrow-forward" size={14} color={Colors.textTertiary} />
        <Pressable style={styles.dateBtn} onPress={() => openPicker('to')}>
          <Ionicons name="calendar-outline" size={14} color={Colors.primary} />
          <Text style={styles.dateBtnText}>{formatDisplay(toDate)}</Text>
        </Pressable>
      </View>

      <Modal visible={pickerVisible} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setPickerVisible(false)}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>
              {pickingField === 'from' ? 'From Date' : 'To Date'}
            </Text>

            <View style={styles.quickRangeRow}>
              <Pressable style={styles.quickBtn} onPress={() => handleQuickRange(1)}>
                <Text style={styles.quickBtnText}>Today</Text>
              </Pressable>
              <Pressable style={styles.quickBtn} onPress={() => handleQuickRange(7)}>
                <Text style={styles.quickBtnText}>7 Days</Text>
              </Pressable>
              <Pressable style={styles.quickBtn} onPress={() => handleQuickRange(15)}>
                <Text style={styles.quickBtnText}>15 Days</Text>
              </Pressable>
              <Pressable style={styles.quickBtn} onPress={() => handleQuickRange(30)}>
                <Text style={styles.quickBtnText}>30 Days</Text>
              </Pressable>
            </View>

            <FlatList
              data={dateList}
              keyExtractor={item => item}
              renderItem={({ item }) => {
                const isSelected = (pickingField === 'from' && item === fromDate) ||
                  (pickingField === 'to' && item === toDate);
                const isCurrentDay = item === today;
                const d = new Date(item + 'T12:00:00');

                const isDisabled = pickingField === 'from'
                  ? item > toDate
                  : item < fromDate;

                return (
                  <Pressable
                    style={[styles.dateItem, isSelected && styles.dateItemSelected, isDisabled && styles.dateItemDisabled]}
                    onPress={() => !isDisabled && handleSelect(item)}
                    disabled={isDisabled}
                  >
                    <Text style={[
                      styles.dateItemText,
                      isSelected && styles.dateItemTextSelected,
                      isDisabled && styles.dateItemTextDisabled,
                    ]}>
                      {d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                    </Text>
                    {isCurrentDay && <Text style={styles.todayBadge}>Today</Text>}
                  </Pressable>
                );
              }}
              style={styles.dateListStyle}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    alignSelf: 'flex-start', marginBottom: 16,
  },
  dateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderLight,
  },
  dateBtnText: { fontSize: 13, fontWeight: '600' as const, color: Colors.primary, fontFamily: 'Inter_600SemiBold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 12, paddingHorizontal: 20, maxHeight: '70%',
  },
  modalHandle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700' as const, color: Colors.text, fontFamily: 'Inter_700Bold', marginBottom: 12 },
  quickRangeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  quickBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 8,
    backgroundColor: Colors.primaryLight, alignItems: 'center',
  },
  quickBtnText: { fontSize: 12, fontWeight: '600' as const, color: Colors.primary, fontFamily: 'Inter_600SemiBold' },
  dateListStyle: { flex: 1 },
  dateItem: {
    paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12,
    marginBottom: 4, flexDirection: 'row', alignItems: 'center',
  },
  dateItemSelected: { backgroundColor: Colors.primaryLight },
  dateItemDisabled: { opacity: 0.4 },
  dateItemText: { fontSize: 15, color: Colors.text, fontFamily: 'Inter_500Medium', flex: 1 },
  dateItemTextSelected: { color: Colors.primary, fontWeight: '600' as const },
  dateItemTextDisabled: { color: Colors.textTertiary },
  todayBadge: {
    fontSize: 11, color: Colors.primary, fontFamily: 'Inter_600SemiBold',
    backgroundColor: Colors.primaryLight, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8,
  },
});
