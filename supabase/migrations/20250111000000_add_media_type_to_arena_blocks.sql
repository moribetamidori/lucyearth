-- Add media_type column to arena_blocks table
alter table public.arena_blocks
add column if not exists media_type text not null default 'image';

-- Add check constraint to ensure media_type is either 'image' or 'video'
alter table public.arena_blocks
add constraint arena_blocks_media_type_check
check (media_type in ('image', 'video'));

-- Create index on media_type for filtering
create index if not exists idx_arena_blocks_media_type on public.arena_blocks(media_type);
