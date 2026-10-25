export function AnimeGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="anime-grid" aria-busy="true" aria-label="Loading anime catalogue">
      {Array.from({ length: count }, (_, idx) => (
        <div key={idx} className="anime-card">
          <div className="skeleton-block" style={{ aspectRatio: '2 / 3', width: '100%' }} />
          <div className="skeleton-block" style={{ height: '14px', width: '82%' }} />
          <div className="skeleton-block" style={{ height: '12px', width: '52%' }} />
        </div>
      ))}
    </div>
  );
}

export function HomeSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading homepage">
      <div
        style={{
          minHeight: '420px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'flex-end',
          paddingBottom: '32px',
        }}
      >
        <div className="container" style={{ width: '100%' }}>
          <div style={{ maxWidth: '520px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="skeleton-block" style={{ height: '14px', width: '180px' }} />
            <div className="skeleton-block" style={{ height: '38px', width: '88%' }} />
            <div className="skeleton-block" style={{ height: '56px', width: '100%' }} />
            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
              <div className="skeleton-block" style={{ height: '40px', width: '132px' }} />
              <div className="skeleton-block" style={{ height: '40px', width: '104px' }} />
            </div>
          </div>
        </div>
      </div>

      <div className="container catalogue-stack">
        {[1, 2, 3].map((row) => (
          <div key={row} className="catalogue-section">
            <div className="skeleton-block" style={{ height: '22px', width: '190px' }} />
            <AnimeGridSkeleton count={6} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DetailsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading anime details">
      <div className="details-banner">
        <div className="skeleton-block" style={{ width: '100%', height: '100%', borderRadius: 0 }} />
      </div>
      <div className="container">
        <div className="details-header">
          <div className="details-poster skeleton-block" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="skeleton-block" style={{ height: '34px', width: '60%' }} />
            <div className="skeleton-block" style={{ height: '16px', width: '38%' }} />
            <div className="skeleton-block" style={{ height: '18px', width: '75%' }} />
            <div style={{ display: 'flex', gap: '10px' }}>
              <div className="skeleton-block" style={{ height: '40px', width: '138px' }} />
              <div className="skeleton-block" style={{ height: '40px', width: '112px' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function WatchSkeleton() {
  return (
    <div className="container watch-page" aria-busy="true" aria-label="Loading watch view">
      <div className="skeleton-block" style={{ height: '18px', width: '220px', marginBottom: '14px' }} />
      <div className="watch-layout">
        <div className="watch-stage">
          <div className="player-frame skeleton-block" />
          <div className="skeleton-block" style={{ height: '58px', width: '100%' }} />
        </div>
        <div className="skeleton-block" style={{ height: '420px', width: '100%' }} />
      </div>
    </div>
  );
}
