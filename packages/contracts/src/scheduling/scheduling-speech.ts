import type { SchedulingRefusal } from './scheduling-agent-port.js';

/**
 * E2 PR 2 (DEC-075) — falas DETERMINÍSTICAS do agendamento, renderizadas pelo
 * servidor a partir das ofertas registradas. O modelo não escreve horário,
 * data, fuso nem resultado: a lista, a releitura exata e o resultado são
 * falados pelo harness com este texto, e a entrega completa é o evento
 * `SPEECH_COMPLETED` do transporte (nunca a chamada de `speak`).
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

export function renderBookedSpeech(label: string): string {
  return `Pronto, a reunião está marcada para ${label}.`;
}

export const SCHEDULING_SPEECH = Object.freeze({
  NO_AVAILABILITY: 'Não encontrei horários disponíveis nesse período.',
  NOT_BOOKED: 'Não consegui marcar esse horário. Posso procurar outras opções?',
  UNKNOWN:
    'Ainda estou verificando a marcação da reunião e não posso confirmar agora. Vou conferir antes de seguir.',
  CLARIFY: 'Desculpe, não entendi. Pode repetir, por favor?',
  // Pergunta SEM dupla negação: "sim" = parar de ligar; "não" = continuar.
  OPT_OUT_CLARIFICATION:
    'Antes de continuar: você quer que a gente pare de ligar para você? Responda sim ou não.',
  OPT_OUT_RECORDED: 'Tudo bem. Registrei o seu pedido e não vamos mais ligar para você.',
} as const);

const REFUSAL_SPEECH: Readonly<Record<SchedulingRefusal, string>> = {
  CONTEXT_REFUSED: 'Não consigo tratar de agendamento nesta ligação.',
  SCHEDULING_UNAVAILABLE: 'Não consigo marcar reuniões por aqui agora.',
  SESSION_NOT_ACTIVE: 'Esta ligação já foi encerrada.',
  OPT_OUT_REQUESTED: 'Tudo bem, não vamos mais seguir com o agendamento.',
  OPT_OUT_CLARIFICATION_PENDING: SCHEDULING_SPEECH.OPT_OUT_CLARIFICATION,
  BOOKING_IN_FLIGHT: 'Estou concluindo a marcação; só um instante.',
  // A6: a fase histórica não prova reunião ativa — texto neutro, sem afirmar marcação.
  ALREADY_BOOKED: 'Não consigo abrir um novo agendamento nesta ligação.',
  LEAD_NOT_BOOKABLE: 'Não consigo marcar uma nova reunião neste momento.',
  NOT_AUTHORIZED: 'Ainda não tenho a sua confirmação para um horário específico.',
};

export function renderRefusalSpeech(reason: SchedulingRefusal): string {
  return REFUSAL_SPEECH[reason];
}
