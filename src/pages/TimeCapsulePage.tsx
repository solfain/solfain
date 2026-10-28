import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Archive,
  ArrowRight,
  Award,
  Bell,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Crown,
  Eye,
  Lock,
  Plus,
  Search,
  Share2,
  Sparkles,
  Star,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import { AdSlot } from '../components/monetization/SponsorSlot';
import { BeforeAfterCard } from '../components/timeCapsule/BeforeAfterCard';
import { searchAnime } from '../services/anilist/anilistService';
import { addFavorite, useFavorites } from '../services/storage/favoritesStore';
import { useWatchedEpisodes } from '../services/storage/watchedEpisodesStore';
import { getWatchedEpisodesMap } from '../services/storage/watchedEpisodesStore';
import {
  useWatchlist,
  WATCHLIST_STATUS_LABELS,
} from '../services/storage/watchlistStore';
import {
  compareCapsuleToCapsule,
  compareCapsuleToLiveLibrary,
  comparisonToShareablePayload,
  decodeShareableCardPayload,
  downloadCapsuleReminderIcs,
  formatShortDate,
} from '../services/timeCapsule/timeCapsuleCompare';
import {
  computeUnlockTimestampFromPreset,
  countAllWatchedEpisodesFromLibrary,
  PREDICTION_CATEGORY_LABELS,
  PREDICTION_OUTCOME_LABELS,
  toCapsuleAnimeRef,
  useTimeCapsules,
} from '../services/timeCapsule/timeCapsuleStore';
import type { AnimeSummary } from '../types/anime';
import type {
  CapsuleAnimeRef,
  PredictionCategory,
  PredictionOutcome,
  TimeCapsuleHorizonPreset,
} from '../types/timeCapsule';
import { useDebouncedValue } from '../utils/debounce';
import { getCurrentSeason, getDisplayTitle, getReleaseYear } from '../utils/format';
import { sanitizeHttpUrl } from '../utils/security';

type InspectorTab = 'compare' | 'card' | 'snapshot' | 'reminders';

function toDateInputString(ms: number): string {
  const d = new Date(ms);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateInputToNoonMs(dateStr: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const [y, m, d] = dateStr.split('-').map((n) => Number.parseInt(n, 10));
  const dt = new Date(y, m - 1, d, 12, 0, 0, 0);
  return Number.isFinite(dt.getTime()) ? dt.getTime() : null;
}

function getDefaultCapsuleTitle(): string {
  const { season, year } = getCurrentSeason();
  const prettySeason = season.charAt(0) + season.slice(1).toLowerCase();
  return `${prettySeason} ${year} Taste Snapshot`;
}

export function TimeCapsulePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { favorites } = useFavorites();
  const { watchlist } = useWatchlist();
  // Subscribe to episode progress updates as well
  useWatchedEpisodes(0);

  const {
    capsules,
    createTimeCapsule,
    unsealTimeCapsule,
    updatePredictionOutcome,
    updateRevisitReflection,
    updateCapsuleReminder,
    snoozeCapsuleReminder,
    deleteTimeCapsule,
  } = useTimeCapsules();

  useEffect(() => {
    document.title = 'Anime Time Capsule — Solfain';
  }, []);

  // Shared card URL decoding (?share=...)
  const rawShareParam = searchParams.get('share');
  const sharedCardPayload = useMemo(
    () => (rawShareParam ? decodeShareableCardPayload(rawShareParam) : null),
    [rawShareParam],
  );

  const requestedCapsuleId = searchParams.get('capsule');
  const [showComposer, setShowComposer] = useState<boolean>(
    () => capsules.length === 0 && !rawShareParam,
  );
  const [selectedCapsuleId, setSelectedCapsuleId] = useState<string | null>(
    () => requestedCapsuleId ?? capsules[0]?.id ?? null,
  );
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('compare');
  const [compareAgainstId, setCompareAgainstId] = useState<string>('live');
  const [peekedCapsuleIds, setPeekedCapsuleIds] = useState<string[]>([]);

  useEffect(() => {
    if (requestedCapsuleId && capsules.some((c) => c.id === requestedCapsuleId)) {
      setSelectedCapsuleId(requestedCapsuleId);
      setShowComposer(false);
    } else if (
      selectedCapsuleId &&
      !capsules.some((c) => c.id === selectedCapsuleId)
    ) {
      setSelectedCapsuleId(capsules[0]?.id ?? null);
    } else if (!selectedCapsuleId && capsules.length > 0) {
      setSelectedCapsuleId(capsules[0].id);
    }
  }, [capsules, requestedCapsuleId, selectedCapsuleId]);

  // --- Composer Form State ---
  const [title, setTitle] = useState(getDefaultCapsuleTitle);
  const [horizonPreset, setHorizonPreset] =
    useState<TimeCapsuleHorizonPreset>('6m');
  const [customUnlockDate, setCustomUnlockDate] = useState(() =>
    toDateInputString(computeUnlockTimestampFromPreset('6m')),
  );
  const [softLockUntilUnlock, setSoftLockUntilUnlock] = useState(false);
  const [noteToFutureSelf, setNoteToFutureSelf] = useState('');

  // Curated favorites & crown pick inside composer
  const [extraCuratedFavorites, setExtraCuratedFavorites] = useState<
    CapsuleAnimeRef[]
  >([]);
  const [selectedCrownId, setSelectedCrownId] = useState<number | null>(
    () => favorites[0]?.id ?? watchlist[0]?.id ?? null,
  );
  const [saveCuratedToLibrary, setSaveCuratedToLibrary] = useState(true);

  // Inline AniList search for curating favorites / crown / predictions
  const [animeQuery, setAnimeQuery] = useState('');
  const debouncedAnimeQuery = useDebouncedValue(animeQuery.trim(), 320);
  const [animeResults, setAnimeResults] = useState<AnimeSummary[]>([]);
  const [searchingAnime, setSearchingAnime] = useState(false);

  useEffect(() => {
    if (debouncedAnimeQuery.length < 2) {
      setAnimeResults([]);
      setSearchingAnime(false);
      return;
    }
    const controller = new AbortController();
    setSearchingAnime(true);
    searchAnime(
      { query: debouncedAnimeQuery, page: 1, perPage: 6 },
      { signal: controller.signal },
    )
      .then((res) => {
        if (!controller.signal.aborted) {
          setAnimeResults(res.media);
          setSearchingAnime(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setAnimeResults([]);
          setSearchingAnime(false);
        }
      });
    return () => controller.abort();
  }, [debouncedAnimeQuery]);

  // Predictions composer state
  const [predCategory, setPredCategory] =
    useState<PredictionCategory>('rating_shift');
  const [predText, setPredText] = useState('');
  const [predLinkedAnimeId, setPredLinkedAnimeId] = useState<number | ''>('');
  const [draftPredictions, setDraftPredictions] = useState<
    Array<{
      id: string;
      category: PredictionCategory;
      text: string;
      linkedAnime: CapsuleAnimeRef | null;
    }>
  >([]);

  // Scheduled Reminder composer state
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderInApp, setReminderInApp] = useState(true);
  const [reminderBrowserNotify, setReminderBrowserNotify] = useState(false);
  const [downloadIcsOnSeal, setDownloadIcsOnSeal] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<string>(
    () =>
      typeof window !== 'undefined' && 'Notification' in window
        ? window.Notification.permission
        : 'unsupported',
  );
  const [composerFeedback, setComposerFeedback] = useState<string | null>(null);

  // Candidate anime pool for Crown Pick & Linked Prediction dropdowns
  const candidateAnimePool = useMemo(() => {
    const map = new Map<number, CapsuleAnimeRef>();
    for (const extra of extraCuratedFavorites) {
      map.set(extra.id, extra);
    }
    for (const fav of favorites) {
      if (!map.has(fav.id)) map.set(fav.id, toCapsuleAnimeRef(fav));
    }
    for (const w of watchlist) {
      if (!map.has(w.id)) map.set(w.id, toCapsuleAnimeRef(w));
    }
    return Array.from(map.values());
  }, [extraCuratedFavorites, favorites, watchlist]);

  const effectivePreviewFavoritesCount = useMemo(() => {
    const ids = new Set<number>();
    favorites.forEach((f) => ids.add(f.id));
    extraCuratedFavorites.forEach((f) => ids.add(f.id));
    return ids.size;
  }, [extraCuratedFavorites, favorites]);

  const liveStatsPreview = useMemo(() => {
    const rated = watchlist.filter((w) => w.personalScore !== null).length;
    const completed = watchlist.filter((w) => w.status === 'completed').length;
    const episodes = countAllWatchedEpisodesFromLibrary(
      watchlist,
      getWatchedEpisodesMap(),
    );
    return { rated, completed, episodes };
  }, [watchlist]);

  const computedUnlockMs = useMemo(() => {
    if (horizonPreset === 'custom') {
      const parsed = parseDateInputToNoonMs(customUnlockDate);
      if (parsed && parsed > Date.now()) return parsed;
      return computeUnlockTimestampFromPreset('6m');
    }
    return computeUnlockTimestampFromPreset(horizonPreset);
  }, [customUnlockDate, horizonPreset]);

  const requestBrowserNotificationPermission = async (): Promise<boolean> => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationPermission('unsupported');
      return false;
    }
    if (window.Notification.permission === 'granted') {
      setNotificationPermission('granted');
      return true;
    }
    try {
      const result = await window.Notification.requestPermission();
      setNotificationPermission(result);
      return result === 'granted';
    } catch {
      return false;
    }
  };

  const handleToggleComposerBrowserNotify = async (checked: boolean) => {
    if (!checked) {
      setReminderBrowserNotify(false);
      return;
    }
    const granted = await requestBrowserNotificationPermission();
    setReminderBrowserNotify(granted);
  };

  const handleAddAnimeFromSearch = (anime: AnimeSummary) => {
    const ref = toCapsuleAnimeRef(anime);
    setExtraCuratedFavorites((prev) =>
      prev.some((p) => p.id === ref.id) ? prev : [ref, ...prev],
    );
    if (selectedCrownId === null) {
      setSelectedCrownId(ref.id);
    }
    if (saveCuratedToLibrary) {
      addFavorite(anime);
    }
    setAnimeQuery('');
    setAnimeResults([]);
  };

  const handleAddPrediction = () => {
    const trimmed = predText.trim();
    if (!trimmed) return;
    const linked =
      typeof predLinkedAnimeId === 'number'
        ? candidateAnimePool.find((a) => a.id === predLinkedAnimeId) ?? null
        : null;

    setDraftPredictions((prev) => [
      ...prev,
      {
        id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        category: predCategory,
        text: trimmed,
        linkedAnime: linked,
      },
    ]);
    setPredText('');
    setPredLinkedAnimeId('');
  };

  const quickPredictionTemplates = useMemo(() => {
    const templates: Array<{
      label: string;
      category: PredictionCategory;
      text: string;
      anime: CapsuleAnimeRef | null;
    }> = [];

    const watchingOrPlan = watchlist.find(
      (w) => w.status === 'watching' || w.status === 'plan_to_watch',
    );
    if (watchingOrPlan) {
      const ref = toCapsuleAnimeRef(watchingOrPlan);
      templates.push({
        label: `Finish ${ref.title}`,
        category: 'completion',
        text: `I will finish ${ref.title} and rate it 8/10 or higher.`,
        anime: ref,
      });
    }

    const topFav = extraCuratedFavorites[0] ?? (favorites[0] ? toCapsuleAnimeRef(favorites[0]) : null);
    if (topFav) {
      templates.push({
        label: `${topFav.title} stays #1`,
        category: 'rating_shift',
        text: `${topFav.title} will still hold up as my #1 favorite anime when I unseal this.`,
        anime: topFav,
      });
    }

    templates.push({
      label: '+5 Completed Series Goal',
      category: 'completion',
      text: `I will complete at least ${liveStatsPreview.completed + 5} total anime series before revisiting this capsule.`,
      anime: null,
    });

    return templates;
  }, [extraCuratedFavorites, favorites, liveStatsPreview.completed, watchlist]);

  const handleSealCapsule = (event: FormEvent) => {
    event.preventDefault();
    setComposerFeedback(null);

    const crownObj =
      selectedCrownId !== null
        ? candidateAnimePool.find((a) => a.id === selectedCrownId) ?? null
        : null;

    // Include any typed-but-unclicked prediction automatically so user work is never lost
    const finalPredictions = [...draftPredictions];
    if (predText.trim().length > 0) {
      const linked =
        typeof predLinkedAnimeId === 'number'
          ? candidateAnimePool.find((a) => a.id === predLinkedAnimeId) ?? null
          : null;
      finalPredictions.push({
        id: `draft-final`,
        category: predCategory,
        text: predText.trim(),
        linkedAnime: linked,
      });
    }

    const created = createTimeCapsule({
      title: title.trim() || getDefaultCapsuleTitle(),
      horizonPreset,
      customUnlockAt:
        horizonPreset === 'custom' ? computedUnlockMs : undefined,
      softLockUntilUnlock,
      noteToFutureSelf,
      crownPick: crownObj,
      extraFavorites: extraCuratedFavorites,
      predictions: finalPredictions.map((p) => ({
        category: p.category,
        text: p.text,
        linkedAnime: p.linkedAnime,
      })),
      reminder: {
        enabled: reminderEnabled,
        remindAt: computedUnlockMs,
        inAppBanner: reminderInApp,
        browserNotification: reminderBrowserNotify,
      },
    });

    if (downloadIcsOnSeal) {
      downloadCapsuleReminderIcs(created);
    }

    // Reset transient composer fields & focus newly sealed capsule
    setDraftPredictions([]);
    setPredText('');
    setNoteToFutureSelf('');
    setExtraCuratedFavorites([]);
    setSelectedCapsuleId(created.id);
    setInspectorTab('compare');
    setShowComposer(false);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('share');
    nextParams.set('capsule', created.id);
    setSearchParams(nextParams, { replace: true });
  };

  const activeCapsule = useMemo(
    () => capsules.find((c) => c.id === selectedCapsuleId) ?? capsules[0] ?? null,
    [capsules, selectedCapsuleId],
  );

  const activeComparison = useMemo(() => {
    if (!activeCapsule) return null;
    if (compareAgainstId !== 'live') {
      const targetCap = capsules.find((c) => c.id === compareAgainstId);
      if (targetCap) {
        return compareCapsuleToCapsule(activeCapsule, targetCap);
      }
    }
    return compareCapsuleToLiveLibrary(activeCapsule);
  }, [activeCapsule, capsules, compareAgainstId, favorites, watchlist]);

  const activeSharePayload = useMemo(
    () =>
      activeComparison ? comparisonToShareablePayload(activeComparison) : null,
    [activeComparison],
  );

  // Reflection draft sync for active capsule
  const [reflectionDraft, setReflectionDraft] = useState('');
  const [reflectionSaved, setReflectionSaved] = useState(false);

  useEffect(() => {
    setReflectionDraft(activeCapsule?.revisitReflection ?? '');
    setReflectionSaved(false);
  }, [activeCapsule?.id, activeCapsule?.revisitReflection]);

  const nowMs = Date.now();
  const isActiveDueOrUnlocked = activeCapsule
    ? nowMs >= activeCapsule.unlockAt || activeCapsule.unsealedAt !== null
    : false;
  const isSoftLockedNow = Boolean(
    activeCapsule &&
      activeCapsule.softLockUntilUnlock &&
      !isActiveDueOrUnlocked &&
      !peekedCapsuleIds.includes(activeCapsule.id),
  );

  const daysUntilUnlock = activeCapsule
    ? Math.max(
        0,
        Math.ceil((activeCapsule.unlockAt - nowMs) / (24 * 60 * 60 * 1000)),
      )
    : 0;

  const clearSharedParam = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('share');
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="container">
      <header className="page-header capsule-page-header">
        <div>
          <h1 className="page-header__title">Anime Time Capsule</h1>
          <p className="page-header__desc">
            Freeze a snapshot of your favorites, personal ratings, completed series, and
            predictions today — then revisit in six months or a year to compare how your taste
            evolved.
          </p>
        </div>

        <div className="capsule-page-header__actions">
          <button
            type="button"
            className={`btn btn--compact ${
              showComposer ? 'btn--secondary' : 'btn--primary'
            }`}
            onClick={() => {
              clearSharedParam();
              setShowComposer((prev) => !prev);
            }}
          >
            <Plus size={15} aria-hidden="true" />
            <span>{showComposer ? 'Hide Snapshot Composer' : 'Seal New Snapshot'}</span>
          </button>

          {capsules.length > 0 && showComposer && (
            <button
              type="button"
              className="btn btn--ghost btn--compact"
              onClick={() => setShowComposer(false)}
            >
              <Archive size={14} aria-hidden="true" />
              <span>View Saved Capsules ({capsules.length})</span>
            </button>
          )}
        </div>
      </header>

      {/* SHARED BEFORE & AFTER CARD VIEW (?share=...) */}
      {rawShareParam && (
        <section
          className="capsule-shared-panel"
          aria-label="Shared Time Capsule Comparison Card"
        >
          <div className="capsule-shared-panel__top">
            <div>
              <h2 className="section-title">Shared Before &amp; After Card</h2>
              <p className="section-subtitle">
                Click any series title below to inspect it on Solfain, or seal your own Anime
                Time Capsule.
              </p>
            </div>
            <button
              type="button"
              className="btn btn--secondary btn--compact"
              onClick={() => {
                clearSharedParam();
                setShowComposer(true);
              }}
            >
              <span>Create Your Own Capsule</span>
            </button>
          </div>

          {sharedCardPayload ? (
            <BeforeAfterCard payload={sharedCardPayload} isSharedView />
          ) : (
            <div className="capsule-inline-notice" role="alert">
              This shared Time Capsule URL could not be decoded. It may have been truncated when
              copied.
            </div>
          )}
        </section>
      )}

      {/* CREATE NEW SNAPSHOT COMPOSER */}
      {showComposer && (
        <section
          className="capsule-composer"
          aria-labelledby="composer-heading"
        >
          <div className="capsule-composer__header">
            <div>
              <h2 id="composer-heading" className="section-title">
                Create Today’s Taste Snapshot
              </h2>
              <p className="section-subtitle">
                Automatically captures your current Favorites, 1–10 Ratings, Completed Series,
                and Episode Progress, plus your Crown Pick and Future Predictions.
              </p>
            </div>

            <div className="capsule-live-tally" aria-label="Live library items to be captured">
              <div className="capsule-live-tally__item">
                <strong>{effectivePreviewFavoritesCount}</strong>
                <span>Favorites</span>
              </div>
              <div className="capsule-live-tally__item">
                <strong>{liveStatsPreview.rated}</strong>
                <span>Rated</span>
              </div>
              <div className="capsule-live-tally__item">
                <strong>{liveStatsPreview.completed}</strong>
                <span>Completed</span>
              </div>
              <div className="capsule-live-tally__item">
                <strong>{liveStatsPreview.episodes}</strong>
                <span>Episodes</span>
              </div>
            </div>
          </div>

          <form onSubmit={handleSealCapsule} className="capsule-composer__form">
            <div className="capsule-form-grid">
              {/* Left Column: Core Identity & Horizon */}
              <div className="capsule-form-col">
                <div className="capsule-field">
                  <label htmlFor="capsule-title-input" className="capsule-label">
                    Capsule Title
                  </label>
                  <input
                    id="capsule-title-input"
                    type="text"
                    className="field-input"
                    maxLength={120}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Fall 2026 Taste Snapshot"
                    required
                  />
                </div>

                <div className="capsule-field">
                  <span className="capsule-label">Revisit Horizon</span>
                  <div
                    className="segmented-control capsule-horizon-group"
                    role="group"
                    aria-label="Revisit schedule preset"
                  >
                    {(
                      [
                        { id: '6m', label: 'In 6 Months' },
                        { id: '1y', label: 'In 1 Year' },
                        { id: '3m', label: 'In 3 Months' },
                        { id: 'custom', label: 'Custom Date' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        className={`segmented-control__btn${
                          horizonPreset === opt.id
                            ? ' segmented-control__btn--active'
                            : ''
                        }`}
                        onClick={() => setHorizonPreset(opt.id)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {horizonPreset === 'custom' && (
                    <div style={{ marginTop: '8px' }}>
                      <label
                        htmlFor="capsule-custom-date"
                        className="capsule-sublabel"
                      >
                        Choose Revisit Date
                      </label>
                      <input
                        id="capsule-custom-date"
                        type="date"
                        className="field-input"
                        min={toDateInputString(Date.now() + 86_400_000)}
                        value={customUnlockDate}
                        onChange={(e) => setCustomUnlockDate(e.target.value)}
                      />
                    </div>
                  )}

                  <p className="capsule-hint">
                    Target revisit date:{' '}
                    <strong>{formatShortDate(computedUnlockMs)}</strong>
                  </p>

                  <label className="capsule-checkbox-row">
                    <input
                      type="checkbox"
                      checked={softLockUntilUnlock}
                      onChange={(e) => setSoftLockUntilUnlock(e.target.checked)}
                    />
                    <span>
                      Seal comparison behind a countdown gate until{' '}
                      {formatShortDate(computedUnlockMs)} (includes early-peek override)
                    </span>
                  </label>
                </div>

                {/* Crown Pick + Quick AniList Add */}
                <div className="capsule-field">
                  <label htmlFor="capsule-crown-select" className="capsule-label">
                    #1 Crown Favorite Today
                  </label>
                  <select
                    id="capsule-crown-select"
                    className="field-select"
                    value={selectedCrownId ?? ''}
                    onChange={(e) =>
                      setSelectedCrownId(
                        e.target.value ? Number.parseInt(e.target.value, 10) : null,
                      )
                    }
                  >
                    <option value="">— Select your current #1 favorite —</option>
                    {candidateAnimePool.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title}
                      </option>
                    ))}
                  </select>

                  <div className="capsule-quick-search">
                    <label
                      htmlFor="capsule-anime-search"
                      className="capsule-sublabel"
                    >
                      Spotlighting a series not in your Favorites yet? Search AniList to add it:
                    </label>
                    <div className="search-input-wrap">
                      <Search
                        size={14}
                        className="search-input-wrap__icon"
                        aria-hidden="true"
                      />
                      <input
                        id="capsule-anime-search"
                        type="search"
                        className="field-input"
                        placeholder="Search anime to include in snapshot..."
                        value={animeQuery}
                        onChange={(e) => setAnimeQuery(e.target.value)}
                      />
                    </div>

                    <label className="capsule-checkbox-row" style={{ marginTop: '6px' }}>
                      <input
                        type="checkbox"
                        checked={saveCuratedToLibrary}
                        onChange={(e) => setSaveCuratedToLibrary(e.target.checked)}
                      />
                      <span>Also bookmark added series into my Solfain Favorites</span>
                    </label>

                    {searchingAnime && (
                      <div className="capsule-search-status">Searching AniList…</div>
                    )}

                    {animeResults.length > 0 && (
                      <div
                        className="capsule-search-results"
                        role="listbox"
                        aria-label="AniList search results"
                      >
                        {animeResults.map((anime) => {
                          const display = getDisplayTitle(anime.title);
                          const yr = getReleaseYear(anime);
                          const thumb = sanitizeHttpUrl(
                            anime.coverImage?.medium || anime.coverImage?.large,
                            { httpsOnly: true },
                          );
                          return (
                            <button
                              key={anime.id}
                              type="button"
                              className="capsule-search-result-btn"
                              onClick={() => handleAddAnimeFromSearch(anime)}
                            >
                              {thumb ? (
                                <img src={thumb} alt="" />
                              ) : (
                                <div className="capsule-search-result-btn__placeholder" />
                              )}
                              <div className="capsule-search-result-btn__meta">
                                <strong>{display}</strong>
                                <span>{yr ?? 'Anime'} · Click to add</span>
                              </div>
                              <Plus size={14} aria-hidden="true" />
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {extraCuratedFavorites.length > 0 && (
                      <div className="capsule-curated-chips">
                        {extraCuratedFavorites.map((item) => (
                          <span key={item.id} className="capsule-chip">
                            <span>{item.title}</span>
                            <button
                              type="button"
                              aria-label={`Remove ${item.title} from curated list`}
                              onClick={() =>
                                setExtraCuratedFavorites((prev) =>
                                  prev.filter((p) => p.id !== item.id),
                                )
                              }
                            >
                              <X size={12} aria-hidden="true" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="capsule-field">
                  <label htmlFor="capsule-note-input" className="capsule-label">
                    Note to Future Self (Optional)
                  </label>
                  <textarea
                    id="capsule-note-input"
                    className="field-input capsule-textarea"
                    rows={3}
                    maxLength={1200}
                    placeholder="What genres, openings, or weekly shows are defining your taste right now?"
                    value={noteToFutureSelf}
                    onChange={(e) => setNoteToFutureSelf(e.target.value)}
                  />
                </div>
              </div>

              {/* Right Column: Predictions + Scheduled Reminders */}
              <div className="capsule-form-col">
                <div className="capsule-field">
                  <span className="capsule-label">
                    Future Predictions ({draftPredictions.length})
                  </span>
                  <p className="capsule-sublabel" style={{ marginTop: 0 }}>
                    Call your shots on ratings, backlog completions, or Anime of the Year — then
                    grade them when you revisit.
                  </p>

                  {quickPredictionTemplates.length > 0 && (
                    <div className="capsule-template-row">
                      {quickPredictionTemplates.map((tpl) => (
                        <button
                          key={tpl.label}
                          type="button"
                          className="capsule-template-chip"
                          onClick={() => {
                            setDraftPredictions((prev) => [
                              ...prev,
                              {
                                id: `tpl-${Date.now()}-${Math.random()
                                  .toString(36)
                                  .slice(2, 6)}`,
                                category: tpl.category,
                                text: tpl.text,
                                linkedAnime: tpl.anime,
                              },
                            ]);
                          }}
                        >
                          <Plus size={12} aria-hidden="true" />
                          <span>{tpl.label}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="capsule-pred-builder">
                    <div className="capsule-pred-builder__row">
                      <select
                        aria-label="Prediction category"
                        className="field-select"
                        value={predCategory}
                        onChange={(e) =>
                          setPredCategory(e.target.value as PredictionCategory)
                        }
                      >
                        {(
                          Object.entries(PREDICTION_CATEGORY_LABELS) as Array<
                            [PredictionCategory, string]
                          >
                        ).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>

                      <select
                        aria-label="Link prediction to an anime (optional)"
                        className="field-select"
                        value={predLinkedAnimeId}
                        onChange={(e) =>
                          setPredLinkedAnimeId(
                            e.target.value
                              ? Number.parseInt(e.target.value, 10)
                              : '',
                          )
                        }
                      >
                        <option value="">Optional: Link anime…</option>
                        {candidateAnimePool.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.title}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="capsule-pred-builder__input-row">
                      <input
                        type="text"
                        aria-label="Prediction statement"
                        className="field-input"
                        maxLength={320}
                        placeholder="e.g. I'll finish Horimiya and score it at least 9/10"
                        value={predText}
                        onChange={(e) => setPredText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddPrediction();
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn--secondary btn--compact"
                        disabled={!predText.trim()}
                        onClick={handleAddPrediction}
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  {draftPredictions.length > 0 && (
                    <ul className="capsule-draft-pred-list">
                      {draftPredictions.map((pred) => (
                        <li key={pred.id} className="capsule-draft-pred-item">
                          <div>
                            <span className="capsule-pred-tag">
                              {PREDICTION_CATEGORY_LABELS[pred.category]}
                            </span>
                            {pred.linkedAnime && (
                              <span className="capsule-pred-linked">
                                {pred.linkedAnime.title}
                              </span>
                            )}
                            <p>{pred.text}</p>
                          </div>
                          <button
                            type="button"
                            aria-label="Remove prediction"
                            className="capsule-icon-btn"
                            onClick={() =>
                              setDraftPredictions((prev) =>
                                prev.filter((item) => item.id !== pred.id),
                              )
                            }
                          >
                            <Trash2 size={14} aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Optional Scheduled Reminders */}
                <div className="capsule-reminder-box">
                  <div className="capsule-reminder-box__head">
                    <Bell size={15} aria-hidden="true" />
                    <span>Optional Scheduled Reminders</span>
                  </div>

                  <label className="capsule-checkbox-row">
                    <input
                      type="checkbox"
                      checked={reminderEnabled}
                      onChange={(e) => setReminderEnabled(e.target.checked)}
                    />
                    <span>
                      Schedule reminder for{' '}
                      <strong>{formatShortDate(computedUnlockMs)}</strong>
                    </span>
                  </label>

                  {reminderEnabled && (
                    <div className="capsule-reminder-box__nested">
                      <label className="capsule-checkbox-row">
                        <input
                          type="checkbox"
                          checked={reminderInApp}
                          onChange={(e) => setReminderInApp(e.target.checked)}
                        />
                        <span>In-app due banner &amp; header notification badge</span>
                      </label>

                      <label className="capsule-checkbox-row">
                        <input
                          type="checkbox"
                          checked={reminderBrowserNotify}
                          disabled={notificationPermission === 'unsupported'}
                          onChange={(e) =>
                            void handleToggleComposerBrowserNotify(e.target.checked)
                          }
                        />
                        <span>
                          Browser notification on unlock
                          {notificationPermission === 'granted'
                            ? ' (Permission granted)'
                            : notificationPermission === 'denied'
                              ? ' (Blocked in browser settings)'
                              : notificationPermission === 'unsupported'
                                ? ' (Not supported in this browser)'
                                : ''}
                        </span>
                      </label>
                    </div>
                  )}

                  <label className="capsule-checkbox-row">
                    <input
                      type="checkbox"
                      checked={downloadIcsOnSeal}
                      onChange={(e) => setDownloadIcsOnSeal(e.target.checked)}
                    />
                    <span>
                      Download <code>.ics</code> calendar event upon sealing (Google, Apple
                      &amp; Outlook Calendar)
                    </span>
                  </label>
                </div>

                {composerFeedback && (
                  <p className="capsule-feedback" role="status">
                    {composerFeedback}
                  </p>
                )}

                <div className="capsule-composer__submit">
                  <button type="submit" className="btn btn--primary">
                    <Sparkles size={15} aria-hidden="true" />
                    <span>Seal Time Capsule Snapshot</span>
                  </button>
                </div>
              </div>
            </div>
          </form>
        </section>
      )}

      {/* SAVED CAPSULES VAULT & BEFORE-AND-AFTER INSPECTOR */}
      {capsules.length > 0 && activeCapsule && activeComparison && activeSharePayload ? (
        <section className="capsule-vault" aria-label="Saved Time Capsules">
          {/* Capsule Selector Strip */}
          <div className="capsule-selector-bar">
            <div className="capsule-selector-bar__label">
              <Archive size={15} aria-hidden="true" />
              <span>Your Time Capsules ({capsules.length})</span>
            </div>

            <div className="capsule-selector-pills" role="tablist" aria-label="Select Time Capsule">
              {capsules.map((cap) => {
                const isSelected = cap.id === activeCapsule.id;
                const due = Date.now() >= cap.unlockAt && cap.unsealedAt === null;
                return (
                  <button
                    key={cap.id}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    className={`capsule-pill${
                      isSelected ? ' capsule-pill--active' : ''
                    }`}
                    onClick={() => {
                      setSelectedCapsuleId(cap.id);
                      const next = new URLSearchParams(searchParams);
                      next.set('capsule', cap.id);
                      next.delete('share');
                      setSearchParams(next, { replace: true });
                    }}
                  >
                    <span className="capsule-pill__title">{cap.title}</span>
                    <span className="capsule-pill__meta">
                      {formatShortDate(cap.createdAt)}
                      {due ? ' · Ready!' : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Capsule Summary Header */}
          <div className="capsule-inspector">
            <div className="capsule-inspector__head">
              <div>
                <div className="capsule-inspector__badges">
                  {activeCapsule.unsealedAt !== null ? (
                    <span className="capsule-status-badge capsule-status-badge--unsealed">
                      <Unlock size={12} aria-hidden="true" />
                      <span>Unsealed {formatShortDate(activeCapsule.unsealedAt)}</span>
                    </span>
                  ) : Date.now() >= activeCapsule.unlockAt ? (
                    <span className="capsule-status-badge capsule-status-badge--ready">
                      <Sparkles size={12} aria-hidden="true" />
                      <span>Ready to Unseal!</span>
                    </span>
                  ) : (
                    <span className="capsule-status-badge">
                      <Clock size={12} aria-hidden="true" />
                      <span>
                        Revisit Target: {formatShortDate(activeCapsule.unlockAt)} ({daysUntilUnlock}d
                        left)
                      </span>
                    </span>
                  )}

                  {activeCapsule.reminder.enabled && (
                    <span className="capsule-status-badge">
                      <Bell size={12} aria-hidden="true" />
                      <span>
                        Reminder: {formatShortDate(activeCapsule.reminder.remindAt)}
                      </span>
                    </span>
                  )}
                </div>

                <h2 className="capsule-inspector__title">{activeCapsule.title}</h2>
                <p className="capsule-inspector__sub">
                  Sealed on <strong>{formatShortDate(activeCapsule.createdAt)}</strong> with{' '}
                  {activeCapsule.favorites.length} favorites,{' '}
                  {activeCapsule.watchlist.filter((w) => w.personalScore !== null).length} rated
                  series,{' '}
                  {activeCapsule.watchlist.filter((w) => w.status === 'completed').length}{' '}
                  completed series, and {activeCapsule.predictions.length} predictions.
                </p>
              </div>

              <div className="capsule-inspector__head-actions">
                {Date.now() >= activeCapsule.unlockAt &&
                  activeCapsule.unsealedAt === null && (
                    <button
                      type="button"
                      className="btn btn--primary btn--compact"
                      onClick={() => unsealTimeCapsule(activeCapsule.id)}
                    >
                      <Unlock size={14} aria-hidden="true" />
                      <span>Mark Unsealed</span>
                    </button>
                  )}

                <button
                  type="button"
                  className="btn btn--secondary btn--compact"
                  onClick={() => downloadCapsuleReminderIcs(activeCapsule)}
                >
                  <Calendar size={14} aria-hidden="true" />
                  <span>Add .ics Reminder</span>
                </button>
              </div>
            </div>

            {/* Soft-Lock Countdown Gate (when user opted into softLockUntilUnlock) */}
            {isSoftLockedNow ? (
              <div className="capsule-locked-gate">
                <Lock size={28} className="capsule-locked-gate__icon" aria-hidden="true" />
                <h3>This Time Capsule is Sealed Until {formatShortDate(activeCapsule.unlockAt)}</h3>
                <p>
                  <strong>{daysUntilUnlock} days remaining.</strong> Keep watching, rating, and
                  completing anime in your library — when you return, Solfain will compare your
                  old snapshot against your future taste.
                </p>
                <div className="capsule-locked-gate__actions">
                  <button
                    type="button"
                    className="btn btn--secondary btn--compact"
                    onClick={() =>
                      setPeekedCapsuleIds((prev) => [...prev, activeCapsule.id])
                    }
                  >
                    <Eye size={14} aria-hidden="true" />
                    <span>Peek &amp; Compare Early</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--compact"
                    onClick={() => unsealTimeCapsule(activeCapsule.id)}
                  >
                    <Unlock size={14} aria-hidden="true" />
                    <span>Unseal Permanently Now</span>
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Sub-Navigation Tabs + Compare Target Selector */}
                <div className="capsule-tabs-bar">
                  <div
                    className="segmented-control"
                    role="tablist"
                    aria-label="Time capsule view mode"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={inspectorTab === 'compare'}
                      className={`segmented-control__btn${
                        inspectorTab === 'compare'
                          ? ' segmented-control__btn--active'
                          : ''
                      }`}
                      onClick={() => setInspectorTab('compare')}
                    >
                      Before &amp; After Compare
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={inspectorTab === 'card'}
                      className={`segmented-control__btn${
                        inspectorTab === 'card'
                          ? ' segmented-control__btn--active'
                          : ''
                      }`}
                      onClick={() => setInspectorTab('card')}
                    >
                      <Share2 size={13} aria-hidden="true" />
                      <span>Shareable Card</span>
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={inspectorTab === 'snapshot'}
                      className={`segmented-control__btn${
                        inspectorTab === 'snapshot'
                          ? ' segmented-control__btn--active'
                          : ''
                      }`}
                      onClick={() => setInspectorTab('snapshot')}
                    >
                      Original Snapshot
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={inspectorTab === 'reminders'}
                      className={`segmented-control__btn${
                        inspectorTab === 'reminders'
                          ? ' segmented-control__btn--active'
                          : ''
                      }`}
                      onClick={() => setInspectorTab('reminders')}
                    >
                      Reminders &amp; Manage
                    </button>
                  </div>

                  {(inspectorTab === 'compare' || inspectorTab === 'card') &&
                    capsules.length > 1 && (
                      <div className="capsule-compare-target">
                        <label htmlFor="compare-target-select">Compare against:</label>
                        <select
                          id="compare-target-select"
                          className="field-select"
                          value={compareAgainstId}
                          onChange={(e) => setCompareAgainstId(e.target.value)}
                        >
                          <option value="live">Current Live Library (Now)</option>
                          {capsules
                            .filter((c) => c.id !== activeCapsule.id)
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.title} ({formatShortDate(c.createdAt)})
                              </option>
                            ))}
                        </select>
                      </div>
                    )}
                </div>

                {/* TAB 1: BEFORE & AFTER COMPARE */}
                {inspectorTab === 'compare' && (
                  <div className="capsule-compare-grid">
                    {/* Overview Metric Strip */}
                    <div className="capsule-overview-cards">
                      <div className="capsule-stat-card">
                        <div className="capsule-stat-card__label">
                          <Crown size={14} aria-hidden="true" />
                          <span>#1 Crown Favorite</span>
                        </div>
                        <div className="capsule-stat-card__pair">
                          <span>
                            {activeComparison.crownComparison.thenPick?.title ?? 'None'}
                          </span>
                          <ArrowRight size={13} aria-hidden="true" />
                          <strong>
                            {activeComparison.crownComparison.nowPick?.title ?? 'None'}
                          </strong>
                        </div>
                        <div className="capsule-stat-card__foot">
                          {activeComparison.crownComparison.sameCrown
                            ? 'Unchanged — still your #1 favorite'
                            : activeComparison.crownComparison.thenPick
                              ? activeComparison.crownComparison.thenPickStillFavorited
                                ? 'New #1 crowned (old #1 still in Favorites)'
                                : 'Taste shifted to a new #1 pick'
                              : 'Compare your top spotlight'}
                        </div>
                      </div>

                      <div className="capsule-stat-card">
                        <div className="capsule-stat-card__label">
                          <Award size={14} aria-hidden="true" />
                          <span>Favorites Overlap</span>
                        </div>
                        <div className="capsule-stat-card__pair">
                          <span>{activeComparison.favoritesDiff.thenCount}</span>
                          <ArrowRight size={13} aria-hidden="true" />
                          <strong>{activeComparison.favoritesDiff.nowCount}</strong>
                        </div>
                        <div className="capsule-stat-card__foot">
                          {activeComparison.favoritesDiff.retentionRate !== null
                            ? `${activeComparison.favoritesDiff.retentionRate}% kept · +${activeComparison.favoritesDiff.added.length} new · -${activeComparison.favoritesDiff.removed.length} dropped`
                            : `+${activeComparison.favoritesDiff.added.length} new favorites added`}
                        </div>
                      </div>

                      <div className="capsule-stat-card">
                        <div className="capsule-stat-card__label">
                          <Star size={14} aria-hidden="true" />
                          <span>Personal Mean Score</span>
                        </div>
                        <div className="capsule-stat-card__pair">
                          <span>
                            {activeComparison.ratingsDiff.meanScoreThen !== null
                              ? `${activeComparison.ratingsDiff.meanScoreThen}/10`
                              : '—'}
                          </span>
                          <ArrowRight size={13} aria-hidden="true" />
                          <strong>
                            {activeComparison.ratingsDiff.meanScoreNow !== null
                              ? `${activeComparison.ratingsDiff.meanScoreNow}/10`
                              : '—'}
                          </strong>
                        </div>
                        <div className="capsule-stat-card__foot">
                          {activeComparison.ratingsDiff.scoreChanges.length} re-rated ·{' '}
                          {activeComparison.ratingsDiff.newlyRated.length} newly scored
                        </div>
                      </div>

                      <div className="capsule-stat-card">
                        <div className="capsule-stat-card__label">
                          <CheckCircle2 size={14} aria-hidden="true" />
                          <span>Completed Series</span>
                        </div>
                        <div className="capsule-stat-card__pair">
                          <span>{activeComparison.completedDiff.completedCountThen}</span>
                          <ArrowRight size={13} aria-hidden="true" />
                          <strong>{activeComparison.completedDiff.completedCountNow}</strong>
                        </div>
                        <div className="capsule-stat-card__foot">
                          {activeComparison.completedDiff.episodesLoggedThen} →{' '}
                          {activeComparison.completedDiff.episodesLoggedNow} episodes watched
                        </div>
                      </div>
                    </div>

                    {/* Detailed Section 1: Favorites Then vs Now */}
                    <div className="capsule-diff-block">
                      <h3 className="capsule-diff-block__title">
                        1. Favorites: Old vs. New
                      </h3>
                      <div className="capsule-three-cols">
                        <div className="capsule-diff-col">
                          <h4>
                            Held Up ({activeComparison.favoritesDiff.kept.length})
                          </h4>
                          {activeComparison.favoritesDiff.kept.length > 0 ? (
                            <ul className="capsule-mini-list">
                              {activeComparison.favoritesDiff.kept.map((item) => (
                                <li key={item.id}>
                                  <Link to={`/anime/${item.id}`}>{item.title}</Link>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="capsule-empty-copy">
                              No overlapping favorites between snapshots yet.
                            </p>
                          )}
                        </div>

                        <div className="capsule-diff-col">
                          <h4>
                            New Favorites Added ({activeComparison.favoritesDiff.added.length})
                          </h4>
                          {activeComparison.favoritesDiff.added.length > 0 ? (
                            <ul className="capsule-mini-list">
                              {activeComparison.favoritesDiff.added.map((item) => (
                                <li key={item.id}>
                                  <Link to={`/anime/${item.id}`}>{item.title}</Link>
                                  <span className="capsule-badge-pos">NEW</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="capsule-empty-copy">
                              No new favorites added since snapshot date.
                            </p>
                          )}
                        </div>

                        <div className="capsule-diff-col">
                          <h4>
                            Moved On From ({activeComparison.favoritesDiff.removed.length})
                          </h4>
                          {activeComparison.favoritesDiff.removed.length > 0 ? (
                            <ul className="capsule-mini-list">
                              {activeComparison.favoritesDiff.removed.map((item) => (
                                <li key={item.id}>
                                  <Link to={`/anime/${item.id}`}>{item.title}</Link>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="capsule-empty-copy">
                              Every favorite from this snapshot is still saved!
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Detailed Section 2: Ratings Comparison */}
                    <div className="capsule-diff-block">
                      <h3 className="capsule-diff-block__title">
                        2. Personal Ratings (1–10): Re-Evaluations &amp; New Scores
                      </h3>
                      <div className="capsule-two-cols">
                        <div className="capsule-diff-col">
                          <h4>
                            Score Shifts ({activeComparison.ratingsDiff.scoreChanges.length})
                          </h4>
                          {activeComparison.ratingsDiff.scoreChanges.length > 0 ? (
                            <ul className="capsule-mini-list">
                              {activeComparison.ratingsDiff.scoreChanges.map((entry) => (
                                <li key={entry.anime.id}>
                                  <Link to={`/anime/${entry.anime.id}`}>
                                    {entry.anime.title}
                                  </Link>
                                  <span
                                    className={
                                      entry.delta > 0
                                        ? 'capsule-badge-pos'
                                        : 'capsule-badge-neg'
                                    }
                                  >
                                    {entry.oldScore}/10 → {entry.newScore}/10 (
                                    {entry.delta > 0 ? `+${entry.delta}` : entry.delta})
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="capsule-empty-copy">
                              No score changes on previously rated series (
                              {activeComparison.ratingsDiff.unchangedScores.length} held steady).
                            </p>
                          )}
                        </div>

                        <div className="capsule-diff-col">
                          <h4>
                            Newly Rated Since Snapshot (
                            {activeComparison.ratingsDiff.newlyRated.length})
                          </h4>
                          {activeComparison.ratingsDiff.newlyRated.length > 0 ? (
                            <ul className="capsule-mini-list">
                              {activeComparison.ratingsDiff.newlyRated.map((entry) => (
                                <li key={entry.anime.id}>
                                  <Link to={`/anime/${entry.anime.id}`}>
                                    {entry.anime.title}
                                  </Link>
                                  <span className="capsule-badge-neutral">
                                    {entry.newScore}/10 ★
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="capsule-empty-copy">
                              Score series on your{' '}
                              <Link to="/favorites?tab=all_tracked">Watchlist</Link> to see new
                              rating additions here.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Detailed Section 3: Completed Series Diff */}
                    <div className="capsule-diff-block">
                      <h3 className="capsule-diff-block__title">
                        3. Completed Series Progress
                      </h3>
                      <div className="capsule-two-cols">
                        <div className="capsule-diff-col">
                          <h4>
                            Graduated From Snapshot Backlog (
                            {activeComparison.completedDiff.newlyCompletedFromBacklog.length})
                          </h4>
                          {activeComparison.completedDiff.newlyCompletedFromBacklog.length >
                          0 ? (
                            <ul className="capsule-mini-list">
                              {activeComparison.completedDiff.newlyCompletedFromBacklog.map(
                                (entry) => (
                                  <li key={entry.anime.id}>
                                    <Link to={`/anime/${entry.anime.id}`}>
                                      {entry.anime.title}
                                    </Link>
                                    <span className="capsule-badge-pos">
                                      Was {WATCHLIST_STATUS_LABELS[entry.previousStatus]} →
                                      Completed
                                      {entry.newScore ? ` (${entry.newScore}/10)` : ''}
                                    </span>
                                  </li>
                                ),
                              )}
                            </ul>
                          ) : (
                            <p className="capsule-empty-copy">
                              None of the Watching / Plan-to-Watch titles from that snapshot have
                              been marked Completed yet.
                            </p>
                          )}
                        </div>

                        <div className="capsule-diff-col">
                          <h4>
                            Brand-New Completions (
                            {activeComparison.completedDiff.newlyCompletedFresh.length})
                          </h4>
                          {activeComparison.completedDiff.newlyCompletedFresh.length > 0 ? (
                            <ul className="capsule-mini-list">
                              {activeComparison.completedDiff.newlyCompletedFresh.map(
                                (entry) => (
                                  <li key={entry.anime.id}>
                                    <Link to={`/anime/${entry.anime.id}`}>
                                      {entry.anime.title}
                                    </Link>
                                    <span className="capsule-badge-neutral">
                                      Completed
                                      {entry.newScore ? ` · ${entry.newScore}/10` : ''}
                                    </span>
                                  </li>
                                ),
                              )}
                            </ul>
                          ) : (
                            <p className="capsule-empty-copy">
                              No brand-new completed series added since snapshot date.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Detailed Section 4: Predictions Review & Grading */}
                    <div className="capsule-diff-block">
                      <div className="capsule-diff-block__head-row">
                        <h3 className="capsule-diff-block__title">
                          4. Predictions Scorecard ({activeComparison.predictionsSummary.hit}/
                          {activeComparison.predictionsSummary.total} Came True)
                        </h3>
                      </div>

                      {activeComparison.predictionsSummary.items.length > 0 ? (
                        <ul className="capsule-predictions-review">
                          {activeComparison.predictionsSummary.items.map((pred) => (
                            <li key={pred.id} className="capsule-prediction-card">
                              <div className="capsule-prediction-card__body">
                                <div className="capsule-prediction-card__tags">
                                  <span className="capsule-pred-tag">
                                    {PREDICTION_CATEGORY_LABELS[pred.category]}
                                  </span>
                                  {pred.linkedAnime && (
                                    <Link
                                      to={`/anime/${pred.linkedAnime.id}`}
                                      className="capsule-pred-linked"
                                    >
                                      {pred.linkedAnime.title}
                                    </Link>
                                  )}
                                  {pred.linkedAnime &&
                                    (pred.liveStatusNow ||
                                      pred.liveScoreNow !== null ||
                                      pred.liveFavoritedNow) && (
                                      <span className="capsule-pred-live-hint">
                                        Now:{' '}
                                        {[
                                          pred.liveStatusNow
                                            ? WATCHLIST_STATUS_LABELS[pred.liveStatusNow]
                                            : null,
                                          pred.liveScoreNow !== null
                                            ? `${pred.liveScoreNow}/10 ★`
                                            : null,
                                          pred.liveFavoritedNow ? 'In Favorites' : null,
                                        ]
                                          .filter(Boolean)
                                          .join(' · ')}
                                      </span>
                                    )}
                                </div>
                                <p className="capsule-prediction-card__statement">
                                  “{pred.text}”
                                </p>
                              </div>

                              <div
                                className="capsule-prediction-card__verdicts"
                                role="group"
                                aria-label={`Mark outcome for prediction: ${pred.text}`}
                              >
                                {(
                                  ['hit', 'partial', 'miss', 'pending'] as PredictionOutcome[]
                                ).map((outcome) => (
                                  <button
                                    key={outcome}
                                    type="button"
                                    className={`capsule-verdict-btn capsule-verdict-btn--${outcome}${
                                      pred.outcome === outcome
                                        ? ' capsule-verdict-btn--active'
                                        : ''
                                    }`}
                                    onClick={() =>
                                      updatePredictionOutcome(
                                        activeCapsule.id,
                                        pred.id,
                                        outcome,
                                      )
                                    }
                                  >
                                    {PREDICTION_OUTCOME_LABELS[outcome]}
                                  </button>
                                ))}
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="capsule-empty-copy">
                          No predictions were recorded when sealing this snapshot.
                        </p>
                      )}
                    </div>

                    {/* Notes & Revisit Reflection */}
                    <div className="capsule-diff-block">
                      <h3 className="capsule-diff-block__title">
                        5. Time Capsule Notes &amp; Reflection
                      </h3>
                      <div className="capsule-two-cols">
                        <div className="capsule-diff-col">
                          <h4>
                            Note Written on {formatShortDate(activeCapsule.createdAt)}
                          </h4>
                          {activeCapsule.noteToFutureSelf ? (
                            <blockquote className="capsule-quote">
                              {activeCapsule.noteToFutureSelf}
                            </blockquote>
                          ) : (
                            <p className="capsule-empty-copy">
                              No note to future self was attached to this capsule.
                            </p>
                          )}
                        </div>

                        <div className="capsule-diff-col">
                          <h4>Revisit Reflection (Looking Back)</h4>
                          <textarea
                            aria-label="Revisit reflection note"
                            className="field-input capsule-textarea"
                            rows={3}
                            maxLength={1200}
                            placeholder="Looking back at this snapshot, what surprised you most about how your anime taste changed?"
                            value={reflectionDraft}
                            onChange={(e) => {
                              setReflectionDraft(e.target.value);
                              setReflectionSaved(false);
                            }}
                          />
                          <div style={{ marginTop: '8px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <button
                              type="button"
                              className="btn btn--secondary btn--compact"
                              onClick={() => {
                                updateRevisitReflection(activeCapsule.id, reflectionDraft);
                                setReflectionSaved(true);
                              }}
                            >
                              <Check size={14} aria-hidden="true" />
                              <span>Save Reflection</span>
                            </button>
                            {reflectionSaved && (
                              <span style={{ fontSize: '0.8125rem', color: 'var(--accent-hover)' }}>
                                Reflection saved.
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: SHAREABLE BEFORE & AFTER CARD */}
                {inspectorTab === 'card' && (
                  <div className="capsule-card-tab">
                    <p className="section-subtitle" style={{ marginBottom: '14px' }}>
                      Export a high-resolution PNG card, copy a portable share link that renders
                      this comparison interactively on Solfain, or copy a text summary for chat.
                    </p>
                    <BeforeAfterCard payload={activeSharePayload} />
                  </div>
                )}

                {/* TAB 3: ORIGINAL SNAPSHOT ARCHIVE */}
                {inspectorTab === 'snapshot' && (
                  <div className="capsule-archive-tab">
                    <div className="capsule-two-cols">
                      <div className="capsule-diff-col">
                        <h4>
                          Frozen Favorites ({activeCapsule.favorites.length})
                        </h4>
                        {activeCapsule.favorites.length > 0 ? (
                          <ul className="capsule-mini-list">
                            {activeCapsule.favorites.map((fav) => (
                              <li key={fav.id}>
                                <Link to={`/anime/${fav.id}`}>{fav.title}</Link>
                                {activeCapsule.crownPick?.id === fav.id && (
                                  <span className="capsule-badge-pos">#1 Crown</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="capsule-empty-copy">
                            0 favorites were saved at snapshot time.
                          </p>
                        )}
                      </div>

                      <div className="capsule-diff-col">
                        <h4>
                          Frozen Watchlist &amp; Scores ({activeCapsule.watchlist.length})
                        </h4>
                        {activeCapsule.watchlist.length > 0 ? (
                          <ul className="capsule-mini-list">
                            {activeCapsule.watchlist.map((w) => (
                              <li key={w.id}>
                                <Link to={`/anime/${w.id}`}>{w.title}</Link>
                                <span className="capsule-badge-neutral">
                                  {WATCHLIST_STATUS_LABELS[w.status]}
                                  {w.personalScore !== null ? ` · ${w.personalScore}/10` : ''}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="capsule-empty-copy">
                            0 watchlist entries were tracked at snapshot time.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 4: SCHEDULED REMINDERS & MANAGE */}
                {inspectorTab === 'reminders' && (
                  <div className="capsule-reminders-tab">
                    <div className="capsule-diff-block">
                      <h3 className="capsule-diff-block__title">
                        Scheduled Reminder Settings
                      </h3>

                      <label className="capsule-checkbox-row">
                        <input
                          type="checkbox"
                          checked={activeCapsule.reminder.enabled}
                          onChange={(e) =>
                            updateCapsuleReminder(activeCapsule.id, {
                              enabled: e.target.checked,
                            })
                          }
                        />
                        <span>Enable scheduled revisit reminder for this capsule</span>
                      </label>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                          gap: '14px',
                          marginTop: '12px',
                        }}
                      >
                        <div>
                          <label
                            htmlFor="edit-remind-date"
                            className="capsule-sublabel"
                          >
                            Scheduled Reminder Date
                          </label>
                          <input
                            id="edit-remind-date"
                            type="date"
                            className="field-input"
                            value={toDateInputString(activeCapsule.reminder.remindAt)}
                            onChange={(e) => {
                              const parsed = parseDateInputToNoonMs(e.target.value);
                              if (parsed) {
                                updateCapsuleReminder(activeCapsule.id, {
                                  remindAt: parsed,
                                });
                              }
                            }}
                          />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', justifyContent: 'center' }}>
                          <label className="capsule-checkbox-row">
                            <input
                              type="checkbox"
                              checked={activeCapsule.reminder.inAppBanner}
                              onChange={(e) =>
                                updateCapsuleReminder(activeCapsule.id, {
                                  inAppBanner: e.target.checked,
                                })
                              }
                            />
                            <span>Show In-App Due Banner &amp; Header Badge</span>
                          </label>

                          <label className="capsule-checkbox-row">
                            <input
                              type="checkbox"
                              checked={activeCapsule.reminder.browserNotification}
                              disabled={notificationPermission === 'unsupported'}
                              onChange={async (e) => {
                                if (e.target.checked) {
                                  const ok = await requestBrowserNotificationPermission();
                                  updateCapsuleReminder(activeCapsule.id, {
                                    browserNotification: ok,
                                  });
                                } else {
                                  updateCapsuleReminder(activeCapsule.id, {
                                    browserNotification: false,
                                  });
                                }
                              }}
                            />
                            <span>Send Browser Notification on Due Date</span>
                          </label>
                        </div>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '10px',
                          marginTop: '16px',
                          paddingTop: '14px',
                          borderTop: '1px solid var(--border-subtle)',
                        }}
                      >
                        <button
                          type="button"
                          className="btn btn--secondary btn--compact"
                          onClick={() => downloadCapsuleReminderIcs(activeCapsule)}
                        >
                          <Calendar size={14} aria-hidden="true" />
                          <span>Download .ics Calendar Event</span>
                        </button>

                        {activeCapsule.reminder.enabled &&
                          Date.now() >= activeCapsule.reminder.remindAt && (
                            <button
                              type="button"
                              className="btn btn--ghost btn--compact"
                              onClick={() => snoozeCapsuleReminder(activeCapsule.id)}
                            >
                              <Clock size={14} aria-hidden="true" />
                              <span>Snooze Reminder 7 Days</span>
                            </button>
                          )}

                        <button
                          type="button"
                          className="btn btn--ghost btn--compact"
                          style={{ color: '#F87171', marginLeft: 'auto' }}
                          onClick={() => {
                            deleteTimeCapsule(activeCapsule.id);
                          }}
                        >
                          <Trash2 size={14} aria-hidden="true" />
                          <span>Delete Capsule</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      ) : (
        !showComposer && (
          <div className="capsule-empty-vault">
            <Archive size={28} aria-hidden="true" />
            <h2>No Time Capsules Sealed Yet</h2>
            <p>
              Take a snapshot of your anime favorites, personal ratings, completed series, and
              predictions today — then revisit in 6 months or a year.
            </p>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => setShowComposer(true)}
            >
              <Plus size={15} aria-hidden="true" />
              <span>Create Your First Time Capsule</span>
            </button>
          </div>
        )
      )}

      <div style={{ marginTop: '36px' }}>
        <AdSlot placement="capsule-bottom-rectangle" />
      </div>
    </div>
  );
}
