"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Timestamp
} from "firebase/firestore";
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

type SearchFilters = {
  matchDate: string;
  region: string;
  schoolLevel: "" | FirebaseMatchPost["schoolLevel"];
  ballType: "" | FirebaseMatchPost["ballType"];
};

const schoolLevelLabels: Record<FirebaseMatchPost["schoolLevel"], string> = {
  middle_school: "中学",
  high_school: "高校"
};

const ballTypeLabels: Record<FirebaseMatchPost["ballType"], string> = {
  hard: "硬式",
  rubber: "軟式"
};

const regionOptions = ["東京都", "神奈川県", "埼玉県", "千葉県", "茨城県", "栃木県", "群馬県", "山梨県"];

const emptyFilters: SearchFilters = {
  matchDate: "",
  region: "",
  schoolLevel: "",
  ballType: ""
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

function matchesFilters(post: FirebaseMatchPost, filters: SearchFilters) {
  if (filters.matchDate && post.matchDate !== filters.matchDate) return false;
  if (filters.region && post.region !== filters.region) return false;
  if (filters.schoolLevel && post.schoolLevel !== filters.schoolLevel) return false;
  if (filters.ballType && post.ballType !== filters.ballType) return false;
  return true;
}

export function FirebasePostsExperience({ variant = "home" }: { variant?: "home" | "preview" }) {
  const [user, setUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<FirebaseMatchPost[]>([]);
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [postForm, setPostForm] = useState(initialPostForm);
  const [filters, setFilters] = useState<SearchFilters>(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [postActionId, setPostActionId] = useState<string | null>(null);
  const [showPostForm, setShowPostForm] = useState(false);

  const hasActiveFilters = Object.values(filters).some(Boolean);
  const filteredPosts = useMemo(() => posts.filter((post) => matchesFilters(post, filters)), [posts, filters]);

  useEffect(() => {
    loadApprovedPosts();
    if (!firebaseAuth) {
      setAuthLoading(false);
      return;
    }
    return onAuthStateChanged(firebaseAuth, (nextUser) => {
      setUser(nextUser);
      setAuthLoading(false);
      if (nextUser) setShowPostForm(true);
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
      setShowPostForm(false);
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
      setMessage("募集を投稿しました。すぐに公開一覧へ表示されます。連絡先は一般公開されません。");
      await loadApprovedPosts();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "不明なエラー";
      setFormError(`募集を投稿できませんでした: ${detail}`);
    } finally {
      setPosting(false);
    }
  }

  async function hideOwnPost(post: FirebaseMatchPost) {
    if (!firebaseDb || !user || post.ownerUid !== user.uid) {
      setMessage("自分の投稿だけ非公開にできます。");
      return;
    }

    const confirmed = window.confirm("この募集を非公開にしますか。公開一覧から表示されなくなります。");
    if (!confirmed) return;

    setPostActionId(post.id);
    setMessage("");
    try {
      await updateDoc(doc(firebaseDb, "matchPosts", post.id), {
        status: "hidden"
      });
      setMessage("募集を非公開にしました。");
      await loadApprovedPosts();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "不明なエラー";
      setMessage(`募集を非公開にできませんでした: ${detail}`);
    } finally {
      setPostActionId(null);
    }
  }

  async function deleteOwnPost(post: FirebaseMatchPost) {
    if (!firebaseDb || !user || post.ownerUid !== user.uid) {
      setMessage("自分の投稿だけ削除できます。");
      return;
    }

    const confirmed = window.confirm("この募集を削除しますか。Firestoreから削除されます。");
    if (!confirmed) return;

    setPostActionId(post.id);
    setMessage("");
    try {
      await deleteDoc(doc(firebaseDb, "matchPosts", post.id));
      setMessage("募集を削除しました。");
      await loadApprovedPosts();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "不明なエラー";
      setMessage(`募集を削除できませんでした: ${detail}`);
    } finally {
      setPostActionId(null);
    }
  }

  async function reportPost(post: FirebaseMatchPost) {
    if (!user) {
      setMessage("通報にはGoogleログインが必要です。");
      return;
    }
    if (post.ownerUid === user.uid) {
      setMessage("自分の投稿は通報できません。");
      return;
    }

    const confirmed = window.confirm("この募集を通報しますか。通報が3件以上になると一覧から非表示になります。");
    if (!confirmed) return;

    setPostActionId(post.id);
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
      await loadApprovedPosts();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "不明なエラー";
      setMessage(`通報を保存できませんでした: ${detail}`);
    } finally {
      setPostActionId(null);
    }
  }

  function clearFilters() {
    setFilters(emptyFilters);
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <strong>Buspo Match</strong>
          <span>{variant === "home" ? "中学・高校野球向け 練習試合募集" : "Firebase版 Preview確認"}</span>
        </div>
        <nav className="nav">
          {user ? (
            <>
              <span className="admin-link">{user.displayName ?? "Googleユーザー"} でログイン中</span>
              <button className="button secondary" type="button" onClick={handleSignOut}>
                ログアウト
              </button>
            </>
          ) : (
            <button className="button secondary" type="button" onClick={handleGoogleSignIn} disabled={!firebaseAuth || authLoading}>
              Googleでログイン
            </button>
          )}
        </nav>
      </header>

      <div className="container">
        <section className="hero">
          <div className="hero-main">
            <h1>野球部の練習試合相手を探す。</h1>
            <p>
              中学・高校の練習試合募集を日程、地域、区分、硬式/軟式で確認できます。
              投稿はGoogleログイン後に即時公開され、連絡先は一般公開されません。
            </p>
            <div className="hero-actions">
              <a className="button" href="#search">
                募集を探す
              </a>
              <button className="button secondary" type="button" onClick={() => setShowPostForm(true)}>
                募集を投稿する
              </button>
            </div>
          </div>

          <div className="panel">
            <h2>Googleログイン</h2>
            {!hasFirebaseConfig ? (
              <p className="notice error">Firebase Web SDK設定が不足しています。Vercel環境変数を確認してください。</p>
            ) : authLoading ? (
              <p className="notice">ログイン状態を確認しています。</p>
            ) : user ? (
              <div className="grid">
                <p className="notice">ログイン中: {user.email ?? user.displayName ?? user.uid}</p>
                <p className="notice warn">
                  投稿本文にメールアドレス、電話番号、LINE ID、SNS IDらしき文字列がある場合は投稿できません。
                </p>
              </div>
            ) : (
              <div className="grid">
                <p className="notice warn">Googleログインすると募集を投稿できます。公開募集の閲覧と検索は未ログインでも利用できます。</p>
                <button className="button" type="button" onClick={handleGoogleSignIn} disabled={!firebaseAuth}>
                  Googleでログイン
                </button>
              </div>
            )}
          </div>
        </section>

        {message && <p className={message.includes("できません") || message.includes("失敗") ? "notice error" : "notice"}>{message}</p>}

        <section className="section panel" id="search">
          <div className="section-head">
            <div>
              <h2>募集を探す</h2>
              <p>公開中の募集だけを表示します。条件を指定すると一覧を絞り込めます。</p>
            </div>
            <button className="button secondary" type="button" onClick={loadApprovedPosts} disabled={loading || !firebaseDb}>
              再読み込み
            </button>
          </div>

          <form className="search-form" onSubmit={(event) => event.preventDefault()}>
            <div className="field">
              <label htmlFor="filterMatchDate">試合希望日</label>
              <input
                id="filterMatchDate"
                type="date"
                value={filters.matchDate}
                onChange={(event) => setFilters({ ...filters, matchDate: event.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="filterRegion">地域</label>
              <select id="filterRegion" value={filters.region} onChange={(event) => setFilters({ ...filters, region: event.target.value })}>
                <option value="">すべての地域</option>
                {regionOptions.map((region) => (
                  <option value={region} key={region}>
                    {region}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="filterSchoolLevel">中学/高校</label>
              <select
                id="filterSchoolLevel"
                value={filters.schoolLevel}
                onChange={(event) => setFilters({ ...filters, schoolLevel: event.target.value as SearchFilters["schoolLevel"] })}
              >
                <option value="">すべて</option>
                <option value="middle_school">中学</option>
                <option value="high_school">高校</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="filterBallType">硬式/軟式</label>
              <select
                id="filterBallType"
                value={filters.ballType}
                onChange={(event) => setFilters({ ...filters, ballType: event.target.value as SearchFilters["ballType"] })}
              >
                <option value="">すべて</option>
                <option value="hard">硬式</option>
                <option value="rubber">軟式</option>
              </select>
            </div>
            <div className="actions search-actions">
              <a className="button" href="#posts">
                検索結果を見る
              </a>
              <button className="button secondary" type="button" onClick={clearFilters}>
                条件クリア
              </button>
            </div>
          </form>
        </section>

        <section className="section panel" id="post-form" hidden={!showPostForm && !user}>
          <div className="section-head">
            <div>
              <h2>募集を投稿する</h2>
              <p>Googleログイン済みユーザーだけが投稿できます。投稿は原則即時公開です。</p>
            </div>
          </div>

          {!user ? (
            <div className="grid">
              <p className="notice warn">Googleログインすると募集を投稿できます。</p>
              <div className="actions">
                <button className="button" type="button" onClick={handleGoogleSignIn} disabled={!firebaseAuth || authLoading}>
                  Googleでログイン
                </button>
                <button className="button secondary" type="button" onClick={() => setShowPostForm(false)}>
                  閉じる
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
                  <select id="region" value={postForm.region} onChange={(event) => setPostForm({ ...postForm, region: event.target.value })} required>
                    <option value="">地域を選択してください</option>
                    {regionOptions.map((region) => (
                      <option value={region} key={region}>
                        {region}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="schoolLevel">中学/高校</label>
                  <select
                    id="schoolLevel"
                    value={postForm.schoolLevel}
                    onChange={(event) => setPostForm({ ...postForm, schoolLevel: event.target.value as FirebaseMatchPost["schoolLevel"] })}
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
                <button className="button secondary" type="button" onClick={() => setShowPostForm(false)}>
                  閉じる
                </button>
              </div>
            </form>
          )}
        </section>

        <section className="section" id="posts">
          <div className="section-head">
            <div>
              <h2>公開中の練習試合募集</h2>
              <p>
                {hasActiveFilters
                  ? "指定した条件に一致する公開募集を表示しています。"
                  : "未ログインでも読める公開募集を日程順で表示します。"}
              </p>
              <p>募集への問い合わせは、各募集の詳細ページからGoogleログイン後に行えます。</p>
            </div>
            <span className="mode-pill">{filteredPosts.length}件</span>
          </div>

          {loading ? (
            <p className="notice">Firestoreの募集を読み込んでいます。</p>
          ) : !filteredPosts.length ? (
            <p className="empty">
              {hasActiveFilters
                ? "条件に一致する募集はありません。条件を変えて検索してください。"
                : "公開中の募集はまだありません。新しい募集が投稿されるとここに表示されます。"}
            </p>
          ) : (
            <div className="post-list">
              {filteredPosts.map((post) => (
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

                  {post.notes ? (
                    <div className="detail-section">
                      <h2>補足</h2>
                      <p className="body-text">{post.notes}</p>
                    </div>
                  ) : null}

                  <div className="actions">
                    <Link className="button secondary" href={`/posts/${post.id}`}>
                      詳細を見る
                    </Link>
                  </div>

                  {user?.uid === post.ownerUid ? (
                    <div className="actions">
                      <button className="button secondary" type="button" onClick={() => hideOwnPost(post)} disabled={postActionId === post.id}>
                        非公開にする
                      </button>
                      <button className="button danger" type="button" onClick={() => deleteOwnPost(post)} disabled={postActionId === post.id}>
                        削除する
                      </button>
                    </div>
                  ) : null}

                  {!user ? (
                    <p className="notice warn">ログインすると通報できます。</p>
                  ) : user.uid !== post.ownerUid ? (
                    <div className="actions">
                      <button className="button secondary" type="button" onClick={() => reportPost(post)} disabled={postActionId === post.id}>
                        通報する
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>

        <footer className="site-footer">
          <div>
            <strong>Buspo Match</strong>
            <p>中学・高校野球向けの練習試合募集サービスです。連絡先は一般公開しない方針で運用します。</p>
          </div>
          <nav aria-label="固定ページ">
            <Link href="/terms">利用規約</Link>
            <Link href="/privacy">プライバシーポリシー</Link>
            <Link href="/guidelines">注意事項</Link>
            <Link href="/guidelines#contact">問い合わせ方法</Link>
          </nav>
        </footer>
      </div>
    </main>
  );
}
