import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { Check, Circle, Play } from 'lucide-react';
import { useWatchedEpisodes } from '../../services/storage/watchedEpisodesStore';
import type { AudioTrack, EpisodeCatalogue } from '../../types/provider';

export interface EpisodeListProps {
  animeId: number;
  catalogue: EpisodeCatalogue;
  currentEpisode?: number;
  audio?: AudioTrack;
  compact?: boolean;
  onSelectEpisode?: (episodeNumber: number) => void;
}

const CHUNK_SIZE = 100;

export function EpisodeList({
  animeId,
  catalogue,
  currentEpisode,
  audio = 'sub',
  compact = false,
  onSelectEpisode,
}: EpisodeListProps) {
  const { episodes, statusNote } = catalogue;
  const { watchedEpisodes, isEpisodeWatched, toggleEpisodeWatched } =
    useWatchedEpisodes(animeId);
  const totalChunks = Math.max(1, Math.ceil(episodes.length / CHUNK_SIZE));

  const initialChunk = useMemo(() => {
    if (!currentEpisode || episodes.length <= CHUNK_SIZE) return 0;
    return Math.min(totalChunks - 1, Math.max(0, Math.floor((currentEpisode - 1) / CHUNK_SIZE)));
  }, [currentEpisode, episodes.length, totalChunks]);

  const [chunkIndex, setChunkIndex] = useState(initialChunk);
  const [filterText, setFilterText] = useState('');

  useEffect(() => {
    setChunkIndex(initialChunk);
  }, [initialChunk]);

  const visibleEpisodes = useMemo(() => {
    const query = filterText.trim().toLowerCase();
    if (query) {
      return episodes.filter(
        (ep) =>
          String(ep.number) === query ||
          String(ep.number).includes(query) ||
          (ep.title && ep.title.toLowerCase().includes(query)),
      );
    }
    if (episodes.length <= CHUNK_SIZE) {
      return episodes;
    }
    const start = chunkIndex * CHUNK_SIZE;
    return episodes.slice(start, start + CHUNK_SIZE);
  }, [episodes, chunkIndex, filterText]);

  if (episodes.length === 0) {
    return (
      <div className="state-panel" style={{ padding: '24px 16px' }}>
        <p className="state-panel__desc">
          {statusNote || 'No playable episodes are currently listed for this title.'}
        </p>
      </div>
    );
  }

  const showToolbar =
    totalChunks > 1 || episodes.length > 16 || watchedEpisodes.length > 0;

  const handleToggleCheck = (event: MouseEvent<HTMLButtonElement>, epNumber: number) => {
    event.preventDefault();
    event.stopPropagation();
    toggleEpisodeWatched(epNumber);
  };

  return (
    <div className="episode-panel">
      {showToolbar && (
        <div className="episode-toolbar">
          {totalChunks > 1 && !filterText.trim() ? (
            <div className="episode-ranges" role="tablist" aria-label="Episode ranges">
              {Array.from({ length: totalChunks }, (_, idx) => {
                const start = idx * CHUNK_SIZE + 1;
                const end = Math.min(episodes.length, (idx + 1) * CHUNK_SIZE);
                const active = idx === chunkIndex;
                return (
                  <button
                    key={start}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={`range-tab${active ? ' range-tab--active' : ''}`}
                    onClick={() => setChunkIndex(idx)}
                  >
                    {start}–{end}
                  </button>
                );
              })}
            </div>
          ) : watchedEpisodes.length > 0 ? (
            <span className="episode-watched-summary tabular">
              {watchedEpisodes.length} / {episodes.length} watched
            </span>
          ) : (
            <div />
          )}

          {(totalChunks > 1 || episodes.length > 16) && (
            <input
              type="search"
              className="field-input"
              style={{
                maxWidth: compact ? '100%' : '210px',
                height: '32px',
                fontSize: '0.78125rem',
              }}
              placeholder="Filter episode # or title..."
              aria-label="Filter episodes"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
            />
          )}
        </div>
      )}

      {statusNote && (
        <p style={{ fontSize: '0.78125rem', color: 'var(--text-muted)' }}>{statusNote}</p>
      )}

      <div className={`episode-grid${compact ? ' episode-grid--compact' : ''}`}>
        {visibleEpisodes.map((ep) => {
          const isActive = currentEpisode === ep.number;
          const isWatched = isEpisodeWatched(ep.number);
          const href = `/watch/${animeId}?ep=${ep.number}${audio === 'dub' ? '&audio=dub' : ''}`;
          const numPadded = String(ep.number).padStart(2, '0');
          const displayTitle = ep.title || `Episode ${ep.number}`;

          return (
            <div
              key={ep.number}
              className={`episode-item-shell${isActive ? ' episode-item-shell--active' : ''}${
                isWatched && !isActive ? ' episode-item-shell--watched' : ''
              }`}
            >
              {onSelectEpisode ? (
                <button
                  type="button"
                  className="episode-item__main"
                  aria-current={isActive ? 'true' : undefined}
                  onClick={() => onSelectEpisode(ep.number)}
                >
                  <span className="episode-item__num">{numPadded}</span>
                  {!compact && ep.thumbnail && (
                    <img
                      src={ep.thumbnail}
                      alt=""
                      className="episode-item__thumb"
                      loading="lazy"
                    />
                  )}
                  <div className="episode-item__text">
                    <div className="episode-item__title">{displayTitle}</div>
                    {ep.title && <div className="episode-item__sub">Episode {ep.number}</div>}
                  </div>
                  <Play
                    size={13}
                    color={isActive ? 'var(--accent-hover)' : 'var(--text-muted)'}
                    fill={isActive ? 'currentColor' : 'none'}
                    aria-hidden="true"
                  />
                </button>
              ) : (
                <Link
                  to={href}
                  className="episode-item__main"
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span className="episode-item__num">{numPadded}</span>
                  {!compact && ep.thumbnail && (
                    <img
                      src={ep.thumbnail}
                      alt=""
                      className="episode-item__thumb"
                      loading="lazy"
                    />
                  )}
                  <div className="episode-item__text">
                    <div className="episode-item__title">{displayTitle}</div>
                    {ep.title && <div className="episode-item__sub">Episode {ep.number}</div>}
                  </div>
                  <Play size={13} color="var(--text-muted)" aria-hidden="true" />
                </Link>
              )}

              <button
                type="button"
                className={`episode-item__check${
                  isWatched ? ' episode-item__check--watched' : ''
                }`}
                aria-label={
                  isWatched
                    ? `Mark episode ${ep.number} as unwatched`
                    : `Mark episode ${ep.number} as watched`
                }
                aria-pressed={isWatched}
                title={isWatched ? 'Watched (click to unmark)' : 'Mark watched'}
                onClick={(e) => handleToggleCheck(e, ep.number)}
              >
                {isWatched ? (
                  <Check size={12} aria-hidden="true" />
                ) : (
                  <Circle size={11} aria-hidden="true" />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
