import { deviceDetailSchema, deviceSchema, renameDeviceSchema } from "@/lib/api/schemas/device";
import { deleteDevice, renameDevice } from "@/server/services/devices";
import { requireUser } from "@/server/auth";
import { handle, ok, parseBody } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const GET = handle(async (_request: Request, { params }: Context) => {
  const session = await requireUser();
  const { id } = await params;
  const { getDeviceDetail } = await import("@/server/services/devices");
  return ok(deviceDetailSchema.parse(getDeviceDetail(session, Number(id))));
});

export const PATCH = handle(async (request: Request, { params }: Context) => {
  const session = await requireUser();
  const { id } = await params;
  const body = await parseBody(request, renameDeviceSchema);
  return ok(deviceSchema.parse(renameDevice(session, Number(id), body.name)));
});

export const DELETE = handle(async (_request: Request, { params }: Context) => {
  const session = await requireUser();
  const { id } = await params;
  deleteDevice(session, Number(id));
  return ok({ ok: true as const });
});
