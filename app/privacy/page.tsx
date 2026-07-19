import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "プライバシーポリシー | Buspo Match",
  description: "Buspo Matchの暫定版プライバシーポリシー"
};

export default function PrivacyPage() {
  return (
    <main className="shell">
      <div className="container legal-page">
        <Link className="admin-link" href="/">
          Buspo Matchへ戻る
        </Link>

        <section className="panel legal-content">
          <p className="mode-pill">暫定版</p>
          <h1>プライバシーポリシー</h1>
          <p>
            Buspo Matchは、中学・高校野球の練習試合募集を扱う性質上、個人情報をできるだけ少なくする方針で運用します。
            このページは公開運用に向けた暫定版です。
          </p>

          <h2>取得する情報</h2>
          <ul>
            <li>Googleログインにより取得されるユーザーID、表示名、メールアドレス。</li>
            <li>投稿者が入力するチーム名、地域、区分、硬式/軟式、試合希望日、時間帯、会場、募集条件、補足。</li>
            <li>通報や管理操作に必要な投稿ID、ユーザーID、操作日時などの運用情報。</li>
          </ul>

          <h2>利用目的</h2>
          <ul>
            <li>練習試合募集の掲載、検索、投稿者本人による非公開化・削除のため。</li>
            <li>不適切投稿、虚偽投稿、個人情報投稿への対応のため。</li>
            <li>サービスの安全な運用、改善、障害調査のため。</li>
          </ul>

          <h2>連絡先は一般公開しません</h2>
          <p>
            投稿本文にメールアドレス、電話番号、LINE ID、SNS IDなどの連絡先を記載しないでください。
            サービス側でも、連絡先らしき文字列を検出した場合は投稿をブロックする方針です。
            募集への問い合わせは、投稿者の連絡先を直接表示せず、管理者確認を経由するフォームで扱います。
          </p>

          <h2>第三者サービス</h2>
          <p>
            Buspo Matchは、Firebase Authentication、Cloud Firestore、Vercelなどの外部サービスを利用します。
            Googleログインを利用するため、Googleアカウントに関する情報はGoogleの規約やポリシーにも従って扱われます。
          </p>

          <h2>管理者対応</h2>
          <p>
            管理者は、不適切投稿、虚偽投稿、個人情報を含む投稿を非公開化または削除する場合があります。
            必要に応じて、通報内容、問い合わせ内容、投稿履歴を確認することがあります。
          </p>

          <p className="notice warn">制定日: 2026年7月20日。内容は暫定版です。</p>
        </section>
      </div>
    </main>
  );
}
