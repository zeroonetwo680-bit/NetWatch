import "server-only";

import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { settings, trafficSamples } from "@/db/schema";
import { appConfig } from "@/lib/config";
import { getNetworkAdapter } from "@/lib/network";
import type {
  AdapterCapabilities,
  MikrotikConnectionConfig,
  NetworkMode,
  TotalThroughput,
} from "@/lib/network/types";
import { ApiError } from "../errors";

export type RuntimeSettings = {
  pollIntervalMs: number;
  sampleRetentionDays: number;
  mikrotik: MikrotikConnectionConfig & { hasPassword: boolean };
};

const globalForRuntime = globalThis as unknown as {
  netwatchRuntimeSettings?: RuntimeSettings;
};

export const SETTINGS_KEY = "runtime";
export const LAST_ERROR_KEY = "last_error";
export const LAST_POLL_KEY = "last_poll_at";

function persist(next: RuntimeSettings): void {
  getDb()
    .insert(settings)
    .values({
      key: SETTINGS_KEY,
      value: JSON.stringify({
        pollIntervalMs: next.pollIntervalMs,
        sampleRetentionDays: next.sampleRetentionDays,
        mikrotik: {
          host: next.mikrotik.host,
          port: next.mikrotik.port,
          user: next.mikrotik.user,
        },
      }),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: JSON.stringify({
        pollIntervalMs: next.pollIntervalMs,
        sampleRetentionDays: next.sampleRetentionDays,
        mikrotik: {
          host: next.mikrotik.host,
          port: next.mikrotik.port,
          user: next.mikrotik.user,
        },
      }), updatedAt: new Date() },
    })
    .run();
}

/** Runtime settings, seeded from env on first read. In-memory cached. */
export function getRuntimeSettings(): RuntimeSettings {
  if (globalForRuntime.netwatchRuntimeSettings) {
    return globalForRuntime.netwatchRuntimeSettings;
  }

  const row = getDb()
    .select()
    .from(settings)
    .where(eq(settings.key, SETTINGS_KEY))
    .get();

  let next: RuntimeSettings = {
    pollIntervalMs: appConfig.pollIntervalMs,
    sampleRetentionDays: appConfig.sampleRetentionDays,
    mikrotik: {
      host: appConfig.mikrotik.host,
      port: appConfig.mikrotik.port,
      user: appConfig.mikrotik.user,
      // Password comes from env only — never persisted to the DB.
      password: appConfig.mikrotik.password,
      hasPassword: appConfig.mikrotik.password.length > 0,
    },
  };

  if (row) {
    try {
      const parsed = JSON.parse(row.value) as Partial<RuntimeSettings> & {
        mikrotik?: Partial<MikrotikConnectionConfig>;
      };
      next = {
        pollIntervalMs: parsed.pollIntervalMs ?? next.pollIntervalMs,
        sampleRetentionDays:
          parsed.sampleRetentionDays ?? next.sampleRetentionDays,
        mikrotik: {
          host: parsed.mikrotik?.host ?? next.mikrotik.host,
          port: parsed.mikrotik?.port ?? next.mikrotik.port,
          user: parsed.mikrotik?.user ?? next.mikrotik.user,
          password: next.mikrotik.password,
          hasPassword: next.mikrotik.hasPassword,
        },
      };
    } catch {
      // Corrupt row → fall back to env defaults.
    }
  }

  globalForRuntime.netwatchRuntimeSettings = next;
  return next;
}

export type SettingsPatch = {
  pollIntervalMs?: number;
  sampleRetentionDays?: number;
  mikrotik?: {
    host?: string;
    port?: number;
    user?: string;
    password?: string;
  };
};

export function updateRuntimeSettings(patch: SettingsPatch): RuntimeSettings {
  const current = getRuntimeSettings();
  const next: RuntimeSettings = {
    pollIntervalMs: patch.pollIntervalMs ?? current.pollIntervalMs,
    sampleRetentionDays:
      patch.sampleRetentionDays ?? current.sampleRetentionDays,
    mikrotik: {
      host: patch.mikrotik?.host ?? current.mikrotik.host,
      port: patch.mikrotik?.port ?? current.mikrotik.port,
      user: patch.mikrotik?.user ?? current.mikrotik.user,
      password: patch.mikrotik?.password ?? current.mikrotik.password,
      hasPassword:
        (patch.mikrotik?.password ?? "").length > 0 || current.mikrotik.hasPassword,
    },
  };

  globalForRuntime.netwatchRuntimeSettings = next;
  persist(next);
  getNetworkAdapter().setConnectionConfig(next.mikrotik);
  return next;
}

function writeSetting(key: string, value: string): void {
  getDb()
    .insert(settings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: new Date() },
    })
    .run();
}

function readSetting(key: string): string | null {
  return (
    getDb().select().from(settings).where(eq(settings.key, key)).get()?.value ??
    null
  );
}

export function recordPoll(lastPollAt: Date, error: string | null): void {
  writeSetting(LAST_POLL_KEY, lastPollAt.toISOString());
  writeSetting(LAST_ERROR_KEY, error ?? "");
}

export function getLastPoll(): { at: string | null; error: string | null } {
  const at = readSetting(LAST_POLL_KEY);
  const error = readSetting(LAST_ERROR_KEY);
  return { at, error: error && error.length > 0 ? error : null };
}

export type SystemStatus = {
  networkMode: NetworkMode;
  routerConnected: boolean;
  lastPollAt: string | null;
  lastError: string | null;
  pollIntervalMs: number;
  sampleCount: number;
  /** What the active data source can actually do (drives UI affordances). */
  capabilities: AdapterCapabilities;
  /** Network-wide WAN throughput when the source can measure it. */
  totalThroughput: TotalThroughput | null;
};

export async function getSystemStatus(): Promise<SystemStatus> {
  const adapter = getNetworkAdapter();
  const status = adapter.status();
  const runtime = getRuntimeSettings();
  const lastPoll = getLastPoll();

  const sampleCount =
    getDb()
      .select({ count: sql<number>`count(*)` })
      .from(trafficSamples)
      .get()?.count ?? 0;

  const totalThroughput = await adapter.totalThroughput?.();

  return {
    networkMode: status.mode,
    routerConnected: status.connected,
    lastPollAt: lastPoll.at ?? status.lastPollAt,
    lastError: lastPoll.error ?? status.lastError,
    pollIntervalMs: runtime.pollIntervalMs,
    sampleCount,
    capabilities: status.capabilities,
    totalThroughput: totalThroughput ?? null,
  };
}

/** Tests the live MikroTik connection (settings → "اختبار الاتصال"). */
export async function testMikrotikConnection(): Promise<{
  ok: boolean;
  identity: string | null;
  message: string | null;
}> {
  const adapter = getNetworkAdapter();
  if (adapter.mode !== "mikrotik") {
    throw new ApiError(
      422,
      "BAD_REQUEST",
      "النظام يعمل في وضع المحاكاة — لا يوجد راوتر للاتصال به.",
    );
  }
  const result = await (
    adapter as unknown as {
      testConnection: () => Promise<{ ok: boolean; identity?: string }>;
    }
  ).testConnection();

  if (result.ok) return { ok: true, identity: result.identity ?? null, message: null };
  return {
    ok: false,
    identity: null,
    message: result.identity ?? "تعذّر الاتصال بالراوتر.",
  };
}
