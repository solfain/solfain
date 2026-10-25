import type {
  AdDimensions,
  AdNetworkAdapter,
  AdPlacement,
  AdSystemSettings,
} from '../../types/monetization';
import { createPerchAdsAdapter, PERCH_ADS_SLOTS } from './perchConfig';

export const DEFAULT_AD_DIMENSIONS: Record<AdPlacement, AdDimensions> = Object.fromEntries(
  Object.entries(PERCH_ADS_SLOTS).map(([key, config]) => [key, config.dimensions]),
) as Record<AdPlacement, AdDimensions>;

const defaultPerchAdapter: AdNetworkAdapter = createPerchAdsAdapter(PERCH_ADS_SLOTS);

let activeAdAdapter: AdNetworkAdapter = defaultPerchAdapter;

const defaultPlacementsEnabled: Record<AdPlacement, boolean> = {
  'home-top-rectangle': true,
  'home-leaderboard': true,
  'home-mid-rectangle': true,
  'home-footer-banner': true,
  'search-top-banner': true,
  'search-bottom-rectangle': true,
  'details-inline': true,
  'details-bottom-banner': true,
  'sidebar-rectangle': true,
  'watch-below-player': true,
  'watch-sidebar-rectangle': true,
  'collection-footer-banner': true,
};

let adSettings: AdSystemSettings = {
  enabled: true,
  reserveSpace: true,
  placements: { ...defaultPlacementsEnabled },
};

export function getAdNetworkAdapter(): AdNetworkAdapter {
  return activeAdAdapter;
}

export function registerAdNetworkAdapter(adapter: AdNetworkAdapter): void {
  activeAdAdapter = adapter;
}

export function resetAdNetworkAdapter(): void {
  activeAdAdapter = defaultPerchAdapter;
}

export function getAdSystemSettings(): AdSystemSettings {
  return adSettings;
}

export function updateAdSystemSettings(partial: Partial<AdSystemSettings>): void {
  adSettings = {
    ...adSettings,
    ...partial,
    placements: {
      ...adSettings.placements,
      ...(partial.placements ?? {}),
    },
  };
}
