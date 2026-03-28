import * as FileSystem from 'expo-file-system/legacy';
import { apiPost } from './api';

export async function transcribeAudio(uri: string): Promise<{ transcript: string; duration: number }> {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) throw new Error('Recording file not found');

  // Read as base64 — avoids FormData issues on physical devices
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  __DEV__ && console.log('Transcription: sending', Math.round(base64.length / 1024), 'KB base64');

  return apiPost('/transcribe', { audio: base64, filename: 'recording.m4a' });
}
