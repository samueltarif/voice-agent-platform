/**
 * E2 simplificada (DEC-077) — a fala do agente cita o horário da oferta?
 * Regra conservadora e testável (não semântica): o texto, sem acentos e em
 * minúsculas, contém o DIA DA SEMANA da oferta (ex.: "terca") e a HORA no
 * fuso da agenda ("10h", "10:00", "10 horas", "às 10"; com minutos, exige
 * "10h30"/"10:30"). Horário por extenso ("dez horas") não conta: revisão.
 */

const strip = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase();

function wallParts(startsAt: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).formatToParts(new Date(startsAt));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    weekday: strip(get('weekday')).split('-')[0]!,
    hour: String(Number(get('hour'))),
    minute: get('minute'),
  };
}

function hourPattern(hour: string, minute: string): RegExp {
  const h = `0?${hour}`;
  if (minute === '00') {
    return new RegExp(`\\b${h}(?:\\s*h\\b|\\s*h00\\b|:00\\b|\\s+horas?\\b)|\\bas\\s+${h}\\b`, 'u');
  }
  return new RegExp(`\\b${h}(?:\\s*h\\s*${minute}\\b|:${minute}\\b)`, 'u');
}

export function mentionsSlot(text: string, startsAt: string, timeZone: string): boolean {
  if (!text) return false;
  const plain = strip(text);
  const { weekday, hour, minute } = wallParts(startsAt, timeZone);
  return new RegExp(`\\b${weekday}\\b`, 'u').test(plain) && hourPattern(hour, minute).test(plain);
}
