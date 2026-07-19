import { NextResponse } from "next/server";
import { getFirebaseAdminDb } from "@/lib/firebase-admin";
import { verifyFirebaseAdminRequest } from "@/lib/firebase-admin-access";

function timestampToIso(value: unknown) {
  return value && typeof value === "object" && "toDate" in value
    ? (value as { toDate: () => Date }).toDate().toISOString()
    : null;
}

export async function GET(request: Request) {
  const admin = await verifyFirebaseAdminRequest(request);
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const db = getFirebaseAdminDb();
  if (!db) {
    return NextResponse.json({ error: "Firebase Admin SDKのサーバー設定が未設定です。" }, { status: 500 });
  }

  const snapshot = await db.collection("postInquiries").get();
  const inquiries = snapshot.docs
    .map((doc) => {
      const data = doc.data();
      const status = typeof data.status === "string" && ["new", "reviewed", "closed"].includes(data.status) ? data.status : "new";
      return {
        id: doc.id,
        postId: typeof data.postId === "string" ? data.postId : "",
        postTitle: typeof data.postTitle === "string" ? data.postTitle : "募集名未設定",
        postOwnerUid: typeof data.postOwnerUid === "string" ? data.postOwnerUid : "",
        postOwnerEmail: typeof data.postOwnerEmail === "string" ? data.postOwnerEmail : "",
        senderUid: typeof data.senderUid === "string" ? data.senderUid : "",
        senderEmail: typeof data.senderEmail === "string" ? data.senderEmail : "",
        message: typeof data.message === "string" ? data.message : "",
        status,
        createdAt: timestampToIso(data.createdAt),
        updatedAt: timestampToIso(data.updatedAt)
      };
    })
    .sort((a, b) => {
      const aTime = a.updatedAt ?? a.createdAt ?? "";
      const bTime = b.updatedAt ?? b.createdAt ?? "";
      return bTime.localeCompare(aTime);
    });

  return NextResponse.json({ inquiries });
}
