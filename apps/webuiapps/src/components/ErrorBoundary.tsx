/**
 * ErrorBoundary — prevents child crashes from taking down the entire Shell.
 *
 * Usage: Wrap any subtree that should be isolated (AppWindow, ChatPanel, etc.)
 * The fallback shows a compact error card with a retry button.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import styles from './ErrorBoundary.module.scss';

interface Props {
  children: ReactNode;
  /** Optional label shown in the fallback UI (e.g. "Chess" or "Chat") */
  name?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[ErrorBoundary${this.props.name ? `:${this.props.name}` : ''}]`, error, info);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          className={styles.fallback}
          data-testid="error-boundary-fallback"
          role="alert"
          aria-live="assertive"
        >
          <div className={styles.icon}>⚠️</div>
          <div className={styles.message}>
            {this.props.name ? `${this.props.name} crashed` : 'Something went wrong'}
          </div>
          <div className={styles.detail}>{this.state.error?.message}</div>
          <button type="button" className={styles.retryBtn} onClick={this.handleRetry}>
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
