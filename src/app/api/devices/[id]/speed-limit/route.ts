import { speedLimitSchema, speedLimitInputSchema } from "@/lib/api/schemas/device";
import { requireUser } from "@/server/auth";
import { handle, ok, parseBody } from "@/server/http";
import {
  getSpeedLimit,
  removeSpeedLimit,
  upsertSpeedLimit,
} from "@/server/services/speed-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const GET = handle(async (_request: Request, { params }: Context) => {
  const session = await requireUser();
  const { id } = await params;
  const limit = getSpeedLimit(session, Number(id));
  return ok(limit ? speedLimitSchema.parse(limit) : null);
});

export const PUT = handle(async (request: Request, { params }: Context) => {
  const session = await requireUser();
  const { id } = await params;
  const body = await parseBody(request, speedLimitInputSchema);
  const limit = await upsertSpeedLimit(session, Number(id), body);
  return ok(speedLimitSchema.parse(limit));
});

export const DELETE = handle(async (_request: Request, { params }: Context) => {
  const session = await requireUser();
  const { id } = await params;
  return ok(removeSpeedLimit(session, Number(id)));
});
