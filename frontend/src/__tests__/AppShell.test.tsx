import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AppShell from '@/app/components/AppShell';

describe('AppShell', () => {
  const originalWidth = window.innerWidth;

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
  });

  it('renders overlay and closes mobile sidebar on overlay click', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
    const onMobileSidebarOpenChange = vi.fn();

    render(
      <AppShell
        mobileSidebarOpen
        onMobileSidebarOpenChange={onMobileSidebarOpenChange}
        renderSidebar={() => <div>sidebar</div>}
        renderHeader={() => <div>header</div>}
        renderContent={() => <div>content</div>}
        renderComposer={() => <div>composer</div>}
      />,
    );

    fireEvent.click(screen.getByLabelText('关闭侧边栏'));
    expect(onMobileSidebarOpenChange).toHaveBeenCalledWith(false);
  });
});
