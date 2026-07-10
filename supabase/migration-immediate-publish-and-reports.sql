-- Existing-project migration for immediate publish + reports.
-- Run this in Supabase SQL Editor after the previous MVP schema has already been applied.
-- This does not delete existing posts.

alter table public.match_posts
  add column if not exists report_count integer not null default 0;

alter table public.match_posts
  add column if not exists hidden_reason text;

alter table public.match_posts
  drop constraint if exists match_posts_status_check;

alter table public.match_posts
  add constraint match_posts_status_check
  check (status in ('pending', 'approved', 'rejected', 'reported', 'hidden'));

alter table public.match_posts
  alter column status set default 'approved';

alter table public.match_posts
  drop constraint if exists match_posts_report_count_check;

alter table public.match_posts
  add constraint match_posts_report_count_check
  check (report_count >= 0);

alter table public.match_posts
  drop constraint if exists match_posts_no_public_contact_check;

alter table public.match_posts
  add constraint match_posts_no_public_contact_check
  check (
    not (
      (desired_conditions || E'\n' || body) ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}'
      or (desired_conditions || E'\n' || body) ~* '0[0-9]{1,4}[- ]?[0-9]{1,4}[- ]?[0-9]{3,4}'
      or (desired_conditions || E'\n' || body) ~* 'line[[:space:]]*(id)?[[:space:]]*[:：]?[[:space:]]*[@A-Z0-9._-]{3,}'
      or (desired_conditions || E'\n' || body) ~* '(@[A-Z0-9_]{3,}|((instagram|twitter|tiktok|facebook|sns)[[:space:]]*(id|アカウント)?|x[[:space:]]*(id|アカウント))[[:space:]]*[:：][[:space:]]*[@A-Z0-9._-]{3,})'
    )
  );

create table if not exists public.post_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.match_posts(id) on delete cascade,
  reporter_id uuid references auth.users(id) on delete set null,
  reason text not null default 'reported from public screen' check (char_length(reason) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists post_reports_post_id_idx
  on public.post_reports (post_id);

create unique index if not exists post_reports_unique_reporter_idx
  on public.post_reports (post_id, reporter_id)
  where reporter_id is not null;

create or replace function public.apply_post_report_threshold()
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

drop trigger if exists post_reports_apply_threshold on public.post_reports;
create trigger post_reports_apply_threshold
after insert on public.post_reports
for each row execute function public.apply_post_report_threshold();

alter table public.post_reports enable row level security;

drop policy if exists "owners can insert pending posts" on public.match_posts;
drop policy if exists "owners can insert approved posts" on public.match_posts;
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

drop policy if exists "owners can update their non-approved posts" on public.match_posts;
drop policy if exists "owners can hide or restore their posts" on public.match_posts;
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

drop policy if exists "owners can delete their posts" on public.match_posts;
create policy "owners can delete their posts"
on public.match_posts
for delete
using (owner_id = auth.uid());

drop policy if exists "public can report approved posts" on public.post_reports;
drop policy if exists "authenticated users can report approved posts once" on public.post_reports;
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

drop policy if exists "admins can read reports" on public.post_reports;
create policy "admins can read reports"
on public.post_reports
for select
using (public.is_admin());
