import { Component, type ReactNode } from 'react';

// Last line of defence: a render error anywhere would otherwise leave a blank page with no way out.
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('Relay crashed:', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="welcome" role="alert">
        <div className="welcome-card">
          <h1>Something went wrong</h1>
          <p className="muted"><small>{this.state.error.message}</small></p>
          <button className="send-btn" onClick={() => location.reload()}>Reload Relay</button>
        </div>
      </div>
    );
  }
}
