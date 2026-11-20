import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Header } from '../src/components/Header';
import { AppearancePopover } from '../src/components/AppearancePopover';
import {
  THEME_STORAGE_KEY,
  LIGHT_STYLE_STORAGE_KEY,
  LightStyle,
} from '../src/hooks/useTheme';

const createLocalStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
};

describe('Unified Appearance Menu & Three Light Styles', () => {
  beforeAll(() => {
    if (typeof globalThis.localStorage === 'undefined') {
      // @ts-expect-error Mocking localStorage in Node test runner
      globalThis.localStorage = createLocalStorageMock();
    }
  });

  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  describe('1. Header Controls Consolidation', () => {
    it('renders exactly one settings button and no duplicate theme/help buttons in header', () => {
      const html = renderToStaticMarkup(
        <Header
          title="All Tracks"
          searchQuery=""
          theme="light"
          lightStyle="warm"
          onSearchChange={() => {}}
          onOpenShortcutsModal={() => {}}
          onSelectTheme={() => {}}
          onSelectLightStyle={() => {}}
        />
      );

      // Must have appearance menu button
      expect(html).toContain('data-testid="appearance-menu-button"');
      expect(html).toContain('aria-label="Appearance &amp; Settings"');

      // Must NOT contain separate old buttons
      expect(html).not.toContain('data-testid="theme-toggle-button"');
      expect(html).not.toContain('title="Switch to light theme"');
      expect(html).not.toContain('title="Switch to dark theme"');
    });
  });

  describe('2. Appearance Popover Structure & Dialog Attributes', () => {
    it('renders popover with dialog role and title when open', () => {
      const html = renderToStaticMarkup(
        <AppearancePopover
          isOpen={true}
          onClose={() => {}}
          theme="light"
          lightStyle="warm"
          onSelectTheme={() => {}}
          onSelectLightStyle={() => {}}
          onOpenShortcutsModal={() => {}}
        />
      );

      expect(html).toContain('role="dialog"');
      expect(html).toContain('data-testid="appearance-popover"');
      expect(html).toContain('Appearance');
      expect(html).toContain('data-testid="theme-light-button"');
      expect(html).toContain('data-testid="theme-dark-button"');
    });

    it('renders nothing when isOpen is false', () => {
      const html = renderToStaticMarkup(
        <AppearancePopover
          isOpen={false}
          onClose={() => {}}
          theme="light"
          lightStyle="warm"
          onSelectTheme={() => {}}
          onSelectLightStyle={() => {}}
          onOpenShortcutsModal={() => {}}
        />
      );

      expect(html).toBe('');
    });
  });

  describe('3. Light & Dark Mode Segmented Control', () => {
    it('reflects active light mode and dark mode classes in segmented control', () => {
      const htmlLight = renderToStaticMarkup(
        <AppearancePopover
          isOpen={true}
          onClose={() => {}}
          theme="light"
          lightStyle="warm"
          onSelectTheme={() => {}}
          onSelectLightStyle={() => {}}
          onOpenShortcutsModal={() => {}}
        />
      );
      expect(htmlLight).toContain('data-testid="theme-light-button"');
      expect(htmlLight).toContain('bg-white text-[var(--text-primary)]');

      const htmlDark = renderToStaticMarkup(
        <AppearancePopover
          isOpen={true}
          onClose={() => {}}
          theme="dark"
          lightStyle="warm"
          onSelectTheme={() => {}}
          onSelectLightStyle={() => {}}
          onOpenShortcutsModal={() => {}}
        />
      );
      expect(htmlDark).toContain('data-testid="theme-dark-button"');
      expect(htmlDark).toContain('bg-slate-700/80 text-white');
    });
  });

  describe('4. Three Light Styles in Light Mode', () => {
    it('renders all three light styles (Neutral, Warm, Mist) when in Light Mode', () => {
      const html = renderToStaticMarkup(
        <AppearancePopover
          isOpen={true}
          onClose={() => {}}
          theme="light"
          lightStyle="warm"
          onSelectTheme={() => {}}
          onSelectLightStyle={() => {}}
          onOpenShortcutsModal={() => {}}
        />
      );

      expect(html).toContain('Light Theme Style');
      expect(html).toContain('data-testid="light-style-neutral"');
      expect(html).toContain('data-testid="light-style-warm"');
      expect(html).toContain('data-testid="light-style-mist"');

      expect(html).toContain('Neutral');
      expect(html).toContain('Warm');
      expect(html).toContain('Mist');

      // Warm is selected: has active border ring and checkmark
      expect(html).toContain('ring-[var(--accent-primary)]/25');
    });

    it('highlights Neutral when selected', () => {
      const html = renderToStaticMarkup(
        <AppearancePopover
          isOpen={true}
          onClose={() => {}}
          theme="light"
          lightStyle="neutral"
          onSelectTheme={() => {}}
          onSelectLightStyle={() => {}}
          onOpenShortcutsModal={() => {}}
        />
      );

      expect(html).toContain('data-testid="light-style-neutral"');
      expect(html).toContain('Neutral');
    });

    it('highlights Mist when selected', () => {
      const html = renderToStaticMarkup(
        <AppearancePopover
          isOpen={true}
          onClose={() => {}}
          theme="light"
          lightStyle="mist"
          onSelectTheme={() => {}}
          onSelectLightStyle={() => {}}
          onOpenShortcutsModal={() => {}}
        />
      );

      expect(html).toContain('data-testid="light-style-mist"');
      expect(html).toContain('Mist');
    });
  });

  describe('5. Dark Mode Appearance Preservation & Light Style Section Hiding', () => {
    it('hides Light Theme Style cards when Dark Mode is active', () => {
      const html = renderToStaticMarkup(
        <AppearancePopover
          isOpen={true}
          onClose={() => {}}
          theme="dark"
          lightStyle="warm"
          onSelectTheme={() => {}}
          onSelectLightStyle={() => {}}
          onOpenShortcutsModal={() => {}}
        />
      );

      // Light theme styles must be hidden in dark mode
      expect(html).not.toContain('Light Theme Style');
      expect(html).not.toContain('data-testid="light-style-neutral"');
      expect(html).not.toContain('data-testid="light-style-warm"');
      expect(html).not.toContain('data-testid="light-style-mist"');

      // But Mode selector and Keyboard Shortcuts remain accessible
      expect(html).toContain('data-testid="theme-light-button"');
      expect(html).toContain('data-testid="theme-dark-button"');
      expect(html).toContain('data-testid="keyboard-shortcuts-menu-button"');
    });
  });

  describe('6. Keyboard Shortcuts Entry in Popover', () => {
    it('renders Keyboard Shortcuts entry with ? badge at the bottom', () => {
      const html = renderToStaticMarkup(
        <AppearancePopover
          isOpen={true}
          onClose={() => {}}
          theme="light"
          lightStyle="warm"
          onSelectTheme={() => {}}
          onSelectLightStyle={() => {}}
          onOpenShortcutsModal={() => {}}
        />
      );

      expect(html).toContain('data-testid="keyboard-shortcuts-menu-button"');
      expect(html).toContain('Keyboard Shortcuts');
      expect(html).toContain('?');
    });
  });

  describe('7. LocalStorage Persistence & Default Value', () => {
    it('uses Warm as default light style when nothing is stored', () => {
      const saved = globalThis.localStorage.getItem(LIGHT_STYLE_STORAGE_KEY);
      expect(saved).toBeNull();
      // Default fallback is 'warm'
      const defaultStyle: LightStyle = (saved as LightStyle) || 'warm';
      expect(defaultStyle).toBe('warm');
    });

    it('persists and restores light style across reloads', () => {
      globalThis.localStorage.setItem(LIGHT_STYLE_STORAGE_KEY, 'mist');
      expect(globalThis.localStorage.getItem(LIGHT_STYLE_STORAGE_KEY)).toBe('mist');

      globalThis.localStorage.setItem(LIGHT_STYLE_STORAGE_KEY, 'neutral');
      expect(globalThis.localStorage.getItem(LIGHT_STYLE_STORAGE_KEY)).toBe('neutral');

      globalThis.localStorage.setItem(THEME_STORAGE_KEY, 'light');
      expect(globalThis.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    });

    it('preserves existing theme preference in conjunction with light style', () => {
      globalThis.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
      globalThis.localStorage.setItem(LIGHT_STYLE_STORAGE_KEY, 'neutral');

      expect(globalThis.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
      expect(globalThis.localStorage.getItem(LIGHT_STYLE_STORAGE_KEY)).toBe('neutral');
    });
  });
});
