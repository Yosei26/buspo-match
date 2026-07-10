"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { demoPosts } from "@/lib/demo-data";
import { isDevAuthBypassEnabled } from "@/lib/dev-auth";
import { friendlyError } from "@/lib/messages";
import { hasSupabaseConfig, supabase } from "@/lib/supabase";
import {
  ballTypeLabels,
  MatchPost,
  schoolLevelLabels,
  statusLabels
} from "@/lib/types";

function extractField(text: string, labels: string[]) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  for (const label of labels) {
    const found = lines.find((line) => line.startsWith(`${label}:`) || line.startsWith(`${label}：`));
    if (found) return found.replace(new RegExp(`^${label}[:：]\\s*`), "").trim();
  }
  return "";
}

function valueOrUnset(value: string | null | undefined) {
  return value?.trim() ? value : "未設定";
}

export default function PostDetailPage() {
  const params = useParams<{ id: string }>();
  const [post, setPost] = useState<MatchPost | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [message, setMessage] = useState("読み込み中です。");
  const isDemo = !hasSupabaseConfig;
  const isDevAuth = isDevAuthBypassEnabled();
  const isProductionReadOnly = Boolean(supabase && !isDevAuth && !isDemo);
  const canReport = isDemo || isDevAuth || (!isProductionReadOnly && Boolean(session?.user));

  useEffect(() => {
    if (supabase) {
      supabase.auth.getSession().then(({ data }) => setSession(data.session));
      const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        setSession(nextSession);
      });
      return () => data.subscription.unsubscribe();
    }
  }, []);

  useEffect(() => {
    async function loadPost() {
      if (!supabase) {
        const demoPost = demoPosts.find((item) => item.id === params.id);
        if (!demoPost) {
          setMessage("仮データ内に該当する投稿がありません。");
          return;
        }
        setPost(demoPost);
        setMessage("");
        return;
      }

      const { data, error } = await supabase
        .from("match_posts")
        .select("*, teams(name, school_level, ball_type)")
        .eq("id", params.id)
        .single();

      if (error) {
        setMessage(friendlyError(error, "投稿が見つからないか、閲覧権限がありません。非公開または通報対応中の投稿は一般公開されません。"));
        return;
      }
      setPost(data as MatchPost);
      setMessage("");
    }
    loadPost();
  }, [params.id]);

  async function reportPost() {
    if (!post) return;
    if (isProductionReadOnly) {
      setMessage("通報機能は準備中です。Auth方式と運用方針が確定するまで本番では有効化しません。");
      return;
    }
    if (!isDemo && !isDevAuth && !session?.user) {
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
      const response = await fetch(`/api/dev/match-posts/${post.id}/report`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error ?? "開発確認モードで通報を保存できませんでした。");
        return;
      }
      setMessage(result.message ?? "開発確認モードで通報を保存しました。");
      return;
    }
    const { error } = await supabase.from("post_reports").insert({
      post_id: post.id,
      reporter_id: session!.user.id,
      reason: "詳細画面からの通報"
    });
    if (error) {
      setMessage(friendlyError(error, "通報を送信できませんでした。"));
      return;
    }
    setMessage("通報を受け付けました。一定数を超えた投稿は自動で非表示対象になります。");
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <strong>Buspo Match</strong>
          <span>{isDemo ? "仮データ版 募集詳細" : "募集詳細"}</span>
        </div>
        <Link className="button secondary" href="/">
          一覧へ戻る
        </Link>
      </header>

      <div className="container">
        {message && <p className="notice">{message}</p>}
        {post && (
          <article className="panel detail">
            <div className="actions">
              {isDemo && <span className="mode-pill">仮データ</span>}
              <span className={`badge ${post.status}`}>{statusLabels[post.status]}</span>
              <span className="badge approved">連絡先非公開</span>
            </div>
            <h1>{post.teams?.name ?? "チーム名未設定"}</h1>

            <div className="detail-grid">
              <div className="detail-item">
                <span>試合希望日</span>
                <strong>{post.match_date}</strong>
              </div>
              <div className="detail-item">
                <span>地域</span>
                <strong>{valueOrUnset(post.region)}</strong>
              </div>
              <div className="detail-item">
                <span>区分</span>
                <strong>{post.teams ? schoolLevelLabels[post.teams.school_level] : "未設定"}</strong>
              </div>
              <div className="detail-item">
                <span>硬式/軟式</span>
                <strong>{post.teams ? ballTypeLabels[post.teams.ball_type] : "未設定"}</strong>
              </div>
              <div className="detail-item">
                <span>時間帯</span>
                <strong>{valueOrUnset(extractField(post.body, ["時間帯", "時間"]))}</strong>
              </div>
              <div className="detail-item">
                <span>会場</span>
                <strong>{valueOrUnset(extractField(post.body, ["会場"]))}</strong>
              </div>
              <div className="detail-item">
                <span>希望する相手チーム</span>
                <strong>{valueOrUnset(extractField(post.desired_conditions, ["希望する相手チーム"]))}</strong>
              </div>
              <div className="detail-item">
                <span>試合形式</span>
                <strong>{valueOrUnset(extractField(post.desired_conditions, ["試合形式", "形式"]))}</strong>
              </div>
            </div>

            <section className="detail-section">
              <h2>補足</h2>
              <p className="body-text">{valueOrUnset(extractField(post.body, ["補足"]) || post.body)}</p>
            </section>

            <section className="detail-section">
              <h2>募集内容の原文</h2>
              <p className="body-text">{valueOrUnset(`${post.desired_conditions}\n${post.body}`)}</p>
            </section>

            <p className="notice warn">
              {isProductionReadOnly
                ? "連絡先は一般公開していません。通報機能はAuth方式が確定するまで準備中です。"
                : "連絡先は一般公開していません。投稿本文に連絡先らしき情報がある場合は通報してください。"}
            </p>
            <div className="actions">
              <Link className="button" href="/">
                トップページへ戻る
              </Link>
              {canReport ? (
                <button className="button secondary" type="button" onClick={reportPost}>
                  通報する
                </button>
              ) : null}
            </div>
          </article>
        )}
      </div>
    </main>
  );
}
