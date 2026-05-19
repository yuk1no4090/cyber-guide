import { renderHook, act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTheme } from '@/app/hooks/useTheme';

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
  });

  it('applies stored dark theme to both root classes', async () => {
    localStorage.setItem('cyber-guide-theme', 'dark');

    renderHook(() => useTheme());

    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(document.documentElement.classList.contains('theme-dark')).toBe(true);
    });
  });

  it('toggles theme and persists the selection', async () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.toggleDarkMode();
    });

    await waitFor(() => {
      expect(localStorage.getItem('cyber-guide-theme')).toBe('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(document.documentElement.classList.contains('theme-dark')).toBe(true);
    });
  });
});
