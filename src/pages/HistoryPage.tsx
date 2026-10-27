import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Film, Play, Trash2 } from 'lucide-react';
import { AdSlot } from '../components/monetization/SponsorSlot';
import { LibraryBackupControls } from '../components/storage/LibraryBackupControls';
import { EmptyState } from '../components/ui/StateFeedback';
import { useFavorites } from '../services/storage/favoritesStore';
import { useWatchHistory } from '../services/storage/historyStore';
import { formatClockDuration, formatRelativeAiredTime } from '../utils/format';
import { sanitizeHttpUrl } from '../utils/security';

export function HistoryPage() {
  const { history, removeHistoryEntry, clearWatchHistory } = useWatchHistory();
  const { favorites } = useFavorites();
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    document.title = 'Watch History — Solfain';
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
          <h1 className="page-header__title">Watch History</h1>
          <p className="page-header__desc">
            Resume recently opened episodes. Stored locally on this device.
          </p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
          <LibraryBackupControls hasEntries={history.length > 0 || favorites.length > 0} />

          {history.length > 0 && (
            <div>
              {confirmClear ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                    Clear all history?
                  </span>
                  <button
                    type="button"
                    className="btn btn--secondary btn--compact"
                    onClick={() => {
                      clearWatchHistory();
                      setConfirmClear(false);
                    }}
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--compact"
                    onClick={() => setConfirmClear(false)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn--ghost btn--compact"
                  onClick={() => setConfirmClear(true)}
                >
                  <Trash2 size={14} aria-hidden="true" />
                  <span>Clear History</span>
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {history.length === 0 ? (
        <EmptyState
          title="No watch history yet"
          description="Episodes you open on the watch page are automatically saved here so you can pick up where you left off."
          action={
            <Link to="/" className="btn btn--primary btn--compact">
              Discover Trending Anime
            </Link>
          }
        />
      ) : (
        <div className="history-list">
          {history.map((item) => {
            const watchUrl = `/watch/${item.animeId}?ep=${item.episode}${
              item.audio === 'dub' ? '&audio=dub' : ''
            }`;
            const relativeVisited = formatRelativeAiredTime(Math.floor(item.visitedAt / 1000));
            const verifiedClock = formatClockDuration(item.progressSeconds);
            const verifiedTotal = formatClockDuration(item.durationSeconds);
            const coverUrl = sanitizeHttpUrl(item.coverImage, { httpsOnly: true });

            return (
              <article key={item.animeId} className="history-row">
                <div className="history-row__main">
                  <Link to={`/anime/${item.animeId}`} aria-label={`Details for ${item.title}`}>
                    {coverUrl ? (
                      <img
                        src={coverUrl}
                        alt=""
                        className="history-row__poster"
                        loading="lazy"
                      />
                    ) : (
                      <div
                        className="history-row__poster"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'var(--text-muted)',
                        }}
                      >
                        <Film size={16} aria-hidden="true" />
                      </div>
                    )}
                  </Link>

                  <div className="history-row__body">
                    <Link to={`/anime/${item.animeId}`} className="history-row__title">
                      {item.title}
                    </Link>

                    <div className="history-row__ep">
                      Episode {item.episode}
                      {item.totalEpisodes ? ` of ${item.totalEpisodes}` : ''}
                      {item.episodeTitle ? ` — ${item.episodeTitle}` : ''}
                    </div>

                    <div className="history-row__meta">
                      <span>{item.audio.toUpperCase()}</span>
                      <span aria-hidden="true">·</span>
                      <span>Opened {relativeVisited}</span>
                      {verifiedClock && verifiedTotal && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="tabular">
                            {verifiedClock} / {verifiedTotal}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="history-row__actions">
                  <Link to={watchUrl} className="btn btn--primary btn--compact">
                    <Play size={14} fill="currentColor" aria-hidden="true" />
                    <span>Resume Ep {item.episode}</span>
                  </Link>
                  <button
                    type="button"
                    className="btn btn--ghost btn--compact"
                    aria-label={`Remove ${item.title} from watch history`}
                    onClick={() => removeHistoryEntry(item.animeId)}
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
