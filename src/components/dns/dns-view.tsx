"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Filter,
  HelpCircle,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Trash2,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { Mono } from "@/components/shared/mono";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { isApiError } from "@/lib/api/client";
import { useSession } from "@/lib/api/modules/auth/hooks";
import {
  useAddDnsRule,
  useDeleteDnsRule,
  useDnsDevices,
  useDnsQueries,
  useDnsRules,
  useDnsStatus,
  useToggleDnsDeviceBlock,
  useUpdateDnsRule,
} from "@/lib/api/modules/dns/hooks";

export function DnsView() {
  const { data: session } = useSession();
  const isAdmin = session?.role === "admin";

  const { data: statusData, isLoading: isStatusLoading } = useDnsStatus();
  const stats = statusData?.stats;
  const status = statusData?.status;

  return (
    <PageContainer>
      <PageHeader
        title="التحكم عبر DNS (الاعتراض والحظر)"
        description="توجيه استعلامات الأجهزة عبر NetWatch لحظر المواقع أو قطع الإنترنت عن أجهزة محددة دون الحاجة لراوتر ميكروتيك"
        actions={<DnsSetupDialog activePort={status?.activePort ?? 53} />}
      />

      {status?.running ? (
        <Alert className="border-success/30 bg-success/5">
          <CheckCircle2 className="size-4 text-success" aria-hidden />
          <AlertTitle className="text-success font-bold">
            سيرفر الـ DNS يعمل بنشاط على المنفذ {status.activePort}
          </AlertTitle>
          <AlertDescription className="text-muted-foreground text-xs">
            الخوادم التوجيهية (Upstream):{" "}
            <Mono className="text-xs">{status.upstreamServers.join(", ")}</Mono>
            {" — "}لتفعيل التحكم في جهازك أو موبايلك، اضغط على زر{" "}
            <strong>«طريقة التفعيل»</strong> بالأعلى.
          </AlertDescription>
        </Alert>
      ) : status?.error ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" aria-hidden />
          <AlertTitle>تنبيه بخصوص ربط منفذ DNS</AlertTitle>
          <AlertDescription className="text-xs">
            {status.error}
            <br />
            <strong>ملاحظة:</strong> ربط المنفذ 53 على ويندوز يتطلب تشغيل
            PowerShell كـ <em>Administrator</em>. يعمل السيرفر حاليًا على المنفذ
            البديل (5353).
          </AlertDescription>
        </Alert>
      ) : null}

      <section
        aria-label="إحصاءات DNS"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          label="إجمالي الاستعلامات"
          icon={<Shield className="size-4" aria-hidden />}
          loading={isStatusLoading}
          value={stats ? stats.totalQueries.toLocaleString("ar-EG") : "0"}
          hint="استعلام تم فحصه"
        />
        <StatCard
          label="الاستعلامات المحظورة"
          icon={<ShieldAlert className="size-4" aria-hidden />}
          loading={isStatusLoading}
          value={stats ? stats.blockedQueries.toLocaleString("ar-EG") : "0"}
          hint="تم منعه بنجاح"
        />
        <StatCard
          label="نسبة الحظر"
          icon={<Ban className="size-4" aria-hidden />}
          loading={isStatusLoading}
          value={stats ? `${stats.blockPercentage}%` : "0%"}
          hint="من حركة المرور"
        />
        <StatCard
          label="قواعد الحظر النشطة"
          icon={<Filter className="size-4" aria-hidden />}
          loading={isStatusLoading}
          value={stats ? stats.activeRulesCount.toLocaleString("ar-EG") : "0"}
          hint={`${stats?.blockedDevicesCount ?? 0} أجهزة مقطوع عنها النت`}
        />
      </section>

      <Tabs defaultValue="queries" dir="rtl" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="queries">سجل الاستعلامات</TabsTrigger>
          <TabsTrigger value="rules">قواعد الحظر</TabsTrigger>
          <TabsTrigger value="devices">قطع الإنترنت</TabsTrigger>
        </TabsList>

        <TabsContent value="queries">
          <LiveQueryLogTab />
        </TabsContent>

        <TabsContent value="rules">
          <RulesTab isAdmin={isAdmin} />
        </TabsContent>

        <TabsContent value="devices">
          <DevicesCutTab isAdmin={isAdmin} />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}

// ── Tab 1: Live Query Log ────────────────────────────────────────────────

function LiveQueryLogTab() {
  const [search, setSearch] = useState("");
  const [blockedOnly, setBlockedOnly] = useState(false);

  const filter = useMemo(
    () => ({
      search: search.trim() || undefined,
      action: blockedOnly ? ("blocked" as const) : undefined,
      limit: 100,
    }),
    [search, blockedOnly],
  );

  const { data, isLoading, refetch, isFetching } = useDnsQueries(filter, 3_000);
  const items = data?.items ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
        <div className="space-y-1">
          <CardTitle className="text-base flex items-center gap-2">
            <RefreshCw
              className={`size-4 text-muted-foreground ${
                isFetching ? "animate-spin" : ""
              }`}
              aria-hidden
            />
            سجل الاستعلامات اللحظي
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            تحديث تلقائي كل 3 ثوانٍ — يرصد أي دومين يفتحه أي جهاز
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute right-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="ابحث بدومين أو IP..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-48 pl-2 pr-8 text-xs"
            />
          </div>

          <Button
            variant={blockedOnly ? "destructive" : "outline"}
            size="sm"
            onClick={() => setBlockedOnly(!blockedOnly)}
            className="text-xs"
          >
            {blockedOnly ? "المحظورة فقط ✓" : "عرض المحظورة فقط"}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => refetch()}
            title="تحديث يدوي"
          >
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="overflow-x-auto p-0">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="py-8">
            <EmptyState
              icon={<Shield className="size-6 text-muted-foreground" />}
              title="لا توجد استعلامات بعد"
              description="بمجرد ضبط الـ DNS في جهازك على NetWatch وتصفح أي موقع، ستظهر الاستعلامات هنا فوراً."
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الوقت</TableHead>
                <TableHead>الجهاز / الـ IP</TableHead>
                <TableHead>الدومين المطلوب</TableHead>
                <TableHead>النوع</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>السبب</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(item.timestamp).toLocaleTimeString("ar-EG")}
                  </TableCell>
                  <TableCell>
                    <div className="text-xs font-medium">
                      {item.deviceName ?? "جهاز غير معرّف"}
                    </div>
                    <Mono className="text-[11px] text-muted-foreground">
                      {item.clientIp}
                    </Mono>
                  </TableCell>
                  <TableCell className="font-mono text-xs ltr-island">
                    {item.domain}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {item.qtype}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {item.action === "blocked" ? (
                      <Badge variant="destructive" className="gap-1 text-[11px]">
                        <Ban className="size-3" /> محظور
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="gap-1 border-success/30 bg-success/10 text-success text-[11px]"
                      >
                        <ShieldCheck className="size-3" /> مسموح
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {item.reason ?? "توجيه عادي"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ── Tab 2: Domain Rules ──────────────────────────────────────────────────

function RulesTab({ isAdmin }: { isAdmin: boolean }) {
  const { data: rules = [], isLoading } = useDnsRules();
  const addRule = useAddDnsRule();
  const updateRule = useUpdateDnsRule();
  const deleteRule = useDeleteDnsRule();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [domain, setDomain] = useState("");
  const [comment, setComment] = useState("");
  const [category, setCategory] = useState("custom");

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!domain.trim()) return;

    addRule.mutate(
      { domain: domain.trim(), comment: comment.trim() || null, category },
      {
        onSuccess: () => {
          toast.success(`تمت إضافة قاعدة حظر «${domain}»`);
          setDomain("");
          setComment("");
          setDialogOpen(false);
        },
        onError: (err) => {
          toast.error(isApiError(err) ? err.title : "تعذّر إضافة القاعدة");
        },
      },
    );
  }

  function handleQuickAdd(quickDomain: string, quickComment: string) {
    addRule.mutate(
      { domain: quickDomain, comment: quickComment, category: "social" },
      {
        onSuccess: () => toast.success(`تمت إضافة «${quickDomain}» للحظر`),
        onError: (err) =>
          toast.error(isApiError(err) ? err.title : "تعذّر إضافة القاعدة"),
      },
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="size-4 text-primary" aria-hidden />
              قواعد حظر الدومينات والمواقع
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              أي دومين مضاف هنا يُحظر ويُرد عليه بـ 0.0.0.0 فوراً
            </p>
          </div>

          {isAdmin ? (
            <div className="flex flex-wrap items-center gap-2">
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-1.5">
                    <Plus className="size-4" /> إضافة دومين للحظر
                  </Button>
                </DialogTrigger>
                <DialogContent dir="rtl">
                  <DialogHeader>
                    <DialogTitle>إضافة دومين لقائمة الحظر</DialogTitle>
                    <DialogDescription>
                      اكتب الدومين المطلوب حجبه (مثال: tiktok.com لحجب تيك توك
                      وكافة نطاقاته الفرعية).
                    </DialogDescription>
                  </DialogHeader>

                  <form onSubmit={handleCreate} className="space-y-4 py-2">
                    <div className="space-y-2">
                      <Label htmlFor="domain">الدومين المراد حجبه</Label>
                      <Input
                        id="domain"
                        placeholder="مثال: tiktok.com أو facebook.com"
                        value={domain}
                        onChange={(e) => setDomain(e.target.value)}
                        dir="ltr"
                        className="font-mono text-start"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="category">التصنيف</Label>
                      <select
                        id="category"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="social">شبكات تواصل اجتماعي</option>
                        <option value="ads">إعلانات وتتبع</option>
                        <option value="games">ألعاب</option>
                        <option value="custom">مخصص</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="comment">ملاحظة (اختياري)</Label>
                      <Input
                        id="comment"
                        placeholder="سبب الحظر..."
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                      />
                    </div>

                    <DialogFooter className="gap-2 sm:justify-start">
                      <Button type="submit" disabled={addRule.isPending}>
                        إضافة
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setDialogOpen(false)}
                      >
                        إلغاء
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          ) : null}
        </CardHeader>

        {isAdmin ? (
          <div className="px-6 pb-4 flex flex-wrap items-center gap-2 text-xs border-b">
            <span className="text-muted-foreground">اقتراحات سريعة:</span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => handleQuickAdd("tiktok.com", "حظر تطبيق تيك توك")}
            >
              + حظر TikTok
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => handleQuickAdd("facebook.com", "حظر فيسبوك")}
            >
              + حظر Facebook
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() =>
                handleQuickAdd("doubleclick.net", "حظر إعلانات وتتبع")
              }
            >
              + حظر إعلانات
            </Button>
          </div>
        ) : null}

        <CardContent className="overflow-x-auto p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : rules.length === 0 ? (
            <div className="py-8">
              <EmptyState
                icon={<Filter className="size-6 text-muted-foreground" />}
                title="قائمة الحظر فارغة"
                description="أضف دومينات أو استخدم الاقتراحات السريعة بالأعلى لحجب التطبيقات والمواقع."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الدومين</TableHead>
                  <TableHead>التصنيف</TableHead>
                  <TableHead>الملاحظة</TableHead>
                  <TableHead className="text-center">الحالة</TableHead>
                  {isAdmin ? <TableHead className="text-end">حذف</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-mono text-sm ltr-island font-bold">
                      {rule.domain}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {rule.category === "social"
                          ? "تواصل اجتماعي"
                          : rule.category === "ads"
                            ? "إعلانات"
                            : rule.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {rule.comment ?? "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={rule.enabled}
                        disabled={!isAdmin || updateRule.isPending}
                        onCheckedChange={(checked) =>
                          updateRule.mutate({
                            id: rule.id,
                            patch: { enabled: checked },
                          })
                        }
                      />
                    </TableCell>
                    {isAdmin ? (
                      <TableCell className="text-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive"
                          onClick={() => deleteRule.mutate(rule.id)}
                          title="حذف القاعدة"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Tab 3: Device Internet Cut via DNS ────────────────────────────────────

function DevicesCutTab({ isAdmin }: { isAdmin: boolean }) {
  const { data: devices = [], isLoading } = useDnsDevices();
  const toggleBlock = useToggleDnsDeviceBlock();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <WifiOff className="size-4 text-destructive" aria-hidden />
          قطع الإنترنت عن أجهزة محددة عبر الـ DNS
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          بمجرد تفعيل هذا المفتاح أمام أي جهاز، سيقوم NetWatch بحجب 100% من
          استعلامات الـ DNS الصادرة من هذا الجهاز، مما يوقف تصفح الإنترنت بالكامل
          لديه فورياً بدون الحاجة لراوتر ذكي!
        </p>
      </CardHeader>

      <CardContent className="overflow-x-auto p-0">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : devices.length === 0 ? (
          <div className="py-8">
            <EmptyState
              icon={<Smartphone className="size-6 text-muted-foreground" />}
              title="لم يتم اكتشاف أجهزة بعد"
              description="تأكد من تشغيل وضع اكتشاف الشبكة (NETWORK_MODE=lan) لتظهر أجهزة منزلك هنا."
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الجهاز</TableHead>
                <TableHead>الـ MAC</TableHead>
                <TableHead>الـ IP</TableHead>
                <TableHead className="text-center">
                  قطع الإنترنت عبر الـ DNS
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {devices.map((device) => (
                <TableRow key={device.deviceId}>
                  <TableCell className="font-medium">
                    {device.deviceName}
                  </TableCell>
                  <TableCell>
                    <Mono className="text-xs">{device.macAddress}</Mono>
                  </TableCell>
                  <TableCell>
                    <Mono className="text-xs">{device.ipAddress ?? "—"}</Mono>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Switch
                        checked={device.blockedViaDns}
                        disabled={
                          !isAdmin ||
                          toggleBlock.isPending ||
                          !device.ipAddress
                        }
                        onCheckedChange={(checked) =>
                          toggleBlock.mutate(
                            { deviceId: device.deviceId, blocked: checked },
                            {
                              onSuccess: () =>
                                toast.success(
                                  checked
                                    ? `تم قطع الإنترنت عن «${device.deviceName}» عبر الـ DNS`
                                    : `تمت استعادة الإنترنت لـ «${device.deviceName}»`,
                                ),
                              onError: (err) =>
                                toast.error(
                                  isApiError(err)
                                    ? err.title
                                    : "تعذّر تغيير حالة الجهاز",
                                ),
                            },
                          )
                        }
                      />
                      <span className="text-xs font-semibold">
                        {device.blockedViaDns ? (
                          <span className="text-destructive">النت مقطوع ⛔</span>
                        ) : (
                          <span className="text-success">النت يعمل ✓</span>
                        )}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ── Setup Guide Dialog ───────────────────────────────────────────────────

function DnsSetupDialog({ activePort }: { activePort: number }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <HelpCircle className="size-4" /> طريقة التفعيل في الأجهزة
        </Button>
      </DialogTrigger>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>كيفية توجيه الأجهزة لـ NetWatch DNS</DialogTitle>
          <DialogDescription>
            خطوات بسيطة لجعل الموبايل أو الكمبيوتر أو الراوتر يمرر استعلاماته عبر
            سيرفر NetWatch:
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm py-2">
          <div className="rounded-lg border p-3 space-y-1.5 bg-muted/30">
            <h4 className="font-bold flex items-center gap-1.5">
              📱 الخيار الأول: في الموبايل مباشرة (أندرويد / آيفون)
            </h4>
            <ol className="list-decimal list-inside text-xs space-y-1 text-muted-foreground pr-1">
              <li>افتح إعدادات الواي فاي في الموبايل واضغط مطولاً على شبكتك.</li>
              <li>اختر <strong>تعديل الشبكة (Modify Network)</strong>.</li>
              <li>غيّر إعدادات الـ IP من DHCP إلى <strong>ثابت (Static)</strong>.</li>
              <li>
                ضع في خانة <strong>DNS 1</strong>: عنوان IP جهاز الكمبيوتر الحالي
                (مثلاً <Mono className="text-xs">192.168.1.50</Mono>).
              </li>
              <li>احفظ الإعدادات — أي موقع يُطلب سيمر عبر NetWatch أولاً!</li>
            </ol>
          </div>

          <div className="rounded-lg border p-3 space-y-1.5 bg-muted/30">
            <h4 className="font-bold flex items-center gap-1.5">
              🌐 الخيار الثاني: على الراوتر لكل البيت دفعة واحدة
            </h4>
            <ol className="list-decimal list-inside text-xs space-y-1 text-muted-foreground pr-1">
              <li>افتح صفحة الراوتر (192.168.1.1) وسجل دخول كـ Admin.</li>
              <li>ادخل على <strong>DHCP Server Settings</strong> أو <strong>LAN</strong>.</li>
              <li>
                ابحث عن <strong>Primary DNS</strong> وضعه عنوان IP جهازك.
              </li>
              <li>احفظ واعمل إعادة تشغيل للراوتر — كل أجهزة البيت ستتحول لـ NetWatch!</li>
            </ol>
          </div>

          {activePort !== 53 ? (
            <Alert className="border-warning/30 bg-warning/5 text-xs">
              <AlertTriangle className="size-4 text-warning" />
              <AlertDescription>
                السيرفر يعمل حاليًا على المنفذ {activePort}. ليعمل المنفذ 53
                الافتراضي تلقائيًا على ويندوز، شغّل التطبيق داخل نافذة
                PowerShell بصلاحيات Administrator.
              </AlertDescription>
            </Alert>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="default" onClick={() => {}}>
            فهمت ذلك
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
