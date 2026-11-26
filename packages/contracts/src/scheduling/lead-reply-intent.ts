import { isIndependentClause, isOptOutMention, isOptOutRequest } from './lead-reply-opt-out.js';
import {
  type ReplySentence,
  prepareReply,
  splitSentences,
  toMatchForm,
  wholePattern,
  wordsPattern,
} from './lead-reply-text.js';

/**
 * E2 PR 1 (DEC-075) — classificação CONSERVADORA, determinística e offline da
 * resposta FINAL do interlocutor, em português do Brasil, feita pelo servidor
 * ANTES de qualquer roteamento ao modelo. Nunca usa texto do modelo.
 *
 * Regras (auditorias A1/A2):
 * - opt-out é decidido pela FALA INTEIRA: há ao menos um pedido atual e TODA
 *   outra cláusula é trecho independente conhecido (cortesia, lista fechada
 *   ou forma inteira de aceite/recusa). Qualquer cláusula desconhecida, em
 *   qualquer posição, leva a esclarecimento; nenhuma é ignorada;
 * - a comparação preserva acentos: só a omissão de acento de uma forma
 *   permitida é aceita (`pôde marcar` nunca é `pode marcar`);
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

/** Forma de comparação (minúsculas, NFC, com acentos, sem pontuação), após NFKC. */
export function normalizeLeadReply(text: string): string {
  return toMatchForm(text.normalize('NFKC'));
}

const AFFIRM = wholePattern(
  (
    'sim|sim pode|pode|pode sim|pode marcar|pode agendar|confirmo|confirmado|isso|isso mesmo|' +
    'exatamente|correto|certo|fechado|combinado|pode ser|ok|tá bom|está bom|perfeito|beleza|' +
    'sim por favor|sim confirmo|sim isso mesmo|sim pode marcar|pode confirmar'
  ).split('|'),
);

const NEGATE = wholePattern(
  (
    'não|não obrigado|não obrigada|não quero|não posso|não dá|nenhum|nenhuma|nenhum desses|' +
    'nenhuma dessas|não pode ser|não serve|não não'
  ).split('|'),
);

/**
 * Ordinais; a omissão do acento em `três` é a variante declarada. `Map` (e não
 * objeto) para que chaves do protótipo, como `constructor`, nunca virem escolha.
 */
const ORDINALS: ReadonlyMap<string, 1 | 2 | 3> = new Map<string, 1 | 2 | 3>([
  ['primeira', 1],
  ['primeiro', 1],
  ['1', 1],
  ['um', 1],
  ['uma', 1],
  ['segunda', 2],
  ['segundo', 2],
  ['2', 2],
  ['dois', 2],
  ['duas', 2],
  ['terceira', 3],
  ['terceiro', 3],
  ['3', 3],
  ['três', 3],
  ['tres', 3],
]);

const SELECT_PATTERN = wholePattern([
  '(?:(?:quero|prefiro|pode ser|fico com|vou de|escolho) )?(?:a |o )?(?:opção |número |horário )?(\\S+)(?: opção| horário)?',
]);

const TIME_CHANGE = wordsPattern(
  'outro horário|outro dia|outra data|outra hora|mais tarde|mais cedo|outra semana|outro período',
);

function selection(normalized: string): LeadReplyIntent | null {
  const match = SELECT_PATTERN.exec(normalized);
  const ordinal = match ? ORDINALS.get(match[1]!) : undefined;
  return ordinal ? { kind: 'SELECT', ordinal } : null;
}

function knownForm(normalized: string): LeadReplyIntent | null {
  if (AFFIRM.test(normalized)) return { kind: 'AFFIRM' };
  if (NEGATE.test(normalized)) return { kind: 'NEGATE' };
  return selection(normalized);
}

/**
 * Cláusula que acompanha o pedido sem impedi-lo (5ª auditoria, N1). A posição
 * importa: aceite, recusa ou escolha inteiros só ANTES do primeiro pedido e
 * sem contraste ("Sim, pode marcar, mas depois não me liguem mais"). Depois
 * do pedido, ou aberta por contraste, só cortesia e trechos independentes
 * permitidos — "Me descadastre, só que não." é retratação, não acompanhante.
 */
function isCompanion(clause: ReplySentence, beforeRequest: boolean): boolean {
  if (isIndependentClause(clause, beforeRequest)) return true;
  if (!beforeRequest || clause.contrast || clause.quoted || clause.question) return false;
  return knownForm(clause.normalized) !== null;
}

/** Opt-out só se há pedido atual e NENHUMA cláusula desconhecida na fala inteira. */
function isOptOutUtterance(clauses: readonly ReplySentence[]): boolean {
  const first = clauses.findIndex(isOptOutRequest);
  if (first < 0) return false;
  return clauses.every(
    (clause, index) => isOptOutRequest(clause) || isCompanion(clause, index < first),
  );
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
  if (isOptOutUtterance(clauses)) return { kind: 'OPT_OUT' };
  if (clauses.some(isOptOutMention)) return { kind: 'AMBIGUOUS' };
  const form = prepared.plainSurface ? knownForm(normalized) : null;
  if (form) return form;
  return TIME_CHANGE.test(normalized) ? { kind: 'TIME_CHANGE' } : { kind: 'AMBIGUOUS' };
}
