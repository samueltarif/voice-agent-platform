/**
 * E2 simplificada (DEC-077; auditoria #184 A1) — a fala do agente imediatamente
 * anterior ao "sim" é uma PROPOSTA AFIRMATIVA de reserva do horário da oferta?
 * Regra conservadora e testável (não semântica), sobre o texto sem acentos:
 * - há um verbo de proposta/confirmação ("confirma", "posso marcar", "agendar"…);
 * - não há negação, indisponibilidade, alternativa ou nova consulta ("não",
 *   "indisponível", "outro", "consultar"…), nem data relativa ("hoje", "amanhã");
 * - exatamente UM dia da semana citado, igual ao da oferta;
 * - exatamente UM horário completo citado ("9h", "9:00", "9 horas", "às 9",
 *   "9h30", "9:30", "9 e meia"), igual ao da oferta — "9:30" nunca vale por 9h;
 * - toda data explícita ("dia 30", "30/11", "30 de novembro") igual à da oferta.
 * Qualquer outro caso: não comprovado ⇒ revisão humana. Horário por extenso
 * ("nove horas") não conta.
 */

const strip = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase();

const MONTHS = [
  'janeiro',
  'fevereiro',
  'marco',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];
const WEEKDAY = /\b(domingo|segunda|terca|quarta|quinta|sexta|sabado)\b/gu;
const NEGATIVE =
  /\b(nao|indisponive(?:l|is)|ocupad[oa]s?|lotad[oa]s?|consult\w*|verific\w*|outr[oa]s?|alternativ\w*|infelizmente|cancel\w*|remarc\w*|sem\s+horario\w*|hoje|amanha)\b/u;
const PROPOSAL = /\b(confirm\w*|agend\w*|marc\w*|reserv\w*|pode\s+ser|posso)\b/u;
const CLOCK = /\b([01]?\d|2[0-3])\s*(?:h(?![a-z])\s*([0-5]\d)?|:([0-5]\d)|\s+horas?\b)/gu;
const BARE = /\bas\s+([01]?\d|2[0-3])\b(?!\s*(?:h|:|horas?\b|\d))/gu;
const HALF = /^\s+e\s+meia\b/u;
const DATES = [
  { re: /\bdia\s+(\d{1,2})\b/gu, month: null },
  { re: /\b(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\b/gu, month: 2 },
  { re: new RegExp(`\\b(\\d{1,2})\\s+de\\s+(${MONTHS.join('|')})\\b`, 'gu'), month: 2 },
] as const;

interface WallSlot {
  readonly weekday: string;
  readonly time: string;
  readonly day: number;
  readonly month: number;
}

function wallParts(startsAt: string, timeZone: string): WallSlot {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).formatToParts(new Date(startsAt));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    weekday: strip(get('weekday')).split('-')[0]!,
    time: `${Number(get('hour'))}:${get('minute')}`,
    day: Number(get('day')),
    month: Number(get('month')),
  };
}

function timesIn(plain: string): Set<string> {
  const times = new Set<string>();
  const add = (hour: string, minute: string | undefined, end: number) => {
    const half = HALF.test(plain.slice(end));
    times.add(`${Number(hour)}:${minute ?? (half ? '30' : '00')}`);
  };
  for (const m of plain.matchAll(CLOCK)) add(m[1]!, m[2] ?? m[3], m.index + m[0].length);
  for (const m of plain.matchAll(BARE)) add(m[1]!, undefined, m.index + m[0].length);
  return times;
}

function datesMatch(plain: string, slot: WallSlot): boolean {
  for (const { re, month } of DATES) {
    for (const m of plain.matchAll(re)) {
      if (Number(m[1]) !== slot.day) return false;
      if (month === null) continue;
      const raw = m[month]!;
      const value = /^\d+$/u.test(raw) ? Number(raw) : MONTHS.indexOf(raw) + 1;
      if (value !== slot.month) return false;
    }
  }
  return true;
}

export function proposesSlot(text: string, startsAt: string, timeZone: string): boolean {
  if (!text) return false;
  const plain = strip(text);
  if (NEGATIVE.test(plain) || !PROPOSAL.test(plain)) return false;
  const slot = wallParts(startsAt, timeZone);
  const weekdays = new Set([...plain.matchAll(WEEKDAY)].map((m) => m[1]));
  if (weekdays.size !== 1 || !weekdays.has(slot.weekday)) return false;
  const times = timesIn(plain);
  return times.size === 1 && times.has(slot.time) && datesMatch(plain, slot);
}
