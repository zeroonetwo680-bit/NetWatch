import { beforeEach, describe, expect, it } from "vitest";
import { SimulatedNetwork } from "@/lib/network/simulator";
import { normalizeMac } from "@/lib/usage/calculator";

/**
 * Adapter contract tests — the simulated network must behave like a real
 * router so the rest of the system (delta math, charts, limit enforcement)
 * can be developed and tested without hardware.
 */

let net: SimulatedNetwork;

beforeEach(() => {
  net = new SimulatedNetwork({ deviceCount: 10, seed: 7, latency: [0, 0] });
});

describe("SimulatedNetwork contract", () => {
  it("reports simulated mode and a connected status", () => {
    expect(net.mode).toBe("simulated");
    const status = net.status();
    expect(status.mode).toBe("simulated");
    expect(status.connected).toBe(true);
    expect(status.lastError).toBeNull();
  });

  it("discovers devices with unique normalized MACs", async () => {
    const snapshots = await net.discover();
    expect(snapshots.length).toBe(10);

    const macs = snapshots.map((s) => s.mac);
    expect(new Set(macs).size).toBe(10);
    for (const mac of macs) {
      expect(mac).toBe(normalizeMac(mac));
      expect(mac).toMatch(/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/);
    }
    for (const s of snapshots) {
      expect(s.ip).toMatch(/^192\.168\.1\.\d+$/);
      expect(typeof s.hostname).toBe("string");
    }
  });

  it("keeps counters monotonic and produces positive deltas", async () => {
    const first = await net.discover();
    const firstTotals = new Map(first.map((d) => [d.mac, d.rxBytesTotal]));

    await new Promise((r) => setTimeout(r, 120));

    const second = await net.discover();
    let advanced = 0;
    for (const dev of second) {
      const before = firstTotals.get(dev.mac)!;
      expect(dev.rxBytesTotal).toBeGreaterThanOrEqual(before);
      if (dev.rxBytesTotal > before) advanced++;
    }
    expect(advanced).toBeGreaterThan(0);
  });

  it("caps rates when a speed limit is applied", async () => {
    const first = await net.discover();
    const target = first.find((d) => d.online)!;

    await new Promise((r) => setTimeout(r, 120));
    const before = (await net.discover()).find(
      (d) => d.mac === target.mac,
    )!;
    const deltaBefore = before.rxBytesTotal - target.rxBytesTotal;

    await net.applySpeedLimit(target.mac, 0.001, 0.001);

    await new Promise((r) => setTimeout(r, 250));
    const after = (await net.discover()).find((d) => d.mac === target.mac)!;
    const deltaAfter = after.rxBytesTotal - before.rxBytesTotal;

    expect(deltaAfter).toBeLessThan(deltaBefore + 1);
    // 0.001 Mbps over 0.25s is effectively zero bytes.
    expect(deltaAfter).toBeLessThan(200);
  });

  it("restores rates after removing the limit", async () => {
    const first = await net.discover();
    const target = first.find((d) => d.online)!;
    await net.applySpeedLimit(target.mac, 0.001, 0.001);
    await new Promise((r) => setTimeout(r, 150));
    const capped = (await net.discover()).find((d) => d.mac === target.mac)!;

    await net.removeSpeedLimit(target.mac);
    await new Promise((r) => setTimeout(r, 250));
    const restored = (await net.discover()).find((d) => d.mac === target.mac)!;

    expect(restored.rxBytesTotal - capped.rxBytesTotal).toBeGreaterThan(0);
  });

  it("drops a device offline and zero-rates it when blocked", async () => {
    const first = await net.discover();
    const target = first.find((d) => d.online)!;

    await net.setBlocked(target.mac, true);
    const blocked = (await net.discover()).find((d) => d.mac === target.mac)!;
    expect(blocked.online).toBe(false);

    await new Promise((r) => setTimeout(r, 150));
    const stillBlocked = (await net.discover()).find(
      (d) => d.mac === target.mac,
    )!;
    expect(stillBlocked.rxBytesTotal).toBe(blocked.rxBytesTotal);

    await net.setBlocked(target.mac, false);
    const unblocked = (await net.discover()).find(
      (d) => d.mac === target.mac,
    )!;
    expect(unblocked.online).toBe(true);
  });

  it("throws an AdapterError for an unknown MAC", async () => {
    await expect(net.applySpeedLimit("00:11:22:33:44:55", 10, 5)).rejects.toThrow(
      /not found/i,
    );
  });
});
