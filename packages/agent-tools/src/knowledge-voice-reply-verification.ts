import {
  KNOWLEDGE_VOICE_REPLY_MAX_SPOKEN_FACTS,
  type KnowledgeAgentProjection,
  type KnowledgeVoiceReply,
} from '@voice-agent/contracts';
import { hasAmbiguousNumber, hasCompatibleUnit } from './knowledge-voice-value.js';
import { contestedMaterialKeys, isContestedMaterial } from './knowledge-voice-reply-eligibility.js';
import { renderSentences, type VoiceReplySelection } from './knowledge-voice-reply-render.js';

/**
 * Verificação PURA da resposta contra a projeção (B2c, DEC-072). Não confia no
 * texto produzido: remonta as frases a partir da seleção e exige igualdade
 * exata, além de coerência entre índices, contagem, citação e aspectos.
 * Qualquer falha ⇒ `REPLY_INVALID` na ferramenta (nunca v1).
 */
export interface VoiceReplyVerificationInput {
  readonly projection: KnowledgeAgentProjection;
  readonly reply: KnowledgeVoiceReply;
  readonly selection: VoiceReplySelection;
}

type Check = (input: VoiceReplyVerificationInput) => boolean;

const sameList = <T>(a: readonly T[], b: readonly T[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/** Índices inteiros de 0 até o último fato da projeção, sem repetição, no máximo 2. */
const validIndexes: Check = ({ projection, selection }) => {
  const idx = selection.factIndexes;
  return (
    idx.length <= KNOWLEDGE_VOICE_REPLY_MAX_SPOKEN_FACTS &&
    new Set(idx).size === idx.length &&
    idx.every((i) => Number.isInteger(i) && i >= 0 && i < projection.facts.length)
  );
};

const factsMatchState: Check = ({ reply, selection }) =>
  selection.technical === reply.technical &&
  selection.factIndexes.length > 0 === (reply.technical === 'FACTS') &&
  reply.spokenFactCount === selection.factIndexes.length;

const singleCitation: Check = ({ projection, reply, selection }) => {
  const citations = [...new Set(selection.factIndexes.map((i) => projection.facts[i]!.citationId))];
  return citations.length <= 1 && sameList(reply.spokenCitationIds, citations);
};

const speakableFacts: Check = ({ projection, selection }) => {
  const contested = contestedMaterialKeys(projection.facts);
  return selection.factIndexes.every((i) => {
    const fact = projection.facts[i]!;
    if (fact.subject === null || isContestedMaterial(contested, fact)) return false;
    return hasCompatibleUnit(fact) && !hasAmbiguousNumber(fact);
  });
};

const exactAspects: Check = ({ projection, reply, selection }) =>
  sameList(selection.aspects, projection.aspectsRequiringAuthorizedSource) &&
  reply.authorizedSource === selection.aspects.length > 0;

const remountedText: Check = ({ projection, reply, selection }) =>
  sameList(renderSentences(selection, projection), reply.sentences) &&
  reply.spokenText === reply.sentences.join(' ');

/** Ordem importa: índices válidos antes de qualquer acesso a `facts[i]`. */
const CHECKS: readonly Check[] = [
  validIndexes,
  factsMatchState,
  singleCitation,
  speakableFacts,
  exactAspects,
  remountedText,
];

export function verifyReplyAgainstProjection(input: VoiceReplyVerificationInput): boolean {
  return CHECKS.every((check) => check(input));
}
