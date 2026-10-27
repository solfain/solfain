import type {
  AdNetworkAdapter,
  AdPlacement,
  AdSlotRenderContext,
  AdsterraSlotConfig,
  AdsterraUnitSpec,
} from '../../types/monetization';
import { sanitizeHttpUrl } from '../../utils/security';

declare global {
  interface Window {
    atOptions?: {
      key: string;
      format: 'iframe';
      height: number;
      width: number;
      params: Record<string, unknown>;
    };
  }
}

/** Live Adsterra 300x250 Medium Rectangle unit */
export const ADSTERRA_UNIT_300X250: AdsterraUnitSpec = {
  key: '8031ff5e7be9985553dcdea4bbb45d96',
  format: 'iframe',
  width: 300,
  height: 250,
  invokeUrl: 'https://bauval.org/22/8031ff5e7be9985553dcdea4bbb45d96',
  params: {},
};

/** Live Adsterra 320x50 Banner unit */
export const ADSTERRA_UNIT_320X50: AdsterraUnitSpec = {
  key: '6339f8aa4607b6c12e213fc4cf317df1',
  format: 'iframe',
  width: 320,
  height: 50,
  invokeUrl: 'https://bauval.org/22/6339f8aa4607b6c12e213fc4cf317df1',
  params: {},
};

const DIMS_300X250 = {
  desktopWidth: 300,
  desktopHeight: 250,
  mobileWidth: 300,
  mobileHeight: 250,
} as const;

const DIMS_320X50 = {
  desktopWidth: 320,
  desktopHeight: 50,
  mobileWidth: 320,
  mobileHeight: 50,
} as const;

/**
 * Adsterra placement inventory across Solfain.
 * - Top of Homepage is kept completely clean.
 * - Each page mounts at most one 320x50 unit and one 300x250 unit so
 *   Adsterra's `atContainer-<key>` DOM IDs are always unique per route.
 */
export const ADSTERRA_SLOTS: Record<AdPlacement, AdsterraSlotConfig> = {
  'home-mid-banner': {
    placement: 'home-mid-banner',
    label: 'Home Mid-Catalogue Banner',
    unit: ADSTERRA_UNIT_320X50,
    dimensions: DIMS_320X50,
  },
  'home-footer-rectangle': {
    placement: 'home-footer-rectangle',
    label: 'Home Footer Rectangle',
    unit: ADSTERRA_UNIT_300X250,
    dimensions: DIMS_300X250,
  },
  'search-top-banner': {
    placement: 'search-top-banner',
    label: 'Browse Filter Banner',
    unit: ADSTERRA_UNIT_320X50,
    dimensions: DIMS_320X50,
  },
  'search-bottom-rectangle': {
    placement: 'search-bottom-rectangle',
    label: 'Browse Footer Rectangle',
    unit: ADSTERRA_UNIT_300X250,
    dimensions: DIMS_300X250,
  },
  'schedule-bottom-rectangle': {
    placement: 'schedule-bottom-rectangle',
    label: 'Schedule Footer Rectangle',
    unit: ADSTERRA_UNIT_300X250,
    dimensions: DIMS_300X250,
  },
  'details-inline': {
    placement: 'details-inline',
    label: 'Details Inline Banner',
    unit: ADSTERRA_UNIT_320X50,
    dimensions: DIMS_320X50,
  },
  'details-bottom-banner': {
    placement: 'details-bottom-banner',
    label: 'Details Footer Banner',
    unit: ADSTERRA_UNIT_320X50,
    dimensions: DIMS_320X50,
  },
  'sidebar-rectangle': {
    placement: 'sidebar-rectangle',
    label: 'Details Sidebar Rectangle',
    unit: ADSTERRA_UNIT_300X250,
    dimensions: DIMS_300X250,
  },
  'watch-below-player': {
    placement: 'watch-below-player',
    label: 'Watch Below-Player Banner',
    unit: ADSTERRA_UNIT_320X50,
    dimensions: DIMS_320X50,
  },
  'watch-sidebar-rectangle': {
    placement: 'watch-sidebar-rectangle',
    label: 'Watch Sidebar Rectangle',
    unit: ADSTERRA_UNIT_300X250,
    dimensions: DIMS_300X250,
  },
  'collection-footer-banner': {
    placement: 'collection-footer-banner',
    label: 'Collection Footer Banner',
    unit: ADSTERRA_UNIT_320X50,
    dimensions: DIMS_320X50,
  },
};

/**
 * Serializes Adsterra script invocations one at a time in the top-level DOM
 * so `window.atOptions` is read cleanly by `document.currentScript` without
 * collision when both 320x50 and 300x250 units exist on the same page, and
 * without wrapping in an extra iframe (preserving `window === window.top`).
 */
let mountQueue: Promise<void> = Promise.resolve();

function enqueueAdsterraScriptTask<T>(task: () => Promise<T>): Promise<T> {
  const next = mountQueue.then(task, task);
  mountQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

export function createAdsterraAdapter(
  slots: Record<AdPlacement, AdsterraSlotConfig> = ADSTERRA_SLOTS,
): AdNetworkAdapter {
  const hasAnyUnit = Object.values(slots).some((s) => Boolean(s.unit?.key));

  return {
    id: 'adsterra',
    name: 'Adsterra',
    isConfigured: hasAnyUnit,
    isPlacementConfigured(placement: AdPlacement): boolean {
      return Boolean(slots[placement]?.unit?.key);
    },
    getPlacementKey(placement: AdPlacement): string {
      return slots[placement]?.unit?.key ?? '';
    },
    async mountSlot(context: AdSlotRenderContext) {
      const slot = slots[context.placement];
      const unit = slot?.unit;
      if (!slot || !unit) {
        return { rendered: false, reason: 'No Adsterra unit configured for this slot.' };
      }

      // 0ms macrotask cancels cleanly on React 19 StrictMode's synchronous
      // initial mount/cleanup cycle without adding artificial delay.
      const survivedStrictMode = await new Promise<boolean>((resolve) => {
        if (context.signal.aborted) {
          resolve(false);
          return;
        }
        const timer = window.setTimeout(() => resolve(!context.signal.aborted), 0);
        context.signal.addEventListener(
          'abort',
          () => {
            window.clearTimeout(timer);
            resolve(false);
          },
          { once: true },
        );
      });

      if (!survivedStrictMode) {
        return { rendered: false, reason: 'Aborted' };
      }

      return enqueueAdsterraScriptTask(
        () =>
          new Promise((resolve) => {
            if (context.signal.aborted) {
              resolve({ rendered: false, reason: 'Aborted' });
              return;
            }

            let settled = false;
            const finish = (outcome: {
              rendered: boolean;
              blocked?: boolean;
              reason?: string;
            }) => {
              if (settled) return;
              settled = true;
              window.clearTimeout(safetyTimer);
              resolve(outcome);
            };

            context.container.innerHTML = '';

            const candidateUrls = [
              unit.invokeUrl,
              ...(unit.fallbackInvokeUrls ?? []),
            ]
              .map((u) => sanitizeHttpUrl(u, { httpsOnly: true }))
              .filter((u): u is string => Boolean(u));

            const tryLoadAtIndex = (index: number) => {
              if (context.signal.aborted) {
                finish({ rendered: false, reason: 'Aborted' });
                return;
              }

              const currentUrl = candidateUrls[index];
              if (!currentUrl) {
                finish({
                  rendered: false,
                  blocked: true,
                  reason: 'Adsterra script blocked by browser shield or VPN DNS filter.',
                });
                return;
              }

              context.container.innerHTML = '';

              // Set exact global atOptions right before appending this unit's invoke script
              window.atOptions = {
                key: unit.key,
                format: unit.format,
                height: unit.height,
                width: unit.width,
                params: { ...(unit.params ?? {}) },
              };

              const script = document.createElement('script');
              script.type = 'text/javascript';
              script.async = true;
              script.setAttribute('fetchpriority', 'high');
              script.src = currentUrl;
              script.setAttribute('data-adsterra-key', unit.key);

              script.onload = () => {
                finish({ rendered: true });
              };
              script.onerror = () => {
                if (index + 1 < candidateUrls.length) {
                  tryLoadAtIndex(index + 1);
                } else {
                  finish({
                    rendered: false,
                    blocked: true,
                    reason:
                      'Adsterra script blocked by browser shield or VPN DNS filter.',
                  });
                }
              };

              context.container.appendChild(script);
            };

            // Release queue promptly if script load neither fires onload nor onerror (e.g. jsdom)
            const safetyTimer = window.setTimeout(() => {
              finish({ rendered: true });
            }, 400);

            context.signal.addEventListener(
              'abort',
              () => {
                finish({ rendered: false, reason: 'Aborted' });
              },
              { once: true },
            );

            tryLoadAtIndex(0);
          }),
      );
    },
    unmountSlot(container: HTMLElement) {
      container.innerHTML = '';
    },
  };
}
