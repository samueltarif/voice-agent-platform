import { NextResponse, type NextRequest } from 'next/server';
import { invalidId, pickQuery } from '../../../operations-ids.js';
import { runTenantOperation } from '../../../operations-bff.js';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ listId: string }> },
): Promise<NextResponse> {
  const { listId } = await context.params;
  const query = pickQuery(req.url, ['eligibility', 'limit', 'offset']);
  return (
    invalidId(listId) ??
    runTenantOperation(req, async (tenant) =>
      NextResponse.json({
        members: await tenant.request({
          method: 'GET',
          path: `/v1/contact-lists/${listId}/members${query}`,
        }),
      }),
    )
  );
}
