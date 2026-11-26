import type { AgentOutput } from '@voice-agent/contracts';

/**
 * Auditoria consolidada da E2 (A6) — mapeia o resultado de uma ferramenta na
 * SAÍDA que o servidor precisa autorizar. O texto de reserva nunca vem do
 * resultado repassado ao modelo: `BOOKING_RESULT` é falado só com o texto que
 * `authorizeOutput` devolve depois de conferir a reunião persistida.
 */

export type SpeechInput =
  | {
      readonly purpose: 'PRESENTATION' | 'READBACK';
      readonly listRevision: number;
      readonly offerId?: string;
    }
  | { readonly purpose: 'OPT_OUT_QUESTION' };

export interface MappedOutput {
  readonly output: AgentOutput;
  readonly speech: string | null;
  readonly transport?: SpeechInput;
}

/** Saídas cujo texto é SEMPRE o do servidor no instante da autorização. */
export const serverWorded = (output: AgentOutput): boolean =>
  output.kind === 'BOOKING_RESULT' || output.kind === 'OPT_OUT_CONFIRMATION';

export function toolOutput(raw: unknown): MappedOutput | null {
  const out = raw as { status?: unknown; listRevision?: unknown; speech?: unknown } | null;
  if (!out) return null;
  const speech = typeof out.speech === 'string' ? out.speech : null;
  if (out.status === 'OFFERED' && typeof out.listRevision === 'number') {
    const listRevision = out.listRevision;
    return {
      output: { kind: 'PRESENTATION', listRevision },
      speech,
      transport: { purpose: 'PRESENTATION', listRevision },
    };
  }
  if (out.status === 'BOOKED') return { output: { kind: 'BOOKING_RESULT' }, speech: null };
  return { output: { kind: 'NOTICE' }, speech };
}
