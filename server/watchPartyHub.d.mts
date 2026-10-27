import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';

export interface WatchPartyHubInstance {
  handleHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean>;
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): boolean;
  attachToServer(httpServer: {
    on(
      event: 'upgrade',
      listener: (req: IncomingMessage, socket: Duplex, head: Buffer) => void,
    ): unknown;
  }): void;
  close(): void;
}

export function createWatchPartyHub(): WatchPartyHubInstance;
