import { describe, expect, it } from "vitest";
import {
  bpsFromDelta,
  bpsToMbps,
  clamp,
  computeDelta,
  dateKey,
  monthKey,
  normalizeMac,
  sumUsage,
} from "@/lib/usage/calculator";
import { formatBytes, formatMbps } from "@/lib/format";

describe("normalizeMac", () => {
  it("uppercases and colon-separates plain hex", () => {
    expect(normalizeMac("a4:83:e7:11:22:33")).toBe("A4:83:E7:11:22:33");
    expect(normalizeMac("a483e7112233")).toBe("A4:83:E7:11:22:33");
    expect(normalizeMac("A4-83-E7-11-22-33")).toBe("A4:83:E7:11:22:33");
  });

  it("leaves unparseable input untouched (uppercased)", () => {
    expect(normalizeMac("not-a-mac")).toBe("NOT-A-MAC");
  });
});

describe("computeDelta", () => {
  it("returns the positive difference", () => {
    expect(computeDelta(1500, 1000)).toBe(500);
  });

  it("returns null without a previous reading", () => {
    expect(computeDelta(1500, null)).toBeNull();
    expect(computeDelta(1500, undefined)).toBeNull();
  });

  it("returns null on counter reset (never a negative)", () => {
    expect(computeDelta(10, 5_000)).toBeNull();
  });

  it("accepts zero delta", () => {
    expect(computeDelta(1000, 1000)).toBe(0);
  });

  it("rejects non-finite input", () => {
    expect(computeDelta(Number.NaN, 10)).toBeNull();
  });
});

describe("rate math", () => {
  it("converts bytes over seconds to bits per second", () => {
    expect(bpsFromDelta(1_000_000, 1)).toBe(8_000_000);
    expect(bpsFromDelta(1_000_000, 0)).toBe(0);
  });

  it("converts bps to Mbps with 10^6 convention", () => {
    expect(bpsToMbps(20_000_000)).toBe(20);
  });
});

describe("aggregate keys", () => {
  it("builds local YYYY-MM-DD keys", () => {
    expect(dateKey(new Date(2026, 8, 26))).toBe("2026-09-26");
    expect(dateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("builds {year, month} keys with 1-based months", () => {
    expect(monthKey(new Date(2026, 8, 26))).toEqual({ year: 2026, month: 9 });
    expect(monthKey(new Date(2026, 11, 1))).toEqual({ year: 2026, month: 12 });
  });
});

describe("clamp + sumUsage", () => {
  it("clamps within bounds", () => {
    expect(clamp(5, 1, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });

  it("sums usage rows and tolerates missing fields", () => {
    expect(
      sumUsage([
        { downloadBytes: 100, uploadBytes: 10 },
        { downloadBytes: 250, uploadBytes: 40 },
      ]),
    ).toEqual({ downloadBytes: 350, uploadBytes: 50 });
  });
});

describe("formatting", () => {
  it("formats bytes with Arabic units", () => {
    expect(formatBytes(0)).toBe("0 بايت");
    expect(formatBytes(512)).toBe("512 بايت");
    expect(formatBytes(1536)).toBe("1.5 كيلوبايت");
    expect(formatBytes(1024 ** 3 * 2.4)).toBe("2.4 جيجابايت");
  });

  it("formats Mbps", () => {
    expect(formatMbps(0)).toBe("0 ميجابت/ث");
    expect(formatMbps(18.42)).toBe("18.4 ميجابت/ث");
    expect(formatMbps(145.2)).toBe("145 ميجابت/ث");
  });
});
