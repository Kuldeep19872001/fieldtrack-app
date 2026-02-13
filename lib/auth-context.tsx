import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiRequest } from './query-client';
import type { UserProfile } from './types';

interface AuthContextValue {
  user: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; message?: string }>;
  register: (username: string, password: string, name: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const USER_KEY = '@fieldtrack_user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiRequest('GET', '/api/auth/me');
        const data = await res.json();
        if (data && data.id) {
          const profile: UserProfile = {
            id: String(data.id),
            username: data.username,
            name: data.name,
            role: data.role,
          };
          setUser(profile);
          await AsyncStorage.setItem(USER_KEY, JSON.stringify(profile));
        }
      } catch (e) {
        const cached = await AsyncStorage.getItem(USER_KEY);
        if (cached) {
          try {
            setUser(JSON.parse(cached));
          } catch {}
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = async (username: string, password: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const res = await apiRequest('POST', '/api/auth/login', { username, password });
      const data = await res.json();
      const profile: UserProfile = {
        id: String(data.id),
        username: data.username,
        name: data.name,
        role: data.role,
      };
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(profile));
      setUser(profile);
      return { success: true };
    } catch (e: any) {
      const msg = e.message || 'Login failed';
      let parsed = msg;
      try { const j = JSON.parse(msg.replace(/^\d+:\s*/, '')); if (j.message) parsed = j.message; } catch {}
      if (parsed === msg) { const m = msg.match(/\d+:\s*(.*)/); if (m) parsed = m[1]; }
      return { success: false, message: parsed };
    }
  };

  const register = async (username: string, password: string, name: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const res = await apiRequest('POST', '/api/auth/register', { username, password, name });
      const data = await res.json();
      const profile: UserProfile = {
        id: String(data.id),
        username: data.username,
        name: data.name,
        role: data.role,
      };
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(profile));
      setUser(profile);
      return { success: true };
    } catch (e: any) {
      const msg = e.message || 'Registration failed';
      let parsed = msg;
      try { const j = JSON.parse(msg.replace(/^\d+:\s*/, '')); if (j.message) parsed = j.message; } catch {}
      if (parsed === msg) { const m = msg.match(/\d+:\s*(.*)/); if (m) parsed = m[1]; }
      return { success: false, message: parsed };
    }
  };

  const logout = async () => {
    try {
      await apiRequest('POST', '/api/auth/logout');
    } catch {}
    await AsyncStorage.removeItem(USER_KEY);
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
