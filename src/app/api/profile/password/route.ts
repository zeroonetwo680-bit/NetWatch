import { changePasswordSchema } from "@/lib/api/schemas/user";
import { requireUser } from "@/server/auth";
import { handle, ok, parseBody } from "@/server/http";
import { changeOwnPassword } from "@/server/services/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle(async (request: Request) => {
  const session = await requireUser();
  const body = await parseBody(request, changePasswordSchema);
  return ok(
    changeOwnPassword(session, body.currentPassword, body.newPassword),
  );
});
