import {
  dnsRuleSchema,
  updateDnsRuleInputSchema,
} from "@/lib/api/schemas/dns";
import { requireUser } from "@/server/auth";
import { ApiError } from "@/server/errors";
import { deleteDnsRule, updateDnsRule } from "@/server/dns/service";
import { handle, ok, parseBody } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = handle(
  async (
    request: Request,
    ctx?: { params?: Promise<{ id: string }> },
  ) => {
    const session = await requireUser();
    if (session.role !== "admin") {
      throw new ApiError(403, "FORBIDDEN", "تعديل قواعد الحظر متاح لمدير النظام فقط.");
    }

    const params = await ctx?.params;
    const id = Number(params?.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new ApiError(400, "BAD_REQUEST", "معرّف القاعدة غير صحيح.");
    }

    const patch = await parseBody(request, updateDnsRuleInputSchema);
    const updated = updateDnsRule(id, patch);
    if (!updated) {
      throw new ApiError(404, "NOT_FOUND", "قاعدة الحظر غير موجودة.");
    }

    return ok(
      dnsRuleSchema.parse({
        id: updated.id,
        domain: updated.domain,
        action: updated.action,
        enabled: Boolean(updated.enabled),
        category: updated.category,
        comment: updated.comment,
        createdAt: updated.createdAt.toISOString(),
      }),
    );
  },
);

export const DELETE = handle(
  async (
    _request: Request,
    ctx?: { params?: Promise<{ id: string }> },
  ) => {
    const session = await requireUser();
    if (session.role !== "admin") {
      throw new ApiError(403, "FORBIDDEN", "حذف قواعد الحظر متاح لمدير النظام فقط.");
    }

    const params = await ctx?.params;
    const id = Number(params?.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new ApiError(400, "BAD_REQUEST", "معرّف القاعدة غير صحيح.");
    }

    const deleted = deleteDnsRule(id);
    if (!deleted) {
      throw new ApiError(404, "NOT_FOUND", "قاعدة الحظر غير موجودة.");
    }

    return ok({ success: true });
  },
);
