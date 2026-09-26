import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Compass className="size-7" aria-hidden />
      </div>
      <h1 className="text-2xl font-bold">الصفحة غير موجودة</h1>
      <p className="max-w-md text-muted-foreground">
        الرابط الذي طلبته غير صحيح أو أن الصفحة تمّت إزالتها.
      </p>
      <Button variant="outline" asChild>
        <Link href="/dashboard">العودة إلى لوحة التحكم</Link>
      </Button>
    </div>
  );
}
