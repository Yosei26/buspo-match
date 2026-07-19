import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdminAuth, getFirebaseAdminDb } from "@/lib/firebase-admin";
import { contactInfoError } from "@/lib/safety";
import { notifyAdminsOfNewInquiry } from "@/lib/admin-notification";

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
    return NextResponse.json({ error: "問い合わせにはGoogleログインが必要です。" }, { status: 401 });
  }

  let decodedToken;
  try {
    decodedToken = await auth.verifyIdToken(token);
  } catch {
    return NextResponse.json({ error: "ログイン情報を確認できませんでした。再ログインしてください。" }, { status: 401 });
  }

  const senderUid = decodedToken.uid;
  const senderEmail = typeof decodedToken.email === "string" ? decodedToken.email : "";
  if (!senderEmail) {
    return NextResponse.json({ error: "Googleアカウントのメールアドレスを確認できませんでした。" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "問い合わせ本文を入力してください。" }, { status: 400 });
  }

  const blocked = contactInfoError(message);
  if (blocked) {
    return NextResponse.json({ error: blocked }, { status: 400 });
  }

  const { id } = await params;
  const postSnapshot = await db.collection("matchPosts").doc(id).get();
  if (!postSnapshot.exists) {
    return NextResponse.json({ error: "問い合わせ対象の募集が見つかりません。" }, { status: 404 });
  }

  const post = postSnapshot.data() ?? {};
  if (post.status !== "approved") {
    return NextResponse.json({ error: "公開中の募集にだけ問い合わせできます。" }, { status: 400 });
  }
  if (post.ownerUid === senderUid) {
    return NextResponse.json({ error: "自分の募集には問い合わせできません。" }, { status: 400 });
  }

  const postTitle = typeof post.teamName === "string" ? post.teamName : "チーム名未設定";
  const postOwnerUid = typeof post.ownerUid === "string" ? post.ownerUid : "";
  const postOwnerEmail = typeof post.ownerEmail === "string" ? post.ownerEmail : "";
  const inquiryRef = await db.collection("postInquiries").add({
    postId: id,
    postTitle,
    postOwnerUid,
    postOwnerEmail,
    senderUid,
    senderEmail,
    message,
    status: "new",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });

  await notifyAdminsOfNewInquiry({
    inquiryId: inquiryRef.id,
    postId: id,
    postTitle,
    postOwnerEmail,
    senderEmail,
    message
  });

  return NextResponse.json({
    ok: true,
    message: "問い合わせを送信しました。管理者が内容を確認します。"
  });
}
