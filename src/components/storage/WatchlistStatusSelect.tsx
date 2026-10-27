import type { ChangeEvent } from 'react';
import { ListPlus } from 'lucide-react';
import {
  useWatchlist,
  WATCHLIST_STATUS_LABELS,
} from '../../services/storage/watchlistStore';
import type { AnimeSummary } from '../../types/anime';
import type { WatchlistStatus } from '../../types/storage';

export interface WatchlistStatusSelectProps {
  anime: AnimeSummary;
  compact?: boolean;
}

const STATUS_ORDER: WatchlistStatus[] = [
  'watching',
  'plan_to_watch',
  'completed',
  'on_hold',
  'dropped',
];

export function WatchlistStatusSelect({
  anime,
  compact = false,
}: WatchlistStatusSelectProps) {
  const { getEntry, setWatchlistStatus, removeWatchlistEntry } = useWatchlist();
  const entry = getEntry(anime.id);

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const val = event.target.value;
    if (!val) {
      removeWatchlistEntry(anime.id);
      return;
    }
    setWatchlistStatus(anime, val as WatchlistStatus);
  };

  return (
    <div
      className={`watchlist-select-wrap${entry ? ' watchlist-select-wrap--active' : ''}${
        compact ? ' watchlist-select-wrap--compact' : ''
      }`}
    >
      <ListPlus size={compact ? 14 : 15} className="watchlist-select-wrap__icon" aria-hidden="true" />
      <select
        className="watchlist-select"
        aria-label="Watchlist tracking status"
        value={entry?.status ?? ''}
        onChange={handleChange}
      >
        <option value="">Track Status…</option>
        {STATUS_ORDER.map((status) => (
          <option key={status} value={status}>
            {WATCHLIST_STATUS_LABELS[status]}
          </option>
        ))}
      </select>
    </div>
  );
}
