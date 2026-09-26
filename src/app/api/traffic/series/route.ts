import { z } from "zod";
import { deviceTrafficQuerySchema } from "@/lib/api/schemas/usage";
import { requireUser } from "@/server/auth";
import { handle, ok, parseQuery } from "@/server/http";
import { getNetworkTrafficSeries } from "@/server/services/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const seriesSchema = z.array(
  z.object({
    timestamp: z.string(),
    downloadBps: z.number(),
    uploadBps: z.number(),
  }),
);

export const GET = handle(async (request: Request) => {
  const session = await requireUser();
  const query = parseQuery(request, deviceTrafficQuerySchema);
  return ok(seriesSchema.parse(getNetworkTrafficSeries(session, query.minutes)));
});
