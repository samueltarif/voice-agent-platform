import type { TenantRole, OrganizationContextResponse } from '@voice-agent/contracts';

export interface ActiveOrganizationContext {
  readonly organizationId: string;
  readonly slug: string;
  readonly name: string;
  readonly role: TenantRole;
}

export type ActiveOrganizationResolutionStatus =
  'RESOLVED' | 'NO_ORGANIZATIONS' | 'UNAUTHENTICATED';

export interface ActiveOrganizationResolutionResult {
  readonly status: ActiveOrganizationResolutionStatus;
  readonly context?: ActiveOrganizationContext;
  readonly availableOrganizations: readonly OrganizationContextResponse[];
  readonly stalePreferenceDetected?: boolean;
}

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidOrganizationSlug(slug: unknown): slug is string {
  if (typeof slug !== 'string') {
    return false;
  }
  const trimmed = slug.trim();
  if (trimmed.length < 1 || trimmed.length > 100) {
    return false;
  }
  return SLUG_REGEX.test(trimmed);
}

export interface SwitchOrganizationInput {
  readonly slug: string;
}

export function parseSwitchOrganizationInput(
  rawInput: unknown,
): { success: true; data: SwitchOrganizationInput } | { success: false; error: string } {
  if (typeof rawInput !== 'object' || rawInput === null) {
    return { success: false, error: 'Payload de requisição inválido.' };
  }

  const { slug } = rawInput as Record<string, unknown>;
  if (!isValidOrganizationSlug(slug)) {
    return {
      success: false,
      error: 'Identificador de organização inválido. Deve ser alfanumérico em minúsculas e hífen.',
    };
  }

  return { success: true, data: { slug: slug.trim() } };
}

export interface SwitchOrganizationResponse {
  readonly success: boolean;
  readonly organization?: {
    readonly slug: string;
    readonly name: string;
  };
  readonly error?: string;
}
