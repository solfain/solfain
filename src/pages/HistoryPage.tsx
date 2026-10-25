import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Play, Trash2, X } from 'lucide-react';
import { EmptyState } from '../components/ui/StateFeedback';
import { useWatchHistory } from '../services/storage/historyStore';
import {
  formatClockDuration,
  formatMediaFormat,
  formatRelativeAiredTime,
} from '../utils/format';

export function HistoryPage() {
  const { history, removeHistoryEntry, clearWatchHistory } = useWatchHistory();
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    document.title = 'Watch History — Solfain';
  }, []);

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
            <h1 className="page-header__title">Watch History</h1>
            <p className="page-header__desc">
              Recently visited episodes stored locally on this device.
            </p>
          </div>

          {history.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {confirmClear ? (
                <>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                    Clear all history?
                  </span>
                  <button
                    type="button"
                    className="btn btn--primary btn--compact"
                    onClick={() => {
                      clearWatchHistory();
                      setConfirmClear(false);
                    }}
                  >
                    Confirm Clear
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--compact"
                    onClick={() => setConfirmClear(false)}
                  >
                    Cancel
                  </button>
                </>
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
          icon={<Clock size={24} color="var(--text-muted)" aria-hidden="true" />}
          title="No watch history yet"
          description="Episodes you open on Solfain will appear here so you can quickly resume watching."
          action={
            <Link to="/" className="btn btn--primary btn--compact">
              Explore Catalogue
            </Link>
          }
        />
      ) : (
        <div className="history-list">
          {history.map((item) => {
            const watchHref = `/watch/${item.animeId}?ep=${item.episode}${
              item.audio === 'dub' ? '&audio=dub' : ''
            }`;
            const hasVerifiedProgress =
              typeof item.progressSeconds === 'number' &&
              item.progressSeconds > 0 &&
              typeof item.durationSeconds === 'number' &&
              item.durationSeconds > 0;

            return (
              <article key={item.animeId} className="history-row">
                <div className="history-row__main">
                  <Link to={`/anime/${item.animeId}`}>
                    {item.coverImage ? (
                      <img
                        src={item.coverImage}
                        alt={item.title}
                        className="history-row__poster"
                        loading="lazy"
                      />
                    ) : (
                      <div className="history-row__poster" aria-hidden="true" />
                    )}
                  </Link>

                  <div className="history-row__body">
                    <Link to={`/anime/${item.animeId}`} className="history-row__title">
                      {item.title}
                    </Link>

                    <div className="history-row__ep">
                      Episode {item.episode}
                      {item.episodeTitle ? ` — ${item.episodeTitle}` : ''}
                    </div>

                    <div className="history-row__meta">
                      <span>{item.audio.toUpperCase()}</span>
                      {item.format && (
                        <>
                          <span>·</span>
                          <span>{formatMediaFormat(item.format)}</span>
                        </>
                      )}
                      {hasVerifiedProgress && (
                        <>
                          <span>·</span>
                          <span className="tabular">
                            Progress: {formatClockDuration(item.progressSeconds)} /{' '}
                            {formatClockDuration(item.durationSeconds)}
                          </span>
                        </>
                      )}
                      <span>·</span>
                      <span>
                        Visited {formatRelativeAiredTime(Math.floor(item.visitedAt / 1000))}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="history-row__actions">
                  <Link to={watchHref} className="btn btn--primary btn--compact">
                    <Play size={14} fill="currentColor" aria-hidden="true" />
                    <span>Resume Ep {item.episode}</span>
                  </Link>

                  <Link
                    to={`/anime/${item.animeId}`}
                    className="btn btn--secondary btn--compact"
                  >
                    Details
                  </Link>

                  <button
                    type="button"
                    className="btn btn--ghost btn--compact"
                    aria-label={`Remove ${item.title} from watch history`}
                    onClick={() => removeHistoryEntry(item.animeId)}
                  >
                    <X size={15} aria-hidden="true" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
