/**
 * Fronteira de dia local para quotas diárias (008-OF3).
 * O deslocamento UTC é medido no PRÓPRIO instante candidato (duas passadas),
 * de modo que dias de transição de DST começam na meia-noite local correta.
 * Fuso desconhecido lança `RangeError` (fail-closed): nunca cai em UTC.
 */
export function isValidIanaTimezone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

function offsetMsAt(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const local = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second'),
  );
  return local - Math.floor(instant.getTime() / 1000) * 1000;
}

export function getStartOfDayInTimezone(date: Date = new Date(), timeZone = 'UTC'): Date {
  const localDate = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  const wallMidnight = new Date(`${localDate}T00:00:00.000Z`).getTime();
  const firstPass = wallMidnight - offsetMsAt(new Date(wallMidnight), timeZone);
  return new Date(wallMidnight - offsetMsAt(new Date(firstPass), timeZone));
}
