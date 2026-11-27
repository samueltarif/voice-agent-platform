import type { SchedulingRefusal } from './scheduling-agent-port.js';

/**
 * E2 PR 2 (DEC-075) — falas DETERMINÍSTICAS do agendamento, renderizadas pelo
 * servidor a partir das ofertas registradas e devolvidas no RESULTADO das
 * ferramentas. O motor conversacional pode parafrasear (E2-V: `strict` não
 * garante reprodução literal), por isso nenhum controle depende de o texto
 * ter sido falado exatamente.
 */

const PART_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZoneName: 'longOffset',
};

function partsOf(instant: Date, timeZone: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat('pt-BR', { ...PART_OPTIONS, timeZone }).formatToParts(
    instant,
  );
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

/** Ex.: "segunda-feira, 30 de novembro de 2026, às 09:00, fuso America/Sao_Paulo (GMT-03:00)". */
export function renderSlotLabel(startsAt: string | Date, timeZone: string): string {
  const instant = typeof startsAt === 'string' ? new Date(startsAt) : startsAt;
  if (!Number.isFinite(instant.getTime())) throw new RangeError('Invalid slot instant');
  const p = partsOf(instant, timeZone);
  const offset = p.timeZoneName === 'GMT' ? 'GMT+00:00' : p.timeZoneName;
  return `${p.weekday}, ${p.day} de ${p.month} de ${p.year}, às ${p.hour}:${p.minute}, fuso ${timeZone} (${offset})`;
}

export function renderOfferListSpeech(labels: readonly string[]): string {
  const options = labels.map((label, index) => `opção ${index + 1}: ${label}`).join('; ');
  return `Tenho estes horários disponíveis — ${options}. Qual você prefere?`;
}

export function renderReadbackSpeech(label: string): string {
  return `Só para confirmar: ${label}. Posso marcar a reunião nesse horário?`;
}

/** Intenção registrada: NÃO afirma reserva (a confirmação vem depois da ligação). */
export function renderBookingPendingSpeech(label: string): string {
  return `Anotei o seu pedido para ${label}. A confirmação da reunião será enviada depois desta ligação.`;
}

export const SCHEDULING_SPEECH = Object.freeze({
  NO_AVAILABILITY: 'Não encontrei horários disponíveis nesse período.',
  OPT_OUT_RECORDED: 'Tudo bem. Registrei o seu pedido e não vamos mais ligar para você.',
} as const);

const REFUSAL_SPEECH: Readonly<Record<SchedulingRefusal, string>> = {
  CONTEXT_REFUSED: 'Não consigo tratar de agendamento nesta ligação.',
  SCHEDULING_UNAVAILABLE: 'Não consigo marcar reuniões por aqui agora.',
  SESSION_NOT_ACTIVE: 'Esta ligação já foi encerrada.',
  OPT_OUT_REQUESTED: 'Tudo bem, não vamos mais seguir com o agendamento.',
  LEAD_NOT_BOOKABLE: 'Não consigo marcar uma nova reunião neste momento.',
  OFFER_NOT_CURRENT: 'Essa opção não está mais valendo. Posso consultar os horários de novo?',
  OFFER_EXPIRED: 'Esse horário não está mais reservado para você. Posso consultar de novo?',
};

export function renderRefusalSpeech(reason: SchedulingRefusal): string {
  return REFUSAL_SPEECH[reason];
}
