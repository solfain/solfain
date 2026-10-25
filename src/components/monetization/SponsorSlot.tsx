import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ADSTERRA_SLOTS } from '../../services/monetization/adsterraConfig';
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

  const slotMeta = ADSTERRA_SLOTS[placement];
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
  const [unitLoaded, setUnitLoaded] = useState(false);
  const [scriptBlocked, setScriptBlocked] = useState(false);

  useEffect(() => {
    setUnitLoaded(false);
    setScriptBlocked(false);

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
        if (controller.signal.aborted) {
          return;
        }
        if (outcome?.rendered) {
          setUnitLoaded(true);
        } else {
          setScriptBlocked(Boolean(outcome?.blocked ?? true));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setScriptBlocked(true);
        }
      });

    return () => {
      controller.abort();
      try {
        currentAdapter.unmountSlot?.(container);
      } catch {
        // Ignore cleanup errors from external ad frames
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

  const isCompactBanner = resolvedDims.desktopHeight <= 60;

  return (
    <aside
      className={`sponsor-unit-row${className ? ` ${className}` : ''}`}
      aria-label="Sponsored unit"
      data-slot-placement={placement}
      data-slot-mode={isLiveSlotConfigured ? 'live' : 'placeholder'}
    >
      {isLiveSlotConfigured ? (
        <div
          className={`sponsor-unit-live${
            isCompactBanner ? ' sponsor-unit-live--compact' : ''
          }`}
          style={styleVars}
        >
          <div className="sponsor-unit-live__caption">
            <span>Sponsored</span>
            <span>
              {resolvedDims.desktopWidth}×{resolvedDims.desktopHeight}
            </span>
          </div>

          <div
            className={`sponsor-unit-live__stage${
              shouldReserve ? '' : ' sponsor-unit--unreserved'
            }${unitLoaded ? ' sponsor-unit-live__stage--filled' : ''}`}
          >
            {/* Isolated Adsterra iframe mount container */}
            <div
              ref={surfaceRef}
              className="sponsor-unit-live__mount"
              style={{ opacity: scriptBlocked ? 0 : 1 }}
            />

            {!unitLoaded && (
              <div
                className={`sponsor-unit-live__fallback${
                  isCompactBanner ? ' sponsor-unit-live__fallback--compact' : ''
                }`}
              >
                {isCompactBanner ? (
                  <span className="sponsor-unit-live__copy">
                    {scriptBlocked
                      ? 'Sponsored banner paused by browser shield'
                      : 'Loading sponsor banner…'}
                  </span>
                ) : (
                  <>
                    <span className="sponsor-unit-live__badge">
                      Sponsored · {resolvedDims.desktopWidth}×{resolvedDims.desktopHeight}
                    </span>
                    <span className="sponsor-unit-live__copy">
                      {scriptBlocked
                        ? 'Adsterra banner blocked by browser shield on this tab.'
                        : 'Loading sponsor unit…'}
                    </span>
                  </>
                )}
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
            <span className="sponsor-unit-box__label">Sponsored</span>
            <span className="sponsor-unit-box__spec">
              {resolvedDims.desktopWidth}×{resolvedDims.desktopHeight}
            </span>
          </div>

          <div className="sponsor-unit-box__surface">
            <span className="sponsor-unit-box__copy">{slotMeta.label}</span>
          </div>
        </div>
      )}
    </aside>
  );
}
