import type { FavoriteAnimeItem, WatchHistoryItem } from '../../types/storage';
import { safeJsonParse } from '../../utils/security';
import { getFavorites, importFavoritesList } from './favoritesStore';
import { getWatchHistory, importWatchHistoryList } from './historyStore';

export interface SolfainLibraryBackup {
  app: 'solfain';
  version: 1;
  exportedAt: string;
  favorites: FavoriteAnimeItem[];
  history: WatchHistoryItem[];
}

export interface LibraryImportSummary {
  importedFavorites: number;
  importedHistory: number;
}

const MAX_BACKUP_FILE_BYTES = 1_048_576; // 1 MB hard ceiling

export function createLibraryBackupPayload(): string {
  const payload: SolfainLibraryBackup = {
    app: 'solfain',
    version: 1,
    exportedAt: new Date().toISOString(),
    favorites: getFavorites(),
    history: getWatchHistory(),
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
  const hasHistoryArray = Array.isArray(record.history);

  if (!hasFavoritesArray && !hasHistoryArray) {
    throw new Error('Backup file does not contain any favorites or watch history arrays.');
  }

  const importedFavorites = hasFavoritesArray ? importFavoritesList(record.favorites as unknown[]) : 0;
  const importedHistory = hasHistoryArray ? importWatchHistoryList(record.history as unknown[]) : 0;

  return {
    importedFavorites,
    importedHistory,
  };
}
