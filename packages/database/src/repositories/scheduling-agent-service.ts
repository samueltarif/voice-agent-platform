import type {
  FindSlotsArguments,
  FindSlotsResult,
  LeadAgentPort,
  RecordOptOutArguments,
  RecordOptOutResult,
  RecordOutcomeArguments,
  RecordOutcomeResult,
  RequestBookingArguments,
  RequestBookingResult,
  SchedulingAgentPort,
  SchedulingAgentScope,
} from '@voice-agent/contracts';
import {
  findSlotsArgumentsSchema,
  recordOptOutArgumentsSchema,
  recordOutcomeArgumentsSchema,
  requestBookingArgumentsSchema,
} from '@voice-agent/contracts';
import type { DatabaseInstance } from '../client/connection.js';
import { ensureReconciliation } from './post-call-reconciliation-store.js';
import { requestBooking } from './scheduling-agent-booking-intent.js';
import type { SchedulingEventDeps } from './scheduling-agent-deps.js';
import { recordOptOut, recordOutcome } from './scheduling-agent-lead-tools.js';
import { findSlots, type OfferDeps } from './scheduling-agent-offers.js';
import { leadIdForPhone } from './scheduling-agent-opt-out.js';
import { resolveAgentScope } from './scheduling-agent-scope.js';
import { DrizzleSchedulingSessionContextResolver } from './scheduling-session-context-resolver.js';
import { DrizzleSchedulingSlotRepository } from './scheduling-slot-repository.js';

/**
 * E2 (DEC-075; simplificada pela DEC-077) — serviço canônico das ferramentas
 * de agendamento e do lead, OFFLINE: nenhuma composição de produção, rota ou
 * telefonia o registra. Na conexão direta, a plataforma só vê a EXECUÇÃO das
 * ferramentas; aceite, opt-out faltante e resultado comercial são decididos
 * na reconciliação pós-chamada (`DrizzlePostCallReconciliationService`).
 * Todo argumento é revalidado aqui (a porta não confia no chamador).
 */
export class DrizzleSchedulingAgentService implements SchedulingAgentPort, LeadAgentPort {
  private readonly deps: OfferDeps;

  constructor(db: DatabaseInstance, options: { readonly clock?: () => Date } = {}) {
    const clock = options.clock ?? (() => new Date());
    this.deps = {
      db,
      clock,
      resolver: new DrizzleSchedulingSessionContextResolver(db),
      slots: new DrizzleSchedulingSlotRepository(db),
    };
  }

  findSlots(scope: SchedulingAgentScope, args: FindSlotsArguments): Promise<FindSlotsResult> {
    return findSlots(this.deps, scope, findSlotsArgumentsSchema.parse(args));
  }

  requestBooking(
    scope: SchedulingAgentScope,
    args: RequestBookingArguments,
  ): Promise<RequestBookingResult> {
    return requestBooking(this.deps, scope, requestBookingArgumentsSchema.parse(args));
  }

  recordOutcome(
    scope: SchedulingAgentScope,
    args: RecordOutcomeArguments,
  ): Promise<RecordOutcomeResult> {
    return recordOutcome(this.deps, scope, recordOutcomeArgumentsSchema.parse(args));
  }

  recordOptOut(
    scope: SchedulingAgentScope,
    args: RecordOptOutArguments,
  ): Promise<RecordOptOutResult> {
    return recordOptOut(this.deps, scope, recordOptOutArgumentsSchema.parse(args));
  }

  /**
   * Para a composição, no início de uma chamada de agente com ferramentas da
   * E2: a sessão passa a exigir reconciliação pós-chamada mesmo que nenhuma
   * ferramenta seja usada (opt-out dito sem ferramenta é pego no histórico).
   */
  openReconciliation(scope: SchedulingAgentScope): Promise<boolean> {
    return openReconciliation(this.deps, scope);
  }
}

async function openReconciliation(deps: SchedulingEventDeps, scope: SchedulingAgentScope) {
  const resolved = await resolveAgentScope(deps.resolver, scope);
  if (!resolved.ok) return false;
  const { binding, destinationPhoneE164: phoneE164 } = resolved;
  const organizationId = binding.organizationId;
  const leadId = await leadIdForPhone(deps.db, { organizationId, phoneE164 });
  await deps.db.transaction((tx) =>
    ensureReconciliation(tx, binding, { phoneE164, leadId, now: deps.clock() }),
  );
  return true;
}
