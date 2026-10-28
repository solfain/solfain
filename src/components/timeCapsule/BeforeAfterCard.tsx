import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Copy, Download, Link2 } from 'lucide-react';
import type { ShareableBeforeAfterPayload } from '../../types/timeCapsule';
import {
  downloadBeforeAfterCardPng,
  encodeShareableCardPayload,
  formatBeforeAfterSummaryText,
  formatShortDate,
} from '../../services/timeCapsule/timeCapsuleCompare';
import { PREDICTION_OUTCOME_LABELS } from '../../services/timeCapsule/timeCapsuleStore';

export interface BeforeAfterCardProps {
  payload: ShareableBeforeAfterPayload;
  isSharedView?: boolean;
}

export function BeforeAfterCard({
  payload,
  isSharedView = false,
}: BeforeAfterCardProps) {
  const [copiedMode, setCopiedMode] = useState<'link' | 'text' | null>(null);
  const [downloading, setDownloading] = useState(false);

  const shareUrl = (() => {
    const encoded = encodeShareableCardPayload(payload);
    const origin =
      typeof window !== 'undefined' ? window.location.origin : 'https://solfain.app';
    return `${origin}/time-capsule?share=${encoded}`;
  })();

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedMode('link');
      window.setTimeout(() => setCopiedMode(null), 2200);
    } catch {
      // Clipboard unavailable in restricted contexts
    }
  };

  const handleCopyText = async () => {
    try {
      const text = formatBeforeAfterSummaryText(payload, shareUrl);
      await navigator.clipboard.writeText(text);
      setCopiedMode('text');
      window.setTimeout(() => setCopiedMode(null), 2200);
    } catch {
      // Clipboard unavailable
    }
  };

  const handleDownloadPng = async () => {
    setDownloading(true);
    try {
      await downloadBeforeAfterCardPng(payload);
    } finally {
      setDownloading(false);
    }
  };

  const favDelta = payload.favNow - payload.favThen;
  const compDelta = payload.compNow - payload.compThen;
  const epsDelta = payload.epsNow - payload.epsThen;
  const meanDelta =
    payload.meanThen !== null && payload.meanNow !== null
      ? Math.round((payload.meanNow - payload.meanThen) * 10) / 10
      : null;

  return (
    <div className="capsule-share-wrap">
      <article
        className="capsule-ba-card"
        aria-label={`Before and After Time Capsule Card: ${payload.title}`}
      >
        <div className="capsule-ba-card__accent" aria-hidden="true" />

        <header className="capsule-ba-card__header">
          <div>
            <div className="capsule-ba-card__eyebrow">
              SOLFAIN · ANIME TIME CAPSULE{isSharedView ? ' · SHARED SNAPSHOT' : ''}
            </div>
            <h3 className="capsule-ba-card__title">{payload.title}</h3>
          </div>

          <div className="capsule-ba-card__dates">
            <span>{formatShortDate(payload.thenMs)}</span>
            <ArrowRight size={13} aria-hidden="true" />
            <span>{formatShortDate(payload.nowMs)}</span>
          </div>
        </header>

        <div className="capsule-ba-card__columns">
          {/* THEN COLUMN */}
          <section className="capsule-ba-col capsule-ba-col--then" aria-label="Snapshot Then">
            <div className="capsule-ba-col__kicker">
              SNAPSHOT THEN · {formatShortDate(payload.thenMs)}
            </div>

            <div className="capsule-ba-crown">
              <span className="capsule-ba-crown__label">#1 Crown Favorite</span>
              {payload.crownThen ? (
                <Link
                  to={`/anime/${payload.crownThen.id}`}
                  className="capsule-ba-crown__title"
                >
                  {payload.crownThen.title}
                </Link>
              ) : (
                <span className="capsule-ba-crown__empty">None recorded</span>
              )}
            </div>

            <div className="capsule-ba-metrics">
              <div className="capsule-ba-metric">
                <span className="capsule-ba-metric__label">Favorites</span>
                <span className="capsule-ba-metric__val">{payload.favThen}</span>
              </div>
              <div className="capsule-ba-metric">
                <span className="capsule-ba-metric__label">Mean Rating</span>
                <span className="capsule-ba-metric__val">
                  {payload.meanThen !== null ? `${payload.meanThen}/10` : '—'}
                </span>
              </div>
              <div className="capsule-ba-metric">
                <span className="capsule-ba-metric__label">Completed</span>
                <span className="capsule-ba-metric__val">{payload.compThen}</span>
              </div>
            </div>

            <div className="capsule-ba-list-group">
              {payload.favKept.length > 0 && (
                <div className="capsule-ba-list-row">
                  <span className="capsule-ba-list-row__label">Held Up:</span>
                  <span className="capsule-ba-list-row__items">
                    {payload.favKept.map((item, idx) => (
                      <span key={item.id}>
                        {idx > 0 && ', '}
                        <Link to={`/anime/${item.id}`}>{item.title}</Link>
                      </span>
                    ))}
                  </span>
                </div>
              )}

              {payload.favRemoved.length > 0 && (
                <div className="capsule-ba-list-row">
                  <span className="capsule-ba-list-row__label">Moved On From:</span>
                  <span className="capsule-ba-list-row__items capsule-ba-list-row__items--muted">
                    {payload.favRemoved.map((item, idx) => (
                      <span key={item.id}>
                        {idx > 0 && ', '}
                        <Link to={`/anime/${item.id}`}>{item.title}</Link>
                      </span>
                    ))}
                  </span>
                </div>
              )}

              {payload.favKept.length === 0 && payload.favRemoved.length === 0 && (
                <div className="capsule-ba-list-row">
                  <span className="capsule-ba-list-row__label">Baseline:</span>
                  <span className="capsule-ba-list-row__items capsule-ba-list-row__items--muted">
                    {payload.epsThen} episodes watched · {payload.ratedThen} rated series
                  </span>
                </div>
              )}
            </div>
          </section>

          {/* NOW COLUMN */}
          <section className="capsule-ba-col capsule-ba-col--now" aria-label="Revisited Now">
            <div className="capsule-ba-col__kicker capsule-ba-col__kicker--now">
              REVISITED NOW · {formatShortDate(payload.nowMs)}
            </div>

            <div className="capsule-ba-crown">
              <span className="capsule-ba-crown__label">#1 Crown Favorite Now</span>
              {payload.crownNow ? (
                <Link
                  to={`/anime/${payload.crownNow.id}`}
                  className="capsule-ba-crown__title"
                >
                  {payload.crownNow.title}
                </Link>
              ) : (
                <span className="capsule-ba-crown__empty">None selected</span>
              )}
            </div>

            <div className="capsule-ba-metrics">
              <div className="capsule-ba-metric">
                <span className="capsule-ba-metric__label">Favorites</span>
                <span className="capsule-ba-metric__val capsule-ba-metric__val--accent">
                  {payload.favNow}
                  {favDelta !== 0 && (
                    <small className="capsule-ba-delta">
                      {favDelta > 0 ? `+${favDelta}` : favDelta}
                    </small>
                  )}
                </span>
              </div>
              <div className="capsule-ba-metric">
                <span className="capsule-ba-metric__label">Mean Rating</span>
                <span className="capsule-ba-metric__val capsule-ba-metric__val--accent">
                  {payload.meanNow !== null ? `${payload.meanNow}/10` : '—'}
                  {meanDelta !== null && meanDelta !== 0 && (
                    <small className="capsule-ba-delta">
                      {meanDelta > 0 ? `+${meanDelta}` : meanDelta}
                    </small>
                  )}
                </span>
              </div>
              <div className="capsule-ba-metric">
                <span className="capsule-ba-metric__label">Completed</span>
                <span className="capsule-ba-metric__val capsule-ba-metric__val--accent">
                  {payload.compNow}
                  {compDelta !== 0 && (
                    <small className="capsule-ba-delta">
                      {compDelta > 0 ? `+${compDelta}` : compDelta}
                    </small>
                  )}
                </span>
              </div>
            </div>

            <div className="capsule-ba-list-group">
              {payload.favAdded.length > 0 && (
                <div className="capsule-ba-list-row">
                  <span className="capsule-ba-list-row__label">New Favorites:</span>
                  <span className="capsule-ba-list-row__items">
                    {payload.favAdded.map((item, idx) => (
                      <span key={item.id}>
                        {idx > 0 && ', '}
                        <Link to={`/anime/${item.id}`}>{item.title}</Link>
                      </span>
                    ))}
                  </span>
                </div>
              )}

              {payload.newComp.length > 0 && (
                <div className="capsule-ba-list-row">
                  <span className="capsule-ba-list-row__label">Newly Finished:</span>
                  <span className="capsule-ba-list-row__items">
                    {payload.newComp.map((item, idx) => (
                      <span key={item.id}>
                        {idx > 0 && ', '}
                        <Link to={`/anime/${item.id}`}>{item.title}</Link>
                      </span>
                    ))}
                  </span>
                </div>
              )}

              {payload.favAdded.length === 0 && payload.newComp.length === 0 && (
                <div className="capsule-ba-list-row">
                  <span className="capsule-ba-list-row__label">Progress:</span>
                  <span className="capsule-ba-list-row__items capsule-ba-list-row__items--muted">
                    {payload.epsNow} episodes watched (
                    {epsDelta >= 0 ? `+${epsDelta}` : epsDelta}) · {payload.ratedNow} rated
                  </span>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* BOTTOM STRIP: SCORE SHIFTS & PREDICTIONS */}
        <footer className="capsule-ba-card__footer">
          <div className="capsule-ba-card__shifts">
            <span className="capsule-ba-card__section-tag">Score Shifts</span>
            {payload.scoreShifts.length > 0 ? (
              <div className="capsule-ba-card__shift-pills">
                {payload.scoreShifts.map((s) => {
                  const diff = s.to - s.from;
                  return (
                    <Link
                      key={s.id}
                      to={`/anime/${s.id}`}
                      className="capsule-shift-chip"
                    >
                      <span>{s.title}</span>
                      <strong>
                        {s.from} → {s.to} ({diff > 0 ? `+${diff}` : diff})
                      </strong>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <span className="capsule-ba-card__muted">
                No re-rated series shifts recorded between snapshots.
              </span>
            )}
          </div>

          <div className="capsule-ba-card__predictions">
            <span className="capsule-ba-card__section-tag">Predictions</span>
            {payload.predTotal > 0 ? (
              <div className="capsule-ba-card__pred-body">
                <strong>
                  {payload.predHit}/{payload.predTotal} Came True
                  {payload.predPartial > 0 ? ` · ${payload.predPartial} Partial` : ''}
                  {payload.predMiss > 0 ? ` · ${payload.predMiss} Missed` : ''}
                </strong>
                {payload.featuredPrediction && (
                  <span className="capsule-ba-card__pred-quote">
                    “{payload.featuredPrediction.text}” (
                    {PREDICTION_OUTCOME_LABELS[payload.featuredPrediction.outcome]})
                  </span>
                )}
              </div>
            ) : (
              <span className="capsule-ba-card__muted">No predictions attached.</span>
            )}
          </div>
        </footer>
      </article>

      <div className="capsule-share-actions">
        <button
          type="button"
          className="btn btn--primary btn--compact"
          disabled={downloading}
          onClick={() => void handleDownloadPng()}
        >
          <Download size={14} aria-hidden="true" />
          <span>{downloading ? 'Rendering PNG…' : 'Download PNG Card'}</span>
        </button>

        <button
          type="button"
          className="btn btn--secondary btn--compact"
          onClick={() => void handleCopyLink()}
        >
          {copiedMode === 'link' ? (
            <Check size={14} aria-hidden="true" />
          ) : (
            <Link2 size={14} aria-hidden="true" />
          )}
          <span>{copiedMode === 'link' ? 'Share Link Copied!' : 'Copy Share Link'}</span>
        </button>

        <button
          type="button"
          className="btn btn--ghost btn--compact"
          onClick={() => void handleCopyText()}
        >
          {copiedMode === 'text' ? (
            <Check size={14} aria-hidden="true" />
          ) : (
            <Copy size={14} aria-hidden="true" />
          )}
          <span>{copiedMode === 'text' ? 'Summary Copied!' : 'Copy Text Card'}</span>
        </button>
      </div>
    </div>
  );
}
