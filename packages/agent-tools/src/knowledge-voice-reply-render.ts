import type {
  KnowledgeAgentProjection,
  KnowledgeCommercialAspect,
  KnowledgeTechnicalFact,
  KnowledgeVoiceTechnicalState,
} from '@voice-agent/contracts';
import { speakVoiceValue } from './knowledge-voice-value.js';
import {
  KNOWLEDGE_VOICE_ASPECT_LABELS,
  KNOWLEDGE_VOICE_ATTRIBUTE_LABELS,
  KNOWLEDGE_VOICE_PHRASES,
} from './knowledge-voice-vocabulary.js';

/**
 * Modelos de frase da B2c (DEC-072). Só o vocabulário fechado e os valores
 * remontados da projeção entram no texto; nunca o código do produto, título,
 * trecho, termos da pergunta ou contadores. Usada pelo compositor E pela
 * verificação (remontagem); por isso os testes de saída literal são escritos à
 * mão, independentes desta função.
 */
export interface VoiceReplySelection {
  readonly technical: KnowledgeVoiceTechnicalState;
  /** Índices em `projection.facts` (0 até o último fato), no máximo 2, na ordem falada. */
  readonly factIndexes: readonly number[];
  readonly aspects: readonly KnowledgeCommercialAspect[];
}

export function renderFactFragment(fact: KnowledgeTechnicalFact): string {
  const spoken = speakVoiceValue(fact);
  const label = KNOWLEDGE_VOICE_ATTRIBUTE_LABELS[fact.attribute];
  if (fact.attribute === 'MATERIAL') {
    return `o ${label} ${spoken}, ${KNOWLEDGE_VOICE_PHRASES.materialPartUnknown}`;
  }
  if (fact.attribute === 'POLES') return spoken;
  if (fact.attribute === 'PROTECTION_RATING') return `${label} ${spoken}`;
  return `${label} de ${spoken}`;
}

function listOf(labels: readonly string[]): string {
  if (labels.length === 1) return labels[0]!;
  return `${labels.slice(0, -1).join(', ')} e ${labels.at(-1)!}`;
}

export function renderAuthorizedSourceSentence(
  aspects: readonly KnowledgeCommercialAspect[],
): string {
  const list = listOf(aspects.map((a) => KNOWLEDGE_VOICE_ASPECT_LABELS[a]));
  const verb =
    aspects.length === 1
      ? KNOWLEDGE_VOICE_PHRASES.authorizedOne
      : KNOWLEDGE_VOICE_PHRASES.authorizedMany;
  return `${list.charAt(0).toUpperCase()}${list.slice(1)} ${verb}`;
}

const FIXED: Readonly<Record<Exclude<KnowledgeVoiceTechnicalState, 'FACTS'>, string>> = {
  CONFLICT: KNOWLEDGE_VOICE_PHRASES.conflict,
  PARTIAL: KNOWLEDGE_VOICE_PHRASES.partial,
  NOT_SPEAKABLE: KNOWLEDGE_VOICE_PHRASES.notSpeakable,
  NO_EVIDENCE: KNOWLEDGE_VOICE_PHRASES.noEvidence,
};

function technicalSentence(
  selection: VoiceReplySelection,
  facts: readonly KnowledgeTechnicalFact[],
): string {
  if (selection.technical !== 'FACTS') return FIXED[selection.technical];
  const fragments = selection.factIndexes.map((i) => renderFactFragment(facts[i]!));
  return `${KNOWLEDGE_VOICE_PHRASES.factsLead} ${fragments.join(', e ')}.`;
}

/**
 * Matriz de precedência: FACTS e CONFLICT falam a frase técnica (+ C);
 * PARTIAL, NOT_SPEAKABLE e NO_EVIDENCE com aspecto comercial falam SÓ a C.
 */
export function renderSentences(
  selection: VoiceReplySelection,
  projection: KnowledgeAgentProjection,
): string[] {
  const technical = technicalSentence(selection, projection.facts);
  if (selection.aspects.length === 0) return [technical];
  const authorized = renderAuthorizedSourceSentence(selection.aspects);
  const speaksTechnical = selection.technical === 'FACTS' || selection.technical === 'CONFLICT';
  return speaksTechnical ? [technical, authorized] : [authorized];
}
