import type { Metadata } from "next";
import { DnsView } from "@/components/dns/dns-view";

export const metadata: Metadata = { title: "التحكم عبر DNS" };

export default function DnsPage() {
  return <DnsView />;
}
