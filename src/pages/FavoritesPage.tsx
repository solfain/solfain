import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark } from 'lucide-react';
import { AnimeCard } from '../components/anime/AnimeCard';
import { EmptyState } from '../components/ui/StateFeedback';
import { useFavorites } from '../services/storage/favoritesStore';

type FavoriteSort = 'recent' | 'title' | 'score';

export function FavoritesPage() {
  const { favorites } = useFavorites();
  const [sortBy, setSortBy] = useState<FavoriteSort>('recent');

  useEffect(() => {
    document.title = 'Favorites — Solfain';
  }, []);

  const sortedFavorites = useMemo(() => {
    const copy = [...favorites];
    if (sortBy === 'title') {
      copy.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === 'score') {
      copy.sort((a, b) => (b.averageScore ?? 0) - (a.averageScore ?? 0));
    } else {
      copy.sort((a, b) => b.addedAt - a.addedAt);
    }
    return copy;
  }, [favorites, sortBy]);

  return (
    <div className="container">
      <header className="page-header">
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
          }}
        >
          <div>
            <h1 className="page-header__title">Favorites</h1>
            <p className="page-header__desc">
              {favorites.length === 0
                ? 'Save series and films to keep them accessible across visits.'
                : `${favorites.length} saved ${favorites.length === 1 ? 'title' : 'titles'} stored locally in this browser.`}
            </p>
          </div>

          {favorites.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label htmlFor="favorites-sort" className="field-label">
                Sort
              </label>
              <select
                id="favorites-sort"
                className="field-select"
                style={{ width: '164px', height: '34px' }}
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as FavoriteSort)}
              >
                <option value="recent">Recently Added</option>
                <option value="title">Title (A–Z)</option>
                <option value="score">Highest Score</option>
              </select>
            </div>
          )}
        </div>
      </header>

      {sortedFavorites.length === 0 ? (
        <EmptyState
          icon={<Bookmark size={24} color="var(--text-muted)" aria-hidden="true" />}
          title="Your favorites list is empty"
          description="Bookmark any anime from the homepage, search results, or details page to build your personal watchlist without an account."
          action={
            <Link to="/search" className="btn btn--primary btn--compact">
              Browse Anime
            </Link>
          }
        />
      ) : (
        <div className="anime-grid">
          {sortedFavorites.map((item) => (
            <AnimeCard key={item.id} anime={item} />
          ))}
        </div>
      )}
    </div>
  );
}
