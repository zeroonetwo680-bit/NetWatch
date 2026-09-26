import { pageResultSchema } from "@/lib/api/schemas/common";
import {
  createUserSchema,
  userFilterSchema,
  userSchema,
} from "@/lib/api/schemas/user";
import { requireUser } from "@/server/auth";
import { handle, ok, parseBody, parseQuery } from "@/server/http";
import { createUser, listUsers } from "@/server/services/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (request: Request) => {
  const session = await requireUser();
  const filter = parseQuery(request, userFilterSchema);
  return ok(pageResultSchema(userSchema).parse(listUsers(session, filter)));
});

export const POST = handle(async (request: Request) => {
  const session = await requireUser();
  const body = await parseBody(request, createUserSchema);
  return ok(userSchema.parse(createUser(session, body)), { status: 201 });
});
