export const DEV_AUTH_OWNER_ID = "11111111-1111-4111-8111-111111111111";
export const DEV_AUTH_TEAM_ID = "22222222-2222-4222-8222-222222222222";

export function isDevAuthBypassEnabled() {
  return (
    process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === "true" &&
    process.env.NODE_ENV === "development" &&
    process.env.VERCEL !== "1"
  );
}
