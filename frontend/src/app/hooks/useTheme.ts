'use client';

import { useEffect, useState } from 'react';

const THEME_STORAGE_KEY = 'cyber-guide-theme';
const LIGHT_THEME_COLOR = '#f0f7ff';
const DARK_THEME_COLOR = '#020617';

export function useTheme() {
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'dark') {
        setDarkMode(true);
      } else if (saved === 'light') {
        setDarkMode(false);
      } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        setDarkMode(true);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('theme-dark', darkMode);
    root.classList.toggle('dark', darkMode);
    const themeColor = darkMode ? DARK_THEME_COLOR : LIGHT_THEME_COLOR;
    let themeMeta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (!themeMeta) {
      themeMeta = document.createElement('meta');
      themeMeta.name = 'theme-color';
      document.head.appendChild(themeMeta);
    }
    themeMeta.content = themeColor;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, darkMode ? 'dark' : 'light');
    } catch {
      // ignore
    }
  }, [darkMode]);

  return {
    darkMode,
    setDarkMode,
    toggleDarkMode: () => setDarkMode((v) => !v),
  };
}
