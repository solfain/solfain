import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    errorMessage: '',
  };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error.message || 'An unexpected rendering error occurred.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Solfain ErrorBoundary:', error, info.componentStack);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <main className="container main-content" style={{ paddingTop: '48px' }}>
          <div className="state-panel" role="alert">
            <h1 className="state-panel__title">Something went wrong</h1>
            <p className="state-panel__desc">{this.state.errorMessage}</p>
            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button
                type="button"
                className="btn btn--primary btn--compact"
                onClick={this.handleReset}
              >
                Try again
              </button>
              <a href="/" className="btn btn--secondary btn--compact">
                Return home
              </a>
            </div>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
