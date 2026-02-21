import { supabase, getCachedUserId } from './supabase';

export interface UserShift {
  userId: string;
  shiftStart: string;
  shiftEnd: string;
}

export interface LeaveBalance {
  leaveType: string;
  year: number;
  totalDays: number;
  usedDays: number;
  remaining: number;
}

export interface LeaveRequest {
  id: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  days: number;
}

export interface AttendanceRecord {
  date: string;
  firstCheckin: string | null;
  lastCheckout: string | null;
  workingMinutes: number;
  status: 'Present' | 'Half Day' | 'Absent' | 'Leave';
  isLate: boolean;
}

export interface MonthlySummary {
  presentDays: number;
  halfDays: number;
  leaveDays: number;
  absentDays: number;
  lateDays: number;
  totalWorkingDays: number;
}

function getUserId(): string {
  const uid = getCachedUserId();
  if (!uid) throw new Error('Not authenticated');
  return uid;
}

function countDays(from: string, to: string): number {
  const start = new Date(from);
  const end = new Date(to);
  let count = 0;
  const d = new Date(start);
  while (d <= end) {
    const day = d.getDay();
    if (day !== 0) count++;
    d.setDate(d.getDate() + 1);
  }
  return count || 1;
}

export async function getUserShift(): Promise<UserShift | null> {
  const userId = getUserId();
  const { data, error } = await supabase
    .from('user_shifts')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;
  return {
    userId: data.user_id,
    shiftStart: data.shift_start,
    shiftEnd: data.shift_end,
  };
}

export async function ensureUserShift(): Promise<UserShift> {
  const existing = await getUserShift();
  if (existing) return existing;

  const userId = getUserId();
  const { data, error } = await supabase
    .from('user_shifts')
    .upsert({
      user_id: userId,
      shift_start: '09:00:00',
      shift_end: '18:00:00',
    }, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) throw new Error('Failed to create default shift: ' + error.message);
  return {
    userId: data.user_id,
    shiftStart: data.shift_start,
    shiftEnd: data.shift_end,
  };
}

export async function updateUserShift(shiftStart: string, shiftEnd: string): Promise<void> {
  const userId = getUserId();
  const { error } = await supabase
    .from('user_shifts')
    .upsert({
      user_id: userId,
      shift_start: shiftStart,
      shift_end: shiftEnd,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

  if (error) throw new Error('Failed to update shift: ' + error.message);
}

export async function getLeaveBalances(year?: number): Promise<LeaveBalance[]> {
  const userId = getUserId();
  const currentYear = year || new Date().getFullYear();

  const { data, error } = await supabase
    .from('leave_balances')
    .select('*')
    .eq('user_id', userId)
    .eq('year', currentYear);

  if (error) throw new Error('Failed to fetch leave balances: ' + error.message);

  if (!data || data.length === 0) {
    await ensureLeaveBalances(currentYear);
    const { data: retryData } = await supabase
      .from('leave_balances')
      .select('*')
      .eq('user_id', userId)
      .eq('year', currentYear);
    if (!retryData) return [];
    return retryData.map(mapBalance);
  }

  return data.map(mapBalance);
}

function mapBalance(row: any): LeaveBalance {
  return {
    leaveType: row.leave_type,
    year: row.year,
    totalDays: Number(row.total_days),
    usedDays: Number(row.used_days),
    remaining: Number(row.total_days) - Number(row.used_days),
  };
}

async function ensureLeaveBalances(year: number): Promise<void> {
  const userId = getUserId();
  const defaults = [
    { leave_type: 'CL', total_days: 12 },
    { leave_type: 'PL', total_days: 15 },
    { leave_type: 'SL', total_days: 12 },
    { leave_type: 'RH', total_days: 2 },
    { leave_type: 'LWP', total_days: 0 },
  ];

  for (const d of defaults) {
    await supabase
      .from('leave_balances')
      .upsert({
        user_id: userId,
        leave_type: d.leave_type,
        year: year,
        total_days: d.total_days,
        used_days: 0,
      }, { onConflict: 'user_id,leave_type,year' })
      .select();
  }
}

export async function getLeaveRequests(): Promise<LeaveRequest[]> {
  const userId = getUserId();
  const { data, error } = await supabase
    .from('leave_requests')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error('Failed to fetch leave requests: ' + error.message);
  return (data || []).map(mapLeaveRequest);
}

function mapLeaveRequest(row: any): LeaveRequest {
  return {
    id: row.id,
    leaveType: row.leave_type,
    fromDate: row.from_date,
    toDate: row.to_date,
    reason: row.reason,
    status: row.status,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
    days: countDays(row.from_date, row.to_date),
  };
}

export async function applyLeave(
  leaveType: string,
  fromDate: string,
  toDate: string,
  reason: string
): Promise<string> {
  const userId = getUserId();
  const days = countDays(fromDate, toDate);

  const { data: overlapping } = await supabase
    .from('leave_requests')
    .select('id')
    .eq('user_id', userId)
    .in('status', ['Pending', 'Approved'])
    .lte('from_date', toDate)
    .gte('to_date', fromDate);

  if (overlapping && overlapping.length > 0) {
    throw new Error('You already have a leave request overlapping with these dates.');
  }

  if (leaveType !== 'LWP') {
    const balances = await getLeaveBalances();
    const bal = balances.find(b => b.leaveType === leaveType);
    if (bal && bal.remaining < days) {
      throw new Error(`Insufficient ${leaveType} balance. Available: ${bal.remaining} days, Requested: ${days} days.`);
    }
  }

  const { data, error } = await supabase
    .from('leave_requests')
    .insert({
      user_id: userId,
      leave_type: leaveType,
      from_date: fromDate,
      to_date: toDate,
      reason: reason,
      status: 'Pending',
    })
    .select('id')
    .single();

  if (error) throw new Error('Failed to submit leave request: ' + error.message);
  return data?.id || '';
}

export async function cancelLeaveRequest(requestId: string): Promise<void> {
  const userId = getUserId();

  const { data: req } = await supabase
    .from('leave_requests')
    .select('*')
    .eq('id', requestId)
    .eq('user_id', userId)
    .single();

  if (!req) throw new Error('Leave request not found');

  if (req.status === 'Approved' && req.leave_type !== 'LWP') {
    const days = countDays(req.from_date, req.to_date);
    const year = new Date(req.from_date).getFullYear();

    const { data: bal } = await supabase
      .from('leave_balances')
      .select('*')
      .eq('user_id', userId)
      .eq('leave_type', req.leave_type)
      .eq('year', year)
      .single();

    if (bal) {
      await supabase
        .from('leave_balances')
        .update({ used_days: Math.max(0, Number(bal.used_days) - days) })
        .eq('id', bal.id);
    }
  }

  const { error } = await supabase
    .from('leave_requests')
    .delete()
    .eq('id', requestId)
    .eq('user_id', userId);

  if (error) throw new Error('Failed to cancel leave request: ' + error.message);
}

export async function approveLeaveRequest(requestId: string, approverEmail: string): Promise<void> {
  const { data: req, error: fetchError } = await supabase
    .from('leave_requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (fetchError || !req) throw new Error('Leave request not found');

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

  await supabase
    .from('leave_requests')
    .update({
      status: 'Approved',
      approved_by: approverEmail,
      approved_at: new Date().toISOString(),
    })
    .eq('id', requestId);
}

export async function getTodayAttendance(): Promise<AttendanceRecord> {
  const userId = getUserId();
  const today = new Date().toISOString().split('T')[0];

  const { data: leaves } = await supabase
    .from('leave_requests')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'Approved')
    .lte('from_date', today)
    .gte('to_date', today);

  if (leaves && leaves.length > 0) {
    return {
      date: today,
      firstCheckin: null,
      lastCheckout: null,
      workingMinutes: 0,
      status: 'Leave',
      isLate: false,
    };
  }

  const { data: trips } = await supabase
    .from('trips')
    .select('*')
    .eq('user_id', userId)
    .eq('date', today)
    .order('start_time', { ascending: true });

  if (!trips || trips.length === 0) {
    return {
      date: today,
      firstCheckin: null,
      lastCheckout: null,
      workingMinutes: 0,
      status: 'Absent',
      isLate: false,
    };
  }

  const firstCheckin = trips[0].start_time;
  const lastTrip = trips[trips.length - 1];
  const lastCheckout = lastTrip.end_time || null;

  let workingMinutes = 0;
  if (lastCheckout) {
    workingMinutes = Math.floor(
      (new Date(lastCheckout).getTime() - new Date(firstCheckin).getTime()) / 60000
    );
  } else {
    workingMinutes = Math.floor(
      (Date.now() - new Date(firstCheckin).getTime()) / 60000
    );
  }

  const workingHours = workingMinutes / 60;
  let status: AttendanceRecord['status'] = 'Absent';
  if (workingHours >= 8) status = 'Present';
  else if (workingHours >= 3) status = 'Half Day';

  let isLate = false;
  const shift = await getUserShift();
  if (shift) {
    const checkinDate = new Date(firstCheckin);
    const [h, m] = shift.shiftStart.split(':').map(Number);
    const shiftStartDate = new Date(checkinDate);
    shiftStartDate.setHours(h, m, 0, 0);
    isLate = checkinDate > shiftStartDate;
  }

  return {
    date: today,
    firstCheckin,
    lastCheckout,
    workingMinutes,
    status,
    isLate,
  };
}

export async function getMonthlyAttendance(year: number, month: number): Promise<MonthlySummary> {
  const userId = getUserId();

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const today = new Date().toISOString().split('T')[0];
  const effectiveEnd = endDate < today ? endDate : today;

  const { data: trips } = await supabase
    .from('trips')
    .select('date, start_time, end_time')
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', effectiveEnd)
    .order('start_time', { ascending: true });

  const { data: leaves } = await supabase
    .from('leave_requests')
    .select('from_date, to_date')
    .eq('user_id', userId)
    .eq('status', 'Approved')
    .lte('from_date', endDate)
    .gte('to_date', startDate);

  const shift = await getUserShift();

  const leaveDates = new Set<string>();
  if (leaves) {
    for (const lv of leaves) {
      const d = new Date(lv.from_date);
      const end = new Date(lv.to_date);
      while (d <= end) {
        const ds = d.toISOString().split('T')[0];
        if (ds >= startDate && ds <= effectiveEnd) {
          leaveDates.add(ds);
        }
        d.setDate(d.getDate() + 1);
      }
    }
  }

  const tripsByDate: Record<string, { firstCheckin: string; lastCheckout: string | null }> = {};
  if (trips) {
    for (const t of trips) {
      if (!tripsByDate[t.date]) {
        tripsByDate[t.date] = { firstCheckin: t.start_time, lastCheckout: t.end_time };
      } else {
        if (t.end_time) {
          const current = tripsByDate[t.date].lastCheckout;
          if (!current || t.end_time > current) {
            tripsByDate[t.date].lastCheckout = t.end_time;
          }
        }
      }
    }
  }

  let presentDays = 0;
  let halfDays = 0;
  let absentDays = 0;
  let lateDays = 0;
  let totalWorkingDays = 0;

  const d = new Date(startDate);
  const endD = new Date(effectiveEnd);
  while (d <= endD) {
    const ds = d.toISOString().split('T')[0];
    const dayOfWeek = d.getDay();

    if (dayOfWeek !== 0) {
      totalWorkingDays++;

      if (leaveDates.has(ds)) {
        // counted as leave
      } else if (tripsByDate[ds]) {
        const rec = tripsByDate[ds];
        let mins = 0;
        if (rec.lastCheckout) {
          mins = Math.floor(
            (new Date(rec.lastCheckout).getTime() - new Date(rec.firstCheckin).getTime()) / 60000
          );
        } else if (ds === today) {
          mins = Math.floor((Date.now() - new Date(rec.firstCheckin).getTime()) / 60000);
        } else {
          const midnight = new Date(rec.firstCheckin);
          midnight.setHours(23, 59, 59, 999);
          mins = Math.floor((midnight.getTime() - new Date(rec.firstCheckin).getTime()) / 60000);
        }

        const hours = mins / 60;
        if (hours >= 8) presentDays++;
        else if (hours >= 3) halfDays++;
        else absentDays++;

        if (shift) {
          const checkin = new Date(rec.firstCheckin);
          const [h, m] = shift.shiftStart.split(':').map(Number);
          const shiftStart = new Date(checkin);
          shiftStart.setHours(h, m, 0, 0);
          if (checkin > shiftStart) lateDays++;
        }
      } else {
        absentDays++;
      }
    }

    d.setDate(d.getDate() + 1);
  }

  return {
    presentDays,
    halfDays,
    leaveDays: leaveDates.size,
    absentDays,
    lateDays,
    totalWorkingDays,
  };
}

export async function getLeaveApprovers(): Promise<{ id: string; email: string; name: string }[]> {
  const { data, error } = await supabase
    .from('leave_approvers')
    .select('*')
    .eq('is_active', true);

  if (error) return [];
  return (data || []).map(a => ({ id: a.id, email: a.email, name: a.name }));
}
