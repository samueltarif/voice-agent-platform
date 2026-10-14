// Coordenação de concorrência para listagens: somente a requisição mais
// recente pode atualizar o estado. Testável sem React (lógica pura).
export interface KnowledgeRequestSequence {
  readonly next: () => number;
  readonly isCurrent: (sequence: number) => boolean;
}

export function createKnowledgeRequestSequence(): KnowledgeRequestSequence {
  let current = 0;
  return {
    next: () => {
      current += 1;
      return current;
    },
    isCurrent: (sequence: number) => sequence === current,
  };
}
