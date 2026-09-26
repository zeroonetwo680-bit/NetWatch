import { z } from "zod";
import { dnsServerStatusSchema, dnsStatsSchema } from "@/lib/api/schemas/dns";
import { requireUser } from "@/server/auth";
import { getDnsServerStatus } from "@/server/dns/server";
import { getDnsStats } from "@/server/dns/service";
import { handle, ok } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const responseSchema = z.object({
  status: dnsServerStatusSchema,
  stats: dnsStatsSchema,
});

export const GET = handle(async () => {
  await requireUser();
  const serverStatus = getDnsServerStatus();
  const stats = getDnsStats();

  return ok(
    responseSchema.parse({
      status: serverStatus,
      stats,
    }),
  );
});
