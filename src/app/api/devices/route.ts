import { pageResultSchema } from "@/lib/api/schemas/common";
import { deviceFilterSchema, deviceSchema } from "@/lib/api/schemas/device";
import { requireUser } from "@/server/auth";
import { handle, ok, parseQuery } from "@/server/http";
import { discoverDevices, listDevices } from "@/server/services/devices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (request: Request) => {
  const session = await requireUser();
  const filter = parseQuery(request, deviceFilterSchema);
  const result = listDevices(session, filter);
  return ok(pageResultSchema(deviceSchema).parse(result));
});

/** POST /api/devices → run a discovery cycle now. */
export const POST = handle(async () => {
  const session = await requireUser();
  return ok(await discoverDevices(session));
});
