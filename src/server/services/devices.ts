import "server-only";

import { and, asc, count, desc, eq, like, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { devices, speedLimits, trafficSamples, usageDaily, users } from "@/db/schema";
import type { DeviceStatus } from "@/db/schema";
import { appConfig } from "@/lib/config";
import { getNetworkAdapter } from "@/lib/network";
import {
  bpsToMbps,
  dateKey,
  monthKey,
  normalizeMac,
  sumUsage,
} from "@/lib/usage/calculator";
import type { DeviceDto, DeviceFilter } from "@/lib/api/schemas/device";
import type { PageResult } from "@/lib/api/schemas/common";
import { ApiError } from "../errors";
import { requireCapability } from "../capabilities";
import { canAccessDevice, type SessionUser } from "../auth";

export type DeviceRow = typeof devices.$inferSelect;
export type DeviceWithUser = DeviceRow & {
  userName: string | null;
  todayDownload: number;
  todayUpload: number;
};

type LatestSample = {
  device_id: number;
  download_bps: number | null;
  upload_bps: number | null;
};

/** Latest sample per device (used for the live ↓/↑ columns). */
export function latestSamples(): Map<number, LatestSample> {
  const rows = getDb().all<LatestSample>(sql`
    select s.device_id as device_id, s.download_bps as download_bps, s.upload_bps as upload_bps
    from ${trafficSamples} s
    join (
      select device_id, max(timestamp) as m
      from ${trafficSamples}
      group by device_id
    ) l on l.device_id = s.device_id and l.m = s.timestamp
  `);
  return new Map(rows.map((r) => [r.device_id, r]));
}

function todayColumn() {
  return dateKey(new Date());
}

function scopeCondition(session: SessionUser) {
  return session.role === "admin" ? undefined : eq(devices.userId, session.id);
}

export function listDevices(
  session: SessionUser,
  filter: DeviceFilter,
): PageResult<DeviceDto> {
  const db = getDb();
  const today = todayColumn();
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 20;

  const conditions = [];
  const scope = scopeCondition(session);
  if (scope) conditions.push(scope);
  if (filter.status) conditions.push(eq(devices.status, filter.status));
  if (filter.userId !== undefined && session.role === "admin") {
    conditions.push(eq(devices.userId, filter.userId));
  }
  if (filter.search) {
    const term = `%${filter.search}%`;
    const searchCond = or(
      like(devices.name, term),
      like(devices.hostname, term),
      like(devices.ipAddress, term),
      like(devices.macAddress, term),
    );
    if (searchCond) conditions.push(searchCond);
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const totalRow = db
    .select({ value: count() })
    .from(devices)
    .where(where)
    .get();
  const total = totalRow?.value ?? 0;

  const orderBy = (() => {
    switch (filter.sort) {
      case "usage":
        return [
          desc(sql`coalesce(${usageDaily.downloadBytes}, 0) + coalesce(${usageDaily.uploadBytes}, 0)`),
          asc(devices.name),
        ];
      case "newest":
        return [desc(devices.createdAt), asc(devices.name)];
      default:
        return [asc(devices.name)];
    }
  })();

  const rows = db
    .select({
      device: devices,
      userName: users.name,
      todayDownload: usageDaily.downloadBytes,
      todayUpload: usageDaily.uploadBytes,
    })
    .from(devices)
    .leftJoin(users, eq(users.id, devices.userId))
    .leftJoin(
      usageDaily,
      and(eq(usageDaily.deviceId, devices.id), eq(usageDaily.date, today)),
    )
    .where(where)
    .orderBy(...orderBy)
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  const samples = latestSamples();

  const items: DeviceDto[] = rows.map((row) => {
    const sample = samples.get(row.device.id);
    return {
      id: row.device.id,
      name: row.device.name,
      macAddress: row.device.macAddress,
      ipAddress: row.device.ipAddress,
      hostname: row.device.hostname,
      status: row.device.status as DeviceStatus,
      userId: row.device.userId,
      userName: row.userName ?? null,
      lastSeenAt: row.device.lastSeenAt
        ? row.device.lastSeenAt.toISOString()
        : null,
      createdAt: row.device.createdAt.toISOString(),
      currentDownloadMbps:
        row.device.status === "online" && sample?.download_bps != null
          ? round2(bpsToMbps(sample.download_bps))
          : null,
      currentUploadMbps:
        row.device.status === "online" && sample?.upload_bps != null
          ? round2(bpsToMbps(sample.upload_bps))
          : null,
      todayBytes: {
        download: row.todayDownload ?? 0,
        upload: row.todayUpload ?? 0,
      },
    };
  });

  return {
    items,
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

export function getDeviceRow(session: SessionUser, id: number): DeviceRow {
  const row = getDb().select().from(devices).where(eq(devices.id, id)).get();
  if (!row || !canAccessDevice(session, row)) {
    throw new ApiError(404, "NOT_FOUND", "الجهاز المطلوب غير موجود.");
  }
  return row;
}

export function getDeviceDetail(
  session: SessionUser,
  id: number,
): DeviceDto & {
  speedLimit: {
    id: number;
    deviceId: number;
    downloadMbps: number;
    uploadMbps: number;
    enabled: boolean;
    appliedAt: string | null;
    updatedAt: string;
  } | null;
  monthBytes: { download: number; upload: number };
} {
  const device = getDeviceRow(session, id);
  const db = getDb();

  const userRow = device.userId
    ? db.select({ name: users.name }).from(users).where(eq(users.id, device.userId)).get()
    : undefined;

  const limit = db
    .select()
    .from(speedLimits)
    .where(eq(speedLimits.deviceId, id))
    .get();

  const today = db
    .select()
    .from(usageDaily)
    .where(and(eq(usageDaily.deviceId, id), eq(usageDaily.date, todayColumn())))
    .get();

  const { year, month } = monthKey(new Date());
  const monthRow = db
    .select()
    .from(usageDaily)
    .where(
      and(
        eq(usageDaily.deviceId, id),
        sql`${usageDaily.date} >= ${dateKey(new Date(year, month - 1, 1))}`,
        sql`${usageDaily.date} <= ${dateKey(new Date(year, month, 0))}`,
      ),
    )
    .all();

  const sample = latestSamples().get(id);

  return {
    id: device.id,
    name: device.name,
    macAddress: device.macAddress,
    ipAddress: device.ipAddress,
    hostname: device.hostname,
    status: device.status as DeviceStatus,
    userId: device.userId,
    userName: userRow?.name ?? null,
    lastSeenAt: device.lastSeenAt ? device.lastSeenAt.toISOString() : null,
    createdAt: device.createdAt.toISOString(),
    currentDownloadMbps:
      device.status === "online" && sample?.download_bps != null
        ? round2(bpsToMbps(sample.download_bps))
        : null,
    currentUploadMbps:
      device.status === "online" && sample?.upload_bps != null
        ? round2(bpsToMbps(sample.upload_bps))
        : null,
    todayBytes: { download: today?.downloadBytes ?? 0, upload: today?.uploadBytes ?? 0 },
    speedLimit: limit
      ? {
          id: limit.id,
          deviceId: limit.deviceId,
          downloadMbps: limit.downloadMbps,
          uploadMbps: limit.uploadMbps,
          enabled: limit.enabled,
          appliedAt: limit.appliedAt ? limit.appliedAt.toISOString() : null,
          updatedAt: limit.updatedAt.toISOString(),
        }
      : null,
    monthBytes: {
      download: sumUsage(monthRow ?? []).downloadBytes,
      upload: sumUsage(monthRow ?? []).uploadBytes,
    },
  };
}

export function renameDevice(
  session: SessionUser,
  id: number,
  name: string,
): DeviceDto {
  const device = getDeviceRow(session, id);
  getDb()
    .update(devices)
    .set({ name, updatedAt: new Date() })
    .where(eq(devices.id, id))
    .run();
  const refreshed = listDevices(session, {
    search: device.macAddress,
    page: 1,
    pageSize: 1,
  }).items[0];
  if (refreshed) return refreshed;
  const { speedLimit: _speedLimit, monthBytes: _monthBytes, ...dto } =
    getDeviceDetail(session, id);
  void _speedLimit;
  void _monthBytes;
  return dto;
}

export function assignDevice(
  session: SessionUser,
  id: number,
  userId: number | null,
): DeviceRow {
  if (session.role !== "admin") {
    throw new ApiError(403, "FORBIDDEN", "إسناد الأجهزة متاح لمدير النظام فقط.");
  }
  getDeviceRow(session, id);

  if (userId !== null) {
    const user = getDb().select().from(users).where(eq(users.id, userId)).get();
    if (!user) {
      throw new ApiError(404, "NOT_FOUND", "المستخدم المحدد غير موجود.");
    }
  }

  getDb()
    .update(devices)
    .set({ userId, updatedAt: new Date() })
    .where(eq(devices.id, id))
    .run();

  return getDb().select().from(devices).where(eq(devices.id, id)).get()!;
}

export function deleteDevice(session: SessionUser, id: number): void {
  if (session.role !== "admin") {
    throw new ApiError(403, "FORBIDDEN", "حذف الأجهزة متاح لمدير النظام فقط.");
  }
  const device = getDeviceRow(session, id);
  const adapter = getNetworkAdapter();
  // Best-effort cleanup on the router; a failure must not block deletion.
  void adapter.removeSpeedLimit(device.macAddress).catch(() => undefined);
  void adapter.setBlocked(device.macAddress, false).catch(() => undefined);

  getDb().delete(devices).where(eq(devices.id, id)).run();
}

export async function setDeviceBlocked(
  session: SessionUser,
  id: number,
  blocked: boolean,
): Promise<DeviceRow> {
  if (session.role !== "admin") {
    throw new ApiError(403, "FORBIDDEN", "حظر الأجهزة متاح لمدير النظام فقط.");
  }
  const device = getDeviceRow(session, id);
  const adapter = getNetworkAdapter();
  requireCapability("blocking", "حظر الأجهزة");

  try {
    await adapter.setBlocked(device.macAddress, blocked);
  } catch (err) {
    throw new ApiError(
      502,
      "NETWORK_ADAPTER_ERROR",
      `تعذّر ${blocked ? "حظر" : "إلغاء حظر"} الجهاز على الراوتر: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  getDb()
    .update(devices)
    .set({ status: blocked ? "blocked" : "offline", updatedAt: new Date() })
    .where(eq(devices.id, id))
    .run();

  return getDb().select().from(devices).where(eq(devices.id, id)).get()!;
}

export type DiscoveryResult = { discovered: number; created: number; updated: number };

/**
 * Runs one discovery cycle: adapter snapshot → upsert devices by MAC.
 * Admin only. Returns counts for the toast message.
 */
export async function discoverDevices(
  session: SessionUser,
): Promise<DiscoveryResult> {
  if (session.role !== "admin") {
    throw new ApiError(403, "FORBIDDEN", "اكتشاف الأجهزة متاح لمدير النظام فقط.");
  }
  const adapter = getNetworkAdapter();
  await adapter.connect().catch(() => undefined);

  let snapshots;
  try {
    snapshots = await adapter.discover();
  } catch (err) {
    throw new ApiError(
      502,
      "NETWORK_ADAPTER_ERROR",
      `تعذّر الاتصال بمصدر الشبكة: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  const { upsertDiscoveredDevices } = await import("./poller");
  return upsertDiscoveredDevices(snapshots);
}

/** Auto-assigns newly discovered devices to the demo user (simulated mode only). */
export function maybeAssignUnownedDevices(limit: number): void {
  if (appConfig.networkMode !== "simulated") return;
  const db = getDb();
  const demo = db
    .select()
    .from(users)
    .where(eq(users.username, appConfig.seed.demoUsername.toLowerCase()))
    .get();
  if (!demo) return;

  const unassigned = db
    .select({ id: devices.id })
    .from(devices)
    .where(sql`${devices.userId} is null`)
    .limit(Math.ceil(limit / 2))
    .all();

  for (const row of unassigned) {
    db.update(devices)
      .set({ userId: demo.id, updatedAt: new Date() })
      .where(eq(devices.id, row.id))
      .run();
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export { normalizeMac };
