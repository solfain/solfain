import { useSyncExternalStore } from 'react';
import type { AnimeSummary } from '../../types/anime';
import type { AudioTrack } from '../../types/provider';
import type { WatchHistoryItem } from '../../types/storage';
import { getDisplayTitle } from '../../utils/format';
import { safeJsonParse, sanitizeHttpUrl, sanitizePlainText } from '../../utils/security';

export const WATCH_HISTORY_STORAGE_KEY = 'solfain:watch-history:v1';
const MAX_HISTORY_ENTRIES = 80;
const MAX_VALID_MEDIA_SECONDS = 86_400; // 24h ceiling against malformed telemetry

type Listener = () => void;
const listeners = new Set<Listener>();
let cachedRaw: string | null | undefined;
let cachedItems: WatchHistoryItem[] = [];

function isValidHistoryItem(value: unknown): value is WatchHistoryItem {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.animeId !== 'number' || !Number.isInteger(obj.animeId) || obj.animeId <= 0) {
    return false;
  }
  if (typeof obj.title !== 'string' || sanitizePlainText(obj.title).length === 0) return false;
  if (
    typeof obj.episode !== 'number' ||
    !Number.isInteger(obj.episode) ||
    obj.episode < 1 ||
    obj.episode > 10_000
  ) {
    return false;
  }
  if (typeof obj.visitedAt !== 'number' || !Number.isFinite(obj.visitedAt) || obj.visitedAt < 0) {
    return false;
  }
  return true;
}

function sanitizeHistoryItem(raw: WatchHistoryItem): WatchHistoryItem {
  const audio: AudioTrack = raw.audio === 'dub' ? 'dub' : 'sub';
  const progressSeconds =
    typeof raw.progressSeconds === 'number' &&
    Number.isFinite(raw.progressSeconds) &&
    raw.progressSeconds > 0
      ? Math.min(MAX_VALID_MEDIA_SECONDS, Math.floor(raw.progressSeconds))
      : null;
  const durationSeconds =
    typeof raw.durationSeconds === 'number' &&
    Number.isFinite(raw.durationSeconds) &&
    raw.durationSeconds > 0
      ? Math.min(MAX_VALID_MEDIA_SECONDS, Math.floor(raw.durationSeconds))
      : null;

  return {
    animeId: raw.animeId,
    idMal:
      typeof raw.idMal === 'number' && Number.isInteger(raw.idMal) && raw.idMal > 0
        ? raw.idMal
        : null,
    title: sanitizePlainText(raw.title, 260) || 'Untitled Anime',
    romajiTitle:
      typeof raw.romajiTitle === 'string'
        ? sanitizePlainText(raw.romajiTitle, 260) || null
        : null,
    coverImage: sanitizeHttpUrl(raw.coverImage, { httpsOnly: true }),
    bannerImage: sanitizeHttpUrl(raw.bannerImage, { httpsOnly: true }),
    format:
      typeof raw.format === 'string' ? sanitizePlainText(raw.format, 40) || null : null,
    episode: raw.episode,
    episodeTitle:
      typeof raw.episodeTitle === 'string'
        ? sanitizePlainText(raw.episodeTitle, 240) || null
        : null,
    totalEpisodes:
      typeof raw.totalEpisodes === 'number' &&
      Number.isInteger(raw.totalEpisodes) &&
      raw.totalEpisodes > 0
        ? raw.totalEpisodes
        : null,
    audio,
    visitedAt: raw.visitedAt,
    progressSeconds,
    durationSeconds,
  };
}

function readFromStorage(): WatchHistoryItem[] {
  try {
    const raw = window.localStorage.getItem(WATCH_HISTORY_STORAGE_KEY);
    if (raw === cachedRaw) {
      return cachedItems;
    }
    cachedRaw = raw;
    if (!raw) {
      cachedItems = [];
      return cachedItems;
    }
    const parsed: unknown = safeJsonParse(raw);
    if (!Array.isArray(parsed)) {
      cachedItems = [];
      return cachedItems;
    }
    const seen = new Set<number>();
    const valid: WatchHistoryItem[] = [];
    for (const entry of parsed) {
      if (isValidHistoryItem(entry) && !seen.has(entry.animeId)) {
        seen.add(entry.animeId);
        valid.push(sanitizeHistoryItem(entry));
      }
    }
    valid.sort((a, b) => b.visitedAt - a.visitedAt);
    cachedItems = valid.slice(0, MAX_HISTORY_ENTRIES);
    return cachedItems;
  } catch {
    cachedRaw = null;
    cachedItems = [];
    return cachedItems;
  }
}

function writeToStorage(items: WatchHistoryItem[]): void {
  const trimmed = items.slice(0, MAX_HISTORY_ENTRIES);
  try {
    const serialized = JSON.stringify(trimmed);
    window.localStorage.setItem(WATCH_HISTORY_STORAGE_KEY, serialized);
    cachedRaw = serialized;
    cachedItems = trimmed;
  } catch {
    cachedItems = trimmed;
  }
  listeners.forEach((listener) => listener());
}

export function resetHistoryCacheForTests(): void {
  cachedRaw = undefined;
  cachedItems = [];
}

export function getWatchHistory(): WatchHistoryItem[] {
  return readFromStorage();
}

export function getHistoryEntryForAnime(animeId: number): WatchHistoryItem | null {
  return readFromStorage().find((item) => item.animeId === animeId) ?? null;
}

export interface RecordWatchVisitInput {
  anime: AnimeSummary;
  episode: number;
  episodeTitle?: string | null;
  audio: AudioTrack;
}

export function recordWatchVisit(input: RecordWatchVisitInput): void {
  const { anime, episode, episodeTitle, audio } = input;
  if (!Number.isInteger(episode) || episode < 1) return;

  const current = readFromStorage();
  const existing = current.find((item) => item.animeId === anime.id);
  const sameEpisode = existing?.episode === episode;

  const updatedEntry: WatchHistoryItem = sanitizeHistoryItem({
    animeId: anime.id,
    idMal: anime.idMal ?? null,
    title: getDisplayTitle(anime.title),
    romajiTitle: anime.title?.romaji ?? null,
    coverImage:
      anime.coverImage?.large || anime.coverImage?.extraLarge || anime.coverImage?.medium || null,
    bannerImage: anime.bannerImage ?? null,
    format: anime.format ?? null,
    episode,
    episodeTitle: episodeTitle ?? (sameEpisode ? existing?.episodeTitle ?? null : null),
    totalEpisodes: anime.episodes ?? null,
    audio,
    visitedAt: Date.now(),
    progressSeconds: sameEpisode ? existing?.progressSeconds ?? null : null,
    durationSeconds: sameEpisode ? existing?.durationSeconds ?? null : null,
  });

  const remaining = current.filter((item) => item.animeId !== anime.id);
  writeToStorage([updatedEntry, ...remaining]);
}

export function updateVerifiedPlaybackProgress(params: {
  animeId: number;
  episode: number;
  progressSeconds: number;
  durationSeconds: number;
  force?: boolean;
}): void {
  const { animeId, episode, progressSeconds, durationSeconds, force = false } = params;
  if (
    !Number.isFinite(progressSeconds) ||
    progressSeconds <= 0 ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0
  ) {
    return;
  }

  const nextProgress = Math.min(MAX_VALID_MEDIA_SECONDS, Math.floor(progressSeconds));
  const nextDuration = Math.min(MAX_VALID_MEDIA_SECONDS, Math.floor(durationSeconds));

  const current = readFromStorage();
  const idx = current.findIndex((item) => item.animeId === animeId && item.episode === episode);
  if (idx === -1) return;

  const prevProgress = current[idx].progressSeconds;
  // Throttle frequent `timeupdate` writes unless delta >= 5s or forced (pause/seeked/ended)
  if (!force && prevProgress !== null && Math.abs(nextProgress - prevProgress) < 5) {
    return;
  }

  const next = [...current];
  next[idx] = {
    ...next[idx],
    progressSeconds: nextProgress,
    durationSeconds: nextDuration,
    visitedAt: Date.now(),
  };
  writeToStorage(next);
}

export function removeHistoryEntry(animeId: number): void {
  const current = readFromStorage();
  const next = current.filter((item) => item.animeId !== animeId);
  if (next.length !== current.length) {
    writeToStorage(next);
  }
}

export function clearWatchHistory(): void {
  writeToStorage([]);
}

/**
 * Safely merges imported watch history entries after schema and URL sanitization.
 */
export function importWatchHistoryList(entries: unknown[]): number {
  if (!Array.isArray(entries)) return 0;
  const current = readFromStorage();
  const byAnimeId = new Map<number, WatchHistoryItem>();
  for (const item of current) {
    byAnimeId.set(item.animeId, item);
  }

  let importedCount = 0;
  for (const rawEntry of entries) {
    if (!isValidHistoryItem(rawEntry)) continue;
    const clean = sanitizeHistoryItem(rawEntry);
    const existing = byAnimeId.get(clean.animeId);
    if (!existing || clean.visitedAt > existing.visitedAt) {
      byAnimeId.set(clean.animeId, clean);
      importedCount += 1;
    }
  }

  if (importedCount > 0) {
    const merged = Array.from(byAnimeId.values()).sort((a, b) => b.visitedAt - a.visitedAt);
    writeToStorage(merged);
  }

  return importedCount;
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  const handleStorage = (event: StorageEvent) => {
    if (event.key === WATCH_HISTORY_STORAGE_KEY || event.key === null) {
      cachedRaw = undefined;
      listener();
    }
  };
  window.addEventListener('storage', handleStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', handleStorage);
  };
}

export function useWatchHistory() {
  const history = useSyncExternalStore(subscribe, readFromStorage, () => []);

  return {
    history,
    getEntryForAnime: (animeId: number) =>
      history.find((item) => item.animeId === animeId) ?? null,
    recordWatchVisit,
    updateVerifiedPlaybackProgress,
    removeHistoryEntry,
    clearWatchHistory,
  };
}
