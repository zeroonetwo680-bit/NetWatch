import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Service-level tests against a throw-away SQLite file.
 * DATABASE_PATH is set BEFORE any module import so the appConfig/DB
 * singleton point at the temp database (env is read at import time).
 */

let tmpDir: string;
type Modules = typeof import("./helpers/db-test-modules");

let m: Modules;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "netwatch-test-"));
  process.env.DATABASE_PATH = path.join(tmpDir, "test.db");
  m = (await import("./helpers/db-test-modules")) as Modules;
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function snapshot(i: number, rx: number, tx: number): Modules extends never
  ? never
  : import("@/lib/network/types").RouterDeviceSnapshot {
  return {
    mac: `AA:BB:CC:00:00:${String(i).padStart(2, "0")}`,
    ip: `192.168.1.${i}`,
    hostname: `device-${i}`,
    online: true,
    rxBytesTotal: rx,
    txBytesTotal: tx,
    rxBps: null,
    txBps: null,
  } as never;
}

describe("migrations + seeding", () => {
  it("seeds the admin user once and is idempotent", () => {
    // Fresh database: proves the first-run seeding actually inserts.
    const fresh = m.createDb(path.join(tmpDir, "fresh.db")).db;
    const first = m.seedIfEmpty(fresh);
    const second = m.seedIfEmpty(fresh);

    expect(first.adminCreated).toBe(true);
    expect(second.adminCreated).toBe(false);
    expect(second.demoUserCreated).toBe(false);

    const admins = m.db
      .select()
      .from(m.users)
      .where(m.eq(m.users.role, "admin"))
      .all();
    expect(admins.length).toBe(1);
    expect(admins[0].passwordHash).not.toContain("admin123");
  });

  it("never stores a plaintext password", () => {
    for (const user of m.db.select().from(m.users).all()) {
      expect(user.passwordHash).toMatch(/^\$2[aby]\$/);
    }
  });
});

describe("device upsert by MAC", () => {
  it("creates devices once and updates them on re-discovery", () => {
    const first = m.upsertDiscoveredDevices([snapshot(1, 1000, 500)]);
    expect(first.created).toBe(1);

    const second = m.upsertDiscoveredDevices([snapshot(1, 2000, 800)]);
    expect(second.created).toBe(0);
    expect(second.updated).toBe(1);

    const rows = m.db.select().from(m.devices).all();
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe("device-1");
    expect(rows[0].ipAddress).toBe("192.168.1.1");
    expect(rows[0].status).toBe("online");
  });

  it("keeps the blocked status when a device re-appears", () => {
    const row = m.db.select().from(m.devices).all()[0];
    m.db
      .update(m.devices)
      .set({ status: "blocked" })
      .where(m.eq(m.devices.id, row.id))
      .run();

    m.upsertDiscoveredDevices([snapshot(1, 3000, 900)]);

    const after = m.db
      .select()
      .from(m.devices)
      .where(m.eq(m.devices.id, row.id))
      .get();
    expect(after?.status).toBe("blocked");

    m.db
      .update(m.devices)
      .set({ status: "online" })
      .where(m.eq(m.devices.id, row.id))
      .run();
  });
});

describe("usage rollups", () => {
  it("increments daily and monthly totals on conflict", () => {
    const device = m.db.select().from(m.devices).all()[0];
    const date = m.dateKey(new Date());
    const { year, month } = m.monthKey(new Date());

    const insert = () =>
      m.db.transaction((tx) => {
        tx.insert(m.usageDaily)
          .values({
            deviceId: device.id,
            date,
            downloadBytes: 100,
            uploadBytes: 10,
          })
          .onConflictDoUpdate({
            target: [m.usageDaily.deviceId, m.usageDaily.date],
            set: {
              downloadBytes: m.sql`${m.usageDaily.downloadBytes} + 100`,
              uploadBytes: m.sql`${m.usageDaily.uploadBytes} + 10`,
            },
          })
          .run();
        tx.insert(m.usageMonthly)
          .values({
            deviceId: device.id,
            year,
            month,
            downloadBytes: 100,
            uploadBytes: 10,
          })
          .onConflictDoUpdate({
            target: [
              m.usageMonthly.deviceId,
              m.usageMonthly.year,
              m.usageMonthly.month,
            ],
            set: {
              downloadBytes: m.sql`${m.usageMonthly.downloadBytes} + 100`,
              uploadBytes: m.sql`${m.usageMonthly.uploadBytes} + 10`,
            },
          })
          .run();
      });

    insert();
    insert();

    const day = m.db
      .select()
      .from(m.usageDaily)
      .where(
        m.sql`${m.usageDaily.deviceId} = ${device.id} and ${m.usageDaily.date} = ${date}`,
      )
      .all();
    expect(day.length).toBe(1);
    expect(day[0].downloadBytes).toBe(200);

    const monthRow = m.db
      .select()
      .from(m.usageMonthly)
      .where(m.sql`${m.usageMonthly.deviceId} = ${device.id}`)
      .all();
    expect(monthRow.length).toBe(1);
    expect(monthRow[0].uploadBytes).toBe(20);
  });

  it("prunes only samples older than the retention window", () => {
    const device = m.db.select().from(m.devices).all()[0];
    const now = Date.now();

    m.db
      .insert(m.trafficSamples)
      .values([
        {
          deviceId: device.id,
          downloadBytes: 1,
          uploadBytes: 1,
          timestamp: new Date(now - 60 * 86_400_000),
        },
        {
          deviceId: device.id,
          downloadBytes: 2,
          uploadBytes: 2,
          timestamp: new Date(now - 60_000),
        },
      ])
      .run();

    m.db
      .delete(m.trafficSamples)
      .where(
        m.sql`${m.trafficSamples.timestamp} < ${Math.floor((now - 7 * 86_400_000) / 1000)}`,
      )
      .run();

    const remaining = m.db.select().from(m.trafficSamples).all();
    expect(remaining.length).toBe(1);
    expect(remaining[0].downloadBytes).toBe(2);
  });
});

describe("user deletion keeps devices", () => {
  it("unassigns devices instead of deleting them", () => {
    const device = m.db.select().from(m.devices).all()[0];
    const demo = m.db
      .insert(m.users)
      .values({
        name: "مستخدم تجربة",
        username: "tmp-user",
        passwordHash: "$2a$10$abcdefghijklmnopqrstuv",
        role: "user",
      })
      .returning()
      .get();

    m.db
      .update(m.devices)
      .set({ userId: demo.id })
      .where(m.eq(m.devices.id, device.id))
      .run();

    m.db.transaction((tx) => {
      tx.update(m.devices)
        .set({ userId: null })
        .where(m.eq(m.devices.userId, demo.id))
        .run();
      tx.delete(m.users).where(m.eq(m.users.id, demo.id)).run();
    });

    const after = m.db
      .select()
      .from(m.devices)
      .where(m.eq(m.devices.id, device.id))
      .get();
    expect(after).toBeDefined();
    expect(after?.userId).toBeNull();
  });
});

describe("counter resets", () => {
  it("never records a negative delta", () => {
    expect(m.computeDelta(100, 500)).toBeNull();
    expect(m.computeDelta(500, 100)).toBe(400);
  });
});
