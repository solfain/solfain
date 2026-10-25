import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../App';
import { AdSlot } from '../components/monetization/SponsorSlot';
import {
  registerAdNetworkAdapter,
  resetAdNetworkAdapter,
} from '../services/monetization/slotRegistry';
import { clearAniListCache } from '../services/anilist/client';
import { resetFavoritesCacheForTests } from '../services/storage/favoritesStore';
import { resetHistoryCacheForTests } from '../services/storage/historyStore';

const HORIMIYA_SUMMARY = {
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
    extraLarge: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx124080.jpg',
    large: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx124080.jpg',
    medium: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/small/bx124080.jpg',
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
  averageScore: 82,
  meanScore: 82,
  popularity: 550000,
  genres: ['Comedy', 'Romance', 'Slice of Life'],
  isAdult: false,
  description: 'A secret life is the one thing Hori and Miyamura have in common.',
  nextAiringEpisode: null,
  studios: {
    edges: [{ isMain: true, node: { id: 1, name: 'CloverWorks', isAnimationStudio: true } }],
  },
};

const HORIMIYA_DETAILS = {
  ...HORIMIYA_SUMMARY,
  endDate: { year: 2021, month: 4, day: 4 },
  source: 'MANGA',
  synonyms: [],
  favourites: 42000,
  siteUrl: 'https://anilist.co/anime/124080',
  trailer: null,
  streamingEpisodes: [
    {
      title: 'Episode 1 - A Tiny Happenstance',
      thumbnail: 'https://img.example/ep1.jpg',
      url: 'https://crunchyroll.com/watch/1',
      site: 'Crunchyroll',
    },
    {
      title: 'Episode 2 - You Wear More Than One Face',
      thumbnail: 'https://img.example/ep2.jpg',
      url: 'https://crunchyroll.com/watch/2',
      site: 'Crunchyroll',
    },
  ],
  externalLinks: [
    {
      id: 1,
      url: 'https://www.crunchyroll.com/horimiya',
      site: 'Crunchyroll',
      type: 'STREAMING',
      language: 'English',
      color: null,
      icon: null,
      isDisabled: false,
    },
  ],
  relations: { edges: [] },
  recommendations: { nodes: [] },
};

function createGraphQLFetchMock() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as {
      query?: string;
      variables?: Record<string, unknown>;
    };
    const query = body.query ?? '';

    if (query.includes('HomeCatalogue')) {
      return new Response(
        JSON.stringify({
          data: {
            trending: { media: [HORIMIYA_SUMMARY] },
            seasonal: { media: [HORIMIYA_SUMMARY] },
            popular: { media: [HORIMIYA_SUMMARY] },
            topRated: { media: [HORIMIYA_SUMMARY] },
            recentlyAired: {
              airingSchedules: [
                { id: 501, episode: 13, airingAt: 1792900000, media: HORIMIYA_SUMMARY },
              ],
            },
          },
        }),
        { status: 200 },
      );
    }

    if (query.includes('GenreList')) {
      return new Response(
        JSON.stringify({ data: { GenreCollection: ['Action', 'Comedy', 'Romance'] } }),
        { status: 200 },
      );
    }

    if (query.includes('SearchAnime')) {
      return new Response(
        JSON.stringify({
          data: {
            Page: {
              pageInfo: { currentPage: 1, hasNextPage: false, perPage: 24 },
              media: [HORIMIYA_SUMMARY],
            },
          },
        }),
        { status: 200 },
      );
    }

    if (query.includes('AnimeDetails')) {
      return new Response(
        JSON.stringify({ data: { Media: HORIMIYA_DETAILS } }),
        { status: 200 },
      );
    }

    return new Response(JSON.stringify({ data: {} }), { status: 200 });
  });
}

describe('Solfain Application Flows & Acceptance Criteria', () => {
  beforeEach(() => {
    clearAniListCache();
    window.localStorage.clear();
    window.sessionStorage.clear();
    resetFavoritesCacheForTests();
    resetHistoryCacheForTests();
    resetAdNetworkAdapter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('renders Homepage with real AniList sections, AdSlot, and zero beta banners', async () => {
    createGraphQLFetchMock();

    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: 'Horimiya', level: 1 });
    expect(screen.getByRole('heading', { name: 'Trending Now' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recently Released' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'All-Time Popular' })).toBeInTheDocument();
    // Clean homepage top: only mid-catalogue (320x50) and footer (300x250) slots
    expect(screen.getAllByLabelText('Sponsored unit')).toHaveLength(2);

    // Strictly verify absence of any beta banner text
    expect(screen.queryByText(/SOLFAIN IS IN BETA/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/not everything will load properly/i)).not.toBeInTheDocument();
  });

  it('debounces search queries and resolves Horimiya (ID 124080)', async () => {
    const fetchMock = createGraphQLFetchMock();

    render(
      <MemoryRouter initialEntries={['/search']}>
        <AppRoutes />
      </MemoryRouter>,
    );

    await screen.findByText('Horimiya');
    const callsAfterInitialLoad = fetchMock.mock.calls.length;

    const searchInput = screen.getByLabelText('Title');
    fireEvent.change(searchInput, { target: { value: 'Ho' } });
    fireEvent.change(searchInput, { target: { value: 'Horim' } });
    fireEvent.change(searchInput, { target: { value: 'Horimiya' } });

    // Immediately after rapid keystrokes, no extra SearchAnime request has been sent yet
    expect(fetchMock.mock.calls.length).toBe(callsAfterInitialLoad);

    // Wait for debounce window (400ms) to elapse and fire a single search request
    await waitFor(
      () => {
        expect(fetchMock.mock.calls.length).toBe(callsAfterInitialLoad + 1);
      },
      { timeout: 1200 },
    );

    const cardLink = screen.getByRole('link', { name: /Horimiya/i });
    expect(cardLink).toHaveAttribute('href', '/anime/124080');
  });

  it('renders Anime Details for Horimiya (124080), toggles Favorites, and persists on reload', async () => {
    createGraphQLFetchMock();

    const { unmount } = render(
      <MemoryRouter initialEntries={['/anime/124080']}>
        <AppRoutes />
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: 'Horimiya', level: 1 });
    expect(screen.getByText('ホリミヤ')).toBeInTheDocument();
    expect(screen.getAllByText('CloverWorks').length).toBeGreaterThan(0);
    expect(screen.getByText('A Tiny Happenstance')).toBeInTheDocument();

    const favButton = screen.getByRole('button', { name: /Add to Favorites/i });
    fireEvent.click(favButton);
    expect(screen.getByRole('button', { name: /In Favorites/i })).toBeInTheDocument();

    unmount();
    resetFavoritesCacheForTests();

    render(
      <MemoryRouter initialEntries={['/favorites']}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Horimiya')).toBeInTheDocument();
  });

  it('supports Watch Page playback iframe, SUB/DUB switching, Prev/Next navigation, and Watch History persistence', async () => {
    createGraphQLFetchMock();

    const { unmount } = render(
      <MemoryRouter initialEntries={['/watch/124080?ep=1']}>
        <AppRoutes />
      </MemoryRouter>,
    );

    const iframe = await screen.findByTitle('Horimiya — Episode 1 (SUB)');
    expect(iframe).toHaveAttribute('src', 'https://player.yenime.net/anime/ani/124080/1');

    // Switch to DUB
    fireEvent.click(screen.getByRole('button', { name: 'DUB' }));
    const dubIframe = await screen.findByTitle('Horimiya — Episode 1 (DUB)');
    expect(dubIframe).toHaveAttribute(
      'src',
      'https://player.yenime.net/anime/ani/124080/1?dub=1',
    );

    // Navigate to Next Episode (Episode 2)
    fireEvent.click(screen.getByRole('button', { name: 'Next episode' }));
    const ep2Iframe = await screen.findByTitle('Horimiya — Episode 2 (DUB)');
    expect(ep2Iframe).toHaveAttribute(
      'src',
      'https://player.yenime.net/anime/ani/124080/2?dub=1',
    );

    // Jump directly to Episode 7 via compact episode dropdown
    fireEvent.change(screen.getByLabelText('Select episode'), { target: { value: '7' } });
    const ep7Iframe = await screen.findByTitle('Horimiya — Episode 7 (DUB)');
    expect(ep7Iframe).toHaveAttribute(
      'src',
      'https://player.yenime.net/anime/ani/124080/7?dub=1',
    );

    // Simulate reload and inspect Watch History page
    unmount();
    resetHistoryCacheForTests();

    render(
      <MemoryRouter initialEntries={['/history']}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Horimiya')).toBeInTheDocument();
    expect(screen.getByText(/Episode 7/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Resume Ep 7/i })).toHaveAttribute(
      'href',
      '/watch/124080?ep=7&audio=dub',
    );
  });

  it('shows real error state with retry and zero hardcoded results when Search API fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network offline'));

    render(
      <MemoryRouter initialEntries={['/search?q=Horimiya']}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Search failed' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Horimiya/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
  });

  it('mounts live Adsterra 300x250 & 320x50 scripts directly in top-level DOM and degrades gracefully on block/disable', async () => {
    const { container, unmount } = render(<AdSlot placement="sidebar-rectangle" />);

    await waitFor(() => {
      const script = container.querySelector(
        'script[data-adsterra-key="8031ff5e7be9985553dcdea4bbb45d96"]',
      );
      expect(script).not.toBeNull();
    });

    const rectScript = container.querySelector(
      'script[data-adsterra-key="8031ff5e7be9985553dcdea4bbb45d96"]',
    ) as HTMLScriptElement;
    expect(rectScript.getAttribute('src')).toBe(
      'https://bauval.org/22/8031ff5e7be9985553dcdea4bbb45d96',
    );
    expect(window.atOptions).toEqual({
      key: '8031ff5e7be9985553dcdea4bbb45d96',
      format: 'iframe',
      height: 250,
      width: 300,
      params: {},
    });
    rectScript.dispatchEvent(new Event('load'));
    unmount();

    const { container: bannerContainer, unmount: unmountBanner } = render(
      <AdSlot placement="watch-below-player" />,
    );

    await waitFor(() => {
      const script = bannerContainer.querySelector(
        'script[data-adsterra-key="6339f8aa4607b6c12e213fc4cf317df1"]',
      );
      expect(script).not.toBeNull();
    });

    const bannerScript = bannerContainer.querySelector(
      'script[data-adsterra-key="6339f8aa4607b6c12e213fc4cf317df1"]',
    ) as HTMLScriptElement;
    expect(bannerScript.getAttribute('src')).toBe(
      'https://bauval.org/22/6339f8aa4607b6c12e213fc4cf317df1',
    );
    expect(window.atOptions).toEqual({
      key: '6339f8aa4607b6c12e213fc4cf317df1',
      format: 'iframe',
      height: 50,
      width: 320,
      params: {},
    });
    bannerScript.dispatchEvent(new Event('load'));
    unmountBanner();

    registerAdNetworkAdapter({
      id: 'failing-network',
      name: 'Failing Ad Provider',
      isConfigured: true,
      async mountSlot() {
        throw new Error('Blocked by client content blocker');
      },
    });

    const { rerender } = render(<AdSlot placement="sidebar-rectangle" />);

    await waitFor(() => {
      expect(screen.getByText(/blocked by browser shield/i)).toBeInTheDocument();
    });

    rerender(<AdSlot placement="sidebar-rectangle" enabled={false} />);
    expect(screen.queryByLabelText('Sponsored unit')).not.toBeInTheDocument();
  });
});
