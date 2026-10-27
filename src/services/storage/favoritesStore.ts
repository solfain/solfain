import { useCallback, useSyncExternalStore } from 'react';
import type { AnimeSummary } from '../../types/anime';
import type { FavoriteAnimeItem } from '../../types/storage';
import { getDisplayTitle, getReleaseYear } from '../../utils/format';
import {
  safeJsonParse,
  sanitizeHexColor,
  sanitizeHttpUrl,
  sanitizePlainText,
} from '../../utils/security';

export const FAVORITES_STORAGE_KEY = 'solfain:favorites:v1';
const MAX_FAVORITES_ENTRIES = 500;

type Listener = () => void;
const listeners = new Set<Listener>();
let cachedRaw: string | null | undefined;
let cachedItems: FavoriteAnimeItem[] = [];

function isValidFavoriteItem(value: unknown): value is FavoriteAnimeItem {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.id !== 'number' || !Number.isInteger(obj.id) || obj.id <= 0) return false;
  if (typeof obj.title !== 'string' || sanitizePlainText(obj.title).length === 0) return false;
  if (typeof obj.addedAt !== 'number' || !Number.isFinite(obj.addedAt) || obj.addedAt < 0) {
    return false;
  }
  return true;
}

function sanitizeFavoriteItem(raw: FavoriteAnimeItem): FavoriteAnimeItem {
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
    episodes:
      typeof raw.episodes === 'number' && Number.isInteger(raw.episodes) && raw.episodes > 0
        ? raw.episodes
        : null,
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
    const parsed: unknown = safeJsonParse(raw);
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
        if (valid.length >= MAX_FAVORITES_ENTRIES) break;
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
  const bounded = items.slice(0, MAX_FAVORITES_ENTRIES);
  try {
    const serialized = JSON.stringify(bounded);
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, serialized);
    cachedRaw = serialized;
    cachedItems = bounded;
  } catch {
    cachedItems = bounded;
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
  return sanitizeFavoriteItem({
    id: anime.id,
    idMal: anime.idMal ?? null,
    title: getDisplayTitle(anime.title),
    romajiTitle: anime.title?.romaji ?? null,
    coverImage:
      anime.coverImage?.large || anime.coverImage?.extraLarge || anime.coverImage?.medium || null,
    coverColor: anime.coverImage?.color ?? null,
    format: anime.format ?? null,
    seasonYear: getReleaseYear(anime),
    averageScore: anime.averageScore ?? null,
    episodes: anime.episodes ?? null,
    addedAt: Date.now(),
  });
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

/**
 * Safely merges an array of imported favorite entries after strict schema and
 * URL/color sanitization. Returns how many new or updated items were merged.
 */
export function importFavoritesList(entries: unknown[]): number {
  if (!Array.isArray(entries)) return 0;
  const current = readFromStorage();
  const byId = new Map<number, FavoriteAnimeItem>();
  for (const item of current) {
    byId.set(item.id, item);
  }

  let importedCount = 0;
  for (const rawEntry of entries) {
    if (!isValidFavoriteItem(rawEntry)) continue;
    const clean = sanitizeFavoriteItem(rawEntry);
    if (!byId.has(clean.id)) {
      byId.set(clean.id, clean);
      importedCount += 1;
    }
  }

  if (importedCount > 0) {
    const merged = Array.from(byId.values()).sort((a, b) => b.addedAt - a.addedAt);
    writeToStorage(merged);
  }

  return importedCount;
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
