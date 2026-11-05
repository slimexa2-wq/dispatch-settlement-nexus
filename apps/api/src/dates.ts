const CHINA_OFFSET_MS = 8 * 60 * 60 * 1000;

export function parseDateOnly(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new RangeError(`Invalid date-only value: ${value}`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime())
    || date.getUTCFullYear() !== Number(match[1])
    || date.getUTCMonth() + 1 !== Number(match[2])
    || date.getUTCDate() !== Number(match[3])
  ) {
    throw new RangeError(`Invalid date-only value: ${value}`);
  }
  return date;
}

export function chinaDateLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function chinaDayBounds(date = new Date()): { start: Date; end: Date } {
  const shifted = new Date(date.getTime() + CHINA_OFFSET_MS);
  const startShifted = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  return {
    start: new Date(startShifted - CHINA_OFFSET_MS),
    end: new Date(startShifted + 24 * 60 * 60 * 1000 - CHINA_OFFSET_MS)
  };
}

export function chinaMonthBounds(date = new Date()): { start: Date; end: Date } {
  const shifted = new Date(date.getTime() + CHINA_OFFSET_MS);
  const startShifted = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1);
  const endShifted = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 1);
  return {
    start: new Date(startShifted - CHINA_OFFSET_MS),
    end: new Date(endShifted - CHINA_OFFSET_MS)
  };
}

export function lastChinaDays(days: number, date = new Date()): Array<{ label: string; start: Date; end: Date }> {
  const today = chinaDayBounds(date);
  return Array.from({ length: days }, (_, index) => {
    const offset = days - index - 1;
    const start = new Date(today.start.getTime() - offset * 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const shifted = new Date(start.getTime() + CHINA_OFFSET_MS);
    return { label: shifted.toISOString().slice(0, 10), start, end };
  });
}
