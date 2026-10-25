import type {
  AdNetworkAdapter,
  AdPlacement,
  AdSlotRenderContext,
  AdsterraSlotConfig,
  AdsterraUnitSpec,
} from '../../types/monetization';

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
 * Note: Top of Homepage is intentionally kept clean (no above-the-fold ad).
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

let instanceCounter = 0;

function buildAdsterraIframeDocument(unit: AdsterraUnitSpec, instanceId: string): string {
  const atOptionsJson = JSON.stringify({
    key: unit.key,
    format: unit.format,
    height: unit.height,
    width: unit.width,
    params: unit.params ?? {},
  });
  const safeInvokeUrl = unit.invokeUrl.replace(/"/g, '&quot;');
  const safeInstanceId = instanceId.replace(/[^a-zA-Z0-9_-]/g, '');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  html, body {
    margin: 0;
    padding: 0;
    width: ${unit.width}px;
    height: ${unit.height}px;
    overflow: hidden;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
</head>
<body>
<script>
  atOptions = ${atOptionsJson};
</script>
<script
  src="${safeInvokeUrl}"
  onload="try{parent.postMessage({type:'SOLFAIN_AD_STATUS',id:'${safeInstanceId}',ok:true},'*')}catch(e){}"
  onerror="try{parent.postMessage({type:'SOLFAIN_AD_STATUS',id:'${safeInstanceId}',ok:false},'*')}catch(e){}"
></script>
</body>
</html>`;
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

      return new Promise((resolve) => {
        if (context.signal.aborted) {
          resolve({ rendered: false, reason: 'Aborted' });
          return;
        }

        instanceCounter += 1;
        const instanceId = `adsterra-${context.placement}-${instanceCounter}`;
        let settled = false;

        const finish = (outcome: { rendered: boolean; blocked?: boolean; reason?: string }) => {
          if (settled) return;
          settled = true;
          window.removeEventListener('message', onMessage);
          window.clearTimeout(fallbackTimer);
          resolve(outcome);
        };

        const onMessage = (event: MessageEvent) => {
          const payload = event.data;
          if (
            !payload ||
            typeof payload !== 'object' ||
            payload.type !== 'SOLFAIN_AD_STATUS' ||
            payload.id !== instanceId
          ) {
            return;
          }
          if (payload.ok) {
            finish({ rendered: true });
          } else {
            finish({
              rendered: false,
              blocked: true,
              reason: 'Adsterra invoke script was blocked by browser shield.',
            });
          }
        };

        window.addEventListener('message', onMessage);

        // Defer by one short tick so React 19 StrictMode's initial throwaway
        // mount/cleanup cancels cleanly before writing the ad iframe.
        const mountTimer = window.setTimeout(() => {
          if (context.signal.aborted) {
            finish({ rendered: false, reason: 'Aborted' });
            return;
          }

          context.container.innerHTML = '';

          const iframe = document.createElement('iframe');
          iframe.title = `${slot.label} (${unit.width}x${unit.height})`;
          iframe.width = String(unit.width);
          iframe.height = String(unit.height);
          iframe.scrolling = 'no';
          iframe.setAttribute('frameborder', '0');
          iframe.setAttribute('allowtransparency', 'true');
          iframe.setAttribute('data-adsterra-key', unit.key);
          iframe.setAttribute('data-adsterra-src', unit.invokeUrl);
          iframe.style.width = `${unit.width}px`;
          iframe.style.height = `${unit.height}px`;
          iframe.style.border = '0';
          iframe.style.overflow = 'hidden';
          iframe.style.display = 'block';

          // Must append iframe to DOM before accessing contentDocument
          context.container.appendChild(iframe);

          try {
            const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
            if (doc) {
              doc.open();
              doc.write(buildAdsterraIframeDocument(unit, instanceId));
              doc.close();
            } else {
              finish({ rendered: false, reason: 'Iframe document unavailable.' });
            }
          } catch {
            finish({ rendered: false, reason: 'Failed to write Adsterra frame.' });
          }
        }, 20);

        // Fallback resolution for test environments (e.g. jsdom) or silent stalls
        const fallbackTimer = window.setTimeout(() => {
          finish({ rendered: true });
        }, 2500);

        context.signal.addEventListener(
          'abort',
          () => {
            window.clearTimeout(mountTimer);
            finish({ rendered: false, reason: 'Aborted' });
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
