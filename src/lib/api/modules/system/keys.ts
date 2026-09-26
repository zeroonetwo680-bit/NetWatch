export const systemKeys = {
  all: ["system"] as const,
  status: () => [...systemKeys.all, "status"] as const,
  settings: () => [...systemKeys.all, "settings"] as const,
};
