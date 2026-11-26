/**
 * E2 PR 1 (DEC-075) — classificação CONSERVADORA, determinística e offline da
 * resposta FINAL do interlocutor, em português do Brasil, feita pelo servidor
 * ANTES de qualquer roteamento ao modelo. Nunca usa texto do modelo.
 *
 * Regras:
 * - opt-out só por pedido inequívoco (lista fechada de padrões); um pedido
 *   negado ("não precisa tirar meu número") vira `AMBIGUOUS`;
 * - aceite, recusa e escolha só quando a frase INTEIRA é uma forma conhecida;
 *   qualquer conteúdo extra ("sim, mas na segunda") vira `AMBIGUOUS`;
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

export function normalizeLeadReply(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const OPT_OUT_PATTERNS: readonly RegExp[] = [
  /\bnao (me )?(ligue|liguem|ligam|liga|ligar) mais\b/,
  /\bpar[ae]m? de (me )?ligar\b/,
  /\b(tira|tire|tirar|remove|remova|remover|exclui|exclua|excluir|apaga|apague|apagar) (o )?meu (numero|telefone|contato)\b/,
  /\bnao quero (mais )?receber (ligacao|ligacoes|chamada|chamadas)\b/,
  /\bdescadastr/,
  /\bme (tira|tire|tirar|remove|remova|remover|exclui|exclua|excluir) da (sua |de |dessa |desta )?lista\b/,
];

/** Negação do próprio pedido: não é opt-out inequívoco. */
const NEGATED_REQUEST = /\bnao (precisa|e para|e pra|quero que|precisam)\b/;

const AFFIRM = new Set([
  'sim',
  'sim pode',
  'pode',
  'pode sim',
  'pode marcar',
  'pode agendar',
  'confirmo',
  'confirmado',
  'isso',
  'isso mesmo',
  'exatamente',
  'correto',
  'certo',
  'fechado',
  'combinado',
  'pode ser',
  'ok',
  'ta bom',
  'esta bom',
  'perfeito',
  'beleza',
  'sim por favor',
  'sim confirmo',
  'sim isso mesmo',
  'sim pode marcar',
  'pode confirmar',
]);

const NEGATE = new Set([
  'nao',
  'nao obrigado',
  'nao obrigada',
  'nao quero',
  'nao posso',
  'nao da',
  'nenhum',
  'nenhuma',
  'nenhum desses',
  'nenhuma dessas',
  'nao pode ser',
  'nao serve',
  'nao nao',
]);

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

function wholeForm(normalized: string): LeadReplyIntent | null {
  if (AFFIRM.has(normalized)) return { kind: 'AFFIRM' };
  if (NEGATE.has(normalized)) return { kind: 'NEGATE' };
  return selection(normalized);
}

export function classifyLeadReply(text: string): LeadReplyIntent {
  const normalized = normalizeLeadReply(text);
  if (normalized.length === 0) return { kind: 'SILENCE' };
  if (OPT_OUT_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return NEGATED_REQUEST.test(normalized) ? { kind: 'AMBIGUOUS' } : { kind: 'OPT_OUT' };
  }
  const exact = wholeForm(normalized);
  if (exact) return exact;
  return TIME_CHANGE.test(normalized) ? { kind: 'TIME_CHANGE' } : { kind: 'AMBIGUOUS' };
}
