import { NextResponse, type NextRequest } from 'next/server';
import { CONTACT_CSV_LIMITS, contactImportRequestSchema } from '@voice-agent/contracts';
import { invalidId } from '../../../operations-ids.js';
import { parseJsonBody, runTenantOperation } from '../../../operations-bff.js';

/** Mesmo teto da API (CSV + JSON escapado); excedente é recusado antes de bufferizar. */
const IMPORT_MAX_BODY_BYTES = CONTACT_CSV_LIMITS.maxBytes * 2 + 64 * 1024;

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ listId: string }> },
): Promise<NextResponse> {
  const { listId } = await context.params;
  return (
    invalidId(listId) ??
    runTenantOperation(req, async (tenant) => {
      const body = await parseJsonBody(req, contactImportRequestSchema, IMPORT_MAX_BODY_BYTES);
      if (!body.ok) return body.response;
      const report = await tenant.request({
        method: 'POST',
        path: `/v1/contact-lists/${listId}/imports`,
        body: body.data,
      });
      return NextResponse.json(report);
    })
  );
}
