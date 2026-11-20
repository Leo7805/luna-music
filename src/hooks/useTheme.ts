import { useState, useEffect, useCallback } from 'react';

export type Theme = 'light' | 'dark';
export type LightStyle = 'neutral' | 'warm' | 'mist';

export const THEME_STORAGE_KEY = 'luna_music_theme';
export const LIGHT_STYLE_STORAGE_KEY = 'luna_music_light_style';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem(THEME_STORAGE_KEY);
        if (saved === 'light' || saved === 'dark') {
          return saved;
        }
      }
    } catch {
      // Ignore localStorage failure
    }

    if (
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: light)').matches
    ) {
      return 'light';
    }

    return 'dark';
  });

  const [lightStyle, setLightStyle] = useState<LightStyle>(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem(LIGHT_STYLE_STORAGE_KEY);
        if (saved === 'neutral' || saved === 'warm' || saved === 'mist') {
          return saved;
        }
      }
    } catch {
      // Ignore localStorage failure
    }
    return 'warm';
  });

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
      root.removeAttribute('data-light-style');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
      root.setAttribute('data-light-style', lightStyle);
    }

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
        localStorage.setItem(LIGHT_STYLE_STORAGE_KEY, lightStyle);
      }
    } catch {
      // Ignore
    }
  }, [theme, lightStyle]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  return {
    theme,
    isDark: theme === 'dark',
    toggleTheme,
    setTheme,
    lightStyle,
    setLightStyle,
  };
}
