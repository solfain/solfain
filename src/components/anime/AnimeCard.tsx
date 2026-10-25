import { useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, Film, Star } from 'lucide-react';
import { useFavorites } from '../../services/storage/favoritesStore';
import type { AnimeSummary } from '../../types/anime';
import type { FavoriteAnimeItem } from '../../types/storage';
import {
  formatMediaFormat,
  formatScore,
  getDisplayTitle,
  getReleaseYear,
} from '../../utils/format';

export interface AnimeCardProps {
  anime: AnimeSummary | FavoriteAnimeItem;
  rank?: number;
  eager?: boolean;
}

function isFavoriteRecord(
  anime: AnimeSummary | FavoriteAnimeItem,
): anime is FavoriteAnimeItem {
  return 'addedAt' in anime;
}

export function AnimeCard({ anime, rank, eager = false }: AnimeCardProps) {
  const [imageError, setImageError] = useState(false);
  const { isFavorite, toggleFavorite } = useFavorites();

  const favorited = isFavorite(anime.id);

  const title = isFavoriteRecord(anime) ? anime.title : getDisplayTitle(anime.title);
  const coverUrl = isFavoriteRecord(anime)
    ? anime.coverImage
    : anime.coverImage?.large || anime.coverImage?.extraLarge || anime.coverImage?.medium || null;
  const formatLabel = formatMediaFormat(anime.format);
  const year = isFavoriteRecord(anime) ? anime.seasonYear : getReleaseYear(anime);
  const scoreLabel = formatScore(anime.averageScore);

  const handleToggleFavorite = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    toggleFavorite(anime);
  };

  return (
    <article className="anime-card">
      <button
        type="button"
        className={`anime-card__fav-btn${favorited ? ' anime-card__fav-btn--active' : ''}`}
        aria-label={favorited ? `Remove ${title} from favorites` : `Save ${title} to favorites`}
        aria-pressed={favorited}
        onClick={handleToggleFavorite}
      >
        <Bookmark
          size={14}
          fill={favorited ? 'currentColor' : 'none'}
          aria-hidden="true"
        />
      </button>

      <Link to={`/anime/${anime.id}`} className="anime-card__link">
        <div className="anime-card__poster-wrap">
          {coverUrl && !imageError ? (
            <img
              src={coverUrl}
              alt={title}
              className="anime-card__img"
              loading={eager ? 'eager' : 'lazy'}
              decoding="async"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="anime-card__fallback" aria-hidden="true">
              <Film size={18} />
              <span className="anime-card__fallback-title">{title}</span>
            </div>
          )}

          {typeof rank === 'number' && (
            <span className="anime-card__rank">#{String(rank).padStart(2, '0')}</span>
          )}
        </div>

        <div className="anime-card__info">
          <h3 className="anime-card__title">{title}</h3>
          <div className="anime-card__meta">
            {formatLabel && <span>{formatLabel}</span>}
            {formatLabel && year && <span aria-hidden="true">·</span>}
            {year && <span className="tabular">{year}</span>}
            {(formatLabel || year) && scoreLabel && <span aria-hidden="true">·</span>}
            {scoreLabel && (
              <span className="anime-card__score">
                <Star size={11} fill="currentColor" aria-hidden="true" />
                <span>{scoreLabel}</span>
              </span>
            )}
          </div>
        </div>
      </Link>
    </article>
  );
}
