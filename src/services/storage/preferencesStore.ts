import { useSyncExternalStore } from 'react';
import type { UserPreferences } from '../../types/storage';
import { safeJsonParse } from '../../utils/security';

export const PREFERENCES_STORAGE_KEY = 'solfain:preferences:v1';

const DEFAULT_PREFERENCES: UserPreferences = {
  preferredAudio: 'sub',
  autoNext: true,
  theaterMode: false,
};

type Listener = () => void;
const listeners = new Set<Listener>();
let cachedRaw: string | null | undefined;
let cachedPrefs: UserPreferences = DEFAULT_PREFERENCES;

function sanitizePreferences(raw: unknown): UserPreferences {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return DEFAULT_PREFERENCES;
  }
  const obj = raw as Record<string, unknown>;
  return {
    preferredAudio: obj.preferredAudio === 'dub' ? 'dub' : 'sub',
    autoNext: typeof obj.autoNext === 'boolean' ? obj.autoNext : true,
    theaterMode: typeof obj.theaterMode === 'boolean' ? obj.theaterMode : false,
  };
}

function readFromStorage(): UserPreferences {
  try {
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (raw === cachedRaw) {
      return cachedPrefs;
    }
    cachedRaw = raw;
    if (!raw) {
      cachedPrefs = DEFAULT_PREFERENCES;
      return cachedPrefs;
    }
    cachedPrefs = sanitizePreferences(safeJsonParse(raw));
    return cachedPrefs;
  } catch {
    cachedRaw = null;
    cachedPrefs = DEFAULT_PREFERENCES;
    return cachedPrefs;
  }
}

function writeToStorage(prefs: UserPreferences): void {
  try {
    const serialized = JSON.stringify(prefs);
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, serialized);
    cachedRaw = serialized;
    cachedPrefs = prefs;
  } catch {
    cachedPrefs = prefs;
  }
  listeners.forEach((listener) => listener());
}

export function resetPreferencesCacheForTests(): void {
  cachedRaw = undefined;
  cachedPrefs = DEFAULT_PREFERENCES;
}

export function getUserPreferences(): UserPreferences {
  return readFromStorage();
}

export function updateUserPreferences(patch: Partial<UserPreferences>): UserPreferences {
  const current = readFromStorage();
  const next = sanitizePreferences({ ...current, ...patch });
  writeToStorage(next);
  return next;
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  const handleStorage = (event: StorageEvent) => {
    if (event.key === PREFERENCES_STORAGE_KEY || event.key === null) {
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

export function useUserPreferences() {
  const preferences = useSyncExternalStore(
    subscribe,
    readFromStorage,
    () => DEFAULT_PREFERENCES,
  );

  return {
    preferences,
    updatePreferences: updateUserPreferences,
  };
}
