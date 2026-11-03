import { NextResponse, type NextRequest } from 'next/server';
import { pickQuery } from '../../operations-ids.js';
import { runTenantOperation } from '../../operations-bff.js';

/** 008-MVP4c: tentativas da organização ativa (destinos já mascarados pela API). */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const query = pickQuery(req.url, ['days', 'limit', 'offset', 'outcome']);
  return runTenantOperation(req, async (tenant) =>
    NextResponse.json({
      attempts: await tenant.request({ method: 'GET', path: `/v1/operations/attempts${query}` }),
    }),
  );
}
