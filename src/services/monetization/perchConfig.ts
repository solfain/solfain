import type {
  AdNetworkAdapter,
  AdPlacement,
  AdSlotRenderContext,
  PerchSlotConfig,
} from '../../types/monetization';

export const PERCH_EMBED_SCRIPT_URL = 'https://www.perchads.com/embed.js';

/** Live 300x250 Perch Ads space ID */
export const PERCH_SPACE_300X250 = 'f83vmd3w8e';

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

export const PERCH_ADS_SLOTS: Record<AdPlacement, PerchSlotConfig> = {
  'home-top-rectangle': {
    placement: 'home-top-rectangle',
    label: 'Home Spotlight Rectangle',
    perchFormat: 'Medium Rectangle',
    dimensions: MEDIUM_RECTANGLE_DIMS,
    desktopSpaceId: PERCH_SPACE_300X250,
  },
  'home-leaderboard': {
    placement: 'home-leaderboard',
    label: 'Home Mid-Page Leaderboard',
    perchFormat: 'Leaderboard / Mobile Banner',
    dimensions: LEADERBOARD_DIMS,
    desktopSpaceId: '',
    mobileSpaceId: '',
  },
  'home-mid-rectangle': {
    placement: 'home-mid-rectangle',
    label: 'Home Catalogue Rectangle',
    perchFormat: 'Medium Rectangle',
    dimensions: MEDIUM_RECTANGLE_DIMS,
    desktopSpaceId: PERCH_SPACE_300X250,
  },
  'home-footer-banner': {
    placement: 'home-footer-banner',
    label: 'Home Footer Leaderboard',
    perchFormat: 'Leaderboard / Mobile Banner',
    dimensions: LEADERBOARD_DIMS,
    desktopSpaceId: '',
    mobileSpaceId: '',
  },
  'search-top-banner': {
    placement: 'search-top-banner',
    label: 'Browse Top Leaderboard',
    perchFormat: 'Leaderboard / Mobile Banner',
    dimensions: LEADERBOARD_DIMS,
    desktopSpaceId: '',
    mobileSpaceId: '',
  },
  'search-bottom-rectangle': {
    placement: 'search-bottom-rectangle',
    label: 'Browse Bottom Rectangle',
    perchFormat: 'Medium Rectangle',
    dimensions: MEDIUM_RECTANGLE_DIMS,
    desktopSpaceId: PERCH_SPACE_300X250,
  },
  'details-inline': {
    placement: 'details-inline',
    label: 'Details Inline Banner',
    perchFormat: 'Leaderboard / Mobile Banner',
    dimensions: LEADERBOARD_DIMS,
    desktopSpaceId: '',
    mobileSpaceId: '',
  },
  'details-bottom-banner': {
    placement: 'details-bottom-banner',
    label: 'Details Footer Leaderboard',
    perchFormat: 'Leaderboard / Mobile Banner',
    dimensions: LEADERBOARD_DIMS,
    desktopSpaceId: '',
    mobileSpaceId: '',
  },
  'sidebar-rectangle': {
    placement: 'sidebar-rectangle',
    label: 'Details Sidebar Rectangle',
    perchFormat: 'Medium Rectangle',
    dimensions: MEDIUM_RECTANGLE_DIMS,
    desktopSpaceId: PERCH_SPACE_300X250,
  },
  'watch-below-player': {
    placement: 'watch-below-player',
    label: 'Watch Below-Player Banner',
    perchFormat: 'Leaderboard / Mobile Banner',
    dimensions: LEADERBOARD_DIMS,
    desktopSpaceId: '',
    mobileSpaceId: '',
  },
  'watch-sidebar-rectangle': {
    placement: 'watch-sidebar-rectangle',
    label: 'Watch Sidebar Rectangle',
    perchFormat: 'Medium Rectangle',
    dimensions: MEDIUM_RECTANGLE_DIMS,
    desktopSpaceId: PERCH_SPACE_300X250,
  },
  'collection-footer-banner': {
    placement: 'collection-footer-banner',
    label: 'Collection Footer Leaderboard',
    perchFormat: 'Leaderboard / Mobile Banner',
    dimensions: LEADERBOARD_DIMS,
    desktopSpaceId: '',
    mobileSpaceId: '',
  },
};

function selectSpaceId(slot: PerchSlotConfig): string {
  const isMobile =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(max-width: 760px)').matches;

  if (isMobile && slot.mobileSpaceId?.trim()) {
    return slot.mobileSpaceId.trim();
  }
  return slot.desktopSpaceId.trim();
}

export function createPerchAdsAdapter(
  slots: Record<AdPlacement, PerchSlotConfig> = PERCH_ADS_SLOTS,
): AdNetworkAdapter {
  const hasAnySpace = Object.values(slots).some((s) =>
    Boolean(s.desktopSpaceId.trim() || s.mobileSpaceId?.trim()),
  );

  return {
    id: 'perchads',
    name: 'Perch Ads',
    isConfigured: hasAnySpace,
    isPlacementConfigured(placement: AdPlacement): boolean {
      const slot = slots[placement];
      if (!slot) return false;
      return Boolean(selectSpaceId(slot));
    },
    getPlacementSpaceId(placement: AdPlacement): string {
      const slot = slots[placement];
      if (!slot) return '';
      return selectSpaceId(slot);
    },
    async mountSlot(context: AdSlotRenderContext) {
      const slot = slots[context.placement];
      if (!slot) {
        return { rendered: false, reason: 'Unknown Perch Ads placement.' };
      }

      const spaceId = selectSpaceId(slot);
      if (!spaceId) {
        return {
          rendered: false,
          reason: 'Perch Ads data-space ID not yet configured for this slot.',
        };
      }

      const scriptSrc = slot.embedScriptUrl?.trim() || PERCH_EMBED_SCRIPT_URL;

      return new Promise((resolve) => {
        if (context.signal.aborted) {
          resolve({ rendered: false, reason: 'Aborted' });
          return;
        }

        // Defer by one short tick so React 19 StrictMode's throwaway initial
        // mount/cleanup cycle cancels cleanly without creating a detached <script>.
        const mountTimer = window.setTimeout(() => {
          if (context.signal.aborted) {
            resolve({ rendered: false, reason: 'Aborted' });
            return;
          }

          context.container.innerHTML = '';
          const script = document.createElement('script');
          script.async = true;
          script.src = scriptSrc;
          script.setAttribute('data-space', spaceId);

          script.onload = () => {
            if (!context.signal.aborted) {
              resolve({ rendered: true });
            }
          };
          script.onerror = () => {
            if (!context.signal.aborted) {
              context.container.innerHTML = '';
              resolve({
                rendered: false,
                blocked: true,
                reason: 'Perch Ads script was blocked by browser or network.',
              });
            }
          };

          context.container.appendChild(script);
        }, 20);

        context.signal.addEventListener(
          'abort',
          () => {
            window.clearTimeout(mountTimer);
            resolve({ rendered: false, reason: 'Aborted' });
          },
          { once: true },
        );
      });
    },
    unmountSlot(container: HTMLElement) {
      container.innerHTML = '';
    },
  };
}
