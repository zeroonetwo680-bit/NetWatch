import { describe, expect, it } from "vitest";

import {
  expandCidr,
  isHostMac,
  mapWithConcurrency,
  parseArpOutput,
  subnetFromAddress,
  toMac,
  vendorFromMac,
} from "@/lib/network/lan-helpers";
import {
  LanDiscoveryNetwork,
  parseUpnpDescription,
  type CommandRunner,
} from "@/lib/network/lan-discovery";
import { UnsupportedOperationError } from "@/lib/network/types";

describe("lan-helpers (pure)", () => {
  describe("toMac", () => {
    it("normalizes diverse MAC formats to uppercase colon-separated", () => {
      expect(toMac("c4-12-ec-a5-35-65")).toBe("C4:12:EC:A5:35:65");
      expect(toMac("c4:12:ec:a5:35:65")).toBe("C4:12:EC:A5:35:65");
      expect(toMac("C412ECA53565")).toBe("C4:12:EC:A5:35:65");
      expect(toMac("c412.eca5.3565")).toBe("C4:12:EC:A5:35:65");
    });
  });

  describe("isHostMac", () => {
    it("accepts valid unicast host MACs", () => {
      expect(isHostMac("C4:12:EC:A5:35:65")).toBe(true);
      expect(isHostMac("00:1A:2B:3C:4D:5E")).toBe(true);
    });

    it("rejects broadcast and all-zeros", () => {
      expect(isHostMac("FF:FF:FF:FF:FF:FF")).toBe(false);
      expect(isHostMac("00:00:00:00:00:00")).toBe(false);
    });

    it("rejects multicast MAC addresses (LSB of first octet set)", () => {
      expect(isHostMac("01:00:5E:00:00:01")).toBe(false); // IPv4 multicast
      expect(isHostMac("33:33:00:00:00:01")).toBe(false); // IPv6 multicast
    });
  });

  describe("parseArpOutput", () => {
    it("parses Windows 'arp -a' output format", () => {
      const windowsArp = `
Interface: 192.168.1.50 --- 0x12
  Internet Address      Physical Address      Type
  192.168.1.1           c4-12-ec-a5-35-65     dynamic
  192.168.1.102         50-64-2b-11-22-33     dynamic
  192.168.1.255         ff-ff-ff-ff-ff-ff     static
  224.0.0.22           01-00-5e-00-00-16     static
`;
      const entries = parseArpOutput(windowsArp);
      expect(entries).toEqual([
        { ip: "192.168.1.1", mac: "C4:12:EC:A5:35:65" },
        { ip: "192.168.1.102", mac: "50:64:2B:11:22:33" },
      ]);
    });

    it("parses Linux 'ip neigh' output format and ignores FAILED/incomplete", () => {
      const linuxNeigh = `
192.168.1.1 dev eth0 lladdr c4:12:ec:a5:35:65 REACHABLE
192.168.1.105 dev eth0 lladdr a4:83:e7:99:88:77 STALE
192.168.1.199 dev eth0  FAILED
192.168.1.200 dev eth0 lladdr 00:00:00:00:00:00 FAILED
`;
      const entries = parseArpOutput(linuxNeigh);
      expect(entries).toEqual([
        { ip: "192.168.1.1", mac: "C4:12:EC:A5:35:65" },
        { ip: "192.168.1.105", mac: "A4:83:E7:99:88:77" },
      ]);
    });

    it("parses macOS 'arp -a' output format", () => {
      const macArp = `
? (192.168.1.1) at c4:12:ec:a5:35:65 on en0 ifscope [ethernet]
? (192.168.1.103) at 04:0c:ce:aa:bb:cc on en0 ifscope [ethernet]
? (192.168.1.255) at ff:ff:ff:ff:ff:ff on en0 ifscope [ethernet]
`;
      const entries = parseArpOutput(macArp);
      expect(entries).toEqual([
        { ip: "192.168.1.1", mac: "C4:12:EC:A5:35:65" },
        { ip: "192.168.1.103", mac: "04:0C:CE:AA:BB:CC" },
      ]);
    });
  });

  describe("expandCidr and subnetFromAddress", () => {
    it("derives /24 subnet from an IP address", () => {
      expect(subnetFromAddress("192.168.1.45", 24)).toBe("192.168.1.0/24");
      expect(subnetFromAddress("10.0.5.12", 24)).toBe("10.0.5.0/24");
      expect(subnetFromAddress("invalid")).toBeNull();
    });

    it("expands a /30 subnet correctly (2 usable hosts)", () => {
      const hosts = expandCidr("192.168.1.0/30");
      expect(hosts).toEqual(["192.168.1.1", "192.168.1.2"]);
    });

    it("expands /24 up to limit", () => {
      const hosts = expandCidr("192.168.1.0/24", 10);
      expect(hosts).toHaveLength(10);
      expect(hosts[0]).toBe("192.168.1.1");
      expect(hosts[9]).toBe("192.168.1.10");
    });
  });

  describe("vendorFromMac", () => {
    it("recognizes known vendors from OUI table", () => {
      expect(vendorFromMac("C4:12:EC:A5:35:65")).toBe("Huawei");
      expect(vendorFromMac("A4:83:E7:11:22:33")).toBe("Apple");
      expect(vendorFromMac("04:0C:CE:11:22:33")).toBe("Samsung");
      expect(vendorFromMac("50:64:2B:11:22:33")).toBe("TP-Link");
      expect(vendorFromMac("00:0C:42:11:22:33")).toBe("MikroTik");
      expect(vendorFromMac("AC:9B:0A:11:22:33")).toBe("Sony (PlayStation)");
    });

    it("returns null for unknown vendor OUIs", () => {
      expect(vendorFromMac("AA:BB:CC:11:22:33")).toBeNull();
      expect(vendorFromMac("invalid")).toBeNull();
    });
  });

  describe("mapWithConcurrency", () => {
    it("preserves ordering and processes all elements", async () => {
      const items = [1, 2, 3, 4, 5, 6, 7, 8];
      let running = 0;
      let maxSeen = 0;

      const results = await mapWithConcurrency(items, 3, async (item) => {
        running++;
        maxSeen = Math.max(maxSeen, running);
        await new Promise((r) => setTimeout(r, 5));
        running--;
        return item * 10;
      });

      expect(results).toEqual([10, 20, 30, 40, 50, 60, 70, 80]);
      expect(maxSeen).toBeLessThanOrEqual(3);
    });
  });
});

describe("LanDiscoveryNetwork adapter", () => {
  it("discovers devices from ARP table and sets metricsAvailable to false", async () => {
    const mockRunner: CommandRunner = async (file, args) => {
      if (args.includes("-a") || args.includes("neigh")) {
        return {
          ok: true,
          stdout: `
Interface: 192.168.1.50 --- 0x12
  Internet Address      Physical Address      Type
  192.168.1.1           c4-12-ec-a5-35-65     dynamic
  192.168.1.100         a4-83-e7-12-34-56     dynamic
`,
          stderr: "",
        };
      }
      // ping
      return { ok: true, stdout: "Reply from ...", stderr: "" };
    };

    const adapter = new LanDiscoveryNetwork({
      subnet: "192.168.1.0/24",
      pingSweep: false,
      confirmPing: true,
      reverseDns: false,
      upnp: false,
      runner: mockRunner,
    });

    await adapter.connect();
    expect(adapter.status().connected).toBe(true);
    expect(adapter.status().mode).toBe("lan");
    expect(adapter.status().capabilities.perDeviceTraffic).toBe(false);
    expect(adapter.status().capabilities.speedLimit).toBe(false);
    expect(adapter.status().capabilities.blocking).toBe(false);

    const snapshots = await adapter.discover();
    expect(snapshots).toHaveLength(2);

    const router = snapshots.find((s) => s.ip === "192.168.1.1");
    expect(router).toBeDefined();
    expect(router?.mac).toBe("C4:12:EC:A5:35:65");
    expect(router?.vendor).toBe("Huawei");
    expect(router?.metricsAvailable).toBe(false);
    expect(router?.rxBytesTotal).toBe(0);
    expect(router?.txBytesTotal).toBe(0);

    const apple = snapshots.find((s) => s.ip === "192.168.1.100");
    expect(apple?.vendor).toBe("Apple");
  });

  it("throws UnsupportedOperationError for speed limits and blocking", async () => {
    const adapter = new LanDiscoveryNetwork({ upnp: false });

    await expect(
      adapter.applySpeedLimit("C4:12:EC:A5:35:65", 10, 5),
    ).rejects.toThrow(UnsupportedOperationError);

    await expect(
      adapter.removeSpeedLimit("C4:12:EC:A5:35:65"),
    ).rejects.toThrow(UnsupportedOperationError);

    await expect(
      adapter.setBlocked("C4:12:EC:A5:35:65", true),
    ).rejects.toThrow(UnsupportedOperationError);
  });

  describe("parseUpnpDescription", () => {
    it("extracts service types and control URLs", () => {
      const xml = `
<?xml version="1.0"?>
<root xmlns="urn:schemas-upnp-org:device-1-0">
  <URLBase>http://192.168.1.1:80/</URLBase>
  <device>
    <serviceList>
      <service>
        <serviceType>urn:schemas-upnp-org:service:WANCommonInterfaceConfig:1</serviceType>
        <controlURL>/ipc/wancommon</controlURL>
      </service>
      <service>
        <serviceType>urn:schemas-upnp-org:service:WANIPConnection:1</serviceType>
        <controlURL>/ipc/wanip</controlURL>
      </service>
    </serviceList>
  </device>
</root>
`;
      const services = parseUpnpDescription(xml, "http://192.168.1.1:80/rootDesc.xml");
      expect(services).toEqual([
        {
          type: "urn:schemas-upnp-org:service:WANCommonInterfaceConfig:1",
          controlUrl: "http://192.168.1.1/ipc/wancommon",
        },
        {
          type: "urn:schemas-upnp-org:service:WANIPConnection:1",
          controlUrl: "http://192.168.1.1/ipc/wanip",
        },
      ]);
    });
  });
});
