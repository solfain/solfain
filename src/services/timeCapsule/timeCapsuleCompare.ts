import type {
  CapsuleAnimeRef,
  CapsuleWatchlistSnapshotItem,
  ComparableTasteState,
  EvaluatedPredictionItem,
  NewlyCompletedBacklogEntry,
  NewlyCompletedFreshEntry,
  PredictionOutcome,
  RatingShiftEntry,
  ShareableBeforeAfterPayload,
  ShareableCompactAnime,
  TimeCapsuleComparison,
  TimeCapsuleSnapshot,
} from '../../types/timeCapsule';
import { safeJsonParse, sanitizePlainText } from '../../utils/security';
import { getFavorites } from '../storage/favoritesStore';
import { getWatchedEpisodesMap } from '../storage/watchedEpisodesStore';
import { getWatchlist } from '../storage/watchlistStore';
import {
  countAllWatchedEpisodesFromLibrary,
  toCapsuleAnimeRef,
} from './timeCapsuleStore';

const MAX_ENCODED_SHARE_LENGTH = 8192;

function roundToOneDecimal(val: number): number {
  return Math.round(val * 10) / 10;
}

function computeMeanScore(items: CapsuleWatchlistSnapshotItem[]): number | null {
  const scored = items.filter(
    (item): item is CapsuleWatchlistSnapshotItem & { personalScore: number } =>
      typeof item.personalScore === 'number' && item.personalScore >= 1 && item.personalScore <= 10,
  );
  if (scored.length === 0) return null;
  const total = scored.reduce((acc, item) => acc + item.personalScore, 0);
  return roundToOneDecimal(total / scored.length);
}

export function buildLiveComparableState(nowMs = Date.now()): ComparableTasteState {
  const liveFavs = getFavorites().map((f) => toCapsuleAnimeRef(f));
  const liveWatchlistRaw = getWatchlist();
  const watchlist: CapsuleWatchlistSnapshotItem[] = liveWatchlistRaw.map((entry) => ({
    ...toCapsuleAnimeRef(entry),
    status: entry.status,
    watchedEpisodes: entry.watchedEpisodes,
    personalScore: entry.personalScore,
  }));

  return {
    label: 'Current Live Library',
    timestampMs: nowMs,
    crownPick: liveFavs[0] ?? null,
    favorites: liveFavs,
    watchlist,
    totalWatchedEpisodesCount: countAllWatchedEpisodesFromLibrary(
      liveWatchlistRaw,
      getWatchedEpisodesMap(),
    ),
  };
}

export function buildCapsuleComparableState(
  capsule: TimeCapsuleSnapshot,
): ComparableTasteState {
  return {
    label: capsule.title,
    timestampMs: capsule.createdAt,
    crownPick: capsule.crownPick ?? capsule.favorites[0] ?? null,
    favorites: capsule.favorites,
    watchlist: capsule.watchlist,
    totalWatchedEpisodesCount: capsule.totalWatchedEpisodesCount,
  };
}

export function compareCapsuleToState(
  capsule: TimeCapsuleSnapshot,
  target: ComparableTasteState,
): TimeCapsuleComparison {
  const thenFavById = new Map<number, CapsuleAnimeRef>();
  for (const fav of capsule.favorites) {
    thenFavById.set(fav.id, fav);
  }
  const nowFavById = new Map<number, CapsuleAnimeRef>();
  for (const fav of target.favorites) {
    nowFavById.set(fav.id, fav);
  }

  const kept: CapsuleAnimeRef[] = [];
  const removed: CapsuleAnimeRef[] = [];
  for (const fav of capsule.favorites) {
    if (nowFavById.has(fav.id)) {
      kept.push(fav);
    } else {
      removed.push(fav);
    }
  }

  const added: CapsuleAnimeRef[] = [];
  for (const fav of target.favorites) {
    if (!thenFavById.has(fav.id)) {
      added.push(fav);
    }
  }

  const retentionRate =
    capsule.favorites.length > 0
      ? Math.round((kept.length / capsule.favorites.length) * 100)
      : null;

  const thenWatchById = new Map<number, CapsuleWatchlistSnapshotItem>();
  for (const entry of capsule.watchlist) {
    thenWatchById.set(entry.id, entry);
  }
  const nowWatchById = new Map<number, CapsuleWatchlistSnapshotItem>();
  for (const entry of target.watchlist) {
    nowWatchById.set(entry.id, entry);
  }

  // Crown comparison
  const thenPick = capsule.crownPick ?? capsule.favorites[0] ?? null;
  const nowPick = target.crownPick ?? target.favorites[0] ?? null;
  const sameCrown = Boolean(thenPick && nowPick && thenPick.id === nowPick.id);
  const thenPickStillFavorited = thenPick ? nowFavById.has(thenPick.id) : false;
  const thenPickScoreThen = thenPick
    ? thenWatchById.get(thenPick.id)?.personalScore ?? null
    : null;
  const thenPickScoreNow = thenPick
    ? nowWatchById.get(thenPick.id)?.personalScore ?? null
    : null;

  // Ratings diff
  const ratedThenItems = capsule.watchlist.filter(
    (w) => typeof w.personalScore === 'number',
  );
  const ratedNowItems = target.watchlist.filter(
    (w) => typeof w.personalScore === 'number',
  );
  const meanScoreThen = computeMeanScore(capsule.watchlist);
  const meanScoreNow = computeMeanScore(target.watchlist);
  const meanScoreDelta =
    meanScoreThen !== null && meanScoreNow !== null
      ? roundToOneDecimal(meanScoreNow - meanScoreThen)
      : null;

  const scoreChanges: RatingShiftEntry[] = [];
  const unchangedScores: Array<{ anime: CapsuleAnimeRef; score: number }> = [];
  const newlyRated: Array<{ anime: CapsuleAnimeRef; newScore: number }> = [];

  for (const nowEntry of target.watchlist) {
    if (typeof nowEntry.personalScore !== 'number') continue;
    const prevEntry = thenWatchById.get(nowEntry.id);
    if (!prevEntry || typeof prevEntry.personalScore !== 'number') {
      newlyRated.push({
        anime: nowEntry,
        newScore: nowEntry.personalScore,
      });
    } else if (prevEntry.personalScore !== nowEntry.personalScore) {
      scoreChanges.push({
        anime: nowEntry,
        oldScore: prevEntry.personalScore,
        newScore: nowEntry.personalScore,
        delta: nowEntry.personalScore - prevEntry.personalScore,
      });
    } else {
      unchangedScores.push({
        anime: nowEntry,
        score: nowEntry.personalScore,
      });
    }
  }

  scoreChanges.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  // Completed series diff
  const completedThen = capsule.watchlist.filter((w) => w.status === 'completed');
  const completedNow = target.watchlist.filter((w) => w.status === 'completed');

  const newlyCompletedFromBacklog: NewlyCompletedBacklogEntry[] = [];
  const newlyCompletedFresh: NewlyCompletedFreshEntry[] = [];

  for (const nowComp of completedNow) {
    const prev = thenWatchById.get(nowComp.id);
    if (!prev) {
      newlyCompletedFresh.push({
        anime: nowComp,
        newScore: nowComp.personalScore,
      });
    } else if (prev.status !== 'completed') {
      newlyCompletedFromBacklog.push({
        anime: nowComp,
        previousStatus: prev.status,
        newScore: nowComp.personalScore,
      });
    }
  }

  // Predictions evaluation
  let hit = 0;
  let partial = 0;
  let miss = 0;
  let pending = 0;

  const evaluatedPredictions: EvaluatedPredictionItem[] = capsule.predictions.map(
    (pred) => {
      if (pred.outcome === 'hit') hit += 1;
      else if (pred.outcome === 'partial') partial += 1;
      else if (pred.outcome === 'miss') miss += 1;
      else pending += 1;

      const linkedId = pred.linkedAnime?.id ?? null;
      const liveWatch = linkedId ? nowWatchById.get(linkedId) ?? null : null;

      return {
        ...pred,
        liveStatusNow: liveWatch?.status ?? null,
        liveScoreNow: liveWatch?.personalScore ?? null,
        liveWatchedEpisodesNow: liveWatch?.watchedEpisodes ?? null,
        liveFavoritedNow: linkedId ? nowFavById.has(linkedId) : false,
      };
    },
  );

  const daysElapsed = Math.max(
    0,
    Math.floor((target.timestampMs - capsule.createdAt) / (24 * 60 * 60 * 1000)),
  );

  return {
    capsuleId: capsule.id,
    capsuleTitle: capsule.title,
    snapshotDateMs: capsule.createdAt,
    unlockDateMs: capsule.unlockAt,
    comparedDateMs: target.timestampMs,
    comparedTargetLabel: target.label,
    daysElapsed,

    crownComparison: {
      thenPick,
      nowPick,
      sameCrown,
      thenPickStillFavorited,
      thenPickScoreThen,
      thenPickScoreNow,
    },

    favoritesDiff: {
      thenCount: capsule.favorites.length,
      nowCount: target.favorites.length,
      kept,
      added,
      removed,
      retentionRate,
    },

    ratingsDiff: {
      ratedCountThen: ratedThenItems.length,
      ratedCountNow: ratedNowItems.length,
      meanScoreThen,
      meanScoreNow,
      meanScoreDelta,
      scoreChanges,
      unchangedScores,
      newlyRated,
    },

    completedDiff: {
      completedCountThen: completedThen.length,
      completedCountNow: completedNow.length,
      completedDelta: completedNow.length - completedThen.length,
      episodesLoggedThen: capsule.totalWatchedEpisodesCount,
      episodesLoggedNow: target.totalWatchedEpisodesCount,
      episodesDelta:
        target.totalWatchedEpisodesCount - capsule.totalWatchedEpisodesCount,
      completedThen,
      newlyCompletedFromBacklog,
      newlyCompletedFresh,
    },

    predictionsSummary: {
      total: evaluatedPredictions.length,
      hit,
      partial,
      miss,
      pending,
      items: evaluatedPredictions,
    },
  };
}

export function compareCapsuleToLiveLibrary(
  capsule: TimeCapsuleSnapshot,
  nowMs = Date.now(),
): TimeCapsuleComparison {
  return compareCapsuleToState(capsule, buildLiveComparableState(nowMs));
}

export function compareCapsuleToCapsule(
  olderCapsule: TimeCapsuleSnapshot,
  newerCapsule: TimeCapsuleSnapshot,
): TimeCapsuleComparison {
  return compareCapsuleToState(
    olderCapsule,
    buildCapsuleComparableState(newerCapsule),
  );
}

function toCompactAnime(ref: CapsuleAnimeRef | null): ShareableCompactAnime | null {
  if (!ref) return null;
  return {
    id: ref.id,
    title: sanitizePlainText(ref.title, 80) || 'Anime',
  };
}

export function comparisonToShareablePayload(
  comparison: TimeCapsuleComparison,
): ShareableBeforeAfterPayload {
  const newCompletedCombined = [
    ...comparison.completedDiff.newlyCompletedFromBacklog.map((x) => x.anime),
    ...comparison.completedDiff.newlyCompletedFresh.map((x) => x.anime),
  ];

  const featuredPredSource =
    comparison.predictionsSummary.items.find((p) => p.outcome === 'hit') ??
    comparison.predictionsSummary.items[0] ??
    null;

  return {
    v: 1,
    title: sanitizePlainText(comparison.capsuleTitle, 90) || 'Anime Time Capsule',
    thenMs: comparison.snapshotDateMs,
    nowMs: comparison.comparedDateMs,
    crownThen: toCompactAnime(comparison.crownComparison.thenPick),
    crownNow: toCompactAnime(comparison.crownComparison.nowPick),
    favThen: comparison.favoritesDiff.thenCount,
    favNow: comparison.favoritesDiff.nowCount,
    favKept: comparison.favoritesDiff.kept
      .slice(0, 4)
      .map((a) => ({ id: a.id, title: sanitizePlainText(a.title, 70) })),
    favAdded: comparison.favoritesDiff.added
      .slice(0, 4)
      .map((a) => ({ id: a.id, title: sanitizePlainText(a.title, 70) })),
    favRemoved: comparison.favoritesDiff.removed
      .slice(0, 3)
      .map((a) => ({ id: a.id, title: sanitizePlainText(a.title, 70) })),
    meanThen: comparison.ratingsDiff.meanScoreThen,
    meanNow: comparison.ratingsDiff.meanScoreNow,
    ratedThen: comparison.ratingsDiff.ratedCountThen,
    ratedNow: comparison.ratingsDiff.ratedCountNow,
    scoreShifts: comparison.ratingsDiff.scoreChanges.slice(0, 4).map((s) => ({
      id: s.anime.id,
      title: sanitizePlainText(s.anime.title, 70),
      from: s.oldScore,
      to: s.newScore,
    })),
    compThen: comparison.completedDiff.completedCountThen,
    compNow: comparison.completedDiff.completedCountNow,
    epsThen: comparison.completedDiff.episodesLoggedThen,
    epsNow: comparison.completedDiff.episodesLoggedNow,
    newComp: newCompletedCombined
      .slice(0, 4)
      .map((a) => ({ id: a.id, title: sanitizePlainText(a.title, 70) })),
    predTotal: comparison.predictionsSummary.total,
    predHit: comparison.predictionsSummary.hit,
    predPartial: comparison.predictionsSummary.partial,
    predMiss: comparison.predictionsSummary.miss,
    featuredPrediction: featuredPredSource
      ? {
          text: sanitizePlainText(featuredPredSource.text, 140),
          outcome: featuredPredSource.outcome,
        }
      : null,
  };
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(encoded: string): Uint8Array {
  const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLen);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function encodeShareableCardPayload(
  payload: ShareableBeforeAfterPayload,
): string {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  return bytesToBase64Url(bytes);
}

function sanitizeCompactAnimeList(
  raw: unknown,
  maxItems: number,
): ShareableCompactAnime[] {
  if (!Array.isArray(raw)) return [];
  const out: ShareableCompactAnime[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.id !== 'number' || !Number.isInteger(rec.id) || rec.id <= 0) continue;
    const title = sanitizePlainText(
      typeof rec.title === 'string' ? rec.title : '',
      80,
    );
    if (!title) continue;
    out.push({ id: rec.id, title });
    if (out.length >= maxItems) break;
  }
  return out;
}

function sanitizeCompactAnimeSingle(raw: unknown): ShareableCompactAnime | null {
  const list = sanitizeCompactAnimeList(raw ? [raw] : [], 1);
  return list[0] ?? null;
}

export function decodeShareableCardPayload(
  encoded: string,
): ShareableBeforeAfterPayload | null {
  if (
    typeof encoded !== 'string' ||
    encoded.length === 0 ||
    encoded.length > MAX_ENCODED_SHARE_LENGTH ||
    !/^[A-Za-z0-9_-]+$/.test(encoded)
  ) {
    return null;
  }

  try {
    const bytes = base64UrlToBytes(encoded);
    const json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const parsed = safeJsonParse(json, MAX_ENCODED_SHARE_LENGTH * 2);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

    const rec = parsed as Record<string, unknown>;
    if (rec.v !== 1) return null;

    const title = sanitizePlainText(
      typeof rec.title === 'string' ? rec.title : '',
      90,
    );
    if (!title) return null;

    const cleanTs = (v: unknown): number | null =>
      typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : null;
    const thenMs = cleanTs(rec.thenMs);
    const nowMs = cleanTs(rec.nowMs);
    if (!thenMs || !nowMs) return null;

    const cleanCount = (v: unknown): number =>
      typeof v === 'number' && Number.isInteger(v) && v >= 0
        ? Math.min(1_000_000, v)
        : 0;

    const cleanScore = (v: unknown): number | null =>
      typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 10
        ? roundToOneDecimal(v)
        : null;

    const scoreShifts: ShareableBeforeAfterPayload['scoreShifts'] = [];
    if (Array.isArray(rec.scoreShifts)) {
      for (const s of rec.scoreShifts) {
        if (!s || typeof s !== 'object') continue;
        const sr = s as Record<string, unknown>;
        if (typeof sr.id !== 'number' || !Number.isInteger(sr.id) || sr.id <= 0) continue;
        const stitle = sanitizePlainText(
          typeof sr.title === 'string' ? sr.title : '',
          80,
        );
        const from =
          typeof sr.from === 'number' &&
          Number.isInteger(sr.from) &&
          sr.from >= 1 &&
          sr.from <= 10
            ? sr.from
            : null;
        const to =
          typeof sr.to === 'number' &&
          Number.isInteger(sr.to) &&
          sr.to >= 1 &&
          sr.to <= 10
            ? sr.to
            : null;
        if (!stitle || from === null || to === null) continue;
        scoreShifts.push({ id: sr.id, title: stitle, from, to });
        if (scoreShifts.length >= 6) break;
      }
    }

    let featuredPrediction: ShareableBeforeAfterPayload['featuredPrediction'] = null;
    if (rec.featuredPrediction && typeof rec.featuredPrediction === 'object') {
      const fp = rec.featuredPrediction as Record<string, unknown>;
      const fpText = sanitizePlainText(
        typeof fp.text === 'string' ? fp.text : '',
        140,
      );
      const validOut: PredictionOutcome[] = ['pending', 'hit', 'partial', 'miss'];
      const fpOutcome: PredictionOutcome =
        typeof fp.outcome === 'string' &&
        validOut.includes(fp.outcome as PredictionOutcome)
          ? (fp.outcome as PredictionOutcome)
          : 'pending';
      if (fpText) {
        featuredPrediction = { text: fpText, outcome: fpOutcome };
      }
    }

    return {
      v: 1,
      title,
      thenMs,
      nowMs,
      crownThen: sanitizeCompactAnimeSingle(rec.crownThen),
      crownNow: sanitizeCompactAnimeSingle(rec.crownNow),
      favThen: cleanCount(rec.favThen),
      favNow: cleanCount(rec.favNow),
      favKept: sanitizeCompactAnimeList(rec.favKept, 4),
      favAdded: sanitizeCompactAnimeList(rec.favAdded, 4),
      favRemoved: sanitizeCompactAnimeList(rec.favRemoved, 3),
      meanThen: cleanScore(rec.meanThen),
      meanNow: cleanScore(rec.meanNow),
      ratedThen: cleanCount(rec.ratedThen),
      ratedNow: cleanCount(rec.ratedNow),
      scoreShifts,
      compThen: cleanCount(rec.compThen),
      compNow: cleanCount(rec.compNow),
      epsThen: cleanCount(rec.epsThen),
      epsNow: cleanCount(rec.epsNow),
      newComp: sanitizeCompactAnimeList(rec.newComp, 4),
      predTotal: cleanCount(rec.predTotal),
      predHit: cleanCount(rec.predHit),
      predPartial: cleanCount(rec.predPartial),
      predMiss: cleanCount(rec.predMiss),
      featuredPrediction,
    };
  } catch {
    return null;
  }
}

export function formatShortDate(ms: number): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

export function formatBeforeAfterSummaryText(
  payload: ShareableBeforeAfterPayload,
  shareUrl?: string,
): string {
  const lines: string[] = [];
  lines.push(`SOLFAIN · ANIME TIME CAPSULE — ${payload.title}`);
  lines.push(
    `Snapshot: ${formatShortDate(payload.thenMs)}  ->  Revisited: ${formatShortDate(payload.nowMs)}`,
  );
  lines.push('');

  if (payload.crownThen || payload.crownNow) {
    lines.push(
      `#1 Favorite: ${payload.crownThen?.title ?? 'None'} -> ${payload.crownNow?.title ?? 'None'}`,
    );
  }

  lines.push(
    `Favorites: ${payload.favThen} -> ${payload.favNow} (${payload.favKept.length} kept, +${payload.favAdded.length} new)`,
  );
  if (payload.favAdded.length > 0) {
    lines.push(
      `  New Favorites: ${payload.favAdded.map((a) => a.title).join(', ')}`,
    );
  }

  const meanThenStr = payload.meanThen !== null ? `${payload.meanThen}/10` : 'Unrated';
  const meanNowStr = payload.meanNow !== null ? `${payload.meanNow}/10` : 'Unrated';
  lines.push(`Mean Rating: ${meanThenStr} -> ${meanNowStr}`);
  if (payload.scoreShifts.length > 0) {
    lines.push(
      `  Score Shifts: ${payload.scoreShifts
        .map((s) => `${s.title} (${s.from} -> ${s.to})`)
        .join(' · ')}`,
    );
  }

  const compDelta = payload.compNow - payload.compThen;
  const epsDelta = payload.epsNow - payload.epsThen;
  lines.push(
    `Completed Series: ${payload.compThen} -> ${payload.compNow} (${compDelta >= 0 ? `+${compDelta}` : compDelta}) · Episodes: ${payload.epsThen} -> ${payload.epsNow} (${epsDelta >= 0 ? `+${epsDelta}` : epsDelta})`,
  );

  if (payload.predTotal > 0) {
    lines.push(
      `Predictions: ${payload.predHit}/${payload.predTotal} Came True${payload.predPartial > 0 ? ` (${payload.predPartial} partial)` : ''}`,
    );
  }

  if (shareUrl) {
    lines.push('');
    lines.push(`Compare Card: ${shareUrl}`);
  }

  return lines.join('\n');
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function truncateCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let trimmed = text;
  while (trimmed.length > 1 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}…`;
}

/**
 * Renders a crisp 1200x680 Before-and-After Time Capsule card onto an HTML5 Canvas
 * using Solfain's dark streaming palette (#0B0B0D / #141418 / #1B1B21 / #8B5CF6).
 */
export function renderBeforeAfterCardToCanvas(
  payload: ShareableBeforeAfterPayload,
): HTMLCanvasElement {
  const width = 1200;
  const height = 680;
  const scale = 2;

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.scale(scale, scale);

  const fontStack = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

  // Main background
  ctx.fillStyle = '#0B0B0D';
  ctx.fillRect(0, 0, width, height);

  // Outer card frame
  drawRoundedRect(ctx, 24, 24, width - 48, height - 48, 12);
  ctx.fillStyle = '#141418';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#24242C';
  ctx.stroke();

  // Subtle top accent bar
  ctx.fillStyle = '#8B5CF6';
  ctx.fillRect(56, 24, 132, 3);

  // Header brand + badge
  ctx.fillStyle = '#A78BFA';
  ctx.font = `700 12px ${fontStack}`;
  ctx.fillText('SOLFAIN · ANIME TIME CAPSULE', 56, 66);

  ctx.fillStyle = '#F5F5F7';
  ctx.font = `700 28px ${fontStack}`;
  ctx.fillText(truncateCanvasText(ctx, payload.title, 760), 56, 104);

  // Date span pill on top right
  const spanLabel = `${formatShortDate(payload.thenMs)}  →  ${formatShortDate(payload.nowMs)}`;
  ctx.font = `600 13px ${fontStack}`;
  const spanW = ctx.measureText(spanLabel).width + 28;
  drawRoundedRect(ctx, width - 56 - spanW, 56, spanW, 34, 6);
  ctx.fillStyle = '#1B1B21';
  ctx.fill();
  ctx.strokeStyle = '#2E2E38';
  ctx.stroke();
  ctx.fillStyle = '#F5F5F7';
  ctx.fillText(spanLabel, width - 56 - spanW + 14, 78);

  // Divider
  ctx.fillStyle = '#24242C';
  ctx.fillRect(56, 126, width - 112, 1);

  // Two-column THEN vs NOW boxes
  const colY = 148;
  const colW = 528;
  const colH = 264;
  const leftX = 56;
  const rightX = 616;

  // Left: THEN
  drawRoundedRect(ctx, leftX, colY, colW, colH, 10);
  ctx.fillStyle = '#101014';
  ctx.fill();
  ctx.strokeStyle = '#24242C';
  ctx.stroke();

  ctx.fillStyle = '#71717A';
  ctx.font = `700 11px ${fontStack}`;
  ctx.fillText(`SNAPSHOT THEN · ${formatShortDate(payload.thenMs).toUpperCase()}`, leftX + 24, colY + 32);

  ctx.fillStyle = '#A1A1AA';
  ctx.font = `500 13px ${fontStack}`;
  ctx.fillText('#1 Crown Pick', leftX + 24, colY + 64);
  ctx.fillStyle = '#F5F5F7';
  ctx.font = `600 18px ${fontStack}`;
  ctx.fillText(
    truncateCanvasText(ctx, payload.crownThen?.title ?? 'No Crown Pick Recorded', colW - 48),
    leftX + 24,
    colY + 89,
  );

  // Left metrics row
  const drawStatCell = (
    x: number,
    y: number,
    label: string,
    val: string,
    accent = false,
  ) => {
    ctx.fillStyle = '#71717A';
    ctx.font = `600 11px ${fontStack}`;
    ctx.fillText(label.toUpperCase(), x, y);
    ctx.fillStyle = accent ? '#A78BFA' : '#F5F5F7';
    ctx.font = `700 22px ${fontStack}`;
    ctx.fillText(val, x, y + 28);
  };

  drawStatCell(leftX + 24, colY + 128, 'Favorites', String(payload.favThen));
  drawStatCell(
    leftX + 168,
    colY + 128,
    'Mean Score',
    payload.meanThen !== null ? `${payload.meanThen} / 10` : '—',
  );
  drawStatCell(leftX + 324, colY + 128, 'Completed', String(payload.compThen));

  ctx.fillStyle = '#71717A';
  ctx.font = `500 12px ${fontStack}`;
  const keptLine =
    payload.favKept.length > 0
      ? `Timeless Favorites: ${payload.favKept.map((f) => f.title).join(', ')}`
      : `${payload.epsThen} episodes logged at snapshot time`;
  ctx.fillText(truncateCanvasText(ctx, keptLine, colW - 48), leftX + 24, colY + 206);

  ctx.fillStyle = '#A1A1AA';
  ctx.fillText(
    truncateCanvasText(
      ctx,
      payload.favRemoved.length > 0
        ? `Moved on from: ${payload.favRemoved.map((f) => f.title).join(', ')}`
        : `${payload.ratedThen} rated series archived`,
      colW - 48,
    ),
    leftX + 24,
    colY + 232,
  );

  // Right: NOW
  drawRoundedRect(ctx, rightX, colY, colW, colH, 10);
  ctx.fillStyle = '#18181F';
  ctx.fill();
  ctx.strokeStyle = '#383056';
  ctx.stroke();

  ctx.fillStyle = '#A78BFA';
  ctx.font = `700 11px ${fontStack}`;
  ctx.fillText(`REVISITED NOW · ${formatShortDate(payload.nowMs).toUpperCase()}`, rightX + 24, colY + 32);

  ctx.fillStyle = '#A1A1AA';
  ctx.font = `500 13px ${fontStack}`;
  ctx.fillText('#1 Crown Pick Now', rightX + 24, colY + 64);
  ctx.fillStyle = '#F5F5F7';
  ctx.font = `600 18px ${fontStack}`;
  ctx.fillText(
    truncateCanvasText(ctx, payload.crownNow?.title ?? 'No Crown Pick Selected', colW - 48),
    rightX + 24,
    colY + 89,
  );

  const compDelta = payload.compNow - payload.compThen;
  const favDelta = payload.favNow - payload.favThen;
  drawStatCell(
    rightX + 24,
    colY + 128,
    'Favorites',
    `${payload.favNow}${favDelta !== 0 ? ` (${favDelta > 0 ? `+${favDelta}` : favDelta})` : ''}`,
    true,
  );
  drawStatCell(
    rightX + 186,
    colY + 128,
    'Mean Score',
    payload.meanNow !== null ? `${payload.meanNow} / 10` : '—',
    true,
  );
  drawStatCell(
    rightX + 344,
    colY + 128,
    'Completed',
    `${payload.compNow}${compDelta !== 0 ? ` (${compDelta > 0 ? `+${compDelta}` : compDelta})` : ''}`,
    true,
  );

  ctx.fillStyle = '#F5F5F7';
  ctx.font = `500 12px ${fontStack}`;
  const addedLine =
    payload.favAdded.length > 0
      ? `New Favorites: ${payload.favAdded.map((f) => f.title).join(', ')}`
      : `Episodes Watched: ${payload.epsThen} → ${payload.epsNow}`;
  ctx.fillText(truncateCanvasText(ctx, addedLine, colW - 48), rightX + 24, colY + 206);

  ctx.fillStyle = '#A1A1AA';
  const newCompLine =
    payload.newComp.length > 0
      ? `Newly Completed: ${payload.newComp.map((c) => c.title).join(', ')}`
      : `${payload.ratedNow} series rated today`;
  ctx.fillText(truncateCanvasText(ctx, newCompLine, colW - 48), rightX + 24, colY + 232);

  // Bottom strip: Score Shifts & Predictions Scorecard
  const bottomY = 432;
  drawRoundedRect(ctx, 56, bottomY, width - 112, 168, 10);
  ctx.fillStyle = '#101014';
  ctx.fill();
  ctx.strokeStyle = '#24242C';
  ctx.stroke();

  ctx.fillStyle = '#71717A';
  ctx.font = `700 11px ${fontStack}`;
  ctx.fillText('RATING SHIFTS & PREDICTIONS VERDICT', 80, bottomY + 30);

  ctx.fillStyle = '#F5F5F7';
  ctx.font = `500 14px ${fontStack}`;
  const shiftsSummary =
    payload.scoreShifts.length > 0
      ? payload.scoreShifts
          .map((s) => `${s.title}: ${s.from}/10 → ${s.to}/10`)
          .join('   ·   ')
      : 'Ratings held steady across previously scored series.';
  ctx.fillText(truncateCanvasText(ctx, shiftsSummary, width - 160), 80, bottomY + 62);

  ctx.fillStyle = '#A78BFA';
  ctx.font = `600 14px ${fontStack}`;
  const predHeadline =
    payload.predTotal > 0
      ? `Predictions: ${payload.predHit} of ${payload.predTotal} Came True${payload.predPartial > 0 ? ` · ${payload.predPartial} Partially True` : ''}${payload.predMiss > 0 ? ` · ${payload.predMiss} Missed` : ''}`
      : 'No predictions attached to this snapshot.';
  ctx.fillText(truncateCanvasText(ctx, predHeadline, width - 160), 80, bottomY + 100);

  if (payload.featuredPrediction) {
    ctx.fillStyle = '#A1A1AA';
    ctx.font = `400 13px ${fontStack}`;
    ctx.fillText(
      truncateCanvasText(
        ctx,
        `“${payload.featuredPrediction.text}”`,
        width - 160,
      ),
      80,
      bottomY + 132,
    );
  }

  // Footer signature
  ctx.fillStyle = '#71717A';
  ctx.font = `500 12px ${fontStack}`;
  ctx.fillText('Generated locally on Solfain · Anime Discovery & Streaming', 56, 632);

  return canvas;
}

export async function downloadBeforeAfterCardPng(
  payload: ShareableBeforeAfterPayload,
): Promise<boolean> {
  const canvas = renderBeforeAfterCardToCanvas(payload);
  const slug =
    payload.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'capsule';

  const blob: Blob | null = await new Promise((resolve) => {
    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob((b) => resolve(b), 'image/png');
    } else {
      resolve(null);
    }
  });

  const href = blob ? URL.createObjectURL(blob) : canvas.toDataURL('image/png');
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = `solfain-before-after-${slug}.png`;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  if (blob) {
    window.setTimeout(() => URL.revokeObjectURL(href), 1500);
  }
  return true;
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function formatIcsUtcTimestamp(ms: number): string {
  const iso = new Date(ms).toISOString();
  return iso.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function buildCapsuleReminderIcs(
  capsule: TimeCapsuleSnapshot,
  appOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://solfain.app',
): string {
  const startMs = capsule.reminder.remindAt || capsule.unlockAt;
  const endMs = startMs + 30 * 60 * 1000;
  const capsuleUrl = `${appOrigin}/time-capsule?capsule=${encodeURIComponent(capsule.id)}`;

  const summary = `Unseal Anime Time Capsule: ${capsule.title}`;
  const descriptionLines = [
    `Your Solfain Anime Time Capsule ("${capsule.title}") sealed on ${formatShortDate(capsule.createdAt)} is ready to revisit!`,
    `Captured at seal time: ${capsule.favorites.length} favorites, ${capsule.watchlist.filter((w) => w.status === 'completed').length} completed series, and ${capsule.predictions.length} predictions.`,
    `Compare your old vs. new taste: ${capsuleUrl}`,
  ];

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Solfain//Anime Time Capsule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeIcsText(capsule.id)}@solfain.local`,
    `DTSTAMP:${formatIcsUtcTimestamp(Date.now())}`,
    `DTSTART:${formatIcsUtcTimestamp(startMs)}`,
    `DTEND:${formatIcsUtcTimestamp(endMs)}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(descriptionLines.join('\n'))}`,
    `URL:${escapeIcsText(capsuleUrl)}`,
    'BEGIN:VALARM',
    'TRIGGER:-P1D',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcsText(`Tomorrow: ${summary}`)}`,
    'END:VALARM',
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcsText(summary)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return `${lines.join('\r\n')}\r\n`;
}

export function downloadCapsuleReminderIcs(capsule: TimeCapsuleSnapshot): void {
  const ics = buildCapsuleReminderIcs(capsule);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const slug =
    capsule.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'time-capsule';

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `solfain-reminder-${slug}.ics`;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
