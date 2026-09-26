"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useSession } from "@/lib/api/modules/auth/hooks";
import { AppSidebar } from "./app-sidebar";
import { NAV_ITEMS } from "./nav-items";
import { NetworkStatusPill } from "./network-status-pill";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { data: user } = useSession();

  const isAdmin = user?.role === "admin";
  const current = NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );

  return (
    <div className="flex min-h-screen w-full bg-muted/30">
      {/* Desktop sidebar sits at the inline-start (right in RTL). */}
      <aside className="hidden w-64 shrink-0 md:block">
        <div className="fixed inset-y-0 start-0 w-64">
          <AppSidebar isAdmin={isAdmin} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/75 md:px-5">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="فتح القائمة"
            onClick={() => setOpen(true)}
          >
            <Menu className="size-5" aria-hidden />
          </Button>
          <h2 className="truncate font-semibold">
            {current?.label ?? "NetWatch"}
          </h2>
          <div className="ms-auto flex items-center gap-2">
            <NetworkStatusPill />
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>

        <main id="main-content" className="min-w-0 flex-1">
          {children}
        </main>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-64 p-0" dir="rtl">
          <SheetTitle className="sr-only">القائمة الرئيسية</SheetTitle>
          <AppSidebar isAdmin={isAdmin} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
