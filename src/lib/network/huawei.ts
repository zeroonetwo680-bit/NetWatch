/**
 * Adapter for Huawei home gateways (tested: DN8245X6-10, Vodafone Egypt
 * DEGYPTZVDF2WIFI V500R022C10SPC392) that expose only a TR-069 CGI web
 * interface on port 443 — no RouterOS API, no REST, no SNMP.
 *
 * Protocol:
 *   1. POST /asp/GetRandCount.asp            → CSRF token
 *   2. POST /login.cgi (base64 password)     → Set-Cookie: CookieHttps=…
 *   3. POST /html/bbsp/common/GetLanUserDevInfo.asp  → JS with USERDevice(…)
 *   4. add.cgi / del.cgi via TR-069 MacFilter object for blocking
 *
 * Uses node:https directly (with rejectUnauthorized:false) because the
 * router serves a self-signed certificate that Node's default fetch rejects.
 */

import https from "node:https";
import { discoverUpnpLocation, readUpnpTotals } from "./lan-discovery";
import type {
  AdapterCapabilities,
  AdapterStatus,
  MikrotikConnectionConfig,
  NetworkAdapter,
  RouterDeviceSnapshot,
  TotalThroughput,
} from "./types";
import { AdapterError, UnsupportedOperationError } from "./types";
import { normalizeMac } from "@/lib/usage/calculator";

// ─── Config ────────────────────────────────────────────────────────────────

export type HuaweiConnectionConfig = {
  host: string;
  user: string;
  password: string;
};

const CAPABILITIES: AdapterCapabilities = {
  perDeviceTraffic: true,
  totalTraffic: true,
  speedLimit: false,
  blocking: true,
  note: null,
};

// ─── Low-level HTTP helper ───────────────────────────────────────────────

const insecureAgent = new https.Agent({ rejectUnauthorized: false });

type RawResponse = {
  status: number;
  headers: Map<string, string>;
  body: string;
};

function httpRequest(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
  } = {},
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const bodyBuf = options.body ? Buffer.from(options.body, "utf8") : null;
    const timeout = options.timeoutMs ?? 8_000;

    const req = https.request(
      {
        agent: insecureAgent,
        hostname: urlObj.hostname,
        port: parseInt(urlObj.port || "443", 10),
        path: urlObj.pathname + urlObj.search,
        method: options.method ?? "GET",
        headers: {
          ...options.headers,
          ...(bodyBuf ? { "content-length": String(bodyBuf.length) } : {}),
        },
        timeout,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const hdrs = new Map<string, string>();
          for (const [k, v] of Object.entries(res.headers)) {
            if (v != null)
              hdrs.set(k.toLowerCase(), Array.isArray(v) ? v.join(", ") : v);
          }
          resolve({
            status: res.statusCode ?? 200,
            headers: hdrs,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("انتهت مهلة الاتصال بالراوتر"));
    });
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}

// ─── Adapter ────────────────────────────────────────────────────────────

export class HuaweiWebAdapter implements NetworkAdapter {
  readonly mode = "huawei" as const;

  private config: HuaweiConnectionConfig;
  private sessionCookie: string | null = null;
  private connected = false;
  private lastPollAt: string | null = null;
  private lastError: string | null = null;
  private lastDeviceCount = 0;
  private reconnectAfter = 0;
  private connecting: Promise<void> | null = null;
  private upnpLocation: string | null = null;
  private upnpCheckedAt = 0;
  private prevTotals: { rx: number; tx: number; at: number } | null = null;

  constructor(config: HuaweiConnectionConfig) {
    this.config = { ...config };
  }

  /** Called from system service when admin updates Huawei settings at runtime. */
  updateConfig(config: HuaweiConnectionConfig): void {
    const changed =
      config.host !== this.config.host ||
      config.user !== this.config.user ||
      config.password !== this.config.password;
    this.config = { ...config };
    if (changed) {
      this.sessionCookie = null;
      this.connected = false;
    }
  }

  /** No-op — satisfies NetworkAdapter interface (MikroTik-only method). */
  setConnectionConfig(_c: MikrotikConnectionConfig): void {}

  async connect(): Promise<void> {
    if (this.connected) return;
    if (this.connecting) return this.connecting;
    if (Date.now() < this.reconnectAfter) {
      throw new AdapterError(this.lastError ?? "الراوتر غير متاح مؤقتاً");
    }
    this.connecting = this.doLogin()
      .catch((err: unknown) => {
        this.connected = false;
        this.sessionCookie = null;
        this.lastError = `فشل تسجيل الدخول إلى ${this.config.host} — ${
          err instanceof Error ? err.message : String(err)
        }`;
        this.reconnectAfter = Date.now() + 30_000;
        throw new AdapterError(this.lastError, err);
      })
      .finally(() => {
        this.connecting = null;
      });
    return this.connecting;
  }

  private async doLogin(): Promise<void> {
    const base = `https://${this.config.host}`;

    // Step 1 — CSRF token (strip UTF-8 BOM the router sometimes prepends)
    const tokenResp = await httpRequest(`${base}/asp/GetRandCount.asp`, {
      method: "POST",
    });
    if (tokenResp.status !== 200)
      throw new Error(`GetRandCount HTTP ${tokenResp.status}`);
    const token = tokenResp.body.replace(/^﻿/, "").trim();

    // Step 2 — Login with base64-encoded password (NOT SHA256).
    // Do NOT use URLSearchParams here — it encodes = → %3D, + → %2B, / → %2F,
    // and Huawei's CGI decoder doesn't handle those percent-sequences in the
    // PassWord field, so the base64 string becomes invalid on the router side.
    const passB64 = Buffer.from(this.config.password, "utf8").toString("base64");
    const loginBody = `UserName=${encodeURIComponent(this.config.user)}&PassWord=${passB64}&Language=english&x.X_HW_Token=${token}`;

    const loginResp = await httpRequest(`${base}/login.cgi`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: loginBody,
    });

    const setCookie = loginResp.headers.get("set-cookie") ?? "";
    const cookieMatch = setCookie.match(/CookieHttps=[^;]+/);
    if (!cookieMatch) {
      const html = loginResp.body;
      if (/FailStat\s*=\s*['"]1['"]/.test(html) || /LoginTimes\s*=\s*['"][1-9]/.test(html)) {
        throw new Error("بيانات الدخول غير صحيحة (اسم المستخدم أو كلمة المرور)");
      }
      throw new Error("لم يُعاد أي session cookie — تأكد من عنوان الراوتر وبيانات الدخول");
    }

    this.sessionCookie = cookieMatch[0];
    this.connected = true;
    this.lastError = null;
    this.reconnectAfter = 0;
  }

  async disconnect(): Promise<void> {
    this.sessionCookie = null;
    this.connected = false;
  }

  status(): AdapterStatus {
    return {
      mode: this.mode,
      connected: this.connected,
      capabilities: CAPABILITIES,
      lastPollAt: this.lastPollAt,
      lastError: this.lastError,
      deviceCount: this.lastDeviceCount,
    };
  }

  async discover(): Promise<RouterDeviceSnapshot[]> {
    await this.ensureConnected();
    try {
      const html = await this.routerPost("/html/bbsp/common/GetLanUserDevInfo.asp");
      const snapshots = parseUserDevList(html);
      this.lastDeviceCount = snapshots.filter((s) => s.online).length;
      this.lastPollAt = new Date().toISOString();
      this.lastError = null;
      return snapshots;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      if (err instanceof AdapterError) throw err;
      throw new AdapterError(this.lastError, err);
    }
  }

  async setBlocked(mac: string, blocked: boolean): Promise<void> {
    const normalized = normalizeMac(mac);
    if (blocked) {
      await this.addMacBlock(normalized);
    } else {
      await this.removeMacBlock(normalized);
    }
  }

  async applySpeedLimit(_mac: string, _dl: number, _ul: number): Promise<void> {
    throw new UnsupportedOperationError(
      "راوتر هواوي DN8245X6 لا يدعم تحديد السرعة لكل جهاز — استخدم راوتر MikroTik لهذه الميزة.",
    );
  }

  async removeSpeedLimit(_mac: string): Promise<void> {
    throw new UnsupportedOperationError(
      "راوتر هواوي DN8245X6 لا يدعم تحديد السرعة لكل جهاز.",
    );
  }

  async totalThroughput(): Promise<TotalThroughput | null> {
    try {
      const now = Date.now();
      if (!this.upnpLocation || now - this.upnpCheckedAt > 600_000) {
        this.upnpLocation = await discoverUpnpLocation(2_000);
        this.upnpCheckedAt = now;
      }
      if (!this.upnpLocation) return null;

      const totals = await readUpnpTotals(this.upnpLocation, 2_500);
      if (!totals) return null;

      const prev = this.prevTotals;
      this.prevTotals = { rx: totals.received, tx: totals.sent, at: now };
      const secs = prev ? Math.max(0.5, (now - prev.at) / 1000) : 0;
      return {
        downloadMbps:
          prev && totals.received >= prev.rx
            ? round2(((totals.received - prev.rx) * 8) / secs / 1e6)
            : null,
        uploadMbps:
          prev && totals.sent >= prev.tx
            ? round2(((totals.sent - prev.tx) * 8) / secs / 1e6)
            : null,
      };
    } catch {
      this.upnpLocation = null;
      return null;
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────

  private async ensureConnected(): Promise<void> {
    if (!this.connected || !this.sessionCookie) await this.connect();
  }

  private async routerGet(path: string): Promise<string> {
    await this.ensureConnected();
    const resp = await httpRequest(`https://${this.config.host}${path}`, {
      method: "GET",
      headers: { cookie: this.sessionCookie ?? "" },
    });
    this.checkSessionExpiry(resp.status, resp.body);
    if (resp.status !== 200)
      throw new AdapterError(`HTTP ${resp.status} from router: ${path}`);
    return resp.body;
  }

  private async routerPost(path: string, body?: string): Promise<string> {
    await this.ensureConnected();
    const resp = await httpRequest(`https://${this.config.host}${path}`, {
      method: "POST",
      headers: {
        cookie: this.sessionCookie ?? "",
        ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
      },
      body,
    });
    this.checkSessionExpiry(resp.status, resp.body);
    return resp.body;
  }

  private checkSessionExpiry(status: number, body: string): void {
    const expired =
      status === 403 ||
      body.includes("login_degyptzvdf") ||
      /var\s+pageName\s*=\s*['"]\/['"]/.test(body);
    if (expired) {
      this.connected = false;
      this.sessionCookie = null;
      this.reconnectAfter = 0;
      throw new AdapterError("انتهت جلسة الراوتر — جارٍ إعادة تسجيل الدخول");
    }
  }

  private async getPageToken(path: string): Promise<string> {
    const html = await this.routerGet(path);
    const token = extractToken(html);
    if (!token) throw new AdapterError("تعذّر استخراج رمز الأمان (CSRF) من صفحة الراوتر");
    return token;
  }

  private async addMacBlock(mac: string): Promise<void> {
    // Fetch filter page first to check if already blocked and get fresh token
    const filterPage = await this.routerGet("/html/bbsp/macfilter/macfilter.asp");
    const token = extractToken(filterPage);
    if (!token) throw new AdapterError("تعذّر استخراج رمز الأمان (CSRF)");

    const existing = parseMacFilter(filterPage);
    if (existing.some((e) => e.mac === mac)) return; // Already blocked

    const body = new URLSearchParams({
      "x.SourceMACAddress": mac,
      "x.DeviceAlias": "netwatch-block",
      "x.X_HW_Token": token,
    }).toString();

    const resp = await this.routerPost(
      "/add.cgi?x=InternetGatewayDevice.X_HW_Security.MacFilter&RequestFile=html/bbsp/macfilter/macfilter.asp",
      body,
    );
    const errMatch = resp.match(/ErrCode\s*=\s*["']([^"']+)["']/);
    if (errMatch && errMatch[1] !== "0" && errMatch[1] !== "0x0") {
      throw new AdapterError(`فشل حظر الجهاز ${mac} — رمز الخطأ: ${errMatch[1]}`);
    }
  }

  private async removeMacBlock(mac: string): Promise<void> {
    const filterPage = await this.routerGet("/html/bbsp/macfilter/macfilter.asp");
    const token = extractToken(filterPage);
    if (!token) throw new AdapterError("تعذّر استخراج رمز الأمان (CSRF)");

    const entries = parseMacFilter(filterPage);
    const targets = entries.filter((e) => e.mac === mac);
    if (targets.length === 0) return; // Already unblocked

    const params = new URLSearchParams();
    for (const t of targets) params.append(t.domain, "");
    params.append("x.X_HW_Token", token);

    await this.routerPost(
      "/del.cgi?x=InternetGatewayDevice.X_HW_Security.MacFilter&RequestFile=html/bbsp/macfilter/macfilter.asp",
      params.toString(),
    );
  }
}

// ─── Parsers (pure) ─────────────────────────────────────────────────────

function unescapeJs(s: string): string {
  return s.replace(/\\x([0-9a-fA-F]{2})/g, (_, h: string) =>
    String.fromCharCode(parseInt(h, 16)),
  );
}

function extractQuotedArgs(argsStr: string): string[] {
  const args: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(argsStr)) !== null) {
    args.push(unescapeJs(m[1]));
  }
  return args;
}

function extractToken(html: string): string {
  return html.match(/id="hwonttoken"\s+value="([^"]+)"/)?.[1] ?? "";
}

export function parseUserDevList(html: string): RouterDeviceSnapshot[] {
  const snapshots: RouterDeviceSnapshot[] = [];
  // Each device is a JS constructor call; args are all quoted strings
  const re = /new USERDevice\(([^)]+)\)/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(html)) !== null) {
    const args = extractQuotedArgs(m[1]);
    // USERDevice(Domain, IpAddr, MacAddr, Port, IpType, DevType, DevStatus,
    //            PortType, Time, HostName, IPv4, IPv6, DeviceType, UserDevAlias,
    //            UserSpecifiedDevType, LeaseTimeRemaining, TrafficSendRate, TrafficRecvRate)
    if (args.length < 8) continue;

    const mac = normalizeMac(args[2] ?? "");
    if (!mac) continue;

    const online = args[6] === "Online";
    // TrafficSendRate / TrafficRecvRate are reported in KB/s; convert to bits/s
    const sendKB = Number(args[16] ?? 0);
    const recvKB = Number(args[17] ?? 0);

    snapshots.push({
      mac,
      ip: args[1] && args[1] !== "--" ? args[1] : null,
      hostname: args[9] && args[9] !== "--" ? args[9] : null,
      vendor: null,
      online,
      rxBytesTotal: 0,
      txBytesTotal: 0,
      txBps: sendKB > 0 ? sendKB * 1024 * 8 : null,
      rxBps: recvKB > 0 ? recvKB * 1024 * 8 : null,
      metricsAvailable: true,
    });
  }

  return snapshots;
}

type MacEntry = { domain: string; mac: string };

export function parseMacFilter(html: string): MacEntry[] {
  const entries: MacEntry[] = [];
  const re = /new stMacFilter\(([^)]+)\)/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(html)) !== null) {
    const args = extractQuotedArgs(m[1]);
    if (args.length < 2) continue;
    const mac = normalizeMac(args[1] ?? "");
    if (!mac) continue;
    entries.push({ domain: args[0], mac });
  }

  return entries;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
