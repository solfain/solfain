import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Bookmark, Film, Play, Star } from 'lucide-react';
import { AdSlot } from '../components/monetization/SponsorSlot';
import { AnimeCard } from '../components/anime/AnimeCard';
import { EpisodeList } from '../components/anime/EpisodeList';
import { ErrorState } from '../components/ui/StateFeedback';
import { getAnimeDetails } from '../services/anilist/anilistService';
import { getVideoProvider } from '../services/providers';
import { useFavorites } from '../services/storage/favoritesStore';
import { useWatchHistory } from '../services/storage/historyStore';
import type { AnimeDetails } from '../types/anime';
import {
  cleanSynopsis,
  formatMediaFormat,
  formatMediaStatus,
  formatRelationType,
  formatScore,
  formatSeasonName,
  getDisplayTitle,
  getMainStudioName,
  getReleaseYear,
} from '../utils/format';

export function AnimeDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const numericId = Number.parseInt(id ?? '', 10);

  const [anime, setAnime] = useState<AnimeDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState(false);
  const [posterError, setPosterError] = useState(false);

  const { isFavorite, toggleFavorite } = useFavorites();
  const { getEntryForAnime } = useWatchHistory();

  const loadDetails = useCallback(
    async (bypassCache = false) => {
      if (!Number.isInteger(numericId) || numericId <= 0) {
        setErrorMessage('Invalid anime ID in URL.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMessage(null);
      setBannerError(false);
      setPosterError(false);

      try {
        const res = await getAnimeDetails(numericId, { bypassCache });
        setAnime(res);
        document.title = `${getDisplayTitle(res.title)} — Solfain`;
      } catch (err) {
        setAnime(null);
        setErrorMessage(
          err instanceof Error ? err.message : 'Unable to load anime details from AniList.',
        );
      } finally {
        setLoading(false);
      }
    },
    [numericId],
  );

  useEffect(() => {
    window.scrollTo(0, 0);
    void loadDetails(false);
  }, [loadDetails]);

  const provider = getVideoProvider();
  const episodeCatalogue = useMemo(
    () => (anime ? provider.buildEpisodeCatalogue(anime) : null),
    [anime, provider],
  );

  if (!loading && (errorMessage || !anime || !episodeCatalogue)) {
    return (
      <div className="container" style={{ paddingTop: '40px' }}>
        <ErrorState
          title="Could not load anime details"
          message={errorMessage || 'Anime metadata could not be retrieved.'}
          onRetry={() => void loadDetails(true)}
          action={
            <Link to="/search" className="btn btn--ghost btn--compact">
              Browse catalogue
            </Link>
          }
        />
      </div>
    );
  }

  const isInitialLoading = loading || !anime || !episodeCatalogue;

  const primaryTitle = anime ? getDisplayTitle(anime.title) : '';
  const romajiTitle =
    anime?.title.romaji && anime.title.romaji.toLowerCase() !== primaryTitle.toLowerCase()
      ? anime.title.romaji
      : null;
  const nativeTitle = anime?.title.native || null;

  const hasBanner = Boolean(anime?.bannerImage) && !bannerError;
  const posterUrl =
    anime?.coverImage?.extraLarge ||
    anime?.coverImage?.large ||
    anime?.coverImage?.medium ||
    null;

  const synopsis = anime ? cleanSynopsis(anime.description) : '';
  const formatLabel = anime ? formatMediaFormat(anime.format) : null;
  const statusLabel = anime ? formatMediaStatus(anime.status) : null;
  const year = anime ? getReleaseYear(anime) : null;
  const seasonLabel = anime ? formatSeasonName(anime.season) : null;
  const scoreLabel = anime ? formatScore(anime.averageScore) : null;
  const studioName = anime ? getMainStudioName(anime) : null;

  const favorited = anime ? isFavorite(anime.id) : false;
  const historyEntry = anime ? getEntryForAnime(anime.id) : null;
  const resumeEpisode = historyEntry?.episode ?? 1;
  const resumeAudio = historyEntry?.audio ?? 'sub';
  const canStream =
    Boolean(anime && episodeCatalogue) &&
    anime!.status !== 'NOT_YET_RELEASED' &&
    episodeCatalogue!.airedEpisodeCount > 0;

  const recommendations = anime
    ? anime.recommendations.nodes
        .map((n) => n.mediaRecommendation)
        .filter((m): m is NonNullable<typeof m> => Boolean(m))
    : [];

  return (
    <div aria-busy={isInitialLoading || undefined}>
      {isInitialLoading ? (
        <div className="details-banner">
          <div
            className="skeleton-block"
            style={{ width: '100%', height: '100%', borderRadius: 0 }}
          />
        </div>
      ) : (
        <div className={`details-banner${hasBanner ? '' : ' details-banner--compact'}`}>
          {hasBanner && anime.bannerImage && (
            <img
              src={anime.bannerImage}
              alt=""
              className="details-banner__img"
              onError={() => setBannerError(true)}
            />
          )}
          <div className="details-banner__scrim" aria-hidden="true" />
        </div>
      )}

      <div className="container">
        {isInitialLoading ? (
          <div className="details-header">
            <div className="details-poster skeleton-block" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="skeleton-block" style={{ height: '34px', width: '60%' }} />
              <div className="skeleton-block" style={{ height: '16px', width: '38%' }} />
              <div className="skeleton-block" style={{ height: '18px', width: '75%' }} />
              <div style={{ display: 'flex', gap: '10px' }}>
                <div className="skeleton-block" style={{ height: '40px', width: '138px' }} />
                <div className="skeleton-block" style={{ height: '40px', width: '112px' }} />
              </div>
            </div>
          </div>
        ) : (
          <section
            className={`details-header${hasBanner ? '' : ' details-header--no-banner'}`}
            aria-label="Anime overview"
          >
            <div className="details-poster">
              {posterUrl && !posterError ? (
                <img
                  src={posterUrl}
                  alt={primaryTitle}
                  className="details-poster__img"
                  onError={() => setPosterError(true)}
                />
              ) : (
                <div className="anime-card__fallback">
                  <Film size={22} />
                  <span className="anime-card__fallback-title">{primaryTitle}</span>
                </div>
              )}
            </div>

            <div className="details-heading">
              <h1 className="details-title">{primaryTitle}</h1>

              {(romajiTitle || nativeTitle) && (
                <div className="details-subtitles">
                  {romajiTitle && <span>{romajiTitle}</span>}
                  {romajiTitle && nativeTitle && <span aria-hidden="true"> · </span>}
                  {nativeTitle && <span lang="ja">{nativeTitle}</span>}
                </div>
              )}

              <div className="details-meta-strip">
                {scoreLabel && (
                  <span className="details-meta-item">
                    <Star
                      size={14}
                      fill="var(--accent-hover)"
                      color="var(--accent-hover)"
                      aria-hidden="true"
                    />
                    <strong className="tabular">{scoreLabel}</strong>
                  </span>
                )}
                {formatLabel && <span className="details-meta-item">{formatLabel}</span>}
                {year && <span className="details-meta-item tabular">{year}</span>}
                {statusLabel && <span className="details-meta-item">{statusLabel}</span>}
                {anime.episodes && (
                  <span className="details-meta-item tabular">{anime.episodes} Episodes</span>
                )}
                {studioName && <span className="details-meta-item">{studioName}</span>}
              </div>

              {anime.genres.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {anime.genres.map((genre) => (
                    <Link
                      key={genre}
                      to={`/search?genre=${encodeURIComponent(genre)}`}
                      className="genre-chip"
                    >
                      {genre}
                    </Link>
                  ))}
                </div>
              )}

              <div className="details-actions">
                {canStream ? (
                  <Link
                    to={`/watch/${anime.id}?ep=${resumeEpisode}${
                      resumeAudio === 'dub' ? '&audio=dub' : ''
                    }`}
                    className="btn btn--primary"
                  >
                    <Play size={16} fill="currentColor" aria-hidden="true" />
                    <span>
                      {historyEntry ? `Continue Episode ${historyEntry.episode}` : 'Watch Now'}
                    </span>
                  </Link>
                ) : (
                  <button type="button" className="btn btn--secondary" disabled>
                    {anime.status === 'NOT_YET_RELEASED'
                      ? 'Not Yet Released'
                      : 'No Episodes Available'}
                  </button>
                )}

                <button
                  type="button"
                  className={`btn btn--secondary${favorited ? ' btn--active-accent' : ''}`}
                  aria-pressed={favorited}
                  onClick={() => toggleFavorite(anime)}
                >
                  <Bookmark
                    size={16}
                    fill={favorited ? 'currentColor' : 'none'}
                    aria-hidden="true"
                  />
                  <span>{favorited ? 'In Favorites' : 'Add to Favorites'}</span>
                </button>
              </div>
            </div>
          </section>
        )}

        <div className="details-layout">
          <div className="details-main">
            {isInitialLoading ? (
              <div className="skeleton-block" style={{ height: '104px', width: '100%' }} />
            ) : (
              <section aria-labelledby="synopsis-heading">
                <h2 id="synopsis-heading" className="section-title" style={{ marginBottom: '10px' }}>
                  Synopsis
                </h2>
                {synopsis ? (
                  <p className="synopsis-text">{synopsis}</p>
                ) : (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                    No synopsis has been published for this entry yet.
                  </p>
                )}
              </section>
            )}

            {/* Mounted immediately at t=0ms alongside skeletons so Adsterra never waits on AniList */}
            <AdSlot key="details-inline" placement="details-inline" />

            {isInitialLoading ? (
              <div className="skeleton-block" style={{ height: '240px', width: '100%' }} />
            ) : (
              <>
                <section aria-labelledby="episodes-heading">
                  <div className="section-header" style={{ marginBottom: '12px' }}>
                    <div className="section-header__titles">
                      <h2 id="episodes-heading" className="section-title">
                        Episodes
                      </h2>
                      {episodeCatalogue.airedEpisodeCount > 0 && (
                        <span className="section-subtitle tabular">
                          {episodeCatalogue.airedEpisodeCount} available
                        </span>
                      )}
                    </div>
                  </div>

                  <EpisodeList
                    animeId={anime.id}
                    catalogue={episodeCatalogue}
                    currentEpisode={historyEntry?.episode}
                    audio={resumeAudio}
                  />
                </section>

                {anime.relations.edges.length > 0 && (
                  <section aria-labelledby="relations-heading">
                    <h2
                      id="relations-heading"
                      className="section-title"
                      style={{ marginBottom: '12px' }}
                    >
                      Related Entries
                    </h2>
                    <div className="relations-grid">
                      {anime.relations.edges.slice(0, 10).map((edge) => {
                        const relTitle = getDisplayTitle(edge.node.title);
                        const relThumb =
                          edge.node.coverImage?.large || edge.node.coverImage?.medium || '';
                        const relRole = formatRelationType(edge.relationType);
                        const relFmt = formatMediaFormat(edge.node.format);
                        const relStatus = formatMediaStatus(edge.node.status);
                        const isAnime = !edge.node.type || edge.node.type === 'ANIME';

                        const content = (
                          <>
                            {relThumb ? (
                              <img
                                src={relThumb}
                                alt=""
                                className="relation-card__thumb"
                                loading="lazy"
                              />
                            ) : (
                              <div className="relation-card__thumb" aria-hidden="true" />
                            )}
                            <div className="relation-card__body">
                              <span className="relation-card__role">{relRole}</span>
                              <span className="relation-card__title">{relTitle}</span>
                              <span className="relation-card__meta">
                                {[relFmt, relStatus, !isAnime ? 'Print' : null]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </span>
                            </div>
                          </>
                        );

                        if (isAnime) {
                          return (
                            <Link
                              key={`${edge.id}-${edge.node.id}`}
                              to={`/anime/${edge.node.id}`}
                              className="relation-card"
                            >
                              {content}
                            </Link>
                          );
                        }

                        return (
                          <div key={`${edge.id}-${edge.node.id}`} className="relation-card">
                            {content}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                {recommendations.length > 0 && (
                  <section aria-labelledby="recommendations-heading">
                    <h2
                      id="recommendations-heading"
                      className="section-title"
                      style={{ marginBottom: '14px' }}
                    >
                      Recommended If You Liked This
                    </h2>
                    <div className="anime-grid">
                      {recommendations.slice(0, 12).map((rec) => (
                        <AnimeCard key={rec.id} anime={rec} />
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </div>

          <aside className="details-sidebar" aria-label="Series information">
            {isInitialLoading ? (
              <div className="dossier-panel">
                <div className="skeleton-block" style={{ height: '240px', width: '100%' }} />
              </div>
            ) : (
              <div className="dossier-panel">
                <h2 className="dossier-title">Information</h2>
                <dl className="dossier-list">
                  {formatLabel && (
                    <div className="dossier-row">
                      <dt>Format</dt>
                      <dd>{formatLabel}</dd>
                    </div>
                  )}
                  {anime.episodes && (
                    <div className="dossier-row">
                      <dt>Episodes</dt>
                      <dd className="tabular">{anime.episodes}</dd>
                    </div>
                  )}
                  {anime.duration && (
                    <div className="dossier-row">
                      <dt>Duration</dt>
                      <dd className="tabular">{anime.duration} min</dd>
                    </div>
                  )}
                  {statusLabel && (
                    <div className="dossier-row">
                      <dt>Status</dt>
                      <dd>{statusLabel}</dd>
                    </div>
                  )}
                  {(seasonLabel || year) && (
                    <div className="dossier-row">
                      <dt>Season</dt>
                      <dd>{[seasonLabel, year].filter(Boolean).join(' ')}</dd>
                    </div>
                  )}
                  {scoreLabel && (
                    <div className="dossier-row">
                      <dt>Average Score</dt>
                      <dd className="tabular">{scoreLabel}</dd>
                    </div>
                  )}
                  {studioName && (
                    <div className="dossier-row">
                      <dt>Studio</dt>
                      <dd>{studioName}</dd>
                    </div>
                  )}
                  {anime.source && (
                    <div className="dossier-row">
                      <dt>Source</dt>
                      <dd>{anime.source.replace(/_/g, ' ')}</dd>
                    </div>
                  )}
                  <div className="dossier-row">
                    <dt>AniList ID</dt>
                    <dd className="tabular">{anime.id}</dd>
                  </div>
                  {anime.idMal && (
                    <div className="dossier-row">
                      <dt>MAL ID</dt>
                      <dd className="tabular">{anime.idMal}</dd>
                    </div>
                  )}
                </dl>
              </div>
            )}

            <AdSlot key="sidebar-rectangle" placement="sidebar-rectangle" />
          </aside>
        </div>
      </div>
    </div>
  );
}
