import type {
  ConfirmOfferResult,
  FindSlotsArguments,
  FindSlotsResult,
  SchedulingAgentPort,
  SchedulingAgentScope,
  SchedulingProtocolView,
  SchedulingSpeechEvent,
} from '@voice-agent/contracts';
import { findSlotsArgumentsSchema } from '@voice-agent/contracts';
import type { DatabaseInstance } from '../client/connection.js';
import { DrizzleMeetingBookingService } from './meeting-booking-service.js';
import { confirmOffer, type BookingDeps } from './scheduling-agent-booking.js';
import {
  recordLeadSpeechStarted,
  recordLeadUtterance,
  recordSpeech,
} from './scheduling-agent-events.js';
import { findSlots } from './scheduling-agent-offers.js';
import { DrizzleSchedulingSessionContextResolver } from './scheduling-session-context-resolver.js';
import { DrizzleSchedulingSlotRepository } from './scheduling-slot-repository.js';

export interface SchedulingAgentServiceOptions {
  readonly clock?: () => Date;
  readonly testHooks?: BookingDeps['testHooks'];
}

/**
 * E2 PR 2 (DEC-075) — serviço canônico do agendamento pelo agente, OFFLINE:
 * nenhuma composição de produção, rota ou telefonia o registra. Reutiliza a
 * E1 (`offerSlots`, `bookOfferedSlot` com ganchos na mesma transação) e o
 * protocolo puro da PR 1 (`advanceBookingProtocol`), persistido em
 * `scheduling_protocol_states`.
 */
export class DrizzleSchedulingAgentService implements SchedulingAgentPort {
  private readonly deps: BookingDeps & { readonly slots: DrizzleSchedulingSlotRepository };

  constructor(db: DatabaseInstance, options: SchedulingAgentServiceOptions = {}) {
    const clock = options.clock ?? (() => new Date());
    this.deps = {
      db,
      clock,
      resolver: new DrizzleSchedulingSessionContextResolver(db),
      slots: new DrizzleSchedulingSlotRepository(db),
      bookings: new DrizzleMeetingBookingService(db, clock),
      testHooks: options.testHooks,
    };
  }

  findSlots(scope: SchedulingAgentScope, args: FindSlotsArguments): Promise<FindSlotsResult> {
    // Defesa em profundidade: o motor já valida, mas a porta não confia no chamador.
    return findSlots(this.deps, scope, findSlotsArgumentsSchema.parse(args));
  }

  confirmOffer(scope: SchedulingAgentScope): Promise<ConfirmOfferResult> {
    return confirmOffer(this.deps, scope);
  }

  recordSpeech(
    scope: SchedulingAgentScope,
    event: SchedulingSpeechEvent,
  ): Promise<SchedulingProtocolView> {
    return recordSpeech(this.deps, scope, event);
  }

  recordLeadSpeechStarted(scope: SchedulingAgentScope): Promise<SchedulingProtocolView> {
    return recordLeadSpeechStarted(this.deps, scope);
  }

  recordLeadUtterance(scope: SchedulingAgentScope, text: string): Promise<SchedulingProtocolView> {
    return recordLeadUtterance(this.deps, scope, text);
  }
}
