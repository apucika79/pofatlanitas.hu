-- // [ADD]
-- Database schema for pofatlanitas.hu

create extension if not exists "uuid-ossp";

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default timezone('utc', now())
);

create type public.video_status as enum ('uploading', 'verifying', 'transcoding', 'pending', 'approved', 'rejected', 'failed');

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  title text not null check (char_length(title) <= 120),
  description text check (char_length(description) <= 500),
  place text,
  category text not null,
  status public.video_status not null default 'pending',
  file_path text not null,
  thumb_path text,
  reporter_email text,
  views integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.video_likes (
  id bigint primary key generated always as identity,
  video_id uuid not null references public.videos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (video_id, user_id)
);

create table if not exists public.video_flags (
  id bigint primary key generated always as identity,
  video_id uuid not null references public.videos(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  reason text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.video_comments (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 1000),
  is_approved boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_videos_status on public.videos(status);
create index if not exists idx_videos_created_at on public.videos(created_at desc);
create index if not exists idx_videos_category on public.videos(category);
create index if not exists idx_video_comments_video on public.video_comments(video_id);
create index if not exists idx_video_comments_created_at on public.video_comments(created_at desc);

alter table public.videos enable row level security;
alter table public.video_likes enable row level security;
alter table public.video_flags enable row level security;
alter table public.video_comments enable row level security;

create policy "Public can insert pending videos" on public.videos
  for insert to authenticated, anon
  with check (status in ('uploading', 'verifying', 'pending'));

create policy "Public can view approved videos" on public.videos
  for select using (status = 'approved');

create policy "Service role manages videos" on public.videos
  for all to service_role
  using (true)
  with check (true);

create policy "Owners manage their likes" on public.video_likes
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Anyone can see likes" on public.video_likes
  for select
  using (true);

create policy "Owners manage their flags" on public.video_flags
  for all to authenticated
  using (auth.uid() = user_id or user_id is null)
  with check (auth.uid() = user_id or user_id is null);

create policy "Guests can insert flags" on public.video_flags
  for insert to anon
  with check (user_id is null);

create policy "Public can view flags" on public.video_flags
  for select to authenticated, anon
  using (true);

create policy "Service role moderates flags" on public.video_flags
  for all to service_role
  using (true)
  with check (true);

create policy "Authenticated can insert comments" on public.video_comments
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Authenticated view their comments" on public.video_comments
  for select to authenticated
  using (auth.uid() = user_id or is_approved);

create policy "Guests view approved comments" on public.video_comments
  for select to anon
  using (is_approved);

create policy "Authors manage their comments" on public.video_comments
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Authors delete their comments" on public.video_comments
  for delete to authenticated
  using (auth.uid() = user_id);

create policy "Service role moderates comments" on public.video_comments
  for all to service_role
  using (true)
  with check (true);

create or replace function public.increment_video_views(video_id uuid)
returns public.videos
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  updated_row public.videos;
begin
  update public.videos
     set views = coalesce(views, 0) + 1
   where id = increment_video_views.video_id
     and status = 'approved'
  returning * into updated_row;
  return updated_row;
end;
$$;

grant execute on function public.increment_video_views to anon, authenticated;
-- // [END]
