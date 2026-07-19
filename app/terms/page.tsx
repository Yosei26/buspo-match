import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "利用規約 | Buspo Match",
  description: "Buspo Matchの暫定版利用規約"
};

export default function TermsPage() {
  return (
    <main className="shell">
      <div className="container legal-page">
        <Link className="admin-link" href="/">
          Buspo Matchへ戻る
        </Link>

        <section className="panel legal-content">
          <p className="mode-pill">暫定版</p>
          <h1>利用規約</h1>
          <p>
            この利用規約は、Buspo Matchを安全に試験運用するための暫定的なルールです。内容はサービスの運用状況に応じて更新する場合があります。
          </p>

          <h2>サービスの目的</h2>
          <p>
            Buspo Matchは、中学・高校野球の練習試合募集を探しやすくするためのWebサービスです。投稿者はGoogleログインを利用し、募集情報を投稿できます。
          </p>

          <h2>投稿時の注意</h2>
          <ul>
            <li>投稿内容は、実際に確認できる練習試合募集に限ってください。</li>
            <li>虚偽、誤解を招く内容、第三者を傷つける内容、不適切な表現を投稿しないでください。</li>
            <li>メールアドレス、電話番号、LINE ID、SNS IDなどの連絡先は本文に記載しないでください。</li>
            <li>生徒個人を特定できる情報、個人名、詳細な行動予定などの個人情報を投稿しないでください。</li>
          </ul>

          <h2>管理者による対応</h2>
          <p>
            管理者は、不適切投稿、虚偽投稿、個人情報を含む投稿、サービスの趣旨に合わない投稿を、事前の通知なく非公開化または削除する場合があります。
          </p>

          <h2>連絡先の取り扱い</h2>
          <p>
            Buspo Matchでは、連絡先を一般公開しない方針です。連絡方法は、今後の運用方針が固まり次第、管理者承認制や専用フォームなどを検討します。
          </p>

          <h2>免責</h2>
          <p>
            本サービスは練習試合募集の情報共有を支援するものであり、試合実施、移動、安全管理、施設利用、学校・団体内の承認などを保証するものではありません。
            各チーム・学校・団体の責任で必要な確認を行ってください。
          </p>

          <p className="notice warn">制定日: 2026年7月20日。内容は暫定版です。</p>
        </section>
      </div>
    </main>
  );
}
