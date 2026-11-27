import type { PostCallEntry } from '@voice-agent/contracts';

/**
 * DEC-077 — linhas do tempo SINTÉTICAS do relatório pós-chamada para os
 * testes (forma normalizada; nenhum dado real). Agenda de teste: segunda-feira,
 * 30/11/2026, opções às 09:00, 09:30 e 10:00 (America/Sao_Paulo).
 */

export const READBACK_09H =
  'Só para confirmar: segunda-feira, 30 de novembro, às 9h. Posso marcar?';
export const READBACK_09H30 = 'Confirmando: segunda-feira às 9h30. Pode ser?';

export function bookingTimeline(input: {
  readonly listRevision: number;
  readonly option?: number;
  readonly readback?: string;
  readonly reply?: string;
  readonly after?: readonly PostCallEntry[];
}): PostCallEntry[] {
  const option = input.option ?? 1;
  return [
    { kind: 'AGENT', text: 'Olá! Aqui é a assistente de teste. Tudo bem?' },
    { kind: 'LEAD', text: 'Tudo bem, pode falar.' },
    { kind: 'TOOL_CALL', toolName: 'scheduling.find_slots', arguments: {} },
    { kind: 'AGENT', text: 'Tenho segunda às 9h, às 9h30 ou às 10h. Qual prefere?' },
    { kind: 'LEAD', text: 'A primeira.' },
    { kind: 'AGENT', text: input.readback ?? READBACK_09H },
    { kind: 'LEAD', text: input.reply ?? 'Sim, pode marcar.' },
    {
      kind: 'TOOL_CALL',
      toolName: 'scheduling.request_booking',
      arguments: {
        listRevision: input.listRevision,
        option,
        leadConfirmation: 'Sim, pode marcar.',
      },
    },
    { kind: 'AGENT', text: 'Anotei o seu pedido. A confirmação será enviada depois da ligação.' },
    ...(input.after ?? []),
  ];
}

export const SILENT_TIMELINE: PostCallEntry[] = [
  { kind: 'AGENT', text: 'Olá! Aqui é a assistente de teste. Tudo bem?' },
  { kind: 'LEAD', text: '' },
  { kind: 'AGENT', text: 'Você ainda está aí?' },
];
