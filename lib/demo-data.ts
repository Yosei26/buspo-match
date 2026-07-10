import type { MatchPost, Team } from "@/lib/types";

export const DEMO_OWNER_ID = "demo-user-a";

const createdAt = "2026-07-08T09:00:00.000Z";

export const demoTeams: Team[] = [
  {
    id: "demo-team-a",
    owner_id: DEMO_OWNER_ID,
    name: "青葉高校 野球部",
    region: "東京都",
    category: "高校野球",
    school_level: "high_school",
    ball_type: "hard",
    created_at: createdAt,
    updated_at: createdAt
  },
  {
    id: "demo-team-b",
    owner_id: "demo-user-b",
    name: "港南中学校 野球部",
    region: "神奈川県",
    category: "中学野球",
    school_level: "junior_high",
    ball_type: "rubber",
    created_at: createdAt,
    updated_at: createdAt
  },
  {
    id: "demo-team-c",
    owner_id: "demo-user-c",
    name: "北丘高校 野球部",
    region: "埼玉県",
    category: "高校野球",
    school_level: "high_school",
    ball_type: "hard",
    created_at: createdAt,
    updated_at: createdAt
  }
];

export const demoPosts: MatchPost[] = [
  {
    id: "demo-post-approved-1",
    team_id: "demo-team-b",
    owner_id: "demo-user-b",
    match_date: "2026-07-18",
    region: "神奈川県",
    category: "中学野球",
    desired_conditions: "軟式、午前開始、同程度のチームを希望します。",
    body: "会場: 港南中学校グラウンド\n時間: 9:00開始予定\n形式: 7イニング、または時間制で相談\n補足: グラウンド確保済みです。審判は両チームで相談して決めたいです。連絡先は公開していません。",
    status: "approved",
    created_at: "2026-07-08T10:00:00.000Z",
    updated_at: "2026-07-08T10:00:00.000Z",
    teams: {
      name: "港南中学校 野球部",
      school_level: "junior_high",
      ball_type: "rubber"
    }
  },
  {
    id: "demo-post-approved-2",
    team_id: "demo-team-c",
    owner_id: "demo-user-c",
    match_date: "2026-07-21",
    region: "埼玉県",
    category: "高校野球",
    desired_conditions: "硬式、午後、遠征可能な高校チームを募集します。",
    body: "会場: 北丘高校第2グラウンド\n時間: 13:00開始予定\n形式: 9イニング想定\n補足: 新チーム中心の練習試合です。試合後に合同練習も可能です。連絡先は一般公開しません。",
    status: "approved",
    created_at: "2026-07-08T11:00:00.000Z",
    updated_at: "2026-07-08T11:00:00.000Z",
    teams: {
      name: "北丘高校 野球部",
      school_level: "high_school",
      ball_type: "hard"
    }
  },
  {
    id: "demo-post-hidden-1",
    team_id: "demo-team-a",
    owner_id: DEMO_OWNER_ID,
    match_date: "2026-07-25",
    region: "東京都",
    category: "高校野球",
    desired_conditions: "硬式、午前、グラウンドを確保しているチームを希望します。",
    body: "会場: 相手校グラウンド希望\n時間: 午前中希望\n形式: 7イニング以上で相談\n補足: 投稿者が非公開にしたサンプルです。公開一覧には表示されません。",
    status: "hidden",
    report_count: 0,
    hidden_reason: "投稿者による非公開",
    created_at: "2026-07-08T12:00:00.000Z",
    updated_at: "2026-07-08T12:00:00.000Z",
    teams: {
      name: "青葉高校 野球部",
      school_level: "high_school",
      ball_type: "hard"
    }
  }
];

export function filterApprovedDemoPosts(filters: { match_date: string; region: string; school_level: string; ball_type: string }) {
  return demoPosts
    .filter((post) => post.status === "approved")
    .filter((post) => post.teams?.school_level !== "club_team")
    .filter((post) => (filters.match_date ? post.match_date === filters.match_date : true))
    .filter((post) => (filters.region ? post.region.includes(filters.region.trim()) : true))
    .filter((post) => (filters.school_level ? post.teams?.school_level === filters.school_level : true))
    .filter((post) => (filters.ball_type ? post.teams?.ball_type === filters.ball_type : true))
    .sort((a, b) => a.match_date.localeCompare(b.match_date));
}
