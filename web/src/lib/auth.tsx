import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError } from "./api";

export interface SessionUser {
  id: string;
  email: string;
}

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  login(email: string, password: string): Promise<void>;
  register(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  /** Forget the user locally (after the server deleted the account). */
  clearSession(): void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ user: SessionUser }>("/auth/me")
      .then((r) => setUser({ id: r.user.id, email: r.user.email }))
      .catch((e) => {
        if (!(e instanceof ApiError && e.status === 401)) console.error(e);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api<{ user: SessionUser }>("/auth/login", { method: "POST", body: { email, password } });
    setUser(r.user);
  }, []);
  const register = useCallback(async (email: string, password: string) => {
    const r = await api<{ user: SessionUser }>("/auth/register", { method: "POST", body: { email, password } });
    setUser(r.user);
  }, []);
  const logout = useCallback(async () => {
    await api("/auth/logout", { method: "POST" });
    setUser(null);
  }, []);

  const clearSession = useCallback(() => setUser(null), []);

  const value = useMemo(() => ({ user, loading, login, register, logout, clearSession }), [user, loading, login, register, logout, clearSession]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
