import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { getTtsUrl } from './api';
import type { VoiceMode } from './api';
import type { GeneratedQuestion } from '../types';

// ===== Playback State =====
// Single source of truth — prevents overlaps, ghost playback, and stale callbacks

let currentPlayer: ReturnType<typeof createAudioPlayer> | null = null;
let playbackGeneration = 0; // Incremented on every stop/play — stale callbacks check this
let isPlaying = false;

// Cache: text+mode hash → local file URI
const audioCache = new Map<string, string>();

function hashText(text: string, mode: VoiceMode = 'question'): string {
  let h = 0;
  const key = `${mode}:${text}`;
  for (let i = 0; i < key.length; i++) h = ((h << 5) - h + key.charCodeAt(i)) | 0;
  return String(Math.abs(h));
}

async function downloadAndCache(text: string, mode: VoiceMode, gen: number, signal?: AbortSignal): Promise<string | null> {
  const key = hashText(text, mode);
  const cached = audioCache.get(key);
  if (cached) {
    const info = await FileSystem.getInfoAsync(cached);
    if (info.exists) return cached;
    audioCache.delete(key);
  }

  // Check if we've been cancelled during cache lookup
  if (gen !== playbackGeneration || signal?.aborted) return null;

  const url = getTtsUrl(text, mode);
  const filename = `${FileSystem.cacheDirectory}tts_${key}.mp3`;

  try {
    // Race the download against the abort signal so we bail immediately on navigation
    const downloadPromise = FileSystem.downloadAsync(url, filename);
    let result: Awaited<typeof downloadPromise>;

    if (signal) {
      const abortPromise = new Promise<null>((resolve) => {
        if (signal.aborted) { resolve(null); return; }
        signal.addEventListener('abort', () => resolve(null), { once: true });
      });
      const raced = await Promise.race([downloadPromise, abortPromise]);
      if (!raced) return null; // Aborted
      result = raced;
    } else {
      result = await downloadPromise;
    }

    if (gen !== playbackGeneration || signal?.aborted) return null;
    if (result.status !== 200) return null;
    audioCache.set(key, filename);
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
}

// ===== Play — downloads, caches, plays with ElevenLabs =====
// Returns true if audio played successfully, false if ElevenLabs failed (text-only mode)

export async function playQuestionAudio(text: string, signal?: AbortSignal, mode: VoiceMode = 'question'): Promise<boolean> {
  await stopAudio();
  const gen = playbackGeneration;
  isPlaying = true;

  try {
    await setAudioModeAsync({ playsInSilentMode: true });
    if (gen !== playbackGeneration || signal?.aborted) return false;

    const localUri = await downloadAndCache(text, mode, gen, signal);
    if (gen !== playbackGeneration || signal?.aborted) { isPlaying = false; return false; }
    if (!localUri) {
      // ElevenLabs failed — don't fall back to device voice, just return false
      isPlaying = false;
      return false;
    }

    const player = createAudioPlayer(localUri);
    if (gen !== playbackGeneration) { try { player.release(); } catch {} isPlaying = false; return false; }

    currentPlayer = player;

    return new Promise<boolean>((resolve) => {
      const done = () => {
        if (currentPlayer === player) {
          try { player.release(); } catch {}
          currentPlayer = null;
        }
        isPlaying = false;
        resolve(true);
      };

      player.addListener('playbackStatusUpdate', (status: any) => {
        if (gen !== playbackGeneration) { done(); return; }
        if (status.didJustFinish) done();
      });

      player.play();
    });
  } catch {
    isPlaying = false;
    return false;
  }
}

// ===== Convenience wrappers for voice modes =====

export async function playCoachingAudio(text: string, signal?: AbortSignal): Promise<boolean> {
  return playQuestionAudio(text, signal, 'coaching');
}

export async function playModelAudio(text: string, signal?: AbortSignal): Promise<boolean> {
  return playQuestionAudio(text, signal, 'model');
}

export async function playFollowUpAudio(text: string, signal?: AbortSignal): Promise<boolean> {
  return playQuestionAudio(text, signal, 'followup');
}

export async function playBriefingAudio(text: string, signal?: AbortSignal): Promise<boolean> {
  return playQuestionAudio(text, signal, 'briefing');
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

// Returns the voice mode appropriate for a question format
export function getQuestionVoiceMode(q: GeneratedQuestion): VoiceMode {
  const format = q.format || 'prompt';
  if (format === 'briefing' || format === 'industry') return 'briefing';
  if (format === 'pressure') return 'followup';
  return 'question';
}
