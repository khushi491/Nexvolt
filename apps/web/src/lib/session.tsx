'use client';
import type { Role, UserDto } from '@nexvolt/shared';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, logout as doLogout, onSessionChange, refreshSession } from './api';

type Status = 'loading' | 'authenticated' | 'anonymous';
interface SessionCtx {
  user: UserDto | null;
  status: Status;
  hasRole: (...roles: Role[]) => boolean;
  reload: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    let alive = true;
    refreshSession().then((s) => {
      if (!alive) return;
      setUser(s?.user ?? null);
      setStatus(s ? 'authenticated' : 'anonymous');
    });
    const off = onSessionChange((u) => {
      setUser(u);
      setStatus(u ? 'authenticated' : 'anonymous');
    });
    return () => {
      alive = false;
      off();
    };
  }, []);

  const reload = useCallback(async () => {
    const u = await api.users.me();
    setUser(u);
  }, []);

  const value: SessionCtx = {
    user,
    status,
    hasRole: (...roles) => !!user && roles.some((r) => user.roles.includes(r)),
    reload,
    logout: doLogout,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession must be used inside SessionProvider');
  return v;
}
