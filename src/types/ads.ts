export type AdPlacement =
  | 'home-leaderboard'
  | 'details-inline'
  | 'watch-below-player'
  | 'sidebar-rectangle';

export interface AdDimensions {
  desktopWidth: number;
  desktopHeight: number;
  mobileWidth: number;
  mobileHeight: number;
}

export interface AdSlotRenderContext {
  placement: AdPlacement;
  container: HTMLElement;
  dimensions: AdDimensions;
  signal: AbortSignal;
}

export interface AdRenderOutcome {
  rendered: boolean;
  reason?: string;
}

/**
 * Clean integration boundary for a future verified advertising network.
 * No third-party ad scripts, fake network IDs, or simulated impressions
 * are active by default.
 */
export interface AdNetworkAdapter {
  readonly id: string;
  readonly name: string;
  readonly isConfigured: boolean;
  mountSlot(context: AdSlotRenderContext): Promise<AdRenderOutcome>;
  unmountSlot?(container: HTMLElement): void;
}

export interface AdSystemSettings {
  enabled: boolean;
  reserveSpace: boolean;
  placements: Record<AdPlacement, boolean>;
}
