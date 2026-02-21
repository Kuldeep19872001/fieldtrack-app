import { supabase } from './supabase';

export interface AdminProfile {
  id: string;
  name: string;
  role: string;
  email: string;
}

export interface AdminLead {
  id: string;
  userId: string;
  name: string;
  mobile: string;
  leadType: string;
  source: string;
  stage: string;
  address: string;
  createdAt: string;
  userName: string;
  userEmail: string;
}

export interface PendingLeave {
  id: string;
  userId: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
  reason: string;
  status: string;
  createdAt: string;
  userName: string;
  userEmail: string;
  days: number;
}

export interface LeaveApprover {
  id: string;
  email: string;
  name: string;
}

function countDays(from: string, to: string): number {
  const start = new Date(from);
  const end = new Date(to);
  let count = 0;
  const d = new Date(start);
  while (d <= end) {
    if (d.getDay() !== 0) count++;
    d.setDate(d.getDate() + 1);
  }
  return count || 1;
}

export async function adminGetAllProfiles(): Promise<AdminProfile[]> {
  const { data, error } = await supabase.rpc('admin_get_all_profiles');
  if (!error && data) {
    return (data || []).map((r: any) => ({
      id: r.id,
      name: r.name || '',
      role: r.role || 'Field Executive',
      email: r.email || '',
    }));
  }

  console.warn('RPC admin_get_all_profiles failed, using direct query:', error?.message);
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (profileError) {
    throw new Error('Failed to load users. Please run admin-migration.sql in Supabase SQL Editor.');
  }

  return (profiles || []).map((r: any) => ({
    id: r.id,
    name: r.name || '',
    role: r.role || 'Field Executive',
    email: r.email || '',
  }));
}

export async function adminDeleteUser(userId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_user', { target_user_id: userId });
  if (error) throw new Error('Failed to delete user: ' + error.message);
}

export async function adminDeleteLead(leadId: string): Promise<void> {
  const { data, error } = await supabase.rpc('admin_delete_lead', { target_lead_id: leadId });
  if (!error) return;

  console.warn('RPC admin_delete_lead failed, trying direct delete:', error.message);
  const { error: directError } = await supabase
    .from('leads')
    .delete()
    .eq('id', leadId);
  if (directError) throw new Error('Failed to delete lead: ' + directError.message);
}

export async function adminGetAllLeads(): Promise<AdminLead[]> {
  const { data, error } = await supabase.rpc('admin_get_all_leads');
  if (!error && data) {
    return (data || []).map((r: any) => ({
      id: r.id,
      userId: r.user_id,
      name: r.name || '',
      mobile: r.mobile || '',
      leadType: r.lead_type || '',
      source: r.source || '',
      stage: r.stage || 'New',
      address: r.address || '',
      createdAt: r.created_at,
      userName: r.user_name || '',
      userEmail: r.user_email || '',
    }));
  }

  console.warn('RPC admin_get_all_leads failed, using direct query:', error?.message);
  const { data: leads, error: leadError } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false });

  if (leadError) {
    throw new Error('Failed to load leads. Please run admin-migration.sql in Supabase SQL Editor.');
  }

  return (leads || []).map((r: any) => ({
    id: r.id,
    userId: r.user_id,
    name: r.name || '',
    mobile: r.mobile || '',
    leadType: r.lead_type || '',
    source: r.source || '',
    stage: r.stage || 'New',
    address: r.address || '',
    createdAt: r.created_at,
    userName: '',
    userEmail: '',
  }));
}

export async function adminGetPendingLeaves(): Promise<PendingLeave[]> {
  const { data, error } = await supabase.rpc('admin_get_pending_leaves');
  if (!error && data) {
    return (data || []).map((r: any) => ({
      id: r.id,
      userId: r.user_id,
      leaveType: r.leave_type,
      fromDate: r.from_date,
      toDate: r.to_date,
      reason: r.reason || '',
      status: r.status,
      createdAt: r.created_at,
      userName: r.user_name || '',
      userEmail: r.user_email || '',
      days: countDays(r.from_date, r.to_date),
    }));
  }

  console.warn('RPC admin_get_pending_leaves failed, using direct query:', error?.message);
  const { data: leaves, error: leaveError } = await supabase
    .from('leave_requests')
    .select('*, profiles:user_id(name)')
    .eq('status', 'Pending')
    .order('created_at', { ascending: true });

  if (leaveError) {
    throw new Error('Failed to load pending leaves. Please run admin-migration.sql in Supabase SQL Editor.');
  }

  return (leaves || []).map((r: any) => ({
    id: r.id,
    userId: r.user_id,
    leaveType: r.leave_type,
    fromDate: r.from_date,
    toDate: r.to_date,
    reason: r.reason || '',
    status: r.status,
    createdAt: r.created_at,
    userName: r.profiles?.name || '',
    userEmail: '',
    days: countDays(r.from_date, r.to_date),
  }));
}

export async function adminApproveLeave(requestId: string, approverEmail: string): Promise<void> {
  const { error } = await supabase.rpc('admin_approve_leave', {
    request_id: requestId,
    approver_email: approverEmail,
  });
  if (!error) return;

  console.warn('RPC admin_approve_leave failed, trying direct update:', error.message);
  const { data: req } = await supabase
    .from('leave_requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (!req) throw new Error('Leave request not found');

  const days = countDays(req.from_date, req.to_date);
  const year = new Date(req.from_date).getFullYear();

  if (req.leave_type !== 'LWP') {
    const { data: bal } = await supabase
      .from('leave_balances')
      .select('*')
      .eq('user_id', req.user_id)
      .eq('leave_type', req.leave_type)
      .eq('year', year)
      .single();

    if (bal) {
      const newUsed = Number(bal.used_days) + days;
      if (newUsed > Number(bal.total_days)) {
        throw new Error(`Insufficient ${req.leave_type} balance for approval.`);
      }
      await supabase
        .from('leave_balances')
        .update({ used_days: newUsed })
        .eq('id', bal.id);
    }
  }

  const { error: updateError } = await supabase
    .from('leave_requests')
    .update({
      status: 'Approved',
      approved_by: approverEmail,
      approved_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  if (updateError) throw new Error('Failed to approve leave: ' + updateError.message);
}

export async function adminRejectLeave(requestId: string, approverEmail: string): Promise<void> {
  const { error } = await supabase.rpc('admin_reject_leave', {
    request_id: requestId,
    approver_email: approverEmail,
  });
  if (!error) return;

  console.warn('RPC admin_reject_leave failed, trying direct update:', error.message);
  const { error: updateError } = await supabase
    .from('leave_requests')
    .update({
      status: 'Rejected',
      approved_by: approverEmail,
      approved_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('status', 'Pending');

  if (updateError) throw new Error('Failed to reject leave: ' + updateError.message);
}

export async function getLeaveApprovers(): Promise<LeaveApprover[]> {
  const { data, error } = await supabase
    .from('leave_approvers')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) return [];
  return (data || []).map((a: any) => ({ id: a.id, email: a.email, name: a.name || '' }));
}

export async function addLeaveApprover(email: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('leave_approvers')
    .insert({ email, name, is_active: true });
  if (error) throw new Error('Failed to add approver: ' + error.message);
}

export async function updateLeaveApprover(id: string, email: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('leave_approvers')
    .update({ email, name })
    .eq('id', id);
  if (error) throw new Error('Failed to update approver: ' + error.message);
}

export async function deleteLeaveApprover(id: string): Promise<void> {
  const { error } = await supabase
    .from('leave_approvers')
    .delete()
    .eq('id', id);
  if (error) throw new Error('Failed to delete approver: ' + error.message);
}
