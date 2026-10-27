import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Crown,
  Lock,
  LogOut,
  Maximize2,
  MessageSquare,
  Minimize2,
  Play,
  Radio,
  RefreshCw,
  Search,
  Send,
  Settings,
  UserMinus,
  Users,
  X,
} from 'lucide-react';
import { searchAnime } from '../services/anilist/anilistService';
import { getVideoProvider } from '../services/providers';
import {
  buildWatchPartyWsUrl,
  fetchWatchPartyRoomPreview,
  getInterpolatedPartyPosition,
  getSavedPartyNickname,
  getStoredPartySession,
  normalizePartyRoomCode,
  savePartyNickname,
  saveStoredPartySession,
} from '../services/watchParty/watchPartyClient';
import type { AnimeSummary } from '../types/anime';
import type { AudioTrack } from '../types/provider';
import type {
  PartyChatMessage,
  PartyClientSocketMessage,
  PartyControlPolicy,
  PartyMediaState,
  PartyParticipant,
  PartyPlaybackState,
  PartyRoomPreview,
  PartyRoomSnapshot,
  PartyServerSocketMessage,
} from '../types/watchParty';
import { useDebouncedValue } from '../utils/debounce';
import {
  formatClockDuration,
  formatMediaFormat,
  getDisplayTitle,
  getReleaseYear,
} from '../utils/format';
import { sanitizeHttpUrl } from '../utils/security';

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'closed';
type SidebarTab = 'chat' | 'members' | 'settings';

export function WatchPartyRoomPage() {
  const { roomId: rawRoomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const roomCode = normalizePartyRoomCode(rawRoomId ?? '');

  const storedSession = useMemo(() => getStoredPartySession(roomCode), [roomCode]);

  const [joinedOnce, setJoinedOnce] = useState<boolean>(() => Boolean(storedSession));
  const [displayName, setDisplayName] = useState<string>(
    () => storedSession?.name || getSavedPartyNickname() || '',
  );
  const [passcodeInput, setPasscodeInput] = useState<string>(
    () => storedSession?.passcode || '',
  );
  const [preview, setPreview] = useState<PartyRoomPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(!storedSession);

  const [connState, setConnState] = useState<ConnectionState>('idle');
  const [roomError, setRoomError] = useState<string | null>(null);
  const [needsPasscodePrompt, setNeedsPasscodePrompt] = useState(false);

  const [selfId, setSelfId] = useState<string>('');
  const [room, setRoom] = useState<PartyRoomSnapshot | null>(null);
  const [serverOffsetMs, setServerOffsetMs] = useState<number>(0);
  const [nowTickMs, setNowTickMs] = useState<number>(() => Date.now());

  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('chat');
  const [unreadChat, setUnreadChat] = useState<number>(0);
  const [chatInput, setChatInput] = useState('');
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [theaterMode, setTheaterMode] = useState(false);
  const [localPositionSec, setLocalPositionSec] = useState<number | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  // Switch media modal state
  const [mediaModalOpen, setMediaModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'yenime' | 'direct'>('yenime');
  const [modalQuery, setModalQuery] = useState('');
  const debouncedModalQuery = useDebouncedValue(modalQuery.trim(), 300);
  const [modalResults, setModalResults] = useState<AnimeSummary[]>([]);
  const [modalDirectUrl, setModalDirectUrl] = useState('');
  const [modalDirectTitle, setModalDirectTitle] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const directVideoRef = useRef<HTMLVideoElement | null>(null);
  const suppressVideoEventsUntilRef = useRef<number>(0);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const sidebarTabRef = useRef<SidebarTab>(sidebarTab);
  sidebarTabRef.current = sidebarTab;

  const provider = getVideoProvider();

  useEffect(() => {
    document.title = room
      ? `${room.roomTitle} (#${room.roomId}) — Watch Party — Solfain`
      : `Watch Party #${roomCode} — Solfain`;
  }, [room, roomCode]);

  // Clock ticker for live interpolated playback display
  useEffect(() => {
    const id = window.setInterval(() => {
      setNowTickMs(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // Load room preview when arriving without an existing session
  useEffect(() => {
    if (joinedOnce || !roomCode) return;
    const controller = new AbortController();
    setPreviewLoading(true);
    fetchWatchPartyRoomPreview(roomCode, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) {
          setPreview(res);
          setPreviewLoading(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setPreviewLoading(false);
        }
      });
    return () => controller.abort();
  }, [joinedOnce, roomCode]);

  const sendSocketMessage = useCallback((payload: PartyClientSocketMessage) => {
    const sock = wsRef.current;
    if (sock && sock.readyState === WebSocket.OPEN) {
      sock.send(JSON.stringify(payload));
    }
  }, []);

  // Apply programmatic sync to native <video> in Direct Compatible Stream mode
  const applyDirectVideoSync = useCallback(
    (playback: PartyPlaybackState, offsetMs: number, forceSeek = false) => {
      const video = directVideoRef.current;
      if (!video) return;

      const targetSec = getInterpolatedPartyPosition(playback, offsetMs, Date.now());
      const drift = Math.abs((video.currentTime || 0) - targetSec);

      suppressVideoEventsUntilRef.current = Date.now() + 650;

      if (forceSeek || drift > 2.2) {
        try {
          video.currentTime = targetSec;
        } catch {
          // Ignore if metadata not loaded yet
        }
      }

      if (playback.isPlaying && video.paused) {
        void video.play().catch(() => {
          // Autoplay may require user interaction until first click
        });
      } else if (!playback.isPlaying && !video.paused) {
        video.pause();
      }
    },
    [],
  );

  // Establish WebSocket connection once user joins
  useEffect(() => {
    if (!joinedOnce || !roomCode) return;

    let unmounted = false;
    let reconnectTimer: number | null = null;
    let pingTimer: number | null = null;

    const connect = (isReconnect: boolean) => {
      if (unmounted) return;
      setConnState(isReconnect ? 'reconnecting' : 'connecting');

      const ws = new WebSocket(buildWatchPartyWsUrl());
      wsRef.current = ws;

      ws.addEventListener('open', () => {
        if (unmounted) return;
        const latestStored = getStoredPartySession(roomCode);
        const activeName =
          displayName.trim() || latestStored?.name || getSavedPartyNickname() || 'Guest';

        const joinMsg: PartyClientSocketMessage = {
          type: 'join',
          roomId: roomCode,
          name: activeName,
          passcode: passcodeInput || latestStored?.passcode,
          hostSecret: latestStored?.hostSecret,
          participantToken: latestStored?.participantToken,
        };
        ws.send(JSON.stringify(joinMsg));

        pingTimer = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: 'ping',
                clientSentMs: Date.now(),
              } satisfies PartyClientSocketMessage),
            );
          }
        }, 20_000);
      });

      ws.addEventListener('message', (event) => {
        if (unmounted || typeof event.data !== 'string') return;
        let msg: PartyServerSocketMessage;
        try {
          msg = JSON.parse(event.data) as PartyServerSocketMessage;
        } catch {
          return;
        }

        if (msg.type === 'welcome') {
          const offset = msg.serverNowMs - Date.now();
          setServerOffsetMs(offset);
          setSelfId(msg.selfId);
          setRoom(msg.room);
          setConnState('connected');
          setRoomError(null);
          setNeedsPasscodePrompt(false);

          const latestStored = getStoredPartySession(roomCode);
          saveStoredPartySession({
            roomId: roomCode,
            name: displayName.trim() || latestStored?.name || 'Guest',
            participantToken: msg.participantToken,
            hostSecret: latestStored?.hostSecret,
            passcode: passcodeInput || latestStored?.passcode,
          });

          window.setTimeout(() => {
            applyDirectVideoSync(msg.room.playback, offset, true);
          }, 150);
          return;
        }

        if (msg.type === 'room_state') {
          const offset = msg.serverNowMs - Date.now();
          setServerOffsetMs(offset);
          setRoom(msg.room);
          return;
        }

        if (msg.type === 'playback_updated') {
          const offset = msg.serverNowMs - Date.now();
          setServerOffsetMs(offset);
          setRoom((prev) => (prev ? { ...prev, playback: msg.playback } : prev));
          applyDirectVideoSync(msg.playback, offset, false);
          return;
        }

        if (msg.type === 'media_updated') {
          const offset = msg.serverNowMs - Date.now();
          setServerOffsetMs(offset);
          setLocalPositionSec(0);
          setRoom((prev) =>
            prev ? { ...prev, media: msg.media, playback: msg.playback } : prev,
          );
          return;
        }

        if (msg.type === 'participants_updated') {
          setRoom((prev) =>
            prev
              ? {
                  ...prev,
                  hostId: msg.hostId,
                  participants: msg.participants,
                }
              : prev,
          );
          return;
        }

        if (msg.type === 'chat_message') {
          setRoom((prev) => {
            if (!prev) return prev;
            const nextMsgs: PartyChatMessage[] = [...prev.messages, msg.message].slice(-100);
            return { ...prev, messages: nextMsgs };
          });
          if (sidebarTabRef.current !== 'chat' && msg.message.kind === 'chat') {
            setUnreadChat((c) => c + 1);
          }
          return;
        }

        if (msg.type === 'pong') {
          const rtt = Math.max(0, Date.now() - msg.clientSentMs);
          setServerOffsetMs(msg.serverNowMs + Math.round(rtt / 2) - Date.now());
          return;
        }

        if (msg.type === 'kicked') {
          setRoomError(msg.reason);
          setConnState('closed');
          setJoinedOnce(false);
          ws.close();
          return;
        }

        if (msg.type === 'error') {
          if (msg.code === 'PASSCODE_REQUIRED') {
            setNeedsPasscodePrompt(true);
            setJoinedOnce(false);
            setRoomError(msg.message);
            ws.close();
            return;
          }
          if (msg.code === 'ROOM_NOT_FOUND' || msg.code === 'ROOM_FULL') {
            setRoomError(msg.message);
            setJoinedOnce(false);
            setConnState('closed');
            ws.close();
            return;
          }
          setRoomError(msg.message);
        }
      });

      ws.addEventListener('close', (ev) => {
        if (pingTimer) window.clearInterval(pingTimer);
        if (unmounted) return;
        if (ev.code === 4000 || ev.code === 4001) {
          setConnState('closed');
          return;
        }
        // Reconnect automatically if we had an active room
        setConnState('reconnecting');
        reconnectTimer = window.setTimeout(() => connect(true), 2000);
      });
    };

    connect(false);

    return () => {
      unmounted = true;
      if (pingTimer) window.clearInterval(pingTimer);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (wsRef.current) {
        try {
          wsRef.current.close(1000, 'Leaving watch party');
        } catch {
          // Ignore
        }
      }
    };
  }, [applyDirectVideoSync, displayName, joinedOnce, passcodeInput, roomCode]);

  // Auto-scroll chat feed when new messages arrive
  useEffect(() => {
    if (sidebarTab === 'chat') {
      setUnreadChat(0);
      chatEndRef.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [room?.messages.length, sidebarTab]);

  const isHost = Boolean(room && selfId && room.hostId === selfId);
  const canControl = Boolean(
    room && (isHost || room.controlPolicy === 'everyone'),
  );

  // Listen to Yenime iframe PLAYER_EVENT messages to sync Host telemetry & report Guest position
  const lastSyncBroadcastRef = useRef<number>(0);
  const lastReportRef = useRef<number>(0);

  useEffect(() => {
    if (!room || room.media.sourceType !== 'yenime') return;

    const handleMessage = (event: MessageEvent) => {
      const telemetry = provider.parsePlayerMessage(
        event,
        iframeRef.current?.contentWindow ?? null,
      );
      if (!telemetry) return;

      setLocalPositionSec(Math.floor(telemetry.currentTime));
      const now = Date.now();

      if (isHost) {
        const isStateTransition =
          telemetry.event === 'play' ||
          telemetry.event === 'pause' ||
          telemetry.event === 'seeked' ||
          telemetry.event === 'ended';

        if (isStateTransition || now - lastSyncBroadcastRef.current >= 4000) {
          lastSyncBroadcastRef.current = now;
          sendSocketMessage({
            type: 'sync_playback',
            isPlaying: telemetry.event === 'play' || telemetry.event === 'timeupdate',
            positionSeconds: telemetry.currentTime,
            durationSeconds: telemetry.duration > 0 ? telemetry.duration : undefined,
          });
        }
      } else if (now - lastReportRef.current >= 5000) {
        lastReportRef.current = now;
        sendSocketMessage({
          type: 'report_position',
          positionSeconds: telemetry.currentTime,
        });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isHost, provider, room, sendSocketMessage]);

  // Modal AniList search when Host wants to switch anime inside the room
  useEffect(() => {
    if (!mediaModalOpen || debouncedModalQuery.length < 2) {
      setModalResults([]);
      return;
    }
    const controller = new AbortController();
    searchAnime({ query: debouncedModalQuery, page: 1, perPage: 6 }, { signal: controller.signal })
      .then((res) => {
        if (!controller.signal.aborted) {
          setModalResults(res.media.filter((m) => m.status !== 'NOT_YET_RELEASED'));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setModalResults([]);
        }
      });
    return () => controller.abort();
  }, [debouncedModalQuery, mediaModalOpen]);

  // Keyboard shortcut 'T' for Theater Mode (when not typing in chat/inputs)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && mediaModalOpen) {
        setMediaModalOpen(false);
        return;
      }
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
        return;
      }
      if (event.key.toLowerCase() === 't') {
        event.preventDefault();
        setTheaterMode((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mediaModalOpen]);

  const handlePreJoinSubmit = (event: FormEvent) => {
    event.preventDefault();
    const clean = savePartyNickname(displayName);
    if (!clean) {
      setRoomError('Please enter a display name to join.');
      return;
    }
    setDisplayName(clean);
    setRoomError(null);
    setJoinedOnce(true);
  };

  const handleChatSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed) return;
    sendSocketMessage({ type: 'chat', text: trimmed });
    setChatInput('');
  };

  const handleSwitchYenimeMedia = (
    patch: Partial<{ episode: number; audio: AudioTrack }>,
  ) => {
    if (!room || room.media.sourceType !== 'yenime' || !canControl) return;
    const nextMedia: PartyMediaState = {
      ...room.media,
      episode: patch.episode ?? room.media.episode,
      audio: patch.audio ?? room.media.audio,
    };
    sendSocketMessage({ type: 'change_media', media: nextMedia });
  };

  const handleCopyInvite = () => {
    const inviteUrl = `${window.location.origin}/party/${roomCode}`;
    void navigator.clipboard
      ?.writeText(inviteUrl)
      .then(() => {
        setCopiedInvite(true);
        window.setTimeout(() => setCopiedInvite(false), 2000);
      })
      .catch(() => {});
  };

  // Pre-Join Gate for guests opening an invite link
  if (!joinedOnce) {
    return (
      <div className="container" style={{ maxWidth: '540px', paddingBlock: '48px' }}>
        <section className="party-card">
          <div className="party-card__header">
            <h1 className="section-title">
              {preview?.exists && preview.roomTitle
                ? preview.roomTitle
                : `Join Watch Party #${roomCode}`}
            </h1>
            <span className="party-code-chip tabular">#{roomCode}</span>
          </div>

          {previewLoading ? (
            <div className="skeleton-block" style={{ height: '64px', width: '100%' }} />
          ) : preview && !preview.exists ? (
            <div className="party-form">
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                Room <strong>#{roomCode}</strong> could not be found or has closed.
              </p>
              <Link to="/party" className="btn btn--primary btn--compact" style={{ alignSelf: 'flex-start' }}>
                Create a Watch Party
              </Link>
            </div>
          ) : (
            <form className="party-form" onSubmit={handlePreJoinSubmit}>
              {preview?.mediaTitle && (
                <div className="party-preview-pill">
                  <div>
                    <div className="party-preview-pill__title">{preview.mediaTitle}</div>
                    <div className="party-preview-pill__sub">
                      {preview.participantCount ?? 0} currently in room
                    </div>
                  </div>
                  {preview.hasPasscode && (
                    <Lock size={14} color="var(--accent-hover)" aria-hidden="true" />
                  )}
                </div>
              )}

              <div className="field-group">
                <label htmlFor="join-display-name" className="field-label">
                  Your Display Name
                </label>
                <input
                  id="join-display-name"
                  type="text"
                  required
                  maxLength={28}
                  className="field-input"
                  placeholder="Enter nickname..."
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>

              {(preview?.hasPasscode || needsPasscodePrompt) && (
                <div className="field-group">
                  <label htmlFor="join-room-passcode" className="field-label">
                    Room Passcode
                  </label>
                  <input
                    id="join-room-passcode"
                    type="password"
                    required
                    maxLength={32}
                    className="field-input"
                    placeholder="Enter room passcode..."
                    value={passcodeInput}
                    onChange={(e) => setPasscodeInput(e.target.value)}
                  />
                </div>
              )}

              {roomError && (
                <p className="party-error-msg" role="alert">
                  {roomError}
                </p>
              )}

              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="submit" className="btn btn--primary">
                  <Play size={15} fill="currentColor" aria-hidden="true" />
                  <span>Join Watch Party</span>
                </button>
                <Link to="/party" className="btn btn--ghost">
                  Back to Lobby
                </Link>
              </div>
            </form>
          )}
        </section>
      </div>
    );
  }

  const hostPositionSec = room
    ? getInterpolatedPartyPosition(room.playback, serverOffsetMs, nowTickMs)
    : 0;
  const hostClock = formatClockDuration(hostPositionSec) ?? '0:00';
  const totalClock = room?.playback.durationSeconds
    ? formatClockDuration(room.playback.durationSeconds)
    : null;

  const driftSec =
    localPositionSec !== null ? Math.round(localPositionSec - hostPositionSec) : null;

  const yenimeMedia =
    room && room.media.sourceType === 'yenime' ? room.media : null;

  const yenimeEmbedUrl = useMemo(() => {
    if (!yenimeMedia) return null;
    const base =
      yenimeMedia.idMode === 'mal' && yenimeMedia.idMal
        ? `https://player.yenime.net/anime/mal/${yenimeMedia.idMal}/${yenimeMedia.episode}`
        : `https://player.yenime.net/anime/ani/${yenimeMedia.animeId}/${yenimeMedia.episode}`;
    return yenimeMedia.audio === 'dub' ? `${base}?dub=1` : base;
  }, [yenimeMedia]);

  const safeDirectVideoUrl =
    room && room.media.sourceType === 'direct'
      ? sanitizeHttpUrl(room.media.directVideoUrl, { httpsOnly: true })
      : null;

  return (
    <div className="container watch-page">
      {/* Top Room Header Bar */}
      <div className="party-room-topbar">
        <div className="party-room-topbar__left">
          <span
            className={`party-conn-dot${
              connState === 'connected' ? ' party-conn-dot--live' : ''
            }`}
            aria-hidden="true"
          />
          <h1 className="party-room-topbar__title">
            {room ? room.roomTitle : `Connecting to #${roomCode}…`}
          </h1>
          <span className="party-code-chip tabular">#{roomCode}</span>
          {room && (
            <span className="party-viewer-pill tabular">
              <Users size={12} aria-hidden="true" />
              <span>{room.participants.length}</span>
            </span>
          )}
        </div>

        <div className="party-room-topbar__actions">
          <button
            type="button"
            className="btn btn--secondary btn--compact"
            onClick={handleCopyInvite}
          >
            {copiedInvite ? (
              <Check size={14} aria-hidden="true" />
            ) : (
              <Copy size={14} aria-hidden="true" />
            )}
            <span>{copiedInvite ? 'Invite Copied' : 'Invite Friends'}</span>
          </button>

          <button
            type="button"
            className={`btn btn--ghost btn--compact${
              theaterMode ? ' btn--active-accent' : ''
            }`}
            aria-pressed={theaterMode}
            title="Toggle Theater Mode (T)"
            onClick={() => setTheaterMode((prev) => !prev)}
          >
            {theaterMode ? (
              <Minimize2 size={14} aria-hidden="true" />
            ) : (
              <Maximize2 size={14} aria-hidden="true" />
            )}
            <span>Theater</span>
          </button>

          <button
            type="button"
            className="btn btn--ghost btn--compact"
            onClick={() => navigate('/party')}
          >
            <LogOut size={14} aria-hidden="true" />
            <span>Leave</span>
          </button>
        </div>
      </div>

      {roomError && (
        <div
          className="airing-countdown-bar"
          role="alert"
          style={{ marginBottom: '14px', borderColor: 'rgba(248, 113, 113, 0.4)' }}
        >
          <span>{roomError}</span>
          <button
            type="button"
            className="btn btn--ghost btn--compact"
            onClick={() => setRoomError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      <div className={`watch-layout${theaterMode ? ' watch-layout--theater' : ''}`}>
        {/*Synced Video Stage */}
        <div className="watch-stage">
          {!room ? (
            <div className="player-frame skeleton-block" />
          ) : room.media.sourceType === 'direct' && safeDirectVideoUrl ? (
            <div className="player-frame">
              <video
                ref={directVideoRef}
                key={`${safeDirectVideoUrl}::${reloadNonce}`}
                src={safeDirectVideoUrl}
                controls
                playsInline
                className="player-frame__iframe"
                onPlay={(e) => {
                  const v = e.currentTarget;
                  setLocalPositionSec(Math.floor(v.currentTime));
                  if (Date.now() < suppressVideoEventsUntilRef.current) return;
                  if (canControl) {
                    sendSocketMessage({
                      type: 'sync_playback',
                      isPlaying: true,
                      positionSeconds: v.currentTime,
                      durationSeconds: Number.isFinite(v.duration) ? v.duration : undefined,
                    });
                  }
                }}
                onPause={(e) => {
                  const v = e.currentTarget;
                  setLocalPositionSec(Math.floor(v.currentTime));
                  if (Date.now() < suppressVideoEventsUntilRef.current) return;
                  if (canControl) {
                    sendSocketMessage({
                      type: 'sync_playback',
                      isPlaying: false,
                      positionSeconds: v.currentTime,
                      durationSeconds: Number.isFinite(v.duration) ? v.duration : undefined,
                    });
                  }
                }}
                onSeeked={(e) => {
                  const v = e.currentTarget;
                  setLocalPositionSec(Math.floor(v.currentTime));
                  if (Date.now() < suppressVideoEventsUntilRef.current) return;
                  if (canControl) {
                    sendSocketMessage({
                      type: 'sync_playback',
                      isPlaying: !v.paused,
                      positionSeconds: v.currentTime,
                      durationSeconds: Number.isFinite(v.duration) ? v.duration : undefined,
                    });
                  }
                }}
                onTimeUpdate={(e) => {
                  const v = e.currentTarget;
                  setLocalPositionSec(Math.floor(v.currentTime));
                  const now = Date.now();
                  if (now - lastReportRef.current >= 5000) {
                    lastReportRef.current = now;
                    sendSocketMessage({
                      type: 'report_position',
                      positionSeconds: v.currentTime,
                    });
                  }
                }}
              />
            </div>
          ) : yenimeEmbedUrl ? (
            <div className="player-frame">
              <iframe
                ref={iframeRef}
                key={`${yenimeEmbedUrl}::${reloadNonce}`}
                src={yenimeEmbedUrl}
                title={
                  room.media.sourceType === 'yenime'
                    ? `${room.media.animeTitle} — Episode ${room.media.episode}`
                    : 'Watch Party Stream'
                }
                className="player-frame__iframe"
                allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                allowFullScreen
                referrerPolicy="origin"
              />
            </div>
          ) : null}

          {/* Sync Status & Playback Control Strip */}
          {room && (
            <div className="watch-controls-bar" aria-label="Watch party sync controls">
              <div className="watch-controls-group">
                <span className="party-sync-readout tabular">
                  <Radio size={13} color="var(--accent-hover)" aria-hidden="true" />
                  <span>
                    {room.playback.isPlaying ? 'Room Playing' : 'Room Paused'} ·{' '}
                    <strong>{hostClock}</strong>
                    {totalClock ? ` / ${totalClock}` : ''}
                  </span>
                </span>

                {!isHost && driftSec !== null && Math.abs(driftSec) > 4 && (
                  <span className="party-drift-badge tabular">
                    {driftSec > 0 ? `+${driftSec}s ahead` : `${driftSec}s behind`}
                  </span>
                )}

                {!isHost && room.media.sourceType === 'direct' && (
                  <button
                    type="button"
                    className="btn btn--secondary btn--compact"
                    onClick={() => applyDirectVideoSync(room.playback, serverOffsetMs, true)}
                  >
                    <span>Sync to Host ({hostClock})</span>
                  </button>
                )}

                {yenimeMedia && canControl && (
                  <>
                    <button
                      type="button"
                      className="btn btn--secondary btn--compact"
                      disabled={yenimeMedia.episode <= 1}
                      onClick={() =>
                        handleSwitchYenimeMedia({ episode: yenimeMedia.episode - 1 })
                      }
                    >
                      <ChevronLeft size={14} aria-hidden="true" />
                      <span>Prev Ep</span>
                    </button>

                    <button
                      type="button"
                      className="btn btn--secondary btn--compact"
                      disabled={
                        yenimeMedia.totalEpisodes !== null &&
                        yenimeMedia.episode >= yenimeMedia.totalEpisodes
                      }
                      onClick={() =>
                        handleSwitchYenimeMedia({ episode: yenimeMedia.episode + 1 })
                      }
                    >
                      <span>Next Ep</span>
                      <ChevronRight size={14} aria-hidden="true" />
                    </button>
                  </>
                )}
              </div>

              <div className="watch-controls-group">
                {yenimeMedia && (
                  <div className="segmented-control" role="group" aria-label="Room audio track">
                    <button
                      type="button"
                      disabled={!canControl}
                      className={`segmented-control__btn${
                        yenimeMedia.audio === 'sub' ? ' segmented-control__btn--active' : ''
                      }`}
                      onClick={() => handleSwitchYenimeMedia({ audio: 'sub' })}
                    >
                      SUB
                    </button>
                    <button
                      type="button"
                      disabled={!canControl}
                      className={`segmented-control__btn${
                        yenimeMedia.audio === 'dub' ? ' segmented-control__btn--active' : ''
                      }`}
                      onClick={() => handleSwitchYenimeMedia({ audio: 'dub' })}
                    >
                      DUB
                    </button>
                  </div>
                )}

                {canControl && (
                  <button
                    type="button"
                    className="btn btn--secondary btn--compact"
                    onClick={() => {
                      setModalMode(room.media.sourceType);
                      setMediaModalOpen(true);
                    }}
                  >
                    <span>Switch Source</span>
                  </button>
                )}

                <button
                  type="button"
                  className="btn btn--ghost btn--compact"
                  onClick={() => setReloadNonce((n) => n + 1)}
                >
                  <RefreshCw size={13} aria-hidden="true" />
                  <span>Reload</span>
                </button>
              </div>
            </div>
          )}

          {room && (
            <section className="watch-info-panel" aria-label="Active party media">
              <div className="watch-info-panel__header">
                <div>
                  <h2 className="watch-anime-title">
                    {room.media.sourceType === 'yenime'
                      ? room.media.animeTitle
                      : room.media.streamTitle}
                  </h2>
                  <p className="watch-ep-label">
                    {room.media.sourceType === 'yenime'
                      ? `Episode ${room.media.episode}${
                          room.media.totalEpisodes ? ` of ${room.media.totalEpisodes}` : ''
                        } · ${room.media.audio.toUpperCase()} · Synced across room`
                      : 'Direct Compatible Stream · Automatic Play/Pause/Seek Lockstep'}
                  </p>
                </div>

                {room.media.sourceType === 'yenime' && (
                  <Link
                    to={`/anime/${room.media.animeId}`}
                    className="btn btn--ghost btn--compact"
                  >
                    Series Details
                  </Link>
                )}
              </div>
            </section>
          )}
        </div>

        {/* Real-Time Chat & Members Sidebar */}
        <aside className="party-sidebar" aria-label="Watch party chat and participants">
          <div className="party-sidebar__tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={sidebarTab === 'chat'}
              className={`party-sidebar__tab${
                sidebarTab === 'chat' ? ' party-sidebar__tab--active' : ''
              }`}
              onClick={() => {
                setSidebarTab('chat');
                setUnreadChat(0);
              }}
            >
              <MessageSquare size={14} aria-hidden="true" />
              <span>Chat</span>
              {unreadChat > 0 && <span className="nav-count">{unreadChat}</span>}
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={sidebarTab === 'members'}
              className={`party-sidebar__tab${
                sidebarTab === 'members' ? ' party-sidebar__tab--active' : ''
              }`}
              onClick={() => setSidebarTab('members')}
            >
              <Users size={14} aria-hidden="true" />
              <span>Watching ({room?.participants.length ?? 0})</span>
            </button>

            {isHost && (
              <button
                type="button"
                role="tab"
                aria-selected={sidebarTab === 'settings'}
                className={`party-sidebar__tab${
                  sidebarTab === 'settings' ? ' party-sidebar__tab--active' : ''
                }`}
                aria-label="Room settings"
                onClick={() => setSidebarTab('settings')}
              >
                <Settings size={14} aria-hidden="true" />
              </button>
            )}
          </div>

          {sidebarTab === 'chat' && (
            <div className="party-chat">
              <div className="party-chat__messages" role="log" aria-live="polite">
                {(room?.messages ?? []).map((msg) => {
                  if (msg.kind === 'system') {
                    return (
                      <div key={msg.id} className="party-chat__system">
                        {msg.text}
                      </div>
                    );
                  }
                  const timeStr = new Date(msg.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  return (
                    <div key={msg.id} className="party-chat__item">
                      <div className="party-chat__meta">
                        <span className="party-chat__author">{msg.senderName}</span>
                        {msg.isHost && <span className="party-host-tag">HOST</span>}
                        <span className="party-chat__time tabular">{timeStr}</span>
                      </div>
                      <p className="party-chat__text">{msg.text}</p>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>

              <form className="party-chat__form" onSubmit={handleChatSubmit}>
                <input
                  type="text"
                  maxLength={500}
                  className="field-input"
                  placeholder="Send a message to the room..."
                  aria-label="Chat message"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                />
                <button
                  type="submit"
                  className="btn btn--primary btn--compact"
                  aria-label="Send chat message"
                  disabled={!chatInput.trim() || connState !== 'connected'}
                >
                  <Send size={14} aria-hidden="true" />
                </button>
              </form>
            </div>
          )}

          {sidebarTab === 'members' && (
            <div className="party-members-list">
              {(room?.participants ?? []).map((member: PartyParticipant) => {
                const isMe = member.id === selfId;
                const posLabel =
                  member.reportedPositionSeconds !== null
                    ? formatClockDuration(member.reportedPositionSeconds)
                    : null;

                return (
                  <div key={member.id} className="party-member-row">
                    <div>
                      <div className="party-member-row__name">
                        <span>{member.name}</span>
                        {isMe && <span className="party-member-row__you">(You)</span>}
                        {member.isHost && (
                          <Crown size={13} color="var(--accent-hover)" aria-label="Host" />
                        )}
                      </div>
                      {posLabel && (
                        <div className="party-member-row__sub tabular">At {posLabel}</div>
                      )}
                    </div>

                    {isHost && !isMe && (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          className="btn btn--ghost btn--compact"
                          title={`Make ${member.name} host`}
                          onClick={() =>
                            sendSocketMessage({
                              type: 'transfer_host',
                              targetParticipantId: member.id,
                            })
                          }
                        >
                          <Crown size={13} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--compact"
                          aria-label={`Remove ${member.name}`}
                          onClick={() =>
                            sendSocketMessage({
                              type: 'kick_member',
                              targetParticipantId: member.id,
                            })
                          }
                        >
                          <UserMinus size={13} aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {sidebarTab === 'settings' && isHost && room && (
            <div className="party-settings-pane">
              <div className="field-group">
                <label htmlFor="room-settings-policy" className="field-label">
                  Playback & Episode Control
                </label>
                <select
                  id="room-settings-policy"
                  className="field-select"
                  value={room.controlPolicy}
                  onChange={(e) =>
                    sendSocketMessage({
                      type: 'update_settings',
                      controlPolicy: e.target.value as PartyControlPolicy,
                    })
                  }
                >
                  <option value="host_only">Host Only</option>
                  <option value="everyone">Everyone in Room</option>
                </select>
              </div>
              <p className="party-picker-hint">
                Share code <strong>#{room.roomId}</strong> or click Invite Friends above to invite viewers.
              </p>
            </div>
          )}
        </aside>
      </div>

      {/* Switch Anime / Stream Modal */}
      {mediaModalOpen && room && (
        <div
          className="trailer-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Switch watch party media"
          onClick={() => setMediaModalOpen(false)}
        >
          <div className="shortcuts-modal" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <div className="trailer-modal__header">
              <span className="trailer-modal__title">Switch Room Media</span>
              <button
                type="button"
                className="btn btn--ghost btn--compact"
                aria-label="Close media switcher"
                onClick={() => setMediaModalOpen(false)}
              >
                <X size={15} aria-hidden="true" />
              </button>
            </div>

            <div className="shortcuts-modal__body" style={{ gap: '14px' }}>
              <div className="segmented-control" style={{ alignSelf: 'flex-start' }}>
                <button
                  type="button"
                  className={`segmented-control__btn${
                    modalMode === 'yenime' ? ' segmented-control__btn--active' : ''
                  }`}
                  onClick={() => setModalMode('yenime')}
                >
                  Anime Catalogue
                </button>
                <button
                  type="button"
                  className={`segmented-control__btn${
                    modalMode === 'direct' ? ' segmented-control__btn--active' : ''
                  }`}
                  onClick={() => setModalMode('direct')}
                >
                  Direct Stream URL
                </button>
              </div>

              {modalMode === 'yenime' ? (
                <div className="field-group">
                  <div className="search-input-wrap">
                    <Search size={14} className="search-input-wrap__icon" aria-hidden="true" />
                    <input
                      type="search"
                      className="field-input"
                      placeholder="Search anime title..."
                      aria-label="Search anime to switch room"
                      value={modalQuery}
                      onChange={(e) => setModalQuery(e.target.value)}
                    />
                  </div>
                  {modalResults.length > 0 && (
                    <div className="party-picker-list">
                      {modalResults.map((item) => {
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
                              sendSocketMessage({
                                type: 'change_media',
                                media: {
                                  sourceType: 'yenime',
                                  animeId: item.id,
                                  idMal: item.idMal ?? null,
                                  animeTitle: title,
                                  coverImage: thumb,
                                  episode: 1,
                                  totalEpisodes: item.episodes ?? null,
                                  audio: 'sub',
                                  idMode: 'anilist',
                                },
                              });
                              setMediaModalOpen(false);
                              setModalQuery('');
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
                                {[formatMediaFormat(item.format), getReleaseYear(item)]
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
              ) : (
                <form
                  style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const cleanUrl = sanitizeHttpUrl(modalDirectUrl, { httpsOnly: true });
                    if (!cleanUrl) return;
                    sendSocketMessage({
                      type: 'change_media',
                      media: {
                        sourceType: 'direct',
                        directVideoUrl: cleanUrl,
                        streamTitle: modalDirectTitle.trim() || 'Direct Synced Video Stream',
                      },
                    });
                    setMediaModalOpen(false);
                  }}
                >
                  <input
                    type="url"
                    required
                    className="field-input"
                    placeholder="https://example.com/stream.mp4"
                    value={modalDirectUrl}
                    onChange={(e) => setModalDirectUrl(e.target.value)}
                  />
                  <input
                    type="text"
                    maxLength={120}
                    className="field-input"
                    placeholder="Stream title..."
                    value={modalDirectTitle}
                    onChange={(e) => setModalDirectTitle(e.target.value)}
                  />
                  <button type="submit" className="btn btn--primary btn--compact">
                    Switch to Stream
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
