import { isOptOutMention, isOptOutRequest } from './lead-reply-opt-out.js';
import { prepareReply, splitSentences, toMatchForm } from './lead-reply-text.js';

/**
 * E2 PR 1 (DEC-075) — classificação CONSERVADORA, determinística e offline da
 * resposta FINAL do interlocutor, em português do Brasil, feita pelo servidor
 * ANTES de qualquer roteamento ao modelo. Nunca usa texto do modelo.
 *
 * Regras (auditoria A1/A2):
 * - opt-out é avaliado POR CLÁUSULA: um pedido explícito numa cláusula vale
 *   mesmo com negações em outras; negação, citação ou pergunta informativa
 *   na MESMA cláusula não é pedido (vira `AMBIGUOUS`);
 * - aceite, recusa e escolha só quando a frase INTEIRA é uma forma conhecida,
 *   SEM interrogação e SEM aspas: "Pode marcar?" e “sim” nunca são aceite;
 * - qualquer conteúdo extra ("sim, mas não marque") vira `AMBIGUOUS`;
 * - ambiguidade sempre leva a pedido de esclarecimento, nunca a reserva.
 * Não promete compreensão semântica: é uma regra testável para o piloto.
 */
export type LeadReplyIntent =
  | { readonly kind: 'OPT_OUT' }
  | { readonly kind: 'AFFIRM' }
  | { readonly kind: 'NEGATE' }
  | { readonly kind: 'SELECT'; readonly ordinal: 1 | 2 | 3 }
  | { readonly kind: 'TIME_CHANGE' }
  | { readonly kind: 'AMBIGUOUS' }
  | { readonly kind: 'SILENCE' };

/** Forma de comparação (minúsculas, sem acentos e sem pontuação), após NFKC. */
export function normalizeLeadReply(text: string): string {
  return toMatchForm(text.normalize('NFKC'));
}

const AFFIRM = new Set(
  (
    'sim|sim pode|pode|pode sim|pode marcar|pode agendar|confirmo|confirmado|isso|isso mesmo|' +
    'exatamente|correto|certo|fechado|combinado|pode ser|ok|ta bom|esta bom|perfeito|beleza|' +
    'sim por favor|sim confirmo|sim isso mesmo|sim pode marcar|pode confirmar'
  ).split('|'),
);

const NEGATE = new Set(
  (
    'nao|nao obrigado|nao obrigada|nao quero|nao posso|nao da|nenhum|nenhuma|nenhum desses|' +
    'nenhuma dessas|nao pode ser|nao serve|nao nao'
  ).split('|'),
);

const ORDINALS: Readonly<Record<string, 1 | 2 | 3>> = {
  primeira: 1,
  primeiro: 1,
  '1': 1,
  um: 1,
  uma: 1,
  segunda: 2,
  segundo: 2,
  '2': 2,
  dois: 2,
  duas: 2,
  terceira: 3,
  terceiro: 3,
  '3': 3,
  tres: 3,
};

const SELECT_PATTERN =
  /^(?:(?:quero|prefiro|pode ser|fico com|vou de|escolho) )?(?:a |o )?(?:opcao |numero |horario )?([a-z0-9]+)(?: opcao| horario)?$/;

const TIME_CHANGE =
  /\b(outro horario|outro dia|outra data|outra hora|mais tarde|mais cedo|outra semana|outro periodo)\b/;

function selection(normalized: string): LeadReplyIntent | null {
  const match = SELECT_PATTERN.exec(normalized);
  const ordinal = match ? ORDINALS[match[1]!] : undefined;
  return ordinal ? { kind: 'SELECT', ordinal } : null;
}

function knownForm(normalized: string): LeadReplyIntent | null {
  if (AFFIRM.has(normalized)) return { kind: 'AFFIRM' };
  if (NEGATE.has(normalized)) return { kind: 'NEGATE' };
  return selection(normalized);
}

/**
 * Aceite, recusa e escolha: só quando o texto INTEIRO passa na gramática de
 * permissão (`prepareReply`) e, reduzido, é uma forma conhecida (A1).
 */
export function classifyLeadReply(text: string): LeadReplyIntent {
  const prepared = prepareReply(text);
  const normalized = toMatchForm(prepared.text);
  if (normalized.length === 0) return { kind: 'SILENCE' };
  const clauses = splitSentences(prepared.text);
  if (clauses.some(isOptOutRequest)) return { kind: 'OPT_OUT' };
  if (clauses.some(isOptOutMention)) return { kind: 'AMBIGUOUS' };
  const form = prepared.plainSurface ? knownForm(normalized) : null;
  if (form) return form;
  return TIME_CHANGE.test(normalized) ? { kind: 'TIME_CHANGE' } : { kind: 'AMBIGUOUS' };
}
