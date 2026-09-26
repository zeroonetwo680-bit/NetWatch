import { z } from "zod";
import { requireUser } from "@/server/auth";
import { ApiError } from "@/server/errors";
import { toggleDeviceDnsBlock } from "@/server/dns/service";
import { handle, ok, parseBody } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const toggleSchema = z.object({
  blocked: z.boolean(),
});

export const POST = handle(
  async (
    request: Request,
    ctx?: { params?: Promise<{ id: string }> },
  ) => {
    const session = await requireUser();
    if (session.role !== "admin") {
      throw new ApiError(403, "FORBIDDEN", "التحكم في أجهزة الشبكة متاح لمدير النظام فقط.");
    }

    const params = await ctx?.params;
    const deviceId = Number(params?.id);
    if (!Number.isInteger(deviceId) || deviceId <= 0) {
      throw new ApiError(400, "BAD_REQUEST", "معرّف الجهاز غير صحيح.");
    }

    const body = await parseBody(request, toggleSchema);
    toggleDeviceDnsBlock(deviceId, body.blocked);

    return ok({ deviceId, blocked: body.blocked });
  },
);
