import Constants from 'expo-constants';
import { Platform } from 'react-native';

// ===== PRODUCTION URL — update this after deploying backend =====
const PRODUCTION_API_URL = 'https://sharp-production-2d7c.up.railway.app';
// ================================================================

function getApiBase(): string {
  // Always use production backend
  return PRODUCTION_API_URL;
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
