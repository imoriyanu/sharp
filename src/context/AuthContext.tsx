import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { runMigrationIfNeeded } from '../services/storage';
import { identifyUser, logoutUser } from '../services/revenuecat';
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
    let migrating = false;

    supabase.auth.getSession().then(({ data: { session } }) => {
      setState({
        user: session?.user ?? null,
        session: null, // Don't store full session object in state — can cause stack overflow
        isLoading: false,
        isAuthenticated: !!session,
      });
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setState({
        user: session?.user ?? null,
        session: null,
        isLoading: false,
        isAuthenticated: !!session,
      });
      // On sign-in, identify with RevenueCat + migrate local data to cloud
      if (event === 'SIGNED_IN' && session && !migrating) {
        migrating = true;
        identifyUser(session.user.id).catch(() => {});
        runMigrationIfNeeded()
          .catch(e => __DEV__ && console.warn('Migration error:', e))
          .finally(() => { migrating = false; });
      }
      // On sign-out, reset RevenueCat identity
      if (event === 'SIGNED_OUT') {
        logoutUser().catch(() => {});
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
