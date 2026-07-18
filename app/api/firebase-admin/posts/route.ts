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

  const snapshot = await db.collection("matchPosts").where("status", "in", ["reported", "hidden"]).get();
  const posts = snapshot.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        teamName: typeof data.teamName === "string" ? data.teamName : "チーム名未設定",
        region: typeof data.region === "string" ? data.region : "地域未設定",
        schoolLevel: typeof data.schoolLevel === "string" ? data.schoolLevel : "high_school",
        ballType: typeof data.ballType === "string" ? data.ballType : "hard",
        matchDate: typeof data.matchDate === "string" ? data.matchDate : "",
        timeSlot: typeof data.timeSlot === "string" ? data.timeSlot : "",
        venue: typeof data.venue === "string" ? data.venue : "",
        opponentPreference: typeof data.opponentPreference === "string" ? data.opponentPreference : "",
        gameFormat: typeof data.gameFormat === "string" ? data.gameFormat : "",
        notes: typeof data.notes === "string" ? data.notes : "",
        status: typeof data.status === "string" ? data.status : "hidden",
        ownerUid: typeof data.ownerUid === "string" ? data.ownerUid : "",
        ownerEmail: typeof data.ownerEmail === "string" ? data.ownerEmail : "",
        reportCount: typeof data.reportCount === "number" ? data.reportCount : 0,
        createdAt: timestampToIso(data.createdAt),
        updatedAt: timestampToIso(data.updatedAt)
      };
    })
    .sort((a, b) => {
      const aTime = a.updatedAt ?? a.createdAt ?? "";
      const bTime = b.updatedAt ?? b.createdAt ?? "";
      return bTime.localeCompare(aTime);
    });

  return NextResponse.json({ posts });
}
