export type SchoolLevel = "junior_high" | "high_school" | "club_team";
export type BallType = "rubber" | "hard";
export type PostStatus = "pending" | "approved" | "rejected" | "reported" | "hidden";

export type Team = {
  id: string;
  owner_id: string;
  name: string;
  region: string;
  category: string;
  school_level: SchoolLevel;
  ball_type: BallType;
  created_at: string;
  updated_at: string;
};

export type MatchPost = {
  id: string;
  team_id: string;
  owner_id: string;
  match_date: string;
  region: string;
  category: string;
  desired_conditions: string;
  body: string;
  status: PostStatus;
  report_count?: number;
  hidden_reason?: string | null;
  created_at: string;
  updated_at: string;
  teams?: Pick<Team, "name" | "school_level" | "ball_type"> | null;
};

export const schoolLevelLabels: Record<SchoolLevel, string> = {
  junior_high: "中学",
  high_school: "高校",
  club_team: "クラブチーム"
};

export const ballTypeLabels: Record<BallType, string> = {
  rubber: "軟式",
  hard: "硬式"
};

export const statusLabels: Record<PostStatus, string> = {
  pending: "承認待ち",
  approved: "公開中",
  rejected: "却下",
  reported: "通報対応中",
  hidden: "非公開"
};
