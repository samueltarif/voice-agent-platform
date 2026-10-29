import { NextResponse, type NextRequest } from 'next/server';
import { campaignActionInputSchema } from '@voice-agent/contracts';
import { invalidId } from '../../../operations-ids.js';
import { parseJsonBody, runTenantOperation } from '../../../operations-bff.js';

/** Iniciar/pausar/retomar/cancelar. Nenhuma ação dispara chamada real (offline). */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ campaignId: string }> },
): Promise<NextResponse> {
  const { campaignId } = await context.params;
  return (
    invalidId(campaignId) ??
    runTenantOperation(req, async (tenant) => {
      const body = await parseJsonBody(req, campaignActionInputSchema);
      if (!body.ok) return body.response;
      return NextResponse.json(
        await tenant.request({
          method: 'POST',
          path: `/v1/campaigns/${campaignId}/actions`,
          body: body.data,
        }),
      );
    })
  );
}
