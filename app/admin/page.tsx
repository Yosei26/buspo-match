"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { demoPosts } from "@/lib/demo-data";
import { isDevAuthBypassEnabled } from "@/lib/dev-auth";
import { hasSupabaseConfig, supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/messages";
import { MatchPost, statusLabels } from "@/lib/types";

export default function AdminPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [posts, setPosts] = useState<MatchPost[]>([]);
  const [message, setMessage] = useState("読み込み中です。");
  const isDemo = !hasSupabaseConfig;
  const isDevAuth = isDevAuthBypassEnabled();
  const isAdmin = session?.user.app_metadata?.role === "admin" || isDemo || isDevAuth;

  useEffect(() => {
    if (!supabase) {
      setAuthChecked(true);
      setPosts(demoPosts);
      setMessage("仮データ版の管理画面です。非公開化・却下・削除は画面上だけの確認で、実保存はされません。");
      return;
    }
    if (isDevAuth) {
      setAuthChecked(true);
      setMessage("開発確認モードの管理画面です。Supabase標準メールを使わず、事後モデレーションを確認できます。");
      loadPosts();
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthChecked(true);
      if (!data.session) setMessage("管理画面を使うには、管理者アカウントでログインしてください。");
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthChecked(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!authChecked) return;
    if (isDemo) return;
    if (isDevAuth) return;
    if (!session) {
      setPosts([]);
      setMessage("管理画面を使うには、管理者アカウントでログインしてください。");
      return;
    }
    if (!isAdmin) {
      setPosts([]);
      setMessage("権限がありません。このページは管理者だけが非公開化・却下・削除できます。");
      return;
    }
    loadPosts();
  }, [authChecked, session?.user.id, isAdmin]);

  async function loadPosts() {
    if (!supabase) {
      setPosts(demoPosts);
      setMessage("仮データ版の管理画面です。");
      return;
    }
    if (isDevAuth) {
      const response = await fetch("/api/dev/match-posts?scope=admin");
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error ?? "開発確認モードの投稿を読み込めませんでした。");
        return;
      }
      setPosts((result.posts ?? []) as MatchPost[]);
      setMessage("開発確認モードです。非公開化・却下はSupabaseに保存されます。");
      return;
    }
    const { data, error } = await supabase
      .from("match_posts")
      .select("*, teams(name, school_level, ball_type)")
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(friendlyError(error, "管理対象の投稿を読み込めませんでした。"));
      return;
    }
    setPosts((data ?? []) as MatchPost[]);
    setMessage("");
  }

  async function setStatus(id: string, status: "approved" | "rejected" | "hidden") {
    if (!isAdmin) {
      setMessage("権限がありません。非公開化・却下は管理者のみ実行できます。");
      return;
    }
    if (!supabase) {
      setPosts((current) => current.map((post) => (post.id === id ? { ...post, status } : post)));
      setMessage(status === "approved" ? "仮データ上で投稿を公開中に戻しました。" : status === "hidden" ? "仮データ上で投稿を非公開にしました。" : "仮データ上で投稿を却下しました。");
      return;
    }
    if (isDevAuth) {
      const response = await fetch(`/api/dev/match-posts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error ?? "開発確認モードで投稿ステータスを変更できませんでした。");
        return;
      }
      setMessage(status === "approved" ? "投稿を公開中に戻しました。" : status === "hidden" ? "投稿を非公開にしました。" : "投稿を却下しました。");
      await loadPosts();
      return;
    }
    const { error } = await supabase.from("match_posts").update({ status }).eq("id", id);
    if (error) {
      setMessage(friendlyError(error, "投稿ステータスを変更できませんでした。"));
      return;
    }
    setMessage(status === "approved" ? "投稿を公開中に戻しました。" : status === "hidden" ? "投稿を非公開にしました。" : "投稿を却下しました。");
    await loadPosts();
  }

  async function removePost(id: string) {
    if (!isAdmin) {
      setMessage("権限がありません。削除は管理者のみ実行できます。");
      return;
    }
    const confirmed = window.confirm("この投稿を削除しますか。");
    if (!confirmed) return;
    if (!supabase) {
      setPosts((current) => current.filter((post) => post.id !== id));
      setMessage("仮データ上で投稿を削除しました。");
      return;
    }
    if (isDevAuth) {
      const response = await fetch(`/api/dev/match-posts/${id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error ?? "開発確認モードで投稿を削除できませんでした。");
        return;
      }
      setMessage("投稿を削除しました。");
      await loadPosts();
      return;
    }
    const { error } = await supabase.from("match_posts").delete().eq("id", id);
    if (error) {
      setMessage(friendlyError(error, "投稿を削除できませんでした。"));
      return;
    }
    setMessage("投稿を削除しました。");
    await loadPosts();
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <strong>Buspo Match</strong>
          <span>{isDevAuth ? "開発確認モード 管理画面" : isDemo ? "仮データ版 管理画面" : "管理画面"}</span>
        </div>
        <Link className="button secondary" href="/">
          トップへ
        </Link>
      </header>

      <div className="container">
        {isDevAuth && <p className="notice warn">開発確認モードです。Supabase標準メールは送信していません。</p>}
        {authChecked && !session && !isDevAuth && <p className="notice warn">管理者アカウントでログインしてください。</p>}
        {authChecked && session && !isAdmin && !isDevAuth && (
          <p className="notice warn">権限がありません。このページは管理者のみ操作できます。</p>
        )}
        {message && <p className={isAdmin ? "notice" : "notice warn"}>{message}</p>}

        {isAdmin && (
          <section className="section">
            <div className="section-head">
              <div>
                <h1>投稿モデレーション</h1>
                <p>投稿は原則即時公開です。通報、個人情報、不適切表現を事後的に確認し、必要に応じて非公開化・削除します。</p>
              </div>
            </div>
            <div className="status-summary">
              <span className="badge pending">承認待ち {posts.filter((post) => post.status === "pending").length}</span>
              <span className="badge approved">公開中 {posts.filter((post) => post.status === "approved").length}</span>
              <span className="badge reported">通報対応中 {posts.filter((post) => post.status === "reported").length}</span>
              <span className="badge hidden">非公開 {posts.filter((post) => post.status === "hidden").length}</span>
              <span className="badge rejected">却下 {posts.filter((post) => post.status === "rejected").length}</span>
            </div>
            <div className="post-list">
              {posts.map((post) => (
                <article className="post-card" key={post.id}>
                  <header>
                    <div>
                      <h3>{post.teams?.name ?? "チーム名未設定"}</h3>
                      <div className="meta">
                        <span className="meta-item">試合希望日 {post.match_date}</span>
                        <span className="meta-item">地域 {post.region}</span>
                        <span className="meta-item">カテゴリ {post.category}</span>
                      </div>
                    </div>
                    <span className={`badge ${post.status}`}>{statusLabels[post.status]}</span>
                  </header>
                  <p className="body-text">{post.desired_conditions}</p>
                  <p className="body-text">{post.body}</p>
                  <p className="body-text">通報件数: {post.report_count ?? 0}</p>
                  <div className="actions">
                    {post.status === "pending" && (
                      <button className="button" onClick={() => setStatus(post.id, "approved")}>
                        公開する
                      </button>
                    )}
                    {post.status !== "hidden" && (
                      <button className="button secondary" onClick={() => setStatus(post.id, "hidden")}>
                        非公開にする
                      </button>
                    )}
                    {post.status !== "approved" && (
                      <button className="button secondary" onClick={() => setStatus(post.id, "approved")}>
                        公開中に戻す
                      </button>
                    )}
                    <button className="button secondary" onClick={() => setStatus(post.id, "rejected")}>
                      却下する
                    </button>
                    <button className="button danger" onClick={() => removePost(post.id)}>
                      削除
                    </button>
                    <Link className="button secondary" href={`/posts/${post.id}`}>
                      詳細
                    </Link>
                  </div>
                </article>
              ))}
              {!posts.length && <p className="empty">投稿はありません。</p>}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
