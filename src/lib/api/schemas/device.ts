import { z } from "zod";

export const deviceStatusSchema = z.enum(["online", "offline", "blocked"]);

export const deviceSortSchema = z.enum(["name", "newest", "usage"]);

export const deviceSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  macAddress: z.string(),
  ipAddress: z.string().nullable(),
  hostname: z.string().nullable(),
  status: deviceStatusSchema,
  userId: z.number().int().nullable(),
  userName: z.string().nullable(),
  lastSeenAt: z.string().nullable(),
  createdAt: z.string(),
  currentDownloadMbps: z.number().nullable(),
  currentUploadMbps: z.number().nullable(),
  todayBytes: z.object({
    download: z.number(),
    upload: z.number(),
  }),
});

export const speedLimitSchema = z.object({
  id: z.number().int(),
  deviceId: z.number().int(),
  downloadMbps: z.number(),
  uploadMbps: z.number(),
  enabled: z.boolean(),
  appliedAt: z.string().nullable(),
  updatedAt: z.string(),
});

export const deviceDetailSchema = deviceSchema.extend({
  speedLimit: speedLimitSchema.nullable(),
  monthBytes: z.object({ download: z.number(), upload: z.number() }),
});

export const deviceFilterSchema = z.object({
  search: z.string().trim().max(120).optional().catch(undefined),
  status: deviceStatusSchema.optional().catch(undefined),
  userId: z.coerce.number().int().positive().optional().catch(undefined),
  sort: deviceSortSchema.optional().catch(undefined),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const renameDeviceSchema = z.object({
  name: z.string().trim().min(1, "اسم الجهاز مطلوب").max(80),
});

export const assignDeviceSchema = z.object({
  userId: z.number().int().positive().nullable(),
});

export const blockDeviceSchema = z.object({
  blocked: z.boolean(),
});

export const speedLimitInputSchema = z.object({
  downloadMbps: z
    .number()
    .positive("حد التنزيل يجب أن يكون أكبر من صفر")
    .max(10_000),
  uploadMbps: z.number().positive("حد الرفع يجب أن يكون أكبر من صفر").max(10_000),
  enabled: z.boolean().default(true),
});

export type DeviceStatus = z.infer<typeof deviceStatusSchema>;
export type DeviceDto = z.infer<typeof deviceSchema>;
export type DeviceDetailDto = z.infer<typeof deviceDetailSchema>;
export type SpeedLimitDto = z.infer<typeof speedLimitSchema>;
/** Browser-side filter shape (page/pageSize optional). */
export type DeviceFilter = {
  search?: string;
  status?: DeviceStatus;
  userId?: number;
  sort?: "name" | "newest" | "usage";
  page?: number;
  pageSize?: number;
};
