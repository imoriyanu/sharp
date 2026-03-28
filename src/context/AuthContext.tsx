import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { runMigrationIfNeeded } from '../services/storage';
import type { User, Session } from '@supabase/supabase-js';

type AuthState = {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
};

const AuthContext = createContext<AuthState>({
  user: null, session: null, isLoading: true, isAuthenticated: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null, session: null, isLoading: true, isAuthenticated: false,
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setState({
        user: session?.user ?? null,
        session,
        isLoading: false,
        isAuthenticated: !!session,
      });
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setState({
        user: session?.user ?? null,
        session,
        isLoading: false,
        isAuthenticated: !!session,
      });
      // On sign-in, migrate local data to cloud
      if (event === 'SIGNED_IN' && session) {
        runMigrationIfNeeded().catch(e => __DEV__ && console.warn('Migration error:', e));
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
