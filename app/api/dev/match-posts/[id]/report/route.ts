import { NextResponse } from "next/server";
import { isDevAuthBypassEnabled } from "@/lib/dev-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isDevAuthBypassEnabled()) {
    return NextResponse.json({ error: "開発確認モードが無効です。" }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEYが未設定です。" }, { status: 403 });
  }

  const { id } = await params;
  const { error: reportError } = await admin.from("post_reports").insert({
    post_id: id,
    reporter_id: null,
    reason: "開発確認モードからの通報"
  });

  if (reportError) {
    return NextResponse.json({ error: reportError.message }, { status: 500 });
  }

  const { data, error } = await admin
    .from("match_posts")
    .select("status, report_count")
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const count = data?.report_count ?? 0;
  const status = data?.status ?? "approved";
  return NextResponse.json({
    message: `開発確認モードで通報を保存しました。通報件数: ${count}、ステータス: ${status}`,
    report_count: count,
    status
  });
}
