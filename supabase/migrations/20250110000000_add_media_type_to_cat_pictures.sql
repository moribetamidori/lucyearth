-- Add media_type column to cat_pictures table
alter table public.cat_pictures
add column if not exists media_type text not null default 'image';

-- Add check constraint to ensure media_type is either 'image' or 'video'
alter table public.cat_pictures
add constraint cat_pictures_media_type_check
check (media_type in ('image', 'video'));

-- Create index on media_type for filtering
create index if not exists idx_cat_pictures_media_type on public.cat_pictures(media_type);
