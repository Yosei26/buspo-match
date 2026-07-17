"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { addDoc, collection, getDocs, query, serverTimestamp, where, type Timestamp } from "firebase/firestore";
import { firebaseAuth, firebaseDb, googleAuthProvider, hasFirebaseConfig } from "@/lib/firebase";
import { contactInfoError } from "@/lib/safety";

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

const initialPostForm = {
  teamName: "",
  region: "",
  schoolLevel: "high_school" as FirebaseMatchPost["schoolLevel"],
  ballType: "hard" as FirebaseMatchPost["ballType"],
  matchDate: "",
  timeSlot: "",
  venue: "",
  opponentPreference: "",
  gameFormat: "",
  notes: ""
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
  const [user, setUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<FirebaseMatchPost[]>([]);
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [postForm, setPostForm] = useState(initialPostForm);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    loadApprovedPosts();
    if (!firebaseAuth) {
      setAuthLoading(false);
      return;
    }
    return onAuthStateChanged(firebaseAuth, (nextUser) => {
      setUser(nextUser);
      setAuthLoading(false);
    });
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

  async function handleGoogleSignIn() {
    if (!firebaseAuth) {
      setMessage("Firebase Web SDK設定が不足しているため、Googleログインを開始できません。");
      return;
    }

    setMessage("");
    try {
      await signInWithPopup(firebaseAuth, googleAuthProvider);
      setMessage("Googleログインに成功しました。募集を投稿できます。");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "不明なエラー";
      setMessage(`Googleログインに失敗しました: ${detail}`);
    }
  }

  async function handleSignOut() {
    if (!firebaseAuth) return;

    setMessage("");
    try {
      await signOut(firebaseAuth);
      setMessage("ログアウトしました。");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "不明なエラー";
      setMessage(`ログアウトに失敗しました: ${detail}`);
    }
  }

  async function createPost(event: FormEvent) {
    event.preventDefault();
    if (!firebaseDb || !user) {
      setFormError("募集投稿にはGoogleログインが必要です。");
      return;
    }
    if (!user.email) {
      setFormError("Googleアカウントのメールアドレスを確認できないため投稿できません。");
      return;
    }

    const requiredFields: Array<[string, string]> = [
      ["チーム名", postForm.teamName],
      ["地域", postForm.region],
      ["試合希望日", postForm.matchDate],
      ["時間帯", postForm.timeSlot],
      ["会場", postForm.venue],
      ["希望する相手チーム", postForm.opponentPreference],
      ["試合形式", postForm.gameFormat]
    ];
    const missing = requiredFields.filter(([, value]) => !value.trim()).map(([label]) => label);
    if (missing.length) {
      setFormError(`未入力の必須項目があります: ${missing.join("、")}`);
      return;
    }

    const contactError = contactInfoError(
      [postForm.opponentPreference, postForm.gameFormat, postForm.notes, postForm.venue, postForm.timeSlot].join("\n")
    );
    if (contactError) {
      setFormError(contactError);
      return;
    }

    setPosting(true);
    setFormError("");
    setMessage("");
    try {
      await addDoc(collection(firebaseDb, "matchPosts"), {
        teamName: postForm.teamName.trim(),
        region: postForm.region.trim(),
        schoolLevel: postForm.schoolLevel,
        ballType: postForm.ballType,
        matchDate: postForm.matchDate,
        timeSlot: postForm.timeSlot.trim(),
        venue: postForm.venue.trim(),
        opponentPreference: postForm.opponentPreference.trim(),
        gameFormat: postForm.gameFormat.trim(),
        notes: postForm.notes.trim(),
        status: "approved",
        ownerUid: user.uid,
        ownerEmail: user.email,
        reportCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setPostForm(initialPostForm);
      setMessage("募集を投稿しました。approvedとして保存され、一覧に表示されます。");
      await loadApprovedPosts();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "不明なエラー";
      setFormError(`募集を投稿できませんでした: ${detail}`);
    } finally {
      setPosting(false);
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
              <h1>Firebase版 募集一覧</h1>
              <p>
                Firestoreの `matchPosts` から `status == "approved"` の投稿だけを読み込みます。
                Googleログイン後に募集を投稿できます。
              </p>
            </div>
            <span className="mode-pill">Firebase確認版</span>
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
              <div>
                <dt>ログイン状態</dt>
                <dd>{authLoading ? "確認中" : user ? `${user.displayName ?? "Googleユーザー"} としてログイン中` : "未ログイン"}</dd>
              </div>
            </dl>
          </div>

          {message && <p className="notice error">{message}</p>}
        </section>

        <section className="section panel">
          <div className="section-head">
            <div>
              <h2>募集を投稿する</h2>
              <p>Googleログイン済みユーザーだけが、Firestoreの `matchPosts` にapproved投稿を保存できます。</p>
            </div>
          </div>

          {!user ? (
            <div className="grid">
              <p className="notice warn">Googleログインすると募集を投稿できます。</p>
              <div className="actions">
                <button className="button" type="button" onClick={handleGoogleSignIn} disabled={!firebaseAuth || authLoading}>
                  Googleでログイン
                </button>
              </div>
            </div>
          ) : (
            <form className="match-form" onSubmit={createPost}>
              <div className="form-grid">
                <div className="field full-span">
                  <label htmlFor="teamName">チーム名</label>
                  <input
                    id="teamName"
                    value={postForm.teamName}
                    onChange={(event) => setPostForm({ ...postForm, teamName: event.target.value })}
                    placeholder="例: 青葉高校 野球部"
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="region">地域</label>
                  <input
                    id="region"
                    value={postForm.region}
                    onChange={(event) => setPostForm({ ...postForm, region: event.target.value })}
                    placeholder="例: 東京都"
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="schoolLevel">中学/高校</label>
                  <select
                    id="schoolLevel"
                    value={postForm.schoolLevel}
                    onChange={(event) =>
                      setPostForm({ ...postForm, schoolLevel: event.target.value as FirebaseMatchPost["schoolLevel"] })
                    }
                  >
                    <option value="middle_school">中学</option>
                    <option value="high_school">高校</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="ballType">硬式/軟式</label>
                  <select
                    id="ballType"
                    value={postForm.ballType}
                    onChange={(event) => setPostForm({ ...postForm, ballType: event.target.value as FirebaseMatchPost["ballType"] })}
                  >
                    <option value="hard">硬式</option>
                    <option value="rubber">軟式</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="matchDate">試合希望日</label>
                  <input
                    id="matchDate"
                    type="date"
                    value={postForm.matchDate}
                    onChange={(event) => setPostForm({ ...postForm, matchDate: event.target.value })}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="timeSlot">時間帯</label>
                  <input
                    id="timeSlot"
                    value={postForm.timeSlot}
                    onChange={(event) => setPostForm({ ...postForm, timeSlot: event.target.value })}
                    placeholder="例: 13:00開始、午前"
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="venue">会場</label>
                  <input
                    id="venue"
                    value={postForm.venue}
                    onChange={(event) => setPostForm({ ...postForm, venue: event.target.value })}
                    placeholder="例: 自校グラウンド"
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="opponentPreference">希望する相手チーム</label>
                  <input
                    id="opponentPreference"
                    value={postForm.opponentPreference}
                    onChange={(event) => setPostForm({ ...postForm, opponentPreference: event.target.value })}
                    placeholder="例: 同程度のチーム、B戦可"
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="gameFormat">試合形式</label>
                  <input
                    id="gameFormat"
                    value={postForm.gameFormat}
                    onChange={(event) => setPostForm({ ...postForm, gameFormat: event.target.value })}
                    placeholder="例: 7イニング1試合"
                    required
                  />
                </div>
                <div className="field full-span">
                  <label htmlFor="notes">補足</label>
                  <textarea
                    id="notes"
                    value={postForm.notes}
                    onChange={(event) => setPostForm({ ...postForm, notes: event.target.value })}
                    placeholder="例: 駐車場あり。雨天時は中止判断します。"
                  />
                </div>
              </div>

              <p className="notice warn">
                連絡先は一般公開しない運用です。メールアドレス、電話番号、LINE ID、SNS IDらしき文字列は入力しないでください。
              </p>
              {formError && <p className="notice error">{formError}</p>}
              <div className="actions">
                <button className="button" disabled={posting || !firebaseDb}>
                  募集を投稿する
                </button>
              </div>
            </form>
          )}
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
