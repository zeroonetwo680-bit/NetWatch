import { z } from "zod";

export const networkModeSchema = z.enum(["simulated", "mikrotik"]);

export const systemStatusSchema = z.object({
  networkMode: networkModeSchema,
  routerConnected: z.boolean(),
  lastPollAt: z.string().nullable(),
  lastError: z.string().nullable(),
  pollIntervalMs: z.number(),
  sampleCount: z.number(),
});

export const settingsSchema = z.object({
  pollIntervalMs: z.number().int().min(2000).max(600_000),
  sampleRetentionDays: z.number().int().min(1).max(365),
  networkMode: networkModeSchema,
  mikrotik: z.object({
    host: z.string(),
    port: z.number().int(),
    user: z.string(),
    // Never the password — write-only.
    hasPassword: z.boolean(),
  }),
});

export const updateSettingsSchema = z
  .object({
    pollIntervalMs: z.number().int().min(2000).max(600_000).optional(),
    sampleRetentionDays: z.number().int().min(1).max(365).optional(),
    mikrotik: z
      .object({
        host: z.string().min(1).optional(),
        port: z.number().int().positive().optional(),
        user: z.string().min(1).optional(),
        password: z.string().optional(),
      })
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "لا توجد بيانات للتحديث");

export const mikrotikTestResultSchema = z.object({
  ok: z.boolean(),
  identity: z.string().nullable(),
  message: z.string().nullable(),
});

export type SystemStatusDto = z.infer<typeof systemStatusSchema>;
export type SettingsDto = z.infer<typeof settingsSchema>;
