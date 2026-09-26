import "server-only";

import { getNetworkAdapter } from "@/lib/network";
import type { AdapterCapabilities } from "@/lib/network/types";
import { ApiError } from "./errors";

/**
 * Guards router-side features that the active data source may not support.
 *
 * In `lan` mode we can see devices but not control them, so speed limits and
 * blocking must fail fast with a clear Arabic 422 instead of silently
 * recording a limit that will never be applied (the old behaviour left rows
 * stuck on "بانتظار التطبيق" forever).
 */
export function requireCapability(
  capability: keyof Omit<AdapterCapabilities, "note">,
  arabicLabel: string,
): void {
  const { capabilities } = getNetworkAdapter().status();
  if (capabilities[capability]) return;

  throw new ApiError(
    422,
    "UNSUPPORTED_OPERATION",
    capabilities.note ??
      `${arabicLabel} غير متاح في وضع التشغيل الحالي — استخدم راوتر MikroTik لتفعيل هذه الميزة.`,
  );
}
