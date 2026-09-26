import { z } from "zod";

export type NetworkMode = "simulated" | "mikrotik" | "lan";

import { FALLBACK_SESSION_SECRET, getSessionSecret } from "./session-secret";

const envSchema = z.object({
  NETWORK_MODE: z.enum(["simulated", "mikrotik", "lan"]).catch("simulated"),
  MIKROTIK_HOST: z.string().min(1).catch("192.168.88.1"),
  MIKROTIK_PORT: z.coerce.number().int().positive().catch(8728),
  MIKROTIK_USER: z.string().min(1).catch("admin"),
  MIKROTIK_PASSWORD: z.string().catch(""),
  POLL_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(2_000)
    .max(600_000)
    .catch(10_000),
  SAMPLE_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).catch(7),
  SIM_DEVICE_COUNT: z.coerce.number().int().min(1).max(200).catch(10),
  // LAN-discovery mode (any router — Huawei/TP-Link/…): no router API needed.
  LAN_SUBNET: z.string().catch(""),
  LAN_PING_SWEEP: z.string().catch("true"),
  LAN_SWEEP_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(30_000)
    .max(3_600_000)
    .catch(120_000),
  LAN_REVERSE_DNS: z.string().catch("true"),
  LAN_UPNP: z.string().catch("true"),
  // DNS Controller (local DNS sinkhole / device controller)
  DNS_ENABLED: z.string().catch("true"),
  DNS_PORT: z.coerce.number().int().positive().catch(53),
  DNS_FALLBACK_PORT: z.coerce.number().int().positive().catch(5353),
  DNS_UPSTREAM: z.string().catch("8.8.8.8,1.1.1.1"),
  DATABASE_PATH: z.string().min(1).catch("./data/netwatch.db"),
  SESSION_SECRET: z.string().min(16).catch(FALLBACK_SESSION_SECRET),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 30).catch(24),
  ADMIN_USERNAME: z.string().min(3).catch("admin"),
  ADMIN_PASSWORD: z.string().min(6).catch("admin123"),
  DEMO_USER_USERNAME: z.string().min(3).catch("user"),
  DEMO_USER_PASSWORD: z.string().min(6).catch("user123"),
});

const parsed = envSchema.parse(process.env);

if (
  process.env.NODE_ENV === "production" &&
  parsed.SESSION_SECRET === FALLBACK_SESSION_SECRET
) {
  console.error(
    "[NetWatch] SESSION_SECRET is missing/weak in production — sessions are insecure. Set a 32+ char secret.",
  );
}

export const appConfig = {
  networkMode: parsed.NETWORK_MODE as NetworkMode,
  pollIntervalMs: parsed.POLL_INTERVAL_MS,
  sampleRetentionDays: parsed.SAMPLE_RETENTION_DAYS,
  simDeviceCount: parsed.SIM_DEVICE_COUNT,
  databasePath: parsed.DATABASE_PATH,
  session: {
    // Resolved through the shared helper so the proxy and Node agree.
    secret: getSessionSecret(),
    ttlHours: parsed.SESSION_TTL_HOURS,
    cookieName: "netwatch_session",
  },
  seed: {
    adminUsername: parsed.ADMIN_USERNAME,
    adminPassword: parsed.ADMIN_PASSWORD,
    demoUsername: parsed.DEMO_USER_USERNAME,
    demoPassword: parsed.DEMO_USER_PASSWORD,
  },
  lan: {
    subnet: parsed.LAN_SUBNET.trim() || null,
    pingSweep: parsed.LAN_PING_SWEEP !== "false",
    sweepIntervalMs: parsed.LAN_SWEEP_INTERVAL_MS,
    reverseDns: parsed.LAN_REVERSE_DNS !== "false",
    upnp: parsed.LAN_UPNP !== "false",
  },
  dns: {
    enabled: parsed.DNS_ENABLED !== "false",
    port: parsed.DNS_PORT,
    fallbackPort: parsed.DNS_FALLBACK_PORT,
    upstream: parsed.DNS_UPSTREAM.split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  },
  mikrotik: {
    host: parsed.MIKROTIK_HOST,
    port: parsed.MIKROTIK_PORT,
    user: parsed.MIKROTIK_USER,
    password: parsed.MIKROTIK_PASSWORD,
  },
} as const;

export type AppConfig = typeof appConfig;
