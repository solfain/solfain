import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ANILIST_ENDPOINT, AniListApiError, clearAniListCache } from '../services/anilist/client';
import {
  getAnimeDetails,
  getHomeCatalogue,
  searchAnime,
} from '../services/anilist/anilistService';

const HORIMIYA_MOCK = {
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
  endDate: { year: 2021, month: 4, day: 4 },
  averageScore: 82,
  meanScore: 82,
  popularity: 550000,
  genres: ['Comedy', 'Romance', 'Slice of Life'],
  isAdult: false,
  description:
    'A secret life is the one thing they have in common.<br><br><i>(Source: Funimation)</i>',
  nextAiringEpisode: null,
  source: 'MANGA',
  synonyms: ['Hori-san to Miyamura-kun'],
  favourites: 42000,
  siteUrl: 'https://anilist.co/anime/124080',
  trailer: null,
  studios: {
    edges: [{ isMain: true, node: { id: 1, name: 'CloverWorks', isAnimationStudio: true } }],
  },
  streamingEpisodes: [
    {
      title: 'Episode 1 - A Tiny Happenstance',
      thumbnail: 'https://img.example/ep1.jpg',
      url: 'https://www.crunchyroll.com/watch/G2XU033D4',
      site: 'Crunchyroll',
    },
    {
      title: 'Episode 2 - You Wear More Than One Face',
      thumbnail: 'https://img.example/ep2.jpg',
      url: 'https://www.crunchyroll.com/watch/GZ7UVXX1G',
      site: 'Crunchyroll',
    },
  ],
  externalLinks: [
    {
      id: 10,
      url: 'https://www.crunchyroll.com/horimiya',
      site: 'Crunchyroll',
      type: 'STREAMING',
      language: 'English',
      color: '#F47521',
      icon: null,
      isDisabled: false,
    },
  ],
  relations: {
    edges: [
      {
        id: 201,
        relationType: 'SIDE_STORY',
        node: {
          id: 163132,
          idMal: 54856,
          type: 'ANIME',
          title: {
            romaji: 'Horimiya: piece',
            english: 'Horimiya: The Missing Pieces',
            native: 'ホリミヤ -piece-',
          },
          coverImage: { extraLarge: null, large: 'https://img.example/piece.jpg', medium: null, color: null },
          bannerImage: null,
          format: 'TV',
          status: 'FINISHED',
          episodes: 13,
          duration: 24,
          season: 'SUMMER',
          seasonYear: 2023,
          startDate: { year: 2023, month: 7, day: 1 },
          averageScore: 81,
          popularity: 180000,
          genres: ['Comedy', 'Romance'],
          isAdult: false,
          nextAiringEpisode: null,
        },
      },
    ],
  },
  recommendations: {
    nodes: [],
  },
};

describe('AniList Service Layer', () => {
  beforeEach(() => {
    clearAniListCache();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves Horimiya (AniList ID 124080) accurately with titles, artwork, and relations', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { Media: HORIMIYA_MOCK } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await getAnimeDetails(124080);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(ANILIST_ENDPOINT);
    expect(result.id).toBe(124080);
    expect(result.idMal).toBe(42897);
    expect(result.title.english).toBe('Horimiya');
    expect(result.title.native).toBe('ホリミヤ');
    expect(result.episodes).toBe(13);
    expect(result.genres).toEqual(['Comedy', 'Romance', 'Slice of Life']);
    expect(result.relations.edges[0]?.node.id).toBe(163132);
  });

  it('deduplicates concurrent identical requests and caches responses', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { Media: HORIMIYA_MOCK } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const [first, second] = await Promise.all([
      getAnimeDetails(124080),
      getAnimeDetails(124080),
    ]);
    const third = await getAnimeDetails(124080);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first.id).toBe(124080);
    expect(second.id).toBe(124080);
    expect(third.id).toBe(124080);
  });

  it('surfaces rate-limit 429 errors cleanly without returning fake data', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: null,
          errors: [{ message: 'Too Many Requests.', status: 429 }],
        }),
        {
          status: 429,
          headers: { 'Retry-After': '25' },
        },
      ),
    );

    await expect(searchAnime({ query: 'Horimiya' })).rejects.toThrowError(AniListApiError);
  });

  it('fetches batched homepage catalogue and deduplicates recently aired episodes', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            trending: { media: [HORIMIYA_MOCK] },
            seasonal: { media: [HORIMIYA_MOCK] },
            popular: { media: [HORIMIYA_MOCK] },
            topRated: { media: [HORIMIYA_MOCK] },
            recentlyAired: {
              airingSchedules: [
                { id: 1, episode: 5, airingAt: 1792900000, media: HORIMIYA_MOCK },
                { id: 2, episode: 4, airingAt: 1792300000, media: HORIMIYA_MOCK },
              ],
            },
          },
        }),
        { status: 200 },
      ),
    );

    const home = await getHomeCatalogue();
    expect(home.trending).toHaveLength(1);
    expect(home.recentlyReleased).toHaveLength(1);
    expect(home.recentlyReleased[0]?.episode).toBe(5);
  });
});
