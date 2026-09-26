import { z } from "zod";
import { deviceTrafficQuerySchema, trafficSampleSchema } from "@/lib/api/schemas/usage";
import { requireUser } from "@/server/auth";
import { handle, ok, parseQuery } from "@/server/http";
import { getDeviceTraffic } from "@/server/services/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const GET = handle(async (request: Request, { params }: Context) => {
  const session = await requireUser();
  const { id } = await params;
  const query = parseQuery(request, deviceTrafficQuerySchema);
  const samples = getDeviceTraffic(session, Number(id), query.minutes);
  return ok(z.array(trafficSampleSchema).parse(samples));
});
