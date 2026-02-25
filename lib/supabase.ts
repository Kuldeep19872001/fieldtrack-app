import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, AppStateStatus } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('MISSING SUPABASE CONFIG: EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY not set');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

let _cachedUserId: string | null = null;
let _lastSessionCheck: number = 0;
const SESSION_CHECK_INTERVAL = 4 * 60 * 1000;

export function setCachedUserId(id: string | null) {
  _cachedUserId = id;
  if (!id) {
    _lastSessionCheck = 0;
  }
}

export function getCachedUserId(): string | null {
  return _cachedUserId;
}

export async function ensureValidSession(): Promise<string | null> {
  const now = Date.now();
  if (_cachedUserId && (now - _lastSessionCheck) < SESSION_CHECK_INTERVAL) {
    return _cachedUserId;
  }

  try {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (session?.user) {
      const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
      const timeUntilExpiry = expiresAt - now;

      if (timeUntilExpiry < 5 * 60 * 1000) {
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshData?.session?.user) {
          _cachedUserId = refreshData.session.user.id;
          _lastSessionCheck = now;
          return _cachedUserId;
        }
        if (refreshError) {
          console.warn('Session refresh failed:', refreshError.message);
        }
      }

      _cachedUserId = session.user.id;
      _lastSessionCheck = now;
      return _cachedUserId;
    }

    if (error) {
      console.warn('getSession error, attempting refresh:', error.message);
    }

    const { data: refreshData } = await supabase.auth.refreshSession();
    if (refreshData?.session?.user) {
      _cachedUserId = refreshData.session.user.id;
      _lastSessionCheck = now;
      return _cachedUserId;
    }

    return null;
  } catch (e: any) {
    console.error('ensureValidSession error:', e.message);
    return _cachedUserId;
  }
}

function isAuthError(error: any): boolean {
  if (!error) return false;
  const msg = (error.message || '').toLowerCase();
  const code = error.code || '';
  const status = error.status || 0;
  return (
    status === 401 || status === 403 ||
    code === 'PGRST301' || code === '42501' ||
    msg.includes('jwt expired') ||
    msg.includes('jwt') ||
    msg.includes('token') ||
    msg.includes('not authenticated') ||
    msg.includes('refresh_token_not_found') ||
    msg.includes('invalid claim') ||
    msg.includes('session_not_found') ||
    msg.includes('row-level security') ||
    msg.includes('new row violates row-level security') ||
    msg.includes('permission denied')
  );
}

export async function refreshSessionNow(): Promise<boolean> {
  try {
    _lastSessionCheck = 0;
    const { data, error } = await supabase.auth.refreshSession();
    if (data?.session?.user) {
      _cachedUserId = data.session.user.id;
      _lastSessionCheck = Date.now();
      return true;
    }
    if (error) console.warn('refreshSessionNow failed:', error.message);
    return false;
  } catch (e: any) {
    console.error('refreshSessionNow error:', e.message);
    return false;
  }
}

const OP_TIMEOUT = 30000;

export async function withSessionRetry<T>(operation: () => Promise<T>): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Operation timed out. Please check your internet connection and try again.')), OP_TIMEOUT)
  );

  try {
    return await Promise.race([operation(), timeoutPromise]);
  } catch (firstError: any) {
    if (isAuthError(firstError)) {
      const refreshed = await refreshSessionNow();
      if (refreshed) {
        try {
          return await Promise.race([operation(), timeoutPromise]);
        } catch (retryError: any) {
          throw retryError;
        }
      }
    }
    throw firstError;
  }
}

AppState.addEventListener('change', async (nextState: AppStateStatus) => {
  if (nextState === 'active' && _cachedUserId) {
    try {
      await ensureValidSession();
    } catch (e) {
    }
  }
});
