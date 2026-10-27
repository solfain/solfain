import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Clock, Film, Play, Star } from 'lucide-react';
import { AdSlot } from '../components/monetization/SponsorSlot';
import { EmptyState, ErrorState } from '../components/ui/StateFeedback';
import { getWeeklyAiringSchedule } from '../services/anilist/anilistService';
import type { AiringScheduleEntry } from '../types/anime';
import {
  formatMediaFormat,
  formatScore,
  formatTimeUntilAiring,
  getDisplayTitle,
  getMainStudioName,
} from '../utils/format';
import { sanitizeHttpUrl } from '../utils/security';

interface ScheduleDayBucket {
  key: string;
  label: string;
  shortDate: string;
  isToday: boolean;
  entries: AiringScheduleEntry[];
}

function getLocalDayKey(date: Date): string {
  const yr = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const da = String(date.getDate()).padStart(2, '0');
  return `${yr}-${mo}-${da}`;
}

export function SchedulePage() {
  const [entries, setEntries] = useState<AiringScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedDayKey, setSelectedDayKey] = useState<string>(() => getLocalDayKey(new Date()));
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    document.title = 'Airing Schedule — Solfain';
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const loadSchedule = useCallback(async (bypassCache = false, signal?: AbortSignal) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const list = await getWeeklyAiringSchedule({ bypassCache, signal });
      if (signal?.aborted) return;
      setEntries(list);
    } catch (err) {
      if (err && typeof err === 'object' && 'name' in err && err.name === 'AbortError') {
        return;
      }
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to fetch airing schedule from AniList.',
      );
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadSchedule(false, controller.signal);
    return () => controller.abort();
  }, [loadSchedule]);

  const dayBuckets: ScheduleDayBucket[] = useMemo(() => {
    const today = new Date();
    const buckets: ScheduleDayBucket[] = [];
    const byKey = new Map<string, AiringScheduleEntry[]>();

    for (let offset = 0; offset < 7; offset += 1) {
      const date = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() + offset,
        0,
        0,
        0,
        0,
      );
      const key = getLocalDayKey(date);
      byKey.set(key, []);
      buckets.push({
        key,
        label:
          offset === 0
            ? 'Today'
            : offset === 1
              ? 'Tomorrow'
              : date.toLocaleDateString('en-US', { weekday: 'short' }),
        shortDate: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        isToday: offset === 0,
        entries: [],
      });
    }

    for (const item of entries) {
      const itemDate = new Date(item.airingAt * 1000);
      const key = getLocalDayKey(itemDate);
      const target = byKey.get(key);
      if (target) {
        target.push(item);
      }
    }

    return buckets.map((bucket) => ({
      ...bucket,
      entries: byKey.get(bucket.key) ?? [],
    }));
  }, [entries]);

  const activeBucket =
    dayBuckets.find((b) => b.key === selectedDayKey) ?? dayBuckets[0] ?? null;

  const nowSeconds = Math.floor(nowMs / 1000);

  return (
    <div className="container">
      <header className="page-header">
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div>
            <h1 className="page-header__title">Simulcast Schedule</h1>
            <p className="page-header__desc">
              7-day episode broadcast calendar converted to your local timezone.
            </p>
          </div>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.78125rem',
              color: 'var(--text-muted)',
            }}
          >
            <Calendar size={14} aria-hidden="true" />
            <span>Times shown in local time</span>
          </span>
        </div>
      </header>

      <div className="schedule-day-tabs" role="tablist" aria-label="Broadcast days">
        {dayBuckets.map((bucket) => {
          const isSelected = bucket.key === activeBucket?.key;
          return (
            <button
              key={bucket.key}
              type="button"
              role="tab"
              aria-selected={isSelected}
              className={`schedule-day-tab${isSelected ? ' schedule-day-tab--active' : ''}`}
              onClick={() => setSelectedDayKey(bucket.key)}
            >
              <span className="schedule-day-tab__name">{bucket.label}</span>
              <span className="schedule-day-tab__meta tabular">
                {bucket.shortDate}
                {!loading ? ` · ${bucket.entries.length}` : ''}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="schedule-list" aria-busy="true">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="skeleton-block"
              style={{ height: '94px', width: '100%' }}
            />
          ))}
        </div>
      ) : errorMessage ? (
        <ErrorState
          title="Could not load airing schedule"
          message={errorMessage}
          onRetry={() => void loadSchedule(true)}
        />
      ) : !activeBucket || activeBucket.entries.length === 0 ? (
        <EmptyState
          title="No broadcasts listed for this day"
          description="Select another day above or browse currently airing seasonal series."
          action={
            <Link to="/search" className="btn btn--secondary btn--compact">
              Browse Catalogue
            </Link>
          }
        />
      ) : (
        <div className="schedule-list">
          {activeBucket.entries.map((entry) => {
            const title = getDisplayTitle(entry.media.title);
            const coverUrl = sanitizeHttpUrl(
              entry.media.coverImage?.large ||
                entry.media.coverImage?.extraLarge ||
                entry.media.coverImage?.medium,
              { httpsOnly: true },
            );
            const airDate = new Date(entry.airingAt * 1000);
            const localTime = airDate.toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });
            const hasAired = entry.airingAt <= nowSeconds;
            const statusText = hasAired
              ? 'Aired'
              : formatTimeUntilAiring(entry.airingAt, nowMs);
            const formatLabel = formatMediaFormat(entry.media.format);
            const studio = getMainStudioName(entry.media);
            const score = formatScore(entry.media.averageScore);

            return (
              <article key={entry.id} className="schedule-row">
                <div className="schedule-row__time">
                  <span className="schedule-row__clock tabular">{localTime}</span>
                  <span
                    className={`schedule-row__status${
                      hasAired ? ' schedule-row__status--aired' : ''
                    }`}
                  >
                    <Clock size={11} aria-hidden="true" />
                    <span>{statusText}</span>
                  </span>
                </div>

                <Link to={`/anime/${entry.media.id}`} className="schedule-row__media">
                  {coverUrl ? (
                    <img
                      src={coverUrl}
                      alt=""
                      className="schedule-row__poster"
                      loading="lazy"
                    />
                  ) : (
                    <div className="schedule-row__poster schedule-row__poster--fallback">
                      <Film size={16} aria-hidden="true" />
                    </div>
                  )}

                  <div className="schedule-row__info">
                    <h2 className="schedule-row__title">{title}</h2>
                    <div className="schedule-row__meta">
                      <span className="schedule-row__ep tabular">Episode {entry.episode}</span>
                      {formatLabel && <span>{formatLabel}</span>}
                      {studio && <span>{studio}</span>}
                      {score && (
                        <span className="anime-card__score">
                          <Star size={11} fill="currentColor" aria-hidden="true" />
                          <span>{score}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </Link>

                <div className="schedule-row__actions">
                  {hasAired ? (
                    <Link
                      to={`/watch/${entry.media.id}?ep=${entry.episode}`}
                      className="btn btn--primary btn--compact"
                    >
                      <Play size={13} fill="currentColor" aria-hidden="true" />
                      <span>Watch Ep {entry.episode}</span>
                    </Link>
                  ) : (
                    <Link
                      to={`/anime/${entry.media.id}`}
                      className="btn btn--secondary btn--compact"
                    >
                      <span>Details</span>
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: '32px' }}>
        <AdSlot placement="schedule-bottom-rectangle" />
      </div>
    </div>
  );
}
