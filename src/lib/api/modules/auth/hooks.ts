"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import {
  loginInputSchema,
  okSchema,
  sessionUserSchema,
  type SessionUserDto,
} from "@/lib/api/schemas/auth";
import { authKeys } from "./keys";

export function useSession() {
  return useQuery({
    queryKey: authKeys.me(),
    queryFn: () => apiFetch("/auth/me", { schema: sessionUserSchema }),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { username: string; password: string }) => {
      loginInputSchema.parse(input);
      return apiFetch("/auth/login", {
        method: "POST",
        body: input,
        schema: sessionUserSchema,
      });
    },
    onSuccess: (user: SessionUserDto) => {
      queryClient.setQueryData(authKeys.me(), user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch("/auth/logout", { method: "POST", schema: okSchema }),
    onSuccess: () => {
      queryClient.clear();
      if (typeof window !== "undefined") {
        // Deliberate full navigation: drops all in-memory state on logout.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = "/login";
      }
    },
  });
}
