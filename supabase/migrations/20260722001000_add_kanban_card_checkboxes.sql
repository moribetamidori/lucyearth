-- Persist which note lines have been checked off on each Kanban card.
alter table public.kanban_cards
  add column if not exists completed_line_items integer[] not null default '{}';

notify pgrst, 'reload schema';
