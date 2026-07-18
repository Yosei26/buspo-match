"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { addDoc, collection, getDocs, query, serverTimestamp, where, type Timestamp } from "firebase/firestore";
import { firebaseAuth, firebaseDb, googleAuthProvider, hasFirebaseConfig } from "@/lib/firebase";

type TestWrite = {
  id: string;
  uid: string;
  email: string | null;
  message: string;
  createdAt: Timestamp | null;
};

export default function FirebaseTestPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [message, setMessage] = useState("");
  const [testMessage, setTestMessage] = useState("Firestore読み書きテスト");
  const [testWrites, setTestWrites] = useState<TestWrite[]>([]);
  const [loading, setLoading] = useState(false);
  const [firestoreLoading, setFirestoreLoading] = useState(false);

  useEffect(() => {
    if (!firebaseAuth) {
      setAuthChecked(true);
      return;
    }

    return onAuthStateChanged(firebaseAuth, (nextUser) => {
      setUser(nextUser);
      setAuthChecked(true);
      if (nextUser) {
        loadTestWrites(nextUser);
      } else {
        setTestWrites([]);
      }
    });
  }, []);

  async function handleGoogleSignIn() {
    if (!firebaseAuth) {
      setMessage("Firebase Web SDK設定が不足しているため、Googleログインを開始できません。");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      await signInWithPopup(firebaseAuth, googleAuthProvider);
      setMessage("Googleログインに成功しました。");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "不明なエラー";
      setMessage(`Googleログインに失敗しました: ${detail}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    if (!firebaseAuth) return;

    setLoading(true);
    setMessage("");
    try {
      await signOut(firebaseAuth);
      setMessage("ログアウトしました。");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "不明なエラー";
      setMessage(`ログアウトに失敗しました: ${detail}`);
    } finally {
      setLoading(false);
    }
  }

  async function loadTestWrites(currentUser = user) {
    if (!firebaseDb || !currentUser) {
      setTestWrites([]);
      return;
    }

    setFirestoreLoading(true);
    setMessage("");
    try {
      const writesQuery = query(collection(firebaseDb, "firebaseTestWrites"), where("uid", "==", currentUser.uid));
      const snapshot = await getDocs(writesQuery);
      const writes = snapshot.docs
        .map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            uid: typeof data.uid === "string" ? data.uid : "",
            email: typeof data.email === "string" ? data.email : null,
            message: typeof data.message === "string" ? data.message : "",
            createdAt: data.createdAt && typeof data.createdAt.toDate === "function" ? data.createdAt : null
          };
        })
        .sort((a, b) => {
          const aTime = a.createdAt?.toMillis() ?? 0;
          const bTime = b.createdAt?.toMillis() ?? 0;
          return bTime - aTime;
        });
      setTestWrites(writes);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "不明なエラー";
      setMessage(`Firestoreの読み込みに失敗しました: ${detail}`);
    } finally {
      setFirestoreLoading(false);
    }
  }

  async function handleCreateTestWrite() {
    if (!firebaseDb || !user) {
      setMessage("Firestoreテスト書き込みにはGoogleログインが必要です。");
      return;
    }

    const trimmedMessage = testMessage.trim();
    if (!trimmedMessage) {
      setMessage("テストメッセージを入力してください。");
      return;
    }

    setFirestoreLoading(true);
    setMessage("");
    try {
      await addDoc(collection(firebaseDb, "firebaseTestWrites"), {
        uid: user.uid,
        email: user.email ?? null,
        message: trimmedMessage,
        createdAt: serverTimestamp()
      });
      setMessage("Firestoreへテスト書き込みを保存しました。");
      await loadTestWrites(user);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "不明なエラー";
      setMessage(`Firestoreの書き込みに失敗しました: ${detail}`);
    } finally {
      setFirestoreLoading(false);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <strong>Buspo Match</strong>
          <span>Firebase Googleログイン確認</span>
        </div>
        <nav className="nav">
          <Link className="admin-link" href="/">
            トップへ戻る
          </Link>
        </nav>
      </header>

      <div className="container">
        <section className="section panel">
          <div className="section-head">
            <div>
              <h1>Firebaseログイン確認</h1>
              <p>Firebase AuthenticationのGoogleログインだけを確認するためのページです。Firestoreへの書き込みは行いません。</p>
            </div>
          </div>

          <div className="summary-box">
            <h2>設定状態</h2>
            <dl>
              <div>
                <dt>Firebase Web SDK設定</dt>
                <dd>{hasFirebaseConfig ? "読み込み済み" : "未設定または不足あり"}</dd>
              </div>
              <div>
                <dt>Auth初期化</dt>
                <dd>{firebaseAuth ? "利用可能" : "利用不可"}</dd>
              </div>
              <div>
                <dt>確認対象</dt>
                <dd>NEXT_PUBLIC_FIREBASE_* のみ</dd>
              </div>
              <div>
                <dt>Firestore初期化</dt>
                <dd>{firebaseDb ? "利用可能" : "利用不可"}</dd>
              </div>
            </dl>
          </div>

          {!hasFirebaseConfig && (
            <p className="notice warn">
              `.env.local` に Firebase Web SDK用の `NEXT_PUBLIC_FIREBASE_*` を設定してください。Firebase Admin SDKの秘密鍵はこのページでは使いません。
            </p>
          )}

          <div className="actions">
            <button className="button" type="button" onClick={handleGoogleSignIn} disabled={!firebaseAuth || loading}>
              Googleでログイン
            </button>
            <button className="button secondary" type="button" onClick={handleSignOut} disabled={!user || loading}>
              ログアウト
            </button>
          </div>

          {!authChecked ? (
            <p className="notice">ログイン状態を確認しています。</p>
          ) : user ? (
            <div className="summary-box">
              <h2>ログイン中ユーザー</h2>
              <dl>
                <div>
                  <dt>uid</dt>
                  <dd>{user.uid}</dd>
                </div>
                <div>
                  <dt>displayName</dt>
                  <dd>{user.displayName ?? "未設定"}</dd>
                </div>
                <div>
                  <dt>email</dt>
                  <dd>{user.email ?? "未設定"}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <p className="notice">未ログインです。Googleログインボタンから動作確認できます。</p>
          )}

          {message && <p className="notice">{message}</p>}
        </section>

        <section className="section panel">
          <div className="section-head">
            <div>
              <h2>Firestore読み書き確認</h2>
              <p>Googleログイン済みユーザーだけが、テスト用コレクション `firebaseTestWrites` に1件ずつ書き込めます。</p>
            </div>
          </div>

          {!user ? (
            <p className="notice warn">Firestore読み書き確認にはGoogleログインが必要です。</p>
          ) : (
            <div className="grid">
              <div className="field">
                <label htmlFor="testMessage">テストメッセージ</label>
                <input
                  id="testMessage"
                  value={testMessage}
                  onChange={(event) => setTestMessage(event.target.value)}
                  placeholder="例: Firestore接続確認"
                  maxLength={120}
                />
              </div>
              <div className="actions">
                <button
                  className="button"
                  type="button"
                  onClick={handleCreateTestWrite}
                  disabled={!firebaseDb || firestoreLoading}
                >
                  Firestoreにテスト保存
                </button>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => loadTestWrites()}
                  disabled={!firebaseDb || firestoreLoading}
                >
                  自分の書き込みを再読み込み
                </button>
              </div>
            </div>
          )}

          <div className="summary-box">
            <h3>自分のテスト書き込み</h3>
            {firestoreLoading ? (
              <p className="notice">Firestoreを確認しています。</p>
            ) : !user ? (
              <p className="empty">ログイン後に自分のテスト書き込みだけを表示します。</p>
            ) : !testWrites.length ? (
              <p className="empty">自分のテスト書き込みはまだありません。</p>
            ) : (
              <dl>
                {testWrites.map((write) => (
                  <div key={write.id}>
                    <dt>{write.message}</dt>
                    <dd>
                      {write.email ?? "email未設定"} / {write.createdAt ? write.createdAt.toDate().toLocaleString("ja-JP") : "保存時刻反映待ち"}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          <p className="notice warn">
            この欄はFirebase接続確認専用です。Buspo Match本体の募集投稿データにはまだ書き込みません。
          </p>
        </section>
      </div>
    </main>
  );
}
