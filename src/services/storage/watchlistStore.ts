import { useCallback, useSyncExternalStore } from 'react';
import type { AnimeSummary } from '../../types/anime';
import type { FavoriteAnimeItem, WatchlistEntry, WatchlistStatus } from '../../types/storage';
import { getDisplayTitle, getReleaseYear } from '../../utils/format';
import {
  safeJsonParse,
  sanitizeHexColor,
  sanitizeHttpUrl,
  sanitizePlainText,
} from '../../utils/security';

export const WATCHLIST_STORAGE_KEY = 'solfain:watchlist:v1';
const MAX_WATCHLIST_ENTRIES = 800;

export const WATCHLIST_STATUS_LABELS: Record<WatchlistStatus, string> = {
  watching: 'Watching',
  plan_to_watch: 'Plan to Watch',
  completed: 'Completed',
  on_hold: 'On Hold',
  dropped: 'Dropped',
};

const VALID_STATUSES = new Set<WatchlistStatus>([
  'watching',
  'plan_to_watch',
  'completed',
  'on_hold',
  'dropped',
]);

type Listener = () => void;
const listeners = new Set<Listener>();
let cachedRaw: string | null | undefined;
let cachedItems: WatchlistEntry[] = [];

function isValidStatus(value: unknown): value is WatchlistStatus {
  return typeof value === 'string' && VALID_STATUSES.has(value as WatchlistStatus);
}

function isValidWatchlistEntry(value: unknown): value is WatchlistEntry {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.id !== 'number' || !Number.isInteger(obj.id) || obj.id <= 0) return false;
  if (typeof obj.title !== 'string' || sanitizePlainText(obj.title).length === 0) return false;
  if (!isValidStatus(obj.status)) return false;
  if (typeof obj.updatedAt !== 'number' || !Number.isFinite(obj.updatedAt) || obj.updatedAt < 0) {
    return false;
  }
  return true;
}

function sanitizeWatchlistEntry(raw: WatchlistEntry): WatchlistEntry {
  const episodes =
    typeof raw.episodes === 'number' && Number.isInteger(raw.episodes) && raw.episodes > 0
      ? raw.episodes
      : null;

  const rawWatched =
    typeof raw.watchedEpisodes === 'number' &&
    Number.isInteger(raw.watchedEpisodes) &&
    raw.watchedEpisodes >= 0
      ? raw.watchedEpisodes
      : 0;
  const watchedEpisodes = episodes
    ? Math.min(episodes, rawWatched)
    : Math.min(10_000, rawWatched);

  const personalScore =
    typeof raw.personalScore === 'number' &&
    Number.isInteger(raw.personalScore) &&
    raw.personalScore >= 1 &&
    raw.personalScore <= 10
      ? raw.personalScore
      : null;

  return {
    id: raw.id,
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
    coverColor: sanitizeHexColor(raw.coverColor),
    format:
      typeof raw.format === 'string' ? sanitizePlainText(raw.format, 40) || null : null,
    seasonYear:
      typeof raw.seasonYear === 'number' &&
      Number.isInteger(raw.seasonYear) &&
      raw.seasonYear >= 1900 &&
      raw.seasonYear <= 2100
        ? raw.seasonYear
        : null,
    averageScore:
      typeof raw.averageScore === 'number' &&
      Number.isFinite(raw.averageScore) &&
      raw.averageScore >= 0 &&
      raw.averageScore <= 100
        ? raw.averageScore
        : null,
    episodes,
    status: raw.status,
    watchedEpisodes,
    personalScore,
    updatedAt: raw.updatedAt,
  };
}

function readFromStorage(): WatchlistEntry[] {
  try {
    const raw = window.localStorage.getItem(WATCHLIST_STORAGE_KEY);
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
    const valid: WatchlistEntry[] = [];
    for (const item of parsed) {
      if (isValidWatchlistEntry(item) && !seen.has(item.id)) {
        seen.add(item.id);
        valid.push(sanitizeWatchlistEntry(item));
        if (valid.length >= MAX_WATCHLIST_ENTRIES) break;
      }
    }
    valid.sort((a, b) => b.updatedAt - a.updatedAt);
    cachedItems = valid;
    return cachedItems;
  } catch {
    cachedRaw = null;
    cachedItems = [];
    return cachedItems;
  }
}

function writeToStorage(items: WatchlistEntry[]): void {
  const bounded = items.slice(0, MAX_WATCHLIST_ENTRIES);
  try {
    const serialized = JSON.stringify(bounded);
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, serialized);
    cachedRaw = serialized;
    cachedItems = bounded;
  } catch {
    cachedItems = bounded;
  }
  listeners.forEach((listener) => listener());
}

export function resetWatchlistCacheForTests(): void {
  cachedRaw = undefined;
  cachedItems = [];
}

export function getWatchlist(): WatchlistEntry[] {
  return readFromStorage();
}

export function getWatchlistEntry(animeId: number): WatchlistEntry | null {
  return readFromStorage().find((item) => item.id === animeId) ?? null;
}

function toBaseFields(
  source: AnimeSummary | FavoriteAnimeItem | WatchlistEntry,
): Omit<WatchlistEntry, 'status' | 'watchedEpisodes' | 'personalScore' | 'updatedAt'> {
  if ('status' in source && 'watchedEpisodes' in source) {
    return {
      id: source.id,
      idMal: source.idMal,
      title: source.title,
      romajiTitle: source.romajiTitle,
      coverImage: source.coverImage,
      coverColor: source.coverColor,
      format: source.format,
      seasonYear: source.seasonYear,
      averageScore: source.averageScore,
      episodes: source.episodes,
    };
  }

  if ('addedAt' in source) {
    return {
      id: source.id,
      idMal: source.idMal,
      title: source.title,
      romajiTitle: source.romajiTitle,
      coverImage: source.coverImage,
      coverColor: source.coverColor,
      format: source.format,
      seasonYear: source.seasonYear,
      averageScore: source.averageScore,
      episodes: source.episodes,
    };
  }

  return {
    id: source.id,
    idMal: source.idMal ?? null,
    title: getDisplayTitle(source.title),
    romajiTitle: source.title?.romaji ?? null,
    coverImage:
      source.coverImage?.large || source.coverImage?.extraLarge || source.coverImage?.medium || null,
    coverColor: source.coverImage?.color ?? null,
    format: source.format ?? null,
    seasonYear: getReleaseYear(source),
    averageScore: source.averageScore ?? null,
    episodes: source.episodes ?? null,
  };
}

export function setWatchlistStatus(
  anime: AnimeSummary | FavoriteAnimeItem | WatchlistEntry,
  status: WatchlistStatus,
): void {
  const current = readFromStorage();
  const existing = current.find((item) => item.id === anime.id);
  const base = toBaseFields(anime);
  const totalEps = base.episodes ?? existing?.episodes ?? null;

  let nextWatched = existing?.watchedEpisodes ?? 0;
  if (status === 'completed' && totalEps && totalEps > 0) {
    nextWatched = totalEps;
  }

  const entry = sanitizeWatchlistEntry({
    ...base,
    episodes: totalEps,
    status,
    watchedEpisodes: nextWatched,
    personalScore: existing?.personalScore ?? null,
    updatedAt: Date.now(),
  });

  const remaining = current.filter((item) => item.id !== anime.id);
  writeToStorage([entry, ...remaining]);
}

export function updateWatchlistDetails(
  animeId: number,
  patch: {
    status?: WatchlistStatus;
    watchedEpisodes?: number;
    personalScore?: number | null;
  },
): void {
  const current = readFromStorage();
  const idx = current.findIndex((item) => item.id === animeId);
  if (idx === -1) return;

  const prev = current[idx];
  const nextStatus = patch.status ?? prev.status;
  let nextWatched =
    patch.watchedEpisodes !== undefined ? patch.watchedEpisodes : prev.watchedEpisodes;
  if (nextStatus === 'completed' && prev.episodes && prev.episodes > 0 && patch.watchedEpisodes === undefined) {
    nextWatched = prev.episodes;
  }

  const updated = sanitizeWatchlistEntry({
    ...prev,
    status: nextStatus,
    watchedEpisodes: nextWatched,
    personalScore:
      patch.personalScore !== undefined ? patch.personalScore : prev.personalScore,
    updatedAt: Date.now(),
  });

  const remaining = current.filter((item) => item.id !== animeId);
  writeToStorage([updated, ...remaining]);
}

export function removeWatchlistEntry(animeId: number): void {
  const current = readFromStorage();
  const next = current.filter((item) => item.id !== animeId);
  if (next.length !== current.length) {
    writeToStorage(next);
  }
}

/**
 * If an anime is already tracked in the user's watchlist (e.g., Plan to Watch
 * or Watching), opening an episode updates watched progress automatically.
 */
export function syncWatchlistOnEpisodeVisit(anime: AnimeSummary, episode: number): void {
  if (!Number.isInteger(episode) || episode < 1) return;
  const current = readFromStorage();
  const existing = current.find((item) => item.id === anime.id);
  if (!existing) return;

  const totalEps = anime.episodes ?? existing.episodes ?? null;
  const nextWatched = Math.max(existing.watchedEpisodes, episode);
  const autoComplete =
    totalEps && totalEps > 0 && nextWatched >= totalEps && anime.status === 'FINISHED';

  const nextStatus: WatchlistStatus = autoComplete
    ? 'completed'
    : existing.status === 'plan_to_watch'
      ? 'watching'
      : existing.status;

  if (nextWatched === existing.watchedEpisodes && nextStatus === existing.status) {
    return;
  }

  const updated = sanitizeWatchlistEntry({
    ...existing,
    episodes: totalEps,
    status: nextStatus,
    watchedEpisodes: nextWatched,
    updatedAt: Date.now(),
  });

  const remaining = current.filter((item) => item.id !== anime.id);
  writeToStorage([updated, ...remaining]);
}

export function importWatchlistEntries(entries: unknown[]): number {
  if (!Array.isArray(entries)) return 0;
  const current = readFromStorage();
  const byId = new Map<number, WatchlistEntry>();
  for (const item of current) {
    byId.set(item.id, item);
  }

  let imported = 0;
  for (const raw of entries) {
    if (!isValidWatchlistEntry(raw)) continue;
    const clean = sanitizeWatchlistEntry(raw);
    const existing = byId.get(clean.id);
    if (!existing || clean.updatedAt > existing.updatedAt) {
      byId.set(clean.id, clean);
      imported += 1;
    }
  }

  if (imported > 0) {
    const merged = Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt);
    writeToStorage(merged);
  }
  return imported;
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  const handleStorage = (event: StorageEvent) => {
    if (event.key === WATCHLIST_STORAGE_KEY || event.key === null) {
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

export function useWatchlist() {
  const items = useSyncExternalStore(subscribe, readFromStorage, () => []);

  const getEntry = useCallback(
    (animeId: number) => items.find((entry) => entry.id === animeId) ?? null,
    [items],
  );

  return {
    watchlist: items,
    getEntry,
    setWatchlistStatus,
    updateWatchlistDetails,
    removeWatchlistEntry,
  };
}
