import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '../components/layout/ErrorBoundary';
import { AnimeDetailsPage } from '../pages/AnimeDetailsPage';
import { SchedulePage } from '../pages/SchedulePage';
import { WatchPage } from '../pages/WatchPage';
import { clearAniListCache } from '../services/anilist/client';
import { yenimeProvider } from '../services/providers/yenimeProvider';
import {
  addFavorite,
  getFavorites,
  resetFavoritesCacheForTests,
} from '../services/storage/favoritesStore';
import {
  getWatchHistory,
  recordWatchVisit,
  resetHistoryCacheForTests,
  updateVerifiedPlaybackProgress,
} from '../services/storage/historyStore';
import {
  createLibraryBackupPayload,
  importLibraryBackupJson,
} from '../services/storage/libraryBackup';
import type { AnimeDetails } from '../types/anime';
import { cleanSynopsis } from '../utils/format';
import {
  buildSafeYoutubeEmbedUrl,
  safeJsonParse,
  sanitizeHexColor,
  sanitizeHttpUrl,
} from '../utils/security';

const MOCK_HORIMIYA_WITH_TRAILER: AnimeDetails = {
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
  status: 'FINISHED',
  episodes: 13,
  duration: 24,
  season: 'WINTER',
  seasonYear: 2021,
  startDate: { year: 2021, month: 1, day: 10 },
  endDate: { year: 2021, month: 4, day: 4 },
  averageScore: 82,
  popularity: 420000,
  genres: ['Comedy', 'Romance', 'Slice of Life'],
  isAdult: false,
  description: 'A secret life&#39;s shared bond &mdash; warm &amp; honest.',
  nextAiringEpisode: null,
  studios: {
    edges: [{ isMain: true, node: { id: 1, name: 'CloverWorks', isAnimationStudio: true } }],
  },
  source: 'MANGA',
  synonyms: [],
  favourites: 24000,
  siteUrl: 'https://anilist.co/anime/124080',
  trailer: {
    id: 'e4RCugyx5No',
    site: 'youtube',
    thumbnail: 'https://i.ytimg.com/vi/e4RCugyx5No/hqdefault.jpg',
  },
  streamingEpisodes: [],
  externalLinks: [
    {
      id: 1,
      url: 'https://horimiya-anime.com',
      site: 'Official Site',
      type: 'INFO',
      language: 'Japanese',
      color: null,
      icon: null,
      isDisabled: false,
    },
    {
      id: 2,
      url: 'javascript:alert(1)',
      site: 'Malicious Link',
      type: 'INFO',
      language: null,
      color: null,
      icon: null,
      isDisabled: false,
    },
  ],
  relations: { edges: [] },
  recommendations: { nodes: [] },
};

describe('Security Hardening & Sanitization', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    resetFavoritesCacheForTests();
    resetHistoryCacheForTests();
    clearAniListCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects dangerous URL schemes, credentials, and non-HTTPS URLs', () => {
    expect(sanitizeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeHttpUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(sanitizeHttpUrl('vbscript:msgbox(1)')).toBeNull();
    expect(sanitizeHttpUrl('http://insecure.example.com/poster.jpg')).toBeNull();
    expect(sanitizeHttpUrl('https://user:pass@example.com/poster.jpg')).toBeNull();
    expect(sanitizeHttpUrl('https://s4.anilist.co/cover.png')).toBe(
      'https://s4.anilist.co/cover.png',
    );
  });

  it('validates CSS hex colors and blocks arbitrary CSS injection', () => {
    expect(sanitizeHexColor('#8B5CF6')).toBe('#8B5CF6');
    expect(sanitizeHexColor('#fff')).toBe('#fff');
    expect(sanitizeHexColor('#fff; background:url(javascript:alert(1))')).toBeNull();
    expect(sanitizeHexColor('expression(alert(1))')).toBeNull();
  });

  it('constructs youtube-nocookie trailer embeds only for valid YouTube IDs', () => {
    expect(buildSafeYoutubeEmbedUrl({ id: 'e4RCugyx5No', site: 'youtube' })).toBe(
      'https://www.youtube-nocookie.com/embed/e4RCugyx5No?rel=0&modestbranding=1',
    );
    expect(buildSafeYoutubeEmbedUrl({ id: '../../evil?x=1', site: 'youtube' })).toBeNull();
    expect(buildSafeYoutubeEmbedUrl({ id: 'e4RCugyx5No', site: 'dailymotion' })).toBeNull();
  });

  it('prevents prototype pollution and oversize payloads in safeJsonParse', () => {
    const parsed = safeJsonParse(
      '{"title":"Safe","__proto__":{"polluted":true},"constructor":{"prototype":{"bad":true}}}',
    ) as Record<string, unknown>;

    expect(parsed.title).toBe('Safe');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(() => safeJsonParse('x'.repeat(200), 50)).toThrow();
  });

  it('verifies postMessage source window and clamps telemetry durations', () => {
    const fakeIframeWindow = {} as Window;
    const wrongWindow = {} as Window;

    const spoofed = new MessageEvent('message', {
      origin: 'https://player.yenime.net',
      source: wrongWindow,
      data: {
        type: 'PLAYER_EVENT',
        data: { event: 'timeupdate', currentTime: 120, duration: 1440 },
      },
    });
    expect(yenimeProvider.parsePlayerMessage(spoofed, fakeIframeWindow)).toBeNull();

    const authentic = new MessageEvent('message', {
      origin: 'https://player.yenime.net',
      source: fakeIframeWindow,
      data: {
        type: 'PLAYER_EVENT',
        data: { event: 'pause', currentTime: 9999999, duration: 9999999 },
      },
    });
    const parsed = yenimeProvider.parsePlayerMessage(authentic, fakeIframeWindow);
    expect(parsed).toEqual({
      event: 'pause',
      currentTime: 86400,
      duration: 86400,
    });
  });

  it('decodes numeric and named HTML entities cleanly in cleanSynopsis', () => {
    const cleaned = cleanSynopsis(
      '<p>Hori&#39;s &amp; Miyamura&#x27;s bond &mdash; <i>genuine</i>.</p>',
    );
    expect(cleaned).toBe("Hori's & Miyamura's bond — genuine.");
  });
});

describe('Fixes & New Features (Backup, ErrorBoundary Reset, Trailer, Theater, Schedule)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    resetFavoritesCacheForTests();
    resetHistoryCacheForTests();
    clearAniListCache();
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throttles minor timeupdate writes and forces immediate save on pause/seeked/ended', () => {
    recordWatchVisit({
      anime: MOCK_HORIMIYA_WITH_TRAILER,
      episode: 1,
      audio: 'sub',
    });

    updateVerifiedPlaybackProgress({
      animeId: 124080,
      episode: 1,
      progressSeconds: 10,
      durationSeconds: 1440,
    });
    expect(getWatchHistory()[0]?.progressSeconds).toBe(10);

    // < 5s delta without force should be throttled
    updateVerifiedPlaybackProgress({
      animeId: 124080,
      episode: 1,
      progressSeconds: 12,
      durationSeconds: 1440,
    });
    expect(getWatchHistory()[0]?.progressSeconds).toBe(10);

    // Forced update (e.g. pause) persists immediately even for < 5s delta
    updateVerifiedPlaybackProgress({
      animeId: 124080,
      episode: 1,
      progressSeconds: 13,
      durationSeconds: 1440,
      force: true,
    });
    expect(getWatchHistory()[0]?.progressSeconds).toBe(13);
  });

  it('exports and safely imports library backups while stripping unsafe URLs', () => {
    addFavorite(MOCK_HORIMIYA_WITH_TRAILER);
    const exported = createLibraryBackupPayload();

    window.localStorage.clear();
    resetFavoritesCacheForTests();
    expect(getFavorites()).toHaveLength(0);

    const summary = importLibraryBackupJson(exported);
    expect(summary.importedFavorites).toBe(1);
    expect(getFavorites()[0]?.title).toBe('Horimiya');

    // Attempt importing backup with malicious coverImage
    const untrustedJson = JSON.stringify({
      app: 'solfain',
      version: 1,
      favorites: [
        {
          id: 99999,
          title: 'Untrusted Entry',
          coverImage: 'javascript:alert(1)',
          coverColor: 'url(evil)',
          addedAt: 1700000000000,
        },
      ],
    });
    const summary2 = importLibraryBackupJson(untrustedJson);
    expect(summary2.importedFavorites).toBe(1);
    const imported = getFavorites().find((f) => f.id === 99999);
    expect(imported?.coverImage).toBeNull();
    expect(imported?.coverColor).toBeNull();
  });

  it('recovers ErrorBoundary automatically when resetKey changes', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    function CrashView({ crash }: { crash: boolean }) {
      if (crash) throw new Error('Simulated route failure');
      return <div>Recovered Route Content</div>;
    }

    const { rerender } = render(
      <ErrorBoundary resetKey="/broken">
        <CrashView crash={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    rerender(
      <ErrorBoundary resetKey="/healthy">
        <CrashView crash={false} />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Recovered Route Content')).toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  it('renders official privacy-enhanced trailer modal and filters unsafe external links', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { Media: MOCK_HORIMIYA_WITH_TRAILER } }), {
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
      expect(screen.getByRole('heading', { name: 'Horimiya' })).toBeInTheDocument();
    });

    // Safe HTTPS link rendered; malicious javascript: link stripped
    expect(screen.getByRole('link', { name: /Official Site/i })).toHaveAttribute(
      'href',
      'https://horimiya-anime.com/',
    );
    expect(screen.queryByText('Malicious Link')).not.toBeInTheDocument();

    // Open official trailer modal
    fireEvent.click(screen.getByRole('button', { name: /Trailer/i }));
    const dialog = screen.getByRole('dialog', { name: /Official trailer for Horimiya/i });
    expect(dialog).toBeInTheDocument();
    const iframe = dialog.querySelector('iframe');
    expect(iframe?.getAttribute('src')).toBe(
      'https://www.youtube-nocookie.com/embed/e4RCugyx5No?rel=0&modestbranding=1',
    );

    // Escape closes modal
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('toggles Theater Mode on WatchPage via button and keyboard shortcut T', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { Media: MOCK_HORIMIYA_WITH_TRAILER } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { container } = render(
      <MemoryRouter initialEntries={['/watch/124080?ep=1']}>
        <Routes>
          <Route path="/watch/:id" element={<WatchPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Theater/i })).toBeInTheDocument();
    });

    const layout = container.querySelector('.watch-layout');
    expect(layout).not.toHaveClass('watch-layout--theater');

    fireEvent.keyDown(window, { key: 't' });
    expect(layout).toHaveClass('watch-layout--theater');
  });

  it('renders Simulcast Schedule (/schedule) with local broadcast entries', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            Page: {
              pageInfo: { currentPage: 1, hasNextPage: false, perPage: 50 },
              airingSchedules: [
                {
                  id: 777,
                  episode: 5,
                  airingAt: nowSec - 600,
                  timeUntilAiring: -600,
                  media: MOCK_HORIMIYA_WITH_TRAILER,
                },
              ],
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    render(
      <MemoryRouter initialEntries={['/schedule']}>
        <Routes>
          <Route path="/schedule" element={<SchedulePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Horimiya')).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: /Watch Ep 5/i })).toHaveAttribute(
      'href',
      '/watch/124080?ep=5',
    );
  });
});
