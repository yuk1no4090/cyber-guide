'use client';

import React, { useEffect, useMemo, useState } from 'react';

const DESKTOP_SIDEBAR_KEY = 'cyber-guide-desktop-sidebar-collapsed';

type ViewportKind = 'mobile' | 'tablet' | 'desktop' | 'wide';

export interface AppShellRenderContext {
  viewport: ViewportKind;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isWide: boolean;
  desktopSidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
  toggleSidebar: () => void;
  closeMobileSidebar: () => void;
}

interface AppShellProps {
  mobileSidebarOpen: boolean;
  onMobileSidebarOpenChange: (open: boolean) => void;
  renderSidebar: (context: AppShellRenderContext) => React.ReactNode;
  renderHeader: (context: AppShellRenderContext) => React.ReactNode;
  renderContent: (context: AppShellRenderContext) => React.ReactNode;
  renderComposer: (context: AppShellRenderContext) => React.ReactNode;
}

function getViewportKind(width: number): ViewportKind {
  if (width < 640) return 'mobile';
  if (width < 1024) return 'tablet';
  if (width < 1440) return 'desktop';
  return 'wide';
}

export default function AppShell({
  mobileSidebarOpen,
  onMobileSidebarOpenChange,
  renderSidebar,
  renderHeader,
  renderContent,
  renderComposer,
}: AppShellProps) {
  const [viewport, setViewport] = useState<ViewportKind>(() => {
    if (typeof window === 'undefined') return 'desktop';
    return getViewportKind(window.innerWidth);
  });
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false);

  useEffect(() => {
    const syncViewport = () => setViewport(getViewportKind(window.innerWidth));
    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, []);

  useEffect(() => {
    try {
      setDesktopSidebarCollapsed(localStorage.getItem(DESKTOP_SIDEBAR_KEY) === '1');
    } catch {
      setDesktopSidebarCollapsed(false);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(DESKTOP_SIDEBAR_KEY, desktopSidebarCollapsed ? '1' : '0');
    } catch {
      // ignore storage failures
    }
  }, [desktopSidebarCollapsed]);

  const isMobile = viewport === 'mobile';
  const isTablet = viewport === 'tablet';
  const isDesktop = viewport === 'desktop' || viewport === 'wide';
  const isWide = viewport === 'wide';

  useEffect(() => {
    if (isDesktop && mobileSidebarOpen) {
      onMobileSidebarOpenChange(false);
    }
  }, [isDesktop, mobileSidebarOpen, onMobileSidebarOpenChange]);

  useEffect(() => {
    if (!mobileSidebarOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onMobileSidebarOpenChange(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileSidebarOpen, onMobileSidebarOpenChange]);

  const context = useMemo<AppShellRenderContext>(() => {
    const closeMobileSidebar = () => onMobileSidebarOpenChange(false);

    return {
      viewport,
      isMobile,
      isTablet,
      isDesktop,
      isWide,
      desktopSidebarCollapsed,
      mobileSidebarOpen,
      toggleSidebar: () => {
        if (isDesktop) {
          setDesktopSidebarCollapsed((prev) => !prev);
          return;
        }
        onMobileSidebarOpenChange(!mobileSidebarOpen);
      },
      closeMobileSidebar,
    };
  }, [
    desktopSidebarCollapsed,
    isDesktop,
    isMobile,
    isTablet,
    isWide,
    mobileSidebarOpen,
    onMobileSidebarOpenChange,
    viewport,
  ]);

  return (
    <div className="surface-app flex h-screen min-h-0 overflow-hidden text-slate-900 dark:text-slate-100">
      <div
        className={`relative z-40 shrink-0 ${
          isDesktop
            ? desktopSidebarCollapsed
              ? 'lg:w-[92px]'
              : 'lg:w-[260px] xl:w-[272px] 2xl:w-[280px]'
            : 'w-0'
        }`}
      >
        <aside
          className={`surface-panel fixed inset-y-0 left-0 flex h-full flex-col overflow-hidden border-r border-soft transition-transform duration-300 ease-out ${
            isDesktop
              ? `translate-x-0 ${
                  desktopSidebarCollapsed
                    ? 'lg:w-[92px]'
                    : 'lg:w-[260px] xl:w-[272px] 2xl:w-[280px]'
                }`
              : mobileSidebarOpen
                ? 'translate-x-0'
                : '-translate-x-full'
          } w-[min(86vw,320px)] sm:w-[320px] lg:static lg:max-w-none`}
          aria-hidden={!isDesktop && !mobileSidebarOpen}
        >
          {renderSidebar(context)}
        </aside>
      </div>

      {!isDesktop && mobileSidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-slate-950/45 backdrop-blur-[2px]"
          aria-label="关闭侧边栏"
          onClick={() => onMobileSidebarOpenChange(false)}
        />
      )}

      <div className="app-shell-main relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="safe-top shrink-0 px-2 pb-1 pt-2 sm:px-3 sm:pt-3 lg:px-4">
          {renderHeader(context)}
        </div>
        <div className="relative min-h-0 flex-1 overflow-hidden">{renderContent(context)}</div>
        <div className="app-shell-composer safe-bottom shrink-0 px-3 pb-3 pt-3 sm:px-4 sm:pb-4 lg:px-6">
          <div className="mx-auto w-full max-w-[880px]">{renderComposer(context)}</div>
        </div>
      </div>
    </div>
  );
}
