/**
 * PURE helpers for the LAN-discovery adapter.
 *
 * No I/O and no Node built-ins on purpose: ARP output parsing, subnet maths
 * and OUI lookup are the parts worth unit-testing, and they must behave the
 * same on Windows, Linux and macOS.
 */

export type ArpEntry = { ip: string; mac: string };

const IPV4_RE = /(\d{1,3}(?:\.\d{1,3}){3})/;
const MAC_RE =
  /([0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2})/;

/** Any MAC literal → uppercase colon-separated. */
export function toMac(input: string): string {
  const hex = input.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  if (hex.length !== 12) return input.trim().toUpperCase();
  return (hex.match(/.{2}/g) ?? []).join(":");
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return null;
  }
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function intToIpv4(value: number): string {
  const v = value >>> 0;
  return `${(v >>> 24) & 255}.${(v >>> 16) & 255}.${(v >>> 8) & 255}.${v & 255}`;
}

/** Rejects broadcast / all-zero / multicast (group-bit) addresses. */
export function isHostMac(mac: string): boolean {
  const normalized = toMac(mac);
  if (!/^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/.test(normalized)) return false;
  if (normalized === "FF:FF:FF:FF:FF:FF" || normalized === "00:00:00:00:00:00") {
    return false;
  }
  const firstOctet = Number.parseInt(normalized.slice(0, 2), 16);
  return (firstOctet & 1) === 0; // unicast only
}

/**
 * Parses the ARP/neighbour table of every supported platform:
 *  - Windows  `arp -a`  → `192.168.1.1   c4-12-ec-a5-35-65   dynamic`
 *  - Linux    `ip neigh` → `192.168.1.1 dev eth0 lladdr c4:12:ec:a5:35:65 REACHABLE`
 *  - Linux    `arp -n`  → `192.168.1.1 ether c4:12:ec:a5:35:65 C eth0`
 *  - macOS    `arp -a`  → `? (192.168.1.1) at c4:12:ec:a5:35:65 on en0 ifscope`
 *
 * Entries reported as incomplete/FAILED are dropped — they are stale cache
 * rows, not live hosts. Duplicate MACs (several interfaces) keep the first IP.
 */
export function parseArpOutput(output: string): ArpEntry[] {
  const byMac = new Map<string, ArpEntry>();

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/incomplete|FAILED|no entry|link-layer/i.test(line)) continue;

    const ip = line.match(IPV4_RE)?.[1] ?? null;
    const macLiteral = line.match(MAC_RE)?.[1] ?? null;
    if (!ip || !macLiteral) continue;

    const mac = toMac(macLiteral);
    if (!isHostMac(mac)) continue;
    if (!byMac.has(mac)) byMac.set(mac, { ip, mac });
  }

  return [...byMac.values()];
}

/** Host addresses of a CIDR block, excluding network/broadcast. */
export function expandCidr(cidr: string, limit = 1024): string[] {
  const [address, prefixRaw] = cidr.trim().split("/");
  const base = ipv4ToInt(address ?? "");
  const prefix = Number(prefixRaw ?? 24);
  if (base === null || !Number.isInteger(prefix) || prefix < 8 || prefix > 32) return [];

  const size = 2 ** (32 - prefix);
  const from = prefix >= 31 ? 0 : 1;
  const to = prefix >= 31 ? size : size - 1;

  const hosts: string[] = [];
  for (let offset = from; offset < to && hosts.length < limit; offset += 1) {
    hosts.push(intToIpv4((base + offset) >>> 0));
  }
  return hosts;
}

/** e.g. 192.168.1.50 + /24 → "192.168.1.0/24". */
export function subnetFromAddress(ip: string, prefix = 24): string | null {
  const base = ipv4ToInt(ip);
  if (base === null) return null;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return `${intToIpv4((base & mask) >>> 0)}/${prefix}`;
}

/**
 * Compact OUI (first 3 bytes) → vendor table for the most common home/office
 * devices. Anything unknown returns null rather than a guess — the UI shows
 * "جهاز غير معروف" instead of a wrong brand.
 */
const OUI_TABLE: Record<string, string> = {
  "00:1A:2B": "Cisco",
  "00:1B:44": "Cisco",
  "00:0C:29": "VMware",
  "00:50:56": "VMware",
  "00:1C:42": "Parallels",
  "00:03:FF": "Microsoft",
  "00:12:5A": "Microsoft",
  "00:15:5D": "Microsoft",
  "00:17:FA": "Microsoft (Xbox)",
  "00:1D:D8": "Microsoft (Xbox)",
  "5C:5C:AD": "Microsoft (Xbox)",
  "00:26:BB": "Apple",
  "00:3E:E1": "Apple",
  "00:6C:8A": "Apple",
  "00:88:65": "Apple",
  "0C:74:C2": "Apple",
  "10:93:1B": "Apple",
  "18:AF:8F": "Apple",
  "3C:15:C2": "Apple",
  "40:6C:8F": "Apple",
  "48:D7:05": "Apple",
  "5C:F9:38": "Apple",
  "64:B9:E8": "Apple",
  "70:56:81": "Apple",
  "78:4F:43": "Apple",
  "7C:04:D0": "Apple",
  "8C:85:90": "Apple",
  "A4:83:E7": "Apple",
  "B4:18:D1": "Apple",
  "BC:52:B7": "Apple",
  "C8:69:CD": "Apple",
  "D0:81:7A": "Apple",
  "DC:2B:2A": "Apple",
  "F0:18:98": "Apple",
  "F4:F1:5A": "Apple",
  "00:1B:63": "Apple",
  "04:0C:CE": "Samsung",
  "08:08:C2": "Samsung",
  "0C:14:20": "Samsung",
  "10:D3:8A": "Samsung",
  "14:49:E0": "Samsung",
  "18:3A:2D": "Samsung",
  "1C:5A:3E": "Samsung",
  "20:02:AF": "Samsung",
  "28:6A:BA": "Samsung",
  "2C:BE:EB": "Samsung",
  "34:23:BA": "Samsung",
  "38:2D:AE": "Samsung",
  "40:B8:37": "Samsung",
  "44:D3:2B": "Samsung",
  "4C:66:41": "Samsung",
  "50:01:D9": "Samsung",
  "5C:0A:5B": "Samsung",
  "60:45:CB": "Samsung",
  "68:EB:AE": "Samsung",
  "78:1F:DB": "Samsung",
  "8C:77:12": "Samsung",
  "94:35:0A": "Samsung",
  "A0:82:1F": "Samsung",
  "B4:79:A7": "Samsung",
  "BC:20:A4": "Samsung",
  "C4:73:1E": "Samsung",
  "CC:07:AB": "Samsung",
  "D8:5E:D3": "Samsung",
  "E4:7C:F9": "Samsung",
  "EC:1F:72": "Samsung",
  "F8:04:2E": "Samsung",
  "00:9E:C8": "Huawei",
  "04:25:C5": "Huawei",
  "0C:37:DC": "Huawei",
  "10:1B:54": "Huawei",
  "20:0B:C7": "Huawei",
  "24:7F:3C": "Huawei",
  "28:31:52": "Huawei",
  "34:29:12": "Huawei",
  "48:46:FB": "Huawei",
  "4C:54:99": "Huawei",
  "54:25:EA": "Huawei",
  "5C:4C:A9": "Huawei",
  "70:72:3C": "Huawei",
  "74:A7:8E": "Huawei",
  "78:9A:18": "Huawei",
  "84:A8:E4": "Huawei",
  "8C:7A:3D": "Huawei",
  "94:FE:22": "Huawei",
  "A4:56:CC": "Huawei",
  "AC:E2:D3": "Huawei",
  "C4:12:EC": "Huawei",
  "CC:B0:DA": "Huawei",
  "D4:6D:6D": "Huawei",
  "E0:DC:FF": "Huawei",
  "F4:C7:60": "Huawei",
  "00:9A:CD": "Huawei (Honor)",
  "0C:9D:92": "Xiaomi",
  "10:2A:B3": "Xiaomi",
  "18:59:36": "Xiaomi",
  "20:82:C0": "Xiaomi",
  "28:6C:07": "Xiaomi",
  "34:80:B3": "Xiaomi",
  "3C:BD:3E": "Xiaomi",
  "44:23:7C": "Xiaomi",
  "50:8F:4C": "Xiaomi",
  "64:09:80": "Xiaomi",
  "68:DF:DD": "Xiaomi",
  "74:23:44": "Xiaomi",
  "78:11:DC": "Xiaomi",
  "7C:1D:D9": "Xiaomi",
  "8C:BE:BE": "Xiaomi",
  "98:FA:9B": "Xiaomi",
  "A0:9C:33": "Xiaomi",
  "AC:C1:EE": "Xiaomi",
  "B0:E2:35": "Xiaomi",
  "C4:0B:CB": "Xiaomi",
  "D4:97:0B": "Xiaomi",
  "F0:B4:29": "Xiaomi",
  "F8:A4:5F": "Xiaomi (Redmi)",
  "50:64:2B": "TP-Link",
  "54:A7:03": "TP-Link",
  "60:E3:27": "TP-Link",
  "64:70:02": "TP-Link",
  "6C:5A:B0": "TP-Link",
  "74:DA:88": "TP-Link",
  "98:DA:C4": "TP-Link",
  "A0:F3:C1": "TP-Link",
  "B0:4E:26": "TP-Link",
  "C0:25:E9": "TP-Link",
  "D8:0D:17": "TP-Link",
  "E4:95:6E": "TP-Link",
  "EC:08:6B": "TP-Link",
  "F4:F2:6D": "TP-Link",
  "50:C7:BF": "TP-Link",
  "00:1D:0F": "Netgear",
  "08:02:8E": "Netgear",
  "20:4E:7F": "Netgear",
  "28:80:88": "Netgear",
  "44:A5:6E": "Netgear",
  "6C:B0:CE": "Netgear",
  "A0:40:A0": "Netgear",
  "B0:7F:B9": "Netgear",
  "C4:04:15": "Netgear",
  "E0:46:9A": "Netgear",
  "1C:5F:2B": "D-Link",
  "28:10:BD": "D-Link",
  "5C:D9:98": "D-Link",
  "90:8D:78": "D-Link",
  "B8:A3:86": "D-Link",
  "C8:BE:19": "D-Link",
  "F0:7D:68": "D-Link",
  "00:1A:70": "D-Link",
  "04:D4:C4": "Ubiquiti",
  "24:5A:4C": "Ubiquiti",
  "44:D9:E7": "Ubiquiti",
  "68:72:51": "Ubiquiti",
  "74:AC:B9": "Ubiquiti",
  "78:8A:20": "Ubiquiti",
  "80:2A:A8": "Ubiquiti",
  "B4:FB:E4": "Ubiquiti",
  "E0:63:DA": "Ubiquiti",
  "FC:EC:DA": "Ubiquiti",
  "00:0C:42": "MikroTik",
  "08:55:31": "MikroTik",
  "18:FD:74": "MikroTik",
  "48:8F:5A": "MikroTik",
  "4C:5E:0C": "MikroTik",
  "64:D1:54": "MikroTik",
  "74:4D:28": "MikroTik",
  "B8:69:F4": "MikroTik",
  "CC:2D:E0": "MikroTik",
  "D4:01:C3": "MikroTik",
  "DC:2C:6E": "MikroTik",
  "E4:8D:8C": "MikroTik",
  "00:1B:21": "Intel",
  "00:1E:64": "Intel",
  "08:11:96": "Intel",
  "10:F1:F2": "Intel",
  "24:0A:64": "Intel",
  "3C:F4:38": "Intel",
  "48:51:B7": "Intel",
  "5C:87:9C": "Intel",
  "68:07:15": "Intel",
  "7C:50:49": "Intel",
  "8C:16:45": "Intel",
  "A0:36:9F": "Intel",
  "B4:D6:76": "Intel",
  "C8:5B:76": "Intel",
  "E8:B2:AC": "Intel",
  "F4:8C:50": "Intel",
  "00:E0:4C": "Realtek",
  "04:92:26": "Realtek",
  "08:10:74": "Realtek",
  "1C:BF:CE": "Realtek",
  "2C:F0:5D": "Realtek",
  "40:61:86": "Realtek",
  "52:54:00": "Realtek (QEMU)",
  "74:DA:38": "Realtek",
  "98:DE:D0": "Realtek",
  "B0:25:AA": "Realtek",
  "D8:BB:C1": "Realtek",
  "E0:D5:5E": "Realtek",
  "24:0A:C4": "Espressif (ESP)",
  "30:AE:A4": "Espressif (ESP)",
  "60:01:94": "Espressif (ESP)",
  "7C:9E:BD": "Espressif (ESP)",
  "84:CC:A8": "Espressif (ESP)",
  "A0:20:A6": "Espressif (ESP)",
  "B4:E6:2D": "Espressif (ESP)",
  "CC:50:E3": "Espressif (ESP)",
  "DC:4F:22": "Espressif (ESP)",
  "B8:27:EB": "Raspberry Pi",
  "DC:A6:32": "Raspberry Pi",
  "E4:5F:01": "Raspberry Pi",
  "D8:3A:DD": "Raspberry Pi",
  "00:1E:06": "Sony",
  "04:D9:F5": "Sony",
  "10:68:3F": "Sony",
  "30:F7:C5": "Sony",
  "54:8A:73": "Sony",
  "70:9E:29": "Sony",
  "8C:CD:E8": "Sony",
  "AC:9B:0A": "Sony (PlayStation)",
  "00:19:C5": "Sony (PlayStation)",
  "00:1A:80": "LG",
  "20:39:56": "LG",
  "40:B4:CD": "LG",
  "5C:E9:31": "LG",
  "64:BC:0C": "LG",
  "78:5D:C8": "LG",
  "98:AF:65": "LG",
  "A8:23:FE": "LG",
  "C4:6A:B7": "LG",
  "00:1C:62": "Google/Nest",
  "18:B4:30": "Google/Nest",
  "30:FD:38": "Google/Nest",
  "54:60:09": "Google/Nest",
  "A4:77:33": "Google/Nest",
  "F4:F5:D8": "Google/Nest",
  "00:23:76": "Amazon",
  "0C:47:C9": "Amazon",
  "18:74:2E": "Amazon",
  "44:65:0D": "Amazon",
  "68:37:E9": "Amazon",
  "74:C2:46": "Amazon",
  "84:D6:D0": "Amazon",
  "A0:02:DC": "Amazon",
  "B4:7C:9C": "Amazon",
  "F0:27:2D": "Amazon",
  "00:14:22": "Dell",
  "18:03:73": "Dell",
  "24:B6:FD": "Dell",
  "34:17:EB": "Dell",
  "44:A8:42": "Dell",
  "54:BF:64": "Dell",
  "80:18:44": "Dell",
  "B0:83:FE": "Dell",
  "D4:81:D7": "Dell",
  "F4:8E:92": "Dell",
  "3C:97:0E": "HP",
  "4C:ED:FB": "HP",
  "70:5A:0F": "HP",
  "80:C1:6E": "HP",
  "94:57:A5": "HP",
  "A0:B3:CC": "HP",
  "B4:39:D6": "HP",
  "D8:9E:F3": "HP",
  "00:21:5A": "Lenovo",
  "08:F8:BC": "Lenovo",
  "28:D2:44": "Lenovo",
  "54:E1:AD": "Lenovo",
  "68:F7:28": "Lenovo",
  "F0:76:1C": "Lenovo",
  "00:1E:65": "OnePlus",
  "08:EB:ED": "OnePlus",
  "30:14:4A": "OnePlus",
  "64:A2:F9": "OnePlus",
  "94:65:2D": "OnePlus",
  "C0:EE:FB": "OnePlus",
  "00:24:1D": "Oppo",
  "18:87:40": "Oppo",
  "24:DA:33": "Oppo",
  "30:24:A9": "Oppo",
  "40:9F:38": "Oppo",
  "A8:1D:2D": "Oppo",
  "C0:5A:CF": "Oppo",
  "00:8C:54": "ZTE",
  "34:6B:D3": "ZTE",
  "4C:09:D4": "ZTE",
  "60:BE:B5": "ZTE",
  "90:8D:6C": "ZTE",
  "A8:32:9C": "ZTE",
  "D0:87:E2": "ZTE",
  "00:1F:16": "Nintendo",
  "00:22:AA": "Nintendo",
  "2C:10:C1": "Nintendo",
  "40:F4:07": "Nintendo",
  "78:A2:A0": "Nintendo",
  "8C:56:C5": "Nintendo",
  "98:B6:E9": "Nintendo",
  "B8:AE:6E": "Nintendo",
  "CC:9E:A2": "Nintendo",
  "E0:0C:7F": "Nintendo",
  "00:11:32": "Synology",
  "00:11:11": "Synology",
  "00:0E:A6": "Asus",
  "08:60:6E": "Asus",
  "10:BF:48": "Asus",
  "1C:B7:2C": "Asus",
  "2C:56:DC": "Asus",
  "30:85:A9": "Asus",
  "38:D5:47": "Asus",
  "50:46:5D": "Asus",
  "70:8B:CD": "Asus",
  "74:D0:2B": "Asus",
  "88:D7:F6": "Asus",
  "9C:5C:8E": "Asus",
  "AC:9E:17": "Asus",
  "BC:EE:7B": "Asus",
  "D0:17:C2": "Asus",
  "E0:3F:49": "Asus",
  "F4:6D:04": "Asus",
  "FC:34:97": "Asus",
  "00:1A:11": "Roku",
  "B0:A7:37": "Roku",
  "CC:6D:A0": "Roku",
  "D8:31:34": "Roku",
  "DC:3A:5E": "Roku",

};

/** Vendor name for a MAC, or null when the OUI is unknown. */
export function vendorFromMac(mac: string): string | null {
  const normalized = toMac(mac);
  if (!/^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/.test(normalized)) return null;
  return OUI_TABLE[normalized.slice(0, 8)] ?? null;
}

/** Runs `fn` over `items` with bounded concurrency, preserving order. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}
