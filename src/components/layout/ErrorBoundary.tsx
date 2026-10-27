import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  resetKey?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'An unexpected application error occurred.',
    };
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, message: '' });
    }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('Solfain ErrorBoundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="container" style={{ paddingBlock: '64px' }}>
          <section className="state-panel" role="alert">
            <h1 className="state-panel__title">Something went wrong</h1>
            <p className="state-panel__desc">
              {this.state.message || 'The current view encountered an unexpected error.'}
            </p>
            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button
                type="button"
                className="btn btn--primary btn--compact"
                onClick={() => {
                  this.setState({ hasError: false, message: '' });
                  window.location.assign('/');
                }}
              >
                Return Home
              </button>
              <button
                type="button"
                className="btn btn--secondary btn--compact"
                onClick={() => window.location.reload()}
              >
                Reload Page
              </button>
            </div>
          </section>
        </div>
      );
    }

    return this.props.children;
  }
}
