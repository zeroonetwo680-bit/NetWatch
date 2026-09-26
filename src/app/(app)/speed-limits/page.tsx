import type { Metadata } from "next";
import { SpeedLimitsView } from "@/components/limits/speed-limits-view";

export const metadata: Metadata = { title: "حدود السرعة" };

export default function SpeedLimitsPage() {
  return <SpeedLimitsView />;
}
