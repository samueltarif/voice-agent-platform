import { NextResponse, type NextRequest } from 'next/server';
import { getServerOrganizationContext } from '../../../../lib/organization/server-organization-context.js';

function isSameOriginRequest(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) {
    const fetchSite = req.headers.get('sec-fetch-site');
    return !fetchSite || fetchSite === 'same-origin' || fetchSite === 'same-site';
  }

  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (!host) {
    return false;
  }

  try {
    const originUrl = new URL(origin);
    return originUrl.host === host;
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json(
      { status: 'UNAUTHENTICATED', error: 'Origem não autorizada' },
      { status: 403 },
    );
  }

  try {
    const result = await getServerOrganizationContext({
      requestId: req.headers.get('x-request-id') ?? undefined,
    });

    const sanitizedAvailableOrgs = result.availableOrganizations.map((org) => ({
      slug: org.slug,
      name: org.name,
      role: org.role,
    }));

    const sanitizedActiveOrg = result.context
      ? {
          slug: result.context.slug,
          name: result.context.name,
          role: result.context.role,
        }
      : undefined;

    return NextResponse.json({
      status: result.status,
      activeOrg: sanitizedActiveOrg,
      availableOrgs: sanitizedAvailableOrgs,
    });
  } catch {
    return NextResponse.json({ status: 'UNAUTHENTICATED', availableOrgs: [] }, { status: 200 });
  }
}
