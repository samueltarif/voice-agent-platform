import {
  KNOWLEDGE_AGENT_PROJECTION_MAX_FACTS,
  KNOWLEDGE_VOICE_REPLY_MAX_CHARS,
  KNOWLEDGE_VOICE_REPLY_MAX_SPOKEN_FACTS,
  type KnowledgeAgentProjection,
  type KnowledgeVoiceReply,
  type KnowledgeVoiceTechnicalState,
} from '@voice-agent/contracts';
import {
  analyzeVoiceEligibility,
  type VoiceReplyEligibility,
} from './knowledge-voice-reply-eligibility.js';
import { renderSentences, type VoiceReplySelection } from './knowledge-voice-reply-render.js';

/**
 * Compositor da B2c (DEC-072): PURO, determinístico, sem IA e sem I/O. Entrada
 * é SÓ a projeção já validada e coerente; nada da pergunta, título ou trecho.
 * Devolve a resposta falada e a SELEÇÃO interna (índices dos fatos), que a
 * verificação usa para remontar o texto e que nunca sai da ferramenta.
 * Sanitizar ≠ verificar: um fato bem formado pode ser falso (D24) ou de outro
 * produto da mesma passagem; o compositor só REDUZ o que é dito.
 */
export interface ComposedVoiceReply {
  readonly reply: KnowledgeVoiceReply;
  readonly selection: VoiceReplySelection;
}

/** Precedência: a primeira condição que se aplicar. */
function technicalState(
  projection: KnowledgeAgentProjection,
  eligibility: VoiceReplyEligibility,
): KnowledgeVoiceTechnicalState {
  if (!projection.found) return 'NO_EVIDENCE';
  const full = projection.facts.length >= KNOWLEDGE_AGENT_PROJECTION_MAX_FACTS;
  if (projection.truncated || full) return 'PARTIAL';
  if (eligibility.conflict) return 'CONFLICT';
  if (eligibility.speakableIndexes.length === 0) return 'NOT_SPEAKABLE';
  return 'FACTS';
}

function selectionFor(
  technical: KnowledgeVoiceTechnicalState,
  speakable: readonly number[],
  projection: KnowledgeAgentProjection,
): VoiceReplySelection {
  return {
    technical,
    factIndexes:
      technical === 'FACTS' ? speakable.slice(0, KNOWLEDGE_VOICE_REPLY_MAX_SPOKEN_FACTS) : [],
    aspects: [...projection.aspectsRequiringAuthorizedSource],
  };
}

/** Orçamento: a frase C nunca é cortada; passando do limite, cai o 2º fato. */
function withinBudget(
  selection: VoiceReplySelection,
  projection: KnowledgeAgentProjection,
): { selection: VoiceReplySelection; sentences: string[]; overBudget: number } {
  const sentences = renderSentences(selection, projection);
  const tooLong = sentences.join(' ').length > KNOWLEDGE_VOICE_REPLY_MAX_CHARS;
  if (!tooLong || selection.factIndexes.length < 2) return { selection, sentences, overBudget: 0 };
  const shorter = { ...selection, factIndexes: selection.factIndexes.slice(0, 1) };
  return { selection: shorter, sentences: renderSentences(shorter, projection), overBudget: 1 };
}

export function composeKnowledgeVoiceReply(
  projection: KnowledgeAgentProjection,
): ComposedVoiceReply {
  const eligibility = analyzeVoiceEligibility(projection.facts);
  const technical = technicalState(projection, eligibility);
  const initial = selectionFor(technical, eligibility.speakableIndexes, projection);
  const { selection, sentences, overBudget } = withinBudget(initial, projection);
  const first = selection.factIndexes[0];
  return {
    selection,
    reply: {
      technical,
      authorizedSource: selection.aspects.length > 0,
      sentences,
      spokenText: sentences.join(' '),
      spokenCitationIds: first === undefined ? [] : [projection.facts[first]!.citationId],
      spokenFactCount: selection.factIndexes.length,
      suppressed: { ...eligibility.suppressed, overBudget },
    },
  };
}
