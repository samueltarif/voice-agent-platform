import type { AgentConfigurationSnapshotV1 } from '@voice-agent/contracts';

/** Catálogo fictício no formato do catálogo da homologação (produtos + FAQ comercial). */
export const KNOWLEDGE_SIMULATION_CATALOG = [
  'Qualitec Instrumentação. A Qualitec oferece soluções completas para óleo e gás em todo o Brasil.',
  'Transmissor de Pressão Manométrica QT-310 da Qualitec. Faixa de 0 a 400 bar, saída 4-20 mA.',
  'Transmissor de Pressão Diferencial QT-520 da Qualitec. Faixa de 0 a 25 bar, medição de vazão.',
  'Válvula Esfera Bipartida VE-200 da Qualitec. Corpo em aço inox 316, classe 300.',
  'Perguntas frequentes sobre preços: os preços da Qualitec são enviados por orçamento.',
  'Prazo de entrega e disponibilidade: itens em estoque saem em 5 dias úteis.',
] as const;

export function knowledgeSimulationConfig(
  tools: AgentConfigurationSnapshotV1['tools'],
): AgentConfigurationSnapshotV1 {
  return {
    persona: {
      role: 'Assistente de Vendas',
      companyName: 'Qualitec',
      objective: 'Responder dúvidas sobre o catálogo',
      tone: 'FORMAL',
      greetingPhrase: 'Olá',
      closingPhrase: 'Obrigado',
      fallbackPhrase: 'Pode repetir?',
    },
    voice: { languageCode: 'pt-BR' },
    rules: { conversational: ['Seja cordial'], deterministic: { operatingHours: '08:00-18:00' } },
    tools,
  };
}

/** IDs criados por `createKnowledgeSimulationFixture`. */
export interface KnowledgeSimulationFixture {
  readonly userId: string;
  readonly orgA: string;
  readonly orgB: string;
  /** Organização A: vendas (com a ferramenta), suporte (documento fixado), sem ferramenta, só rascunho, arquivado. */
  readonly sales: string;
  readonly support: string;
  readonly noTool: string;
  readonly draftOnly: string;
  readonly archived: string;
  /** Organização B: vende helicópteros. */
  readonly salesB: string;
}
