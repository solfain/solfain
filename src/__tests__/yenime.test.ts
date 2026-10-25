import { describe, expect, it } from 'vitest';
import { YENIME_PLAYER_ORIGIN, YenimeProvider } from '../services/providers/yenimeProvider';
import type { AnimeDetails } from '../types/anime';

function makeHorimiyaDetails(overrides: Partial<AnimeDetails> = {}): AnimeDetails {
  return {
    id: 124080,
    idMal: 42897,
    type: 'ANIME',
    title: {
      romaji: 'Horimiya',
      english: 'Horimiya',
      native: 'ホリミヤ',
    },
    coverImage: { extraLarge: null, large: null, medium: null, color: null },
    bannerImage: null,
    format: 'TV',
    status: 'FINISHED',
    episodes: 13,
    duration: 24,
    season: 'WINTER',
    seasonYear: 2021,
    startDate: { year: 2021, month: 1, day: 10 },
    endDate: { year: 2021, month: 4, day: 4 },
    averageScore: 82,
    popularity: 500000,
    genres: ['Comedy', 'Romance'],
    description: 'Synopsis',
    nextAiringEpisode: null,
    source: 'MANGA',
    synonyms: [],
    favourites: 1000,
    siteUrl: 'https://anilist.co/anime/124080',
    trailer: null,
    streamingEpisodes: [
      {
        title: 'Episode 1 - A Tiny Happenstance',
        thumbnail: 'https://img.example/1.jpg',
        url: 'https://crunchyroll.com/1',
        site: 'Crunchyroll',
      },
    ],
    externalLinks: [],
    relations: { edges: [] },
    recommendations: { nodes: [] },
    ...overrides,
  };
}

describe('Yenime Video Provider Adapter', () => {
  const provider = new YenimeProvider();

  it('builds real episode list and enriches titles from AniList streamingEpisodes', () => {
    const catalogue = provider.buildEpisodeCatalogue(makeHorimiyaDetails());
    expect(catalogue.airedEpisodeCount).toBe(13);
    expect(catalogue.episodes).toHaveLength(13);
    expect(catalogue.episodes[0]?.title).toBe('A Tiny Happenstance');
    expect(catalogue.episodes[1]?.title).toBeNull();
  });

  it('caps airing series episodes to aired count based on nextAiringEpisode', () => {
    const airing = makeHorimiyaDetails({
      status: 'RELEASING',
      episodes: 12,
      nextAiringEpisode: {
        id: 99,
        episode: 6,
        airingAt: 1800000000,
        timeUntilAiring: 86400,
      },
    });
    const catalogue = provider.buildEpisodeCatalogue(airing);
    expect(catalogue.airedEpisodeCount).toBe(5);
    expect(catalogue.episodes).toHaveLength(5);
  });

  it('resolves documented Yenime AniList and MAL embed URLs with SUB/DUB support', () => {
    const anime = makeHorimiyaDetails();

    const subSource = provider.resolvePlaybackSource({
      anime,
      episode: 1,
      audio: 'sub',
    });
    expect(subSource.ok).toBe(true);
    expect(subSource.embedUrl).toBe(`${YENIME_PLAYER_ORIGIN}/anime/ani/124080/1`);

    const dubSource = provider.resolvePlaybackSource({
      anime,
      episode: 4,
      audio: 'dub',
    });
    expect(dubSource.ok).toBe(true);
    expect(dubSource.embedUrl).toBe(`${YENIME_PLAYER_ORIGIN}/anime/ani/124080/4?dub=1`);

    const malSource = provider.resolvePlaybackSource({
      anime,
      episode: 2,
      audio: 'dub',
      idMode: 'mal',
    });
    expect(malSource.ok).toBe(true);
    expect(malSource.embedUrl).toBe(`${YENIME_PLAYER_ORIGIN}/anime/mal/42897/2?dub=1`);
  });

  it('gracefully rejects unreleased anime or out-of-range episodes', () => {
    const upcoming = makeHorimiyaDetails({ status: 'NOT_YET_RELEASED' });
    const res1 = provider.resolvePlaybackSource({
      anime: upcoming,
      episode: 1,
      audio: 'sub',
    });
    expect(res1.ok).toBe(false);
    expect(res1.embedUrl).toBeNull();

    const outOfBounds = provider.resolvePlaybackSource({
      anime: makeHorimiyaDetails(),
      episode: 99,
      audio: 'sub',
    });
    expect(outOfBounds.ok).toBe(false);
    expect(outOfBounds.embedUrl).toBeNull();
  });

  it('validates postMessage PLAYER_EVENT strictly by origin and payload shape', () => {
    const spoofed = new MessageEvent('message', {
      origin: 'https://evil.example',
      data: { type: 'PLAYER_EVENT', data: { event: 'timeupdate', currentTime: 42, duration: 1400 } },
    });
    expect(provider.parsePlayerMessage(spoofed)).toBeNull();

    const genuine = new MessageEvent('message', {
      origin: YENIME_PLAYER_ORIGIN,
      data: { type: 'PLAYER_EVENT', data: { event: 'timeupdate', currentTime: 85.4, duration: 1420 } },
    });
    expect(provider.parsePlayerMessage(genuine)).toEqual({
      event: 'timeupdate',
      currentTime: 85.4,
      duration: 1420,
    });
  });
});
