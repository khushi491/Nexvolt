import type { UserDto } from '@nexvolt/shared';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, onSessionChange, restoreSession, signOut } from './api';

type Status = 'loading' | 'authenticated' | 'anonymous';
interface Ctx {
  user: UserDto | null;
  status: Status;
  reload: () => Promise<void>;
  signOut: () => Promise<void>;
}
const SessionCtx = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  useEffect(() => {
    void restoreSession().then((u) => {
      setUser(u);
      setStatus(u ? 'authenticated' : 'anonymous');
    });
    return onSessionChange((u) => {
      setUser(u);
      setStatus(u ? 'authenticated' : 'anonymous');
    });
  }, []);
  const reload = useCallback(async () => setUser(await api.users.me()), []);
  return <SessionCtx.Provider value={{ user, status, reload, signOut }}>{children}</SessionCtx.Provider>;
}

export function useSession(): Ctx {
  const v = useContext(SessionCtx);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
}
