import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

const PROD_API_URL = Constants.expoConfig?.extra?.apiUrl || 'https://sharp-production-2d7c.up.railway.app';

// In dev, use local backend if EXPO_PUBLIC_API_URL is not set — fall back to production
// To use local backend in dev, start it with: cd backend && node server.js
const API_BASE = PROD_API_URL;

const DEFAULT_TIMEOUT = 45_000; // 45s

function withTimeout(signal?: AbortSignal, ms = DEFAULT_TIMEOUT): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  // If caller passed a signal, forward its abort too
  const onCallerAbort = () => controller.abort();
  signal?.addEventListener('abort', onCallerAbort, { once: true });

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onCallerAbort);
    },
  };
}

// Attach the Supabase access token if available. Harmless on v1 endpoints
// (they ignore it) and required by v2 endpoints to verify userId server-side.
async function buildAuthHeaders(): Promise<Record<string, string>> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

export async function apiPost<T>(endpoint: string, body: any, signal?: AbortSignal): Promise<T> {
  const { signal: combined, cleanup } = withTimeout(signal);
  try {
    const authHeaders = await buildAuthHeaders();
    const response = await fetch(`${API_BASE}/api${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify(body),
      signal: combined,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `API error: ${response.status}`);
    }
    // Some endpoints (e.g. /account/delete) return 204 No Content. Calling
    // response.json() on an empty body throws "Unexpected end of input",
    // so read raw text and parse only when there's something there.
    if (response.status === 204) return {} as T;
    const text = await response.text();
    if (!text) return {} as T;
    try { return JSON.parse(text) as T; } catch { return {} as T; }
  } finally {
    cleanup();
  }
}

// Fetches { features, version } from /api/config and applies feature flags.
// Best-effort: silently no-ops on network failure so app launch never blocks.
export async function fetchRemoteConfig(): Promise<void> {
  try {
    const { applyRemoteFeatures } = await import('../constants/features');
    const { signal, cleanup } = withTimeout(undefined, 5000);
    try {
      const response = await fetch(`${API_BASE}/api/config`, { signal });
      if (!response.ok) return;
      const json = await response.json();
      applyRemoteFeatures(json?.features);
    } finally {
      cleanup();
    }
  } catch {
    // ignore — defaults from src/constants/features.ts apply
  }
}

export async function apiGet<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${API_BASE}/api${endpoint}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const { signal, cleanup } = withTimeout();
  try {
    const authHeaders = await buildAuthHeaders();
    const response = await fetch(url.toString(), { signal, headers: authHeaders });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `API error: ${response.status}`);
    }
    return response.json();
  } finally {
    cleanup();
  }
}

export async function apiUpload(endpoint: string, formData: FormData): Promise<any> {
  const { signal, cleanup } = withTimeout(undefined, 60_000); // 60s for uploads
  try {
    const response = await fetch(`${API_BASE}/api${endpoint}`, {
      method: 'POST',
      body: formData,
      signal,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `API error: ${response.status}`);
    }
    return response.json();
  } finally {
    cleanup();
  }
}

export type VoiceMode = 'question' | 'coaching' | 'model' | 'followup' | 'briefing';

export function getTtsUrl(text: string, mode: VoiceMode = 'question'): string {
  return `${API_BASE}/api/tts?text=${encodeURIComponent(text)}&mode=${mode}`;
}

// POST-based TTS download — handles long text that won't fit in a URL
export async function fetchTtsAudio(text: string, mode: VoiceMode = 'question'): Promise<ArrayBuffer | null> {
  try {
    const response = await fetch(`${API_BASE}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, mode }),
    });
    if (!response.ok) return null;
    return response.arrayBuffer();
  } catch {
    return null;
  }
}
