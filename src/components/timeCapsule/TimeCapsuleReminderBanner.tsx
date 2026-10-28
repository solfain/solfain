import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell, Clock, X } from 'lucide-react';
import { formatShortDate } from '../../services/timeCapsule/timeCapsuleCompare';
import {
  dismissCapsuleReminder,
  getDueReminderCapsules,
  markCapsuleBrowserNotified,
  snoozeCapsuleReminder,
  useTimeCapsules,
} from '../../services/timeCapsule/timeCapsuleStore';

export function TimeCapsuleReminderBanner() {
  const location = useLocation();
  const { capsules } = useTimeCapsules();
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    const interval = window.setInterval(tick, 60_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        tick();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const dueCapsules = getDueReminderCapsules(capsules, nowMs);

  // Fire opt-in browser Notification once per due capsule when permission is granted
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (window.Notification.permission !== 'granted') return;

    for (const cap of dueCapsules) {
      if (cap.reminder.browserNotification && cap.reminder.notifiedAt === null) {
        try {
          new window.Notification(`Solfain Time Capsule Ready: ${cap.title}`, {
            body: `Sealed on ${formatShortDate(cap.createdAt)} — revisit your old favorites, ratings, and predictions now.`,
          });
        } catch {
          // Ignore environments where Notification constructor is restricted
        }
        markCapsuleBrowserNotified(cap.id, Date.now());
      }
    }
  }, [dueCapsules]);

  const activeBannerCapsule = dueCapsules.find((c) => c.reminder.inAppBanner) ?? null;

  if (!activeBannerCapsule) return null;

  // Hide banner if user is already viewing this exact capsule on /time-capsule
  const params = new URLSearchParams(location.search);
  if (
    location.pathname === '/time-capsule' &&
    params.get('capsule') === activeBannerCapsule.id
  ) {
    return null;
  }

  return (
    <div
      className="capsule-reminder-banner"
      role="status"
      aria-live="polite"
    >
      <div className="container capsule-reminder-banner__inner">
        <div className="capsule-reminder-banner__text">
          <Bell size={15} className="capsule-reminder-banner__icon" aria-hidden="true" />
          <span>
            <strong>Time Capsule Ready:</strong> “{activeBannerCapsule.title}” (sealed{' '}
            {formatShortDate(activeBannerCapsule.createdAt)}) is ready to unseal and compare.
          </span>
        </div>

        <div className="capsule-reminder-banner__actions">
          <Link
            to={`/time-capsule?capsule=${encodeURIComponent(activeBannerCapsule.id)}`}
            className="btn btn--primary btn--compact"
          >
            Open & Compare
          </Link>

          <button
            type="button"
            className="btn btn--secondary btn--compact"
            onClick={() => snoozeCapsuleReminder(activeBannerCapsule.id)}
          >
            <Clock size={13} aria-hidden="true" />
            <span>Snooze 7d</span>
          </button>

          <button
            type="button"
            className="capsule-reminder-banner__dismiss"
            aria-label="Dismiss reminder"
            onClick={() => dismissCapsuleReminder(activeBannerCapsule.id)}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
