import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Archive,
  Bookmark,
  Calendar,
  Compass,
  Film,
  History,
  Home,
  Play,
  Search,
  Shuffle,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { getSurpriseAnime, searchAnime } from '../../services/anilist/anilistService';
import { useWatchHistory } from '../../services/storage/historyStore';
import type { AnimeSummary } from '../../types/anime';
import { useDebouncedValue } from '../../utils/debounce';
import { formatMediaFormat, getDisplayTitle, getReleaseYear } from '../../utils/format';
import { sanitizeHttpUrl } from '../../utils/security';

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

interface PaletteItem {
  id: string;
  label: string;
  sublabel?: string;
  thumbnail?: string | null;
  group: 'Continue' | 'Anime Results' | 'Navigation';
  icon?:
    | 'play'
    | 'home'
    | 'browse'
    | 'seasons'
    | 'schedule'
    | 'party'
    | 'capsule'
    | 'favorites'
    | 'history'
    | 'surprise';
  onSelect: () => void | Promise<void>;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { history } = useWatchHistory();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AnimeSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const debouncedQuery = useDebouncedValue(query.trim(), 280);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setActiveIndex(0);
      return;
    }
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 10);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open || debouncedQuery.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    searchAnime({ query: debouncedQuery, page: 1, perPage: 6 }, { signal: controller.signal })
      .then((res) => {
        if (!controller.signal.aborted) {
          setResults(res.media);
          setLoading(false);
          setActiveIndex(0);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setResults([]);
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [open, debouncedQuery]);

  const items: PaletteItem[] = useMemo(() => {
    const list: PaletteItem[] = [];
    const latest = history[0];
    const q = query.trim().toLowerCase();

    if (latest && (!q || latest.title.toLowerCase().includes(q))) {
      list.push({
        id: `resume-${latest.animeId}`,
        label: `Resume ${latest.title}`,
        sublabel: `Episode ${latest.episode} · ${latest.audio.toUpperCase()}`,
        thumbnail: sanitizeHttpUrl(latest.coverImage, { httpsOnly: true }),
        group: 'Continue',
        icon: 'play',
        onSelect: () => {
          onClose();
          navigate(
            `/watch/${latest.animeId}?ep=${latest.episode}${
              latest.audio === 'dub' ? '&audio=dub' : ''
            }`,
          );
        },
      });
    }

    for (const anime of results) {
      const title = getDisplayTitle(anime.title);
      const fmt = formatMediaFormat(anime.format);
      const yr = getReleaseYear(anime);
      list.push({
        id: `anime-${anime.id}`,
        label: title,
        sublabel: [fmt, yr].filter(Boolean).join(' · ') || 'Anime',
        thumbnail: sanitizeHttpUrl(
          anime.coverImage?.medium || anime.coverImage?.large,
          { httpsOnly: true },
        ),
        group: 'Anime Results',
        onSelect: () => {
          onClose();
          navigate(`/anime/${anime.id}`);
        },
      });
    }

    const navActions: Array<{
      id: string;
      label: string;
      sublabel: string;
      icon: PaletteItem['icon'];
      action: () => void | Promise<void>;
    }> = [
      {
        id: 'nav-surprise',
        label: 'Surprise Me (Random Anime)',
        sublabel: 'Jump to a popular series from AniList',
        icon: 'surprise',
        action: async () => {
          onClose();
          try {
            const picked = await getSurpriseAnime();
            navigate(`/anime/${picked.id}`);
          } catch {
            navigate('/search');
          }
        },
      },
      {
        id: 'nav-party',
        label: 'Watch Parties (Create or Join Room)',
        sublabel: 'Private rooms, synced playback, and live room chat',
        icon: 'party',
        action: () => {
          onClose();
          navigate('/party');
        },
      },
      {
        id: 'nav-capsule',
        label: 'Anime Time Capsule',
        sublabel: 'Snapshot today’s favorites, ratings & predictions to compare later',
        icon: 'capsule',
        action: () => {
          onClose();
          navigate('/time-capsule');
        },
      },
      {
        id: 'nav-seasons',
        label: 'Seasonal Archive',
        sublabel: 'Explore Winter, Spring, Summer & Fall lineups by year',
        icon: 'seasons',
        action: () => {
          onClose();
          navigate('/seasons');
        },
      },
      {
        id: 'nav-schedule',
        label: 'Simulcast Schedule',
        sublabel: '7-day episode broadcast calendar',
        icon: 'schedule',
        action: () => {
          onClose();
          navigate('/schedule');
        },
      },
      {
        id: 'nav-browse',
        label: 'Browse & Advanced Filters',
        sublabel: 'Filter by genre, format, season, year, and score',
        icon: 'browse',
        action: () => {
          onClose();
          navigate(q ? `/search?q=${encodeURIComponent(query.trim())}` : '/search');
        },
      },
      {
        id: 'nav-favorites',
        label: 'Favorites & Watchlist',
        sublabel: 'Manage Watching, Plan to Watch, Completed & saved titles',
        icon: 'favorites',
        action: () => {
          onClose();
          navigate('/favorites');
        },
      },
      {
        id: 'nav-history',
        label: 'Watch History',
        sublabel: 'Recently watched episodes and playback timestamps',
        icon: 'history',
        action: () => {
          onClose();
          navigate('/history');
        },
      },
      {
        id: 'nav-home',
        label: 'Home Spotlight',
        sublabel: 'Trending, seasonal, and recommended anime',
        icon: 'home',
        action: () => {
          onClose();
          navigate('/');
        },
      },
    ];

    for (const nav of navActions) {
      if (
        !q ||
        nav.label.toLowerCase().includes(q) ||
        nav.sublabel.toLowerCase().includes(q) ||
        nav.id === 'nav-browse'
      ) {
        list.push({
          id: nav.id,
          label:
            nav.id === 'nav-browse' && q
              ? `Search full catalogue for “${query.trim()}”`
              : nav.label,
          sublabel: nav.sublabel,
          group: 'Navigation',
          icon: nav.icon,
          onSelect: nav.action,
        });
      }
    }

    return list;
  }, [history, navigate, onClose, query, results]);

  useEffect(() => {
    if (activeIndex >= items.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, items.length]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((prev) => (items.length > 0 ? (prev + 1) % items.length : 0));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((prev) =>
          items.length > 0 ? (prev - 1 + items.length) % items.length : 0,
        );
      } else if (event.key === 'Enter' && items[activeIndex]) {
        event.preventDefault();
        void items[activeIndex].onSelect();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeIndex, items, onClose, open]);

  if (!open) return null;

  const renderIcon = (icon: PaletteItem['icon']) => {
    switch (icon) {
      case 'play':
        return <Play size={14} fill="currentColor" aria-hidden="true" />;
      case 'surprise':
        return <Shuffle size={14} aria-hidden="true" />;
      case 'seasons':
        return <Sparkles size={14} aria-hidden="true" />;
      case 'schedule':
        return <Calendar size={14} aria-hidden="true" />;
      case 'party':
        return <Users size={14} aria-hidden="true" />;
      case 'capsule':
        return <Archive size={14} aria-hidden="true" />;
      case 'browse':
        return <Compass size={14} aria-hidden="true" />;
      case 'favorites':
        return <Bookmark size={14} aria-hidden="true" />;
      case 'history':
        return <History size={14} aria-hidden="true" />;
      case 'home':
        return <Home size={14} aria-hidden="true" />;
      default:
        return <Film size={14} aria-hidden="true" />;
    }
  };

  return (
    <div
      className="cmd-palette-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Quick command palette"
      onClick={onClose}
    >
      <div className="cmd-palette" onClick={(e) => e.stopPropagation()}>
        <div className="cmd-palette__input-row">
          <Search size={16} className="cmd-palette__search-icon" aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            className="cmd-palette__input"
            placeholder="Jump to anime title, season, schedule, or watchlist..."
            aria-label="Command palette search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
          />
          <button
            type="button"
            className="cmd-palette__close"
            aria-label="Close command palette"
            onClick={onClose}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>

        <div className="cmd-palette__list" role="listbox" aria-label="Quick commands">
          {loading && results.length === 0 && (
            <div className="cmd-palette__status">Searching AniList…</div>
          )}

          {items.map((item, idx) => {
            const isSelected = idx === activeIndex;
            const prevGroup = idx > 0 ? items[idx - 1]?.group : null;
            const showGroupHeader = item.group !== prevGroup;

            return (
              <div key={item.id}>
                {showGroupHeader && (
                  <div className="cmd-palette__group-title">{item.group}</div>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`cmd-palette__item${
                    isSelected ? ' cmd-palette__item--active' : ''
                  }`}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => void item.onSelect()}
                >
                  {item.thumbnail ? (
                    <img
                      src={item.thumbnail}
                      alt=""
                      className="cmd-palette__thumb"
                    />
                  ) : (
                    <span className="cmd-palette__icon-box">{renderIcon(item.icon)}</span>
                  )}

                  <span className="cmd-palette__item-body">
                    <span className="cmd-palette__item-label">{item.label}</span>
                    {item.sublabel && (
                      <span className="cmd-palette__item-sub">{item.sublabel}</span>
                    )}
                  </span>
                </button>
              </div>
            );
          })}
        </div>

        <div className="cmd-palette__footer">
          <span>↑↓ Navigate</span>
          <span>↵ Open</span>
          <span>Esc Close</span>
        </div>
      </div>
    </div>
  );
}
