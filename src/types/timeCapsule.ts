import type { WatchlistStatus } from './storage';

export type TimeCapsuleHorizonPreset = '3m' | '6m' | '1y' | 'custom';

export type PredictionCategory =
  | 'aoty'
  | 'rating_shift'
  | 'completion'
  | 'sequel_or_adaptation'
  | 'custom';

export type PredictionOutcome = 'pending' | 'hit' | 'partial' | 'miss';

export interface CapsuleAnimeRef {
  id: number;
  idMal: number | null;
  title: string;
  romajiTitle: string | null;
  coverImage: string | null;
  coverColor: string | null;
  format: string | null;
  seasonYear: number | null;
  episodes: number | null;
}

export interface CapsuleWatchlistSnapshotItem extends CapsuleAnimeRef {
  status: WatchlistStatus;
  watchedEpisodes: number;
  personalScore: number | null;
}

export interface CapsulePredictionItem {
  id: string;
  category: PredictionCategory;
  text: string;
  linkedAnime: CapsuleAnimeRef | null;
  outcome: PredictionOutcome;
  outcomeNote: string | null;
}

export interface CapsuleReminderConfig {
  enabled: boolean;
  remindAt: number;
  inAppBanner: boolean;
  browserNotification: boolean;
  notifiedAt: number | null;
  snoozedUntil: number | null;
  dismissedAt: number | null;
}

export interface TimeCapsuleSnapshot {
  id: string;
  title: string;
  createdAt: number;
  unlockAt: number;
  horizonPreset: TimeCapsuleHorizonPreset;
  softLockUntilUnlock: boolean;
  unsealedAt: number | null;
  noteToFutureSelf: string;
  revisitReflection: string;
  crownPick: CapsuleAnimeRef | null;
  favorites: CapsuleAnimeRef[];
  watchlist: CapsuleWatchlistSnapshotItem[];
  totalWatchedEpisodesCount: number;
  historySeriesCount: number;
  predictions: CapsulePredictionItem[];
  reminder: CapsuleReminderConfig;
}

export interface ComparableTasteState {
  label: string;
  timestampMs: number;
  crownPick: CapsuleAnimeRef | null;
  favorites: CapsuleAnimeRef[];
  watchlist: CapsuleWatchlistSnapshotItem[];
  totalWatchedEpisodesCount: number;
}

export interface RatingShiftEntry {
  anime: CapsuleAnimeRef;
  oldScore: number;
  newScore: number;
  delta: number;
}

export interface NewlyCompletedBacklogEntry {
  anime: CapsuleAnimeRef;
  previousStatus: WatchlistStatus;
  newScore: number | null;
}

export interface NewlyCompletedFreshEntry {
  anime: CapsuleAnimeRef;
  newScore: number | null;
}

export interface EvaluatedPredictionItem extends CapsulePredictionItem {
  liveStatusNow: WatchlistStatus | null;
  liveScoreNow: number | null;
  liveWatchedEpisodesNow: number | null;
  liveFavoritedNow: boolean;
}

export interface TimeCapsuleComparison {
  capsuleId: string;
  capsuleTitle: string;
  snapshotDateMs: number;
  unlockDateMs: number;
  comparedDateMs: number;
  comparedTargetLabel: string;
  daysElapsed: number;

  crownComparison: {
    thenPick: CapsuleAnimeRef | null;
    nowPick: CapsuleAnimeRef | null;
    sameCrown: boolean;
    thenPickStillFavorited: boolean;
    thenPickScoreThen: number | null;
    thenPickScoreNow: number | null;
  };

  favoritesDiff: {
    thenCount: number;
    nowCount: number;
    kept: CapsuleAnimeRef[];
    added: CapsuleAnimeRef[];
    removed: CapsuleAnimeRef[];
    retentionRate: number | null;
  };

  ratingsDiff: {
    ratedCountThen: number;
    ratedCountNow: number;
    meanScoreThen: number | null;
    meanScoreNow: number | null;
    meanScoreDelta: number | null;
    scoreChanges: RatingShiftEntry[];
    unchangedScores: Array<{ anime: CapsuleAnimeRef; score: number }>;
    newlyRated: Array<{ anime: CapsuleAnimeRef; newScore: number }>;
  };

  completedDiff: {
    completedCountThen: number;
    completedCountNow: number;
    completedDelta: number;
    episodesLoggedThen: number;
    episodesLoggedNow: number;
    episodesDelta: number;
    completedThen: CapsuleWatchlistSnapshotItem[];
    newlyCompletedFromBacklog: NewlyCompletedBacklogEntry[];
    newlyCompletedFresh: NewlyCompletedFreshEntry[];
  };

  predictionsSummary: {
    total: number;
    hit: number;
    partial: number;
    miss: number;
    pending: number;
    items: EvaluatedPredictionItem[];
  };
}

export interface ShareableCompactAnime {
  id: number;
  title: string;
}

export interface ShareableBeforeAfterPayload {
  v: 1;
  title: string;
  thenMs: number;
  nowMs: number;
  crownThen: ShareableCompactAnime | null;
  crownNow: ShareableCompactAnime | null;
  favThen: number;
  favNow: number;
  favKept: ShareableCompactAnime[];
  favAdded: ShareableCompactAnime[];
  favRemoved: ShareableCompactAnime[];
  meanThen: number | null;
  meanNow: number | null;
  ratedThen: number;
  ratedNow: number;
  scoreShifts: Array<{
    id: number;
    title: string;
    from: number;
    to: number;
  }>;
  compThen: number;
  compNow: number;
  epsThen: number;
  epsNow: number;
  newComp: ShareableCompactAnime[];
  predTotal: number;
  predHit: number;
  predPartial: number;
  predMiss: number;
  featuredPrediction: {
    text: string;
    outcome: PredictionOutcome;
  } | null;
}
