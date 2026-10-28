import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { TimeCapsuleReminderBanner } from '../components/timeCapsule/TimeCapsuleReminderBanner';
import { TimeCapsulePage } from '../pages/TimeCapsulePage';
import {
  addFavorite,
  removeFavorite,
  resetFavoritesCacheForTests,
} from '../services/storage/favoritesStore';
import { resetHistoryCacheForTests } from '../services/storage/historyStore';
import {
  createLibraryBackupPayload,
  importLibraryBackupJson,
} from '../services/storage/libraryBackup';
import {
  markEpisodeWatched,
  resetWatchedEpisodesCacheForTests,
} from '../services/storage/watchedEpisodesStore';
import {
  resetWatchlistCacheForTests,
  setWatchlistStatus,
  updateWatchlistDetails,
} from '../services/storage/watchlistStore';
import {
  buildCapsuleReminderIcs,
  compareCapsuleToLiveLibrary,
  comparisonToShareablePayload,
  decodeShareableCardPayload,
  encodeShareableCardPayload,
  formatBeforeAfterSummaryText,
} from '../services/timeCapsule/timeCapsuleCompare';
import {
  addCalendarMonths,
  createTimeCapsule,
  getDueReminderCapsules,
  getTimeCapsules,
  resetTimeCapsulesCacheForTests,
  snoozeCapsuleReminder,
  updatePredictionOutcome,
} from '../services/timeCapsule/timeCapsuleStore';
import type { AnimeSummary } from '../types/anime';

function makeAnime(id: number, title: string, episodes = 13): AnimeSummary {
  return {
    id,
    idMal: id + 1000,
    title: { romaji: title, english: title, native: title },
    coverImage: {
      extraLarge: `https://s4.anilist.co/file/${id}.png`,
      large: `https://s4.anilist.co/file/${id}.png`,
      medium: `https://s4.anilist.co/file/${id}.png`,
      color: '#8b5cf6',
    },
    bannerImage: null,
    format: 'TV',
    status: 'FINISHED',
    episodes,
    duration: 24,
    season: 'WINTER',
    seasonYear: 2024,
    startDate: { year: 2024, month: 1, day: 1 },
    averageScore: 84,
    popularity: 250000,
    genres: ['Drama', 'Romance'],
    isAdult: false,
    nextAiringEpisode: null,
    studios: { edges: [] },
  };
}

describe('Anime Time Capsule — Snapshots, Before/After Diffs, Reminders & Shareable Cards', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetFavoritesCacheForTests();
    resetWatchlistCacheForTests();
    resetWatchedEpisodesCacheForTests();
    resetHistoryCacheForTests();
    resetTimeCapsulesCacheForTests();
  });

  it('computes accurate 6-month and 1-year calendar horizons including month-end clamping', () => {
    const aug31 = new Date(2026, 7, 31, 12, 0, 0).getTime(); // Aug 31, 2026
    const sixMonthsLater = new Date(addCalendarMonths(aug31, 6));
    expect(sixMonthsLater.getFullYear()).toBe(2027);
    expect(sixMonthsLater.getMonth()).toBe(1); // February
    expect(sixMonthsLater.getDate()).toBe(28); // Clamped cleanly to Feb 28, 2027

    const oneYearLater = new Date(addCalendarMonths(aug31, 12));
    expect(oneYearLater.getFullYear()).toBe(2027);
    expect(oneYearLater.getMonth()).toBe(7); // August
    expect(oneYearLater.getDate()).toBe(31);
  });

  it('compares old vs. new favorites, personal ratings, predictions, and completed series accurately', () => {
    const horimiya = makeAnime(124080, 'Horimiya', 13);
    const steinsGate = makeAnime(9253, 'Steins;Gate', 24);
    const toradora = makeAnime(4224, 'Toradora!', 25);
    const frieren = makeAnime(154587, 'Frieren: Beyond Journey’s End', 28);

    // Day 1 state (Oct 28, 2026)
    const sealTimeMs = new Date(2026, 9, 28, 12, 0, 0).getTime();
    addFavorite(horimiya);
    addFavorite(toradora);

    setWatchlistStatus(horimiya, 'watching');
    updateWatchlistDetails(horimiya.id, { watchedEpisodes: 6, personalScore: 8 });

    setWatchlistStatus(steinsGate, 'plan_to_watch');

    setWatchlistStatus(toradora, 'completed');
    updateWatchlistDetails(toradora.id, { personalScore: 7 });

    const capsule = createTimeCapsule({
      title: 'Fall 2026 Snapshot',
      horizonPreset: '6m',
      nowMs: sealTimeMs,
      noteToFutureSelf: 'Loving romance and sci-fi thrillers right now.',
      predictions: [
        {
          category: 'completion',
          text: 'I will finish Steins;Gate and give it at least a 9/10.',
          linkedAnime: {
            id: steinsGate.id,
            idMal: steinsGate.idMal,
            title: 'Steins;Gate',
            romajiTitle: 'Steins;Gate',
            coverImage: null,
            coverColor: null,
            format: 'TV',
            seasonYear: 2011,
            episodes: 24,
          },
        },
      ],
    });

    // Simulate library 6 months later (Apr 28, 2027):
    // 1. Toradora removed from Favorites; Frieren added as new Favorite
    removeFavorite(toradora.id);
    addFavorite(frieren);

    // 2. Horimiya completed and re-rated 8 -> 10 (+2)
    updateWatchlistDetails(horimiya.id, {
      status: 'completed',
      watchedEpisodes: 13,
      personalScore: 10,
    });

    // 3. Steins;Gate graduated from Plan to Watch -> Completed (9/10)
    updateWatchlistDetails(steinsGate.id, {
      status: 'completed',
      watchedEpisodes: 24,
      personalScore: 9,
    });

    // 4. Frieren newly added & completed (10/10) + extra episode progress
    setWatchlistStatus(frieren, 'completed');
    updateWatchlistDetails(frieren.id, { personalScore: 10 });
    markEpisodeWatched(99999, 1);

    // 5. Mark prediction as Came True
    updatePredictionOutcome(capsule.id, capsule.predictions[0]!.id, 'hit');
    const updatedCapsule = getTimeCapsules().find((c) => c.id === capsule.id)!;

    const revisitMs = addCalendarMonths(sealTimeMs, 6);
    const diff = compareCapsuleToLiveLibrary(updatedCapsule, revisitMs);

    // Favorites diff
    expect(diff.favoritesDiff.kept.map((a) => a.title)).toEqual(['Horimiya']);
    expect(diff.favoritesDiff.added.map((a) => a.title)).toEqual([
      'Frieren: Beyond Journey’s End',
    ]);
    expect(diff.favoritesDiff.removed.map((a) => a.title)).toEqual(['Toradora!']);
    expect(diff.favoritesDiff.retentionRate).toBe(50);

    // Ratings diff (Then: Horimiya 8, Toradora 7 -> mean 7.5; Now: Horimiya 10, Steins;Gate 9, Frieren 10, Toradora 7 -> mean 9.0)
    expect(diff.ratingsDiff.meanScoreThen).toBe(7.5);
    expect(diff.ratingsDiff.meanScoreNow).toBe(9);
    expect(diff.ratingsDiff.meanScoreDelta).toBe(1.5);
    expect(diff.ratingsDiff.scoreChanges).toHaveLength(1);
    expect(diff.ratingsDiff.scoreChanges[0]).toMatchObject({
      oldScore: 8,
      newScore: 10,
      delta: 2,
    });
    expect(diff.ratingsDiff.newlyRated.map((n) => n.anime.title)).toContain(
      'Steins;Gate',
    );

    // Completed series diff
    expect(diff.completedDiff.completedCountThen).toBe(1);
    expect(diff.completedDiff.completedCountNow).toBe(4);
    expect(diff.completedDiff.completedDelta).toBe(3);
    expect(
      diff.completedDiff.newlyCompletedFromBacklog.map((c) => ({
        title: c.anime.title,
        from: c.previousStatus,
      })),
    ).toEqual(
      expect.arrayContaining([
        { title: 'Horimiya', from: 'watching' },
        { title: 'Steins;Gate', from: 'plan_to_watch' },
      ]),
    );
    expect(
      diff.completedDiff.newlyCompletedFresh.map((c) => c.anime.title),
    ).toEqual(['Frieren: Beyond Journey’s End']);

    // Predictions scorecard + live linked anime status
    expect(diff.predictionsSummary.hit).toBe(1);
    expect(diff.predictionsSummary.items[0]?.liveStatusNow).toBe('completed');
    expect(diff.predictionsSummary.items[0]?.liveScoreNow).toBe(9);
  });

  it('generates valid .ics calendar reminders and surfaces/snoozes scheduled due banners', () => {
    const pastCreate = Date.now() - 200 * 86_400_000;
    const pastDue = Date.now() - 3600_000;

    const capsule = createTimeCapsule({
      title: 'Six Month Check-In',
      horizonPreset: 'custom',
      customUnlockAt: pastCreate + 86_400_000,
      nowMs: pastCreate,
      reminder: {
        enabled: true,
        remindAt: pastDue,
        inAppBanner: true,
        browserNotification: false,
      },
    });

    const ics = buildCapsuleReminderIcs(capsule, 'https://solfain.example');
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('SUMMARY:Unseal Anime Time Capsule: Six Month Check-In');
    expect(ics).toContain('TRIGGER:-P1D');
    expect(ics).toContain(`/time-capsule?capsule=${capsule.id}`);

    // Reminder is due right now
    expect(getDueReminderCapsules(getTimeCapsules())).toHaveLength(1);

    render(
      <MemoryRouter initialEntries={['/']}>
        <TimeCapsuleReminderBanner />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Time Capsule Ready:/i)).toBeInTheDocument();
    expect(screen.getByText(/Six Month Check-In/i)).toBeInTheDocument();

    // Snoozing for 7 days hides the due reminder until snooze expires
    act(() => {
      snoozeCapsuleReminder(capsule.id);
    });
    expect(getDueReminderCapsules(getTimeCapsules())).toHaveLength(0);
  });

  it('encodes & decodes shareable Before-and-After cards safely and renders shared links', async () => {
    const horimiya = makeAnime(124080, 'Horimiya', 13);
    addFavorite(horimiya);
    setWatchlistStatus(horimiya, 'completed');
    updateWatchlistDetails(horimiya.id, { personalScore: 9 });

    const cap = createTimeCapsule({
      title: '2026 Yearly Taste Card',
      horizonPreset: '1y',
      predictions: [
        { category: 'aoty', text: 'Horimiya stays in my top 3 all year' },
      ],
    });
    updatePredictionOutcome(cap.id, cap.predictions[0]!.id, 'hit');

    const latestCap = getTimeCapsules()[0]!;
    const comparison = compareCapsuleToLiveLibrary(latestCap);
    const payload = comparisonToShareablePayload(comparison);
    const encoded = encodeShareableCardPayload(payload);

    const decoded = decodeShareableCardPayload(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded?.title).toBe('2026 Yearly Taste Card');
    expect(decoded?.crownThen?.title).toBe('Horimiya');
    expect(decoded?.predHit).toBe(1);

    // Rejects malformed / non-base64url input safely
    expect(decodeShareableCardPayload('<script>alert(1)</script>')).toBeNull();

    const textCard = formatBeforeAfterSummaryText(payload, 'https://solfain.app/time-capsule');
    expect(textCard).toContain('SOLFAIN · ANIME TIME CAPSULE — 2026 Yearly Taste Card');
    expect(textCard).toContain('Predictions: 1/1 Came True');

    render(
      <MemoryRouter initialEntries={[`/time-capsule?share=${encoded}`]}>
        <Routes>
          <Route path="/time-capsule" element={<TimeCapsulePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: /Shared Before & After Card/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Before and After Time Capsule Card: 2026 Yearly Taste Card/i),
    ).toBeInTheDocument();
  });

  it('creates a capsule interactively via /time-capsule UI and preserves capsules in Library Backup JSON', async () => {
    const horimiya = makeAnime(124080, 'Horimiya', 13);
    addFavorite(horimiya);

    render(
      <MemoryRouter initialEntries={['/time-capsule']}>
        <Routes>
          <Route path="/time-capsule" element={<TimeCapsulePage />} />
        </Routes>
      </MemoryRouter>,
    );

    const titleInput = screen.getByLabelText(/Capsule Title/i);
    fireEvent.change(titleInput, { target: { value: 'My Autumn Capsule' } });

    fireEvent.click(screen.getByRole('button', { name: /In 1 Year/i }));

    const predInput = screen.getByLabelText(/Prediction statement/i);
    fireEvent.change(predInput, {
      target: { value: 'I will complete 10 romance anime this year' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Add$/i }));

    fireEvent.click(
      screen.getByRole('button', { name: /Seal Time Capsule Snapshot/i }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'My Autumn Capsule' }),
      ).toBeInTheDocument();
    });

    // Grade prediction Came True right inside the inspector
    fireEvent.click(screen.getByRole('button', { name: 'Came True' }));
    expect(screen.getByText(/1\/1 Came True/i)).toBeInTheDocument();

    // Backup export + import roundtrip preserves Time Capsules
    const exportedJson = createLibraryBackupPayload();
    window.localStorage.clear();
    resetTimeCapsulesCacheForTests();
    expect(getTimeCapsules()).toHaveLength(0);

    let importedCount = 0;
    act(() => {
      const summary = importLibraryBackupJson(exportedJson);
      importedCount = summary.importedTimeCapsules;
    });
    expect(importedCount).toBe(1);
    expect(getTimeCapsules()[0]?.title).toBe('My Autumn Capsule');
  });
});
