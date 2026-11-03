import { NextResponse, type NextRequest } from 'next/server';
import { invalidId } from '../../../operations-ids.js';
import { runTenantOperation } from '../../../operations-bff.js';

/** 008-MVP4: relatório da campanha (custos só vêm da API para papéis autorizados). */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ campaignId: string }> },
): Promise<NextResponse> {
  const { campaignId } = await context.params;
  return (
    invalidId(campaignId) ??
    runTenantOperation(req, async (tenant) =>
      NextResponse.json({
        report: await tenant.request({ method: 'GET', path: `/v1/campaigns/${campaignId}/report` }),
      }),
    )
  );
}
