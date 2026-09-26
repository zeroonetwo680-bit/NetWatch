import { updateUserSchema, userSchema } from "@/lib/api/schemas/user";
import { requireUser } from "@/server/auth";
import { handle, ok, parseBody } from "@/server/http";
import { deleteUser, updateUser } from "@/server/services/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const PATCH = handle(async (request: Request, { params }: Context) => {
  const session = await requireUser();
  const { id } = await params;
  const body = await parseBody(request, updateUserSchema);
  return ok(userSchema.parse(updateUser(session, Number(id), body)));
});

export const DELETE = handle(async (_request: Request, { params }: Context) => {
  const session = await requireUser();
  const { id } = await params;
  return ok(deleteUser(session, Number(id)));
});
