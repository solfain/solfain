import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Menu, Search, Terminal, X } from 'lucide-react';
import { CommandPalette } from './CommandPalette';
import { searchAnime } from '../../services/anilist/anilistService';
import { useFavorites } from '../../services/storage/favoritesStore';
import { useWatchHistory } from '../../services/storage/historyStore';
import { useWatchlist } from '../../services/storage/watchlistStore';
import {
  getDueReminderCapsules,
  useTimeCapsules,
} from '../../services/timeCapsule/timeCapsuleStore';
import type { AnimeSummary } from '../../types/anime';
import { useDebouncedValue } from '../../utils/debounce';
import { formatMediaFormat, getDisplayTitle, getReleaseYear } from '../../utils/format';
import { sanitizeHttpUrl } from '../../utils/security';

export function SolfainLogo() {
  return (
    <svg
      className="brand-logo__mark"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="6" fill="#141418" />
      <rect x="0.75" y="0.75" width="30.5" height="30.5" rx="5.25" stroke="#2D2D35" strokeWidth="1.5" />
      <path d="M8.5 11.5L16.5 7L23.5 11.5V15.5L15.5 11L8.5 15.5V11.5Z" fill="#F5F5F7" />
      <path d="M8.5 16.5L16.5 21L23.5 16.5V20.5L15.5 25L8.5 20.5V16.5Z" fill="#8B5CF6" />
    </svg>
  );
}

export function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const { favorites } = useFavorites();
  const { watchlist } = useWatchlist();
  const { history } = useWatchHistory();
  const { capsules } = useTimeCapsules();
  const dueCapsuleCount = useMemo(
    () => getDueReminderCapsules(capsules).length,
    [capsules],
  );

  const [quickQuery, setQuickQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<AnimeSummary[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileQuery, setMobileQuery] = useState('');
  const [paletteOpen, setPaletteOpen] = useState(false);

  const savedLibraryCount = useMemo(() => {
    const ids = new Set<number>();
    favorites.forEach((f) => ids.add(f.id));
    watchlist.forEach((w) => ids.add(w.id));
    return ids.size;
  }, [favorites, watchlist]);

  const debouncedQuery = useDebouncedValue(quickQuery.trim(), 360);
  const searchWrapRef = useRef<HTMLDivElement | null>(null);
  const desktopInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setMobileMenuOpen(false);
    setDropdownOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setDropdownOpen(false);
        setPaletteOpen((prev) => !prev);
        return;
      }
      if (
        event.key === '/' &&
        !paletteOpen &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        document.activeElement?.tagName !== 'SELECT'
      ) {
        event.preventDefault();
        desktopInputRef.current?.focus();
      } else if (event.key === 'Escape') {
        setDropdownOpen(false);
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [paletteOpen]);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    if (debouncedQuery.length < 2 || location.pathname === '/search') {
      setSuggestions([]);
      setLoadingSuggestions(false);
      return;
    }

    const controller = new AbortController();
    setLoadingSuggestions(true);

    searchAnime({ query: debouncedQuery, perPage: 5, page: 1 }, { signal: controller.signal })
      .then((res) => {
        if (!controller.signal.aborted) {
          setSuggestions(res.media);
          setLoadingSuggestions(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSuggestions([]);
          setLoadingSuggestions(false);
        }
      });

    return () => controller.abort();
  }, [debouncedQuery, location.pathname]);

  const handleDesktopSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = quickQuery.trim();
    setDropdownOpen(false);
    navigate(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : '/search');
  };

  const handleMobileSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = mobileQuery.trim();
    setMobileMenuOpen(false);
    navigate(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : '/search');
  };

  return (
    <header className="site-header">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      <div className="container site-header__inner">
        <div className="site-header__left">
          <Link to="/" className="brand-logo" aria-label="Solfain Home">
            <SolfainLogo />
            <span>SOLFAIN</span>
          </Link>

          <nav className="primary-nav" aria-label="Main navigation">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `primary-nav__link${isActive ? ' primary-nav__link--active' : ''}`
              }
            >
              Home
            </NavLink>
            <NavLink
              to="/search"
              className={({ isActive }) =>
                `primary-nav__link${isActive ? ' primary-nav__link--active' : ''}`
              }
            >
              Browse
            </NavLink>
            <NavLink
              to="/seasons"
              className={({ isActive }) =>
                `primary-nav__link${isActive ? ' primary-nav__link--active' : ''}`
              }
            >
              Seasons
            </NavLink>
            <NavLink
              to="/schedule"
              className={({ isActive }) =>
                `primary-nav__link${isActive ? ' primary-nav__link--active' : ''}`
              }
            >
              Schedule
            </NavLink>
            <NavLink
              to="/party"
              className={({ isActive }) =>
                `primary-nav__link${isActive ? ' primary-nav__link--active' : ''}`
              }
            >
              Watch Party
            </NavLink>
            <NavLink
              to="/time-capsule"
              className={({ isActive }) =>
                `primary-nav__link${isActive ? ' primary-nav__link--active' : ''}`
              }
            >
              <span>Time Capsule</span>
              {dueCapsuleCount > 0 && (
                <span className="nav-count nav-count--due" title="Time Capsule ready to unseal">
                  {dueCapsuleCount}
                </span>
              )}
            </NavLink>
            <NavLink
              to="/favorites"
              className={({ isActive }) =>
                `primary-nav__link${isActive ? ' primary-nav__link--active' : ''}`
              }
            >
              <span>Favorites</span>
              {savedLibraryCount > 0 && <span className="nav-count">{savedLibraryCount}</span>}
            </NavLink>
            <NavLink
              to="/history"
              className={({ isActive }) =>
                `primary-nav__link${isActive ? ' primary-nav__link--active' : ''}`
              }
            >
              <span>Watch History</span>
              {history.length > 0 && <span className="nav-count">{history.length}</span>}
            </NavLink>
          </nav>
        </div>

        <div className="site-header__right">
          <div className="header-search" ref={searchWrapRef}>
            <form className="header-search__form" onSubmit={handleDesktopSubmit} role="search">
              <Search size={15} className="header-search__icon" aria-hidden="true" />
              <input
                ref={desktopInputRef}
                type="search"
                className="header-search__input"
                placeholder="Search anime..."
                aria-label="Quick search anime"
                value={quickQuery}
                onFocus={() => setDropdownOpen(true)}
                onChange={(e) => {
                  setQuickQuery(e.target.value);
                  setDropdownOpen(true);
                }}
              />
              {!quickQuery && <span className="header-search__kbd">/</span>}
            </form>

            {dropdownOpen && debouncedQuery.length >= 2 && location.pathname !== '/search' && (
              <div className="header-search__dropdown" role="region" aria-label="Search suggestions">
                {loadingSuggestions && suggestions.length === 0 ? (
                  <div style={{ padding: '12px', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                    Searching AniList…
                  </div>
                ) : suggestions.length > 0 ? (
                  <>
                    {suggestions.map((anime) => {
                      const title = getDisplayTitle(anime.title);
                      const year = getReleaseYear(anime);
                      const fmt = formatMediaFormat(anime.format);
                      const img =
                        sanitizeHttpUrl(anime.coverImage?.medium || anime.coverImage?.large, {
                          httpsOnly: true,
                        }) ?? '';
                      return (
                        <Link
                          key={anime.id}
                          to={`/anime/${anime.id}`}
                          className="header-search__item"
                          onClick={() => setDropdownOpen(false)}
                        >
                          {img ? (
                            <img src={img} alt="" className="header-search__thumb" loading="lazy" />
                          ) : (
                            <div className="header-search__thumb" aria-hidden="true" />
                          )}
                          <div className="header-search__meta">
                            <div className="header-search__title">{title}</div>
                            <div className="header-search__sub">
                              {[fmt, year].filter(Boolean).join(' · ') || 'Anime'}
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                    <Link
                      to={`/search?q=${encodeURIComponent(quickQuery.trim())}`}
                      className="header-search__footer"
                      onClick={() => setDropdownOpen(false)}
                    >
                      View all results for “{quickQuery.trim()}”
                    </Link>
                  </>
                ) : (
                  <div style={{ padding: '12px', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                    No matches found for “{debouncedQuery}”
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            className="header-cmd-btn"
            aria-label="Open command palette (Ctrl+K)"
            title="Command Palette (Ctrl+K)"
            onClick={() => setPaletteOpen(true)}
          >
            <Terminal size={13} aria-hidden="true" />
            <span className="header-cmd-btn__kbd">⌘K</span>
          </button>

          <Link
            to="/search"
            className="mobile-icon-btn"
            aria-label="Open search page"
          >
            <Search size={18} aria-hidden="true" />
          </Link>

          <button
            type="button"
            className="mobile-icon-btn"
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((prev) => !prev)}
          >
            {mobileMenuOpen ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="mobile-drawer">
          <form className="mobile-drawer__search" onSubmit={handleMobileSubmit} role="search">
            <div className="search-input-wrap">
              <Search size={15} className="search-input-wrap__icon" aria-hidden="true" />
              <input
                type="search"
                className="field-input"
                placeholder="Search anime titles..."
                aria-label="Search anime titles"
                value={mobileQuery}
                onChange={(e) => setMobileQuery(e.target.value)}
              />
            </div>
          </form>

          <nav className="mobile-drawer__nav" aria-label="Mobile navigation">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `mobile-drawer__link${isActive ? ' mobile-drawer__link--active' : ''}`
              }
            >
              <span>Home</span>
            </NavLink>
            <NavLink
              to="/search"
              className={({ isActive }) =>
                `mobile-drawer__link${isActive ? ' mobile-drawer__link--active' : ''}`
              }
            >
              <span>Browse</span>
            </NavLink>
            <NavLink
              to="/seasons"
              className={({ isActive }) =>
                `mobile-drawer__link${isActive ? ' mobile-drawer__link--active' : ''}`
              }
            >
              <span>Seasons</span>
            </NavLink>
            <NavLink
              to="/schedule"
              className={({ isActive }) =>
                `mobile-drawer__link${isActive ? ' mobile-drawer__link--active' : ''}`
              }
            >
              <span>Schedule</span>
            </NavLink>
            <NavLink
              to="/party"
              className={({ isActive }) =>
                `mobile-drawer__link${isActive ? ' mobile-drawer__link--active' : ''}`
              }
            >
              <span>Watch Party</span>
            </NavLink>
            <NavLink
              to="/time-capsule"
              className={({ isActive }) =>
                `mobile-drawer__link${isActive ? ' mobile-drawer__link--active' : ''}`
              }
            >
              <span>Time Capsule</span>
              {dueCapsuleCount > 0 && (
                <span className="nav-count nav-count--due">{dueCapsuleCount}</span>
              )}
            </NavLink>
            <NavLink
              to="/favorites"
              className={({ isActive }) =>
                `mobile-drawer__link${isActive ? ' mobile-drawer__link--active' : ''}`
              }
            >
              <span>Favorites & Watchlist</span>
              {savedLibraryCount > 0 && <span className="nav-count">{savedLibraryCount}</span>}
            </NavLink>
            <NavLink
              to="/history"
              className={({ isActive }) =>
                `mobile-drawer__link${isActive ? ' mobile-drawer__link--active' : ''}`
              }
            >
              <span>History</span>
              {history.length > 0 && <span className="nav-count">{history.length}</span>}
            </NavLink>
          </nav>
        </div>
      )}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </header>
  );
}
