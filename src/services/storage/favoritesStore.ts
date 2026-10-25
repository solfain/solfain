import { useCallback, useSyncExternalStore } from 'react';
import type { AnimeSummary } from '../../types/anime';
import type { FavoriteAnimeItem } from '../../types/storage';
import { getDisplayTitle, getReleaseYear } from '../../utils/format';

export const FAVORITES_STORAGE_KEY = 'solfain:favorites:v1';

type Listener = () => void;
const listeners = new Set<Listener>();
let cachedRaw: string | null | undefined;
let cachedItems: FavoriteAnimeItem[] = [];

function isValidFavoriteItem(value: unknown): value is FavoriteAnimeItem {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.id !== 'number' || !Number.isInteger(obj.id) || obj.id <= 0) return false;
  if (typeof obj.title !== 'string' || obj.title.trim().length === 0) return false;
  if (typeof obj.addedAt !== 'number' || !Number.isFinite(obj.addedAt)) return false;
  return true;
}

function sanitizeFavoriteItem(raw: FavoriteAnimeItem): FavoriteAnimeItem {
  return {
    id: raw.id,
    idMal: typeof raw.idMal === 'number' && Number.isInteger(raw.idMal) ? raw.idMal : null,
    title: raw.title.trim(),
    romajiTitle: typeof raw.romajiTitle === 'string' ? raw.romajiTitle : null,
    coverImage: typeof raw.coverImage === 'string' ? raw.coverImage : null,
    coverColor: typeof raw.coverColor === 'string' ? raw.coverColor : null,
    format: typeof raw.format === 'string' ? raw.format : null,
    seasonYear: typeof raw.seasonYear === 'number' ? raw.seasonYear : null,
    averageScore: typeof raw.averageScore === 'number' ? raw.averageScore : null,
    episodes: typeof raw.episodes === 'number' ? raw.episodes : null,
    addedAt: raw.addedAt,
  };
}

function readFromStorage(): FavoriteAnimeItem[] {
  try {
    const raw = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (raw === cachedRaw) {
      return cachedItems;
    }
    cachedRaw = raw;
    if (!raw) {
      cachedItems = [];
      return cachedItems;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      cachedItems = [];
      return cachedItems;
    }
    const seen = new Set<number>();
    const valid: FavoriteAnimeItem[] = [];
    for (const entry of parsed) {
      if (isValidFavoriteItem(entry) && !seen.has(entry.id)) {
        seen.add(entry.id);
        valid.push(sanitizeFavoriteItem(entry));
      }
    }
    cachedItems = valid;
    return cachedItems;
  } catch {
    cachedRaw = null;
    cachedItems = [];
    return cachedItems;
  }
}

function writeToStorage(items: FavoriteAnimeItem[]): void {
  try {
    const serialized = JSON.stringify(items);
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, serialized);
    cachedRaw = serialized;
    cachedItems = items;
  } catch {
    cachedItems = items;
  }
  listeners.forEach((listener) => listener());
}

export function resetFavoritesCacheForTests(): void {
  cachedRaw = undefined;
  cachedItems = [];
}

export function getFavorites(): FavoriteAnimeItem[] {
  return readFromStorage();
}

export function isAnimeFavorited(animeId: number): boolean {
  return readFromStorage().some((item) => item.id === animeId);
}

export function animeSummaryToFavorite(anime: AnimeSummary): FavoriteAnimeItem {
  return {
    id: anime.id,
    idMal: anime.idMal ?? null,
    title: getDisplayTitle(anime.title),
    romajiTitle: anime.title?.romaji ?? null,
    coverImage:
      anime.coverImage?.extraLarge || anime.coverImage?.large || anime.coverImage?.medium || null,
    coverColor: anime.coverImage?.color ?? null,
    format: anime.format ?? null,
    seasonYear: getReleaseYear(anime),
    averageScore: anime.averageScore ?? null,
    episodes: anime.episodes ?? null,
    addedAt: Date.now(),
  };
}

export function addFavorite(anime: AnimeSummary | FavoriteAnimeItem): void {
  const current = readFromStorage();
  if (current.some((item) => item.id === anime.id)) return;
  const entry: FavoriteAnimeItem =
    'addedAt' in anime ? sanitizeFavoriteItem(anime) : animeSummaryToFavorite(anime);
  writeToStorage([entry, ...current]);
}

export function removeFavorite(animeId: number): void {
  const current = readFromStorage();
  const next = current.filter((item) => item.id !== animeId);
  if (next.length !== current.length) {
    writeToStorage(next);
  }
}

export function toggleFavorite(anime: AnimeSummary | FavoriteAnimeItem): boolean {
  if (isAnimeFavorited(anime.id)) {
    removeFavorite(anime.id);
    return false;
  }
  addFavorite(anime);
  return true;
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  const handleStorage = (event: StorageEvent) => {
    if (event.key === FAVORITES_STORAGE_KEY || event.key === null) {
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

export function useFavorites() {
  const items = useSyncExternalStore(subscribe, readFromStorage, () => []);

  const checkFavorite = useCallback(
    (animeId: number) => items.some((entry) => entry.id === animeId),
    [items],
  );

  return {
    favorites: items,
    isFavorite: checkFavorite,
    addFavorite,
    removeFavorite,
    toggleFavorite,
  };
}
