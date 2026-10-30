import { NextResponse, type NextRequest } from 'next/server';
import { createContactSuppressionInputSchema } from '@voice-agent/contracts';
import { pickQuery } from '../operations-ids.js';
import { parseJsonBody, runTenantOperation } from '../operations-bff.js';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const query = pickQuery(req.url, ['limit', 'offset']);
  return runTenantOperation(req, async (tenant) =>
    NextResponse.json({
      suppressions: await tenant.request({
        method: 'GET',
        path: `/v1/contact-suppressions${query}`,
      }),
    }),
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return runTenantOperation(req, async (tenant) => {
    const body = await parseJsonBody(req, createContactSuppressionInputSchema);
    if (!body.ok) return body.response;
    const result = await tenant.request({
      method: 'POST',
      path: '/v1/contact-suppressions',
      body: body.data,
    });
    return NextResponse.json(result);
  });
}
