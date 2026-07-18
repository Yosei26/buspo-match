"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { firebaseAuth, googleAuthProvider, hasFirebaseConfig } from "@/lib/firebase";

type ModerationPost = {
  id: string;
  teamName: string;
  region: string;
  schoolLevel: "middle_school" | "high_school";
  ballType: "hard" | "rubber";
  matchDate: string;
  timeSlot: string;
  venue: string;
  opponentPreference: string;
  gameFormat: string;
  notes: string;
  status: "reported" | "hidden";
  ownerEmail: string;
  reportCount: number;
  updatedAt: string | null;
};

const schoolLevelLabels: Record<ModerationPost["schoolLevel"], string> = {
  middle_school: "中学",
  high_school: "高校"
};

const ballTypeLabels: Record<ModerationPost["ballType"], string> = {
  hard: "硬式",
  rubber: "軟式"
};

const statusLabels: Record<ModerationPost["status"], string> = {
  reported: "通報あり",
  hidden: "非公開"
};

export default function FirebaseAdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<ModerationPost[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseAuth) {
      setAuthLoading(false);
      return;
    }

    return onAuthStateChanged(firebaseAuth, (nextUser) => {
      setUser(nextUser);
      setAuthLoading(false);
      if (nextUser) {
        loadModerationPosts(nextUser);
      } else {
        setPosts([]);
      }
    });
  }, []);

  async function authHeaders(currentUser = user) {
    if (!currentUser) return null;
    const token = await currentUser.getIdToken();
    return { Authorization: `Bearer ${token}` };
  }

  async function loadModerationPosts(currentUser = user) {
    const headers = await authHeaders(currentUser);
    if (!headers) {
      setMessage("管理画面にはGoogleログインが必要です。");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/firebase-admin/posts", { headers });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error ?? "管理対象の投稿を読み込めませんでした。");
        setPosts([]);
        return;
      }
      setPosts((result.posts ?? []) as ModerationPost[]);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "不明なエラー";
      setMessage(`管理対象の投稿を読み込めませんでした: ${detail}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    if (!firebaseAuth) {
      setMessage("Firebase Web SDK設定が不足しているため、Googleログインを開始できません。");
      return;
    }

    setMessage("");
    try {
      await signInWithPopup(firebaseAuth, googleAuthProvider);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "不明なエラー";
      setMessage(`Googleログインに失敗しました: ${detail}`);
    }
  }

  async function handleSignOut() {
    if (!firebaseAuth) return;
    await signOut(firebaseAuth);
    setMessage("ログアウトしました。");
  }

  async function updateStatus(postId: string, status: "approved" | "hidden") {
    const headers = await authHeaders();
    if (!headers) return;

    setActionId(postId);
    setMessage("");
    try {
      const response = await fetch(`/api/firebase-admin/posts/${postId}`, {
        method: "PATCH",
        headers: {
          ...headers,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ status })
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error ?? "管理操作に失敗しました。");
        return;
      }
      setMessage(status === "approved" ? "投稿を公開に戻しました。" : "投稿を非公開にしました。");
      await loadModerationPosts();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "不明なエラー";
      setMessage(`管理操作に失敗しました: ${detail}`);
    } finally {
      setActionId(null);
    }
  }

  async function deletePost(postId: string) {
    const headers = await authHeaders();
    if (!headers) return;

    const confirmed = window.confirm("この投稿を削除しますか。");
    if (!confirmed) return;

    setActionId(postId);
    setMessage("");
    try {
      const response = await fetch(`/api/firebase-admin/posts/${postId}`, {
        method: "DELETE",
        headers
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error ?? "投稿を削除できませんでした。");
        return;
      }
      setMessage("投稿を削除しました。");
      await loadModerationPosts();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "不明なエラー";
      setMessage(`投稿を削除できませんでした: ${detail}`);
    } finally {
      setActionId(null);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <strong>Buspo Match</strong>
          <span>Firebase管理者モデレーション</span>
        </div>
        <nav className="nav">
          <Link className="admin-link" href="/firebase-posts">
            Firebase募集一覧
          </Link>
          <Link className="admin-link" href="/">
            Supabase版トップ
          </Link>
          {user ? (
            <button className="button secondary" type="button" onClick={handleSignOut}>
              ログアウト
            </button>
          ) : null}
        </nav>
      </header>

      <div className="container">
        <section className="section panel">
          <div className="section-head">
            <div>
              <h1>事後モデレーション</h1>
              <p>reported または hidden の投稿だけをAPI Route経由で確認します。管理操作はFirebase Admin SDK側で実行します。</p>
            </div>
            <span className="mode-pill">Firebase管理</span>
          </div>

          <div className="summary-box">
            <h2>管理者ログイン</h2>
            <dl>
              <div>
                <dt>Firebase設定</dt>
                <dd>{hasFirebaseConfig ? "読み込み済み" : "未設定または不足あり"}</dd>
              </div>
              <div>
                <dt>ログイン状態</dt>
                <dd>{authLoading ? "確認中" : user ? `${user.email ?? "email未確認"} でログイン中` : "未ログイン"}</dd>
              </div>
            </dl>
          </div>

          {!user ? (
            <div className="actions">
              <button className="button" type="button" onClick={handleGoogleSignIn} disabled={!firebaseAuth || authLoading}>
                Googleでログイン
              </button>
            </div>
          ) : (
            <div className="actions">
              <button className="button secondary" type="button" onClick={() => loadModerationPosts()} disabled={loading}>
                再読み込み
              </button>
            </div>
          )}

          {message && <p className="notice">{message}</p>}
        </section>

        <section className="section">
          <div className="section-head">
            <div>
              <h2>管理対象投稿</h2>
              <p>通報済みまたは非公開の投稿だけを表示します。</p>
            </div>
          </div>

          {loading ? (
            <p className="notice">管理対象の投稿を読み込んでいます。</p>
          ) : !user ? (
            <p className="empty">管理対象投稿を見るにはGoogleログインが必要です。</p>
          ) : !posts.length ? (
            <p className="empty">管理対象の投稿はありません。</p>
          ) : (
            <div className="post-list">
              {posts.map((post) => (
                <article className="post-card" key={post.id}>
                  <header>
                    <div>
                      <h3>{post.teamName}</h3>
                      <div className="meta">
                        <span className="meta-item">状態 {statusLabels[post.status]}</span>
                        <span className="meta-item">通報 {post.reportCount}件</span>
                        <span className="meta-item">試合希望日 {post.matchDate}</span>
                        <span className="meta-item">地域 {post.region}</span>
                        <span className="meta-item">区分 {schoolLevelLabels[post.schoolLevel]}</span>
                        <span className="meta-item">種別 {ballTypeLabels[post.ballType]}</span>
                      </div>
                    </div>
                    <span className={`badge ${post.status}`}>{statusLabels[post.status]}</span>
                  </header>

                  <div className="detail-grid">
                    <div className="detail-item">
                      <span>投稿者</span>
                      <strong>{post.ownerEmail || "未設定"}</strong>
                    </div>
                    <div className="detail-item">
                      <span>会場</span>
                      <strong>{post.venue || "未設定"}</strong>
                    </div>
                    <div className="detail-item">
                      <span>希望する相手</span>
                      <strong>{post.opponentPreference || "未設定"}</strong>
                    </div>
                    <div className="detail-item">
                      <span>試合形式</span>
                      <strong>{post.gameFormat || "未設定"}</strong>
                    </div>
                  </div>

                  {post.notes && (
                    <div className="detail-section">
                      <h2>補足</h2>
                      <p className="body-text">{post.notes}</p>
                    </div>
                  )}

                  <div className="actions">
                    <button className="button" type="button" onClick={() => updateStatus(post.id, "approved")} disabled={actionId === post.id}>
                      公開に戻す
                    </button>
                    <button className="button secondary" type="button" onClick={() => updateStatus(post.id, "hidden")} disabled={actionId === post.id}>
                      非公開にする
                    </button>
                    <button className="button danger" type="button" onClick={() => deletePost(post.id)} disabled={actionId === post.id}>
                      削除する
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
