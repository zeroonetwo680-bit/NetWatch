"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-7" aria-hidden />
      </div>
      <h1 className="text-2xl font-bold">حدث خطأ غير متوقع</h1>
      <p className="max-w-md text-muted-foreground">
        تعذّر إكمال طلبك بسبب خطأ في الخادم. يمكنك المحاولة مرة أخرى أو العودة
        إلى الصفحة الرئيسية.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={reset}>
          <RotateCcw className="size-4" aria-hidden />
          إعادة المحاولة
        </Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard">
            <Home className="size-4" aria-hidden />
            العودة للرئيسية
          </Link>
        </Button>
      </div>
    </div>
  );
}
