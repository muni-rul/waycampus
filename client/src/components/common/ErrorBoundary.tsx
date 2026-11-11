import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleReload = () => {
    if (this.props.onReset) {
      this.props.onReset();
      this.setState({ hasError: false, error: null, errorInfo: null });
    } else {
      window.location.reload();
    }
  };

  private handleGoHome = () => {
    window.location.href = window.location.pathname;
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-950 text-slate-100 p-4 select-none">
          <div className="bg-slate-900/95 border border-red-500/40 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl backdrop-blur-2xl flex flex-col items-center text-center gap-4 animate-scale-up">
            <div className="w-16 h-16 rounded-2xl bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-400 shadow-lg shadow-red-500/20">
              <AlertTriangle size={32} />
            </div>

            <div>
              <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">
                {this.props.fallbackTitle || 'CampusNav Encountered an Issue'}
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 font-medium">
                The application recovered safely. You can reload or return to the main campus view.
              </p>
            </div>

            {this.state.error && (
              <div className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-3 text-left max-h-32 overflow-y-auto">
                <p className="text-xs font-mono text-red-300 font-bold truncate">
                  {this.state.error.name}: {this.state.error.message}
                </p>
              </div>
            )}

            <div className="flex items-center gap-3 w-full pt-2">
              <button
                onClick={this.handleReload}
                className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white text-xs font-black shadow-lg shadow-sky-500/25 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
              >
                <RefreshCw size={14} />
                <span>Reload</span>
              </button>

              <button
                onClick={this.handleGoHome}
                className="flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-white/10 flex items-center justify-center gap-2 transition-all"
              >
                <Home size={14} />
                <span>Campus Home</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
