"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { firebaseAuth, googleAuthProvider, hasFirebaseConfig } from "@/lib/firebase";

export default function FirebaseTestPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!firebaseAuth) {
      setAuthChecked(true);
      return;
    }

    return onAuthStateChanged(firebaseAuth, (nextUser) => {
      setUser(nextUser);
      setAuthChecked(true);
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
      </div>
    </main>
  );
}
