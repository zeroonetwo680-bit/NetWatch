import { z } from "zod";

export const granularitySchema = z.enum(["daily", "monthly"]);

export const trafficSampleSchema = z.object({
  timestamp: z.string(),
  downloadBps: z.number(),
  uploadBps: z.number(),
  downloadBytes: z.number(),
  uploadBytes: z.number(),
});

export const usagePointSchema = z.object({
  label: z.string(),
  date: z.string(),
  downloadBytes: z.number(),
  uploadBytes: z.number(),
});

export const usageSeriesSchema = z.object({
  granularity: granularitySchema,
  points: z.array(usagePointSchema),
  totals: z.object({ downloadBytes: z.number(), uploadBytes: z.number() }),
});

export const usageSummarySchema = z.object({
  today: z.object({ downloadBytes: z.number(), uploadBytes: z.number() }),
  month: z.object({ downloadBytes: z.number(), uploadBytes: z.number() }),
  onlineDevices: z.number(),
  totalDevices: z.number(),
  networkDownloadMbps: z.number(),
  networkUploadMbps: z.number(),
});

export const liveTrafficSchema = z.object({
  deviceId: z.number().int(),
  name: z.string(),
  status: z.enum(["online", "offline", "blocked"]),
  downloadMbps: z.number(),
  uploadMbps: z.number(),
});

export const deviceUsageQuerySchema = z.object({
  granularity: granularitySchema.default("daily").catch("daily"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
});

export const deviceTrafficQuerySchema = z.object({
  minutes: z.coerce.number().int().min(5).max(360).default(60).catch(60),
});

/** Network-wide usage report points (per device or per day). */
export const usageReportRowSchema = z.object({
  key: z.string(),
  label: z.string(),
  deviceId: z.number().int().nullable(),
  downloadBytes: z.number(),
  uploadBytes: z.number(),
});

export const usageReportSchema = z.object({
  granularity: granularitySchema,
  from: z.string(),
  to: z.string(),
  rows: z.array(usageReportRowSchema),
  totals: z.object({ downloadBytes: z.number(), uploadBytes: z.number() }),
});

export const usageReportQuerySchema = z.object({
  granularity: granularitySchema.default("daily").catch("daily"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
});

export type Granularity = z.infer<typeof granularitySchema>;
export type DeviceUsageQuery = z.input<typeof deviceUsageQuerySchema>;
export type TrafficSampleDto = z.infer<typeof trafficSampleSchema>;
export type UsagePointDto = z.infer<typeof usagePointSchema>;
export type UsageSeriesDto = z.infer<typeof usageSeriesSchema>;
export type UsageSummaryDto = z.infer<typeof usageSummarySchema>;
export type LiveTrafficDto = z.infer<typeof liveTrafficSchema>;
export type UsageReportDto = z.infer<typeof usageReportSchema>;
