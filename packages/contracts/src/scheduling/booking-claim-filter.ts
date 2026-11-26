/**
 * E2 PR 2 (DEC-075, A5) — guarda do caminho de saída do MODELO, inclusive em
 * streaming: o texto é retido até o fim de cada frase e só então liberado.
 *
 * Auditoria consolidada (A6): o filtro NUNCA é destravado (não há mais o
 * booleano "reservado"). É só defesa adicional — a autoridade é
 * `authorizeOutput` (texto livre só fora das fases transacionais; anúncio de
 * reserva só como fala do servidor ligada à reunião conferida). Regra
 * estrutural, não lista de palavras: o modelo nunca AFIRMA nada sobre agenda,
 * horários, reunião ou reserva — pode só PERGUNTAR ("posso marcar?").
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

/** Domínio da agenda: afirmações sobre ele são exclusivas do servidor. */
const SCHEDULING_TOPIC =
  /\b(?:agenda|hor[aá]ri|reuni|agend|marc|marq|reserv|confirm|disponi|calend)/u;

export function isBookingClaim(sentence: string): boolean {
  const text = sentence.normalize('NFC').toLowerCase().trim();
  if (text.endsWith('?')) return false;
  return SCHEDULING_CLAIM.test(text) || SCHEDULING_TOPIC.test(text);
}

export interface BookingClaimFilter {
  /** Recebe um pedaço do stream; devolve o texto que pode ser falado agora. */
  push(delta: string): string;
  /** Fim do stream: decide o resto retido. */
  flush(): string;
  /** Frases descartadas até agora (para métrica/teste; sem conteúdo). */
  readonly dropped: number;
}

export function createBookingClaimFilter(): BookingClaimFilter {
  let pending = '';
  let dropped = 0;
  const release = (sentence: string): string => {
    if (sentence.trim().length === 0) return sentence;
    if (isBookingClaim(sentence)) {
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
