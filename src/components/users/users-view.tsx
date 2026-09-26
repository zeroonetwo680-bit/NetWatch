"use client";

import { useState } from "react";
import {
  KeyRound,
  Loader2,
  Pencil,
  ShieldAlert,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { isApiError } from "@/lib/api/client";
import {
  useCreateUser,
  useDeleteUser,
  useUpdateUser,
  useUsers,
} from "@/lib/api/modules/users/hooks";

type UserRow = {
  id: number;
  name: string;
  username: string;
  role: "admin" | "user";
  deviceCount: number;
  createdAt: string;
};

type Mode =
  | { type: "create" }
  | { type: "edit"; user: UserRow }
  | { type: "password"; user: UserRow }
  | null;

export function UsersView() {
  const [mode, setMode] = useState<Mode>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);

  const users = useUsers({ pageSize: 50 });
  const create = useCreateUser();
  const update = useUpdateUser();
  const remove = useDeleteUser();

  const rows = (users.data?.items ?? []) as UserRow[];

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
        title="المستخدمون"
        description="إدارة حسابات الدخول وصلاحيات الوصول"
        actions={
          <Button onClick={() => setMode({ type: "create" })}>
            <UserPlus className="size-4" aria-hidden />
            إضافة مستخدم
          </Button>
        }
      />

      {users.isError ? (
        <ApiErrorState error={users.error} onRetry={() => users.refetch()} />
      ) : users.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Users className="size-5" aria-hidden />}
          title="لا يوجد مستخدمون"
          description="أضف مستخدمًا لكي يتمكن من متابعة أجهزته."
        />
      ) : (
        <Card className="py-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الاسم</TableHead>
                  <TableHead>اسم المستخدم</TableHead>
                  <TableHead>الدور</TableHead>
                  <TableHead className="text-end">الأجهزة</TableHead>
                  <TableHead>تاريخ الإنشاء</TableHead>
                  <TableHead className="text-end">
                    <span className="sr-only">إجراءات</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.name}</TableCell>
                    <TableCell className="font-mono text-xs ltr-island">
                      {user.username}
                    </TableCell>
                    <TableCell>
                      {user.role === "admin" ? (
                        <Badge className="gap-1">
                          <ShieldAlert className="size-3" aria-hidden />
                          مدير
                        </Badge>
                      ) : (
                        <Badge variant="secondary">مستخدم</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-end font-mono ltr-island">
                      {user.deviceCount}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(user.createdAt).toLocaleDateString("ar-EG")}
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setMode({ type: "edit", user })}
                        >
                          <Pencil className="size-4" aria-hidden />
                          تعديل
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setMode({ type: "password", user })}
                        >
                          <KeyRound className="size-4" aria-hidden />
                          كلمة المرور
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => setDeleteTarget(user)}
                        >
                          <Trash2 className="size-4" aria-hidden />
                          حذف
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {mode ? (
        <UserDialog
          key={
            mode.type === "create" ? "create" : `${mode.type}-${mode.user.id}`
          }
          mode={mode}
          onClose={() => setMode(null)}
        pending={create.isPending || update.isPending}
        onSubmit={(values) => {
          if (!mode) return;
          if (mode.type === "create") {
            create.mutate(
              {
                name: values.name!,
                username: values.username!,
                password: values.password!,
                role: values.role!,
              },
              {
                onSuccess: () => {
                  toast.success("تم إنشاء المستخدم");
                  setMode(null);
                },
                onError: (error) => notifyError(error, "تعذّر إنشاء المستخدم"),
              },
            );
          } else if (mode.type === "edit") {
            update.mutate(
              {
                id: mode.user.id,
                name: values.name,
                role: values.role,
                ...(values.password ? { password: values.password } : {}),
              },
              {
                onSuccess: () => {
                  toast.success("تم تحديث المستخدم");
                  setMode(null);
                },
                onError: (error) => notifyError(error, "تعذّر تحديث المستخدم"),
              },
            );
          } else if (mode.type === "password") {
            update.mutate(
              { id: mode.user.id, password: values.password! },
              {
                onSuccess: () => {
                  toast.success("تم تغيير كلمة المرور");
                  setMode(null);
                },
                onError: (error) => notifyError(error, "تعذّر تغيير كلمة المرور"),
              },
            );
          }
        }}
        />
      ) : null}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="حذف المستخدم"
        description={
          deleteTarget
            ? `سيتم حذف «${deleteTarget.name}». أجهزته لن تُحذف وستصبح «غير مسندة».`
            : null
        }
        confirmLabel="حذف"
        destructive
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(deleteTarget!.id, {
            onSuccess: () => {
              toast.success("تم حذف المستخدم");
              setDeleteTarget(null);
            },
            onError: (error) => notifyError(error, "تعذّر حذف المستخدم"),
          })
        }
      />
    </PageContainer>
  );
}

function UserDialog({
  mode,
  onClose,
  onSubmit,
  pending,
}: {
  mode: NonNullable<Mode>;
  onClose: () => void;
  onSubmit: (values: {
    name?: string;
    username?: string;
    password?: string;
    role?: "admin" | "user";
  }) => void;
  pending: boolean;
}) {
  const isCreate = mode.type === "create";
  const existing = mode.type === "create" ? null : mode.user;

  const [name, setName] = useState(existing?.name ?? "");
  const [username, setUsername] = useState(existing?.username ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "user">(existing?.role ?? "user");

  const title =
    mode?.type === "create"
      ? "إضافة مستخدم"
      : mode?.type === "edit"
        ? "تعديل المستخدم"
        : "تغيير كلمة المرور";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {mode?.type === "password"
              ? `تعيين كلمة مرور جديدة لـ ${mode.user.name}`
              : "الحساب يستخدم لتسجيل الدخول إلى NetWatch."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit({ name, username, password, role });
          }}
        >
          {mode.type !== "password" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="user-name">الاسم</Label>
                <Input
                  id="user-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={80}
                />
              </div>
              {isCreate ? (
                <div className="space-y-2">
                  <Label htmlFor="user-username">اسم المستخدم</Label>
                  <Input
                    id="user-username"
                    dir="ltr"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    minLength={3}
                    maxLength={40}
                  />
                  <p className="text-xs text-muted-foreground">
                    بالإنجليزية والأرقام فقط.
                  </p>
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="user-role">الدور</Label>
                <Select
                  value={role}
                  onValueChange={(v) => setRole(v as "admin" | "user")}
                >
                  <SelectTrigger id="user-role" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">مستخدم — يرى أجهزته فقط</SelectItem>
                    <SelectItem value="admin">مدير — كل الصلاحيات</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="user-password">
              {isCreate ? "كلمة المرور" : "كلمة المرور الجديدة"}
            </Label>
            <Input
              id="user-password"
              type="password"
              dir="ltr"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={mode.type !== "edit"}
              minLength={6}
              maxLength={200}
            />
            {mode?.type === "edit" ? (
              <p className="text-xs text-muted-foreground">
                اتركها فارغة للإبقاء على كلمة المرور الحالية.
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              إلغاء
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              حفظ
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
