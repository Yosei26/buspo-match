"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { hasSupabaseConfig, supabase } from "@/lib/supabase";
import { DEMO_OWNER_ID, demoPosts, demoTeams, filterApprovedDemoPosts } from "@/lib/demo-data";
import { DEV_AUTH_OWNER_ID, isDevAuthBypassEnabled } from "@/lib/dev-auth";
import { friendlyError, validateRequired } from "@/lib/messages";
import { contactInfoError } from "@/lib/safety";
import {
  ballTypeLabels,
  MatchPost,
  schoolLevelLabels,
  statusLabels,
  Team
} from "@/lib/types";

const initialTeam = {
  name: "",
  region: "",
  category: "高校野球",
  school_level: "high_school",
  ball_type: "hard"
};

const initialPost = {
  team_name: "青葉高校 野球部",
  match_date: "",
  region: "",
  category: "高校野球",
  school_level: "high_school",
  ball_type: "hard",
  time_slot: "",
  venue: "",
  desired_opponent: "",
  match_format: "",
  desired_conditions: "",
  body: ""
};

const regionOptions = ["東京都", "神奈川県", "埼玉県", "千葉県", "茨城県", "栃木県", "群馬県", "山梨県"];
const emptyFilters = { match_date: "", region: "", school_level: "", ball_type: "" };
const categoryBySchoolLevel = {
  junior_high: "中学野球",
  high_school: "高校野球"
};

export default function HomePage() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [teams, setTeams] = useState<Team[]>([]);
  const [posts, setPosts] = useState<MatchPost[]>([]);
  const [myPosts, setMyPosts] = useState<MatchPost[]>([]);
  const [teamForm, setTeamForm] = useState(initialTeam);
  const [postForm, setPostForm] = useState(initialPost);
  const [postError, setPostError] = useState("");
  const [postSummary, setPostSummary] = useState<string[]>([]);
  const [filters, setFilters] = useState(emptyFilters);
  const [showPostForm, setShowPostForm] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const user = session?.user ?? null;
  const isDemo = !hasSupabaseConfig;
  const isDevAuth = isDevAuthBypassEnabled();
  const isProductionReadOnly = Boolean(supabase && !isDevAuth && !isDemo);
  const authUserId = user?.id ?? (isDevAuth ? DEV_AUTH_OWNER_ID : isDemo ? DEMO_OWNER_ID : null);
  const userEmail = user?.email ?? (isDevAuth ? "開発確認モードのテスト投稿者" : isDemo ? "demo-coach@example.com" : "");
  const isAdmin = user?.app_metadata?.role === "admin" || isDemo || isDevAuth;
  const primaryTeam = teams[0];
  const hasActiveFilters = Object.values(filters).some(Boolean);

  useEffect(() => {
    if (!supabase) {
      setTeams(demoTeams.filter((team) => team.owner_id === DEMO_OWNER_ID));
      setMyPosts(demoPosts.filter((post) => post.owner_id === DEMO_OWNER_ID));
      setMessage("仮データ版で表示しています。Supabase環境変数を設定すると実データ版に切り替わります。");
      return;
    }
    if (isDevAuth) {
      setMessage("開発確認モードです。Supabase標準メール送信を使わず、ローカル専用APIで投稿・即時公開フローを確認します。");
      return;
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    loadApprovedPosts();
  }, []);

  useEffect(() => {
    if (isDemo) return;
    if (isDevAuth) {
      loadMyData(DEV_AUTH_OWNER_ID);
      return;
    }
    if (!user) {
      setTeams([]);
      setMyPosts([]);
      return;
    }
    loadMyData(user.id);
  }, [user?.id]);

  const canPost = useMemo(
    () => Boolean(!isProductionReadOnly && authUserId && (primaryTeam || isDevAuth)),
    [authUserId, primaryTeam, isDevAuth, isProductionReadOnly]
  );

  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (isProductionReadOnly) {
      setPostError("投稿機能は準備中です。Auth方式が確定するまで、本番環境では公開一覧・詳細・検索のみ利用できます。");
      setPostSummary([]);
      return;
    }
    if (!supabase) {
      setMessage("仮データ版ではメール認証は行いません。画面確認用ユーザーとして操作できます。");
      return;
    }
    if (isDevAuth) {
      setMessage("開発確認モードではメール認証を送信しません。投稿・即時公開フローの確認を優先します。");
      return;
    }
    const validation = validateRequired([["メールアドレス", email]]);
    if (validation) {
      setMessage(validation);
      return;
    }
    setLoading(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin }
    });
    setLoading(false);
    setMessage(error ? friendlyError(error, "確認メールを送信できませんでした。") : "確認メールを送信しました。メール内のリンクからログインしてください。");
  }

  async function signOut() {
    if (!supabase) {
      setMessage("仮データ版ではログアウト処理は行いません。");
      return;
    }
    await supabase.auth.signOut();
    setMessage("ログアウトしました。");
  }

  async function loadApprovedPosts(nextFilters = filters) {
    if (!supabase) {
      setPosts(filterApprovedDemoPosts(nextFilters));
      return;
    }
    let query = supabase
      .from("match_posts")
      .select("*, teams(name, school_level, ball_type)")
      .eq("status", "approved")
      .order("match_date", { ascending: true });

    if (nextFilters.match_date) query = query.eq("match_date", nextFilters.match_date);
    if (nextFilters.region) query = query.ilike("region", `%${nextFilters.region}%`);

    const { data, error } = await query;
    if (error) {
      setMessage(friendlyError(error, "公開中の募集を読み込めませんでした。"));
      return;
    }
    let visiblePosts = (data ?? []) as MatchPost[];
    visiblePosts = visiblePosts.filter((post) => post.teams?.school_level !== "club_team");
    if (nextFilters.school_level) {
      visiblePosts = visiblePosts.filter((post) => post.teams?.school_level === nextFilters.school_level);
    }
    if (nextFilters.ball_type) {
      visiblePosts = visiblePosts.filter((post) => post.teams?.ball_type === nextFilters.ball_type);
    }
    setPosts(visiblePosts);
  }

  async function loadMyData(ownerId: string) {
    if (!supabase) {
      setTeams(demoTeams.filter((team) => team.owner_id === ownerId));
      setMyPosts(demoPosts.filter((post) => post.owner_id === ownerId));
      return;
    }
    if (isDevAuth) {
      const response = await fetch("/api/dev/match-posts?scope=owner");
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error ?? "開発確認モードの投稿を読み込めませんでした。");
        return;
      }
      const nextPosts = (result.posts ?? []) as MatchPost[];
      setMyPosts(nextPosts);
      const firstTeam = nextPosts.find((post) => post.teams)?.teams;
      setTeams([
        {
          id: "22222222-2222-4222-8222-222222222222",
          owner_id: DEV_AUTH_OWNER_ID,
          name: firstTeam?.name ?? "架空中央高校 野球部",
          region: "東京都",
          category: "高校野球",
          school_level: firstTeam?.school_level ?? "high_school",
          ball_type: firstTeam?.ball_type ?? "hard",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ]);
      return;
    }
    const [{ data: teamData, error: teamError }, { data: postData, error: postError }] = await Promise.all([
      supabase.from("teams").select("*").eq("owner_id", ownerId).order("created_at"),
      supabase
        .from("match_posts")
        .select("*, teams(name, school_level, ball_type)")
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: false })
    ]);
    if (teamError || postError) {
      setMessage(friendlyError(teamError ?? postError!, "自分の登録情報を読み込めませんでした。"));
      return;
    }
    setTeams((teamData ?? []) as Team[]);
    setMyPosts((postData ?? []) as MatchPost[]);
  }

  async function saveTeam(event: FormEvent) {
    event.preventDefault();
    if (!authUserId) {
      setMessage("チーム登録にはログインが必要です。メールアドレスでログインしてください。");
      return;
    }
    const validation = validateRequired([
      ["チーム名", teamForm.name],
      ["地域", teamForm.region],
      ["カテゴリ", teamForm.category]
    ]);
    if (validation) {
      setMessage(validation);
      return;
    }
    if (!supabase) {
      setTeams([
        {
          id: "demo-team-a",
          owner_id: DEMO_OWNER_ID,
          name: teamForm.name.trim(),
          region: teamForm.region.trim(),
          category: teamForm.category.trim(),
          school_level: teamForm.school_level as Team["school_level"],
          ball_type: teamForm.ball_type as Team["ball_type"],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ]);
      setMessage("チーム情報を仮保存しました。ページを再読み込みすると初期データに戻ります。");
      return;
    }
    setLoading(true);
    setMessage("");
    const { error } = await supabase.from("teams").upsert(
      {
        ...teamForm,
        owner_id: authUserId
      },
      { onConflict: "owner_id" }
    );
    setLoading(false);
    if (error) {
      setMessage(friendlyError(error, "チーム情報を保存できませんでした。"));
      return;
    }
    setMessage("チーム情報を保存しました。");
    setTeamForm(initialTeam);
    await loadMyData(authUserId);
  }

  async function createPost(event: FormEvent) {
    event.preventDefault();
    if (!authUserId) {
      setPostError("募集投稿にはログインが必要です。メールアドレスでログインしてください。");
      setPostSummary([]);
      return;
    }
    if (supabase && !isDevAuth && !primaryTeam) {
      setPostError("Supabase接続版では、募集投稿の前に自チーム情報を登録してください。");
      setPostSummary([]);
      return;
    }
    const requiredFields: Array<[string, string]> = [
      ["チーム名", postForm.team_name],
      ["地域", postForm.region],
      ["試合希望日", postForm.match_date],
      ["時間帯", postForm.time_slot],
      ["会場", postForm.venue],
      ["希望する相手チーム", postForm.desired_opponent],
      ["試合形式", postForm.match_format],
      ["会場・時間・補足", postForm.body]
    ];
    const missing = requiredFields.filter(([, value]) => !value.trim()).map(([label]) => label);
    if (missing.length) {
      setPostError(`未入力の必須項目があります: ${missing.join("、")}`);
      setPostSummary([]);
      return;
    }
    setPostError("");
    const desiredConditions = [
      `希望する相手チーム: ${postForm.desired_opponent.trim()}`,
      `試合形式: ${postForm.match_format.trim()}`,
      postForm.desired_conditions.trim() ? `その他条件: ${postForm.desired_conditions.trim()}` : ""
    ].filter(Boolean).join("\n");
    const postBody = [
      `時間帯: ${postForm.time_slot.trim()}`,
      `会場: ${postForm.venue.trim()}`,
      `補足: ${postForm.body.trim()}`
    ].join("\n");
    const contactError = contactInfoError(
      [
        postForm.team_name,
        postForm.venue,
        postForm.desired_opponent,
        postForm.match_format,
        postForm.desired_conditions,
        postForm.body,
        desiredConditions,
        postBody
      ].join("\n")
    );
    if (contactError) {
      setPostError(contactError);
      setPostSummary([]);
      return;
    }
    const summary = [
      `チーム名: ${postForm.team_name.trim()}`,
      `地域: ${postForm.region.trim()}`,
      `区分: ${schoolLevelLabels[postForm.school_level as Team["school_level"]]}`,
      `種別: ${ballTypeLabels[postForm.ball_type as Team["ball_type"]]}`,
      `試合希望日: ${postForm.match_date}`,
      `時間帯: ${postForm.time_slot.trim()}`,
      `会場: ${postForm.venue.trim()}`,
      `希望する相手チーム: ${postForm.desired_opponent.trim()}`,
      `試合形式: ${postForm.match_format.trim()}`,
      `補足: ${postForm.body.trim()}`
    ];
    if (!supabase) {
      const now = new Date().toISOString();
      const demoPost: MatchPost = {
        id: `demo-post-${Date.now()}`,
        team_id: primaryTeam?.id ?? "demo-team-form",
        owner_id: authUserId,
        match_date: postForm.match_date,
        region: postForm.region.trim(),
        category: postForm.category.trim(),
        desired_conditions: desiredConditions,
        body: postBody,
        status: "approved",
        created_at: now,
        updated_at: now,
        teams: {
          name: postForm.team_name.trim(),
          school_level: postForm.school_level as Team["school_level"],
          ball_type: postForm.ball_type as Team["ball_type"]
        }
      };
      setMyPosts((current) => [demoPost, ...current]);
      setPosts((current) => [demoPost, ...current].sort((a, b) => a.match_date.localeCompare(b.match_date)));
      setPostForm(initialPost);
      setPostSummary(summary);
      setMessage("投稿を公開しました。仮データ版のため実保存はされません。");
      return;
    }
    if (isDevAuth) {
      setLoading(true);
      setMessage("");
      const response = await fetch("/api/dev/match-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team_name: postForm.team_name,
          match_date: postForm.match_date,
          region: postForm.region.trim(),
          category: postForm.category.trim(),
          school_level: postForm.school_level,
          ball_type: postForm.ball_type,
          desired_conditions: desiredConditions,
          body: postBody
        })
      });
      const result = await response.json();
      setLoading(false);
      if (!response.ok) {
        setMessage(result.error ?? "開発確認モードで募集を投稿できませんでした。");
        return;
      }
      setPostForm(initialPost);
      setPostSummary(summary);
      setMessage("投稿を公開しました。開発確認モードでSupabaseに approved として保存しました。");
      await Promise.all([loadMyData(DEV_AUTH_OWNER_ID), loadApprovedPosts()]);
      return;
    }
    setLoading(true);
    setMessage("");
    const { error } = await supabase.from("match_posts").insert({
      match_date: postForm.match_date,
      region: postForm.region.trim(),
      category: postForm.category.trim(),
      desired_conditions: desiredConditions,
      body: postBody,
      team_id: primaryTeam!.id,
      owner_id: authUserId,
      status: "approved"
    });
    setLoading(false);
    if (error) {
      setMessage(friendlyError(error, "募集を投稿できませんでした。"));
      return;
    }
    setPostForm(initialPost);
    setPostSummary(summary);
    setMessage("投稿を公開しました。連絡先は一般公開されません。");
    await Promise.all([loadMyData(authUserId), loadApprovedPosts()]);
  }

  async function reportPost(postId: string) {
    if (isProductionReadOnly) {
      setMessage("通報機能は準備中です。Auth方式と運用方針が確定するまで本番では有効化しません。");
      return;
    }
    if (!authUserId || (supabase && !isDevAuth && !user)) {
      setMessage("通報するにはログインが必要です。");
      return;
    }
    const confirmed = window.confirm("この募集を通報しますか。通報が一定数を超えると自動で非表示対象になります。");
    if (!confirmed) return;
    if (!supabase) {
      setMessage("仮データ版のため通報は実保存されません。");
      return;
    }
    if (isDevAuth) {
      const response = await fetch(`/api/dev/match-posts/${postId}/report`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error ?? "開発確認モードで通報を保存できませんでした。");
        return;
      }
      setMessage(result.message ?? "開発確認モードで通報を保存しました。");
      await Promise.all([loadMyData(DEV_AUTH_OWNER_ID), loadApprovedPosts()]);
      return;
    }
    const { error } = await supabase.from("post_reports").insert({
      post_id: postId,
      reporter_id: authUserId,
      reason: "公開画面からの通報"
    });
    if (error) {
      setMessage(friendlyError(error, "通報を送信できませんでした。"));
      return;
    }
    setMessage("通報を受け付けました。一定数を超えた投稿は自動で非表示対象になります。");
    await loadApprovedPosts();
  }

  async function hideMyPost(postId: string) {
    const confirmed = window.confirm("この募集を非公開にしますか。公開一覧から表示されなくなります。");
    if (!confirmed) return;
    if (!supabase) {
      setMyPosts((current) => current.map((post) => (post.id === postId ? { ...post, status: "hidden" } : post)));
      setPosts((current) => current.filter((post) => post.id !== postId));
      setMessage("仮データ上で募集を非公開にしました。");
      return;
    }
    if (isDevAuth) {
      const response = await fetch(`/api/dev/match-posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "hidden" })
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error ?? "開発確認モードで非公開にできませんでした。");
        return;
      }
      setMessage("募集を非公開にしました。");
      await Promise.all([loadMyData(DEV_AUTH_OWNER_ID), loadApprovedPosts()]);
      return;
    }
    const { error } = await supabase.from("match_posts").update({ status: "hidden" }).eq("id", postId);
    if (error) {
      setMessage(friendlyError(error, "募集を非公開にできませんでした。"));
      return;
    }
    setMessage("募集を非公開にしました。");
    if (authUserId) await Promise.all([loadMyData(authUserId), loadApprovedPosts()]);
  }

  async function deleteMyPost(postId: string) {
    const confirmed = window.confirm("この募集を削除しますか。");
    if (!confirmed) return;
    if (!supabase) {
      setMyPosts((current) => current.filter((post) => post.id !== postId));
      setPosts((current) => current.filter((post) => post.id !== postId));
      setMessage("仮データ上で募集を削除しました。");
      return;
    }
    if (isDevAuth) {
      const response = await fetch(`/api/dev/match-posts/${postId}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error ?? "開発確認モードで削除できませんでした。");
        return;
      }
      setMessage("募集を削除しました。");
      await Promise.all([loadMyData(DEV_AUTH_OWNER_ID), loadApprovedPosts()]);
      return;
    }
    const { error } = await supabase.from("match_posts").delete().eq("id", postId);
    if (error) {
      setMessage(friendlyError(error, "募集を削除できませんでした。"));
      return;
    }
    setMessage("募集を削除しました。");
    if (authUserId) await Promise.all([loadMyData(authUserId), loadApprovedPosts()]);
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    await loadApprovedPosts(filters);
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <strong>Buspo Match</strong>
          <span>{isDevAuth ? "開発確認モード" : isDemo ? "仮データ版" : "中学・高校野球向け 練習試合募集MVP"}</span>
        </div>
        <nav className="nav">
          {isDevAuth && <span className="mode-pill">開発確認モード</span>}
          {isDemo && <span className="mode-pill">仮データ</span>}
          {isAdmin && (
            <Link className="admin-link" href="/admin">
              管理
            </Link>
          )}
          {user ? (
            <button className="button secondary" onClick={signOut}>
              ログアウト
            </button>
          ) : null}
        </nav>
      </header>

      <div className="container">
        <section className="hero">
          <div className="hero-main">
            <h1>野球部の練習試合相手を探す。</h1>
            <p>
              {isProductionReadOnly
                ? "中学・高校の顧問、保護者、チーム代表者が日程・地域・区分で公開中の募集を確認できます。投稿機能は準備中です。"
                : "中学・高校の顧問、保護者、チーム代表者が日程・地域・区分で募集を確認できます。投稿はログイン後に即時公開され、連絡先は一般公開しません。"}
            </p>
            <div className="hero-actions">
              <a className="button" href="#search">
                募集を探す
              </a>
              {isProductionReadOnly ? (
                <a className="button secondary" href="#post-status">
                  投稿機能について
                </a>
              ) : (
                <button className="button secondary" type="button" onClick={() => setShowPostForm(true)}>
                  募集を投稿する
                </button>
              )}
            </div>
          </div>

          <div className="panel">
            <h2>投稿者ログイン</h2>
            {isDevAuth ? (
              <div className="grid">
                <p className="notice warn">
                  開発確認モードです。Supabase標準メールは送信せず、test-data.sql のテストユーザーIDで投稿します。
                </p>
                <Link className="button secondary" href="/admin">
                  管理画面を見る
                </Link>
              </div>
            ) : user ? (
              <div className="grid">
                <p className="notice">ログイン中: {userEmail}</p>
                {!primaryTeam && <p className="notice warn">募集投稿の前にチーム情報を登録してください。</p>}
              </div>
            ) : isDemo ? (
              <div className="grid">
                <p className="notice">
                  仮データ版です。メール認証なしで、顧問・保護者・チーム代表者向けの画面構成を確認できます。
                </p>
                <Link className="button secondary" href="/admin">
                  管理画面を見る
                </Link>
              </div>
            ) : isProductionReadOnly ? (
              <div className="grid">
                <p className="notice warn">
                  投稿者ログインは準備中です。Auth方式が確定するまで、本番では公開一覧・詳細・検索のみ利用できます。
                </p>
              </div>
            ) : (
              <form className="grid" onSubmit={signIn}>
                <div className="field">
                  <label htmlFor="email">メールアドレス</label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    placeholder="coach@example.com"
                  />
                </div>
                <button className="button" disabled={loading}>
                  確認メールを送る
                </button>
              </form>
            )}
          </div>
        </section>

        {message && <p className="notice">{message}</p>}

        <section className="section panel" id="search">
          <div className="section-head">
            <div>
              <h2>募集を探す</h2>
              <p>試合希望日、地域、区分、硬式/軟式で公開中の募集を絞り込めます。</p>
            </div>
          </div>
          <form className="search-form" onSubmit={search}>
            <div className="field">
              <label>試合希望日</label>
              <input
                type="date"
                value={filters.match_date}
                onChange={(event) => setFilters({ ...filters, match_date: event.target.value })}
              />
            </div>
            <div className="field">
              <label>地域</label>
              <select
                value={filters.region}
                onChange={(event) => setFilters({ ...filters, region: event.target.value })}
              >
                <option value="">すべての地域</option>
                {regionOptions.map((region) => (
                  <option value={region} key={region}>{region}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>区分</label>
              <select
                value={filters.school_level}
                onChange={(event) => setFilters({ ...filters, school_level: event.target.value })}
              >
                <option value="">すべての区分</option>
                <option value="junior_high">中学</option>
                <option value="high_school">高校</option>
              </select>
            </div>
            <div className="field">
              <label>硬式/軟式</label>
              <select
                value={filters.ball_type}
                onChange={(event) => setFilters({ ...filters, ball_type: event.target.value })}
              >
                <option value="">すべて</option>
                <option value="hard">硬式</option>
                <option value="rubber">軟式</option>
              </select>
            </div>
            <div className="actions search-actions">
              <button className="button">検索</button>
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  setFilters(emptyFilters);
                  loadApprovedPosts(emptyFilters);
                }}
              >
                条件クリア
              </button>
            </div>
          </form>
        </section>

        <section className="section">
          <h2>公開中の練習試合募集</h2>
          <PostList
            posts={posts}
            emptyMessage={
              hasActiveFilters
                ? "条件に一致する募集はありません。条件を変えて検索してください。"
                : "公開中の募集はまだありません。新しい募集が投稿されるとここに表示されます。"
            }
            onReport={!isProductionReadOnly && authUserId ? reportPost : undefined}
          />
        </section>

        <section className="section cta-band" id="post-status">
          <div>
            <h2>募集を投稿する</h2>
            <p>
              {isProductionReadOnly
                ? "本番環境の投稿機能は準備中です。Auth方式が確定するまでは、公開一覧・詳細・検索のみ提供します。"
                : "ログイン済みユーザーの募集は即時公開されます。本文内の連絡先らしき文字列は投稿前にチェックします。"}
              {isDevAuth ? "開発確認モードではSupabaseにapprovedで保存し、通報制も確認できます。" : isDemo ? "仮データ版では画面上の確認のみです。" : ""}
            </p>
          </div>
          {isProductionReadOnly ? (
            <span className="mode-pill">投稿準備中</span>
          ) : (
            <button className="button" type="button" onClick={() => setShowPostForm((current) => !current)}>
              {showPostForm ? "投稿フォームを閉じる" : "募集を投稿する"}
            </button>
          )}
        </section>

        {isProductionReadOnly && showPostForm ? (
          <section className="section panel">
            <h2>募集投稿</h2>
            <p className="notice warn">
              投稿機能は準備中です。Auth方式、通報運用、連絡導線が確定してから本番で有効化します。
            </p>
          </section>
        ) : authUserId && showPostForm ? (
          <section className="section" id="post-form">
            <form className="panel match-form" onSubmit={createPost}>
              <div className="section-head">
                <div>
                  <h2>練習試合募集を投稿</h2>
                  <p>
                    必要事項を入力すると、公開中の募集として確認できます。
                    {isDevAuth ? "開発確認モードではSupabaseにapprovedで保存します。" : isDemo ? "仮データ版では実保存されません。" : ""}
                  </p>
                </div>
              </div>

              <div className="form-grid">
                <div className="field full-span">
                  <label>チーム名</label>
                  <input
                    value={postForm.team_name}
                    onChange={(event) => setPostForm({ ...postForm, team_name: event.target.value })}
                    required
                    placeholder="例: 青葉高校 野球部、港南中学校 野球部"
                  />
                </div>

                <div className="field">
                  <label>地域</label>
                  <select
                    value={postForm.region}
                    onChange={(event) => setPostForm({ ...postForm, region: event.target.value })}
                    required
                  >
                    <option value="">地域を選択してください</option>
                    {regionOptions.map((region) => (
                      <option value={region} key={region}>{region}</option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label>中学/高校</label>
                  <select
                    value={postForm.school_level}
                    onChange={(event) => {
                      const schoolLevel = event.target.value as "junior_high" | "high_school";
                      setPostForm({
                        ...postForm,
                        school_level: schoolLevel,
                        category: categoryBySchoolLevel[schoolLevel]
                      });
                    }}
                  >
                    <option value="junior_high">中学</option>
                    <option value="high_school">高校</option>
                  </select>
                </div>

                <div className="field">
                  <label>硬式/軟式</label>
                  <select
                    value={postForm.ball_type}
                    onChange={(event) => setPostForm({ ...postForm, ball_type: event.target.value })}
                  >
                    <option value="hard">硬式</option>
                    <option value="rubber">軟式</option>
                  </select>
                </div>

                <div className="field">
                  <label>試合希望日</label>
                  <input
                    type="date"
                    value={postForm.match_date}
                    onChange={(event) => setPostForm({ ...postForm, match_date: event.target.value })}
                    required
                  />
                </div>

                <div className="field">
                  <label>時間帯</label>
                  <input
                    value={postForm.time_slot}
                    onChange={(event) => setPostForm({ ...postForm, time_slot: event.target.value })}
                    required
                    placeholder="例: 午前、13:00開始、終日相談可"
                  />
                </div>

                <div className="field">
                  <label>会場</label>
                  <input
                    value={postForm.venue}
                    onChange={(event) => setPostForm({ ...postForm, venue: event.target.value })}
                    required
                    placeholder="例: 自校グラウンド、相手校希望、市営球場"
                  />
                </div>

                <div className="field">
                  <label>希望する相手チーム</label>
                  <input
                    value={postForm.desired_opponent}
                    onChange={(event) => setPostForm({ ...postForm, desired_opponent: event.target.value })}
                    required
                    placeholder="例: 同程度のチーム、新チーム、1年生中心、B戦可"
                  />
                </div>

                <div className="field">
                  <label>試合形式</label>
                  <input
                    value={postForm.match_format}
                    onChange={(event) => setPostForm({ ...postForm, match_format: event.target.value })}
                    required
                    placeholder="例: 7イニング1試合、ダブルヘッダー、B戦可"
                  />
                </div>

                <div className="field full-span">
                  <label>会場・時間・補足</label>
                  <textarea
                    value={postForm.body}
                    onChange={(event) => setPostForm({ ...postForm, body: event.target.value })}
                    required
                    placeholder="例: 自校グラウンド、13時開始、駐車場あり、雨天時中止"
                  />
                </div>
              </div>

              <p className="notice warn">
                連絡先は一般公開されません。メールアドレス、電話番号、LINE ID、SNS IDらしき文字列を本文に入れると投稿できません。
              </p>

              {postError && <p className="notice error">{postError}</p>}
              {postSummary.length > 0 && (
                <div className="summary-box">
                  <h3>投稿内容の確認要約</h3>
                  <p>投稿は公開中になります。連絡先は一般公開されません。</p>
                  <dl>
                    {postSummary.map((item) => {
                      const [label, ...valueParts] = item.split(": ");
                      return (
                        <div key={item}>
                          <dt>{label}</dt>
                          <dd>{valueParts.join(": ")}</dd>
                        </div>
                      );
                    })}
                  </dl>
                </div>
              )}

              <div className="actions">
                <button className="button" disabled={!canPost || loading}>
                  投稿内容を確認して公開する
                </button>
                <button className="button secondary" type="button" onClick={() => setShowPostForm(false)}>
                  閉じる
                </button>
              </div>
            </form>
          </section>
        ) : !authUserId && showPostForm ? (
          <section className="section panel">
            <h2>募集投稿</h2>
            <p className="notice warn">
              募集を投稿するにはログインが必要です。上のログイン欄からメール認証を行ってください。
            </p>
          </section>
        ) : null}

        {!isProductionReadOnly && authUserId && (
          <section className="section">
            <h2>自分の募集</h2>
            <PostList posts={myPosts} showStatus onHide={hideMyPost} onDelete={deleteMyPost} />
          </section>
        )}
      </div>
    </main>
  );
}

function PostList({
  posts,
  showStatus = false,
  emptyMessage,
  onReport,
  onHide,
  onDelete
}: {
  posts: MatchPost[];
  showStatus?: boolean;
  emptyMessage?: string;
  onReport?: (postId: string) => void;
  onHide?: (postId: string) => void;
  onDelete?: (postId: string) => void;
}) {
  if (!posts.length) {
    return <p className="empty">{emptyMessage ?? (showStatus ? "自分の投稿はまだありません。" : "公開中の募集はまだありません。")}</p>;
  }

  return (
    <div className="post-list">
      {posts.map((post) => (
        <article className="post-card" key={post.id}>
          <header>
            <div>
              <h3>{post.teams?.name ?? "チーム名未設定"}</h3>
              <div className="meta">
                <span className="meta-item">試合希望日 {post.match_date}</span>
                <span className="meta-item">地域 {post.region}</span>
                {post.teams && (
                  <>
                    <span className="meta-item">区分 {schoolLevelLabels[post.teams.school_level]}</span>
                    <span className="meta-item">種別 {ballTypeLabels[post.teams.ball_type]}</span>
                  </>
                )}
                <span className="meta-item contact-private">連絡先非公開</span>
              </div>
            </div>
            {showStatus && <span className={`badge ${post.status}`}>{statusLabels[post.status]}</span>}
            {!showStatus && <span className="badge approved">連絡先非公開</span>}
          </header>
          <p className="body-text">{post.desired_conditions}</p>
          <div className="actions">
            <Link className="button secondary" href={`/posts/${post.id}`}>
              詳細を見る
            </Link>
            {!showStatus && onReport && (
              <button className="button secondary" type="button" onClick={() => onReport(post.id)}>
                通報する
              </button>
            )}
            {showStatus && post.status === "approved" && onHide && (
              <button className="button secondary" type="button" onClick={() => onHide(post.id)}>
                非公開にする
              </button>
            )}
            {showStatus && onDelete && (
              <button className="button danger" type="button" onClick={() => onDelete(post.id)}>
                削除
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
