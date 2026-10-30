import { NextResponse, type NextRequest } from 'next/server';
import { invalidId, pickQuery } from '../../../operations-ids.js';
import { runTenantOperation } from '../../../operations-bff.js';

/** 008-MVP4: tentativas da campanha (destinos já mascarados pela API). */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ campaignId: string }> },
): Promise<NextResponse> {
  const { campaignId } = await context.params;
  const query = pickQuery(req.url, ['limit', 'offset', 'outcome']);
  return (
    invalidId(campaignId) ??
    runTenantOperation(req, async (tenant) =>
      NextResponse.json({
        attempts: await tenant.request({
          method: 'GET',
          path: `/v1/campaigns/${campaignId}/attempts${query}`,
        }),
      }),
    )
  );
}
