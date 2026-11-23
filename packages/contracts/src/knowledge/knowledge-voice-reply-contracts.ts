import { z } from 'zod';
import { KNOWLEDGE_AGENT_PROJECTION_MAX_FACTS } from './knowledge-agent-projection-contracts.js';
import { KNOWLEDGE_COMMERCIAL_ASPECTS } from './knowledge-retrieval-contracts.js';

/**
 * B2c (DEC-072) — resposta FALADA montada pela plataforma a partir da projeção
 * sanitizada da B2b. Até 2 frases determinísticas, sem IA. O schema é
 * SINTÁTICO (alfabeto fechado, limites e invariantes internas); a prova de que
 * o texto corresponde aos fatos selecionados é a remontagem feita pela
 * verificação da ferramenta v2, nunca este regex.
 */
export const KNOWLEDGE_VOICE_REPLY_MAX_CHARS = 300;
export const KNOWLEDGE_VOICE_REPLY_MAX_SENTENCES = 2;
export const KNOWLEDGE_VOICE_REPLY_MAX_SPOKEN_FACTS = 2;
export const KNOWLEDGE_VOICE_REPLY_MAX_ASPECTS = KNOWLEDGE_COMMERCIAL_ASPECTS.length;

export const KNOWLEDGE_VOICE_TECHNICAL_STATES = [
  'FACTS',
  'CONFLICT',
  'PARTIAL',
  'NOT_SPEAKABLE',
  'NO_EVIDENCE',
] as const;
export type KnowledgeVoiceTechnicalState = (typeof KNOWLEDGE_VOICE_TECHNICAL_STATES)[number];

/**
 * Alfabeto FECHADO (lista explícita, sem faixas Latin-1): letras ASCII, letras
 * acentuadas do pt-BR usadas pelo vocabulário, dígitos, espaço, vírgula e
 * barra. Nenhum símbolo de unidade ou moeda: unidades são faladas por extenso.
 * O único ponto é o final da frase.
 */
export const KNOWLEDGE_VOICE_UPPER_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÁÀÂÃÉÈÊÍÓÔÕÚÜÇ';
export const KNOWLEDGE_VOICE_ALPHABET = `${KNOWLEDGE_VOICE_UPPER_LETTERS}abcdefghijklmnopqrstuvwxyzáàâãéèêíóôõúüç0123456789 ,/`;

const inClass = (chars: string) => chars.replace(/[\\\]^-]/g, '\\$&');
const VOICE_SENTENCE = new RegExp(
  `^[${inClass(KNOWLEDGE_VOICE_UPPER_LETTERS)}][${inClass(KNOWLEDGE_VOICE_ALPHABET)}]*\\.$`,
);

/** Final exclusivo da frase de fonte autorizada (frase C). */
export const KNOWLEDGE_VOICE_AUTHORIZED_SOURCE_ENDING = ' de confirmação da equipe da empresa.';

const isAuthorizedSourceSentence = (s: string) =>
  s.endsWith(KNOWLEDGE_VOICE_AUTHORIZED_SOURCE_ENDING);

export const knowledgeVoiceSentenceSchema = z
  .string()
  .min(2)
  .max(KNOWLEDGE_VOICE_REPLY_MAX_CHARS)
  .regex(VOICE_SENTENCE)
  // Vírgula: separador (", ") ou decimal entre dígitos ("0,5"); nada de espaço duplo.
  .refine(
    (s) => !/ {2}| \.| ,|,(?![ 0-9])|[^0-9],[0-9]/.test(s),
    'Spacing outside the voice grammar',
  );

const counter = z.number().int().min(0).max(KNOWLEDGE_AGENT_PROJECTION_MAX_FACTS);

export const knowledgeVoiceReplySuppressedSchema = z
  .object({
    conflictingFacts: counter,
    ambiguousAssociation: counter,
    incompatibleUnit: counter,
    ambiguousNumber: counter,
    duplicateFacts: counter,
    overBudget: z.number().int().min(0).max(1),
  })
  .strict();
export type KnowledgeVoiceReplySuppressed = z.infer<typeof knowledgeVoiceReplySuppressedSchema>;

const replyShape = z
  .object({
    technical: z.enum(KNOWLEDGE_VOICE_TECHNICAL_STATES),
    authorizedSource: z.boolean(),
    sentences: z
      .array(knowledgeVoiceSentenceSchema)
      .min(1)
      .max(KNOWLEDGE_VOICE_REPLY_MAX_SENTENCES),
    spokenText: z.string().min(1).max(KNOWLEDGE_VOICE_REPLY_MAX_CHARS),
    spokenCitationIds: z.array(z.string().regex(/^[0-9a-f-]{36}:[0-9a-f-]{36}:\d{1,6}$/)).max(1),
    spokenFactCount: z.number().int().min(0).max(KNOWLEDGE_VOICE_REPLY_MAX_SPOKEN_FACTS),
    suppressed: knowledgeVoiceReplySuppressedSchema,
  })
  .strict();
type ReplyShape = z.infer<typeof replyShape>;

/** Frases esperadas pela matriz de precedência (estado técnico × frase C). */
function expectedSentenceCount(r: ReplyShape): number {
  const technicalSpoken = r.technical === 'FACTS' || r.technical === 'CONFLICT';
  return technicalSpoken && r.authorizedSource ? 2 : 1;
}

const INVARIANTS: ReadonlyArray<readonly [string, (r: ReplyShape) => boolean]> = [
  ['spokenText', (r) => r.spokenText === r.sentences.join(' ')],
  ['factCount', (r) => r.spokenFactCount > 0 === (r.technical === 'FACTS')],
  ['citations', (r) => r.spokenCitationIds.length === (r.technical === 'FACTS' ? 1 : 0)],
  [
    'authorizedSource',
    (r) => r.authorizedSource === isAuthorizedSourceSentence(r.sentences.at(-1)!),
  ],
  ['onlyLastIsC', (r) => r.sentences.slice(0, -1).every((s) => !isAuthorizedSourceSentence(s))],
  ['sentenceCount', (r) => r.sentences.length === expectedSentenceCount(r)],
  ['noLink', (r) => !/http|www/i.test(r.spokenText)],
];

export const knowledgeVoiceReplySchema = replyShape.superRefine((reply, ctx) => {
  for (const [name, holds] of INVARIANTS) {
    if (!holds(reply)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `invariant:${name}` });
  }
});
export type KnowledgeVoiceReply = z.infer<typeof knowledgeVoiceReplySchema>;
