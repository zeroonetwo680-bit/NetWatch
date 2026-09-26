import { z } from "zod";

export type NetworkMode = "simulated" | "mikrotik";

const FALLBACK_SESSION_SECRET = "dev-only-insecure-secret-change-me";

const envSchema = z.object({
  NETWORK_MODE: z.enum(["simulated", "mikrotik"]).catch("simulated"),
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
    secret: parsed.SESSION_SECRET,
    ttlHours: parsed.SESSION_TTL_HOURS,
    cookieName: "netwatch_session",
  },
  seed: {
    adminUsername: parsed.ADMIN_USERNAME,
    adminPassword: parsed.ADMIN_PASSWORD,
    demoUsername: parsed.DEMO_USER_USERNAME,
    demoPassword: parsed.DEMO_USER_PASSWORD,
  },
  mikrotik: {
    host: parsed.MIKROTIK_HOST,
    port: parsed.MIKROTIK_PORT,
    user: parsed.MIKROTIK_USER,
    password: parsed.MIKROTIK_PASSWORD,
  },
} as const;

export type AppConfig = typeof appConfig;
