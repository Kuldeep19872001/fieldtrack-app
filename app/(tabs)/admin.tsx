import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, Platform, RefreshControl, Alert, Modal, TextInput, FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import { useAuth } from '@/lib/auth-context';
import {
  adminGetAllProfiles, adminDeleteUser, adminGetAllLeads, adminDeleteLead,
  adminGetPendingLeaves, adminApproveLeave, adminRejectLeave,
  getLeaveApprovers, addLeaveApprover, updateLeaveApprover, deleteLeaveApprover,
  AdminProfile, AdminLead, PendingLeave, LeaveApprover,
} from '@/lib/admin-storage';

type AdminSection = 'approvers' | 'leaves' | 'users' | 'leads';

const LEAVE_LABELS: Record<string, string> = {
  CL: 'Casual Leave', PL: 'Privilege Leave', SL: 'Sick Leave',
  RH: 'Restricted Holiday', LWP: 'Leave Without Pay',
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const { user, isAdmin } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [activeSection, setActiveSection] = useState<AdminSection>('approvers');

  const [approvers, setApprovers] = useState<LeaveApprover[]>([]);
  const [pendingLeaves, setPendingLeaves] = useState<PendingLeave[]>([]);
  const [allUsers, setAllUsers] = useState<AdminProfile[]>([]);
  const [allLeads, setAllLeads] = useState<AdminLead[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAddApprover, setShowAddApprover] = useState(false);
  const [approverEmail, setApproverEmail] = useState('');
  const [approverName, setApproverName] = useState('');
  const [editingApprover, setEditingApprover] = useState<LeaveApprover | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = useCallback(async () => {
    try {
      const approversData = await getLeaveApprovers();
      setApprovers(approversData);

      if (activeSection === 'leaves') {
        const leaves = await adminGetPendingLeaves();
        setPendingLeaves(leaves);
      } else if (activeSection === 'users') {
        const users = await adminGetAllProfiles();
        setAllUsers(users);
      } else if (activeSection === 'leads') {
        const leads = await adminGetAllLeads();
        setAllLeads(leads);
      }
    } catch (e: any) {
      console.error('Admin load error:', e.message);
    } finally {
      setLoading(false);
    }
  }, [activeSection]);

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleSaveApprover = async () => {
    if (!approverEmail.trim()) {
      Alert.alert('Error', 'Email is required.');
      return;
    }
    try {
      if (editingApprover) {
        await updateLeaveApprover(editingApprover.id, approverEmail.trim(), approverName.trim());
        Alert.alert('Success', 'Approver updated.');
      } else {
        await addLeaveApprover(approverEmail.trim(), approverName.trim());
        Alert.alert('Success', 'Approver added.');
      }
      setShowAddApprover(false);
      setApproverEmail('');
      setApproverName('');
      setEditingApprover(null);
      await loadData();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleDeleteApprover = (approver: LeaveApprover) => {
    Alert.alert('Delete Approver', `Remove ${approver.email} as leave approver?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await deleteLeaveApprover(approver.id);
            await loadData();
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        },
      },
    ]);
  };

  const handleApproveLeave = (leave: PendingLeave) => {
    Alert.alert(
      'Approve Leave',
      `Approve ${leave.leaveType} leave for ${leave.userName || leave.userEmail}?\n${formatDate(leave.fromDate)} - ${formatDate(leave.toDate)} (${leave.days} days)`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve', onPress: async () => {
            try {
              await adminApproveLeave(leave.id, user?.username || '');
              Alert.alert('Success', 'Leave approved.');
              await loadData();
            } catch (e: any) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ]
    );
  };

  const handleRejectLeave = (leave: PendingLeave) => {
    Alert.alert(
      'Reject Leave',
      `Reject ${leave.leaveType} leave for ${leave.userName || leave.userEmail}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject', style: 'destructive', onPress: async () => {
            try {
              await adminRejectLeave(leave.id, user?.username || '');
              Alert.alert('Success', 'Leave rejected.');
              await loadData();
            } catch (e: any) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ]
    );
  };

  const handleDeleteUser = (profile: AdminProfile) => {
    Alert.alert(
      'Delete User',
      `Are you sure you want to delete "${profile.name || profile.email}"?\n\nThis will permanently remove all their data including leads, trips, visits, and leave records.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete User', style: 'destructive', onPress: async () => {
            try {
              await adminDeleteUser(profile.id);
              Alert.alert('Success', 'User deleted.');
              await loadData();
            } catch (e: any) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ]
    );
  };

  const handleDeleteLead = (lead: AdminLead) => {
    Alert.alert(
      'Delete Lead',
      `Delete lead "${lead.name}"?\nOwner: ${lead.userName || lead.userEmail}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            try {
              await adminDeleteLead(lead.id);
              Alert.alert('Success', 'Lead deleted.');
              await loadData();
            } catch (e: any) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ]
    );
  };

  if (!isAdmin) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Ionicons name="lock-closed" size={48} color={Colors.textTertiary} />
        <Text style={styles.emptyText}>Admin access only</Text>
      </View>
    );
  }

  const webTop = Platform.OS === 'web' ? 67 : 0;

  const filteredLeads = searchQuery
    ? allLeads.filter(l =>
        l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.mobile.includes(searchQuery) ||
        l.userName.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allLeads;

  const filteredUsers = searchQuery
    ? allUsers.filter(u =>
        u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allUsers;

  const sections: { key: AdminSection; label: string; icon: string; count?: number }[] = [
    { key: 'approvers', label: 'Approvers', icon: 'shield-checkmark-outline', count: approvers.length },
    { key: 'leaves', label: 'Leaves', icon: 'calendar-outline', count: pendingLeaves.length },
    { key: 'users', label: 'Users', icon: 'people-outline', count: allUsers.length },
    { key: 'leads', label: 'Leads', icon: 'briefcase-outline', count: allLeads.length },
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + webTop + 16, paddingBottom: 100 + (Platform.OS === 'web' ? 34 : 0) }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Admin Panel</Text>
            <Text style={styles.subtitle}>{user?.username}</Text>
          </View>
          <View style={styles.adminBadge}>
            <Ionicons name="shield-checkmark" size={14} color="#fff" />
            <Text style={styles.adminBadgeText}>Manager</Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll} contentContainerStyle={{ gap: 8 }}>
          {sections.map(s => (
            <Pressable
              key={s.key}
              style={[styles.tabChip, activeSection === s.key && styles.tabChipActive]}
              onPress={() => { setActiveSection(s.key); setSearchQuery(''); }}
            >
              <Ionicons name={s.icon as any} size={16} color={activeSection === s.key ? '#fff' : Colors.textSecondary} />
              <Text style={[styles.tabChipText, activeSection === s.key && styles.tabChipTextActive]}>{s.label}</Text>
              {s.count !== undefined && s.count > 0 && (
                <View style={[styles.countBadge, activeSection === s.key && styles.countBadgeActive]}>
                  <Text style={[styles.countText, activeSection === s.key && { color: Colors.primary }]}>{s.count}</Text>
                </View>
              )}
            </Pressable>
          ))}
        </ScrollView>

        {(activeSection === 'users' || activeSection === 'leads') && (
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={18} color={Colors.textTertiary} />
            <TextInput
              style={styles.searchInput}
              placeholder={activeSection === 'users' ? 'Search users...' : 'Search leads...'}
              placeholderTextColor={Colors.textTertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={Colors.textTertiary} />
              </Pressable>
            )}
          </View>
        )}

        {activeSection === 'approvers' && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Leave Approvers</Text>
              <Pressable
                style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.8 }]}
                onPress={() => {
                  setEditingApprover(null);
                  setApproverEmail('');
                  setApproverName('');
                  setShowAddApprover(true);
                }}
              >
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.addBtnText}>Add</Text>
              </Pressable>
            </View>

            {approvers.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="person-add-outline" size={32} color={Colors.textTertiary} />
                <Text style={styles.emptyText}>No approvers configured</Text>
                <Text style={styles.emptySubtext}>Add an approver email to enable leave approval</Text>
              </View>
            ) : (
              approvers.map(a => (
                <View key={a.id} style={styles.card}>
                  <View style={styles.cardRow}>
                    <View style={styles.approverIcon}>
                      <Ionicons name="mail" size={18} color={Colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardPrimary}>{a.email}</Text>
                      {a.name ? <Text style={styles.cardSecondary}>{a.name}</Text> : null}
                    </View>
                    <Pressable
                      style={styles.iconBtn}
                      onPress={() => {
                        setEditingApprover(a);
                        setApproverEmail(a.email);
                        setApproverName(a.name);
                        setShowAddApprover(true);
                      }}
                      hitSlop={8}
                    >
                      <Ionicons name="create-outline" size={18} color={Colors.primary} />
                    </Pressable>
                    <Pressable style={styles.iconBtn} onPress={() => handleDeleteApprover(a)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </>
        )}

        {activeSection === 'leaves' && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Pending Leave Requests</Text>
            </View>

            {loading ? (
              <Text style={styles.loadingText}>Loading...</Text>
            ) : pendingLeaves.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="checkmark-circle-outline" size={32} color={Colors.success} />
                <Text style={styles.emptyText}>No pending requests</Text>
                <Text style={styles.emptySubtext}>All leave requests have been processed</Text>
              </View>
            ) : (
              pendingLeaves.map(leave => (
                <View key={leave.id} style={styles.card}>
                  <View style={styles.leaveHeader}>
                    <View style={styles.leaveUser}>
                      <View style={styles.userAvatar}>
                        <Text style={styles.userAvatarText}>
                          {(leave.userName || leave.userEmail).charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View>
                        <Text style={styles.cardPrimary}>{leave.userName || 'Unknown'}</Text>
                        <Text style={styles.cardSecondary}>{leave.userEmail}</Text>
                      </View>
                    </View>
                    <View style={styles.leaveTypeBadge}>
                      <Text style={styles.leaveTypeText}>{leave.leaveType}</Text>
                    </View>
                  </View>

                  <View style={styles.leaveDatesRow}>
                    <Ionicons name="calendar-outline" size={14} color={Colors.textTertiary} />
                    <Text style={styles.leaveDatesText}>
                      {formatDate(leave.fromDate)} - {formatDate(leave.toDate)}
                    </Text>
                    <Text style={styles.leaveDaysText}>{leave.days} day{leave.days > 1 ? 's' : ''}</Text>
                  </View>

                  {leave.reason ? <Text style={styles.leaveReason}>{leave.reason}</Text> : null}

                  <View style={styles.leaveActions}>
                    <Pressable
                      style={({ pressed }) => [styles.rejectBtn, pressed && { opacity: 0.8 }]}
                      onPress={() => handleRejectLeave(leave)}
                    >
                      <Ionicons name="close" size={16} color={Colors.danger} />
                      <Text style={styles.rejectBtnText}>Reject</Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [styles.approveBtn, pressed && { opacity: 0.8 }]}
                      onPress={() => handleApproveLeave(leave)}
                    >
                      <Ionicons name="checkmark" size={16} color="#fff" />
                      <Text style={styles.approveBtnText}>Approve</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </>
        )}

        {activeSection === 'users' && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>All Users ({filteredUsers.length})</Text>
            </View>

            {loading ? (
              <Text style={styles.loadingText}>Loading...</Text>
            ) : filteredUsers.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="people-outline" size={32} color={Colors.textTertiary} />
                <Text style={styles.emptyText}>No users found</Text>
              </View>
            ) : (
              filteredUsers.map(profile => (
                <View key={profile.id} style={styles.card}>
                  <View style={styles.cardRow}>
                    <View style={[styles.userAvatar, { marginRight: 12 }]}>
                      <Text style={styles.userAvatarText}>
                        {(profile.name || profile.email).charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardPrimary}>{profile.name || 'No Name'}</Text>
                      <Text style={styles.cardSecondary}>{profile.email}</Text>
                      <View style={[styles.roleBadge, profile.role === 'manager' && styles.roleBadgeManager]}>
                        <Text style={[styles.roleText, profile.role === 'manager' && styles.roleTextManager]}>
                          {profile.role || 'Field Executive'}
                        </Text>
                      </View>
                    </View>
                    {profile.role !== 'manager' && (
                      <Pressable style={styles.iconBtn} onPress={() => handleDeleteUser(profile)} hitSlop={8}>
                        <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                      </Pressable>
                    )}
                  </View>
                </View>
              ))
            )}
          </>
        )}

        {activeSection === 'leads' && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>All Leads ({filteredLeads.length})</Text>
            </View>

            {loading ? (
              <Text style={styles.loadingText}>Loading...</Text>
            ) : filteredLeads.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="briefcase-outline" size={32} color={Colors.textTertiary} />
                <Text style={styles.emptyText}>No leads found</Text>
              </View>
            ) : (
              filteredLeads.slice(0, 100).map(lead => (
                <View key={lead.id} style={styles.card}>
                  <View style={styles.cardRow}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <Text style={styles.cardPrimary}>{lead.name}</Text>
                        <View style={[styles.stageBadge, {
                          backgroundColor: lead.stage === 'New' ? Colors.infoLight
                            : lead.stage === 'Converted' ? Colors.successLight : Colors.warningLight
                        }]}>
                          <Text style={[styles.stageText, {
                            color: lead.stage === 'New' ? Colors.info
                              : lead.stage === 'Converted' ? Colors.success : Colors.warning
                          }]}>{lead.stage}</Text>
                        </View>
                      </View>
                      {lead.mobile ? <Text style={styles.cardSecondary}>{lead.mobile}</Text> : null}
                      <Text style={styles.cardTertiary}>
                        {lead.leadType ? `${lead.leadType} · ` : ''}{lead.userName || lead.userEmail}
                      </Text>
                    </View>
                    <Pressable style={styles.iconBtn} onPress={() => handleDeleteLead(lead)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>

      <Modal visible={showAddApprover} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingApprover ? 'Edit Approver' : 'Add Approver'}</Text>
              <Pressable onPress={() => { setShowAddApprover(false); setEditingApprover(null); }} hitSlop={12}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>

            <Text style={styles.inputLabel}>Email Address *</Text>
            <TextInput
              style={styles.input}
              value={approverEmail}
              onChangeText={setApproverEmail}
              placeholder="approver@company.com"
              placeholderTextColor={Colors.textTertiary}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={styles.inputLabel}>Name</Text>
            <TextInput
              style={styles.input}
              value={approverName}
              onChangeText={setApproverName}
              placeholder="Approver name"
              placeholderTextColor={Colors.textTertiary}
            />

            <Pressable
              style={({ pressed }) => [styles.submitButton, pressed && { opacity: 0.85 }]}
              onPress={handleSaveApprover}
            >
              <Text style={styles.submitButtonText}>{editingApprover ? 'Update Approver' : 'Add Approver'}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '700', color: Colors.text, fontFamily: 'Inter_700Bold' },
  subtitle: { fontSize: 13, color: Colors.textTertiary, fontFamily: 'Inter_400Regular', marginTop: 2 },
  adminBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.primary, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5,
  },
  adminBadgeText: { fontSize: 12, fontWeight: '600', color: '#fff', fontFamily: 'Inter_600SemiBold' },

  tabScroll: { flexGrow: 0, marginBottom: 16 },
  tabChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderLight,
  },
  tabChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabChipText: { fontSize: 13, fontWeight: '500', color: Colors.textSecondary, fontFamily: 'Inter_500Medium' },
  tabChipTextActive: { color: '#fff' },
  countBadge: {
    backgroundColor: Colors.borderLight, borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 1, minWidth: 20, alignItems: 'center',
  },
  countBadgeActive: { backgroundColor: 'rgba(255,255,255,0.3)' },
  countText: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary, fontFamily: 'Inter_600SemiBold' },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: Colors.borderLight, marginBottom: 16,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.text, fontFamily: 'Inter_400Regular', padding: 0 },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: Colors.text, fontFamily: 'Inter_600SemiBold' },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6,
  },
  addBtnText: { fontSize: 13, fontWeight: '600', color: '#fff', fontFamily: 'Inter_600SemiBold' },

  card: {
    backgroundColor: Colors.surface, borderRadius: 14, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: Colors.borderLight,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardPrimary: { fontSize: 15, fontWeight: '600', color: Colors.text, fontFamily: 'Inter_600SemiBold' },
  cardSecondary: { fontSize: 13, color: Colors.textSecondary, fontFamily: 'Inter_400Regular', marginTop: 1 },
  cardTertiary: { fontSize: 12, color: Colors.textTertiary, fontFamily: 'Inter_400Regular', marginTop: 2 },

  approverIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.primary + '15', alignItems: 'center', justifyContent: 'center', marginRight: 4,
  },

  userAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.primary + '20', alignItems: 'center', justifyContent: 'center',
  },
  userAvatarText: { fontSize: 15, fontWeight: '700', color: Colors.primary, fontFamily: 'Inter_700Bold' },

  roleBadge: {
    alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 8, backgroundColor: Colors.borderLight, marginTop: 4,
  },
  roleBadgeManager: { backgroundColor: Colors.primary + '20' },
  roleText: { fontSize: 11, fontWeight: '500', color: Colors.textSecondary, fontFamily: 'Inter_500Medium' },
  roleTextManager: { color: Colors.primary },

  iconBtn: { padding: 6 },

  leaveHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  leaveUser: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  leaveTypeBadge: {
    backgroundColor: Colors.primary + '20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
  },
  leaveTypeText: { fontSize: 12, fontWeight: '600', color: Colors.primary, fontFamily: 'Inter_600SemiBold' },
  leaveDatesRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  leaveDatesText: { fontSize: 13, color: Colors.text, fontFamily: 'Inter_500Medium', flex: 1 },
  leaveDaysText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, fontFamily: 'Inter_600SemiBold' },
  leaveReason: { fontSize: 12, color: Colors.textSecondary, fontFamily: 'Inter_400Regular', marginBottom: 10 },
  leaveActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  rejectBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
    backgroundColor: Colors.danger + '15', borderWidth: 1, borderColor: Colors.danger + '30',
  },
  rejectBtnText: { fontSize: 13, fontWeight: '600', color: Colors.danger, fontFamily: 'Inter_600SemiBold' },
  approveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
    backgroundColor: Colors.success,
  },
  approveBtnText: { fontSize: 13, fontWeight: '600', color: '#fff', fontFamily: 'Inter_600SemiBold' },

  stageBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  stageText: { fontSize: 11, fontWeight: '600', fontFamily: 'Inter_600SemiBold' },

  emptyCard: {
    backgroundColor: Colors.surface, borderRadius: 14, padding: 32,
    alignItems: 'center', borderWidth: 1, borderColor: Colors.borderLight, marginBottom: 16,
  },
  emptyText: { fontSize: 14, color: Colors.textTertiary, fontFamily: 'Inter_500Medium', marginTop: 12, textAlign: 'center' },
  emptySubtext: { fontSize: 12, color: Colors.textTertiary, fontFamily: 'Inter_400Regular', marginTop: 4, textAlign: 'center' },
  loadingText: { fontSize: 13, color: Colors.textTertiary, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingVertical: 16 },

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
  submitButton: {
    backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14,
    alignItems: 'center', marginTop: 20,
  },
  submitButtonText: { fontSize: 15, fontWeight: '600', color: '#fff', fontFamily: 'Inter_600SemiBold' },
});
