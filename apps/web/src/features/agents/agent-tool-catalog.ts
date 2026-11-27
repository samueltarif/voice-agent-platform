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
      'Oferece até 3 horários reais da agenda configurada. Exige também o pedido de horário e o opt-out. Ainda não é usada em chamadas reais.',
  },
  {
    name: 'scheduling.request_booking',
    label: 'Pedido de Horário de Reunião',
    description:
      'Registra o pedido do horário escolhido; a reunião só é marcada depois da ligação, com o aceite conferido no histórico (casos duvidosos vão para revisão). Ainda não é usada em chamadas reais.',
  },
  {
    name: 'lead.record_outcome',
    label: 'Resultado Comercial da Ligação',
    description:
      'Propõe contatado, qualificado ou sem interesse; só vale com fala do cliente no histórico da ligação, nunca reabre quem pediu para não ser contatado nem mexe em reunião marcada. Ainda não é usada em chamadas reais.',
  },
  {
    name: 'lead.record_opt_out',
    label: 'Pedido para Não Receber Ligações',
    description:
      'Suprime o telefone na hora em que o cliente pede; o histórico da ligação também é conferido depois. Obrigatória com o agendamento. Ainda não é usada em chamadas reais.',
  },
];
