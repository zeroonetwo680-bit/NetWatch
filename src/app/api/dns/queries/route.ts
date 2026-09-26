import { z } from "zod";
import { dnsQueryLogItemSchema } from "@/lib/api/schemas/dns";
import { requireUser } from "@/server/auth";
import { getDnsLogs } from "@/server/dns/service";
import { handle, ok } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const responseSchema = z.object({
  items: z.array(dnsQueryLogItemSchema),
  total: z.number(),
});

export const GET = handle(async (request: Request) => {
  await requireUser();
  const url = new URL(request.url);

  const search = url.searchParams.get("search") || undefined;
  const actionParam = url.searchParams.get("action");
  const action =
    actionParam === "blocked" || actionParam === "allowed"
      ? actionParam
      : undefined;
  const limit = Math.min(Number(url.searchParams.get("limit") || 100), 200);

  const data = getDnsLogs({ search, action, limit });
  return ok(responseSchema.parse(data));
});
