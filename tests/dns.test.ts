import { describe, expect, it } from "vitest";
import {
  buildBlockResponse,
  dnsTypeToString,
  matchesDomainRule,
  parseDnsQuery,
} from "@/server/dns/packet";

describe("DNS Packet parsing and response (RFC 1035)", () => {
  function makeQueryBuffer(domain: string, qtype = 1, id = 0x1234): Buffer {
    const parts = domain.split(".");
    const qnameBuf = Buffer.concat([
      ...parts.map((p) =>
        Buffer.concat([Buffer.from([p.length]), Buffer.from(p, "ascii")]),
      ),
      Buffer.from([0]),
    ]);

    const header = Buffer.alloc(12);
    header.writeUInt16BE(id, 0); // ID
    header.writeUInt16BE(0x0100, 2); // Flags: Standard query, RD=1
    header.writeUInt16BE(1, 4); // QDCOUNT = 1
    header.writeUInt16BE(0, 6); // ANCOUNT = 0
    header.writeUInt16BE(0, 8); // NSCOUNT = 0
    header.writeUInt16BE(0, 10); // ARCOUNT = 0

    const tail = Buffer.alloc(4);
    tail.writeUInt16BE(qtype, 0); // QTYPE
    tail.writeUInt16BE(1, 2); // QCLASS = IN

    return Buffer.concat([header, qnameBuf, tail]);
  }

  describe("parseDnsQuery", () => {
    it("parses valid A record queries", () => {
      const buf = makeQueryBuffer("google.com", 1, 0x4321);
      const parsed = parseDnsQuery(buf);

      expect(parsed).not.toBeNull();
      expect(parsed?.id).toBe(0x4321);
      expect(parsed?.qname).toBe("google.com");
      expect(parsed?.qtype).toBe(1);
      expect(parsed?.qclass).toBe(1);
      expect(dnsTypeToString(parsed?.qtype ?? 0)).toBe("A");
    });

    it("parses valid AAAA record queries with subdomains", () => {
      const buf = makeQueryBuffer("v16.api.tiktok.com", 28, 0x9988);
      const parsed = parseDnsQuery(buf);

      expect(parsed).not.toBeNull();
      expect(parsed?.qname).toBe("v16.api.tiktok.com");
      expect(parsed?.qtype).toBe(28);
      expect(dnsTypeToString(parsed?.qtype ?? 0)).toBe("AAAA");
    });

    it("returns null for malformed or truncated packets", () => {
      expect(parseDnsQuery(Buffer.from([]))).toBeNull();
      expect(parseDnsQuery(Buffer.alloc(11))).toBeNull(); // Less than 12-byte header
      expect(parseDnsQuery(Buffer.alloc(14))).toBeNull(); // Missing terminating 0 or question trailer
    });

    it("returns null when QDCOUNT is zero", () => {
      const buf = Buffer.alloc(16);
      buf.writeUInt16BE(0, 4); // QDCOUNT = 0
      expect(parseDnsQuery(buf)).toBeNull();
    });
  });

  describe("buildBlockResponse", () => {
    it("crafts a 0.0.0.0 answer record for A queries", () => {
      const queryBuf = makeQueryBuffer("tiktok.com", 1, 0x55aa);
      const query = parseDnsQuery(queryBuf)!;

      const resp = buildBlockResponse(queryBuf, query, "zero");
      expect(resp.length).toBeGreaterThan(query.questionLength);

      // Verify header
      expect(resp.readUInt16BE(0)).toBe(0x55aa); // Preserves query ID
      expect(resp.readUInt16BE(2)).toBe(0x8180); // Response flags: QR=1, RA=1, RCODE=0
      expect(resp.readUInt16BE(4)).toBe(1); // QDCOUNT = 1
      expect(resp.readUInt16BE(6)).toBe(1); // ANCOUNT = 1

      // Verify Answer: pointer (2) + type (2) + class (2) + ttl (4) + len (2) + ip (4)
      let offset = query.questionLength;
      expect(resp.readUInt16BE(offset)).toBe(0xc00c); // Pointer to byte 12
      offset += 2;
      expect(resp.readUInt16BE(offset)).toBe(1); // Type A
      offset += 2;
      expect(resp.readUInt16BE(offset)).toBe(1); // Class IN
      offset += 2;
      expect(resp.readUInt32BE(offset)).toBe(60); // TTL 60
      offset += 4;
      expect(resp.readUInt16BE(offset)).toBe(4); // Length 4
      offset += 2;
      expect(resp.readUInt32BE(offset)).toBe(0); // 0.0.0.0
    });

    it("crafts a :: (16 bytes zero) answer record for AAAA queries", () => {
      const queryBuf = makeQueryBuffer("ads.example.com", 28, 0x1234);
      const query = parseDnsQuery(queryBuf)!;

      const resp = buildBlockResponse(queryBuf, query, "zero");
      expect(resp.length).toBe(query.questionLength + 28);

      let offset = query.questionLength;
      offset += 10; // skip pointer, type, class, ttl
      expect(resp.readUInt16BE(offset)).toBe(16); // Length 16
      offset += 2;
      const ipv6 = resp.subarray(offset, offset + 16);
      expect(ipv6.every((b) => b === 0)).toBe(true);
    });

    it("returns NXDOMAIN (RCODE=3) when mode is nxdomain or non-IP query", () => {
      const queryBuf = makeQueryBuffer("evil.com", 15, 0x7777); // MX query
      const query = parseDnsQuery(queryBuf)!;

      const resp = buildBlockResponse(queryBuf, query, "nxdomain");
      expect(resp.length).toBe(query.questionLength); // No answer records
      expect(resp.readUInt16BE(2)).toBe(0x8183); // Flags with RCODE=3 (NXDOMAIN)
      expect(resp.readUInt16BE(6)).toBe(0); // ANCOUNT = 0
    });
  });

  describe("matchesDomainRule", () => {
    it("matches exact domains", () => {
      expect(matchesDomainRule("tiktok.com", "tiktok.com")).toBe(true);
      expect(matchesDomainRule("facebook.com.", "facebook.com")).toBe(true);
      expect(matchesDomainRule("GOOGLE.COM", "google.com")).toBe(true);
    });

    it("matches subdomains of a parent rule", () => {
      expect(matchesDomainRule("api.tiktok.com", "tiktok.com")).toBe(true);
      expect(matchesDomainRule("v16.api.tiktok.com", "tiktok.com")).toBe(true);
      expect(matchesDomainRule("m.facebook.com", "*.facebook.com")).toBe(true);
      expect(matchesDomainRule("video.m.facebook.com", "*.facebook.com")).toBe(true);
    });

    it("does not match unrelated domains containing the pattern as substring", () => {
      expect(matchesDomainRule("nottiktok.com", "tiktok.com")).toBe(false);
      expect(matchesDomainRule("tiktok.com.evil.com", "tiktok.com")).toBe(false);
      expect(matchesDomainRule("myfacebook.com", "facebook.com")).toBe(false);
    });

    it("handles edge cases and empty patterns safely", () => {
      expect(matchesDomainRule("", "tiktok.com")).toBe(false);
      expect(matchesDomainRule("tiktok.com", "")).toBe(false);
    });
  });
});
