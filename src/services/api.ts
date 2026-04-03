import Constants from 'expo-constants';
import { Platform } from 'react-native';

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

export async function apiPost<T>(endpoint: string, body: any, signal?: AbortSignal): Promise<T> {
  const { signal: combined, cleanup } = withTimeout(signal);
  try {
    const response = await fetch(`${API_BASE}/api${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: combined,
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

export async function apiGet<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${API_BASE}/api${endpoint}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const { signal, cleanup } = withTimeout();
  try {
    const response = await fetch(url.toString(), { signal });
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
