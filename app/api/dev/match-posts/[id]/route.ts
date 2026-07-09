import { NextRequest, NextResponse } from "next/server";
import { isDevAuthBypassEnabled } from "@/lib/dev-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const postSelect = "*, teams(name, school_level, ball_type)";

function getAdminClient() {
  if (!isDevAuthBypassEnabled()) return null;
  return getSupabaseAdmin();
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "開発確認モード、またはSUPABASE_SERVICE_ROLE_KEYが未設定です。" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  if (!["approved", "rejected"].includes(body.status)) {
    return NextResponse.json({ error: "指定できるステータスは approved または rejected です。" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("match_posts")
    .update({ status: body.status })
    .eq("id", id)
    .select(postSelect)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ post: data });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "開発確認モード、またはSUPABASE_SERVICE_ROLE_KEYが未設定です。" }, { status: 403 });
  }

  const { id } = await params;
  const { error } = await admin.from("match_posts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
