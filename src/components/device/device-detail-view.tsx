"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  CalendarDays,
  Gauge,
  HardDrive,
  Info,
  Loader2,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiErrorState } from "@/components/shared/api-error";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Mono } from "@/components/shared/mono";
import { PageContainer } from "@/components/shared/page-container";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { isApiError } from "@/lib/api/client";
import { useSession } from "@/lib/api/modules/auth/hooks";
import { useBlockDevice, useDeleteDevice, useRenameDevice } from "@/lib/api/modules/devices/hooks";
import { useDevice } from "@/lib/api/modules/devices/hooks";
import { useSaveSpeedLimit } from "@/lib/api/modules/speed-limits/hooks";
import { useDeviceUsage } from "@/lib/api/modules/usage/hooks";
import { useDeviceTraffic } from "@/lib/api/modules/traffic/hooks";
import { useCapabilities } from "@/lib/api/modules/system/hooks";
import { formatBytes, formatMbps } from "@/lib/format";

const TrafficAreaChart = dynamic(
  () =>
    import("@/components/charts/traffic-area-chart").then(
      (m) => m.TrafficAreaChart,
    ),
  { ssr: false, loading: () => <Skeleton className="h-[240px] w-full" /> },
);

const UsageBarChart = dynamic(
  () => import("@/components/charts/usage-bar-chart").then((m) => m.UsageBarChart),
  { ssr: false, loading: () => <Skeleton className="h-[280px] w-full" /> },
);

export function DeviceDetailView({ deviceId }: { deviceId: number }) {
  const device = useDevice(deviceId);

  if (device.isLoading) {
    return (
      <PageContainer>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </PageContainer>
    );
  }

  if (device.isError) {
    return (
      <PageContainer>
        <ApiErrorState error={device.error} onRetry={() => device.refetch()} />
        <Button variant="outline" asChild>
          <Link href="/devices">
            <ArrowLeft className="size-4" aria-hidden />
            العودة إلى الأجهزة
          </Link>
        </Button>
      </PageContainer>
    );
  }

  // Keyed so all local form state initializes from the loaded device.
  return <DeviceDetailBody key={deviceId} info={device.data!} />;
}

function DeviceDetailBody({
  info,
}: {
  info: NonNullable<ReturnType<typeof useDevice>["data"]>;
}) {
  const router = useRouter();
  const deviceId = info.id;
  const { data: session } = useSession();
  const isAdmin = session?.role === "admin";

  const traffic = useDeviceTraffic(deviceId, 60);
  const [granularity, setGranularity] = useState<"daily" | "monthly">("daily");
  const usage = useDeviceUsage(deviceId, granularity);
  const block = useBlockDevice();
  const remove = useDeleteDevice();
  const rename = useRenameDevice();
  const capabilities = useCapabilities();

  const [nameDraft, setNameDraft] = useState(info.name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function notifyError(error: unknown, fallback: string) {
    toast.error(isApiError(error) ? error.title : fallback);
  }

  return (
    <PageContainer>
      <div className="flex flex-col gap-3">
        <Button variant="ghost" size="sm" className="w-fit" asChild>
          <Link href="/devices">
            <ArrowLeft className="size-4" aria-hidden />
            العودة إلى الأجهزة
          </Link>
        </Button>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold md:text-2xl">{info.name}</h1>
              <StatusBadge status={info.status} />
              {info.speedLimit?.enabled ? (
                <Badge variant="secondary">
                  <Gauge className="size-3" aria-hidden />
                  حد سرعة {info.speedLimit.downloadMbps} / {info.speedLimit.uploadMbps} ميجابت
                </Badge>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span>
                MAC: <Mono className="text-xs">{info.macAddress}</Mono>
              </span>
              <span>
                IP: <Mono className="text-xs">{info.ipAddress ?? "—"}</Mono>
              </span>
              {isAdmin ? <span>المالك: {info.userName ?? "غير مسند"}</span> : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <form
              className="flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (nameDraft.trim() && nameDraft !== info.name) {
                  rename.mutate(
                    { id: info.id, name: nameDraft.trim() },
                    {
                      onSuccess: () => toast.success("تم تحديث الاسم"),
                      onError: (error) => notifyError(error, "تعذّر تحديث الاسم"),
                    },
                  );
                }
              }}
            >
              <Label htmlFor="device-name" className="sr-only">
                اسم الجهاز
              </Label>
              <Input
                id="device-name"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                className="w-48"
                maxLength={80}
              />
              <Button
                type="submit"
                size="sm"
                variant="outline"
                disabled={rename.isPending || nameDraft === info.name}
              >
                حفظ الاسم
              </Button>
            </form>

            {isAdmin ? (
              <>
                {capabilities.blocking ? (
                  <Button
                    size="sm"
                    variant={info.status === "blocked" ? "outline" : "secondary"}
                    onClick={() =>
                      block.mutate(
                        { id: info.id, blocked: info.status !== "blocked" },
                        {
                          onSuccess: () =>
                            toast.success(
                              info.status === "blocked"
                                ? "تم إلغاء حظر الجهاز"
                                : "تم حظر الجهاز",
                            ),
                          onError: (error) =>
                            notifyError(error, "تعذّر تغيير حالة الحظر"),
                        },
                      )
                    }
                    disabled={block.isPending}
                  >
                    {info.status === "blocked" ? (
                      <ShieldCheck className="size-4" aria-hidden />
                    ) : (
                      <Ban className="size-4" aria-hidden />
                    )}
                    {info.status === "blocked" ? "إلغاء الحظر" : "حظر"}
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="size-4" aria-hidden />
                  حذف
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" dir="rtl">
        <TabsList>
          <TabsTrigger value="overview">نظرة عامة</TabsTrigger>
          <TabsTrigger value="speed">السرعة</TabsTrigger>
          <TabsTrigger value="usage">الاستهلاك</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="التنزيل الآن"
              value={
                capabilities.perDeviceTraffic
                  ? formatMbps(info.currentDownloadMbps ?? 0)
                  : "—"
              }
              hint={capabilities.perDeviceTraffic ? undefined : "يتطلب راوتر MikroTik"}
              icon={<Gauge className="size-4" aria-hidden />}
            />
            <StatCard
              label="الرفع الآن"
              value={
                capabilities.perDeviceTraffic
                  ? formatMbps(info.currentUploadMbps ?? 0)
                  : "—"
              }
              hint={capabilities.perDeviceTraffic ? undefined : "يتطلب راوتر MikroTik"}
              icon={<Gauge className="size-4" aria-hidden />}
            />
            <StatCard
              label="استهلاك اليوم"
              value={
                capabilities.perDeviceTraffic
                  ? formatBytes(info.todayBytes.download)
                  : "—"
              }
              hint={
                capabilities.perDeviceTraffic
                  ? `رفع: ${formatBytes(info.todayBytes.upload)}`
                  : "يتطلب راوتر MikroTik"
              }
              icon={<CalendarDays className="size-4" aria-hidden />}
            />
            <StatCard
              label="استهلاك الشهر"
              value={
                capabilities.perDeviceTraffic
                  ? formatBytes(info.monthBytes.download)
                  : "—"
              }
              hint={
                capabilities.perDeviceTraffic
                  ? `رفع: ${formatBytes(info.monthBytes.upload)}`
                  : "يتطلب راوتر MikroTik"
              }
              icon={<HardDrive className="size-4" aria-hidden />}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>الاستهلاك اللحظي (آخر ساعة)</CardTitle>
            </CardHeader>
            <CardContent>
              {traffic.isLoading ? (
                <Skeleton className="h-[240px] w-full" />
              ) : !capabilities.perDeviceTraffic ? (
                <EmptyState
                  title="الرسم البياني غير متاح"
                  description="مراقبة استهلاك الجهاز لحظياً تتطلب راوتر MikroTik يدعم قراءة عدادات الحزم."
                />
              ) : (traffic.data ?? []).length === 0 ? (
                <EmptyState title="لا توجد عينات بعد" description="انتظر دورة الفحص القادمة." />
              ) : (
                <TrafficAreaChart
                  points={(traffic.data ?? []).map((sample) => ({
                    timestamp: sample.timestamp,
                    downloadMbps: Math.round((sample.downloadBps / 1e6) * 100) / 100,
                    uploadMbps: Math.round((sample.uploadBps / 1e6) * 100) / 100,
                  }))}
                  height={240}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>معلومات الجهاز</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <InfoRow label="اسم المضيف" value={<Mono>{info.hostname ?? "—"}</Mono>} />
              <InfoRow label="MAC" value={<Mono>{info.macAddress}</Mono>} />
              <InfoRow label="IP" value={<Mono>{info.ipAddress ?? "—"}</Mono>} />
              <InfoRow
                label="آخر ظهور"
                value={
                  info.lastSeenAt
                    ? new Date(info.lastSeenAt).toLocaleString("ar-EG")
                    : "—"
                }
              />
              <InfoRow
                label="أُضيف في"
                value={new Date(info.createdAt).toLocaleDateString("ar-EG")}
              />
              {isAdmin ? (
                <InfoRow label="المالك" value={info.userName ?? "غير مسند"} />
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="speed">
          <SpeedLimitCard deviceId={deviceId} />
        </TabsContent>

        <TabsContent value="usage" className="space-y-4">
          {!capabilities.perDeviceTraffic ? (
            <Alert className="border-info/30 bg-info/5">
              <Info className="size-4 text-info" aria-hidden />
              <AlertTitle>سجل استهلاك الأجهزة غير متاح</AlertTitle>
              <AlertDescription>
                راوترات المنازل العادية لا تسجل استهلاك كل جهاز منفصلاً. لتسجيل استهلاك الأجهزة يومياً وشهرياً يلزم راوتر MikroTik.
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Tabs
              value={granularity}
              onValueChange={(v) => setGranularity(v as "daily" | "monthly")}
              dir="rtl"
            >
              <TabsList>
                <TabsTrigger value="daily">يومي</TabsTrigger>
                <TabsTrigger value="monthly">شهري</TabsTrigger>
              </TabsList>
            </Tabs>
            <p className="text-sm text-muted-foreground">
              الإجمالي: {formatBytes(usage.data?.totals.downloadBytes ?? 0)} تنزيل /{" "}
              {formatBytes(usage.data?.totals.uploadBytes ?? 0)} رفع
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>
                {granularity === "daily" ? "استهلاك آخر 30 يومًا" : "الاستهلاك الشهري"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {usage.isLoading ? (
                <Skeleton className="h-[280px] w-full" />
              ) : usage.isError ? (
                <ApiErrorState error={usage.error} onRetry={() => usage.refetch()} />
              ) : (usage.data?.points ?? []).every(
                  (p) => p.downloadBytes === 0 && p.uploadBytes === 0,
                ) ? (
                <EmptyState title="لا يوجد استهلاك مسجل" />
              ) : (
                <UsageBarChart points={usage.data?.points ?? []} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الفترة</TableHead>
                    <TableHead className="text-end">تنزيل</TableHead>
                    <TableHead className="text-end">رفع</TableHead>
                    <TableHead className="text-end">الإجمالي</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(usage.data?.points ?? []).map((point) => (
                    <TableRow key={point.date}>
                      <TableCell>{point.label}</TableCell>
                      <TableCell className="text-end">
                        {formatBytes(point.downloadBytes)}
                      </TableCell>
                      <TableCell className="text-end">
                        {formatBytes(point.uploadBytes)}
                      </TableCell>
                      <TableCell className="text-end">
                        {formatBytes(point.downloadBytes + point.uploadBytes)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="حذف الجهاز"
        description={`سيتم حذف «${info.name}» وكل بيانات استهلاكه نهائيًا.`}
        confirmLabel="حذف"
        destructive
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(info.id, {
            onSuccess: () => {
              toast.success("تم حذف الجهاز");
              router.replace("/devices");
            },
            onError: (error) => notifyError(error, "تعذّر حذف الجهاز"),
          })
        }
      />
    </PageContainer>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

type SpeedLimit = NonNullable<
  NonNullable<ReturnType<typeof useDevice>["data"]>["speedLimit"]
>;

function SpeedLimitCard({ deviceId }: { deviceId: number }) {
  const { data: device, isLoading } = useDevice(deviceId);
  const capabilities = useCapabilities();
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!device) return null;
  if (!capabilities.speedLimit) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="size-4" aria-hidden />
            حد السرعة
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert className="border-warning/40 bg-warning/10">
            <AlertTriangle className="size-4 text-warning" aria-hidden />
            <AlertTitle>تحديد السرعة غير مدعوم على الراوتر الحالي</AlertTitle>
            <AlertDescription>
              {capabilities.note ??
                "يتطلب تطبيق حدود السرعة وجود راوتر MikroTik يدعم Simple Queues."}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }
  return <SpeedLimitForm key={deviceId} deviceId={deviceId} limit={device.speedLimit} />;
}

function SpeedLimitForm({
  deviceId,
  limit,
}: {
  deviceId: number;
  limit: SpeedLimit | null;
}) {
  const save = useSaveSpeedLimit();

  const [download, setDownload] = useState(
    limit ? String(limit.downloadMbps) : "10",
  );
  const [upload, setUpload] = useState(limit ? String(limit.uploadMbps) : "5");
  const [enabled, setEnabled] = useState(limit ? limit.enabled : true);

  const appliedState = !limit?.enabled
    ? { label: "غير مفعّل", className: "text-muted-foreground" }
    : limit?.appliedAt
      ? { label: "مُطبَّق على الراوتر", className: "text-success" }
      : { label: "بانتظار التطبيق", className: "text-warning" };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Gauge className="size-4" aria-hidden />
            حد السرعة
          </span>
          <span className={`text-sm font-normal ${appliedState.className}`}>
            {appliedState.label}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(
              {
                deviceId,
                downloadMbps: Number(download),
                uploadMbps: Number(upload),
                enabled,
              },
              {
                onSuccess: () => toast.success("تم حفظ حد السرعة"),
                onError: (error) =>
                  toast.error(
                    isApiError(error) ? error.title : "تعذّر حفظ حد السرعة",
                    {
                      description: isApiError(error)
                        ? Object.values(error.fields ?? {}).flat().join(" ")
                        : undefined,
                    },
                  ),
              },
            );
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="download-limit">حد التنزيل (ميجابت/ث)</Label>
              <Input
                id="download-limit"
                type="number"
                min={0.1}
                max={10000}
                step={0.1}
                dir="ltr"
                value={download}
                onChange={(e) => setDownload(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="upload-limit">حد الرفع (ميجابت/ث)</Label>
              <Input
                id="upload-limit"
                type="number"
                min={0.1}
                max={10000}
                step={0.1}
                dir="ltr"
                value={upload}
                onChange={(e) => setUpload(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <div className="space-y-0.5">
              <Label htmlFor="limit-enabled">تفعيل الحد</Label>
              <p className="text-xs text-muted-foreground">
                يُطبَّق على الراوتر في دورة الفحص القادمة (ثوانٍ).
              </p>
            </div>
            <Switch
              id="limit-enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
              aria-label="تفعيل حد السرعة"
            />
          </div>

          <Separator />

          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            حفظ حد السرعة
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
