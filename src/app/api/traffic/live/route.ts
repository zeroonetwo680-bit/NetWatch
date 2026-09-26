import { z } from "zod";
import { liveTrafficSchema } from "@/lib/api/schemas/usage";
import { requireUser } from "@/server/auth";
import { handle, ok } from "@/server/http";
import { getLiveTraffic } from "@/server/services/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const session = await requireUser();
  return ok(z.array(liveTrafficSchema).parse(getLiveTraffic(session)));
});
