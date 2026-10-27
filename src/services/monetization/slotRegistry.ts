import type {
  AdDimensions,
  AdNetworkAdapter,
  AdPlacement,
  AdSystemSettings,
} from '../../types/monetization';
import { ADSTERRA_SLOTS, createAdsterraAdapter } from './adsterraConfig';

export const DEFAULT_AD_DIMENSIONS: Record<AdPlacement, AdDimensions> = Object.fromEntries(
  Object.entries(ADSTERRA_SLOTS).map(([key, config]) => [key, config.dimensions]),
) as Record<AdPlacement, AdDimensions>;

const defaultAdsterraAdapter: AdNetworkAdapter = createAdsterraAdapter(ADSTERRA_SLOTS);

let activeAdAdapter: AdNetworkAdapter = defaultAdsterraAdapter;

const defaultPlacementsEnabled: Record<AdPlacement, boolean> = {
  'home-mid-banner': true,
  'home-footer-rectangle': true,
  'search-top-banner': true,
  'search-bottom-rectangle': true,
  'schedule-bottom-rectangle': true,
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
  activeAdAdapter = defaultAdsterraAdapter;
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
