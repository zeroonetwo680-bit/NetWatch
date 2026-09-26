/**
 * Edge/proxy-safe session verification (no DB, no bcrypt — JWT only).
 * Kept separate from server/auth.ts so the proxy bundle stays small,
 * but it shares the exact same secret derivation.
 */
import { jwtVerify } from "jose";
import { getSessionSecret } from "@/lib/session-secret";

export type EdgeSession = {
  id: number;
  name: string;
  username: string;
  role: "admin" | "user";
};

export async function verifySessionToken(
  token: string,
): Promise<EdgeSession | null> {
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(getSessionSecret()),
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
