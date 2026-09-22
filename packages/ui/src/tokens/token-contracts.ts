/**
 * Contratos de tipos e chaves para Design Tokens semânticos.
 * As variáveis CSS em globals.css são a única fonte da verdade dos valores visuais runtime.
 */

export type UiThemeMode = 'light' | 'dark';

export type UiDensityMode = 'compact' | 'default' | 'comfortable';

export type SemanticColorKey =
  | 'background'
  | 'foreground'
  | 'card'
  | 'card-foreground'
  | 'popover'
  | 'popover-foreground'
  | 'primary'
  | 'primary-foreground'
  | 'secondary'
  | 'secondary-foreground'
  | 'muted'
  | 'muted-foreground'
  | 'accent'
  | 'accent-foreground'
  | 'destructive'
  | 'destructive-foreground'
  | 'border'
  | 'input'
  | 'ring'
  | 'success'
  | 'success-foreground'
  | 'warning'
  | 'warning-foreground'
  | 'danger'
  | 'danger-foreground'
  | 'handoff'
  | 'handoff-foreground';

export interface UiPreferencesState {
  readonly theme: UiThemeMode;
  readonly density: UiDensityMode;
  readonly sidebarCollapsed: boolean;
}

export const DEFAULT_UI_PREFERENCES: UiPreferencesState = {
  theme: 'light',
  density: 'default',
  sidebarCollapsed: false,
};

export const UI_STORAGE_KEY_V1 = 'voice-agent:ui:v1' as const;
