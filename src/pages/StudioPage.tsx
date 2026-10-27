import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Building2, ExternalLink } from 'lucide-react';
import { AdSlot } from '../components/monetization/SponsorSlot';
import { AnimeCard } from '../components/anime/AnimeCard';
import { AnimeGridSkeleton } from '../components/anime/Skeletons';
import { EmptyState, ErrorState } from '../components/ui/StateFeedback';
import { getStudioCatalogue } from '../services/anilist/anilistService';
import type { AnimeSummary, MediaSort, StudioCatalogueData } from '../types/anime';
import { sanitizeHttpUrl } from '../utils/security';

const STUDIO_SORTS: Array<{ value: MediaSort; label: string }> = [
  { value: 'POPULARITY_DESC', label: 'Most Popular' },
  { value: 'SCORE_DESC', label: 'Highest Score' },
  { value: 'START_DATE_DESC', label: 'Newest Releases' },
  { value: 'TRENDING_DESC', label: 'Trending' },
];

export function StudioPage() {
  const { id } = useParams<{ id: string }>();
  const studioId = Number.parseInt(id ?? '', 10);

  const [studio, setStudio] = useState<StudioCatalogueData | null>(null);
  const [items, setItems] = useState<AnimeSummary[]>([]);
  const [sort, setSort] = useState<MediaSort>('POPULARITY_DESC');
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadStudio = useCallback(
    async (pageToLoad: number, append: boolean, signal?: AbortSignal, bypassCache = false) => {
      if (!Number.isInteger(studioId) || studioId <= 0) {
        setErrorMessage('Invalid studio ID.');
        setLoading(false);
        return;
      }

      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setErrorMessage(null);

      try {
        const res = await getStudioCatalogue(studioId, {
          page: pageToLoad,
          perPage: 24,
          sort,
          signal,
          bypassCache,
        });
        if (signal?.aborted) return;

        setStudio(res);
        document.title = `${res.name} — Studio Filmography — Solfain`;
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
          err instanceof Error ? err.message : 'Unable to load studio catalogue from AniList.',
        );
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [sort, studioId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadStudio(1, false, controller.signal, false);
    return () => controller.abort();
  }, [loadStudio]);

  const safeAniListUrl = sanitizeHttpUrl(studio?.siteUrl, { httpsOnly: true });

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
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.75rem',
              color: 'var(--accent-hover)',
              marginBottom: '4px',
            }}
          >
            <Building2 size={13} aria-hidden="true" />
            <span>
              {studio?.isAnimationStudio === false ? 'Producer' : 'Animation Studio'}
            </span>
          </div>
          <h1 className="page-header__title">{studio ? studio.name : 'Studio Filmography'}</h1>
          <p className="page-header__desc">
            Main-production anime series and theatrical films credited on AniList.
          </p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
          <select
            className="field-select"
            aria-label="Sort studio works"
            style={{ width: 'auto', minWidth: '154px' }}
            value={sort}
            onChange={(e) => setSort(e.target.value as MediaSort)}
          >
            {STUDIO_SORTS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {safeAniListUrl && (
            <a
              href={safeAniListUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn--ghost btn--compact"
            >
              <span>AniList</span>
              <ExternalLink size={13} aria-hidden="true" />
            </a>
          )}
        </div>
      </header>

      {loading ? (
        <AnimeGridSkeleton count={18} />
      ) : errorMessage && items.length === 0 ? (
        <ErrorState
          title="Could not load studio works"
          message={errorMessage}
          onRetry={() => void loadStudio(1, false, undefined, true)}
          action={
            <Link to="/search" className="btn btn--ghost btn--compact">
              Browse Catalogue
            </Link>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="No main-production anime listed"
          description="AniList did not return main-production anime entries for this studio."
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
                onClick={() => void loadStudio(page + 1, true)}
              >
                {loadingMore ? 'Loading more…' : 'Load More Works'}
              </button>
            </div>
          )}
        </>
      )}

      <div style={{ marginTop: '32px' }}>
        <AdSlot placement="studio-bottom-rectangle" />
      </div>
    </div>
  );
}
