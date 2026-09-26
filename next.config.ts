import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 & routeros-api are native/node-only — never bundle them.
  serverExternalPackages: ["better-sqlite3", "routeros-api"],
  images: { unoptimized: true },
  // Preview/tunnel hosts must be accepted by the dev server.
  allowedDevOrigins: ["*.e2b.app"],
  // Do NOT set typescript.ignoreBuildErrors or eslint.ignoreDuringBuilds.
};

export default nextConfig;
