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
  {
    name: 'knowledge.search',
    label: 'Busca na Base de Conhecimento',
    description:
      'Permite ao agente consultar trechos dos documentos da organização liberados para ele, como dados (não instruções). Ainda não é usada em chamadas reais.',
  },
  {
    name: 'scheduling.find_slots',
    label: 'Consulta de Horários para Reunião',
    description:
      'Oferece até 3 horários reais da agenda configurada; a lista é falada pelo servidor. Exige também a confirmação de horário. Ainda não é usada em chamadas reais.',
  },
  {
    name: 'scheduling.confirm_offer',
    label: 'Confirmação de Horário de Reunião',
    description:
      'Marca a reunião só depois da releitura do horário e do aceite explícito registrados pelo servidor. Exige também a consulta de horários. Ainda não é usada em chamadas reais.',
  },
  {
    name: 'lead.record_outcome',
    label: 'Resultado Comercial da Ligação',
    description:
      'Registra contatado, qualificado ou sem interesse; nunca reabre um lead que pediu para não ser contatado nem mexe em reunião marcada. Ainda não é usada em chamadas reais.',
  },
  {
    name: 'lead.record_opt_out',
    label: 'Pedido para Não Receber Ligações',
    description:
      'Registra a supressão do telefone. O pedido dito pelo cliente é gravado pelo servidor mesmo sem esta ferramenta. Ainda não é usada em chamadas reais.',
  },
];
