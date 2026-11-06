import type { CanonicalToolName } from '@voice-agent/contracts';

/** Rótulos das ferramentas canônicas (compartilhados pelo editor e pelo simulador). */
export interface CanonicalToolItem {
  readonly name: CanonicalToolName;
  readonly label: string;
  readonly description: string;
}

export const AVAILABLE_CANONICAL_TOOLS: readonly CanonicalToolItem[] = [
  {
    name: 'agent.operating_hours',
    label: 'Consulta de Horários de Atendimento',
    description:
      'Permite ao agente consultar e responder os horários de atendimento de forma determinística.',
  },
  {
    name: 'catalog.search',
    label: 'Busca de Catálogo',
    description:
      'Permite ao agente buscar produtos e serviços do catálogo do tenant de forma determinística.',
  },
  {
    name: 'catalog.item_detail',
    label: 'Detalhe de Item do Catálogo',
    description:
      'Permite ao agente consultar o detalhe de um produto ou serviço do catálogo do tenant.',
  },
];
