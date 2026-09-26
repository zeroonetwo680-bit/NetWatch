import { appConfig } from "@/lib/config";
import { LanDiscoveryNetwork } from "./lan-discovery";
import { MikrotikNetwork } from "./mikrotik";
import { SimulatedNetwork } from "./simulator";
import type { NetworkAdapter } from "./types";

/**
 * The single switchboard between data sources. Selected by NETWORK_MODE —
 * nothing else in the app branches on the mode:
 *
 *  simulated → fake virtual network (no hardware at all)
 *  mikrotik  → real RouterOS API (full features: usage, limits, blocking)
 *  lan       → OS ARP table + ping sweep + UPnP (any router: presence only)
 *
 * Held on globalThis so dev HMR reuses one instance (and one simulated
 * network state, or one MikroTik socket).
 */

const globalForNetwork = globalThis as unknown as {
  netwatchAdapter?: NetworkAdapter;
};

export function getNetworkAdapter(): NetworkAdapter {
  if (!globalForNetwork.netwatchAdapter) {
    globalForNetwork.netwatchAdapter = createNetworkAdapter();
  }
  return globalForNetwork.netwatchAdapter;
}

function createNetworkAdapter(): NetworkAdapter {
  switch (appConfig.networkMode) {
    case "mikrotik":
      return new MikrotikNetwork(appConfig.mikrotik);
    case "lan":
      return new LanDiscoveryNetwork({
        subnet: appConfig.lan.subnet,
        pingSweep: appConfig.lan.pingSweep,
        sweepIntervalMs: appConfig.lan.sweepIntervalMs,
        reverseDns: appConfig.lan.reverseDns,
        upnp: appConfig.lan.upnp,
      });
    default:
      return new SimulatedNetwork({ deviceCount: appConfig.simDeviceCount });
  }
}

/** Test/ops helper: drop the cached adapter and build a fresh one. */
export function resetNetworkAdapter(): void {
  globalForNetwork.netwatchAdapter = undefined;
}

export * from "./types";
