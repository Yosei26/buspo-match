import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdminAuth, getFirebaseAdminDb } from "@/lib/firebase-admin";

const DEFAULT_REPORT_THRESHOLD = 3;

function reportThreshold() {
  const value = Number(process.env.REPORT_THRESHOLD);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_REPORT_THRESHOLD;
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const [scheme, token] = authorization.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : "";
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = getFirebaseAdminAuth();
  const db = getFirebaseAdminDb();
  if (!auth || !db) {
    return NextResponse.json({ error: "Firebase Admin SDKのサーバー設定が未設定です。" }, { status: 500 });
  }

  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "通報にはGoogleログインが必要です。" }, { status: 401 });
  }

  let decodedToken;
  try {
    decodedToken = await auth.verifyIdToken(token);
  } catch {
    return NextResponse.json({ error: "ログイン情報を確認できませんでした。再ログインしてください。" }, { status: 401 });
  }

  const { id } = await params;
  const reporterUid = decodedToken.uid;
  const reporterEmail = typeof decodedToken.email === "string" ? decodedToken.email : null;
  const postRef = db.collection("matchPosts").doc(id);
  const reportRef = db.collection("postReports").doc(`${id}_${reporterUid}`);
  const threshold = reportThreshold();

  try {
    const result = await db.runTransaction(async (transaction) => {
      const [postSnapshot, reportSnapshot] = await Promise.all([transaction.get(postRef), transaction.get(reportRef)]);
      if (!postSnapshot.exists) {
        return { status: 404, body: { error: "通報対象の投稿が見つかりません。" } };
      }

      const post = postSnapshot.data() ?? {};
      if (post.status !== "approved") {
        return { status: 400, body: { error: "公開中の投稿だけ通報できます。" } };
      }
      if (post.ownerUid === reporterUid) {
        return { status: 400, body: { error: "自分の投稿は通報できません。" } };
      }
      if (reportSnapshot.exists) {
        return { status: 409, body: { error: "この投稿はすでに通報済みです。" } };
      }

      const nextReportCount = (typeof post.reportCount === "number" ? post.reportCount : 0) + 1;
      const nextStatus = nextReportCount >= threshold ? "reported" : "approved";

      transaction.create(reportRef, {
        postId: id,
        reporterUid,
        reporterEmail,
        createdAt: FieldValue.serverTimestamp()
      });
      transaction.update(postRef, {
        reportCount: nextReportCount,
        status: nextStatus,
        updatedAt: FieldValue.serverTimestamp()
      });

      return {
        status: 200,
        body: {
          message: nextStatus === "reported" ? "通報を受け付けました。通報件数が基準に達したため非表示対象になりました。" : "通報を受け付けました。",
          reportCount: nextReportCount,
          status: nextStatus
        }
      };
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "不明なエラー";
    return NextResponse.json({ error: `通報を保存できませんでした: ${detail}` }, { status: 500 });
  }
}
