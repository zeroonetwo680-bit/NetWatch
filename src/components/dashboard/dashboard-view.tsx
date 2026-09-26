"use client";

import dynamic from "next/dynamic";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarDays,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiErrorState } from "@/components/shared/api-error";
import { EmptyState } from "@/components/shared/empty-state";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { useLiveTraffic } from "@/lib/api/modules/traffic/hooks";
import { useNetworkTrafficSeries } from "@/lib/api/modules/traffic/hooks";
import { useUsageSummary } from "@/lib/api/modules/usage/hooks";
import { useSystemStatus } from "@/lib/api/modules/system/hooks";
import { formatBytes, formatMbps } from "@/lib/format";

const TrafficAreaChart = dynamic(
  () =>
    import("@/components/charts/traffic-area-chart").then(
      (m) => m.TrafficAreaChart,
    ),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[260px] w-full" />,
  },
);

export function DashboardView() {
  const summary = useUsageSummary();
  const live = useLiveTraffic();
  const series = useNetworkTrafficSeries(30);
  const status = useSystemStatus();

  const chartPoints = (series.data ?? []).map((point) => ({
    timestamp: point.timestamp,
    downloadMbps: Math.round((point.downloadBps / 1e6) * 100) / 100,
    uploadMbps: Math.round((point.uploadBps / 1e6) * 100) / 100,
  }));

  const topDevices = (live.data ?? []).slice(0, 5);
  const maxRate = Math.max(
    1,
    ...topDevices.map((d) => d.downloadMbps + d.uploadMbps),
  );

  return (
    <PageContainer>
      <PageHeader
        title="لوحة التحكم"
        description="نظرة لحظية على الشبكة والأجهزة المتصلة"
      />

      <section
        aria-label="إحصاءات الشبكة"
        aria-live="polite"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          label="الأجهزة المتصلة"
          icon={<Wifi className="size-4" aria-hidden />}
          loading={summary.isLoading}
          value={`${summary.data?.onlineDevices ?? 0} من ${summary.data?.totalDevices ?? 0}`}
          hint="متصل الآن"
        />
        <StatCard
          label="التنزيل الآن"
          icon={<ArrowDownToLine className="size-4" aria-hidden />}
          loading={summary.isLoading}
          value={formatMbps(summary.data?.networkDownloadMbps ?? 0)}
        />
        <StatCard
          label="الرفع الآن"
          icon={<ArrowUpFromLine className="size-4" aria-hidden />}
          loading={summary.isLoading}
          value={formatMbps(summary.data?.networkUploadMbps ?? 0)}
        />
        <StatCard
          label="استهلاك اليوم"
          icon={<CalendarDays className="size-4" aria-hidden />}
          loading={summary.isLoading}
          value={formatBytes(summary.data?.today.downloadBytes ?? 0)}
          hint={`رفع: ${formatBytes(summary.data?.today.uploadBytes ?? 0)}`}
        />
      </section>

      {status.data?.lastError ? (
        <Alert variant="destructive" role="alert">
          <WifiOff className="size-4" aria-hidden />
          <AlertTitle>تعذّر الاتصال بمصدر الشبكة</AlertTitle>
          <AlertDescription>{status.data.lastError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="size-4" aria-hidden />
              الاستهلاك اللحظي (آخر 30 دقيقة)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {series.isError ? (
              <ApiErrorState error={series.error} onRetry={() => series.refetch()} />
            ) : series.isLoading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : chartPoints.length === 0 ? (
              <EmptyState
                title="لا توجد بيانات بعد"
                description="سيبدأ تجميع البيانات بعد أول دورة فحص (ثوانٍ معدودة)."
              />
            ) : (
              <TrafficAreaChart points={chartPoints} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>أعلى الأجهزة استهلاكًا</CardTitle>
          </CardHeader>
          <CardContent>
            {live.isError ? (
              <ApiErrorState error={live.error} onRetry={() => live.refetch()} />
            ) : live.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : topDevices.length === 0 ? (
              <EmptyState title="لا توجد أجهزة" description="لم يتم اكتشاف أجهزة بعد." />
            ) : (
              <ul className="space-y-3">
                {topDevices.map((device) => {
                  const total = device.downloadMbps + device.uploadMbps;
                  return (
                    <li key={device.deviceId} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {device.name}
                        </span>
                        <span className="shrink-0 font-mono text-xs ltr-island">
                          ↓ {device.downloadMbps.toFixed(1)} ↑ {device.uploadMbps.toFixed(1)}
                        </span>
                      </div>
                      <Progress
                        value={Math.round((total / maxRate) * 100)}
                        aria-label={`نسبة استهلاك ${device.name}`}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>كل الأجهزة</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {live.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (live.data ?? []).length === 0 ? (
            <EmptyState title="لا توجد أجهزة" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الجهاز</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="text-end">تنزيل</TableHead>
                  <TableHead className="text-end">رفع</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(live.data ?? []).map((device) => (
                  <TableRow key={device.deviceId}>
                    <TableCell className="font-medium">{device.name}</TableCell>
                    <TableCell>
                      <StatusBadge status={device.status} />
                    </TableCell>
                    <TableCell className="text-end font-mono ltr-island">
                      {formatMbps(device.downloadMbps)}
                    </TableCell>
                    <TableCell className="text-end font-mono ltr-island">
                      {formatMbps(device.uploadMbps)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
