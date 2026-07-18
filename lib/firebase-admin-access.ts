import "server-only";

import { getFirebaseAdminAuth } from "@/lib/firebase-admin";

export type FirebaseAdminUser = {
  uid: string;
  email: string;
};

export type FirebaseAdminCheck =
  | { ok: true; user: FirebaseAdminUser }
  | { ok: false; status: number; error: string };

function adminEmails() {
  return new Set(
    (process.env.FIREBASE_ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const [scheme, token] = authorization.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : "";
}

export async function verifyFirebaseAdminRequest(request: Request): Promise<FirebaseAdminCheck> {
  const auth = getFirebaseAdminAuth();
  if (!auth) {
    return { ok: false, status: 500, error: "Firebase Admin SDKのサーバー設定が未設定です。" };
  }

  const token = bearerToken(request);
  if (!token) {
    return { ok: false, status: 401, error: "管理画面にはGoogleログインが必要です。" };
  }

  let decodedToken;
  try {
    decodedToken = await auth.verifyIdToken(token);
  } catch {
    return { ok: false, status: 401, error: "ログイン情報を確認できませんでした。再ログインしてください。" };
  }

  const email = typeof decodedToken.email === "string" ? decodedToken.email.toLowerCase() : "";
  if (!email) {
    return { ok: false, status: 403, error: "Googleアカウントのメールアドレスを確認できません。" };
  }

  if (!adminEmails().has(email)) {
    return { ok: false, status: 403, error: "Firebase管理者として許可されていません。" };
  }

  return { ok: true, user: { uid: decodedToken.uid, email } };
}
