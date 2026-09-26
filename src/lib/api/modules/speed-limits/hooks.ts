"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch } from "@/lib/api/client";
import { speedLimitInputSchema, speedLimitSchema } from "@/lib/api/schemas/device";
import { deviceKeys } from "../devices/keys";
import { speedLimitKeys } from "./keys";

const listSchema = z.array(
  z.object({
    id: z.number().int(),
    deviceId: z.number().int(),
    deviceName: z.string(),
    macAddress: z.string(),
    status: z.enum(["online", "offline", "blocked"]),
    userId: z.number().int().nullable(),
    userName: z.string().nullable(),
    downloadMbps: z.number(),
    uploadMbps: z.number(),
    enabled: z.boolean(),
    appliedAt: z.string().nullable(),
    updatedAt: z.string(),
  }),
);

export function useSpeedLimits() {
  return useQuery({
    queryKey: speedLimitKeys.list(),
    queryFn: () => apiFetch("/speed-limits", { schema: listSchema }),
    staleTime: 15_000,
  });
}

export function useDeviceSpeedLimit(deviceId: number) {
  return useQuery({
    queryKey: speedLimitKeys.device(deviceId),
    queryFn: () =>
      apiFetch(`/devices/${deviceId}/speed-limit`, {
        schema: speedLimitSchema.nullable(),
      }),
    enabled: Number.isInteger(deviceId) && deviceId > 0,
    staleTime: 15_000,
  });
}

export function useSaveSpeedLimit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      deviceId: number;
      downloadMbps: number;
      uploadMbps: number;
      enabled: boolean;
    }) => {
      speedLimitInputSchema.parse(input);
      return apiFetch(`/devices/${input.deviceId}/speed-limit`, {
        method: "PUT",
        body: {
          downloadMbps: input.downloadMbps,
          uploadMbps: input.uploadMbps,
          enabled: input.enabled,
        },
        schema: speedLimitSchema,
      });
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: speedLimitKeys.all });
      queryClient.invalidateQueries({
        queryKey: deviceKeys.detail(variables.deviceId),
      });
      queryClient.invalidateQueries({
        queryKey: speedLimitKeys.device(variables.deviceId),
      });
    },
  });
}

export function useToggleSpeedLimit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      deviceId: number;
      downloadMbps: number;
      uploadMbps: number;
      enabled: boolean;
    }) =>
      apiFetch(`/devices/${input.deviceId}/speed-limit`, {
        method: "PUT",
        body: {
          downloadMbps: input.downloadMbps,
          uploadMbps: input.uploadMbps,
          enabled: input.enabled,
        },
        schema: speedLimitSchema,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: speedLimitKeys.all });
      queryClient.invalidateQueries({ queryKey: deviceKeys.all });
    },
  });
}

export function useRemoveSpeedLimit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (deviceId: number) =>
      apiFetch(`/devices/${deviceId}/speed-limit`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: speedLimitKeys.all });
      queryClient.invalidateQueries({ queryKey: deviceKeys.all });
    },
  });
}
