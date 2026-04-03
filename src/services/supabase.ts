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

// Safe noop client when Supabase is not configured.
// Every method call returns a resolved promise with { data: null/empty, error: null }.
const NOOP_DATA = {
  session: null,
  user: null,
  subscription: { unsubscribe: () => {} },
};

function createNoopProxy(): any {
  const handler: ProxyHandler<any> = {
    get(_target, prop) {
      // Make the proxy thenable so `await` works — resolve with noop result once (no recursion)
      if (prop === 'then') {
        return (resolve: any) => resolve ? resolve({ data: NOOP_DATA, error: null }) : undefined;
      }
      // Return a callable proxy for chaining: supabase.from('x').upsert({}).eq(...)
      return createNoopProxy();
    },
    apply() {
      return createNoopProxy();
    },
  };
  return new Proxy(function () {}, handler);
}

export const supabase: SupabaseClient = realClient || createNoopProxy();
