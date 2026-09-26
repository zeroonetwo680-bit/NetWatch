import { assignDeviceSchema } from "@/lib/api/schemas/device";
import { requireUser } from "@/server/auth";
import { handle, ok, parseBody } from "@/server/http";
import { assignDevice } from "@/server/services/devices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const POST = handle(async (request: Request, { params }: Context) => {
  const session = await requireUser();
  const { id } = await params;
  const body = await parseBody(request, assignDeviceSchema);
  const device = assignDevice(session, Number(id), body.userId ?? null);
  return ok({
    id: device.id,
    userId: device.userId,
    name: device.name,
  });
});
