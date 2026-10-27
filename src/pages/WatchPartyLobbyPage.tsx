import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Film,
  Lock,
  Radio,
  Search,
  ShieldCheck,
  Users,
  Video,
  X,
} from 'lucide-react';
import { AdSlot } from '../components/monetization/SponsorSlot';
import { getAnimeDetails, searchAnime } from '../services/anilist/anilistService';
import {
  checkWatchPartyHealth,
  createWatchPartyRoom,
  fetchWatchPartyRoomPreview,
  getSavedPartyNickname,
  normalizePartyRoomCode,
} from '../services/watchParty/watchPartyClient';
import type { AnimeSummary } from '../types/anime';
import type { AudioTrack } from '../types/provider';
import type {
  PartyControlPolicy,
  PartyRoomPreview,
  PartySourceType,
} from '../types/watchParty';
import { useDebouncedValue } from '../utils/debounce';
import { formatMediaFormat, getDisplayTitle, getReleaseYear } from '../utils/format';
import { sanitizeHttpUrl } from '../utils/security';

export function WatchPartyLobbyPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const prefillAnimeId = Number.parseInt(searchParams.get('animeId') ?? '', 10);
  const prefillEp = Number.parseInt(searchParams.get('ep') ?? '', 10);
  const prefillAudio: AudioTrack = searchParams.get('audio') === 'dub' ? 'dub' : 'sub';

  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>(
    'checking',
  );
  const [hostName, setHostName] = useState(() => getSavedPartyNickname() || '');
  const [roomTitle, setRoomTitle] = useState('');
  const [passcode, setPasscode] = useState('');
  const [controlPolicy, setControlPolicy] = useState<PartyControlPolicy>('host_only');
  const [sourceType, setSourceType] = useState<PartySourceType>('yenime');

  // Yenime anime selection
  const [selectedAnime, setSelectedAnime] = useState<AnimeSummary | null>(null);
  const [episode, setEpisode] = useState<number>(
    Number.isInteger(prefillEp) && prefillEp >= 1 ? prefillEp : 1,
  );
  const [audio, setAudio] = useState<AudioTrack>(prefillAudio);
  const [animeQuery, setAnimeQuery] = useState('');
  const debouncedAnimeQuery = useDebouncedValue(animeQuery.trim(), 320);
  const [animeResults, setAnimeResults] = useState<AnimeSummary[]>([]);
  const [searchingAnime, setSearchingAnime] = useState(false);

  // Direct stream selection
  const [directVideoUrl, setDirectVideoUrl] = useState('');
  const [streamTitle, setStreamTitle] = useState('');

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Join room form
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const normalizedJoinCode = normalizePartyRoomCode(joinCodeInput);
  const debouncedJoinCode = useDebouncedValue(normalizedJoinCode, 300);
  const [joinPreview, setJoinPreview] = useState<PartyRoomPreview | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Watch Parties — Solfain';
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    checkWatchPartyHealth(controller.signal).then((res) => {
      if (!controller.signal.aborted) {
        setBackendStatus(res.ok ? 'online' : 'offline');
      }
    });
    return () => controller.abort();
  }, []);

  // Load prefilled anime when arriving from /anime/:id or /watch/:id
  useEffect(() => {
    if (!Number.isInteger(prefillAnimeId) || prefillAnimeId <= 0) return;
    const controller = new AbortController();
    getAnimeDetails(prefillAnimeId, { signal: controller.signal })
      .then((details) => {
        if (!controller.signal.aborted) {
          setSelectedAnime(details);
          setSourceType('yenime');
        }
      })
      .catch(() => {
        // Ignore if AniList unavailable
      });
    return () => controller.abort();
  }, [prefillAnimeId]);

  // Search AniList for anime picker
  useEffect(() => {
    if (debouncedAnimeQuery.length < 2) {
      setAnimeResults([]);
      setSearchingAnime(false);
      return;
    }
    const controller = new AbortController();
    setSearchingAnime(true);
    searchAnime({ query: debouncedAnimeQuery, page: 1, perPage: 6 }, { signal: controller.signal })
      .then((res) => {
        if (!controller.signal.aborted) {
          setAnimeResults(res.media.filter((m) => m.status !== 'NOT_YET_RELEASED'));
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

  // Preview room when typing invite code
  useEffect(() => {
    if (debouncedJoinCode.length < 4) {
      setJoinPreview(null);
      return;
    }
    const controller = new AbortController();
    fetchWatchPartyRoomPreview(debouncedJoinCode, controller.signal)
      .then((preview) => {
        if (!controller.signal.aborted) {
          setJoinPreview(preview);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setJoinPreview(null);
        }
      });
    return () => controller.abort();
  }, [debouncedJoinCode]);

  const handleCreateSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setCreateError(null);

    const trimmedName = hostName.trim();
    if (!trimmedName) {
      setCreateError('Please enter a display name.');
      return;
    }

    if (sourceType === 'yenime' && !selectedAnime) {
      setCreateError('Select an anime series from the search field first.');
      return;
    }

    if (sourceType === 'direct') {
      const cleanUrl = sanitizeHttpUrl(directVideoUrl, { httpsOnly: true });
      if (!cleanUrl) {
        setCreateError('Enter a valid HTTPS direct video stream URL (.mp4 / .webm).');
        return;
      }
    }

    setCreating(true);
    try {
      const created = await createWatchPartyRoom({
        hostName: trimmedName,
        roomTitle: roomTitle.trim() || undefined,
        passcode: passcode.trim() || undefined,
        controlPolicy,
        media:
          sourceType === 'yenime' && selectedAnime
            ? {
                sourceType: 'yenime',
                animeId: selectedAnime.id,
                idMal: selectedAnime.idMal ?? null,
                animeTitle: getDisplayTitle(selectedAnime.title),
                coverImage:
                  sanitizeHttpUrl(
                    selectedAnime.coverImage?.large ||
                      selectedAnime.coverImage?.extraLarge ||
                      selectedAnime.coverImage?.medium,
                    { httpsOnly: true },
                  ) ?? null,
                episode: Math.max(1, episode),
                totalEpisodes: selectedAnime.episodes ?? null,
                audio,
                idMode: 'anilist',
              }
            : {
                sourceType: 'direct',
                directVideoUrl: sanitizeHttpUrl(directVideoUrl, { httpsOnly: true })!,
                streamTitle: streamTitle.trim() || 'Direct Synced Video Stream',
              },
      });
      navigate(`/party/${created.room.roomId}`);
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : 'Unable to create watch party room.',
      );
    } finally {
      setCreating(false);
    }
  };

  const handleJoinSubmit = (event: FormEvent) => {
    event.preventDefault();
    setJoinError(null);
    if (!normalizedJoinCode || normalizedJoinCode.length < 4) {
      setJoinError('Enter a valid room invite code or invite link.');
      return;
    }
    navigate(`/party/${normalizedJoinCode}`);
  };

  const selectedCover = selectedAnime
    ? sanitizeHttpUrl(
        selectedAnime.coverImage?.medium || selectedAnime.coverImage?.large,
        { httpsOnly: true },
      )
    : null;

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
          <h1 className="page-header__title">Watch Parties</h1>
          <p className="page-header__desc">
            Create private rooms, invite friends by link or code, sync episodes and playback, and chat live.
          </p>
        </div>

        <div
          className={`party-health-badge${
            backendStatus === 'online'
              ? ' party-health-badge--online'
              : backendStatus === 'offline'
                ? ' party-health-badge--offline'
                : ''
          }`}
          role="status"
        >
          <Radio size={13} aria-hidden="true" />
          <span>
            {backendStatus === 'online'
              ? 'Real-Time WebSocket Hub Online'
              : backendStatus === 'offline'
                ? 'Real-Time Backend Unreachable'
                : 'Checking Real-Time Hub…'}
          </span>
        </div>
      </header>

      <div className="party-lobby-grid">
        <section className="party-card" aria-labelledby="create-party-heading">
          <div className="party-card__header">
            <h2 id="create-party-heading" className="section-title">
              Create Private Room
            </h2>
            <span className="section-subtitle">Unlisted · Invite-only</span>
          </div>

          <form className="party-form" onSubmit={(e) => void handleCreateSubmit(e)}>
            <div className="party-form__two-col">
              <div className="field-group">
                <label htmlFor="party-host-name" className="field-label">
                  Your Display Name
                </label>
                <input
                  id="party-host-name"
                  type="text"
                  maxLength={28}
                  required
                  className="field-input"
                  placeholder="e.g. Akira"
                  value={hostName}
                  onChange={(e) => setHostName(e.target.value)}
                />
              </div>

              <div className="field-group">
                <label htmlFor="party-room-title" className="field-label">
                  Room Title (Optional)
                </label>
                <input
                  id="party-room-title"
                  type="text"
                  maxLength={72}
                  className="field-input"
                  placeholder="e.g. Friday Night Anime"
                  value={roomTitle}
                  onChange={(e) => setRoomTitle(e.target.value)}
                />
              </div>
            </div>

            <div className="field-group">
              <span className="field-label">Video Source Mode</span>
              <div
                className="segmented-control"
                role="group"
                aria-label="Watch party video source mode"
                style={{ alignSelf: 'flex-start' }}
              >
                <button
                  type="button"
                  className={`segmented-control__btn${
                    sourceType === 'yenime' ? ' segmented-control__btn--active' : ''
                  }`}
                  aria-pressed={sourceType === 'yenime'}
                  onClick={() => setSourceType('yenime')}
                >
                  Anime Catalogue (Yenime)
                </button>
                <button
                  type="button"
                  className={`segmented-control__btn${
                    sourceType === 'direct' ? ' segmented-control__btn--active' : ''
                  }`}
                  aria-pressed={sourceType === 'direct'}
                  onClick={() => setSourceType('direct')}
                >
                  Direct Video Stream (MP4/WebM)
                </button>
              </div>
            </div>

            {sourceType === 'yenime' ? (
              <div className="party-source-box">
                {selectedAnime ? (
                  <div className="party-selected-anime">
                    <div className="party-selected-anime__main">
                      {selectedCover ? (
                        <img
                          src={selectedCover}
                          alt=""
                          className="party-selected-anime__poster"
                        />
                      ) : (
                        <div className="party-selected-anime__poster party-selected-anime__poster--fallback">
                          <Film size={15} aria-hidden="true" />
                        </div>
                      )}
                      <div>
                        <div className="party-selected-anime__title">
                          {getDisplayTitle(selectedAnime.title)}
                        </div>
                        <div className="party-selected-anime__meta">
                          {[
                            formatMediaFormat(selectedAnime.format),
                            getReleaseYear(selectedAnime),
                            selectedAnime.episodes
                              ? `${selectedAnime.episodes} episodes`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="btn btn--ghost btn--compact"
                      onClick={() => setSelectedAnime(null)}
                    >
                      <X size={14} aria-hidden="true" />
                      <span>Change</span>
                    </button>
                  </div>
                ) : (
                  <div className="field-group">
                    <label htmlFor="party-anime-search" className="field-label">
                      Select Anime Series or Film
                    </label>
                    <div className="search-input-wrap">
                      <Search
                        size={14}
                        className="search-input-wrap__icon"
                        aria-hidden="true"
                      />
                      <input
                        id="party-anime-search"
                        type="search"
                        className="field-input"
                        placeholder="Search AniList e.g. Horimiya, Frieren, Jujutsu Kaisen..."
                        value={animeQuery}
                        onChange={(e) => setAnimeQuery(e.target.value)}
                      />
                    </div>

                    {searchingAnime && (
                      <div className="party-picker-hint">Searching AniList…</div>
                    )}

                    {animeResults.length > 0 && (
                      <div className="party-picker-list" role="listbox" aria-label="Matching anime">
                        {animeResults.map((item) => {
                          const title = getDisplayTitle(item.title);
                          const thumb = sanitizeHttpUrl(
                            item.coverImage?.medium || item.coverImage?.large,
                            { httpsOnly: true },
                          );
                          return (
                            <button
                              key={item.id}
                              type="button"
                              className="party-picker-item"
                              onClick={() => {
                                setSelectedAnime(item);
                                setEpisode(1);
                                setAnimeQuery('');
                                setAnimeResults([]);
                              }}
                            >
                              {thumb ? (
                                <img src={thumb} alt="" className="party-picker-item__img" />
                              ) : (
                                <div className="party-picker-item__img" />
                              )}
                              <div className="party-picker-item__body">
                                <div className="party-picker-item__title">{title}</div>
                                <div className="party-picker-item__sub">
                                  {[
                                    formatMediaFormat(item.format),
                                    getReleaseYear(item),
                                    item.episodes ? `${item.episodes} eps` : null,
                                  ]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                <div className="party-form__two-col">
                  <div className="field-group">
                    <label htmlFor="party-ep-input" className="field-label">
                      Starting Episode
                    </label>
                    <input
                      id="party-ep-input"
                      type="number"
                      min={1}
                      max={selectedAnime?.episodes ?? 9999}
                      className="field-input"
                      value={episode}
                      onChange={(e) =>
                        setEpisode(Math.max(1, Number.parseInt(e.target.value || '1', 10) || 1))
                      }
                    />
                  </div>

                  <div className="field-group">
                    <label htmlFor="party-audio-select" className="field-label">
                      Audio Track
                    </label>
                    <select
                      id="party-audio-select"
                      className="field-select"
                      value={audio}
                      onChange={(e) => setAudio(e.target.value as AudioTrack)}
                    >
                      <option value="sub">Japanese (SUB)</option>
                      <option value="dub">English (DUB)</option>
                    </select>
                  </div>
                </div>
              </div>
            ) : (
              <div className="party-source-box">
                <div className="field-group">
                  <label htmlFor="party-direct-url" className="field-label">
                    Compatible HTTPS Video URL (.mp4 / .webm)
                  </label>
                  <input
                    id="party-direct-url"
                    type="url"
                    className="field-input"
                    placeholder="https://example.com/stream/episode-01.mp4"
                    value={directVideoUrl}
                    onChange={(e) => setDirectVideoUrl(e.target.value)}
                  />
                </div>
                <div className="field-group">
                  <label htmlFor="party-direct-title" className="field-label">
                    Stream Label
                  </label>
                  <input
                    id="party-direct-title"
                    type="text"
                    maxLength={120}
                    className="field-input"
                    placeholder="e.g. Movie Night Stream"
                    value={streamTitle}
                    onChange={(e) => setStreamTitle(e.target.value)}
                  />
                </div>
                <p className="party-picker-hint">
                  Direct HTTPS video streams use native HTML5 playback for automatic play, pause, and frame-seek lockstep across all participants.
                </p>
              </div>
            )}

            <div className="party-form__two-col">
              <div className="field-group">
                <label htmlFor="party-passcode" className="field-label">
                  Room Passcode (Optional)
                </label>
                <input
                  id="party-passcode"
                  type="password"
                  maxLength={32}
                  autoComplete="new-password"
                  className="field-input"
                  placeholder="Leave blank for link-only access"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                />
              </div>

              <div className="field-group">
                <label htmlFor="party-control-policy" className="field-label">
                  Playback Control
                </label>
                <select
                  id="party-control-policy"
                  className="field-select"
                  value={controlPolicy}
                  onChange={(e) => setControlPolicy(e.target.value as PartyControlPolicy)}
                >
                  <option value="host_only">Host Only</option>
                  <option value="everyone">Everyone in Room</option>
                </select>
              </div>
            </div>

            {createError && (
              <p className="party-error-msg" role="alert">
                {createError}
              </p>
            )}

            <button
              type="submit"
              className="btn btn--primary"
              disabled={creating || backendStatus === 'offline'}
              style={{ alignSelf: 'flex-start' }}
            >
              <Users size={16} aria-hidden="true" />
              <span>{creating ? 'Creating Room…' : 'Create Watch Party'}</span>
            </button>
          </form>
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <section className="party-card" aria-labelledby="join-party-heading">
            <div className="party-card__header">
              <h2 id="join-party-heading" className="section-title">
                Join with Invite Code
              </h2>
            </div>

            <form className="party-form" onSubmit={handleJoinSubmit}>
              <div className="field-group">
                <label htmlFor="party-join-code" className="field-label">
                  Room Code or Invite URL
                </label>
                <input
                  id="party-join-code"
                  type="text"
                  className="field-input"
                  placeholder="e.g. 7K4M9P or paste invite URL"
                  value={joinCodeInput}
                  onChange={(e) => {
                    setJoinCodeInput(e.target.value);
                    setJoinError(null);
                  }}
                />
              </div>

              {joinPreview && joinPreview.exists && (
                <div className="party-preview-pill">
                  <div>
                    <div className="party-preview-pill__title">{joinPreview.roomTitle}</div>
                    <div className="party-preview-pill__sub">
                      {joinPreview.mediaTitle} · {joinPreview.participantCount ?? 0} watching
                    </div>
                  </div>
                  {joinPreview.hasPasscode && (
                    <Lock size={14} color="var(--accent-hover)" aria-label="Passcode protected" />
                  )}
                </div>
              )}

              {joinPreview && !joinPreview.exists && debouncedJoinCode.length >= 6 && (
                <p className="party-picker-hint">
                  No active room found with code {debouncedJoinCode}.
                </p>
              )}

              {joinError && (
                <p className="party-error-msg" role="alert">
                  {joinError}
                </p>
              )}

              <button type="submit" className="btn btn--secondary">
                <span>Open Room</span>
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            </form>
          </section>

          <section className="party-card" aria-label="How Watch Parties work">
            <h2 className="dossier-title">Sync Capabilities</h2>
            <ul className="party-feature-list">
              <li>
                <Video size={14} aria-hidden="true" />
                <span>
                  <strong>Yenime Catalogue Rooms:</strong> Automatically switches series, episodes, and SUB/DUB audio across all viewers while streaming live host timestamps via verified <code>PLAYER_EVENT</code> telemetry.
                </span>
              </li>
              <li>
                <ShieldCheck size={14} aria-hidden="true" />
                <span>
                  <strong>Direct Compatible Streams:</strong> Supports HTTPS MP4/WebM sources with automatic play, pause, and frame-accurate seek synchronization.
                </span>
              </li>
              <li>
                <Lock size={14} aria-hidden="true" />
                <span>
                  <strong>Private by Default:</strong> Unlisted 6-character room codes, optional scrypt-hashed passcodes, host transfer, and live room chat.
                </span>
              </li>
            </ul>
          </section>
        </div>
      </div>

      <div style={{ marginTop: '32px' }}>
        <AdSlot placement="party-bottom-rectangle" />
      </div>
    </div>
  );
}
