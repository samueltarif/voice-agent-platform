/**
 * E2 PR 2 (DEC-075, A5) — guarda do caminho de saída do MODELO, inclusive em
 * streaming: o texto é retido até o fim de cada frase e só então liberado.
 * Enquanto a reserva não estiver confirmada pelo servidor (`isBooked()` lido
 * no instante da liberação), toda frase que fale de marcar, agendar, reservar
 * ou confirmar é descartada — o anúncio de sucesso é a fala determinística do
 * servidor (`renderBookedSpeech`), nunca o texto do modelo.
 *
 * Perguntas e substantivos ("posso marcar?", "agendamento") passam: a
 * releitura e a confirmação continuam sendo falas do servidor.
 */

const SENTENCE_END = /[.!?…\n]/u;
/**
 * Formas de AFIRMAÇÃO de reserva (passado, particípio, 1ª pessoa do plural):
 * "agendei", "agendada", "marquei", "marcado", "reservamos", "confirmado"…
 * e "a reunião está/ficou/foi…". Substantivos e perguntas ("agendamento",
 * "posso marcar?") não são afirmação (E2 PR 3: a versão anterior descartava
 * até "vocês usam algum sistema de agendamento?").
 */
const SCHEDULING_CLAIM =
  /\b(?:agend|marc|marq|reserv|confirm)(?:ei|ad[oa]s?|amos|ou|uei)\b|reuni[aã]o\s+(?:est[aá]|ficou|foi)/u;

export function isBookingClaim(sentence: string): boolean {
  return SCHEDULING_CLAIM.test(sentence.normalize('NFC').toLowerCase());
}

export interface BookingClaimFilter {
  /** Recebe um pedaço do stream; devolve o texto que pode ser falado agora. */
  push(delta: string): string;
  /** Fim do stream: decide o resto retido. */
  flush(): string;
  /** Frases descartadas até agora (para métrica/teste; sem conteúdo). */
  readonly dropped: number;
}

export function createBookingClaimFilter(isBooked: () => boolean): BookingClaimFilter {
  let pending = '';
  let dropped = 0;
  const release = (sentence: string): string => {
    if (sentence.trim().length === 0) return sentence;
    if (!isBooked() && isBookingClaim(sentence)) {
      dropped += 1;
      return '';
    }
    return sentence;
  };
  const drain = (): string => {
    let out = '';
    let match = SENTENCE_END.exec(pending);
    while (match) {
      const end = match.index + match[0].length;
      out += release(pending.slice(0, end));
      pending = pending.slice(end);
      match = SENTENCE_END.exec(pending);
    }
    return out;
  };
  return {
    push(delta: string) {
      pending += delta;
      return drain();
    },
    flush() {
      const rest = release(pending);
      pending = '';
      return rest;
    },
    get dropped() {
      return dropped;
    },
  };
}
