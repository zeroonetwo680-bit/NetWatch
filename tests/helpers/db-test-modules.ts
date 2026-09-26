/**
 * Single dynamic-import surface for the DB/service tests.
 * Imported only AFTER process.env.DATABASE_PATH is set, so the app
 * config and the DB singleton point at the temp database.
 */
export { createDb, getDb } from "@/db";
export { seedIfEmpty } from "@/db/seed";
export { upsertDiscoveredDevices } from "@/server/services/poller";
export {
  devices,
  trafficSamples,
  usageDaily,
  usageMonthly,
  users,
} from "@/db/schema";
export { computeDelta, dateKey, monthKey } from "@/lib/usage/calculator";
export { eq, sql } from "drizzle-orm";
export type { NetWatchDb } from "@/db";

import { getDb } from "@/db";
export const db = getDb();
