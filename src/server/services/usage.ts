import "server-only";

import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { devices, trafficSamples, usageDaily, usageMonthly } from "@/db/schema";
import {
  bpsToMbps,
  dateKey,
  monthKey,
  sumUsage,
} from "@/lib/usage/calculator";
import type {
  LiveTrafficDto,
  TrafficSampleDto,
  UsageReportDto,
  UsageSeriesDto,
  UsageSummaryDto,
} from "@/lib/api/schemas/usage";
import { ApiError } from "../errors";
import type { SessionUser } from "../auth";
import { getDeviceRow, latestSamples } from "./devices";

type Point = { downloadBytes: number; uploadBytes: number };

const DAY_LABEL_WEEKDAYS = [
  "الأحد",
  "الاثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
];

function visibleDeviceIds(session: SessionUser): number[] {
  if (session.role === "admin") {
    return getDb()
      .select({ id: devices.id })
      .from(devices)
      .all()
      .map((r) => r.id);
  }
  return getDb()
    .select({ id: devices.id })
    .from(devices)
    .where(eq(devices.userId, session.id))
    .all()
    .map((r) => r.id);
}

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 29);
  return { from: dateKey(from), to: dateKey(to) };
}

export function getUsageSummary(session: SessionUser): UsageSummaryDto {
  const db = getDb();
  const ids = visibleDeviceIds(session);

  if (ids.length === 0) {
    return {
      today: { downloadBytes: 0, uploadBytes: 0 },
      month: { downloadBytes: 0, uploadBytes: 0 },
      onlineDevices: 0,
      totalDevices: 0,
      networkDownloadMbps: 0,
      networkUploadMbps: 0,
    };
  }

  const inClause = sql.raw(`(${ids.join(",")})`);

  const today = db
    .select()
    .from(usageDaily)
    .where(
      and(
        eq(usageDaily.date, dateKey(new Date())),
        sql`${usageDaily.deviceId} in ${inClause}`,
      ),
    )
    .all();

  const { year, month } = monthKey(new Date());
  const monthRows = db
    .select()
    .from(usageMonthly)
    .where(
      and(
        eq(usageMonthly.year, year),
        eq(usageMonthly.month, month),
        sql`${usageMonthly.deviceId} in ${inClause}`,
      ),
    )
    .all();

  const counts = db
    .select({
      status: devices.status,
      value: sql<number>`count(*)`,
    })
    .from(devices)
    .where(sql`${devices.id} in ${inClause}`)
    .groupBy(devices.status)
    .all();

  const totalDevices = counts.reduce((sum, c) => sum + Number(c.value), 0);
  const onlineDevices =
    counts.find((c) => c.status === "online")?.value ?? 0;

  const samples = latestSamples();
  let downloadBps = 0;
  let uploadBps = 0;
  for (const id of ids) {
    const sample = samples.get(id);
    if (!sample) continue;
    downloadBps += sample.download_bps ?? 0;
    uploadBps += sample.upload_bps ?? 0;
  }

  return {
    today: sumUsage(today),
    month: sumUsage(monthRows),
    onlineDevices: Number(onlineDevices),
    totalDevices: Number(totalDevices),
    networkDownloadMbps: round2(bpsToMbps(downloadBps)),
    networkUploadMbps: round2(bpsToMbps(uploadBps)),
  };
}

export function getLiveTraffic(session: SessionUser): LiveTrafficDto[] {
  const db = getDb();
  const rows =
    session.role === "admin"
      ? db.select().from(devices).orderBy(asc(devices.name)).all()
      : db
          .select()
          .from(devices)
          .where(eq(devices.userId, session.id))
          .orderBy(asc(devices.name))
          .all();

  const samples = latestSamples();

  return rows
    .map((device) => {
      const sample = samples.get(device.id);
      const online = device.status === "online";
      return {
        deviceId: device.id,
        name: device.name,
        status: device.status,
        downloadMbps: online ? round2(bpsToMbps(sample?.download_bps ?? 0)) : 0,
        uploadMbps: online ? round2(bpsToMbps(sample?.upload_bps ?? 0)) : 0,
      };
    })
    .sort((a, b) => b.downloadMbps + b.uploadMbps - (a.downloadMbps + a.uploadMbps));
}

export function getDeviceUsage(
  session: SessionUser,
  deviceId: number,
  granularity: "daily" | "monthly",
  from?: string,
  to?: string,
): UsageSeriesDto {
  const device = getDeviceRow(session, deviceId);
  const db = getDb();
  const range = from && to ? { from, to } : defaultRange();

  const points: UsageSeriesDto["points"] = [];

  if (granularity === "daily") {
    const rows = db
      .select()
      .from(usageDaily)
      .where(
        and(
          eq(usageDaily.deviceId, device.id),
          gte(usageDaily.date, range.from),
          lte(usageDaily.date, range.to),
        ),
      )
      .orderBy(asc(usageDaily.date))
      .all();

    // Fill gaps so charts never show misleading zeros-only lines.
    const byDate = new Map(rows.map((r) => [r.date, r]));
    for (let d = new Date(range.from); ; d.setDate(d.getDate() + 1)) {
      const key = dateKey(d);
      const row = byDate.get(key);
      const date = new Date(key);
      points.push({
        label: `${date.getDate()} ${DAY_LABEL_WEEKDAYS[date.getDay()]}`,
        date: key,
        downloadBytes: row?.downloadBytes ?? 0,
        uploadBytes: row?.uploadBytes ?? 0,
      });
      if (key === range.to) break;
      if (points.length > 400) break;
    }
  } else {
    const startMonth = monthKey(new Date(range.from));
    const endMonth = monthKey(new Date(range.to));
    const rows = db
      .select()
      .from(usageMonthly)
      .where(
        and(
          eq(usageMonthly.deviceId, device.id),
          sql`(${usageMonthly.year} * 12 + ${usageMonthly.month}) >= ${
            startMonth.year * 12 + startMonth.month
          }`,
          sql`(${usageMonthly.year} * 12 + ${usageMonthly.month}) <= ${
            endMonth.year * 12 + endMonth.month
          }`,
        ),
      )
      .orderBy(asc(usageMonthly.year), asc(usageMonthly.month))
      .all();

    for (const row of rows) {
      points.push({
        label: `${row.month}/${row.year}`,
        date: `${row.year}-${String(row.month).padStart(2, "0")}`,
        downloadBytes: row.downloadBytes,
        uploadBytes: row.uploadBytes,
      });
    }
  }

  return { granularity, points, totals: sumUsage(points as Point[]) };
}

export function getDeviceTraffic(
  session: SessionUser,
  deviceId: number,
  minutes: number,
): TrafficSampleDto[] {
  const device = getDeviceRow(session, deviceId);
  const since = new Date(Date.now() - minutes * 60_000);

  const rows = getDb()
    .select()
    .from(trafficSamples)
    .where(
      and(
        eq(trafficSamples.deviceId, device.id),
        gte(trafficSamples.timestamp, since),
      ),
    )
    .orderBy(asc(trafficSamples.timestamp))
    .all();

  return rows.map((row) => ({
    timestamp: row.timestamp.toISOString(),
    downloadBps: row.downloadBps ?? 0,
    uploadBps: row.uploadBps ?? 0,
    downloadBytes: row.downloadBytes,
    uploadBytes: row.uploadBytes,
  }));
}

export type NetworkTrafficPoint = {
  timestamp: string;
  downloadBps: number;
  uploadBps: number;
};

/**
 * Network-wide realtime series: samples of the visible devices bucketed
 * per minute (dashboard "الاستهلاك اللحظي" chart).
 */
export function getNetworkTrafficSeries(
  session: SessionUser,
  minutes: number,
): NetworkTrafficPoint[] {
  const ids = visibleDeviceIds(session);
  if (ids.length === 0) return [];

  const since = new Date(Date.now() - minutes * 60_000);
  const inClause = sql.raw(`(${ids.join(",")})`);

  const rows = getDb().all<{
    bucket: number;
    download_bps: number | null;
    upload_bps: number | null;
  }>(sql`
    select
      (${trafficSamples.timestamp} - (${trafficSamples.timestamp} % 60)) as bucket,
      avg(${trafficSamples.downloadBps}) as download_bps,
      avg(${trafficSamples.uploadBps}) as upload_bps
    from ${trafficSamples}
    where ${trafficSamples.timestamp} >= ${Math.floor(since.getTime() / 1000)}
      and ${trafficSamples.deviceId} in ${inClause}
    group by bucket
    order by bucket asc
  `);

  return rows.map((row) => ({
    timestamp: new Date(row.bucket * 1000).toISOString(),
    downloadBps: row.download_bps ?? 0,
    uploadBps: row.upload_bps ?? 0,
  }));
}

export function getUsageReport(
  session: SessionUser,
  granularity: "daily" | "monthly",
  from?: string,
  to?: string,
): UsageReportDto {
  const db = getDb();
  const ids = visibleDeviceIds(session);
  const range = from && to ? { from, to } : defaultRange();
  const rows: UsageReportDto["rows"] = [];

  if (ids.length > 0) {
    const inClause = sql.raw(`(${ids.join(",")})`);

    if (granularity === "daily") {
      const result = db
        .select({
          deviceId: usageDaily.deviceId,
          downloadBytes: sql<number>`sum(${usageDaily.downloadBytes})`,
          uploadBytes: sql<number>`sum(${usageDaily.uploadBytes})`,
        })
        .from(usageDaily)
        .where(
          and(
            gte(usageDaily.date, range.from),
            lte(usageDaily.date, range.to),
            sql`${usageDaily.deviceId} in ${inClause}`,
          ),
        )
        .groupBy(usageDaily.deviceId)
        .orderBy(desc(sql`sum(${usageDaily.downloadBytes}) + sum(${usageDaily.uploadBytes})`))
        .all();

      const names = new Map(
        db.select({ id: devices.id, name: devices.name }).from(devices).all().map(
          (d) => [d.id, d.name],
        ),
      );

      for (const row of result) {
        rows.push({
          key: String(row.deviceId),
          label: names.get(row.deviceId) ?? `جهاز ${row.deviceId}`,
          deviceId: row.deviceId,
          downloadBytes: Number(row.downloadBytes ?? 0),
          uploadBytes: Number(row.uploadBytes ?? 0),
        });
      }
    } else {
      const result = db
        .select({
          deviceId: usageMonthly.deviceId,
          downloadBytes: sql<number>`sum(${usageMonthly.downloadBytes})`,
          uploadBytes: sql<number>`sum(${usageMonthly.uploadBytes})`,
        })
        .from(usageMonthly)
        .where(
          and(
            sql`(${usageMonthly.year} || '-' || printf('%02d', ${usageMonthly.month})) >= ${range.from.slice(0, 7)}`,
            sql`(${usageMonthly.year} || '-' || printf('%02d', ${usageMonthly.month})) <= ${range.to.slice(0, 7)}`,
            sql`${usageMonthly.deviceId} in ${inClause}`,
          ),
        )
        .groupBy(usageMonthly.deviceId)
        .orderBy(desc(sql`sum(${usageMonthly.downloadBytes}) + sum(${usageMonthly.uploadBytes})`))
        .all();

      const names = new Map(
        db.select({ id: devices.id, name: devices.name }).from(devices).all().map(
          (d) => [d.id, d.name],
        ),
      );

      for (const row of result) {
        rows.push({
          key: String(row.deviceId),
          label: names.get(row.deviceId) ?? `جهاز ${row.deviceId}`,
          deviceId: row.deviceId,
          downloadBytes: Number(row.downloadBytes ?? 0),
          uploadBytes: Number(row.uploadBytes ?? 0),
        });
      }
    }
  }

  return {
    granularity,
    from: range.from,
    to: range.to,
    rows,
    totals: sumUsage(rows),
  };
}

/** Device is required to exist & be visible before any usage read. */
export function assertDeviceVisible(session: SessionUser, deviceId: number): void {
  if (!Number.isInteger(deviceId)) {
    throw new ApiError(404, "NOT_FOUND", "الجهاز المطلوب غير موجود.");
  }
  getDeviceRow(session, deviceId);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
