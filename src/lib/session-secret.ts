/**
 * Single source of truth for the session signing secret.
 *
 * IMPORTANT: `src/server/auth.ts` (Node) and `src/server/auth-edge.ts`
 * (proxy) MUST derive the same key, otherwise a token signed at login is
 * rejected by the proxy and every page bounces back to /login.
 *
 * In production a missing/weak secret is a hard error: sessions stay signed
 * with a predictable key otherwise.
 */

export const FALLBACK_SESSION_SECRET = "dev-only-insecure-secret-change-me";

export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 16) return secret;

  if (process.env.NODE_ENV === "production") {
    console.error(
      "[NetWatch] SESSION_SECRET is missing or shorter than 16 chars — sessions are INSECURE. Set a 32+ char secret.",
    );
  }
  return FALLBACK_SESSION_SECRET;
}
