-- // [ADD]
-- Database schema for pofatlanitas.hu

create extension if not exists "uuid-ossp";
create extension if not exists cube;
create extension if not exists earthdistance;

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
  latitude double precision,
  longitude double precision,
  is_featured boolean not null default false,
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
create index if not exists idx_videos_location on public.videos using gist (
  ll_to_earth(coalesce(latitude, 0), coalesce(longitude, 0))
);
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

create table if not exists public.user_feed_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  followed_categories text[] not null default array[]::text[],
  followed_routes text[] not null default array[]::text[],
  home_latitude double precision,
  home_longitude double precision,
  nearby_radius_km numeric default 5,
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.touch_user_feed_preferences()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_touch_user_feed_preferences on public.user_feed_preferences;
create trigger trg_touch_user_feed_preferences
  before update on public.user_feed_preferences
  for each row execute function public.touch_user_feed_preferences();

alter table public.user_feed_preferences enable row level security;

create policy "Users manage their preferences" on public.user_feed_preferences
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.usage_events (
  id bigint generated always as identity primary key,
  event_type text not null,
  event_payload jsonb,
  user_id uuid references auth.users(id) on delete set null,
  session_id uuid,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_usage_events_created_at on public.usage_events(created_at desc);
create index if not exists idx_usage_events_event_type on public.usage_events(event_type);

alter table public.usage_events enable row level security;

create policy "Service role manages usage events" on public.usage_events
  for all to service_role
  using (true)
  with check (true);

create materialized view if not exists public.video_trending_stats as
select
  v.id as video_id,
  coalesce(like_window.like_count, 0) as like_count,
  coalesce(view_window.view_events, 0) as view_events,
  v.views as total_views,
  v.created_at,
  (coalesce(like_window.like_count, 0) * 3
    + coalesce(view_window.view_events, 0) * 2
    + greatest(0, 96 - extract(epoch from (now() - v.created_at)) / 3600))::numeric as trending_score
from public.videos v
left join lateral (
  select count(*) as like_count
  from public.video_likes vl
  where vl.video_id = v.id
    and vl.created_at >= now() - interval '7 days'
) like_window on true
left join lateral (
  select count(*) as view_events
  from public.usage_events ue
  where ue.event_type = 'feed.video_opened'
    and ue.event_payload ? 'video_id'
    and (ue.event_payload->>'video_id')::uuid = v.id
    and ue.created_at >= now() - interval '72 hours'
) view_window on true
where v.status = 'approved';

create unique index if not exists idx_video_trending_stats_video on public.video_trending_stats (video_id);
create index if not exists idx_video_trending_stats_score on public.video_trending_stats (trending_score desc);

grant select on public.video_trending_stats to anon, authenticated;

create or replace function public.rebuild_video_trending_stats()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  refresh materialized view concurrently public.video_trending_stats;
end;
$$;

grant execute on function public.rebuild_video_trending_stats() to service_role;

create or replace function public.get_trending_videos(limit_count integer default 6)
returns table (
  id uuid,
  title text,
  description text,
  place text,
  category text,
  file_path text,
  thumb_path text,
  views integer,
  created_at timestamptz,
  like_count bigint,
  trending_score numeric,
  latitude double precision,
  longitude double precision
)
language sql
security definer
set search_path = public, extensions
as $$
  select
    v.id,
    v.title,
    v.description,
    v.place,
    v.category,
    v.file_path,
    v.thumb_path,
    v.views,
    v.created_at,
    stats.like_count,
    stats.trending_score,
    v.latitude,
    v.longitude
  from public.videos v
  join public.video_trending_stats stats on stats.video_id = v.id
  where v.status = 'approved'
  order by stats.trending_score desc, v.created_at desc
  limit coalesce(limit_count, 6);
$$;

grant execute on function public.get_trending_videos(integer) to anon, authenticated;

create or replace function public.get_featured_videos(limit_count integer default 6)
returns table (
  id uuid,
  title text,
  description text,
  place text,
  category text,
  file_path text,
  thumb_path text,
  views integer,
  created_at timestamptz,
  latitude double precision,
  longitude double precision
)
language sql
security definer
set search_path = public, extensions
as $$
  select
    v.id,
    v.title,
    v.description,
    v.place,
    v.category,
    v.file_path,
    v.thumb_path,
    v.views,
    v.created_at,
    v.latitude,
    v.longitude
  from public.videos v
  where v.status = 'approved'
    and v.is_featured = true
  order by v.created_at desc
  limit coalesce(limit_count, 6);
$$;

grant execute on function public.get_featured_videos(integer) to anon, authenticated;

create or replace function public.get_nearby_videos(lat double precision, lon double precision, radius_km numeric default 10, limit_count integer default 6)
returns table (
  id uuid,
  title text,
  description text,
  place text,
  category text,
  file_path text,
  thumb_path text,
  views integer,
  created_at timestamptz,
  distance_km numeric,
  latitude double precision,
  longitude double precision
)
language sql
security definer
set search_path = public, extensions
as $$
  select
    v.id,
    v.title,
    v.description,
    v.place,
    v.category,
    v.file_path,
    v.thumb_path,
    v.views,
    v.created_at,
    (earth_distance(ll_to_earth(lat, lon), ll_to_earth(v.latitude, v.longitude)) / 1000)::numeric(12,2) as distance_km,
    v.latitude,
    v.longitude
  from public.videos v
  where v.status = 'approved'
    and v.latitude is not null
    and v.longitude is not null
    and earth_box(ll_to_earth(lat, lon), (radius_km * 1000)) @> ll_to_earth(v.latitude, v.longitude)
    and earth_distance(ll_to_earth(lat, lon), ll_to_earth(v.latitude, v.longitude)) <= radius_km * 1000
  order by distance_km asc, v.created_at desc
  limit coalesce(limit_count, 6);
$$;

grant execute on function public.get_nearby_videos(double precision, double precision, numeric, integer) to anon, authenticated;

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
