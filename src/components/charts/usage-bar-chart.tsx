"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatBytes } from "@/lib/format";

export type UsageBarPoint = {
  label: string;
  downloadBytes: number;
  uploadBytes: number;
};

/** Stacked download/upload bars (bytes). LTR plot inside RTL page. */
export function UsageBarChart({
  points,
  height = 300,
}: {
  points: UsageBarPoint[];
  height?: number;
}) {
  return (
    <div dir="ltr" className="chart-ltr">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={points} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            minTickGap={12}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={64}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickFormatter={(v: number) => formatBytes(v, 0)}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
              direction: "rtl",
            }}
            formatter={(value: unknown, name: unknown) => [
              formatBytes(Number(value)),
              name === "downloadBytes" ? "تنزيل" : "رفع",
            ]}
          />
          <Bar
            dataKey="uploadBytes"
            stackId="usage"
            fill="var(--chart-2)"
            radius={[0, 0, 0, 0]}
            name="uploadBytes"
          />
          <Bar
            dataKey="downloadBytes"
            stackId="usage"
            fill="var(--chart-1)"
            radius={[4, 4, 0, 0]}
            name="downloadBytes"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
