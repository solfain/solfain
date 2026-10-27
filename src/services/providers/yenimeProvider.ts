import type { AnimeDetails, AnimeSummary, MediaStreamingEpisode } from '../../types/anime';
import type {
  EpisodeCatalogue,
  EpisodeItem,
  PlaybackRequest,
  PlaybackSourceResult,
  PlayerTelemetryPayload,
  VideoProviderAdapter,
} from '../../types/provider';
import { sanitizeHttpUrl, sanitizePlainText } from '../../utils/security';

export const YENIME_PLAYER_ORIGIN = 'https://player.yenime.net';
const MAX_TELEMETRY_SECONDS = 86_400;

interface ParsedStreamMeta {
  title: string | null;
  thumbnail: string | null;
  site: string | null;
}

function parseStreamingEpisodesMap(
  streamingEpisodes: MediaStreamingEpisode[] | undefined,
): Map<number, ParsedStreamMeta> {
  const map = new Map<number, ParsedStreamMeta>();
  if (!Array.isArray(streamingEpisodes) || streamingEpisodes.length === 0) {
    return map;
  }

  streamingEpisodes.forEach((entry, index) => {
    const rawTitle = entry.title?.trim() ?? '';
    const match = rawTitle.match(/^(?:episode|ep\.?)\s*(\d+)(?:\s*[-–:—]\s*(.*))?$/i);
    let epNumber: number | null = null;
    let cleanTitle: string | null = null;

    if (match) {
      epNumber = Number.parseInt(match[1], 10);
      cleanTitle = match[2]?.trim() || null;
    } else if (streamingEpisodes.length > 0 && rawTitle) {
      epNumber = index + 1;
      cleanTitle = rawTitle;
    }

    if (epNumber && Number.isInteger(epNumber) && epNumber > 0 && !map.has(epNumber)) {
      map.set(epNumber, {
        title: cleanTitle ? sanitizePlainText(cleanTitle, 220) || null : null,
        thumbnail: sanitizeHttpUrl(entry.thumbnail, { httpsOnly: true }),
        site: entry.site ? sanitizePlainText(entry.site, 60) || null : null,
      });
    }
  });

  return map;
}

function isAnimeDetails(anime: AnimeDetails | AnimeSummary): anime is AnimeDetails {
  return 'streamingEpisodes' in anime;
}

export class YenimeProvider implements VideoProviderAdapter {
  readonly id = 'yenime';
  readonly name = 'Yenime';

  readonly capabilities = {
    supportsAniListId: true,
    supportsMalId: true,
    supportsSubDubToggle: true,
    supportsEpisodeListEndpoint: false,
    supportsPostMessageProgress: true,
    embedOrigin: YENIME_PLAYER_ORIGIN,
    documentedEndpoints: [
      `${YENIME_PLAYER_ORIGIN}/anime/ani/{anilistId}/{episode}`,
      `${YENIME_PLAYER_ORIGIN}/anime/mal/{malId}/{episode}`,
    ],
    notes:
      'Yenime provides direct episode player embeds resolved by AniList ID or MyAnimeList ID with ?dub=1 audio selection and PLAYER_EVENT postMessage state updates.',
  };

  buildEpisodeCatalogue(anime: AnimeDetails | AnimeSummary): EpisodeCatalogue {
    if (anime.status === 'NOT_YET_RELEASED') {
      return {
        episodes: [],
        totalKnownEpisodes: anime.episodes ?? null,
        airedEpisodeCount: 0,
        hasExactEpisodeCount: true,
        statusNote: 'This anime has not been released yet.',
      };
    }

    const streamMap = isAnimeDetails(anime)
      ? parseStreamingEpisodesMap(anime.streamingEpisodes)
      : new Map<number, ParsedStreamMeta>();

    const maxStreamEp =
      streamMap.size > 0 ? Math.max(...Array.from(streamMap.keys())) : 0;

    let airedCount = 0;
    let hasExactEpisodeCount = true;
    let statusNote: string | null = null;

    if (anime.status === 'RELEASING' && anime.nextAiringEpisode?.episode) {
      airedCount = Math.max(0, anime.nextAiringEpisode.episode - 1);
      if (airedCount === 0) {
        statusNote = 'Episode 1 is scheduled to air soon.';
      }
    } else if (typeof anime.episodes === 'number' && anime.episodes > 0) {
      airedCount = anime.episodes;
    } else if (maxStreamEp > 0) {
      airedCount = maxStreamEp;
      hasExactEpisodeCount = anime.status === 'FINISHED';
    } else if (anime.format === 'MOVIE' && anime.status === 'FINISHED') {
      airedCount = 1;
    } else if (anime.status === 'RELEASING') {
      airedCount = 1;
      hasExactEpisodeCount = false;
      statusNote =
        'Ongoing release without a fixed episode count on AniList. Use the episode jump box to open any aired episode.';
    } else {
      airedCount = 0;
      hasExactEpisodeCount = false;
      statusNote = 'Episode count is not yet listed on AniList for this entry.';
    }

    const cappedCount = Math.min(airedCount, 2500);
    const episodes: EpisodeItem[] = [];

    for (let num = 1; num <= cappedCount; num += 1) {
      const meta = streamMap.get(num);
      episodes.push({
        number: num,
        title: meta?.title ?? (anime.format === 'MOVIE' && cappedCount === 1 ? 'Full Feature' : null),
        thumbnail: meta?.thumbnail ?? null,
        sourceSite: meta?.site ?? null,
        isAired: true,
      });
    }

    return {
      episodes,
      totalKnownEpisodes: anime.episodes ?? null,
      airedEpisodeCount: cappedCount,
      hasExactEpisodeCount,
      statusNote,
    };
  }

  resolvePlaybackSource(request: PlaybackRequest): PlaybackSourceResult {
    const { anime, episode, audio } = request;
    const requestedMode = request.idMode ?? 'anilist';
    const canFallbackToMal = typeof anime.idMal === 'number' && anime.idMal > 0;

    if (anime.status === 'NOT_YET_RELEASED') {
      return {
        ok: false,
        providerId: this.id,
        providerName: this.name,
        mode: 'iframe',
        embedUrl: null,
        audio,
        idMode: requestedMode,
        canFallbackToMal,
        errorMessage: 'This title has not aired yet, so no playable episode stream is available.',
      };
    }

    if (!Number.isInteger(episode) || episode < 1) {
      return {
        ok: false,
        providerId: this.id,
        providerName: this.name,
        mode: 'iframe',
        embedUrl: null,
        audio,
        idMode: requestedMode,
        canFallbackToMal,
        errorMessage: 'Invalid episode number requested.',
      };
    }

    const catalogue = this.buildEpisodeCatalogue(anime as AnimeSummary);
    if (
      catalogue.hasExactEpisodeCount &&
      catalogue.airedEpisodeCount > 0 &&
      episode > catalogue.airedEpisodeCount
    ) {
      return {
        ok: false,
        providerId: this.id,
        providerName: this.name,
        mode: 'iframe',
        embedUrl: null,
        audio,
        idMode: requestedMode,
        canFallbackToMal,
        errorMessage: `Episode ${episode} is outside the available episode range (1–${catalogue.airedEpisodeCount}).`,
      };
    }

    if (catalogue.hasExactEpisodeCount && catalogue.airedEpisodeCount === 0) {
      return {
        ok: false,
        providerId: this.id,
        providerName: this.name,
        mode: 'iframe',
        embedUrl: null,
        audio,
        idMode: requestedMode,
        canFallbackToMal,
        errorMessage: catalogue.statusNote || 'No aired episodes are available yet.',
      };
    }

    let pathSegment: string;
    let activeMode: 'anilist' | 'mal' = requestedMode;

    if (requestedMode === 'mal') {
      if (!canFallbackToMal || !anime.idMal) {
        return {
          ok: false,
          providerId: this.id,
          providerName: this.name,
          mode: 'iframe',
          embedUrl: null,
          audio,
          idMode: 'mal',
          canFallbackToMal: false,
          errorMessage: 'No MyAnimeList identifier is mapped for this anime on AniList.',
        };
      }
      pathSegment = `/anime/mal/${anime.idMal}/${episode}`;
    } else {
      activeMode = 'anilist';
      pathSegment = `/anime/ani/${anime.id}/${episode}`;
    }

    const url = new URL(`${YENIME_PLAYER_ORIGIN}${pathSegment}`);
    if (audio === 'dub') {
      url.searchParams.set('dub', '1');
    }

    return {
      ok: true,
      providerId: this.id,
      providerName: this.name,
      mode: 'iframe',
      embedUrl: url.toString(),
      audio,
      idMode: activeMode,
      canFallbackToMal,
    };
  }

  parsePlayerMessage(
    event: MessageEvent,
    expectedSource?: MessageEventSource | null,
  ): PlayerTelemetryPayload | null {
    if (event.origin !== YENIME_PLAYER_ORIGIN) {
      return null;
    }

    if (expectedSource && event.source && event.source !== expectedSource) {
      return null;
    }

    const payload = event.data as
      | {
          type?: unknown;
          data?: {
            event?: unknown;
            currentTime?: unknown;
            duration?: unknown;
          };
        }
      | null
      | undefined;

    if (!payload || typeof payload !== 'object' || payload.type !== 'PLAYER_EVENT') {
      return null;
    }

    if (!payload.data || typeof payload.data !== 'object') {
      return null;
    }

    const eventName = payload.data.event;
    if (
      eventName !== 'play' &&
      eventName !== 'pause' &&
      eventName !== 'seeked' &&
      eventName !== 'ended' &&
      eventName !== 'timeupdate'
    ) {
      return null;
    }

    const currentTime =
      typeof payload.data.currentTime === 'number' && Number.isFinite(payload.data.currentTime)
        ? Math.min(MAX_TELEMETRY_SECONDS, Math.max(0, payload.data.currentTime))
        : 0;
    const duration =
      typeof payload.data.duration === 'number' && Number.isFinite(payload.data.duration)
        ? Math.min(MAX_TELEMETRY_SECONDS, Math.max(0, payload.data.duration))
        : 0;

    return {
      event: eventName,
      currentTime,
      duration,
    };
  }
}

export const yenimeProvider = new YenimeProvider();
