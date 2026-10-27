import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../App';
import { AnimeDetailsPage } from '../pages/AnimeDetailsPage';
import { FavoritesPage } from '../pages/FavoritesPage';
import { SeasonsPage } from '../pages/SeasonsPage';
import { StudioPage } from '../pages/StudioPage';
import { WatchPage } from '../pages/WatchPage';
import { clearAniListCache } from '../services/anilist/client';
import { resetFavoritesCacheForTests } from '../services/storage/favoritesStore';
import { resetHistoryCacheForTests } from '../services/storage/historyStore';
import {
  getUserPreferences,
  resetPreferencesCacheForTests,
} from '../services/storage/preferencesStore';
import {
  getWatchedEpisodesForAnime,
  resetWatchedEpisodesCacheForTests,
} from '../services/storage/watchedEpisodesStore';
import {
  getWatchlist,
  resetWatchlistCacheForTests,
  setWatchlistStatus,
} from '../services/storage/watchlistStore';
import type { AnimeDetails } from '../types/anime';

const MOCK_HORIMIYA_FULL: AnimeDetails = {
  id: 124080,
  idMal: 42897,
  type: 'ANIME',
  title: {
    romaji: 'Horimiya',
    english: 'Horimiya',
    native: 'ホリミヤ',
    userPreferred: 'Horimiya',
  },
  coverImage: {
    extraLarge: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx124080.png',
    large: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx124080.png',
    medium: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/small/bx124080.png',
    color: '#e4a15d',
  },
  bannerImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/124080.jpg',
  format: 'TV',
  status: 'RELEASING',
  episodes: 13,
  duration: 24,
  season: 'WINTER',
  seasonYear: 2021,
  startDate: { year: 2021, month: 1, day: 10 },
  endDate: null,
  averageScore: 82,
  popularity: 420000,
  genres: ['Comedy', 'Romance'],
  isAdult: false,
  description: 'Two classmates discover each other outside school.',
  nextAiringEpisode: {
    id: 991,
    airingAt: Math.floor(Date.now() / 1000) + 7200,
    timeUntilAiring: 7200,
    episode: 6,
  },
  studios: {
    edges: [
      {
        isMain: true,
        node: { id: 1835, name: 'CloverWorks', isAnimationStudio: true },
      },
    ],
  },
  source: 'MANGA',
  synonyms: [],
  favourites: 24000,
  siteUrl: 'https://anilist.co/anime/124080',
  trailer: null,
  streamingEpisodes: [],
  externalLinks: [],
  characters: {
    edges: [
      {
        id: 101,
        role: 'MAIN',
        node: {
          id: 66163,
          name: { full: 'Kyouko Hori', native: '堀 京子' },
          image: {
            large: 'https://s4.anilist.co/file/anilistcdn/character/large/b66163.png',
            medium: null,
          },
        },
        voiceActors: [
          {
            id: 115925,
            name: { full: 'Haruka Tomatsu', native: '戸松 遥' },
            languageV2: 'Japanese',
            image: { large: 'https://s4.anilist.co/va-jp.png', medium: null },
          },
          {
            id: 125000,
            name: { full: 'Marisa Duran', native: null },
            languageV2: 'English',
            image: { large: 'https://s4.anilist.co/va-en.png', medium: null },
          },
        ],
      },
    ],
  },
  relations: { edges: [] },
  recommendations: { nodes: [] },
};

describe('Expanded Streaming & Discovery Features', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    resetFavoritesCacheForTests();
    resetHistoryCacheForTests();
    resetWatchlistCacheForTests();
    resetWatchedEpisodesCacheForTests();
    resetPreferencesCacheForTests();
    clearAniListCache();
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('tracks Watchlist status, episode progress stepper, and personal 1-10 score on /favorites', () => {
    setWatchlistStatus(MOCK_HORIMIYA_FULL, 'watching');

    render(
      <MemoryRouter initialEntries={['/favorites?tab=watching']}>
        <Routes>
          <Route path="/favorites" element={<FavoritesPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Horimiya')).toBeInTheDocument();

    // Increment watched episode count via + button
    fireEvent.click(
      screen.getByRole('button', { name: /Increase watched episodes for Horimiya/i }),
    );
    expect(getWatchlist()[0]?.watchedEpisodes).toBe(1);
    expect(screen.getByText('1 / 13')).toBeInTheDocument();

    // Set personal score to 9 / 10
    fireEvent.change(
      screen.getByRole('combobox', { name: /Personal score for Horimiya/i }),
      { target: { value: '9' } },
    );
    expect(getWatchlist()[0]?.personalScore).toBe(9);
  });

  it('renders Characters & Voice Cast with JP/EN language toggle, live countdown, and clickable Studio link', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { Media: MOCK_HORIMIYA_FULL } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    render(
      <MemoryRouter initialEntries={['/anime/124080']}>
        <Routes>
          <Route path="/anime/:id" element={<AnimeDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Kyouko Hori')).toBeInTheDocument();
    });

    // Default Japanese cast shown
    expect(screen.getByText('Haruka Tomatsu')).toBeInTheDocument();

    // Switch to English dub cast
    fireEvent.click(screen.getByRole('button', { name: /EN Cast/i }));
    expect(screen.getByText('Marisa Duran')).toBeInTheDocument();

    // Live next-episode countdown banner rendered
    expect(screen.getByText(/Episode 6/i)).toBeInTheDocument();

    // Studio links to /studio/1835
    const studioLinks = screen.getAllByRole('link', { name: 'CloverWorks' });
    expect(studioLinks[0]).toHaveAttribute('href', '/studio/1835');
  });

  it('loads Animation Studio filmography page (/studio/:id)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            Studio: {
              id: 1835,
              name: 'CloverWorks',
              isAnimationStudio: true,
              siteUrl: 'https://anilist.co/studio/1835',
              favourites: 18000,
              media: {
                pageInfo: { currentPage: 1, hasNextPage: false, perPage: 24 },
                nodes: [MOCK_HORIMIYA_FULL],
              },
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    render(
      <MemoryRouter initialEntries={['/studio/1835']}>
        <Routes>
          <Route path="/studio/:id" element={<StudioPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'CloverWorks' })).toBeInTheDocument();
    });
    expect(screen.getByText('Horimiya')).toBeInTheDocument();
  });

  it('explores Seasonal Archive (/seasons) and switches quarters', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            Page: {
              pageInfo: { currentPage: 1, hasNextPage: false, perPage: 24 },
              media: [MOCK_HORIMIYA_FULL],
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    render(
      <MemoryRouter initialEntries={['/seasons?season=WINTER&year=2021']}>
        <Routes>
          <Route path="/seasons" element={<SeasonsPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Winter 2021 Lineup' })).toBeInTheDocument();
    });
    expect(screen.getByText('Horimiya')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Spring' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Spring 2021 Lineup' })).toBeInTheDocument();
    });
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('supports Cinema Lights-Off dimmer (L), persistent DUB preference, and auto-marks watched episodes on WatchPage', async () => {
    setWatchlistStatus(MOCK_HORIMIYA_FULL, 'plan_to_watch');

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { Media: MOCK_HORIMIYA_FULL } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { container } = render(
      <MemoryRouter initialEntries={['/watch/124080?ep=2']}>
        <Routes>
          <Route path="/watch/:id" element={<WatchPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Lights Off/i })).toBeInTheDocument();
    });

    // Episode 2 automatically marked watched & watchlist promoted from plan_to_watch -> watching
    expect(getWatchedEpisodesForAnime(124080)).toContain(2);
    expect(getWatchlist()[0]?.status).toBe('watching');
    expect(getWatchlist()[0]?.watchedEpisodes).toBe(2);

    // Toggle Cinema Lights Off via 'L' key
    fireEvent.keyDown(window, { key: 'l' });
    expect(container.querySelector('.cinema-dimmer-backdrop')).toBeInTheDocument();

    // Switch to DUB and verify user preference persisted
    fireEvent.click(screen.getByRole('button', { name: 'DUB' }));
    expect(getUserPreferences().preferredAudio).toBe('dub');
  });

  it('opens and closes the global Ctrl+K Command Palette', () => {
    render(
      <MemoryRouter initialEntries={['/favorites']}>
        <AppRoutes />
      </MemoryRouter>,
    );

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.getByRole('dialog', { name: /Quick command palette/i })).toBeInTheDocument();
    expect(screen.getByText('Seasonal Archive')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(
      screen.queryByRole('dialog', { name: /Quick command palette/i }),
    ).not.toBeInTheDocument();
  });
});
