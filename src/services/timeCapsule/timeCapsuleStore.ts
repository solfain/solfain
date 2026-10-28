import { useCallback, useSyncExternalStore } from 'react';
import type { AnimeSummary } from '../../types/anime';
import type {
  FavoriteAnimeItem,
  WatchlistEntry,
  WatchlistStatus,
} from '../../types/storage';
import type {
  CapsuleAnimeRef,
  CapsulePredictionItem,
  CapsuleReminderConfig,
  CapsuleWatchlistSnapshotItem,
  PredictionCategory,
  PredictionOutcome,
  TimeCapsuleHorizonPreset,
  TimeCapsuleSnapshot,
} from '../../types/timeCapsule';
import { getDisplayTitle, getReleaseYear } from '../../utils/format';
import {
  safeJsonParse,
  sanitizeHexColor,
  sanitizeHttpUrl,
  sanitizePlainText,
} from '../../utils/security';
import { getFavorites } from '../storage/favoritesStore';
import { getWatchHistory } from '../storage/historyStore';
import { getWatchedEpisodesMap } from '../storage/watchedEpisodesStore';
import { getWatchlist } from '../storage/watchlistStore';

export const TIME_CAPSULES_STORAGE_KEY = 'solfain:time-capsules:v1';
const MAX_CAPSULES = 30;
const MAX_SNAPSHOT_FAVORITES = 250;
const MAX_SNAPSHOT_WATCHLIST = 500;
const MAX_PREDICTIONS_PER_CAPSULE = 20;

export const PREDICTION_CATEGORY_LABELS: Record<PredictionCategory, string> = {
  aoty: 'Anime of the Season / Year',
  rating_shift: 'Score / Hold-Up Call',
  completion: 'Backlog / Completion Goal',
  sequel_or_adaptation: 'Sequel / Plot Prediction',
  custom: 'Personal Taste Prediction',
};

export const PREDICTION_OUTCOME_LABELS: Record<PredictionOutcome, string> = {
  pending: 'Unjudged',
  hit: 'Came True',
  partial: 'Partially True',
  miss: 'Missed',
};

const VALID_HORIZONS = new Set<TimeCapsuleHorizonPreset>(['3m', '6m', '1y', 'custom']);
const VALID_CATEGORIES = new Set<PredictionCategory>([
  'aoty',
  'rating_shift',
  'completion',
  'sequel_or_adaptation',
  'custom',
]);
const VALID_OUTCOMES = new Set<PredictionOutcome>(['pending', 'hit', 'partial', 'miss']);
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
let cachedCapsules: TimeCapsuleSnapshot[] = [];

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID().slice(0, 12)}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Adds exact calendar months while clamping end-of-month overflow cleanly
 * (e.g. Aug 31 + 6 months -> Feb 28/29 instead of Mar 3).
 */
export function addCalendarMonths(baseMs: number, monthsToAdd: number): number {
  const base = new Date(baseMs);
  const year = base.getFullYear();
  const month = base.getMonth();
  const day = base.getDate();

  const targetMonthIndex = month + monthsToAdd;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;

  const daysInTargetMonth = new Date(targetYear, normalizedMonth + 1, 0).getDate();
  const clampedDay = Math.min(day, daysInTargetMonth);

  const result = new Date(baseMs);
  result.setFullYear(targetYear, normalizedMonth, clampedDay);
  return result.getTime();
}

export function computeUnlockTimestampFromPreset(
  preset: Exclude<TimeCapsuleHorizonPreset, 'custom'>,
  nowMs = Date.now(),
): number {
  switch (preset) {
    case '3m':
      return addCalendarMonths(nowMs, 3);
    case '6m':
      return addCalendarMonths(nowMs, 6);
    case '1y':
      return addCalendarMonths(nowMs, 12);
  }
}

export function toCapsuleAnimeRef(
  source: AnimeSummary | FavoriteAnimeItem | WatchlistEntry | CapsuleAnimeRef,
): CapsuleAnimeRef {
  if ('title' in source && typeof source.title === 'object' && source.title !== null) {
    const summary = source as AnimeSummary;
    return sanitizeAnimeRef({
      id: summary.id,
      idMal: summary.idMal ?? null,
      title: getDisplayTitle(summary.title),
      romajiTitle: summary.title.romaji ?? null,
      coverImage:
        summary.coverImage?.large ||
        summary.coverImage?.extraLarge ||
        summary.coverImage?.medium ||
        null,
      coverColor: summary.coverImage?.color ?? null,
      format: summary.format ?? null,
      seasonYear: getReleaseYear(summary),
      episodes: summary.episodes ?? null,
    });
  }

  const flat = source as FavoriteAnimeItem | WatchlistEntry | CapsuleAnimeRef;
  return sanitizeAnimeRef({
    id: flat.id,
    idMal: flat.idMal ?? null,
    title: flat.title,
    romajiTitle: flat.romajiTitle ?? null,
    coverImage: flat.coverImage ?? null,
    coverColor: flat.coverColor ?? null,
    format: flat.format ?? null,
    seasonYear: flat.seasonYear ?? null,
    episodes: flat.episodes ?? null,
  });
}

function isValidAnimeRef(value: unknown): value is CapsuleAnimeRef {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.id !== 'number' || !Number.isInteger(obj.id) || obj.id <= 0) return false;
  if (typeof obj.title !== 'string' || sanitizePlainText(obj.title).length === 0) return false;
  return true;
}

function sanitizeAnimeRef(raw: CapsuleAnimeRef): CapsuleAnimeRef {
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
    episodes:
      typeof raw.episodes === 'number' && Number.isInteger(raw.episodes) && raw.episodes > 0
        ? raw.episodes
        : null,
  };
}

function sanitizeWatchlistSnapshotItem(
  raw: unknown,
): CapsuleWatchlistSnapshotItem | null {
  if (!isValidAnimeRef(raw)) return null;
  const obj = raw as unknown as Record<string, unknown>;
  if (typeof obj.status !== 'string' || !VALID_STATUSES.has(obj.status as WatchlistStatus)) {
    return null;
  }

  const base = sanitizeAnimeRef(raw);
  const rawWatched =
    typeof obj.watchedEpisodes === 'number' &&
    Number.isInteger(obj.watchedEpisodes) &&
    obj.watchedEpisodes >= 0
      ? obj.watchedEpisodes
      : 0;
  const watchedEpisodes = base.episodes
    ? Math.min(base.episodes, rawWatched)
    : Math.min(10_000, rawWatched);
  const personalScore =
    typeof obj.personalScore === 'number' &&
    Number.isInteger(obj.personalScore) &&
    obj.personalScore >= 1 &&
    obj.personalScore <= 10
      ? obj.personalScore
      : null;

  return {
    ...base,
    status: obj.status as WatchlistStatus,
    watchedEpisodes,
    personalScore,
  };
}

function sanitizePredictionItem(raw: unknown): CapsulePredictionItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const text = sanitizePlainText(typeof obj.text === 'string' ? obj.text : '', 320);
  if (!text) return null;

  const id =
    typeof obj.id === 'string' && sanitizePlainText(obj.id, 64)
      ? sanitizePlainText(obj.id, 64)
      : createId('pred');

  const category: PredictionCategory =
    typeof obj.category === 'string' && VALID_CATEGORIES.has(obj.category as PredictionCategory)
      ? (obj.category as PredictionCategory)
      : 'custom';

  const outcome: PredictionOutcome =
    typeof obj.outcome === 'string' && VALID_OUTCOMES.has(obj.outcome as PredictionOutcome)
      ? (obj.outcome as PredictionOutcome)
      : 'pending';

  const outcomeNote =
    typeof obj.outcomeNote === 'string'
      ? sanitizePlainText(obj.outcomeNote, 280) || null
      : null;

  const linkedAnime = isValidAnimeRef(obj.linkedAnime)
    ? sanitizeAnimeRef(obj.linkedAnime)
    : null;

  return {
    id,
    category,
    text,
    linkedAnime,
    outcome,
    outcomeNote,
  };
}

function sanitizeReminderConfig(
  raw: unknown,
  fallbackRemindAt: number,
): CapsuleReminderConfig {
  if (!raw || typeof raw !== 'object') {
    return {
      enabled: false,
      remindAt: fallbackRemindAt,
      inAppBanner: true,
      browserNotification: false,
      notifiedAt: null,
      snoozedUntil: null,
      dismissedAt: null,
    };
  }
  const obj = raw as Record<string, unknown>;
  const remindAt =
    typeof obj.remindAt === 'number' && Number.isFinite(obj.remindAt) && obj.remindAt > 0
      ? Math.floor(obj.remindAt)
      : fallbackRemindAt;

  const cleanTimestamp = (val: unknown): number | null =>
    typeof val === 'number' && Number.isFinite(val) && val > 0 ? Math.floor(val) : null;

  return {
    enabled: Boolean(obj.enabled),
    remindAt,
    inAppBanner: obj.inAppBanner === undefined ? true : Boolean(obj.inAppBanner),
    browserNotification: Boolean(obj.browserNotification),
    notifiedAt: cleanTimestamp(obj.notifiedAt),
    snoozedUntil: cleanTimestamp(obj.snoozedUntil),
    dismissedAt: cleanTimestamp(obj.dismissedAt),
  };
}

function sanitizeCapsuleSnapshot(raw: unknown): TimeCapsuleSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const id =
    typeof obj.id === 'string' ? sanitizePlainText(obj.id, 64) : '';
  const title =
    typeof obj.title === 'string' ? sanitizePlainText(obj.title, 120) : '';
  if (!id || !title) return null;

  if (typeof obj.createdAt !== 'number' || !Number.isFinite(obj.createdAt) || obj.createdAt <= 0) {
    return null;
  }
  if (typeof obj.unlockAt !== 'number' || !Number.isFinite(obj.unlockAt) || obj.unlockAt <= 0) {
    return null;
  }

  const createdAt = Math.floor(obj.createdAt);
  const unlockAt = Math.floor(obj.unlockAt);

  const horizonPreset: TimeCapsuleHorizonPreset =
    typeof obj.horizonPreset === 'string' &&
    VALID_HORIZONS.has(obj.horizonPreset as TimeCapsuleHorizonPreset)
      ? (obj.horizonPreset as TimeCapsuleHorizonPreset)
      : 'custom';

  const seenFavs = new Set<number>();
  const favorites: CapsuleAnimeRef[] = [];
  if (Array.isArray(obj.favorites)) {
    for (const item of obj.favorites) {
      if (isValidAnimeRef(item) && !seenFavs.has(item.id)) {
        seenFavs.add(item.id);
        favorites.push(sanitizeAnimeRef(item));
        if (favorites.length >= MAX_SNAPSHOT_FAVORITES) break;
      }
    }
  }

  const seenWatchlist = new Set<number>();
  const watchlist: CapsuleWatchlistSnapshotItem[] = [];
  if (Array.isArray(obj.watchlist)) {
    for (const item of obj.watchlist) {
      const clean = sanitizeWatchlistSnapshotItem(item);
      if (clean && !seenWatchlist.has(clean.id)) {
        seenWatchlist.add(clean.id);
        watchlist.push(clean);
        if (watchlist.length >= MAX_SNAPSHOT_WATCHLIST) break;
      }
    }
  }

  const seenPredIds = new Set<string>();
  const predictions: CapsulePredictionItem[] = [];
  if (Array.isArray(obj.predictions)) {
    for (const item of obj.predictions) {
      const clean = sanitizePredictionItem(item);
      if (clean && !seenPredIds.has(clean.id)) {
        seenPredIds.add(clean.id);
        predictions.push(clean);
        if (predictions.length >= MAX_PREDICTIONS_PER_CAPSULE) break;
      }
    }
  }

  const totalWatchedEpisodesCount =
    typeof obj.totalWatchedEpisodesCount === 'number' &&
    Number.isInteger(obj.totalWatchedEpisodesCount) &&
    obj.totalWatchedEpisodesCount >= 0
      ? Math.min(1_000_000, obj.totalWatchedEpisodesCount)
      : 0;

  const historySeriesCount =
    typeof obj.historySeriesCount === 'number' &&
    Number.isInteger(obj.historySeriesCount) &&
    obj.historySeriesCount >= 0
      ? Math.min(100_000, obj.historySeriesCount)
      : 0;

  return {
    id,
    title,
    createdAt,
    unlockAt,
    horizonPreset,
    softLockUntilUnlock: Boolean(obj.softLockUntilUnlock),
    unsealedAt:
      typeof obj.unsealedAt === 'number' && Number.isFinite(obj.unsealedAt) && obj.unsealedAt > 0
        ? Math.floor(obj.unsealedAt)
        : null,
    noteToFutureSelf:
      typeof obj.noteToFutureSelf === 'string'
        ? sanitizePlainText(obj.noteToFutureSelf, 1200)
        : '',
    revisitReflection:
      typeof obj.revisitReflection === 'string'
        ? sanitizePlainText(obj.revisitReflection, 1200)
        : '',
    crownPick: isValidAnimeRef(obj.crownPick) ? sanitizeAnimeRef(obj.crownPick) : null,
    favorites,
    watchlist,
    totalWatchedEpisodesCount,
    historySeriesCount,
    predictions,
    reminder: sanitizeReminderConfig(obj.reminder, unlockAt),
  };
}

function readFromStorage(): TimeCapsuleSnapshot[] {
  try {
    const raw = window.localStorage.getItem(TIME_CAPSULES_STORAGE_KEY);
    if (raw === cachedRaw) {
      return cachedCapsules;
    }
    cachedRaw = raw;
    if (!raw) {
      cachedCapsules = [];
      return cachedCapsules;
    }
    const parsed = safeJsonParse(raw);
    if (!Array.isArray(parsed)) {
      cachedCapsules = [];
      return cachedCapsules;
    }
    const seenIds = new Set<string>();
    const valid: TimeCapsuleSnapshot[] = [];
    for (const item of parsed) {
      const clean = sanitizeCapsuleSnapshot(item);
      if (clean && !seenIds.has(clean.id)) {
        seenIds.add(clean.id);
        valid.push(clean);
        if (valid.length >= MAX_CAPSULES) break;
      }
    }
    valid.sort((a, b) => b.createdAt - a.createdAt);
    cachedCapsules = valid;
    return cachedCapsules;
  } catch {
    cachedRaw = null;
    cachedCapsules = [];
    return cachedCapsules;
  }
}

function writeToStorage(items: TimeCapsuleSnapshot[]): void {
  const bounded = items.slice(0, MAX_CAPSULES);
  try {
    const serialized = JSON.stringify(bounded);
    window.localStorage.setItem(TIME_CAPSULES_STORAGE_KEY, serialized);
    cachedRaw = serialized;
    cachedCapsules = bounded;
  } catch {
    cachedCapsules = bounded;
  }
  listeners.forEach((listener) => listener());
}

export function resetTimeCapsulesCacheForTests(): void {
  cachedRaw = undefined;
  cachedCapsules = [];
}

export function getTimeCapsules(): TimeCapsuleSnapshot[] {
  return readFromStorage();
}

export function getTimeCapsuleById(id: string): TimeCapsuleSnapshot | null {
  return readFromStorage().find((item) => item.id === id) ?? null;
}

export function countAllWatchedEpisodesFromLibrary(
  watchlist = getWatchlist(),
  watchedMap = getWatchedEpisodesMap(),
): number {
  const maxByAnime = new Map<number, number>();
  for (const entry of watchlist) {
    if (entry.watchedEpisodes > 0) {
      maxByAnime.set(entry.id, entry.watchedEpisodes);
    }
  }
  for (const [key, epList] of Object.entries(watchedMap)) {
    const id = Number.parseInt(key, 10);
    if (!Number.isInteger(id) || id <= 0) continue;
    const prev = maxByAnime.get(id) ?? 0;
    if (epList.length > prev) {
      maxByAnime.set(id, epList.length);
    }
  }
  let sum = 0;
  for (const count of maxByAnime.values()) {
    sum += count;
  }
  return sum;
}

export interface CreateTimeCapsuleInput {
  title: string;
  horizonPreset: TimeCapsuleHorizonPreset;
  customUnlockAt?: number;
  softLockUntilUnlock?: boolean;
  noteToFutureSelf?: string;
  crownPick?: CapsuleAnimeRef | null;
  extraFavorites?: CapsuleAnimeRef[];
  predictions?: Array<{
    category: PredictionCategory;
    text: string;
    linkedAnime?: CapsuleAnimeRef | null;
  }>;
  reminder?: {
    enabled: boolean;
    remindAt?: number;
    inAppBanner?: boolean;
    browserNotification?: boolean;
  };
  nowMs?: number;
}

export function createTimeCapsule(input: CreateTimeCapsuleInput): TimeCapsuleSnapshot {
  const nowMs =
    typeof input.nowMs === 'number' && Number.isFinite(input.nowMs)
      ? Math.floor(input.nowMs)
      : Date.now();

  const unlockAt =
    input.horizonPreset === 'custom' &&
    typeof input.customUnlockAt === 'number' &&
    Number.isFinite(input.customUnlockAt) &&
    input.customUnlockAt > nowMs
      ? Math.floor(input.customUnlockAt)
      : computeUnlockTimestampFromPreset(
          input.horizonPreset === 'custom' ? '6m' : input.horizonPreset,
          nowMs,
        );

  const liveFavorites = getFavorites().map((f) => toCapsuleAnimeRef(f));
  const mergedFavoritesMap = new Map<number, CapsuleAnimeRef>();
  for (const extra of input.extraFavorites ?? []) {
    const clean = toCapsuleAnimeRef(extra);
    mergedFavoritesMap.set(clean.id, clean);
  }
  for (const fav of liveFavorites) {
    if (!mergedFavoritesMap.has(fav.id)) {
      mergedFavoritesMap.set(fav.id, fav);
    }
  }
  const mergedFavorites = Array.from(mergedFavoritesMap.values());

  const liveWatchlist = getWatchlist();
  const watchlistSnapshot: CapsuleWatchlistSnapshotItem[] = liveWatchlist.map((entry) => ({
    ...toCapsuleAnimeRef(entry),
    status: entry.status,
    watchedEpisodes: entry.watchedEpisodes,
    personalScore: entry.personalScore,
  }));

  const crownPick =
    input.crownPick !== undefined
      ? input.crownPick
        ? toCapsuleAnimeRef(input.crownPick)
        : null
      : mergedFavorites[0] ?? null;

  const predictions: CapsulePredictionItem[] = [];
  for (const pred of input.predictions ?? []) {
    const cleanText = sanitizePlainText(pred.text, 320);
    if (!cleanText) continue;
    predictions.push({
      id: createId('pred'),
      category: pred.category,
      text: cleanText,
      linkedAnime: pred.linkedAnime ? toCapsuleAnimeRef(pred.linkedAnime) : null,
      outcome: 'pending',
      outcomeNote: null,
    });
    if (predictions.length >= MAX_PREDICTIONS_PER_CAPSULE) break;
  }

  const remindAt =
    input.reminder?.remindAt && Number.isFinite(input.reminder.remindAt)
      ? Math.floor(input.reminder.remindAt)
      : unlockAt;

  const rawSnapshot: TimeCapsuleSnapshot = {
    id: createId('cap'),
    title: sanitizePlainText(input.title, 120) || 'Anime Taste Time Capsule',
    createdAt: nowMs,
    unlockAt,
    horizonPreset: input.horizonPreset,
    softLockUntilUnlock: Boolean(input.softLockUntilUnlock),
    unsealedAt: null,
    noteToFutureSelf: sanitizePlainText(input.noteToFutureSelf ?? '', 1200),
    revisitReflection: '',
    crownPick,
    favorites: mergedFavorites,
    watchlist: watchlistSnapshot,
    totalWatchedEpisodesCount: countAllWatchedEpisodesFromLibrary(liveWatchlist),
    historySeriesCount: getWatchHistory().length,
    predictions,
    reminder: {
      enabled: Boolean(input.reminder?.enabled),
      remindAt,
      inAppBanner: input.reminder?.inAppBanner ?? true,
      browserNotification: Boolean(input.reminder?.browserNotification),
      notifiedAt: null,
      snoozedUntil: null,
      dismissedAt: null,
    },
  };

  const sanitized = sanitizeCapsuleSnapshot(rawSnapshot)!;
  const current = readFromStorage();
  writeToStorage([sanitized, ...current]);
  return sanitized;
}

export function unsealTimeCapsule(capsuleId: string, nowMs = Date.now()): void {
  const current = readFromStorage();
  const idx = current.findIndex((c) => c.id === capsuleId);
  if (idx === -1) return;
  if (current[idx].unsealedAt !== null) return;

  const next = [...current];
  next[idx] = {
    ...next[idx],
    unsealedAt: Math.floor(nowMs),
    reminder: {
      ...next[idx].reminder,
      dismissedAt: Math.floor(nowMs),
    },
  };
  writeToStorage(next);
}

export function updatePredictionOutcome(
  capsuleId: string,
  predictionId: string,
  outcome: PredictionOutcome,
  outcomeNote?: string | null,
): void {
  if (!VALID_OUTCOMES.has(outcome)) return;
  const current = readFromStorage();
  const idx = current.findIndex((c) => c.id === capsuleId);
  if (idx === -1) return;

  const capsule = current[idx];
  const updatedPredictions = capsule.predictions.map((pred) =>
    pred.id === predictionId
      ? {
          ...pred,
          outcome,
          outcomeNote:
            outcomeNote !== undefined
              ? outcomeNote
                ? sanitizePlainText(outcomeNote, 280) || null
                : null
              : pred.outcomeNote,
        }
      : pred,
  );

  const next = [...current];
  next[idx] = {
    ...capsule,
    predictions: updatedPredictions,
  };
  writeToStorage(next);
}

export function updateRevisitReflection(capsuleId: string, reflection: string): void {
  const current = readFromStorage();
  const idx = current.findIndex((c) => c.id === capsuleId);
  if (idx === -1) return;

  const next = [...current];
  next[idx] = {
    ...next[idx],
    revisitReflection: sanitizePlainText(reflection, 1200),
  };
  writeToStorage(next);
}

export function updateCapsuleReminder(
  capsuleId: string,
  patch: Partial<
    Pick<
      CapsuleReminderConfig,
      'enabled' | 'remindAt' | 'inAppBanner' | 'browserNotification'
    >
  >,
): void {
  const current = readFromStorage();
  const idx = current.findIndex((c) => c.id === capsuleId);
  if (idx === -1) return;

  const prevReminder = current[idx].reminder;
  const nextRemindAt =
    patch.remindAt !== undefined &&
    Number.isFinite(patch.remindAt) &&
    patch.remindAt > 0
      ? Math.floor(patch.remindAt)
      : prevReminder.remindAt;

  const resetNotificationFlags =
    (patch.enabled === true && !prevReminder.enabled) ||
    nextRemindAt !== prevReminder.remindAt;

  const next = [...current];
  next[idx] = {
    ...current[idx],
    reminder: {
      ...prevReminder,
      enabled: patch.enabled ?? prevReminder.enabled,
      remindAt: nextRemindAt,
      inAppBanner: patch.inAppBanner ?? prevReminder.inAppBanner,
      browserNotification:
        patch.browserNotification ?? prevReminder.browserNotification,
      notifiedAt: resetNotificationFlags ? null : prevReminder.notifiedAt,
      snoozedUntil: resetNotificationFlags ? null : prevReminder.snoozedUntil,
      dismissedAt: resetNotificationFlags ? null : prevReminder.dismissedAt,
    },
  };
  writeToStorage(next);
}

export function markCapsuleBrowserNotified(capsuleId: string, nowMs = Date.now()): void {
  const current = readFromStorage();
  const idx = current.findIndex((c) => c.id === capsuleId);
  if (idx === -1) return;

  const next = [...current];
  next[idx] = {
    ...next[idx],
    reminder: {
      ...next[idx].reminder,
      notifiedAt: Math.floor(nowMs),
    },
  };
  writeToStorage(next);
}

export function snoozeCapsuleReminder(
  capsuleId: string,
  snoozeDurationMs = 7 * 24 * 60 * 60 * 1000,
  nowMs = Date.now(),
): void {
  const current = readFromStorage();
  const idx = current.findIndex((c) => c.id === capsuleId);
  if (idx === -1) return;

  const next = [...current];
  next[idx] = {
    ...next[idx],
    reminder: {
      ...next[idx].reminder,
      snoozedUntil: Math.floor(nowMs + Math.max(60_000, snoozeDurationMs)),
    },
  };
  writeToStorage(next);
}

export function dismissCapsuleReminder(capsuleId: string, nowMs = Date.now()): void {
  const current = readFromStorage();
  const idx = current.findIndex((c) => c.id === capsuleId);
  if (idx === -1) return;

  const next = [...current];
  next[idx] = {
    ...next[idx],
    reminder: {
      ...next[idx].reminder,
      dismissedAt: Math.floor(nowMs),
    },
  };
  writeToStorage(next);
}

export function deleteTimeCapsule(capsuleId: string): void {
  const current = readFromStorage();
  const next = current.filter((c) => c.id !== capsuleId);
  if (next.length !== current.length) {
    writeToStorage(next);
  }
}

export function getDueReminderCapsules(
  capsules: TimeCapsuleSnapshot[] = readFromStorage(),
  nowMs = Date.now(),
): TimeCapsuleSnapshot[] {
  return capsules.filter((c) => {
    const r = c.reminder;
    if (!r.enabled) return false;
    if (r.dismissedAt !== null) return false;
    if (nowMs < r.remindAt) return false;
    if (r.snoozedUntil !== null && nowMs < r.snoozedUntil) return false;
    return true;
  });
}

export function importTimeCapsules(entries: unknown[]): number {
  if (!Array.isArray(entries)) return 0;
  const current = readFromStorage();
  const byId = new Map<string, TimeCapsuleSnapshot>();
  for (const item of current) {
    byId.set(item.id, item);
  }

  let imported = 0;
  for (const raw of entries) {
    const clean = sanitizeCapsuleSnapshot(raw);
    if (!clean) continue;
    if (!byId.has(clean.id)) {
      byId.set(clean.id, clean);
      imported += 1;
    }
  }

  if (imported > 0) {
    const merged = Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt);
    writeToStorage(merged);
  }
  return imported;
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  const handleStorage = (event: StorageEvent) => {
    if (event.key === TIME_CAPSULES_STORAGE_KEY || event.key === null) {
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

const EMPTY_CAPSULES: TimeCapsuleSnapshot[] = [];

export function useTimeCapsules() {
  const capsules = useSyncExternalStore(
    subscribe,
    readFromStorage,
    () => EMPTY_CAPSULES,
  );

  const getById = useCallback(
    (id: string) => capsules.find((c) => c.id === id) ?? null,
    [capsules],
  );

  return {
    capsules,
    getById,
    createTimeCapsule,
    unsealTimeCapsule,
    updatePredictionOutcome,
    updateRevisitReflection,
    updateCapsuleReminder,
    markCapsuleBrowserNotified,
    snoozeCapsuleReminder,
    dismissCapsuleReminder,
    deleteTimeCapsule,
  };
}
