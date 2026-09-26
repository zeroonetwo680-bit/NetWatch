import "server-only";

import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { devices, users, type UserRole } from "@/db/schema";
import { appConfig } from "@/lib/config";
import { ApiError } from "./errors";

export type SessionUser = {
  id: number;
  name: string;
  username: string;
  role: UserRole;
};

export class UnauthorizedError extends ApiError {
  constructor(
    status: 401 | 403,
    message: string,
  ) {
    super(status, status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", message);
  }
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(appConfig.session.secret);
}

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10);
}

export function verifyPassword(plain: string, hash: string): boolean {
  try {
    return bcrypt.compareSync(plain, hash);
  } catch {
    return false;
  }
}

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  const ttlSeconds = appConfig.session.ttlHours * 3600;
  return new SignJWT({
    name: user.name,
    username: user.username,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secretKey());
}

export async function verifySessionToken(
  token: string,
): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const id = Number(payload.sub);
    if (!Number.isInteger(id)) return null;
    return {
      id,
      name: String(payload.name ?? ""),
      username: String(payload.username ?? ""),
      role: (payload.role === "admin" ? "admin" : "user") as UserRole,
    };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    name: appConfig.session.cookieName,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: appConfig.session.ttlHours * 3600,
  };
}

/** Reads the current session from the request cookie (null when absent/bad). */
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(appConfig.session.cookieName)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) {
    throw new UnauthorizedError(401, "يجب تسجيل الدخول للوصول إلى هذا المورد.");
  }
  return session;
}

export async function requireAdmin(): Promise<SessionUser> {
  const session = await requireUser();
  if (session.role !== "admin") {
    throw new UnauthorizedError(403, "هذا المورد متاح لمدير النظام فقط.");
  }
  return session;
}

/** Loads the persisted user row for a session (fresh name/role). */
export async function loadUser(userId: number): Promise<SessionUser | null> {
  const row = getDb()
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  return row ?? null;
}

export type DeviceOwnership = { id: number; userId: number | null };

/**
 * Authorization matrix for device access:
 * - admin: every device
 * - user: only devices assigned to them
 */
export function canAccessDevice(
  session: SessionUser,
  device: DeviceOwnership,
): boolean {
  if (session.role === "admin") return true;
  return device.userId !== null && device.userId === session.id;
}

export async function requireDeviceAccess(
  session: SessionUser,
  deviceId: number,
): Promise<{ id: number; userId: number | null }> {
  const row = getDb()
    .select({ id: devices.id, userId: devices.userId })
    .from(devices)
    .where(eq(devices.id, deviceId))
    .get();

  // Non-admins get 404 (never leak existence of another user's device).
  if (!row || !canAccessDevice(session, row)) {
    throw new ApiError(404, "NOT_FOUND", "الجهاز المطلوب غير موجود.");
  }
  return row;
}

/** Where-clause helper for scoping device lists per role. */
export function deviceScope(session: SessionUser): { userId: number } | undefined {
  return session.role === "admin" ? undefined : { userId: session.id };
}
