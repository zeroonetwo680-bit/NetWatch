"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatClockTime } from "@/lib/format";

export type TrafficPoint = {
  timestamp: string;
  downloadMbps: number;
  uploadMbps: number;
};

/** Realtime download/upload area chart (Mbps). LTR plot inside RTL page. */
export function TrafficAreaChart({
  points,
  height = 260,
}: {
  points: TrafficPoint[];
  height?: number;
}) {
  const data = useMemo(
    () =>
      points.map((point) => ({
        ...point,
        label: formatClockTime(new Date(point.timestamp)),
      })),
    [points],
  );

  return (
    <div dir="ltr" className="chart-ltr">
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="fillDownload" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.5} />
              <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="fillUpload" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.45} />
              <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            minTickGap={24}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={56}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickFormatter={(v: number) => `${Math.round(v)}`}
            unit=" Mb"
          />
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
              direction: "rtl",
            }}
            formatter={(value: unknown, name: unknown) => [
              `${Number(value).toFixed(1)} ميجابت/ث`,
              name === "downloadMbps" ? "تنزيل" : "رفع",
            ]}
          />
          <Area
            type="monotone"
            dataKey="uploadMbps"
            stroke="var(--chart-2)"
            fill="url(#fillUpload)"
            strokeWidth={2}
            name="uploadMbps"
          />
          <Area
            type="monotone"
            dataKey="downloadMbps"
            stroke="var(--chart-1)"
            fill="url(#fillDownload)"
            strokeWidth={2}
            name="downloadMbps"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
