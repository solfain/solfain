import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { AdSlot } from '../components/ads/AdSlot';
import { EpisodeList } from '../components/anime/EpisodeList';
import { WatchSkeleton } from '../components/anime/Skeletons';
import { ErrorState } from '../components/ui/StateFeedback';
import { getAnimeDetails } from '../services/anilist/anilistService';
import { getVideoProvider } from '../services/providers';
import { useFavorites } from '../services/storage/favoritesStore';
import {
  recordWatchVisit,
  updateVerifiedPlaybackProgress,
} from '../services/storage/historyStore';
import type { AnimeDetails } from '../types/anime';
import type { AudioTrack, ProviderIdMode } from '../types/provider';
import {
  cleanSynopsis,
  formatMediaFormat,
  getDisplayTitle,
  getMainStudioName,
  getReleaseYear,
} from '../utils/format';

export function WatchPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const numericId = Number.parseInt(id ?? '', 10);

  const [anime, setAnime] = useState<AnimeDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [idMode, setIdMode] = useState<ProviderIdMode>('anilist');
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [autoNext, setAutoNext] = useState(true);
  const [manualEpInput, setManualEpInput] = useState('');

  const { isFavorite, toggleFavorite } = useFavorites();
  const provider = getVideoProvider();

  const epParam = Number.parseInt(searchParams.get('ep') ?? '', 10);
  const currentEpisode = Number.isInteger(epParam) && epParam >= 1 ? epParam : 1;
  const audioParam = searchParams.get('audio');
  const currentAudio: AudioTrack = audioParam === 'dub' ? 'dub' : 'sub';

  const loadAnime = useCallback(
    async (bypassCache = false) => {
      if (!Number.isInteger(numericId) || numericId <= 0) {
        setErrorMessage('Invalid anime identifier.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMessage(null);
      try {
        const details = await getAnimeDetails(numericId, { bypassCache });
        setAnime(details);
      } catch (err) {
        setAnime(null);
        setErrorMessage(
          err instanceof Error ? err.message : 'Unable to load anime metadata from AniList.',
        );
      } finally {
        setLoading(false);
      }
    },
    [numericId],
  );

  useEffect(() => {
    window.scrollTo(0, 0);
    setIdMode('anilist');
    void loadAnime(false);
  }, [loadAnime]);

  const catalogue = useMemo(
    () => (anime ? provider.buildEpisodeCatalogue(anime) : null),
    [anime, provider],
  );

  const activeEpisodeMeta = useMemo(
    () => catalogue?.episodes.find((ep) => ep.number === currentEpisode) ?? null,
    [catalogue, currentEpisode],
  );

  const playbackSource = useMemo(() => {
    if (!anime) return null;
    return provider.resolvePlaybackSource({
      anime,
      episode: currentEpisode,
      audio: currentAudio,
      idMode,
    });
  }, [anime, currentEpisode, currentAudio, idMode, provider]);

  const hasNext = catalogue
    ? catalogue.hasExactEpisodeCount
      ? currentEpisode < catalogue.airedEpisodeCount
      : true
    : false;

  const setNavigationState = useCallback(
    (nextEp: number, nextAudio: AudioTrack = currentAudio) => {
      const params = new URLSearchParams(searchParams);
      params.set('ep', String(nextEp));
      if (nextAudio === 'dub') {
        params.set('audio', 'dub');
      } else {
        params.delete('audio');
      }
      setSearchParams(params);
    },
    [currentAudio, searchParams, setSearchParams],
  );

  useEffect(() => {
    setIframeLoaded(false);
  }, [playbackSource?.embedUrl, reloadNonce]);

  useEffect(() => {
    if (!anime) return;
    const title = getDisplayTitle(anime.title);
    document.title = `Watch ${title} Ep ${currentEpisode} — Solfain`;

    if (playbackSource?.ok) {
      recordWatchVisit({
        anime,
        episode: currentEpisode,
        episodeTitle: activeEpisodeMeta?.title ?? null,
        audio: currentAudio,
      });
    }
  }, [anime, currentEpisode, currentAudio, activeEpisodeMeta?.title, playbackSource?.ok]);

  // Listen for Yenime PLAYER_EVENT messages (play, pause, seeked, ended, timeupdate)
  useEffect(() => {
    if (!anime) return;

    const handleMessage = (event: MessageEvent) => {
      const telemetry = provider.parsePlayerMessage(event);
      if (!telemetry) return;

      setIframeLoaded(true);

      if (telemetry.currentTime > 0 && telemetry.duration > 0) {
        updateVerifiedPlaybackProgress({
          animeId: anime.id,
          episode: currentEpisode,
          progressSeconds: telemetry.currentTime,
          durationSeconds: telemetry.duration,
        });
      }

      if (telemetry.event === 'ended' && autoNext && hasNext) {
        setNavigationState(currentEpisode + 1, currentAudio);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [anime, autoNext, currentAudio, currentEpisode, hasNext, provider, setNavigationState]);

  if (loading) {
    return <WatchSkeleton />;
  }

  if (errorMessage || !anime || !catalogue || !playbackSource) {
    return (
      <div className="container watch-page">
        <ErrorState
          title="Unable to initialize watch page"
          message={errorMessage || 'Anime data could not be loaded.'}
          onRetry={() => void loadAnime(true)}
          action={
            <Link to="/search" className="btn btn--ghost btn--compact">
              Browse anime
            </Link>
          }
        />
      </div>
    );
  }

  const title = getDisplayTitle(anime.title);
  const favorited = isFavorite(anime.id);
  const hasPrev = currentEpisode > 1;
  const studioName = getMainStudioName(anime);
  const synopsis = cleanSynopsis(anime.description);
  const iframeSrc = playbackSource.embedUrl;

  return (
    <div className="container watch-page">
      <div className="watch-breadcrumb">
        <Link to={`/anime/${anime.id}`} className="watch-breadcrumb__back">
          <ArrowLeft size={15} aria-hidden="true" />
          <span>Back to {title}</span>
        </Link>

        <span className="tabular">
          Episode {currentEpisode}
          {catalogue.hasExactEpisodeCount && catalogue.airedEpisodeCount > 0
            ? ` of ${catalogue.airedEpisodeCount}`
            : ''}
        </span>
      </div>

      <div className="watch-layout">
        <div className="watch-stage">
          <div className="player-frame">
            {playbackSource.ok && iframeSrc ? (
              <>
                {!iframeLoaded && (
                  <div
                    className="player-overlay player-overlay--loading"
                    aria-live="polite"
                  >
                    <div className="player-overlay__title">Loading Episode {currentEpisode}…</div>
                    <p className="player-overlay__desc">
                      {title} · {currentAudio.toUpperCase()}
                    </p>
                  </div>
                )}
                <iframe
                  key={`${iframeSrc}::${reloadNonce}`}
                  src={iframeSrc}
                  title={`${title} — Episode ${currentEpisode} (${currentAudio.toUpperCase()})`}
                  className="player-frame__iframe"
                  allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                  allowFullScreen
                  referrerPolicy="origin"
                  onLoad={() => setIframeLoaded(true)}
                />
              </>
            ) : (
              <div className="player-overlay" role="alert">
                <AlertTriangle size={24} color="var(--status-warning)" aria-hidden="true" />
                <div className="player-overlay__title">Episode Unavailable</div>
                <p className="player-overlay__desc">
                  {playbackSource.errorMessage ||
                    'Could not resolve a playable source for this episode.'}
                </p>
                <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                  {catalogue.airedEpisodeCount > 0 && currentEpisode !== 1 && (
                    <button
                      type="button"
                      className="btn btn--secondary btn--compact"
                      onClick={() => setNavigationState(1, currentAudio)}
                    >
                      Go to Episode 1
                    </button>
                  )}
                  <Link
                    to={`/anime/${anime.id}`}
                    className="btn btn--ghost btn--compact"
                  >
                    Series Details
                  </Link>
                </div>
              </div>
            )}
          </div>

          <div className="watch-controls-bar" aria-label="Playback and episode controls">
            <div className="watch-controls-group">
              <button
                type="button"
                className="btn btn--secondary btn--compact"
                aria-label="Previous episode"
                disabled={!hasPrev}
                onClick={() => setNavigationState(currentEpisode - 1, currentAudio)}
              >
                <ChevronLeft size={15} aria-hidden="true" />
                <span>Prev</span>
              </button>

              <button
                type="button"
                className="btn btn--secondary btn--compact"
                aria-label="Next episode"
                disabled={!hasNext}
                onClick={() => setNavigationState(currentEpisode + 1, currentAudio)}
              >
                <span>Next</span>
                <ChevronRight size={15} aria-hidden="true" />
              </button>

              {catalogue.episodes.length > 1 && catalogue.episodes.length <= 200 && (
                <select
                  className="field-select"
                  aria-label="Select episode"
                  style={{ width: 'auto', minWidth: '112px', height: '34px', fontSize: '0.8125rem' }}
                  value={currentEpisode}
                  onChange={(e) =>
                    setNavigationState(Number.parseInt(e.target.value, 10), currentAudio)
                  }
                >
                  {catalogue.episodes.map((ep) => (
                    <option key={ep.number} value={ep.number}>
                      Episode {ep.number}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="watch-controls-group">
              <div className="segmented-control" role="group" aria-label="Audio track selection">
                <button
                  type="button"
                  className={`segmented-control__btn${
                    currentAudio === 'sub' ? ' segmented-control__btn--active' : ''
                  }`}
                  aria-pressed={currentAudio === 'sub'}
                  onClick={() => setNavigationState(currentEpisode, 'sub')}
                >
                  SUB
                </button>
                <button
                  type="button"
                  className={`segmented-control__btn${
                    currentAudio === 'dub' ? ' segmented-control__btn--active' : ''
                  }`}
                  aria-pressed={currentAudio === 'dub'}
                  onClick={() => setNavigationState(currentEpisode, 'dub')}
                >
                  DUB
                </button>
              </div>

              {playbackSource.canFallbackToMal && (
                <div
                  className="segmented-control"
                  role="group"
                  aria-label="Source identifier"
                >
                  <button
                    type="button"
                    className={`segmented-control__btn${
                      idMode === 'anilist' ? ' segmented-control__btn--active' : ''
                    }`}
                    aria-pressed={idMode === 'anilist'}
                    onClick={() => setIdMode('anilist')}
                  >
                    AniList
                  </button>
                  <button
                    type="button"
                    className={`segmented-control__btn${
                      idMode === 'mal' ? ' segmented-control__btn--active' : ''
                    }`}
                    aria-pressed={idMode === 'mal'}
                    onClick={() => setIdMode('mal')}
                  >
                    MAL
                  </button>
                </div>
              )}

              <button
                type="button"
                className={`btn btn--ghost btn--compact${autoNext ? ' btn--active-accent' : ''}`}
                aria-pressed={autoNext}
                onClick={() => setAutoNext((prev) => !prev)}
              >
                <span>Auto-Next</span>
              </button>

              <button
                type="button"
                className="btn btn--ghost btn--compact"
                aria-label="Reload video player"
                onClick={() => setReloadNonce((n) => n + 1)}
              >
                <RefreshCw size={14} aria-hidden="true" />
                <span>Reload</span>
              </button>
            </div>
          </div>

          <section className="watch-info-panel" aria-label="Current episode details">
            <div className="watch-info-panel__header">
              <div>
                <h1 className="watch-anime-title">{title}</h1>
                <p className="watch-ep-label">
                  Episode {currentEpisode}
                  {activeEpisodeMeta?.title ? ` — ${activeEpisodeMeta.title}` : ''}
                  {' · '}
                  {[formatMediaFormat(anime.format), getReleaseYear(anime), studioName]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className={`btn btn--ghost btn--compact${
                    favorited ? ' btn--active-accent' : ''
                  }`}
                  aria-pressed={favorited}
                  onClick={() => toggleFavorite(anime)}
                >
                  <Bookmark
                    size={14}
                    fill={favorited ? 'currentColor' : 'none'}
                    aria-hidden="true"
                  />
                  <span>{favorited ? 'Saved' : 'Favorite'}</span>
                </button>
                <Link to={`/anime/${anime.id}`} className="btn btn--secondary btn--compact">
                  Details
                </Link>
              </div>
            </div>

            {synopsis && (
              <p
                style={{
                  fontSize: '0.84375rem',
                  lineHeight: 1.55,
                  color: 'var(--text-secondary)',
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {synopsis}
              </p>
            )}
          </section>

          {/* Responsive ad slot below the video player & visually separate from episode controls */}
          <div className="watch-ad-separator">
            <AdSlot placement="watch-below-player" />
          </div>
        </div>

        <aside className="watch-sidebar" aria-label="Episode selector">
          <div className="section-header" style={{ marginBottom: '12px' }}>
            <h2 className="section-title" style={{ fontSize: '1rem' }}>
              Episodes
            </h2>
            {catalogue.airedEpisodeCount > 0 && (
              <span className="section-subtitle tabular">
                {catalogue.airedEpisodeCount} listed
              </span>
            )}
          </div>

          {!catalogue.hasExactEpisodeCount && (
            <form
              style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}
              onSubmit={(e) => {
                e.preventDefault();
                const parsed = Number.parseInt(manualEpInput, 10);
                if (Number.isInteger(parsed) && parsed >= 1) {
                  setNavigationState(parsed, currentAudio);
                  setManualEpInput('');
                }
              }}
            >
              <input
                type="number"
                min={1}
                className="field-input"
                style={{ height: '32px', fontSize: '0.8125rem' }}
                placeholder="Jump to episode #..."
                aria-label="Jump to episode number"
                value={manualEpInput}
                onChange={(e) => setManualEpInput(e.target.value)}
              />
              <button type="submit" className="btn btn--secondary btn--compact">
                Go
              </button>
            </form>
          )}

          <EpisodeList
            animeId={anime.id}
            catalogue={catalogue}
            currentEpisode={currentEpisode}
            audio={currentAudio}
            compact
            onSelectEpisode={(epNum) => setNavigationState(epNum, currentAudio)}
          />
        </aside>
      </div>
    </div>
  );
}
