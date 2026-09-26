import { usageSummarySchema } from "@/lib/api/schemas/usage";
import { requireUser } from "@/server/auth";
import { handle, ok } from "@/server/http";
import { getUsageSummary } from "@/server/services/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const session = await requireUser();
  return ok(usageSummarySchema.parse(getUsageSummary(session)));
});
