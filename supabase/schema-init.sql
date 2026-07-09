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
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists match_posts_public_search_idx
  on public.match_posts (status, match_date, region, category);

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

alter table public.teams enable row level security;
alter table public.match_posts enable row level security;

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

create policy "owners can insert pending posts"
on public.match_posts
for insert
with check (
  owner_id = auth.uid()
  and status = 'pending'
  and exists (
    select 1
    from public.teams
    where teams.id = match_posts.team_id
      and teams.owner_id = auth.uid()
  )
);

create policy "owners can update their non-approved posts"
on public.match_posts
for update
using (
  owner_id = auth.uid()
  and status in ('pending', 'rejected')
)
with check (
  owner_id = auth.uid()
  and status in ('pending', 'rejected')
  and exists (
    select 1
    from public.teams
    where teams.id = match_posts.team_id
      and teams.owner_id = auth.uid()
  )
);

create policy "admins can update any post"
on public.match_posts
for update
using (public.is_admin())
with check (public.is_admin());

create policy "admins can delete posts"
on public.match_posts
for delete
using (public.is_admin());
