/**
 * The network-adapter seam — the exact analogue of a mock-first transport.
 * Everything above this interface (services, routes, hooks, UI) is
 * mode-agnostic: switching NETWORK_MODE=simulated → mikrotik changes
 * nothing outside lib/network.
 */

export type RouterDeviceSnapshot = {
  /** Normalized uppercase AA:BB:CC:DD:EE:FF */
  mac: string;
  ip: string | null;
  hostname: string | null;
  /** Vendor guessed from the MAC OUI (best-effort, may be null). */
  vendor?: string | null;
  online: boolean;
  /**
   * False when the data source can only see the device's presence and not
   * its traffic counters (LAN discovery on a non-MikroTik router).
   * The poller MUST skip usage accounting for such devices instead of
   * storing fake zeroes.
   */
  metricsAvailable?: boolean;
  /** Cumulative download counter in bytes (may reset on router reboot). */
  rxBytesTotal: number;
  /** Cumulative upload counter in bytes (may reset on router reboot). */
  txBytesTotal: number;
  /** Instantaneous download bits/second when the router provides it. */
  rxBps: number | null;
  /** Instantaneous upload bits/second when the router provides it. */
  txBps: number | null;
};

/** What this data source can actually do — drives UI affordances. */
export type AdapterCapabilities = {
  /** Per-device byte counters / rates. */
  perDeviceTraffic: boolean;
  /** Network-wide WAN throughput (UPnP IGD or router counters). */
  totalTraffic: boolean;
  speedLimit: boolean;
  blocking: boolean;
  /** Arabic explanation shown when a capability is missing. */
  note: string | null;
};

/** Capabilities of a router that exposes a real API (or the simulator). */
export const FULL_CAPABILITIES: AdapterCapabilities = {
  perDeviceTraffic: true,
  totalTraffic: true,
  speedLimit: true,
  blocking: true,
  note: null,
};

export type TotalThroughput = {
  downloadMbps: number | null;
  uploadMbps: number | null;
};

export type AdapterStatus = {
  mode: NetworkMode;
  connected: boolean;
  /** Capabilities of the active data source. */
  capabilities: AdapterCapabilities;
  lastPollAt: string | null;
  lastError: string | null;
  deviceCount: number;
};

export type NetworkMode = "simulated" | "mikrotik" | "lan";

export type MikrotikConnectionConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
};

export class AdapterError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AdapterError";
  }
}

/**
 * Thrown when the active data source cannot perform an operation
 * (e.g. speed limits on a router that exposes no API). Surfaces to the
 * client as a 422 ApiProblem with an Arabic message.
 */
export class UnsupportedOperationError extends AdapterError {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedOperationError";
  }
}


export interface NetworkAdapter {
  readonly mode: NetworkMode;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  status(): AdapterStatus;
  /** Full snapshot list of the devices currently visible on the network. */
  discover(): Promise<RouterDeviceSnapshot[]>;
  applySpeedLimit(
    mac: string,
    downloadMbps: number,
    uploadMbps: number,
  ): Promise<void>;
  removeSpeedLimit(mac: string): Promise<void>;
  setBlocked(mac: string, blocked: boolean): Promise<void>;
  /** Runtime connection settings (used by the mikrotik adapter only). */
  setConnectionConfig(config: MikrotikConnectionConfig): void;
  /**
   * Network-wide WAN throughput. Optional: only sources that can measure it
   * (UPnP-capable routers, simulated network) implement it.
   */
  totalThroughput?(): Promise<TotalThroughput | null>;
}
