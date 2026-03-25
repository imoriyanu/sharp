import Constants from 'expo-constants';
import { Platform } from 'react-native';

// ===== PRODUCTION URL — update this after deploying backend =====
const PRODUCTION_API_URL = 'https://sharp-ai-backend-production.up.railway.app';
// ================================================================

function getApiBase(): string {
  if (!__DEV__) return PRODUCTION_API_URL;
  // Dev: simulator uses localhost, physical device uses LAN IP
  const debuggerHost = Constants.expoConfig?.hostUri?.split(':')[0];
  if (debuggerHost) return `http://${debuggerHost}:3001`;
  return Platform.OS === 'ios' ? 'http://127.0.0.1:3001' : 'http://10.0.2.2:3001';
}

const API_BASE = getApiBase();

export async function apiPost<T>(endpoint: string, body: any): Promise<T> {
  const response = await fetch(`${API_BASE}/api${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `API error: ${response.status}`);
  }
  return response.json();
}

export async function apiGet<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${API_BASE}/api${endpoint}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const response = await fetch(url.toString());
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `API error: ${response.status}`);
  }
  return response.json();
}

export async function apiUpload(endpoint: string, formData: FormData): Promise<any> {
  const response = await fetch(`${API_BASE}/api${endpoint}`, {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `API error: ${response.status}`);
  }
  return response.json();
}

export function getTtsUrl(text: string): string {
  return `${API_BASE}/api/tts?text=${encodeURIComponent(text)}`;
}
