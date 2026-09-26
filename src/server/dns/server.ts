import "server-only";

import dgram from "node:dgram";
import { appConfig } from "@/lib/config";
import {
  buildBlockResponse,
  dnsTypeToString,
  parseDnsQuery,
} from "./packet";
import {
  evaluateDnsQuery,
  recordDnsLog,
  seedDefaultDnsRulesIfEmpty,
} from "./service";

export type DnsServerStatus = {
  enabled: boolean;
  running: boolean;
  configuredPort: number;
  activePort: number | null;
  upstreamServers: string[];
  error: string | null;
  startedAt: string | null;
};

type ServerState = {
  listenerSocket: dgram.Socket | null;
  upstreamSocket: dgram.Socket | null;
  running: boolean;
  activePort: number | null;
  error: string | null;
  startedAt: string | null;
  pendingUpstream: Map<
    number,
    {
      clientIp: string;
      clientPort: number;
      originalId: number;
      qname: string;
      qtype: string;
      deviceName: string | null;
      timer: NodeJS.Timeout;
    }
  >;
};

const globalForDnsServer = globalThis as unknown as {
  netwatchDnsServerState?: ServerState;
};

function state(): ServerState {
  if (!globalForDnsServer.netwatchDnsServerState) {
    globalForDnsServer.netwatchDnsServerState = {
      listenerSocket: null,
      upstreamSocket: null,
      running: false,
      activePort: null,
      error: null,
      startedAt: null,
      pendingUpstream: new Map(),
    };
  }
  return globalForDnsServer.netwatchDnsServerState;
}

export function getDnsServerStatus(): DnsServerStatus {
  const s = state();
  return {
    enabled: appConfig.dns.enabled,
    running: s.running,
    configuredPort: appConfig.dns.port,
    activePort: s.activePort,
    upstreamServers: appConfig.dns.upstream,
    error: s.error,
    startedAt: s.startedAt,
  };
}

/**
 * Starts the embedded DNS server and upstream forwarder.
 * Safe to call multiple times (idempotent, HMR safe).
 */
export function startDnsServer(): void {
  const s = state();
  if (s.running || !appConfig.dns.enabled) return;

  seedDefaultDnsRulesIfEmpty();

  // 1. Initialize upstream socket
  if (!s.upstreamSocket) {
    const us = dgram.createSocket("udp4");
    us.on("message", (msg) => {
      if (msg.length < 12) return;
      const upstreamId = msg.readUInt16BE(0);
      const pending = s.pendingUpstream.get(upstreamId);
      if (pending) {
        clearTimeout(pending.timer);
        s.pendingUpstream.delete(upstreamId);

        // Restore original query ID so client recognizes it
        msg.writeUInt16BE(pending.originalId, 0);

        s.listenerSocket?.send(msg, pending.clientPort, pending.clientIp, () => {
          recordDnsLog({
            clientIp: pending.clientIp,
            deviceName: pending.deviceName,
            domain: pending.qname,
            qtype: pending.qtype,
            action: "allowed",
            reason: null,
          });
        });
      }
    });

    us.on("error", (err) => {
      console.error("[NetWatch DNS] Upstream socket error:", err.message);
    });

    s.upstreamSocket = us;
  }

  // 2. Try binding the listener socket to configured port (default 53)
  tryBindListener(appConfig.dns.port, () => {
    // If port 53 fails (e.g. unprivileged user without sudo or port in use), fallback
    if (appConfig.dns.port !== appConfig.dns.fallbackPort) {
      console.log(
        `[NetWatch DNS] Falling back to port ${appConfig.dns.fallbackPort}...`,
      );
      tryBindListener(appConfig.dns.fallbackPort);
    }
  });
}

function tryBindListener(port: number, onFailFallback?: () => void): void {
  const s = state();
  const socket = dgram.createSocket("udp4");

  socket.on("error", (err: NodeJS.ErrnoException) => {
    const message = `تعذّر ربط منفذ DNS ${port}: ${err.message} (${err.code})`;
    console.warn(`[NetWatch DNS] ${message}`);
    s.error = message;
    s.activePort = null;
    s.running = false;

    try {
      socket.close();
    } catch {
      /* ignore */
    }

    if (onFailFallback) {
      onFailFallback();
    }
  });

  socket.on("message", (msg, rinfo) => {
    handleIncomingDnsMessage(msg, rinfo);
  });

  socket.bind(port, "0.0.0.0", () => {
    s.listenerSocket = socket;
    s.running = true;
    s.activePort = port;
    s.error = null;
    s.startedAt = new Date().toISOString();
    console.log(`[NetWatch DNS] Controller listening on 0.0.0.0:${port}`);
  });
}

function handleIncomingDnsMessage(msg: Buffer, rinfo: dgram.RemoteInfo): void {
  const s = state();
  const query = parseDnsQuery(msg);
  if (!query) return;

  const decision = evaluateDnsQuery(rinfo.address, query.qname);
  const qtypeName = dnsTypeToString(query.qtype);

  if (decision.action === "blocked") {
    // Synthesize local sinkhole response (0.0.0.0 or ::)
    const blockResponse = buildBlockResponse(msg, query, "zero");
    s.listenerSocket?.send(blockResponse, rinfo.port, rinfo.address, () => {
      recordDnsLog({
        clientIp: rinfo.address,
        deviceName: decision.deviceName,
        domain: query.qname,
        qtype: qtypeName,
        action: "blocked",
        reason: decision.reason,
      });
    });
    return;
  }

  // Forward to upstream
  if (!s.upstreamSocket) return;

  const upstreamServers = appConfig.dns.upstream;
  const primaryUpstream = upstreamServers[0] || "8.8.8.8";

  // Generate unique 16-bit upstream query ID
  let upstreamId = Math.floor(Math.random() * 65535);
  while (s.pendingUpstream.has(upstreamId)) {
    upstreamId = (upstreamId + 1) % 65535;
  }

  const forwardBuf = Buffer.alloc(msg.length);
  msg.copy(forwardBuf);
  forwardBuf.writeUInt16BE(upstreamId, 0);

  const timer = setTimeout(() => {
    s.pendingUpstream.delete(upstreamId);
  }, 3_000);

  s.pendingUpstream.set(upstreamId, {
    clientIp: rinfo.address,
    clientPort: rinfo.port,
    originalId: query.id,
    qname: query.qname,
    qtype: qtypeName,
    deviceName: decision.deviceName,
    timer,
  });

  s.upstreamSocket.send(forwardBuf, 53, primaryUpstream, (err) => {
    if (err) {
      console.warn(`[NetWatch DNS] Failed forwarding to ${primaryUpstream}:`, err.message);
      clearTimeout(timer);
      s.pendingUpstream.delete(upstreamId);
    }
  });
}

export function stopDnsServer(): void {
  const s = state();
  s.running = false;
  s.activePort = null;
  s.startedAt = null;

  try {
    s.listenerSocket?.close();
  } catch {
    /* ignore */
  }
  s.listenerSocket = null;

  try {
    s.upstreamSocket?.close();
  } catch {
    /* ignore */
  }
  s.upstreamSocket = null;

  for (const pending of s.pendingUpstream.values()) {
    clearTimeout(pending.timer);
  }
  s.pendingUpstream.clear();
}
