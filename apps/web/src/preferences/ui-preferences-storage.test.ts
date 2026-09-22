import { describe, expect, it } from 'vitest';
import {
  parseUiPreferences,
  readStoredUiPreferences,
  serializeUiPreferences,
  validateDensity,
  validateTheme,
  writeStoredUiPreferences,
} from './ui-preferences-storage';

describe('ui-preferences-storage', () => {
  it('validates theme strictly with light default', () => {
    expect(validateTheme('dark')).toBe('dark');
    expect(validateTheme('light')).toBe('light');
    expect(validateTheme('invalid')).toBe('light');
    expect(validateTheme(null)).toBe('light');
  });

  it('validates density strictly with default fallback', () => {
    expect(validateDensity('compact')).toBe('compact');
    expect(validateDensity('comfortable')).toBe('comfortable');
    expect(validateDensity('default')).toBe('default');
    expect(validateDensity('other')).toBe('default');
  });

  it('parses valid serialized preferences', () => {
    const raw = JSON.stringify({
      theme: 'dark',
      density: 'compact',
      sidebarCollapsed: true,
    });
    const parsed = parseUiPreferences(raw);
    expect(parsed).toEqual({
      theme: 'dark',
      density: 'compact',
      sidebarCollapsed: true,
    });
  });

  it('handles invalid or corrupted JSON gracefully with defaults', () => {
    expect(parseUiPreferences('{ invalid json')).toEqual({
      theme: 'light',
      density: 'default',
      sidebarCollapsed: false,
    });
    expect(parseUiPreferences(null)).toEqual({
      theme: 'light',
      density: 'default',
      sidebarCollapsed: false,
    });
  });

  it('reads and writes to storage correctly', () => {
    const map = new Map<string, string>();
    const mockStorage = {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, val: string) => map.set(key, val),
    };

    const initial = readStoredUiPreferences(mockStorage);
    expect(initial.theme).toBe('light');

    writeStoredUiPreferences(
      { theme: 'dark', density: 'comfortable', sidebarCollapsed: true },
      mockStorage,
    );
    const updated = readStoredUiPreferences(mockStorage);
    expect(updated).toEqual({
      theme: 'dark',
      density: 'comfortable',
      sidebarCollapsed: true,
    });
    const serialized = serializeUiPreferences({
      theme: 'dark',
      density: 'comfortable',
      sidebarCollapsed: true,
    });
    expect(serialized).toContain('"theme":"dark"');
  });
});
