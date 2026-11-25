import {
  DrizzleLeadRepository,
  DrizzleMeetingBookingService,
  DrizzleMeetingCancellationService,
  DrizzleMeetingQueries,
  DrizzleSchedulingAvailabilityRepository,
  DrizzleSchedulingCalendarRepository,
  DrizzleSchedulingSlotRepository,
  type DatabaseInstance,
} from '@voice-agent/database';

/** E1 (DEC-074) — repositórios de leads, agendas e reuniões usados pela API. */
export interface SchedulingApiDependencies {
  readonly leads: DrizzleLeadRepository;
  readonly calendars: DrizzleSchedulingCalendarRepository;
  readonly availability: DrizzleSchedulingAvailabilityRepository;
  readonly slots: DrizzleSchedulingSlotRepository;
  readonly booking: DrizzleMeetingBookingService;
  readonly cancellation: DrizzleMeetingCancellationService;
  readonly meetings: DrizzleMeetingQueries;
  /** Relógio injetável (testes determinísticos); produção usa `new Date()`. */
  readonly now: () => Date;
}

export function createSchedulingDependencies(
  db: DatabaseInstance,
  now: () => Date = () => new Date(),
): SchedulingApiDependencies {
  return {
    leads: new DrizzleLeadRepository(db),
    calendars: new DrizzleSchedulingCalendarRepository(db),
    availability: new DrizzleSchedulingAvailabilityRepository(db),
    slots: new DrizzleSchedulingSlotRepository(db),
    booking: new DrizzleMeetingBookingService(db),
    cancellation: new DrizzleMeetingCancellationService(db),
    meetings: new DrizzleMeetingQueries(db),
    now,
  };
}
