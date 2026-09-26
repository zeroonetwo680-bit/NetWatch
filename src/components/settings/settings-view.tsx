"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Router,
  ServerCog,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiErrorState } from "@/components/shared/api-error";
import { Mono } from "@/components/shared/mono";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { isApiError } from "@/lib/api/client";
import { useSession } from "@/lib/api/modules/auth/hooks";
import { useChangePassword } from "@/lib/api/modules/users/hooks";
import {
  useSettings,
  useSystemStatus,
  useTestMikrotikConnection,
  useUpdateSettings,
} from "@/lib/api/modules/system/hooks";

export function SettingsView() {
  const { data: session } = useSession();
  const isAdmin = session?.role === "admin";

  return (
    <PageContainer>
      <PageHeader title="الإعدادات" description="حالة النظام وإعدادات التشغيل" />
      <SystemStatusCard />
      {isAdmin ? <PollerSettings /> : null}
      {isAdmin ? <MikrotikSettings /> : null}
      <ChangePasswordCard />
    </PageContainer>
  );
}

function SystemStatusCard() {
  const { data, isLoading, isError, error, refetch } = useSystemStatus(10_000);

  if (isError) {
    return <ApiErrorState error={error} onRetry={() => refetch()} />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ServerCog className="size-4" aria-hidden />
          حالة النظام
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <Row label="وضع الشبكة">
          {isLoading ? (
            <Skeleton className="h-5 w-24" />
          ) : (
            <Badge variant={data?.networkMode === "simulated" ? "secondary" : "default"}>
              {data?.networkMode === "simulated" ? "محاكاة" : "MikroTik"}
            </Badge>
          )}
        </Row>
        <Row label="الاتصال بالراوتر">
          {isLoading ? (
            <Skeleton className="h-5 w-24" />
          ) : data?.routerConnected ? (
            <span className="flex items-center gap-1 text-success">
              <CheckCircle2 className="size-4" aria-hidden /> متصل
            </span>
          ) : (
            <span className="flex items-center gap-1 text-destructive">
              <XCircle className="size-4" aria-hidden /> غير متصل
            </span>
          )}
        </Row>
        <Row label="آخر فحص">
          {data?.lastPollAt ? (
            <Mono className="text-xs">{new Date(data.lastPollAt).toLocaleString("ar-EG")}</Mono>
          ) : (
            "—"
          )}
        </Row>
        <Row label="فترة الفحص">
          <Mono>{Math.round((data?.pollIntervalMs ?? 0) / 1000)} ثانية</Mono>
        </Row>
        <Row label="عينات محفوظة">
          <Mono>{data?.sampleCount ?? 0}</Mono>
        </Row>
      </CardContent>
      {data?.networkMode === "simulated" ? (
        <CardContent>
          <Alert className="border-warning/40 bg-warning/10">
            <AlertTriangle className="size-4 text-warning" aria-hidden />
            <AlertTitle>أنت في وضع المحاكاة</AlertTitle>
            <AlertDescription>
              البيانات قادمة من شبكة افتراضية داخل التطبيق — لا يتم التحكم في راوتر
              حقيقي. غيّر <Mono>NETWORK_MODE=mikrotik</Mono> للاتصال بالراوتر.
            </AlertDescription>
          </Alert>
        </CardContent>
      ) : null}
      {data?.lastError ? (
        <CardContent>
          <Alert variant="destructive" role="alert">
            <AlertTriangle className="size-4" aria-hidden />
            <AlertTitle>آخر خطأ في الاتصال</AlertTitle>
            <AlertDescription>{data.lastError}</AlertDescription>
          </Alert>
        </CardContent>
      ) : null}
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{children}</span>
    </div>
  );
}

function PollerSettings() {
  const { data, isLoading } = useSettings();

  return (
    <Card>
      <CardHeader>
        <CardTitle>إعدادات الفحص والتخزين</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading || !data ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <PollerForm
            key={`${data.pollIntervalMs}-${data.sampleRetentionDays}`}
            pollIntervalMs={data.pollIntervalMs}
            sampleRetentionDays={data.sampleRetentionDays}
          />
        )}
      </CardContent>
    </Card>
  );
}

function PollerForm({
  pollIntervalMs,
  sampleRetentionDays,
}: {
  pollIntervalMs: number;
  sampleRetentionDays: number;
}) {
  const update = useUpdateSettings();

  const [intervalSec, setIntervalSec] = useState(
    String(Math.round(pollIntervalMs / 1000)),
  );
  const [retention, setRetention] = useState(String(sampleRetentionDays));

  return (
    <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              update.mutate(
                {
                  pollIntervalMs: Number(intervalSec) * 1000,
                  sampleRetentionDays: Number(retention),
                },
                {
                  onSuccess: () => toast.success("تم حفظ الإعدادات"),
                  onError: (error) =>
                    toast.error(
                      isApiError(error) ? error.title : "تعذّر حفظ الإعدادات",
                    ),
                },
              );
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="poll-interval">فترة الفحص (ثانية)</Label>
                <Input
                  id="poll-interval"
                  type="number"
                  min={2}
                  max={600}
                  dir="ltr"
                  value={intervalSec}
                  onChange={(e) => setIntervalSec(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  كلما قلّت الفترة زادت دقة الرسوم وحجم البيانات.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="retention">مدة الاحتفاظ بالعينات (يوم)</Label>
                <Input
                  id="retention"
                  type="number"
                  min={1}
                  max={365}
                  dir="ltr"
                  value={retention}
                  onChange={(e) => setRetention(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  العينات الأقدم تُحذف تلقائيًا، أما التجميع اليومي/الشهري فيبقى.
                </p>
              </div>
            </div>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : null}
              حفظ
            </Button>
    </form>
  );
}

function MikrotikSettings() {
  const { data, isLoading } = useSettings();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Router className="size-4" aria-hidden />
          إعدادات الراوتر (MikroTik)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading || !data ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <MikrotikForm
            key={`${data.mikrotik.host}-${data.mikrotik.port}-${data.mikrotik.user}`}
            host={data.mikrotik.host}
            port={data.mikrotik.port}
            user={data.mikrotik.user}
            hasPassword={data.mikrotik.hasPassword}
          />
        )}
      </CardContent>
    </Card>
  );
}

function MikrotikForm({
  host: initialHost,
  port: initialPort,
  user: initialUser,
  hasPassword,
}: {
  host: string;
  port: number;
  user: string;
  hasPassword: boolean;
}) {
  const update = useUpdateSettings();
  const test = useTestMikrotikConnection();

  const [host, setHost] = useState(initialHost);
  const [port, setPort] = useState(String(initialPort));
  const [user, setUser] = useState(initialUser);
  const [password, setPassword] = useState("");

  return (
    <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              update.mutate(
                {
                  mikrotik: {
                    host,
                    port: Number(port),
                    user,
                    ...(password ? { password } : {}),
                  },
                },
                {
                  onSuccess: () => {
                    toast.success("تم حفظ إعدادات الراوتر");
                    setPassword("");
                  },
                  onError: (error) =>
                    toast.error(
                      isApiError(error) ? error.title : "تعذّر حفظ الإعدادات",
                    ),
                },
              );
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="mt-host">عنوان الراوتر</Label>
                <Input
                  id="mt-host"
                  dir="ltr"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mt-port">منفذ API</Label>
                <Input
                  id="mt-port"
                  type="number"
                  dir="ltr"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mt-user">اسم المستخدم</Label>
                <Input
                  id="mt-user"
                  dir="ltr"
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mt-password">كلمة المرور</Label>
                <Input
                  id="mt-password"
                  type="password"
                  dir="ltr"
                  autoComplete="new-password"
                  placeholder={hasPassword ? "اتركها فارغة للإبقاء عليها" : ""}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  كلمة المرور تُكتب فقط ولا تُعرض ولا تُخزَّن في قاعدة البيانات.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={update.isPending}>
                حفظ
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={test.isPending}
                onClick={() =>
                  test.mutate(undefined, {
                    onSuccess: (result) =>
                      result.ok
                        ? toast.success(
                            `الاتصال ناجح${result.identity ? ` — ${result.identity}` : ""}`,
                          )
                        : toast.error(result.message ?? "تعذّر الاتصال بالراوتر"),
                    onError: (error) =>
                      toast.error(
                        isApiError(error) ? error.title : "تعذّر اختبار الاتصال",
                      ),
                  })
                }
              >
                {test.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : null}
                اختبار الاتصال
              </Button>
            </div>

            <Separator />
            <p className="text-xs text-muted-foreground">
            لتفعيل التحكم الفعلي يجب تشغيل خدمة API على الراوتر:{" "}
            <Mono>/ip service set api disabled=no port=8728</Mono> وإنشاء مستخدم
            بصلاحيات <Mono>read,write,test,api</Mono>.
          </p>
    </form>
  );
}

function ChangePasswordCard() {
  const change = useChangePassword();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");

  return (
    <Card>
      <CardHeader>
        <CardTitle>تغيير كلمة المرور</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            change.mutate(
              { currentPassword: current, newPassword: next },
              {
                onSuccess: () => {
                  toast.success("تم تغيير كلمة المرور");
                  setCurrent("");
                  setNext("");
                },
                onError: (error) =>
                  toast.error(
                    isApiError(error) ? error.title : "تعذّر تغيير كلمة المرور",
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
          <div className="space-y-2">
            <Label htmlFor="current-password">كلمة المرور الحالية</Label>
            <Input
              id="current-password"
              type="password"
              dir="ltr"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">كلمة المرور الجديدة</Label>
            <Input
              id="new-password"
              type="password"
              dir="ltr"
              autoComplete="new-password"
              minLength={6}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={change.isPending}>
              {change.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : null}
              تغيير
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
