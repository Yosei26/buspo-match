const contactPatterns = [
  {
    label: "メールアドレス",
    pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
  },
  {
    label: "電話番号",
    pattern: /(?:0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4})|(?:\d{2,4}[-\s]\d{2,4}[-\s]\d{3,4})/
  },
  {
    label: "LINE ID",
    pattern: /\bline\s*(?:id)?\s*[:：]?\s*[@A-Za-z0-9._-]{3,}/i
  },
  {
    label: "SNS ID",
    pattern: /(?:(?:Instagram|Twitter|TikTok|Facebook|SNS)\s*(?:ID|アカウント)?|X\s*(?:ID|アカウント))\s*[:：]\s*[@A-Za-z0-9._-]{3,}|@[A-Za-z0-9_]{3,}/i
  }
];

export function detectContactInfo(text: string) {
  return contactPatterns.filter(({ pattern }) => pattern.test(text)).map(({ label }) => label);
}

export function contactInfoError(text: string) {
  const found = Array.from(new Set(detectContactInfo(text)));
  if (!found.length) return "";
  return `投稿本文に${found.join("、")}と思われる文字列が含まれています。連絡先は一般公開しない運用のため、該当箇所を削除してください。`;
}
