import { and, eq, gte, sql } from 'drizzle-orm';
import type {
  OutboundBudgetLedger,
  OutboundBudgetReservation,
  PlatformGlobalBudgetLedger,
} from '@voice-agent/contracts';
import { getStartOfDayInTimezone } from '@voice-agent/contracts';
import { outboundBudgetLedgers } from '../schema/outbound-budget-ledgers.js';
import { outboundBudgetReservations } from '../schema/outbound-budget-reservations.js';
import { platformGlobalBudgetLedgers } from '../schema/platform-global-budget-ledger.js';
import type { DatabaseExecutor } from './database-executor.js';
import {
  mapOutboundBudgetLedger,
  mapOutboundBudgetReservation,
  mapPlatformGlobalBudgetLedger,
} from './outbound-budget-mapping.js';

export const GLOBAL_BUDGET_LEDGER_ID = 'platform_global';

export function getStartOfUtcDay(date: Date = new Date()): Date {
  return getStartOfDayInTimezone(date, 'UTC');
}

export async function findGlobalBudgetLedger(
  executor: DatabaseExecutor,
): Promise<PlatformGlobalBudgetLedger | null> {
  const [row] = await executor
    .select()
    .from(platformGlobalBudgetLedgers)
    .where(eq(platformGlobalBudgetLedgers.id, GLOBAL_BUDGET_LEDGER_ID))
    .limit(1);

  return row ? mapPlatformGlobalBudgetLedger(row) : null;
}

export async function findBudgetLedgerByOrganization(
  executor: DatabaseExecutor,
  organizationId: string,
): Promise<OutboundBudgetLedger | null> {
  const [row] = await executor
    .select()
    .from(outboundBudgetLedgers)
    .where(eq(outboundBudgetLedgers.organizationId, organizationId))
    .limit(1);

  return row ? mapOutboundBudgetLedger(row) : null;
}

export async function findReservationByAttemptId(
  executor: DatabaseExecutor,
  organizationId: string,
  attemptId: string,
): Promise<OutboundBudgetReservation | null> {
  const [row] = await executor
    .select()
    .from(outboundBudgetReservations)
    .where(
      and(
        eq(outboundBudgetReservations.organizationId, organizationId),
        eq(outboundBudgetReservations.attemptId, attemptId),
      ),
    )
    .limit(1);

  return row ? mapOutboundBudgetReservation(row) : null;
}

export async function findReservationByIdempotencyKey(
  executor: DatabaseExecutor,
  organizationId: string,
  idempotencyKey: string,
): Promise<OutboundBudgetReservation | null> {
  const [row] = await executor
    .select()
    .from(outboundBudgetReservations)
    .where(
      and(
        eq(outboundBudgetReservations.organizationId, organizationId),
        eq(outboundBudgetReservations.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);

  return row ? mapOutboundBudgetReservation(row) : null;
}

export async function countGlobalActiveConcurrentReservations(
  executor: DatabaseExecutor,
): Promise<number> {
  const [result] = await executor
    .select({ count: sql<number>`count(*)::int` })
    .from(outboundBudgetReservations)
    .where(eq(outboundBudgetReservations.status, 'RESERVED'));

  return result?.count ?? 0;
}

export async function countActiveConcurrentReservations(
  executor: DatabaseExecutor,
  organizationId: string,
): Promise<number> {
  const [result] = await executor
    .select({ count: sql<number>`count(*)::int` })
    .from(outboundBudgetReservations)
    .where(
      and(
        eq(outboundBudgetReservations.organizationId, organizationId),
        eq(outboundBudgetReservations.status, 'RESERVED'),
      ),
    );

  return result?.count ?? 0;
}

export async function countTodayCallAttempts(
  executor: DatabaseExecutor,
  organizationId: string,
  since: Date = getStartOfUtcDay(),
): Promise<number> {
  const [result] = await executor
    .select({ count: sql<number>`count(*)::int` })
    .from(outboundBudgetReservations)
    .where(
      and(
        eq(outboundBudgetReservations.organizationId, organizationId),
        gte(outboundBudgetReservations.createdAt, since),
      ),
    );

  return result?.count ?? 0;
}
