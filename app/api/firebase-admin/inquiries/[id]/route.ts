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
  if (!["new", "reviewed", "closed"].includes(body.status)) {
    return NextResponse.json({ error: "指定できるステータスは new / reviewed / closed です。" }, { status: 400 });
  }

  const { id } = await params;
  await db.collection("postInquiries").doc(id).update({
    status: body.status,
    updatedAt: FieldValue.serverTimestamp()
  });

  return NextResponse.json({ ok: true, status: body.status });
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
