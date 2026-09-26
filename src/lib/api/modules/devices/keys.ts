import type { DeviceFilter } from "@/lib/api/schemas/device";

/** Stable key ordering so cache hits don't depend on object property order. */
function normalizedFilter(filter: DeviceFilter) {
  return {
    search: filter.search ?? undefined,
    status: filter.status ?? undefined,
    userId: filter.userId ?? undefined,
    sort: filter.sort ?? undefined,
    page: filter.page ?? 1,
    pageSize: filter.pageSize ?? 20,
  } as const;
}

export const deviceKeys = {
  all: ["devices"] as const,
  lists: () => [...deviceKeys.all, "list"] as const,
  list: (filter: DeviceFilter = {}) =>
    [...deviceKeys.lists(), normalizedFilter(filter)] as const,
  detail: (id: number) => [...deviceKeys.all, "detail", id] as const,
  speedLimit: (id: number) => [...deviceKeys.detail(id), "speed-limit"] as const,
  usage: (
    id: number,
    granularity: "daily" | "monthly",
    from?: string,
    to?: string,
  ) => [...deviceKeys.detail(id), "usage", granularity, from, to] as const,
  traffic: (id: number, minutes: number) =>
    [...deviceKeys.detail(id), "traffic", minutes] as const,
};
