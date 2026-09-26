/**
 * PURE DNS packet parsing and response generation (RFC 1035).
 *
 * Zero dependencies, pure Buffer operations. Completely unit-testable.
 */

export type DnsQuery = {
  id: number;
  flags: number;
  qname: string;
  qtype: number;
  qclass: number;
  questionLength: number;
};

const TYPE_NAMES: Record<number, string> = {
  1: "A",
  2: "NS",
  5: "CNAME",
  6: "SOA",
  12: "PTR",
  15: "MX",
  16: "TXT",
  28: "AAAA",
  33: "SRV",
  255: "ANY",
};

export function dnsTypeToString(qtype: number): string {
  return TYPE_NAMES[qtype] ?? `TYPE${qtype}`;
}

/**
 * Parses the header and the first Question record of a DNS query buffer.
 * Returns null if the packet is malformed or smaller than the minimal header.
 */
export function parseDnsQuery(buf: Buffer): DnsQuery | null {
  if (buf.length < 12) return null;

  const id = buf.readUInt16BE(0);
  const flags = buf.readUInt16BE(2);
  const qdcount = buf.readUInt16BE(4);

  // Must have at least one question
  if (qdcount < 1) return null;

  const labels: string[] = [];
  let curr = 12;

  while (curr < buf.length && buf[curr] !== 0) {
    const len = buf[curr];
    curr++;
    if (curr + len > buf.length) return null;
    labels.push(buf.subarray(curr, curr + len).toString("ascii"));
    curr += len;
  }

  if (curr >= buf.length || buf[curr] !== 0) return null;
  curr++; // skip the terminating null byte

  if (curr + 4 > buf.length) return null;
  const qtype = buf.readUInt16BE(curr);
  curr += 2;
  const qclass = buf.readUInt16BE(curr);
  curr += 2;

  return {
    id,
    flags,
    qname: labels.join(".").toLowerCase(),
    qtype,
    qclass,
    questionLength: curr,
  };
}

/**
 * Builds a fast DNS response that blocks resolution:
 *  - For Type A (IPv4): returns NOERROR with IP `0.0.0.0`
 *  - For Type AAAA (IPv6): returns NOERROR with IP `::`
 *  - For other types or when mode is "nxdomain": returns RCODE 3 (NXDOMAIN)
 *
 * Uses DNS name pointer compression (0xc00c) pointing back to the question name
 * at byte 12 for maximum efficiency and RFC compliance.
 */
export function buildBlockResponse(
  queryBuf: Buffer,
  query: DnsQuery,
  mode: "zero" | "nxdomain" = "zero",
): Buffer {
  const isA = query.qtype === 1;
  const isAAAA = query.qtype === 28;

  if (mode === "nxdomain" || (!isA && !isAAAA)) {
    // Return NXDOMAIN (RCODE = 3) with 0 answers
    const resp = Buffer.alloc(query.questionLength);
    queryBuf.copy(resp, 0, 0, query.questionLength);
    // Flags: QR=1 (bit 15), RD=inherited (bit 8), RA=1 (bit 7), RCODE=3 (bits 0-3) -> 0x8183
    resp.writeUInt16BE(0x8183, 2);
    resp.writeUInt16BE(0, 6); // ANCOUNT = 0
    return resp;
  }

  // A or AAAA answer record
  // Name pointer (2) + Type (2) + Class (2) + TTL (4) + RDLENGTH (2) + RDATA (4 or 16)
  const answerLength = isA ? 16 : 28;
  const resp = Buffer.alloc(query.questionLength + answerLength);

  // Copy query header and question
  queryBuf.copy(resp, 0, 0, query.questionLength);

  // Set response flags: QR=1, RD=1, RA=1, RCODE=0 -> 0x8180
  resp.writeUInt16BE(0x8180, 2);
  resp.writeUInt16BE(1, 6); // ANCOUNT = 1

  let offset = query.questionLength;

  // Name pointer: 0xc00c points to byte 12 (the question domain)
  resp.writeUInt16BE(0xc00c, offset);
  offset += 2;

  // Type (A=1 or AAAA=28)
  resp.writeUInt16BE(query.qtype, offset);
  offset += 2;

  // Class IN = 1
  resp.writeUInt16BE(1, offset);
  offset += 2;

  // TTL = 60 seconds
  resp.writeUInt32BE(60, offset);
  offset += 4;

  if (isA) {
    // RDLENGTH = 4
    resp.writeUInt16BE(4, offset);
    offset += 2;
    // 0.0.0.0
    resp.writeUInt32BE(0, offset);
  } else {
    // RDLENGTH = 16
    resp.writeUInt16BE(16, offset);
    offset += 2;
    // :: (16 bytes of zeros)
    resp.fill(0, offset, offset + 16);
  }

  return resp;
}

/**
 * Checks whether a requested domain matches a rule pattern.
 *
 * Examples:
 *  - rule "tiktok.com" matches "tiktok.com" and "v16.api.tiktok.com", but not "nottiktok.com"
 *  - rule "*.facebook.com" matches "facebook.com", "m.facebook.com"
 *  - rule "ads.google.com" matches "ads.google.com" and "sub.ads.google.com"
 */
export function matchesDomainRule(
  requestedDomain: string,
  rulePattern: string,
): boolean {
  const req = requestedDomain.toLowerCase().replace(/\.+$/, "");
  let pat = rulePattern.toLowerCase().replace(/\.+$/, "");

  if (pat.startsWith("*.")) {
    pat = pat.slice(2);
  }

  if (!pat || !req) return false;
  if (req === pat) return true;
  if (req.endsWith("." + pat)) return true;

  return false;
}
