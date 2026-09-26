/**
 * Edge/proxy-safe session verification (no DB, no bcrypt — JWT only).
 * Kept separate from server/auth.ts so the proxy bundle stays small.
 */
import { jwtVerify } from "jose";

export type EdgeSession = {
  id: number;
  name: string;
  username: string;
  role: "admin" | "user";
};

export async function verifySessionToken(
  token: string,
): Promise<EdgeSession | null> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
    );
    const id = Number(payload.sub);
    if (!Number.isInteger(id)) return null;
    return {
      id,
      name: String(payload.name ?? ""),
      username: String(payload.username ?? ""),
      role: payload.role === "admin" ? "admin" : "user",
    };
  } catch {
    return null;
  }
}
