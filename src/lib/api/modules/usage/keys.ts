export const usageKeys = {
  all: ["usage"] as const,
  summary: () => [...usageKeys.all, "summary"] as const,
  report: (
    granularity: "daily" | "monthly",
    from?: string,
    to?: string,
  ) => [...usageKeys.all, "report", granularity, from, to] as const,
};
