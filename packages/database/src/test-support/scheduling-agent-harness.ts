import { randomUUID } from 'node:crypto';
import { and, count, eq } from 'drizzle-orm';
import type { SchedulingAgentScope, SchedulingProtocolView } from '@voice-agent/contracts';
import type { DatabaseInstance } from '../client/connection.js';
import { readProtocolRow } from '../repositories/scheduling-agent-scope.js';
import type { DrizzleSchedulingAgentService } from '../repositories/scheduling-agent-service.js';
import { meetingSlotOffers } from '../schema/meeting-slot-offers.js';
import { meetings } from '../schema/meetings.js';
import {
  createPublishedAgent,
  type DurableOutboundFixture,
  type TenantFixture,
} from './durable-outbound-fixtures.js';
import { createSyntheticLead, createWeekdayCalendar } from './scheduling-fixtures.js';
import {
  createBoundCallSession,
  setCampaignSchedulingCalendar,
} from './scheduling-session-fixtures.js';

/**
 * E2 PR 2 — harness OFFLINE do agendamento pelo agente: sessão durável real,
 * lead do destino, agenda fixada pela campanha (D1) e o serviço canônico.
 * Simula só o que o transporte faria (início/fim de fala, transcrição final);
 * nenhuma chamada real, nenhum modelo.
 */

export interface AgentScenario {
  readonly tenant: TenantFixture;
  readonly scope: SchedulingAgentScope;
  readonly sessionId: string;
  readonly attemptId: string;
  readonly leadId: string;
  readonly phone: string;
  readonly calendarId: string | null;
}

export async function createAgentScenario(
  db: DatabaseInstance,
  input: {
    readonly fx: DurableOutboundFixture;
    readonly tenant?: TenantFixture;
    readonly calendarId?: string | null;
  },
): Promise<AgentScenario> {
  const base = input.tenant ?? input.fx.tenantA;
  const agent = await createPublishedAgent(db, base.organizationId, input.fx.userId);
  const tenant: TenantFixture = { ...base, ...agent };
  const { lead, contact } = await createSyntheticLead(db, base.organizationId);
  const calendarId =
    input.calendarId === undefined
      ? (await createWeekdayCalendar(db, { organizationId: base.organizationId })).id
      : input.calendarId;
  const session = await createBoundCallSession(db, { tenant, destinationPhone: contact.phoneE164 });
  if (calendarId && session.campaignId) {
    await setCampaignSchedulingCalendar(db, {
      organizationId: base.organizationId,
      campaignId: session.campaignId,
      calendarId,
    });
  }
  return {
    tenant,
    scope: {
      organizationId: base.organizationId,
      sessionId: session.sessionId,
      agentId: tenant.agentId,
      agentVersionId: tenant.agentVersionId,
      grantCalendarId: null,
    },
    sessionId: session.sessionId,
    attemptId: session.attemptId,
    leadId: lead.id,
    phone: contact.phoneE164,
    calendarId,
  };
}

/** Driver do transporte simulado (eventos confiáveis do harness, nunca do modelo). */
export class SchedulingHarness {
  private generation = 0;

  constructor(
    private readonly service: DrizzleSchedulingAgentService,
    readonly scope: SchedulingAgentScope,
  ) {}

  /** Fala completa: início + conclusão da MESMA geração. */
  async speak(input: {
    purpose: 'PRESENTATION' | 'READBACK';
    listRevision: number;
    offerId?: string;
  }) {
    const generationId = `gen-${(this.generation += 1)}-${randomUUID().slice(0, 6)}`;
    await this.service.recordSpeech(this.scope, { type: 'SPEECH_STARTED', generationId, ...input });
    return this.service.recordSpeech(this.scope, { type: 'SPEECH_COMPLETED', generationId });
  }

  async startSpeaking(input: {
    purpose: 'PRESENTATION' | 'READBACK';
    listRevision: number;
    offerId?: string;
  }) {
    const generationId = `gen-${(this.generation += 1)}-${randomUUID().slice(0, 6)}`;
    await this.service.recordSpeech(this.scope, { type: 'SPEECH_STARTED', generationId, ...input });
    return generationId;
  }

  /** O interlocutor começa e termina de falar (transcrição final). */
  async leadSays(text: string): Promise<SchedulingProtocolView> {
    await this.service.recordLeadSpeechStarted(this.scope);
    return this.service.recordLeadUtterance(this.scope, text);
  }

  /** Consulta → apresentação completa → escolha → releitura completa. Devolve a oferta lida. */
  async reachConfirmation(choice = 'A primeira.'): Promise<{ revision: number; offerId: string }> {
    const found = await this.service.findSlots(this.scope, {});
    if (found.status !== 'OFFERED') throw new Error(`expected OFFERED, got ${found.status}`);
    await this.speak({ purpose: 'PRESENTATION', listRevision: found.listRevision });
    const chosen = await this.leadSays(choice);
    const readBack = chosen.directives.find((directive) => directive.kind === 'READ_BACK');
    if (readBack?.kind !== 'READ_BACK') throw new Error(`expected READ_BACK, got ${chosen.phase}`);
    await this.speak({
      purpose: 'READBACK',
      listRevision: found.listRevision,
      offerId: readBack.offerId,
    });
    return { revision: found.listRevision, offerId: readBack.offerId };
  }

  /** Até a autorização de uso único emitida pelo protocolo. */
  async reachAuthorization(): Promise<{ revision: number; offerId: string }> {
    const reached = await this.reachConfirmation();
    const view = await this.leadSays('Sim, pode marcar.');
    if (view.phase !== 'AUTHORIZED') throw new Error(`expected AUTHORIZED, got ${view.phase}`);
    return reached;
  }
}

export async function meetingsOfLead(db: DatabaseInstance, organizationId: string, leadId: string) {
  return db
    .select()
    .from(meetings)
    .where(and(eq(meetings.organizationId, organizationId), eq(meetings.leadId, leadId)));
}

export async function offersOfLead(db: DatabaseInstance, organizationId: string, leadId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(meetingSlotOffers)
    .where(
      and(
        eq(meetingSlotOffers.organizationId, organizationId),
        eq(meetingSlotOffers.leadId, leadId),
      ),
    );
  return row?.n ?? 0;
}

export async function protocolPhase(db: DatabaseInstance, scope: SchedulingAgentScope) {
  return (await readProtocolRow(db, scope))?.state.phase ?? null;
}
