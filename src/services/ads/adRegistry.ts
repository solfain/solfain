import type {
  AdDimensions,
  AdNetworkAdapter,
  AdPlacement,
  AdSystemSettings,
} from '../../types/ads';

export const DEFAULT_AD_DIMENSIONS: Record<AdPlacement, AdDimensions> = {
  'home-leaderboard': {
    desktopWidth: 728,
    desktopHeight: 90,
    mobileWidth: 320,
    mobileHeight: 50,
  },
  'details-inline': {
    desktopWidth: 728,
    desktopHeight: 90,
    mobileWidth: 320,
    mobileHeight: 50,
  },
  'watch-below-player': {
    desktopWidth: 728,
    desktopHeight: 90,
    mobileWidth: 320,
    mobileHeight: 50,
  },
  'sidebar-rectangle': {
    desktopWidth: 300,
    desktopHeight: 250,
    mobileWidth: 300,
    mobileHeight: 250,
  },
};

const unconfiguredAdAdapter: AdNetworkAdapter = {
  id: 'unconfigured',
  name: 'No Ad Network Configured',
  isConfigured: false,
  async mountSlot() {
    return {
      rendered: false,
      reason: 'No third-party ad network is currently configured.',
    };
  },
};

let activeAdAdapter: AdNetworkAdapter = unconfiguredAdAdapter;

let adSettings: AdSystemSettings = {
  enabled: true,
  reserveSpace: true,
  placements: {
    'home-leaderboard': true,
    'details-inline': true,
    'watch-below-player': true,
    'sidebar-rectangle': true,
  },
};

export function getAdNetworkAdapter(): AdNetworkAdapter {
  return activeAdAdapter;
}

export function registerAdNetworkAdapter(adapter: AdNetworkAdapter): void {
  activeAdAdapter = adapter;
}

export function resetAdNetworkAdapter(): void {
  activeAdAdapter = unconfiguredAdAdapter;
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
