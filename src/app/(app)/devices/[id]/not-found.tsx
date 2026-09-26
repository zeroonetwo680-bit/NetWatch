import Link from "next/link";
import { WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DeviceNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <WifiOff className="size-7" aria-hidden />
      </div>
      <h1 className="text-2xl font-bold">الجهاز غير موجود</h1>
      <p className="max-w-md text-muted-foreground">
        هذا الجهاز غير موجود أو غير مُسند إليك.
      </p>
      <Button variant="outline" asChild>
        <Link href="/devices">العودة إلى الأجهزة</Link>
      </Button>
    </div>
  );
}
