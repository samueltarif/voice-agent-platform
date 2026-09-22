'use client';

import * as React from 'react';
import {
  DEFAULT_UI_PREFERENCES,
  type UiDensityMode,
  type UiPreferencesState,
  type UiThemeMode,
} from '@voice-agent/ui';
import { readStoredUiPreferences, writeStoredUiPreferences } from './ui-preferences-storage';

interface UiPreferencesContextType extends UiPreferencesState {
  setTheme: (theme: UiThemeMode) => void;
  setDensity: (density: UiDensityMode) => void;
  toggleSidebar: () => void;
}

const UiPreferencesContext = React.createContext<UiPreferencesContextType | null>(null);

function applyDomPreferences(theme: UiThemeMode, density: UiDensityMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  root.setAttribute('data-density', density);
}

export function UiPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<UiPreferencesState>(DEFAULT_UI_PREFERENCES);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    const initial = readStoredUiPreferences(window.localStorage);
    setState(initial);
    applyDomPreferences(initial.theme, initial.density);
    setMounted(true);
  }, []);

  const setTheme = React.useCallback((theme: UiThemeMode) => {
    setState((prev) => {
      const next = { ...prev, theme };
      applyDomPreferences(next.theme, next.density);
      if (typeof window !== 'undefined') writeStoredUiPreferences(next, window.localStorage);
      return next;
    });
  }, []);

  const setDensity = React.useCallback((density: UiDensityMode) => {
    setState((prev) => {
      const next = { ...prev, density };
      applyDomPreferences(next.theme, next.density);
      if (typeof window !== 'undefined') writeStoredUiPreferences(next, window.localStorage);
      return next;
    });
  }, []);

  const toggleSidebar = React.useCallback(() => {
    setState((prev) => {
      const next = { ...prev, sidebarCollapsed: !prev.sidebarCollapsed };
      if (typeof window !== 'undefined') writeStoredUiPreferences(next, window.localStorage);
      return next;
    });
  }, []);

  const value = React.useMemo(
    () => ({
      ...state,
      setTheme,
      setDensity,
      toggleSidebar,
    }),
    [state, setTheme, setDensity, toggleSidebar],
  );

  return (
    <UiPreferencesContext.Provider value={value}>
      <div data-density={mounted ? state.density : 'default'}>{children}</div>
    </UiPreferencesContext.Provider>
  );
}

export function useUiPreferences(): UiPreferencesContextType {
  const ctx = React.useContext(UiPreferencesContext);
  if (!ctx) {
    throw new Error('useUiPreferences deve ser utilizado dentro de UiPreferencesProvider');
  }
  return ctx;
}
