import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from './supabase';
import { apiPost } from './api';
import { clearAllUserData } from './storage';

export async function signInWithApple() {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  if (!credential.identityToken) {
    throw new Error('No identity token returned from Apple');
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw error;

  // Validate that we actually got a session. Catches noop client
  if (!data.session || !data.user) {
    throw new Error('Sign in failed. No session returned. Please check your connection and try again.');
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
    throw new Error('Sign in failed. No session returned. Please try again.');
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

// Apple Guideline 5.1.1(v): permanent in-app account deletion.
// Order is: server-side delete (irreversible) → local wipe → sign out.
// RevenueCat logout is handled automatically by AuthContext on SIGNED_OUT.
//
// Defensive: only an HTTP-level error (non-2xx) from the server should
// abort the flow. A 204 success or a transient parse hiccup must still
// run local cleanup so the user isn't stranded with their data on-device
// after the server already nuked them. The backend handler is also
// idempotent on "already deleted" (returns 204), so a retry is safe.
export async function deleteAccount(): Promise<void> {
  let serverError: Error | null = null;
  try {
    await apiPost<{}>('/account/delete', {});
  } catch (e: any) {
    // Re-throw only if it looks like a real server failure (preserves the
    // backend's user-facing message). Otherwise swallow and continue , 
    // the server likely succeeded; we want local state to follow.
    const msg = (e?.message || '').toLowerCase();
    const realFailure =
      msg.includes('api error') ||
      msg.includes('unavailable') ||
      msg.includes('authentication') ||
      msg.includes('failed to fetch') ||
      msg.includes('network request');
    if (realFailure) serverError = e;
  }
  if (serverError) throw serverError;
  await clearAllUserData();
  try {
    await supabase.auth.signOut();
  } catch {
    // If signOut fails after deletion, the session token is already orphaned
    // server-side. Local clearAllUserData() already wiped credentials.
  }
}
