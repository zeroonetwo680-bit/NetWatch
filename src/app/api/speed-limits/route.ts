import { z } from "zod";
import { requireUser } from "@/server/auth";
import { handle, ok } from "@/server/http";
import { listSpeedLimits } from "@/server/services/speed-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const itemSchema = z.object({
  id: z.number().int(),
  deviceId: z.number().int(),
  deviceName: z.string(),
  macAddress: z.string(),
  status: z.enum(["online", "offline", "blocked"]),
  userId: z.number().int().nullable(),
  userName: z.string().nullable(),
  downloadMbps: z.number(),
  uploadMbps: z.number(),
  enabled: z.boolean(),
  appliedAt: z.string().nullable(),
  updatedAt: z.string(),
});

export const GET = handle(async () => {
  const session = await requireUser();
  return ok(z.array(itemSchema).parse(listSpeedLimits(session)));
});
