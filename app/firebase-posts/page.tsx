"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { collection, getDocs, query, where, type Timestamp } from "firebase/firestore";
import { firebaseDb, hasFirebaseConfig } from "@/lib/firebase";

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
  ownerEmail: string | null;
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
    ownerEmail: typeof data.ownerEmail === "string" ? data.ownerEmail : null,
    reportCount: typeof data.reportCount === "number" ? data.reportCount : 0,
    createdAt: asTimestamp(data.createdAt),
    updatedAt: asTimestamp(data.updatedAt)
  };
}

export default function FirebasePostsPage() {
  const [posts, setPosts] = useState<FirebaseMatchPost[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadApprovedPosts();
  }, []);

  async function loadApprovedPosts() {
    if (!firebaseDb) {
      setLoading(false);
      setMessage("Firebase Web SDK設定が不足しているため、Firestoreの募集を読み込めません。");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const approvedQuery = query(collection(firebaseDb, "matchPosts"), where("status", "==", "approved"));
      const snapshot = await getDocs(approvedQuery);
      const approvedPosts = snapshot.docs
        .map((doc) => normalizePost(doc.id, doc.data()))
        .sort((a, b) => a.matchDate.localeCompare(b.matchDate));
      setPosts(approvedPosts);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "不明なエラー";
      setMessage(`Firestoreの募集を読み込めませんでした: ${detail}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <strong>Buspo Match</strong>
          <span>Firebase募集一覧 最小確認版</span>
        </div>
        <nav className="nav">
          <Link className="admin-link" href="/">
            Supabase版トップ
          </Link>
          <Link className="admin-link" href="/firebase-test">
            Firebase接続確認
          </Link>
        </nav>
      </header>

      <div className="container">
        <section className="section panel">
          <div className="section-head">
            <div>
              <h1>Firebase版 募集一覧</h1>
              <p>
                Firestoreの `matchPosts` から `status == "approved"` の投稿だけを読み込む最小確認ページです。
                投稿フォームはまだ作っていません。
              </p>
            </div>
            <span className="mode-pill">読み取り専用</span>
          </div>

          <div className="summary-box">
            <h2>接続状態</h2>
            <dl>
              <div>
                <dt>Firebase Web SDK設定</dt>
                <dd>{hasFirebaseConfig ? "読み込み済み" : "未設定または不足あり"}</dd>
              </div>
              <div>
                <dt>Firestore初期化</dt>
                <dd>{firebaseDb ? "利用可能" : "利用不可"}</dd>
              </div>
              <div>
                <dt>対象collection</dt>
                <dd>matchPosts</dd>
              </div>
            </dl>
          </div>

          {message && <p className="notice error">{message}</p>}
        </section>

        <section className="section">
          <div className="section-head">
            <div>
              <h2>公開中の練習試合募集</h2>
              <p>未ログインでも読める `approved` 投稿だけを表示します。</p>
            </div>
            <button className="button secondary" type="button" onClick={loadApprovedPosts} disabled={loading || !firebaseDb}>
              再読み込み
            </button>
          </div>

          {loading ? (
            <p className="notice">Firestoreの募集を読み込んでいます。</p>
          ) : !posts.length ? (
            <p className="empty">
              Firestoreに公開中の募集はまだありません。Firebase Consoleから `matchPosts` に `status: "approved"` のテストデータを追加すると表示されます。
            </p>
          ) : (
            <div className="post-list">
              {posts.map((post) => (
                <article className="post-card" key={post.id}>
                  <header>
                    <div>
                      <h3>{post.teamName}</h3>
                      <div className="meta">
                        <span className="meta-item">試合希望日 {post.matchDate}</span>
                        <span className="meta-item">地域 {post.region}</span>
                        <span className="meta-item">区分 {schoolLevelLabels[post.schoolLevel]}</span>
                        <span className="meta-item">種別 {ballTypeLabels[post.ballType]}</span>
                        <span className="meta-item contact-private">連絡先非公開</span>
                      </div>
                    </div>
                    <span className="badge approved">公開中</span>
                  </header>

                  <div className="detail-grid">
                    <div className="detail-item">
                      <span>時間帯</span>
                      <strong>{post.timeSlot}</strong>
                    </div>
                    <div className="detail-item">
                      <span>会場</span>
                      <strong>{post.venue}</strong>
                    </div>
                    <div className="detail-item">
                      <span>希望する相手</span>
                      <strong>{post.opponentPreference}</strong>
                    </div>
                    <div className="detail-item">
                      <span>試合形式</span>
                      <strong>{post.gameFormat}</strong>
                    </div>
                  </div>

                  {post.notes && (
                    <div className="detail-section">
                      <h2>補足</h2>
                      <p className="body-text">{post.notes}</p>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
