'use client';

import React, { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#f0f7ff] dark:bg-slate-950 px-6 text-center">
          <div className="text-5xl mb-4">🛶</div>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">
            页面遇到了一点问题
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-300 mb-6 max-w-xs">
            小舟翻了一下，但没关系，刷新一下就好了。
          </p>
          <button
            onClick={this.handleReload}
            className="px-5 py-2.5 text-sm font-medium text-white bg-sky-500 dark:bg-sky-700 rounded-xl hover:bg-sky-600 dark:hover:bg-sky-600 transition-colors shadow-lg shadow-sky-500/20"
          >
            刷新页面
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
