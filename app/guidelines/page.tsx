import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "注意事項 | Buspo Match",
  description: "Buspo Matchを安全に使うための注意事項"
};

export default function GuidelinesPage() {
  return (
    <main className="shell">
      <div className="container legal-page">
        <Link className="admin-link" href="/">
          Buspo Matchへ戻る
        </Link>

        <section className="panel legal-content">
          <p className="mode-pill">暫定版</p>
          <h1>注意事項</h1>
          <p>
            Buspo Matchは、中学・高校野球の練習試合募集を安全に共有するためのサービスです。
            学校関係者、顧問、保護者、チーム代表者が利用する前提で、以下を守ってください。
          </p>

          <h2>投稿前に確認すること</h2>
          <ul>
            <li>学校、部活動、団体内で必要な確認を行ってください。</li>
            <li>会場、時間、移動、雨天時対応、安全管理は各チームで確認してください。</li>
            <li>募集内容は中学・高校野球の練習試合に関係する内容に限ってください。</li>
          </ul>

          <h2>投稿してはいけない内容</h2>
          <ul>
            <li>メールアドレス、電話番号、LINE ID、SNS IDなどの連絡先。</li>
            <li>生徒の個人名、顔写真、住所、詳細な行動予定など、個人を特定できる情報。</li>
            <li>虚偽の募集、なりすまし、誹謗中傷、攻撃的な表現。</li>
            <li>営利目的、勧誘、野球の練習試合募集と関係の薄い内容。</li>
          </ul>

          <h2>通報と削除</h2>
          <p>
            不適切と思われる投稿は通報できます。通報が一定数に達した投稿は自動的に非公開対象になる場合があります。
            管理者は、不適切投稿、虚偽投稿、個人情報投稿を確認し、必要に応じて非公開化または削除します。
          </p>

          <h2>Googleログイン</h2>
          <p>
            投稿、通報、投稿者本人による非公開化・削除にはGoogleログインを利用します。
            未ログインでも、公開中の募集一覧は閲覧できます。
          </p>

          <h2 id="contact">問い合わせ導線</h2>
          <p>
            問い合わせフォームは準備中です。正式な問い合わせ先を公開するまでは、連絡先や個人情報を投稿本文に記載しないでください。
            運用開始後は、管理者が確認できる専用フォームまたは承認制の連絡導線を設ける予定です。
          </p>

          <p className="notice warn">この注意事項は暫定版です。運用状況に応じて更新します。</p>
        </section>
      </div>
    </main>
  );
}
