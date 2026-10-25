import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Play } from 'lucide-react';
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

  return (
    <div className="episode-panel">
      {(totalChunks > 1 || episodes.length > 16) && (
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
          ) : (
            <div />
          )}

          <input
            type="search"
            className="field-input"
            style={{ maxWidth: compact ? '100%' : '210px', height: '32px', fontSize: '0.78125rem' }}
            placeholder="Filter episode # or title..."
            aria-label="Filter episodes"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />
        </div>
      )}

      {statusNote && (
        <p style={{ fontSize: '0.78125rem', color: 'var(--text-muted)' }}>{statusNote}</p>
      )}

      <div className={`episode-grid${compact ? ' episode-grid--compact' : ''}`}>
        {visibleEpisodes.map((ep) => {
          const isActive = currentEpisode === ep.number;
          const href = `/watch/${animeId}?ep=${ep.number}${audio === 'dub' ? '&audio=dub' : ''}`;
          const numPadded = String(ep.number).padStart(2, '0');
          const displayTitle = ep.title || `Episode ${ep.number}`;

          if (onSelectEpisode) {
            return (
              <button
                key={ep.number}
                type="button"
                className={`episode-item${isActive ? ' episode-item--active' : ''}`}
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
            );
          }

          return (
            <Link
              key={ep.number}
              to={href}
              className={`episode-item${isActive ? ' episode-item--active' : ''}`}
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
          );
        })}
      </div>
    </div>
  );
}
