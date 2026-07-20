# Buspo Match

中学・高校野球向けに、練習試合募集を投稿・検索できるMVPです。

現在の本番構成は **Next.js + Firebase Authentication + Cloud Firestore + Firebase Admin SDK + Vercel** です。旧Supabase版からFirebase版へ移行済みで、Supabaseのセットアップ手順とSQLは整理対象になっています。

## 現在できること

- 公開中の練習試合募集を一覧表示する
- 地域、中学/高校、硬式/軟式、試合希望日で検索する
- 公開中募集の詳細ページ `/posts/[id]` を共有する
- Googleログイン済みユーザーが募集を投稿する
- 投稿は原則 `approved` として即時公開する
- 投稿本文にメールアドレス、電話番号、LINE ID、SNS IDらしき文字列が含まれる場合は投稿を拒否する
- 投稿者本人が自分の投稿を非公開化・削除する
- ログイン済みユーザーが他人の投稿を通報する
- 通報件数がしきい値以上になった投稿を `reported` にして公開一覧から外す
- 管理者が `/firebase-admin` で `reported` / `hidden` 投稿を事後モデレーションする
- 投稿詳細から管理者経由の問い合わせを送信する
- 管理者が問い合わせを確認し、statusと内部メモ `adminNote` を管理する

連絡先や投稿者メールアドレスは公開画面に表示しません。問い合わせは管理者確認を経由する設計です。

## 主な画面

- `/`: Firebase版トップページ、検索、投稿フォーム、公開募集一覧
- `/posts/[id]`: Firebase版投稿詳細ページ
- `/firebase-admin`: Firebase管理者モデレーション画面
- `/firebase-test`: Firebase Auth / Firestore確認用ページ
- `/terms`: 利用規約
- `/privacy`: プライバシーポリシー
- `/guidelines`: 注意事項

## 使用サービス

- GitHub: ソースコード管理
- Vercel: Next.js公開ホスティング
- Firebase Authentication: Googleログイン
- Cloud Firestore: 募集投稿、通報、問い合わせの保存
- Firebase Admin SDK: Vercel API Routeからの管理操作、通報処理、問い合わせ処理

Firebase Hostingは使わず、公開はVercelで行います。

## ローカル開発

```bash
pnpm install
cp .env.example .env.local
pnpm run dev
```

`.env.local` にはFirebase ConsoleとFirebase Admin SDKの値を設定します。`.env.local` はGit管理対象外です。

ブラウザで `http://localhost:3000` を開きます。

## Firebase設定

Firebase Consoleで以下を設定します。

1. Firebaseプロジェクトを作成する
2. Webアプリを追加する
3. AuthenticationでGoogle providerを有効化する
4. Authorized domainsに以下を追加する
   - `localhost`
   - Vercel Previewドメイン
   - `buspo-match.vercel.app`
5. Firestore Databaseを作成する
6. Firestore Security Rulesを最新版に更新する
7. Firebase Admin SDK用のサービスアカウントを作成し、Vercelのserver-only環境変数に設定する

Firestore Rulesの最新版、Preview確認手順、管理API仕様は [docs/firebase-rebuild-plan.md](./docs/firebase-rebuild-plan.md) を参照してください。

## 環境変数

`.env.example` にはダミー値だけを記載しています。実値は `.env.local` またはVercel Environment Variablesに設定します。

ブラウザに公開されるFirebase Web SDK用:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

サーバー専用:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `REPORT_THRESHOLD`
- `FIREBASE_ADMIN_EMAILS`

将来の管理者通知用。現時点では実メール送信には接続していません。

- `ADMIN_NOTIFICATION_EMAILS`
- `MAIL_PROVIDER_API_KEY`

注意:

- `FIREBASE_PRIVATE_KEY`、`FIREBASE_CLIENT_EMAIL`、`FIREBASE_ADMIN_EMAILS` はGitに入れないでください。
- `FIREBASE_PRIVATE_KEY` などのserver-only変数に `NEXT_PUBLIC_` を付けないでください。
- VercelではPreviewとProductionで環境変数が別管理です。Productionにも同じFirebase設定が必要です。

## Vercelデプロイ

1. GitHubにpushします。
2. VercelでGitHubリポジトリをImportします。
3. Framework PresetがNext.jsになっていることを確認します。
4. Environment VariablesにFirebase用変数を登録します。
5. Deployを実行します。
6. Firebase AuthenticationのAuthorized domainsにVercel本番ドメインとPreviewドメインを追加します。
7. 本番URL `/`、`/posts/[id]`、`/firebase-admin` を確認します。

## セキュリティ方針

- 投稿者ログインはGoogleログインを使います。
- 募集投稿はFirestore `matchPosts` に保存します。
- 一般公開されるのは `status == "approved"` の投稿だけです。
- `reported` / `hidden` 投稿は一般ユーザーから読めないRulesにします。
- 投稿者本人だけが自分の投稿を `hidden` に更新、または削除できます。
- 通報処理はクライアントから直接Firestoreを書き換えず、Vercel API Route + Firebase Admin SDK経由で行います。
- 管理者操作は `FIREBASE_ADMIN_EMAILS` に含まれるGoogleアカウントだけ許可します。
- 問い合わせ本文、投稿本文には連絡先らしき文字列を含められません。
- `postReports` と `postInquiries` はクライアントから直接読み書きしないRulesにします。
- 管理者メモ `adminNote` は管理者画面だけで表示・更新し、公開画面には表示しません。

## 動作確認チェックリスト

- [ ] `/` が表示される
- [ ] `approved` 投稿だけが一覧に表示される
- [ ] 検索条件を変更すると一覧が絞り込まれる
- [ ] `/posts/[id]` で公開投稿の詳細が表示される
- [ ] `hidden` / `reported` / 存在しない投稿は詳細で非公開扱いになる
- [ ] Googleログインできる
- [ ] ログイン済みユーザーだけ投稿できる
- [ ] 連絡先らしき文字列を含む投稿が拒否される
- [ ] 自分の投稿だけ非公開化・削除できる
- [ ] 他人の投稿だけ通報できる
- [ ] 重複通報が拒否される
- [ ] 通報しきい値以上で投稿が `reported` になり一覧から消える
- [ ] 詳細ページから管理者経由問い合わせを送信できる
- [ ] `/firebase-admin` は管理者メールだけ操作できる
- [ ] 管理者が投稿を `approved` / `hidden` に変更、削除できる
- [ ] 管理者が問い合わせを `new` / `reviewed` / `closed` に変更、削除できる
- [ ] 管理者が問い合わせごとに内部メモを保存できる
- [ ] 公開画面に投稿者メール、問い合わせ送信者メール、管理者メモが表示されない
- [ ] `pnpm run build` が成功する

## 旧Supabase版について

Buspo Matchは当初Supabase版として作成されましたが、本番運用はFirebase版へ移行済みです。

現在は旧Supabaseコードを段階的に整理しています。削除計画と実施履歴は [docs/supabase-cleanup-plan.md](./docs/supabase-cleanup-plan.md) に記録しています。

第3段階では、旧Supabase SQLとREADME / `.env.example` の旧Supabase手順を整理しています。`package.json` と `pnpm-lock.yaml` に残る `@supabase/supabase-js` は、次段階で依存整理として削除候補です。

## 参考

- [Firebase移行設計書](./docs/firebase-rebuild-plan.md)
- [Supabase整理計画](./docs/supabase-cleanup-plan.md)
- [Vercel Next.js docs](https://vercel.com/docs/frameworks/full-stack/nextjs)
