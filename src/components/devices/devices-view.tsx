"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Ban,
  MoreHorizontal,
  Pencil,
  Radar,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ApiErrorState } from "@/components/shared/api-error";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Mono } from "@/components/shared/mono";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { isApiError } from "@/lib/api/client";
import {
  useAssignDevice,
  useBlockDevice,
  useDeleteDevice,
  useDevices,
  useDiscoverDevices,
  useRenameDevice,
} from "@/lib/api/modules/devices/hooks";
import { useUserOptions } from "@/lib/api/modules/users/hooks";
import { useSession } from "@/lib/api/modules/auth/hooks";
import { formatBytes, formatMbps } from "@/lib/format";
import type { DeviceFilter } from "@/lib/api/schemas/device";

const PAGE_SIZE = 20;

export function DevicesView() {
  const { data: session } = useSession();
  const isAdmin = session?.role === "admin";

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<DeviceFilter["status"]>();
  const [sort, setSort] = useState<DeviceFilter["sort"]>("name");
  const [page, setPage] = useState(1);

  const [renameTarget, setRenameTarget] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [assignTarget, setAssignTarget] = useState<{
    id: number;
    name: string;
    userId: number | null;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: number;
    name: string;
  } | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const filter = useMemo<DeviceFilter>(
    () => ({
      search: debouncedSearch || undefined,
      status,
      sort,
      page,
      pageSize: PAGE_SIZE,
    }),
    [debouncedSearch, status, sort, page],
  );

  const devices = useDevices(filter);
  const discover = useDiscoverDevices();
  const rename = useRenameDevice();
  const assign = useAssignDevice();
  const block = useBlockDevice();
  const remove = useDeleteDevice();
  const userOptions = useUserOptions();

  const items = devices.data?.items ?? [];
  const meta = devices.data?.meta;

  function notifyError(error: unknown, fallback: string) {
    toast.error(isApiError(error) ? error.title : fallback, {
      description: isApiError(error)
        ? Object.values(error.fields ?? {}).flat().join(" ")
        : undefined,
    });
  }

  return (
    <PageContainer>
      <PageHeader
        title="الأجهزة"
        description="كل الأجهزة المكتشفة على الشبكة مع حالتها واستهلاكها"
        actions={
          isAdmin ? (
            <Button
              onClick={() =>
                discover.mutate(undefined, {
                  onSuccess: (result) =>
                    toast.success(
                      `تم فحص ${result.discovered} جهازًا — جديد: ${result.created}`,
                    ),
                  onError: (error) => notifyError(error, "تعذّر اكتشاف الأجهزة"),
                })
              }
              disabled={discover.isPending}
            >
              <Radar className="size-4" aria-hidden />
              {discover.isPending ? "جارٍ الفحص…" : "اكتشاف الأجهزة"}
            </Button>
          ) : undefined
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground start-3"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث بالاسم أو الـ MAC أو الـ IP…"
              aria-label="بحث في الأجهزة"
              className="ps-9"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={status ?? "all"}
              onValueChange={(value) => {
                setStatus(value === "all" ? undefined : (value as DeviceFilter["status"]));
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[140px]" aria-label="تصفية بالحالة">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                <SelectItem value="online">متصل</SelectItem>
                <SelectItem value="offline">غير متصل</SelectItem>
                <SelectItem value="blocked">محظور</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={sort ?? "name"}
              onValueChange={(value) => {
                setSort(value as DeviceFilter["sort"]);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[140px]" aria-label="ترتيب النتائج">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">بالاسم</SelectItem>
                <SelectItem value="newest">الأحدث</SelectItem>
                <SelectItem value="usage">الأكثر استهلاكًا</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {devices.isError ? (
        <ApiErrorState error={devices.error} onRetry={() => devices.refetch()} />
      ) : devices.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Radar className="size-5" aria-hidden />}
          title={debouncedSearch ? "لا توجد نتائج" : "لا توجد أجهزة"}
          description={
            debouncedSearch
              ? "جرّب البحث بكلمة أخرى أو أزل عوامل التصفية."
              : isAdmin
                ? "اضغط «اكتشاف الأجهزة» لفحص الشبكة الآن."
                : "لم يتم إسناد أي جهاز إليك بعد."
          }
        />
      ) : (
        <Card className="overflow-hidden py-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الجهاز</TableHead>
                  <TableHead>MAC</TableHead>
                  <TableHead>IP</TableHead>
                  {isAdmin ? <TableHead>المالك</TableHead> : null}
                  <TableHead>الحالة</TableHead>
                  <TableHead className="text-end">السرعة الآن</TableHead>
                  <TableHead className="text-end">اليوم</TableHead>
                  <TableHead className="w-10 text-end">
                    <span className="sr-only">إجراءات</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((device) => (
                  <TableRow key={device.id}>
                    <TableCell>
                      <Link
                        href={`/devices/${device.id}`}
                        className="font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {device.name}
                      </Link>
                      {device.hostname ? (
                        <span className="block text-xs text-muted-foreground ltr-island">
                          {device.hostname}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Mono className="text-xs">{device.macAddress}</Mono>
                    </TableCell>
                    <TableCell>
                      <Mono className="text-xs">{device.ipAddress ?? "—"}</Mono>
                    </TableCell>
                    {isAdmin ? (
                      <TableCell className="text-sm">
                        {device.userName ?? (
                          <span className="text-muted-foreground">غير مسند</span>
                        )}
                      </TableCell>
                    ) : null}
                    <TableCell>
                      <StatusBadge status={device.status} />
                    </TableCell>
                    <TableCell className="text-end font-mono text-xs ltr-island">
                      ↓ {formatMbps(device.currentDownloadMbps ?? 0)}
                      <br />
                      ↑ {formatMbps(device.currentUploadMbps ?? 0)}
                    </TableCell>
                    <TableCell className="text-end text-xs">
                      {formatBytes(device.todayBytes.download)}
                      <span className="block text-muted-foreground">
                        {formatBytes(device.todayBytes.upload)} رفع
                      </span>
                    </TableCell>
                    <TableCell className="text-end">
                      <DropdownMenu dir="rtl">
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`إجراءات الجهاز ${device.name}`}
                          >
                            <MoreHorizontal className="size-4" aria-hidden />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>إجراءات</DropdownMenuLabel>
                          <DropdownMenuItem asChild>
                            <Link href={`/devices/${device.id}`}>التفاصيل</Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() =>
                              setRenameTarget({ id: device.id, name: device.name })
                            }
                          >
                            <Pencil className="size-4" aria-hidden />
                            إعادة تسمية
                          </DropdownMenuItem>
                          {isAdmin ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onSelect={() =>
                                  setAssignTarget({
                                    id: device.id,
                                    name: device.name,
                                    userId: device.userId,
                                  })
                                }
                              >
                                <UserPlus className="size-4" aria-hidden />
                                إسناد إلى مستخدم
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() =>
                                  block.mutate(
                                    {
                                      id: device.id,
                                      blocked: device.status !== "blocked",
                                    },
                                    {
                                      onSuccess: () =>
                                        toast.success(
                                          device.status === "blocked"
                                            ? "تم إلغاء حظر الجهاز"
                                            : "تم حظر الجهاز",
                                        ),
                                      onError: (error) =>
                                        notifyError(error, "تعذّر تغيير حالة الحظر"),
                                    },
                                  )
                                }
                              >
                                {device.status === "blocked" ? (
                                  <ShieldCheck className="size-4" aria-hidden />
                                ) : (
                                  <Ban className="size-4" aria-hidden />
                                )}
                                {device.status === "blocked"
                                  ? "إلغاء الحظر"
                                  : "حظر الجهاز"}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onSelect={() =>
                                  setDeleteTarget({ id: device.id, name: device.name })
                                }
                              >
                                <Trash2 className="size-4" aria-hidden />
                                حذف
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {meta && meta.total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            صفحة {meta.page} من {meta.totalPages} — {meta.total} جهاز
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={meta.page <= 1 || devices.isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              السابق
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={meta.page >= meta.totalPages || devices.isFetching}
              onClick={() => setPage((p) => p + 1)}
            >
              التالي
            </Button>
          </div>
        </div>
      ) : null}

      {renameTarget ? (
        <RenameDialog
          key={renameTarget.id}
          initialName={renameTarget.name}
          onClose={() => setRenameTarget(null)}
          onSubmit={(name) =>
            rename.mutate(
              { id: renameTarget.id, name },
              {
                onSuccess: () => {
                  toast.success("تم تغيير اسم الجهاز");
                  setRenameTarget(null);
                },
                onError: (error) => notifyError(error, "تعذّر تغيير الاسم"),
              },
            )
          }
          pending={rename.isPending}
        />
      ) : null}

      {assignTarget ? (
        <AssignDialog
          key={assignTarget.id}
          initialUserId={assignTarget.userId}
          users={userOptions.data ?? []}
          onClose={() => setAssignTarget(null)}
          onSubmit={(userId) =>
            assign.mutate(
              { id: assignTarget.id, userId },
              {
                onSuccess: () => {
                  toast.success("تم تحديث إسناد الجهاز");
                  setAssignTarget(null);
                },
                onError: (error) => notifyError(error, "تعذّر إسناد الجهاز"),
              },
            )
          }
          pending={assign.isPending}
        />
      ) : null}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="حذف الجهاز"
        description={
          deleteTarget
            ? `سيتم حذف «${deleteTarget.name}» وكل بيانات استهلاكه نهائيًا.`
            : null
        }
        confirmLabel="حذف"
        destructive
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(deleteTarget!.id, {
            onSuccess: () => {
              toast.success("تم حذف الجهاز");
              setDeleteTarget(null);
            },
            onError: (error) => notifyError(error, "تعذّر حذف الجهاز"),
          })
        }
      />
    </PageContainer>
  );
}

function RenameDialog({
  initialName,
  onClose,
  onSubmit,
  pending,
}: {
  initialName: string;
  onClose: () => void;
  onSubmit: (name: string) => void;
  pending: boolean;
}) {
  const [name, setName] = useState(initialName);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent dir="rtl" className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>إعادة تسمية الجهاز</DialogTitle>
          <DialogDescription>اكتب اسمًا واضحًا لتعرف الجهاز بسهولة.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim().length > 0) onSubmit(name.trim());
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="device-name">اسم الجهاز</Label>
            <Input
              id="device-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              required
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

function AssignDialog({
  initialUserId,
  users,
  onClose,
  onSubmit,
  pending,
}: {
  initialUserId: number | null;
  users: { id: number; name: string; username: string }[];
  onClose: () => void;
  onSubmit: (userId: number | null) => void;
  pending: boolean;
}) {
  const [value, setValue] = useState<string>(
    initialUserId ? String(initialUserId) : "none",
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent dir="rtl" className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>إسناد الجهاز</DialogTitle>
          <DialogDescription>
            اختر المالك الذي سيظهر له هذا الجهاز واستهلاكه.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(value === "none" ? null : Number(value));
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="assign-user">المالك</Label>
            <Select value={value} onValueChange={setValue}>
              <SelectTrigger id="assign-user" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">غير مسند</SelectItem>
                {users.map((user) => (
                  <SelectItem key={user.id} value={String(user.id)}>
                    {user.name} (@{user.username})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
