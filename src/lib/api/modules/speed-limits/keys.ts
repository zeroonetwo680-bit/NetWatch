export const speedLimitKeys = {
  all: ["speed-limits"] as const,
  list: () => [...speedLimitKeys.all, "list"] as const,
  device: (id: number) => [...speedLimitKeys.all, "device", id] as const,
};
