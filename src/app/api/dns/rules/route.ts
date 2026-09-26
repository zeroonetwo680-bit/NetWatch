import { z } from "zod";
import {
  createDnsRuleInputSchema,
  dnsRuleSchema,
} from "@/lib/api/schemas/dns";
import { requireUser } from "@/server/auth";
import { ApiError } from "@/server/errors";
import {
  addDnsRule,
  listDnsRules,
} from "@/server/dns/service";
import { handle, ok, parseBody } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  await requireUser();
  const rules = listDnsRules();
  const dtos = rules.map((r) => ({
    id: r.id,
    domain: r.domain,
    action: r.action,
    enabled: Boolean(r.enabled),
    category: r.category,
    comment: r.comment,
    createdAt: r.createdAt.toISOString(),
  }));

  return ok(z.array(dnsRuleSchema).parse(dtos));
});

export const POST = handle(async (request: Request) => {
  const session = await requireUser();
  if (session.role !== "admin") {
    throw new ApiError(403, "FORBIDDEN", "إضافة قواعد الحظر متاحة لمدير النظام فقط.");
  }

  const input = await parseBody(request, createDnsRuleInputSchema);
  try {
    const created = addDnsRule(input);
    return ok(
      dnsRuleSchema.parse({
        id: created.id,
        domain: created.domain,
        action: created.action,
        enabled: Boolean(created.enabled),
        category: created.category,
        comment: created.comment,
        createdAt: created.createdAt.toISOString(),
      }),
      { status: 201 },
    );
  } catch (err) {
    if (String(err).includes("UNIQUE")) {
      throw new ApiError(409, "CONFLICT", "هذا الدومين مضاف بالفعل في قائمة القواعد.");
    }
    throw err;
  }
});
