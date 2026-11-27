import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  AgentConfigurationSnapshotV1,
  CommercialPublicationPolicy,
} from '@voice-agent/contracts';
import { AgentDraftService } from './repositories/agent-draft-service.js';
import { AgentPublicationService } from './repositories/agent-publication-service.js';
import { SCHEDULING_PUBLICATION_ERROR_CODES } from './repositories/agent-scheduling-publication-guard.js';
import { createDisposableTestDatabase } from './test-support/disposable-test-database.js';
import { randomUUID } from 'node:crypto';
import { agents } from './schema/agents.js';
import {
  createDurableOutboundFixture,
  type DurableOutboundFixture,
} from './test-support/durable-outbound-fixtures.js';
import { createWeekdayCalendar } from './test-support/scheduling-fixtures.js';

const tdb = await createDisposableTestDatabase('e2-scheduling-publication');

/** Política comercial aberta: este teste isola só a regra de agendamento. */
const OPEN_POLICY = {
  assertEligibleForPublish: async () => {},
} as unknown as CommercialPublicationPolicy;

const BASE: AgentConfigurationSnapshotV1 = {
  persona: {
    role: 'Atendente',
    companyName: 'Empresa Exemplo',
    objective: 'Agendar reuniões',
    tone: 'FORMAL',
    greetingPhrase: 'Olá',
    closingPhrase: 'Até logo',
    fallbackPhrase: 'Pode repetir?',
  },
  voice: { languageCode: 'pt-BR' },
  rules: { conversational: [], deterministic: {} },
};

/**
 * E2 PR 2 (DEC-075) — compatibilidade entre publicação, toolset e agenda na
 * transação da publicação: par completo de ferramentas e agenda do MESMO tenant.
 */
describe('E2 PR2: scheduling toolset and calendar at publication', () => {
  let fx: DurableOutboundFixture;
  const drafts = new AgentDraftService(tdb.db);
  const publisher = new AgentPublicationService(tdb.db, OPEN_POLICY);

  beforeAll(async () => {
    fx = await createDurableOutboundFixture(tdb.db);
  });
  afterAll(async () => {
    await tdb.drop();
  });

  async function publish(configuration: AgentConfigurationSnapshotV1) {
    const organizationId = fx.tenantA.organizationId;
    const [agent] = await tdb.db
      .insert(agents)
      .values({ organizationId, name: 'E2 agent', slug: `e2-${randomUUID()}`, status: 'ACTIVE' })
      .returning();
    const agentId = agent!.id;
    const draft = await drafts.createDraft({
      organizationId,
      agentId,
      configuration,
      createdBy: fx.userId,
    });
    return publisher.publishDraft({
      organizationId,
      agentId,
      draftVersionId: draft.id,
      publishedBy: fx.userId,
    });
  }

  it('publishes both tools with a calendar of the same tenant', async () => {
    const calendar = await createWeekdayCalendar(tdb.db, {
      organizationId: fx.tenantA.organizationId,
    });
    const published = await publish({
      ...BASE,
      tools: ['scheduling.find_slots', 'scheduling.request_booking', 'lead.record_opt_out'],
      scheduling: { calendarId: calendar.id },
    });
    expect(published.status).toBe('PUBLISHED');
  });

  it('refuses an incomplete scheduling toolset', async () => {
    for (const tools of [
      ['scheduling.find_slots'],
      ['scheduling.request_booking'],
      // DEC-077: com agendamento, a ferramenta de opt-out é obrigatória.
      ['scheduling.find_slots', 'scheduling.request_booking'],
    ] as const) {
      await expect(publish({ ...BASE, tools: [...tools] })).rejects.toMatchObject({
        code: SCHEDULING_PUBLICATION_ERROR_CODES.TOOLS_INCOMPLETE,
      });
    }
  });

  it('refuses a calendar from another tenant or one that does not exist', async () => {
    const foreign = await createWeekdayCalendar(tdb.db, {
      organizationId: fx.tenantB.organizationId,
    });
    for (const calendarId of [foreign.id, '77777777-7777-4777-8777-777777777777']) {
      await expect(
        publish({
          ...BASE,
          tools: ['scheduling.find_slots', 'scheduling.request_booking', 'lead.record_opt_out'],
          scheduling: { calendarId },
        }),
      ).rejects.toMatchObject({ code: SCHEDULING_PUBLICATION_ERROR_CODES.CALENDAR_NOT_FOUND });
    }
  });
});
