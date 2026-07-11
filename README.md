# Buspo Match

中学野球・高校野球などの部活動向けに、練習試合募集を投稿・検索できるMVPです。Next.js + Supabase + Vercel の無料枠で動かす前提です。

## 現在の本番MVPでできること

- 公開中の練習試合募集を一覧表示できます。
- 投稿詳細ページを表示できます。
- 日付、地域、カテゴリで公開投稿を検索できます。
- 連絡先は一般公開しません。
- 投稿機能、通報機能、投稿者ログイン、管理者操作はAuth方式が確定するまで本番では準備中です。

## 将来導入候補: 即時公開・通報制

即時公開・通報制の実装コードとSQLは将来導入候補として残しています。ただし、Auth方式が未確定のため、まだ本番Supabaseには投入しません。

候補方針:

- 投稿者ログインを必須にします。
- チーム名、地域、カテゴリ、中学/高校、軟式/硬式を登録できます。
- ログイン済み投稿者の募集は原則 `approved` で即時公開します。
- 投稿本文のメールアドレス、電話番号、LINE ID、SNS IDらしき文字列は送信前に検出し、投稿不可にします。DB側のCHECK制約でも拒否します。
- ログイン済みユーザーだけが通報できます。
- 通報件数が一定以上になると投稿は `reported` になり、公開一覧から外れます。
- 投稿者は自分の投稿を非公開化・削除できます。
- 管理者は事後的に不適切投稿を非公開化・削除できます。

本番投入前の前提:

- Custom SMTPによるSupabase Authメールログインを導入します。
- [supabase/migration-immediate-publish-and-reports.sql](./supabase/migration-immediate-publish-and-reports.sql) は候補SQLとして残しますが、Auth方式が確定するまで本番Supabaseでは実行しません。
- 本番環境では投稿フォームと通報ボタンを準備中扱いにし、公開一覧・詳細・検索だけを提供します。

## Auth方式の長期方針

長期方針は、Custom SMTPを設定したSupabase Authのメールログインにします。

Supabase標準メールは、bounce backsによるメール送信権限リスク警告が出たため、本番Auth用途では使いません。標準メールは開発初期の確認には便利ですが、学校関係者向けの本番ログイン基盤としては、送信到達性、送信元管理、bounce管理を自分たちで制御できるCustom SMTPを前提にします。

短期方針:

- 本番公開版は閲覧・検索専用MVPとして維持します。
- 公開一覧、投稿詳細、検索は本番で引き続き提供します。
- 投稿、通報、投稿者操作、管理者操作はAuth方式が確定するまで本番では準備中にします。
- Supabase本番DBには、即時公開・通報制のmigrationをまだ実行しません。

Custom SMTP導入後に実運用テストする項目:

- 投稿者ログイン
- 管理者ログイン
- 投稿者による投稿削除・非公開化
- 通報制
- 管理者による事後モデレーション
- 連絡先を一般公開しない運用
- 不適切投稿や個人情報らしき投稿の検出・対応

SMTP候補:

- Resend: 初期導入の第一候補。設定が比較的簡単で、まずMVPを前に進めやすい。
- SendGrid: 実績が多く、配信管理機能も豊富。設定や運用確認はResendよりやや重くなる可能性があります。
- Amazon SES: 低コスト重視の候補。長期運用コストは抑えやすい一方、初期設定、DNS、sandbox解除などの手間があります。

現時点の優先順位:

1. 短期は閲覧・検索専用MVPを安定運用します。
2. Auth長期方針はCustom SMTPによるSupabase Authメールログインにします。
3. 初期導入は簡単さ重視でResendを第一候補にします。
4. 低コストを強く優先する場合はAmazon SESを候補にします。
5. 即時公開・通報制はCustom SMTP導入後の将来導入候補として扱います。

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

注意: 現在の本番Supabaseには、既存の公開一覧表示に必要なDB設定と `approved` テスト投稿だけを維持します。Auth方式が確定するまで、即時公開・通報制のmigrationは本番Supabaseで実行しません。

新規の空Supabaseプロジェクトで初回セットアップする場合は、Supabase Dashboard の SQL Editor で [supabase/schema-init.sql](./supabase/schema-init.sql) の内容を実行してください。

[supabase/schema.sql](./supabase/schema.sql) は再実行・調整用です。既存ポリシーやトリガーを作り直すために `drop policy if exists` と `drop trigger if exists` を含みます。テーブルや既存データを削除するSQLは含んでいませんが、Supabase SQL Editorの destructive operations 警告が出る場合があります。

現在の [supabase/schema.sql](./supabase/schema.sql) と [supabase/schema-init.sql](./supabase/schema-init.sql) には将来導入候補の即時公開・通報制も含まれます。本番Supabaseで使う前に、Auth方式、通報運用、連絡導線を確定してください。

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
  - `status`: `pending`, `approved`, `rejected`, `reported`, `hidden`
  - `report_count`: 通報件数
  - `hidden_reason`: 自動非表示や管理対応の理由
- `post_reports`
  - `post_id`: 通報対象投稿
  - `reporter_id`: 通報者ID
  - `reason`: 通報理由

RLSの考え方:

- 公開ユーザーは `approved` 投稿だけ閲覧できます。
- 投稿者はログイン必須です。自分のチームと自分の投稿だけ作成・閲覧できます。
- 投稿者が新規作成する投稿は原則 `approved` で即時公開されます。
- 投稿者は自分の投稿を `hidden` にして非公開化できます。
- 投稿者は自分の投稿を削除できます。
- 管理者は事後的に投稿を `hidden` / `rejected` / `approved` に変更し、削除できます。
- ログインユーザーは公開画面から通報できます。同一ユーザーは同じ投稿を1回だけ通報できます。
- 通報が3件以上になるとDBトリガーで `reported` になり、公開一覧から外れます。
- 連絡先フィールドは作っていません。

## 運用方針: 事前審査なし・自動チェック・通報制・事後削除

Buspo Matchの中学・高校向けMVPでは、管理者の事前審査をなくし、ログイン済み投稿者の募集を即時公開します。

安全対策:

- 投稿者ログインを必須にします。
- 連絡先は一般公開しません。連絡先フィールドも持ちません。
- 投稿フォーム送信前に、メールアドレス、電話番号、LINE ID、SNS IDらしき文字列を検出します。検出した場合は投稿不可にします。
- DBの `match_posts_no_public_contact_check` でも同種の文字列を拒否します。
- ログイン済みユーザーにだけ公開投稿の通報ボタンを表示します。
- 通報が3件以上になった投稿は `reported` になり、公開一覧から外れます。
- 投稿者は自分の募集を非公開化または削除できます。
- 管理者は事後的に不適切投稿を非公開化、却下、削除できます。

注意: 自動チェックは完全ではありません。本番運用前には禁止表現リスト、監査ログ、問い合わせ対応フロー、利用規約を追加してください。

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
- DB保護: RLS内の `public.is_admin()` がJWTの `app_metadata.role` を確認し、管理者以外の事後モデレーション操作を拒否します。

つまり、フロントエンド画面を改変されても、最終的な権限判定はSupabase RLSで行います。

## セキュリティ確認項目

- `.env.local`、`.env`、`.env.*.local` は `.gitignore` に含めています。
- フロントエンドで通常使う環境変数は `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` のみです。
- `service_role`、Secret key、DB password はソースコード、GitHub、Vercelの公開される変数に入れないでください。
- ローカル開発確認モードだけ、サーバー側APIで `SUPABASE_SERVICE_ROLE_KEY` を使います。`.env.local` のみに入れ、Vercelには登録しないでください。
- 一般公開される投稿は `match_posts.status = 'approved'` のみです。
- `reported`、`hidden`、`rejected` は一般ユーザーから見えません。
- 投稿者は他人の投稿を編集・削除できません。
- 投稿者は自分の投稿を非公開化・削除できます。
- RLSは `teams`、`match_posts`、`post_reports` で有効化しています。
- `post_reports` は `reporter_id = auth.uid()` の場合だけINSERTできます。
- `post_reports_unique_reporter_idx` により、同一ユーザーは同一投稿を複数回通報できません。

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
- 管理画面での非公開化、却下、削除の操作感

仮データ版の注意点:

- Supabaseには接続しません。
- メール認証は行いません。
- 投稿、非公開化、却下、削除、通報は実保存されません。
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

将来導入候補の即時公開・通報制を、ローカル環境だけで確認する場合は、`.env.local` に以下を追加します。

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
- 投稿フォームから作成した募集は `approved` としてSupabaseに保存され、公開一覧に表示されます。
- 管理画面 `/admin` で `approved` 投稿を `hidden` または `rejected` に変更できます。
- 通報ボタンは開発確認モード専用APIで `post_reports` に保存できます。
- 通報3件で `reported` になる処理を試すには、ローカル検証用Supabaseに [supabase/migration-immediate-publish-and-reports.sql](./supabase/migration-immediate-publish-and-reports.sql) を適用してから確認してください。

注意:

- `SUPABASE_SERVICE_ROLE_KEY` は強い権限を持つサーバー専用キーです。
- ブラウザに公開しないでください。
- GitHubにアップロードしないでください。
- `NEXT_PUBLIC_DEV_AUTH_BYPASS` と `SUPABASE_SERVICE_ROLE_KEY` はVercelのEnvironment Variablesに登録しないでください。
- 本番ではこの開発確認モードを使わず、Custom SMTPによるSupabase Authメールログインを導入してください。

## 4.5 現在の到達点

2026年7月10日時点で、以下まで確認済みです。

- Supabase SQL Editorで [supabase/schema.sql](./supabase/schema.sql) を実行済みです。
- Supabase Databaseへの接続を確認済みです。
- Supabase SQL Editorで [supabase/test-data.sql](./supabase/test-data.sql) を実行済みです。
- [supabase/test-data.sql](./supabase/test-data.sql) による `approved` のテスト投稿が、トップページの「公開中の練習試合募集」に表示されることを確認済みです。
- `NEXT_PUBLIC_DEV_AUTH_BYPASS` をローカルで `true` にし、`SUPABASE_SERVICE_ROLE_KEY` を `.env.local` に置くローカル開発確認モードで、投稿作成、`approved` 即時公開、管理画面での非公開化・削除まで確認する方針です。
- `SUPABASE_SERVICE_ROLE_KEY` は `.env.local` のみに置きます。GitHubへアップロードしないでください。
- Vercelには `SUPABASE_SERVICE_ROLE_KEY` と `NEXT_PUBLIC_DEV_AUTH_BYPASS` を絶対に登録しないでください。
- Supabase Authの確認メール送信は、Supabase標準メールの制限と bounce backs による送信権限リスク警告により、テスト送信を一旦停止しています。
- Authメールテストは停止中です。ログイン機能は一旦後回しにし、本番では公開投稿表示、検索、詳細表示を優先しています。
- 即時公開・通報制は将来導入候補として実装済みですが、Auth方式が確定するまで本番Supabaseには投入しません。
- 本番前には Custom SMTP を設定し、Supabase Authメールログインを実運用テストします。
- `pnpm run build` または `npm run build` を実行し、Next.jsの本番ビルドが成功することを確認してください。

## 4.6 将来導入候補SQL: 即時公開・通報制migration

既存Supabaseへ即時公開・通報制を反映する候補SQLとして、[supabase/migration-immediate-publish-and-reports.sql](./supabase/migration-immediate-publish-and-reports.sql) を残しています。

現時点では本番Supabaseに実行しません。Auth方式、通報運用、連絡導線が確定したあと、本番投入前チェックを行ってから実行します。

このmigrationの性質:

- `DROP TABLE`、`TRUNCATE`、`DELETE FROM` は含みません。
- 既存の投稿行は削除しません。
- `match_posts.status` の既存値を一括更新しません。
- `status` の許容値に `reported` と `hidden` を追加し、今後の新規投稿のデフォルトを `approved` にします。
- `post_reports` テーブル、通報件数、通報3件以上で `reported` にするトリガーを追加します。
- 同一ユーザーが同じ投稿を複数回通報できないよう、`post_reports_unique_reporter_idx` を追加します。

実行前チェックSQL:

```sql
select status, count(*)
from public.match_posts
group by status
order by status;
```

期待値: 既存の `approved` 投稿3件など、現在の件数を控えます。

```sql
select id, status, desired_conditions, body
from public.match_posts
where
  (desired_conditions || E'\n' || body) ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}'
  or (desired_conditions || E'\n' || body) ~* '0[0-9]{1,4}[- ]?[0-9]{1,4}[- ]?[0-9]{3,4}'
  or (desired_conditions || E'\n' || body) ~* 'line[[:space:]]*(id)?[[:space:]]*[:：]?[[:space:]]*[@A-Z0-9._-]{3,}'
  or (desired_conditions || E'\n' || body) ~* '(@[A-Z0-9_]{3,}|((instagram|twitter|tiktok|facebook|sns)[[:space:]]*(id|アカウント)?|x[[:space:]]*(id|アカウント))[[:space:]]*[:：][[:space:]]*[@A-Z0-9._-]{3,})';
```

期待値: 0件です。1件以上出る場合、`match_posts_no_public_contact_check` の追加でmigrationが失敗する可能性があります。既存投稿の本文を確認し、連絡先を除去してから実行してください。

任意のバックアップSQL:

```sql
create table if not exists public.match_posts_backup_before_immediate_publish as
select *
from public.match_posts;
```

実行後チェックSQL:

```sql
select status, count(*)
from public.match_posts
group by status
order by status;
```

期待値: 既存の `approved` 投稿件数は実行前と同じです。

```sql
select
  tablename,
  rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('teams', 'match_posts', 'post_reports');
```

期待値: 3テーブルすべて `rowsecurity = true` です。

復旧方針:

- migrationが途中で失敗した場合、エラー内容を確認し、失敗した制約やポリシーの原因を直して再実行します。このmigrationはテーブル削除や投稿削除を行いません。
- 公開表示に問題が出た場合、`match_posts_backup_before_immediate_publish` を作っていれば、`id` 単位で `status` を戻せます。
- 通報制を一時停止する場合は、アプリ側の通報ボタンを非表示にし、必要に応じて `post_reports_apply_threshold` トリガーを無効化します。
- 本番で実行する前に、Supabase SQL Editorで上記の実行前チェックを必ず行ってください。

## 4.7 Vercel公開後の確認状況

2026年7月10日時点で、Vercel公開URL [https://buspo-match.vercel.app/](https://buspo-match.vercel.app/) の動作を確認済みです。

確認済み:

- トップページが公開URLで表示されます。
- Supabaseの `approved` 投稿が公開一覧に表示されます。
- 公開一覧の「詳細を見る」から投稿詳細ページを開けます。
- 検索フォームで試合希望日、地域、区分、硬式/軟式の絞り込みができます。
- 検索結果が0件の場合、「条件に一致する募集はありません。条件を変えて検索してください。」と表示されます。
- 条件クリアで検索条件が戻り、公開中募集が再表示されます。
- 本番画面に「開発確認モード」は表示されません。
- `/api/dev/*` は本番で `403` になり、投稿・承認用の開発APIは動作しません。
- `/admin` は未ログイン状態では管理者ログインを求め、非公開化・削除などの危険操作ボタンは表示されません。
- スマホ幅390px相当で横スクロールがないことを確認済みです。

残課題:

- Supabase標準メールは bounce 警告によりAuthメールテスト停止中です。
- 本番運用前に Custom SMTP を設定し、Supabase Authメールログインを確認する必要があります。
- 管理者ログイン、投稿者ログイン、連絡導線は、本番用Auth方針決定後に再確認します。

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

- 連絡導線を作る。例: 管理者経由、または関係者だけが見られるメッセージ機能。
- 学校関係者確認フローを追加する。
- 通報の管理画面、監査ログ、しきい値調整を追加する。
- 利用規約、プライバシーポリシー、問い合わせ先を用意する。
- 投稿削除ではなく論理削除にするかを決める。
- Supabase Authのメール送信は、本番ではCustom SMTPを使う。初期候補はResend、低コスト重視ならAmazon SESも比較する。

## 8. 実Supabase接続後の動作確認チェックリスト

Vercelまたはローカル環境で実Supabaseに接続したあと、以下を順番に確認してください。

### 8.1 投稿者Aの作成と即時公開

- [ ] Supabase Authまたはアプリのログイン画面から、一般ユーザーAのメールアドレスでログインします。
- [ ] 一般ユーザーAでチーム登録を行います。
  - チーム名
  - 地域
  - カテゴリ
  - 中学/高校
  - 軟式/硬式
- [ ] 一般ユーザーAで練習試合募集を投稿します。
- [ ] 投稿後、自分の投稿一覧でステータスが `approved` / `公開中` になっていることを確認します。
- [ ] 別ブラウザ、シークレットウィンドウ、またはログアウト状態でトップページを開き、その投稿が公開一覧に表示されることを確認します。
- [ ] 投稿本文にメールアドレス、電話番号、LINE ID、SNS IDらしき文字列を入れると、送信前にエラーになり投稿できないことを確認します。

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

### 8.3 管理者の事後モデレーション

- [ ] 管理者ユーザーで `/admin` を開きます。
- [ ] 一般ユーザーAが投稿した `approved` 投稿が表示されることを確認します。
- [ ] 必要に応じて投稿を `hidden` または `rejected` に変更できることを確認します。
- [ ] `hidden` または `rejected` にした投稿が公開一覧から消えることを確認します。
- [ ] `approved` に戻すと公開一覧に再表示されることを確認します。
- [ ] 投稿詳細ページを開き、募集内容が表示されることを確認します。
- [ ] 連絡先やメールアドレスが投稿詳細に表示されていないことを確認します。

### 8.4 投稿者Aの権限確認

- [ ] 一般ユーザーAで再ログインします。
- [ ] 自分の投稿一覧に `approved` 投稿が表示されることを確認します。
- [ ] 「非公開にする」で自分の投稿を `hidden` にできることを確認します。
- [ ] 「削除」で自分の投稿を削除できることを確認します。
- [ ] Supabase RLS上も、一般ユーザーAが他人の投稿を更新・削除できない設計になっています。

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

### 8.6 通報機能の確認

- [ ] ログイン済みの一般ユーザーで公開投稿の「通報する」を押します。
- [ ] SQL Editorで `post_reports` に通報が入ったことを確認します。
- [ ] 同じユーザーが同じ投稿を再度通報しようとすると、重複制約で失敗することを確認します。
- [ ] 別ユーザーで同じ投稿に対してテスト通報を合計3件投入します。
- [ ] 対象投稿の `report_count` が3以上になり、`status` が `reported` になることを確認します。
- [ ] `reported` 投稿が公開一覧から消えることを確認します。

### 8.7 未ログイン状態の確認

- [ ] ログアウトします。
- [ ] トップページを開きます。
- [ ] `approved` 投稿だけが公開一覧に表示されることを確認します。
- [ ] `pending`、`rejected`、`reported`、`hidden` 投稿が表示されないことを確認します。
- [ ] 未ログイン状態では通報、投稿者削除、管理操作のボタンが表示されないことを確認します。
- [ ] 投稿詳細ページで連絡先やメールアドレスが表示されないことを確認します。

### 8.8 秘密鍵の再確認

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

- 投稿直後は `approved` が増えます。
- 通報が3件以上になると `reported` になります。
- 投稿者または管理者が非公開化すると `hidden` になります。
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
- `pending`、`rejected`、`reported`、`hidden` は含まれません。

### 9.4 通報件数と自動 reported 化の確認

```sql
select id, post_id, reporter_id, reason, created_at
from public.post_reports
order by created_at desc;
```

```sql
select id, status, report_count, hidden_reason
from public.match_posts
where report_count >= 1
order by updated_at desc;
```

期待値:

- `post_reports` に通報行が保存されます。
- 同一投稿の通報が3件以上になると `match_posts.status = 'reported'` になります。
- `reported` 投稿はトップページの公開一覧に表示されません。

### 9.5 管理者ロールの確認

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
