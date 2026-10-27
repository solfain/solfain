export type AdPlacement =
  | 'home-mid-banner'
  | 'home-footer-rectangle'
  | 'search-top-banner'
  | 'search-bottom-rectangle'
  | 'seasons-top-banner'
  | 'seasons-bottom-rectangle'
  | 'schedule-bottom-rectangle'
  | 'studio-bottom-rectangle'
  | 'party-bottom-rectangle'
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

export interface AdsterraUnitSpec {
  key: string;
  format: 'iframe';
  width: number;
  height: number;
  invokeUrl: string;
  /**
   * Optional official Adsterra Anti-AdBlock / alternate invoke URLs from your
   * Adsterra Publisher Dashboard, tried in order if the primary URL is DNS-blocked.
   */
  fallbackInvokeUrls?: string[];
  params?: Record<string, unknown>;
}

export interface AdsterraSlotConfig {
  placement: AdPlacement;
  label: string;
  unit: AdsterraUnitSpec | null;
  dimensions: AdDimensions;
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
  getPlacementKey?(placement: AdPlacement): string;
  mountSlot(context: AdSlotRenderContext): Promise<AdRenderOutcome>;
  unmountSlot?(container: HTMLElement): void;
}

export interface AdSystemSettings {
  enabled: boolean;
  reserveSpace: boolean;
  placements: Record<AdPlacement, boolean>;
}
