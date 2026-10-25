import type { ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  action?: ReactNode;
}

export function ErrorState({
  title = 'Unable to load content',
  message,
  onRetry,
  action,
}: ErrorStateProps) {
  return (
    <div className="state-panel" role="alert">
      <AlertCircle size={22} color="var(--status-danger)" aria-hidden="true" />
      <h2 className="state-panel__title">{title}</h2>
      <p className="state-panel__desc">{message}</p>
      <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
        {onRetry && (
          <button type="button" className="btn btn--secondary btn--compact" onClick={onRetry}>
            <RefreshCw size={14} aria-hidden="true" />
            <span>Retry</span>
          </button>
        )}
        {action}
      </div>
    </div>
  );
}

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="state-panel">
      {icon}
      <h2 className="state-panel__title">{title}</h2>
      <p className="state-panel__desc">{description}</p>
      {action && <div style={{ marginTop: '6px' }}>{action}</div>}
    </div>
  );
}
