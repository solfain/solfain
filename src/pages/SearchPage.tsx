import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { AdSlot } from '../components/ads/AdSlot';
import { AnimeCard } from '../components/anime/AnimeCard';
import { AnimeGridSkeleton } from '../components/anime/Skeletons';
import { EmptyState, ErrorState } from '../components/ui/StateFeedback';
import { getAnimeGenres, searchAnime } from '../services/anilist/anilistService';
import type {
  AnimeSummary,
  MediaFormat,
  MediaSeason,
  MediaSort,
} from '../types/anime';
import { useDebouncedValue } from '../utils/debounce';

const FALLBACK_GENRES = [
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Fantasy',
  'Horror',
  'Mecha',
  'Music',
  'Mystery',
  'Psychological',
  'Romance',
  'Sci-Fi',
  'Slice of Life',
  'Sports',
  'Supernatural',
  'Thriller',
];

const FORMAT_OPTIONS: Array<{ value: MediaFormat; label: string }> = [
  { value: 'TV', label: 'TV Series' },
  { value: 'MOVIE', label: 'Movie' },
  { value: 'ONA', label: 'ONA' },
  { value: 'OVA', label: 'OVA' },
  { value: 'TV_SHORT', label: 'TV Short' },
  { value: 'SPECIAL', label: 'Special' },
];

const SEASON_OPTIONS: Array<{ value: MediaSeason; label: string }> = [
  { value: 'WINTER', label: 'Winter' },
  { value: 'SPRING', label: 'Spring' },
  { value: 'SUMMER', label: 'Summer' },
  { value: 'FALL', label: 'Fall' },
];

const YEAR_OPTIONS: number[] = Array.from(
  { length: 2027 - 1985 + 1 },
  (_, idx) => 2027 - idx,
);

const SORT_OPTIONS: Array<{ value: MediaSort; label: string }> = [
  { value: 'SEARCH_MATCH', label: 'Best Match' },
  { value: 'POPULARITY_DESC', label: 'Most Popular' },
  { value: 'TRENDING_DESC', label: 'Trending' },
  { value: 'SCORE_DESC', label: 'Highest Score' },
  { value: 'START_DATE_DESC', label: 'Newest Releases' },
];

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const initialQuery = searchParams.get('q') ?? '';
  const genre = searchParams.get('genre') ?? '';
  const format = (searchParams.get('format') ?? '') as MediaFormat | '';
  const season = (searchParams.get('season') ?? '') as MediaSeason | '';
  const yearParam = searchParams.get('year') ?? '';
  const sortParam = (searchParams.get('sort') ?? '') as MediaSort | '';

  const [inputValue, setInputValue] = useState(initialQuery);
  const debouncedQuery = useDebouncedValue(inputValue, 400);

  const [genres, setGenres] = useState<string[]>(FALLBACK_GENRES);
  const [results, setResults] = useState<AnimeSummary[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    document.title = debouncedQuery.trim()
      ? `Search “${debouncedQuery.trim()}” — Solfain`
      : 'Browse Anime — Solfain';
  }, [debouncedQuery]);

  // Keep input synced if user navigates via header search or category links
  useEffect(() => {
    const urlQuery = searchParams.get('q') ?? '';
    setInputValue((prev) => (prev === urlQuery ? prev : urlQuery));
  }, [searchParams]);

  // Sync debounced input back to URL search params cleanly
  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    const currentUrlQ = searchParams.get('q') ?? '';
    if (trimmed === currentUrlQ) return;

    const next = new URLSearchParams(searchParams);
    if (trimmed) {
      next.set('q', trimmed);
    } else {
      next.delete('q');
    }
    setSearchParams(next, { replace: true });
  }, [debouncedQuery, searchParams, setSearchParams]);

  useEffect(() => {
    const controller = new AbortController();
    getAnimeGenres({ signal: controller.signal })
      .then((list) => {
        if (list.length > 0) {
          setGenres(list);
        }
      })
      .catch(() => {
        // Retain static genre filter names if GenreCollection fails
      });
    return () => controller.abort();
  }, []);

  const parsedYear = useMemo(() => {
    const num = Number.parseInt(yearParam, 10);
    return Number.isInteger(num) && num >= 1960 && num <= 2030 ? num : '';
  }, [yearParam]);

  const effectiveSort: MediaSort = useMemo(() => {
    if (sortParam) return sortParam;
    return debouncedQuery.trim() ? 'SEARCH_MATCH' : 'POPULARITY_DESC';
  }, [sortParam, debouncedQuery]);

  const executeSearch = useCallback(
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
            query: debouncedQuery.trim() || undefined,
            genre: genre || undefined,
            format: format || undefined,
            season: season || undefined,
            seasonYear: parsedYear || undefined,
            sort: effectiveSort,
            page: pageToLoad,
            perPage: 24,
          },
          { signal, bypassCache },
        );

        if (signal?.aborted) return;

        setResults((prev) => {
          if (!append) return res.media;
          const existingIds = new Set(prev.map((item) => item.id));
          const uniqueNext = res.media.filter((item) => !existingIds.has(item.id));
          return [...prev, ...uniqueNext];
        });
        setCurrentPage(res.pageInfo.currentPage);
        setHasNextPage(res.pageInfo.hasNextPage);
      } catch (err) {
        if (err && typeof err === 'object' && 'name' in err && err.name === 'AbortError') {
          return;
        }
        if (!append) {
          setResults([]);
        }
        setErrorMessage(
          err instanceof Error ? err.message : 'Unable to fetch search results from AniList.',
        );
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [debouncedQuery, genre, format, season, parsedYear, effectiveSort],
  );

  useEffect(() => {
    const controller = new AbortController();
    void executeSearch(1, false, controller.signal, false);
    return () => controller.abort();
  }, [executeSearch]);

  const updateFilterParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    setSearchParams(next, { replace: true });
  };

  const clearAllFilters = () => {
    setInputValue('');
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  const hasActiveFilters = Boolean(
    inputValue.trim() || genre || format || season || parsedYear || sortParam,
  );

  return (
    <div className="container">
      <header className="page-header">
        <h1 className="page-header__title">Browse & Search</h1>
        <p className="page-header__desc">
          Explore the AniList anime catalogue by title, genre, format, or season.
        </p>
      </header>

      <section className="filter-bar" aria-label="Catalogue filters">
        <div className="field-group">
          <label htmlFor="catalogue-search-input" className="field-label">
            Title
          </label>
          <div className="search-input-wrap">
            <Search size={15} className="search-input-wrap__icon" aria-hidden="true" />
            <input
              id="catalogue-search-input"
              type="search"
              className="field-input"
              placeholder="Search e.g. Horimiya, Frieren, Steins;Gate..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
            />
            {inputValue && (
              <button
                type="button"
                className="search-input-wrap__clear"
                aria-label="Clear search query"
                onClick={() => setInputValue('')}
              >
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        <div className="field-group">
          <label htmlFor="filter-genre" className="field-label">
            Genre
          </label>
          <select
            id="filter-genre"
            className="field-select"
            value={genre}
            onChange={(e) => updateFilterParam('genre', e.target.value)}
          >
            <option value="">All Genres</option>
            {genres.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>

        <div className="field-group">
          <label htmlFor="filter-format" className="field-label">
            Format
          </label>
          <select
            id="filter-format"
            className="field-select"
            value={format}
            onChange={(e) => updateFilterParam('format', e.target.value)}
          >
            <option value="">All Formats</option>
            {FORMAT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field-group">
          <label htmlFor="filter-season" className="field-label">
            Season
          </label>
          <select
            id="filter-season"
            className="field-select"
            value={season}
            onChange={(e) => updateFilterParam('season', e.target.value)}
          >
            <option value="">Any Season</option>
            {SEASON_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field-group">
          <label htmlFor="filter-year" className="field-label">
            Year
          </label>
          <select
            id="filter-year"
            className="field-select"
            value={parsedYear ? String(parsedYear) : ''}
            onChange={(e) => updateFilterParam('year', e.target.value)}
          >
            <option value="">Any Year</option>
            {YEAR_OPTIONS.map((yr) => (
              <option key={yr} value={String(yr)}>
                {yr}
              </option>
            ))}
          </select>
        </div>

        <div className="field-group">
          <label htmlFor="filter-sort" className="field-label">
            Sort By
          </label>
          <select
            id="filter-sort"
            className="field-select"
            value={effectiveSort}
            onChange={(e) => updateFilterParam('sort', e.target.value)}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <div className="active-filters-strip">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <SlidersHorizontal size={14} aria-hidden="true" />
          <span>
            {loading
              ? 'Loading catalogue…'
              : debouncedQuery.trim()
                ? `Showing results for “${debouncedQuery.trim()}”`
                : 'Browsing anime catalogue'}
          </span>
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            className="btn btn--ghost btn--compact"
            onClick={clearAllFilters}
          >
            <X size={13} aria-hidden="true" />
            <span>Reset filters</span>
          </button>
        )}
      </div>

      <div style={{ marginBottom: '22px' }}>
        <AdSlot placement="search-top-banner" />
      </div>

      {loading ? (
        <AnimeGridSkeleton count={18} />
      ) : errorMessage && results.length === 0 ? (
        <ErrorState
          title="Search failed"
          message={errorMessage}
          onRetry={() => void executeSearch(1, false, undefined, true)}
        />
      ) : results.length === 0 ? (
        <EmptyState
          title="No matching anime found"
          description="Try broadening your search terms or clearing active genre and format filters."
          action={
            hasActiveFilters ? (
              <button
                type="button"
                className="btn btn--secondary btn--compact"
                onClick={clearAllFilters}
              >
                Clear filters
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="anime-grid">
            {results.map((anime, index) => (
              <AnimeCard key={anime.id} anime={anime} eager={index < 6} />
            ))}
          </div>

          {errorMessage && (
            <div style={{ marginTop: '20px' }}>
              <ErrorState
                title="Could not load next page"
                message={errorMessage}
                onRetry={() => void executeSearch(currentPage + 1, true, undefined, true)}
              />
            </div>
          )}

          {hasNextPage && (
            <div className="pagination-bar">
              <button
                type="button"
                className="btn btn--secondary"
                disabled={loadingMore}
                onClick={() => void executeSearch(currentPage + 1, true)}
              >
                {loadingMore ? 'Loading more…' : 'Load More Anime'}
              </button>
            </div>
          )}

          <div style={{ marginTop: '32px' }}>
            <AdSlot placement="search-bottom-banner" />
          </div>
        </>
      )}
    </div>
  );
}
