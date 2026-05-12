import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { getTtsUrl } from './api';
import type { VoiceMode } from './api';
import type { GeneratedQuestion } from '../types';

// ===== State =====

let currentPlayer: ReturnType<typeof createAudioPlayer> | null = null;
let playbackGeneration = 0;
let isPlaying = false;
let audioModeReady = false;

const audioCache = new Map<string, string>();
const prefetchPromises = new Map<string, Promise<string | null>>();

function hashText(text: string, mode: VoiceMode = 'question'): string {
  let h = 0;
  const key = `${mode}:${text}`;
  for (let i = 0; i < key.length; i++) h = ((h << 5) - h + key.charCodeAt(i)) | 0;
  return String(Math.abs(h));
}

// Dev-only log — gated on __DEV__ so production stays silent.
function devLog(event: string, payload?: Record<string, unknown>): void {
  if (!__DEV__) return;
  // eslint-disable-next-line no-console
  console.log(`[tts] ${event}`, payload || '');
}

// Build the streaming URL the audio player consumes directly on cache miss.
// Mirrors the truncation downloadToCache uses so both paths produce the same
// hash key — important so cache fills match what was streamed.
function buildStreamUrl(text: string, mode: VoiceMode): string {
  const safeText = text.length > 800 ? text.slice(0, 800) : text;
  return getTtsUrl(safeText, mode);
}

// ===== Audio mode =====

async function ensureAudioMode(): Promise<void> {
  if (audioModeReady) return;
  try {
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
    audioModeReady = true;
  } catch {}
}

export function resetAudioModeFlag(): void { audioModeReady = false; }
export function warmUpAudioMode(): void { ensureAudioMode(); }

// ===== Stop =====

export async function stopAudio(): Promise<void> {
  playbackGeneration++;
  isPlaying = false;
  if (currentPlayer) {
    try { currentPlayer.release(); } catch {}
    currentPlayer = null;
  }
}

// ===== Download =====

function downloadToCache(text: string, mode: VoiceMode): Promise<string | null> {
  const key = hashText(text, mode);
  const cached = audioCache.get(key);
  if (cached) return Promise.resolve(cached);
  const inflight = prefetchPromises.get(key);
  if (inflight) return inflight;

  const url = buildStreamUrl(text, mode);
  const filename = `${FileSystem.cacheDirectory}tts_${key}.mp3`;
  devLog('cache fill start', { key, mode });

  const promise = FileSystem.downloadAsync(url, filename)
    .then((result) => {
      prefetchPromises.delete(key);
      if (result.status === 200) {
        audioCache.set(key, filename);
        devLog('cache fill done', { key });
        return filename;
      }
      devLog('cache fill fail', { key, status: result.status });
      return null;
    })
    .catch((e) => {
      prefetchPromises.delete(key);
      devLog('cache fill error', { key, error: String(e?.message || e) });
      return null;
    });

  prefetchPromises.set(key, promise);
  return promise;
}

// ===== Prefetch =====

export function prefetchAudio(text: string, mode: VoiceMode = 'coaching'): void {
  downloadToCache(text, mode);
}

// ===== Play =====

function playFile(source: string, gen: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (gen !== playbackGeneration) { resolve(false); return; }
    const isRemote = source.startsWith('http://') || source.startsWith('https://');
    const startedAt = __DEV__ ? Date.now() : 0;
    try {
      const player = createAudioPlayer(source);
      if (gen !== playbackGeneration) { try { player.release(); } catch {} resolve(false); return; }
      currentPlayer = player;
      let done = false;
      let started = false;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        if (currentPlayer === player) { try { player.release(); } catch {} currentPlayer = null; }
        isPlaying = false;
        resolve(ok);
      };
      const t = setTimeout(() => finish(true), 90_000);
      player.addListener('playbackStatusUpdate', (status: any) => {
        if (gen !== playbackGeneration) { clearTimeout(t); finish(false); return; }
        // Fail fast on player error — remote streams can fail mid-fetch.
        if (status?.error || status?.didFailToLoad) {
          devLog('play failed', { error: status?.error || 'didFailToLoad', isRemote });
          clearTimeout(t); finish(false); return;
        }
        if (!started && (status?.isPlaying === true)) {
          started = true;
          if (__DEV__) devLog('audio started', { ttfaMs: Date.now() - startedAt, isRemote });
        }
        if (status.didJustFinish) { clearTimeout(t); finish(true); }
      });
      player.play();
    } catch (e) {
      devLog('createAudioPlayer threw', { error: String((e as Error)?.message || e), isRemote });
      isPlaying = false;
      resolve(false);
    }
  });
}

export async function playQuestionAudio(text: string, signal?: AbortSignal, mode: VoiceMode = 'question'): Promise<boolean> {
  await stopAudio();
  const gen = playbackGeneration;
  isPlaying = true;
  try {
    await ensureAudioMode();
    if (gen !== playbackGeneration || signal?.aborted) { isPlaying = false; return false; }

    // Fast path: cache hit. Plays from local file URI — instant TTFA.
    // Any in-flight prefetch that has completed will have populated this.
    const key = hashText(text, mode);
    const cachedFile = audioCache.get(key);
    if (cachedFile) {
      devLog('cache hit', { key, mode });
      return playFile(cachedFile, gen);
    }

    // Cache miss. Stream directly from the URL instead of waiting for a full
    // download — AVPlayer (iOS) and MediaPlayer (Android) handle progressive
    // playback natively, so audio starts in ~400-700ms vs ~1-3s for full download.
    //
    // An in-flight prefetch (if any) continues in the background and populates
    // the cache for the next play of the same text. Worst case: ElevenLabs is
    // called twice for a single play; only happens on the first play before
    // prefetch completes, and only ever once per text.
    const streamUrl = buildStreamUrl(text, mode);
    devLog('stream miss', { key, mode });
    return playFile(streamUrl, gen);
  } catch (e) {
    devLog('play error', { error: String((e as Error)?.message || e) });
    isPlaying = false;
    return false;
  }
}

// ===== Wrappers =====

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
export function isAudioPlaying(): boolean { return isPlaying; }

// ===== Natural Script Builder =====
// Deterministic — same question always produces same text (critical for cache hits)

function seedFromText(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function buildNaturalScript(q: GeneratedQuestion): string {
  const seed = seedFromText(q.question);
  // Time-independent greetings — avoids cache busting when the hour changes
  const greetings = ['Alright.', 'OK.', 'Right.', 'So.', 'Hey.'];
  const greeting = greetings[seed % greetings.length];
  const format = q.format || 'prompt';
  const pick = (arr: string[]) => arr[seed % arr.length];

  if (format === 'roleplay' || format === 'pressure') {
    return `${greeting} ${pick(['Here\'s the scenario.', 'Ready? Here it is.', 'OK so picture this.'])} ${q.situation || ''} ${q.question}`;
  }
  if (format === 'briefing') {
    return `${greeting} OK, so here's some context. ${q.background || ''} Now, ${q.question}`;
  }
  if (format === 'context') {
    return `${greeting} This one's about you. ${q.question}`;
  }
  return `${greeting} ${pick(['Here\'s a question for you.', 'Tell me this.', 'I\'ve got something for you.'])} ${q.question}`;
}

export function getQuestionVoiceMode(q: GeneratedQuestion): VoiceMode {
  const format = q.format || 'prompt';
  if (format === 'briefing' || format === 'industry') return 'briefing';
  if (format === 'pressure') return 'followup';
  return 'question';
}
