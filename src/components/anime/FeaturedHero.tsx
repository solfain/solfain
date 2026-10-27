import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, ChevronLeft, ChevronRight, Info, Play, Star } from 'lucide-react';
import { useFavorites } from '../../services/storage/favoritesStore';
import type { AnimeSummary } from '../../types/anime';
import {
  cleanSynopsis,
  formatMediaFormat,
  formatScore,
  getDisplayTitle,
  getReleaseYear,
} from '../../utils/format';
import { sanitizeHttpUrl } from '../../utils/security';

export interface FeaturedHeroProps {
  items: AnimeSummary[];
}

export function FeaturedHero({ items }: FeaturedHeroProps) {
  const candidates = useMemo(() => {
    const withBanner = items.filter((item) => Boolean(item.bannerImage));
    const source = withBanner.length >= 3 ? withBanner : items;
    return source.slice(0, 5);
  }, [items]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [failedImages, setFailedImages] = useState<Record<number, boolean>>({});
  const { isFavorite, toggleFavorite } = useFavorites();

  useEffect(() => {
    if (activeIndex >= candidates.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, candidates.length]);

  if (candidates.length === 0) {
    return null;
  }

  const active = candidates[activeIndex] ?? candidates[0];
  const title = getDisplayTitle(active.title);
  const synopsis = cleanSynopsis(active.description);
  const formatLabel = formatMediaFormat(active.format);
  const year = getReleaseYear(active);
  const score = formatScore(active.averageScore);
  const favorited = isFavorite(active.id);

  const safeBanner = sanitizeHttpUrl(active.bannerImage, { httpsOnly: true });
  const hasBanner = Boolean(safeBanner) && !failedImages[active.id];
  const imageUrl = hasBanner
    ? safeBanner
    : sanitizeHttpUrl(active.coverImage?.extraLarge || active.coverImage?.large || null, {
        httpsOnly: true,
      });

  const canWatch = active.status !== 'NOT_YET_RELEASED';

  return (
    <section className="featured-hero" aria-label="Featured anime">
      <div className="featured-hero__backdrop" aria-hidden="true">
        {imageUrl && (
          <img
            key={imageUrl}
            src={imageUrl}
            alt=""
            className={`featured-hero__img${
              hasBanner ? '' : ' featured-hero__img--cover-fallback'
            }`}
            onError={() =>
              setFailedImages((prev) => ({
                ...prev,
                [active.id]: true,
              }))
            }
          />
        )}
        <div className="featured-hero__scrim" />
      </div>

      <div className="container featured-hero__body">
        <div className="featured-hero__content">
          <div className="featured-hero__eyebrow">
            <span className="featured-hero__kicker">Featured</span>
            {formatLabel && (
              <>
                <span className="meta-dot" aria-hidden="true">·</span>
                <span>{formatLabel}</span>
              </>
            )}
            {year && (
              <>
                <span className="meta-dot" aria-hidden="true">·</span>
                <span className="tabular">{year}</span>
              </>
            )}
            {active.episodes && (
              <>
                <span className="meta-dot" aria-hidden="true">·</span>
                <span className="tabular">{active.episodes} Episodes</span>
              </>
            )}
            {score && (
              <>
                <span className="meta-dot" aria-hidden="true">·</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                  <Star size={12} fill="currentColor" aria-hidden="true" />
                  <span className="tabular">{score}</span>
                </span>
              </>
            )}
          </div>

          <h1 className="featured-hero__title">{title}</h1>

          {synopsis && <p className="featured-hero__synopsis">{synopsis}</p>}

          {active.genres && active.genres.length > 0 && (
            <div className="featured-hero__genres">
              {active.genres.slice(0, 4).map((genre) => (
                <span key={genre} className="genre-chip">
                  {genre}
                </span>
              ))}
            </div>
          )}

          <div className="featured-hero__actions">
            {canWatch ? (
              <Link to={`/watch/${active.id}?ep=1`} className="btn btn--primary">
                <Play size={16} fill="currentColor" aria-hidden="true" />
                <span>Watch Now</span>
              </Link>
            ) : (
              <Link to={`/anime/${active.id}`} className="btn btn--primary">
                <Info size={16} aria-hidden="true" />
                <span>View Release Info</span>
              </Link>
            )}

            <Link to={`/anime/${active.id}`} className="btn btn--secondary">
              <Info size={16} aria-hidden="true" />
              <span>Details</span>
            </Link>

            <button
              type="button"
              className={`btn btn--ghost${favorited ? ' btn--active-accent' : ''}`}
              aria-pressed={favorited}
              onClick={() => toggleFavorite(active)}
            >
              <Bookmark size={16} fill={favorited ? 'currentColor' : 'none'} aria-hidden="true" />
              <span>{favorited ? 'Saved' : 'Favorite'}</span>
            </button>
          </div>
        </div>

        {candidates.length > 1 && (
          <div
            className="featured-hero__switcher"
            role="tablist"
            aria-label="Featured spotlight selector"
          >
            <button
              type="button"
              className="shelf-btn"
              aria-label="Previous featured anime"
              onClick={() =>
                setActiveIndex((prev) => (prev - 1 + candidates.length) % candidates.length)
              }
            >
              <ChevronLeft size={14} aria-hidden="true" />
            </button>
            {candidates.map((entry, idx) => {
              const entryTitle = getDisplayTitle(entry.title);
              const selected = idx === activeIndex;
              return (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-label={`Feature ${entryTitle}`}
                  className={`hero-dot${selected ? ' hero-dot--active' : ''}`}
                  onClick={() => setActiveIndex(idx)}
                />
              );
            })}
            <button
              type="button"
              className="shelf-btn"
              aria-label="Next featured anime"
              onClick={() => setActiveIndex((prev) => (prev + 1) % candidates.length)}
            >
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
