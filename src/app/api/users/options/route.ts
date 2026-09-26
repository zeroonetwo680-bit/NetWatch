import { z } from "zod";
import { requireUser } from "@/server/auth";
import { handle, ok } from "@/server/http";
import { listUserOptions } from "@/server/services/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const optionsSchema = z.array(
  z.object({ id: z.number().int(), name: z.string(), username: z.string() }),
);

/** Lightweight user list for the "إسناد إلى مستخدم" dialog (admin only). */
export const GET = handle(async () => {
  const session = await requireUser();
  if (session.role !== "admin") {
    return ok(optionsSchema.parse([]));
  }
  return ok(optionsSchema.parse(listUserOptions()));
});
