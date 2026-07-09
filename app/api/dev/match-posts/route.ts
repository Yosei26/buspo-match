import { NextRequest, NextResponse } from "next/server";
import { DEV_AUTH_OWNER_ID, DEV_AUTH_TEAM_ID, isDevAuthBypassEnabled } from "@/lib/dev-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { BallType, SchoolLevel } from "@/lib/types";

const postSelect = "*, teams(name, school_level, ball_type)";

function unavailable(message = "開発確認モードが無効です。") {
  return NextResponse.json({ error: message }, { status: 403 });
}

function getAdminClient() {
  if (!isDevAuthBypassEnabled()) return null;
  return getSupabaseAdmin();
}

export async function GET(request: NextRequest) {
  const admin = getAdminClient();
  if (!admin) return unavailable("開発確認モード、またはSUPABASE_SERVICE_ROLE_KEYが未設定です。");

  const scope = request.nextUrl.searchParams.get("scope");
  let query = admin.from("match_posts").select(postSelect).order("created_at", { ascending: false });
  if (scope === "owner") query = query.eq("owner_id", DEV_AUTH_OWNER_ID);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ posts: data ?? [] });
}

export async function POST(request: NextRequest) {
  const admin = getAdminClient();
  if (!admin) return unavailable("開発確認モード、またはSUPABASE_SERVICE_ROLE_KEYが未設定です。");

  const body = await request.json();
  const required = ["team_name", "match_date", "region", "category", "desired_conditions", "body"];
  const missing = required.filter((key) => !String(body[key] ?? "").trim());
  if (missing.length) {
    return NextResponse.json({ error: `未入力の項目があります: ${missing.join(", ")}` }, { status: 400 });
  }

  const schoolLevel = body.school_level as SchoolLevel;
  const ballType = body.ball_type as BallType;
  if (!["junior_high", "high_school", "club_team"].includes(schoolLevel)) {
    return NextResponse.json({ error: "区分が不正です。" }, { status: 400 });
  }
  if (!["rubber", "hard"].includes(ballType)) {
    return NextResponse.json({ error: "硬式/軟式が不正です。" }, { status: 400 });
  }

  const { error: teamError } = await admin.from("teams").upsert(
    {
      id: DEV_AUTH_TEAM_ID,
      owner_id: DEV_AUTH_OWNER_ID,
      name: String(body.team_name).trim(),
      region: String(body.region).trim(),
      category: String(body.category).trim(),
      school_level: schoolLevel,
      ball_type: ballType
    },
    { onConflict: "id" }
  );
  if (teamError) return NextResponse.json({ error: teamError.message }, { status: 500 });

  const { data, error } = await admin
    .from("match_posts")
    .insert({
      team_id: DEV_AUTH_TEAM_ID,
      owner_id: DEV_AUTH_OWNER_ID,
      match_date: String(body.match_date),
      region: String(body.region).trim(),
      category: String(body.category).trim(),
      desired_conditions: String(body.desired_conditions).trim(),
      body: String(body.body).trim(),
      status: "pending"
    })
    .select(postSelect)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ post: data });
}
