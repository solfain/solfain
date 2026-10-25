import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui/StateFeedback';

export function NotFoundPage() {
  useEffect(() => {
    document.title = 'Page Not Found — Solfain';
  }, []);

  return (
    <div className="container" style={{ paddingTop: '48px' }}>
      <EmptyState
        title="Page not found"
        description="The page you requested does not exist or may have moved."
        action={
          <div style={{ display: 'flex', gap: '10px' }}>
            <Link to="/" className="btn btn--primary btn--compact">
              Go Home
            </Link>
            <Link to="/search" className="btn btn--secondary btn--compact">
              Browse Anime
            </Link>
          </div>
        }
      />
    </div>
  );
}
