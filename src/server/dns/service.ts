import "server-only";

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { devices, dnsBlockedDevices, dnsRules } from "@/db/schema";
import type { DnsRule } from "@/db/schema";
import { matchesDomainRule } from "./packet";

export type DnsQueryLogItem = {
  id: string;
  timestamp: string;
  clientIp: string;
  deviceName: string | null;
  domain: string;
  qtype: string;
  action: "allowed" | "blocked";
  reason: string | null;
};

export type DnsStats = {
  totalQueries: number;
  blockedQueries: number;
  blockPercentage: number;
  activeRulesCount: number;
  blockedDevicesCount: number;
};

type DnsState = {
  rulesCache: DnsRule[] | null;
  blockedIpsCache: Map<string, string> | null; // ip -> deviceName
  cacheInvalidatedAt: number;
  totalQueries: number;
  blockedQueries: number;
  logBuffer: DnsQueryLogItem[];
  counter: number;
};

const globalForDnsService = globalThis as unknown as {
  netwatchDnsServiceState?: DnsState;
};

function state(): DnsState {
  if (!globalForDnsService.netwatchDnsServiceState) {
    globalForDnsService.netwatchDnsServiceState = {
      rulesCache: null,
      blockedIpsCache: null,
      cacheInvalidatedAt: 0,
      totalQueries: 0,
      blockedQueries: 0,
      logBuffer: [],
      counter: 0,
    };
  }
  return globalForDnsService.netwatchDnsServiceState;
}

export function invalidateDnsCache(): void {
  const s = state();
  s.rulesCache = null;
  s.blockedIpsCache = null;
  s.cacheInvalidatedAt = Date.now();
}

/**
 * Returns all active blocking rules from cache or DB.
 */
export function getActiveDnsRules(): DnsRule[] {
  const s = state();
  if (s.rulesCache) return s.rulesCache;

  const db = getDb();
  const rules = db.select().from(dnsRules).where(eq(dnsRules.enabled, true)).all();
  s.rulesCache = rules;
  return rules;
}

/**
 * Fast lookup map for IPs of devices that have their internet blocked via DNS.
 */
export function getBlockedDevicesMap(): Map<string, string> {
  const s = state();
  if (s.blockedIpsCache) return s.blockedIpsCache;

  const db = getDb();
  const rows = db
    .select({
      ipAddress: devices.ipAddress,
      deviceName: devices.name,
      blockAll: dnsBlockedDevices.blockAll,
    })
    .from(dnsBlockedDevices)
    .innerJoin(devices, eq(devices.id, dnsBlockedDevices.deviceId))
    .where(eq(dnsBlockedDevices.blockAll, true))
    .all();

  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.ipAddress) {
      map.set(row.ipAddress, row.deviceName);
    }
  }

  s.blockedIpsCache = map;
  return map;
}

export type DnsDecision =
  | { action: "blocked"; reason: string; deviceName: string | null }
  | { action: "allowed"; deviceName: string | null };

/**
 * Checks if a DNS query from clientIp for domain should be blocked.
 */
export function evaluateDnsQuery(
  clientIp: string,
  domain: string,
): DnsDecision {
  const blockedMap = getBlockedDevicesMap();

  // 1. Device internet block check
  const blockedDeviceName = blockedMap.get(clientIp);
  if (blockedDeviceName) {
    return {
      action: "blocked",
      reason: `قطع الإنترنت عن الجهاز (${blockedDeviceName})`,
      deviceName: blockedDeviceName,
    };
  }

  // Find device name for logging even if not blocked
  const deviceName = lookupDeviceName(clientIp);

  // 2. Domain rules check
  const rules = getActiveDnsRules();
  for (const rule of rules) {
    if (matchesDomainRule(domain, rule.domain)) {
      if (rule.action === "block") {
        return {
          action: "blocked",
          reason: rule.comment ? `${rule.domain} (${rule.comment})` : rule.domain,
          deviceName,
        };
      }
      if (rule.action === "allow") {
        return { action: "allowed", deviceName };
      }
    }
  }

  return { action: "allowed", deviceName };
}

function lookupDeviceName(ip: string): string | null {
  try {
    const row = getDb()
      .select({ name: devices.name })
      .from(devices)
      .where(eq(devices.ipAddress, ip))
      .get();
    return row?.name ?? null;
  } catch {
    return null;
  }
}

/**
 * Records a DNS query in the in-memory ring buffer (up to 500 items).
 */
export function recordDnsLog(item: {
  clientIp: string;
  deviceName: string | null;
  domain: string;
  qtype: string;
  action: "allowed" | "blocked";
  reason: string | null;
}): void {
  const s = state();
  s.totalQueries++;
  if (item.action === "blocked") s.blockedQueries++;

  s.counter++;
  const entry: DnsQueryLogItem = {
    id: `log-${s.counter}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    ...item,
  };

  s.logBuffer.unshift(entry);
  if (s.logBuffer.length > 500) {
    s.logBuffer.pop();
  }
}

export function getDnsLogs(options: {
  search?: string;
  action?: "allowed" | "blocked";
  limit?: number;
} = {}): { items: DnsQueryLogItem[]; total: number } {
  const s = state();
  let items = s.logBuffer;

  if (options.action) {
    items = items.filter((i) => i.action === options.action);
  }

  if (options.search) {
    const term = options.search.toLowerCase();
    items = items.filter(
      (i) =>
        i.domain.toLowerCase().includes(term) ||
        i.clientIp.includes(term) ||
        (i.deviceName && i.deviceName.toLowerCase().includes(term)),
    );
  }

  const limit = Math.min(options.limit ?? 100, 200);
  return {
    items: items.slice(0, limit),
    total: s.logBuffer.length,
  };
}

export function getDnsStats(): DnsStats {
  const s = state();
  const db = getDb();

  const activeRulesCount =
    db
      .select()
      .from(dnsRules)
      .where(eq(dnsRules.enabled, true))
      .all().length;

  const blockedDevicesCount =
    db
      .select()
      .from(dnsBlockedDevices)
      .where(eq(dnsBlockedDevices.blockAll, true))
      .all().length;

  const total = s.totalQueries;
  const blocked = s.blockedQueries;
  const blockPercentage = total > 0 ? Math.round((blocked / total) * 100) : 0;

  return {
    totalQueries: total,
    blockedQueries: blocked,
    blockPercentage,
    activeRulesCount,
    blockedDevicesCount,
  };
}

// ── CRUD for DNS Rules ───────────────────────────────────────────────────

export function listDnsRules(): DnsRule[] {
  return getDb().select().from(dnsRules).orderBy(desc(dnsRules.createdAt)).all();
}

export function addDnsRule(data: {
  domain: string;
  action?: "block" | "allow";
  category?: string;
  comment?: string | null;
  enabled?: boolean;
}): DnsRule {
  const normalized = data.domain.trim().toLowerCase();
  const db = getDb();

  const inserted = db
    .insert(dnsRules)
    .values({
      domain: normalized,
      action: data.action ?? "block",
      category: data.category ?? "custom",
      comment: data.comment?.trim() || null,
      enabled: data.enabled ?? true,
      createdAt: new Date(),
    })
    .returning()
    .get();

  invalidateDnsCache();
  return inserted;
}

export function updateDnsRule(
  id: number,
  patch: Partial<Pick<DnsRule, "domain" | "action" | "category" | "comment" | "enabled">>,
): DnsRule | null {
  const db = getDb();
  const values: Partial<typeof dnsRules.$inferInsert> = {};

  if (patch.domain !== undefined) values.domain = patch.domain.trim().toLowerCase();
  if (patch.action !== undefined) values.action = patch.action;
  if (patch.category !== undefined) values.category = patch.category;
  if (patch.comment !== undefined) values.comment = patch.comment ? patch.comment.trim() : null;
  if (patch.enabled !== undefined) values.enabled = patch.enabled;

  const updated = db
    .update(dnsRules)
    .set(values)
    .where(eq(dnsRules.id, id))
    .returning()
    .get();

  invalidateDnsCache();
  return updated ?? null;
}

export function deleteDnsRule(id: number): boolean {
  const db = getDb();
  const result = db.delete(dnsRules).where(eq(dnsRules.id, id)).run();
  invalidateDnsCache();
  return result.changes > 0;
}

// ── Device DNS Block Switches ────────────────────────────────────────────

export type DeviceDnsBlockItem = {
  deviceId: number;
  deviceName: string;
  macAddress: string;
  ipAddress: string | null;
  blockedViaDns: boolean;
};

export function listDevicesWithDnsBlock(): DeviceDnsBlockItem[] {
  const db = getDb();
  const allDevices = db.select().from(devices).all();
  const blockedRows = db.select().from(dnsBlockedDevices).all();
  const blockedMap = new Map(blockedRows.map((b) => [b.deviceId, b.blockAll]));

  return allDevices.map((d) => ({
    deviceId: d.id,
    deviceName: d.name,
    macAddress: d.macAddress,
    ipAddress: d.ipAddress,
    blockedViaDns: Boolean(blockedMap.get(d.id)),
  }));
}

export function toggleDeviceDnsBlock(deviceId: number, blockAll: boolean): void {
  const db = getDb();

  if (blockAll) {
    db.insert(dnsBlockedDevices)
      .values({
        deviceId,
        blockAll: true,
        createdAt: new Date(),
      })
      .onConflictDoUpdate({
        target: dnsBlockedDevices.deviceId,
        set: { blockAll: true },
      })
      .run();
  } else {
    db.delete(dnsBlockedDevices).where(eq(dnsBlockedDevices.deviceId, deviceId)).run();
  }

  invalidateDnsCache();
}

/**
 * Seeds popular default domain blocking rules if table is empty.
 */
export function seedDefaultDnsRulesIfEmpty(): void {
  const db = getDb();
  const count = db.select().from(dnsRules).all().length;
  if (count > 0) return;

  const defaults = [
    { domain: "tiktok.com", category: "social", comment: "حظر تطبيق وموقع تيك توك" },
    { domain: "byteoversea.com", category: "social", comment: "خوادم وسائط تيك توك" },
    { domain: "doubleclick.net", category: "ads", comment: "إعلانات جوجل وشبكات التتبع" },
    { domain: "adservice.google.com", category: "ads", comment: "خدمات الإعلانات" },
  ];

  for (const d of defaults) {
    db.insert(dnsRules)
      .values({
        domain: d.domain,
        action: "block",
        enabled: false, // Default to disabled so user chooses when to enable
        category: d.category,
        comment: d.comment,
        createdAt: new Date(),
      })
      .run();
  }
}
