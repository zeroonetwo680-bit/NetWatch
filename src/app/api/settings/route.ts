import { settingsSchema, updateSettingsSchema } from "@/lib/api/schemas/system";
import { getNetworkAdapter } from "@/lib/network";
import { requireUser } from "@/server/auth";
import { ApiError } from "@/server/errors";
import { handle, ok, parseBody } from "@/server/http";
import {
  getRuntimeSettings,
  updateRuntimeSettings,
} from "@/server/services/system";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toDto() {
  const runtime = getRuntimeSettings();
  return settingsSchema.parse({
    pollIntervalMs: runtime.pollIntervalMs,
    sampleRetentionDays: runtime.sampleRetentionDays,
    networkMode: getNetworkAdapter().mode,
    mikrotik: {
      host: runtime.mikrotik.host,
      port: runtime.mikrotik.port,
      user: runtime.mikrotik.user,
      hasPassword: runtime.mikrotik.hasPassword,
    },
  });
}

export const GET = handle(async () => {
  const session = await requireUser();
  if (session.role !== "admin") {
    throw new ApiError(403, "FORBIDDEN", "الإعدادات متاحة لمدير النظام فقط.");
  }
  return ok(toDto());
});

export const PATCH = handle(async (request: Request) => {
  const session = await requireUser();
  if (session.role !== "admin") {
    throw new ApiError(403, "FORBIDDEN", "الإعدادات متاحة لمدير النظام فقط.");
  }
  const patch = await parseBody(request, updateSettingsSchema);
  updateRuntimeSettings({
    pollIntervalMs: patch.pollIntervalMs,
    sampleRetentionDays: patch.sampleRetentionDays,
    mikrotik: patch.mikrotik
      ? {
          host: patch.mikrotik.host,
          port: patch.mikrotik.port,
          user: patch.mikrotik.user,
          password: patch.mikrotik.password,
        }
      : undefined,
  });
  return ok(toDto());
});
