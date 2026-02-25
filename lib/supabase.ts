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
let _lastRefreshTime: number = 0;
const MIN_REFRESH_INTERVAL = 60 * 1000;

export function setCachedUserId(id: string | null) {
  _cachedUserId = id;
}

export function getCachedUserId(): string | null {
  return _cachedUserId;
}

export async function ensureValidSession(): Promise<string | null> {
  if (_cachedUserId) {
    return _cachedUserId;
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      _cachedUserId = session.user.id;
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
  return (
    code === 'PGRST301' ||
    msg.includes('jwt expired') ||
    msg.includes('invalid claim') ||
    msg.includes('session_not_found') ||
    msg.includes('refresh_token_not_found') ||
    msg.includes('not authenticated')
  );
}

export async function refreshSessionNow(): Promise<boolean> {
  const now = Date.now();
  if ((now - _lastRefreshTime) < MIN_REFRESH_INTERVAL) {
    return !!_cachedUserId;
  }

  try {
    _lastRefreshTime = now;
    const { data, error } = await supabase.auth.refreshSession();
    if (data?.session?.user) {
      _cachedUserId = data.session.user.id;
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
  let timeoutHandle: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error('Operation timed out. Please check your internet connection and try again.')), OP_TIMEOUT);
  });

  try {
    const result = await Promise.race([operation(), timeoutPromise]);
    clearTimeout(timeoutHandle!);
    return result;
  } catch (firstError: any) {
    clearTimeout(timeoutHandle!);
    if (isAuthError(firstError)) {
      const refreshed = await refreshSessionNow();
      if (refreshed) {
        let retryTimeoutHandle: ReturnType<typeof setTimeout>;
        const retryTimeout = new Promise<never>((_, reject) => {
          retryTimeoutHandle = setTimeout(() => reject(new Error('Operation timed out on retry.')), OP_TIMEOUT);
        });
        try {
          const result = await Promise.race([operation(), retryTimeout]);
          clearTimeout(retryTimeoutHandle!);
          return result;
        } catch (retryError: any) {
          clearTimeout(retryTimeoutHandle!);
          throw retryError;
        }
      }
    }
    throw firstError;
  }
}

let _lastForegroundRefresh: number = 0;
const FOREGROUND_REFRESH_INTERVAL = 10 * 60 * 1000;

AppState.addEventListener('change', async (nextState: AppStateStatus) => {
  if (nextState === 'active' && _cachedUserId) {
    const now = Date.now();
    if ((now - _lastForegroundRefresh) > FOREGROUND_REFRESH_INTERVAL) {
      _lastForegroundRefresh = now;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
          if (expiresAt > 0 && (expiresAt - now) < 5 * 60 * 1000) {
            await refreshSessionNow();
          }
        }
      } catch (e) {}
    }
  }
});
