export const trafficKeys = {
  all: ["traffic"] as const,
  live: () => [...trafficKeys.all, "live"] as const,
  series: (minutes: number) => [...trafficKeys.all, "series", minutes] as const,
};
