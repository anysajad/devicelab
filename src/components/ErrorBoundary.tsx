import { Component, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

/**
 * Catches render-time errors from the preview workspace and shows a contained
 * recovery card instead of unmounting the whole app. Deliberately scoped (no
 * global window listeners): PreviewWorkspace is the only large surface that
 * can throw during rendering.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  handleReset = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex flex-1 items-center justify-center p-8" role="alert">
        <div className="w-full max-w-md rounded-xl border border-red-200 bg-white p-6 text-center shadow-sm dark:border-red-900 dark:bg-gray-900">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            The preview area hit an unexpected error
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {this.state.message || 'Something went wrong while rendering.'}
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="mt-4 rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}
