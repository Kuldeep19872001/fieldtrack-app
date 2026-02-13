import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, Pressable, StyleSheet, FlatList, TextInput, Platform, RefreshControl,
  Modal, KeyboardAvoidingView, ScrollView, Alert, ActivityIndicator, Linking, AppState,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import { getLeads, getLeadTypes, addLeadType, createLead, addVisit, addActivity, saveLead, getLeadById, addCallLog } from '@/lib/storage';
import { useTracking } from '@/lib/tracking-context';
import type { Lead, LeadStage } from '@/lib/types';

const STAGE_COLORS: Record<LeadStage, string> = {
  'New': Colors.stageNew,
  'In Process': Colors.stageInProcess,
  'Converted': Colors.stageConverted,
};

const STAGE_BG: Record<LeadStage, string> = {
  'New': Colors.infoLight,
  'In Process': Colors.warningLight,
  'Converted': Colors.successLight,
};

interface AddVisitState {
  leadId: string;
  leadName: string;
  notes: string;
  capturing: boolean;
}

function LeadCard({ lead, onAddVisit, onCall }: { lead: Lead; onAddVisit: (lead: Lead) => void; onCall: (lead: Lead) => void }) {
  const stageColor = STAGE_COLORS[lead.stage];
  const stageBg = STAGE_BG[lead.stage];

  return (
    <Pressable
      style={({ pressed }) => [styles.leadCard, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push({ pathname: '/lead/[id]', params: { id: lead.id } });
      }}
    >
      <View style={styles.leadHeader}>
        <View style={[styles.avatar, { backgroundColor: stageColor + '20' }]}>
          <Text style={[styles.avatarText, { color: stageColor }]}>
            {lead.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
          </Text>
        </View>
        <View style={styles.leadInfo}>
          <Text style={styles.leadName}>{lead.name}</Text>
          {lead.leadType ? (
            <View style={styles.typeTag}>
              <Text style={styles.typeTagText}>{lead.leadType}</Text>
            </View>
          ) : (
            <Text style={styles.leadCompany}>{lead.company}</Text>
          )}
        </View>
        <View style={[styles.stageBadge, { backgroundColor: stageBg }]}>
          <View style={[styles.stageDot, { backgroundColor: stageColor }]} />
          <Text style={[styles.stageText, { color: stageColor }]}>{lead.stage}</Text>
        </View>
      </View>

      <View style={styles.leadDetailsGrid}>
        <View style={styles.leadDetailItem}>
          <Ionicons name="call-outline" size={13} color={Colors.textTertiary} />
          <Text style={styles.leadDetailText} numberOfLines={1}>{lead.mobile || lead.phone}</Text>
        </View>
        <View style={styles.leadDetailItem}>
          <Ionicons name="location-outline" size={13} color={Colors.textTertiary} />
          <Text style={styles.leadDetailText} numberOfLines={1}>{lead.address || lead.area}</Text>
        </View>
        <View style={styles.leadDetailItem}>
          <Ionicons name="person-outline" size={13} color={Colors.textTertiary} />
          <Text style={styles.leadDetailText} numberOfLines={1}>{lead.assignedStaff || 'Self'}</Text>
        </View>
        <View style={styles.leadDetailItem}>
          <Ionicons name="calendar-outline" size={13} color={Colors.textTertiary} />
          <Text style={styles.leadDetailText} numberOfLines={1}>
            {lead.lastVisitDate ? new Date(lead.lastVisitDate).toLocaleDateString() : 'No visits'}
          </Text>
        </View>
      </View>

      <View style={styles.cardActions}>
        <Pressable
          style={({ pressed }) => [styles.addVisitBtn, pressed && { opacity: 0.8, backgroundColor: Colors.primary + '15' }]}
          onPress={(e) => {
            e.stopPropagation();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onAddVisit(lead);
          }}
        >
          <Ionicons name="add-circle-outline" size={16} color={Colors.primary} />
          <Text style={styles.addVisitText}>Add Visit</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.callLeadBtn, pressed && { opacity: 0.8, backgroundColor: Colors.success + '15' }]}
          onPress={(e) => {
            e.stopPropagation();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onCall(lead);
          }}
        >
          <Ionicons name="call" size={16} color={Colors.success} />
          <Text style={styles.callLeadText}>Call</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

export default function LeadsScreen() {
  const insets = useSafeAreaInsets();
  const { refreshDayRecord, currentLocation } = useTracking();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<LeadStage | 'All'>('All');
  const [refreshing, setRefreshing] = useState(false);
  const [showAddLead, setShowAddLead] = useState(false);
  const [leadTypes, setLeadTypes] = useState<string[]>([]);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');

  const [formName, setFormName] = useState('');
  const [formSource, setFormSource] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formMobile, setFormMobile] = useState('');
  const [formType, setFormType] = useState('');
  const [formLat, setFormLat] = useState<number | null>(null);
  const [formLng, setFormLng] = useState<number | null>(null);
  const [gpsCapturing, setGpsCapturing] = useState(false);
  const [gpsLabel, setGpsLabel] = useState('');
  const [saving, setSaving] = useState(false);

  const [visitState, setVisitState] = useState<AddVisitState | null>(null);
  const [callLogState, setCallLogState] = useState<{ leadId: string; leadName: string; phone: string; type: 'Outbound' | 'Inbound'; duration: string; notes: string; saving: boolean } | null>(null);
  const callStartTimeRef = useRef<number | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const pendingCallLeadRef = useRef<{ id: string; name: string } | null>(null);

  const loadLeads = useCallback(async () => {
    const data = await getLeads();
    setLeads(data);
  }, []);

  const loadTypes = useCallback(async () => {
    const types = await getLeadTypes();
    setLeadTypes(types);
  }, []);

  useEffect(() => {
    loadLeads();
    loadTypes();
  }, [loadLeads, loadTypes]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadLeads();
    setRefreshing(false);
  };

  const captureGPS = async () => {
    setGpsCapturing(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location access is required to capture GPS.');
        setGpsCapturing(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setFormLat(loc.coords.latitude);
      setFormLng(loc.coords.longitude);
      setGpsLabel(`${loc.coords.latitude.toFixed(6)}, ${loc.coords.longitude.toFixed(6)}`);
    } catch (e) {
      Alert.alert('GPS Error', 'Could not get location. Please try again.');
    }
    setGpsCapturing(false);
  };

  const openAddLeadForm = () => {
    setFormName('');
    setFormSource('');
    setFormAddress('');
    setFormMobile('');
    setFormType('');
    setFormLat(null);
    setFormLng(null);
    setGpsLabel('');
    setShowAddLead(true);
    setTimeout(() => captureGPS(), 300);
  };

  const handleSaveLead = async () => {
    if (!formName.trim()) {
      Alert.alert('Required', 'Name is required.');
      return;
    }
    if (!formMobile.trim()) {
      Alert.alert('Required', 'Mobile number is required.');
      return;
    }
    setSaving(true);
    try {
      await createLead({
        name: formName.trim(),
        source: formSource.trim(),
        address: formAddress.trim(),
        mobile: formMobile.trim(),
        leadType: formType,
        locationLat: formLat,
        locationLng: formLng,
        assignedStaff: 'Self',
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowAddLead(false);
      await loadLeads();
    } catch (e) {
      Alert.alert('Error', 'Failed to save lead.');
    }
    setSaving(false);
  };

  const handleAddNewType = async () => {
    if (!newTypeName.trim()) return;
    const types = await addLeadType(newTypeName.trim());
    setLeadTypes(types);
    setFormType(newTypeName.trim());
    setNewTypeName('');
    setShowTypeDropdown(false);
  };

  const openAddVisit = (lead: Lead) => {
    setVisitState({ leadId: lead.id, leadName: lead.name, notes: '', capturing: false });
  };

  const submitVisit = async () => {
    if (!visitState) return;
    if (!visitState.notes.trim()) {
      Alert.alert('Required', 'Visit notes are mandatory.');
      return;
    }
    setVisitState(prev => prev ? { ...prev, capturing: true } : null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location is required for visits.');
        setVisitState(prev => prev ? { ...prev, capturing: false } : null);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;

      await addVisit({
        leadId: visitState.leadId,
        leadName: visitState.leadName,
        type: 'Visit',
        latitude: lat,
        longitude: lng,
        address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        notes: visitState.notes.trim(),
        timestamp: new Date().toISOString(),
        duration: 0,
      });

      await addActivity({
        leadId: visitState.leadId,
        leadName: visitState.leadName,
        type: 'Visit',
        description: `Visit: ${visitState.notes.trim()}`,
        timestamp: new Date().toISOString(),
      });

      const lead = await getLeadById(visitState.leadId);
      if (lead) {
        lead.lastVisitDate = new Date().toISOString().split('T')[0];
        if (lead.stage === 'New') lead.stage = 'In Process';
        lead.updatedAt = new Date().toISOString();
        await saveLead(lead);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setVisitState(null);
      await loadLeads();
      await refreshDayRecord();
    } catch (e) {
      Alert.alert('Error', 'Failed to capture location or save visit.');
      setVisitState(prev => prev ? { ...prev, capturing: false } : null);
    }
  };

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active' &&
        callStartTimeRef.current &&
        pendingCallLeadRef.current
      ) {
        const elapsed = Math.round((Date.now() - callStartTimeRef.current) / 1000);
        setCallLogState({
          leadId: pendingCallLeadRef.current.id,
          leadName: pendingCallLeadRef.current.name,
          phone: '',
          type: 'Outbound',
          duration: elapsed > 0 ? elapsed.toString() : '0',
          notes: '',
          saving: false,
        });
        callStartTimeRef.current = null;
        pendingCallLeadRef.current = null;
      }
      appStateRef.current = nextAppState;
    });
    return () => subscription.remove();
  }, []);

  const handleCallLead = (lead: Lead) => {
    const phoneNumber = (lead.mobile || lead.phone || '').replace(/\s/g, '');
    if (!phoneNumber) {
      Alert.alert('No Phone Number', 'This lead does not have a phone number.');
      return;
    }
    callStartTimeRef.current = Date.now();
    pendingCallLeadRef.current = { id: lead.id, name: lead.name };
    Linking.openURL(`tel:${phoneNumber}`).catch(() => {
      callStartTimeRef.current = null;
      pendingCallLeadRef.current = null;
      setCallLogState({
        leadId: lead.id,
        leadName: lead.name,
        phone: phoneNumber,
        type: 'Outbound',
        duration: '0',
        notes: '',
        saving: false,
      });
    });
  };

  const submitCallLog = async () => {
    if (!callLogState) return;
    setCallLogState(prev => prev ? { ...prev, saving: true } : null);
    try {
      await addCallLog({
        leadId: callLogState.leadId,
        leadName: callLogState.leadName,
        type: callLogState.type,
        duration: parseInt(callLogState.duration) || 0,
        notes: callLogState.notes.trim(),
        timestamp: new Date().toISOString(),
      });
      await addActivity({
        leadId: callLogState.leadId,
        leadName: callLogState.leadName,
        type: 'Call',
        description: `${callLogState.type} call (${callLogState.duration}s)${callLogState.notes ? ': ' + callLogState.notes.trim() : ''}`,
        timestamp: new Date().toISOString(),
      });
      const lead = await getLeadById(callLogState.leadId);
      if (lead && lead.stage === 'New') {
        lead.stage = 'In Process';
        lead.updatedAt = new Date().toISOString();
        await saveLead(lead);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCallLogState(null);
      await loadLeads();
      await refreshDayRecord();
    } catch (e) {
      Alert.alert('Error', 'Failed to save call log.');
      setCallLogState(prev => prev ? { ...prev, saving: false } : null);
    }
  };

  const filtered = leads.filter(l => {
    if (activeFilter !== 'All' && l.stage !== activeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return l.name.toLowerCase().includes(q) ||
        (l.company || '').toLowerCase().includes(q) ||
        (l.address || l.area || '').toLowerCase().includes(q) ||
        (l.leadType || '').toLowerCase().includes(q) ||
        (l.mobile || l.phone || '').includes(q);
    }
    return true;
  });

  const counts = {
    All: leads.length,
    New: leads.filter(l => l.stage === 'New').length,
    'In Process': leads.filter(l => l.stage === 'In Process').length,
    Converted: leads.filter(l => l.stage === 'Converted').length,
  };

  const webTop = Platform.OS === 'web' ? 67 : 0;

  return (
    <View style={styles.container}>
      <View style={[styles.headerSection, { paddingTop: insets.top + webTop + 16 }]}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Leads</Text>
          <Pressable
            style={({ pressed }) => [styles.addLeadBtn, pressed && { opacity: 0.85 }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              openAddLeadForm();
            }}
          >
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.addLeadBtnText}>Add Lead</Text>
          </Pressable>
        </View>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color={Colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search leads..."
            placeholderTextColor={Colors.textTertiary}
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={Colors.textTertiary} />
            </Pressable>
          ) : null}
        </View>
        <View style={styles.filterRow}>
          {(['All', 'New', 'In Process', 'Converted'] as const).map(f => (
            <Pressable
              key={f}
              style={[styles.filterChip, activeFilter === f && styles.filterChipActive]}
              onPress={() => {
                Haptics.selectionAsync();
                setActiveFilter(f);
              }}
            >
              <Text style={[styles.filterText, activeFilter === f && styles.filterTextActive]}>
                {f} ({counts[f]})
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <LeadCard lead={item} onAddVisit={openAddVisit} onCall={handleCallLead} />}
        contentContainerStyle={[styles.listContent, { paddingBottom: 100 + (Platform.OS === 'web' ? 34 : 0) }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={48} color={Colors.textTertiary} />
            <Text style={styles.emptyText}>No leads found</Text>
            <Text style={styles.emptySubtext}>Tap + Add Lead to create one</Text>
          </View>
        }
      />

      <Modal visible={showAddLead} transparent animationType="slide" onRequestClose={() => setShowAddLead(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.modalDismiss} onPress={() => setShowAddLead(false)} />
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 16) }]}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Add New Lead</Text>

              <Text style={styles.fieldLabel}>Name *</Text>
              <TextInput style={styles.modalInput} placeholder="Full name" placeholderTextColor={Colors.textTertiary}
                value={formName} onChangeText={setFormName} />

              <Text style={styles.fieldLabel}>Mobile Number *</Text>
              <TextInput style={styles.modalInput} placeholder="+91 XXXXX XXXXX" placeholderTextColor={Colors.textTertiary}
                value={formMobile} onChangeText={setFormMobile} keyboardType="phone-pad" />

              <Text style={styles.fieldLabel}>Source</Text>
              <TextInput style={styles.modalInput} placeholder="e.g. Referral, Walk-in, Campaign" placeholderTextColor={Colors.textTertiary}
                value={formSource} onChangeText={setFormSource} />

              <Text style={styles.fieldLabel}>Address</Text>
              <TextInput style={styles.modalInput} placeholder="Full address" placeholderTextColor={Colors.textTertiary}
                value={formAddress} onChangeText={setFormAddress} />

              <Text style={styles.fieldLabel}>Type</Text>
              <Pressable
                style={styles.dropdownTrigger}
                onPress={() => setShowTypeDropdown(!showTypeDropdown)}
              >
                <Text style={formType ? styles.dropdownValue : styles.dropdownPlaceholder}>
                  {formType || 'Select type'}
                </Text>
                <Ionicons name={showTypeDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textTertiary} />
              </Pressable>

              {showTypeDropdown && (
                <View style={styles.dropdownList}>
                  {leadTypes.map(t => (
                    <Pressable
                      key={t}
                      style={[styles.dropdownItem, formType === t && styles.dropdownItemActive]}
                      onPress={() => {
                        setFormType(t);
                        setShowTypeDropdown(false);
                      }}
                    >
                      <Text style={[styles.dropdownItemText, formType === t && { color: Colors.primary, fontWeight: '600' as const }]}>{t}</Text>
                      {formType === t && <Ionicons name="checkmark" size={16} color={Colors.primary} />}
                    </Pressable>
                  ))}
                  <View style={styles.addTypeRow}>
                    <TextInput
                      style={styles.addTypeInput}
                      placeholder="Add new type..."
                      placeholderTextColor={Colors.textTertiary}
                      value={newTypeName}
                      onChangeText={setNewTypeName}
                    />
                    <Pressable
                      style={({ pressed }) => [styles.addTypeBtn, pressed && { opacity: 0.8 }]}
                      onPress={handleAddNewType}
                    >
                      <Ionicons name="add" size={18} color="#fff" />
                    </Pressable>
                  </View>
                </View>
              )}

              <Text style={styles.fieldLabel}>Location (GPS)</Text>
              <View style={styles.gpsRow}>
                <View style={styles.gpsValueBox}>
                  {gpsCapturing ? (
                    <View style={styles.gpsCapturingRow}>
                      <ActivityIndicator size="small" color={Colors.primary} />
                      <Text style={styles.gpsCapturingText}>Capturing GPS...</Text>
                    </View>
                  ) : gpsLabel ? (
                    <View style={styles.gpsCapturedRow}>
                      <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                      <Text style={styles.gpsCapturedText}>{gpsLabel}</Text>
                    </View>
                  ) : (
                    <Text style={styles.gpsPlaceholder}>Tap to capture</Text>
                  )}
                </View>
                <Pressable
                  style={({ pressed }) => [styles.gpsBtn, pressed && { opacity: 0.8 }]}
                  onPress={captureGPS}
                  disabled={gpsCapturing}
                >
                  <Ionicons name="navigate" size={18} color={Colors.primary} />
                </Pressable>
              </View>

              <Pressable
                style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.85 }, saving && { opacity: 0.5 }]}
                onPress={handleSaveLead}
                disabled={saving}
              >
                <Ionicons name="checkmark" size={20} color="#fff" />
                <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Lead'}</Text>
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!visitState} transparent animationType="slide" onRequestClose={() => setVisitState(null)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.modalDismiss} onPress={() => setVisitState(null)} />
          <View style={[styles.visitSheet, { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 16) }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Add Visit</Text>
            <Text style={styles.visitLeadName}>{visitState?.leadName}</Text>

            <View style={styles.visitInfoRow}>
              <Ionicons name="navigate" size={16} color={Colors.accent} />
              <Text style={styles.visitInfoText}>GPS location will be auto-captured</Text>
            </View>
            <View style={styles.visitInfoRow}>
              <Ionicons name="time" size={16} color={Colors.warning} />
              <Text style={styles.visitInfoText}>Timestamp: {new Date().toLocaleString()}</Text>
            </View>

            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Visit Notes *</Text>
            <TextInput
              style={[styles.modalInput, styles.notesArea]}
              placeholder="Enter visit notes (mandatory)"
              placeholderTextColor={Colors.textTertiary}
              value={visitState?.notes || ''}
              onChangeText={(t) => setVisitState(prev => prev ? { ...prev, notes: t } : null)}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <Pressable
              style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.85 }, visitState?.capturing && { opacity: 0.5 }]}
              onPress={submitVisit}
              disabled={visitState?.capturing}
            >
              {visitState?.capturing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="checkmark" size={20} color="#fff" />
              )}
              <Text style={styles.saveBtnText}>{visitState?.capturing ? 'Capturing GPS...' : 'Save Visit'}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!callLogState} transparent animationType="slide" onRequestClose={() => setCallLogState(null)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.modalDismiss} onPress={() => setCallLogState(null)} />
          <View style={[styles.callLogSheet, { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 16) }]}>
            <View style={styles.modalHandle} />
            <View style={styles.callLogHeader}>
              <View style={styles.callLogIconBg}>
                <Ionicons name="call" size={22} color={Colors.success} />
              </View>
              <Text style={styles.modalTitle}>Log Call</Text>
              <Text style={styles.callLogLeadName}>{callLogState?.leadName}</Text>
            </View>

            <View style={styles.callTypeRow}>
              <Pressable
                style={[styles.callTypeBtn, callLogState?.type === 'Outbound' && styles.callTypeBtnActive]}
                onPress={() => setCallLogState(prev => prev ? { ...prev, type: 'Outbound' } : null)}
              >
                <Ionicons name="arrow-up" size={14} color={callLogState?.type === 'Outbound' ? Colors.primary : Colors.textTertiary} />
                <Text style={[styles.callTypeText, callLogState?.type === 'Outbound' && styles.callTypeTextActive]}>Outbound</Text>
              </Pressable>
              <Pressable
                style={[styles.callTypeBtn, callLogState?.type === 'Inbound' && styles.callTypeBtnActive]}
                onPress={() => setCallLogState(prev => prev ? { ...prev, type: 'Inbound' } : null)}
              >
                <Ionicons name="arrow-down" size={14} color={callLogState?.type === 'Inbound' ? Colors.primary : Colors.textTertiary} />
                <Text style={[styles.callTypeText, callLogState?.type === 'Inbound' && styles.callTypeTextActive]}>Inbound</Text>
              </Pressable>
            </View>

            <Text style={styles.fieldLabel}>Duration (seconds)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. 120"
              placeholderTextColor={Colors.textTertiary}
              value={callLogState?.duration || ''}
              onChangeText={(t) => setCallLogState(prev => prev ? { ...prev, duration: t } : null)}
              keyboardType="numeric"
            />

            <Text style={styles.fieldLabel}>Notes</Text>
            <TextInput
              style={[styles.modalInput, styles.notesArea]}
              placeholder="Call notes (optional)"
              placeholderTextColor={Colors.textTertiary}
              value={callLogState?.notes || ''}
              onChangeText={(t) => setCallLogState(prev => prev ? { ...prev, notes: t } : null)}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <Pressable
              style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.85 }, callLogState?.saving && { opacity: 0.5 }]}
              onPress={submitCallLog}
              disabled={callLogState?.saving}
            >
              {callLogState?.saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="checkmark" size={20} color="#fff" />
              )}
              <Text style={styles.saveBtnText}>{callLogState?.saving ? 'Saving...' : 'Save Call Log'}</Text>
            </Pressable>

            <Pressable style={styles.skipCallBtn} onPress={() => setCallLogState(null)}>
              <Text style={styles.skipCallText}>Skip</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  headerSection: { paddingHorizontal: 20, paddingBottom: 12, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 28, fontWeight: '700' as const, color: Colors.text, fontFamily: 'Inter_700Bold' },
  addLeadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.primary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8,
  },
  addLeadBtnText: { fontSize: 14, fontWeight: '600' as const, color: '#fff', fontFamily: 'Inter_600SemiBold' },
  searchContainer: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.surfaceAlt, borderRadius: 12, paddingHorizontal: 14, height: 44,
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 15, color: Colors.text, fontFamily: 'Inter_400Regular' },
  filterRow: { flexDirection: 'row', gap: 8 },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: Colors.surfaceAlt,
  },
  filterChipActive: { backgroundColor: Colors.primary },
  filterText: { fontSize: 12, color: Colors.textSecondary, fontFamily: 'Inter_500Medium' },
  filterTextActive: { color: '#FFFFFF' },
  listContent: { padding: 20, gap: 12 },
  leadCard: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  leadHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  leadInfo: { flex: 1, gap: 3 },
  leadName: { fontSize: 15, fontWeight: '600' as const, color: Colors.text, fontFamily: 'Inter_600SemiBold' },
  leadCompany: { fontSize: 12, color: Colors.textSecondary, fontFamily: 'Inter_400Regular' },
  typeTag: { alignSelf: 'flex-start', backgroundColor: Colors.primaryLight, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  typeTagText: { fontSize: 11, fontWeight: '500' as const, color: Colors.primary, fontFamily: 'Inter_500Medium' },
  stageBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  stageDot: { width: 6, height: 6, borderRadius: 3 },
  stageText: { fontSize: 11, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  leadDetailsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  leadDetailItem: { flexDirection: 'row', alignItems: 'center', gap: 4, width: '48%' as any },
  leadDetailText: { fontSize: 11, color: Colors.textTertiary, fontFamily: 'Inter_400Regular', flex: 1 },
  cardActions: { flexDirection: 'row', gap: 8 },
  addVisitBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: Colors.primary + '40', borderRadius: 10, paddingVertical: 8,
    borderStyle: 'dashed' as any,
  },
  addVisitText: { fontSize: 13, fontWeight: '500' as const, color: Colors.primary, fontFamily: 'Inter_500Medium' },
  callLeadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: Colors.success + '40', borderRadius: 10, paddingVertical: 8,
    paddingHorizontal: 16,
  },
  callLeadText: { fontSize: 13, fontWeight: '500' as const, color: Colors.success, fontFamily: 'Inter_500Medium' },
  emptyContainer: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '600' as const, color: Colors.textSecondary, fontFamily: 'Inter_600SemiBold' },
  emptySubtext: { fontSize: 13, color: Colors.textTertiary, fontFamily: 'Inter_400Regular' },

  modalOverlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  modalDismiss: { flex: 1 },
  modalSheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '85%' },
  visitSheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '700' as const, color: Colors.text, fontFamily: 'Inter_700Bold', marginBottom: 4 },
  fieldLabel: { fontSize: 12, fontWeight: '600' as const, color: Colors.textSecondary, fontFamily: 'Inter_600SemiBold', marginBottom: 6, marginTop: 14, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  modalInput: {
    backgroundColor: Colors.surfaceAlt, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 15, color: Colors.text, fontFamily: 'Inter_400Regular',
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  notesArea: { minHeight: 100 },
  dropdownTrigger: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surfaceAlt, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  dropdownValue: { fontSize: 15, color: Colors.text, fontFamily: 'Inter_400Regular' },
  dropdownPlaceholder: { fontSize: 15, color: Colors.textTertiary, fontFamily: 'Inter_400Regular' },
  dropdownList: {
    marginTop: 4, backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.borderLight,
    maxHeight: 220, overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  dropdownItemActive: { backgroundColor: Colors.primaryLight },
  dropdownItemText: { fontSize: 14, color: Colors.text, fontFamily: 'Inter_400Regular' },
  addTypeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10,
  },
  addTypeInput: {
    flex: 1, backgroundColor: Colors.surfaceAlt, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
    fontSize: 14, color: Colors.text, fontFamily: 'Inter_400Regular',
  },
  addTypeBtn: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  gpsRow: { flexDirection: 'row', gap: 8 },
  gpsValueBox: {
    flex: 1, backgroundColor: Colors.surfaceAlt, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1, borderColor: Colors.borderLight, justifyContent: 'center',
  },
  gpsCapturingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gpsCapturingText: { fontSize: 13, color: Colors.primary, fontFamily: 'Inter_400Regular' },
  gpsCapturedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gpsCapturedText: { fontSize: 13, color: Colors.text, fontFamily: 'Inter_400Regular' },
  gpsPlaceholder: { fontSize: 13, color: Colors.textTertiary, fontFamily: 'Inter_400Regular' },
  gpsBtn: {
    width: 48, height: 48, borderRadius: 12, backgroundColor: Colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14, marginTop: 20,
  },
  saveBtnText: { fontSize: 16, fontWeight: '600' as const, color: '#FFFFFF', fontFamily: 'Inter_600SemiBold' },
  visitLeadName: { fontSize: 15, color: Colors.textSecondary, fontFamily: 'Inter_500Medium', marginBottom: 12 },
  visitInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  visitInfoText: { fontSize: 13, color: Colors.textSecondary, fontFamily: 'Inter_400Regular' },
  callLogSheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  callLogHeader: { alignItems: 'center', marginBottom: 16, gap: 4 },
  callLogIconBg: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: Colors.success + '15',
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  callLogLeadName: { fontSize: 14, color: Colors.textSecondary, fontFamily: 'Inter_500Medium' },
  callTypeRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  callTypeBtn: { flex: 1, flexDirection: 'row', paddingVertical: 10, borderRadius: 10, backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: Colors.borderLight },
  callTypeBtnActive: { backgroundColor: Colors.primaryLight, borderColor: Colors.primary },
  callTypeText: { fontSize: 14, color: Colors.textSecondary, fontFamily: 'Inter_500Medium' },
  callTypeTextActive: { color: Colors.primary, fontWeight: '600' as const },
  skipCallBtn: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  skipCallText: { fontSize: 14, color: Colors.textTertiary, fontFamily: 'Inter_500Medium' },
});
