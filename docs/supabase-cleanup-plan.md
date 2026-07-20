# Supabase Cleanup Plan

作成日: 2026-07-21

Buspo Matchは本番トップページをFirebase版へ切り替え済みです。この文書は、旧Supabase関連コード・SQL・環境変数・docsを将来的に削除するための棚卸しです。現時点では削除を実行しません。

## 現在の前提

- 作業対象ブランチは `main`。
- 本番トップページ `/` は `app/page.tsx` から `components/firebase-posts-experience.tsx` を表示している。
- 投稿詳細 `/posts/[id]` はFirebase / Firestore版として動作している。
- 管理画面 `/firebase-admin` はFirebase Admin SDK経由で投稿・通報・問い合わせを管理している。
- 旧Supabase関連コードは、Firebase切替直後の比較・rollback判断用として残している。
- この計画書では削除対象を整理するだけで、コード削除、依存削除、環境変数削除は行わない。

## Supabase関連の検出結果

### コード・API Route

| パス | 内容 | 現在の本番Firebase版での扱い |
| --- | --- | --- |
| `app/admin/page.tsx` | 旧Supabase管理画面。Supabase Auth、`match_posts` 更新・削除を使う | 第1段階で削除済み |
| `app/api/dev/match-posts/route.ts` | ローカル開発確認モード用のSupabase投稿作成・一覧API | 第1段階で削除済み |
| `app/api/dev/match-posts/[id]/route.ts` | ローカル開発確認モード用のSupabase投稿status更新・削除API | 第1段階で削除済み |
| `app/api/dev/match-posts/[id]/report/route.ts` | ローカル開発確認モード用のSupabase通報API | 第1段階で削除済み |
| `lib/supabase.ts` | Supabase browser client初期化 | 第2段階で削除済み |
| `lib/supabase-admin.ts` | Supabase service role用server-only client | 第2段階で削除済み |
| `lib/dev-auth.ts` | Supabaseローカル開発確認モード用の固定IDと有効化条件 | 第1段階で削除済み |
| `lib/types.ts` | Supabaseテーブル構造に合わせた型 | Firebase本番では未使用の可能性が高い。参照確認後に削除候補 |
| `lib/messages.ts` | 旧Supabase RLS等にも使えるエラー文言補助 | 最終段階で型名を汎用化済み。現時点では未使用 |

### SQL・データ移行資料

| パス | 内容 | 現在の扱い |
| --- | --- | --- |
| `supabase/schema.sql` | 旧Supabase再実行・調整用schema | 第3段階で削除済み |
| `supabase/schema-init.sql` | 旧Supabase初回セットアップ用schema | 第3段階で削除済み |
| `supabase/test-data.sql` | 旧Supabaseテストデータ投入SQL | 第3段階で削除済み |
| `supabase/migration-immediate-publish-and-reports.sql` | 旧Supabase即時公開・通報制の候補migration | 第3段階で削除済み |

### 依存関係

| パス | 内容 | 現在の扱い |
| --- | --- | --- |
| `package.json` | `@supabase/supabase-js` が依存に残っていた | 最終段階で削除済み |
| `pnpm-lock.yaml` | `@supabase/*` のlock情報が残っていた | 最終段階で更新済み |

### 環境変数

| 変数 | 用途 | 現在の扱い |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 旧Supabase browser/server client用 | 第3段階で `.env.example` から削除済み。Vercelにも不要 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 旧Supabase browser client用 | 第3段階で `.env.example` から削除済み。Vercelにも不要 |
| `SUPABASE_SERVICE_ROLE_KEY` | 旧Supabaseローカル開発確認API用server-only key | 第3段階で `.env.example` から削除済み。Vercelにも不要 |
| `NEXT_PUBLIC_DEV_AUTH_BYPASS` | 旧Supabaseローカル開発確認モードの有効化 | 第3段階で `.env.example` から削除済み。Vercelにも不要 |

`.env.example` のSupabase関連変数は第3段階で削除済み。

### docs

| パス | 内容 | 現在の扱い |
| --- | --- | --- |
| `README.md` | Supabase MVP時代のセットアップ、Auth、RLS、Vercel手順が多く残っていた | 第3段階でFirebase本番向けに整理済み。旧Supabase版は過去経緯として最小限だけ残す |
| `docs/firebase-rebuild-plan.md` | Firebase移行設計・確認履歴。Supabase rollback方針も含む | 移行履歴として当面保留。cleanup完了後も履歴docsとして残す候補 |
| `docs/supabase-cleanup-plan.md` | この計画書 | cleanup判断の管理資料として保留 |

## 削除候補

Firebase本番運用が安定し、Supabase rollbackが不要と判断できた後に削除候補にしたもの:

- `app/admin/page.tsx` (第1段階で削除済み)
- `app/api/dev/match-posts/route.ts` (第1段階で削除済み)
- `app/api/dev/match-posts/[id]/route.ts` (第1段階で削除済み)
- `app/api/dev/match-posts/[id]/report/route.ts` (第1段階で削除済み)
- `lib/supabase.ts` (第2段階で削除済み)
- `lib/supabase-admin.ts` (第2段階で削除済み)
- `lib/dev-auth.ts` (第1段階で削除済み)
- `lib/types.ts`
- `lib/messages.ts` (最終段階で型名を汎用化済み)
- `supabase/schema.sql` (第3段階で削除済み)
- `supabase/schema-init.sql` (第3段階で削除済み)
- `supabase/test-data.sql` (第3段階で削除済み)
- `supabase/migration-immediate-publish-and-reports.sql` (第3段階で削除済み)
- `@supabase/supabase-js` dependency (最終段階で削除済み)
- `pnpm-lock.yaml` 内の `@supabase/*` lock entries (最終段階で削除済み)
- `.env.example` のSupabase関連変数 (第3段階で削除済み)
- READMEのSupabase本番手順、Supabase Auth、RLS、Custom SMTP方針の旧記述 (第3段階で整理済み)

## 保留候補

短期的に残す候補:

- `docs/firebase-rebuild-plan.md`
  - Firebase移行の設計・Preview・Production確認履歴が入っているため、cleanup後も履歴資料として有用。
- `docs/supabase-cleanup-plan.md`
  - 削除判断と実施チェックの記録用。

第3段階で `supabase/*.sql` は削除済み。以後、旧Supabase SQLはGit管理対象に残さない。

## 注意点

- `app/admin/page.tsx` は旧Supabase管理画面であり、Firebase管理画面 `/firebase-admin` とは別物。
- `app/api/dev/*` は旧Supabaseのローカル開発確認用APIであり、Firebase版の投稿・通報・問い合わせAPIとは別物。
- Supabase関連依存を削除する場合は、先にSupabase importを全て消してから `pnpm install` でlockfileを更新する。
- `.env.example` からSupabase変数を消す場合は、READMEの該当手順も同時に整理する。
- Vercel ProductionにSupabase変数が残っていてもFirebase本番画面では通常使われないが、混乱と誤設定を避けるためcleanup完了後に削除候補とする。
- `NEXT_PUBLIC_DEV_AUTH_BYPASS` は名前に `NEXT_PUBLIC_` が付くため、Vercelに登録しない方針を維持する。
- `SUPABASE_SERVICE_ROLE_KEY` は強い権限を持つため、Git管理対象・Vercel Production環境変数に入れない。
- Firebase版で使う `FIREBASE_PRIVATE_KEY`、`FIREBASE_CLIENT_EMAIL`、`FIREBASE_ADMIN_EMAILS` 等のserver-only変数は、このSupabase cleanupとは別に引き続き保護する。

## 削除実施前チェックリスト

- [ ] 本番URL `/` がFirebase版トップページとして動作している。
- [ ] `/posts/[id]` がFirebase版詳細ページとして動作している。
- [ ] `/firebase-admin` でFirebase管理者モデレーション、問い合わせ管理、管理者メモが動作している。
- [ ] Firebase Authentication Googleログインが本番で動作している。
- [ ] Firestore Rulesが最新版である。
- [ ] Vercel ProductionにFirebase用環境変数が登録されている。
- [ ] Vercel ProductionからSupabase環境変数を削除しても本番Firebase版が動作することをPreviewまたは別環境で確認する。
- [ ] Supabase版へrollbackする必要がないと判断している。
- [ ] rollbackが必要な場合は、削除前commitへrevertできることを確認している。
- [ ] `rg -n -i "supabase|NEXT_PUBLIC_SUPABASE|SUPABASE_|@supabase" app lib components package.json .env.example README.md docs` で残存参照を確認する。
- [ ] `pnpm run build` が成功する。

## 推奨実装順序

1. READMEをFirebase本番版の内容に整理し、Supabaseの長い旧手順を履歴docsへ移す。
2. `/admin` 旧Supabase管理画面への導線と必要性を確認し、不要なら `app/admin/page.tsx` を削除する。
3. `app/api/dev/*` の旧Supabase開発確認APIを削除する。
4. `lib/supabase.ts`、`lib/supabase-admin.ts`、`lib/dev-auth.ts`、未使用であれば `lib/types.ts`、`lib/messages.ts` を削除する。
5. `supabase/*.sql` を削除または `docs/archive/supabase/` のような履歴場所へ移す。
6. `package.json` から `@supabase/supabase-js` を削除し、lockfileを更新する。
7. `.env.example` からSupabase関連変数を削除する。
8. Vercel Production/Preview/Development環境変数からSupabase関連変数が残っていないか確認する。
9. `pnpm run build`、主要画面確認、秘密情報チェックを行う。
10. 小さな単位でcommitし、問題時にrevertしやすくする。

## 本番Firebase版への影響確認

現時点の確認では、本番トップ `/`、Firebase版一覧 `/firebase-posts`、Firebase詳細 `/posts/[id]`、Firebase管理画面 `/firebase-admin` はFirebase関連ファイルを参照しており、旧Supabase clientを直接参照していない。

そのため、この計画書の追加自体は本番Firebase版の動作に影響しない。

## 第1段階削除の実施記録

実施日: 2026-07-21

Firebase版本番運用に不要となり、本番導線から完全に外れている旧Supabase関連コードのうち、以下だけを削除対象にしました。

削除したファイル:

- `app/admin/page.tsx`
- `app/api/dev/match-posts/route.ts`
- `app/api/dev/match-posts/[id]/route.ts`
- `app/api/dev/match-posts/[id]/report/route.ts`
- `lib/dev-auth.ts`

この段階で削除しなかったもの:

- `lib/supabase.ts`
- `lib/supabase-admin.ts`
- `supabase/*.sql`
- `@supabase/supabase-js`
- `package.json` と `pnpm-lock.yaml` のSupabase依存
- `.env.example` のSupabase関連変数
- README内の旧Supabase手順

確認方針:

- Firebase版の `/`、`/posts/[id]`、`/firebase-admin`、投稿、通報、問い合わせ、管理者メモは維持する。
- 削除対象外のSupabase clientとSQLは、次段階の依存整理またはdocs整理まで残す。
- 削除後に `rg` で `@/lib/dev-auth`、`isDevAuthBypassEnabled`、`/api/dev/match-posts` の残存参照を確認する。
- `pnpm run build` を実行し、importエラーやroute生成エラーがないことを確認する。

## 第2段階削除の実施記録

実施日: 2026-07-21

第1段階で旧Supabase管理画面と旧開発確認APIを削除したため、そこから参照されていたSupabase helperを削除対象にしました。

削除したファイル:

- `lib/supabase.ts`
- `lib/supabase-admin.ts`

この段階で削除しなかったもの:

- `package.json` と `pnpm-lock.yaml` の `@supabase/supabase-js`
- `supabase/*.sql`
- `.env.example` のSupabase関連変数
- README内の旧Supabase手順
- `lib/types.ts`
- `lib/messages.ts`

残参照の扱い:

- `supabase`、`createClient`、`SUPABASE`、`NEXT_PUBLIC_SUPABASE` の検索結果は、今回残す方針の `README.md`、`.env.example`、`package.json`、`pnpm-lock.yaml`、`supabase/*.sql`、移行docs内の記述に限定する。
- `app`、`components`、Firebase管理API、Firebase投稿APIから旧Supabase helperへのimportがないことを確認する。

確認方針:

- Firebase版の `/`、`/posts/[id]`、`/firebase-admin`、投稿、通報、問い合わせ、管理者メモは維持する。
- `pnpm run build` を実行し、importエラーや型エラーがないことを確認する。

## 最終段階依存整理の実施記録

実施日: 2026-07-21

Firebase版本番運用で不要になったSupabase依存を削除し、残っていたSupabase由来の型名を汎用名へ整理しました。

実施内容:

- `package.json` から `@supabase/supabase-js` を削除した。
- `pnpm install` で `pnpm-lock.yaml` を更新した。
- `lib/messages.ts` の `SupabaseLikeError` を `AppLikeError` に変更した。

`lib/messages.ts` の扱い:

- `friendlyError` と `validateRequired` は現時点で `app`、`lib`、`components` から参照されていない。
- ただしSupabase専用実装ではなく、一般的なエラー表示補助として使えるため、この段階では削除せず型名だけ汎用化した。

残参照の扱い:

- `app`、`lib`、`components` から `Supabase`、`supabase`、`@supabase/supabase-js`、`SUPABASE`、`NEXT_PUBLIC_SUPABASE` の参照が消えていることを確認する。
- 残るSupabase記述は、READMEの過去経緯、`docs/firebase-rebuild-plan.md` の移行履歴、`docs/supabase-cleanup-plan.md` のcleanup履歴に限定する。

確認方針:

- Firebase版の `/`、`/posts/[id]`、`/firebase-admin`、投稿、通報、問い合わせ、管理者メモは維持する。
- `pnpm run build` を実行し、依存解決、importエラー、型エラーがないことを確認する。

## 第3段階整理の実施記録

実施日: 2026-07-21

Firebase版本番運用では不要になった旧Supabase SQLと、README / `.env.example` に残っていた旧Supabase手順・環境変数例を整理対象にしました。

削除したファイル:

- `supabase/schema.sql`
- `supabase/schema-init.sql`
- `supabase/test-data.sql`
- `supabase/migration-immediate-publish-and-reports.sql`

整理したファイル:

- `.env.example`
  - Supabase関連環境変数を削除した。
  - Firebase Web SDK、Firebase Admin SDK、通報しきい値、管理者メール、将来の通知用ダミー変数だけを残した。
- `README.md`
  - 現在の本番構成を `Next.js + Firebase Authentication + Cloud Firestore + Firebase Admin SDK + Vercel` 前提に書き直した。
  - 旧Supabaseセットアップ手順、Supabase SQL実行手順、Supabase Auth / RLSの運用手順を削除した。
  - 旧Supabase版は過去経緯として最小限に整理し、cleanup計画へのリンクを残した。

この段階で削除しなかったもの:

- `package.json` と `pnpm-lock.yaml` の `@supabase/supabase-js`
- `lib/types.ts`
- `lib/messages.ts`
- `docs/firebase-rebuild-plan.md` 内の移行履歴

残参照の扱い:

- `supabase`、`createClient`、`SUPABASE`、`NEXT_PUBLIC_SUPABASE` の残参照は、`package.json`、`pnpm-lock.yaml`、移行・cleanup docs内の履歴記述に限定する。
- `app`、`lib`、`components`、`.env.example`、`README.md` から旧Supabase環境変数と旧Supabase helper参照が消えていることを確認する。

確認方針:

- Firebase版の `/`、`/posts/[id]`、`/firebase-admin`、投稿、通報、問い合わせ、管理者メモは維持する。
- `pnpm run build` を実行し、importエラーや型エラーがないことを確認する。
