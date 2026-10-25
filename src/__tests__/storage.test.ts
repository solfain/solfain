import { beforeEach, describe, expect, it } from 'vitest';
import {
  FAVORITES_STORAGE_KEY,
  addFavorite,
  getFavorites,
  isAnimeFavorited,
  removeFavorite,
  resetFavoritesCacheForTests,
} from '../services/storage/favoritesStore';
import {
  WATCH_HISTORY_STORAGE_KEY,
  clearWatchHistory,
  getWatchHistory,
  recordWatchVisit,
  removeHistoryEntry,
  resetHistoryCacheForTests,
  updateVerifiedPlaybackProgress,
} from '../services/storage/historyStore';
import type { AnimeSummary } from '../types/anime';

const SAMPLE_ANIME: AnimeSummary = {
  id: 124080,
  idMal: 42897,
  title: {
    romaji: 'Horimiya',
    english: 'Horimiya',
    native: 'ホリミヤ',
  },
  coverImage: {
    extraLarge: 'https://img.example/horimiya.jpg',
    large: null,
    medium: null,
    color: '#e4a15d',
  },
  bannerImage: 'https://img.example/banner.jpg',
  format: 'TV',
  status: 'FINISHED',
  episodes: 13,
  duration: 24,
  season: 'WINTER',
  seasonYear: 2021,
  startDate: { year: 2021, month: 1, day: 10 },
  averageScore: 82,
  popularity: 500000,
  genres: ['Romance'],
  nextAiringEpisode: null,
};

describe('Local Storage Persistence (Favorites & Watch History)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetFavoritesCacheForTests();
    resetHistoryCacheForTests();
  });

  it('persists favorites across cache resets and recovers gracefully from malformed data', () => {
    addFavorite(SAMPLE_ANIME);
    expect(isAnimeFavorited(124080)).toBe(true);

    // Simulate page reload by clearing in-memory cache
    resetFavoritesCacheForTests();
    const reloaded = getFavorites();
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0]?.title).toBe('Horimiya');

    removeFavorite(124080);
    expect(getFavorites()).toEqual([]);

    // Corrupt localStorage and verify safe recovery
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, '{broken-json');
    resetFavoritesCacheForTests();
    expect(getFavorites()).toEqual([]);
  });

  it('records watch history without fabricating progress and updates only on verified telemetry', () => {
    recordWatchVisit({
      anime: SAMPLE_ANIME,
      episode: 1,
      episodeTitle: 'A Tiny Happenstance',
      audio: 'sub',
    });

    resetHistoryCacheForTests();
    const initial = getWatchHistory();
    expect(initial).toHaveLength(1);
    expect(initial[0]?.episode).toBe(1);
    expect(initial[0]?.progressSeconds).toBeNull();
    expect(initial[0]?.durationSeconds).toBeNull();

    updateVerifiedPlaybackProgress({
      animeId: 124080,
      episode: 1,
      progressSeconds: 312.8,
      durationSeconds: 1440,
    });

    resetHistoryCacheForTests();
    const withProgress = getWatchHistory();
    expect(withProgress[0]?.progressSeconds).toBe(312);
    expect(withProgress[0]?.durationSeconds).toBe(1440);

    // Advancing to episode 2 resets episode-specific progress
    recordWatchVisit({
      anime: SAMPLE_ANIME,
      episode: 2,
      audio: 'dub',
    });
    expect(getWatchHistory()[0]?.episode).toBe(2);
    expect(getWatchHistory()[0]?.audio).toBe('dub');
    expect(getWatchHistory()[0]?.progressSeconds).toBeNull();

    removeHistoryEntry(124080);
    expect(getWatchHistory()).toEqual([]);

    // Malformed array entries are filtered out safely
    window.localStorage.setItem(
      WATCH_HISTORY_STORAGE_KEY,
      JSON.stringify([{ invalid: true }, { animeId: -4, title: '', episode: 0 }]),
    );
    resetHistoryCacheForTests();
    expect(getWatchHistory()).toEqual([]);

    clearWatchHistory();
    expect(getWatchHistory()).toEqual([]);
  });
});
