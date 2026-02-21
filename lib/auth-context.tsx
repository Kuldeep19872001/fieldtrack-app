import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, setCachedUserId } from './supabase';
import type { UserProfile } from './types';

const PROFILE_CACHE_KEY = 'cached_user_profile';

interface AuthContextValue {
  user: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  register: (email: string, password: string, name: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function cacheProfile(profile: UserProfile): Promise<void> {
  try {
    await AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
  } catch (e) {
    console.warn('Failed to cache profile:', e);
  }
}

async function getCachedProfile(): Promise<UserProfile | null> {
  try {
    const data = await AsyncStorage.getItem(PROFILE_CACHE_KEY);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.warn('Failed to get cached profile:', e);
    return null;
  }
}

async function clearCachedProfile(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PROFILE_CACHE_KEY);
  } catch (e) {
    console.warn('Failed to clear cached profile:', e);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadProfile = async (userId: string, email: string): Promise<UserProfile> => {
    setCachedUserId(userId);

    let profileName = email.split('@')[0];
    let profileRole = 'Field Executive';
    try {
      const { data } = await supabase
        .from('profiles')
        .select('name, role')
        .eq('id', userId)
        .single();
      if (data) {
        profileName = data.name || profileName;
        profileRole = data.role || profileRole;
      }
    } catch (e) {
      const cached = await getCachedProfile();
      if (cached && cached.id === userId) {
        profileName = cached.name || profileName;
        profileRole = cached.role || profileRole;
      }
    }

    const profile: UserProfile = {
      id: userId,
      username: email,
      name: profileName,
      role: profileRole,
    };
    setUser(profile);
    await cacheProfile(profile);
    return profile;
  };

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setCachedUserId(session.user.id);
          await loadProfile(session.user.id, session.user.email || '');
        } else {
          const cached = await getCachedProfile();
          if (cached) {
            try {
              const { data: { session: refreshed } } = await supabase.auth.refreshSession();
              if (refreshed?.user) {
                setCachedUserId(refreshed.user.id);
                await loadProfile(refreshed.user.id, refreshed.user.email || '');
              } else {
                setCachedUserId(cached.id);
                setUser(cached);
              }
            } catch {
              setCachedUserId(cached.id);
              setUser(cached);
            }
          }
        }
      } catch (e) {
        console.error('Auth init error:', e);
        const cached = await getCachedProfile();
        if (cached) {
          setCachedUserId(cached.id);
          setUser(cached);
        }
      } finally {
        setIsLoading(false);
      }
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
        setCachedUserId(session.user.id);
        await loadProfile(session.user.id, session.user.email || '');
      } else if (event === 'SIGNED_OUT') {
        setCachedUserId(null);
        setUser(null);
        await clearCachedProfile();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (email: string, password: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { success: false, message: error.message };
      if (data.user) {
        setCachedUserId(data.user.id);
        await loadProfile(data.user.id, data.user.email || '');
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, message: e.message || 'Login failed' };
    }
  };

  const register = async (email: string, password: string, name: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });
      if (error) return { success: false, message: error.message };
      if (data.user) {
        setCachedUserId(data.user.id);
        try {
          await supabase.from('profiles').upsert({
            id: data.user.id,
            name,
            role: 'Field Executive',
          });
        } catch (e) {
          console.warn('Profile upsert after register failed:', e);
        }
        await loadProfile(data.user.id, data.user.email || '');
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, message: e.message || 'Registration failed' };
    }
  };

  const logout = async () => {
    try {
      const { data } = await supabase
        .from('trips')
        .select('id')
        .is('end_time', null)
        .limit(1)
        .maybeSingle();

      if (data) {
        throw new Error('ACTIVE_TRIP');
      }
    } catch (e: any) {
      if (e.message === 'ACTIVE_TRIP') {
        throw e;
      }
    }

    setCachedUserId(null);
    await clearCachedProfile();
    await supabase.auth.signOut();
    setUser(null);
  };

  const isAdmin = !!user && user.role === 'manager';

  const value = useMemo(() => ({
    user,
    isLoading,
    isAuthenticated: !!user,
    isAdmin,
    login,
    register,
    logout,
  }), [user, isLoading, isAdmin]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
