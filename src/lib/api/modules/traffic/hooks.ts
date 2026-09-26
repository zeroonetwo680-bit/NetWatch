"use client";

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch } from "@/lib/api/client";
import {
  deviceTrafficQuerySchema,
  liveTrafficSchema,
  trafficSampleSchema,
} from "@/lib/api/schemas/usage";
import { deviceKeys } from "../devices/keys";
import { trafficKeys } from "./keys";

const seriesSchema = z.array(
  z.object({
    timestamp: z.string(),
    downloadBps: z.number(),
    uploadBps: z.number(),
  }),
);

/** Live per-device rates — the dashboard polls this every 5s. */
export function useLiveTraffic(refetchInterval = 5_000) {
  return useQuery({
    queryKey: trafficKeys.live(),
    queryFn: () => apiFetch("/traffic/live", { schema: z.array(liveTrafficSchema) }),
    refetchInterval,
    refetchIntervalInBackground: false,
    staleTime: 3_000,
  });
}

/** Network-wide realtime series (per-minute averages). */
export function useNetworkTrafficSeries(minutes = 30, refetchInterval = 5_000) {
  return useQuery({
    queryKey: trafficKeys.series(minutes),
    queryFn: () =>
      apiFetch("/traffic/series", {
        query: deviceTrafficQuerySchema.parse({ minutes }),
        schema: seriesSchema,
      }),
    refetchInterval,
    refetchIntervalInBackground: false,
    staleTime: 3_000,
  });
}

/** Realtime series for a single device. */
export function useDeviceTraffic(
  deviceId: number,
  minutes = 60,
  refetchInterval = 5_000,
) {
  return useQuery({
    queryKey: deviceKeys.traffic(deviceId, minutes),
    queryFn: () =>
      apiFetch(`/devices/${deviceId}/traffic`, {
        query: deviceTrafficQuerySchema.parse({ minutes }),
        schema: z.array(trafficSampleSchema),
      }),
    enabled: Number.isInteger(deviceId) && deviceId > 0,
    refetchInterval,
    refetchIntervalInBackground: false,
    staleTime: 3_000,
  });
}
