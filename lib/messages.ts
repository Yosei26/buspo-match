type SupabaseLikeError = {
  message?: string;
  code?: string;
  details?: string;
};

export function friendlyError(error: SupabaseLikeError, fallback = "処理に失敗しました。時間をおいて再度お試しください。") {
  const text = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();

  if (error.code === "42501" || text.includes("row-level security") || text.includes("permission denied")) {
    return "権限がないため操作できません。ログイン状態、投稿者本人かどうか、管理者権限の設定を確認してください。";
  }

  if (text.includes("jwt") || text.includes("not authenticated") || text.includes("auth")) {
    return "ログイン状態を確認してください。ログアウト後に再ログインすると解決する場合があります。";
  }

  if (text.includes("duplicate") || error.code === "23505") {
    return "同じ内容がすでに登録されています。既存の登録内容を確認してください。";
  }

  if (text.includes("violates check constraint") || error.code === "23514") {
    return "入力内容が登録条件を満たしていません。文字数や選択項目を確認してください。";
  }

  return error.message ? `${fallback} ${error.message}` : fallback;
}

export function validateRequired(fields: Array<[label: string, value: string]>) {
  const missing = fields.filter(([, value]) => !value.trim()).map(([label]) => label);
  return missing.length ? `${missing.join("、")}を入力してください。` : "";
}
