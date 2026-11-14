import 'server-only';
import { cookies, headers } from 'next/headers';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { getPublicUrlForPath } from '@/lib/server/s3Storage';
import { COOKIE_MAX_AGE, COOKIE_NAME, clientIp, guestName, hashCode, hashIp, newRecoveryCode, normalizeCode } from './identity';
import { errorText, isErrorCode, type ErrorCode } from './i18n';
import { calibration } from './stats';
import { dayRoute } from './maps';
import { addDays, isDate, isLocked, isTime, isValidTimeZone } from './time';
import type { Interest, PceaEvent, PceaMe, PceaResponse } from './types';

export const IMAGE_BUCKET = 'pcea';
const NEW_USERS_PER_IP_PER_DAY = 20;
const NEW_EVENTS_PER_USER_PER_DAY = 30;
const MAX_RANGE_DAYS = 42;

export class PceaError extends Error {
  constructor(readonly code: ErrorCode, readonly status = 400) { super(errorText(code, 'en')); }
}

const fail = (code: ErrorCode, status: number) => Response.json({ code, error: errorText(code, 'en') }, { status });

let client: SupabaseClient | null = null;
function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new PceaError('notConfigured', 503);
  client ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return client;
}

function check(error: { message?: string; code?: string } | null) {
  if (!error) return;
  const msg = error.message ?? '';
  if (msg.includes('pcea_locked')) throw new PceaError('locked', 409);
  if (msg.includes('pcea_not_finished')) throw new PceaError('notFinished', 409);
  if (msg.includes('pcea_event_in_past')) throw new PceaError('eventInPast', 400);
  if (msg.includes('pcea_event_missing')) throw new PceaError('eventMissing', 404);
  console.error('[pcea] database error', error.code, msg);
  throw new PceaError('dbFailed', 500);
}

export function errorResponse(error: unknown) {
  if (error instanceof PceaError) return fail(error.code, error.status);
  if (error instanceof z.ZodError) {
    const message = error.issues[0]?.message;
    return fail(isErrorCode(message) ? message : 'invalidInput', 400);
  }
  if (error instanceof SyntaxError) return fail('invalidInput', 400); // malformed JSON body
  console.error('[pcea]', error);
  return fail('serverError', 500);
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (origin && (!host || new URL(origin).host !== host)) throw new PceaError('badOrigin', 403);
}

/* ---------------------------------- identity --------------------------------- */

type UserRow = { id: string; user_number: number; display_name: string | null; timezone: string };
export type SessionUser = UserRow & { code: string };

async function setSessionCookie(code: string) {
  (await cookies()).set(COOKIE_NAME, code, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: COOKIE_MAX_AGE,
  });
}

export async function currentUser(): Promise<SessionUser | null> {
  const code = normalizeCode((await cookies()).get(COOKIE_NAME)?.value);
  if (!code) return null;
  const { data, error } = await db().from('pcea_users')
    .select('id, user_number, display_name, timezone').eq('token_hash', hashCode(code)).maybeSingle();
  check(error);
  return data ? { ...(data as UserRow), code } : null;
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new PceaError('signedOut', 401);
  return user;
}

/** Returns the signed-in user, creating an anonymous one (and its cookie) on first visit. */
export async function ensureUser(timezone: unknown): Promise<SessionUser> {
  const tz = isValidTimeZone(timezone) ? timezone : 'UTC';
  const existing = await currentUser();
  if (existing) {
    const patch: Record<string, string> = { last_seen_at: new Date().toISOString() };
    if (isValidTimeZone(timezone) && timezone !== existing.timezone) patch.timezone = timezone;
    check((await db().from('pcea_users').update(patch).eq('id', existing.id)).error);
    await setSessionCookie(existing.code); // refresh expiry
    return { ...existing, timezone: patch.timezone ?? existing.timezone };
  }
  const ipHash = hashIp(clientIp(await headers()));
  if (ipHash) {
    const since = new Date(Date.now() - 86400000).toISOString();
    const { count, error } = await db().from('pcea_users').select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash).gte('created_at', since);
    check(error);
    if ((count ?? 0) >= NEW_USERS_PER_IP_PER_DAY) throw new PceaError('tooManyUsers', 429);
  }
  const code = newRecoveryCode();
  const { data, error } = await db().from('pcea_users')
    .insert({ token_hash: hashCode(code), ip_hash: ipHash, timezone: tz })
    .select('id, user_number, display_name, timezone').single();
  check(error);
  await setSessionCookie(code);
  return { ...(data as UserRow), code };
}

export async function restoreUser(input: unknown): Promise<SessionUser> {
  const code = normalizeCode(input);
  if (!code) throw new PceaError('badCode');
  const { data, error } = await db().from('pcea_users')
    .select('id, user_number, display_name, timezone').eq('token_hash', hashCode(code)).maybeSingle();
  check(error);
  if (!data) throw new PceaError('unknownCode', 404);
  await setSessionCookie(code);
  return { ...(data as UserRow), code };
}

const profileSchema = z.object({
  displayName: z.string({ error: 'nameRequired' }).trim().min(1, 'nameRequired').max(40, 'nameTooLong').optional(),
  timezone: z.string().refine(isValidTimeZone, 'invalidTimezone').optional(),
});

export async function updateProfile(user: SessionUser, body: unknown): Promise<SessionUser> {
  const input = profileSchema.parse(body);
  const patch: Record<string, string | null> = {};
  if (input.displayName !== undefined) patch.display_name = input.displayName;
  if (input.timezone !== undefined) patch.timezone = input.timezone;
  if (Object.keys(patch).length === 0) return user;
  check((await db().from('pcea_users').update(patch).eq('id', user.id)).error);
  return { ...user, display_name: patch.display_name !== undefined ? patch.display_name : user.display_name, timezone: patch.timezone ?? user.timezone };
}

export async function describeMe(user: SessionUser): Promise<PceaMe> {
  const { data, error } = await db().from('pcea_responses').select('probability, attended').eq('user_id', user.id);
  check(error);
  return {
    id: user.id,
    name: guestName(user.user_number, user.display_name),
    displayName: user.display_name,
    userNumber: user.user_number,
    timezone: user.timezone,
    recoveryCode: user.code,
    calibration: calibration((data ?? []) as { probability: number; attended: boolean | null }[]),
  };
}

/* ----------------------------------- events ---------------------------------- */

type EventRow = {
  id: string; event_date: string; start_time: string | null; timezone: string; title: string; image_url: string | null;
  cost_amount: string | number | null; cost_currency: string; note: string | null; location: string | null; created_by: string;
};
type ResponseRow = {
  event_id: string; user_id: string; probability: number; interest: Interest; note: string | null; attended: boolean | null; updated_at: string;
};
const EVENT_COLUMNS = 'id, event_date, start_time, timezone, title, image_url, cost_amount, cost_currency, note, location, created_by';

function imageUrlPrefix() {
  try { return getPublicUrlForPath(IMAGE_BUCKET, 'probe.webp').replace(/probe\.webp$/, ''); } catch { return null; }
}

const optionalText = (max: number) =>
  z.string().trim().max(max, 'noteTooLong').nullable().optional().transform(v => v || null);

const eventSchema = z.object({
  eventDate: z.string().refine(isDate, 'invalidDate'),
  startTime: z.string().refine(isTime, 'invalidTime').nullable().optional().transform(v => v ?? null),
  timezone: z.string().refine(isValidTimeZone, 'invalidTimezone'),
  title: z.string().trim().min(1, 'titleRequired').max(120, 'titleTooLong'),
  imageUrl: z.string().nullable().optional().transform(v => v || null)
    .refine(v => v === null || (imageUrlPrefix() !== null && v.startsWith(imageUrlPrefix()!)), 'invalidImage'),
  costAmount: z.number().min(0, 'negativeCost').max(99999999).nullable().optional().transform(v => v ?? null),
  costCurrency: z.string().regex(/^[A-Z]{3}$/, 'invalidCurrency').optional().default('USD'),
  note: optionalText(2000),
  location: z.string().trim().max(300, 'locationTooLong').nullable().optional().transform(v => v || null),
});

function toEventRow(input: z.infer<typeof eventSchema>) {
  return {
    event_date: input.eventDate, start_time: input.startTime, timezone: input.timezone, title: input.title,
    image_url: input.imageUrl, cost_amount: input.costAmount === null ? null : Math.round(input.costAmount * 100) / 100,
    cost_currency: input.costCurrency, note: input.note, location: input.location,
  };
}

export async function listEvents(from: unknown, to: unknown): Promise<PceaEvent[]> {
  if (!isDate(from) || !isDate(to) || to < from || addDays(from, MAX_RANGE_DAYS) < to) throw new PceaError('badRange');
  const { data: events, error } = await db().from('pcea_events').select(EVENT_COLUMNS)
    .is('deleted_at', null).gte('event_date', from).lte('event_date', to)
    .order('event_date').order('start_time', { nullsFirst: true }).order('created_at').limit(500);
  check(error);
  const rows = (events ?? []) as EventRow[];
  if (rows.length === 0) return [];

  const { data: responses, error: rErr } = await db().from('pcea_responses')
    .select('event_id, user_id, probability, interest, note, attended, updated_at')
    .in('event_id', rows.map(e => e.id)).order('updated_at', { ascending: false });
  check(rErr);
  const responseRows = (responses ?? []) as ResponseRow[];

  const userIds = [...new Set([...rows.map(e => e.created_by), ...responseRows.map(r => r.user_id)])];
  const { data: users, error: uErr } = await db().from('pcea_users').select('id, user_number, display_name').in('id', userIds);
  check(uErr);
  const names = new Map((users ?? []).map((u: { id: string; user_number: number; display_name: string | null }) =>
    [u.id, guestName(u.user_number, u.display_name)]));

  const byEvent = new Map<string, PceaResponse[]>();
  for (const r of responseRows) {
    const list = byEvent.get(r.event_id) ?? [];
    list.push({
      userId: r.user_id, userName: names.get(r.user_id) ?? 'Guest', probability: r.probability, interest: r.interest,
      note: r.note, attended: r.attended, updatedAt: r.updated_at,
    });
    byEvent.set(r.event_id, list);
  }
  const now = Date.now();
  return rows.map(e => ({
    id: e.id, eventDate: e.event_date, startTime: e.start_time ? e.start_time.slice(0, 5) : null, timezone: e.timezone,
    title: e.title, imageUrl: e.image_url, costAmount: e.cost_amount === null ? null : Number(e.cost_amount),
    costCurrency: e.cost_currency, note: e.note, location: e.location, createdBy: e.created_by, creatorName: names.get(e.created_by) ?? 'Guest',
    locked: isLocked(e.event_date, e.timezone, now), responses: byEvent.get(e.id) ?? [],
  }));
}

function requireName(user: SessionUser) {
  if (!user.display_name?.trim()) throw new PceaError('nameRequired', 403);
}

export async function createEvent(user: SessionUser, body: unknown) {
  requireName(user);
  const input = eventSchema.parse(body);
  if (isLocked(input.eventDate, input.timezone)) throw new PceaError('eventInPast');
  const since = new Date(Date.now() - 86400000).toISOString();
  const { count, error: cErr } = await db().from('pcea_events').select('id', { count: 'exact', head: true })
    .eq('created_by', user.id).gte('created_at', since);
  check(cErr);
  if ((count ?? 0) >= NEW_EVENTS_PER_USER_PER_DAY) throw new PceaError('tooManyEvents', 429);
  const { data, error } = await db().from('pcea_events').insert({ ...toEventRow(input), created_by: user.id }).select('id').single();
  check(error);
  return (data as { id: string }).id;
}

async function ownedEvent(user: SessionUser, id: string) {
  if (!z.uuid().safeParse(id).success) throw new PceaError('eventMissing', 404);
  const { data, error } = await db().from('pcea_events').select(EVENT_COLUMNS).eq('id', id).is('deleted_at', null).maybeSingle();
  check(error);
  if (!data) throw new PceaError('eventMissing', 404);
  if ((data as EventRow).created_by !== user.id) throw new PceaError('notOwner', 403);
  return data as EventRow;
}

export async function updateEvent(user: SessionUser, id: string, body: unknown) {
  const existing = await ownedEvent(user, id);
  // The event keeps the creator's original timezone unless they explicitly send a new one.
  const input = eventSchema.parse({ timezone: existing.timezone, ...(body as object) });
  check((await db().from('pcea_events').update(toEventRow(input)).eq('id', id)).error);
}

export async function deleteEvent(user: SessionUser, id: string) {
  await ownedEvent(user, id);
  check((await db().from('pcea_events').update({ deleted_at: new Date().toISOString() }).eq('id', id)).error);
}

/* --------------------------------- responses --------------------------------- */

const responseSchema = z.object({
  probability: z.number().int('probabilityInt').min(0, 'probabilityRange').max(100, 'probabilityRange').optional(),
  interest: z.enum(['high', 'some', 'none']).optional(),
  note: optionalText(1000),
  attended: z.boolean().nullable().optional(),
});

export async function saveResponse(user: SessionUser, eventId: string, body: unknown) {
  requireName(user);
  if (!z.uuid().safeParse(eventId).success) throw new PceaError('eventMissing', 404);
  const raw = (body ?? {}) as Record<string, unknown>;
  const input = responseSchema.parse(raw);
  const patch: Record<string, unknown> = {};
  if (input.probability !== undefined) patch.probability = input.probability;
  if (input.interest !== undefined) patch.interest = input.interest;
  if ('note' in raw) patch.note = input.note;
  if (input.attended !== undefined) patch.attended = input.attended;

  const { data: existing, error } = await db().from('pcea_responses').select('id')
    .eq('event_id', eventId).eq('user_id', user.id).maybeSingle();
  check(error);
  if (existing) {
    if (Object.keys(patch).length) check((await db().from('pcea_responses').update(patch).eq('id', (existing as { id: string }).id)).error);
    return;
  }
  if (patch.probability === undefined || patch.interest === undefined) throw new PceaError('needBoth');
  check((await db().from('pcea_responses').insert({ ...patch, event_id: eventId, user_id: user.id })).error);
}

export async function deleteResponse(user: SessionUser, eventId: string) {
  if (!z.uuid().safeParse(eventId).success) throw new PceaError('eventMissing', 404);
  const { data: ev, error } = await db().from('pcea_events').select('event_date, timezone').eq('id', eventId).maybeSingle();
  check(error);
  if (!ev) throw new PceaError('eventMissing', 404);
  if (isLocked((ev as EventRow).event_date, (ev as EventRow).timezone)) throw new PceaError('responseLocked', 409);
  check((await db().from('pcea_responses').delete().eq('event_id', eventId).eq('user_id', user.id)).error);
}

/* ----------------------------------- route ----------------------------------- */

/** The driving route through one day's events that have a location, in the same order the page lists them. */
export async function routeForDay(date: unknown) {
  if (!isDate(date)) throw new PceaError('invalidDate');
  const events = await listEvents(date, date);
  return dayRoute(events.filter(e => e.location).map(e => ({ eventId: e.id, title: e.title, location: e.location! })));
}
