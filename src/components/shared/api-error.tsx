"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { isApiError } from "@/lib/api/client";

/** Retryable, Arabic, contract-aware error state (API failures only). */
export function ApiErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const title = isApiError(error)
    ? error.code === "INVALID_API_RESPONSE"
      ? "البيانات غير مطابقة للعقد"
      : error.title || "تعذّر تحميل البيانات"
    : "تعذّر تحميل البيانات";

  const detail = isApiError(error)
    ? (error.code === "NOT_FOUND"
        ? "المورد المطلوب غير موجود."
        : error.code === "FORBIDDEN"
          ? "ليس لديك صلاحية للوصول إلى هذا المورد."
          : null)
    : null;

  return (
    <Alert variant="destructive" className={className} role="alert">
      <AlertTriangle className="size-4" aria-hidden />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="space-y-2">
        {detail ? <p>{detail}</p> : null}
        {onRetry ? (
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RotateCcw className="size-4" aria-hidden />
            إعادة المحاولة
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
