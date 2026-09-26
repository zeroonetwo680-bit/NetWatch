import type {
  AdapterStatus,
  MikrotikConnectionConfig,
  NetworkAdapter,
  RouterDeviceSnapshot,
} from "./types";
import { AdapterError } from "./types";
import { normalizeMac } from "@/lib/usage/calculator";

/**
 * MikroTik RouterOS adapter (binary API, default port 8728).
 *
 * This is the ONLY file that is allowed to know about routeros-api.
 * It must be resilient: a dead/unreachable router is a supported runtime
 * state — the poller keeps serving stored data and reports lastError.
 *
 * Required RouterOS setup:
 *   /ip service set api disabled=no port=8728
 *   /user group add name=netwatch policy=read,write,test,api
 *   /user add name=netwatch group=netwatch password=…
 */

type RouterOSApiLike = {
  connected: boolean;
  connect(): Promise<RouterOSApiLike>;
  close(): Promise<unknown>;
  write(
    params: string | string[],
    ...moreParams: Array<string | string[]>
  ): Promise<Record<string, unknown>[]>;
};

type RouterOSClientLike = {
  connect(): Promise<{ menu(path: string): RosMenuLike }>;
  close(): Promise<unknown>;
};

type RosMenuLike = {
  where(key: string, value?: string): RosMenuLike;
  get(): Promise<Record<string, unknown>[]>;
  add(data: Record<string, unknown>): Promise<unknown>;
  remove(ids?: unknown): Promise<unknown>;
};

const QUEUE_PREFIX = "netwatch-";
const BLOCK_PREFIX = "netwatch-block-";

/** "2M/10M" → Mbps. RouterOS also emits "10M", "500k", "1G". */
function parseRouterOsRate(value: unknown): number {
  if (typeof value === "number") return value / 1_000_000;
  if (typeof value !== "string" || value.length === 0) return 0;
  const match = value.match(/^([\d.]+)\s*([kKMG]?)/);
  if (!match) return 0;
  const num = Number.parseFloat(match[1]);
  if (!Number.isFinite(num)) return 0;
  const mult = { "": 1, k: 1e3, K: 1e3, M: 1e6, G: 1e9 }[match[2] as ""] ?? 1;
  return (num * mult) / 1e6;
}

/** RouterOS "1h2m3s" / "3d" / "120" → seconds. */
function parseRouterOsDuration(value: unknown): number | null {
  if (typeof value !== "string" || !value) return null;
  let total = 0;
  const re = /(\d+)([wdhms])/g;
  let m: RegExpExecArray | null;
  let matched = false;
  const unitSeconds: Record<string, number> = {
    w: 604800,
    d: 86400,
    h: 3600,
    m: 60,
    s: 1,
  };
  while ((m = re.exec(value)) !== null) {
    matched = true;
    total += Number(m[1]) * (unitSeconds[m[2]] ?? 0);
  }
  if (!matched) {
    const plain = Number.parseFloat(value);
    return Number.isFinite(plain) ? plain : null;
  }
  return total;
}

export class MikrotikNetwork implements NetworkAdapter {
  readonly mode = "mikrotik" as const;

  private api: RouterOSApiLike | null = null;
  private client: RouterOSClientLike | null = null;
  private config: MikrotikConnectionConfig;
  private connected = false;
  private lastPollAt: string | null = null;
  private lastError: string | null = null;
  private lastDeviceCount = 0;
  private connecting: Promise<void> | null = null;
  private reconnectAfter = 0;

  constructor(config: MikrotikConnectionConfig) {
    this.config = config;
  }

  setConnectionConfig(config: MikrotikConnectionConfig): void {
    const changed =
      config.host !== this.config.host ||
      config.port !== this.config.port ||
      config.user !== this.config.user ||
      config.password !== this.config.password;
    this.config = config;
    if (changed) void this.disconnect();
  }

  /** Idempotent, backoff-guarded connection attempt. */
  async connect(): Promise<void> {
    if (this.connected) return;
    if (this.connecting) return this.connecting;
    if (Date.now() < this.reconnectAfter) {
      throw new AdapterError(this.lastError ?? "Router temporarily unreachable");
    }

    this.connecting = this.doConnect()
      .catch((err: unknown) => {
        this.connected = false;
        this.api = null;
        this.client = null;
        this.lastError = `فشل الاتصال بالراوتر ${this.config.host}:${this.config.port} — ${
          err instanceof Error ? err.message : String(err)
        }`;
        this.reconnectAfter = Date.now() + 10_000;
        throw new AdapterError(this.lastError, err);
      })
      .finally(() => {
        this.connecting = null;
      });

    return this.connecting;
  }

  private async doConnect(): Promise<void> {
    const mod = (await import("routeros-api")) as {
      RouterOSAPI: new (o: unknown) => RouterOSApiLike;
      RouterOSClient: new (o: unknown) => RouterOSClientLike;
    };

    const api = new mod.RouterOSAPI({
      host: this.config.host,
      port: this.config.port,
      user: this.config.user,
      password: this.config.password,
      timeout: 10,
      keepalive: true,
    });
    await api.connect();

    this.api = api;
    this.client = new mod.RouterOSClient({
      host: this.config.host,
      port: this.config.port,
      user: this.config.user,
      password: this.config.password,
      timeout: 10,
    });
    this.connected = true;
    this.lastError = null;
    this.reconnectAfter = 0;
  }

  async disconnect(): Promise<void> {
    try {
      await this.api?.close();
      await this.client?.close();
    } catch {
      // Closing a dead socket is not an error worth propagating.
    }
    this.api = null;
    this.client = null;
    this.connected = false;
  }

  status(): AdapterStatus {
    return {
      mode: this.mode,
      connected: this.connected,
      lastPollAt: this.lastPollAt,
      lastError: this.lastError,
      deviceCount: this.lastDeviceCount,
    };
  }

  private async menu(path: string): Promise<RosMenuLike> {
    await this.connect();
    if (!this.client) throw new AdapterError("Router client unavailable");
    const c = await this.client.connect();
    return c.menu(path);
  }

  async discover(): Promise<RouterDeviceSnapshot[]> {
    try {
      const [leases, arp] = await Promise.all([
        this.menu("/ip/dhcp-server/lease").then((m) =>
          m.get().catch(() => [] as Record<string, unknown>[]),
        ),
        this.menu("/ip/arp").then((m) =>
          m.get().catch(() => [] as Record<string, unknown>[]),
        ),
      ]);

      // ARP is the authority for "currently online"; leases give hostnames.
      const byMac = new Map<string, RouterDeviceSnapshot>();

      for (const row of arp) {
        const mac = normalizeMac(String(row["mac-address"] ?? ""));
        if (!mac) continue;
        const complete = row.complete === "true" || row.complete === true;
        const invalid = row.invalid === "true" || row.invalid === true;
        byMac.set(mac, {
          mac,
          ip: (row.address as string) ?? null,
          hostname: null,
          online: complete && !invalid,
          rxBytesTotal: 0,
          txBytesTotal: 0,
          rxBps: null,
          txBps: null,
        });
      }

      for (const row of leases) {
        const mac = normalizeMac(String(row["mac-address"] ?? ""));
        if (!mac) continue;
        const existing = byMac.get(mac);
        const snapshot: RouterDeviceSnapshot = existing ?? {
          mac,
          ip: (row.address as string) ?? null,
          hostname: null,
          online: false,
          rxBytesTotal: 0,
          txBytesTotal: 0,
          rxBps: null,
          txBps: null,
        };
        snapshot.ip = snapshot.ip ?? ((row.address as string) ?? null);
        snapshot.hostname =
          (row["host-name"] as string) ?? (row.comment as string) ?? null;
        const status = String(row.status ?? "");
        if (status === "bound" && row.active === "true") snapshot.online = true;
        if (row.blocked === "true") snapshot.online = false;
        byMac.set(mac, snapshot);
      }

      // Per-device counters: RouterOS has no cumulative per-host byte counter.
      // We approximate from the per-device rate of the interface/queue, and
      // derive deltas from rates × interval (see poller). Where a simple queue
      // exists for the MAC we use its live rate, otherwise we fall back to 0
      // and let the poller estimate from connection tracking.
      const rates = await this.readQueueRates();
      for (const [mac, snapshot] of byMac) {
        const rate = rates.get(mac);
        if (rate) {
          snapshot.rxBps = rate.rxBps;
          snapshot.txBps = rate.txBps;
        }
      }

      this.lastError = null;
      this.lastPollAt = new Date().toISOString();
      const snapshots = [...byMac.values()];
      this.lastDeviceCount = snapshots.filter((s) => s.online).length;
      return snapshots;
    } catch (err) {
      this.connected = false;
      this.api = null;
      this.client = null;
      this.lastError =
        err instanceof Error ? err.message : "خطأ غير معروف في الاتصال بالراوتر";
      this.reconnectAfter = Date.now() + 10_000;
      throw err instanceof AdapterError
        ? err
        : new AdapterError(this.lastError, err);
    }
  }

  /** Reads live per-device rates from simple queues (Mbps → bps). */
  private async readQueueRates(): Promise<
    Map<string, { rxBps: number; txBps: number }>
  > {
    const out = new Map<string, { rxBps: number; txBps: number }>();
    try {
      const rows = await this.menu("/queue/simple").then((m) =>
        m.get().catch(() => [] as Record<string, unknown>[]),
      );
      for (const row of rows) {
        const name = String(row.name ?? "");
        if (!name.startsWith(QUEUE_PREFIX)) continue;
        const mac = name.slice(QUEUE_PREFIX.length).toUpperCase();
        const rate = String(row.rate ?? ""); // "0/0" up/down (RouterOS order)
        const [upRaw, downRaw] = rate.split("/");
        out.set(mac, {
          txBps: parseRouterOsRate(upRaw) * 1e6,
          rxBps: parseRouterOsRate(downRaw ?? "0") * 1e6,
        });
      }
    } catch {
      // Rates are best-effort; discovery still succeeds without them.
    }
    return out;
  }

  async applySpeedLimit(
    mac: string,
    downloadMbps: number,
    uploadMbps: number,
  ): Promise<void> {
    const normalized = normalizeMac(mac);
    const name = `${QUEUE_PREFIX}${normalized}`;
    // RouterOS max-limit order is upload/download (tx/rx).
    const maxLimit = `${Math.round(uploadMbps * 100) / 100}M/${Math.round(downloadMbps * 100) / 100}M`;
    try {
      const menu = await this.menu("/queue/simple");
      const existing = await menu
        .where("name", name)
        .get()
        .catch(() => [] as Record<string, unknown>[]);
      if (existing.length > 0) {
        // RosApiCommands.update is available on the menu object.
        await (menu as unknown as {
          update: (
            data: Record<string, unknown>,
            ids: string,
          ) => Promise<unknown>;
        }).update({ maxLimit }, existing[0][".id"] as string);
      } else {
        const target = await this.resolveTarget(normalized);
        await menu.add({ name, target, maxLimit, queue: "default/default" });
      }
      this.lastError = null;
    } catch (err) {
      this.lastError = `تعذّر تطبيق حد السرعة على ${normalized}: ${
        err instanceof Error ? err.message : String(err)
      }`;
      throw new AdapterError(this.lastError, err);
    }
  }

  async removeSpeedLimit(mac: string): Promise<void> {
    const normalized = normalizeMac(mac);
    const name = `${QUEUE_PREFIX}${normalized}`;
    try {
      const menu = await this.menu("/queue/simple");
      const existing = await menu
        .where("name", name)
        .get()
        .catch(() => [] as Record<string, unknown>[]);
      for (const row of existing) {
        await menu.remove(row[".id"]);
      }
    } catch (err) {
      this.lastError = `تعذّر إزالة حد السرعة من ${normalized}: ${
        err instanceof Error ? err.message : String(err)
      }`;
      throw new AdapterError(this.lastError, err);
    }
  }

  async setBlocked(mac: string, blocked: boolean): Promise<void> {
    const normalized = normalizeMac(mac);
    const comment = `${BLOCK_PREFIX}${normalized}`;
    try {
      const menu = await this.menu("/ip/firewall/filter");
      const existing = await menu
        .where("comment", comment)
        .get()
        .catch(() => [] as Record<string, unknown>[]);
      if (blocked) {
        if (existing.length === 0) {
          const target = await this.resolveTarget(normalized);
          await menu.add({
            chain: "forward",
            action: "drop",
            comment,
            ...(target.includes(":")
              ? { "src-mac-address": target }
              : { "src-address": target }),
          });
        }
      } else {
        for (const row of existing) await menu.remove(row[".id"]);
      }
      this.lastError = null;
    } catch (err) {
      this.lastError = `تعذّر ${blocked ? "حظر" : "إلغاء حظر"} الجهاز ${normalized}: ${
        err instanceof Error ? err.message : String(err)
      }`;
      throw new AdapterError(this.lastError, err);
    }
  }

  /**
   * Resolves a queue/firewall target for a MAC: prefers the current IP from
   * ARP (dynamic IPs), falls back to "<ip>/32" or the MAC itself.
   */
  private async resolveTarget(mac: string): Promise<string> {
    try {
      const rows = await this.menu("/ip/arp").then((m) =>
        m.get().catch(() => [] as Record<string, unknown>[]),
      );
      const hit = rows.find(
        (r) => normalizeMac(String(r["mac-address"] ?? "")) === mac,
      );
      if (hit?.address) return `${String(hit.address)}/32`;
    } catch {
      // Fall through to the MAC-based target.
    }
    return mac;
  }

  /** Exposed for the connection test in settings: measures a real round-trip. */
  async testConnection(): Promise<{ ok: boolean; identity?: string }> {
    try {
      const menu = await this.menu("/system/identity");
      const rows = await menu.get().catch(() => [] as Record<string, unknown>[]);
      return { ok: true, identity: rows[0]?.name as string | undefined };
    } catch (err) {
      return {
        ok: false,
        identity: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

export { parseRouterOsDuration, parseRouterOsRate };
