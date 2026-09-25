import type { OrganizationContextResponse } from '@voice-agent/contracts';
import type { BootstrapApiClient } from '../api/bootstrap-api-client.js';
import type {
  ActiveOrganizationContext,
  ActiveOrganizationResolutionResult,
} from './active-organization-context.js';

export interface ResolveActiveOrganizationInput {
  readonly userId?: string | null | undefined;
  readonly preferredSlug?: string | null | undefined;
  readonly bootstrapClient: BootstrapApiClient;
  readonly requestId?: string | undefined;
}

function toActiveContext(org: OrganizationContextResponse): ActiveOrganizationContext {
  return {
    organizationId: org.id,
    slug: org.slug,
    name: org.name,
    role: org.role,
  };
}

function selectActiveOrganization(
  organizations: readonly OrganizationContextResponse[],
  preferredSlug?: string | null,
): { context: ActiveOrganizationContext; stalePreferenceDetected?: boolean } {
  const fallback = organizations[0]!;
  const trimmed = preferredSlug?.trim();
  if (!trimmed) {
    return { context: toActiveContext(fallback) };
  }

  const matched = organizations.find((org) => org.slug === trimmed);
  if (matched) {
    return { context: toActiveContext(matched) };
  }

  return {
    context: toActiveContext(fallback),
    stalePreferenceDetected: true,
  };
}

export class ActiveOrganizationContextResolver {
  async resolve(
    input: ResolveActiveOrganizationInput,
  ): Promise<ActiveOrganizationResolutionResult> {
    const trimmedUserId = input.userId?.trim();
    if (!trimmedUserId) {
      return {
        status: 'UNAUTHENTICATED',
        availableOrganizations: [],
      };
    }

    const organizations = await input.bootstrapClient.listOrganizationsForUser(
      trimmedUserId,
      input.requestId,
    );

    if (organizations.length === 0) {
      return {
        status: 'NO_ORGANIZATIONS',
        availableOrganizations: [],
      };
    }

    const { context, stalePreferenceDetected } = selectActiveOrganization(
      organizations,
      input.preferredSlug,
    );

    return {
      status: 'RESOLVED',
      context,
      availableOrganizations: organizations,
      ...(stalePreferenceDetected ? { stalePreferenceDetected: true } : {}),
    };
  }
}

export const activeOrganizationContextResolver = new ActiveOrganizationContextResolver();
