import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { sessionUserSchema } from "@/lib/api/schemas/auth";
import { getSession } from "@/server/auth";
import { ApiError } from "@/server/errors";
import { handle, ok } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const session = await getSession();
  if (!session) {
    throw new ApiError(401, "UNAUTHORIZED", "الجلسة منتهية — سجّل الدخول من جديد.");
  }
  const row = getDb().select().from(users).where(eq(users.id, session.id)).get();
  if (!row) {
    throw new ApiError(401, "UNAUTHORIZED", "المستخدم غير موجود.");
  }
  return ok(
    sessionUserSchema.parse({
      id: row.id,
      name: row.name,
      username: row.username,
      role: row.role,
    }),
  );
});
