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
  online: boolean;
  /** Cumulative download counter in bytes (may reset on router reboot). */
  rxBytesTotal: number;
  /** Cumulative upload counter in bytes (may reset on router reboot). */
  txBytesTotal: number;
  /** Instantaneous download bits/second when the router provides it. */
  rxBps: number | null;
  /** Instantaneous upload bits/second when the router provides it. */
  txBps: number | null;
};

export type AdapterStatus = {
  mode: "simulated" | "mikrotik";
  connected: boolean;
  lastPollAt: string | null;
  lastError: string | null;
  deviceCount: number;
};

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

export interface NetworkAdapter {
  readonly mode: "simulated" | "mikrotik";
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
}
