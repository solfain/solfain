import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { createWatchPartyHub } from '../../server/watchPartyHub.mjs';
import { WatchPartyLobbyPage } from '../pages/WatchPartyLobbyPage';
import { WatchPartyRoomPage } from '../pages/WatchPartyRoomPage';
import { clearAniListCache } from '../services/anilist/client';
import {
  getInterpolatedPartyPosition,
  normalizePartyRoomCode,
} from '../services/watchParty/watchPartyClient';
import type { PartyServerSocketMessage } from '../types/watchParty';

function waitForSocketMessage(
  ws: WebSocket,
  predicate: (msg: PartyServerSocketMessage) => boolean,
  timeoutMs = 3000,
): Promise<PartyServerSocketMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMsg);
      reject(new Error('Timed out waiting for matching WebSocket message'));
    }, timeoutMs);

    function onMsg(raw: WebSocket.RawData) {
      const parsed = JSON.parse(raw.toString('utf8')) as PartyServerSocketMessage;
      if (predicate(parsed)) {
        clearTimeout(timer);
        ws.off('message', onMsg);
        resolve(parsed);
      }
    }

    ws.on('message', onMsg);
  });
}

describe('Watch Party Real-Time Hub & Client Integration', () => {
  let hub: ReturnType<typeof createWatchPartyHub> | null = null;
  let server: http.Server | null = null;
  let baseUrl = '';
  let wsUrl = '';

  beforeEach(async () => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    clearAniListCache();

    hub = createWatchPartyHub();
    server = http.createServer((req, res) => {
      void hub!.handleHttpRequest(req, res).then((handled) => {
        if (!handled) {
          res.statusCode = 404;
          res.end();
        }
      });
    });
    hub.attachToServer(server);

    await new Promise<void>((resolve) => {
      server!.listen(0, '127.0.0.1', () => resolve());
    });
    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${port}`;
    wsUrl = `ws://127.0.0.1:${port}/ws/party`;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (hub) {
      hub.close();
      hub = null;
    }
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = null;
    }
  });

  it('creates passcode-locked rooms, enforces host-only sync, and broadcasts playback, episode switches, and chat over WebSocket', async () => {
    // 1. Create private room with passcode via HTTP POST
    const createRes = await fetch(`${baseUrl}/api/party/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hostName: 'Akira',
        roomTitle: 'Horimiya Rewatch',
        passcode: 'secret42',
        controlPolicy: 'host_only',
        media: {
          sourceType: 'yenime',
          animeId: 124080,
          idMal: 42897,
          animeTitle: 'Horimiya',
          coverImage: 'https://s4.anilist.co/cover.png',
          episode: 1,
          totalEpisodes: 13,
          audio: 'sub',
          idMode: 'anilist',
        },
      }),
    });

    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as {
      room: { roomId: string };
      hostSecret: string;
      participantToken: string;
    };
    const roomId = created.room.roomId;
    expect(roomId).toHaveLength(6);

    // 2. Verify public room preview hides secrets and reports passcode lock
    const previewRes = await fetch(`${baseUrl}/api/party/rooms/${roomId}`);
    const preview = (await previewRes.json()) as {
      exists: boolean;
      hasPasscode: boolean;
      roomTitle: string;
    };
    expect(preview.exists).toBe(true);
    expect(preview.hasPasscode).toBe(true);
    expect(preview.roomTitle).toBe('Horimiya Rewatch');

    // 3. Connect Host WebSocket
    const hostWs = new WebSocket(wsUrl);
    await new Promise<void>((resolve) => hostWs.once('open', () => resolve()));
    const hostWelcomePromise = waitForSocketMessage(hostWs, (m) => m.type === 'welcome');
    hostWs.send(
      JSON.stringify({
        type: 'join',
        roomId,
        name: 'Akira',
        hostSecret: created.hostSecret,
        participantToken: created.participantToken,
      }),
    );
    const hostWelcome = await hostWelcomePromise;
    expect(hostWelcome.type === 'welcome' && hostWelcome.isHost).toBe(true);

    // 4. Guest with wrong passcode is rejected
    const badGuestWs = new WebSocket(wsUrl);
    await new Promise<void>((resolve) => badGuestWs.once('open', () => resolve()));
    const badErrPromise = waitForSocketMessage(badGuestWs, (m) => m.type === 'error');
    badGuestWs.send(
      JSON.stringify({
        type: 'join',
        roomId,
        name: 'Mina',
        passcode: 'wrongpass',
      }),
    );
    const badErr = await badErrPromise;
    expect(badErr.type === 'error' && badErr.code).toBe('PASSCODE_REQUIRED');
    badGuestWs.close();

    // 5. Guest with valid passcode joins successfully
    const guestWs = new WebSocket(wsUrl);
    await new Promise<void>((resolve) => guestWs.once('open', () => resolve()));
    const guestWelcomePromise = waitForSocketMessage(guestWs, (m) => m.type === 'welcome');
    guestWs.send(
      JSON.stringify({
        type: 'join',
        roomId,
        name: 'Mina',
        passcode: 'secret42',
      }),
    );
    const guestWelcome = await guestWelcomePromise;
    expect(guestWelcome.type === 'welcome' && guestWelcome.isHost).toBe(false);

    // 6. Guest cannot override playback when controlPolicy === 'host_only'
    const hostOnlyErrPromise = waitForSocketMessage(guestWs, (m) => m.type === 'error');
    guestWs.send(
      JSON.stringify({
        type: 'sync_playback',
        isPlaying: true,
        positionSeconds: 500,
      }),
    );
    const hostOnlyErr = await hostOnlyErrPromise;
    expect(hostOnlyErr.type === 'error' && hostOnlyErr.code).toBe('HOST_ONLY');

    // 7. Host syncs playback -> Guest receives live playback_updated
    const guestSyncPromise = waitForSocketMessage(
      guestWs,
      (m) => m.type === 'playback_updated',
    );
    hostWs.send(
      JSON.stringify({
        type: 'sync_playback',
        isPlaying: true,
        positionSeconds: 185.4,
        durationSeconds: 1440,
      }),
    );
    const guestSync = await guestSyncPromise;
    expect(guestSync.type === 'playback_updated' && guestSync.playback.isPlaying).toBe(true);
    expect(
      guestSync.type === 'playback_updated' && guestSync.playback.positionSeconds,
    ).toBeCloseTo(185.4, 1);

    // 8. Host switches to Episode 2 DUB -> Guest receives media_updated
    const guestMediaPromise = waitForSocketMessage(
      guestWs,
      (m) => m.type === 'media_updated',
    );
    hostWs.send(
      JSON.stringify({
        type: 'change_media',
        media: {
          sourceType: 'yenime',
          animeId: 124080,
          idMal: 42897,
          animeTitle: 'Horimiya',
          coverImage: 'https://s4.anilist.co/cover.png',
          episode: 2,
          totalEpisodes: 13,
          audio: 'dub',
          idMode: 'anilist',
        },
      }),
    );
    const guestMedia = await guestMediaPromise;
    expect(
      guestMedia.type === 'media_updated' &&
        guestMedia.media.sourceType === 'yenime' &&
        guestMedia.media.episode,
    ).toBe(2);
    expect(
      guestMedia.type === 'media_updated' &&
        guestMedia.media.sourceType === 'yenime' &&
        guestMedia.media.audio,
    ).toBe('dub');

    // 9. Guest sends chat message -> Host receives chat_message in real time
    const hostChatPromise = waitForSocketMessage(
      hostWs,
      (m) => m.type === 'chat_message' && m.message.kind === 'chat',
    );
    guestWs.send(JSON.stringify({ type: 'chat', text: 'Ready for episode 2!' }));
    const hostChat = await hostChatPromise;
    expect(
      hostChat.type === 'chat_message' && hostChat.message.senderName,
    ).toBe('Mina');
    expect(hostChat.type === 'chat_message' && hostChat.message.text).toBe(
      'Ready for episode 2!',
    );

    hostWs.close();
    guestWs.close();
  });

  it('rejects insecure non-HTTPS direct stream URLs when creating rooms', async () => {
    const badRes = await fetch(`${baseUrl}/api/party/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hostName: 'Akira',
        media: {
          sourceType: 'direct',
          directVideoUrl: 'http://insecure.example.com/video.mp4',
          streamTitle: 'Bad Stream',
        },
      }),
    });
    expect(badRes.status).toBe(400);
  });

  it('normalizes invite URLs and interpolates live playback position accurately', () => {
    expect(normalizePartyRoomCode('https://solfain.app/party/7k4m9p')).toBe('7K4M9P');
    expect(normalizePartyRoomCode(' #ab23cd ')).toBe('AB23CD');

    const pos = getInterpolatedPartyPosition(
      {
        isPlaying: true,
        positionSeconds: 100,
        durationSeconds: 1400,
        updatedAtServerMs: 1_000_000,
        updatedByName: 'Akira',
      },
      0,
      1_005_000,
    );
    expect(pos).toBe(105);
  });

  it('renders Watch Party Lobby (/party) with live hub status and prefilled anime from query params', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/party/health')) {
        return new Response(
          JSON.stringify({ ok: true, activeRooms: 1, serverTimeMs: Date.now() }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({
          data: {
            Media: {
              id: 124080,
              idMal: 42897,
              type: 'ANIME',
              title: { romaji: 'Horimiya', english: 'Horimiya', native: 'ホリミヤ' },
              coverImage: {
                extraLarge: 'https://s4.anilist.co/bx124080.png',
                large: 'https://s4.anilist.co/bx124080.png',
                medium: 'https://s4.anilist.co/bx124080.png',
                color: '#e4a15d',
              },
              bannerImage: null,
              format: 'TV',
              status: 'FINISHED',
              episodes: 13,
              duration: 24,
              season: 'WINTER',
              seasonYear: 2021,
              startDate: { year: 2021, month: 1, day: 10 },
              endDate: null,
              averageScore: 82,
              popularity: 400000,
              genres: ['Romance'],
              isAdult: false,
              description: 'Test',
              nextAiringEpisode: null,
              studios: { edges: [] },
              source: 'MANGA',
              synonyms: [],
              favourites: 1000,
              siteUrl: null,
              trailer: null,
              streamingEpisodes: [],
              externalLinks: [],
              characters: { edges: [] },
              relations: { edges: [] },
              recommendations: { nodes: [] },
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    render(
      <MemoryRouter initialEntries={['/party?animeId=124080&ep=3&audio=dub']}>
        <Routes>
          <Route path="/party" element={<WatchPartyLobbyPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Real-Time WebSocket Hub Online')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText('Horimiya')).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/Starting Episode/i)).toHaveValue(3);
  });

  it('opens the Invite Friends panel, copies via fallback when navigator.clipboard is blocked in an iframe, and joins cleanly from an invite URL', async () => {
    // Stub WebSocket in jsdom so WatchPartyRoomPage doesn't open lingering connections
    class StubBrowserWebSocket {
      static OPEN = 1;
      readyState = 1;
      addEventListener() {}
      removeEventListener() {}
      send() {}
      close() {}
    }
    vi.stubGlobal('WebSocket', StubBrowserWebSocket);

    // Simulate cross-origin iframe blocking Async Clipboard API while allowing execCommand('copy')
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockRejectedValue(new Error('NotAllowedError: Blocked by iframe policy')),
      },
    });
    const execCopySpy = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCopySpy,
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          exists: true,
          roomId: '7K4M9P',
          roomTitle: 'Friday Night Anime',
          hasPasscode: false,
          participantCount: 1,
          mediaTitle: 'Horimiya · Episode 1',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    // 1. Render as an invited friend arriving via /party/7K4M9P (joinedOnce === false)
    const { unmount } = render(
      <MemoryRouter initialEntries={['/party/7K4M9P']}>
        <Routes>
          <Route path="/party/:roomId" element={<WatchPartyRoomPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Friday Night Anime')).toBeInTheDocument();
    });

    // Submit Pre-Join form -> transitions joinedOnce false -> true without hook-order errors
    fireEvent.change(screen.getByLabelText(/Your Display Name/i), {
      target: { value: 'Ren' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Join Watch Party/i }));

    // 2. Click "Invite Friends" button in the room top bar
    const inviteBtn = await screen.findByRole('button', { name: /Invite Friends/i });
    fireEvent.click(inviteBtn);

    await waitFor(() => {
      expect(
        screen.getByLabelText(/Invite friends to this Watch Party/i),
      ).toBeInTheDocument();
    });

    expect(execCopySpy).toHaveBeenCalledWith('copy');
    expect(screen.getByLabelText(/Direct Invite Link/i)).toHaveValue(
      `${window.location.origin}/party/7K4M9P`,
    );
    expect(screen.getByRole('button', { name: /Invite Copied!/i })).toBeInTheDocument();

    // Copy 6-Char Room Code button works as well
    fireEvent.click(screen.getByRole('button', { name: /Copy Code/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Copied!/i })).toBeInTheDocument();
    });

    unmount();
    vi.unstubAllGlobals();
  });
});
