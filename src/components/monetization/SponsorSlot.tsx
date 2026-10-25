import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { PERCH_ADS_SLOTS } from '../../services/monetization/perchConfig';
import {
  DEFAULT_AD_DIMENSIONS,
  getAdNetworkAdapter,
  getAdSystemSettings,
} from '../../services/monetization/slotRegistry';
import type { AdDimensions, AdPlacement } from '../../types/monetization';

export interface AdSlotProps {
  placement: AdPlacement;
  dimensions?: Partial<AdDimensions>;
  enabled?: boolean;
  reserveSpace?: boolean;
  className?: string;
}

function hasInjectedWidgetNode(container: HTMLElement): boolean {
  for (let i = 0; i < container.children.length; i += 1) {
    const child = container.children[i];
    if (child.tagName.toUpperCase() !== 'SCRIPT') {
      return true;
    }
  }
  return false;
}

export function AdSlot({
  placement,
  dimensions,
  enabled,
  reserveSpace,
  className,
}: AdSlotProps) {
  const settings = getAdSystemSettings();
  const slotEnabled =
    enabled ?? (settings.enabled && (settings.placements[placement] ?? true));
  const shouldReserve = reserveSpace ?? settings.reserveSpace;

  const perchMeta = PERCH_ADS_SLOTS[placement];
  const baseDims = DEFAULT_AD_DIMENSIONS[placement];
  const resolvedDims: AdDimensions = {
    desktopWidth: dimensions?.desktopWidth ?? baseDims.desktopWidth,
    desktopHeight: dimensions?.desktopHeight ?? baseDims.desktopHeight,
    mobileWidth: dimensions?.mobileWidth ?? baseDims.mobileWidth,
    mobileHeight: dimensions?.mobileHeight ?? baseDims.mobileHeight,
  };

  const adapter = getAdNetworkAdapter();
  const isLiveSlotConfigured = adapter.isPlacementConfigured
    ? adapter.isPlacementConfigured(placement)
    : adapter.isConfigured;
  const activeSpaceId = adapter.getPlacementSpaceId?.(placement) ?? '';

  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [widgetInjected, setWidgetInjected] = useState(false);
  const [scriptBlocked, setScriptBlocked] = useState(false);

  useEffect(() => {
    setWidgetInjected(false);
    setScriptBlocked(false);

    if (!slotEnabled || !isLiveSlotConfigured) {
      return;
    }

    const container = surfaceRef.current;
    if (!container) {
      return;
    }

    const observer = new MutationObserver(() => {
      if (hasInjectedWidgetNode(container)) {
        setWidgetInjected(true);
      }
    });
    observer.observe(container, { childList: true, subtree: false });

    const currentAdapter = getAdNetworkAdapter();
    const controller = new AbortController();

    currentAdapter
      .mountSlot({
        placement,
        container,
        dimensions: resolvedDims,
        signal: controller.signal,
      })
      .then((outcome) => {
        if (controller.signal.aborted) {
          return;
        }
        if (!outcome?.rendered) {
          setScriptBlocked(Boolean(outcome?.blocked ?? true));
          return;
        }
        if (hasInjectedWidgetNode(container)) {
          setWidgetInjected(true);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setScriptBlocked(true);
        }
      });

    return () => {
      observer.disconnect();
      controller.abort();
      try {
        currentAdapter.unmountSlot?.(container);
      } catch {
        // Ignore cleanup errors from external scripts
      }
    };
  }, [
    placement,
    slotEnabled,
    isLiveSlotConfigured,
    resolvedDims.desktopWidth,
    resolvedDims.desktopHeight,
    resolvedDims.mobileWidth,
    resolvedDims.mobileHeight,
  ]);

  if (!slotEnabled) {
    return null;
  }

  const styleVars = {
    '--slot-desktop-w': `${resolvedDims.desktopWidth}px`,
    '--slot-desktop-h': `${resolvedDims.desktopHeight}px`,
    '--slot-mobile-w': `${resolvedDims.mobileWidth}px`,
    '--slot-mobile-h': `${resolvedDims.mobileHeight}px`,
  } as CSSProperties;

  const sameMobileDesktopSize =
    resolvedDims.desktopWidth === resolvedDims.mobileWidth &&
    resolvedDims.desktopHeight === resolvedDims.mobileHeight;

  return (
    <aside
      className={`sponsor-unit-row${className ? ` ${className}` : ''}`}
      aria-label="Sponsored unit"
      data-slot-placement={placement}
      data-slot-mode={isLiveSlotConfigured ? 'live' : 'placeholder'}
    >
      {isLiveSlotConfigured ? (
        <div className="sponsor-unit-live" style={styleVars}>
          <div className="sponsor-unit-live__caption">
            <span>Sponsored · Perch Ads</span>
            <span>
              {resolvedDims.desktopWidth}×{resolvedDims.desktopHeight}
            </span>
          </div>

          <div
            className={`sponsor-unit-live__stage${
              shouldReserve ? '' : ' sponsor-unit--unreserved'
            }${widgetInjected ? ' sponsor-unit-live__stage--filled' : ''}`}
          >
            {/* Isolated mount container owned purely by Perch Ads embed.js */}
            <div ref={surfaceRef} className="sponsor-unit-live__mount" />

            {/* Visible fallback shown while embed.js loads or if blocked by browser shield */}
            {!widgetInjected && (
              <div className="sponsor-unit-live__fallback">
                <span className="sponsor-unit-live__badge">Perch Ads · {activeSpaceId}</span>
                <span className="sponsor-unit-live__copy">
                  {scriptBlocked
                    ? 'Live Perch Ads script blocked by browser shield/ad-blocker on this tab.'
                    : `Loading Perch Ads ${resolvedDims.desktopWidth}×${resolvedDims.desktopHeight} space…`}
                </span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div
          className={`sponsor-unit-box${shouldReserve ? '' : ' sponsor-unit--unreserved'}`}
          style={styleVars}
        >
          <div ref={surfaceRef} style={{ display: 'none' }} />
          <div className="sponsor-unit-box__header">
            <span className="sponsor-unit-box__label">Sponsored · Perch Ads</span>
            {sameMobileDesktopSize ? (
              <span className="sponsor-unit-box__spec">
                {resolvedDims.desktopWidth}×{resolvedDims.desktopHeight}
              </span>
            ) : (
              <>
                <span className="sponsor-unit-box__spec sponsor-unit-box__spec--desktop">
                  {resolvedDims.desktopWidth}×{resolvedDims.desktopHeight}
                </span>
                <span className="sponsor-unit-box__spec sponsor-unit-box__spec--mobile">
                  {resolvedDims.mobileWidth}×{resolvedDims.mobileHeight}
                </span>
              </>
            )}
          </div>

          <div className="sponsor-unit-box__surface">
            <span className="sponsor-unit-box__copy">
              Perch Ads placeholder — {perchMeta.label} ({perchMeta.perchFormat})
            </span>
          </div>
        </div>
      )}
    </aside>
  );
}
