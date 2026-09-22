import {
  DEFAULT_UI_PREFERENCES,
  UI_STORAGE_KEY_V1,
  type UiDensityMode,
  type UiPreferencesState,
  type UiThemeMode,
} from '@voice-agent/ui';

export function validateTheme(val: unknown): UiThemeMode {
  return val === 'dark' ? 'dark' : 'light';
}

export function validateDensity(val: unknown): UiDensityMode {
  if (val === 'compact' || val === 'comfortable') {
    return val;
  }
  return 'default';
}

export function parseUiPreferences(raw: string | null): UiPreferencesState {
  if (!raw) return DEFAULT_UI_PREFERENCES;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') {
      return DEFAULT_UI_PREFERENCES;
    }
    return {
      theme: validateTheme(parsed['theme']),
      density: validateDensity(parsed['density']),
      sidebarCollapsed: Boolean(parsed['sidebarCollapsed']),
    };
  } catch {
    return DEFAULT_UI_PREFERENCES;
  }
}

export function serializeUiPreferences(prefs: UiPreferencesState): string {
  return JSON.stringify(prefs);
}

export function readStoredUiPreferences(storage?: Pick<Storage, 'getItem'>): UiPreferencesState {
  if (!storage) return DEFAULT_UI_PREFERENCES;
  try {
    const raw = storage.getItem(UI_STORAGE_KEY_V1);
    return parseUiPreferences(raw);
  } catch {
    return DEFAULT_UI_PREFERENCES;
  }
}

export function writeStoredUiPreferences(
  prefs: UiPreferencesState,
  storage?: Pick<Storage, 'setItem'>,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(UI_STORAGE_KEY_V1, serializeUiPreferences(prefs));
    return true;
  } catch {
    return false;
  }
}
