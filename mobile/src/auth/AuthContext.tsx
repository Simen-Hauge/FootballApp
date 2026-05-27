import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { clearSession, getSession, setSession, type Session } from './session';
import { setAuthToken, setUnauthorizedHandler } from '@/api/client';
import { fetchMe } from '@/api/players';

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  signIn: (s: Session) => Promise<void>;
  updateSession: (s: Session) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getSession().then(async (s) => {
      if (cancelled) return;
      setSessionState(s);
      setAuthToken(s?.token ?? null);
      setLoading(false);

      // Refresh the per-user gamemode allowlist in the background. A cached
      // session from before this feature shipped will be missing
      // `enabledGamemodes`; the next /me call backfills it. Also catches the
      // case where an admin adds someone to FRIENDS_FAMILY_EMAILS while
      // they're already signed in.
      if (s?.token) {
        try {
          const me = await fetchMe();
          if (cancelled) return;
          const refreshed: Session = {
            ...s,
            name: me.name,
            email: me.email,
            enabledGamemodes: me.enabledGamemodes,
          };
          await setSession(refreshed);
          setSessionState(refreshed);
        } catch {
          // 401 already handled by the unauthorized hook below; any other
          // failure (network, etc.) is non-fatal — keep the cached session.
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (s: Session) => {
    await setSession(s);
    setAuthToken(s.token);
    setSessionState(s);
  }, []);

  const signOut = useCallback(async () => {
    await clearSession();
    setAuthToken(null);
    setSessionState(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      // 401 from any API call kicks the user back to /auth so they re-login
      // with a fresh token. Avoids stuck states with stale/expired tokens.
      void signOut();
    });
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  const value = useMemo(
    () => ({ session, loading, signIn, updateSession: signIn, signOut }),
    [session, loading, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
