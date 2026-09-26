import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { devices, speedLimits, users } from "@/db/schema";
import { getNetworkAdapter } from "@/lib/network";
import type { SpeedLimitDto } from "@/lib/api/schemas/device";
import { ApiError } from "../errors";
import { requireCapability } from "../capabilities";
import type { SessionUser } from "../auth";
import { canAccessDevice } from "../auth";
import { getDeviceRow } from "./devices";

export type SpeedLimitRow = typeof speedLimits.$inferSelect;

function toDto(row: SpeedLimitRow): SpeedLimitDto {
  return {
    id: row.id,
    deviceId: row.deviceId,
    downloadMbps: row.downloadMbps,
    uploadMbps: row.uploadMbps,
    enabled: row.enabled,
    appliedAt: row.appliedAt ? row.appliedAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function getSpeedLimit(
  session: SessionUser,
  deviceId: number,
): SpeedLimitDto | null {
  const device = getDeviceRow(session, deviceId);
  const row = getDb()
    .select()
    .from(speedLimits)
    .where(eq(speedLimits.deviceId, device.id))
    .get();
  return row ? toDto(row) : null;
}

export type SpeedLimitListItem = SpeedLimitDto & {
  deviceName: string;
  macAddress: string;
  status: "online" | "offline" | "blocked";
  userName: string | null;
  userId: number | null;
};

/** All visible devices with their current limit (or null when unlimited). */
export function listSpeedLimits(session: SessionUser): SpeedLimitListItem[] {
  const db = getDb();
  const rows = db
    .select({
      device: devices,
      userName: users.name,
      limit: speedLimits,
    })
    .from(devices)
    .leftJoin(users, eq(users.id, devices.userId))
    .leftJoin(speedLimits, eq(speedLimits.deviceId, devices.id))
    .orderBy(asc(devices.name))
    .all();

  return rows
    .filter((row) => canAccessDevice(session, row.device))
    .map((row) => {
      const base = {
        deviceName: row.device.name,
        macAddress: row.device.macAddress,
        status: row.device.status,
        userName: row.userName ?? null,
        userId: row.device.userId,
      };
      if (!row.limit) {
        return {
          ...base,
          id: 0,
          deviceId: row.device.id,
          downloadMbps: 0,
          uploadMbps: 0,
          enabled: false,
          appliedAt: null,
          updatedAt: new Date().toISOString(),
        };
      }
      return { ...base, ...toDto(row.limit) };
    });
}

export type SpeedLimitInput = {
  downloadMbps: number;
  uploadMbps: number;
  enabled: boolean;
};

/**
 * Stores the INTENT. The poller applies it to the router on its next tick
 * (and clears appliedAt when the limit is disabled/removed).
 */
export async function upsertSpeedLimit(
  session: SessionUser,
  deviceId: number,
  input: SpeedLimitInput,
): Promise<SpeedLimitDto> {
  const device = getDeviceRow(session, deviceId);
  const adapter = getNetworkAdapter();
  requireCapability("speedLimit", "تحديد السرعة");
  const db = getDb();
  const now = new Date();

  const existing = db
    .select()
    .from(speedLimits)
    .where(eq(speedLimits.deviceId, device.id))
    .get();

  // Try to apply immediately for instant feedback; the poller retries on
  // failure (appliedAt stays null → "بانتظار التطبيق").
  let appliedAt: Date | null = null;
  if (input.enabled) {
    try {
      await adapter.applySpeedLimit(
        device.macAddress,
        input.downloadMbps,
        input.uploadMbps,
      );
      appliedAt = now;
    } catch {
      appliedAt = null;
    }
  } else if (existing) {
    try {
      await adapter.removeSpeedLimit(device.macAddress);
    } catch {
      // Poller will retry.
    }
  }

  if (existing) {
    db.update(speedLimits)
      .set({
        downloadMbps: input.downloadMbps,
        uploadMbps: input.uploadMbps,
        enabled: input.enabled,
        appliedAt,
        updatedAt: now,
      })
      .where(eq(speedLimits.id, existing.id))
      .run();
  } else {
    db.insert(speedLimits)
      .values({
        deviceId: device.id,
        downloadMbps: input.downloadMbps,
        uploadMbps: input.uploadMbps,
        enabled: input.enabled,
        appliedAt,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  const row = db
    .select()
    .from(speedLimits)
    .where(eq(speedLimits.deviceId, device.id))
    .get();

  if (!row) {
    throw new ApiError(500, "INTERNAL", "تعذّر حفظ حد السرعة.");
  }
  return toDto(row);
}

/** Toggles a limit on/off without changing its values. */
export async function toggleSpeedLimit(
  session: SessionUser,
  deviceId: number,
  enabled: boolean,
): Promise<SpeedLimitDto> {
  const current = getSpeedLimit(session, deviceId);
  if (!current) {
    throw new ApiError(404, "NOT_FOUND", "لا يوجد حد سرعة لهذا الجهاز.");
  }
  return upsertSpeedLimit(session, deviceId, {
    downloadMbps: current.downloadMbps,
    uploadMbps: current.uploadMbps,
    enabled,
  });
}

export function removeSpeedLimit(
  session: SessionUser,
  deviceId: number,
): { ok: true } {
  const device = getDeviceRow(session, deviceId);
  void getNetworkAdapter()
    .removeSpeedLimit(device.macAddress)
    .catch(() => undefined);
  getDb().delete(speedLimits).where(eq(speedLimits.deviceId, device.id)).run();
  return { ok: true as const };
}

/** Used by the poller: rows whose router state differs from DB intent. */
export function pendingLimitRows(): {
  id: number;
  deviceId: number;
  macAddress: string;
  downloadMbps: number;
  uploadMbps: number;
  enabled: boolean;
  appliedAt: Date | null;
}[] {
  return getDb()
    .select({
      id: speedLimits.id,
      deviceId: speedLimits.deviceId,
      macAddress: devices.macAddress,
      downloadMbps: speedLimits.downloadMbps,
      uploadMbps: speedLimits.uploadMbps,
      enabled: speedLimits.enabled,
      appliedAt: speedLimits.appliedAt,
    })
    .from(speedLimits)
    .innerJoin(devices, eq(devices.id, speedLimits.deviceId))
    .all()
    .filter(
      (row) =>
        (row.enabled && row.appliedAt === null) ||
        (!row.enabled && row.appliedAt !== null),
    );
}

export async function markApplied(id: number, appliedAt: Date | null) {
  getDb()
    .update(speedLimits)
    .set({ appliedAt, updatedAt: new Date() })
    .where(and(eq(speedLimits.id, id)))
    .run();
}
