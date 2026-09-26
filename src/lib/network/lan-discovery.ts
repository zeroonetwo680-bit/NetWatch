import dgram from "node:dgram";
import dnsPromises from "node:dns/promises";
import { execFile } from "node:child_process";
import { networkInterfaces } from "node:os";

import {
  expandCidr,
  mapWithConcurrency,
  parseArpOutput,
  subnetFromAddress,
  toMac,
  vendorFromMac,
} from "./lan-helpers";
import {
  AdapterStatus,
  NetworkMode,
  RouterDeviceSnapshot,
  TotalThroughput,
  UnsupportedOperationError,
  type AdapterCapabilities,
  type AdapterError,
  type MikrotikConnectionConfig,
  type NetworkAdapter,
} from "./types";

/**
 * Hardware-free-of-router-API data source: discovers whatever is actually
 * plugged into the local network by reading the OS ARP/neighbour table and
 * (optionally) sweeping the subnet with pings.
 *
 * Honest limitations — this adapter NEVER invents numbers:
 *  - per-device throughput is unavailable (only the router sees that traffic),
 *    so `metricsAvailable: false` and the poller skips usage accounting.
 *  - speed limits / blocking need a router API, so they throw
 *    UnsupportedOperationError and the UI disables those actions.
 *  - network-wide WAN throughput is read through UPnP IGD when the router
 *    exposes it (most home gateways do).
 */

export type CommandResult = { ok: boolean; stdout: string; stderr: string };

export type CommandRunner = (
  file: string,
  args: string[],
  timeoutMs: number,
) => Promise<CommandResult>;

export const defaultCommandRunner: CommandRunner = (file, args, timeoutMs) =>
  new Promise((resolve) => {
    execFile(
      file,
      args,
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          stdout: String(stdout ?? ""),
          stderr: String(stderr ?? (error ? error.message : "")),
        });
      },
    );
  });

export type LanAdapterOptions = {
  /** e.g. "192.168.1.0/24" — defaults to the host's own /24. */
  subnet?: string | null;
  /** Ping every host in the subnet on a slow cadence to find new devices. */
  pingSweep?: boolean;
  sweepIntervalMs?: number;
  /** Confirm each ARP entry with a ping every poll. */
  confirmPing?: boolean;
  reverseDns?: boolean;
  upnp?: boolean;
  /** Per-command timeout. */
  timeoutMs?: number;
  concurrency?: number;
  /** Injectable for tests. */
  runner?: CommandRunner;
  now?: () => number;
};

const LAN_NOTE =
  "وضع «اكتشاف الشبكة» يتعرّف على الأجهزة المتصلة فعليًا عبر جدول ARP، لكن الراوتر الحالي لا يعرض استهلاك كل جهاز على حدة — لذلك إحصاءات الاستهلاك وتحديد السرعة والحظر غير متاحة.";

type HostRecord = { hostname: string | null; resolvedAt: number };

export class LanDiscoveryNetwork implements NetworkAdapter {
  readonly mode: NetworkMode = "lan";

  private readonly runner: CommandRunner;
  private readonly now: () => number;
  private readonly options: Required<
    Pick<
      LanAdapterOptions,
      | "pingSweep"
      | "sweepIntervalMs"
      | "confirmPing"
      | "reverseDns"
      | "upnp"
      | "timeoutMs"
      | "concurrency"
    >
  > & { subnet: string | null };

  private connected = false;
  private lastPollAt: string | null = null;
  private lastError: string | null = null;
  private deviceCount = 0;
  private resolvedSubnet: string | null = null;
  private lastSweepAt = 0;
  private hostnameCache = new Map<string, HostRecord>();
  private upnpLocation: string | null = null;
  private upnpCheckedAt = 0;
  private lastTotals: { rx: number; tx: number; at: number } | null = null;

  constructor(options: LanAdapterOptions = {}) {
    this.runner = options.runner ?? defaultCommandRunner;
    this.now = options.now ?? (() => Date.now());
    this.options = {
      subnet: options.subnet ?? null,
      pingSweep: options.pingSweep ?? true,
      sweepIntervalMs: options.sweepIntervalMs ?? 120_000,
      confirmPing: options.confirmPing ?? true,
      reverseDns: options.reverseDns ?? true,
      upnp: options.upnp ?? true,
      timeoutMs: options.timeoutMs ?? 1_500,
      concurrency: options.concurrency ?? 48,
    };
  }

  async connect(): Promise<void> {
    const subnet = this.options.subnet ?? detectLocalSubnet();
    if (!subnet) {
      this.connected = false;
      this.lastError =
        "تعذّر تحديد الشبكة المحلية — تأكد أن الجهاز متصل بالشبكة، أو حدّد LAN_SUBNET يدويًا.";
      return;
    }
    this.resolvedSubnet = subnet;
    this.connected = true;
    this.lastError = null;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  status(): AdapterStatus {
    return {
      mode: this.mode,
      connected: this.connected,
      capabilities: this.capabilities(),
      lastPollAt: this.lastPollAt,
      lastError: this.lastError,
      deviceCount: this.deviceCount,
    };
  }

  capabilities(): AdapterCapabilities {
    return {
      perDeviceTraffic: false,
      totalTraffic: this.upnpLocation != null,
      speedLimit: false,
      blocking: false,
      note: LAN_NOTE,
    };
  }

  setConnectionConfig(_config: MikrotikConnectionConfig): void {
    void _config;
    // Not applicable: the LAN adapter talks to the local subnet, not a router.
  }

  async discover(): Promise<RouterDeviceSnapshot[]> {
    try {
      if (!this.connected) await this.connect();
      if (!this.connected) return [];

      await this.maybeSweep();

      const entries = await this.readArpTable();
      const confirmed = this.options.confirmPing
        ? await this.filterReachable(entries.map((e) => e.ip))
        : entries.map(() => true);

      const live = entries.filter((_, index) => confirmed[index]);
      const snapshots = await mapWithConcurrency(
        live,
        Math.min(this.options.concurrency, 16),
        async (entry) => ({
          mac: entry.mac,
          ip: entry.ip,
          hostname: await this.hostnameFor(entry.ip),
          vendor: vendorFromMac(entry.mac),
          online: true,
          // Counters unknown — never faked.
          rxBytesTotal: 0,
          txBytesTotal: 0,
          rxBps: null,
          txBps: null,
          metricsAvailable: false,
        }),
      );

      this.deviceCount = snapshots.length;
      this.lastPollAt = new Date().toISOString();
      this.lastError = null;
      return snapshots;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  async applySpeedLimit(
    _mac: string,
    _downloadMbps: number,
    _uploadMbps: number,
  ): Promise<void> {
    void _mac;
    void _downloadMbps;
    void _uploadMbps;
    throw new UnsupportedOperationError(
      "الراوتر الحالي لا يدعم تحديد السرعة من خلال NetWatch — استخدم راوتر MikroTik لتفعيل هذه الميزة.",
    );
  }

  async removeSpeedLimit(_mac: string): Promise<void> {
    void _mac;
    throw new UnsupportedOperationError(
      "الراوتر الحالي لا يدعم تحديد السرعة من خلال NetWatch.",
    );
  }

  async setBlocked(_mac: string, _blocked: boolean): Promise<void> {
    void _mac;
    void _blocked;
    throw new UnsupportedOperationError(
      "الراوتر الحالي لا يدعم الحظر من خلال NetWatch — استخدم راوتر MikroTik لتفعيل هذه الميزة.",
    );
  }

  /**
   * WAN-wide throughput via UPnP IGD byte counters (cumulative → rate).
   * Returns null when the router does not expose an IGD service.
   */
  async totalThroughput(): Promise<TotalThroughput | null> {
    if (!this.options.upnp) return null;

    try {
      if (!this.upnpLocation || this.now() - this.upnpCheckedAt > 600_000) {
        this.upnpLocation = await discoverUpnpLocation(2_000);
        this.upnpCheckedAt = this.now();
      }
      if (!this.upnpLocation) return null;

      const totals = await readUpnpTotals(this.upnpLocation, 2_500);
      if (!totals) return null;

      const now = this.now();
      const previous = this.lastTotals;
      this.lastTotals = { rx: totals.received, tx: totals.sent, at: now };

      const seconds = previous ? Math.max(0.5, (now - previous.at) / 1000) : 0;
      return {
        downloadMbps:
          previous && totals.received >= previous.rx
            ? round2(((totals.received - previous.rx) * 8) / seconds / 1e6)
            : null,
        uploadMbps:
          previous && totals.sent >= previous.tx
            ? round2(((totals.sent - previous.tx) * 8) / seconds / 1e6)
            : null,
      };
    } catch {
      this.upnpLocation = null;
      return null;
    }
  }

  // ---------------------------------------------------------------- internals

  private async maybeSweep(): Promise<void> {
    if (!this.options.pingSweep) return;
    const elapsed = this.now() - this.lastSweepAt;
    if (this.lastSweepAt !== 0 && elapsed < this.options.sweepIntervalMs) return;

    const hosts = expandCidr(this.resolvedSubnet ?? "");
    if (hosts.length === 0) return;

    await mapWithConcurrency(hosts, this.options.concurrency, async (ip) => {
      await this.ping(ip);
    });
    this.lastSweepAt = this.now();
  }

  private async readArpTable(): Promise<{ ip: string; mac: string }[]> {
    const commands: [string, string[]][] =
      process.platform === "win32"
        ? [["arp", ["-a"]]]
        : [
            ["ip", ["neigh", "show"]],
            ["arp", ["-a", "-n"]],
          ];

    for (const [file, args] of commands) {
      const result = await this.runner(file, args, this.options.timeoutMs * 4);
      if (!result.ok || !result.stdout.trim()) continue;
      const entries = parseArpOutput(result.stdout);
      if (entries.length > 0) {
        return entries.map((e) => ({ ip: e.ip, mac: toMac(e.mac) }));
      }
    }
    return [];
  }

  private async filterReachable(ips: string[]): Promise<boolean[]> {
    return mapWithConcurrency(ips, this.options.concurrency, (ip) =>
      this.ping(ip),
    );
  }

  private async ping(ip: string): Promise<boolean> {
    const { file, args } = pingCommand(ip);
    const result = await this.runner(file, args, this.options.timeoutMs * 4);
    return result.ok;
  }

  private async hostnameFor(ip: string): Promise<string | null> {
    if (!this.options.reverseDns) return null;

    const cached = this.hostnameCache.get(ip);
    if (cached && this.now() - cached.resolvedAt < 10 * 60_000) {
      return cached.hostname;
    }

    try {
      const names = await withTimeout(dnsPromises.reverse(ip), 800);
      const hostname = names?.[0] ?? null;
      this.hostnameCache.set(ip, { hostname, resolvedAt: this.now() });
      return hostname;
    } catch {
      this.hostnameCache.set(ip, { hostname: null, resolvedAt: this.now() });
      return null;
    }
  }
}

// --------------------------------------------------------------------- helpers

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function pingCommand(ip: string): { file: string; args: string[] } {
  switch (process.platform) {
    case "win32":
      return { file: "ping", args: ["-n", "1", "-w", "400", ip] };
    case "darwin":
      return { file: "ping", args: ["-c", "1", "-t", "1", ip] };
    default:
      return { file: "ping", args: ["-c", "1", "-W", "1", "-n", ip] };
  }
}

/** The machine's own IPv4 subnet, used when LAN_SUBNET is not configured. */
export function detectLocalSubnet(): string | null {
  const interfaces = networkInterfaces();
  for (const list of Object.values(interfaces)) {
    for (const net of list ?? []) {
      if (net.family !== "IPv4" || net.internal) continue;
      const subnet = subnetFromAddress(net.address, 24);
      if (subnet) return subnet;
    }
  }
  return null;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

// ------------------------------------------------------------------ UPnP / IGD

/** SSDP M-SEARCH → description URL of the first InternetGatewayDevice. */
export function discoverUpnpLocation(timeoutMs = 2_000): Promise<string | null> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    let settled = false;

    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      resolve(value);
    };

    try {
      socket.on("message", (message) => {
        const text = message.toString("utf8");
        const match = /^location:\s*(.+)$/im.exec(text);
        const location = match?.[1]?.trim();
        if (location && /^https?:\/\//i.test(location)) finish(location);
      });

      socket.on("error", () => finish(null));

      socket.bind(0, () => {
        const search = [
          "M-SEARCH * HTTP/1.1",
          "HOST: 239.255.255.250:1900",
          'MAN: "ssdp:discover"',
          "MX: 2",
          "ST: ssdp:all",
          "",
          "",
        ].join("\r\n");
        socket.send(search, 1900, "239.255.255.250", (err) => {
          if (err) finish(null);
        });
      });
    } catch {
      finish(null);
    }

    setTimeout(() => finish(null), timeoutMs);
  });
}

export type UpnpService = { type: string; controlUrl: string };

/** Extracts service list (type + absolute control URL) from a UPnP description. */
export function parseUpnpDescription(
  xml: string,
  location: string,
): UpnpService[] {
  const baseMatch = /<[\w.-]*:?URLBase>([^<]*)<\//i.exec(xml);
  const baseUrl = (baseMatch?.[1] ?? location).trim() || location;
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }

  const services: UpnpService[] = [];
  for (const block of xml.split(/<service[\s>]/i).slice(1)) {
    const type = /<[\w.-]*:?serviceType>([^<]*)</i.exec(block)?.[1]?.trim();
    const control = /<[\w.-]*:?controlURL>([^<]*)</i.exec(block)?.[1]?.trim();
    if (!type || !control) continue;
    try {
      services.push({ type, controlUrl: new URL(control, base).toString() });
    } catch {
      /* skip malformed control URL */
    }
  }
  return services;
}

/** Cumulative WAN byte counters through UPnP (WANCommonInterfaceConfig). */
export async function readUpnpTotals(
  location: string,
  timeoutMs = 2_500,
): Promise<{ received: number; sent: number } | null> {
  const xml = await fetchText(location, timeoutMs);
  if (!xml) return null;

  const services = parseUpnpDescription(xml, location);
  const common = services.find((s) =>
    s.type.includes("WANCommonInterfaceConfig:1"),
  );
  if (common) {
    const received = await soapNumber(
      common.controlUrl,
      common.type,
      "GetTotalBytesReceived",
      "NewTotalBytesReceived",
      timeoutMs,
    );
    const sent = await soapNumber(
      common.controlUrl,
      common.type,
      "GetTotalBytesSent",
      "NewTotalBytesSent",
      timeoutMs,
    );
    if (received != null && sent != null) return { received, sent };
  }

  // Some gateways (TP-Link, Huawei) expose the counters on WANIPConnection.
  const ipConnection = services.find((s) => s.type.includes("WANIPConnection:"));
  if (ipConnection) {
    const body = await soapBody(
      ipConnection.controlUrl,
      ipConnection.type,
      "GetAddonInfos",
      timeoutMs,
    );
    const received = numberTag(body, "NewTotalBytesReceived");
    const sent = numberTag(body, "NewTotalBytesSent");
    if (received != null && sent != null) return { received, sent };
  }

  return null;
}

async function fetchText(url: string, timeoutMs: number): Promise<string | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: "*/*" },
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function soapEnvelope(serviceType: string, action: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
<s:Body><u:${action} xmlns:u="${serviceType}"></u:${action}></s:Body>
</s:Envelope>`;
}

async function soapBody(
  controlUrl: string,
  serviceType: string,
  action: string,
  timeoutMs: number,
): Promise<string | null> {
  try {
    const response = await fetch(controlUrl, {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "content-type": 'text/xml; charset="utf-8"',
        SOAPACTION: `"${serviceType}#${action}"`,
      },
      body: soapEnvelope(serviceType, action),
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function numberTag(xml: string | null, tag: string): number | null {
  if (!xml) return null;
  const match = new RegExp(`<[\\w.-]*:?${tag}>([^<]*)<`, "i").exec(xml);
  const value = Number(match?.[1]?.trim());
  return Number.isFinite(value) ? value : null;
}

async function soapNumber(
  controlUrl: string,
  serviceType: string,
  action: string,
  tag: string,
  timeoutMs: number,
): Promise<number | null> {
  return numberTag(await soapBody(controlUrl, serviceType, action, timeoutMs), tag);
}

/** Re-exported so callers can distinguish "not supported" from other failures. */
export function isUnsupported(err: unknown): err is AdapterError {
  return err instanceof Error && err.name === "UnsupportedOperationError";
}
