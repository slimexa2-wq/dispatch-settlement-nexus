import { createContext, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { Session } from './types';

interface SessionContextValue {
  session: Session | null;
  loading: boolean;
  refresh: () => Promise<unknown>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const query = useQuery({
    queryKey: ['session'],
    queryFn: () => api<Session>('/api/session'),
    retry: false
  });
  return <SessionContext.Provider value={{ session: query.data ?? null, loading: query.isLoading, refresh: () => query.refetch() }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside SessionProvider');
  return context;
}
