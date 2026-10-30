import { NextResponse, type NextRequest } from 'next/server';
import { createContactListInputSchema } from '@voice-agent/contracts';
import { parseJsonBody, runTenantOperation } from '../operations-bff.js';

export async function GET(req: NextRequest): Promise<NextResponse> {
  return runTenantOperation(req, async (tenant) =>
    NextResponse.json({
      lists: await tenant.request({ method: 'GET', path: '/v1/contact-lists' }),
    }),
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return runTenantOperation(req, async (tenant) => {
    const body = await parseJsonBody(req, createContactListInputSchema);
    if (!body.ok) return body.response;
    const created = await tenant.request({
      method: 'POST',
      path: '/v1/contact-lists',
      body: body.data,
    });
    return NextResponse.json(created, { status: 201 });
  });
}
