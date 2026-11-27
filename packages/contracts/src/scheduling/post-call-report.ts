import { z } from 'zod';

/**
 * E2 simplificada (DEC-077) — relatório PÓS-CHAMADA normalizado, neutro de
 * fornecedor. O adaptador do provedor (fora deste pacote) traduz o relatório
 * real (E2-V: POST com histórico por interlocutor, chamadas de função,
 * identificador da sessão, metadados, duração, status e custos) para esta
 * forma. Nada aqui identifica o tenant: a resolução é sempre do servidor.
 *
 * `ordering`:
 * - `TIMELINE`: `entries` estão na ordem real da conversa, com as chamadas
 *   de ferramenta intercaladas onde ocorreram;
 * - `UNKNOWN`: o adaptador não conseguiu provar a ordem — nenhuma decisão que
 *   dependa de ordem é tomada (revisão humana).
 *
 * O histórico é evidência TEXTUAL de STT/LLM: não prova reprodução do áudio
 * nem compreensão do interlocutor (limitação registrada no desenho).
 */

export const POST_CALL_END_REASONS = [
  'COMPLETED',
  'LEAD_HANGUP',
  'AGENT_ENDED',
  'INACTIVITY_TIMEOUT',
  'MAX_DURATION',
  /** Timeout genérico: NUNCA é desinteresse nem, por si só, inatividade. */
  'TIMEOUT_UNSPECIFIED',
  'ERROR',
  'UNKNOWN',
] as const;
export type PostCallEndReason = (typeof POST_CALL_END_REASONS)[number];

export const POST_CALL_MAX_ENTRIES = 500;
export const POST_CALL_MAX_TEXT = 4000;

const text = z.string().max(POST_CALL_MAX_TEXT);

export const postCallEntrySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('LEAD'), text }).strict(),
  z.object({ kind: z.literal('AGENT'), text }).strict(),
  z
    .object({
      kind: z.literal('TOOL_CALL'),
      toolName: z.string().trim().min(1).max(64),
      arguments: z.unknown(),
    })
    .strict(),
]);
export type PostCallEntry = z.infer<typeof postCallEntrySchema>;

export const postCallReportSchema = z
  .object({
    ordering: z.enum(['TIMELINE', 'UNKNOWN']),
    entries: z.array(postCallEntrySchema).max(POST_CALL_MAX_ENTRIES),
    endReason: z.enum(POST_CALL_END_REASONS),
    durationSeconds: z.number().nonnegative().max(86_400).nullable(),
  })
  .strict();
export type PostCallReport = z.infer<typeof postCallReportSchema>;
