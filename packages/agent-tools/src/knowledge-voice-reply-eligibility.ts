import type { KnowledgeTechnicalFact, KnowledgeVoiceReplySuppressed } from '@voice-agent/contracts';
import {
  hasAmbiguousNumber,
  hasCompatibleUnit,
  normalizedVoiceValue,
} from './knowledge-voice-value.js';

/**
 * Elegibilidade da fala (B2c, DEC-072), conservadora:
 * - `subject = null` nunca é falado (abstenção);
 * - fatos falados vêm de UMA citação; citação com produtos diferentes, `null`
 *   ou o mesmo atributo com valores diferentes é abstida inteira;
 * - conflito = mesmo produto e atributo com valores diferentes em QUALQUER
 *   lugar da projeção (inclusive unidades diferentes e número ambíguo);
 *   materiais diferentes do produto bloqueiam o produto inteiro (A1);
 * - duplicata = mesmo produto, atributo e valor NORMALIZADO ("0,5 %" e
 *   "0.5 %"). Só conta o que está visível na projeção: a B2b já removeu as
 *   duplicatas exatas antes do corte em 12 fatos.
 */
export type VoiceEligibilitySuppressed = Omit<KnowledgeVoiceReplySuppressed, 'overBudget'>;

export interface VoiceReplyEligibility {
  /** Índices em `facts` da primeira citação elegível (atributos distintos, ordem da projeção). */
  readonly speakableIndexes: readonly number[];
  /** Algum fato falável da citação escolhida tem conflito na sua chave. */
  readonly conflict: boolean;
  readonly suppressed: VoiceEligibilitySuppressed;
}

type Facts = readonly KnowledgeTechnicalFact[];

const conflictKey = (f: KnowledgeTechnicalFact) => `${f.subject}|${f.attribute}`;

/** Chaves produto|atributo com mais de um valor normalizado. */
function multiValuedKeys(facts: Facts): ReadonlySet<string> {
  const values = new Map<string, Set<string>>();
  for (const f of facts) {
    if (f.subject === null) continue;
    const set = values.get(conflictKey(f)) ?? new Set<string>();
    values.set(conflictKey(f), set.add(normalizedVoiceValue(f)));
  }
  return new Set([...values].filter(([, set]) => set.size > 1).map(([key]) => key));
}

const MATERIAL_SUFFIX = '|MATERIAL';

/**
 * MATERIAL é genérico: o extrator não sabe a peça (corpo, vedação, rotor,
 * condutor). Materiais diferentes do mesmo produto, sem proveniência por
 * componente, são CONFLITO do produto inteiro (DEC-072, ajuste A1): nenhum
 * valor técnico desse produto é falado, mesmo havendo outros atributos.
 */
export function contestedMaterialSubjects(facts: Facts): ReadonlySet<string> {
  return new Set(
    [...multiValuedKeys(facts)]
      .filter((key) => key.endsWith(MATERIAL_SUFFIX))
      .map((key) => key.slice(0, -MATERIAL_SUFFIX.length)),
  );
}

function duplicateIndexes(facts: Facts): ReadonlySet<number> {
  const seen = new Set<string>();
  const duplicates = new Set<number>();
  facts.forEach((f, i) => {
    const key = `${conflictKey(f)}|${normalizedVoiceValue(f)}`;
    if (seen.has(key)) duplicates.add(i);
    seen.add(key);
  });
  return duplicates;
}

function citationGroups(facts: Facts): ReadonlyArray<readonly number[]> {
  const groups = new Map<string, number[]>();
  facts.forEach((f, i) => groups.set(f.citationId, [...(groups.get(f.citationId) ?? []), i]));
  return [...groups.values()];
}

/** Abstenção da citação inteira: `null`, vários produtos ou atributo com valores diferentes. */
function isAmbiguousCitation(facts: Facts, indexes: readonly number[]): boolean {
  const group = indexes.map((i) => facts[i]!);
  if (group.some((f) => f.subject === null)) return true;
  if (new Set(group.map((f) => f.subject)).size > 1) return true;
  return multiValuedKeys(group).size > 0;
}

interface Tally {
  ambiguousAssociation: number;
  incompatibleUnit: number;
  ambiguousNumber: number;
}

function speakableOf(facts: Facts, indexes: readonly number[], tally: Tally): number[] {
  const out: number[] = [];
  for (const i of indexes) {
    if (!hasCompatibleUnit(facts[i]!)) tally.incompatibleUnit += 1;
    else if (hasAmbiguousNumber(facts[i]!)) tally.ambiguousNumber += 1;
    else out.push(i);
  }
  return out;
}

/**
 * Conflito: chave de um fato escolhido com valores diferentes; OU material
 * contestado do produto escolhido; OU, sem citação elegível, qualquer
 * material contestado na projeção.
 */
function hasConflict(facts: Facts, chosen: readonly number[]): boolean {
  const conflicts = multiValuedKeys(facts);
  if (chosen.some((i) => conflicts.has(conflictKey(facts[i]!)))) return true;
  const disputed = contestedMaterialSubjects(facts);
  if (chosen.length === 0) return disputed.size > 0;
  return disputed.has(facts[chosen[0]!]!.subject ?? '');
}

export function analyzeVoiceEligibility(facts: Facts): VoiceReplyEligibility {
  const conflicts = multiValuedKeys(facts);
  const duplicates = duplicateIndexes(facts);
  const tally: Tally = { ambiguousAssociation: 0, incompatibleUnit: 0, ambiguousNumber: 0 };
  let chosen: number[] = [];
  for (const group of citationGroups(facts)) {
    const visible = group.filter((i) => !duplicates.has(i));
    if (isAmbiguousCitation(facts, visible)) {
      tally.ambiguousAssociation += visible.length;
      continue;
    }
    const speakable = speakableOf(facts, visible, tally);
    if (chosen.length === 0) chosen = speakable;
  }
  return {
    speakableIndexes: chosen,
    conflict: hasConflict(facts, chosen),
    suppressed: {
      conflictingFacts: facts.filter((f) => conflicts.has(conflictKey(f))).length,
      ...tally,
      duplicateFacts: duplicates.size,
    },
  };
}
