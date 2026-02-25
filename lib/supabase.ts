import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, AppStateStatus } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://kzyggcacgnyoglkgmvrt.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_OEWJgEeAD3sjVlQ2IOMLwQ_SJ36sxag';

const FETCH_TIMEOUT = 30000;
const MAX_RETRIES = 2;
const RETRY_DELAYS = [1000, 3000];

async function customFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let lastError: any;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

      const response = await fetch(input, {
        ...init,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response;
    } catch (err: any) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
      }
    }
  }

  throw lastError;
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: {
    fetch: customFetch,
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
