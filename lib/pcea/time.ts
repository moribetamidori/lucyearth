// Timezone helpers shared by the server and the browser. Uses Intl only.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const isDate = (value: unknown): value is string =>
  typeof value === 'string' && DATE_RE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
export const isTime = (value: unknown): value is string => typeof value === 'string' && TIME_RE.test(value);

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

export function browserTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>();
function zonedParts(instant: number, tz: string) {
  let fmt = partsFormatters.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    partsFormatters.set(tz, fmt);
  }
  const get = (type: string) => Number(fmt.formatToParts(new Date(instant)).find(p => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}

/** Offset of `tz` from UTC at `instant`, in minutes (e.g. -300 for EST). */
export function offsetMinutes(instant: number, tz: string) {
  const p = zonedParts(instant, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(instant / 1000) * 1000) / 60000);
}

/** The instant at which the wall clock in `tz` reads `date time`. */
export function zonedToInstant(date: string, time: string, tz: string) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  const first = wall - offsetMinutes(wall, tz) * 60000;
  const second = wall - offsetMinutes(first, tz) * 60000;
  return second;
}

export function addDays(date: string, days: number) {
  const t = Date.parse(`${date}T00:00:00Z`) + days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

export function todayIn(tz: string, now = Date.now()) {
  const p = zonedParts(now, tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** An event locks once its calendar day has ended in its own timezone. Mirrors pcea_event_locked(). */
export function isLocked(date: string, tz: string, now = Date.now()) {
  return now >= zonedToInstant(addDays(date, 1), '00:00', tz);
}

export function shortZoneName(instant: number, tz: string) {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
      .formatToParts(new Date(instant)).find(p => p.type === 'timeZoneName')?.value ?? tz;
  } catch { return tz; }
}

/** e.g. "America/New_York (EST)" */
export function zoneLabel(tz: string, instant: number) {
  const short = shortZoneName(instant, tz);
  return short === tz ? tz : `${tz} (${short})`;
}

export function formatClock(time: string, locale = 'en-US') {
  const [h, m] = time.split(':').map(Number);
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', hour: 'numeric', minute: '2-digit' })
    .format(new Date(Date.UTC(2000, 0, 1, h, m)));
}

export function formatInZone(instant: number, tz: string, locale = 'en-US') {
  return new Intl.DateTimeFormat(locale, {
    timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(instant));
}

export function formatDateLabel(date: string, locale = 'en-US') {
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' })
    .format(new Date(`${date}T00:00:00Z`));
}

/** Short weekday and day-of-month for the week strip, e.g. ["Mon", "16"] or ["周一", "16"]. */
export function weekdayAndDay(date: string, locale = 'en-US') {
  const d = new Date(`${date}T00:00:00Z`);
  return [new Intl.DateTimeFormat(locale, { timeZone: 'UTC', weekday: 'short' }).format(d), String(d.getUTCDate())] as const;
}

/**
 * How the event's time reads for a viewer in another timezone.
 * Returns null when both zones have the same UTC offset at that moment.
 */
export function viewerTime(event: { eventDate: string; startTime: string | null; timezone: string }, viewerTz: string, locale = 'en-US') {
  const instant = zonedToInstant(event.eventDate, event.startTime ?? '12:00', event.timezone);
  if (event.timezone === viewerTz || offsetMinutes(instant, event.timezone) === offsetMinutes(instant, viewerTz)) return null;
  return {
    text: event.startTime ? formatInZone(instant, viewerTz, locale) : null,
    zone: zoneLabel(viewerTz, instant),
  };
}
