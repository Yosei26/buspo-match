# Buspo Match

中学野球・高校野球などの部活動向けに、練習試合募集を投稿・検索できるMVPです。Next.js + Supabase + Vercel の無料枠で動かす前提です。

## MVPでできること

- 投稿者はメール認証でログインします。
- チーム名、地域、カテゴリ、中学/高校、軟式/硬式を登録できます。
- 練習試合募集を投稿できます。
- 投稿は最初 `pending` になり、管理者が `approved` にしたものだけ公開されます。
- 日付、地域、カテゴリで公開投稿を検索できます。
- 投稿一覧、投稿詳細、管理者承認画面があります。
- 連絡先はテーブルに保存せず、一般公開もしません。

## 使うサービス

- GitHub: ソースコード管理
- Supabase: Auth、Postgres DB、RLS
- Vercel: Next.jsの公開ホスティング

## 1. Supabaseプロジェクト作成

1. [Supabase](https://supabase.com/) にログインします。
2. New project を作成します。
3. Project Settings または Connect 画面から以下を控えます。
   - Project URL
   - Publishable key
4. Authentication > Providers > Email を有効にします。
5. Authentication > URL Configuration にVercel公開後のURLを追加します。ローカル確認時は `http://localhost:3000` を追加します。

Supabase公式のNext.jsクイックスタートでは、Next.jsアプリに `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` を設定する流れが示されています。

## 2. テーブル作成とRLS設定

新規の空Supabaseプロジェクトで初回セットアップする場合は、Supabase Dashboard の SQL Editor で [supabase/schema-init.sql](./supabase/schema-init.sql) の内容を実行してください。

[supabase/schema.sql](./supabase/schema.sql) は再実行・調整用です。既存ポリシーやトリガーを作り直すために `drop policy if exists` と `drop trigger if exists` を含みます。テーブルや既存データを削除するSQLは含んでいませんが、Supabase SQL Editorの destructive operations 警告が出る場合があります。

作成される主なテーブル:

- `teams`
  - `name`: チーム名
  - `region`: 地域
  - `category`: 例 `高校野球`, `中学野球`
  - `school_level`: `junior_high` または `high_school`
  - `ball_type`: `rubber` または `hard`
- `match_posts`
  - `match_date`: 募集日
  - `region`: 地域
  - `category`: カテゴリ
  - `desired_conditions`: 希望条件
  - `body`: 募集内容
  - `status`: `pending`, `approved`, `rejected`

RLSの考え方:

- 公開ユーザーは `approved` 投稿だけ閲覧できます。
- 投稿者は自分のチームと自分の投稿だけ作成・閲覧・編集できます。
- 投稿者が新規作成する投稿は `pending` のみです。
- 投稿者が編集できるのは自分の `pending` または `rejected` 投稿だけです。`approved` 投稿は管理者側で差し戻してから修正する運用にします。
- 管理者だけが投稿を承認、却下、削除できます。
- 連絡先フィールドは作っていません。

## 3. 管理者ユーザーの設定

管理者はSupabase Authのユーザーに `app_metadata.role = "admin"` を付ける設計です。

Supabase Dashboardで対象ユーザーを作成またはログイン後、管理APIまたはDashboardのユーザー編集機能で app metadata に以下を設定します。

```json
{
  "role": "admin"
}
```

注意: `service_role` や Secret key はブラウザやGitHubに置かないでください。このMVPのクライアント側には Publishable key のみを使います。

管理者判定は次の2層です。

- 画面表示: `/admin` はログインユーザーの `app_metadata.role === "admin"` の場合だけ操作ボタンを表示します。
- DB保護: RLS内の `public.is_admin()` がJWTの `app_metadata.role` を確認し、管理者以外の承認・却下・削除を拒否します。

つまり、フロントエンド画面を改変されても、最終的な権限判定はSupabase RLSで行います。

## セキュリティ確認項目

- `.env.local`、`.env`、`.env.*.local` は `.gitignore` に含めています。
- フロントエンドで通常使う環境変数は `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` のみです。
- `service_role`、Secret key、DB password はソースコード、GitHub、Vercelの公開される変数に入れないでください。
- ローカル開発確認モードだけ、サーバー側APIで `SUPABASE_SERVICE_ROLE_KEY` を使います。`.env.local` のみに入れ、Vercelには登録しないでください。
- 未承認投稿は `match_posts.status = 'approved'` の場合だけ一般ユーザーが閲覧できます。
- 投稿者は他人の投稿を編集・削除できません。削除は管理者だけです。
- RLSは `teams` と `match_posts` の両方で有効化しています。

## 4. ローカル環境設定

### 4.1 仮データ版の起動方法

Supabase設定をまだ行わない場合は、`.env.local` を作らずに起動してください。環境変数が未設定の場合、自動で仮データ版として動きます。

```bash
pnpm install
pnpm run dev
```

ブラウザで `http://localhost:3000` を開きます。

仮データ版で確認できること:

- トップページ
- 投稿一覧
- 投稿詳細
- チーム登録フォーム
- 練習試合募集フォーム
- 管理画面 `/admin`
- 管理画面での承認、却下、削除の操作感

仮データ版の注意点:

- Supabaseには接続しません。
- メール認証は行いません。
- 投稿、承認、却下、削除は実保存されません。
- ページを再読み込みすると初期の仮データに戻ります。

### 4.2 Supabase接続版の起動方法

```bash
pnpm install
cp .env.example .env.local
```

`.env.local` を編集します。

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxxxxxxxxxxx
```

起動:

```bash
pnpm run dev
```

ブラウザで `http://localhost:3000` を開きます。

### 4.3 Supabase接続版に戻す方法

仮データ版からSupabase接続版へ戻すには、`.env.local` に以下を設定してから開発サーバーを再起動してください。

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxxxxxxxxxxx
```

この2つが設定されている場合、アプリはSupabase接続版として動きます。設定されていない場合は仮データ版になります。

Vercelでも同じです。VercelのEnvironment Variablesに上記2つを登録するとSupabase接続版、登録しない場合は仮データ版としてビルドされます。

### 4.4 ローカル開発確認モード

Supabase標準メールで bounce backs によるメール送信権限リスクの警告が出たため、Supabase標準メールでの認証テスト送信は一旦停止します。

ログイン機能を後回しにして、ローカル環境だけで投稿・承認フローを確認する場合は、`.env.local` に以下を追加します。

```bash
NEXT_PUBLIC_DEV_AUTH_BYPASS=<local-only true>
SUPABASE_SERVICE_ROLE_KEY=<local-only service role key>
```

開発確認モードの条件:

- `NEXT_PUBLIC_DEV_AUTH_BYPASS` をローカルで `true` にしたときだけ有効です。
- `NODE_ENV === "development"` のときだけ有効です。`pnpm run dev` で使う前提です。
- Vercel環境では有効化されないようにしています。
- 画面上に「開発確認モード」と表示されます。
- [supabase/test-data.sql](./supabase/test-data.sql) のテストユーザーID `11111111-1111-4111-8111-111111111111` とテストチームIDを使います。
- 投稿フォームから作成した募集は `pending` としてSupabaseに保存されます。
- 管理画面 `/admin` で `pending` を `approved` または `rejected` に変更できます。
- `approved` にした投稿はトップページの「公開中の練習試合募集」に表示されます。

注意:

- `SUPABASE_SERVICE_ROLE_KEY` は強い権限を持つサーバー専用キーです。
- ブラウザに公開しないでください。
- GitHubにアップロードしないでください。
- `NEXT_PUBLIC_DEV_AUTH_BYPASS` と `SUPABASE_SERVICE_ROLE_KEY` はVercelのEnvironment Variablesに登録しないでください。
- 本番ではこの開発確認モードを使わず、Custom SMTP、または別ログイン方式を検討してください。

## 4.5 現在の到達点

2026年7月10日時点で、以下まで確認済みです。

- Supabase SQL Editorで [supabase/schema.sql](./supabase/schema.sql) を実行済みです。
- Supabase Databaseへの接続を確認済みです。
- Supabase SQL Editorで [supabase/test-data.sql](./supabase/test-data.sql) を実行済みです。
- [supabase/test-data.sql](./supabase/test-data.sql) による `approved` のテスト投稿が、トップページの「公開中の練習試合募集」に表示されることを確認済みです。
- `NEXT_PUBLIC_DEV_AUTH_BYPASS` をローカルで `true` にし、`SUPABASE_SERVICE_ROLE_KEY` を `.env.local` に置くローカル開発確認モードで、投稿作成、`pending` 保存、管理画面での `approved` 変更、トップページ公開表示まで確認済みです。
- `SUPABASE_SERVICE_ROLE_KEY` は `.env.local` のみに置きます。GitHubへアップロードしないでください。
- Vercelには `SUPABASE_SERVICE_ROLE_KEY` と `NEXT_PUBLIC_DEV_AUTH_BYPASS` を絶対に登録しないでください。
- Supabase Authの確認メール送信は、Supabase標準メールの制限と bounce backs による送信権限リスク警告により、テスト送信を一旦停止しています。
- Authメールテストは停止中です。ログイン機能は一旦後回しにし、先にDB接続、公開投稿表示、投稿・承認フロー、画面構成の確認を優先しています。
- 本番前には Custom SMTP の設定、またはメール認証以外のログイン方式を検討します。
- `pnpm run build` または `npm run build` を実行し、Next.jsの本番ビルドが成功することを確認してください。

## 5. GitHubにアップロード

```bash
git init
git add .
git commit -m "Initial Buspo Match MVP"
git branch -M main
git remote add origin https://github.com/YOUR_NAME/YOUR_REPOSITORY.git
git push -u origin main
```

既にGitHubリポジトリを作っている場合は、`YOUR_NAME/YOUR_REPOSITORY` を自分のものに置き換えてください。

## 6. Vercel連携とデプロイ

1. [Vercel](https://vercel.com/) にGitHubアカウントでログインします。
2. Add New > Project を選びます。
3. GitHubリポジトリをImportします。
4. Framework Preset が Next.js になっていることを確認します。
5. Environment Variables に以下を登録します。
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
6. Deploy を実行します。
7. デプロイ後のURLをSupabase Authの Site URL / Redirect URLs に追加します。

Vercel公式ドキュメントではNext.jsプロジェクトのデプロイと、プロジェクト単位の環境変数設定が案内されています。

## 7. 本番前に追加すべきこと

- 管理者承認後の連絡導線を作る。例: 管理者経由、または承認済み双方だけが見られるメッセージ機能。
- 学校関係者確認フローを追加する。
- 通報機能と監査ログを追加する。
- 利用規約、プライバシーポリシー、問い合わせ先を用意する。
- 投稿削除ではなく論理削除にするかを決める。
- Supabase Authのメール送信は、本番では独自SMTP設定を検討する。

## 8. 実Supabase接続後の動作確認チェックリスト

Vercelまたはローカル環境で実Supabaseに接続したあと、以下を順番に確認してください。

### 8.1 投稿者Aの作成と投稿

- [ ] Supabase Authまたはアプリのログイン画面から、一般ユーザーAのメールアドレスでログインします。
- [ ] 一般ユーザーAでチーム登録を行います。
  - チーム名
  - 地域
  - カテゴリ
  - 中学/高校
  - 軟式/硬式
- [ ] 一般ユーザーAで練習試合募集を投稿します。
- [ ] 投稿後、自分の投稿一覧でステータスが `pending` になっていることを確認します。
- [ ] 別ブラウザ、シークレットウィンドウ、またはログアウト状態でトップページを開き、その投稿が公開一覧に表示されないことを確認します。

### 8.2 管理者ユーザーの設定

- [ ] 管理者にしたいメールアドレスで一度ログインし、Supabase Authにユーザーを作成します。
- [ ] Supabase Dashboardで対象ユーザーのUser IDを確認します。
- [ ] Supabase DashboardのSQL Editorで、以下のSQLを実行します。

```sql
update auth.users
set raw_app_meta_data =
  coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
where email = 'admin@example.com';
```

`admin@example.com` は実際の管理者メールアドレスに置き換えてください。

- [ ] 管理者ユーザーで一度ログアウトし、再ログインします。
- [ ] Supabase AuthのJWTが更新され、`app_metadata.role = "admin"` が反映されていることを確認します。

注意: 管理者設定に `service_role` key をフロントエンドへ渡す必要はありません。DashboardまたはSQL Editorで設定してください。

### 8.3 管理者承認

- [ ] 管理者ユーザーで `/admin` を開きます。
- [ ] 一般ユーザーAが投稿した `pending` 投稿が表示されることを確認します。
- [ ] 投稿を `approved` に変更します。
- [ ] トップページに戻り、公開一覧にその投稿が表示されることを確認します。
- [ ] 投稿詳細ページを開き、募集内容が表示されることを確認します。
- [ ] 連絡先やメールアドレスが投稿詳細に表示されていないことを確認します。

### 8.4 投稿者Aの権限確認

- [ ] 一般ユーザーAで再ログインします。
- [ ] 自分の投稿一覧に `approved` 投稿が表示されることを確認します。
- [ ] 画面上で `approved` 投稿を編集できるUIがないことを確認します。
- [ ] Supabase RLS上も、一般ユーザーAが `approved` 投稿を直接更新できない設計になっています。

補助確認として、Supabase SQL Editorで対象投稿の状態を確認できます。

```sql
select id, owner_id, match_date, region, category, status
from public.match_posts
order by created_at desc;
```

### 8.5 投稿者Bの権限確認

- [ ] 一般ユーザーBのメールアドレスでログインします。
- [ ] 一般ユーザーBでチーム登録します。
- [ ] 一般ユーザーBの画面に、一般ユーザーAの投稿が「自分の投稿」として表示されないことを確認します。
- [ ] 一般ユーザーBが一般ユーザーAの投稿を編集・削除できるUIがないことを確認します。
- [ ] RLS上も、一般ユーザーBは一般ユーザーAの投稿を更新・削除できません。

### 8.6 未ログイン状態の確認

- [ ] ログアウトします。
- [ ] トップページを開きます。
- [ ] `approved` 投稿だけが公開一覧に表示されることを確認します。
- [ ] `pending` または `rejected` 投稿が表示されないことを確認します。
- [ ] 投稿詳細ページで連絡先やメールアドレスが表示されないことを確認します。

### 8.7 秘密鍵の再確認

- [ ] 本番用の `.env.local` に `service_role` key、Secret key、DB password を入れていないことを確認します。
- [ ] VercelのEnvironment Variablesに登録する値が以下の2つだけであることを確認します。
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- [ ] `NEXT_PUBLIC_` が付く環境変数はブラウザに公開される前提で扱います。
- [ ] Supabaseの `service_role` key は管理スクリプトやサーバー専用処理でのみ使う鍵です。このMVPではローカル開発確認モード以外では使いません。

## 9. テスト用SQLと手動確認

### 9.1 投稿ステータスの確認

SQL Editorで投稿ステータスの件数を確認します。

```sql
select status, count(*)
from public.match_posts
group by status
order by status;
```

期待値:

- 投稿直後は `pending` が増えます。
- 管理者が承認すると `approved` が増えます。
- 一般公開一覧に出るのは `approved` だけです。

### 9.2 投稿とチームの所有者確認

```sql
select
  match_posts.id,
  match_posts.status,
  match_posts.owner_id as post_owner_id,
  teams.owner_id as team_owner_id,
  teams.name as team_name
from public.match_posts
join public.teams on teams.id = match_posts.team_id
order by match_posts.created_at desc;
```

期待値:

- `post_owner_id` と `team_owner_id` が一致します。
- 他ユーザーのチームIDを使った投稿はRLSで拒否されます。

### 9.3 公開一覧相当の確認

アプリの公開一覧と同じ条件で、承認済み投稿だけを確認します。

```sql
select id, match_date, region, category, desired_conditions, status
from public.match_posts
where status = 'approved'
order by match_date asc;
```

期待値:

- 未ログイン状態で見える投稿と同じ範囲になります。
- `pending` と `rejected` は含まれません。

### 9.4 管理者ロールの確認

```sql
select
  email,
  raw_app_meta_data
from auth.users
where email = 'admin@example.com';
```

期待値:

```json
{
  "role": "admin"
}
```

`admin@example.com` は実際の管理者メールアドレスに置き換えてください。

## 参考

- [Supabase Next.js quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs)
- [Vercel Next.js docs](https://vercel.com/docs/frameworks/full-stack/nextjs)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)
