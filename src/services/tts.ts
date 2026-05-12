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

// Device speech fallback via expo-speech — used only when both the cache
// hit and the streaming URL fail (network outage, provider down). Better
// than silence; users still hear the question/coaching, just in the OS
// default voice.
async function playDeviceSpeech(text: string): Promise<boolean> {
  try {
    const Speech = await import('expo-speech');
    devLog('device speech fallback', { len: text.length });
    return new Promise((resolve) => {
      Speech.speak(text, {
        language: 'en-US',
        rate: 0.95,
        onDone: () => { isPlaying = false; resolve(true); },
        onError: () => { isPlaying = false; resolve(false); },
        onStopped: () => { isPlaying = false; resolve(false); },
      });
    });
  } catch { isPlaying = false; return false; }
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
      const ok = await playFile(cachedFile, gen);
      if (!ok && gen === playbackGeneration && !signal?.aborted) return playDeviceSpeech(text);
      return ok;
    }

    // Cache miss. Stream directly from the URL — AVPlayer (iOS) and
    // MediaPlayer (Android) handle progressive playback natively, so audio
    // starts in ~400-700ms vs ~1-3s for full download.
    //
    // An in-flight prefetch (if any) continues in the background and
    // populates the cache for the next play. On the server side the response
    // is also cached, so subsequent users hitting the same text+mode are
    // served from RAM.
    const streamUrl = buildStreamUrl(text, mode);
    devLog('stream miss', { key, mode });
    const ok = await playFile(streamUrl, gen);
    // If both the stream and the cache failed, fall back to device speech
    // rather than leaving the user in silence.
    if (!ok && gen === playbackGeneration && !signal?.aborted) return playDeviceSpeech(text);
    return ok;
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

export function buildNaturalScript(q: GeneratedQuestion): string {
  // Plain script — no chatty preamble. Saves TTS chars (= cost + speed).
  // The voice and pacing carry the personality; the words don't need to.
  const format = q.format || 'prompt';
  if (format === 'roleplay' || format === 'pressure') {
    return `${q.situation || ''} ${q.question}`.trim();
  }
  if (format === 'briefing') {
    return `${q.background || ''} ${q.question}`.trim();
  }
  return q.question;
}

export function getQuestionVoiceMode(q: GeneratedQuestion): VoiceMode {
  const format = q.format || 'prompt';
  if (format === 'briefing' || format === 'industry') return 'briefing';
  if (format === 'pressure') return 'followup';
  return 'question';
}
