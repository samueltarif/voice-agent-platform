function getPartValue(parts: Intl.DateTimeFormatPart[], type: string): number {
  const match = parts.find((p) => p.type === type)?.value ?? '0';
  const num = Number(match);
  return type === 'hour' && num === 24 ? 0 : num;
}

export function getStartOfDayInTimezone(date: Date = new Date(), timeZone = 'UTC'): Date {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const dateStr = formatter.format(date);
    const guess = new Date(`${dateStr}T00:00:00.000Z`);

    const invFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const parts = invFormatter.formatToParts(guess);
    const localInTz = Date.UTC(
      getPartValue(parts, 'year'),
      getPartValue(parts, 'month') - 1,
      getPartValue(parts, 'day'),
      getPartValue(parts, 'hour'),
      getPartValue(parts, 'minute'),
      getPartValue(parts, 'second'),
    );

    const offsetMs = localInTz - guess.getTime();
    return new Date(guess.getTime() - offsetMs);
  } catch {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }
}
