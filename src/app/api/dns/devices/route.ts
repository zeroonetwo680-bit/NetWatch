import { z } from "zod";
import { dnsDeviceItemSchema } from "@/lib/api/schemas/dns";
import { requireUser } from "@/server/auth";
import { listDevicesWithDnsBlock } from "@/server/dns/service";
import { handle, ok } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  await requireUser();
  const devices = listDevicesWithDnsBlock();
  return ok(z.array(dnsDeviceItemSchema).parse(devices));
});
