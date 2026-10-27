export type MediaFormat =
  | 'TV'
  | 'TV_SHORT'
  | 'MOVIE'
  | 'SPECIAL'
  | 'OVA'
  | 'ONA'
  | 'MUSIC';

export type MediaStatus =
  | 'FINISHED'
  | 'RELEASING'
  | 'NOT_YET_RELEASED'
  | 'CANCELLED'
  | 'HIATUS';

export type MediaSeason = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';

export type MediaSort =
  | 'TRENDING_DESC'
  | 'POPULARITY_DESC'
  | 'SCORE_DESC'
  | 'START_DATE_DESC'
  | 'FAVOURITES_DESC'
  | 'SEARCH_MATCH'
  | 'TITLE_ROMAJI';

export type MediaRelationType =
  | 'ADAPTATION'
  | 'PREQUEL'
  | 'SEQUEL'
  | 'PARENT'
  | 'SIDE_STORY'
  | 'CHARACTER'
  | 'SUMMARY'
  | 'ALTERNATIVE'
  | 'SPIN_OFF'
  | 'OTHER'
  | 'SOURCE'
  | 'COMPILATION'
  | 'CONTAINS';

export interface MediaTitle {
  romaji: string | null;
  english: string | null;
  native: string | null;
  userPreferred?: string | null;
}

export interface MediaCoverImage {
  extraLarge: string | null;
  large: string | null;
  medium: string | null;
  color: string | null;
}

export interface FuzzyDate {
  year: number | null;
  month: number | null;
  day: number | null;
}

export interface NextAiringEpisode {
  id: number;
  airingAt: number;
  timeUntilAiring: number;
  episode: number;
}

export interface MediaStreamingEpisode {
  title: string | null;
  thumbnail: string | null;
  url: string | null;
  site: string | null;
}

export interface MediaExternalLink {
  id: number;
  url: string | null;
  site: string;
  type: 'INFO' | 'STREAMING' | 'SOCIAL' | null;
  language: string | null;
  color: string | null;
  icon: string | null;
  isDisabled: boolean | null;
}

export interface MediaTrailer {
  id: string | null;
  site: string | null;
  thumbnail: string | null;
}

export interface MediaStudioNode {
  id: number;
  name: string;
  isAnimationStudio?: boolean;
}

export interface MediaStudioEdge {
  isMain: boolean;
  node: MediaStudioNode;
}

export interface AnimeSummary {
  id: number;
  idMal: number | null;
  type?: 'ANIME' | 'MANGA' | null;
  title: MediaTitle;
  coverImage: MediaCoverImage;
  bannerImage: string | null;
  format: MediaFormat | string | null;
  status: MediaStatus | null;
  episodes: number | null;
  duration: number | null;
  season: MediaSeason | null;
  seasonYear: number | null;
  startDate: FuzzyDate | null;
  averageScore: number | null;
  meanScore?: number | null;
  popularity: number | null;
  genres: string[];
  isAdult?: boolean | null;
  description?: string | null;
  nextAiringEpisode: NextAiringEpisode | null;
  studios?: {
    edges: MediaStudioEdge[];
  } | null;
}

export interface MediaRelationItem {
  id: number;
  relationType: MediaRelationType | string | null;
  node: AnimeSummary;
}

export interface AnimeDetails extends AnimeSummary {
  description: string | null;
  endDate: FuzzyDate | null;
  source: string | null;
  synonyms: string[];
  favourites: number | null;
  siteUrl: string | null;
  trailer: MediaTrailer | null;
  streamingEpisodes: MediaStreamingEpisode[];
  externalLinks: MediaExternalLink[];
  relations: {
    edges: MediaRelationItem[];
  };
  recommendations: {
    nodes: Array<{
      id: number;
      rating: number | null;
      mediaRecommendation: AnimeSummary | null;
    }>;
  };
}

export interface RecentAiringItem {
  id: number;
  episode: number;
  airingAt: number;
  media: AnimeSummary;
}

export interface AiringScheduleEntry {
  id: number;
  episode: number;
  airingAt: number;
  timeUntilAiring: number;
  media: AnimeSummary;
}

export interface PageInfo {
  currentPage: number;
  hasNextPage: boolean;
  perPage: number;
}

export interface PaginatedAnimeResult {
  pageInfo: PageInfo;
  media: AnimeSummary[];
}

export interface HomeCatalogueData {
  trending: AnimeSummary[];
  seasonal: AnimeSummary[];
  popular: AnimeSummary[];
  topRated: AnimeSummary[];
  recentlyReleased: RecentAiringItem[];
  seasonInfo: {
    season: MediaSeason;
    year: number;
  };
}

export interface AnimeSearchFilters {
  query?: string;
  genre?: string;
  format?: MediaFormat | '';
  season?: MediaSeason | '';
  seasonYear?: number | '';
  status?: MediaStatus | '';
  sort?: MediaSort;
  page?: number;
  perPage?: number;
}
