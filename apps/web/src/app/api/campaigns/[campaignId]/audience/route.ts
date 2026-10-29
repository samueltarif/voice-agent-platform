import { NextResponse, type NextRequest } from 'next/server';
import { assignCampaignAudienceInputSchema } from '@voice-agent/contracts';
import { invalidId } from '../../../operations-ids.js';
import { parseJsonBody, runTenantOperation } from '../../../operations-bff.js';

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ campaignId: string }> },
): Promise<NextResponse> {
  const { campaignId } = await context.params;
  return (
    invalidId(campaignId) ??
    runTenantOperation(req, async (tenant) => {
      const body = await parseJsonBody(req, assignCampaignAudienceInputSchema);
      if (!body.ok) return body.response;
      return NextResponse.json(
        await tenant.request({
          method: 'PUT',
          path: `/v1/campaigns/${campaignId}/audience`,
          body: body.data,
        }),
      );
    })
  );
}
