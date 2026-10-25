import type { AnimeDetails, AnimeSummary } from './anime';

export type AudioTrack = 'sub' | 'dub';

export type ProviderIdMode = 'anilist' | 'mal';

export interface EpisodeItem {
  number: number;
  title: string | null;
  thumbnail: string | null;
  sourceSite: string | null;
  isAired: boolean;
}

export interface EpisodeCatalogue {
  episodes: EpisodeItem[];
  totalKnownEpisodes: number | null;
  airedEpisodeCount: number;
  hasExactEpisodeCount: boolean;
  statusNote: string | null;
}

export interface PlaybackRequest {
  anime: Pick<
    AnimeSummary,
    'id' | 'idMal' | 'title' | 'status' | 'format' | 'episodes' | 'nextAiringEpisode'
  >;
  episode: number;
  audio: AudioTrack;
  idMode?: ProviderIdMode;
}

export interface PlaybackSourceResult {
  ok: boolean;
  providerId: string;
  providerName: string;
  mode: 'iframe';
  embedUrl: string | null;
  audio: AudioTrack;
  idMode: ProviderIdMode;
  canFallbackToMal: boolean;
  errorMessage?: string;
}

export interface PlayerTelemetryPayload {
  event: 'play' | 'pause' | 'seeked' | 'ended' | 'timeupdate';
  currentTime: number;
  duration: number;
}

export interface ProviderCapabilities {
  supportsAniListId: boolean;
  supportsMalId: boolean;
  supportsSubDubToggle: boolean;
  supportsEpisodeListEndpoint: boolean;
  supportsPostMessageProgress: boolean;
  embedOrigin: string;
  documentedEndpoints: string[];
  notes: string;
}

export interface VideoProviderAdapter {
  readonly id: string;
  readonly name: string;
  readonly capabilities: ProviderCapabilities;
  buildEpisodeCatalogue(anime: AnimeDetails | AnimeSummary): EpisodeCatalogue;
  resolvePlaybackSource(request: PlaybackRequest): PlaybackSourceResult;
  parsePlayerMessage(event: MessageEvent): PlayerTelemetryPayload | null;
}
