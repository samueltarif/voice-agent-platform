import { isOptOutMention } from './lead-reply-opt-out.js';
import { prepareReply, splitSentences } from './lead-reply-text.js';

/**
 * E2 PR 2 (DEC-075, D2) — POSSÍVEL pedido de opt-out: alguma cláusula da fala
 * (inclusive citada) menciona uma forma de opt-out, mas o classificador não a
 * reconheceu como pedido atual (`OPT_OUT`). Não altera o classificador
 * aprovado; só reaproveita as mesmas peças. Usado para BLOQUEAR o avanço
 * comercial e a reserva enquanto o pedido não é esclarecido (requisito da
 * PR 3 registrado no desenho §7; a pergunta de esclarecimento operacional é
 * da PR 3).
 */
export function mentionsOptOut(text: string): boolean {
  const prepared = prepareReply(text);
  return splitSentences(prepared.text).some(isOptOutMention);
}
