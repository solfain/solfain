export type AdPlacement =
  | 'home-leaderboard'
  | 'home-mid-catalogue'
  | 'home-footer-banner'
  | 'search-top-banner'
  | 'search-bottom-banner'
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
   * Paste the Perch Ads <script src="..."> URL for desktop (or universal 300x250) here
   * once created at https://www.perchads.com/spaces/new. Leave empty for placeholder mode.
   */
  desktopScriptUrl: string;
  /**
   * Optional separate Perch Ads Mobile Banner (320x50) script URL for < 760px viewports.
   */
  mobileScriptUrl?: string;
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

export interface AdNetworkAdapter {
  readonly id: string;
  readonly name: string;
  readonly isConfigured: boolean;
  isPlacementConfigured?(placement: AdPlacement): boolean;
  mountSlot(context: AdSlotRenderContext): Promise<AdRenderOutcome>;
  unmountSlot?(container: HTMLElement): void;
}

export interface AdSystemSettings {
  enabled: boolean;
  reserveSpace: boolean;
  placements: Record<AdPlacement, boolean>;
}
