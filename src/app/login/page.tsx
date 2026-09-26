import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getSession } from "@/server/auth";

export const metadata: Metadata = {
  title: "تسجيل الدخول",
};

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <LoginForm />
    </main>
  );
}
