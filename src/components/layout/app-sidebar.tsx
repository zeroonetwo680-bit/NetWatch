"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";

export function AppSidebar({
  isAdmin,
  onNavigate,
}: {
  isAdmin: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  const items = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  return (
    <nav
      aria-label="القائمة الرئيسية"
      className="flex h-full flex-col gap-2 border-e bg-card p-3"
    >
      <div className="flex items-center justify-between gap-2 px-1 py-2">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onNavigate}
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Activity className="size-4" aria-hidden />
          </span>
          <span className="font-bold">NetWatch</span>
        </Link>
        {onNavigate ? (
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="إغلاق القائمة"
            onClick={onNavigate}
          >
            <X className="size-4" aria-hidden />
          </Button>
        ) : null}
      </div>

      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active && "bg-primary/10 font-semibold text-primary",
                )}
              >
                <item.icon className="size-4 shrink-0" aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>

      <p className="mt-auto px-3 text-xs text-muted-foreground">
        مراقبة الشبكة — v0.1
      </p>
    </nav>
  );
}
