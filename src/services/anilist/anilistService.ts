import type {
  AnimeDetails,
  AnimeSearchFilters,
  AnimeSummary,
  HomeCatalogueData,
  MediaSort,
  PaginatedAnimeResult,
  RecentAiringItem,
} from '../../types/anime';
import { getCurrentSeason } from '../../utils/format';
import { anilistRequest, AniListApiError } from './client';
import {
  ANIME_DETAILS_QUERY,
  GENRE_COLLECTION_QUERY,
  HOME_CATALOGUE_QUERY,
  SEARCH_ANIME_QUERY,
  SEEDED_RECOMMENDATIONS_QUERY,
} from './queries';

interface RawHomeCatalogueResponse {
  trending: { media: AnimeSummary[] };
  seasonal: { media: AnimeSummary[] };
  popular: { media: AnimeSummary[] };
  topRated: { media: AnimeSummary[] };
  recentlyAired: { airingSchedules: RecentAiringItem[] };
}

interface RawSearchResponse {
  Page: {
    pageInfo: {
      currentPage: number;
      hasNextPage: boolean;
      perPage: number;
    };
    media: AnimeSummary[];
  };
}

interface RawDetailsResponse {
  Media: AnimeDetails | null;
}

interface RawGenresResponse {
  GenreCollection: string[];
}

const EXCLUDED_ADULT_GENRES = new Set(['Hentai']);

function isSafeAnime(media: AnimeSummary | null | undefined): media is AnimeSummary {
  if (!media || typeof media.id !== 'number') return false;
  if (media.isAdult) return false;
  if (Array.isArray(media.genres) && media.genres.some((g) => EXCLUDED_ADULT_GENRES.has(g))) {
    return false;
  }
  return true;
}

export async function getHomeCatalogue(options?: {
  bypassCache?: boolean;
  signal?: AbortSignal;
}): Promise<HomeCatalogueData> {
  const { season, year } = getCurrentSeason();

  const data = await anilistRequest<RawHomeCatalogueResponse>(
    HOME_CATALOGUE_QUERY,
    { season, seasonYear: year },
    {
      ttlMs: 5 * 60 * 1000,
      bypassCache: options?.bypassCache,
      signal: options?.signal,
    },
  );

  const seenRecentMediaIds = new Set<number>();
  const recentlyReleased: RecentAiringItem[] = [];
  for (const item of data.recentlyAired?.airingSchedules ?? []) {
    if (!item?.media || !isSafeAnime(item.media)) continue;
    if (item.media.type && item.media.type !== 'ANIME') continue;
    if (seenRecentMediaIds.has(item.media.id)) continue;
    seenRecentMediaIds.add(item.media.id);
    recentlyReleased.push(item);
    if (recentlyReleased.length >= 16) break;
  }

  return {
    trending: (data.trending?.media ?? []).filter(isSafeAnime),
    seasonal: (data.seasonal?.media ?? []).filter(isSafeAnime),
    popular: (data.popular?.media ?? []).filter(isSafeAnime),
    topRated: (data.topRated?.media ?? []).filter(isSafeAnime),
    recentlyReleased,
    seasonInfo: { season, year },
  };
}

export async function searchAnime(
  filters: AnimeSearchFilters,
  options?: { signal?: AbortSignal; bypassCache?: boolean },
): Promise<PaginatedAnimeResult> {
  const trimmedQuery = filters.query?.trim() || undefined;
  const page = Math.max(1, filters.page ?? 1);
  const perPage = Math.min(50, Math.max(1, filters.perPage ?? 24));

  let sortList: MediaSort[];
  if (filters.sort) {
    sortList =
      trimmedQuery && filters.sort === 'SEARCH_MATCH'
        ? ['SEARCH_MATCH', 'POPULARITY_DESC']
        : [filters.sort];
  } else {
    sortList = trimmedQuery ? ['SEARCH_MATCH', 'POPULARITY_DESC'] : ['POPULARITY_DESC'];
  }

  const variables: Record<string, unknown> = {
    page,
    perPage,
    sort: sortList,
  };

  if (trimmedQuery) variables.search = trimmedQuery;
  if (filters.genre) variables.genre = filters.genre;
  if (filters.format) variables.format = filters.format;
  if (filters.season) {
    variables.season = filters.season;
    if (filters.seasonYear) {
      variables.seasonYear = filters.seasonYear;
    }
  } else if (filters.seasonYear) {
    variables.startDateLike = `${filters.seasonYear}%`;
  }
  if (filters.status) variables.status = filters.status;

  const data = await anilistRequest<RawSearchResponse>(SEARCH_ANIME_QUERY, variables, {
    ttlMs: 3 * 60 * 1000,
    signal: options?.signal,
    bypassCache: options?.bypassCache,
  });

  return {
    pageInfo: {
      currentPage: data.Page?.pageInfo?.currentPage ?? page,
      hasNextPage: Boolean(data.Page?.pageInfo?.hasNextPage),
      perPage: data.Page?.pageInfo?.perPage ?? perPage,
    },
    media: (data.Page?.media ?? []).filter(isSafeAnime),
  };
}

export async function getAnimeDetails(
  id: number,
  options?: { signal?: AbortSignal; bypassCache?: boolean },
): Promise<AnimeDetails> {
  if (!Number.isInteger(id) || id <= 0) {
    throw new AniListApiError('Invalid AniList anime identifier.', { status: 400 });
  }

  const data = await anilistRequest<RawDetailsResponse>(
    ANIME_DETAILS_QUERY,
    { id },
    {
      ttlMs: 10 * 60 * 1000,
      signal: options?.signal,
      bypassCache: options?.bypassCache,
    },
  );

  if (!data.Media) {
    throw new AniListApiError('Anime entry not found on AniList.', { status: 404 });
  }

  return {
    ...data.Media,
    genres: (data.Media.genres ?? []).filter((g) => !EXCLUDED_ADULT_GENRES.has(g)),
    synonyms: data.Media.synonyms ?? [],
    streamingEpisodes: data.Media.streamingEpisodes ?? [],
    externalLinks: data.Media.externalLinks ?? [],
    relations: {
      edges: (data.Media.relations?.edges ?? []).filter((edge) => Boolean(edge?.node)),
    },
    recommendations: {
      nodes: (data.Media.recommendations?.nodes ?? []).filter((node) =>
        isSafeAnime(node?.mediaRecommendation),
      ),
    },
  };
}

export async function getAnimeGenres(options?: { signal?: AbortSignal }): Promise<string[]> {
  const data = await anilistRequest<RawGenresResponse>(
    GENRE_COLLECTION_QUERY,
    {},
    {
      ttlMs: 60 * 60 * 1000,
      signal: options?.signal,
    },
  );
  return (data.GenreCollection ?? []).filter((genre) => !EXCLUDED_ADULT_GENRES.has(genre));
}

interface RawSeededRecsResponse {
  Media: {
    id: number;
    recommendations: {
      nodes: Array<{
        id: number;
        rating: number | null;
        mediaRecommendation: AnimeSummary | null;
      }>;
    };
  } | null;
}

export async function getSeededRecommendations(
  animeId: number,
  options?: { signal?: AbortSignal },
): Promise<AnimeSummary[]> {
  if (!Number.isInteger(animeId) || animeId <= 0) return [];
  const data = await anilistRequest<RawSeededRecsResponse>(
    SEEDED_RECOMMENDATIONS_QUERY,
    { id: animeId },
    {
      ttlMs: 10 * 60 * 1000,
      signal: options?.signal,
    },
  );
  return (data.Media?.recommendations?.nodes ?? [])
    .map((n) => n.mediaRecommendation)
    .filter(isSafeAnime);
}
