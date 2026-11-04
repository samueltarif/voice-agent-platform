import { z } from 'zod';
import { callLegRoleSchema, callLegStateSchema, providerLegReferenceSchema } from './call-leg.js';

/**
 * 008-OF5a (S1) — Eventos normalizados de perna (já autenticados e com tenant
 * resolvido no servidor pela tentativa, nunca pelo payload do fornecedor).
 */

/** Código de resposta do transporte (SIP: 100–699), quando existir. */
export const transportResponseCodeSchema = z.number().int().min(100).max(699);

const legEventBase = {
  organizationId: z.string().uuid(),
  attemptId: z.string().uuid(),
  occurredAt: z.string().datetime(),
  /** Sequência por perna, quando o fornecedor a envia; ordena e deduplica. */
  sequence: z.number().int().min(0).nullable(),
};

export const callLegStatusEventSchema = z
  .object({
    type: z.literal('CALL_LEG_STATUS'),
    ...legEventBase,
    role: callLegRoleSchema,
    providerLegReference: providerLegReferenceSchema,
    parentLegReference: providerLegReferenceSchema.nullable(),
    state: callLegStateSchema,
  })
  .strict();
export type CallLegStatusEvent = z.infer<typeof callLegStatusEventSchema>;

/** Resultado da conexão da perna do agente de IA (neutro em relação ao fornecedor). */
export const AI_AGENT_LEG_BRIDGE_STATUSES = [
  'CONNECTED',
  'COMPLETED',
  'FAILED',
  'BUSY',
  'NO_ANSWER',
  'CANCELED',
] as const;

export const aiAgentLegResultEventSchema = z
  .object({
    type: z.literal('AI_AGENT_LEG_RESULT'),
    ...legEventBase,
    providerLegReference: providerLegReferenceSchema.nullable(),
    bridgeStatus: z.enum(AI_AGENT_LEG_BRIDGE_STATUSES),
    transportResponseCode: transportResponseCodeSchema.optional(),
  })
  .strict();
export type AiAgentLegResultEvent = z.infer<typeof aiAgentLegResultEventSchema>;

export const callLegEventSchema = z.discriminatedUnion('type', [
  callLegStatusEventSchema,
  aiAgentLegResultEventSchema,
]);
export type CallLegEvent = z.infer<typeof callLegEventSchema>;
