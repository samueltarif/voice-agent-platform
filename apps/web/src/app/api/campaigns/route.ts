import { NextResponse, type NextRequest } from 'next/server';
import {
  createCampaignDraftInputSchema,
  type AgentVersionMetadataResponse,
} from '@voice-agent/contracts';
import { pickQuery } from '../operations-ids.js';
import { parseJsonBody, runTenantOperation } from '../operations-bff.js';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const query = pickQuery(req.url, ['limit', 'offset']);
  return runTenantOperation(req, async (tenant) =>
    NextResponse.json({
      campaigns: await tenant.request({ method: 'GET', path: `/v1/campaigns${query}` }),
    }),
  );
}

/**
 * Cria a campanha em DRAFT com a versão PUBLICADA atual do agente, resolvida
 * no servidor (o cliente nunca escolhe a versão). Sem versão publicada → 409.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  return runTenantOperation(req, async (tenant) => {
    const body = await parseJsonBody(req, createCampaignDraftInputSchema);
    if (!body.ok) return body.response;
    const versions = await tenant.request<AgentVersionMetadataResponse[]>({
      method: 'GET',
      path: `/v1/agents/${body.data.agentId}/versions`,
    });
    const published = versions.find((v) => v.status === 'PUBLISHED');
    if (!published) return NextResponse.json({ code: 'NO_PUBLISHED_VERSION' }, { status: 409 });
    const created = await tenant.request({
      method: 'POST',
      path: '/v1/campaigns',
      body: { ...body.data, agentVersionId: published.id, status: 'DRAFT' },
    });
    return NextResponse.json(created, { status: 201 });
  });
}
