import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { devices } from "@/db/schema";
import { DeviceDetailView } from "@/components/device/device-detail-view";
import { canAccessDevice, getSession } from "@/server/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const device = getDb()
    .select({ name: devices.name })
    .from(devices)
    .where(eq(devices.id, Number(id)))
    .get();
  return { title: device?.name ?? "الجهاز" };
}

export default async function DeviceDetailPage({ params }: Params) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) notFound();

  const session = await getSession();
  if (!session) notFound();

  const device = getDb()
    .select({ id: devices.id, userId: devices.userId })
    .from(devices)
    .where(eq(devices.id, numericId))
    .get();

  // Non-visible devices (another user's) are indistinguishable from missing.
  if (!device || !canAccessDevice(session, device)) notFound();

  return <DeviceDetailView deviceId={numericId} />;
}
