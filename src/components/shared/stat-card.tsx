import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon,
  loading = false,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  loading?: boolean;
  className?: string;
}) {
  return (
    <Card className={cn("gap-0 py-4", className)}>
      <CardContent className="px-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="truncate text-sm text-muted-foreground">{label}</p>
            {loading ? (
              <Skeleton className="h-7 w-24" />
            ) : (
              <p className="font-mono text-xl font-semibold leading-tight ltr-island">
                {value}
              </p>
            )}
            {hint ? (
              <p className="truncate text-xs text-muted-foreground">{hint}</p>
            ) : null}
          </div>
          {icon ? (
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {icon}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
