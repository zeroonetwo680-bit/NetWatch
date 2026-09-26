import type {
  AdapterStatus,
  MikrotikConnectionConfig,
  NetworkAdapter,
  RouterDeviceSnapshot,
} from "./types";
import { AdapterError, FULL_CAPABILITIES } from "./types";
import { normalizeMac } from "@/lib/usage/calculator";

/**
 * In-memory virtual network that behaves like a real router:
 * - monotonic cumulative counters between polls (delta math matches production)
 * - realistic per-device traffic profiles that drift over time
 * - speed limits ACTUALLY cap the simulated rates (proves the full loop)
 * - blocking drops a device offline and zeroes its traffic
 * Deterministic PRNG (mulberry32) keeps tests reproducible.
 */

type Profile =
  | "idle"
  | "browsing"
  | "streaming"
  | "gaming"
  | "downloading"
  | "video-call";

const PROFILES: Record<
  Profile,
  { dl: [number, number]; ul: [number, number]; weight: number }
> = {
  idle: { dl: [0.01, 0.2], ul: [0.01, 0.1], weight: 3 },
  browsing: { dl: [0.5, 4], ul: [0.1, 0.8], weight: 4 },
  streaming: { dl: [6, 25], ul: [0.3, 1.2], weight: 2 },
  gaming: { dl: [0.3, 2], ul: [0.3, 2], weight: 1 },
  downloading: { dl: [25, 90], ul: [1, 6], weight: 1 },
  "video-call": { dl: [1.5, 4], ul: [1.5, 4], weight: 1 },
};
const PROFILE_NAMES = Object.keys(PROFILES) as Profile[];

const HOSTNAMES = [
  "PC-Ahmed",
  "Laptop-Sara",
  "iPhone-Mostafa",
  "TV-Salon",
  "Android-Nour",
  "Console-PS5",
  "Printer-HP",
  "Laptop-Office",
  "Tablet-Kids",
  "Desktop-Gaming",
  "Camera-Doorbell",
  "Speaker-Smart",
  "Phone-Guest",
  "NAS-Home",
];

const MAC_PREFIXES = [
  "3C:22:FB",
  "A4:83:E7",
  "F0:18:98",
  "DC:A6:32",
  "B8:27:EB",
  "00:1A:11",
  "E4:5F:01",
  "78:4F:43",
  "AC:BC:32",
  "50:EB:F6",
  "CC:50:E3",
  "8C:85:90",
  "A0:CC:2B",
  "D8:BB:C1",
];

type SimDevice = {
  mac: string;
  ip: string;
  hostname: string;
  online: boolean;
  blocked: boolean;
  rxBytesTotal: number;
  txBytesTotal: number;
  profile: Profile;
  limit: { dlMbps: number; ulMbps: number } | null;
  lastTickAt: number;
};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type SimulatorOptions = {
  deviceCount: number;
  seed?: number;
  /** Min/max artificial latency per call, ms. */
  latency?: [number, number];
};

export class SimulatedNetwork implements NetworkAdapter {
  readonly mode = "simulated" as const;

  private devices: SimDevice[] = [];
  private rand: () => number;
  private latency: [number, number];
  private lastPollAt: string | null = null;
  private lastDeviceCount = 0;

  constructor(options: SimulatorOptions) {
    this.rand = mulberry32(options.seed ?? 42);
    this.latency = options.latency ?? [40, 120];
    this.devices = this.buildDevices(options.deviceCount);
  }

  private buildDevices(count: number): SimDevice[] {
    const now = Date.now();
    const devices: SimDevice[] = [];
    for (let i = 0; i < count; i++) {
      const suffix = this.rand();
      const mac = normalizeMac(
        `${MAC_PREFIXES[i % MAC_PREFIXES.length]}:${Math.floor(suffix * 256)
          .toString(16)
          .padStart(2, "0")}:${Math.floor(this.rand() * 256)
          .toString(16)
          .padStart(2, "0")}:${Math.floor(this.rand() * 256)
          .toString(16)
          .padStart(2, "0")}`,
      );
      const hostnameBase = HOSTNAMES[i % HOSTNAMES.length];
      const generation = Math.floor(i / HOSTNAMES.length);
      devices.push({
        mac,
        ip: `192.168.1.${20 + i}`,
        hostname: generation > 0 ? `${hostnameBase}-${generation + 1}` : hostnameBase,
        online: this.rand() > 0.15,
        blocked: false,
        // Seed with plausible history so "today" totals look real immediately.
        rxBytesTotal: Math.floor(this.rand() * 4e9),
        txBytesTotal: Math.floor(this.rand() * 4e8),
        profile: this.weightedProfile(),
        limit: null,
        lastTickAt: now - Math.floor(this.rand() * 30_000),
      });
    }
    return devices;
  }

  private weightedProfile(): Profile {
    const totalWeight = PROFILE_NAMES.reduce(
      (sum, p) => sum + PROFILES[p].weight,
      0,
    );
    let r = this.rand() * totalWeight;
    for (const p of PROFILE_NAMES) {
      r -= PROFILES[p].weight;
      if (r <= 0) return p;
    }
    return "idle";
  }

  async connect(): Promise<void> {
    await this.delay();
  }

  async disconnect(): Promise<void> {
    await this.delay();
  }

  /** No-op: the simulated network has no connection parameters. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setConnectionConfig(_config: MikrotikConnectionConfig): void {
    // No-op: the simulated network has no connection parameters.
  }

  status(): AdapterStatus {
    return {
      mode: this.mode,
      connected: true,
      capabilities: FULL_CAPABILITIES,
      lastPollAt: this.lastPollAt,
      lastError: null,
      deviceCount: this.lastDeviceCount || this.devices.length,
    };
  }

  async discover(): Promise<RouterDeviceSnapshot[]> {
    await this.delay();
    const now = Date.now();

    for (const dev of this.devices) {
      const dtSec = Math.max(0.05, (now - dev.lastTickAt) / 1000);
      dev.lastTickAt = now;

      if (dev.blocked) {
        dev.online = false;
        continue;
      }

      // Occasional online/offline transitions.
      if (dev.online && this.rand() < 0.004) dev.online = false;
      else if (!dev.online && this.rand() < 0.03) dev.online = true;

      if (!dev.online) continue;

      // Drift between traffic profiles.
      if (this.rand() < 0.04) dev.profile = this.weightedProfile();

      const range = PROFILES[dev.profile];
      let dlMbps =
        range.dl[0] + this.rand() * (range.dl[1] - range.dl[0]);
      let ulMbps =
        range.ul[0] + this.rand() * (range.ul[1] - range.ul[0]);

      // A speed limit REALLY caps the device (visible in charts).
      if (dev.limit) {
        dlMbps = Math.min(dlMbps, dev.limit.dlMbps * 0.94);
        ulMbps = Math.min(ulMbps, dev.limit.ulMbps * 0.94);
      }

      dev.rxBytesTotal += (dlMbps * 1e6 * dtSec) / 8;
      dev.txBytesTotal += (ulMbps * 1e6 * dtSec) / 8;
    }

    this.lastPollAt = new Date(now).toISOString();
    this.lastDeviceCount = this.devices.filter((d) => d.online).length;

    return this.devices.map((dev) => ({
      mac: dev.mac,
      ip: dev.ip,
      hostname: dev.hostname,
      online: dev.online,
      rxBytesTotal: Math.floor(dev.rxBytesTotal),
      txBytesTotal: Math.floor(dev.txBytesTotal),
      rxBps: dev.online ? null : null, // poller derives rates from deltas
      txBps: dev.online ? null : null,
    }));
  }

  async applySpeedLimit(
    mac: string,
    downloadMbps: number,
    uploadMbps: number,
  ): Promise<void> {
    await this.delay();
    const dev = this.find(mac);
    dev.limit = { dlMbps: downloadMbps, ulMbps: uploadMbps };
  }

  async removeSpeedLimit(mac: string): Promise<void> {
    await this.delay();
    const dev = this.find(mac);
    dev.limit = null;
  }

  async setBlocked(mac: string, blocked: boolean): Promise<void> {
    await this.delay();
    const dev = this.find(mac);
    dev.blocked = blocked;
    // Blocking drops it offline immediately; unblocking restores access
    // (the device re-appears on the network as soon as the rule is gone).
    dev.online = !blocked;
  }

  /** Test helper: restore a pristine network. */
  reset(deviceCount: number): void {
    this.devices = this.buildDevices(deviceCount);
    this.lastPollAt = null;
    this.lastDeviceCount = 0;
  }

  private find(mac: string): SimDevice {
    const normalized = normalizeMac(mac);
    const dev = this.devices.find((d) => d.mac === normalized);
    if (!dev) {
      throw new AdapterError(`Device not found in simulated network: ${mac}`);
    }
    return dev;
  }

  private delay(): Promise<void> {
    const [min, max] = this.latency;
    const ms = min + Math.random() * (max - min);
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
