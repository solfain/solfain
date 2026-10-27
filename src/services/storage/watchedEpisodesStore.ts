import { useCallback, useSyncExternalStore } from 'react';
import { safeJsonParse } from '../../utils/security';

export const WATCHED_EPISODES_STORAGE_KEY = 'solfain:watched-episodes:v1';
const MAX_TRACKED_ANIME = 500;
const MAX_EPISODES_PER_ANIME = 2500;

export type WatchedEpisodesMap = Record<string, number[]>;

type Listener = () => void;
const listeners = new Set<Listener>();
let cachedRaw: string | null | undefined;
let cachedMap: WatchedEpisodesMap = {};

function sanitizeEpisodeArray(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const unique = new Set<number>();
  for (const val of raw) {
    if (typeof val === 'number' && Number.isInteger(val) && val >= 1 && val <= 10_000) {
      unique.add(val);
      if (unique.size >= MAX_EPISODES_PER_ANIME) break;
    }
  }
  return Array.from(unique).sort((a, b) => a - b);
}

function readFromStorage(): WatchedEpisodesMap {
  try {
    const raw = window.localStorage.getItem(WATCHED_EPISODES_STORAGE_KEY);
    if (raw === cachedRaw) {
      return cachedMap;
    }
    cachedRaw = raw;
    if (!raw) {
      cachedMap = {};
      return cachedMap;
    }
    const parsed = safeJsonParse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      cachedMap = {};
      return cachedMap;
    }
    const clean: WatchedEpisodesMap = {};
    let count = 0;
    for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
      const numericId = Number.parseInt(key, 10);
      if (!Number.isInteger(numericId) || numericId <= 0) continue;
      const eps = sanitizeEpisodeArray(val);
      if (eps.length > 0) {
        clean[String(numericId)] = eps;
        count += 1;
        if (count >= MAX_TRACKED_ANIME) break;
      }
    }
    cachedMap = clean;
    return cachedMap;
  } catch {
    cachedRaw = null;
    cachedMap = {};
    return cachedMap;
  }
}

function writeToStorage(nextMap: WatchedEpisodesMap): void {
  try {
    const serialized = JSON.stringify(nextMap);
    window.localStorage.setItem(WATCHED_EPISODES_STORAGE_KEY, serialized);
    cachedRaw = serialized;
    cachedMap = nextMap;
  } catch {
    cachedMap = nextMap;
  }
  listeners.forEach((listener) => listener());
}

export function resetWatchedEpisodesCacheForTests(): void {
  cachedRaw = undefined;
  cachedMap = {};
}

export function getWatchedEpisodesMap(): WatchedEpisodesMap {
  return readFromStorage();
}

export function getWatchedEpisodesForAnime(animeId: number): number[] {
  return readFromStorage()[String(animeId)] ?? [];
}

export function markEpisodeWatched(animeId: number, episodeNumber: number): void {
  if (!Number.isInteger(animeId) || animeId <= 0) return;
  if (!Number.isInteger(episodeNumber) || episodeNumber < 1 || episodeNumber > 10_000) return;

  const current = readFromStorage();
  const key = String(animeId);
  const existing = current[key] ?? [];
  if (existing.includes(episodeNumber)) return;

  const updated = [...existing, episodeNumber].sort((a, b) => a - b);
  writeToStorage({
    ...current,
    [key]: updated.slice(0, MAX_EPISODES_PER_ANIME),
  });
}

export function toggleEpisodeWatched(animeId: number, episodeNumber: number): boolean {
  if (!Number.isInteger(animeId) || animeId <= 0) return false;
  if (!Number.isInteger(episodeNumber) || episodeNumber < 1 || episodeNumber > 10_000) return false;

  const current = readFromStorage();
  const key = String(animeId);
  const existing = current[key] ?? [];
  const isAlreadyWatched = existing.includes(episodeNumber);

  const nextList = isAlreadyWatched
    ? existing.filter((ep) => ep !== episodeNumber)
    : [...existing, episodeNumber].sort((a, b) => a - b);

  const nextMap = { ...current };
  if (nextList.length === 0) {
    delete nextMap[key];
  } else {
    nextMap[key] = nextList.slice(0, MAX_EPISODES_PER_ANIME);
  }
  writeToStorage(nextMap);
  return !isAlreadyWatched;
}

export function importWatchedEpisodesMap(rawMap: unknown): number {
  if (!rawMap || typeof rawMap !== 'object' || Array.isArray(rawMap)) return 0;
  const current = readFromStorage();
  const nextMap: WatchedEpisodesMap = { ...current };
  let importedSeries = 0;

  for (const [key, val] of Object.entries(rawMap as Record<string, unknown>)) {
    const numericId = Number.parseInt(key, 10);
    if (!Number.isInteger(numericId) || numericId <= 0) continue;
    const incoming = sanitizeEpisodeArray(val);
    if (incoming.length === 0) continue;
    const k = String(numericId);
    const merged = Array.from(new Set([...(nextMap[k] ?? []), ...incoming])).sort((a, b) => a - b);
    if (merged.length !== (nextMap[k]?.length ?? 0)) {
      nextMap[k] = merged.slice(0, MAX_EPISODES_PER_ANIME);
      importedSeries += 1;
    }
  }

  if (importedSeries > 0) {
    writeToStorage(nextMap);
  }
  return importedSeries;
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  const handleStorage = (event: StorageEvent) => {
    if (event.key === WATCHED_EPISODES_STORAGE_KEY || event.key === null) {
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

const EMPTY_EPISODES: number[] = [];
const EMPTY_MAP: WatchedEpisodesMap = {};

export function useWatchedEpisodes(animeId: number) {
  const map = useSyncExternalStore<WatchedEpisodesMap>(
    subscribe,
    readFromStorage,
    () => EMPTY_MAP,
  );
  const watchedList = map[String(animeId)] ?? EMPTY_EPISODES;

  const isEpisodeWatched = useCallback(
    (epNumber: number) => watchedList.includes(epNumber),
    [watchedList],
  );

  return {
    watchedEpisodes: watchedList,
    isEpisodeWatched,
    markEpisodeWatched: (ep: number) => markEpisodeWatched(animeId, ep),
    toggleEpisodeWatched: (ep: number) => toggleEpisodeWatched(animeId, ep),
  };
}
