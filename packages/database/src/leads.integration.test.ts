import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleContactSuppressionRepository } from './repositories/contact-suppression-repository.js';
import { DrizzleLeadRepository } from './repositories/lead-repository.js';
import { auditLogs } from './schema/audit.js';
import { contactSuppressions } from './schema/contacts.js';
import { createDisposableTestDatabase } from './test-support/disposable-test-database.js';
import {
  createDurableOutboundFixture,
  type DurableOutboundFixture,
} from './test-support/durable-outbound-fixtures.js';
import {
  createSyntheticContact,
  createSyntheticLead,
  SCHEDULING_TEST_USER,
} from './test-support/scheduling-fixtures.js';

const tdb = await createDisposableTestDatabase('leads-e1');

/** E1 (DEC-074) — leads ligados a contatos: status, histórico, auditoria e supressão. */
describe('E1 leads (PostgreSQL)', () => {
  const repo = new DrizzleLeadRepository(tdb.db);
  const suppressions = new DrizzleContactSuppressionRepository(tdb.db);
  let fx: DurableOutboundFixture;
  let orgA: string;
  let orgB: string;

  beforeAll(async () => {
    fx = await createDurableOutboundFixture(tdb.db);
    orgA = fx.tenantA.organizationId;
    orgB = fx.tenantB.organizationId;
  });

  afterAll(async () => {
    await tdb.drop();
  });

  it('creates one lead per contact (repeat = EXISTING) and records history and audit', async () => {
    const contact = await createSyntheticContact(tdb.db, orgA);
    const input = { organizationId: orgA, contactId: contact.id, actor: SCHEDULING_TEST_USER };
    const first = await repo.createLeadForContact(input);
    const again = await repo.createLeadForContact(input);
    expect(first.kind).toBe('CREATED');
    expect(again.kind).toBe('EXISTING');
    if (first.kind !== 'CREATED' || again.kind !== 'EXISTING') return;
    expect(again.lead.id).toBe(first.lead.id);
    const view = await repo.getLead(orgA, first.lead.id);
    expect(view).toMatchObject({
      status: 'NEW',
      phoneE164: contact.phoneE164,
      phoneSuppressed: false,
    });
    expect(view!.history.map((h) => [h.fromStatus, h.toStatus, h.origin])).toEqual([
      [null, 'NEW', 'CREATED'],
    ]);
    const audit = await tdb.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.targetId, first.lead.id));
    expect(audit.map((a) => a.action)).toEqual(['lead.created']);
    expect(audit[0]!.metadata).not.toContain(contact.phoneE164);
  });

  it('never links a contact of another organization', async () => {
    const foreign = await createSyntheticContact(tdb.db, orgB);
    expect(
      await repo.createLeadForContact({
        organizationId: orgA,
        contactId: foreign.id,
        actor: SCHEDULING_TEST_USER,
      }),
    ).toEqual({ kind: 'CONTACT_NOT_FOUND' });
  });

  it('starts DO_NOT_CALL when the phone is already suppressed, and DO_NOT_CALL is terminal', async () => {
    const contact = await createSyntheticContact(tdb.db, orgA);
    await suppressions.addSuppression({
      organizationId: orgA,
      phoneE164: contact.phoneE164,
      reason: 'OPT_OUT',
    });
    const created = await repo.createLeadForContact({
      organizationId: orgA,
      contactId: contact.id,
      actor: SCHEDULING_TEST_USER,
    });
    expect(created.kind === 'CREATED' && created.lead.status).toBe('DO_NOT_CALL');
    if (created.kind !== 'CREATED') return;
    expect(
      await repo.changeLeadStatus({
        organizationId: orgA,
        leadId: created.lead.id,
        status: 'QUALIFIED',
        expectedVersion: 1,
        actor: SCHEDULING_TEST_USER,
      }),
    ).toEqual({ kind: 'BLOCKED', reason: 'LEAD_DO_NOT_CALL' });
  });

  it('applies manual transitions with optimistic version and keeps the status consistent', async () => {
    const { lead } = await createSyntheticLead(tdb.db, orgA);
    const change = (
      status: 'CONTACTED' | 'QUALIFIED' | 'MEETING_SCHEDULED' | 'NEW',
      expectedVersion: number,
    ) =>
      repo.changeLeadStatus({
        organizationId: orgA,
        leadId: lead.id,
        status,
        expectedVersion,
        actor: SCHEDULING_TEST_USER,
        reason: 'ligação de retorno',
      });
    expect((await change('CONTACTED', 1)).kind).toBe('CHANGED');
    expect(await change('QUALIFIED', 1)).toEqual({ kind: 'VERSION_CONFLICT' });
    expect(await change('MEETING_SCHEDULED', 2)).toEqual({
      kind: 'BLOCKED',
      reason: 'STATUS_MANAGED_BY_SCHEDULING',
    });
    expect(await change('NEW', 2)).toEqual({ kind: 'BLOCKED', reason: 'TRANSITION_NOT_ALLOWED' });
    const changed = await change('QUALIFIED', 2);
    expect(changed.kind === 'CHANGED' && [changed.lead.status, changed.lead.statusVersion]).toEqual(
      ['QUALIFIED', 3],
    );
    const view = await repo.getLead(orgA, lead.id);
    expect(view!.history.map((h) => h.toStatus)).toEqual(['NEW', 'CONTACTED', 'QUALIFIED']);
  });

  it('DO_NOT_CALL registers the OPT_OUT suppression reused by the existing call control', async () => {
    const { lead, contact } = await createSyntheticLead(tdb.db, orgA);
    const outcome = await repo.changeLeadStatus({
      organizationId: orgA,
      leadId: lead.id,
      status: 'DO_NOT_CALL',
      expectedVersion: 1,
      actor: SCHEDULING_TEST_USER,
    });
    expect(outcome.kind).toBe('CHANGED');
    const [row] = await tdb.db
      .select()
      .from(contactSuppressions)
      .where(
        and(
          eq(contactSuppressions.organizationId, orgA),
          eq(contactSuppressions.phoneE164, contact.phoneE164),
        ),
      );
    expect(row).toMatchObject({ reason: 'OPT_OUT', evidenceReference: `lead:${lead.id}` });
    // O mesmo número continua livre em outra organização.
    const other = await tdb.db
      .select()
      .from(contactSuppressions)
      .where(eq(contactSuppressions.organizationId, orgB));
    expect(other.some((s) => s.phoneE164 === contact.phoneE164)).toBe(false);
    expect((await repo.getLead(orgA, lead.id))!.phoneSuppressed).toBe(true);
  });

  it('isolates reads and writes between organizations', async () => {
    const { lead } = await createSyntheticLead(tdb.db, orgA);
    expect(await repo.getLead(orgB, lead.id)).toBeNull();
    expect(
      await repo.changeLeadStatus({
        organizationId: orgB,
        leadId: lead.id,
        status: 'CONTACTED',
        expectedVersion: 1,
        actor: SCHEDULING_TEST_USER,
      }),
    ).toEqual({ kind: 'NOT_FOUND' });
    const listB = await repo.listLeads({ organizationId: orgB, limit: 100, offset: 0 });
    expect(listB.some((item) => item.id === lead.id)).toBe(false);
    const listA = await repo.listLeads({
      organizationId: orgA,
      status: 'NEW',
      limit: 100,
      offset: 0,
    });
    expect(listA.some((item) => item.id === lead.id)).toBe(true);
  });
});
