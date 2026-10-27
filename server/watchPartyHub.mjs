import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';

const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const ROOM_CODE_LENGTH = 6;
const MAX_ACTIVE_ROOMS = 250;
const MAX_PARTICIPANTS_PER_ROOM = 24;
const MAX_CHAT_HISTORY = 100;
const MAX_WS_PAYLOAD_BYTES = 16 * 1024;
const MAX_HTTP_BODY_BYTES = 32 * 1024;
const MAX_MEDIA_SECONDS = 86_400;
const IDLE_ROOM_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function cleanText(raw, maxLen = 120) {
  if (typeof raw !== 'string') return '';
  return raw.replace(CONTROL_CHARS, '').trim().slice(0, maxLen);
}

function sanitizeHttpsUrl(raw, maxLen = 2048) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > maxLen) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeRoomCode(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);
}

function generateRoomCode(existingRooms) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const bytes = crypto.randomBytes(ROOM_CODE_LENGTH);
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
      code += ROOM_CODE_ALPHABET[bytes[i] % ROOM_CODE_ALPHABET.length];
    }
    if (!existingRooms.has(code)) {
      return code;
    }
  }
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

function hashPasscode(passcode) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(passcode, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPasscode(passcode, stored) {
  if (!stored) return true;
  if (typeof passcode !== 'string' || !passcode) return false;
  const [salt, expectedHex] = stored.split(':');
  if (!salt || !expectedHex) return false;
  const actual = crypto.scryptSync(passcode, salt, 32);
  const expected = Buffer.from(expectedHex, 'hex');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

function validateMediaState(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.sourceType === 'direct') {
    const directVideoUrl = sanitizeHttpsUrl(raw.directVideoUrl, 2048);
    if (!directVideoUrl) return null;
    const streamTitle = cleanText(raw.streamTitle, 140) || 'Direct Video Stream';
    return {
      sourceType: 'direct',
      directVideoUrl,
      streamTitle,
    };
  }

  if (raw.sourceType === 'yenime') {
    const animeId = Number(raw.animeId);
    if (!Number.isInteger(animeId) || animeId <= 0) return null;
    const idMal =
      typeof raw.idMal === 'number' && Number.isInteger(raw.idMal) && raw.idMal > 0
        ? raw.idMal
        : null;
    const episode = Number(raw.episode);
    if (!Number.isInteger(episode) || episode < 1 || episode > 10_000) return null;
    const totalEpisodes =
      typeof raw.totalEpisodes === 'number' &&
      Number.isInteger(raw.totalEpisodes) &&
      raw.totalEpisodes > 0
        ? raw.totalEpisodes
        : null;
    const animeTitle = cleanText(raw.animeTitle, 200) || `Anime #${animeId}`;
    const coverImage = sanitizeHttpsUrl(raw.coverImage, 1024);
    const audio = raw.audio === 'dub' ? 'dub' : 'sub';
    const idMode = raw.idMode === 'mal' && idMal ? 'mal' : 'anilist';

    return {
      sourceType: 'yenime',
      animeId,
      idMal,
      animeTitle,
      coverImage,
      episode,
      totalEpisodes,
      audio,
      idMode,
    };
  }

  return null;
}

function describeMediaLabel(media) {
  if (media.sourceType === 'direct') {
    return media.streamTitle;
  }
  return `${media.animeTitle} · Ep ${media.episode} (${media.audio.toUpperCase()})`;
}

function createRateBucket(maxTokens, refillPerSecond) {
  let tokens = maxTokens;
  let lastRefill = Date.now();
  return function consume(cost = 1) {
    const now = Date.now();
    const elapsedSec = Math.max(0, (now - lastRefill) / 1000);
    tokens = Math.min(maxTokens, tokens + elapsedSec * refillPerSecond);
    lastRefill = now;
    if (tokens < cost) {
      return false;
    }
    tokens -= cost;
    return true;
  };
}

function sendJsonHttp(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_HTTP_BODY_BYTES) {
        reject(new Error('Request body exceeds maximum allowed size.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (!raw) {
          resolve({});
          return;
        }
        const parsed = JSON.parse(raw, (key, val) => {
          if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            return undefined;
          }
          return val;
        });
        resolve(parsed);
      } catch {
        reject(new Error('Invalid JSON payload.'));
      }
    });
    req.on('error', reject);
  });
}

export function createWatchPartyHub() {
  const rooms = new Map();
  const ipCreateBuckets = new Map();

  function pruneExpiredRooms() {
    const now = Date.now();
    for (const [roomId, room] of rooms.entries()) {
      if (room.clients.size === 0 && now - room.lastActiveAt > IDLE_ROOM_TTL_MS) {
        rooms.delete(roomId);
      }
    }
  }

  const cleanupInterval = setInterval(pruneExpiredRooms, 60_000);
  if (typeof cleanupInterval.unref === 'function') {
    cleanupInterval.unref();
  }

  function computeInterpolatedPosition(playback, nowMs = Date.now()) {
    if (!playback.isPlaying) {
      return playback.positionSeconds;
    }
    const elapsedSec = Math.max(0, (nowMs - playback.updatedAtServerMs) / 1000);
    const rawPos = playback.positionSeconds + elapsedSec;
    if (playback.durationSeconds && playback.durationSeconds > 0) {
      return Math.min(playback.durationSeconds, rawPos);
    }
    return Math.min(MAX_MEDIA_SECONDS, rawPos);
  }

  function serializeParticipants(room) {
    const list = [];
    for (const session of room.sessions.values()) {
      if (!session.connected) continue;
      list.push({
        id: session.id,
        name: session.name,
        isHost: session.id === room.hostId,
        joinedAt: session.joinedAt,
        reportedPositionSeconds: session.reportedPositionSeconds,
      });
    }
    return list.sort((a, b) => {
      if (a.isHost !== b.isHost) return a.isHost ? -1 : 1;
      return a.joinedAt - b.joinedAt;
    });
  }

  function serializeRoomSnapshot(room) {
    const nowMs = Date.now();
    const interpolated = computeInterpolatedPosition(room.playback, nowMs);
    return {
      roomId: room.roomId,
      roomTitle: room.roomTitle,
      hasPasscode: Boolean(room.passcodeHash),
      controlPolicy: room.controlPolicy,
      hostId: room.hostId,
      createdAt: room.createdAt,
      serverNowMs: nowMs,
      media: room.media,
      playback: {
        ...room.playback,
        positionSeconds: Math.round(interpolated * 100) / 100,
        updatedAtServerMs: nowMs,
      },
      participants: serializeParticipants(room),
      messages: room.messages.slice(-MAX_CHAT_HISTORY),
    };
  }

  function appendSystemMessage(room, text) {
    const msg = {
      id: `sys_${crypto.randomBytes(6).toString('hex')}`,
      kind: 'system',
      senderId: null,
      senderName: 'Room',
      isHost: false,
      text: cleanText(text, 240),
      createdAt: Date.now(),
    };
    room.messages.push(msg);
    if (room.messages.length > MAX_CHAT_HISTORY) {
      room.messages.splice(0, room.messages.length - MAX_CHAT_HISTORY);
    }
    broadcastToRoom(room, { type: 'chat_message', message: msg });
  }

  function sendWs(ws, payload) {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(payload));
    }
  }

  function broadcastToRoom(room, payload, excludeWs = null) {
    const encoded = JSON.stringify(payload);
    for (const clientWs of room.clients.keys()) {
      if (clientWs !== excludeWs && clientWs.readyState === 1) {
        clientWs.send(encoded);
      }
    }
  }

  function broadcastParticipants(room) {
    broadcastToRoom(room, {
      type: 'participants_updated',
      hostId: room.hostId,
      participants: serializeParticipants(room),
    });
  }

  function createRoomRecord(input) {
    pruneExpiredRooms();
    if (rooms.size >= MAX_ACTIVE_ROOMS) {
      // Evict oldest empty room if available
      let oldestEmptyId = null;
      let oldestTime = Infinity;
      for (const [id, r] of rooms.entries()) {
        if (r.clients.size === 0 && r.lastActiveAt < oldestTime) {
          oldestTime = r.lastActiveAt;
          oldestEmptyId = id;
        }
      }
      if (oldestEmptyId) {
        rooms.delete(oldestEmptyId);
      } else {
        throw new Error('Server room capacity reached. Please try again shortly.');
      }
    }

    const hostName = cleanText(input.hostName, 28) || 'Host';
    const media = validateMediaState(input.media);
    if (!media) {
      throw new Error('Valid anime or HTTPS direct video source is required.');
    }

    const roomId = generateRoomCode(rooms);
    const hostSecret = crypto.randomBytes(24).toString('hex');
    const hostId = `p_${crypto.randomBytes(6).toString('hex')}`;
    const hostParticipantToken = crypto.randomBytes(20).toString('hex');
    const cleanPasscode = cleanText(input.passcode, 32);
    const passcodeHash = cleanPasscode ? hashPasscode(cleanPasscode) : null;
    const controlPolicy = input.controlPolicy === 'everyone' ? 'everyone' : 'host_only';
    const roomTitle =
      cleanText(input.roomTitle, 72) || `${hostName}'s Watch Party`;

    const now = Date.now();
    const hostSession = {
      id: hostId,
      token: hostParticipantToken,
      name: hostName,
      joinedAt: now,
      connected: false,
      reportedPositionSeconds: 0,
    };

    const sessions = new Map();
    sessions.set(hostParticipantToken, hostSession);

    const room = {
      roomId,
      roomTitle,
      passcodeHash,
      hostSecret,
      controlPolicy,
      hostId,
      createdAt: now,
      lastActiveAt: now,
      media,
      playback: {
        isPlaying: false,
        positionSeconds: 0,
        durationSeconds: null,
        updatedAtServerMs: now,
        updatedByName: hostName,
      },
      sessions,
      clients: new Map(), // ws -> session
      messages: [
        {
          id: `sys_${crypto.randomBytes(6).toString('hex')}`,
          kind: 'system',
          senderId: null,
          senderName: 'Room',
          isHost: false,
          text: `Room ${roomId} created · ${describeMediaLabel(media)}`,
          createdAt: now,
        },
      ],
    };

    rooms.set(roomId, room);

    return {
      room: serializeRoomSnapshot(room),
      hostSecret,
      participantId: hostId,
      participantToken: hostParticipantToken,
    };
  }

  async function handleHttpRequest(req, res) {
    const urlObj = new URL(req.url || '/', 'http://localhost');
    const pathname = urlObj.pathname;

    if (!pathname.startsWith('/api/party')) {
      return false;
    }

    if (req.method === 'GET' && pathname === '/api/party/health') {
      pruneExpiredRooms();
      sendJsonHttp(res, 200, {
        ok: true,
        activeRooms: rooms.size,
        serverTimeMs: Date.now(),
      });
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/party/rooms') {
      const ip =
        String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'local')
          .split(',')[0]
          .trim();
      let bucket = ipCreateBuckets.get(ip);
      if (!bucket) {
        bucket = createRateBucket(10, 0.25);
        ipCreateBuckets.set(ip, bucket);
      }
      if (!bucket(1)) {
        sendJsonHttp(res, 429, {
          error: 'Too many rooms created recently. Please wait a moment.',
        });
        return true;
      }

      try {
        const body = await readJsonBody(req);
        const created = createRoomRecord(body || {});
        sendJsonHttp(res, 201, created);
      } catch (err) {
        sendJsonHttp(res, 400, {
          error: err instanceof Error ? err.message : 'Unable to create watch party room.',
        });
      }
      return true;
    }

    const roomMatch = pathname.match(/^\/api\/party\/rooms\/([A-Za-z0-9_-]{3,16})$/);
    if (req.method === 'GET' && roomMatch) {
      const code = normalizeRoomCode(roomMatch[1]);
      const room = rooms.get(code);
      if (!room) {
        sendJsonHttp(res, 404, {
          exists: false,
          roomId: code,
        });
        return true;
      }

      const activeCount = serializeParticipants(room).length;
      sendJsonHttp(res, 200, {
        exists: true,
        roomId: room.roomId,
        roomTitle: room.roomTitle,
        hasPasscode: Boolean(room.passcodeHash),
        participantCount: activeCount,
        mediaTitle: describeMediaLabel(room.media),
      });
      return true;
    }

    sendJsonHttp(res, 404, { error: 'Watch party endpoint not found.' });
    return true;
  }

  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_WS_PAYLOAD_BYTES,
  });

  wss.on('connection', (ws) => {
    let joinedRoom = null;
    let joinedSession = null;

    const allowChat = createRateBucket(8, 0.8);
    const allowSync = createRateBucket(20, 4);

    ws.on('message', (rawBuffer) => {
      let msg;
      try {
        const text = typeof rawBuffer === 'string' ? rawBuffer : rawBuffer.toString('utf8');
        msg = JSON.parse(text, (key, val) => {
          if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            return undefined;
          }
          return val;
        });
      } catch {
        sendWs(ws, {
          type: 'error',
          code: 'INVALID_JSON',
          message: 'Malformed WebSocket message.',
        });
        return;
      }

      if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') {
        return;
      }

      if (msg.type === 'ping') {
        sendWs(ws, {
          type: 'pong',
          clientSentMs: typeof msg.clientSentMs === 'number' ? msg.clientSentMs : 0,
          serverNowMs: Date.now(),
        });
        return;
      }

      if (msg.type === 'join') {
        if (joinedRoom) return;

        const roomId = normalizeRoomCode(msg.roomId);
        const room = rooms.get(roomId);
        if (!room) {
          sendWs(ws, {
            type: 'error',
            code: 'ROOM_NOT_FOUND',
            message: `Room "${roomId || 'unknown'}" does not exist or has expired.`,
          });
          return;
        }

        const isHostBySecret =
          typeof msg.hostSecret === 'string' &&
          msg.hostSecret.length === room.hostSecret.length &&
          crypto.timingSafeEqual(
            Buffer.from(msg.hostSecret, 'utf8'),
            Buffer.from(room.hostSecret, 'utf8'),
          );

        const existingSession =
          typeof msg.participantToken === 'string'
            ? room.sessions.get(msg.participantToken) ?? null
            : null;

        if (!isHostBySecret && !existingSession && room.passcodeHash) {
          if (!verifyPasscode(msg.passcode, room.passcodeHash)) {
            sendWs(ws, {
              type: 'error',
              code: 'PASSCODE_REQUIRED',
              message: msg.passcode
                ? 'Incorrect room passcode.'
                : 'This private room requires a passcode to join.',
            });
            return;
          }
        }

        const connectedCount = serializeParticipants(room).length;
        if (!existingSession && connectedCount >= MAX_PARTICIPANTS_PER_ROOM) {
          sendWs(ws, {
            type: 'error',
            code: 'ROOM_FULL',
            message: `This watch party is full (${MAX_PARTICIPANTS_PER_ROOM} participants max).`,
          });
          return;
        }

        const cleanName = cleanText(msg.name, 28) || 'Guest';
        let session = existingSession;

        if (session) {
          session.name = cleanName;
          // Close any stale duplicate socket using the same participant token
          for (const [otherWs, otherSession] of room.clients.entries()) {
            if (otherSession.id === session.id && otherWs !== ws) {
              room.clients.delete(otherWs);
              try {
                otherWs.close(4000, 'Session resumed in another tab');
              } catch {
                // Ignore
              }
            }
          }
        } else {
          const newToken = crypto.randomBytes(20).toString('hex');
          session = {
            id: `p_${crypto.randomBytes(6).toString('hex')}`,
            token: newToken,
            name: cleanName,
            joinedAt: Date.now(),
            connected: true,
            reportedPositionSeconds: null,
          };
          room.sessions.set(newToken, session);
        }

        const wasAlreadyConnected = Boolean(session.connected && existingSession);
        session.connected = true;

        if (isHostBySecret) {
          room.hostId = session.id;
        } else {
          // If no connected host currently exists, promote first connected member
          const hostStillConnected = Array.from(room.sessions.values()).some(
            (s) => s.id === room.hostId && s.connected,
          );
          if (!hostStillConnected) {
            room.hostId = session.id;
          }
        }

        joinedRoom = room;
        joinedSession = session;
        room.clients.set(ws, session);
        room.lastActiveAt = Date.now();

        sendWs(ws, {
          type: 'welcome',
          selfId: session.id,
          participantToken: session.token,
          isHost: session.id === room.hostId,
          room: serializeRoomSnapshot(room),
          serverNowMs: Date.now(),
        });

        broadcastParticipants(room);
        if (!wasAlreadyConnected) {
          appendSystemMessage(room, `${session.name} joined the watch party.`);
        }
        return;
      }

      // All subsequent actions require an active room membership
      if (!joinedRoom || !joinedSession) {
        sendWs(ws, {
          type: 'error',
          code: 'NOT_JOINED',
          message: 'Join a watch party room first.',
        });
        return;
      }

      joinedRoom.lastActiveAt = Date.now();
      const isHost = joinedSession.id === joinedRoom.hostId;
      const canControlPlayback =
        isHost || joinedRoom.controlPolicy === 'everyone';

      if (msg.type === 'chat') {
        if (!allowChat(1)) {
          sendWs(ws, {
            type: 'error',
            code: 'RATE_LIMITED',
            message: 'You are sending messages too quickly.',
          });
          return;
        }
        const cleanBody = cleanText(msg.text, 500);
        if (!cleanBody) return;

        const chatMessage = {
          id: `m_${crypto.randomBytes(6).toString('hex')}`,
          kind: 'chat',
          senderId: joinedSession.id,
          senderName: joinedSession.name,
          isHost,
          text: cleanBody,
          createdAt: Date.now(),
        };
        joinedRoom.messages.push(chatMessage);
        if (joinedRoom.messages.length > MAX_CHAT_HISTORY) {
          joinedRoom.messages.splice(0, joinedRoom.messages.length - MAX_CHAT_HISTORY);
        }
        broadcastToRoom(joinedRoom, {
          type: 'chat_message',
          message: chatMessage,
        });
        return;
      }

      if (msg.type === 'sync_playback') {
        if (!canControlPlayback) {
          sendWs(ws, {
            type: 'error',
            code: 'HOST_ONLY',
            message: 'Only the room host can control playback right now.',
          });
          return;
        }
        if (!allowSync(1)) return;

        const isPlaying = Boolean(msg.isPlaying);
        const pos =
          typeof msg.positionSeconds === 'number' && Number.isFinite(msg.positionSeconds)
            ? Math.min(MAX_MEDIA_SECONDS, Math.max(0, msg.positionSeconds))
            : 0;
        const dur =
          typeof msg.durationSeconds === 'number' &&
          Number.isFinite(msg.durationSeconds) &&
          msg.durationSeconds > 0
            ? Math.min(MAX_MEDIA_SECONDS, msg.durationSeconds)
            : joinedRoom.playback.durationSeconds;

        const nowMs = Date.now();
        joinedRoom.playback = {
          isPlaying,
          positionSeconds: Math.round(pos * 100) / 100,
          durationSeconds: dur ? Math.round(dur * 100) / 100 : null,
          updatedAtServerMs: nowMs,
          updatedByName: joinedSession.name,
        };
        joinedSession.reportedPositionSeconds = Math.floor(pos);

        broadcastToRoom(joinedRoom, {
          type: 'playback_updated',
          playback: joinedRoom.playback,
          serverNowMs: nowMs,
        });
        return;
      }

      if (msg.type === 'change_media') {
        if (!canControlPlayback) {
          sendWs(ws, {
            type: 'error',
            code: 'HOST_ONLY',
            message: 'Only the room host can switch episodes or video sources.',
          });
          return;
        }
        const nextMedia = validateMediaState(msg.media);
        if (!nextMedia) {
          sendWs(ws, {
            type: 'error',
            code: 'INVALID_MEDIA',
            message: 'Invalid media or stream URL (HTTPS required).',
          });
          return;
        }

        const nowMs = Date.now();
        joinedRoom.media = nextMedia;
        joinedRoom.playback = {
          isPlaying: false,
          positionSeconds: 0,
          durationSeconds: null,
          updatedAtServerMs: nowMs,
          updatedByName: joinedSession.name,
        };

        broadcastToRoom(joinedRoom, {
          type: 'media_updated',
          media: joinedRoom.media,
          playback: joinedRoom.playback,
          serverNowMs: nowMs,
        });
        appendSystemMessage(
          joinedRoom,
          `${joinedSession.name} switched to ${describeMediaLabel(nextMedia)}.`,
        );
        return;
      }

      if (msg.type === 'update_settings') {
        if (!isHost) {
          sendWs(ws, {
            type: 'error',
            code: 'HOST_ONLY',
            message: 'Only the host can update room settings.',
          });
          return;
        }
        if (msg.controlPolicy === 'host_only' || msg.controlPolicy === 'everyone') {
          joinedRoom.controlPolicy = msg.controlPolicy;
        }
        if (typeof msg.roomTitle === 'string') {
          const nextTitle = cleanText(msg.roomTitle, 72);
          if (nextTitle) joinedRoom.roomTitle = nextTitle;
        }
        broadcastToRoom(joinedRoom, {
          type: 'room_state',
          room: serializeRoomSnapshot(joinedRoom),
          serverNowMs: Date.now(),
        });
        return;
      }

      if (msg.type === 'transfer_host') {
        if (!isHost) return;
        const targetId = cleanText(msg.targetParticipantId, 40);
        const target = Array.from(joinedRoom.sessions.values()).find(
          (s) => s.id === targetId && s.connected,
        );
        if (!target) return;
        joinedRoom.hostId = target.id;
        broadcastParticipants(joinedRoom);
        appendSystemMessage(joinedRoom, `${target.name} is now the room host.`);
        return;
      }

      if (msg.type === 'kick_member') {
        if (!isHost) return;
        const targetId = cleanText(msg.targetParticipantId, 40);
        if (!targetId || targetId === joinedSession.id) return;

        for (const [clientWs, sess] of joinedRoom.clients.entries()) {
          if (sess.id === targetId) {
            sess.connected = false;
            joinedRoom.clients.delete(clientWs);
            joinedRoom.sessions.delete(sess.token);
            sendWs(clientWs, {
              type: 'kicked',
              reason: 'You were removed from the room by the host.',
            });
            try {
              clientWs.close(4001, 'Removed by host');
            } catch {
              // Ignore
            }
            broadcastParticipants(joinedRoom);
            appendSystemMessage(joinedRoom, `${sess.name} was removed from the room.`);
            break;
          }
        }
        return;
      }

      if (msg.type === 'report_position') {
        if (
          typeof msg.positionSeconds === 'number' &&
          Number.isFinite(msg.positionSeconds) &&
          msg.positionSeconds >= 0
        ) {
          joinedSession.reportedPositionSeconds = Math.min(
            MAX_MEDIA_SECONDS,
            Math.floor(msg.positionSeconds),
          );
          broadcastParticipants(joinedRoom);
        }
      }
    });

    ws.on('close', () => {
      if (!joinedRoom || !joinedSession) return;
      const activeForSession = joinedRoom.clients.get(ws);
      if (activeForSession && activeForSession.id === joinedSession.id) {
        joinedRoom.clients.delete(ws);
        joinedSession.connected = false;
        joinedRoom.lastActiveAt = Date.now();

        if (joinedRoom.hostId === joinedSession.id) {
          const remaining = serializeParticipants(joinedRoom);
          if (remaining.length > 0) {
            joinedRoom.hostId = remaining[0].id;
            appendSystemMessage(
              joinedRoom,
              `${joinedSession.name} disconnected · ${remaining[0].name} is now host.`,
            );
          }
        } else {
          appendSystemMessage(joinedRoom, `${joinedSession.name} left the room.`);
        }
        broadcastParticipants(joinedRoom);
      }
    });
  });

  function handleUpgrade(req, socket, head) {
    try {
      const urlObj = new URL(req.url || '/', 'http://localhost');
      if (urlObj.pathname !== '/ws/party') {
        return false;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
      return true;
    } catch {
      return false;
    }
  }

  function attachToServer(httpServer) {
    httpServer.on('upgrade', (req, socket, head) => {
      handleUpgrade(req, socket, head);
    });
  }

  function close() {
    clearInterval(cleanupInterval);
    for (const client of wss.clients) {
      try {
        client.terminate();
      } catch {
        // Ignore
      }
    }
    wss.close();
    rooms.clear();
  }

  return {
    handleHttpRequest,
    handleUpgrade,
    attachToServer,
    close,
  };
}
