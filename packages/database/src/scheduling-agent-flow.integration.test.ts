import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleSchedulingAgentService } from './repositories/scheduling-agent-service.js';
import { createDisposableTestDatabase } from './test-support/disposable-test-database.js';
import {
  createDurableOutboundFixture,
  type DurableOutboundFixture,
} from './test-support/durable-outbound-fixtures.js';
import {
  createAgentScenario,
  meetingsOfLead,
  offersOfLead,
  protocolPhase,
  SchedulingHarness,
} from './test-support/scheduling-agent-harness.js';
import { createControlledClock, SCHEDULING_TEST_NOW } from './test-support/scheduling-fixtures.js';

const tdb = await createDisposableTestDatabase('e2-agent-flow');
const MINUTE = 60_000;

/**
 * E2 PR 2 (DEC-075) — consulta, apresentação, escolha, releitura, confirmação
 * e reserva pelo agente, com serviços canônicos e PostgreSQL descartável.
 */
describe('E2 PR2: offer, contextual confirmation and booking (offline)', () => {
  let fx: DurableOutboundFixture;
  const clock = createControlledClock();
  const service = new DrizzleSchedulingAgentService(tdb.db, { clock: clock.now });

  beforeAll(async () => {
    fx = await createDurableOutboundFixture(tdb.db);
  });
  afterAll(async () => {
    await tdb.drop();
  });

  async function setup(options: { calendarId?: null } = {}) {
    clock.set(SCHEDULING_TEST_NOW);
    const scenario = await createAgentScenario(tdb.db, { fx, ...options });
    return { ...scenario, harness: new SchedulingHarness(service, scenario.scope) };
  }

  it('books only after full presentation, choice, exact readback and an eligible acceptance', async () => {
    const { harness, scope, leadId } = await setup();
    const found = await service.findSlots(scope, {});
    expect(found.status).toBe('OFFERED');
    if (found.status !== 'OFFERED') return;
    expect(found.options.map((option) => option.label)).toEqual([
      'segunda-feira, 30 de novembro de 2026, às 09:00, fuso America/Sao_Paulo (GMT-03:00)',
      'segunda-feira, 30 de novembro de 2026, às 09:30, fuso America/Sao_Paulo (GMT-03:00)',
      'segunda-feira, 30 de novembro de 2026, às 10:00, fuso America/Sao_Paulo (GMT-03:00)',
    ]);
    const presented = await harness.speak({
      purpose: 'PRESENTATION',
      listRevision: found.listRevision,
    });
    expect(presented.phase).toBe('AWAITING_SELECTION');
    const chosen = await harness.leadSays('A segunda.');
    expect(chosen.phase).toBe('READBACK_PENDING');
    expect(chosen.speech).toBe(
      'Só para confirmar: segunda-feira, 30 de novembro de 2026, às 09:30, fuso America/Sao_Paulo (GMT-03:00). Posso marcar a reunião nesse horário?',
    );
    const readBack = chosen.directives[0];
    if (readBack?.kind !== 'READ_BACK') throw new Error('expected READ_BACK');
    await harness.speak({
      purpose: 'READBACK',
      listRevision: found.listRevision,
      offerId: readBack.offerId,
    });
    const accepted = await harness.leadSays('Sim, pode marcar.');
    expect(accepted.directives.map((directive) => directive.kind)).toEqual(['BOOK']);
    expect(await meetingsOfLead(tdb.db, scope.organizationId, leadId)).toHaveLength(0);

    const booked = await service.confirmOffer(scope);
    expect(booked).toMatchObject({ status: 'BOOKED', recovered: false, mayAnnounceBooking: true });
    expect(booked.speech).toContain('às 09:30, fuso America/Sao_Paulo');
    const [meeting, ...others] = await meetingsOfLead(tdb.db, scope.organizationId, leadId);
    expect(others).toHaveLength(0);
    expect(meeting).toMatchObject({ slotOfferId: readBack.offerId, bookedByType: 'AGENT' });
    expect(meeting!.startsAt.toISOString()).toBe('2026-11-30T12:30:00.000Z');
    expect(await protocolPhase(tdb.db, scope)).toBe('BOOKED');

    // Repetição técnica: recupera a MESMA reunião; nova consulta não reabre o comercial.
    expect(await service.confirmOffer(scope)).toMatchObject({ status: 'BOOKED', recovered: true });
    expect(await meetingsOfLead(tdb.db, scope.organizationId, leadId)).toHaveLength(1);
    expect(await service.findSlots(scope, {})).toMatchObject({
      status: 'REFUSED',
      reason: 'ALREADY_BOOKED',
    });
  });

  it('never books from the model: no authorization, no meeting, no announcement', async () => {
    const { scope, leadId, harness } = await setup();
    expect(await service.confirmOffer(scope)).toMatchObject({
      status: 'REFUSED',
      reason: 'NOT_AUTHORIZED',
      mayAnnounceBooking: false,
    });
    await harness.reachConfirmation();
    expect(await service.confirmOffer(scope)).toMatchObject({ reason: 'NOT_AUTHORIZED' });
    expect(await meetingsOfLead(tdb.db, scope.organizationId, leadId)).toHaveLength(0);
  });

  it('ignores an acceptance before the readback was completely delivered', async () => {
    const { scope, harness } = await setup();
    const found = await service.findSlots(scope, {});
    if (found.status !== 'OFFERED') throw new Error(found.status);
    await harness.speak({ purpose: 'PRESENTATION', listRevision: found.listRevision });
    const chosen = await harness.leadSays('A primeira.');
    const offerId = chosen.directives[0]?.kind === 'READ_BACK' ? chosen.directives[0].offerId : '';
    const generation = await harness.startSpeaking({
      purpose: 'READBACK',
      listRevision: found.listRevision,
      offerId,
    });
    // O interlocutor fala POR CIMA da releitura (antes da entrega completa).
    expect((await harness.leadSays('Sim.')).ignored).toBe('UTTERANCE_BEFORE_DELIVERY');
    await service.recordLeadSpeechStarted(scope);
    await service.recordSpeech(scope, { type: 'SPEECH_COMPLETED', generationId: generation });
    // Começou ANTES da entrega completa: continua inelegível.
    const early = await service.recordLeadUtterance(scope, 'Sim.');
    expect(early.ignored).toBe('UTTERANCE_BEFORE_DELIVERY');
    expect(early.phase).toBe('AWAITING_CONFIRMATION');
    expect(await service.confirmOffer(scope)).toMatchObject({ reason: 'NOT_AUTHORIZED' });
    // Fala final sem início registrado pelo servidor é ignorada.
    expect((await service.recordLeadUtterance(scope, 'Sim.')).ignored).toBe(
      'UTTERANCE_WITHOUT_START',
    );
  });

  it('requires speaking the readback again after an interruption; stale generations are ignored', async () => {
    const { scope, harness } = await setup();
    const found = await service.findSlots(scope, {});
    if (found.status !== 'OFFERED') throw new Error(found.status);
    await harness.speak({ purpose: 'PRESENTATION', listRevision: found.listRevision });
    const chosen = await harness.leadSays('A terceira.');
    const offerId = chosen.directives[0]?.kind === 'READ_BACK' ? chosen.directives[0].offerId : '';
    const generation = await harness.startSpeaking({
      purpose: 'READBACK',
      listRevision: found.listRevision,
      offerId,
    });
    const interrupted = await service.recordSpeech(scope, {
      type: 'SPEECH_INTERRUPTED',
      generationId: generation,
    });
    expect(interrupted.directives.map((directive) => directive.kind)).toEqual(['READ_BACK']);
    expect(
      (await service.recordSpeech(scope, { type: 'SPEECH_COMPLETED', generationId: generation }))
        .phase,
    ).toBe('READBACK_PENDING');
    await harness.speak({ purpose: 'READBACK', listRevision: found.listRevision, offerId });
    expect((await harness.leadSays('Isso mesmo.')).phase).toBe('AUTHORIZED');
    expect(await service.confirmOffer(scope)).toMatchObject({ status: 'BOOKED' });
  });

  it('does not book an expired offer and never renews the deadline silently', async () => {
    const { scope, harness, leadId } = await setup();
    await harness.reachAuthorization();
    clock.set(new Date(SCHEDULING_TEST_NOW.getTime() + 16 * MINUTE));
    const result = await service.confirmOffer(scope);
    expect(result).toMatchObject({
      status: 'REFUSED',
      reason: 'NOT_AUTHORIZED',
      mayAnnounceBooking: false,
    });
    expect(await meetingsOfLead(tdb.db, scope.organizationId, leadId)).toHaveLength(0);
    expect(await protocolPhase(tdb.db, scope)).toBe('IDLE');
  });

  it('a technical retry returns the same list; a different query replaces it', async () => {
    const { scope, harness, leadId } = await setup();
    const first = await service.findSlots(scope, {});
    clock.set(new Date(SCHEDULING_TEST_NOW.getTime() + 5 * MINUTE));
    const retry = await service.findSlots(scope, {});
    expect(retry).toEqual({ ...first, retry: true });
    expect(await offersOfLead(tdb.db, scope.organizationId, leadId)).toBe(3);
    const tuesday = await service.findSlots(scope, { day: '2026-12-01' });
    if (first.status !== 'OFFERED' || tuesday.status !== 'OFFERED')
      throw new Error('expected lists');
    expect(tuesday.listRevision).toBe(first.listRevision + 1);
    expect(tuesday.options[0]?.label).toContain('terça-feira, 1 de dezembro de 2026, às 09:00');
    // A apresentação da lista substituída não vale mais.
    const stale = await harness.speak({
      purpose: 'PRESENTATION',
      listRevision: first.listRevision,
    });
    expect(stale.phase).toBe('PRESENTING');
    await harness.speak({ purpose: 'PRESENTATION', listRevision: tuesday.listRevision });
    const chosen = await harness.leadSays('A primeira.');
    expect(chosen.speech).toContain('terça-feira, 1 de dezembro de 2026, às 09:00');
  });

  it('a possible opt-out blocks the commercial flow and the booking until clarified', async () => {
    const { scope, harness, leadId } = await setup();
    await harness.reachConfirmation();
    const view = await harness.leadSays('Tire meu número da lista, mas só se eu confirmar amanhã.');
    expect(view).toMatchObject({
      phase: 'AWAITING_CONFIRMATION',
      optOutClarificationPending: true,
    });
    // TEST_CHANGE_REASON (E2 PR 3, ASSERTION_EQUIVALENT): pergunta reescrita sem dupla negação
    // ("sim" = parar de ligar); a asserção continua exigindo a pergunta de opt-out.
    expect(view.speech).toContain('você quer que a gente pare de ligar para você?');
    // Um aceite posterior não autoriza nada enquanto o pedido não for esclarecido.
    expect((await harness.leadSays('Sim, pode marcar.')).directives).not.toContainEqual(
      expect.objectContaining({ kind: 'BOOK' }),
    );
    expect(await service.confirmOffer(scope)).toMatchObject({
      reason: 'OPT_OUT_CLARIFICATION_PENDING',
    });
    expect(await service.findSlots(scope, {})).toMatchObject({
      reason: 'OPT_OUT_CLARIFICATION_PENDING',
    });
    expect(await meetingsOfLead(tdb.db, scope.organizationId, leadId)).toHaveLength(0);
    // Um pedido inequívoco continua prevalecendo.
    expect((await harness.leadSays('Não me ligue mais.')).phase).toBe('OPTED_OUT');
  });

  it('a recognized opt-out after authorization cancels the pending booking', async () => {
    const { scope, harness, leadId } = await setup();
    await harness.reachAuthorization();
    const view = await harness.leadSays('Me descadastre.');
    expect(view.directives.map((directive) => directive.kind)).toEqual(['RECORD_OPT_OUT']);
    expect(await service.confirmOffer(scope)).toMatchObject({ reason: 'OPT_OUT_REQUESTED' });
    expect(await meetingsOfLead(tdb.db, scope.organizationId, leadId)).toHaveLength(0);
  });

  it('without a pinned calendar there is no scheduling, but opt-out still works', async () => {
    const { scope, harness } = await setup({ calendarId: null });
    expect(await service.findSlots(scope, {})).toMatchObject({ reason: 'SCHEDULING_UNAVAILABLE' });
    expect((await harness.leadSays('Não me ligue mais.')).phase).toBe('OPTED_OUT');
  });
});
