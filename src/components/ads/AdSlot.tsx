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

  const adapter = getAdNetworkAdapter();
  const isLiveSlotConfigured = adapter.isPlacementConfigured
    ? adapter.isPlacementConfigured(placement)
    : adapter.isConfigured;

  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [mountFailed, setMountFailed] = useState(false);

  useEffect(() => {
    setMountFailed(false);

    if (!slotEnabled || !isLiveSlotConfigured) {
      return;
    }

    const container = surfaceRef.current;
    if (!container) {
      return;
    }

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
        if (!controller.signal.aborted && !outcome?.rendered) {
          setMountFailed(true);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setMountFailed(true);
        }
      });

    return () => {
      controller.abort();
      try {
        currentAdapter.unmountSlot?.(container);
      } catch {
        // Ignore cleanup errors from external ad scripts
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
    '--ad-desktop-w': `${resolvedDims.desktopWidth}px`,
    '--ad-desktop-h': `${resolvedDims.desktopHeight}px`,
    '--ad-mobile-w': `${resolvedDims.mobileWidth}px`,
    '--ad-mobile-h': `${resolvedDims.mobileHeight}px`,
  } as CSSProperties;

  const showLiveEmbed = isLiveSlotConfigured && !mountFailed;

  const sameMobileDesktopSize =
    resolvedDims.desktopWidth === resolvedDims.mobileWidth &&
    resolvedDims.desktopHeight === resolvedDims.mobileHeight;

  return (
    <aside
      className={`ad-slot-wrapper${className ? ` ${className}` : ''}`}
      aria-label="Advertisement"
      data-ad-placement={placement}
      data-ad-network="perchads"
      data-ad-mode={showLiveEmbed ? 'live' : 'placeholder'}
    >
      {showLiveEmbed ? (
        <div className="ad-slot-live-frame" style={styleVars}>
          <div className="ad-slot__live-caption">Advertisement</div>
          <div
            ref={surfaceRef}
            className={`ad-slot__mount${shouldReserve ? '' : ' ad-slot--unreserved'}`}
          />
        </div>
      ) : (
        <div
          className={`ad-slot${shouldReserve ? '' : ' ad-slot--unreserved'}`}
          style={styleVars}
        >
          <div ref={surfaceRef} style={{ display: 'none' }} />
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

          <div className="ad-slot__surface">
            <span className="ad-slot__placeholder-copy">
              Perch Ads placeholder — {perchMeta.label} ({perchMeta.perchFormat})
            </span>
          </div>
        </div>
      )}
    </aside>
  );
}
