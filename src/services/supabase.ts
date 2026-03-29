import { createClient, SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const SUPABASE_URL = Constants.expoConfig?.extra?.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = Constants.expoConfig?.extra?.supabaseAnonKey || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

const isConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

const realClient: SupabaseClient | null = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

// Safe default that works for both sync and async access patterns:
// - supabase.auth.getSession()         → Promise { data: { session: null }, error: null }
// - supabase.auth.getUser()            → Promise { data: { user: null }, error: null }
// - supabase.auth.onAuthStateChange()  → { data: { subscription: { unsubscribe: () => {} } } }
// - supabase.from('x').upsert({})      → Promise { data: null, error: null }
const NOOP_RESULT = {
  data: {
    session: null,
    user: null,
    subscription: { unsubscribe: () => {} },
  },
  error: null,
  // Make it thenable so it works with both await and .then()
  then: (resolve: any) => resolve ? resolve(NOOP_RESULT) : Promise.resolve(NOOP_RESULT),
};

function createNoopProxy(): any {
  return new Proxy(function () {}, {
    get: () => createNoopProxy(),
    apply: () => NOOP_RESULT,
  });
}

export const supabase: SupabaseClient = realClient || createNoopProxy();
