import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { GAMEMODES, GAMEMODE_LIST, type Gamemode, type GamemodeMeta } from './types';
import { loadGamemode, saveGamemode } from './storage';
import { useAuth } from '@/auth/AuthContext';

// Default gamemode when the server hasn't yet told us which ones this user
// can see. World Cup is the public-facing one — friends and family pick up
// the other modes once /api/account/me resolves.
const FALLBACK_GAMEMODE: Gamemode = 'world-cup';
const FALLBACK_ALLOWED: Gamemode[] = ['world-cup'];

interface GamemodeContextValue {
  gamemode: Gamemode;
  meta: GamemodeMeta;
  setGamemode: (g: Gamemode) => void;
  ready: boolean;
  allowed: Gamemode[];
  allowedList: GamemodeMeta[];
}

const GamemodeContext = createContext<GamemodeContextValue | undefined>(undefined);

export function GamemodeProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [gamemode, setGamemodeState] = useState<Gamemode>(FALLBACK_GAMEMODE);
  const [ready, setReady] = useState(false);

  const allowed = useMemo<Gamemode[]>(
    () => (session?.enabledGamemodes && session.enabledGamemodes.length > 0
      ? session.enabledGamemodes
      : FALLBACK_ALLOWED),
    [session?.enabledGamemodes],
  );

  const allowedList = useMemo<GamemodeMeta[]>(
    () => GAMEMODE_LIST.filter((m) => allowed.includes(m.id)),
    [allowed],
  );

  useEffect(() => {
    loadGamemode().then((g) => {
      if (g) setGamemodeState(g);
      setReady(true);
    });
  }, []);

  // If the user's allowlist changes (sign-in, /me refresh, or the admin
  // toggles them off) and their current selection is no longer permitted,
  // snap to the first allowed mode. Never strands the UI on a hidden mode.
  useEffect(() => {
    if (!ready) return;
    if (!allowed.includes(gamemode)) {
      const next = allowed[0] ?? FALLBACK_GAMEMODE;
      setGamemodeState(next);
      void saveGamemode(next);
    }
  }, [allowed, gamemode, ready]);

  const setGamemode = useCallback(
    (g: Gamemode) => {
      // Defensive — the toggle and group-create already filter the list to
      // allowed modes, so this branch should never fire in normal use.
      if (!allowed.includes(g)) return;
      setGamemodeState(g);
      void saveGamemode(g);
    },
    [allowed],
  );

  const value = useMemo(
    () => ({
      gamemode,
      meta: GAMEMODES[gamemode],
      setGamemode,
      ready,
      allowed,
      allowedList,
    }),
    [gamemode, setGamemode, ready, allowed, allowedList],
  );

  return <GamemodeContext.Provider value={value}>{children}</GamemodeContext.Provider>;
}

export function useGamemode(): GamemodeContextValue {
  const ctx = useContext(GamemodeContext);
  if (!ctx) throw new Error('useGamemode must be used within GamemodeProvider');
  return ctx;
}
