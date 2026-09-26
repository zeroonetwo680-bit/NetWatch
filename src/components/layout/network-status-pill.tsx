"use client";

import { AlertTriangle, Loader2, Router, Wifi } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useSystemStatus } from "@/lib/api/modules/system/hooks";

/** Live network-mode / router-link indicator shown in the topbar. */
export function NetworkStatusPill() {
  const { data, isLoading } = useSystemStatus(10_000);
  const isSimulated = data?.networkMode === "simulated";
  const isLan = data?.networkMode === "lan";

  if (isLoading && !data) {
    return (
      <Badge variant="outline" className="gap-1">
        <Loader2 className="size-3 animate-spin" aria-hidden />
        جارٍ الفحص
      </Badge>
    );
  }

  const connected = Boolean(data?.routerConnected);

  const label = isSimulated
    ? "محاكاة"
    : isLan
      ? connected
        ? "شبكة محلية (LAN)"
        : "الشبكة غير متصلة"
      : connected
        ? "الراوتر متصل"
        : "الراوتر غير متصل";

  return (
    <Badge
      variant="outline"
      className={
        connected
          ? "gap-1 border-success/30 bg-success/10 text-success"
          : "gap-1 border-warning/40 bg-warning/10 text-warning"
      }
      title={data?.lastError ?? undefined}
    >
      {connected ? (
        <Wifi className="size-3" aria-hidden />
      ) : data?.lastError ? (
        <AlertTriangle className="size-3" aria-hidden />
      ) : (
        <Router className="size-3" aria-hidden />
      )}
      {label}
    </Badge>
  );
}
