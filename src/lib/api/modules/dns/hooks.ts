"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch } from "@/lib/api/client";
import {
  dnsDeviceItemSchema,
  dnsQueryLogItemSchema,
  dnsRuleSchema,
  dnsServerStatusSchema,
  dnsStatsSchema,
  type CreateDnsRuleInput,
  type UpdateDnsRuleInput,
} from "@/lib/api/schemas/dns";
import { dnsKeys } from "./keys";

const statusResponseSchema = z.object({
  status: dnsServerStatusSchema,
  stats: dnsStatsSchema,
});

const queriesResponseSchema = z.object({
  items: z.array(dnsQueryLogItemSchema),
  total: z.number(),
});

export function useDnsStatus(refetchInterval = 5_000) {
  return useQuery({
    queryKey: dnsKeys.status(),
    queryFn: () =>
      apiFetch("/dns/status", { schema: statusResponseSchema }),
    refetchInterval,
    staleTime: 2_000,
  });
}

export function useDnsQueries(
  filter: { search?: string; action?: "allowed" | "blocked"; limit?: number } = {},
  refetchInterval = 3_000,
) {
  const params = new URLSearchParams();
  if (filter.search) params.set("search", filter.search);
  if (filter.action) params.set("action", filter.action);
  if (filter.limit) params.set("limit", String(filter.limit));

  const queryStr = params.toString() ? `?${params.toString()}` : "";

  return useQuery({
    queryKey: dnsKeys.queries(filter),
    queryFn: () =>
      apiFetch(`/dns/queries${queryStr}`, { schema: queriesResponseSchema }),
    refetchInterval,
    staleTime: 1_000,
  });
}

export function useDnsRules() {
  return useQuery({
    queryKey: dnsKeys.rules(),
    queryFn: () =>
      apiFetch("/dns/rules", { schema: z.array(dnsRuleSchema) }),
    staleTime: 10_000,
  });
}

export function useAddDnsRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateDnsRuleInput) =>
      apiFetch("/dns/rules", {
        method: "POST",
        body: data,
        schema: dnsRuleSchema,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dnsKeys.rules() });
      queryClient.invalidateQueries({ queryKey: dnsKeys.status() });
    },
  });
}

export function useUpdateDnsRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: number;
      patch: UpdateDnsRuleInput;
    }) =>
      apiFetch(`/dns/rules/${id}`, {
        method: "PATCH",
        body: patch,
        schema: dnsRuleSchema,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dnsKeys.rules() });
      queryClient.invalidateQueries({ queryKey: dnsKeys.status() });
    },
  });
}

export function useDeleteDnsRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/dns/rules/${id}`, {
        method: "DELETE",
        schema: z.object({ success: z.boolean() }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dnsKeys.rules() });
      queryClient.invalidateQueries({ queryKey: dnsKeys.status() });
    },
  });
}

export function useDnsDevices() {
  return useQuery({
    queryKey: dnsKeys.devices(),
    queryFn: () =>
      apiFetch("/dns/devices", { schema: z.array(dnsDeviceItemSchema) }),
    staleTime: 5_000,
  });
}

export function useToggleDnsDeviceBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      deviceId,
      blocked,
    }: {
      deviceId: number;
      blocked: boolean;
    }) =>
      apiFetch(`/dns/devices/${deviceId}/toggle`, {
        method: "POST",
        body: { blocked },
        schema: z.object({ deviceId: z.number(), blocked: z.boolean() }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dnsKeys.devices() });
      queryClient.invalidateQueries({ queryKey: dnsKeys.status() });
    },
  });
}
