"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Download, HardDrive } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { useSession } from "@/lib/api/modules/auth/hooks";
import { useUsageReport } from "@/lib/api/modules/usage/hooks";
import { formatBytes } from "@/lib/format";

const UsageBarChart = dynamic(
  () => import("@/components/charts/usage-bar-chart").then((m) => m.UsageBarChart),
  { ssr: false, loading: () => <Skeleton className="h-[300px] w-full" /> },
);

function range(days: number) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  const key = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
  return { from: key(from), to: key(to) };
}

export function UsageView() {
  const { data: session } = useSession();
  const [granularity, setGranularity] = useState<"daily" | "monthly">("daily");
  const [days, setDays] = useState(30);
  const { from, to } = useMemo(() => range(days), [days]);

  const report = useUsageReport(granularity, from, to);

  const rows = report.data?.rows ?? [];
  const totals = report.data?.totals ?? { downloadBytes: 0, uploadBytes: 0 };
  const maxRow = Math.max(1, ...rows.map((r) => r.downloadBytes + r.uploadBytes));

  function exportCsv() {
    if (rows.length === 0) return;
    // BOM keeps Arabic readable in Excel.
    const header = "الجهاز,تنزيل (بايت),رفع (بايت),الإجمالي (بايت)\n";
    const body = rows
      .map((row) =>
        [
          `"${row.label.replace(/"/g, '""')}"`,
          row.downloadBytes,
          row.uploadBytes,
          row.downloadBytes + row.uploadBytes,
        ].join(","),
      )
      .join("\n");
    const blob = new Blob([`\uFEFF${header}${body}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `netwatch-usage-${from}-${to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("تم تجهيز ملف CSV");
  }

  const chartPoints = rows.map((row) => ({
    label: row.label,
    downloadBytes: row.downloadBytes,
    uploadBytes: row.uploadBytes,
  }));

  return (
    <PageContainer>
      <PageHeader
        title="تقارير الاستهلاك"
        description={
          session?.role === "admin"
            ? "إجمالي استهلاك كل أجهزة الشبكة"
            : "استهلاك أجهزتك فقط"
        }
        actions={
          <Button
            variant="outline"
            onClick={exportCsv}
            disabled={rows.length === 0}
          >
            <Download className="size-4" aria-hidden />
            تصدير CSV
          </Button>
        }
      />

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
        <Tabs
          value={String(days)}
          onValueChange={(v) => setDays(Number(v))}
          dir="rtl"
        >
          <TabsList>
            <TabsTrigger value="7">آخر 7 أيام</TabsTrigger>
            <TabsTrigger value="30">آخر 30 يومًا</TabsTrigger>
            <TabsTrigger value="90">آخر 90 يومًا</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <section
        aria-label="إجمالي الاستهلاك"
        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
      >
        <StatCard
          label="إجمالي التنزيل"
          value={formatBytes(totals.downloadBytes)}
          loading={report.isLoading}
          icon={<HardDrive className="size-4" aria-hidden />}
        />
        <StatCard
          label="إجمالي الرفع"
          value={formatBytes(totals.uploadBytes)}
          loading={report.isLoading}
          icon={<HardDrive className="size-4" aria-hidden />}
        />
        <StatCard
          label="الإجمالي الكلي"
          value={formatBytes(totals.downloadBytes + totals.uploadBytes)}
          loading={report.isLoading}
          hint={`من ${from} إلى ${to}`}
          icon={<HardDrive className="size-4" aria-hidden />}
        />
      </section>

      {report.isError ? (
        <ApiErrorState error={report.error} onRetry={() => report.refetch()} />
      ) : report.isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<HardDrive className="size-5" aria-hidden />}
          title="لا يوجد استهلاك مسجل"
          description="لم يتم تسجيل أي استهلاك في هذه الفترة."
        />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>مقارنة استهلاك الأجهزة</CardTitle>
            </CardHeader>
            <CardContent>
              <UsageBarChart points={chartPoints} height={320} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الجهاز</TableHead>
                    <TableHead className="text-end">تنزيل</TableHead>
                    <TableHead className="text-end">رفع</TableHead>
                    <TableHead className="text-end">الإجمالي</TableHead>
                    <TableHead className="w-40">النسبة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const total = row.downloadBytes + row.uploadBytes;
                    return (
                      <TableRow key={row.key}>
                        <TableCell className="font-medium">{row.label}</TableCell>
                        <TableCell className="text-end">
                          {formatBytes(row.downloadBytes)}
                        </TableCell>
                        <TableCell className="text-end">
                          {formatBytes(row.uploadBytes)}
                        </TableCell>
                        <TableCell className="text-end font-medium">
                          {formatBytes(total)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress
                              value={Math.round((total / maxRow) * 100)}
                              aria-label={`نسبة استهلاك ${row.label}`}
                            />
                            <span className="shrink-0 font-mono text-xs ltr-island">
                              {Math.round((total / maxRow) * 100)}%
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </PageContainer>
  );
}
