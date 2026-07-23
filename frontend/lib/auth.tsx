'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import {
  apiFetch,
  AuthTokens,
  clearTokens,
  getAccessToken,
  setTokens,
} from './api';

export interface CurrentUser {
  id: string;
  email: string;
  isSuperAdmin: boolean;
}

export type SignupRole = 'landlord' | 'tenant';

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    email: string;
    password: string;
    fullName: string;
    signupRole: SignupRole;
  }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    if (!getAccessToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      setUser(await apiFetch<CurrentUser>('/auth/me'));
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  const login = useCallback(
    async (email: string, password: string) => {
      const tokens = await apiFetch<AuthTokens>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setTokens(tokens);
      await loadMe();
    },
    [loadMe],
  );

  const register = useCallback(
    async (input: {
      email: string;
      password: string;
      fullName: string;
      signupRole: SignupRole;
    }) => {
      const tokens = await apiFetch<AuthTokens>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      setTokens(tokens);
      await loadMe();
    },
    [loadMe],
  );

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth должен использоваться внутри AuthProvider');
  return ctx;
}
