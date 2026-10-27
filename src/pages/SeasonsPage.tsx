import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AdSlot } from '../components/monetization/SponsorSlot';
import { AnimeCard } from '../components/anime/AnimeCard';
import { AnimeGridSkeleton } from '../components/anime/Skeletons';
import { EmptyState, ErrorState } from '../components/ui/StateFeedback';
import { searchAnime } from '../services/anilist/anilistService';
import type {
  AnimeSummary,
  MediaFormat,
  MediaSeason,
  MediaSort,
} from '../types/anime';
import { formatSeasonName, getCurrentSeason } from '../utils/format';

const SEASONS: MediaSeason[] = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];

const FORMAT_TABS: Array<{ value: MediaFormat | ''; label: string }> = [
  { value: '', label: 'All Formats' },
  { value: 'TV', label: 'TV Series' },
  { value: 'MOVIE', label: 'Movies' },
  { value: 'ONA', label: 'ONA' },
  { value: 'OVA', label: 'OVA' },
];

const SORT_OPTIONS: Array<{ value: MediaSort; label: string }> = [
  { value: 'POPULARITY_DESC', label: 'Most Popular' },
  { value: 'SCORE_DESC', label: 'Highest Score' },
  { value: 'TRENDING_DESC', label: 'Trending' },
];

const YEARS: number[] = Array.from(
  { length: 2027 - 1985 + 1 },
  (_, idx) => 2027 - idx,
);

export function SeasonsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentSeasonInfo = useMemo(() => getCurrentSeason(), []);

  const rawSeason = (searchParams.get('season') ?? '').toUpperCase();
  const activeSeason: MediaSeason = SEASONS.includes(rawSeason as MediaSeason)
    ? (rawSeason as MediaSeason)
    : currentSeasonInfo.season;

  const parsedYear = Number.parseInt(searchParams.get('year') ?? '', 10);
  const activeYear =
    Number.isInteger(parsedYear) && parsedYear >= 1985 && parsedYear <= 2027
      ? parsedYear
      : currentSeasonInfo.year;

  const activeFormat = (searchParams.get('format') ?? '') as MediaFormat | '';
  const activeSort = (searchParams.get('sort') ?? 'POPULARITY_DESC') as MediaSort;

  const [items, setItems] = useState<AnimeSummary[]>([]);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const seasonHeading = `${formatSeasonName(activeSeason)} ${activeYear}`;

  useEffect(() => {
    document.title = `${seasonHeading} Anime Season — Solfain`;
  }, [seasonHeading]);

  const loadSeason = useCallback(
    async (pageToLoad: number, append: boolean, signal?: AbortSignal, bypassCache = false) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setErrorMessage(null);

      try {
        const res = await searchAnime(
          {
            season: activeSeason,
            seasonYear: activeYear,
            format: activeFormat || undefined,
            sort: activeSort,
            page: pageToLoad,
            perPage: 24,
          },
          { signal, bypassCache },
        );

        if (signal?.aborted) return;

        setItems((prev) => {
          if (!append) return res.media;
          const seen = new Set(prev.map((m) => m.id));
          return [...prev, ...res.media.filter((m) => !seen.has(m.id))];
        });
        setPage(res.pageInfo.currentPage);
        setHasNextPage(res.pageInfo.hasNextPage);
      } catch (err) {
        if (err && typeof err === 'object' && 'name' in err && err.name === 'AbortError') {
          return;
        }
        if (!append) setItems([]);
        setErrorMessage(
          err instanceof Error ? err.message : 'Unable to fetch seasonal anime from AniList.',
        );
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [activeFormat, activeSeason, activeSort, activeYear],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadSeason(1, false, controller.signal, false);
    return () => controller.abort();
  }, [loadSeason]);

  const updateParams = (patch: Record<string, string>) => {
    const next = new URLSearchParams(searchParams);
    next.set('season', activeSeason);
    next.set('year', String(activeYear));
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setSearchParams(next, { replace: true });
  };

  const stepSeason = (direction: -1 | 1) => {
    const idx = SEASONS.indexOf(activeSeason);
    const nextIdx = idx + direction;
    if (nextIdx < 0) {
      if (activeYear > 1985) {
        updateParams({ season: 'FALL', year: String(activeYear - 1) });
      }
    } else if (nextIdx >= SEASONS.length) {
      if (activeYear < 2027) {
        updateParams({ season: 'WINTER', year: String(activeYear + 1) });
      }
    } else {
      updateParams({ season: SEASONS[nextIdx] });
    }
  };

  const isCurrentSeason =
    activeSeason === currentSeasonInfo.season && activeYear === currentSeasonInfo.year;

  return (
    <div className="container">
      <header
        className="page-header"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '14px',
        }}
      >
        <div>
          <h1 className="page-header__title">{seasonHeading} Lineup</h1>
          <p className="page-header__desc">
            Explore seasonal premieres, continuing series, and theatrical releases by quarter.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="btn btn--secondary btn--compact"
            aria-label="Previous season"
            onClick={() => stepSeason(-1)}
          >
            <ChevronLeft size={14} aria-hidden="true" />
            <span>Prev</span>
          </button>

          {!isCurrentSeason && (
            <button
              type="button"
              className="btn btn--ghost btn--compact"
              onClick={() =>
                updateParams({
                  season: currentSeasonInfo.season,
                  year: String(currentSeasonInfo.year),
                })
              }
            >
              Current Season
            </button>
          )}

          <button
            type="button"
            className="btn btn--secondary btn--compact"
            aria-label="Next season"
            onClick={() => stepSeason(1)}
          >
            <span>Next</span>
            <ChevronRight size={14} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="seasons-controls">
        <div className="seasons-quarter-tabs" role="tablist" aria-label="Season quarter">
          {SEASONS.map((s) => {
            const selected = s === activeSeason;
            return (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={selected}
                className={`seasons-quarter-tab${
                  selected ? ' seasons-quarter-tab--active' : ''
                }`}
                onClick={() => updateParams({ season: s })}
              >
                {formatSeasonName(s)}
              </button>
            );
          })}
        </div>

        <div className="seasons-filters">
          <select
            className="field-select"
            aria-label="Select year"
            style={{ width: 'auto', minWidth: '104px' }}
            value={String(activeYear)}
            onChange={(e) => updateParams({ year: e.target.value })}
          >
            {YEARS.map((yr) => (
              <option key={yr} value={String(yr)}>
                {yr}
              </option>
            ))}
          </select>

          <select
            className="field-select"
            aria-label="Filter format"
            style={{ width: 'auto', minWidth: '132px' }}
            value={activeFormat}
            onChange={(e) => updateParams({ format: e.target.value })}
          >
            {FORMAT_TABS.map((tab) => (
              <option key={tab.label} value={tab.value}>
                {tab.label}
              </option>
            ))}
          </select>

          <select
            className="field-select"
            aria-label="Sort seasonal lineup"
            style={{ width: 'auto', minWidth: '148px' }}
            value={activeSort}
            onChange={(e) => updateParams({ sort: e.target.value })}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: '22px' }}>
        <AdSlot placement="seasons-top-banner" />
      </div>

      {loading ? (
        <AnimeGridSkeleton count={18} />
      ) : errorMessage && items.length === 0 ? (
        <ErrorState
          title="Could not load seasonal lineup"
          message={errorMessage}
          onRetry={() => void loadSeason(1, false, undefined, true)}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title={`No titles listed for ${seasonHeading}`}
          description="Try selecting a different format filter or stepping to an adjacent season."
        />
      ) : (
        <>
          <div className="anime-grid">
            {items.map((anime, idx) => (
              <AnimeCard key={anime.id} anime={anime} eager={idx < 6} />
            ))}
          </div>

          {hasNextPage && (
            <div className="pagination-bar">
              <button
                type="button"
                className="btn btn--secondary"
                disabled={loadingMore}
                onClick={() => void loadSeason(page + 1, true)}
              >
                {loadingMore ? 'Loading more…' : 'Load More Titles'}
              </button>
            </div>
          )}
        </>
      )}

      <div style={{ marginTop: '32px' }}>
        <AdSlot placement="seasons-bottom-rectangle" />
      </div>
    </div>
  );
}
