import type { AnimeSummary, MediaSeason, MediaStatus, MediaTitle } from '../types/anime';

export function getDisplayTitle(title: MediaTitle | null | undefined): string {
  if (!title) return 'Untitled Anime';
  return (
    title.english?.trim() ||
    title.romaji?.trim() ||
    title.userPreferred?.trim() ||
    title.native?.trim() ||
    'Untitled Anime'
  );
}

export function getSecondaryTitle(title: MediaTitle | null | undefined): string | null {
  if (!title) return null;
  const primary = getDisplayTitle(title);
  const candidates = [title.romaji?.trim(), title.native?.trim()].filter(
    (item): item is string => Boolean(item && item.toLowerCase() !== primary.toLowerCase()),
  );
  return candidates[0] ?? null;
}

const ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
  '&mdash;': '—',
  '&ndash;': '–',
};

export function cleanSynopsis(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp|mdash|ndash);/gi, (match) => {
      return ENTITY_MAP[match.toLowerCase()] ?? match;
    })
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

export function formatMediaFormat(format: string | null | undefined): string | null {
  if (!format) return null;
  const map: Record<string, string> = {
    TV: 'TV',
    TV_SHORT: 'TV Short',
    MOVIE: 'Movie',
    SPECIAL: 'Special',
    OVA: 'OVA',
    ONA: 'ONA',
    MUSIC: 'Music',
    MANGA: 'Manga',
    NOVEL: 'Light Novel',
    ONE_SHOT: 'One-Shot',
  };
  return map[format] ?? format;
}

export function formatMediaStatus(status: MediaStatus | string | null | undefined): string | null {
  if (!status) return null;
  const map: Record<string, string> = {
    FINISHED: 'Finished',
    RELEASING: 'Airing',
    NOT_YET_RELEASED: 'Upcoming',
    CANCELLED: 'Cancelled',
    HIATUS: 'On Hiatus',
  };
  return map[status] ?? status;
}

export function formatSeasonName(season: MediaSeason | string | null | undefined): string | null {
  if (!season) return null;
  const lower = season.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function getCurrentSeason(date: Date = new Date()): { season: MediaSeason; year: number } {
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();
  if (month >= 1 && month <= 3) return { season: 'WINTER', year };
  if (month >= 4 && month <= 6) return { season: 'SPRING', year };
  if (month >= 7 && month <= 9) return { season: 'SUMMER', year };
  return { season: 'FALL', year };
}

export function getReleaseYear(anime: Pick<AnimeSummary, 'seasonYear' | 'startDate'>): number | null {
  return anime.seasonYear ?? anime.startDate?.year ?? null;
}

export function formatScore(score: number | null | undefined): string | null {
  if (typeof score !== 'number' || !Number.isFinite(score) || score <= 0) return null;
  return `${Math.round(score)}%`;
}

export function formatRelationType(relation: string | null | undefined): string {
  if (!relation) return 'Related';
  const map: Record<string, string> = {
    ADAPTATION: 'Adaptation',
    PREQUEL: 'Prequel',
    SEQUEL: 'Sequel',
    PARENT: 'Main Story',
    SIDE_STORY: 'Side Story',
    CHARACTER: 'Shared Character',
    SUMMARY: 'Summary',
    ALTERNATIVE: 'Alternative',
    SPIN_OFF: 'Spin-Off',
    SOURCE: 'Source Material',
    COMPILATION: 'Compilation',
    CONTAINS: 'Includes',
    OTHER: 'Related',
  };
  return map[relation] ?? relation;
}

export function formatRelativeAiredTime(airingAtSeconds: number, nowMs: number = Date.now()): string {
  const diffSeconds = Math.max(0, Math.floor(nowMs / 1000) - airingAtSeconds);
  if (diffSeconds < 60) return 'Just now';
  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  const date = new Date(airingAtSeconds * 1000);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatClockDuration(totalSeconds: number | null | undefined): string | null {
  if (typeof totalSeconds !== 'number' || !Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return null;
  }
  const whole = Math.floor(totalSeconds);
  const hrs = Math.floor(whole / 3600);
  const mins = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hrs > 0) {
    return `${hrs}:${pad(mins)}:${pad(secs)}`;
  }
  return `${mins}:${pad(secs)}`;
}

export function getMainStudioName(anime: AnimeSummary): string | null {
  const edges = anime.studios?.edges;
  if (!edges || edges.length === 0) return null;
  const main = edges.find((edge) => edge.isMain && edge.node?.name);
  return main?.node.name ?? edges[0]?.node?.name ?? null;
}
