import { Platform, Alert } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from './supabase';

export async function signInWithApple() {
  console.log('[Apple Auth] Starting sign in...');
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });
  console.log('[Apple Auth] Got credential, hasToken:', !!credential.identityToken);

  if (!credential.identityToken) {
    throw new Error('No identity token returned from Apple');
  }

  console.log('[Apple Auth] Calling Supabase signInWithIdToken...');
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  const debugInfo = `error: ${error?.message || 'none'}\nhasSession: ${!!data?.session}\nhasUser: ${!!data?.user}`;
  console.log('[Apple Auth] Supabase response —', debugInfo);
  Alert.alert('Apple Auth Debug', debugInfo);
  if (error) throw error;

  // Validate that we actually got a session — catches noop client
  if (!data.session || !data.user) {
    throw new Error('Sign in failed — no session returned. Please check your connection and try again.');
  }

  // Update display name if Apple provided one (only on first sign-in)
  if (credential.fullName) {
    const name = [credential.fullName.givenName, credential.fullName.familyName].filter(Boolean).join(' ');
    if (name) {
      try { await supabase.from('profiles').update({ display_name: name }).eq('id', data.user.id); } catch {}
    }
  }

  return data;
}

export async function isAppleAuthAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  return AppleAuthentication.isAvailableAsync();
}

export async function signUpWithEmail(email: string, password: string, displayName: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: displayName } },
  });
  if (error) throw error;

  // Update profile with display name
  if (data.user) {
    await supabase.from('profiles').update({ display_name: displayName }).eq('id', data.user.id);
  }

  return data;
}

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.session || !data.user) {
    throw new Error('Sign in failed — no session returned. Please try again.');
  }
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function resetPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw error;
}
