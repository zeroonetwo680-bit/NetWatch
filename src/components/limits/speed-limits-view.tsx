"use client";

import { useState } from "react";
import Link from "next/link";
import { Gauge, Info } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
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
import { Mono } from "@/components/shared/mono";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { isApiError } from "@/lib/api/client";
import { useSession } from "@/lib/api/modules/auth/hooks";
import {
  useRemoveSpeedLimit,
  useSaveSpeedLimit,
  useSpeedLimits,
  useToggleSpeedLimit,
} from "@/lib/api/modules/speed-limits/hooks";

type Row = {
  id: number;
  deviceId: number;
  deviceName: string;
  macAddress: string;
  status: "online" | "offline" | "blocked";
  userId: number | null;
  userName: string | null;
  downloadMbps: number;
  uploadMbps: number;
  enabled: boolean;
  appliedAt: string | null;
  updatedAt: string;
};

export function SpeedLimitsView() {
  const { data: session } = useSession();
  const isAdmin = session?.role === "admin";
  const limits = useSpeedLimits();
  const toggle = useToggleSpeedLimit();
  const save = useSaveSpeedLimit();
  const remove = useRemoveSpeedLimit();

  const [editing, setEditing] = useState<Row | null>(null);

  function notifyError(error: unknown, fallback: string) {
    toast.error(isApiError(error) ? error.title : fallback, {
      description: isApiError(error)
        ? Object.values(error.fields ?? {}).flat().join(" ")
        : undefined,
    });
  }

  const rows = (limits.data ?? []) as Row[];

  return (
    <PageContainer>
      <PageHeader
        title="حدود السرعة"
        description="تحكّم في سرعة التنزيل والرفع لكل جهاز — يُطبَّق على الراوتر"
      />

      <Card className="border-info/30 bg-info/5">
        <CardContent className="flex items-start gap-3 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
          <p className="text-muted-foreground">
            NetWatch يخزّن الحد المطلوب ويطبّقه على الراوتر عبر طبقة الشبكة
            (NETWORK_MODE). القيم بالميجابت/ثانية.
          </p>
        </CardContent>
      </Card>

      {limits.isError ? (
        <ApiErrorState error={limits.error} onRetry={() => limits.refetch()} />
      ) : limits.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Gauge className="size-5" aria-hidden />}
          title="لا توجد أجهزة"
          description="لا توجد أجهزة ظاهرة لك لإدارة حدود سرعتها."
        />
      ) : (
        <Card className="py-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الجهاز</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="text-end">تنزيل</TableHead>
                  <TableHead className="text-end">رفع</TableHead>
                  <TableHead className="text-center">مفعّل</TableHead>
                  <TableHead>التطبيق</TableHead>
                  <TableHead className="text-end">
                    <span className="sr-only">إجراءات</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.deviceId}>
                    <TableCell>
                      <Link
                        href={`/devices/${row.deviceId}`}
                        className="font-medium hover:underline"
                      >
                        {row.deviceName}
                      </Link>
                      <Mono className="block text-xs text-muted-foreground">
                        {row.macAddress}
                      </Mono>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className="text-end font-mono ltr-island">
                      {row.id === 0 ? "—" : `${row.downloadMbps} Mb`}
                    </TableCell>
                    <TableCell className="text-end font-mono ltr-island">
                      {row.id === 0 ? "—" : `${row.uploadMbps} Mb`}
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={row.enabled}
                        disabled={row.id === 0 || toggle.isPending}
                        aria-label={`تفعيل حد السرعة لجهاز ${row.deviceName}`}
                        onCheckedChange={(checked) =>
                          toggle.mutate(
                            {
                              deviceId: row.deviceId,
                              downloadMbps: row.downloadMbps || 10,
                              uploadMbps: row.uploadMbps || 5,
                              enabled: checked,
                            },
                            {
                              onSuccess: () =>
                                toast.success(
                                  checked ? "تم تفعيل الحد" : "تم إيقاف الحد",
                                ),
                              onError: (error) =>
                                notifyError(error, "تعذّر تغيير حالة الحد"),
                            },
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      {row.id === 0 ? (
                        <Badge variant="outline">بدون حد</Badge>
                      ) : !row.enabled ? (
                        <Badge variant="outline">غير مفعّل</Badge>
                      ) : row.appliedAt ? (
                        <Badge
                          variant="outline"
                          className="border-success/30 bg-success/10 text-success"
                        >
                          مُطبَّق
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-warning/40 bg-warning/10 text-warning"
                        >
                          بانتظار التطبيق
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditing(row)}
                        >
                          {row.id === 0 ? "إضافة حد" : "تعديل"}
                        </Button>
                        {row.id !== 0 ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() =>
                              remove.mutate(row.deviceId, {
                                onSuccess: () => toast.success("تم حذف الحد"),
                                onError: (error) =>
                                  notifyError(error, "تعذّر حذف الحد"),
                              })
                            }
                          >
                            حذف
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <LimitDialog
        row={editing}
        isAdmin={isAdmin}
        onClose={() => setEditing(null)}
        pending={save.isPending}
        onSubmit={(values) =>
          save.mutate(
            { deviceId: editing!.deviceId, ...values },
            {
              onSuccess: () => {
                toast.success("تم حفظ حد السرعة");
                setEditing(null);
              },
              onError: (error) => notifyError(error, "تعذّر حفظ حد السرعة"),
            },
          )
        }
      />
    </PageContainer>
  );
}

function LimitDialog({
  row,
  isAdmin,
  onClose,
  onSubmit,
  pending,
}: {
  row: Row | null;
  isAdmin: boolean;
  onClose: () => void;
  onSubmit: (values: {
    downloadMbps: number;
    uploadMbps: number;
    enabled: boolean;
  }) => void;
  pending: boolean;
}) {
  const [download, setDownload] = useState("10");
  const [upload, setUpload] = useState("5");
  const [enabled, setEnabled] = useState(true);
  const [openKey, setOpenKey] = useState<string | null>(null);

  if (row && openKey !== `${row.deviceId}-${row.updatedAt}`) {
    setOpenKey(`${row.deviceId}-${row.updatedAt}`);
    setDownload(row.id === 0 ? "10" : String(row.downloadMbps));
    setUpload(row.id === 0 ? "5" : String(row.uploadMbps));
    setEnabled(row.id === 0 ? true : row.enabled);
  }

  return (
    <Dialog open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {row?.id === 0 ? "إضافة حد سرعة" : "تعديل حد السرعة"}
          </DialogTitle>
          <DialogDescription>
            {row ? `الجهاز: ${row.deviceName}` : null}
            {isAdmin && row?.userName ? ` — المالك: ${row.userName}` : null}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit({
              downloadMbps: Number(download),
              uploadMbps: Number(upload),
              enabled,
            });
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="limit-download">حد التنزيل (ميجابت/ث)</Label>
              <Input
                id="limit-download"
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
              <Label htmlFor="limit-upload">حد الرفع (ميجابت/ث)</Label>
              <Input
                id="limit-upload"
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
            <Label htmlFor="limit-enabled-dialog">تفعيل الحد</Label>
            <Switch
              id="limit-enabled-dialog"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              إلغاء
            </Button>
            <Button type="submit" disabled={pending}>
              حفظ
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
