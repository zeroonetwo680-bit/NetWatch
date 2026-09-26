import { appConfig } from "@/lib/config";
import { MikrotikNetwork } from "./mikrotik";
import { SimulatedNetwork } from "./simulator";
import type { NetworkAdapter } from "./types";

/**
 * The single switchboard between "virtual network" and "real router".
 * Selected by NETWORK_MODE — nothing else in the app branches on mode.
 * Held on globalThis so dev HMR reuses one instance (and one simulated
 * network state, or one MikroTik socket).
 */

const globalForNetwork = globalThis as unknown as {
  netwatchAdapter?: NetworkAdapter;
};

export function getNetworkAdapter(): NetworkAdapter {
  if (!globalForNetwork.netwatchAdapter) {
    globalForNetwork.netwatchAdapter =
      appConfig.networkMode === "mikrotik"
        ? new MikrotikNetwork(appConfig.mikrotik)
        : new SimulatedNetwork({ deviceCount: appConfig.simDeviceCount });
  }
  return globalForNetwork.netwatchAdapter;
}

/** Test/ops helper: drop the cached adapter and build a fresh one. */
export function resetNetworkAdapter(): void {
  globalForNetwork.netwatchAdapter = undefined;
}

export * from "./types";
