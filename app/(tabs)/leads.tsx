import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, Pressable, StyleSheet, FlatList, TextInput, Platform, RefreshControl,
  Modal, KeyboardAvoidingView, ScrollView, Alert, ActivityIndicator, Linking, AppState,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import { getLeads, getLeadTypes, addLeadType, createLead, createLeadsBatch, addVisit, addActivity, saveLead, getLeadById, addCallLog } from '@/lib/storage';
import { useTracking } from '@/lib/tracking-context';
import type { Lead, LeadStage } from '@/lib/types';

const LEAD_TYPE_OPTIONS = ['Doctor', 'Ambulance', 'Clinic', 'Other', 'Nursing Staff', 'KOL', 'Hospital'];
const SOURCE_OPTIONS = ['Google Ads', 'Facebook Ads', 'Walk-in', 'Referral Doctor', 'Field Marketing Executive', 'Health Camp', 'JustDial / Practo', 'WhatsApp Campaign'];

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
  const [showSourceDropdown, setShowSourceDropdown] = useState(false);
  const [newSourceName, setNewSourceName] = useState('');
  const [showManualType, setShowManualType] = useState(false);
  const [showManualSource, setShowManualSource] = useState(false);

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
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showImportExport, setShowImportExport] = useState(false);
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
      if (!formAddress) {
        try {
          const geocode = await Location.reverseGeocodeAsync({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
          if (geocode && geocode.length > 0) {
            const g = geocode[0];
            const parts = [g.name, g.street, g.district, g.city, g.region, g.postalCode].filter(Boolean);
            if (parts.length > 0) setFormAddress(parts.join(', '));
          }
        } catch (_e) { /* skip geocoding */ }
      }
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
    setShowTypeDropdown(false);
    setShowSourceDropdown(false);
    setShowManualType(false);
    setShowManualSource(false);
    setNewTypeName('');
    setNewSourceName('');
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
    } catch (e: any) {
      console.error('Save lead error:', e);
      Alert.alert('Error', e.message || 'Failed to save lead. Please check your connection and try again.');
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

      let visitAddress = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      try {
        const geocode = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        if (geocode && geocode.length > 0) {
          const g = geocode[0];
          const parts = [g.name, g.street, g.district, g.city, g.region, g.postalCode].filter(Boolean);
          if (parts.length > 0) visitAddress = parts.join(', ');
        }
      } catch (_e) { /* use coordinate fallback */ }

      await addVisit({
        leadId: visitState.leadId,
        leadName: visitState.leadName,
        type: 'Visit',
        latitude: lat,
        longitude: lng,
        address: visitAddress,
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

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const exportData = leads.map(l => ({
        Name: l.name,
        Mobile: l.mobile || l.phone,
        Type: l.leadType,
        Source: l.source,
        Address: l.address || l.area,
        Stage: l.stage,
        'Assigned Staff': l.assignedStaff,
        'Last Visit Date': l.lastVisitDate || '',
        Email: l.email,
        Company: l.company,
        Notes: l.notes,
        'Latitude': l.locationLat || '',
        'Longitude': l.locationLng || '',
        'Created At': l.createdAt ? new Date(l.createdAt).toLocaleDateString() : '',
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Leads');

      const colWidths = [
        { wch: 20 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 25 },
        { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 15 },
        { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 14 },
      ];
      ws['!cols'] = colWidths;

      const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

      if (Platform.OS === 'web') {
        const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
        const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `leads_${new Date().toISOString().split('T')[0]}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
        Alert.alert('Exported', `${leads.length} leads exported successfully.`);
      } else {
        const fileName = `leads_${new Date().toISOString().split('T')[0]}.xlsx`;
        const filePath = `${FileSystem.cacheDirectory}${fileName}`;
        await FileSystem.writeAsStringAsync(filePath, wbout, { encoding: FileSystem.EncodingType.Base64 });

        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(filePath, {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            dialogTitle: 'Export Leads',
          });
        } else {
          Alert.alert('Exported', `File saved: ${fileName}`);
        }
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      console.error('Export error:', e);
      Alert.alert('Export Failed', e.message || 'Could not export leads.');
    }
    setExporting(false);
    setShowImportExport(false);
  };

  const handleImportExcel = async () => {
    setImporting(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'text/csv',
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        setImporting(false);
        return;
      }

      const file = result.assets[0];
      let workbook: XLSX.WorkBook;

      if (Platform.OS === 'web') {
        const response = await fetch(file.uri);
        const arrayBuffer = await response.arrayBuffer();
        workbook = XLSX.read(arrayBuffer, { type: 'array' });
      } else {
        const fileContent = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
        workbook = XLSX.read(fileContent, { type: 'base64' });
      }

      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet);

      if (rows.length === 0) {
        Alert.alert('Empty File', 'The file does not contain any data.');
        setImporting(false);
        return;
      }

      const leadsToImport = rows.map(row => ({
        name: String(row['Name'] || row['name'] || row['Full Name'] || row['Lead Name'] || '').trim(),
        mobile: String(row['Mobile'] || row['mobile'] || row['Phone'] || row['phone'] || row['Mobile Number'] || '').trim(),
        leadType: String(row['Type'] || row['type'] || row['Lead Type'] || row['Category'] || '').trim(),
        source: String(row['Source'] || row['source'] || '').trim(),
        address: String(row['Address'] || row['address'] || row['Location'] || '').trim(),
        assignedStaff: String(row['Assigned Staff'] || row['Staff'] || 'Self').trim(),
        locationLat: row['Latitude'] ? parseFloat(row['Latitude']) : null,
        locationLng: row['Longitude'] ? parseFloat(row['Longitude']) : null,
      })).filter(l => l.name.length > 0);

      if (leadsToImport.length === 0) {
        Alert.alert('No Valid Data', 'No leads with names were found in the file. Make sure the file has a "Name" column.');
        setImporting(false);
        return;
      }

      Alert.alert(
        'Import Leads',
        `Found ${leadsToImport.length} leads to import. Continue?`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => setImporting(false) },
          {
            text: 'Import',
            onPress: async () => {
              try {
                await createLeadsBatch(leadsToImport);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                Alert.alert('Success', `${leadsToImport.length} leads imported successfully.`);
                await loadLeads();
              } catch (e: any) {
                console.error('Import save error:', e);
                Alert.alert('Import Failed', e.message || 'Could not save imported leads.');
              }
              setImporting(false);
              setShowImportExport(false);
            },
          },
        ]
      );
    } catch (e: any) {
      console.error('Import error:', e);
      Alert.alert('Import Failed', e.message || 'Could not read the file.');
      setImporting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const sampleData = [
        { Name: 'Dr. Sharma', Mobile: '9876543210', Type: 'Doctor', Source: 'Referral', Address: '123 Main Road, Delhi', 'Assigned Staff': 'Self', Latitude: '', Longitude: '' },
        { Name: 'City Hospital', Mobile: '9123456780', Type: 'Hospital', Source: 'Walk-in', Address: '45 MG Road, Mumbai', 'Assigned Staff': 'Self', Latitude: '', Longitude: '' },
        { Name: 'Sunrise Pharmacy', Mobile: '8765432190', Type: 'Pharmacy', Source: 'Campaign', Address: '78 Station Road, Pune', 'Assigned Staff': 'Self', Latitude: '', Longitude: '' },
      ];

      const ws = XLSX.utils.json_to_sheet(sampleData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Leads Template');

      ws['!cols'] = [
        { wch: 20 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 30 },
        { wch: 14 }, { wch: 12 }, { wch: 12 },
      ];

      if (Platform.OS === 'web') {
        const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
        const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'leads_import_template.xlsx';
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
        const filePath = `${FileSystem.cacheDirectory}leads_import_template.xlsx`;
        await FileSystem.writeAsStringAsync(filePath, wbout, { encoding: FileSystem.EncodingType.Base64 });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(filePath, {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            dialogTitle: 'Download Template',
          });
        } else {
          Alert.alert('Template Saved', 'Template file saved to cache.');
        }
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      console.error('Template download error:', e);
      Alert.alert('Error', 'Could not generate template file.');
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
          <View style={styles.headerActions}>
            <Pressable
              style={({ pressed }) => [styles.iconActionBtn, pressed && { opacity: 0.7 }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowImportExport(true);
              }}
            >
              <Ionicons name="swap-vertical" size={20} color={Colors.primary} />
            </Pressable>
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
              <Pressable
                style={styles.dropdownTrigger}
                onPress={() => { setShowSourceDropdown(!showSourceDropdown); setShowTypeDropdown(false); }}
              >
                <Text style={formSource ? styles.dropdownValue : styles.dropdownPlaceholder}>
                  {formSource || 'Select source'}
                </Text>
                <Ionicons name={showSourceDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textTertiary} />
              </Pressable>

              {showSourceDropdown && (
                <View style={styles.dropdownList}>
                  {SOURCE_OPTIONS.map(s => (
                    <Pressable
                      key={s}
                      style={[styles.dropdownItem, formSource === s && styles.dropdownItemActive]}
                      onPress={() => {
                        setFormSource(s);
                        setShowSourceDropdown(false);
                        setShowManualSource(false);
                      }}
                    >
                      <Text style={[styles.dropdownItemText, formSource === s && { color: Colors.primary, fontWeight: '600' as const }]}>{s}</Text>
                      {formSource === s && <Ionicons name="checkmark" size={16} color={Colors.primary} />}
                    </Pressable>
                  ))}
                  <Pressable
                    style={[styles.dropdownItem, showManualSource && styles.dropdownItemActive]}
                    onPress={() => setShowManualSource(!showManualSource)}
                  >
                    <Text style={[styles.dropdownItemText, { color: Colors.accent, fontWeight: '500' as const }]}>Manual Entry</Text>
                    <Ionicons name="create-outline" size={16} color={Colors.accent} />
                  </Pressable>
                  {showManualSource && (
                    <View style={styles.addTypeRow}>
                      <TextInput
                        style={styles.addTypeInput}
                        placeholder="Enter custom source..."
                        placeholderTextColor={Colors.textTertiary}
                        value={newSourceName}
                        onChangeText={setNewSourceName}
                      />
                      <Pressable
                        style={({ pressed }) => [styles.addTypeBtn, pressed && { opacity: 0.8 }]}
                        onPress={() => {
                          if (newSourceName.trim()) {
                            setFormSource(newSourceName.trim());
                            setNewSourceName('');
                            setShowSourceDropdown(false);
                            setShowManualSource(false);
                          }
                        }}
                      >
                        <Ionicons name="checkmark" size={18} color="#fff" />
                      </Pressable>
                    </View>
                  )}
                </View>
              )}

              <Text style={styles.fieldLabel}>Address</Text>
              <TextInput style={styles.modalInput} placeholder="Full address" placeholderTextColor={Colors.textTertiary}
                value={formAddress} onChangeText={setFormAddress} />

              <Text style={styles.fieldLabel}>Type</Text>
              <Pressable
                style={styles.dropdownTrigger}
                onPress={() => { setShowTypeDropdown(!showTypeDropdown); setShowSourceDropdown(false); }}
              >
                <Text style={formType ? styles.dropdownValue : styles.dropdownPlaceholder}>
                  {formType || 'Select type'}
                </Text>
                <Ionicons name={showTypeDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textTertiary} />
              </Pressable>

              {showTypeDropdown && (
                <View style={styles.dropdownList}>
                  {LEAD_TYPE_OPTIONS.map(t => (
                    <Pressable
                      key={t}
                      style={[styles.dropdownItem, formType === t && styles.dropdownItemActive]}
                      onPress={() => {
                        setFormType(t);
                        setShowTypeDropdown(false);
                        setShowManualType(false);
                      }}
                    >
                      <Text style={[styles.dropdownItemText, formType === t && { color: Colors.primary, fontWeight: '600' as const }]}>{t}</Text>
                      {formType === t && <Ionicons name="checkmark" size={16} color={Colors.primary} />}
                    </Pressable>
                  ))}
                  <Pressable
                    style={[styles.dropdownItem, showManualType && styles.dropdownItemActive]}
                    onPress={() => setShowManualType(!showManualType)}
                  >
                    <Text style={[styles.dropdownItemText, { color: Colors.accent, fontWeight: '500' as const }]}>Manual Entry</Text>
                    <Ionicons name="create-outline" size={16} color={Colors.accent} />
                  </Pressable>
                  {showManualType && (
                    <View style={styles.addTypeRow}>
                      <TextInput
                        style={styles.addTypeInput}
                        placeholder="Enter custom type..."
                        placeholderTextColor={Colors.textTertiary}
                        value={newTypeName}
                        onChangeText={setNewTypeName}
                      />
                      <Pressable
                        style={({ pressed }) => [styles.addTypeBtn, pressed && { opacity: 0.8 }]}
                        onPress={() => {
                          if (newTypeName.trim()) {
                            addLeadType(newTypeName.trim());
                            setFormType(newTypeName.trim());
                            setNewTypeName('');
                            setShowTypeDropdown(false);
                            setShowManualType(false);
                          }
                        }}
                      >
                        <Ionicons name="checkmark" size={18} color="#fff" />
                      </Pressable>
                    </View>
                  )}
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

      <Modal visible={showImportExport} transparent animationType="slide" onRequestClose={() => setShowImportExport(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.modalDismiss} onPress={() => setShowImportExport(false)} />
          <View style={[styles.importExportSheet, { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 16) }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Import / Export Leads</Text>
            <Text style={styles.importExportDesc}>Import leads from Excel or export your current leads</Text>

            <Pressable
              style={({ pressed }) => [styles.importExportBtn, pressed && { opacity: 0.85 }]}
              onPress={handleImportExcel}
              disabled={importing}
            >
              <View style={[styles.importExportIconBg, { backgroundColor: Colors.successLight }]}>
                {importing ? (
                  <ActivityIndicator size="small" color={Colors.success} />
                ) : (
                  <Ionicons name="cloud-upload-outline" size={22} color={Colors.success} />
                )}
              </View>
              <View style={styles.importExportTextCol}>
                <Text style={styles.importExportBtnTitle}>{importing ? 'Importing...' : 'Import from Excel'}</Text>
                <Text style={styles.importExportBtnSub}>Upload .xlsx, .xls, or .csv file</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.importExportBtn, pressed && { opacity: 0.85 }]}
              onPress={handleExportExcel}
              disabled={exporting || leads.length === 0}
            >
              <View style={[styles.importExportIconBg, { backgroundColor: Colors.primaryLight }]}>
                {exporting ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <Ionicons name="cloud-download-outline" size={22} color={Colors.primary} />
                )}
              </View>
              <View style={styles.importExportTextCol}>
                <Text style={styles.importExportBtnTitle}>{exporting ? 'Exporting...' : 'Export to Excel'}</Text>
                <Text style={styles.importExportBtnSub}>{leads.length} leads will be exported</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.importExportBtn, pressed && { opacity: 0.85 }]}
              onPress={handleDownloadTemplate}
            >
              <View style={[styles.importExportIconBg, { backgroundColor: Colors.warningLight }]}>
                <Ionicons name="document-outline" size={22} color={Colors.warning} />
              </View>
              <View style={styles.importExportTextCol}>
                <Text style={styles.importExportBtnTitle}>Download Sample Template</Text>
                <Text style={styles.importExportBtnSub}>Excel template with sample data</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
            </Pressable>

            <View style={styles.importFormatInfo}>
              <Ionicons name="information-circle-outline" size={16} color={Colors.textTertiary} />
              <Text style={styles.importFormatText}>
                Import file should have columns: Name, Mobile, Type, Source, Address
              </Text>
            </View>
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
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconActionBtn: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  importExportSheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  importExportDesc: { fontSize: 13, color: Colors.textSecondary, fontFamily: 'Inter_400Regular', marginBottom: 20, marginTop: 4 },
  importExportBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.surfaceAlt, borderRadius: 14, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  importExportIconBg: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  importExportTextCol: { flex: 1 },
  importExportBtnTitle: { fontSize: 15, fontWeight: '600' as const, color: Colors.text, fontFamily: 'Inter_600SemiBold' },
  importExportBtnSub: { fontSize: 12, color: Colors.textTertiary, fontFamily: 'Inter_400Regular', marginTop: 2 },
  importFormatInfo: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 10,
    backgroundColor: Colors.surfaceAlt, borderRadius: 10, padding: 12,
  },
  importFormatText: { flex: 1, fontSize: 12, color: Colors.textTertiary, fontFamily: 'Inter_400Regular', lineHeight: 18 },
});
