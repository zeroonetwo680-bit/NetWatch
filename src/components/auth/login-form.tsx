"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Activity, Loader2, LogIn } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isApiError } from "@/lib/api/client";
import { useLogin } from "@/lib/api/modules/auth/hooks";

function LoginFormInner() {
  const router = useRouter();
  const params = useSearchParams();
  const login = useLogin();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const next = params.get("next") || "/dashboard";

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    login.mutate(
      { username, password },
      {
        onSuccess: () => {
          toast.success("تم تسجيل الدخول بنجاح");
          router.replace(next.startsWith("/") ? next : "/dashboard");
          router.refresh();
        },
        onError: (error) =>
          toast.error(
            isApiError(error) ? error.title : "تعذّر تسجيل الدخول",
            {
              description: isApiError(error)
                ? Object.values(error.fields ?? {}).flat().join(" ")
                : undefined,
            },
          ),
      },
    );
  }

  return (
    <Card className="w-full max-w-sm py-6">
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Activity className="size-6" aria-hidden />
            </span>
            <h1 className="text-xl font-bold">NetWatch</h1>
            <p className="text-sm text-muted-foreground">
              سجّل الدخول لإدارة ومراقبة الشبكة
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="username">اسم المستخدم</Label>
            <Input
              id="username"
              name="username"
              autoComplete="username"
              dir="ltr"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              aria-invalid={login.isError}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">كلمة المرور</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              dir="ltr"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={login.isError}
            />
          </div>

          {login.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {isApiError(login.error) ? login.error.title : "تعذّر تسجيل الدخول"}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={login.isPending}>
            {login.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <LogIn className="size-4" aria-hidden />
            )}
            تسجيل الدخول
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function LoginForm() {
  return (
    <Suspense fallback={null}>
      <LoginFormInner />
    </Suspense>
  );
}
