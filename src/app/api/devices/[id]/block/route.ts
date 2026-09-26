import { blockDeviceSchema } from "@/lib/api/schemas/device";
import { requireUser } from "@/server/auth";
import { handle, ok, parseBody } from "@/server/http";
import { setDeviceBlocked } from "@/server/services/devices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const POST = handle(async (request: Request, { params }: Context) => {
  const session = await requireUser();
  const { id } = await params;
  const body = await parseBody(request, blockDeviceSchema);
  const device = await setDeviceBlocked(session, Number(id), body.blocked);
  return ok({
    id: device.id,
    status: device.status,
    blocked: device.status === "blocked",
  });
});
