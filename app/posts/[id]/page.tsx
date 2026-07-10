"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { demoPosts } from "@/lib/demo-data";
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
  const [message, setMessage] = useState("読み込み中です。");
  const isDemo = !hasSupabaseConfig;

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
        setMessage(friendlyError(error, "投稿が見つからないか、閲覧権限がありません。未承認投稿は投稿者本人または管理者だけが閲覧できます。"));
        return;
      }
      setPost(data as MatchPost);
      setMessage("");
    }
    loadPost();
  }, [params.id]);

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
              連絡先は一般公開していません。問い合わせ導線は、管理者承認後に関係者だけへ開示する設計です。
            </p>
            <div className="actions">
              <Link className="button" href="/">
                トップページへ戻る
              </Link>
            </div>
          </article>
        )}
      </div>
    </main>
  );
}
