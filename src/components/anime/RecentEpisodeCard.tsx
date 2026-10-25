import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Film, Play } from 'lucide-react';
import type { RecentAiringItem } from '../../types/anime';
import type { WatchHistoryItem } from '../../types/storage';
import {
  formatClockDuration,
  formatMediaFormat,
  formatRelativeAiredTime,
  getDisplayTitle,
} from '../../utils/format';

interface RecentAiringCardProps {
  mode: 'airing';
  item: RecentAiringItem;
}

interface ContinueWatchingCardProps {
  mode: 'history';
  item: WatchHistoryItem;
}

export type RecentEpisodeCardProps = RecentAiringCardProps | ContinueWatchingCardProps;

export function RecentEpisodeCard(props: RecentEpisodeCardProps) {
  const [imageError, setImageError] = useState(false);

  if (props.mode === 'airing') {
    const { item } = props;
    const title = getDisplayTitle(item.media.title);
    const artwork =
      item.media.bannerImage ||
      item.media.coverImage?.extraLarge ||
      item.media.coverImage?.large ||
      null;
    const formatLabel = formatMediaFormat(item.media.format);
    const relativeTime = formatRelativeAiredTime(item.airingAt);

    return (
      <article className="recent-card">
        <Link
          to={`/watch/${item.media.id}?ep=${item.episode}`}
          className="recent-card__link"
        >
          <div className="recent-card__media">
            {artwork && !imageError ? (
              <img
                src={artwork}
                alt={`${title} Episode ${item.episode}`}
                className="recent-card__img"
                loading="lazy"
                decoding="async"
                onError={() => setImageError(true)}
              />
            ) : (
              <div className="anime-card__fallback" aria-hidden="true">
                <Film size={18} />
                <span className="anime-card__fallback-title">{title}</span>
              </div>
            )}
            <div className="recent-card__scrim" aria-hidden="true" />
            <div className="recent-card__overlay">
              <span className="recent-card__ep-tag">
                <Play size={11} fill="currentColor" aria-hidden="true" />
                <span>Episode {item.episode}</span>
              </span>
              <span className="recent-card__time">{relativeTime}</span>
            </div>
          </div>

          <div className="recent-card__info">
            <div style={{ minWidth: 0, flex: 1 }}>
              <h3 className="recent-card__title">{title}</h3>
              <p className="recent-card__sub">
                {[formatLabel, 'Simulcast update'].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
        </Link>
      </article>
    );
  }

  const { item } = props;
  const artwork = item.bannerImage || item.coverImage || null;
  const hasVerifiedProgress =
    typeof item.progressSeconds === 'number' &&
    item.progressSeconds > 0 &&
    typeof item.durationSeconds === 'number' &&
    item.durationSeconds > 0;

  const progressPercent = hasVerifiedProgress
    ? Math.min(100, Math.max(2, Math.round((item.progressSeconds! / item.durationSeconds!) * 100)))
    : null;

  const watchHref = `/watch/${item.animeId}?ep=${item.episode}${
    item.audio === 'dub' ? '&audio=dub' : ''
  }`;

  return (
    <article className="recent-card">
      <Link to={watchHref} className="recent-card__link">
        <div className="recent-card__media">
          {artwork && !imageError ? (
            <img
              src={artwork}
              alt={`${item.title} Episode ${item.episode}`}
              className="recent-card__img"
              loading="lazy"
              decoding="async"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="anime-card__fallback" aria-hidden="true">
              <Film size={18} />
              <span className="anime-card__fallback-title">{item.title}</span>
            </div>
          )}
          <div className="recent-card__scrim" aria-hidden="true" />
          <div className="recent-card__overlay">
            <span className="recent-card__ep-tag">
              <Play size={11} fill="currentColor" aria-hidden="true" />
              <span>Ep {item.episode}</span>
            </span>
            {hasVerifiedProgress ? (
              <span className="recent-card__time">
                {formatClockDuration(item.progressSeconds)} /{' '}
                {formatClockDuration(item.durationSeconds)}
              </span>
            ) : (
              <span className="recent-card__time">{item.audio.toUpperCase()}</span>
            )}
          </div>
          {progressPercent !== null && (
            <div className="recent-card__progress" aria-hidden="true">
              <div
                className="recent-card__progress-bar"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          )}
        </div>

        <div className="recent-card__info">
          <div style={{ minWidth: 0, flex: 1 }}>
            <h3 className="recent-card__title">{item.title}</h3>
            <p className="recent-card__sub">
              {item.episodeTitle ? `Ep ${item.episode}: ${item.episodeTitle}` : `Continue Episode ${item.episode}`}
            </p>
          </div>
        </div>
      </Link>
    </article>
  );
}
