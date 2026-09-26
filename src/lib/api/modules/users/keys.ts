import type { UserFilter } from "@/lib/api/schemas/user";

export const userKeys = {
  all: ["users"] as const,
  lists: () => [...userKeys.all, "list"] as const,
  list: (filter: UserFilter = {}) =>
    [
      ...userKeys.lists(),
      {
        search: filter.search ?? undefined,
        page: filter.page ?? 1,
        pageSize: filter.pageSize ?? 20,
      },
    ] as const,
  options: () => [...userKeys.all, "options"] as const,
};
