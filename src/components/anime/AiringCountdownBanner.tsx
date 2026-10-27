import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock } from 'lucide-react';
import type { NextAiringEpisode } from '../../types/anime';

export interface AiringCountdownBannerProps {
  nextAiring: NextAiringEpisode | null | undefined;
}

function formatDetailedCountdown(airingAt: number, nowMs: number): string | null {
  const diff = airingAt - Math.floor(nowMs / 1000);
  if (diff <= 0) return null;
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const mins = Math.floor((diff % 3600) / 60);
  const secs = diff % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  parts.push(`${mins}m`);
  if (days === 0) parts.push(`${String(secs).padStart(2, '0')}s`);
  return parts.join(' ');
}

export function AiringCountdownBanner({ nextAiring }: AiringCountdownBannerProps) {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!nextAiring) return;
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [nextAiring]);

  if (!nextAiring || !Number.isFinite(nextAiring.airingAt)) {
    return null;
  }

  const countdown = formatDetailedCountdown(nextAiring.airingAt, nowMs);
  if (!countdown) {
    return null;
  }

  const airDate = new Date(nextAiring.airingAt * 1000);
  const dateText = airDate.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="airing-countdown-bar" role="status" aria-live="off">
      <div className="airing-countdown-bar__main">
        <Clock size={15} className="airing-countdown-bar__icon" aria-hidden="true" />
        <span>
          <strong>Episode {nextAiring.episode}</strong> airs in{' '}
          <strong className="tabular airing-countdown-bar__timer">{countdown}</strong>
        </span>
        <span className="airing-countdown-bar__date">· {dateText}</span>
      </div>

      <Link to="/schedule" className="airing-countdown-bar__link">
        Full Schedule
      </Link>
    </div>
  );
}
