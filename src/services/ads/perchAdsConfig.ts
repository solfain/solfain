import type {
  AdNetworkAdapter,
  AdPlacement,
  AdSlotRenderContext,
  PerchSlotConfig,
} from '../../types/ads';

const LEADERBOARD_DIMS = {
  desktopWidth: 728,
  desktopHeight: 90,
  mobileWidth: 320,
  mobileHeight: 50,
} as const;

const MEDIUM_RECTANGLE_DIMS = {
  desktopWidth: 300,
  desktopHeight: 250,
  mobileWidth: 300,
  mobileHeight: 250,
} as const;

/**
 * Perch Ads (https://www.perchads.com) slot inventory for Solfain.
 * Leave `desktopScriptUrl` / `mobileScriptUrl` empty while in placeholder mode;
 * paste your real Perch Ads embed script URLs when ready to go live.
 */
export const PERCH_ADS_SLOTS: Record<AdPlacement, PerchSlotConfig> = {
  'home-leaderboard': {
    placement: 'home-leaderboard',
    label: 'Home Top Leaderboard',
    perchFormat: 'Leaderboard / Mobile Banner',
    dimensions: LEADERBOARD_DIMS,
    desktopScriptUrl: '',
    mobileScriptUrl: '',
  },
  'home-mid-catalogue': {
    placement: 'home-mid-catalogue',
    label: 'Home Mid-Catalogue Banner',
    perchFormat: 'Leaderboard / Mobile Banner',
    dimensions: LEADERBOARD_DIMS,
    desktopScriptUrl: '',
    mobileScriptUrl: '',
  },
  'home-footer-banner': {
    placement: 'home-footer-banner',
    label: 'Home Bottom Leaderboard',
    perchFormat: 'Leaderboard / Mobile Banner',
    dimensions: LEADERBOARD_DIMS,
    desktopScriptUrl: '',
    mobileScriptUrl: '',
  },
  'search-top-banner': {
    placement: 'search-top-banner',
    label: 'Browse Top Leaderboard',
    perchFormat: 'Leaderboard / Mobile Banner',
    dimensions: LEADERBOARD_DIMS,
    desktopScriptUrl: '',
    mobileScriptUrl: '',
  },
  'search-bottom-banner': {
    placement: 'search-bottom-banner',
    label: 'Browse Bottom Leaderboard',
    perchFormat: 'Leaderboard / Mobile Banner',
    dimensions: LEADERBOARD_DIMS,
    desktopScriptUrl: '',
    mobileScriptUrl: '',
  },
  'details-inline': {
    placement: 'details-inline',
    label: 'Details Inline Banner',
    perchFormat: 'Leaderboard / Mobile Banner',
    dimensions: LEADERBOARD_DIMS,
    desktopScriptUrl: '',
    mobileScriptUrl: '',
  },
  'details-bottom-banner': {
    placement: 'details-bottom-banner',
    label: 'Details Footer Leaderboard',
    perchFormat: 'Leaderboard / Mobile Banner',
    dimensions: LEADERBOARD_DIMS,
    desktopScriptUrl: '',
    mobileScriptUrl: '',
  },
  'sidebar-rectangle': {
    placement: 'sidebar-rectangle',
    label: 'Details Sidebar Rectangle',
    perchFormat: 'Medium Rectangle',
    dimensions: MEDIUM_RECTANGLE_DIMS,
    desktopScriptUrl: '',
  },
  'watch-below-player': {
    placement: 'watch-below-player',
    label: 'Watch Below-Player Banner',
    perchFormat: 'Leaderboard / Mobile Banner',
    dimensions: LEADERBOARD_DIMS,
    desktopScriptUrl: '',
    mobileScriptUrl: '',
  },
  'watch-sidebar-rectangle': {
    placement: 'watch-sidebar-rectangle',
    label: 'Watch Sidebar Rectangle',
    perchFormat: 'Medium Rectangle',
    dimensions: MEDIUM_RECTANGLE_DIMS,
    desktopScriptUrl: '',
  },
  'collection-footer-banner': {
    placement: 'collection-footer-banner',
    label: 'Collection Footer Leaderboard',
    perchFormat: 'Leaderboard / Mobile Banner',
    dimensions: LEADERBOARD_DIMS,
    desktopScriptUrl: '',
    mobileScriptUrl: '',
  },
};

function selectScriptUrl(slot: PerchSlotConfig): string {
  const isMobile =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(max-width: 760px)').matches;

  if (isMobile && slot.mobileScriptUrl?.trim()) {
    return slot.mobileScriptUrl.trim();
  }
  return slot.desktopScriptUrl.trim();
}

export function createPerchAdsAdapter(
  slots: Record<AdPlacement, PerchSlotConfig> = PERCH_ADS_SLOTS,
): AdNetworkAdapter {
  const hasAnyScript = Object.values(slots).some(
    (s) => Boolean(s.desktopScriptUrl.trim() || s.mobileScriptUrl?.trim()),
  );

  return {
    id: 'perchads',
    name: 'Perch Ads',
    isConfigured: hasAnyScript,
    isPlacementConfigured(placement: AdPlacement): boolean {
      const slot = slots[placement];
      if (!slot) return false;
      return Boolean(selectScriptUrl(slot));
    },
    async mountSlot(context: AdSlotRenderContext) {
      const slot = slots[context.placement];
      if (!slot) {
        return { rendered: false, reason: 'Unknown Perch Ads placement.' };
      }

      const scriptUrl = selectScriptUrl(slot);
      if (!scriptUrl) {
        return {
          rendered: false,
          reason: 'Perch Ads space script URL not yet configured for this slot.',
        };
      }

      return new Promise((resolve) => {
        if (context.signal.aborted) {
          resolve({ rendered: false, reason: 'Aborted' });
          return;
        }

        context.container.innerHTML = '';
        const script = document.createElement('script');
        script.async = true;
        script.src = scriptUrl;
        script.onload = () => resolve({ rendered: true });
        script.onerror = () =>
          resolve({ rendered: false, reason: 'Perch Ads script failed to load.' });

        context.container.appendChild(script);
      });
    },
    unmountSlot(container: HTMLElement) {
      container.innerHTML = '';
    },
  };
}
