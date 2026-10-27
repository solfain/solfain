import type {
  CreatePartyRoomRequest,
  CreatePartyRoomResponse,
  PartyPlaybackState,
  PartyRoomPreview,
} from '../../types/watchParty';
import { safeJsonParse, sanitizePlainText } from '../../utils/security';

const PARTY_NICKNAME_KEY = 'solfain:party-nickname:v1';
const PARTY_SESSION_PREFIX = 'solfain:party-session:v1:';

export interface StoredPartySession {
  roomId: string;
  name: string;
  participantToken?: string;
  hostSecret?: string;
  passcode?: string;
}

export function normalizePartyRoomCode(raw: string): string {
  const trimmed = raw.trim();
  // Support pasting a full invite URL such as https://.../party/7K4M9P
  const urlMatch = trimmed.match(/\/party\/([A-Za-z0-9_-]{3,16})/i);
  const candidate = urlMatch ? urlMatch[1] : trimmed;
  return candidate.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

export function getSavedPartyNickname(): string {
  try {
    const raw = window.localStorage.getItem(PARTY_NICKNAME_KEY);
    return raw ? sanitizePlainText(raw, 28) : '';
  } catch {
    return '';
  }
}

export function savePartyNickname(name: string): string {
  const clean = sanitizePlainText(name, 28);
  try {
    if (clean) {
      window.localStorage.setItem(PARTY_NICKNAME_KEY, clean);
    }
  } catch {
    // Ignore storage quota errors
  }
  return clean;
}

export function getStoredPartySession(roomId: string): StoredPartySession | null {
  const code = normalizePartyRoomCode(roomId);
  if (!code) return null;
  try {
    const raw = window.sessionStorage.getItem(`${PARTY_SESSION_PREFIX}${code}`);
    if (!raw) return null;
    const parsed = safeJsonParse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      roomId: code,
      name: sanitizePlainText(parsed.name, 28) || 'Guest',
      participantToken:
        typeof parsed.participantToken === 'string' ? parsed.participantToken : undefined,
      hostSecret: typeof parsed.hostSecret === 'string' ? parsed.hostSecret : undefined,
      passcode: typeof parsed.passcode === 'string' ? parsed.passcode : undefined,
    };
  } catch {
    return null;
  }
}

export function saveStoredPartySession(session: StoredPartySession): void {
  const code = normalizePartyRoomCode(session.roomId);
  if (!code) return;
  try {
    window.sessionStorage.setItem(
      `${PARTY_SESSION_PREFIX}${code}`,
      JSON.stringify({
        roomId: code,
        name: sanitizePlainText(session.name, 28) || 'Guest',
        participantToken: session.participantToken,
        hostSecret: session.hostSecret,
        passcode: session.passcode,
      }),
    );
  } catch {
    // Ignore storage errors
  }
}

export function buildWatchPartyWsUrl(): string {
  const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProto}//${window.location.host}/ws/party`;
}

export async function checkWatchPartyHealth(
  signal?: AbortSignal,
): Promise<{ ok: boolean; activeRooms: number }> {
  try {
    const res = await fetch('/api/party/health', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    });
    if (!res.ok) return { ok: false, activeRooms: 0 };
    const data = (await res.json()) as { ok?: boolean; activeRooms?: number };
    return {
      ok: Boolean(data?.ok),
      activeRooms: typeof data?.activeRooms === 'number' ? data.activeRooms : 0,
    };
  } catch {
    return { ok: false, activeRooms: 0 };
  }
}

export async function createWatchPartyRoom(
  input: CreatePartyRoomRequest,
): Promise<CreatePartyRoomResponse> {
  const res = await fetch('/api/party/rooms', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
  });

  const payload = (await res.json().catch(() => ({}))) as Partial<CreatePartyRoomResponse> & {
    error?: string;
  };

  if (!res.ok || !payload.room || !payload.hostSecret || !payload.participantToken) {
    throw new Error(
      payload.error ||
        `Unable to create watch party room (HTTP ${res.status}). Ensure the Watch Party backend is running.`,
    );
  }

  savePartyNickname(input.hostName);
  saveStoredPartySession({
    roomId: payload.room.roomId,
    name: input.hostName,
    hostSecret: payload.hostSecret,
    participantToken: payload.participantToken,
    passcode: input.passcode,
  });

  return payload as CreatePartyRoomResponse;
}

export async function fetchWatchPartyRoomPreview(
  roomId: string,
  signal?: AbortSignal,
): Promise<PartyRoomPreview> {
  const code = normalizePartyRoomCode(roomId);
  if (!code) {
    return { exists: false, roomId: '' };
  }
  const res = await fetch(`/api/party/rooms/${encodeURIComponent(code)}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });
  if (res.status === 404) {
    return { exists: false, roomId: code };
  }
  if (!res.ok) {
    throw new Error(`Could not inspect room ${code} (HTTP ${res.status}).`);
  }
  return (await res.json()) as PartyRoomPreview;
}

export function getInterpolatedPartyPosition(
  playback: PartyPlaybackState,
  serverOffsetMs = 0,
  nowMs = Date.now(),
): number {
  if (!playback.isPlaying) {
    return playback.positionSeconds;
  }
  const estimatedServerNow = nowMs + serverOffsetMs;
  const elapsedSec = Math.max(0, (estimatedServerNow - playback.updatedAtServerMs) / 1000);
  const raw = playback.positionSeconds + elapsedSec;
  if (playback.durationSeconds && playback.durationSeconds > 0) {
    return Math.min(playback.durationSeconds, raw);
  }
  return raw;
}
