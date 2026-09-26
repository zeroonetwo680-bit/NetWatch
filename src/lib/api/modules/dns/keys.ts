export const dnsKeys = {
  all: ["dns"] as const,
  status: () => [...dnsKeys.all, "status"] as const,
  queries: (filter?: { search?: string; action?: string; limit?: number }) =>
    [...dnsKeys.all, "queries", filter ?? {}] as const,
  rules: () => [...dnsKeys.all, "rules"] as const,
  devices: () => [...dnsKeys.all, "devices"] as const,
};
