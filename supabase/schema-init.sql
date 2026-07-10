-- Buspo Match MVP initial setup schema
-- Use this only for the first run on a new empty Supabase project.
-- This file intentionally avoids DROP statements.

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) <= 120),
  region text not null check (char_length(region) <= 80),
  category text not null check (char_length(category) <= 80),
  school_level text not null check (school_level in ('junior_high', 'high_school', 'club_team')),
  ball_type text not null check (ball_type in ('rubber', 'hard')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id)
);

create table if not exists public.match_posts (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  match_date date not null,
  region text not null check (char_length(region) <= 80),
  category text not null check (char_length(category) <= 80),
  desired_conditions text not null check (char_length(desired_conditions) <= 500),
  body text not null check (char_length(body) <= 2000),
  status text not null default 'approved' check (status in ('pending', 'approved', 'rejected', 'reported', 'hidden')),
  report_count integer not null default 0 check (report_count >= 0),
  hidden_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint match_posts_no_public_contact_check check (
    not (
      (desired_conditions || E'\n' || body) ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}'
      or (desired_conditions || E'\n' || body) ~* '0[0-9]{1,4}[- ]?[0-9]{1,4}[- ]?[0-9]{3,4}'
      or (desired_conditions || E'\n' || body) ~* 'line[[:space:]]*(id)?[[:space:]]*[:：]?[[:space:]]*[@A-Z0-9._-]{3,}'
      or (desired_conditions || E'\n' || body) ~* '(@[A-Z0-9_]{3,}|((instagram|twitter|tiktok|facebook|sns)[[:space:]]*(id|アカウント)?|x[[:space:]]*(id|アカウント))[[:space:]]*[:：][[:space:]]*[@A-Z0-9._-]{3,})'
    )
  )
);

create table if not exists public.post_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.match_posts(id) on delete cascade,
  reporter_id uuid references auth.users(id) on delete set null,
  reason text not null default 'reported from public screen' check (char_length(reason) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists match_posts_public_search_idx
  on public.match_posts (status, match_date, region, category);

create index if not exists post_reports_post_id_idx
  on public.post_reports (post_id);

create unique index if not exists post_reports_unique_reporter_idx
  on public.post_reports (post_id, reporter_id)
  where reporter_id is not null;

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger teams_set_updated_at
before update on public.teams
for each row execute function public.set_updated_at();

create trigger match_posts_set_updated_at
before update on public.match_posts
for each row execute function public.set_updated_at();

create function public.apply_post_report_threshold()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_count integer;
begin
  select count(*) into next_count
  from public.post_reports
  where post_id = new.post_id;

  update public.match_posts
  set
    report_count = next_count,
    status = case
      when next_count >= 3 and status = 'approved' then 'reported'
      else status
    end,
    hidden_reason = case
      when next_count >= 3 and status = 'approved' then '通報件数がしきい値を超えました'
      else hidden_reason
    end
  where id = new.post_id;

  return new;
end;
$$;

create trigger post_reports_apply_threshold
after insert on public.post_reports
for each row execute function public.apply_post_report_threshold();

alter table public.teams enable row level security;
alter table public.match_posts enable row level security;
alter table public.post_reports enable row level security;

create function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';
$$;

create policy "teams are readable when owner or admin or approved post exists"
on public.teams
for select
using (
  owner_id = auth.uid()
  or public.is_admin()
  or exists (
    select 1
    from public.match_posts
    where match_posts.team_id = teams.id
      and match_posts.status = 'approved'
  )
);

create policy "team owners can insert their team"
on public.teams
for insert
with check (owner_id = auth.uid());

create policy "team owners can update their team"
on public.teams
for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "public can read approved posts and owners can read own posts"
on public.match_posts
for select
using (
  status = 'approved'
  or owner_id = auth.uid()
  or public.is_admin()
);

create policy "owners can insert approved posts"
on public.match_posts
for insert
with check (
  owner_id = auth.uid()
  and status = 'approved'
  and exists (
    select 1
    from public.teams
    where teams.id = match_posts.team_id
      and teams.owner_id = auth.uid()
  )
);

create policy "owners can hide or restore their posts"
on public.match_posts
for update
using (owner_id = auth.uid())
with check (
  owner_id = auth.uid()
  and status in ('approved', 'hidden')
  and exists (
    select 1
    from public.teams
    where teams.id = match_posts.team_id
      and teams.owner_id = auth.uid()
  )
);

create policy "owners can delete their posts"
on public.match_posts
for delete
using (owner_id = auth.uid());

create policy "admins can update any post"
on public.match_posts
for update
using (public.is_admin())
with check (public.is_admin());

create policy "admins can delete posts"
on public.match_posts
for delete
using (public.is_admin());

create policy "authenticated users can report approved posts once"
on public.post_reports
for insert
with check (
  reporter_id = auth.uid()
  and
  exists (
    select 1
    from public.match_posts
    where match_posts.id = post_reports.post_id
      and match_posts.status = 'approved'
  )
);

create policy "admins can read reports"
on public.post_reports
for select
using (public.is_admin());
