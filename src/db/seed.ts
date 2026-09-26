import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import type { NetWatchDb } from "./index";
import { users } from "./schema";
import { appConfig } from "@/lib/config";

export type SeedResult = {
  adminCreated: boolean;
  demoUserCreated: boolean;
};

/**
 * Idempotent seed: creates the admin user (always) and the demo user
 * (only in simulated mode). Safe to call on every boot — does nothing
 * when the rows already exist.
 */
export function seedIfEmpty(db: NetWatchDb): SeedResult {
  const result: SeedResult = {
    adminCreated: false,
    demoUserCreated: false,
  };

  const existingAdmin = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, appConfig.seed.adminUsername.toLowerCase()))
    .get();

  if (!existingAdmin) {
    db.insert(users)
      .values({
        name: "مدير النظام",
        username: appConfig.seed.adminUsername.toLowerCase(),
        passwordHash: bcrypt.hashSync(appConfig.seed.adminPassword, 10),
        role: "admin",
      })
      .run();
    result.adminCreated = true;
    console.log(
      `[NetWatch] Seeded admin user "${appConfig.seed.adminUsername}".`,
    );
  }

  if (appConfig.networkMode === "simulated") {
    const existingDemo = db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, appConfig.seed.demoUsername.toLowerCase()))
      .get();
    if (!existingDemo) {
      db.insert(users)
        .values({
          name: "مستخدم تجريبي",
          username: appConfig.seed.demoUsername.toLowerCase(),
          passwordHash: bcrypt.hashSync(appConfig.seed.demoPassword, 10),
          role: "user",
        })
        .run();
      result.demoUserCreated = true;
      console.log(
        `[NetWatch] Seeded demo user "${appConfig.seed.demoUsername}" (simulated mode).`,
      );
    }
  }

  return result;
}

/** CLI entry: `pnpm db:seed` */
async function runStandaloneSeed() {
  const { createDb } = await import("./index");
  const { db, sqlite } = createDb(appConfig.databasePath);
  const result = seedIfEmpty(db);
  console.log("[NetWatch] Seed result:", result);
  sqlite.close();
}

if (process.argv[1] && /seed\.(ts|js|mjs)$/.test(process.argv[1])) {
  void runStandaloneSeed();
}
