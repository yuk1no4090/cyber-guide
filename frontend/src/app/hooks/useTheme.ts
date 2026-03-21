'use client';

import { useEffect, useState } from 'react';

const THEME_STORAGE_KEY = 'cyber-guide-theme';

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
