import { Ban, CircleSlash, Wifi } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { DeviceStatus } from "@/lib/api/schemas/device";

const MAP: Record<
  DeviceStatus,
  { label: string; className: string; icon: React.ElementType }
> = {
  online: {
    label: "متصل",
    className: "bg-success/15 text-success border-success/30",
    icon: Wifi,
  },
  offline: {
    label: "غير متصل",
    className: "bg-muted text-muted-foreground border-border",
    icon: CircleSlash,
  },
  blocked: {
    label: "محظور",
    className: "bg-destructive/15 text-destructive border-destructive/30",
    icon: Ban,
  },
};

/** Status is conveyed by icon + text, never by color alone. */
export function StatusBadge({ status }: { status: DeviceStatus }) {
  const item = MAP[status] ?? MAP.offline;
  const Icon = item.icon;
  return (
    <Badge variant="outline" className={item.className}>
      <Icon className="size-3" aria-hidden />
      {item.label}
    </Badge>
  );
}
