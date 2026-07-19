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

type InquiryStatus = "new" | "reviewed" | "closed";

type PostInquiry = {
  id: string;
  postId: string;
  postTitle: string;
  postOwnerUid: string;
  postOwnerEmail: string;
  senderUid: string;
  senderEmail: string;
  message: string;
  status: InquiryStatus;
  createdAt: string | null;
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

const inquiryStatusLabels: Record<InquiryStatus, string> = {
  new: "未確認",
  reviewed: "確認済み",
  closed: "対応終了"
};

function formatDateTime(value: string | null) {
  if (!value) return "未設定";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export default function FirebaseAdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<ModerationPost[]>([]);
  const [inquiries, setInquiries] = useState<PostInquiry[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [inquiryLoading, setInquiryLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [inquiryActionId, setInquiryActionId] = useState<string | null>(null);
  const newInquiryCount = inquiries.filter((inquiry) => inquiry.status === "new").length;
  const reviewedInquiryCount = inquiries.filter((inquiry) => inquiry.status === "reviewed").length;
  const closedInquiryCount = inquiries.filter((inquiry) => inquiry.status === "closed").length;
  const sortedInquiries = [...inquiries].sort((a, b) => {
    const statusOrder: Record<InquiryStatus, number> = { new: 0, reviewed: 1, closed: 2 };
    const statusDiff = statusOrder[a.status] - statusOrder[b.status];
    if (statusDiff !== 0) return statusDiff;
    return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
  });

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
        loadInquiries(nextUser);
      } else {
        setPosts([]);
        setInquiries([]);
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

  async function loadInquiries(currentUser = user) {
    const headers = await authHeaders(currentUser);
    if (!headers) {
      setMessage("管理画面にはGoogleログインが必要です。");
      return;
    }

    setInquiryLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/firebase-admin/inquiries", { headers });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error ?? "問い合わせを読み込めませんでした。");
        setInquiries([]);
        return;
      }
      setInquiries((result.inquiries ?? []) as PostInquiry[]);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "不明なエラー";
      setMessage(`問い合わせを読み込めませんでした: ${detail}`);
    } finally {
      setInquiryLoading(false);
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

  async function updateInquiryStatus(inquiryId: string, status: InquiryStatus) {
    const headers = await authHeaders();
    if (!headers) return;

    setInquiryActionId(inquiryId);
    setMessage("");
    try {
      const response = await fetch(`/api/firebase-admin/inquiries/${inquiryId}`, {
        method: "PATCH",
        headers: {
          ...headers,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ status })
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error ?? "問い合わせの管理操作に失敗しました。");
        return;
      }
      setMessage("問い合わせステータスを更新しました。");
      await loadInquiries();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "不明なエラー";
      setMessage(`問い合わせの管理操作に失敗しました: ${detail}`);
    } finally {
      setInquiryActionId(null);
    }
  }

  async function deleteInquiry(inquiryId: string) {
    const headers = await authHeaders();
    if (!headers) return;

    const confirmed = window.confirm("この問い合わせを削除しますか。");
    if (!confirmed) return;

    setInquiryActionId(inquiryId);
    setMessage("");
    try {
      const response = await fetch(`/api/firebase-admin/inquiries/${inquiryId}`, {
        method: "DELETE",
        headers
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error ?? "問い合わせを削除できませんでした。");
        return;
      }
      setMessage("問い合わせを削除しました。");
      await loadInquiries();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "不明なエラー";
      setMessage(`問い合わせを削除できませんでした: ${detail}`);
    } finally {
      setInquiryActionId(null);
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

          {user ? (
            <div className={newInquiryCount ? "admin-alert has-new" : "admin-alert"}>
              <div>
                <span className="card-kicker">問い合わせ確認状況</span>
                <strong>未確認問い合わせ {newInquiryCount}件</strong>
                <p>
                  {newInquiryCount
                    ? "新しい問い合わせがあります。問い合わせ管理セクションで内容を確認してください。"
                    : "未確認の問い合わせはありません。"}
                </p>
              </div>
              <div className="status-summary admin-alert-counts">
                <span className="badge new">未確認 {newInquiryCount}件</span>
                <span className="badge reviewed">確認済み {reviewedInquiryCount}件</span>
                <span className="badge closed">対応終了 {closedInquiryCount}件</span>
                <span className="badge">合計 {inquiries.length}件</span>
              </div>
            </div>
          ) : null}

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
              <button className="button secondary" type="button" onClick={() => loadInquiries()} disabled={inquiryLoading}>
                問い合わせ再読み込み
              </button>
            </div>
          )}

          {message && <p className="notice">{message}</p>}
        </section>

        <section className="section admin-section">
          <div className="section-head">
            <div>
              <h2>管理対象投稿</h2>
              <p>通報済みまたは非公開の投稿だけを表示します。</p>
            </div>
            <span className="mode-pill">投稿管理 {posts.length}件</span>
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

        <section className="section admin-section inquiries-section">
          <div className="section-head">
            <div>
              <h2>問い合わせ一覧</h2>
              <p>投稿者の連絡先を一般公開せず、管理者確認を経由する問い合わせです。未確認の問い合わせから処理してください。</p>
            </div>
            <span className={newInquiryCount ? "mode-pill urgent" : "mode-pill"}>未確認 {newInquiryCount}件</span>
          </div>

          <div className="status-summary admin-summary">
            <span className="badge new">未確認 {newInquiryCount}件</span>
            <span className="badge reviewed">確認済み {reviewedInquiryCount}件</span>
            <span className="badge closed">対応終了 {closedInquiryCount}件</span>
            <span className="badge">合計 {inquiries.length}件</span>
          </div>

          {inquiryLoading ? (
            <p className="notice">問い合わせを読み込んでいます。</p>
          ) : !user ? (
            <p className="empty">問い合わせを見るにはGoogleログインが必要です。</p>
          ) : !inquiries.length ? (
            <div className="empty">
              <strong>未処理の問い合わせはありません。</strong>
              <p>新しい問い合わせが届くと、この欄に対象募集、本文、送信者、投稿者、作成日時が表示されます。</p>
            </div>
          ) : (
            <div className="post-list">
              {sortedInquiries.map((inquiry) => (
                <article className={`post-card inquiry-card ${inquiry.status === "new" ? "is-new" : ""}`} key={inquiry.id}>
                  <header>
                    <div>
                      <p className="card-kicker">問い合わせ対象の募集</p>
                      <h3>{inquiry.postTitle}</h3>
                      <div className="meta">
                        <span className={`badge ${inquiry.status}`}>{inquiryStatusLabels[inquiry.status]}</span>
                        <span className="meta-item">作成 {formatDateTime(inquiry.createdAt)}</span>
                      </div>
                    </div>
                    <span className={`badge ${inquiry.status}`}>{inquiryStatusLabels[inquiry.status]}</span>
                  </header>

                  <div className="inquiry-message-block">
                    <h2>問い合わせ本文</h2>
                    <p className="body-text">{inquiry.message || "本文なし"}</p>
                  </div>

                  <div className="detail-grid inquiry-meta-grid">
                    <div className="detail-item">
                      <span>送信者メール</span>
                      <strong>{inquiry.senderEmail || "未設定"}</strong>
                    </div>
                    <div className="detail-item">
                      <span>投稿者メール</span>
                      <strong>{inquiry.postOwnerEmail || "未設定"}</strong>
                    </div>
                    <div className="detail-item">
                      <span>ステータス</span>
                      <strong>{inquiryStatusLabels[inquiry.status]} ({inquiry.status})</strong>
                    </div>
                    <div className="detail-item">
                      <span>作成日時</span>
                      <strong>{formatDateTime(inquiry.createdAt)}</strong>
                    </div>
                  </div>

                  <div className="actions">
                    <Link className="button secondary" href={`/posts/${inquiry.postId}`}>
                      募集詳細を開く
                    </Link>
                    <button className="button secondary" type="button" onClick={() => updateInquiryStatus(inquiry.id, "new")} disabled={inquiryActionId === inquiry.id}>
                      未確認に戻す
                    </button>
                    <button className="button" type="button" onClick={() => updateInquiryStatus(inquiry.id, "reviewed")} disabled={inquiryActionId === inquiry.id}>
                      確認済みにする
                    </button>
                    <button className="button secondary" type="button" onClick={() => updateInquiryStatus(inquiry.id, "closed")} disabled={inquiryActionId === inquiry.id}>
                      対応終了にする
                    </button>
                    <button className="button danger" type="button" onClick={() => deleteInquiry(inquiry.id)} disabled={inquiryActionId === inquiry.id}>
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
