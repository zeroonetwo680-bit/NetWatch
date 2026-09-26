/**
 * Next.js instrumentation hook — starts the background poller once per
 * server instance (nodejs runtime only).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startPoller } = await import("@/server/services/poller");
    startPoller();

    const { startDnsServer } = await import("@/server/dns/server");
    startDnsServer();
  }
}
