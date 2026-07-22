-- Projects and post-it cards for the Kanban Board module.
create table if not exists public.kanban_projects (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kanban_cards (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.kanban_projects(id) on delete cascade,
  title text not null check (char_length(btrim(title)) > 0),
  notes text,
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'done', 'later')),
  color text not null default 'yellow'
    check (color in ('yellow', 'pink', 'blue', 'green')),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_kanban_projects_updated_at
  on public.kanban_projects(updated_at desc);

create index if not exists idx_kanban_cards_project_status_position
  on public.kanban_cards(project_id, status, position);

create index if not exists idx_kanban_cards_updated_at
  on public.kanban_cards(updated_at desc);

alter table public.kanban_projects enable row level security;
alter table public.kanban_cards enable row level security;

drop policy if exists "Allow all operations on kanban_projects"
  on public.kanban_projects;
create policy "Allow all operations on kanban_projects"
  on public.kanban_projects
  for all
  using (true)
  with check (true);

drop policy if exists "Allow all operations on kanban_cards"
  on public.kanban_cards;
create policy "Allow all operations on kanban_cards"
  on public.kanban_cards
  for all
  using (true)
  with check (true);

drop trigger if exists update_kanban_projects_updated_at
  on public.kanban_projects;
create trigger update_kanban_projects_updated_at
  before update on public.kanban_projects
  for each row
  execute function public.update_updated_at_column();

drop trigger if exists update_kanban_cards_updated_at
  on public.kanban_cards;
create trigger update_kanban_cards_updated_at
  before update on public.kanban_cards
  for each row
  execute function public.update_updated_at_column();

-- Normalize the project's current positions, then move one card atomically.
-- The target position is a zero-based index in the destination column.
create or replace function public.move_kanban_card(
  p_card_id uuid,
  p_to_status text,
  p_to_position integer
)
returns public.kanban_cards
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_card public.kanban_cards%rowtype;
  v_target_count integer;
  v_target_position integer;
begin
  if p_to_status not in ('todo', 'in_progress', 'done', 'later') then
    raise exception 'Invalid Kanban status: %', p_to_status;
  end if;

  if p_to_position < 0 then
    raise exception 'Kanban position cannot be negative';
  end if;

  select * into v_card
  from public.kanban_cards
  where id = p_card_id
  for update;

  if not found then
    raise exception 'Kanban card not found';
  end if;

  -- Close any gaps left by earlier deletes before calculating the move.
  with normalized as (
    select
      id,
      row_number() over (
        partition by status
        order by position, created_at, id
      ) - 1 as normalized_position
    from public.kanban_cards
    where project_id = v_card.project_id
  )
  update public.kanban_cards as card
  set position = normalized.normalized_position
  from normalized
  where card.id = normalized.id
    and card.position <> normalized.normalized_position;

  select * into v_card
  from public.kanban_cards
  where id = p_card_id
  for update;

  if v_card.status = p_to_status then
    select count(*) into v_target_count
    from public.kanban_cards
    where project_id = v_card.project_id
      and status = p_to_status;

    v_target_position := least(p_to_position, greatest(v_target_count - 1, 0));

    if v_target_position < v_card.position then
      update public.kanban_cards
      set position = position + 1
      where project_id = v_card.project_id
        and status = v_card.status
        and id <> v_card.id
        and position >= v_target_position
        and position < v_card.position;
    elsif v_target_position > v_card.position then
      update public.kanban_cards
      set position = position - 1
      where project_id = v_card.project_id
        and status = v_card.status
        and id <> v_card.id
        and position > v_card.position
        and position <= v_target_position;
    end if;
  else
    update public.kanban_cards
    set position = position - 1
    where project_id = v_card.project_id
      and status = v_card.status
      and position > v_card.position;

    select count(*) into v_target_count
    from public.kanban_cards
    where project_id = v_card.project_id
      and status = p_to_status;

    v_target_position := least(p_to_position, v_target_count);

    update public.kanban_cards
    set position = position + 1
    where project_id = v_card.project_id
      and status = p_to_status
      and position >= v_target_position;
  end if;

  update public.kanban_cards
  set status = p_to_status,
      position = v_target_position
  where id = p_card_id
  returning * into v_card;

  return v_card;
end;
$$;

grant execute on function public.move_kanban_card(uuid, text, integer)
  to anon, authenticated;

notify pgrst, 'reload schema';
