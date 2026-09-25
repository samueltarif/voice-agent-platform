import { headers, cookies } from 'next/headers';
import { auth } from '../auth/auth.js';
import { getBootstrapApiClient } from '../api/api-client-factory.js';
import {
  getActiveOrgSlugCookie,
  setActiveOrgSlugCookie,
  clearActiveOrgSlugCookie,
} from './active-organization-cookie.js';
import {
  activeOrganizationContextResolver,
  type ActiveOrganizationContextResolver,
} from './active-organization-context-resolver.js';
import type { ActiveOrganizationResolutionResult } from './active-organization-context.js';

export interface ServerOrganizationContextResult extends ActiveOrganizationResolutionResult {
  readonly user?: {
    readonly id: string;
    readonly email: string;
    readonly name?: string;
  };
}

function syncCookieWithResolution(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
  resolution: ActiveOrganizationResolutionResult,
  preferredSlug: string | null,
): void {
  if (resolution.stalePreferenceDetected && resolution.context) {
    setActiveOrgSlugCookie(cookieStore, resolution.context.slug);
    return;
  }
  if (resolution.status === 'NO_ORGANIZATIONS' && preferredSlug) {
    clearActiveOrgSlugCookie(cookieStore);
  }
}

export async function getServerOrganizationContext(options?: {
  readonly resolver?: ActiveOrganizationContextResolver | undefined;
  readonly requestId?: string | undefined;
}): Promise<ServerOrganizationContextResult> {
  const headerList = await headers();
  const session = await auth.api.getSession({ headers: headerList });

  if (!session?.user?.id) {
    return {
      status: 'UNAUTHENTICATED',
      availableOrganizations: [],
    };
  }

  const cookieStore = await cookies();
  const preferredSlug = getActiveOrgSlugCookie(cookieStore);

  const bootstrapClient = getBootstrapApiClient();
  const resolver = options?.resolver ?? activeOrganizationContextResolver;

  const resolution = await resolver.resolve({
    userId: session.user.id,
    preferredSlug,
    bootstrapClient,
    ...(options?.requestId !== undefined ? { requestId: options.requestId } : {}),
  });

  syncCookieWithResolution(cookieStore, resolution, preferredSlug);

  return {
    ...resolution,
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    },
  };
}
