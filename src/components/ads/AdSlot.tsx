import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  DEFAULT_AD_DIMENSIONS,
  getAdNetworkAdapter,
  getAdSystemSettings,
} from '../../services/ads/adRegistry';
import { PERCH_ADS_SLOTS } from '../../services/ads/perchAdsConfig';
import type { AdDimensions, AdPlacement } from '../../types/ads';

export interface AdSlotProps {
  placement: AdPlacement;
  dimensions?: Partial<AdDimensions>;
  enabled?: boolean;
  reserveSpace?: boolean;
  className?: string;
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

  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [renderedExternal, setRenderedExternal] = useState(false);

  useEffect(() => {
    if (!slotEnabled) {
      setRenderedExternal(false);
      return;
    }

    const adapter = getAdNetworkAdapter();
    const container = surfaceRef.current;
    const slotReady = adapter.isPlacementConfigured
      ? adapter.isPlacementConfigured(placement)
      : adapter.isConfigured;

    if (!container || !slotReady) {
      setRenderedExternal(false);
      return;
    }

    const controller = new AbortController();
    adapter
      .mountSlot({
        placement,
        container,
        dimensions: resolvedDims,
        signal: controller.signal,
      })
      .then((outcome) => {
        if (!controller.signal.aborted) {
          setRenderedExternal(Boolean(outcome?.rendered));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setRenderedExternal(false);
        }
      });

    return () => {
      controller.abort();
      try {
        adapter.unmountSlot?.(container);
      } catch {
        // Ignore cleanup errors from external ad scripts
      }
    };
  }, [
    placement,
    slotEnabled,
    resolvedDims.desktopWidth,
    resolvedDims.desktopHeight,
    resolvedDims.mobileWidth,
    resolvedDims.mobileHeight,
  ]);

  if (!slotEnabled) {
    return null;
  }

  const styleVars = {
    '--ad-desktop-w': `${resolvedDims.desktopWidth}px`,
    '--ad-desktop-h': `${resolvedDims.desktopHeight}px`,
    '--ad-mobile-w': `${resolvedDims.mobileWidth}px`,
    '--ad-mobile-h': `${resolvedDims.mobileHeight}px`,
  } as CSSProperties;

  const sameMobileDesktopSize =
    resolvedDims.desktopWidth === resolvedDims.mobileWidth &&
    resolvedDims.desktopHeight === resolvedDims.mobileHeight;

  return (
    <aside
      className={`ad-slot-wrapper${className ? ` ${className}` : ''}`}
      aria-label="Advertisement"
      data-ad-placement={placement}
      data-ad-network="perchads"
    >
      <div
        className={`ad-slot${shouldReserve ? '' : ' ad-slot--unreserved'}`}
        style={styleVars}
      >
        <div className="ad-slot__header">
          <span className="ad-slot__label">Advertisement · Perch Ads</span>
          {sameMobileDesktopSize ? (
            <span className="ad-slot__spec">
              {resolvedDims.desktopWidth}×{resolvedDims.desktopHeight}
            </span>
          ) : (
            <>
              <span className="ad-slot__spec ad-slot__spec--desktop">
                {resolvedDims.desktopWidth}×{resolvedDims.desktopHeight}
              </span>
              <span className="ad-slot__spec ad-slot__spec--mobile">
                {resolvedDims.mobileWidth}×{resolvedDims.mobileHeight}
              </span>
            </>
          )}
        </div>

        <div ref={surfaceRef} className="ad-slot__surface">
          {!renderedExternal && (
            <span className="ad-slot__placeholder-copy">
              Perch Ads placeholder — {perchMeta.label} ({perchMeta.perchFormat})
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}
