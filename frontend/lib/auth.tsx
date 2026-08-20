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
  fullName: string;
  isSuperAdmin: boolean;
  // Реквизиты для перевода (ADR-0019) — заполняет собственник, видит
  // арендатор на экране счетов.
  payoutPhone: string | null;
  payoutBankName: string | null;
  payoutNote: string | null;
}

export interface PayoutDetailsInput {
  payoutPhone?: string;
  payoutBankName?: string;
  payoutNote?: string;
}

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  savePayoutDetails: (input: PayoutDetailsInput) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    email: string;
    password: string;
    fullName: string;
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
    async (input: { email: string; password: string; fullName: string }) => {
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

  // Реквизиты для перевода живут на профиле, а редактируются с экрана
  // счетов — отдельного экрана профиля в MVP нет (ADR-0019).
  const savePayoutDetails = useCallback(async (input: PayoutDetailsInput) => {
    setUser(
      await apiFetch<CurrentUser>('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    );
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, savePayoutDetails }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth должен использоваться внутри AuthProvider');
  return ctx;
}
