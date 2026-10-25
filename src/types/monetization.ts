export type AdPlacement =
  | 'home-top-rectangle'
  | 'home-leaderboard'
  | 'home-mid-rectangle'
  | 'home-footer-banner'
  | 'search-top-banner'
  | 'search-bottom-rectangle'
  | 'details-inline'
  | 'details-bottom-banner'
  | 'sidebar-rectangle'
  | 'watch-below-player'
  | 'watch-sidebar-rectangle'
  | 'collection-footer-banner';

export interface AdDimensions {
  desktopWidth: number;
  desktopHeight: number;
  mobileWidth: number;
  mobileHeight: number;
}

export interface PerchSlotConfig {
  placement: AdPlacement;
  label: string;
  perchFormat: string;
  dimensions: AdDimensions;
  /**
   * Perch Ads `data-space` identifier (e.g. "f83vmd3w8e") for
   * `<script async src="https://www.perchads.com/embed.js" data-space="..."></script>`.
   * Leave empty to keep the slot in reserved placeholder mode.
   */
  desktopSpaceId: string;
  /**
   * Optional separate Perch Ads `data-space` ID for < 760px mobile banners (320x50).
   */
  mobileSpaceId?: string;
  /**
   * Embed script URL (defaults to "https://www.perchads.com/embed.js").
   */
  embedScriptUrl?: string;
}

export interface AdSlotRenderContext {
  placement: AdPlacement;
  container: HTMLElement;
  dimensions: AdDimensions;
  signal: AbortSignal;
}

export interface AdRenderOutcome {
  rendered: boolean;
  blocked?: boolean;
  reason?: string;
}

export interface AdNetworkAdapter {
  readonly id: string;
  readonly name: string;
  readonly isConfigured: boolean;
  isPlacementConfigured?(placement: AdPlacement): boolean;
  getPlacementSpaceId?(placement: AdPlacement): string;
  mountSlot(context: AdSlotRenderContext): Promise<AdRenderOutcome>;
  unmountSlot?(container: HTMLElement): void;
}

export interface AdSystemSettings {
  enabled: boolean;
  reserveSpace: boolean;
  placements: Record<AdPlacement, boolean>;
}
