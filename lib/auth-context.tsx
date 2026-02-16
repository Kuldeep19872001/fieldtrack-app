import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { supabase, setCachedUserId } from './supabase';
import type { UserProfile } from './types';

interface AuthContextValue {
  user: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  register: (email: string, password: string, name: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadProfile = async (userId: string, email: string) => {
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
      console.warn('Profile load failed, using defaults');
    }

    const profile: UserProfile = {
      id: userId,
      username: email,
      name: profileName,
      role: profileRole,
    };
    setUser(profile);
    return profile;
  };

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setCachedUserId(session.user.id);
          await loadProfile(session.user.id, session.user.email || '');
        }
      } catch (e) {
        console.error('Auth init error:', e);
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
    setCachedUserId(null);
    await supabase.auth.signOut();
    setUser(null);
  };

  const value = useMemo(() => ({
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    register,
    logout,
  }), [user, isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
