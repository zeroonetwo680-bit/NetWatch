import { systemStatusSchema, mikrotikTestResultSchema } from "@/lib/api/schemas/system";
import { requireUser } from "@/server/auth";
import { handle, ok } from "@/server/http";
import { getSystemStatus, testMikrotikConnection } from "@/server/services/system";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (request: Request) => {
  await requireUser();
  const url = new URL(request.url);

  if (url.searchParams.get("test") === "1") {
    const result = await testMikrotikConnection();
    return ok(
      mikrotikTestResultSchema.parse({
        ok: result.ok,
        identity: result.identity ?? null,
        message: result.message ?? null,
      }),
    );
  }

  return ok(systemStatusSchema.parse(await getSystemStatus()));
});
