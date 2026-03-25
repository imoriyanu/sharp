import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import * as Speech from 'expo-speech';
import { getTtsUrl } from './api';
import type { GeneratedQuestion } from '../types';

// ===== Playback State =====
// Single source of truth — prevents overlaps, ghost playback, and stale callbacks

let currentPlayer: ReturnType<typeof createAudioPlayer> | null = null;
let playbackGeneration = 0; // Incremented on every stop/play — stale callbacks check this
let isPlaying = false;

// Cache: text hash → local file URI
const audioCache = new Map<string, string>();

function hashText(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

async function downloadAndCache(text: string, gen: number): Promise<string | null> {
  const key = hashText(text);
  const cached = audioCache.get(String(key));
  if (cached) {
    const info = await FileSystem.getInfoAsync(cached);
    if (info.exists) return cached;
    audioCache.delete(String(key));
  }

  // Check if we've been cancelled during cache lookup
  if (gen !== playbackGeneration) return null;

  const url = getTtsUrl(text);
  const filename = `${FileSystem.cacheDirectory}tts_${key}.mp3`;

  try {
    const download = await FileSystem.downloadAsync(url, filename);
    if (gen !== playbackGeneration) return null; // Cancelled during download
    if (download.status !== 200) return null;
    audioCache.set(String(key), filename);
    return filename;
  } catch {
    return null;
  }
}

// ===== Stop — always safe to call =====

export async function stopAudio(): Promise<void> {
  playbackGeneration++; // Invalidate any in-flight downloads or callbacks
  isPlaying = false;

  if (currentPlayer) {
    try { currentPlayer.release(); } catch {}
    currentPlayer = null;
  }
  try { Speech.stop(); } catch {}
}

// ===== Play — downloads, caches, plays with ElevenLabs, NO fallback mid-sentence =====

export async function playQuestionAudio(text: string): Promise<void> {
  await stopAudio();
  const gen = playbackGeneration;
  isPlaying = true;

  try {
    await setAudioModeAsync({ playsInSilentMode: true });
    if (gen !== playbackGeneration) return; // Cancelled

    const localUri = await downloadAndCache(text, gen);
    if (gen !== playbackGeneration || !localUri) {
      // Download failed or cancelled — try device TTS only if still current
      if (gen === playbackGeneration) await playDeviceTTSGuarded(text, gen);
      return;
    }

    const player = createAudioPlayer(localUri);
    if (gen !== playbackGeneration) { try { player.release(); } catch {} return; }

    currentPlayer = player;

    return new Promise<void>((resolve) => {
      const done = () => {
        if (currentPlayer === player) {
          try { player.release(); } catch {}
          currentPlayer = null;
        }
        isPlaying = false;
        resolve();
      };

      player.addListener('playbackStatusUpdate', (status: any) => {
        // Only finish if we're still the active generation
        if (gen !== playbackGeneration) { done(); return; }
        if (status.didJustFinish) done();
      });

      player.play();
    });
  } catch {
    if (gen === playbackGeneration) await playDeviceTTSGuarded(text, gen);
  }
}

// ===== Device TTS — guarded against stale playback =====

async function playDeviceTTSGuarded(text: string, gen: number): Promise<void> {
  if (gen !== playbackGeneration) return;
  return new Promise((resolve) => {
    Speech.speak(text, {
      language: 'en-US',
      rate: 0.9,
      pitch: 1.0,
      onDone: () => { isPlaying = false; resolve(); },
      onStopped: () => { isPlaying = false; resolve(); },
      onError: () => { isPlaying = false; resolve(); },
    });
  });
}

// Keep the public export for direct device TTS usage
export async function playDeviceTTS(text: string): Promise<void> {
  await stopAudio();
  const gen = playbackGeneration;
  return playDeviceTTSGuarded(text, gen);
}

export function isAudioPlaying(): boolean {
  return isPlaying;
}

// ===== Natural Script Builder =====

function getGreeting(): string {
  const h = new Date().getHours();
  const greetings = h < 12
    ? ['Good morning.', 'Morning!', 'Hey, good morning.']
    : h < 17
    ? ['Good afternoon.', 'Hey there.', 'Alright, afternoon session.']
    : ['Good evening.', 'Hey, evening session.', 'Alright, let\'s go.'];
  return greetings[Math.floor(Math.random() * greetings.length)];
}

export function buildNaturalScript(q: GeneratedQuestion): string {
  const greeting = getGreeting();
  const format = q.format || 'prompt';

  const transitions = [
    'Here\'s what I want you to do.',
    'So here\'s the challenge.',
    'Ready? Here it is.',
    'Let me set the scene.',
    'OK so picture this.',
    'Alright, here\'s the scenario.',
  ];
  const intros = [
    'I want you to think about this.',
    'Here\'s a question for you.',
    'Tell me this.',
    'I\'ve got something for you.',
    'Here\'s what I\'m curious about.',
    'Think about this one.',
  ];
  const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

  if (format === 'roleplay' || format === 'pressure') {
    return `${greeting} ${pick(transitions)} ${q.situation || ''} ${q.question}`;
  }
  if (format === 'briefing') {
    return `${greeting} OK, so here's some context. ${q.background || ''} Now, ${q.question}`;
  }
  if (format === 'context') {
    return `${greeting} This one's about you. ${q.question}`;
  }
  // Simple prompt — keep it light
  return `${greeting} ${pick(intros)} ${q.question}`;
}
