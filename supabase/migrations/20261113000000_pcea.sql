-- PCEA: Probability Calibration for Event Attendance.
-- Everything is read and written through the Next.js server (service role). Browser roles have no access.

create table public.pcea_users (
  id uuid primary key default gen_random_uuid(),
  user_number integer generated always as identity unique,
  display_name text check (display_name is null or char_length(btrim(display_name)) between 1 and 40),
  -- sha256 of the recovery code; the code itself doubles as the session cookie value.
  token_hash text not null unique,
  ip_hash text,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index pcea_users_ip_recent on public.pcea_users(ip_hash, created_at desc);

create table public.pcea_events (
  id uuid primary key default gen_random_uuid(),
  -- Calendar date in the creator's timezone; events are grouped by this date.
  event_date date not null,
  start_time time,
  timezone text not null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  image_url text check (image_url is null or image_url ~ '^https?://'),
  cost_amount numeric(10, 2) check (cost_amount is null or cost_amount >= 0),
  cost_currency text not null default 'USD' check (cost_currency ~ '^[A-Z]{3}$'),
  note text check (note is null or char_length(note) <= 2000),
  created_by uuid not null references public.pcea_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index pcea_events_by_date on public.pcea_events(event_date) where deleted_at is null;
create index pcea_events_by_creator on public.pcea_events(created_by, created_at desc);

create table public.pcea_responses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.pcea_events(id) on delete cascade,
  user_id uuid not null references public.pcea_users(id) on delete cascade,
  probability smallint not null check (probability between 0 and 100),
  interest text not null check (interest in ('high', 'some', 'none')),
  note text check (note is null or char_length(note) <= 1000),
  -- Filled in after the event day ends: did the person actually go?
  attended boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id)
);
create index pcea_responses_by_user on public.pcea_responses(user_id);

-- An event locks once its calendar day has ended in the event's own timezone.
-- Raises on an unknown timezone name, which doubles as validation.
create function public.pcea_event_locked(p_date date, p_timezone text)
returns boolean language sql stable as $$
  select now() >= ((p_date + 1)::timestamp at time zone p_timezone)
$$;

create function public.pcea_guard_event()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if public.pcea_event_locked(new.event_date, new.timezone) then
      raise exception 'pcea_event_in_past' using errcode = 'P0001';
    end if;
  else
    if new.created_by is distinct from old.created_by then
      raise exception 'pcea_immutable' using errcode = 'P0001';
    end if;
    if (new.event_date, new.start_time, new.timezone) is distinct from (old.event_date, old.start_time, old.timezone)
       and (public.pcea_event_locked(old.event_date, old.timezone) or public.pcea_event_locked(new.event_date, new.timezone)) then
      raise exception 'pcea_locked' using errcode = 'P0001';
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;
create trigger pcea_guard_event before insert or update on public.pcea_events
  for each row execute function public.pcea_guard_event();

create function public.pcea_guard_response()
returns trigger language plpgsql as $$
declare
  ev record;
  locked boolean;
begin
  if tg_op = 'DELETE' then
    select event_date, timezone, deleted_at into ev from public.pcea_events where id = old.event_id;
    if not found then return old; end if;
  else
    select event_date, timezone, deleted_at into ev from public.pcea_events where id = new.event_id;
    if not found or ev.deleted_at is not null then
      raise exception 'pcea_event_missing' using errcode = 'P0001';
    end if;
  end if;
  locked := public.pcea_event_locked(ev.event_date, ev.timezone);
  if tg_op = 'DELETE' then
    -- A finished prediction cannot be withdrawn. (Cascades from a deleted event/user find no event row above.)
    if locked then raise exception 'pcea_locked' using errcode = 'P0001'; end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if locked then raise exception 'pcea_locked' using errcode = 'P0001'; end if;
  else
    if new.event_id <> old.event_id or new.user_id <> old.user_id then
      raise exception 'pcea_immutable' using errcode = 'P0001';
    end if;
    if locked and (new.probability, new.interest) is distinct from (old.probability, old.interest) then
      raise exception 'pcea_locked' using errcode = 'P0001';
    end if;
    new.updated_at := now();
  end if;
  if not locked and new.attended is not null then
    raise exception 'pcea_not_finished' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger pcea_guard_response before insert or update or delete on public.pcea_responses
  for each row execute function public.pcea_guard_response();

alter table public.pcea_users enable row level security;
alter table public.pcea_events enable row level security;
alter table public.pcea_responses enable row level security;
revoke all on public.pcea_users, public.pcea_events, public.pcea_responses from anon, authenticated;
revoke execute on function public.pcea_event_locked(date, text) from public, anon, authenticated;
revoke execute on function public.pcea_guard_event() from public, anon, authenticated;
revoke execute on function public.pcea_guard_response() from public, anon, authenticated;
grant all on public.pcea_users, public.pcea_events, public.pcea_responses to service_role;
grant execute on function public.pcea_event_locked(date, text) to service_role;
