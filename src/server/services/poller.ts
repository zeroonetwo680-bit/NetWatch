import "server-only";

import { and, eq, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  devices,
  trafficSamples,
  usageDaily,
  usageMonthly,
} from "@/db/schema";
import type { DeviceStatus } from "@/db/schema";
import { getNetworkAdapter } from "@/lib/network";
import type { RouterDeviceSnapshot } from "@/lib/network/types";
import {
  bpsFromDelta,
  dateKey,
  monthKey,
  normalizeMac,
} from "@/lib/usage/calculator";
import { getRuntimeSettings, recordPoll } from "./system";
import { maybeAssignUnownedDevices } from "./devices";
import { markApplied, pendingLimitRows } from "./speed-limits";

/**
 * The ONLY writer of traffic_samples / usage_daily / usage_monthly.
 * One tick at a time (never overlapping), crash-proof, and driven by
 * the NETWORK_MODE adapter — identical code path for simulator and
 * real MikroTik.
 */

type PollerState = {
  timer: NodeJS.Timeout | null;
  running: boolean;
  ticking: boolean;
  lastCounters: Map<string, { rx: number; tx: number; at: number }>;
  started: boolean;
};

const globalForPoller = globalThis as unknown as {
  netwatchPoller?: PollerState;
};

function state(): PollerState {
  if (!globalForPoller.netwatchPoller) {
    globalForPoller.netwatchPoller = {
      timer: null,
      running: false,
      ticking: false,
      lastCounters: new Map(),
      started: false,
    };
  }
  return globalForPoller.netwatchPoller;
}

export type DiscoveryResult = { discovered: number; created: number; updated: number };

/** Upserts discovered snapshots into `devices` (MAC is the identity). */
export function upsertDiscoveredDevices(
  snapshots: RouterDeviceSnapshot[],
): DiscoveryResult {
  const db = getDb();
  let created = 0;
  let updated = 0;

  for (const snapshot of snapshots) {
    const mac = normalizeMac(snapshot.mac);
    if (!mac) continue;

    const existing = db
      .select()
      .from(devices)
      .where(eq(devices.macAddress, mac))
      .get();

    const status: DeviceStatus = existing?.status === "blocked"
      ? "blocked"
      : snapshot.online
        ? "online"
        : "offline";

    if (existing) {
      db.update(devices)
        .set({
          ipAddress: snapshot.ip ?? existing.ipAddress,
          hostname: snapshot.hostname ?? existing.hostname,
          status,
          lastSeenAt: snapshot.online ? new Date() : existing.lastSeenAt,
          updatedAt: new Date(),
        })
        .where(eq(devices.id, existing.id))
        .run();
      updated++;
    } else {
      db.insert(devices)
        .values({
          name: snapshot.hostname ?? `جهاز ${mac.slice(-5)}`,
          macAddress: mac,
          ipAddress: snapshot.ip,
          hostname: snapshot.hostname,
          status,
          lastSeenAt: snapshot.online ? new Date() : null,
        })
        .run();
      created++;
    }
  }

  return { discovered: snapshots.length, created, updated };
}

function computeDeltas(
  snapshots: RouterDeviceSnapshot[],
  intervalSeconds: number,
): Map<
  string,
  {
    downloadBytes: number;
    uploadBytes: number;
    downloadBps: number;
    uploadBps: number;
  }
> {
  const counters = state().lastCounters;
  const out = new Map<
    string,
    {
      downloadBytes: number;
      uploadBytes: number;
      downloadBps: number;
      uploadBps: number;
    }
  >();
  const now = Date.now();

  for (const snapshot of snapshots) {
    const mac = normalizeMac(snapshot.mac);
    const previous = counters.get(mac);

    let downloadBytes = 0;
    let uploadBytes = 0;

    if (previous && !snapshot.online) {
      // Device just went away — keep the counter for the next sighting.
      continue;
    }

    if (previous) {
      const dtSeconds = Math.max(
        0.5,
        (now - previous.at) / 1000 || intervalSeconds,
      );
      const rxDelta = snapshot.rxBytesTotal - previous.rx;
      const txDelta = snapshot.txBytesTotal - previous.tx;

      // Counter reset (router reboot) → skip this tick, never negative.
      if (rxDelta >= 0) downloadBytes = rxDelta;
      if (txDelta >= 0) uploadBytes = txDelta;

      const fromRates =
        snapshot.rxBps != null && snapshot.txBps != null
          ? {
              downloadBps: snapshot.rxBps,
              uploadBps: snapshot.txBps,
            }
          : null;

      out.set(mac, {
        downloadBytes,
        uploadBytes,
        downloadBps:
          fromRates?.downloadBps ?? bpsFromDelta(downloadBytes, dtSeconds),
        uploadBps:
          fromRates?.uploadBps ?? bpsFromDelta(uploadBytes, dtSeconds),
      });
    }

    counters.set(mac, {
      rx: snapshot.rxBytesTotal,
      tx: snapshot.txBytesTotal,
      at: now,
    });
  }

  return out;
}

function recordSamples(
  deltas: Map<
    string,
    {
      downloadBytes: number;
      uploadBytes: number;
      downloadBps: number;
      uploadBps: number;
    }
  >,
  timestamp: Date,
): void {
  if (deltas.size === 0) return;
  const db = getDb();
  const rows = db
    .select({ id: devices.id, macAddress: devices.macAddress })
    .from(devices)
    .all();
  const byMac = new Map(rows.map((r) => [r.macAddress, r.id]));
  const date = dateKey(timestamp);
  const { year, month } = monthKey(timestamp);

  db.transaction((tx) => {
    for (const [mac, delta] of deltas) {
      const deviceId = byMac.get(mac);
      if (!deviceId) continue;

      tx.insert(trafficSamples)
        .values({
          deviceId,
          downloadBytes: delta.downloadBytes,
          uploadBytes: delta.uploadBytes,
          downloadBps: delta.downloadBps,
          uploadBps: delta.uploadBps,
          timestamp,
        })
        .run();

      if (delta.downloadBytes === 0 && delta.uploadBytes === 0) continue;

      tx.insert(usageDaily)
        .values({
          deviceId,
          date,
          downloadBytes: delta.downloadBytes,
          uploadBytes: delta.uploadBytes,
        })
        .onConflictDoUpdate({
          target: [usageDaily.deviceId, usageDaily.date],
          set: {
            downloadBytes: sql`${usageDaily.downloadBytes} + ${delta.downloadBytes}`,
            uploadBytes: sql`${usageDaily.uploadBytes} + ${delta.uploadBytes}`,
          },
        })
        .run();

      tx.insert(usageMonthly)
        .values({
          deviceId,
          year,
          month,
          downloadBytes: delta.downloadBytes,
          uploadBytes: delta.uploadBytes,
        })
        .onConflictDoUpdate({
          target: [usageMonthly.deviceId, usageMonthly.year, usageMonthly.month],
          set: {
            downloadBytes: sql`${usageMonthly.downloadBytes} + ${delta.downloadBytes}`,
            uploadBytes: sql`${usageMonthly.uploadBytes} + ${delta.uploadBytes}`,
          },
        })
        .run();
    }
  });
}

/** Marks devices unseen for 2 × interval as offline. */
function markStaleDevices(intervalMs: number): void {
  const threshold = new Date(Date.now() - intervalMs * 2);
  getDb()
    .update(devices)
    .set({ status: "offline", updatedAt: new Date() })
    .where(
      and(
        eq(devices.status, "online"),
        sql`coalesce(${devices.lastSeenAt}, 0) < ${Math.floor(threshold.getTime() / 1000)}`,
      ),
    )
    .run();
}

/** Applies pending speed-limit intent to the router. */
async function enforceSpeedLimits(): Promise<void> {
  const adapter = getNetworkAdapter();
  const pending = pendingLimitRows();
  for (const row of pending) {
    try {
      if (row.enabled) {
        await adapter.applySpeedLimit(
          row.macAddress,
          row.downloadMbps,
          row.uploadMbps,
        );
        markApplied(row.id, new Date());
      } else {
        await adapter.removeSpeedLimit(row.macAddress);
        markApplied(row.id, null);
      }
    } catch (err) {
      console.error(
        `[NetWatch] Failed to enforce speed limit for ${row.macAddress}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

function pruneSamples(retentionDays: number): void {
  const threshold = new Date(Date.now() - retentionDays * 86_400_000);
  getDb()
    .delete(trafficSamples)
    .where(lt(trafficSamples.timestamp, threshold))
    .run();
}

export async function runPollerTick(): Promise<void> {
  const s = state();
  if (s.ticking) return; // never overlap
  s.ticking = true;

  const runtime = getRuntimeSettings();
  const adapter = getNetworkAdapter();

  try {
    await adapter.connect().catch(() => undefined);

    const snapshots = await adapter.discover();
    const result = upsertDiscoveredDevices(snapshots);
    if (result.created > 0 && getRuntimeSettings().pollIntervalMs > 0) {
      maybeAssignUnownedDevices(getDb().select().from(devices).all().length);
    }

    const deltas = computeDeltas(snapshots, runtime.pollIntervalMs / 1000);
    const now = new Date();

    recordSamples(deltas, now);
    markStaleDevices(runtime.pollIntervalMs);
    await enforceSpeedLimits();
    pruneSamples(runtime.sampleRetentionDays);

    recordPoll(now, adapter.status().lastError);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[NetWatch] Poller tick failed:", message);
    recordPoll(new Date(), message);
  } finally {
    s.ticking = false;
  }
}

/** Starts the background loop (idempotent, HMR-safe). */
export function startPoller(): void {
  const s = state();
  if (s.started) return;
  s.started = true;
  s.running = true;

  const runtime = getRuntimeSettings();
  const adapter = getNetworkAdapter();
  adapter.setConnectionConfig(runtime.mikrotik);

  const loop = async () => {
    await runPollerTick();
    const s2 = state();
    if (!s2.running) return;
    const interval = getRuntimeSettings().pollIntervalMs;
    s2.timer = setTimeout(() => void loop(), interval);
  };

  void loop();
}

export function stopPoller(): void {
  const s = state();
  s.running = false;
  s.started = false;
  if (s.timer) clearTimeout(s.timer);
  s.timer = null;
}

export function pollerStatus(): { running: boolean; ticking: boolean } {
  const s = state();
  return { running: s.running, ticking: s.ticking };
}

export { normalizeMac };
