/** Turno de fala do interlocutor, identificado pelo TRANSPORTE (nunca pelo modelo). */
export interface LeadTurn {
  readonly turnId: string;
}

/**
 * Auditoria consolidada (A3/A6): o que o agente quer FALAR. Toda saída —
 * inclusive texto livre do modelo — é autorizada pelo servidor no momento da
 * emissão, a partir do estado atual. Anúncio de reserva só com a reunião
 * conferida AGORA (o texto vem do servidor, não do modelo).
 */
export type AgentOutput =
  | { readonly kind: 'MODEL_TEXT' }
  | { readonly kind: 'PRESENTATION'; readonly listRevision: number }
  | { readonly kind: 'READBACK'; readonly offerId: string }
  | { readonly kind: 'OPT_OUT_QUESTION' }
  | { readonly kind: 'OPT_OUT_CONFIRMATION' }
  | { readonly kind: 'CLARIFICATION' }
  | { readonly kind: 'NOTICE' }
  /** Sem id do transporte/modelo: o servidor usa a reunião persistida e a confere agora. */
  | { readonly kind: 'BOOKING_RESULT' };

export type OutputDecision =
  | { readonly allowed: true; readonly speech: string | null }
  | { readonly allowed: false; readonly reason: string };
