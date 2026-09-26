"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { pageResultSchema } from "@/lib/api/schemas/common";
import {
  assignDeviceSchema,
  blockDeviceSchema,
  deviceDetailSchema,
  deviceSchema,
  renameDeviceSchema,
  type DeviceFilter,
} from "@/lib/api/schemas/device";
import { deviceKeys } from "./keys";

export function useDevices(filter: DeviceFilter = {}) {
  return useQuery({
    queryKey: deviceKeys.list(filter),
    queryFn: () =>
      apiFetch("/devices", {
        query: {
          search: filter.search,
          status: filter.status,
          userId: filter.userId,
          sort: filter.sort,
          page: filter.page ?? 1,
          pageSize: filter.pageSize ?? 20,
        },
        schema: pageResultSchema(deviceSchema),
      }),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

export function useDevice(id: number) {
  return useQuery({
    queryKey: deviceKeys.detail(id),
    queryFn: () => apiFetch(`/devices/${id}`, { schema: deviceDetailSchema }),
    enabled: Number.isInteger(id) && id > 0,
    staleTime: 15_000,
  });
}

export function useRenameDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => {
      renameDeviceSchema.parse({ name });
      return apiFetch(`/devices/${id}`, {
        method: "PATCH",
        body: { name },
        schema: deviceSchema,
      });
    },
    onSuccess: (device) => {
      queryClient.setQueryData(deviceKeys.detail(device.id), (prev: unknown) =>
        prev && typeof prev === "object"
          ? { ...(prev as object), name: device.name }
          : prev,
      );
      queryClient.invalidateQueries({ queryKey: deviceKeys.all });
    },
  });
}

export function useAssignDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, userId }: { id: number; userId: number | null }) => {
      assignDeviceSchema.parse({ userId });
      return apiFetch(`/devices/${id}/assign`, {
        method: "POST",
        body: { userId },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deviceKeys.all });
    },
  });
}

export function useBlockDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, blocked }: { id: number; blocked: boolean }) => {
      blockDeviceSchema.parse({ blocked });
      return apiFetch(`/devices/${id}/block`, {
        method: "POST",
        body: { blocked },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deviceKeys.all });
    },
  });
}

export function useDeleteDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch(`/devices/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deviceKeys.all });
    },
  });
}

export function useDiscoverDevices() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<never>("/devices", { method: "POST" }) as Promise<{
        discovered: number;
        created: number;
        updated: number;
      }>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deviceKeys.all });
    },
  });
}
