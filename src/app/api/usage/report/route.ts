import { usageReportQuerySchema, usageReportSchema } from "@/lib/api/schemas/usage";
import { requireUser } from "@/server/auth";
import { handle, ok, parseQuery } from "@/server/http";
import { getUsageReport } from "@/server/services/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (request: Request) => {
  const session = await requireUser();
  const query = parseQuery(request, usageReportQuerySchema);
  const report = getUsageReport(
    session,
    query.granularity,
    query.from,
    query.to,
  );
  return ok(usageReportSchema.parse(report));
});
