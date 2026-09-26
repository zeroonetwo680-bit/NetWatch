"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import {
  deviceUsageQuerySchema,
  usageReportQuerySchema,
  usageReportSchema,
  usageSeriesSchema,
  usageSummarySchema,
} from "@/lib/api/schemas/usage";
import { deviceKeys } from "../devices/keys";
import { usageKeys } from "./keys";

export function useUsageSummary(refetchInterval = 5_000) {
  return useQuery({
    queryKey: usageKeys.summary(),
    queryFn: () => apiFetch("/usage/summary", { schema: usageSummarySchema }),
    refetchInterval,
    refetchIntervalInBackground: false,
    staleTime: 3_000,
  });
}

export function useDeviceUsage(
  deviceId: number,
  granularity: "daily" | "monthly" = "daily",
  from?: string,
  to?: string,
) {
  return useQuery({
    queryKey: deviceKeys.usage(deviceId, granularity, from, to),
    queryFn: () =>
      apiFetch(`/devices/${deviceId}/usage`, {
        query: deviceUsageQuerySchema.parse({ granularity, from, to }),
        schema: usageSeriesSchema,
      }),
    enabled: Number.isInteger(deviceId) && deviceId > 0,
    staleTime: 60_000,
  });
}

export function useUsageReport(
  granularity: "daily" | "monthly" = "daily",
  from?: string,
  to?: string,
) {
  return useQuery({
    queryKey: usageKeys.report(granularity, from, to),
    queryFn: () =>
      apiFetch("/usage/report", {
        query: usageReportQuerySchema.parse({ granularity, from, to }),
        schema: usageReportSchema,
      }),
    staleTime: 60_000,
  });
}
