import { okSchema } from "@/lib/api/schemas/auth";
import { sessionCookieOptions } from "@/server/auth";
import { handle, ok } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle(async () => {
  const response = ok(okSchema.parse({ ok: true as const }));
  const { name, ...options } = sessionCookieOptions();
  response.cookies.set({ ...options, name, value: "", maxAge: 0 });
  return response;
});
