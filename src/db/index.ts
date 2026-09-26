import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import {
  drizzle,
  type BetterSQLite3Database,
} from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";
import { seedIfEmpty } from "./seed";
import { appConfig } from "@/lib/config";

export type NetWatchDb = BetterSQLite3Database<typeof schema>;

const globalForDb = globalThis as unknown as {
  netwatchDb?: NetWatchDb;
  netwatchSqlite?: Database.Database;
};

/**
 * Opens (and migrates) a SQLite database file. Used by the app singleton
 * below and by tests with throw-away file paths.
 */
export function createDb(dbPath: string): {
  db: NetWatchDb;
  sqlite: Database.Database;
} {
  const resolved = path.resolve(process.cwd(), dbPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });

  const sqlite = new Database(resolved);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return { db, sqlite };
}

/**
 * App-wide lazily-created singleton (HMR safe via globalThis).
 * Runs migrations automatically, then seeds admin/demo users on first run.
 */
export function getDb(): NetWatchDb {
  if (!globalForDb.netwatchDb) {
    const { db, sqlite } = createDb(appConfig.databasePath);
    globalForDb.netwatchSqlite = sqlite;
    globalForDb.netwatchDb = db;
    seedIfEmpty(db);
  }
  return globalForDb.netwatchDb;
}
