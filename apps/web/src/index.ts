import type { TenantScoped } from '@voice-agent/contracts';
import { UI_PACKAGE } from '@voice-agent/ui';

export interface WebAppState extends TenantScoped {
  readonly title: string;
}

export const WEB_APP = 'web' as const;
export const UI_REF = UI_PACKAGE;
