'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { appStorage } from '@/lib/storage';
import LocationInput from './LocationInput';
import RouteMap from './RouteMap';
import { dictionaries, errorText, isErrorCode, LANG_STORAGE_KEY, type Dict, type ErrorCode, type Lang } from '@/lib/pcea/i18n';
import { eventStats } from '@/lib/pcea/stats';
import {
  addDays, browserTimeZone, formatClock, formatDateLabel, isLocked, todayIn, viewerTime, weekdayAndDay, zoneLabel, zonedToInstant,
} from '@/lib/pcea/time';
import type { DayRoute } from '@/lib/pcea/route';
import { INTEREST_OPTIONS, PROBABILITY_PRESETS, type Interest, type PceaEvent, type PceaMe, type PceaResponse } from '@/lib/pcea/types';

const CURRENCIES = ['USD', 'CNY', 'EUR', 'GBP', 'JPY', 'CAD', 'HKD', 'AUD', 'SGD'];
const card = 'rounded-2xl border border-[#e7e3da] bg-[#fffdf9] shadow-[0_12px_32px_#3b302008]';
const chip = (active: boolean) =>
  `rounded-full border px-3 py-1.5 text-xs transition ${active ? 'border-[#2f3a33] bg-[#2f3a33] text-white' : 'border-[#ddd8cc] bg-white text-[#3f4a43] hover:border-[#9aa69d]'}`;
const fieldLabel = 'mb-1 block text-[11px] font-semibold tracking-wide text-[#7b8379]';
const input = 'w-full rounded-xl border border-[#ddd8cc] bg-white px-3 py-2 text-sm text-[#25302a] outline-none focus:border-[#7d9a86]';

/* ------------------------------- language & api ------------------------------ */

const LangContext = createContext<{ lang: Lang; t: Dict }>({ lang: 'en', t: dictionaries.en });
const useT = () => useContext(LangContext);

/** An API failure; rendered in whatever language is active when it is shown. */
class ApiError extends Error {
  constructor(readonly code: ErrorCode | null, readonly status: number, fallback: string) { super(fallback); }
}

function errorMessage(error: unknown, lang: Lang) {
  if (error instanceof ApiError) {
    if (error.code) return errorText(error.code, lang);
    return error.message || dictionaries[lang].requestFailed(error.status);
  }
  return error instanceof Error ? error.message : String(error);
}

async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init?.json !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(isErrorCode(data?.code) ? data.code : null, res.status, typeof data?.error === 'string' ? data.error : '');
  return data as T;
}

function readStoredLang(): Lang {
  try { return localStorage.getItem(LANG_STORAGE_KEY) === 'zh' ? 'zh' : 'en'; } catch { return 'en'; }
}

/* ----------------------------------- helpers --------------------------------- */

const mondayOf = (date: string) => addDays(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));
const pct = (n: number) => `${Math.round(n * 100)}%`;
function formatCost(amount: number | null, currency: string, t: Dict) {
  if (amount === null) return null;
  if (amount === 0) return t.free;
  try { return new Intl.NumberFormat(t.locale, { style: 'currency', currency }).format(amount); } catch { return `${amount} ${currency}`; }
}

const AVATAR_COLORS = ['#c8643b', '#3f7d6e', '#5b6fb0', '#b0558a', '#8a7a2e', '#4f8fb0', '#9a5bb5', '#5f8a3f'];
function avatarColor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
const initialOf = (name: string) => (Array.from(name.trim())[0] ?? '?').toUpperCase();

/** Plain text with http(s) links made clickable; long URLs wrap instead of overflowing. */
function Linkified({ text, className }: { text: string; className: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"]+)/g);
  return (
    <p className={`whitespace-pre-wrap [overflow-wrap:anywhere] ${className}`}>
      {parts.map((part, i) => i % 2 === 1
        ? <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow" className="text-[#3f6f8f] underline decoration-[#3f6f8f]/30 underline-offset-2 hover:decoration-[#3f6f8f]">{part}</a>
        : part)}
    </p>
  );
}

/* ------------------------------------ page ----------------------------------- */

export default function PCEA() {
  const [lang, setLang] = useState<Lang>('en');
  const [tz, setTz] = useState('UTC');
  const [me, setMe] = useState<PceaMe | null>(null);
  const [today, setToday] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [events, setEvents] = useState<PceaEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [editor, setEditor] = useState<{ event: PceaEvent | null } | null>(null);
  const [showAccount, setShowAccount] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const t = dictionaries[lang];

  // Sign in (anonymously, by cookie), restore the language, and pick the starting day.
  useEffect(() => {
    setLang(readStoredLang());
    const zone = browserTimeZone();
    setTz(zone);
    const day = todayIn(zone);
    setToday(day);
    const fromUrl = new URLSearchParams(window.location.search).get('date');
    setSelected(fromUrl && /^\d{4}-\d{2}-\d{2}$/.test(fromUrl) ? fromUrl : day);
    api<PceaMe>('/pcea/api/me', { method: 'POST', json: { timezone: zone } }).then(setMe).catch(setError);
  }, []);

  useEffect(() => { document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'; }, [lang]);
  const toggleLang = () => {
    const next: Lang = lang === 'en' ? 'zh' : 'en';
    setLang(next);
    try { localStorage.setItem(LANG_STORAGE_KEY, next); } catch { /* preference just won't persist */ }
  };

  const weekStart = selected ? mondayOf(selected) : null;
  const refresh = useCallback(async () => {
    if (!weekStart) return;
    try {
      const data = await api<{ events: PceaEvent[] }>(`/pcea/api/events?from=${weekStart}&to=${addDays(weekStart, 6)}`);
      setEvents(data.events);
      setError(null);
    } catch (e) { setError(e); }
    finally { setLoading(false); }
  }, [weekStart]);
  useEffect(() => { void refresh(); }, [refresh]);

  const refreshMe = useCallback(async () => {
    try { setMe(await api<PceaMe>('/pcea/api/me', { method: 'POST', json: { timezone: tz } })); } catch { /* keep the old one */ }
  }, [tz]);

  useEffect(() => {
    if (!selected) return;
    const url = new URL(window.location.href);
    url.searchParams.set('date', selected);
    window.history.replaceState(null, '', url);
  }, [selected]);

  const days = useMemo(() => weekStart ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)) : [], [weekStart]);
  const dayEvents = events.filter(e => e.eventDate === selected);
  const dayExpected = dayEvents.reduce((sum, e) => sum + eventStats(e.responses).expected, 0);

  // The day's driving route, in the same order as the list; refetched whenever a stop's location changes.
  const located = dayEvents.filter(e => e.location);
  const routeKey = selected && located.length ? `${selected}|${located.map(e => `${e.id}:${e.location}`).join('|')}` : null;
  const [route, setRoute] = useState<{ key: string; data: DayRoute } | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  useEffect(() => {
    if (!routeKey || !selected) return;
    let cancelled = false;
    setRouteLoading(true);
    api<DayRoute>(`/pcea/api/route?date=${selected}`)
      .then(data => { if (!cancelled) setRoute({ key: routeKey, data }); })
      .catch(() => { /* the list still works without the map */ })
      .finally(() => { if (!cancelled) setRouteLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- routeKey already encodes `selected`
  }, [routeKey]);
  const dayRoute = route && routeKey && route.key === routeKey ? route.data : null;
  const letters = new Map(dayRoute?.stops.map(s => [s.eventId, s.letter]) ?? []);
  const ctx = useMemo(() => ({ lang, t }), [lang, t]);

  return (
    <LangContext.Provider value={ctx}>
      <main className="min-h-screen bg-[#f6f3ec] px-4 pb-20 pt-3 text-[#25302a] sm:px-8 sm:pt-8" style={{ fontFamily: 'ui-sans-serif, system-ui, -apple-system, "PingFang SC", sans-serif', letterSpacing: 0 }}>
        <div className="mx-auto max-w-3xl">
          <header>
            <div className="flex items-center justify-between gap-2 sm:items-start sm:gap-4">
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <h1 className="whitespace-nowrap font-serif text-[length:calc((100vw_-_148px)/18.7)] leading-tight tracking-tight text-[#25302a] sm:whitespace-normal sm:text-3xl">Probability Calibration for Event Attendance</h1>
                <button type="button" onClick={() => setShowInfo(v => !v)} aria-expanded={showInfo} aria-controls="pcea-tagline" aria-label={t.aboutLabel}
                  className="grid size-4 shrink-0 place-items-center rounded-full border border-[#c9d0c7] font-serif text-[10px] italic leading-none text-[#8a9a8c] hover:border-[#8a9a8c] sm:hidden">i</button>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                <button type="button" onClick={toggleLang} aria-label={t.switchToLabel} lang={lang === 'en' ? 'zh-CN' : 'en'}
                  className="rounded-full border border-[#ddd8cc] bg-white px-2.5 py-1 text-xs text-[#5d665e] hover:border-[#9aa69d] sm:px-3 sm:py-2 sm:text-sm">
                  {t.switchTo}
                </button>
                <button type="button" onClick={() => setShowAccount(v => !v)} aria-expanded={showAccount} aria-label={me ? `${me.name} — ${t.identity}` : t.signingIn}
                  title={me?.name} data-testid="me-avatar"
                  className="grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold text-white ring-2 ring-white shadow-sm hover:opacity-90 sm:size-9"
                  style={{ backgroundColor: me ? avatarColor(me.id) : '#cfcac0' }}>
                  {me ? initialOf(me.name) : '…'}
                </button>
              </div>
            </div>
            <p id="pcea-tagline" className={`mt-2 max-w-md text-sm text-[#6d756c] ${showInfo ? '' : 'hidden'} sm:block`}>{t.tagline}</p>
          </header>

          {me && !me.displayName && <WelcomeDialog onDone={m => { setMe(m); void refresh(); }} />}
          {showAccount && me && <AccountPanel me={me} tz={tz} onChange={m => { setMe(m); void refresh(); }} />}
          {me && <CalibrationStrip me={me} />}

          {error !== null && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage(error, lang)}</p>}

          {weekStart && selected && (
            <nav className="mt-6 flex items-center gap-2" aria-label={t.pickDate}>
              <button type="button" aria-label={t.prevWeek} className="rounded-full px-2 py-1 text-lg text-[#6d756c] hover:bg-white" onClick={() => setSelected(addDays(selected, -7))}>‹</button>
              <div className="grid flex-1 grid-cols-7 gap-1.5">
                {days.map(d => {
                  const count = events.filter(e => e.eventDate === d).length;
                  const active = d === selected;
                  const [weekday, dayOfMonth] = weekdayAndDay(d, t.locale);
                  return (
                    <button key={d} type="button" onClick={() => setSelected(d)} aria-pressed={active} aria-label={formatDateLabel(d, t.locale)}
                      className={`rounded-xl border px-1 py-2 text-center ${active ? 'border-[#2f3a33] bg-[#2f3a33] text-white' : 'border-[#e7e3da] bg-white hover:border-[#9aa69d]'}`}>
                      <span className="block text-[10px] opacity-70">{weekday}</span>
                      <span className="block text-sm font-semibold">{dayOfMonth}</span>
                      <span className={`mx-auto mt-1 block h-1.5 w-1.5 rounded-full ${count ? (active ? 'bg-white' : 'bg-[#d0763f]') : 'bg-transparent'}`} />
                      {d === today && <span className="block text-[9px] opacity-70">{t.today}</span>}
                    </button>
                  );
                })}
              </div>
              <button type="button" aria-label={t.nextWeek} className="rounded-full px-2 py-1 text-lg text-[#6d756c] hover:bg-white" onClick={() => setSelected(addDays(selected, 7))}>›</button>
            </nav>
          )}

          {selected && (
            <section className="mt-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-serif text-xl">{formatDateLabel(selected, t.locale)}</h2>
                <p className="text-sm text-[#6d756c]">
                  {t.dayEvents(dayEvents.length)} · {t.dayExpected} <strong className="text-[#25302a]" data-testid="day-expected">{dayExpected.toFixed(1)}</strong>{t.dayExpectedUnit && ` ${t.dayExpectedUnit}`}
                </p>
              </div>
              <button type="button" disabled={!me} onClick={() => setEditor({ event: null })}
                className="rounded-full bg-[#d0763f] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#b9652f] disabled:opacity-50">
                {t.addEvent}
              </button>
            </section>
          )}

          <div className="mt-4 space-y-4">
            {routeKey && <RouteMap route={dayRoute} loading={routeLoading} skipped={dayEvents.length - located.length} t={t} lang={lang} />}
            {loading && <p className="text-sm text-[#8a918a]">{t.loading}</p>}
            {!loading && dayEvents.length === 0 && (
              <div className={`${card} px-6 py-10 text-center text-sm text-[#7b8379]`}>{t.emptyDay}</div>
            )}
            {dayEvents.map(e => (
              <EventCard key={e.id} event={e} me={me} tz={tz} letter={letters.get(e.id) ?? null}
                onEdit={() => setEditor({ event: e })}
                onChanged={async (affectsCalibration) => { await refresh(); if (affectsCalibration) void refreshMe(); }} />
            ))}
          </div>
        </div>

        {editor && selected && (
          <EventEditor event={editor.event} defaultDate={selected} tz={tz} today={today ?? selected}
            onClose={() => setEditor(null)}
            onSaved={async date => { setEditor(null); setSelected(date); await refresh(); }} />
        )}
      </main>
    </LangContext.Provider>
  );
}

/* ---------------------------------- account ---------------------------------- */

function AccountPanel({ me, tz, onChange }: { me: PceaMe; tz: string; onChange: (me: PceaMe) => void }) {
  const { t, lang } = useT();
  const [name, setName] = useState(me.displayName ?? '');
  const [code, setCode] = useState('');
  const [reveal, setReveal] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<PceaMe>, ok: string) => {
    setBusy(true); setMsg(null);
    try { onChange(await fn()); setMsg(ok); } catch (e) { setMsg(errorMessage(e, lang)); } finally { setBusy(false); }
  };

  return (
    <section className={`${card} mt-4 space-y-4 p-5 text-sm`} aria-label={t.identity}>
      <p className="text-[#6d756c]">{t.youAre} <strong className="text-[#25302a]">Guest #{me.userNumber}</strong>. {t.savedInBrowser} {t.yourTimezone} {zoneLabel(tz, Date.now())}</p>
      <form className="flex gap-2" onSubmit={e => { e.preventDefault(); void run(() => api('/pcea/api/me', { method: 'PATCH', json: { displayName: name } }), t.nicknameSaved); }}>
        <input className={input} value={name} maxLength={40} placeholder={t.nicknamePlaceholder} required onChange={e => setName(e.target.value)} aria-label={t.nickname} />
        <button disabled={busy || !name.trim() || name.trim() === me.displayName} className="shrink-0 rounded-xl bg-[#2f3a33] px-4 text-white disabled:opacity-50">{t.save}</button>
      </form>
      <div>
        <p className={fieldLabel}>{t.recoveryCode}</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-xl bg-[#f1eee6] px-3 py-2 font-mono text-[13px]" data-testid="recovery-code">{reveal ? me.recoveryCode : 'PCEA-•••••-•••••-•••••'}</code>
          <button type="button" className="rounded-xl border border-[#ddd8cc] px-3 py-2" onClick={() => setReveal(v => !v)}>{reveal ? t.hide : t.show}</button>
          <button type="button" className="rounded-xl border border-[#ddd8cc] px-3 py-2" onClick={() => { void navigator.clipboard?.writeText(me.recoveryCode); setMsg(t.copied); }}>{t.copy}</button>
        </div>
      </div>
      <form className="flex gap-2" onSubmit={e => { e.preventDefault(); void run(() => api('/pcea/api/me/restore', { method: 'POST', json: { code } }), t.restored); }}>
        <input className={`${input} font-mono`} value={code} placeholder={t.restorePlaceholder} onChange={e => setCode(e.target.value)} aria-label={t.restorePlaceholder} />
        <button disabled={busy || !code.trim()} className="shrink-0 rounded-xl border border-[#2f3a33] px-4 disabled:opacity-50">{t.restore}</button>
      </form>
      {msg && <p className="text-[#6d756c]" role="status">{msg}</p>}
    </section>
  );
}

function CalibrationStrip({ me }: { me: PceaMe }) {
  const { t } = useT();
  const c = me.calibration;
  if (c.resolved === 0) return null;
  return (
    <section className={`${card} mt-4 p-4 text-sm`} aria-label={t.myCalibration}>
      <p className="text-[#6d756c]">
        <strong className="text-[#25302a]">{t.resolved(c.resolved)}</strong> · {t.meanPrediction} {pct(c.meanPrediction!)} · {t.attendedRate} {pct(c.attendedRate!)} ·
        Brier <strong className="text-[#25302a]">{c.brier!.toFixed(3)}</strong> <span className="text-xs">{t.brierHint}</span>
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {c.buckets.map(b => (
          <span key={b.label} className="rounded-lg bg-[#f1eee6] px-2.5 py-1 text-xs">{t.bucket(b.label, pct(b.actual), b.n)}</span>
        ))}
      </div>
    </section>
  );
}

/* ----------------------------------- event ----------------------------------- */

function TimeLine({ event, tz }: { event: PceaEvent; tz: string }) {
  const { t } = useT();
  const instant = zonedToInstant(event.eventDate, event.startTime ?? '12:00', event.timezone);
  const other = viewerTime(event, tz, t.locale);
  return (
    <div className="text-xs text-[#6d756c]">
      <span>{event.startTime ? formatClock(event.startTime, t.locale) : t.allDay} · {zoneLabel(event.timezone, instant)}</span>
      {other && (
        <span className="ml-2 font-semibold text-[#d42a2a]" data-testid="viewer-time">
          {other.text ? `= ${t.yourTime} ${other.text}` : t.dateByEventZone} · {other.zone}
        </span>
      )}
    </div>
  );
}

function EventCard({ event, me, tz, letter, onEdit, onChanged }: {
  event: PceaEvent; me: PceaMe | null; tz: string; letter: string | null; onEdit: () => void; onChanged: (affectsCalibration: boolean) => Promise<void>;
}) {
  const { t, lang } = useT();
  const stats = eventStats(event.responses);
  const mine = me ? event.responses.find(r => r.userId === me.id) ?? null : null;
  const isOwner = me?.id === event.createdBy;
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  // Re-check on the client so a page left open past midnight locks without a reload.
  const locked = event.locked || isLocked(event.eventDate, event.timezone);
  const cost = formatCost(event.costAmount, event.costCurrency, t);

  const remove = async () => {
    if (!confirm(t.confirmDelete(event.title))) return;
    try { await api(`/pcea/api/events/${event.id}`, { method: 'DELETE' }); await onChanged(true); } catch (e) { alert(errorMessage(e, lang)); }
  };

  return (
    <article className={`${card} overflow-hidden`} aria-label={event.title}>
      {event.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={event.imageUrl} alt="" className="h-44 w-full object-cover" />
      )}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-serif text-lg leading-snug [overflow-wrap:anywhere]">{event.title}</h3>
            <TimeLine event={event} tz={tz} />
            {event.location && (
              <p className="mt-0.5 flex items-start gap-1.5 text-xs text-[#4b544d]">
                {letter
                  ? <span className="mt-px grid size-4 shrink-0 place-items-center rounded-full bg-[#d0763f] text-[9px] font-bold text-white" data-testid="stop-letter">{letter}</span>
                  : <span aria-hidden>📍</span>}
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`} target="_blank" rel="noopener noreferrer"
                  title={t.openInMaps} className="[overflow-wrap:anywhere] underline decoration-[#4b544d]/25 underline-offset-2 hover:decoration-[#4b544d]">{event.location}</a>
              </p>
            )}
            <p className="mt-1 text-xs text-[#8a918a]">
              {cost && <span className="mr-2 rounded bg-[#f1eee6] px-1.5 py-0.5 text-[#4b544d]">{cost}</span>}
              {t.createdBy(event.creatorName)}{event.locked && <span className="ml-2 rounded bg-[#ece9e1] px-1.5 py-0.5">{t.endedLocked}</span>}
            </p>
          </div>
          {isOwner && (
            <div className="flex shrink-0 gap-1 text-xs">
              <button type="button" className="rounded-lg px-2 py-1 text-[#6d756c] hover:bg-[#f1eee6]" onClick={onEdit}>{t.edit}</button>
              <button type="button" className="rounded-lg px-2 py-1 text-red-600 hover:bg-red-50" onClick={remove}>{t.delete}</button>
            </div>
          )}
        </div>
        {event.note && <Linkified text={event.note} className="mt-3 text-sm text-[#4b544d]" />}

        <div className="mt-4 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 rounded-xl bg-[#f6f3ec] p-3">
          <div className="text-center">
            <div className="font-serif text-3xl leading-none" data-testid="expected">{stats.expected.toFixed(1)}</div>
            <div className="mt-1 text-[10px] text-[#7b8379]">{t.expected}</div>
          </div>
          <div className="space-y-1.5 text-xs text-[#5d665e]">
            <div>{t.responseSummary(stats.count, stats.likely, stats.sure)}
              {stats.resolved > 0 && <> · <strong>{t.wentSummary(stats.attended, stats.resolved)}</strong></>}
            </div>
            <InterestBar counts={stats.interest} avatars={event.responses.length > 0 && (
              <AvatarStack responses={event.responses} onOpen={() => setOpen(true)} />
            )} />
          </div>
        </div>

        {/* Once answered, my answer lives in the list below (with edit/delete) instead of a standing form. */}
        {me && (locked || !mine) && <MyResponse event={event} mine={mine} locked={locked} onSaved={onChanged} />}

        {event.responses.length > 0 && (
          <div className="mt-4">
            <button type="button" className="text-xs font-semibold text-[#6d7f71]" onClick={() => setOpen(v => !v)} aria-expanded={open}>
              {open ? t.collapse : t.showAll(event.responses.length)}
            </button>
            {open && (
              <ResponseList responses={event.responses} meId={me?.id}
                mine={mine && !locked ? {
                  editing,
                  onEdit: () => setEditing(true),
                  onDelete: async () => { await api(`/pcea/api/events/${event.id}/response`, { method: 'DELETE' }); await onChanged(false); },
                  editor: <MyResponse event={event} mine={mine} locked={false} onSaved={onChanged} onClose={() => setEditing(false)} />,
                } : null} />
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function InterestBar({ counts, avatars }: { counts: Record<Interest, number>; avatars?: React.ReactNode }) {
  const { t } = useT();
  const total = counts.high + counts.some + counts.none;
  const colors: Record<Interest, string> = { high: 'bg-[#d0763f]', some: 'bg-[#e8b98f]', none: 'bg-[#cfcac0]' };
  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-[#e7e3da]" aria-hidden>
          {total > 0 && INTEREST_OPTIONS.map(o => <div key={o.value} className={colors[o.value]} style={{ width: `${(counts[o.value] / total) * 100}%` }} />)}
        </div>
        {avatars}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3">
        {INTEREST_OPTIONS.map(o => <span key={o.value}>{o.emoji} {t.interest[o.value]} {counts[o.value]}</span>)}
      </div>
    </div>
  );
}

const MAX_AVATARS = 5;

/** Overlapping initials of everyone who answered, most likely to go first. Click to see all answers. */
function AvatarStack({ responses, onOpen }: { responses: PceaResponse[]; onOpen: () => void }) {
  const { t } = useT();
  const sorted = [...responses].sort((a, b) => b.probability - a.probability || a.userName.localeCompare(b.userName));
  const shown = sorted.slice(0, sorted.length > MAX_AVATARS ? MAX_AVATARS - 1 : MAX_AVATARS);
  const extra = sorted.length - shown.length;
  const circle = 'grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold ring-2 ring-[#f6f3ec] -ml-1.5 first:ml-0';
  return (
    <button type="button" onClick={onOpen} className="flex shrink-0 items-center rounded-full pl-0.5 hover:opacity-90" aria-label={`${sorted.map(r => r.userName).join(', ')} — ${t.showAll(responses.length)}`} data-testid="avatar-stack">
      {shown.map((r, i) => (
        <span key={r.userId} className={`${circle} text-white`} style={{ backgroundColor: avatarColor(r.userId), zIndex: shown.length - i }}
          title={t.avatarTitle(r.userName, r.probability, t.interest[r.interest])}>
          {initialOf(r.userName)}
        </span>
      ))}
      {extra > 0 && <span className={`${circle} bg-[#e7e3da] text-[10px] text-[#5d665e]`} style={{ zIndex: shown.length + 1 }} title={t.moreAnswers(extra)}>+{extra}</span>}
    </button>
  );
}

/** Shown until the visitor has a name: everything is public, so people need to know who answered. */
function WelcomeDialog({ onDone }: { onDone: (me: PceaMe) => void }) {
  const { t, lang } = useT();
  const [mode, setMode] = useState<'name' | 'code'>('name');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      onDone(mode === 'name'
        ? await api<PceaMe>('/pcea/api/me', { method: 'PATCH', json: { displayName: value } })
        : await api<PceaMe>('/pcea/api/me/restore', { method: 'POST', json: { code: value } }));
    } catch (err) { setError(errorMessage(err, lang)); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#25302a]/40 p-4 backdrop-blur-[2px]">
      <form role="dialog" aria-modal="true" aria-label={t.welcomeTitle} onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-3xl bg-[#fffdf9] p-6 shadow-xl">
        <h2 className="font-serif text-2xl">{mode === 'name' ? t.welcomeTitle : t.restore}</h2>
        {mode === 'name' && <p className="text-sm text-[#6d756c]">{t.welcomeBody}</p>}
        <div className="flex items-center gap-3">
          {mode === 'name' && (
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#c8643b] text-lg font-semibold text-white" aria-hidden>
              {value.trim() ? initialOf(value) : '?'}
            </span>
          )}
          <input key={mode} className={`${input} ${mode === 'code' ? 'font-mono' : ''}`} autoFocus required maxLength={40}
            value={value} onChange={e => setValue(e.target.value)}
            placeholder={mode === 'name' ? t.nicknamePlaceholder : 'PCEA-XXXXX-XXXXX-XXXXX'}
            aria-label={mode === 'name' ? t.nickname : t.restorePlaceholder} />
        </div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button disabled={busy || !value.trim()} className="w-full rounded-xl bg-[#d0763f] py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {mode === 'name' ? t.continue : t.restore}
        </button>
        <button type="button" className="w-full text-xs text-[#6d7f71] underline underline-offset-2"
          onClick={() => { setMode(mode === 'name' ? 'code' : 'name'); setValue(''); setError(null); }}>
          {mode === 'name' ? t.haveCode : t.newHere}
        </button>
      </form>
    </div>
  );
}

function MyResponse({ event, mine, locked, onSaved, onClose }: {
  event: PceaEvent; mine: PceaResponse | null; locked: boolean; onSaved: (affectsCalibration: boolean) => Promise<void>; onClose?: () => void;
}) {
  const { t, lang } = useT();
  const [probability, setProbability] = useState<number | null>(mine?.probability ?? null);
  const [interest, setInterest] = useState<Interest | null>(mine?.interest ?? null);
  const [note, setNote] = useState(mine?.note ?? '');
  const [custom, setCustom] = useState(mine && !PROBABILITY_PRESETS.includes(mine.probability as never) ? String(mine.probability) : '');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: true } | { error: unknown } | null>(null);
  useEffect(() => {
    setProbability(mine?.probability ?? null);
    setInterest(mine?.interest ?? null);
    setNote(mine?.note ?? '');
  }, [mine?.probability, mine?.interest, mine?.note]);

  const request = async (fn: () => Promise<unknown>, affectsCalibration: boolean) => {
    setBusy(true); setStatus(null);
    try { await fn(); await onSaved(affectsCalibration); setStatus({ ok: true }); onClose?.(); }
    catch (e) { setStatus({ error: e }); } finally { setBusy(false); }
  };
  const save = (body: Record<string, unknown>, affectsCalibration = false) =>
    request(() => api(`/pcea/api/events/${event.id}/response`, { method: 'PUT', json: body }), affectsCalibration);

  const statusLine = status && (
    <span className="text-xs text-[#6d756c]" role="status">{'ok' in status ? t.saved : errorMessage(status.error, lang)}</span>
  );
  const dirty = probability !== (mine?.probability ?? null) || interest !== (mine?.interest ?? null) || note !== (mine?.note ?? '');
  const interestOf = (value: Interest) => `${INTEREST_OPTIONS.find(o => o.value === value)?.emoji} ${t.interest[value]}`;

  if (locked) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-[#d8d2c4] p-3 text-sm" data-testid="my-response-locked">
        {mine ? (
          <>
            <p className="text-[#5d665e]">{t.youSaid} <strong>{mine.probability}%</strong> {t.willGo} · {interestOf(mine.interest)}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-[#7b8379]">{t.outcome}</span>
              <button type="button" disabled={busy} className={chip(mine.attended === true)} onClick={() => save({ attended: true }, true)}>{t.went}</button>
              <button type="button" disabled={busy} className={chip(mine.attended === false)} onClick={() => save({ attended: false }, true)}>{t.didntGo}</button>
            </div>
            <div className="mt-2 flex gap-2">
              <input className={input} value={note} maxLength={1000} placeholder={t.addThought} onChange={e => setNote(e.target.value)} aria-label={t.myNote} />
              <button type="button" disabled={busy || note === (mine.note ?? '')} className="shrink-0 rounded-xl border border-[#2f3a33] px-3 text-xs disabled:opacity-40" onClick={() => save({ note })}>{t.saveNote}</button>
            </div>
          </>
        ) : <p className="text-[#8a918a]">{t.noPrediction}</p>}
        {statusLine && <p className="mt-1">{statusLine}</p>}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-[#e7e3da] p-3" data-testid="my-response">
      <div>
        <p className={fieldLabel}>{t.probabilityLabel}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {PROBABILITY_PRESETS.map(p => (
            <button key={p} type="button" className={chip(probability === p && !custom)} onClick={() => { setProbability(p); setCustom(''); }}>{p}%</button>
          ))}
          <label className="flex items-center gap-1 text-xs text-[#6d756c]">
            <input type="number" min={0} max={100} inputMode="numeric" placeholder={t.custom} value={custom} aria-label={t.customProbability}
              className={`w-20 rounded-full border px-3 py-1.5 text-xs outline-none ${custom ? 'border-[#2f3a33]' : 'border-[#ddd8cc]'}`}
              onChange={e => {
                setCustom(e.target.value);
                const n = Number(e.target.value);
                setProbability(e.target.value !== '' && Number.isInteger(n) && n >= 0 && n <= 100 ? n : null);
              }} />%
          </label>
        </div>
      </div>
      <div>
        <p className={fieldLabel}>{t.interestLabel}</p>
        <div className="flex flex-wrap gap-1.5">
          {INTEREST_OPTIONS.map(o => (
            <button key={o.value} type="button" className={chip(interest === o.value)} onClick={() => setInterest(o.value)}>{o.emoji} {t.interest[o.value]}</button>
          ))}
        </div>
      </div>
      <textarea className={`${input} min-h-[60px]`} value={note} maxLength={1000} placeholder={t.whyPlaceholder} onChange={e => setNote(e.target.value)} aria-label={t.myNote} />
      <div className="flex items-center gap-3">
        <button type="button" disabled={busy || probability === null || interest === null || !dirty}
          className="rounded-xl bg-[#2f3a33] px-4 py-2 text-sm text-white disabled:opacity-40"
          onClick={() => save({ probability, interest, note })}>
          {mine ? t.update : t.submit}
        </button>
        {onClose && <button type="button" disabled={busy} className="text-xs text-[#8a918a] hover:text-[#25302a]" onClick={onClose}>{t.cancel}</button>}
        {statusLine}
      </div>
    </div>
  );
}

type MineControls = { editing: boolean; onEdit: () => void; onDelete: () => Promise<void>; editor: React.ReactNode };

function ResponseList({ responses, meId, mine }: { responses: PceaResponse[]; meId?: string; mine: MineControls | null }) {
  const { t } = useT();
  return (
    <ul className="mt-2 divide-y divide-[#eee9df]">
      {[...responses].sort((a, b) => b.probability - a.probability).map(r => {
        const emoji = INTEREST_OPTIONS.find(o => o.value === r.interest)?.emoji;
        const isMine = r.userId === meId;
        if (isMine && mine?.editing) return <li key={r.userId} className="py-2" data-testid="my-response-row">{mine.editor}</li>;
        return (
          <li key={r.userId} className="py-2 text-sm" data-testid={isMine ? 'my-response-row' : undefined}>
            <div className="flex flex-wrap items-center gap-2">
              <strong className="font-medium">{r.userName}{isMine && <span className="ml-1 text-xs text-[#8a918a]">{t.me}</span>}</strong>
              <span className="rounded bg-[#f1eee6] px-1.5 text-xs">{r.probability}%</span>
              <span className="text-xs">{emoji} {t.interest[r.interest]}</span>
              {r.attended !== null && <span className="text-xs">{r.attended ? t.went : t.didntGo}</span>}
              {isMine && mine && <MineActions controls={mine} />}
            </div>
            {r.note && <Linkified text={r.note} className="mt-0.5 text-xs text-[#6d756c]" />}
          </li>
        );
      })}
    </ul>
  );
}

/** Edit / delete for my own answer; delete asks once more before it goes. */
function MineActions({ controls }: { controls: MineControls }) {
  const { t, lang } = useT();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const btn = 'rounded-lg px-2 py-0.5 text-xs';
  if (confirming) {
    return (
      <span className="ml-auto flex flex-wrap items-center gap-1 text-xs" role="group" aria-label={t.confirmDeleteAnswer}>
        <span className="text-red-700">{t.confirmDeleteAnswer}</span>
        <button type="button" disabled={busy} className={`${btn} bg-red-600 text-white disabled:opacity-50`}
          onClick={async () => {
            setBusy(true); setError(null);
            try { await controls.onDelete(); } catch (e) { setError(e); setBusy(false); }
          }}>{t.confirmDeleteYes}</button>
        <button type="button" disabled={busy} className={`${btn} text-[#6d756c] hover:bg-[#f1eee6]`} onClick={() => setConfirming(false)}>{t.cancel}</button>
        {error !== null && <span role="alert" className="w-full text-red-600">{errorMessage(error, lang)}</span>}
      </span>
    );
  }
  return (
    <span className="ml-auto flex gap-1">
      <button type="button" className={`${btn} text-[#6d756c] hover:bg-[#f1eee6]`} onClick={controls.onEdit}>{t.edit}</button>
      <button type="button" className={`${btn} text-red-600 hover:bg-red-50`} onClick={() => setConfirming(true)}>{t.delete}</button>
    </span>
  );
}

/* ---------------------------------- editor ----------------------------------- */

function EventEditor({ event, defaultDate, tz, today, onClose, onSaved }: {
  event: PceaEvent | null; defaultDate: string; tz: string; today: string; onClose: () => void; onSaved: (date: string) => Promise<void>;
}) {
  const { t, lang } = useT();
  const zone = event?.timezone ?? tz;
  const timingLocked = !!event?.locked;
  const [title, setTitle] = useState(event?.title ?? '');
  const [date, setDate] = useState(event?.eventDate ?? (defaultDate < today ? today : defaultDate));
  const [time, setTime] = useState(event?.startTime ?? '');
  const [cost, setCost] = useState(event?.costAmount !== null && event?.costAmount !== undefined ? String(event.costAmount) : '');
  const [currency, setCurrency] = useState(event?.costCurrency ?? 'USD');
  const [note, setNote] = useState(event?.note ?? '');
  const [location, setLocation] = useState(event?.location ?? '');
  const [imageUrl, setImageUrl] = useState<string | null>(event?.imageUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const upload = async (file: File) => {
    setUploading(true); setError(null);
    try {
      const { convertToWebP } = await import('@/lib/imageUpload');
      const blob = await convertToWebP(file, 0.85);
      const ext = blob.type === 'image/webp' ? 'webp' : (blob.type.split('/')[1] || 'jpg');
      const { data, error: err } = await appStorage.from('pcea').upload(`events/${crypto.randomUUID()}.${ext}`, blob, { contentType: blob.type || 'image/webp' });
      if (err || !data) throw err ?? new Error('upload failed');
      setImageUrl(data.publicUrl);
    } catch (e) { setError(t.uploadFailed(errorMessage(e, lang))); } finally { setUploading(false); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const body = {
      title, eventDate: date, startTime: time || null, timezone: zone, imageUrl, note, location,
      costAmount: cost.trim() === '' ? null : Number(cost), costCurrency: currency,
    };
    try {
      if (event) await api(`/pcea/api/events/${event.id}`, { method: 'PATCH', json: body });
      else await api('/pcea/api/events', { method: 'POST', json: body });
      await onSaved(date);
    } catch (err) { setError(errorMessage(err, lang)); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <form role="dialog" aria-label={event ? t.editEventTitle : t.addEventTitle} onSubmit={submit} onClick={e => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-t-3xl bg-[#fffdf9] p-6 sm:rounded-3xl">
        <h2 className="font-serif text-xl">{event ? t.editEventTitle : t.addEventTitle}</h2>
        <label className="block"><span className={fieldLabel}>{t.title}</span>
          <input className={input} required maxLength={120} value={title} onChange={e => setTitle(e.target.value)} autoFocus />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className={fieldLabel}>{t.date}</span>
            <input type="date" className={input} required min={timingLocked ? undefined : today} disabled={timingLocked} value={date} onChange={e => setDate(e.target.value)} />
          </label>
          <label className="block"><span className={fieldLabel}>{t.startTime}</span>
            <input type="time" className={input} disabled={timingLocked} value={time} onChange={e => setTime(e.target.value)} />
          </label>
        </div>
        <p className="-mt-2 text-xs text-[#7b8379]">{t.timezoneNote(event ? 'creator' : 'yours')} <strong>{zoneLabel(zone, Date.now())}</strong>{timingLocked && ` ${t.timingLocked}`}</p>
        <div><span className={fieldLabel}>{t.location}</span>
          <LocationInput className={input} value={location} onChange={setLocation} lang={lang} placeholder={t.locationPlaceholder} label={t.location} />
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <label className="block"><span className={fieldLabel}>{t.cost}</span>
            <input type="number" min={0} step="0.01" inputMode="decimal" className={input} value={cost} onChange={e => setCost(e.target.value)} />
          </label>
          <label className="block"><span className={fieldLabel}>{t.currency}</span>
            <select className={input} value={currency} onChange={e => setCurrency(e.target.value)}>
              {CURRENCIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </label>
        </div>
        <div>
          <span className={fieldLabel}>{t.image}</span>
          {imageUrl ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="" className="h-36 w-full rounded-xl object-cover" />
              <button type="button" className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-1 text-xs" onClick={() => setImageUrl(null)}>{t.remove}</button>
            </div>
          ) : (
            <input type="file" accept="image/*,.heic,.heif" disabled={uploading} className="block w-full text-sm" aria-label={t.uploadImage}
              onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
          )}
          {uploading && <p className="mt-1 text-xs text-[#7b8379]">{t.uploading}</p>}
        </div>
        <label className="block"><span className={fieldLabel}>{t.note}</span>
          <textarea className={`${input} min-h-[80px]`} maxLength={2000} value={note} onChange={e => setNote(e.target.value)} placeholder={t.notePlaceholder} />
        </label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded-xl px-4 py-2 text-sm text-[#6d756c]" onClick={onClose}>{t.cancel}</button>
          <button disabled={busy || uploading} className="rounded-xl bg-[#d0763f] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{event ? t.save : t.create}</button>
        </div>
      </form>
    </div>
  );
}
