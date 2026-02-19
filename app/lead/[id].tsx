import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, TextInput, Alert,
  Platform, Modal, Linking, KeyboardAvoidingView, ActivityIndicator, AppState,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import Colors from '@/constants/colors';
import { getLeadById, saveLead, getDayRecord, addVisit, addActivity, getCallsForLead, getVisitsForLead } from '@/lib/storage';
import { useTracking } from '@/lib/tracking-context';
import type { Lead, LeadStage, Activity, CallLog, Visit } from '@/lib/types';

const STAGE_COLORS: Record<LeadStage, string> = {
  'New': Colors.stageNew,
  'In Process': Colors.stageInProcess,
  'Converted': Colors.stageConverted,
};

type ActionType = 'follow-up' | 'visit' | 'revisit' | 'note' | 'call' | null;

export default function LeadDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { logVisit, logCall, logActivity, updateLeadStage, refreshDayRecord } = useTracking();

  const [lead, setLead] = useState<Lead | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [callHistory, setCallHistory] = useState<CallLog[]>([]);
  const [visitHistory, setVisitHistory] = useState<Visit[]>([]);
  const [activeAction, setActiveAction] = useState<ActionType>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [actionAddress, setActionAddress] = useState('');
  const [callDuration, setCallDuration] = useState('');
  const [callType, setCallType] = useState<'Outbound' | 'Inbound'>('Outbound');
  const [actionLoading, setActionLoading] = useState(false);
  const [visitLoading, setVisitLoading] = useState(false);
  const [showVisitModal, setShowVisitModal] = useState(false);
  const [visitNotes, setVisitNotes] = useState('');
  const [showCallTimerModal, setShowCallTimerModal] = useState(false);
  const [callTimerNotes, setCallTimerNotes] = useState('');
  const [callTimerDuration, setCallTimerDuration] = useState(0);
  const [callTimerSaving, setCallTimerSaving] = useState(false);

  const callStartTimeRef = useRef<number | null>(null);
  const pendingCallLeadRef = useRef<{ id: string; name: string; phone: string } | null>(null);
  const appStateRef = useRef(AppState.currentState);

  const loadLead = useCallback(async () => {
    if (!id) return;
    const l = await getLeadById(id);
    if (l) setLead(l);
    const record = await getDayRecord();
    setActivities(record.activities.filter(a => a.leadId === id).reverse());
    const calls = await getCallsForLead(id);
    setCallHistory(calls);
    const visits = await getVisitsForLead(id);
    setVisitHistory(visits);
  }, [id]);

  useEffect(() => {
    loadLead();
  }, [loadLead]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active' &&
        callStartTimeRef.current &&
        pendingCallLeadRef.current
      ) {
        const elapsed = Math.round((Date.now() - callStartTimeRef.current) / 1000);
        setCallTimerDuration(elapsed > 0 ? elapsed : 0);
        setCallTimerNotes('');
        setShowCallTimerModal(true);
      }
      appStateRef.current = nextAppState;
    });
    return () => subscription.remove();
  }, []);

  const handleAction = (action: ActionType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActiveAction(action);
    setActionNotes('');
    setActionAddress('');
    setCallDuration('');
  };

  const submitAction = async () => {
    if (!lead) return;
    setActionLoading(true);
    try {
      switch (activeAction) {
        case 'follow-up':
          await logVisit(lead.id, lead.name, 'First Follow-up', actionNotes, actionAddress || lead.address || lead.area);
          lead.lastVisitDate = new Date().toISOString().split('T')[0];
          lead.updatedAt = new Date().toISOString();
          await saveLead(lead);
          break;
        case 'visit':
          await logVisit(lead.id, lead.name, 'Visit', actionNotes, actionAddress || lead.address || lead.area);
          lead.lastVisitDate = new Date().toISOString().split('T')[0];
          lead.updatedAt = new Date().toISOString();
          await saveLead(lead);
          break;
        case 'revisit':
          await logVisit(lead.id, lead.name, 'Re-visit', actionNotes, actionAddress || lead.address || lead.area);
          lead.lastVisitDate = new Date().toISOString().split('T')[0];
          lead.updatedAt = new Date().toISOString();
          await saveLead(lead);
          break;
        case 'note':
          await logActivity(lead.id, lead.name, 'Note', actionNotes);
          if (lead.notes) {
            lead.notes = lead.notes + '\n' + actionNotes;
          } else {
            lead.notes = actionNotes;
          }
          lead.updatedAt = new Date().toISOString();
          await saveLead(lead);
          break;
        case 'call':
          await logCall(lead.id, lead.name, callType, parseInt(callDuration) || 0, actionNotes);
          break;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setActiveAction(null);
      await loadLead();
      await refreshDayRecord();
    } catch (e) {
      Alert.alert('Error', 'Failed to save action');
    }
    setActionLoading(false);
  };

  const handleQuickVisit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setVisitNotes('');
    setShowVisitModal(true);
  };

  const submitQuickVisit = async () => {
    if (!lead) return;
    if (!visitNotes.trim()) {
      Alert.alert('Required', 'Visit notes are mandatory.');
      return;
    }
    setVisitLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location is required for visits.');
        setVisitLoading(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;

      let visitAddress = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      try {
        const geocode = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        if (geocode && geocode.length > 0) {
          const g = geocode[0];
          const parts = [g.name, g.street, g.district, g.city, g.region, g.postalCode].filter(Boolean);
          if (parts.length > 0) visitAddress = parts.join(', ');
        }
      } catch (e) { /* use coordinate fallback */ }

      await addVisit({
        leadId: lead.id,
        leadName: lead.name,
        type: 'Visit',
        latitude: lat,
        longitude: lng,
        address: visitAddress,
        notes: visitNotes.trim(),
        timestamp: new Date().toISOString(),
        duration: 0,
      });

      await addActivity({
        leadId: lead.id,
        leadName: lead.name,
        type: 'Visit',
        description: `Visit: ${visitNotes.trim()}`,
        timestamp: new Date().toISOString(),
      });

      lead.lastVisitDate = new Date().toISOString().split('T')[0];
      if (lead.stage === 'New') lead.stage = 'In Process';
      lead.updatedAt = new Date().toISOString();
      await saveLead(lead);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowVisitModal(false);
      await loadLead();
      await refreshDayRecord();
    } catch (e) {
      Alert.alert('Error', 'Failed to capture location or save visit.');
    }
    setVisitLoading(false);
  };

  const initiateOutboundCall = () => {
    if (!lead) return;
    const phoneNumber = (lead.mobile || lead.phone || '').replace(/\s/g, '');
    if (!phoneNumber) {
      Alert.alert('No Phone Number', 'This lead does not have a phone number.');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    callStartTimeRef.current = Date.now();
    pendingCallLeadRef.current = { id: lead.id, name: lead.name, phone: phoneNumber };

    Linking.openURL(`tel:${phoneNumber}`).catch(() => {
      callStartTimeRef.current = null;
      pendingCallLeadRef.current = null;
      Alert.alert('Error', 'Could not open phone dialer.');
    });
  };

  const submitCallTimer = async () => {
    if (!lead || !pendingCallLeadRef.current) return;
    setCallTimerSaving(true);
    try {
      await logCall(
        pendingCallLeadRef.current.id,
        pendingCallLeadRef.current.name,
        'Outbound',
        callTimerDuration,
        callTimerNotes.trim()
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowCallTimerModal(false);
      callStartTimeRef.current = null;
      pendingCallLeadRef.current = null;
      await loadLead();
      await refreshDayRecord();
    } catch (e) {
      Alert.alert('Error', 'Failed to save call log.');
    }
    setCallTimerSaving(false);
  };

  const skipCallTimer = () => {
    setShowCallTimerModal(false);
    callStartTimeRef.current = null;
    pendingCallLeadRef.current = null;
  };

  const handleLogInboundCall = () => {
    if (!lead) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCallType('Inbound');
    setCallDuration('');
    setActionNotes('');
    setActiveAction('call');
  };

  const handleStageChange = (stage: LeadStage) => {
    if (!lead) return;
    Alert.alert('Change Stage', `Move "${lead.name}" to "${stage}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm', onPress: async () => {
          await updateLeadStage(lead.id, stage);
          lead.stage = stage;
          lead.updatedAt = new Date().toISOString();
          await saveLead(lead);
          setLead({ ...lead });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      },
    ]);
  };

  if (!lead) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  const webTop = Platform.OS === 'web' ? 67 : 0;
  const stageColor = STAGE_COLORS[lead.stage];

  const formatCallDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + webTop + 12, paddingBottom: 40 + (Platform.OS === 'web' ? 34 : 0) }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.navRow}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={Colors.text} />
          </Pressable>
          <Text style={styles.navTitle}>Lead Details</Text>
          <View style={styles.navRight}>
            <Pressable onPress={handleLogInboundCall} hitSlop={12} style={styles.navIconBtn}>
              <Ionicons name="call-outline" size={20} color={Colors.warning} />
              <View style={styles.inboundBadge}>
                <Ionicons name="arrow-down" size={8} color="#fff" />
              </View>
            </Pressable>
            <Pressable onPress={initiateOutboundCall} hitSlop={12} style={styles.navIconBtn}>
              <Ionicons name="call" size={22} color={Colors.success} />
            </Pressable>
          </View>
        </View>

        <View style={styles.profileCard}>
          <View style={[styles.profileAvatar, { backgroundColor: stageColor + '20' }]}>
            <Text style={[styles.profileInitials, { color: stageColor }]}>
              {lead.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </Text>
          </View>
          <Text style={styles.profileName}>{lead.name}</Text>
          {lead.leadType ? (
            <View style={styles.profileTypeTag}>
              <Text style={styles.profileTypeText}>{lead.leadType}</Text>
            </View>
          ) : lead.company ? (
            <Text style={styles.profileCompany}>{lead.company}</Text>
          ) : null}
          <View style={[styles.profileStageBadge, { backgroundColor: stageColor + '15' }]}>
            <View style={[styles.profileStageDot, { backgroundColor: stageColor }]} />
            <Text style={[styles.profileStageText, { color: stageColor }]}>{lead.stage}</Text>
          </View>
        </View>

        <View style={styles.infoCard}>
          <InfoRow icon="call-outline" label="Mobile" value={lead.mobile || lead.phone} />
          <InfoRow icon="location-outline" label="Address" value={lead.address || lead.area} />
          {lead.source ? <InfoRow icon="arrow-redo-outline" label="Source" value={lead.source} /> : null}
          {lead.email ? <InfoRow icon="mail-outline" label="Email" value={lead.email} /> : null}
          <InfoRow icon="person-outline" label="Assigned Staff" value={lead.assignedStaff || 'Self'} />
          <InfoRow icon="calendar-outline" label="Last Visit" value={lead.lastVisitDate ? new Date(lead.lastVisitDate).toLocaleDateString() : 'No visits yet'} />
          {lead.locationLat ? (
            <InfoRow icon="navigate-outline" label="GPS" value={`${lead.locationLat.toFixed(5)}, ${(lead.locationLng || 0).toFixed(5)}`} />
          ) : null}
          {lead.notes ? <InfoRow icon="document-text-outline" label="Notes" value={lead.notes} /> : null}
        </View>

        <View style={styles.callActionsRow}>
          <Pressable
            style={({ pressed }) => [styles.callActionBtn, styles.outboundCallBtn, pressed && { opacity: 0.85 }]}
            onPress={initiateOutboundCall}
          >
            <Ionicons name="call" size={18} color="#fff" />
            <Text style={styles.callActionText}>Call Lead</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.callActionBtn, styles.inboundCallBtn, pressed && { opacity: 0.85 }]}
            onPress={handleLogInboundCall}
          >
            <Ionicons name="call-outline" size={18} color={Colors.warning} />
            <Text style={[styles.callActionText, { color: Colors.warning }]}>Log Inbound</Text>
          </Pressable>
        </View>

        <Pressable
          style={({ pressed }) => [styles.quickVisitBtn, pressed && { opacity: 0.85 }]}
          onPress={handleQuickVisit}
        >
          <Ionicons name="add-circle" size={20} color="#fff" />
          <Text style={styles.quickVisitText}>Add Visit</Text>
        </Pressable>

        <View style={styles.stageSelector}>
          <Text style={styles.stageSelectTitle}>Stage</Text>
          <View style={styles.stageButtons}>
            {(['New', 'In Process', 'Converted'] as LeadStage[]).map(s => (
              <Pressable
                key={s}
                style={[styles.stageBtn, lead.stage === s && { backgroundColor: STAGE_COLORS[s] + '20', borderColor: STAGE_COLORS[s] }]}
                onPress={() => handleStageChange(s)}
              >
                <View style={[styles.stageBtnDot, { backgroundColor: STAGE_COLORS[s] }]} />
                <Text style={[styles.stageBtnText, lead.stage === s && { color: STAGE_COLORS[s], fontWeight: '600' as const }]}>{s}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          <ActionButton icon="flag-outline" label="Follow-up" color={Colors.warning} onPress={() => handleAction('follow-up')} />
          <ActionButton icon="location-outline" label="Visit" color={Colors.primary} onPress={() => handleAction('visit')} />
          <ActionButton icon="refresh-outline" label="Re-visit" color={Colors.accent} onPress={() => handleAction('revisit')} />
          <ActionButton icon="create-outline" label="Notes" color={Colors.stageInProcess} onPress={() => handleAction('note')} />
          <ActionButton icon="call-outline" label="Call" color={Colors.success} onPress={() => handleAction('call')} />
        </View>

        {visitHistory.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Visit History</Text>
            {visitHistory.map((v, i) => (
              <View key={v.id || i} style={styles.visitHistItem}>
                <View style={[styles.visitHistIcon, { backgroundColor: Colors.primaryLight }]}>
                  <Ionicons name="location" size={16} color={Colors.primary} />
                </View>
                <View style={styles.visitHistContent}>
                  <View style={styles.visitHistHeader}>
                    <Text style={styles.visitHistType}>{v.type}</Text>
                    <Text style={styles.visitHistDate}>
                      {new Date(v.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </Text>
                  </View>
                  <View style={styles.visitHistAddrRow}>
                    <Ionicons name="navigate-outline" size={12} color={Colors.textTertiary} />
                    <Text style={styles.visitHistAddr} numberOfLines={2}>{v.address || 'No address'}</Text>
                  </View>
                  {v.notes ? (
                    <Text style={styles.visitHistNotes} numberOfLines={2}>{v.notes}</Text>
                  ) : null}
                  <Text style={styles.visitHistTime}>
                    {new Date(v.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              </View>
            ))}
          </>
        ) : null}

        {callHistory.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Call History</Text>
            {callHistory.map((call, i) => (
              <View key={call.id || i} style={styles.callItem}>
                <View style={[styles.callIcon, { backgroundColor: call.type === 'Outbound' ? Colors.success + '15' : Colors.warning + '15' }]}>
                  <Ionicons
                    name={call.type === 'Outbound' ? 'call' : 'call-outline'}
                    size={16}
                    color={call.type === 'Outbound' ? Colors.success : Colors.warning}
                  />
                  <Ionicons
                    name={call.type === 'Outbound' ? 'arrow-up' : 'arrow-down'}
                    size={10}
                    color={call.type === 'Outbound' ? Colors.success : Colors.warning}
                    style={styles.callDirectionIcon}
                  />
                </View>
                <View style={styles.callContent}>
                  <View style={styles.callHeader}>
                    <Text style={styles.callTypeLabel}>{call.type}</Text>
                    <Text style={styles.callTime}>
                      {new Date(call.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <View style={styles.callMeta}>
                    <Ionicons name="time-outline" size={12} color={Colors.textTertiary} />
                    <Text style={styles.callDurationText}>{formatCallDuration(call.duration)}</Text>
                    {call.notes ? (
                      <>
                        <View style={styles.callMetaDivider} />
                        <Text style={styles.callNotesText} numberOfLines={1}>{call.notes}</Text>
                      </>
                    ) : null}
                  </View>
                </View>
              </View>
            ))}
          </>
        ) : null}

        {activities.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Activity History</Text>
            {activities.map((act, i) => (
              <View key={act.id || i} style={styles.actItem}>
                <View style={[styles.actDot, { backgroundColor: getActColor(act.type) }]} />
                <View style={styles.actContent}>
                  <View style={styles.actHeader}>
                    <Text style={styles.actType}>{act.type}</Text>
                    <Text style={styles.actTime}>
                      {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <Text style={styles.actDesc} numberOfLines={2}>{act.description}</Text>
                </View>
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>

      <Modal visible={!!activeAction} transparent animationType="slide" onRequestClose={() => setActiveAction(null)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.modalDismiss} onPress={() => setActiveAction(null)} />
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 16) }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{getActionTitle(activeAction)}</Text>

            {(activeAction === 'follow-up' || activeAction === 'visit' || activeAction === 'revisit') ? (
              <TextInput
                style={styles.modalInput}
                placeholder="Address / Location"
                placeholderTextColor={Colors.textTertiary}
                value={actionAddress}
                onChangeText={setActionAddress}
              />
            ) : null}

            {activeAction === 'call' ? (
              <>
                <View style={styles.callTypeRow}>
                  <Pressable
                    style={[styles.callTypeBtn, callType === 'Outbound' && styles.callTypeBtnActive]}
                    onPress={() => setCallType('Outbound')}
                  >
                    <Ionicons name="arrow-up" size={14} color={callType === 'Outbound' ? Colors.primary : Colors.textTertiary} />
                    <Text style={[styles.callTypeText, callType === 'Outbound' && styles.callTypeTextActive]}>Outbound</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.callTypeBtn, callType === 'Inbound' && styles.callTypeBtnActive]}
                    onPress={() => setCallType('Inbound')}
                  >
                    <Ionicons name="arrow-down" size={14} color={callType === 'Inbound' ? Colors.primary : Colors.textTertiary} />
                    <Text style={[styles.callTypeText, callType === 'Inbound' && styles.callTypeTextActive]}>Inbound</Text>
                  </Pressable>
                </View>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Duration (seconds)"
                  placeholderTextColor={Colors.textTertiary}
                  value={callDuration}
                  onChangeText={setCallDuration}
                  keyboardType="numeric"
                />
              </>
            ) : null}

            <TextInput
              style={[styles.modalInput, styles.modalTextArea]}
              placeholder="Notes (optional)"
              placeholderTextColor={Colors.textTertiary}
              value={actionNotes}
              onChangeText={setActionNotes}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <Pressable
              style={({ pressed }) => [styles.modalSubmit, pressed && { opacity: 0.85 }, actionLoading && { opacity: 0.5 }]}
              onPress={submitAction}
              disabled={actionLoading}
            >
              <Ionicons name="checkmark" size={20} color="#fff" />
              <Text style={styles.modalSubmitText}>{actionLoading ? 'Saving...' : 'Save'}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showVisitModal} transparent animationType="slide" onRequestClose={() => setShowVisitModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.modalDismiss} onPress={() => setShowVisitModal(false)} />
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 16) }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Add Visit</Text>
            <Text style={styles.visitSubtitle}>{lead.name}</Text>

            <View style={styles.visitInfoRow}>
              <Ionicons name="navigate" size={16} color={Colors.accent} />
              <Text style={styles.visitInfoText}>GPS will be auto-captured</Text>
            </View>
            <View style={styles.visitInfoRow}>
              <Ionicons name="time" size={16} color={Colors.warning} />
              <Text style={styles.visitInfoText}>{new Date().toLocaleString()}</Text>
            </View>

            <TextInput
              style={[styles.modalInput, styles.modalTextArea, { marginTop: 12 }]}
              placeholder="Visit notes (mandatory)"
              placeholderTextColor={Colors.textTertiary}
              value={visitNotes}
              onChangeText={setVisitNotes}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <Pressable
              style={({ pressed }) => [styles.modalSubmit, pressed && { opacity: 0.85 }, visitLoading && { opacity: 0.5 }]}
              onPress={submitQuickVisit}
              disabled={visitLoading}
            >
              {visitLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="checkmark" size={20} color="#fff" />
              )}
              <Text style={styles.modalSubmitText}>{visitLoading ? 'Capturing GPS...' : 'Save Visit'}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showCallTimerModal} transparent animationType="slide" onRequestClose={skipCallTimer}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.modalDismiss} onPress={skipCallTimer} />
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 16) }]}>
            <View style={styles.modalHandle} />
            <View style={styles.callTimerHeader}>
              <View style={styles.callTimerIconBg}>
                <Ionicons name="call" size={24} color={Colors.success} />
              </View>
              <Text style={styles.modalTitle}>Call Completed</Text>
              <Text style={styles.callTimerSubtitle}>{pendingCallLeadRef.current?.name}</Text>
            </View>

            <View style={styles.callTimerDurationCard}>
              <Text style={styles.callTimerLabel}>Estimated Duration</Text>
              <Text style={styles.callTimerValue}>{formatCallDuration(callTimerDuration)}</Text>
            </View>

            <Text style={styles.callTimerEditLabel}>Adjust duration (seconds)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Duration in seconds"
              placeholderTextColor={Colors.textTertiary}
              value={callTimerDuration.toString()}
              onChangeText={(t) => setCallTimerDuration(parseInt(t) || 0)}
              keyboardType="numeric"
            />

            <TextInput
              style={[styles.modalInput, styles.modalTextArea]}
              placeholder="Call notes (optional)"
              placeholderTextColor={Colors.textTertiary}
              value={callTimerNotes}
              onChangeText={setCallTimerNotes}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <Pressable
              style={({ pressed }) => [styles.modalSubmit, pressed && { opacity: 0.85 }, callTimerSaving && { opacity: 0.5 }]}
              onPress={submitCallTimer}
              disabled={callTimerSaving}
            >
              {callTimerSaving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="checkmark" size={20} color="#fff" />
              )}
              <Text style={styles.modalSubmitText}>{callTimerSaving ? 'Saving...' : 'Save Call Log'}</Text>
            </Pressable>

            <Pressable style={styles.skipBtn} onPress={skipCallTimer}>
              <Text style={styles.skipBtnText}>Skip</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon as any} size={18} color={Colors.textTertiary} />
      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

function ActionButton({ icon, label, color, onPress }: { icon: string; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.8, transform: [{ scale: 0.95 }] }]}
      onPress={onPress}
    >
      <View style={[styles.actionIconBg, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

function getActionTitle(action: ActionType): string {
  switch (action) {
    case 'follow-up': return 'First Follow-up';
    case 'visit': return 'Log Visit';
    case 'revisit': return 'Log Re-visit';
    case 'note': return 'Add Notes';
    case 'call': return 'Log Call';
    default: return '';
  }
}

function getActColor(type: string): string {
  switch (type) {
    case 'Visit': return Colors.primary;
    case 'Re-visit': return Colors.accent;
    case 'First Follow-up': return Colors.warning;
    case 'Call': return Colors.success;
    case 'Note': return Colors.textSecondary;
    default: return Colors.textTertiary;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: 20 },
  loadingText: { fontSize: 16, color: Colors.textSecondary, fontFamily: 'Inter_500Medium' },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.borderLight },
  navTitle: { fontSize: 17, fontWeight: '600' as const, color: Colors.text, fontFamily: 'Inter_600SemiBold' },
  navRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  navIconBtn: { position: 'relative' as const },
  inboundBadge: {
    position: 'absolute' as const, top: -4, right: -4,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: Colors.warning, alignItems: 'center', justifyContent: 'center',
  },
  profileCard: { alignItems: 'center', marginBottom: 20 },
  profileAvatar: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  profileInitials: { fontSize: 26, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  profileName: { fontSize: 22, fontWeight: '700' as const, color: Colors.text, fontFamily: 'Inter_700Bold' },
  profileCompany: { fontSize: 14, color: Colors.textSecondary, fontFamily: 'Inter_400Regular', marginTop: 2 },
  profileTypeTag: { backgroundColor: Colors.primaryLight, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4, marginTop: 6 },
  profileTypeText: { fontSize: 13, fontWeight: '600' as const, color: Colors.primary, fontFamily: 'Inter_600SemiBold' },
  profileStageBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, marginTop: 10 },
  profileStageDot: { width: 8, height: 8, borderRadius: 4 },
  profileStageText: { fontSize: 13, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  infoCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, gap: 14, marginBottom: 16, borderWidth: 1, borderColor: Colors.borderLight },
  infoRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: 11, color: Colors.textTertiary, fontFamily: 'Inter_500Medium', textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  infoValue: { fontSize: 14, color: Colors.text, fontFamily: 'Inter_400Regular', marginTop: 2 },
  callActionsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  callActionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 14, paddingVertical: 12,
  },
  outboundCallBtn: { backgroundColor: Colors.success },
  inboundCallBtn: { backgroundColor: Colors.warning + '15', borderWidth: 1, borderColor: Colors.warning + '40' },
  callActionText: { fontSize: 14, fontWeight: '600' as const, color: '#fff', fontFamily: 'Inter_600SemiBold' },
  quickVisitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.accent, borderRadius: 14, paddingVertical: 14, marginBottom: 20,
  },
  quickVisitText: { fontSize: 16, fontWeight: '600' as const, color: '#fff', fontFamily: 'Inter_600SemiBold' },
  stageSelector: { marginBottom: 20 },
  stageSelectTitle: { fontSize: 14, fontWeight: '600' as const, color: Colors.text, fontFamily: 'Inter_600SemiBold', marginBottom: 8 },
  stageButtons: { flexDirection: 'row', gap: 8 },
  stageBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderLight },
  stageBtnDot: { width: 8, height: 8, borderRadius: 4 },
  stageBtnText: { fontSize: 12, color: Colors.textSecondary, fontFamily: 'Inter_500Medium' },
  sectionTitle: { fontSize: 16, fontWeight: '600' as const, color: Colors.text, fontFamily: 'Inter_600SemiBold', marginBottom: 12, marginTop: 4 },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  actionBtn: { alignItems: 'center', gap: 6, width: 64 },
  actionIconBg: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 11, color: Colors.textSecondary, fontFamily: 'Inter_500Medium', textAlign: 'center' },
  visitHistItem: {
    flexDirection: 'row', gap: 12, backgroundColor: Colors.surface,
    borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  visitHistIcon: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  visitHistContent: { flex: 1 },
  visitHistHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  visitHistType: { fontSize: 14, fontWeight: '600' as const, color: Colors.text, fontFamily: 'Inter_600SemiBold' },
  visitHistDate: { fontSize: 12, color: Colors.textTertiary, fontFamily: 'Inter_400Regular' },
  visitHistAddrRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: 4 },
  visitHistAddr: { flex: 1, fontSize: 12, color: Colors.textSecondary, fontFamily: 'Inter_400Regular' },
  visitHistNotes: { fontSize: 12, color: Colors.textTertiary, fontFamily: 'Inter_400Regular', marginTop: 4, fontStyle: 'italic' as const },
  visitHistTime: { fontSize: 11, color: Colors.textTertiary, fontFamily: 'Inter_400Regular', marginTop: 4 },
  callItem: {
    flexDirection: 'row', gap: 12, backgroundColor: Colors.surface,
    borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  callIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  callDirectionIcon: { position: 'absolute' as const, bottom: 6, right: 6 },
  callContent: { flex: 1 },
  callHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  callTypeLabel: { fontSize: 14, fontWeight: '600' as const, color: Colors.text, fontFamily: 'Inter_600SemiBold' },
  callTime: { fontSize: 11, color: Colors.textTertiary, fontFamily: 'Inter_400Regular' },
  callMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  callDurationText: { fontSize: 12, color: Colors.textSecondary, fontFamily: 'Inter_500Medium' },
  callMetaDivider: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: Colors.textTertiary, marginHorizontal: 4 },
  callNotesText: { fontSize: 12, color: Colors.textTertiary, fontFamily: 'Inter_400Regular', flex: 1 },
  actItem: {
    flexDirection: 'row', gap: 12, backgroundColor: Colors.surface,
    borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  actDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  actContent: { flex: 1 },
  actHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actType: { fontSize: 13, fontWeight: '600' as const, color: Colors.text, fontFamily: 'Inter_600SemiBold' },
  actTime: { fontSize: 11, color: Colors.textTertiary, fontFamily: 'Inter_400Regular' },
  actDesc: { fontSize: 12, color: Colors.textSecondary, fontFamily: 'Inter_400Regular', marginTop: 4 },
  modalOverlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  modalDismiss: { flex: 1 },
  modalContent: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700' as const, color: Colors.text, fontFamily: 'Inter_700Bold', marginBottom: 4 },
  visitSubtitle: { fontSize: 14, color: Colors.textSecondary, fontFamily: 'Inter_500Medium', marginBottom: 12 },
  visitInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  visitInfoText: { fontSize: 13, color: Colors.textSecondary, fontFamily: 'Inter_400Regular' },
  modalInput: {
    backgroundColor: Colors.surfaceAlt, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 15, color: Colors.text, fontFamily: 'Inter_400Regular', marginBottom: 12,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  modalTextArea: { minHeight: 80 },
  callTypeRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  callTypeBtn: { flex: 1, flexDirection: 'row', paddingVertical: 10, borderRadius: 10, backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: Colors.borderLight },
  callTypeBtnActive: { backgroundColor: Colors.primaryLight, borderColor: Colors.primary },
  callTypeText: { fontSize: 14, color: Colors.textSecondary, fontFamily: 'Inter_500Medium' },
  callTypeTextActive: { color: Colors.primary, fontWeight: '600' as const },
  modalSubmit: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14, marginTop: 4,
  },
  modalSubmitText: { fontSize: 16, fontWeight: '600' as const, color: '#FFFFFF', fontFamily: 'Inter_600SemiBold' },
  callTimerHeader: { alignItems: 'center', marginBottom: 16, gap: 6 },
  callTimerIconBg: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.success + '15',
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  callTimerSubtitle: { fontSize: 14, color: Colors.textSecondary, fontFamily: 'Inter_500Medium' },
  callTimerDurationCard: {
    backgroundColor: Colors.surfaceAlt, borderRadius: 14, padding: 16,
    alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: Colors.borderLight,
  },
  callTimerLabel: { fontSize: 12, color: Colors.textTertiary, fontFamily: 'Inter_500Medium', textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  callTimerValue: { fontSize: 28, fontWeight: '700' as const, color: Colors.text, fontFamily: 'Inter_700Bold', marginTop: 4 },
  callTimerEditLabel: { fontSize: 12, color: Colors.textTertiary, fontFamily: 'Inter_500Medium', marginBottom: 6 },
  skipBtn: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  skipBtnText: { fontSize: 14, color: Colors.textTertiary, fontFamily: 'Inter_500Medium' },
});
