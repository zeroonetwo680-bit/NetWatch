"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch } from "@/lib/api/client";
import { pageResultSchema } from "@/lib/api/schemas/common";
import {
  createUserSchema,
  updateUserSchema,
  userSchema,
  type UserFilter,
} from "@/lib/api/schemas/user";
import { deviceKeys } from "../devices/keys";
import { userKeys } from "./keys";

const optionsSchema = z.array(
  z.object({ id: z.number().int(), name: z.string(), username: z.string() }),
);

export function useUsers(filter: UserFilter = {}) {
  return useQuery({
    queryKey: userKeys.list(filter),
    queryFn: () =>
      apiFetch("/users", {
        query: {
          search: filter.search,
          page: filter.page ?? 1,
          pageSize: filter.pageSize ?? 20,
        },
        schema: pageResultSchema(userSchema),
      }),
    placeholderData: keepPreviousData,
  });
}

/** Lightweight list for the assign-device dialog. */
export function useUserOptions() {
  return useQuery({
    queryKey: userKeys.options(),
    queryFn: () => apiFetch("/users/options", { schema: optionsSchema }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      username: string;
      password: string;
      role: "admin" | "user";
    }) => {
      createUserSchema.parse(input);
      return apiFetch("/users", { method: "POST", body: input, schema: userSchema });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.all });
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: number;
      name?: string;
      role?: "admin" | "user";
      password?: string;
    }) => {
      const { id, ...patch } = input;
      updateUserSchema.parse(patch);
      return apiFetch(`/users/${id}`, {
        method: "PATCH",
        body: patch,
        schema: userSchema,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.all });
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch(`/users/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.all });
      queryClient.invalidateQueries({ queryKey: deviceKeys.all });
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      apiFetch("/profile/password", { method: "POST", body: input }),
  });
}
