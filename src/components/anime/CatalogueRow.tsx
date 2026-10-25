import { useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface CatalogueRowProps {
  title: string;
  subtitle?: string;
  viewAllHref?: string;
  viewAllLabel?: string;
  wideCards?: boolean;
  children: ReactNode;
}

export function CatalogueRow({
  title,
  subtitle,
  viewAllHref,
  viewAllLabel = 'View all',
  wideCards = false,
  children,
}: CatalogueRowProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);

  const scrollShelf = (direction: -1 | 1) => {
    const el = trackRef.current;
    if (!el) return;
    const distance = Math.max(260, Math.floor(el.clientWidth * 0.78)) * direction;
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({
      left: distance,
      behavior: reduced ? 'auto' : 'smooth',
    });
  };

  return (
    <section className="catalogue-section" aria-label={title}>
      <div className="section-header">
        <div className="section-header__titles">
          <h2 className="section-title">{title}</h2>
          {subtitle && <span className="section-subtitle">{subtitle}</span>}
        </div>

        <div className="section-controls">
          {viewAllHref && (
            <Link to={viewAllHref} className="section-link">
              <span>{viewAllLabel}</span>
              <ChevronRight size={14} aria-hidden="true" />
            </Link>
          )}
          <button
            type="button"
            className="shelf-btn"
            aria-label={`Scroll ${title} left`}
            onClick={() => scrollShelf(-1)}
          >
            <ChevronLeft size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="shelf-btn"
            aria-label={`Scroll ${title} right`}
            onClick={() => scrollShelf(1)}
          >
            <ChevronRight size={15} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div
        ref={trackRef}
        className={`shelf-track${wideCards ? ' shelf-track--wide' : ''}`}
      >
        {children}
      </div>
    </section>
  );
}
