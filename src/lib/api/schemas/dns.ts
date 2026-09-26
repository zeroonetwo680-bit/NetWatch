import { z } from "zod";

export const dnsServerStatusSchema = z.object({
  enabled: z.boolean(),
  running: z.boolean(),
  configuredPort: z.number(),
  activePort: z.number().nullable(),
  upstreamServers: z.array(z.string()),
  error: z.string().nullable(),
  startedAt: z.string().nullable(),
});

export const dnsStatsSchema = z.object({
  totalQueries: z.number(),
  blockedQueries: z.number(),
  blockPercentage: z.number(),
  activeRulesCount: z.number(),
  blockedDevicesCount: z.number(),
});

export const dnsRuleActionSchema = z.enum(["block", "allow"]);

export const dnsRuleSchema = z.object({
  id: z.number(),
  domain: z.string(),
  action: dnsRuleActionSchema,
  enabled: z.boolean(),
  category: z.string(),
  comment: z.string().nullable(),
  createdAt: z.string(),
});

export const createDnsRuleInputSchema = z.object({
  domain: z
    .string()
    .trim()
    .min(1, "اسم الدومين مطلوب")
    .max(253, "اسم الدومين طويل للغاية")
    .refine(
      (v) => /^(\*\.)?([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/.test(v),
      "صيغة الدومين غير صحيحة (مثال: tiktok.com أو *.ads.com)",
    ),
  action: dnsRuleActionSchema.optional().default("block"),
  category: z.string().trim().max(50).optional().default("custom"),
  comment: z.string().trim().max(150).optional().nullable(),
  enabled: z.boolean().optional().default(true),
});

export const updateDnsRuleInputSchema = z.object({
  domain: z
    .string()
    .trim()
    .min(1)
    .max(253)
    .optional(),
  action: dnsRuleActionSchema.optional(),
  category: z.string().trim().max(50).optional(),
  comment: z.string().trim().max(150).optional().nullable(),
  enabled: z.boolean().optional(),
});

export const dnsQueryLogItemSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  clientIp: z.string(),
  deviceName: z.string().nullable(),
  domain: z.string(),
  qtype: z.string(),
  action: z.enum(["allowed", "blocked"]),
  reason: z.string().nullable(),
});

export const dnsDeviceItemSchema = z.object({
  deviceId: z.number(),
  deviceName: z.string(),
  macAddress: z.string(),
  ipAddress: z.string().nullable(),
  blockedViaDns: z.boolean(),
});

export type DnsServerStatusDto = z.infer<typeof dnsServerStatusSchema>;
export type DnsStatsDto = z.infer<typeof dnsStatsSchema>;
export type DnsRuleDto = z.infer<typeof dnsRuleSchema>;
export type CreateDnsRuleInput = z.input<typeof createDnsRuleInputSchema>;
export type UpdateDnsRuleInput = z.input<typeof updateDnsRuleInputSchema>;
export type DnsQueryLogItemDto = z.infer<typeof dnsQueryLogItemSchema>;
export type DnsDeviceItemDto = z.infer<typeof dnsDeviceItemSchema>;
