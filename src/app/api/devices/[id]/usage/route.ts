import { deviceUsageQuerySchema, usageSeriesSchema } from "@/lib/api/schemas/usage";
import { requireUser } from "@/server/auth";
import { handle, ok, parseQuery } from "@/server/http";
import { getDeviceUsage } from "@/server/services/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const GET = handle(async (request: Request, { params }: Context) => {
  const session = await requireUser();
  const { id } = await params;
  const query = parseQuery(request, deviceUsageQuerySchema);
  const series = getDeviceUsage(
    session,
    Number(id),
    query.granularity,
    query.from,
    query.to,
  );
  return ok(usageSeriesSchema.parse(series));
});
