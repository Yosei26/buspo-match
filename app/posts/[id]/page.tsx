"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { deleteDoc, doc, getDoc, updateDoc, type Timestamp } from "firebase/firestore";
import { firebaseAuth, firebaseDb, googleAuthProvider, hasFirebaseConfig } from "@/lib/firebase";

type FirebaseMatchPost = {
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
  status: "approved" | "reported" | "hidden";
  ownerUid: string;
  reportCount: number;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
};

const schoolLevelLabels: Record<FirebaseMatchPost["schoolLevel"], string> = {
  middle_school: "中学",
  high_school: "高校"
};

const ballTypeLabels: Record<FirebaseMatchPost["ballType"], string> = {
  hard: "硬式",
  rubber: "軟式"
};

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asTimestamp(value: unknown) {
  return value && typeof value === "object" && "toDate" in value ? (value as Timestamp) : null;
}

function normalizePost(id: string, data: Record<string, unknown>): FirebaseMatchPost {
  const schoolLevel = asString(data.schoolLevel) === "middle_school" ? "middle_school" : "high_school";
  const ballType = asString(data.ballType) === "rubber" ? "rubber" : "hard";
  const status = asString(data.status) === "approved" ? "approved" : asString(data.status) === "reported" ? "reported" : "hidden";

  return {
    id,
    teamName: asString(data.teamName, "チーム名未設定"),
    region: asString(data.region, "地域未設定"),
    schoolLevel,
    ballType,
    matchDate: asString(data.matchDate, "日程未設定"),
    timeSlot: asString(data.timeSlot, "時間帯未設定"),
    venue: asString(data.venue, "会場未設定"),
    opponentPreference: asString(data.opponentPreference, "希望条件未設定"),
    gameFormat: asString(data.gameFormat, "試合形式未設定"),
    notes: asString(data.notes),
    status,
    ownerUid: asString(data.ownerUid),
    reportCount: typeof data.reportCount === "number" ? data.reportCount : 0,
    createdAt: asTimestamp(data.createdAt),
    updatedAt: asTimestamp(data.updatedAt)
  };
}

export default function FirebasePostDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const postId = typeof params.id === "string" ? params.id : "";
  const [user, setUser] = useState<User | null>(null);
  const [post, setPost] = useState<FirebaseMatchPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadPost();
    if (!firebaseAuth) {
      setAuthLoading(false);
      return;
    }
    return onAuthStateChanged(firebaseAuth, (nextUser) => {
      setUser(nextUser);
      setAuthLoading(false);
    });
  }, [postId]);

  async function loadPost() {
    if (!firebaseDb || !postId) {
      setLoading(false);
      setMessage("Firebase Web SDK設定が不足しているため、募集を読み込めません。");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const snapshot = await getDoc(doc(firebaseDb, "matchPosts", postId));
      if (!snapshot.exists()) {
        setPost(null);
        return;
      }
      const nextPost = normalizePost(snapshot.id, snapshot.data());
      setPost(nextPost.status === "approved" ? nextPost : null);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "不明なエラー";
      setPost(null);
      setMessage(`募集を読み込めませんでした: ${detail}`);
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
      setMessage("Googleログインに成功しました。");
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

  async function reportPost() {
    if (!post || !user) {
      setMessage("通報にはGoogleログインが必要です。");
      return;
    }
    if (post.ownerUid === user.uid) {
      setMessage("自分の投稿は通報できません。");
      return;
    }

    const confirmed = window.confirm("この募集を通報しますか。通報が3件以上になると一覧から非表示になります。");
    if (!confirmed) return;

    setActionLoading(true);
    setMessage("");
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/firebase-posts/${post.id}/report`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error ?? "通報を保存できませんでした。");
        return;
      }
      setMessage(result.message ?? "通報を受け付けました。");
      await loadPost();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "不明なエラー";
      setMessage(`通報を保存できませんでした: ${detail}`);
    } finally {
      setActionLoading(false);
    }
  }

  async function hideOwnPost() {
    if (!firebaseDb || !post || !user || post.ownerUid !== user.uid) {
      setMessage("自分の投稿だけ非公開にできます。");
      return;
    }

    const confirmed = window.confirm("この募集を非公開にしますか。公開一覧から表示されなくなります。");
    if (!confirmed) return;

    setActionLoading(true);
    setMessage("");
    try {
      await updateDoc(doc(firebaseDb, "matchPosts", post.id), {
        status: "hidden"
      });
      setMessage("募集を非公開にしました。");
      setPost(null);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "不明なエラー";
      setMessage(`募集を非公開にできませんでした: ${detail}`);
    } finally {
      setActionLoading(false);
    }
  }

  async function deleteOwnPost() {
    if (!firebaseDb || !post || !user || post.ownerUid !== user.uid) {
      setMessage("自分の投稿だけ削除できます。");
      return;
    }

    const confirmed = window.confirm("この募集を削除しますか。Firestoreから削除されます。");
    if (!confirmed) return;

    setActionLoading(true);
    setMessage("");
    try {
      await deleteDoc(doc(firebaseDb, "matchPosts", post.id));
      router.push("/");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "不明なエラー";
      setMessage(`募集を削除できませんでした: ${detail}`);
      setActionLoading(false);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <strong>Buspo Match</strong>
          <span>練習試合募集 詳細</span>
        </div>
        <nav className="nav">
          <Link className="button secondary" href="/">
            募集一覧へ戻る
          </Link>
          {user ? (
            <button className="button secondary" type="button" onClick={handleSignOut}>
              ログアウト
            </button>
          ) : (
            <button className="button secondary" type="button" onClick={handleGoogleSignIn} disabled={!firebaseAuth || authLoading}>
              Googleでログイン
            </button>
          )}
        </nav>
      </header>

      <div className="container">
        {message && <p className={message.includes("できません") || message.includes("失敗") ? "notice error" : "notice"}>{message}</p>}

        {loading ? (
          <p className="notice">募集を読み込んでいます。</p>
        ) : !post ? (
          <section className="panel detail">
            <h1>募集が見つかりません</h1>
            <p className="body-text">
              この募集は存在しないか、非公開になっています。公開中の募集だけを詳細ページで表示します。
            </p>
            <div className="actions">
              <Link className="button" href="/">
                募集一覧へ戻る
              </Link>
            </div>
          </section>
        ) : (
          <section className="panel detail">
            <div className="section-head">
              <div>
                <h1>{post.teamName}</h1>
                <div className="meta">
                  <span className="meta-item">希望日 {post.matchDate}</span>
                  <span className="meta-item">地域 {post.region}</span>
                  <span className="meta-item">区分 {schoolLevelLabels[post.schoolLevel]}</span>
                  <span className="meta-item">種別 {ballTypeLabels[post.ballType]}</span>
                  <span className="meta-item contact-private">連絡先非公開</span>
                </div>
              </div>
              <span className="badge approved">公開中</span>
            </div>

            <div className="detail-grid">
              <div className="detail-item">
                <span>地域</span>
                <strong>{post.region}</strong>
              </div>
              <div className="detail-item">
                <span>中学/高校</span>
                <strong>{schoolLevelLabels[post.schoolLevel]}</strong>
              </div>
              <div className="detail-item">
                <span>硬式/軟式</span>
                <strong>{ballTypeLabels[post.ballType]}</strong>
              </div>
              <div className="detail-item">
                <span>希望日</span>
                <strong>{post.matchDate}</strong>
              </div>
              <div className="detail-item">
                <span>時間帯</span>
                <strong>{post.timeSlot}</strong>
              </div>
              <div className="detail-item">
                <span>会場</span>
                <strong>{post.venue}</strong>
              </div>
              <div className="detail-item">
                <span>相手希望</span>
                <strong>{post.opponentPreference}</strong>
              </div>
              <div className="detail-item">
                <span>形式</span>
                <strong>{post.gameFormat}</strong>
              </div>
            </div>

            <div className="detail-section">
              <h2>補足</h2>
              <p className="body-text">{post.notes || "補足はありません。"}</p>
            </div>

            <p className="notice warn">
              連絡先は一般公開していません。メールアドレス、電話番号、LINE ID、SNS IDなどが投稿本文に含まれている場合は通報してください。
            </p>

            <div className="actions">
              <Link className="button secondary" href="/">
                募集一覧へ戻る
              </Link>
              {!hasFirebaseConfig ? null : !user ? (
                <button className="button secondary" type="button" onClick={handleGoogleSignIn} disabled={!firebaseAuth || authLoading}>
                  ログインして通報する
                </button>
              ) : user.uid === post.ownerUid ? (
                <>
                  <button className="button secondary" type="button" onClick={hideOwnPost} disabled={actionLoading}>
                    非公開にする
                  </button>
                  <button className="button danger" type="button" onClick={deleteOwnPost} disabled={actionLoading}>
                    削除する
                  </button>
                </>
              ) : (
                <button className="button secondary" type="button" onClick={reportPost} disabled={actionLoading}>
                  通報する
                </button>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
