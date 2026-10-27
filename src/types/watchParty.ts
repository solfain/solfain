import type { AudioTrack, ProviderIdMode } from './provider';

export type PartySourceType = 'yenime' | 'direct';

export type PartyControlPolicy = 'host_only' | 'everyone';

export interface PartyYenimeMedia {
  sourceType: 'yenime';
  animeId: number;
  idMal: number | null;
  animeTitle: string;
  coverImage: string | null;
  episode: number;
  totalEpisodes: number | null;
  audio: AudioTrack;
  idMode: ProviderIdMode;
}

export interface PartyDirectMedia {
  sourceType: 'direct';
  directVideoUrl: string;
  streamTitle: string;
}

export type PartyMediaState = PartyYenimeMedia | PartyDirectMedia;

export interface PartyPlaybackState {
  isPlaying: boolean;
  positionSeconds: number;
  durationSeconds: number | null;
  updatedAtServerMs: number;
  updatedByName: string;
}

export interface PartyParticipant {
  id: string;
  name: string;
  isHost: boolean;
  joinedAt: number;
  reportedPositionSeconds: number | null;
}

export interface PartyChatMessage {
  id: string;
  kind: 'chat' | 'system';
  senderId: string | null;
  senderName: string;
  isHost: boolean;
  text: string;
  createdAt: number;
}

export interface PartyRoomSnapshot {
  roomId: string;
  roomTitle: string;
  hasPasscode: boolean;
  controlPolicy: PartyControlPolicy;
  hostId: string;
  createdAt: number;
  serverNowMs: number;
  media: PartyMediaState;
  playback: PartyPlaybackState;
  participants: PartyParticipant[];
  messages: PartyChatMessage[];
}

export interface PartyRoomPreview {
  exists: boolean;
  roomId: string;
  roomTitle?: string;
  hasPasscode?: boolean;
  participantCount?: number;
  mediaTitle?: string;
}

export interface CreatePartyRoomRequest {
  hostName: string;
  roomTitle?: string;
  passcode?: string;
  controlPolicy?: PartyControlPolicy;
  media: PartyMediaState;
}

export interface CreatePartyRoomResponse {
  room: PartyRoomSnapshot;
  hostSecret: string;
  participantId: string;
  participantToken: string;
}

export type PartyClientSocketMessage =
  | {
      type: 'join';
      roomId: string;
      name: string;
      passcode?: string;
      hostSecret?: string;
      participantToken?: string;
    }
  | {
      type: 'chat';
      text: string;
    }
  | {
      type: 'sync_playback';
      isPlaying: boolean;
      positionSeconds: number;
      durationSeconds?: number | null;
    }
  | {
      type: 'change_media';
      media: PartyMediaState;
    }
  | {
      type: 'update_settings';
      controlPolicy?: PartyControlPolicy;
      roomTitle?: string;
    }
  | {
      type: 'transfer_host';
      targetParticipantId: string;
    }
  | {
      type: 'kick_member';
      targetParticipantId: string;
    }
  | {
      type: 'report_position';
      positionSeconds: number;
    }
  | {
      type: 'ping';
      clientSentMs: number;
    };

export type PartyServerSocketMessage =
  | {
      type: 'welcome';
      selfId: string;
      participantToken: string;
      isHost: boolean;
      room: PartyRoomSnapshot;
      serverNowMs: number;
    }
  | {
      type: 'room_state';
      room: PartyRoomSnapshot;
      serverNowMs: number;
    }
  | {
      type: 'playback_updated';
      playback: PartyPlaybackState;
      serverNowMs: number;
    }
  | {
      type: 'media_updated';
      media: PartyMediaState;
      playback: PartyPlaybackState;
      serverNowMs: number;
    }
  | {
      type: 'chat_message';
      message: PartyChatMessage;
    }
  | {
      type: 'participants_updated';
      hostId: string;
      participants: PartyParticipant[];
    }
  | {
      type: 'kicked';
      reason: string;
    }
  | {
      type: 'error';
      code: string;
      message: string;
    }
  | {
      type: 'pong';
      clientSentMs: number;
      serverNowMs: number;
    };
