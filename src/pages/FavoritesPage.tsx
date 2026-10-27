import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Film, Minus, Play, Plus, Search, Trash2, X } from 'lucide-react';
import { AdSlot } from '../components/monetization/SponsorSlot';
import { AnimeCard } from '../components/anime/AnimeCard';
import { LibraryBackupControls } from '../components/storage/LibraryBackupControls';
import { EmptyState } from '../components/ui/StateFeedback';
import { useFavorites } from '../services/storage/favoritesStore';
import { useWatchHistory } from '../services/storage/historyStore';
import {
  useWatchlist,
  WATCHLIST_STATUS_LABELS,
} from '../services/storage/watchlistStore';
import type { WatchlistStatus } from '../types/storage';
import { formatMediaFormat } from '../utils/format';
import { sanitizeHttpUrl } from '../utils/security';

type LibraryTab = 'favorites' | 'all_tracked' | WatchlistStatus;

const WATCHLIST_STATUSES: WatchlistStatus[] = [
  'watching',
  'plan_to_watch',
  'completed',
  'on_hold',
  'dropped',
];

export function FavoritesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { favorites } = useFavorites();
  const { history } = useWatchHistory();
  const { watchlist, updateWatchlistDetails, removeWatchlistEntry } = useWatchlist();
  const [filterText, setFilterText] = useState('');

  const rawTab = searchParams.get('tab') ?? '';
  const defaultTab: LibraryTab =
    favorites.length === 0 && watchlist.length > 0 ? 'all_tracked' : 'favorites';
  const activeTab: LibraryTab =
    rawTab === 'favorites' ||
    rawTab === 'all_tracked' ||
    WATCHLIST_STATUSES.includes(rawTab as WatchlistStatus)
      ? (rawTab as LibraryTab)
      : defaultTab;

  useEffect(() => {
    document.title = 'Favorites & Watchlist — Solfain';
  }, []);

  const countsByStatus = useMemo(() => {
    const counts: Record<WatchlistStatus, number> = {
      watching: 0,
      plan_to_watch: 0,
      completed: 0,
      on_hold: 0,
      dropped: 0,
    };
    for (const entry of watchlist) {
      counts[entry.status] += 1;
    }
    return counts;
  }, [watchlist]);

  const query = filterText.trim().toLowerCase();

  const filteredFavorites = useMemo(
    () =>
      query
        ? favorites.filter(
            (f) =>
              f.title.toLowerCase().includes(query) ||
              (f.romajiTitle && f.romajiTitle.toLowerCase().includes(query)),
          )
        : favorites,
    [favorites, query],
  );

  const filteredWatchlist = useMemo(() => {
    const byStatus =
      activeTab === 'all_tracked' || activeTab === 'favorites'
        ? watchlist
        : watchlist.filter((w) => w.status === activeTab);

    if (!query) return byStatus;
    return byStatus.filter(
      (w) =>
        w.title.toLowerCase().includes(query) ||
        (w.romajiTitle && w.romajiTitle.toLowerCase().includes(query)),
    );
  }, [activeTab, query, watchlist]);

  const setTab = (tab: LibraryTab) => {
    const next = new URLSearchParams(searchParams);
    if (tab === 'favorites') {
      next.delete('tab');
    } else {
      next.set('tab', tab);
    }
    setSearchParams(next, { replace: true });
  };

  const hasAnyData =
    favorites.length > 0 || watchlist.length > 0 || history.length > 0;

  return (
    <div className="container">
      <header
        className="page-header"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '14px',
        }}
      >
        <div>
          <h1 className="page-header__title">Favorites & Watchlist</h1>
          <p className="page-header__desc">
            Organize bookmarked favorites, track episode progress, and score series locally.
          </p>
        </div>

        <LibraryBackupControls hasEntries={hasAnyData} />
      </header>

      <div className="library-toolbar">
        <div className="library-tabs" role="tablist" aria-label="Library sections">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'favorites'}
            className={`library-tab${activeTab === 'favorites' ? ' library-tab--active' : ''}`}
            onClick={() => setTab('favorites')}
          >
            <span>Favorites</span>
            <span className="library-tab__count tabular">{favorites.length}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'all_tracked'}
            className={`library-tab${
              activeTab === 'all_tracked' ? ' library-tab--active' : ''
            }`}
            onClick={() => setTab('all_tracked')}
          >
            <span>All Watchlist</span>
            <span className="library-tab__count tabular">{watchlist.length}</span>
          </button>

          {WATCHLIST_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              role="tab"
              aria-selected={activeTab === status}
              className={`library-tab${activeTab === status ? ' library-tab--active' : ''}`}
              onClick={() => setTab(status)}
            >
              <span>{WATCHLIST_STATUS_LABELS[status]}</span>
              <span className="library-tab__count tabular">{countsByStatus[status]}</span>
            </button>
          ))}
        </div>

        {(favorites.length > 4 || watchlist.length > 4) && (
          <div className="search-input-wrap" style={{ minWidth: '220px' }}>
            <Search size={14} className="search-input-wrap__icon" aria-hidden="true" />
            <input
              type="search"
              className="field-input"
              style={{ height: '34px', fontSize: '0.8125rem' }}
              placeholder="Filter library..."
              aria-label="Filter saved anime"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
            />
            {filterText && (
              <button
                type="button"
                className="search-input-wrap__clear"
                aria-label="Clear filter"
                onClick={() => setFilterText('')}
              >
                <X size={13} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>

      {activeTab === 'favorites' ? (
        filteredFavorites.length === 0 ? (
          <EmptyState
            title={query ? 'No matching favorites' : 'Your favorites list is empty'}
            description={
              query
                ? 'Try clearing your library filter text.'
                : 'Save anime from any card, series page, or watch view to build your personal collection.'
            }
            action={
              !query ? (
                <Link to="/search" className="btn btn--primary btn--compact">
                  Explore Anime
                </Link>
              ) : undefined
            }
          />
        ) : (
          <div className="anime-grid">
            {filteredFavorites.map((item) => (
              <AnimeCard key={item.id} anime={item} />
            ))}
          </div>
        )
      ) : filteredWatchlist.length === 0 ? (
        <EmptyState
          title={
            query
              ? 'No matching watchlist titles'
              : activeTab === 'all_tracked'
                ? 'No titles tracked in your watchlist yet'
                : `No titles marked "${WATCHLIST_STATUS_LABELS[activeTab]}"`
          }
          description="Use the Track Status selector on any anime details or watch page to track Watching, Plan to Watch, Completed, On Hold, or Dropped titles."
          action={
            <Link to="/seasons" className="btn btn--primary btn--compact">
              Browse Seasonal Lineup
            </Link>
          }
        />
      ) : (
        <div className="watchlist-rows">
          {filteredWatchlist.map((entry) => {
            const coverUrl = sanitizeHttpUrl(entry.coverImage, { httpsOnly: true });
            const fmt = formatMediaFormat(entry.format);
            const nextEp = entry.episodes
              ? Math.min(entry.episodes, Math.max(1, entry.watchedEpisodes + 1))
              : Math.max(1, entry.watchedEpisodes + 1);

            return (
              <article key={entry.id} className="watchlist-row">
                <Link to={`/anime/${entry.id}`} className="watchlist-row__media">
                  {coverUrl ? (
                    <img
                      src={coverUrl}
                      alt=""
                      className="watchlist-row__poster"
                      loading="lazy"
                    />
                  ) : (
                    <div className="watchlist-row__poster watchlist-row__poster--fallback">
                      <Film size={15} aria-hidden="true" />
                    </div>
                  )}

                  <div className="watchlist-row__info">
                    <h2 className="watchlist-row__title">{entry.title}</h2>
                    <div className="watchlist-row__meta">
                      {fmt && <span>{fmt}</span>}
                      {entry.seasonYear && (
                        <span className="tabular">{entry.seasonYear}</span>
                      )}
                      {entry.episodes && (
                        <span className="tabular">{entry.episodes} eps</span>
                      )}
                    </div>
                  </div>
                </Link>

                <div className="watchlist-row__controls">
                  <select
                    className="field-select watchlist-row__select"
                    aria-label={`Status for ${entry.title}`}
                    value={entry.status}
                    onChange={(e) =>
                      updateWatchlistDetails(entry.id, {
                        status: e.target.value as WatchlistStatus,
                      })
                    }
                  >
                    {WATCHLIST_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {WATCHLIST_STATUS_LABELS[st]}
                      </option>
                    ))}
                  </select>

                  <div
                    className="watchlist-ep-stepper"
                    aria-label={`Episodes watched for ${entry.title}`}
                  >
                    <button
                      type="button"
                      className="watchlist-ep-stepper__btn"
                      aria-label={`Decrease watched episodes for ${entry.title}`}
                      disabled={entry.watchedEpisodes <= 0}
                      onClick={() =>
                        updateWatchlistDetails(entry.id, {
                          watchedEpisodes: Math.max(0, entry.watchedEpisodes - 1),
                        })
                      }
                    >
                      <Minus size={12} aria-hidden="true" />
                    </button>
                    <span className="watchlist-ep-stepper__label tabular">
                      {entry.watchedEpisodes} / {entry.episodes ?? '?'}
                    </span>
                    <button
                      type="button"
                      className="watchlist-ep-stepper__btn"
                      aria-label={`Increase watched episodes for ${entry.title}`}
                      disabled={
                        entry.episodes !== null && entry.watchedEpisodes >= entry.episodes
                      }
                      onClick={() =>
                        updateWatchlistDetails(entry.id, {
                          watchedEpisodes: entry.watchedEpisodes + 1,
                        })
                      }
                    >
                      <Plus size={12} aria-hidden="true" />
                    </button>
                  </div>

                  <select
                    className="field-select watchlist-row__score"
                    aria-label={`Personal score for ${entry.title}`}
                    value={entry.personalScore ? String(entry.personalScore) : ''}
                    onChange={(e) => {
                      const val = Number.parseInt(e.target.value, 10);
                      updateWatchlistDetails(entry.id, {
                        personalScore: Number.isInteger(val) ? val : null,
                      });
                    }}
                  >
                    <option value="">Score —</option>
                    {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((s) => (
                      <option key={s} value={String(s)}>
                        {s} / 10
                      </option>
                    ))}
                  </select>

                  <Link
                    to={`/watch/${entry.id}?ep=${nextEp}`}
                    className="btn btn--primary btn--compact"
                  >
                    <Play size={13} fill="currentColor" aria-hidden="true" />
                    <span>Ep {nextEp}</span>
                  </Link>

                  <button
                    type="button"
                    className="btn btn--ghost btn--compact"
                    aria-label={`Remove ${entry.title} from watchlist`}
                    onClick={() => removeWatchlistEntry(entry.id)}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: '36px' }}>
        <AdSlot placement="collection-footer-banner" />
      </div>
    </div>
  );
}
