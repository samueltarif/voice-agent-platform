import { NextResponse, type NextRequest } from 'next/server';
import { invalidId } from '../../operations-ids.js';
import { runTenantOperation } from '../../operations-bff.js';

/** Campanha + progresso REAL + audiência em uma única leitura para a tela. */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ campaignId: string }> },
): Promise<NextResponse> {
  const { campaignId } = await context.params;
  return (
    invalidId(campaignId) ??
    runTenantOperation(req, async (tenant) => {
      const [campaign, detail] = await Promise.all([
        tenant.request({ method: 'GET', path: `/v1/campaigns/${campaignId}` }),
        tenant.request<{ progress: unknown; audience: unknown }>({
          method: 'GET',
          path: `/v1/campaigns/${campaignId}/progress`,
        }),
      ]);
      return NextResponse.json({ campaign, ...detail });
    })
  );
}
