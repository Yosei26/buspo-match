# Buspo Match Firebase移行設計書

作成日: 2026-07-17

## 目的

Buspo MatchをSupabase版からFirebase版へ作り直すための設計メモです。現行Supabase版はすぐ削除せず、Firebase版は別ブランチまたは別ディレクトリで構築します。

本番公開は引き続きVercel + Next.jsで行い、Firebase Hostingは使いません。

## 前提方針

- SupabaseはFirebase版では使わない。
- Vercel + Next.jsは維持する。
- Firebase Authenticationを使う。
- 投稿者ログインはGoogleログインを第一候補にする。
- 募集投稿はCloud Firestoreに保存する。
- 対象は中学・高校向けの練習試合募集に絞る。
- 投稿はGoogleログイン済みユーザーだけ可能にする。
- 投稿は原則即時公開にする。
- メールアドレス、電話番号、LINE ID、SNS IDらしき文字列が投稿本文に含まれる場合は投稿不可にする。
- 投稿者は自分の投稿を非公開化・削除できる。
- 通報機能を追加する。
- 通報が一定数に達した投稿は自動で `reported` または `hidden` にする。
- 管理者は事後的に投稿を非公開・削除できる。

## Firebaseで使うサービス

### Firebase Authentication

用途:

- Googleログイン
- 投稿者の本人識別
- 管理者判定用のCustom Claims

候補ログイン方式:

- 第一候補: Googleログイン
- 将来候補: メールリンクログイン、学校ドメイン制限、管理者承認付きログイン

管理者判定:

- Firebase AuthのCustom Claimsに `admin: true` を付ける。
- Firestore Security Rulesでは `request.auth.token.admin == true` で管理者権限を判定する。
- Custom Claimsの設定はFirebase Admin SDKを使う管理スクリプトまたは管理用Vercel APIで行う。

### Cloud Firestore

用途:

- チーム情報
- 練習試合募集
- 通報情報
- 管理者用の監査ログ

FirestoreはクライアントSDKからの読み取りに使い、重要な集計・自動非公開化はVercel API Route + Firebase Admin SDKで処理する方針にします。

### Firebase Admin SDK

用途:

- Vercel API Routeでの通報登録と通報件数更新
- 通報しきい値到達時の `reported` 化
- 管理者Custom Claims設定
- 必要に応じた管理者削除・非公開化

注意:

- Admin SDKの秘密鍵はブラウザに渡さない。
- VercelのServer Environment Variablesにだけ置く。
- `NEXT_PUBLIC_` を付けない。

## Firestoreのデータ構造

### `users/{uid}`

Firebase Authのユーザーを補助する最小限のプロフィールです。メールアドレスはFirebase Auth側にあるため、Firestoreへ複製しない方針にします。

```ts
type UserProfile = {
  displayName: string | null;
  photoURL: string | null;
  role: "user" | "admin";
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
```

補足:

- `role` は画面表示の補助用途。
- 最終的な管理者判定はCustom Claimsを優先する。
- 個人情報最小化のため、メールアドレスは原則保存しない。

### `teams/{teamId}`

```ts
type Team = {
  ownerUid: string;
  name: string;
  region: string;
  category: "中学野球" | "高校野球";
  schoolLevel: "junior_high" | "high_school";
  ballType: "rubber" | "hard";
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
```

制約:

- 作成・更新は `ownerUid == request.auth.uid` のユーザーだけ。
- 管理者は閲覧・修正可能。
- 公開投稿に紐づくチーム情報は公開表示に必要な範囲だけ参照する。

### `matchPosts/{postId}`

```ts
type MatchPost = {
  ownerUid: string;
  teamId: string;
  teamName: string;
  region: string;
  category: "中学野球" | "高校野球";
  schoolLevel: "junior_high" | "high_school";
  ballType: "rubber" | "hard";
  matchDate: string; // YYYY-MM-DD
  timeSlot: string;
  venue: string;
  desiredOpponent: string;
  matchFormat: string;
  notes: string;
  status: "approved" | "reported" | "hidden" | "deleted";
  reportCount: number;
  hiddenReason: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
```

公開条件:

- 一般公開一覧と詳細に出すのは `status == "approved"` のみ。
- `reported`、`hidden`、`deleted` は一般公開しない。

投稿時の扱い:

- Googleログイン済みユーザーのみ作成可能。
- 初期 `status` は `approved`。
- 連絡先らしき文字列を含む場合は投稿不可。

削除の扱い:

- MVPではFirestore documentの物理削除ではなく、`status: "deleted"` の論理削除を第一候補にする。
- 管理者だけは必要に応じて物理削除できる余地を残す。

### `matchPosts/{postId}/reports/{reporterUid}`

同一ユーザーが同じ投稿を複数回通報できないよう、通報document IDを `reporterUid` にします。

```ts
type Report = {
  reporterUid: string;
  reason: "personal_info" | "inappropriate" | "spam" | "other";
  message: string | null;
  createdAt: Timestamp;
};
```

運用:

- クライアントから直接書かせず、Vercel API Route経由で登録する。
- Vercel API Route内でFirebase ID tokenを検証し、Admin SDKのtransactionで以下を同時に行う。
  - `reports/{reporterUid}` を作成
  - `matchPosts/{postId}.reportCount` を加算
  - しきい値以上なら `status` を `reported` に変更

しきい値:

- MVP初期値は3件。
- 管理画面または環境変数で将来調整できるようにする。

### `auditLogs/{logId}`

管理者操作や自動非公開化の記録です。

```ts
type AuditLog = {
  actorUid: string | "system";
  action: "post_reported" | "post_hidden" | "post_deleted" | "post_restored" | "admin_action";
  targetPostId: string;
  detail: string | null;
  createdAt: Timestamp;
};
```

## Firestore Security Rules案

以下は初期案です。実装時はFirebase Emulatorでテストしてから本番反映します。

```txt
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null;
    }

    function isAdmin() {
      return signedIn() && request.auth.token.admin == true;
    }

    function isOwner(uid) {
      return signedIn() && request.auth.uid == uid;
    }

    function validSchoolLevel(value) {
      return value in ["junior_high", "high_school"];
    }

    function validBallType(value) {
      return value in ["rubber", "hard"];
    }

    function validPostStatus(value) {
      return value in ["approved", "reported", "hidden", "deleted"];
    }

    function hasNoContactText(text) {
      return !(
        text.matches(".*[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}.*") ||
        text.matches(".*0[0-9]{1,4}[- ]?[0-9]{1,4}[- ]?[0-9]{3,4}.*") ||
        text.matches(".*line[ ]*(id)?[ ]*[:：]?[ ]*[@A-Za-z0-9._-]{3,}.*") ||
        text.matches(".*(@[A-Za-z0-9_]{3,}|(instagram|twitter|tiktok|facebook|sns)[ ]*(id|アカウント)?[ ]*[:：][ ]*[@A-Za-z0-9._-]{3,}).*")
      );
    }

    match /users/{uid} {
      allow read: if isOwner(uid) || isAdmin();
      allow create: if isOwner(uid);
      allow update: if isOwner(uid) && !("role" in request.resource.data.diff(resource.data).affectedKeys());
      allow delete: if false;
    }

    match /teams/{teamId} {
      allow read: if signedIn() || isAdmin();

      allow create: if signedIn()
        && request.resource.data.ownerUid == request.auth.uid
        && validSchoolLevel(request.resource.data.schoolLevel)
        && validBallType(request.resource.data.ballType);

      allow update: if isOwner(resource.data.ownerUid)
        && request.resource.data.ownerUid == resource.data.ownerUid
        && validSchoolLevel(request.resource.data.schoolLevel)
        && validBallType(request.resource.data.ballType);

      allow delete: if isAdmin();
    }

    match /matchPosts/{postId} {
      allow read: if resource.data.status == "approved"
        || isOwner(resource.data.ownerUid)
        || isAdmin();

      allow create: if signedIn()
        && request.resource.data.ownerUid == request.auth.uid
        && request.resource.data.status == "approved"
        && request.resource.data.reportCount == 0
        && validSchoolLevel(request.resource.data.schoolLevel)
        && validBallType(request.resource.data.ballType)
        && hasNoContactText(
          request.resource.data.desiredOpponent + " " +
          request.resource.data.matchFormat + " " +
          request.resource.data.notes + " " +
          request.resource.data.venue
        );

      // 投稿者は自分の投稿を hidden または deleted にできる。
      // 本文編集は初期MVPでは許可しない。
      allow update: if isOwner(resource.data.ownerUid)
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(["status", "hiddenReason", "updatedAt"])
        && request.resource.data.status in ["hidden", "deleted"];

      // 管理者は事後モデレーション可能。
      allow update: if isAdmin()
        && validPostStatus(request.resource.data.status);

      allow delete: if isAdmin();

      match /reports/{reporterUid} {
        // 通報はVercel API Route + Admin SDKで作成する。
        // クライアントからの直接書き込みは初期MVPでは禁止する。
        allow read: if isAdmin();
        allow create, update, delete: if false;
      }
    }

    match /auditLogs/{logId} {
      allow read: if isAdmin();
      allow create, update, delete: if false;
    }
  }
}
```

注意:

- 連絡先検出はクライアント側、Vercel API側、Rules側の複数層で行う。
- Security Rulesの正規表現は実装前にEmulatorで検証する。
- `reports` の自動集計はRulesだけでは安全に実現できないため、Vercel API Route + Admin SDKで処理する。

## Googleログインの設定手順

1. Firebase Consoleで新規Firebaseプロジェクトを作成する。
2. Webアプリを追加する。
3. Firebase SDK configを控える。
4. Authenticationを有効化する。
5. Sign-in methodでGoogleを有効化する。
6. サポートメールを設定する。
7. Authorized domainsに以下を追加する。
   - `localhost`
   - Vercelの本番ドメイン
   - 独自ドメインを使う場合は独自ドメイン
8. Cloud FirestoreをNative modeで作成する。
9. Firestore Security Rulesを初期ルールに更新する。
10. VercelにFirebase環境変数を登録する。

実装側:

- Firebase JS SDKを追加する。
- `firebase/app`、`firebase/auth`、`firebase/firestore` を使う。
- Googleログインは `GoogleAuthProvider` + `signInWithPopup` または `signInWithRedirect` を使う。
- モバイル互換性を考える場合、redirect方式を優先候補にする。

参考:

- Firebase Googleログイン: https://firebase.google.com/docs/auth/web/google-signin
- Firebase Auth Web開始手順: https://firebase.google.com/docs/auth/web/start

## `/firebase-test` Googleログイン確認ページ

Firebase版への置き換え前に、`/firebase-test` でFirebase AuthenticationのGoogleログインだけを確認します。

このページの範囲:

- Firebase Web SDK設定が読み込まれているか表示する。
- Googleログインボタンを表示する。
- ログイン中ユーザーの `uid`、`displayName`、`email` を表示する。
- ログアウトボタンを表示する。
- Firestoreへの読み書きは行わない。
- Firebase Admin SDKと秘密鍵は読み込まない。

ローカル環境変数:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

注意:

- `/firebase-test` はブラウザ公開用の `NEXT_PUBLIC_FIREBASE_*` だけを使う。
- `FIREBASE_PRIVATE_KEY`、`FIREBASE_CLIENT_EMAIL`、`FIREBASE_PROJECT_ID` などのAdmin SDK用値はこのページでは使わない。
- Admin SDK用値に `NEXT_PUBLIC_` を付けない。
- Googleログイン確認が終わるまではFirestore書き込み実装へ進まない。

Firebase Console側で必要な設定:

1. Firebase Consoleでプロジェクトを作成する。
2. Project settingsからWebアプリを追加する。
3. 表示されたFirebase SDK configを `.env.local` の `NEXT_PUBLIC_FIREBASE_*` に転記する。
4. Authenticationを有効化する。
5. Sign-in methodでGoogle providerを有効化する。
6. Google providerのサポートメールを設定する。
7. AuthenticationのSettingsでAuthorized domainsを確認する。
8. ローカル確認用に `localhost` を許可する。
9. Vercel Previewまたは本番で確認する場合は、対象のVercelドメインをAuthorized domainsへ追加する。
10. 独自ドメインを使う場合は、その独自ドメインもAuthorized domainsへ追加する。

Vercelに登録する環境変数:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

Googleログイン確認だけの段階では、VercelにFirebase Admin SDKの秘密鍵を登録しません。

### ローカルでの確認手順

1. `firebase-rebuild` ブランチにいることを確認する。
2. `.env.local` に `NEXT_PUBLIC_FIREBASE_*` を設定する。
3. Firebase ConsoleでAuthenticationのGoogle providerが有効であることを確認する。
4. Firebase ConsoleのAuthorized domainsに `localhost` があることを確認する。
5. 開発サーバーを起動する。

```bash
pnpm run dev
```

6. ブラウザで `http://localhost:3000/firebase-test` を開く。
7. 「Firebase Web SDK設定」が「読み込み済み」と表示されることを確認する。
8. 「Googleでログイン」を押す。
9. Googleログイン成功後、`uid`、`displayName`、`email` が表示されることを確認する。
10. 「ログアウト」を押し、未ログイン表示に戻ることを確認する。

この確認ではFirestoreへの読み書きは行いません。

確認結果:

- 2026-07-17: ローカル環境の `/firebase-test` でGoogleログインに成功し、ログイン後に `uid`、`displayName`、`email` が表示されることを確認済み。
- 同確認ではFirestoreへの読み書きは行っていない。

### Vercel Previewまたは本番URLで確認する場合

1. VercelのEnvironment Variablesに `NEXT_PUBLIC_FIREBASE_*` だけを登録する。
2. Firebase Admin SDK用の `FIREBASE_PRIVATE_KEY`、`FIREBASE_CLIENT_EMAIL`、`FIREBASE_PROJECT_ID` はこの段階では登録しない。
3. Firebase ConsoleのAuthorized domainsに確認対象のVercelドメインを追加する。
4. `https://<vercel-domain>/firebase-test` を開く。
5. Googleログイン後、`uid`、`displayName`、`email` が表示されることを確認する。

### よくあるエラー

- `Firebase Web SDK設定` が「未設定または不足あり」になる場合:
  `.env.local` の `NEXT_PUBLIC_FIREBASE_*` が不足しています。開発サーバーを起動中に変更した場合は再起動してください。
- `auth/unauthorized-domain` が出る場合:
  Firebase ConsoleのAuthorized domainsに現在アクセスしているドメインを追加してください。
- ポップアップが開かない場合:
  ブラウザのポップアップブロックを確認してください。モバイル中心で運用する場合は、将来 `signInWithRedirect` 方式も検討します。

## `/firebase-test` Firestore最小読み書き確認

Googleログイン確認後の次段階として、`/firebase-test` にFirestoreの最小読み書き確認欄を追加します。

この確認の範囲:

- Googleログイン済みユーザーだけが実行できる。
- テスト用コレクション `firebaseTestWrites` だけを使う。
- 書き込む内容は `uid`、`email`、`message`、`createdAt` のみ。
- 読み込みは自分の `uid` と一致するテスト書き込みだけに限定する。
- Buspo Match本体の `teams`、`matchPosts`、通報データには触れない。
- Firebase Admin SDKは使わず、Firebase Web SDKだけで確認する。

画面での確認手順:

1. `pnpm run dev` を起動する。
2. `http://localhost:3000/firebase-test` を開く。
3. Googleログインする。
4. 「Firestore読み書き確認」のテストメッセージを入力する。
5. 「Firestoreにテスト保存」を押す。
6. 自分のテスト書き込み一覧に、保存したメッセージとemail、保存時刻が表示されることを確認する。
7. 別ユーザーでログインした場合、他ユーザーのテスト書き込みが表示されないことを確認する。

確認結果:

- 2026-07-17: `/firebase-test` でGoogleログイン後、`firebaseTestWrites` にテスト書き込みを保存できることを確認済み。
- 2026-07-17: `/firebase-test` でログイン中ユーザー本人の `firebaseTestWrites` だけを読み込んで表示できることを確認済み。
- 同確認ではBuspo Match本体の `teams`、`matchPosts`、通報データには触れていない。

### Firebase Consoleに設定するFirestore Security Rules

Firebase ConsoleのFirestore Database > Rulesに、少なくとも以下の `firebaseTestWrites` ルールを含めます。

既存のRulesがある場合は、`match /firebaseTestWrites/{writeId}` ブロックを `match /databases/{database}/documents` の中に追加してください。

```txt
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null;
    }

    match /firebaseTestWrites/{writeId} {
      allow create: if signedIn()
        && request.resource.data.keys().hasOnly(["uid", "email", "message", "createdAt"])
        && request.resource.data.uid == request.auth.uid
        && request.resource.data.email == request.auth.token.email
        && request.resource.data.message is string
        && request.resource.data.message.size() > 0
        && request.resource.data.message.size() <= 120
        && request.resource.data.createdAt == request.time;

      allow read: if signedIn()
        && resource.data.uid == request.auth.uid;

      allow update, delete: if false;
    }
  }
}
```

注意:

- `firebaseTestWrites` は接続確認専用です。本番の募集投稿データには使いません。
- このRulesは「自分のテスト書き込みだけ読める」ことを確認するための最小案です。
- 既存Rulesを上書きする場合は、他のコレクションに対するRulesを消さないよう注意してください。
- `createdAt` はWeb SDK側で `serverTimestamp()` を使うため、Rulesでは `request.time` と一致することを確認します。
- `email` はFirebase Authのtoken上のemailと一致する場合のみ保存できます。

## `/firebase-posts` Firebase募集一覧 最小確認版

Buspo Match本体をすぐ置き換えず、Firebase版の募集一覧だけを新規ページ `/firebase-posts` として追加します。

この段階の範囲:

- 現行Supabase版トップページは変更しない。
- Firestore collectionは `matchPosts` を使う。
- `/firebase-posts` では `status == "approved"` の投稿だけを一覧表示する。
- 投稿フォーム、編集、削除、通報はまだ作らない。
- Firebase Admin SDKは使わず、Firebase Web SDKで未ログイン読み取りだけを確認する。
- 連絡先は一般公開しない前提で、`ownerEmail` は画面に表示しない。

### `matchPosts` の項目

```ts
type MatchPost = {
  teamName: string;
  region: string;
  schoolLevel: "middle_school" | "high_school";
  ballType: "hard" | "rubber";
  matchDate: string; // YYYY-MM-DD
  timeSlot: string;
  venue: string;
  opponentPreference: string;
  gameFormat: string;
  notes: string;
  status: "approved" | "reported" | "hidden";
  ownerUid: string;
  ownerEmail: string;
  reportCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
```

### Firebase Consoleで手入力するテストデータ例

Firestore Databaseで `matchPosts` collectionを作り、任意のdocument IDで以下を追加します。

| Field | Type | Value |
| --- | --- | --- |
| `teamName` | string | `青葉高校 野球部` |
| `region` | string | `東京都` |
| `schoolLevel` | string | `high_school` |
| `ballType` | string | `hard` |
| `matchDate` | string | `2026-08-20` |
| `timeSlot` | string | `13:00開始` |
| `venue` | string | `自校グラウンド` |
| `opponentPreference` | string | `同程度のチーム、B戦可` |
| `gameFormat` | string | `7イニング1試合` |
| `notes` | string | `駐車場あり。雨天時は中止判断します。` |
| `status` | string | `approved` |
| `ownerUid` | string | `manual-test-owner` |
| `ownerEmail` | string | `test-owner@example.invalid` |
| `reportCount` | number | `0` |
| `createdAt` | timestamp | Firebase Consoleのtimestamp入力 |
| `updatedAt` | timestamp | Firebase Consoleのtimestamp入力 |

中学軟式の例:

| Field | Type | Value |
| --- | --- | --- |
| `teamName` | string | `みどり中学校 野球部` |
| `region` | string | `神奈川県` |
| `schoolLevel` | string | `middle_school` |
| `ballType` | string | `rubber` |
| `matchDate` | string | `2026-08-24` |
| `timeSlot` | string | `午前` |
| `venue` | string | `相手校希望` |
| `opponentPreference` | string | `新チーム中心` |
| `gameFormat` | string | `ダブルヘッダー相談可` |
| `notes` | string | `会場をお持ちのチームを優先します。` |
| `status` | string | `approved` |
| `ownerUid` | string | `manual-test-owner-2` |
| `ownerEmail` | string | `test-owner-2@example.invalid` |
| `reportCount` | number | `0` |
| `createdAt` | timestamp | Firebase Consoleのtimestamp入力 |
| `updatedAt` | timestamp | Firebase Consoleのtimestamp入力 |

`status` を `reported` または `hidden` にしたdocumentは、`/firebase-posts` には表示されないことを確認します。

### Firebase Consoleに設定するFirestore Security Rules案

`matchPosts` はこの段階では読み取り専用です。未ログインユーザーでも `approved` 投稿だけ読めます。書き込みはすべて禁止します。

既存Rulesがある場合は、以下の `match /matchPosts/{postId}` ブロックを `match /databases/{database}/documents` の中に追加してください。

```txt
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /matchPosts/{postId} {
      allow read: if resource.data.status == "approved";
      allow create, update, delete: if false;
    }
  }
}
```

`firebaseTestWrites` のRulesと同時に使う場合の最小例:

```txt
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null;
    }

    match /firebaseTestWrites/{writeId} {
      allow create: if signedIn()
        && request.resource.data.keys().hasOnly(["uid", "email", "message", "createdAt"])
        && request.resource.data.uid == request.auth.uid
        && request.resource.data.email == request.auth.token.email
        && request.resource.data.message is string
        && request.resource.data.message.size() > 0
        && request.resource.data.message.size() <= 120
        && request.resource.data.createdAt == request.time;

      allow read: if signedIn()
        && resource.data.uid == request.auth.uid;

      allow update, delete: if false;
    }

    match /matchPosts/{postId} {
      allow read: if resource.data.status == "approved";
      allow create, update, delete: if false;
    }
  }
}
```

確認手順:

1. Firebase Consoleで上記Rulesを公開する。
2. Firebase Consoleで `matchPosts` に `approved` のテストデータを追加する。
3. `http://localhost:3000/firebase-posts` を開く。
4. 未ログイン状態でも `approved` の募集だけ表示されることを確認する。
5. `status` が `reported` または `hidden` のdocumentを追加し、一覧に表示されないことを確認する。
6. Firestore Console以外からの書き込みはRulesで拒否される前提であることを確認する。

確認結果:

- 2026-07-17: `/firebase-posts` でFirestore `matchPosts` の `status == "approved"` 投稿が表示されることを確認済み。
- 同確認では投稿フォーム、編集、削除、通報はまだ実装していない。
- 現行Supabase版トップページの本番挙動には触れていない。

## `/firebase-posts` Googleログイン投稿フォーム

Firebase版の次段階として、`/firebase-posts` にGoogleログイン済みユーザー用の投稿フォームを追加します。

この段階の範囲:

- 現行Supabase版トップページは変更しない。
- 未ログイン時は投稿フォームを表示せず、「Googleログインすると募集を投稿できます」と表示する。
- Googleログイン済みユーザーだけ投稿フォームを表示する。
- 投稿時はFirestore `matchPosts` に保存する。
- 保存時の `status` は `approved` とし、投稿後すぐ一覧に表示する。
- `ownerUid` はFirebase Authの `uid`、`ownerEmail` はFirebase Authの `email` を使う。
- `reportCount` は `0` で保存する。
- `createdAt` / `updatedAt` は `serverTimestamp()` を使う。
- メールアドレス、電話番号、LINE ID、SNS IDらしき文字列が本文系項目に含まれる場合は投稿不可にする。

投稿フォーム項目:

- チーム名
- 地域
- 中学/高校
- 硬式/軟式
- 試合希望日
- 時間帯
- 会場
- 希望する相手チーム
- 試合形式
- 補足

### 投稿フォーム用 Firestore Security Rules案

`matchPosts` の読み取りは未ログインでも `approved` のみ許可し、作成はログイン済みユーザーだけに限定します。更新・削除はこの段階ではまだ禁止します。

```txt
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null;
    }

    function validSchoolLevel(value) {
      return value in ["middle_school", "high_school"];
    }

    function validBallType(value) {
      return value in ["hard", "rubber"];
    }

    function hasNoContactText(text) {
      return !(
        text.matches(".*[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}.*") ||
        text.matches(".*0[0-9]{1,4}[- ]?[0-9]{1,4}[- ]?[0-9]{3,4}.*") ||
        text.matches(".*line[ ]*(id)?[ ]*[:：]?[ ]*[@A-Za-z0-9._-]{3,}.*") ||
        text.matches(".*(@[A-Za-z0-9_]{3,}|(instagram|twitter|x|tiktok|facebook|sns)[ ]*(id|アカウント)?[ ]*[:：][ ]*[@A-Za-z0-9._-]{3,}).*")
      );
    }

    match /matchPosts/{postId} {
      allow read: if resource.data.status == "approved";

      allow create: if signedIn()
        && request.resource.data.keys().hasOnly([
          "teamName",
          "region",
          "schoolLevel",
          "ballType",
          "matchDate",
          "timeSlot",
          "venue",
          "opponentPreference",
          "gameFormat",
          "notes",
          "status",
          "ownerUid",
          "ownerEmail",
          "reportCount",
          "createdAt",
          "updatedAt"
        ])
        && request.resource.data.ownerUid == request.auth.uid
        && request.resource.data.ownerEmail == request.auth.token.email
        && request.resource.data.status == "approved"
        && request.resource.data.reportCount == 0
        && validSchoolLevel(request.resource.data.schoolLevel)
        && validBallType(request.resource.data.ballType)
        && request.resource.data.teamName is string
        && request.resource.data.teamName.size() > 0
        && request.resource.data.region is string
        && request.resource.data.region.size() > 0
        && request.resource.data.matchDate is string
        && request.resource.data.matchDate.size() > 0
        && request.resource.data.timeSlot is string
        && request.resource.data.venue is string
        && request.resource.data.opponentPreference is string
        && request.resource.data.gameFormat is string
        && request.resource.data.notes is string
        && request.resource.data.createdAt == request.time
        && request.resource.data.updatedAt == request.time
        && hasNoContactText(
          request.resource.data.timeSlot + " " +
          request.resource.data.venue + " " +
          request.resource.data.opponentPreference + " " +
          request.resource.data.gameFormat + " " +
          request.resource.data.notes
        );

      allow update, delete: if false;
    }
  }
}
```

`firebaseTestWrites` と同時に使う場合は、既存の `firebaseTestWrites` ブロックを消さず、上記の `match /matchPosts/{postId}` ブロックだけを差し替えてください。

### Missing or insufficient permissions の調査結果

`/firebase-posts` の投稿時に `Missing or insufficient permissions` が出る場合、主な原因はFirestore Console側のRulesが前段階の読み取り専用Rulesのままになっていることです。

前段階のRulesには以下が含まれていました。

```txt
match /matchPosts/{postId} {
  allow read: if resource.data.status == "approved";
  allow create, update, delete: if false;
}
```

この状態では、アプリ側の保存データが正しくても `create` は必ず拒否されます。

アプリ側が実際に `matchPosts` へ保存するデータ:

- `teamName`: string
- `region`: string
- `schoolLevel`: `"middle_school"` または `"high_school"`
- `ballType`: `"hard"` または `"rubber"`
- `matchDate`: string
- `timeSlot`: string
- `venue`: string
- `opponentPreference`: string
- `gameFormat`: string
- `notes`: string
- `status`: `"approved"`
- `ownerUid`: Firebase Authの `user.uid`
- `ownerEmail`: Firebase Authの `user.email`
- `reportCount`: `0`
- `createdAt`: `serverTimestamp()`
- `updatedAt`: `serverTimestamp()`

`serverTimestamp()` はRules評価時に `request.time` として扱われるため、`createdAt == request.time` と `updatedAt == request.time` の条件で許可できます。

Firebase Consoleに貼り付ける完全Rules全文:

```txt
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null;
    }

    function validSchoolLevel(value) {
      return value in ["middle_school", "high_school"];
    }

    function validBallType(value) {
      return value in ["hard", "rubber"];
    }

    function hasNoContactText(text) {
      return !(
        text.matches(".*[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}.*") ||
        text.matches(".*0[0-9]{1,4}[- ]?[0-9]{1,4}[- ]?[0-9]{3,4}.*") ||
        text.matches(".*line[ ]*(id)?[ ]*[:：]?[ ]*[@A-Za-z0-9._-]{3,}.*") ||
        text.matches(".*(@[A-Za-z0-9_]{3,}|(instagram|twitter|x|tiktok|facebook|sns)[ ]*(id|アカウント)?[ ]*[:：]?[ ]*[@A-Za-z0-9._-]{3,}).*")
      );
    }

    match /firebaseTestWrites/{writeId} {
      allow create: if signedIn()
        && request.resource.data.keys().hasOnly(["uid", "email", "message", "createdAt"])
        && request.resource.data.uid == request.auth.uid
        && request.resource.data.email == request.auth.token.email
        && request.resource.data.message is string
        && request.resource.data.message.size() > 0
        && request.resource.data.message.size() <= 120
        && request.resource.data.createdAt == request.time;

      allow read: if signedIn()
        && resource.data.uid == request.auth.uid;

      allow update, delete: if false;
    }

    match /matchPosts/{postId} {
      allow read: if resource.data.status == "approved";

      allow create: if signedIn()
        && request.auth.token.email is string
        && request.resource.data.keys().hasOnly([
          "teamName",
          "region",
          "schoolLevel",
          "ballType",
          "matchDate",
          "timeSlot",
          "venue",
          "opponentPreference",
          "gameFormat",
          "notes",
          "status",
          "ownerUid",
          "ownerEmail",
          "reportCount",
          "createdAt",
          "updatedAt"
        ])
        && request.resource.data.ownerUid == request.auth.uid
        && request.resource.data.ownerEmail == request.auth.token.email
        && request.resource.data.status == "approved"
        && request.resource.data.reportCount == 0
        && validSchoolLevel(request.resource.data.schoolLevel)
        && validBallType(request.resource.data.ballType)
        && request.resource.data.teamName is string
        && request.resource.data.teamName.size() > 0
        && request.resource.data.region is string
        && request.resource.data.region.size() > 0
        && request.resource.data.matchDate is string
        && request.resource.data.matchDate.size() > 0
        && request.resource.data.timeSlot is string
        && request.resource.data.timeSlot.size() > 0
        && request.resource.data.venue is string
        && request.resource.data.venue.size() > 0
        && request.resource.data.opponentPreference is string
        && request.resource.data.opponentPreference.size() > 0
        && request.resource.data.gameFormat is string
        && request.resource.data.gameFormat.size() > 0
        && request.resource.data.notes is string
        && request.resource.data.createdAt == request.time
        && request.resource.data.updatedAt == request.time
        && hasNoContactText(
          request.resource.data.timeSlot + " " +
          request.resource.data.venue + " " +
          request.resource.data.opponentPreference + " " +
          request.resource.data.gameFormat + " " +
          request.resource.data.notes
        );

      allow update, delete: if false;
    }
  }
}
```

確認する不一致ポイント:

- `matchPosts` のRulesが `allow create, update, delete: if false;` のままなら投稿は拒否される。
- `ownerUid` は `request.auth.uid` と一致必須。
- `ownerEmail` は `request.auth.token.email` と一致必須。
- `status` は `"approved"` のみ許可。
- `reportCount` は `0` のみ許可。
- `schoolLevel` は `"middle_school"` または `"high_school"` のみ許可。
- `ballType` は `"hard"` または `"rubber"` のみ許可。
- `createdAt` / `updatedAt` は `serverTimestamp()` で保存し、Rules側では `request.time` と比較する。

確認手順:

1. Firebase Consoleで上記Rulesを公開する。
2. `/firebase-posts` を開く。
3. 未ログイン状態では投稿フォームが表示されず、「Googleログインすると募集を投稿できます」と表示されることを確認する。
4. Googleログインする。
5. 投稿フォームが表示されることを確認する。
6. 必須項目を入力して投稿する。
7. 投稿後、一覧に即時表示されることを確認する。
8. 本文系項目にメールアドレス、電話番号、LINE ID、SNS IDらしき文字列を入れると投稿できないことを確認する。
9. Firestore Consoleで `ownerUid`、`ownerEmail`、`status: "approved"`、`reportCount: 0`、`createdAt`、`updatedAt` が保存されていることを確認する。

確認結果:

- 2026-07-17: `/firebase-posts` でGoogleログイン済みユーザーがFirestore `matchPosts` に投稿できることを確認済み。
- 2026-07-17: 投稿後、`status: "approved"` の投稿が `/firebase-posts` の一覧に即時表示されることを確認済み。
- 同確認では `ownerUid` はFirebase Authの `uid`、`ownerEmail` はFirebase Authの `email`、`reportCount` は `0` として保存する。

## `/firebase-posts` 投稿者の非公開化・削除

Firebase版の次段階として、Googleログイン済みユーザーが自分の投稿だけ非公開化・削除できる機能を追加します。

この段階の範囲:

- 現行Supabase版トップページは変更しない。
- `/firebase-posts` の一覧は引き続き `status == "approved"` の投稿だけ表示する。
- ログイン済みユーザーの場合、自分の投稿にだけ「非公開にする」「削除する」ボタンを表示する。
- 他人の投稿には操作ボタンを表示しない。
- 非公開化は `status` を `"hidden"` に変更する。
- 削除はFirestore documentを削除する。
- 非公開化・削除後は一覧を再読み込みする。

投稿者操作用 Firestore Security Rules案:

```txt
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null;
    }

    function validSchoolLevel(value) {
      return value in ["middle_school", "high_school"];
    }

    function validBallType(value) {
      return value in ["hard", "rubber"];
    }

    function hasNoContactText(text) {
      return !(
        text.matches(".*[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}.*") ||
        text.matches(".*0[0-9]{1,4}[- ]?[0-9]{1,4}[- ]?[0-9]{3,4}.*") ||
        text.matches(".*line[ ]*(id)?[ ]*[:：]?[ ]*[@A-Za-z0-9._-]{3,}.*") ||
        text.matches(".*(@[A-Za-z0-9_]{3,}|(instagram|twitter|x|tiktok|facebook|sns)[ ]*(id|アカウント)?[ ]*[:：]?[ ]*[@A-Za-z0-9._-]{3,}).*")
      );
    }

    match /firebaseTestWrites/{writeId} {
      allow create: if signedIn()
        && request.resource.data.keys().hasOnly(["uid", "email", "message", "createdAt"])
        && request.resource.data.uid == request.auth.uid
        && request.resource.data.email == request.auth.token.email
        && request.resource.data.message is string
        && request.resource.data.message.size() > 0
        && request.resource.data.message.size() <= 120
        && request.resource.data.createdAt == request.time;

      allow read: if signedIn()
        && resource.data.uid == request.auth.uid;

      allow update, delete: if false;
    }

    match /matchPosts/{postId} {
      allow read: if resource.data.status == "approved";

      allow create: if signedIn()
        && request.auth.token.email is string
        && request.resource.data.keys().hasOnly([
          "teamName",
          "region",
          "schoolLevel",
          "ballType",
          "matchDate",
          "timeSlot",
          "venue",
          "opponentPreference",
          "gameFormat",
          "notes",
          "status",
          "ownerUid",
          "ownerEmail",
          "reportCount",
          "createdAt",
          "updatedAt"
        ])
        && request.resource.data.ownerUid == request.auth.uid
        && request.resource.data.ownerEmail == request.auth.token.email
        && request.resource.data.status == "approved"
        && request.resource.data.reportCount == 0
        && validSchoolLevel(request.resource.data.schoolLevel)
        && validBallType(request.resource.data.ballType)
        && request.resource.data.createdAt == request.time
        && request.resource.data.updatedAt == request.time
        && hasNoContactText(
          request.resource.data.timeSlot + " " +
          request.resource.data.venue + " " +
          request.resource.data.opponentPreference + " " +
          request.resource.data.gameFormat + " " +
          request.resource.data.notes
        );

      allow update: if signedIn()
        && resource.data.ownerUid == request.auth.uid
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(["status"])
        && request.resource.data.status == "hidden";

      allow delete: if signedIn()
        && resource.data.ownerUid == request.auth.uid;
    }
  }
}
```

確認手順:

1. Firebase Consoleで上記Rulesを公開する。
2. `/firebase-posts` でGoogleログインする。
3. 自分の投稿にだけ「非公開にする」「削除する」ボタンが表示されることを確認する。
4. 他人の投稿には操作ボタンが表示されないことを確認する。
5. 「非公開にする」を押すと `status` が `"hidden"` になり、一覧から消えることを確認する。
6. 「削除する」を押すとFirestore documentが削除され、一覧から消えることを確認する。

確認結果:

- 2026-07-18: `/firebase-posts` でGoogleログイン済みユーザーが自分の投稿だけ非公開化できることを確認済み。
- 2026-07-18: `/firebase-posts` でGoogleログイン済みユーザーが自分の投稿だけ削除できることを確認済み。
- 非公開化・削除後、`status == "approved"` の一覧が再読み込みされ、対象投稿が一覧から消えることを確認済み。

## `/firebase-posts` 通報機能

Firebase版の次段階として、`/firebase-posts` の公開投稿に通報機能を追加します。

この段階の範囲:

- `status == "approved"` の投稿に通報導線を表示する。
- 未ログイン時は通報ボタンを表示せず、「ログインすると通報できます」と表示する。
- 自分の投稿は通報できない。
- 通報はクライアントからFirestoreへ直接書き込まない。
- Vercel API Route `POST /api/firebase-posts/[id]/report` でFirebase ID tokenを検証する。
- API Route内でFirebase Admin SDKを使い、Firestore transactionで `postReports` 作成と `matchPosts.reportCount` 更新を行う。
- 通報collection名は `postReports` とする。
- 同じユーザーが同じ投稿を複数回通報できないよう、`postReports` のdocument IDは `${postId}_${reporterUid}` とする。
- 通報3件以上で `matchPosts.status` を `"reported"` に変更する。
- 一覧は `status == "approved"` のみ表示するため、`reported` になった投稿は一覧から消える。

API Routeで使うサーバー側環境変数:

```bash
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=...
REPORT_THRESHOLD=3
```

ローカル確認用のFirebase Admin SDK環境変数取得手順:

1. Firebase Consoleを開く。
2. 対象Firebaseプロジェクトを選択する。
3. Project settingsを開く。
4. Service accountsタブを開く。
5. Firebase Admin SDKのNode.jsを選択する。
6. Generate new private keyを押して秘密鍵JSONをダウンロードする。
7. ダウンロードしたJSONから以下を `.env.local` に転記する。
   - `project_id` -> `FIREBASE_PROJECT_ID`
   - `client_email` -> `FIREBASE_CLIENT_EMAIL`
   - `private_key` -> `FIREBASE_PRIVATE_KEY`
8. `private_key` は改行を `\n` の文字列として保持し、`.env.local` ではダブルクォートで囲む。
9. `REPORT_THRESHOLD=3` を `.env.local` に追加する。
10. `.env.local` がGit管理対象外であることを確認する。

`.env.local` の例:

```bash
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-example@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY\n-----END PRIVATE KEY-----\n"
REPORT_THRESHOLD=3
```

注意:

- Firebase Admin SDKの秘密情報はVercelのServer Environment Variablesにだけ登録する。
- `FIREBASE_PRIVATE_KEY`、`FIREBASE_CLIENT_EMAIL`、`FIREBASE_PROJECT_ID` に `NEXT_PUBLIC_` を付けない。
- クライアント側はFirebase ID tokenを `Authorization: Bearer <token>` でAPI Routeへ送るだけにする。

通報機能用 Firestore Security Rules案:

```txt
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null;
    }

    function validSchoolLevel(value) {
      return value in ["middle_school", "high_school"];
    }

    function validBallType(value) {
      return value in ["hard", "rubber"];
    }

    function hasNoContactText(text) {
      return !(
        text.matches(".*[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}.*") ||
        text.matches(".*0[0-9]{1,4}[- ]?[0-9]{1,4}[- ]?[0-9]{3,4}.*") ||
        text.matches(".*line[ ]*(id)?[ ]*[:：]?[ ]*[@A-Za-z0-9._-]{3,}.*") ||
        text.matches(".*(@[A-Za-z0-9_]{3,}|(instagram|twitter|x|tiktok|facebook|sns)[ ]*(id|アカウント)?[ ]*[:：]?[ ]*[@A-Za-z0-9._-]{3,}).*")
      );
    }

    match /firebaseTestWrites/{writeId} {
      allow create: if signedIn()
        && request.resource.data.keys().hasOnly(["uid", "email", "message", "createdAt"])
        && request.resource.data.uid == request.auth.uid
        && request.resource.data.email == request.auth.token.email
        && request.resource.data.message is string
        && request.resource.data.message.size() > 0
        && request.resource.data.message.size() <= 120
        && request.resource.data.createdAt == request.time;

      allow read: if signedIn()
        && resource.data.uid == request.auth.uid;

      allow update, delete: if false;
    }

    match /matchPosts/{postId} {
      allow read: if resource.data.status == "approved";

      allow create: if signedIn()
        && request.auth.token.email is string
        && request.resource.data.keys().hasOnly([
          "teamName",
          "region",
          "schoolLevel",
          "ballType",
          "matchDate",
          "timeSlot",
          "venue",
          "opponentPreference",
          "gameFormat",
          "notes",
          "status",
          "ownerUid",
          "ownerEmail",
          "reportCount",
          "createdAt",
          "updatedAt"
        ])
        && request.resource.data.ownerUid == request.auth.uid
        && request.resource.data.ownerEmail == request.auth.token.email
        && request.resource.data.status == "approved"
        && request.resource.data.reportCount == 0
        && validSchoolLevel(request.resource.data.schoolLevel)
        && validBallType(request.resource.data.ballType)
        && request.resource.data.createdAt == request.time
        && request.resource.data.updatedAt == request.time
        && hasNoContactText(
          request.resource.data.timeSlot + " " +
          request.resource.data.venue + " " +
          request.resource.data.opponentPreference + " " +
          request.resource.data.gameFormat + " " +
          request.resource.data.notes
        );

      allow update: if signedIn()
        && resource.data.ownerUid == request.auth.uid
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(["status"])
        && request.resource.data.status == "hidden";

      allow delete: if signedIn()
        && resource.data.ownerUid == request.auth.uid;
    }

    match /postReports/{reportId} {
      allow read, create, update, delete: if false;
    }
  }
}
```

補足:

- `postReports` はVercel API Route + Firebase Admin SDKだけが書き込む。
- Firebase Admin SDKはSecurity Rulesをバイパスするため、クライアントからの直接書き込みは禁止してよい。
- `reportCount` 更新と `status: "reported"` への変更もAPI Routeのtransaction内で行う。

確認手順:

1. Vercelまたはローカルのサーバー側環境変数に `FIREBASE_PROJECT_ID`、`FIREBASE_CLIENT_EMAIL`、`FIREBASE_PRIVATE_KEY`、`REPORT_THRESHOLD` を設定する。
2. Firebase Consoleで上記Rulesを公開する。
3. `/firebase-posts` を開く。
4. 未ログイン状態では通報ボタンが表示されず、「ログインすると通報できます」と表示されることを確認する。
5. Googleログインする。
6. 他人の投稿に「通報する」ボタンが表示されることを確認する。
7. 自分の投稿に「通報する」ボタンが表示されないことを確認する。
8. 他人の投稿を通報し、`postReports` に `${postId}_${reporterUid}` のdocumentが作成されることを確認する。
9. 同じユーザーで同じ投稿を再度通報すると拒否されることを確認する。
10. 3件目の通報で `matchPosts.status` が `"reported"` になり、`/firebase-posts` の一覧から消えることを確認する。

## `/firebase-admin` 管理者モデレーション

Firebase版の次段階として、管理者用の事後モデレーション画面 `/firebase-admin` を追加します。

この段階の範囲:

- 現行Supabase版トップページは変更しない。
- 管理者判定はFirebase Custom Claimsではなく、まず `FIREBASE_ADMIN_EMAILS` に含まれるGoogleアカウントだけ許可する。
- `FIREBASE_ADMIN_EMAILS` はカンマ区切りで複数指定できる。
- 管理画面では `status` が `"reported"` または `"hidden"` の投稿だけ表示する。
- 管理者は投稿を `"approved"` に戻せる。
- 管理者は投稿を `"hidden"` にできる。
- 管理者は投稿を削除できる。
- 管理操作はクライアントからFirestoreを直接更新しない。
- Vercel API Route + Firebase Admin SDKで管理操作を行う。
- API Route側でFirebase ID tokenを検証し、tokenの `email` が `FIREBASE_ADMIN_EMAILS` に含まれる場合だけ許可する。

管理者用API Route:

- `GET /api/firebase-admin/posts`
  - Firebase ID tokenを検証する。
  - `FIREBASE_ADMIN_EMAILS` に含まれるemailだけ許可する。
  - Firestore `matchPosts` から `status in ["reported", "hidden"]` の投稿だけ返す。
- `PATCH /api/firebase-admin/posts/[id]`
  - Firebase ID tokenを検証する。
  - 管理者だけ許可する。
  - `status` を `"approved"` または `"hidden"` に変更する。
- `DELETE /api/firebase-admin/posts/[id]`
  - Firebase ID tokenを検証する。
  - 管理者だけ許可する。
  - 対象投稿を削除する。

必要なサーバー側環境変数:

```bash
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=...
REPORT_THRESHOLD=3
FIREBASE_ADMIN_EMAILS=admin@example.invalid,moderator@example.invalid
```

注意:

- `FIREBASE_ADMIN_EMAILS` はサーバー側だけで使う。
- `FIREBASE_ADMIN_EMAILS` に `NEXT_PUBLIC_` を付けない。
- Firebase Admin SDK秘密情報も `NEXT_PUBLIC_` を付けない。
- `.env.local` とVercel Server Environment Variablesにだけ設定する。

Firestore Rules方針:

- 一般ユーザーの公開読み取りは `resource.data.status == "approved"` のみ許可する。
- `reported` / `hidden` 投稿は一般ユーザーから読めない状態を維持する。
- 管理画面の `reported` / `hidden` 読み取りはFirestore Rulesでは許可せず、API Route + Firebase Admin SDKだけで行う。
- 管理者の `approved` 復帰、`hidden` 化、削除もAPI Route + Firebase Admin SDKだけで行う。
- `postReports` は引き続きクライアントから直接読み書き禁止にする。

Rulesの該当方針:

```txt
match /matchPosts/{postId} {
  allow read: if resource.data.status == "approved";
  allow create: if signedIn() && ...;
  allow update: if signedIn()
    && resource.data.ownerUid == request.auth.uid
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly(["status"])
    && request.resource.data.status == "hidden";
  allow delete: if signedIn()
    && resource.data.ownerUid == request.auth.uid;
}

match /postReports/{reportId} {
  allow read, create, update, delete: if false;
}
```

管理画面確認手順:

1. `.env.local` に `FIREBASE_ADMIN_EMAILS` を追加する。
2. 管理者として使うGoogleアカウントのemailを `FIREBASE_ADMIN_EMAILS` に含める。
3. `pnpm run dev` を再起動する。
4. `/firebase-admin` を開く。
5. `FIREBASE_ADMIN_EMAILS` に含まれるGoogleアカウントでログインする。
6. `reported` または `hidden` の投稿だけ表示されることを確認する。
7. `FIREBASE_ADMIN_EMAILS` に含まれないGoogleアカウントでは管理対象を読み込めないことを確認する。
8. `reported` 投稿を「公開に戻す」で `approved` に戻せることを確認する。
9. 投稿を「非公開にする」で `hidden` にできることを確認する。
10. 投稿を「削除する」でFirestoreから削除できることを確認する。
11. 一般ユーザーが `/firebase-posts` で `reported` / `hidden` 投稿を読めないことを確認する。

## Vercel Preview確認準備

Firebase版は `firebase-rebuild` ブランチのPreviewで確認し、現行Supabase版の `main` 本番公開には影響させません。VercelのEnvironment Variablesは、まずPreview環境に限定して設定します。

### Vercel Previewに登録する環境変数

ブラウザ公開用のFirebase Web SDK設定:

| 変数名 | Vercelに入れる値 | 取得元 |
| --- | --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase Web Appの `apiKey` | Firebase Console > Project settings > General > Your apps > SDK setup |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase Web Appの `authDomain` | 同上 |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase Web Appの `projectId` | 同上 |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase Web Appの `storageBucket` | 同上 |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase Web Appの `messagingSenderId` | 同上 |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase Web Appの `appId` | 同上 |

サーバー専用のFirebase Admin SDK設定:

| 変数名 | Vercelに入れる値 | 取得元 |
| --- | --- | --- |
| `FIREBASE_PROJECT_ID` | Service Account JSONの `project_id` | Firebase Console > Project settings > Service accounts > Generate new private key |
| `FIREBASE_CLIENT_EMAIL` | Service Account JSONの `client_email` | 同上 |
| `FIREBASE_PRIVATE_KEY` | Service Account JSONの `private_key` | 同上 |
| `FIREBASE_ADMIN_EMAILS` | `/firebase-admin` を許可するGoogleアカウントのemailをカンマ区切りで指定 | 運用側で決める。例: `admin@example.invalid,moderator@example.invalid` |
| `REPORT_THRESHOLD` | 通報で `reported` にする件数。初期値は `3` | 運用側で決める |

注意:

- `FIREBASE_PROJECT_ID`、`FIREBASE_CLIENT_EMAIL`、`FIREBASE_PRIVATE_KEY`、`FIREBASE_ADMIN_EMAILS`、`REPORT_THRESHOLD` には `NEXT_PUBLIC_` を付けません。
- `FIREBASE_PRIVATE_KEY` はGitHubに入れず、VercelのEnvironment Variablesとローカルの `.env.local` のみに置きます。
- Vercelで設定するEnvironmentは、Firebase Preview確認中は原則 `Preview` にします。`Production` へ反映するのは本番切替判断後にします。
- 同じVercel Projectで `main` 本番を運用している場合、Firebase用のPreview変数がSupabase版のProduction設定を上書きしないように確認します。
- Firebase Hostingは使わず、公開確認はVercel Preview URLで行います。

### Firebase ConsoleのAuthorized domains

Firebase AuthenticationのGoogleログインをPreview URLで使うには、Firebase Console > Authentication > Settings > Authorized domains に確認対象ドメインを追加します。

追加対象:

- `localhost`
- 現行本番URLで確認する場合は `buspo-match.vercel.app`
- Vercel Preview URLのホスト名。例: `<project>-git-firebase-rebuild-<team>.vercel.app`
- 独自のPreview/Stagingドメインを使う場合はそのホスト名

登録時の注意:

- `https://` は付けません。
- `/firebase-test` などのパスは付けません。
- Preview URLが変わる場合は、新しいPreview URLのホスト名も追加します。

### `/firebase-test` Preview確認手順

1. Vercel Preview URLの `/firebase-test` を開く。
2. Firebase Web SDK設定が読み込み済みと表示されることを確認する。
3. 「Googleでログイン」を押す。
4. ログイン後、`uid`、`displayName`、`email` が表示されることを確認する。
5. Firestore読み書き確認欄で `firebaseTestWrites` にテスト保存できることを確認する。
6. 表示される書き込み一覧がログイン中ユーザー本人のものだけであることを確認する。
7. ログアウトできることを確認する。

### `/firebase-posts` Preview確認手順

1. Vercel Preview URLの `/firebase-posts` を開く。
2. 未ログインでも `status == "approved"` の募集だけ表示されることを確認する。
3. 未ログイン時は投稿フォームが表示されず、「Googleログインすると募集を投稿できます」と表示されることを確認する。
4. Googleログインする。
5. 投稿フォームから募集を投稿し、`status: "approved"` で一覧に即時表示されることを確認する。
6. メールアドレス、電話番号、LINE ID、SNS IDらしき文字列を本文系項目に入れると投稿不可になることを確認する。
7. 自分の投稿にだけ「非公開にする」「削除する」ボタンが表示されることを確認する。
8. 非公開化すると `status: "hidden"` になり、公開一覧から消えることを確認する。
9. 削除するとFirestoreから投稿が削除され、公開一覧から消えることを確認する。
10. 他人の投稿には投稿者操作ボタンが表示されないことを確認する。
11. ログイン済みで他人の投稿だけ通報できることを確認する。
12. 通報後、`postReports` に記録され、`reportCount` が増えることを確認する。
13. 同じユーザーによる同一投稿の重複通報が拒否されることを確認する。
14. 通報件数が `REPORT_THRESHOLD` 以上になると `status: "reported"` になり、公開一覧から消えることを確認する。

### `/firebase-admin` Preview確認手順

1. Vercel PreviewのEnvironment Variablesに `FIREBASE_ADMIN_EMAILS` を設定する。
2. `FIREBASE_ADMIN_EMAILS` に含まれるGoogleアカウントでログインできる状態にする。
3. Vercel Preview URLの `/firebase-admin` を開く。
4. 管理者emailでは `reported` / `hidden` の投稿一覧が表示されることを確認する。
5. 管理者emailでは投稿を `approved` に戻せることを確認する。
6. 管理者emailでは投稿を `hidden` にできることを確認する。
7. 管理者emailでは投稿を削除できることを確認する。
8. `FIREBASE_ADMIN_EMAILS` に含まれないGoogleアカウントでは、管理対象を読み込めず管理操作もできないことを確認する。
9. `/firebase-posts` の公開一覧が `approved` のみ表示する状態と整合していることを確認する。

### Preview確認前の安全チェック

- [ ] `firebase-rebuild` ブランチのVercel Previewで確認している。
- [ ] `main` のSupabase本番公開を変更していない。
- [ ] `.env.local` はGit管理対象外である。
- [ ] Firebase Admin SDK秘密情報はGitHubに入れていない。
- [ ] Firebase Admin SDK秘密情報に `NEXT_PUBLIC_` を付けていない。
- [ ] Firestore Security Rulesは、未ログインユーザーが `approved` 投稿だけ読める設定になっている。
- [ ] `reported` / `hidden` 投稿は一般ユーザーから読めない。
- [ ] 通報と管理操作はVercel API Route + Firebase Admin SDK経由で行う。
- [ ] `pnpm run build` が成功している。

## Firebase版トップページ切替準備

`firebase-rebuild` ブランチ上で、本番トップページ `/` をFirebase版の募集一覧・検索・投稿導線へ切り替える準備を行います。`main` へのmergeはこの段階では行いません。

### 切替方針

- `/` はFirebase版の本番トップ候補として、Firestore `matchPosts` の `status == "approved"` 投稿一覧を表示する。
- `/` には試合希望日、地域、中学/高校、硬式/軟式の絞り込み導線を置く。
- `/` にはGoogleログイン導線を置き、ログイン済みユーザーだけ投稿フォームを表示する。
- 投稿はFirestore `matchPosts` に `status: "approved"` として保存し、即時公開する。
- 投稿本文系項目にメールアドレス、電話番号、LINE ID、SNS IDらしき文字列が含まれる場合は投稿不可にする。
- 投稿者本人には自分の投稿だけ「非公開にする」「削除する」を表示する。
- 他人の投稿にはログイン済みユーザーだけ「通報する」を表示する。
- 通報処理は引き続きVercel API Route + Firebase Admin SDKで行う。
- `/firebase-posts` は当面残し、`/` と同じFirebase版共通コンポーネントを参照する。
- `/firebase-test` はFirebase接続確認用として残すが、本番トップページからは導線を置かない。
- `/firebase-admin` は管理者専用ページとして残すが、一般トップページから目立つリンクは置かない。
- 旧Supabase版のトップページ表示、Supabase版投稿詳細への導線は本番UIから外す。
- Supabase関連の既存コード、SQL、API Routeはすぐ削除せず、切替前後の比較・rollback判断に使える状態で残す。

### Rollback方針

- `main` はSupabase版本番公開状態として維持し、Firebase版のPreview確認が完了するまでmergeしない。
- Previewで問題が出た場合は、`firebase-rebuild` 上のトップページ切替commitをrevertする。
- 本番merge後に問題が出た場合は、Vercelの直前Production Deploymentへrollbackする。
- 本番merge後もSupabase版へ戻す必要がある場合は、`main` の直前commitへrevertするか、Supabase版トップページ実装を復元する。
- rollback判断時に必要なため、Supabase関連コードと既存DB設定資料はFirebase切替直後には削除しない。

### Preview確認手順

1. `firebase-rebuild` ブランチをGitHubへpushし、Vercel Previewを更新する。
2. Preview URLの `/` を開き、Firebase版トップページが表示されることを確認する。
3. `/` で未ログイン状態でも `approved` 投稿一覧が表示されることを確認する。
4. 試合希望日、地域、中学/高校、硬式/軟式で絞り込みできることを確認する。
5. 条件に一致しない場合、「条件を変えて検索してください」の空状態が表示されることを確認する。
6. `/` から `/firebase-test` への導線がないことを確認する。
7. `/` から旧Supabase版の投稿詳細ページ `/posts/[id]` への導線がないことを確認する。
8. `/` に一般利用者向けの目立つ管理リンクがないことを確認する。
9. Googleログイン後、投稿フォームが表示されることを確認する。
10. 投稿フォームから募集を投稿し、即時に公開一覧へ表示されることを確認する。
11. メールアドレス、電話番号、LINE ID、SNS IDらしき文字列が本文系項目にあると投稿不可になることを確認する。
12. 自分の投稿にだけ「非公開にする」「削除する」が表示されることを確認する。
13. 他人の投稿にだけ「通報する」が表示されることを確認する。
14. `/firebase-posts` でも `/` と同じFirebase版表示・操作ができることを確認する。
15. `/firebase-admin` で管理者モデレーションが引き続き動作することを確認する。
16. スマホ幅で横スクロールがなく、検索・投稿・通報ボタンが押しやすいことを確認する。
17. `pnpm run build` が成功していることを確認する。

確認結果:

- 2026-07-19: Vercel Previewで `/` がFirebase版トップページとして表示されることを確認済み。
- 2026-07-19: Vercel Previewの `/` でFirestore `matchPosts` の `status == "approved"` 投稿一覧が表示されることを確認済み。
- 2026-07-19: Firebase AuthenticationのAuthorized domainsにPreviewドメインを追加後、Vercel Previewの `/` でGoogleログインできることを確認済み。
- 2026-07-19: Vercel PreviewでFirebase Web SDK用の `NEXT_PUBLIC_FIREBASE_*` 環境変数が反映されていることを確認済み。
- 2026-07-19: この確認時点では `firebase-rebuild` を `main` へmergeしていない。

### Firebase版本番切替確認

確認結果:

- 2026-07-19: PR #1 が `main` にmerge済みであることを確認済み。
- 2026-07-19: merge commit は `0da543d8f3bee35ace3830b74c1499ee0d799ab2`。
- 2026-07-19: `origin/main` にFirebase切替commit `0de3e27d2b6ddfd9fad5fcbb3e93e5a9e1399152` が含まれていることを確認済み。
- 2026-07-19: Vercel Production Deployment が `success` であることを確認済み。
- 2026-07-19: 本番URL `https://buspo-match.vercel.app/` がHTTP 200で応答し、Firebase版トップページとして表示されることを確認済み。
- 2026-07-19: 本番URL `https://buspo-match.vercel.app/firebase-admin` がHTTP 200で応答し、管理者用ページとして表示されることを確認済み。
- 2026-07-19: `.env.local`、Firebase秘密鍵、実キー、`FIREBASE_ADMIN_EMAILS` 実値がGit管理対象に含まれていないことを確認済み。
- rollback方針は引き続きこの設計書の「Rollback方針」に維持する。

## Vercelに登録する環境変数

### ブラウザ公開用

Firebase Web SDKのconfig値です。これらはFirebaseの設計上ブラウザに配信される値ですが、許可ドメイン、Security Rules、Auth設定で保護します。

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

### サーバー専用

Vercel API RouteでFirebase Admin SDKを使う場合に必要です。ブラウザへ公開しません。

```bash
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=...
REPORT_THRESHOLD=3
```

注意:

- `FIREBASE_PRIVATE_KEY` はVercelのSecretとして登録する。
- `NEXT_PUBLIC_` を付けない。
- GitHubに入れない。
- `.env.local` はGit管理対象外にする。

## Supabase版からFirebase版へ移行する手順

### 推奨ブランチ

```bash
git checkout main
git pull
git checkout -b firebase-rebuild
```

### 推奨ディレクトリ方針

現行Supabase版をすぐ消さないため、以下のどちらかを選びます。

候補A: ブランチ分離

- `firebase-rebuild` ブランチでSupabaseコードをFirebaseコードへ置き換える。
- mainは現行Vercel公開版として維持する。

候補B: ディレクトリ分離

- `apps/firebase-next/` のような別ディレクトリにFirebase版を構築する。
- 既存アプリと比較しやすい。
- Vercel設定を切り替える必要がある。

初期は候補Aを推奨します。理由はNext.js/Vercel構成を維持しやすく、既存UIを流用しやすいためです。

### 移行作業

1. Firebaseプロジェクトを作成する。
2. FirestoreとGoogleログインを有効化する。
3. Firebase版ブランチを作成する。
4. Supabase client、Supabase API route、Supabase SQL依存を削除または隔離する。
5. Firebase client初期化ファイルを作成する。
6. Firebase Admin SDKのserver-only初期化ファイルを作成する。
7. 投稿一覧をFirestore `matchPosts where status == approved` から取得する。
8. 投稿詳細をFirestoreから取得する。
9. GoogleログインUIを実装する。
10. 投稿フォームをFirestore createへ接続する。
11. 連絡先検出を投稿前に実行する。
12. 投稿者の非公開化・削除を実装する。
13. 通報APIをVercel API Routeで実装する。
14. 管理者Custom Claimsと管理画面を実装する。
15. Firestore Security RulesをEmulatorでテストする。
16. Vercel Previewへデプロイして確認する。
17. 本番切替前チェックを行う。

## 料金・無料枠・課金リスクの注意

2026-07-17時点のFirebase公式情報ベースです。実運用前に必ずFirebase公式料金ページで再確認してください。

### Firebaseプラン

- Spark plan: 無料枠。支払い情報なしで開始できる。
- Blaze plan: 従量課金。無料枠を超えた分や一部Google Cloud機能を使う場合に必要。

参考:

- Firebase pricing plans: https://firebase.google.com/docs/projects/billing/firebase-pricing-plans
- Firebase pricing: https://firebase.google.com/pricing

### Firestore無料枠の目安

公式ドキュメント上のCloud Firestore無料枠の目安:

- 保存データ: 1 GiB
- document reads: 50,000 / day
- document writes: 20,000 / day
- document deletes: 20,000 / day
- outbound data transfer: 10 GiB / month

参考:

- Cloud Firestore billing: https://firebase.google.com/docs/firestore/pricing

### 課金リスク

- 一覧ページで投稿カードを大量に読むとread数が増える。
- 検索条件ごとにFirestore queryが発生する。
- 通報や投稿はwrite数を消費する。
- reportCount更新やauditLogs作成もwrite数を消費する。
- 複合インデックスが必要になる場合がある。
- Vercel API Routeを使う場合、Vercel側の使用量も別途考慮する。
- Cloud Functionsを使う場合はBlaze planが必要になる可能性があるため、初期MVPではVercel API Routeを優先する。

コスト抑制策:

- 一覧はページネーションする。
- 1ページあたりの取得件数を制限する。
- `status == approved` と `matchDate` など、必要な条件だけでqueryする。
- 無限スクロールより明示的な「さらに表示」を優先する。
- 通報連打をUIとサーバー側で抑止する。
- Firebase budget alertを設定する。

## 実装順序

1. Firebase移行用ブランチを作成する。
2. Firebaseプロジェクトを作成する。
3. Googleログインを有効化する。
4. Firestoreデータ構造とSecurity Rulesを実装する。
5. Firebase client SDKをNext.jsに追加する。
6. 公開一覧と詳細をFirestore読み取りに差し替える。
7. GoogleログインUIを追加する。
8. 投稿フォームをFirestore作成へ接続する。
9. 連絡先検出をクライアントとRulesで確認する。
10. 投稿者の非公開化・削除を実装する。
11. Vercel API Route + Firebase Admin SDKで通報APIを実装する。
12. 通報しきい値到達時の `reported` 化をtransactionで実装する。
13. 管理者Custom Claimsを設定する。
14. 管理画面で事後モデレーションを実装する。
15. Firebase EmulatorでSecurity Rulesをテストする。
16. Vercel Previewで動作確認する。
17. READMEにFirebase版の運用手順を反映する。
18. 本番切替判断を行う。

## 本番切替手順

1. Firebase本番プロジェクトを作成する。
2. GoogleログインのAuthorized domainsに本番Vercelドメインを登録する。
3. Firestore Security Rulesを本番反映する。
4. Vercel ProjectのEnvironment VariablesをFirebase版に設定する。
5. Vercel Previewで以下を確認する。
   - 公開一覧
   - 投稿詳細
   - 検索
   - Googleログイン
   - 投稿
   - 投稿者非公開化
   - 投稿者削除
   - 通報
   - 3件通報時の `reported` 化
   - 管理者モデレーション
6. 既存Supabase版の本番URLと比較確認する。
7. Firebase版ブランチをmainへmergeする。
8. Vercel本番デプロイを実行する。
9. 本番でスモークテストする。
10. 問題があれば直前のVercel deploymentへrollbackする。

## 本番切替前チェックリスト

- [ ] Supabase依存がFirebase版から除去されている。
- [ ] Firebase Hostingを使っていない。
- [ ] VercelのEnvironment VariablesにFirebase Web SDK設定が入っている。
- [ ] Firebase Admin SDKの秘密鍵がVercelのServer Environment Variablesだけにある。
- [ ] Firebase Admin SDK秘密鍵に `NEXT_PUBLIC_` が付いていない。
- [ ] `.env.local` がGit管理対象外である。
- [ ] Firestore Security RulesをEmulatorでテスト済み。
- [ ] GoogleログインがVercel本番ドメインで動く。
- [ ] 未ログインユーザーは投稿できない。
- [ ] 投稿本文に連絡先らしき文字列があると投稿できない。
- [ ] 投稿者は自分の投稿だけ非公開化・削除できる。
- [ ] 他人の投稿は編集・削除できない。
- [ ] 通報の重複登録ができない。
- [ ] 通報しきい値で `reported` になる。
- [ ] `reported` / `hidden` / `deleted` は公開一覧に出ない。
- [ ] 管理者だけが事後モデレーションできる。
- [ ] Firebase budget alertを設定済み。

## 参照リンク

- Firebase Auth Googleログイン: https://firebase.google.com/docs/auth/web/google-signin
- Firebase Auth Web開始手順: https://firebase.google.com/docs/auth/web/start
- Firebase Security Rules: https://firebase.google.com/docs/rules
- Firebase pricing plans: https://firebase.google.com/docs/projects/billing/firebase-pricing-plans
- Cloud Firestore billing: https://firebase.google.com/docs/firestore/pricing
