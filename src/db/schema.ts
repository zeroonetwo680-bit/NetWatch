import { relations } from "drizzle-orm";
import {
  sqliteTable,
  integer,
  text,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// ── users ────────────────────────────────────────────────────────────────
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "user"] })
    .notNull()
    .default("user"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ── devices ──────────────────────────────────────────────────────────────
export const devices = sqliteTable(
  "devices",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    // Normalized uppercase AA:BB:CC:DD:EE:FF — the stable device identity.
    macAddress: text("mac_address").notNull().unique(),
    ipAddress: text("ip_address"),
    hostname: text("hostname"),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    status: text("status", { enum: ["online", "offline", "blocked"] })
      .notNull()
      .default("offline"),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("devices_user_idx").on(t.userId),
    index("devices_status_idx").on(t.status),
  ],
);

// ── speed_limits ─────────────────────────────────────────────────────────
export const speedLimits = sqliteTable("speed_limits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  deviceId: integer("device_id")
    .notNull()
    .unique()
    .references(() => devices.id, { onDelete: "cascade" }),
  downloadMbps: real("download_mbps").notNull(),
  uploadMbps: real("upload_mbps").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  // Timestamp of when the network adapter confirmed application on the router.
  appliedAt: integer("applied_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ── traffic_samples (raw, short retention) ──────────────────────────────
export const trafficSamples = sqliteTable(
  "traffic_samples",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    deviceId: integer("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    // Byte deltas recorded during the polling interval (never negative).
    downloadBytes: integer("download_bytes").notNull(),
    uploadBytes: integer("upload_bytes").notNull(),
    // Instantaneous bits/second at sample time.
    downloadBps: real("download_bps"),
    uploadBps: real("upload_bps"),
    timestamp: integer("timestamp", { mode: "timestamp" }).notNull(),
  },
  (t) => [
    index("samples_device_time_idx").on(t.deviceId, t.timestamp),
    index("samples_time_idx").on(t.timestamp),
  ],
);

// ── usage_daily (permanent aggregates) ───────────────────────────────────
export const usageDaily = sqliteTable(
  "usage_daily",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    deviceId: integer("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    // "YYYY-MM-DD" in server local time.
    date: text("date").notNull(),
    downloadBytes: integer("download_bytes").notNull().default(0),
    uploadBytes: integer("upload_bytes").notNull().default(0),
  },
  (t) => [uniqueIndex("usage_daily_device_date_uq").on(t.deviceId, t.date)],
);

// ── usage_monthly (permanent aggregates) ─────────────────────────────────
export const usageMonthly = sqliteTable(
  "usage_monthly",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    deviceId: integer("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    month: integer("month").notNull(), // 1-12
    downloadBytes: integer("download_bytes").notNull().default(0),
    uploadBytes: integer("upload_bytes").notNull().default(0),
  },
  (t) => [
    uniqueIndex("usage_monthly_device_ym_uq").on(t.deviceId, t.year, t.month),
  ],
);

// ── settings (key/value) ─────────────────────────────────────────────────
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ── relations ────────────────────────────────────────────────────────────
export const usersRelations = relations(users, ({ many }) => ({
  devices: many(devices),
}));

export const devicesRelations = relations(devices, ({ one, many }) => ({
  user: one(users, {
    fields: [devices.userId],
    references: [users.id],
  }),
  speedLimit: one(speedLimits, {
    fields: [devices.id],
    references: [speedLimits.deviceId],
  }),
  trafficSamples: many(trafficSamples),
  usageDaily: many(usageDaily),
  usageMonthly: many(usageMonthly),
}));

export const speedLimitsRelations = relations(speedLimits, ({ one }) => ({
  device: one(devices, {
    fields: [speedLimits.deviceId],
    references: [devices.id],
  }),
}));

export const trafficSamplesRelations = relations(trafficSamples, ({ one }) => ({
  device: one(devices, {
    fields: [trafficSamples.deviceId],
    references: [devices.id],
  }),
}));

export const usageDailyRelations = relations(usageDaily, ({ one }) => ({
  device: one(devices, {
    fields: [usageDaily.deviceId],
    references: [devices.id],
  }),
}));

export const usageMonthlyRelations = relations(usageMonthly, ({ one }) => ({
  device: one(devices, {
    fields: [usageMonthly.deviceId],
    references: [devices.id],
  }),
}));

// ── inferred types ───────────────────────────────────────────────────────
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Device = typeof devices.$inferSelect;
export type NewDevice = typeof devices.$inferInsert;
export type SpeedLimit = typeof speedLimits.$inferSelect;
export type NewSpeedLimit = typeof speedLimits.$inferInsert;
export type TrafficSample = typeof trafficSamples.$inferSelect;
export type NewTrafficSample = typeof trafficSamples.$inferInsert;
export type UsageDailyRow = typeof usageDaily.$inferSelect;
export type UsageMonthlyRow = typeof usageMonthly.$inferSelect;
export type SettingRow = typeof settings.$inferSelect;

export type DeviceStatus = "online" | "offline" | "blocked";
export type UserRole = "admin" | "user";
