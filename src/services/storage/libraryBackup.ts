import type {
  FavoriteAnimeItem,
  UserPreferences,
  WatchHistoryItem,
  WatchlistEntry,
} from '../../types/storage';
import { safeJsonParse } from '../../utils/security';
import { getFavorites, importFavoritesList } from './favoritesStore';
import { getWatchHistory, importWatchHistoryList } from './historyStore';
import { getUserPreferences, updateUserPreferences } from './preferencesStore';
import {
  getWatchedEpisodesMap,
  importWatchedEpisodesMap,
  type WatchedEpisodesMap,
} from './watchedEpisodesStore';
import { getWatchlist, importWatchlistEntries } from './watchlistStore';

export interface SolfainLibraryBackup {
  app: 'solfain';
  version: 2;
  exportedAt: string;
  favorites: FavoriteAnimeItem[];
  watchlist: WatchlistEntry[];
  history: WatchHistoryItem[];
  watchedEpisodes: WatchedEpisodesMap;
  preferences: UserPreferences;
}

export interface LibraryImportSummary {
  importedFavorites: number;
  importedWatchlist: number;
  importedHistory: number;
  importedWatchedSeries: number;
}

const MAX_BACKUP_FILE_BYTES = 1_048_576; // 1 MB hard ceiling

export function createLibraryBackupPayload(): string {
  const payload: SolfainLibraryBackup = {
    app: 'solfain',
    version: 2,
    exportedAt: new Date().toISOString(),
    favorites: getFavorites(),
    watchlist: getWatchlist(),
    history: getWatchHistory(),
    watchedEpisodes: getWatchedEpisodesMap(),
    preferences: getUserPreferences(),
  };
  return JSON.stringify(payload, null, 2);
}

export function triggerLibraryBackupDownload(): void {
  const json = createLibraryBackupPayload();
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const dateStamp = new Date().toISOString().slice(0, 10);

  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = `solfain-library-${dateStamp}.json`;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export function importLibraryBackupJson(rawJson: string): LibraryImportSummary {
  const parsed = safeJsonParse(rawJson, MAX_BACKUP_FILE_BYTES);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid backup format: expected a Solfain JSON backup object.');
  }

  const record = parsed as Record<string, unknown>;
  const hasFavoritesArray = Array.isArray(record.favorites);
  const hasWatchlistArray = Array.isArray(record.watchlist);
  const hasHistoryArray = Array.isArray(record.history);
  const hasWatchedMap = Boolean(
    record.watchedEpisodes &&
      typeof record.watchedEpisodes === 'object' &&
      !Array.isArray(record.watchedEpisodes),
  );

  if (!hasFavoritesArray && !hasWatchlistArray && !hasHistoryArray && !hasWatchedMap) {
    throw new Error('Backup file does not contain any valid Solfain library collections.');
  }

  const importedFavorites = hasFavoritesArray
    ? importFavoritesList(record.favorites as unknown[])
    : 0;
  const importedWatchlist = hasWatchlistArray
    ? importWatchlistEntries(record.watchlist as unknown[])
    : 0;
  const importedHistory = hasHistoryArray
    ? importWatchHistoryList(record.history as unknown[])
    : 0;
  const importedWatchedSeries = hasWatchedMap
    ? importWatchedEpisodesMap(record.watchedEpisodes)
    : 0;

  if (record.preferences && typeof record.preferences === 'object') {
    updateUserPreferences(record.preferences as Partial<UserPreferences>);
  }

  return {
    importedFavorites,
    importedWatchlist,
    importedHistory,
    importedWatchedSeries,
  };
}
