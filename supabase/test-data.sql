-- Buspo Match MVP test data
-- Supabase SQL Editorで実行してください。
-- 実在の学校名、個人名、メールアドレスは使っていません。
-- SQL Editorは管理者権限で実行されるため、RLSが有効でも投入できます。

begin;

-- teams.owner_id / match_posts.owner_id は auth.users(id) を参照するため、
-- ログイン確認を後回しにする場合でも、外部キー用のテスト所有者を作成します。
insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin
)
values (
  '11111111-1111-4111-8111-111111111111',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  null,
  null,
  now(),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"架空テスト投稿者"}'::jsonb,
  false
)
on conflict (id) do nothing;

insert into public.teams (
  id,
  owner_id,
  name,
  region,
  category,
  school_level,
  ball_type
)
values (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  '架空中央高校 野球部',
  '東京都',
  '高校野球',
  'high_school',
  'hard'
)
on conflict (id) do update
set
  name = excluded.name,
  region = excluded.region,
  category = excluded.category,
  school_level = excluded.school_level,
  ball_type = excluded.ball_type,
  updated_at = now();

insert into public.match_posts (
  id,
  team_id,
  owner_id,
  match_date,
  region,
  category,
  desired_conditions,
  body,
  status
)
values (
  '33333333-3333-4333-8333-333333333333',
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  current_date + interval '14 days',
  '東京都',
  '高校野球',
  '硬式、午後開始、同程度のチームを希望します。B戦も相談可能です。',
  '会場: 架空中央グラウンド
時間: 13:00開始予定
形式: 7イニング1試合
補足: 駐車場あり。雨天時は当日朝に判断します。連絡先は一般公開しません。',
  'approved'
)
on conflict (id) do update
set
  team_id = excluded.team_id,
  owner_id = excluded.owner_id,
  match_date = excluded.match_date,
  region = excluded.region,
  category = excluded.category,
  desired_conditions = excluded.desired_conditions,
  body = excluded.body,
  status = excluded.status,
  updated_at = now();

commit;

-- 投入確認: トップページの「公開中の練習試合募集」に出る条件と同じく approved のみ確認します。
select
  match_posts.id,
  match_posts.status,
  match_posts.match_date,
  match_posts.region,
  match_posts.category,
  teams.name as team_name,
  teams.school_level,
  teams.ball_type,
  match_posts.desired_conditions,
  match_posts.body
from public.match_posts
join public.teams on teams.id = match_posts.team_id
where match_posts.id = '33333333-3333-4333-8333-333333333333'
  and match_posts.status = 'approved';

-- 公開一覧相当の確認: アプリのトップページ取得条件と同じ approved の投稿を日付順に表示します。
select
  match_posts.match_date,
  match_posts.region,
  match_posts.category,
  teams.name as team_name,
  teams.school_level,
  teams.ball_type,
  match_posts.status
from public.match_posts
join public.teams on teams.id = match_posts.team_id
where match_posts.status = 'approved'
order by match_posts.match_date asc;
