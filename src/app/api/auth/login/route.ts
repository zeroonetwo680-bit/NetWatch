import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { loginInputSchema, sessionUserSchema } from "@/lib/api/schemas/auth";
import {
  createSessionToken,
  normalizeUsername,
  sessionCookieOptions,
  verifyPassword,
} from "@/server/auth";
import { ApiError } from "@/server/errors";
import { handle, ok, parseBody, problem } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle(async (request: Request) => {
  const input = await parseBody(request, loginInputSchema);
  const db = getDb();

  const row = db
    .select()
    .from(users)
    .where(eq(users.username, normalizeUsername(input.username)))
    .get();

  // Same message for unknown user and wrong password (no user enumeration).
  if (!row || !verifyPassword(input.password, row.passwordHash)) {
    throw new ApiError(401, "UNAUTHORIZED", "اسم المستخدم أو كلمة المرور غير صحيحة.");
  }

  const session = {
    id: row.id,
    name: row.name,
    username: row.username,
    role: row.role,
  };

  const token = await createSessionToken(session);
  const response = ok(sessionUserSchema.parse(session));
  response.cookies.set({ ...sessionCookieOptions(), value: token });
  return response;
});

/** Used by the logout page fallback when cookies are rejected. */
export const GET = handle(async () => {
  return problem(
    new ApiError(405, "BAD_REQUEST", "استخدم POST لتسجيل الدخول."),
  ) as NextResponse;
});
