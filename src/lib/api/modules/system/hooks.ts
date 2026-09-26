"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch } from "@/lib/api/client";
import {
  mikrotikTestResultSchema,
  settingsSchema,
  systemStatusSchema,
  updateSettingsSchema,
} from "@/lib/api/schemas/system";
import { systemKeys } from "./keys";

export function useSystemStatus(refetchInterval = 10_000) {
  return useQuery({
    queryKey: systemKeys.status(),
    queryFn: () => apiFetch("/system/status", { schema: systemStatusSchema }),
    refetchInterval,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });
}

export function useSettings(enabled = true) {
  return useQuery({
    queryKey: systemKeys.settings(),
    queryFn: () => apiFetch("/settings", { schema: settingsSchema }),
    enabled,
    staleTime: 60_000,
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: {
      pollIntervalMs?: number;
      sampleRetentionDays?: number;
      mikrotik?: {
        host?: string;
        port?: number;
        user?: string;
        password?: string;
      };
    }) => {
      updateSettingsSchema.parse(patch);
      return apiFetch("/settings", {
        method: "PATCH",
        body: patch,
        schema: settingsSchema,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: systemKeys.all });
    },
  });
}

export function useTestMikrotikConnection() {
  return useMutation({
    mutationFn: () =>
      apiFetch("/system/status?test=1", { schema: mikrotikTestResultSchema }),
  });
}

export const emptySettings = z.object({}).parse({});
