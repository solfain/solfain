import type { AudioTrack } from './provider';

export interface FavoriteAnimeItem {
  id: number;
  idMal: number | null;
  title: string;
  romajiTitle: string | null;
  coverImage: string | null;
  coverColor: string | null;
  format: string | null;
  seasonYear: number | null;
  averageScore: number | null;
  episodes: number | null;
  addedAt: number;
}

export interface WatchHistoryItem {
  animeId: number;
  idMal: number | null;
  title: string;
  romajiTitle: string | null;
  coverImage: string | null;
  bannerImage: string | null;
  format: string | null;
  episode: number;
  episodeTitle: string | null;
  totalEpisodes: number | null;
  audio: AudioTrack;
  visitedAt: number;
  /**
   * Populated ONLY when verified player telemetry (postMessage PLAYER_EVENT)
   * actually reports finite playback progress. Never fabricated.
   */
  progressSeconds: number | null;
  durationSeconds: number | null;
}
