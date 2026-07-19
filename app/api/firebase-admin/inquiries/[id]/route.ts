import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdminDb } from "@/lib/firebase-admin";
import { verifyFirebaseAdminRequest } from "@/lib/firebase-admin-access";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyFirebaseAdminRequest(request);
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const db = getFirebaseAdminDb();
  if (!db) {
    return NextResponse.json({ error: "Firebase Admin SDKのサーバー設定が未設定です。" }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp()
  };

  if ("status" in body) {
    if (!["new", "reviewed", "closed"].includes(body.status)) {
      return NextResponse.json({ error: "指定できるステータスは new / reviewed / closed です。" }, { status: 400 });
    }
    updates.status = body.status;
  }

  if ("adminNote" in body) {
    if (typeof body.adminNote !== "string") {
      return NextResponse.json({ error: "管理者メモは文字列で指定してください。" }, { status: 400 });
    }
    if (body.adminNote.length > 4000) {
      return NextResponse.json({ error: "管理者メモは4000文字以内で入力してください。" }, { status: 400 });
    }
    updates.adminNote = body.adminNote.trim();
  }

  if (!("status" in updates) && !("adminNote" in updates)) {
    return NextResponse.json({ error: "更新対象を指定してください。" }, { status: 400 });
  }

  const { id } = await params;
  await db.collection("postInquiries").doc(id).update(updates);

  return NextResponse.json({
    ok: true,
    status: updates.status,
    adminNote: updates.adminNote
  });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyFirebaseAdminRequest(request);
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const db = getFirebaseAdminDb();
  if (!db) {
    return NextResponse.json({ error: "Firebase Admin SDKのサーバー設定が未設定です。" }, { status: 500 });
  }

  const { id } = await params;
  await db.collection("postInquiries").doc(id).delete();

  return NextResponse.json({ ok: true });
}
