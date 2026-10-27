import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AdSlot } from '../components/monetization/SponsorSlot';
import { AnimeCard } from '../components/anime/AnimeCard';
import { LibraryBackupControls } from '../components/storage/LibraryBackupControls';
import { EmptyState } from '../components/ui/StateFeedback';
import { useFavorites } from '../services/storage/favoritesStore';
import { useWatchHistory } from '../services/storage/historyStore';

export function FavoritesPage() {
  const { favorites } = useFavorites();
  const { history } = useWatchHistory();

  useEffect(() => {
    document.title = 'Favorites — Solfain';
  }, []);

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
          <h1 className="page-header__title">Favorites</h1>
          <p className="page-header__desc">
            {favorites.length > 0
              ? `${favorites.length} saved title${favorites.length === 1 ? '' : 's'} stored locally in this browser.`
              : 'Series and films you save will appear here for quick access.'}
          </p>
        </div>

        <LibraryBackupControls hasEntries={favorites.length > 0 || history.length > 0} />
      </header>

      {favorites.length === 0 ? (
        <EmptyState
          title="Your favorites list is empty"
          description="Save anime from any card, series page, or watch view to build your personal watchlist."
          action={
            <Link to="/search" className="btn btn--primary btn--compact">
              Explore Anime
            </Link>
          }
        />
      ) : (
        <div className="anime-grid">
          {favorites.map((item) => (
            <AnimeCard key={item.id} anime={item} />
          ))}
        </div>
      )}

      <div style={{ marginTop: '36px' }}>
        <AdSlot placement="collection-footer-banner" />
      </div>
    </div>
  );
}
